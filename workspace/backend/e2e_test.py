"""端到端冒烟测试：登录鉴权 -> 扫码保养 -> 工单流转 -> 归档/恢复 -> 权限边界。"""
import json
import urllib.request
import urllib.parse
import urllib.error

BASE = "http://127.0.0.1:8000/api"


def call(method, path, body=None, token=None, expect=None):
    if "?" in path:
        prefix, query = path.split("?", 1)
        path = prefix + "?" + urllib.parse.quote(query, safe="=&")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json",
                 **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(req) as r:
            payload = json.loads(r.read())
            if expect and r.status != expect:
                raise AssertionError(f"{method} {path} 期望 {expect}，得到 {r.status}")
            return payload
    except urllib.error.HTTPError as e:
        if expect and e.code == expect:
            return e.code
        detail = e.read().decode()
        raise AssertionError(f"{method} {path} 意外的 {e.code}: {detail}")


# ---- 登录 ----
admin = call("POST", "/auth/login", {"username": "admin", "password": "admin123"})
AT = admin["token"]
assert admin["user"]["role"] == "管理员"
w1 = call("POST", "/auth/login", {"username": "worker1", "password": "123456"})
WT = w1["token"]
assert w1["user"]["worker_id"] == 1
print("0) 登录 OK -> admin / worker1（王建国）")
assert call("GET", "/elevators", expect=401) == 401
assert call("POST", "/auth/login", {"username": "admin", "password": "x"}, expect=401) == 401
print("   无令牌/错密码被拒 OK")

# ---- 权限边界 ----
assert call("POST", "/elevators", {"code": "X", "address": "x"}, token=WT, expect=403) == 403
assert call("POST", "/elevators/1/archive", {"archive_type": "报废", "reason": "r"}, token=WT, expect=403) == 403
assert call("PUT", "/elevators/1", {"remark": "hacked"}, token=WT, expect=403) == 403
assert call("PUT", "/plans/1/toggle", {}, token=WT, expect=403) == 403
assert call("POST", "/inspections", {"elevator_id": 1, "inspect_date": "2026-09-13",
            "next_date": "2027-09-13", "result": "合格"}, token=WT, expect=403) == 403
print("1) 维保员不能改档案/归档/停计划/登记年检 OK")

# 维保员不能代签
assert call("POST", "/maintenance/check-in",
            {"elevator_code": "DT-2024002", "worker_id": 2}, token=WT, expect=403) == 403
print("2) 维保员不能代他人签到 OK")

# ---- 维保员日常：本人签到、保养（异常自动开工单）、派单流转 ----
rec = call("POST", "/maintenance/check-in", {"elevator_code": "DT-2024002", "worker_id": 1}, token=WT)
assert rec["result"] == "进行中" and rec["elevator"]["status"] == "保养中"
rec = call("PUT", f"/maintenance/records/{rec['id']}/complete", {
    "kind": "半月",
    "items": [{"name": "制动器检查", "result": "异常", "note": "间隙偏大"}],
    "result": "异常", "abnormal_desc": "制动器间隙偏大需调整", "signature": "王建国",
}, token=WT)
assert rec["elevator"]["status"] == "故障"
print("3) 维保员签到+异常保养 OK（自动开工单）")

orders = [o for o in call("GET", "/repairs?status=待接单", token=WT)
          if o["elevator"]["code"] == "DT-2024002"]
oid = orders[0]["id"]
# 派单照旧：维保员可流转
call("PUT", f"/repairs/{oid}", {"status": "已派单", "worker_id": 1}, token=WT)
call("PUT", f"/repairs/{oid}", {"status": "维修中", "worker_id": 1}, token=WT)
o = call("PUT", f"/repairs/{oid}", {
    "status": "已完成", "worker_id": 1, "solution": "调整间隙", "parts": ["制动片x1"], "cost": 450,
}, token=WT)
assert o["status"] == "已完成" and o["elevator"]["status"] == "正常"
print("4) 维保员派单/到场/完成流转照旧 OK")

# ---- 管理员归档 ----
ev5 = call("GET", "/elevators/code/DT-2024005", token=AT)
hist_before = len(call("GET", f"/maintenance/records?elevator_id={ev5['id']}", token=AT))
arc = call("POST", f"/elevators/{ev5['id']}/archive",
           {"archive_type": "报废", "reason": "使用满15年老化无维修价值"}, token=AT)
assert arc["is_archived"] == 1 and arc["archive_type"] == "报废"
print(f"5) 管理员归档 OK（{arc['archive_type']} / {arc['archive_date']} / 操作人 {arc['archive_operator']}）")

# 归档后：日常列表消失、按编号可在归档库查到、不能再签到
assert all(e["id"] != ev5["id"] for e in call("GET", "/elevators", token=AT))
archived = call("GET", "/elevators?archived=1", token=AT)
assert any(e["id"] == ev5["id"] for e in archived)
found = call("GET", f"/elevators?archived=1&keyword=DT-2024005", token=AT)
assert len(found) == 1
print("6) 归档设备从日常列表移除、按编号可查询 OK")
assert call("POST", "/maintenance/check-in",
            {"elevator_code": "DT-2024005", "worker_id": 1}, token=AT, expect=400) == 400
print("7) 归档设备禁止日常维保操作 OK")

# 历史完整保留
hist_after = len(call("GET", f"/maintenance/records?elevator_id={ev5['id']}", token=AT))
assert hist_after == hist_before and hist_after > 0
repairs = [r for r in call("GET", "/repairs?include_archived=1", token=AT) if r["elevator_id"] == ev5["id"]]
insps = call("GET", f"/elevators/{ev5['id']}/inspections", token=AT)
print(f"8) 历史保留 OK（保养 {hist_after} 条、工单 {len(repairs)} 条、年检 {len(insps)} 条）")

# 物理删除彻底关闭
assert call("DELETE", f"/elevators/{ev5['id']}", token=AT, expect=403) == 403
print("9) DELETE 接口已禁用，任何角色都无法清除历史 OK")

# 恢复
res = call("POST", f"/elevators/{ev5['id']}/restore", token=AT)
assert res["is_archived"] == 0 and res["status"] == "停用"
print("10) 管理员恢复 OK（恢复后为停用状态，需人工确认启用）")

# 种子中预置的归档退场梯仍在
seed = call("GET", "/elevators?archived=1&keyword=DT-20230013", token=AT)
assert len(seed) == 1 and seed[0]["archive_type"] == "退场"
print("11) 种子退场设备归档库可查 OK")

# 仪表盘统计只算在用
d = call("GET", "/dashboard", token=AT)
assert d["archived_total"] >= 1 and d["elevator_total"] == 12
print(f"12) 仪表盘 OK（在用 {d['elevator_total']} 台，归档 {d['archived_total']} 台）")

print("\n全部端到端测试通过 ✔")
