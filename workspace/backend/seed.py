"""生成本地模拟数据：执行 `python seed.py` 即可（库已存在数据时会跳过）。"""
import random
from datetime import date, datetime, timedelta

from database import Base, engine, SessionLocal
import models
from auth import hash_password

random.seed(42)
TODAY = date.today()
NOW = datetime.now()


WORKERS = [
    ("王建国", "13800000001", "TS33-2021-00118", "城东一组", "维保员"),
    ("李志强", "13800000002", "TS33-2021-00119", "城东一组", "维保员"),
    ("张伟",   "13800000003", "TS33-2022-00207", "城西二组", "维保员"),
    ("刘洋",   "13800000004", "TS33-2022-00208", "城西二组", "安全员"),
    ("陈磊",   "13800000005", "TS33-2020-00056", "城南三组", "维保员"),
    ("赵鹏",   "13800000006", "TS33-2023-00331", "城南三组", "维保员"),
]

BRANDS_MODELS = [
    ("三菱", "LEHY-III"), ("通力", "MonoSpace 500"), ("日立", "HGP"),
    ("奥的斯", "GeN2"), ("蒂森克虏伯", "evolution1"), ("东芝", "ELCOSMO"),
]

COMMUNITIES = [
    ("翠湖天地花园", "翠湖物业", "杭州安捷电梯工程有限公司"),
    ("金色家园小区", "万科物业", "杭州安捷电梯工程有限公司"),
    ("滨江壹号公馆", "滨江物业", "浙江中维电梯有限公司"),
    ("阳光都市公寓", "绿城物业", "浙江中维电梯有限公司"),
    ("万达广场写字楼", "万达商管", "杭州恒达电梯服务有限公司"),
    ("文锦苑社区", "社区物业办", "杭州恒达电梯服务有限公司"),
]

MAINT_ITEMS = [
    "机房曳引机运行检查", "控制柜接线及元器件检查", "制动器间隙与动作检查",
    "层门门锁啮合深度检查", "轿门光幕/安全触板检查", "限速器与安全钳联动检查",
    "井道导轨润滑与支架紧固", "轿厢照明、应急照明检查", "报警装置与五方通话测试",
    "平层精度与运行舒适感检查", "缓冲器与底坑清洁检查", "门机皮带及导轨检查",
]

FAULT_BANK = [
    ("门系统", "轿厢门无法正常关闭，反复弹开", "调整门机参数并清洁地坎滑槽，更换变形滑块", ["门滑块x2", "门锁触点x1"], 320),
    ("门系统", "3 层层门门锁接触不良导致停梯", "打磨调整门锁触点，恢复安全回路", ["门锁触点x1"], 180),
    ("曳引系统", "运行中曳引机有异常响声", "检查并补充曳引机齿轮油，紧固地脚螺栓", [], 0),
    ("轿厢", "轿厢照明部分不亮", "更换 LED 灯具并检修线路", ["LED 灯管x2"], 260),
    ("控制系统", "电梯偶尔出现冲顶保护误动作", "清洁平层感应器，更换老化的减速开关", ["减速开关x1"], 210),
    ("门系统", "外呼按钮无响应", "更换损坏的外呼按钮板", ["外呼按钮板x1"], 150),
]


def d(days):
    return TODAY + timedelta(days=days)


