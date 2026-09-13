"""FastAPI 入口：电梯维保管理系统后端 API。"""
from datetime import date, datetime, timedelta
from io import BytesIO

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session, selectinload

import qrcode

from database import Base, engine, get_db
import models
import schemas
from services import inspect_info, serialize_elevator, WARN_DAYS

Base.metadata.create_all(bind=engine)

app = FastAPI(title="电梯维保管理系统 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- 静态二维码 ----------------
@app.get("/api/qrcode/{code}")
def elevator_qrcode(code: str):
    """返回电梯二维码 PNG（码值为设备编号）。"""
    img = qrcode.make(code, box_size=8, border=2)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


# ---------------- 首页统计 ----------------
@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()
    elevators = db.scalars(select(models.Elevator)).all()

    total = len(elevators)
    fault = sum(1 for e in elevators if e.status == "故障")
    stopped = sum(1 for e in elevators if e.status == "停用")
    inspect_soon = inspect_overdue = 0
    for e in elevators:
        st = inspect_info(e, today)
        if st["inspect_status"] == "即将到期":
            inspect_soon += 1
        elif st["inspect_status"] == "已过期":
            inspect_overdue += 1

    open_repairs = db.scalar(
        select(func.count(models.RepairOrder.id)).where(
            models.RepairOrder.status.in_(["待接单", "已派单", "维修中"])
        )
    )
    urgent_repairs = db.scalar(
        select(func.count(models.RepairOrder.id)).where(
            models.RepairOrder.status.in_(["待接单", "已派单", "维修中"]),
            models.RepairOrder.level == "紧急",
        )
    )

    # 逾期/即将到期的维保计划
    plans = db.scalars(
        select(models.MaintenancePlan).where(models.MaintenancePlan.active == 1)
    ).all()
    plan_overdue = sum(1 for p in plans if p.next_date < today)
    plan_soon = sum(1 for p in plans if today <= p.next_date <= today + timedelta(days=7))

    month_start = today.replace(day=1)
    month_records = db.scalar(
        select(func.count(models.MaintenanceRecord.id)).where(
            models.MaintenanceRecord.check_in_time >= datetime.combine(month_start, datetime.min.time())
        )
    )

    # 近 7 天保养趋势
    trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        cnt = db.scalar(
            select(func.count(models.MaintenanceRecord.id)).where(
                models.MaintenanceRecord.check_in_time >= day_start,
                models.MaintenanceRecord.check_in_time < day_end,
            )
        )
        trend.append({"date": day.strftime("%m-%d"), "count": cnt})

    return {
        "elevator_total": total,
        "elevator_normal": total - fault - stopped,
        "elevator_fault": fault,
        "elevator_stopped": stopped,
        "inspect_soon": inspect_soon,
        "inspect_overdue": inspect_overdue,
        "repair_open": open_repairs,
        "repair_urgent": urgent_repairs,
        "plan_overdue": plan_overdue,
        "plan_soon": plan_soon,
        "month_records": month_records,
        "trend": trend,
    }


# ---------------- 电梯档案 ----------------
@app.get("/api/elevators", response_model=list[schemas.ElevatorOut])
def list_elevators(
    keyword: str | None = None,
    status: str | None = None,
    inspect_status: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(models.Elevator).order_by(models.Elevator.code)
    if keyword:
        kw = f"%{keyword}%"
        stmt = stmt.where(or_(
            models.Elevator.code.like(kw),
            models.Elevator.address.like(kw),
            models.Elevator.location_detail.like(kw),
            models.Elevator.brand.like(kw),
            models.Elevator.property_company.like(kw),
        ))
    if status:
        stmt = stmt.where(models.Elevator.status == status)
    elevators = db.scalars(stmt).all()
    result = [serialize_elevator(db, e) for e in elevators]
    if inspect_status:
        result = [r for r in result if r["inspect_status"] == inspect_status]
    return result


@app.get("/api/elevators/code/{code}", response_model=schemas.ElevatorOut)
def get_elevator_by_code(code: str, db: Session = Depends(get_db)):
    ev = db.scalar(select(models.Elevator).where(models.Elevator.code == code))
    if not ev:
        raise HTTPException(404, f"未找到编号为 {code} 的电梯")
    return serialize_elevator(db, ev)


@app.get("/api/elevators/{elevator_id}", response_model=schemas.ElevatorOut)
def get_elevator(elevator_id: int, db: Session = Depends(get_db)):
    ev = db.get(models.Elevator, elevator_id)
    if not ev:
        raise HTTPException(404, "电梯不存在")
    return serialize_elevator(db, ev)


@app.post("/api/elevators", response_model=schemas.ElevatorOut)
def create_elevator(payload: schemas.ElevatorCreate, db: Session = Depends(get_db)):
    if db.scalar(select(models.Elevator).where(models.Elevator.code == payload.code)):
        raise HTTPException(400, "设备编号已存在")
    ev = models.Elevator(**payload.model_dump())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return serialize_elevator(db, ev)


@app.put("/api/elevators/{elevator_id}", response_model=schemas.ElevatorOut)
def update_elevator(elevator_id: int, payload: schemas.ElevatorUpdate, db: Session = Depends(get_db)):
    ev = db.get(models.Elevator, elevator_id)
    if not ev:
        raise HTTPException(404, "电梯不存在")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ev, k, v)
    db.commit()
    db.refresh(ev)
    return serialize_elevator(db, ev)


@app.delete("/api/elevators/{elevator_id}")
def delete_elevator(elevator_id: int, db: Session = Depends(get_db)):
    ev = db.get(models.Elevator, elevator_id)
    if not ev:
        raise HTTPException(404, "电梯不存在")
    db.delete(ev)
    db.commit()
    return {"ok": True}


# ---------------- 维保人员 ----------------
@app.get("/api/workers", response_model=list[schemas.WorkerOut])
def list_workers(db: Session = Depends(get_db)):
    return db.scalars(select(models.Worker).order_by(models.Worker.id)).all()


@app.post("/api/workers", response_model=schemas.WorkerOut)
def create_worker(payload: schemas.WorkerCreate, db: Session = Depends(get_db)):
    w = models.Worker(**payload.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


# ---------------- 维保计划 ----------------
@app.get("/api/plans", response_model=list[schemas.PlanOut])
def list_plans(scope: str = "active", db: Session = Depends(get_db)):
    today = date.today()
    stmt = select(models.MaintenancePlan).options(selectinload(models.MaintenancePlan.elevator))
    if scope == "active":
        stmt = stmt.where(models.MaintenancePlan.active == 1)
    plans = db.scalars(stmt.order_by(models.MaintenancePlan.next_date)).all()
    out = []
    for p in plans:
        d = schemas.PlanOut.model_validate(p)
        d.days_left = (p.next_date - today).days
        d.overdue = p.next_date < today
        out.append(d)
    return out


@app.post("/api/plans", response_model=schemas.PlanOut)
def create_plan(payload: schemas.PlanCreate, db: Session = Depends(get_db)):
    if not db.get(models.Elevator, payload.elevator_id):
        raise HTTPException(404, "电梯不存在")
    p = models.MaintenancePlan(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.put("/api/plans/{plan_id}/toggle", response_model=schemas.PlanOut)
def toggle_plan(plan_id: int, db: Session = Depends(get_db)):
    p = db.get(models.MaintenancePlan, plan_id)
    if not p:
        raise HTTPException(404, "计划不存在")
    p.active = 0 if p.active else 1
    db.commit()
    db.refresh(p)
    return p


# ---------------- 扫码签到 + 保养记录 ----------------
@app.post("/api/maintenance/check-in", response_model=schemas.RecordOut)
def check_in(payload: schemas.CheckInCreate, db: Session = Depends(get_db)):
    ev = db.scalar(select(models.Elevator).where(models.Elevator.code == payload.elevator_code))
    if not ev:
        raise HTTPException(404, f"二维码无效：未找到电梯 {payload.elevator_code}")
    worker = db.get(models.Worker, payload.worker_id)
    if not worker:
        raise HTTPException(404, "维保人员不存在")

    # 同一台电梯存在未完成记录则直接返回（避免重复签到）
    existing = db.scalar(
        select(models.MaintenanceRecord)
        .where(
            models.MaintenanceRecord.elevator_id == ev.id,
            models.MaintenanceRecord.finish_time.is_(None),
        )
        .order_by(models.MaintenanceRecord.id.desc())
    )
    if existing:
        existing.elevator = ev
        existing.worker = worker
        return existing

    from services import next_plan
    plan = next_plan(db, ev.id)
    rec = models.MaintenanceRecord(
        elevator_id=ev.id,
        worker_id=worker.id,
        plan_id=plan.id if plan else None,
        kind=plan.cycle if plan else "半月",
        check_in_time=datetime.now(),
        check_in_lat=payload.lat,
        check_in_lng=payload.lng,
        finish_time=None,
        items=[],
        result="进行中",
    )
    if ev.status == "正常":
        ev.status = "保养中"
    db.add(rec)
    db.commit()
    db.refresh(rec)
    rec.elevator = ev
    rec.worker = worker
    return rec


@app.put("/api/maintenance/records/{record_id}/complete", response_model=schemas.RecordOut)
def complete_record(record_id: int, payload: schemas.RecordComplete, db: Session = Depends(get_db)):
    rec = db.get(models.MaintenanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "保养记录不存在")
    if rec.finish_time:
        raise HTTPException(400, "该记录已完成")

    rec.kind = payload.kind
    rec.items = [it.model_dump() for it in payload.items]
    rec.result = payload.result
    rec.abnormal_desc = payload.abnormal_desc
    rec.signature = payload.signature
    rec.finish_time = datetime.now()

    ev = db.get(models.Elevator, rec.elevator_id)
    # 完成保养：电梯恢复正常（除非存在未完成急修）
    open_repair = db.scalar(
        select(models.RepairOrder).where(
            models.RepairOrder.elevator_id == ev.id,
            models.RepairOrder.status.in_(["待接单", "已派单", "维修中"]),
        )
    )
    ev.status = "故障" if open_repair else "正常"

    # 推进维保计划：下次日期顺延一个周期
    if rec.plan_id:
        plan = db.get(models.MaintenancePlan, rec.plan_id)
        cycle_days = {"半月": 15, "季度": 90, "半年": 180, "年度": 365}.get(plan.cycle, 15)
        base = max(plan.next_date, date.today())
        plan.next_date = base + timedelta(days=cycle_days)

    # 发现异常：自动生成紧急维修工单
    if payload.result == "异常":
        order = models.RepairOrder(
            order_no=f"WX{datetime.now().strftime('%Y%m%d%H%M%S')}",
            elevator_id=ev.id,
            reporter=rec.worker.name if rec.worker else "维保员",
            reporter_phone=rec.worker.phone if rec.worker else None,
            report_time=datetime.now(),
            fault_desc=payload.abnormal_desc or "保养中发现设备异常，需安排急修",
            fault_type="其他",
            level="一般",
            status="待接单",
        )
        db.add(order)
        ev.status = "故障"

    db.commit()
    db.refresh(rec)
    rec.elevator = ev
    rec.worker = rec.worker
    return rec


@app.get("/api/maintenance/records", response_model=list[schemas.RecordOut])
def list_records(
    elevator_id: int | None = None,
    ongoing: bool | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    stmt = (
        select(models.MaintenanceRecord)
        .options(selectinload(models.MaintenanceRecord.elevator),
                 selectinload(models.MaintenanceRecord.worker))
        .order_by(models.MaintenanceRecord.check_in_time.desc())
    )
    if elevator_id:
        stmt = stmt.where(models.MaintenanceRecord.elevator_id == elevator_id)
    if ongoing is True:
        stmt = stmt.where(models.MaintenanceRecord.finish_time.is_(None))
    elif ongoing is False:
        stmt = stmt.where(models.MaintenanceRecord.finish_time.isnot(None))
    records = db.scalars(stmt.limit(limit)).all()
    return records


# ---------------- 故障急修 ----------------
@app.get("/api/repairs", response_model=list[schemas.RepairOut])
def list_repairs(status: str | None = None, db: Session = Depends(get_db)):
    stmt = select(models.RepairOrder).options(
        selectinload(models.RepairOrder.elevator), selectinload(models.RepairOrder.worker)
    )
    if status:
        stmt = stmt.where(models.RepairOrder.status == status)
    orders = db.scalars(stmt.order_by(models.RepairOrder.report_time.desc())).all()
    today = date.today()
    out = []
    for o in orders:
        d = schemas.RepairOut.model_validate(o)
        if o.arrive_time and o.report_time:
            d.response_minutes = round((o.arrive_time - o.report_time).total_seconds() / 60, 1)
        out.append(d)
    return out


@app.post("/api/repairs", response_model=schemas.RepairOut)
def create_repair(payload: schemas.RepairCreate, db: Session = Depends(get_db)):
    elevator_id = payload.elevator_id
    if not elevator_id and payload.elevator_code:
        ev = db.scalar(select(models.Elevator).where(models.Elevator.code == payload.elevator_code))
        if not ev:
            raise HTTPException(404, "电梯不存在")
        elevator_id = ev.id
    if not elevator_id:
        raise HTTPException(400, "必须指定电梯")
    order = models.RepairOrder(
        order_no=f"WX{datetime.now().strftime('%Y%m%d%H%M%S')}",
        elevator_id=elevator_id,
        reporter=payload.reporter,
        reporter_phone=payload.reporter_phone,
        report_time=datetime.now(),
        fault_desc=payload.fault_desc,
        fault_type=payload.fault_type,
        level=payload.level,
        status="待接单",
    )
    ev = db.get(models.Elevator, elevator_id)
    ev.status = "故障"
    db.add(order)
    db.commit()
    db.refresh(order)
    order.elevator = ev
    return order


@app.put("/api/repairs/{order_id}", response_model=schemas.RepairOut)
def update_repair(order_id: int, payload: schemas.RepairUpdate, db: Session = Depends(get_db)):
    order = db.get(models.RepairOrder, order_id)
    if not order:
        raise HTTPException(404, "工单不存在")

    old_status = order.status
    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("status")

    if new_status == "维修中" and old_status != "维修中":
        order.arrive_time = datetime.now()
    if new_status == "已完成" and old_status != "已完成":
        order.finish_time = datetime.now()

    for k, v in data.items():
        setattr(order, k, v)

    if new_status == "已完成":
        ev = db.get(models.Elevator, order.elevator_id)
        ev.status = "正常"
    elif new_status in ("已派单", "维修中"):
        ev = db.get(models.Elevator, order.elevator_id)
        ev.status = "故障"

    db.commit()
    db.refresh(order)
    return order


# ---------------- 年检 ----------------
@app.get("/api/inspections", response_model=list[schemas.InspectionOut])
def list_inspections(
    warn_days: int = Query(default=WARN_DAYS, description="预警天数"),
    db: Session = Depends(get_db),
):
    today = date.today()
    rows = db.scalars(
        select(models.Inspection)
        .options(selectinload(models.Inspection.elevator))
        .order_by(models.Inspection.next_date)
    ).all()
    out = []
    for r in rows:
        d = schemas.InspectionOut.model_validate(r)
        d.days_left = (r.next_date - today).days
        out.append(d)
    return out


@app.get("/api/inspections/expiring")
def expiring_inspections(days: int = WARN_DAYS, db: Session = Depends(get_db)):
    """年检到期提醒：返回已过期 + N 天内到期的电梯。"""
    today = date.today()
    deadline = today + timedelta(days=days)
    elevators = db.scalars(
        select(models.Elevator).options(selectinload(models.Elevator.inspections))
    ).all()
    items = []
    for ev in elevators:
        info = inspect_info(ev, today)
        if info["inspect_status"] == "已过期" or (
            info["inspect_status"] == "即将到期" and info["next_inspect_date"] <= deadline
        ):
            items.append({
                "elevator": serialize_elevator(db, ev),
                "next_inspect_date": info["next_inspect_date"],
                "days_left": info["inspect_days_left"],
                "inspect_status": info["inspect_status"],
            })
    items.sort(key=lambda x: x["days_left"])
    return items


@app.post("/api/inspections", response_model=schemas.InspectionOut)
def create_inspection(payload: schemas.InspectionCreate, db: Session = Depends(get_db)):
    ev = db.get(models.Elevator, payload.elevator_id)
    if not ev:
        raise HTTPException(404, "电梯不存在")
    insp = models.Inspection(**payload.model_dump())
    db.add(insp)
    # 同步更新档案的最近年检日期
    ev.last_inspect_date = payload.inspect_date
    db.commit()
    db.refresh(insp)
    return insp


@app.get("/api/elevators/{elevator_id}/inspections", response_model=list[schemas.InspectionOut])
def elevator_inspections(elevator_id: int, db: Session = Depends(get_db)):
    return db.scalars(
        select(models.Inspection)
        .where(models.Inspection.elevator_id == elevator_id)
        .order_by(models.Inspection.inspect_date.desc())
    ).all()
