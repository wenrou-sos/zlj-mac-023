"""端到端冒烟测试：扫码签到 -> 保养异常 -> 自动开工单 -> 派单流转 -> 年检登记。"""
import json
import urllib.request
import urllib.parse
import urllib.error

BASE = "http://127.0.0.1:8000/api"


def call(method, path, body=None):
    # 对查询参数中的中文编码
    if "?" in path:
        prefix, query = path.split("?", 1)
        path = prefix + "?" + urllib.parse.quote(query, safe="=&")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# 1. 扫码签到
rec = call("POST", "/maintenance/check-in", {
    "elevator_code": "DT-2024002", "worker_id": 3, "lat": 30.2581, "lng": 120.1332,
})
assert rec["result"] == "进行中", rec
assert rec["elevator"]["status"] == "保养中"
print("1) 扫码签到 OK -> 记录", rec["id"], "电梯状态:", rec["elevator"]["status"], "| 关联计划:", rec["plan_id"])

# 2. 完成保养（含异常项）
rec = call("PUT", f"/maintenance/records/{rec['id']}/complete", {
    "kind": "半月",
    "items": [
        {"name": "层门门锁检查", "result": "正常", "note": ""},
        {"name": "制动器检查", "result": "异常", "note": "制动间隙偏大"},
    ],
    "result": "异常",
    "abnormal_desc": "制动器间隙偏大，需要调整并更换制动片",
    "signature": "张伟",
})
assert rec["finish_time"] and rec["elevator"]["status"] == "故障"
print("2) 保养提交 OK -> 电梯状态:", rec["elevator"]["status"])

# 3. 计划自动顺延
ev = call("GET", "/elevators/code/DT-2024002")
print("3) 计划顺延 OK -> 下次维保:", ev["next_plan_date"], "剩余:", ev["plan_days_left"], "天")
assert ev["plan_days_left"] >= 14

# 4. 异常自动生成待接单工单
orders = [o for o in call("GET", "/repairs?status=待接单") if o["elevator"]["code"] == "DT-2024002"]
assert orders, "应自动生成工单"
oid = orders[0]["id"]
print("4) 自动开工单 OK ->", orders[0]["order_no"], orders[0]["fault_desc"][:20])

# 5. 派单流转
o = call("PUT", f"/repairs/{oid}", {"status": "已派单", "worker_id": 3})
assert o["status"] == "已派单"
o = call("PUT", f"/repairs/{oid}", {"status": "维修中", "worker_id": 3})
assert o["arrive_time"]
o = call("PUT", f"/repairs/{oid}", {
    "status": "已完成", "worker_id": 3,
    "solution": "调整制动间隙并更换制动片", "parts": ["制动片x1"], "cost": 450,
})
assert o["status"] == "已完成" and o["finish_time"] and o["elevator"]["status"] == "正常"
print("5) 工单流转 OK -> 响应时长:", o["response_minutes"], "分钟, 费用:", o["cost"], "电梯恢复:", o["elevator"]["status"])

# 6. 为年检过期电梯登记年检
ev7 = call("GET", "/elevators/code/DT-2024007")
assert ev7["inspect_status"] == "已过期"
call("POST", "/inspections", {
    "elevator_id": ev7["id"], "inspect_date": "2026-09-13", "next_date": "2027-09-13",
    "org": "杭州市特种设备检测研究院", "result": "合格", "certificate_no": "JYZ20260999",
})
ev7 = call("GET", "/elevators/code/DT-2024007")
assert ev7["inspect_status"] == "正常" and ev7["inspect_days_left"] > 360
print("6) 年检登记 OK -> 状态:", ev7["inspect_status"], "剩余:", ev7["inspect_days_left"], "天")

# 7. 仪表盘 & 提醒
d = call("GET", "/dashboard")
print("7) 仪表盘 OK -> 电梯:", d["elevator_total"], "未完成急修:", d["repair_open"],
      "年检预警:", d["inspect_soon"], "过期:", d["inspect_overdue"], "逾期计划:", d["plan_overdue"])

# 8. Bug1 回归：换人扫同一台电梯应返回 409，记录仍归属原签到人
rec1 = call("POST", "/maintenance/check-in", {
    "elevator_code": "DT-2024003", "worker_id": 1,
})
print("8) 首次签到 OK -> 记录", rec1["id"], "归属:", rec1["worker"]["name"])
try:
    call("POST", "/maintenance/check-in", {"elevator_code": "DT-2024003", "worker_id": 2})
    raise AssertionError("换人扫码应返回 409")
except urllib.error.HTTPError as e:
    assert e.code == 409
    info = json.loads(e.read())["detail"]
    print("   换人扫码 409 OK ->", info["message"][:30], "…")
# 接手后记录改挂新人名下
rec_t = call("POST", f"/maintenance/records/{rec1['id']}/take-over", {"worker_id": 2})
assert rec_t["worker"]["id"] == 2 and "接手" in rec_t["check_in_addr"]
print("   接手 OK -> 现归属:", rec_t["worker"]["name"])
call("PUT", f"/maintenance/records/{rec1['id']}/complete", {
    "kind": "半月", "items": [{"name": "x", "result": "正常", "note": ""}],
    "result": "正常", "signature": "李志强",
})

# 9. Bug2 回归：停用电梯保养完成后仍为“停用”
ev12 = call("GET", "/elevators/code/DT-2024012")
assert ev12["status"] == "停用"
rec_s = call("POST", "/maintenance/check-in", {"elevator_code": "DT-2024012", "worker_id": 1})
call("PUT", f"/maintenance/records/{rec_s['id']}/complete", {
    "kind": "半月", "items": [{"name": "x", "result": "正常", "note": ""}],
    "result": "正常", "signature": "王建国",
})
ev12 = call("GET", "/elevators/code/DT-2024012")
assert ev12["status"] == "停用", ev12["status"]
print("9) 停用梯保养后保持停用 OK")

# 10. Bug3 回归：编辑设备编号能真正更新
ev1 = call("GET", "/elevators/code/DT-2024001")
call("PUT", f"/elevators/{ev1['id']}", {"code": "DT-RENAMED-01"})
assert call("GET", "/elevators/code/DT-RENAMED-01")["id"] == ev1["id"]
call("PUT", f"/elevators/{ev1['id']}", {"code": "DT-2024001"})  # 改回
print("10) 设备编号可修改 OK")

# 11. Bug4 回归：登记证号重复返回 400 且有可读信息
existing_reg = call("GET", "/elevators/code/DT-2024002")["reg_code"]
try:
    call("PUT", f"/elevators/{ev1['id']}", {"reg_code": existing_reg})
    raise AssertionError("重复登记证号应返回 400")
except urllib.error.HTTPError as e:
    assert e.code == 400
    msg = json.loads(e.read())["detail"]
    assert "登记证" in msg
    print("11) 登记证号重复 -> 400 OK:", msg)

print("\n全部端到端测试通过 ✔")
