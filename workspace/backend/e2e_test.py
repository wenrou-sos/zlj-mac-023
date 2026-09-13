"""端到端冒烟测试：扫码签到 -> 保养异常 -> 自动开工单 -> 派单流转 -> 年检登记。"""
import json
import urllib.request
import urllib.parse

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

print("\n全部端到端测试通过 ✔")
