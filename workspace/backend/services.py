"""业务辅助逻辑：年检/维保计划的到期计算。"""
from datetime import date, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

import models

WARN_DAYS = 30  # 到期前 30 天进入预警


def inspect_info(elevator: models.Elevator, today: date | None = None) -> dict:
    """根据最近年检日期与周期计算下次年检、剩余天数和状态。"""
    today = today or date.today()
    if not elevator.last_inspect_date:
        return {"next_inspect_date": None, "inspect_days_left": None, "inspect_status": "未建档"}
    next_d = elevator.last_inspect_date + timedelta(days=elevator.inspect_cycle_days or 365)
    # 若有年检记录则以最新记录的 next_date 为准
    latest = max(
        (i.next_date for i in elevator.inspections),
        default=None,
    )
    if latest:
        next_d = latest
    days = (next_d - today).days
    if days < 0:
        status = "已过期"
    elif days <= WARN_DAYS:
        status = "即将到期"
    else:
        status = "正常"
    return {"next_inspect_date": next_d, "inspect_days_left": days, "inspect_status": status}


def next_plan(db: Session, elevator_id: int, today: date | None = None):
    """取该电梯当前生效的最近一次维保计划。"""
    today = today or date.today()
    stmt = (
        select(models.MaintenancePlan)
        .where(
            models.MaintenancePlan.elevator_id == elevator_id,
            models.MaintenancePlan.active == 1,
        )
        .order_by(models.MaintenancePlan.next_date.asc())
    )
    return db.scalars(stmt).first()


def plan_info(db: Session, elevator_id: int, today: date | None = None) -> dict:
    today = today or date.today()
    plan = next_plan(db, elevator_id, today)
    if not plan:
        return {"next_plan_date": None, "plan_days_left": None}
    days = (plan.next_date - today).days
    return {"next_plan_date": plan.next_date, "plan_days_left": days}


def serialize_elevator(db: Session, ev: models.Elevator) -> dict:
    data = {c.name: getattr(ev, c.name) for c in ev.__table__.columns}
    data.update(inspect_info(ev))
    data.update(plan_info(db, ev.id))
    return data