def dt(days, hour=10, minute=0):
    return datetime.combine(d(days), datetime.min.time()).replace(hour=hour, minute=minute)


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.Elevator).count() > 0:
            print("数据库已有数据，跳过模拟数据生成。")
            return

        workers = []
        for name, phone, cert, team, role in WORKERS:
            w = models.Worker(name=name, phone=phone, cert_no=cert, team=team, role=role)
            db.add(w)
            workers.append(w)
        db.flush()

        # 登录账号：1 个管理员 + 每个维保人员 1 个账号（密码统一 123456）
        db.add(models.User(
            username="admin", password_hash=hash_password("admin123"),
            name="系统管理员", role="管理员", active=1,
        ))
        for i, w in enumerate(workers):
            db.add(models.User(
                username=f"worker{i+1}",
                password_hash=hash_password("123456"),
                name=w.name, role="维保员", worker_id=w.id, active=1,
            ))
        db.flush()

        # 12 台电梯，年检状态分布：正常 / 即将到期 / 已过期 / 故障
        inspect_offsets = [200, 350, 340, 330, 100, 360, 370, 250, 320, 80, 300, 150]
        statuses = ["正常", "正常", "正常", "保养中", "正常", "正常",
                    "故障", "正常", "正常", "正常", "正常", "停用"]

        elevators = []
        for i in range(12):
            community, prop, maint_co = COMMUNITIES[i % len(COMMUNITIES)]
            brand, model = BRANDS_MODELS[i % len(BRANDS_MODELS)]
            bldg = (i // 2) + 1
            unit = (i % 2) + 1
            last_ins = d(-inspect_offsets[i])
            ev = models.Elevator(
                code=f"DT-{2024}{i+1:03d}",
                reg_code=f"梯33-A{TODAY.year}{1000+i:04d}",
                address=f"杭州市{['西湖区','拱墅区','滨江区','上城区'][i % 4]}{community}",
                location_detail=f"{bldg}幢{unit}单元",
                brand=brand,
                model=model,
                type="客梯" if i != 10 else "货梯",
                floors=random.choice([11, 18, 24, 32]),
                install_date=d(-(inspect_offsets[i] + 1500)),
                use_date=d(-(inspect_offsets[i] + 1400)),
                last_inspect_date=last_ins,
                inspect_cycle_days=365,
                status=statuses[i],
                property_company=prop,
                maintenance_company=maint_co,
                load_kg=1000 if i != 10 else 1600,
                speed=random.choice([1.0, 1.6, 1.75, 2.5]),
                remark=random.choice(["", "", "高层高频率使用，关注门系统磨损", "物业反馈偶有平层偏差"]),
            )
            db.add(ev)
            elevators.append(ev)
        db.flush()

        # 第 13 台：已退场归档设备，历史记录全部保留
        archived_ev = models.Elevator(
            code="DT-20230013",
            reg_code=f"梯33-A{TODAY.year-2}0099",
            address="杭州市西湖区翠湖天地花园",
            location_detail="3幢1单元（旧楼改造，设备已退场）",
            brand="日立", model="HGP", type="客梯", floors=11,
            install_date=d(-2600), use_date=d(-2500),
            last_inspect_date=d(-400), inspect_cycle_days=365,
            status="停用",
            property_company="翠湖物业",
            maintenance_company="杭州安捷电梯工程有限公司",
            load_kg=1000, speed=1.6,
            remark="旧楼加装改造，原设备退场",
            is_archived=1, archive_type="退场", archive_date=d(-35),
            archive_reason="旧楼整体改造，原电梯拆除退场，新梯另行建档",
            archive_operator="系统管理员",
        )
        db.add(archived_ev)
        elevators.append(archived_ev)
        db.flush()
        archived_plan = models.MaintenancePlan(
            elevator_id=archived_ev.id, cycle="半月", next_date=d(-20),
            assignee_id=workers[4].id, active=0, remark="随设备退场停用",
        )
        db.add(archived_plan)
        for back in [60, 75, 90]:
            db.add(models.MaintenanceRecord(
                elevator_id=archived_ev.id, worker_id=workers[4].id,
                kind="半月", check_in_time=dt(-back, 9, 10),
                check_in_lat=30.2501, check_in_lng=120.1203,
                finish_time=dt(-back, 10, 30),
                items=[{"name": it, "result": "正常", "note": ""} for it in MAINT_ITEMS[:6]],
                result="正常", signature=workers[4].name,
            ))
        db.add(models.RepairOrder(
            order_no=f"WX{TODAY.strftime('%Y%m')}0099",
            elevator_id=archived_ev.id, reporter="物业周经理",
            reporter_phone="13900001111", report_time=dt(-70, 14),
            fault_desc="退场前门系统异响，调整门机后正常",
            fault_type="门系统", level="一般", status="已完成",
            worker_id=workers[4].id, arrive_time=dt(-70, 14, 40),
            finish_time=dt(-70, 16), solution="调整门机参数并润滑",
            parts=["门机皮带x1"], cost=120,
        ))
        db.add(models.Inspection(
            elevator_id=archived_ev.id, inspect_date=d(-400),
            next_date=d(-35), org="杭州市特种设备检测研究院",
            result="合格", certificate_no=f"JYZ{TODAY.year-1}0099",
        ))
        db.flush()

        # 每台电梯 1~2 个生效维保计划
        plan_offsets = [-5, 2, 6, 0, -12, 9, 14, 3, -2, 20, 28, 45]
        plans = []
        for i, ev in enumerate(elevators):
            if ev.is_archived:
                continue
            w = workers[i % len(workers)]
            p = models.MaintenancePlan(
                elevator_id=ev.id,
                cycle="半月",
                next_date=d(plan_offsets[i]),
                assignee_id=w.id,
                active=1,
                remark="按 TSG T5002 半月保项目执行",
            )
            db.add(p)
            plans.append(p)
        db.flush()

        # 历史保养记录（已完成）
        for i, ev in enumerate(elevators):
            w = workers[i % len(workers)]
            for back in [15, 30, 45]:
                if i == 6 and back == 15:
                    continue  # 故障梯最近一次保养缺失
                items = [
                    {"name": it, "result": "正常" if random.random() > 0.08 else "异常",
                     "note": "" if random.random() > 0.3 else "已现场调整并复检正常"}
                    for it in random.sample(MAINT_ITEMS, 6)
                ]
                has_abn = any(x["result"] == "异常" for x in items)
                rec = models.MaintenanceRecord(
                    elevator_id=ev.id,
                    worker_id=w.id,
                    kind="半月",
                    check_in_time=dt(-back, 9, random.randint(5, 40)),
                    check_in_lat=round(30.2 + random.uniform(-0.05, 0.05), 6),
                    check_in_lng=round(120.1 + random.uniform(-0.05, 0.05), 6),
                    finish_time=dt(-back, 10, random.randint(20, 55)),
                    items=items,
                    result="异常" if has_abn else "正常",
                    abnormal_desc="个别项目磨损，已现场处理" if has_abn else "",
                    signature=w.name,
                )
                db.add(rec)

        # 一条进行中的保养（已签到未完成）—— DT-2024004
        doing_ev = elevators[3]
        doing = models.MaintenanceRecord(
            elevator_id=doing_ev.id,
            worker_id=workers[3].id,
            plan_id=plans[3].id,
            kind="半月",
            check_in_time=NOW - timedelta(minutes=18),
            check_in_lat=30.24591,
            check_in_lng=120.10237,
            finish_time=None,
            items=[],
            result="进行中",
        )
        db.add(doing)

        # 故障急修工单
        repair_specs = [
            (6, -1, 0, "维修中"),   # 故障梯：今天报修，维修中
            (1, -3, -3, "已完成"),
            (4, -6, -6, "已完成"),
            (8, -10, -9, "已完成"),
            (2, -20, -20, "已完成"),
            (10, 0, None, "待接单"),  # 今天刚报修
        ]
        for idx, (ev_idx, r_days, f_days, st) in enumerate(repair_specs, start=1):
            ev = elevators[ev_idx]
            ftype, desc, sol, parts, cost = FAULT_BANK[(idx - 1) % len(FAULT_BANK)]
            w = workers[(ev_idx + 1) % len(workers)]
            urgent = st in ("待接单", "维修中") and idx in (1, 6)
            order = models.RepairOrder(
                order_no=f"WX{NOW.strftime('%Y%m%d')}{idx:03d}",
                elevator_id=ev.id,
                reporter=["物业周经理", "保安李师傅", "业主王女士", "物业前台"][idx % 4],
                reporter_phone=f"139{random.randint(10000000, 99999999)}",
                report_time=dt(r_days, 9 if r_days < 0 else NOW.hour, random.randint(10, 50) if r_days < 0 else max(5, NOW.minute - 3)),
                fault_desc=desc,
                fault_type=ftype,
                level="紧急" if urgent else "一般",
                status=st,
                worker_id=w.id if st != "待接单" else None,
                arrive_time=dt(r_days, 10) if st in ("维修中", "已完成") else None,
                finish_time=dt(f_days, 11, 30) if f_days is not None and st == "已完成" else None,
                solution=sol if st == "已完成" else "",
                parts=parts if st == "已完成" else [],
                cost=cost if st == "已完成" else 0,
            )
            if r_days == 0 and st == "待接单":
                order.report_time = NOW - timedelta(minutes=8)
            db.add(order)

        # 年检记录
        for i, ev in enumerate(elevators):
            if ev.is_archived or i >= len(inspect_offsets):
                continue
            if inspect_offsets[i] < 365:
                insp = models.Inspection(
                    elevator_id=ev.id,
                    inspect_date=ev.last_inspect_date,
                    next_date=ev.last_inspect_date + timedelta(days=365),
                    org=random.choice(["杭州市特种设备检测研究院", "浙江省特种设备科学研究院"]),
                    result="合格",
                    certificate_no=f"JYZ{TODAY.year}{3000+i:04d}",
                )
                db.add(insp)

        db.commit()
        print("模拟数据生成完成：13 台电梯（含 1 台退场归档）、7 个登录账号、6 名维保人员、维保计划/保养记录/急修工单/年检记录若干。")
    finally:
        db.close()


if __name__ == "__main__":
    run()
