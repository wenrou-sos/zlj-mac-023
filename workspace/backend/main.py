"""FastAPI 入口：电梯维保管理系统后端 API。"""
from datetime import date, datetime, timedelta
from io import BytesIO

from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

import qrcode

from database import Base, engine, get_db
import models
import schemas
import auth
from auth import get_current_user, require_admin, ROLE_ADMIN
from services import inspect_info, serialize_elevator, WARN_DAYS
from checklist_templates import get_checklist, CYCLES
from migrations import run_migrations

# 旧库增量升级（补建 users 表、补归档列），再确保表结构完整
run_migrations()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="电梯维保管理系统 API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """数据库唯一约束等冲突统一返回 400，保证前端能拿到可读提示。"""
    return JSONResponse(status_code=400, content={"detail": "数据冲突：编号或登记证号可能已存在"})


def get_active_elevator(db: Session, elevator_id: int) -> models.Elevator:
    ev = db.get(models.Elevator, elevator_id)
    if not ev:
        raise HTTPException(404, "电梯不存在")
    return ev


def ensure_not_archived(ev: models.Elevator):
    if ev.is_archived:
        raise HTTPException(400, f"该设备已{ev.archive_type or '归档'}，不能进行日常维保操作，如需恢复请联系管理员")


# ---------------- 登录 ----------------
@app.post("/api/auth/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.username == payload.username))
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "用户名或密码错误")
    if not user.active:
        raise HTTPException(403, "账号已停用")
    token = auth.create_token(user.id)
    return {"token": token, "user": user}


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


# ---------------- 静态二维码 ----------------
@app.get("/api/qrcode/{code}")
def elevator_qrcode(code: str):
    """返回电梯二维码 PNG（码值为设备编号）。"""
    img = qrcode.make(code, box_size=8, border=2)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


# ---------------- 首页统计（只统计在用设备） ----------------
@app.get("/api/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    today = date.today()
    elevators = db.scalars(
        select(models.Elevator).where(models.Elevator.is_archived == 0)
    ).all()

    active_ids = [e.id for e in elevators]
    total = len(elevators)
    fault = sum(1 for e in elevators if e.status == "故障")
    stopped = sum(1 for e in elevators if e.status == "停用")
    in_maint = sum(1 for e in elevators if e.status == "保养中")
    inspect_soon = inspect_overdue = 0
    for e in elevators:
        st = inspect_info(e, today)
        if st["inspect_status"] == "即将到期":
            inspect_soon += 1
        elif st["inspect_status"] == "已过期":
            inspect_overdue += 1

    archived_total = db.scalar(
        select(func.count(models.Elevator.id)).where(models.Elevator.is_archived == 1)
    )

    def count_repairs(extra=()):
        conds = [
            models.RepairOrder.status.in_(["待接单", "已派单", "维修中"]),
            models.RepairOrder.elevator_id.in_(active_ids or [0]),
            *extra,
        ]
        return db.scalar(select(func.count(models.RepairOrder.id)).where(*conds))

    open_repairs = count_repairs()
    urgent_repairs = count_repairs([models.RepairOrder.level == "紧急"])

    # 逾期/即将到期的维保计划（排除已归档设备）
    plans = db.scalars(
        select(models.MaintenancePlan).where(
            models.MaintenancePlan.active == 1,
            models.MaintenancePlan.elevator_id.in_(active_ids or [0]),
        )
    ).all()
    plan_overdue = sum(1 for p in plans if p.next_date < today)
    plan_soon = sum(1 for p in plans if today <= p.next_date <= today + timedelta(days=7))

    month_start = today.replace(day=1)
    month_records = db.scalar(
        select(func.count(models.MaintenanceRecord.id)).where(
            models.MaintenanceRecord.check_in_time >= datetime.combine(month_start, datetime.min.time()),
            models.MaintenanceRecord.elevator_id.in_(active_ids or [0]),
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
        "elevator_normal": total - fault - stopped - in_maint,
        "elevator_fault": fault,
        "elevator_stopped": stopped,
        "archived_total": archived_total,
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
    archived: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # 归档库仅管理员可查询（直接调 API 也一样拦截）
    if archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足：归档库仅管理员可访问")
    stmt = select(models.Elevator).where(models.Elevator.is_archived == archived).order_by(models.Elevator.code)
    if keyword:
        kw = f"%{keyword}%"
        stmt = stmt.where(or_(
            models.Elevator.code.like(kw),
            models.Elevator.reg_code.like(kw),
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
def get_elevator_by_code(
    code: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ev = db.scalar(select(models.Elevator).where(models.Elevator.code == code))
    if not ev:
        raise HTTPException(404, f"未找到编号为 {code} 的电梯")
    if ev.is_archived:
        raise HTTPException(400, f"该设备已{ev.archive_type or '归档'}，如需恢复请联系管理员")
    return serialize_elevator(db, ev)


@app.get("/api/elevators/{elevator_id}", response_model=schemas.ElevatorOut)
def get_elevator(
    elevator_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ev = get_active_elevator(db, elevator_id)
    if ev.is_archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足：归档设备详情仅管理员可查看")
    return serialize_elevator(db, ev)


@app.post("/api/elevators", response_model=schemas.ElevatorOut)
def create_elevator(
    payload: schemas.ElevatorCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if db.scalar(select(models.Elevator).where(models.Elevator.code == payload.code)):
        raise HTTPException(400, f"设备编号 {payload.code} 已存在")
    if payload.reg_code and db.scalar(
        select(models.Elevator).where(models.Elevator.reg_code == payload.reg_code)
    ):
        raise HTTPException(400, f"使用登记证编号 {payload.reg_code} 已存在")
    ev = models.Elevator(**payload.model_dump())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return serialize_elevator(db, ev)


@app.put("/api/elevators/{elevator_id}", response_model=schemas.ElevatorOut)
def update_elevator(
    elevator_id: int,
    payload: schemas.ElevatorUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    ev = get_active_elevator(db, elevator_id)
    data = payload.model_dump(exclude_unset=True)
    # 唯一性校验（排除自身）
    if data.get("code") and db.scalar(
        select(models.Elevator.id).where(
            models.Elevator.code == data["code"],
            models.Elevator.id != elevator_id,
        )
    ):
        raise HTTPException(400, f"设备编号 {data['code']} 已存在")
    if data.get("reg_code") and db.scalar(
        select(models.Elevator.id).where(
            models.Elevator.reg_code == data["reg_code"],
            models.Elevator.id != elevator_id,
        )
    ):
        raise HTTPException(400, f"使用登记证编号 {data['reg_code']} 已存在")
    for k, v in data.items():
        setattr(ev, k, v)
    # 年检基准日期或周期变化时，同步最新年检记录的“下次检验日期”，
    # 使列表、年检记录、提醒各处口径一致（历史记录本身保持不变）
    if "last_inspect_date" in data or "inspect_cycle_days" in data:
        latest_insp = db.scalar(
            select(models.Inspection)
            .where(models.Inspection.elevator_id == elevator_id)
            .order_by(models.Inspection.inspect_date.desc())
        )
        if latest_insp and ev.last_inspect_date:
            latest_insp.next_date = ev.last_inspect_date + timedelta(
                days=ev.inspect_cycle_days or 365)
    db.commit()
    db.refresh(ev)
    return serialize_elevator(db, ev)


@app.delete("/api/elevators/{elevator_id}")
def delete_elevator(elevator_id: int, user: models.User = Depends(get_current_user)):
    """物理删除已全面停用：档案与全部历史只能归档保留。"""
    raise HTTPException(403, "系统不支持删除档案；请由管理员执行“报废/移交/退场”归档操作，历史记录将长期保留")


# ---- 归档（报废 / 移交 / 退场）与恢复：仅管理员 ----
@app.post("/api/elevators/{elevator_id}/archive", response_model=schemas.ElevatorOut)
def archive_elevator(
    elevator_id: int,
    payload: schemas.ArchiveCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    ev = get_active_elevator(db, elevator_id)
    if ev.is_archived:
        raise HTTPException(400, "该设备已归档")
    if payload.archive_type not in ("报废", "移交", "退场"):
        raise HTTPException(400, "归档类型必须是 报废 / 移交 / 退场")

    # 存在未完成急修或保养时不允许归档
    open_repair = db.scalar(
        select(models.RepairOrder).where(
            models.RepairOrder.elevator_id == ev.id,
            models.RepairOrder.status.in_(["待接单", "已派单", "维修中"]),
        )
    )
    ongoing = db.scalar(
        select(models.MaintenanceRecord).where(
            models.MaintenanceRecord.elevator_id == ev.id,
            models.MaintenanceRecord.finish_time.is_(None),
        )
    )
    if open_repair or ongoing:
        raise HTTPException(400, "该设备存在未完成的急修工单或保养记录，请先处理完毕再归档")

    ev.is_archived = 1
    ev.archive_type = payload.archive_type
    ev.archive_date = date.today()
    ev.archive_reason = payload.reason
    ev.archive_operator = user.name
    # 生效维保计划随归档停用（数据保留），恢复后不自动启用
    for p in ev.plans:
        if p.active:
            p.active = 0
    db.commit()
    db.refresh(ev)
    return serialize_elevator(db, ev)


@app.post("/api/elevators/{elevator_id}/restore", response_model=schemas.ElevatorOut)
def restore_elevator(
    elevator_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    ev = db.get(models.Elevator, elevator_id)
    if not ev:
        raise HTTPException(404, "电梯不存在")
    if not ev.is_archived:
        raise HTTPException(400, "该设备未归档")
    ev.is_archived = 0
    ev.archive_type = None
    ev.archive_date = None
    ev.archive_reason = None
    ev.archive_operator = None
    # 恢复后处于停用状态，由管理员检查确认后手动启用（计划也需重新启用/排期）
    ev.status = "停用"
    db.commit()
    db.refresh(ev)
    return serialize_elevator(db, ev)


# ---------------- 维保人员 ----------------
@app.get("/api/workers", response_model=list[schemas.WorkerOut])
def list_workers(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return db.scalars(select(models.Worker).order_by(models.Worker.id)).all()


@app.post("/api/workers", response_model=schemas.WorkerOut)
def create_worker(
    payload: schemas.WorkerCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    w = models.Worker(**payload.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


# ---------------- 维保计划 ----------------
@app.get("/api/plans", response_model=list[schemas.PlanOut])
def list_plans(
    scope: str = "active",
    include_archived: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if include_archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足")
    today = date.today()
    stmt = select(models.MaintenancePlan).options(selectinload(models.MaintenancePlan.elevator))
    if scope == "active":
        stmt = stmt.where(models.MaintenancePlan.active == 1)
    if not include_archived:
        stmt = stmt.join(models.Elevator).where(models.Elevator.is_archived == 0)
    plans = db.scalars(stmt.order_by(models.MaintenancePlan.next_date)).all()
    out = []
    for p in plans:
        d = schemas.PlanOut.model_validate(p)
        d.days_left = (p.next_date - today).days
        d.overdue = p.next_date < today
        out.append(d)
    return out


@app.post("/api/plans", response_model=schemas.PlanOut)
def create_plan(
    payload: schemas.PlanCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    ev = get_active_elevator(db, payload.elevator_id)
    ensure_not_archived(ev)
    p = models.MaintenancePlan(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.put("/api/plans/{plan_id}/toggle", response_model=schemas.PlanOut)
def toggle_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    p = db.get(models.MaintenancePlan, plan_id)
    if not p:
        raise HTTPException(404, "计划不存在")
    ev = db.get(models.Elevator, p.elevator_id)
    if ev.is_archived:
        raise HTTPException(400, f"设备已{ev.archive_type or '归档'}，如需启用计划请先恢复设备")
    p.active = 0 if p.active else 1
    db.commit()
    db.refresh(p)
    return p


# ---------------- 扫码签到 + 保养记录（管理员/维保员） ----------------
@app.get("/api/elevators/{elevator_id}/checklist")
def elevator_checklist(
    elevator_id: int,
    cycle: str = "半月",
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """按电梯类型与维保周期返回必检项目模板。"""
    ev = get_active_elevator(db, elevator_id)
    ensure_not_archived(ev)
    if cycle not in CYCLES:
        raise HTTPException(400, f"维保周期必须是 {'/'.join(CYCLES)}")
    return {
        "elevator_id": ev.id,
        "elevator_type": ev.type,
        "cycle": cycle,
        "checklist": get_checklist(ev.type, cycle),
    }


@app.post("/api/maintenance/check-in", response_model=schemas.RecordOut)
def check_in(
    payload: schemas.CheckInCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ev = db.scalar(select(models.Elevator).where(models.Elevator.code == payload.elevator_code))
    if not ev:
        raise HTTPException(404, f"二维码无效：未找到电梯 {payload.elevator_code}")
    ensure_not_archived(ev)

    # 维保员只能以本人身份签到（其账号绑定的维保人员）
    if user.role != ROLE_ADMIN:
        if not user.worker_id:
            raise HTTPException(403, "当前账号未绑定维保人员，无法签到")
        if payload.worker_id and payload.worker_id != user.worker_id:
            raise HTTPException(403, "维保员只能以本人身份签到，不可代签")
        worker_id = user.worker_id
    else:
        worker_id = payload.worker_id or user.worker_id
    if not worker_id:
        raise HTTPException(400, "请选择签到的维保人员")
    worker = db.get(models.Worker, worker_id)
    if not worker:
        raise HTTPException(404, "维保人员不存在")

    # 同一台电梯存在未完成记录：同人直接返回；换人则返回 409 冲突，由前端确认是否接手
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
        existing.worker = db.get(models.Worker, existing.worker_id)
        if existing.worker_id != worker.id:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": f"该电梯有一条未完成的保养记录（{existing.worker.name} 签到），"
                               f"记录仍归属原维保人员。如需由 {worker.name} 继续完成，请确认接手。",
                    "record_id": existing.id,
                    "owner_name": existing.worker.name,
                    "owner_id": existing.worker_id,
                    "check_in_time": existing.check_in_time.isoformat(),
                },
            )
        return existing

    from services import next_plan
    plan = next_plan(db, ev.id)
    cycle = plan.cycle if plan else "半月"
    rec = models.MaintenanceRecord(
        elevator_id=ev.id,
        worker_id=worker.id,
        plan_id=plan.id if plan else None,
        kind=cycle,
        check_in_time=datetime.now(),
        check_in_lat=payload.lat,
        check_in_lng=payload.lng,
        finish_time=None,
        # 签到时先按计划周期存一版模板快照，最终以完成时选择的周期重算
        checklist=get_checklist(ev.type, cycle),
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


@app.post("/api/maintenance/records/{record_id}/take-over", response_model=schemas.RecordOut)
def take_over_record(
    record_id: int,
    payload: schemas.TakeOverCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """换人接手未完成的保养记录：记录改挂到新维保人员名下，并追加一条接手备注。"""
    rec = db.get(models.MaintenanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "保养记录不存在")
    if rec.finish_time:
        raise HTTPException(400, "该记录已完成，无需接手")

    # 维保员只能自己接手，不能把别人的记录转给第三人
    if user.role != ROLE_ADMIN and user.worker_id != payload.worker_id:
        raise HTTPException(403, "只能由接手人本人确认接手")
    new_worker = db.get(models.Worker, payload.worker_id)
    if not new_worker:
        raise HTTPException(404, "维保人员不存在")

    old_worker = db.get(models.Worker, rec.worker_id)
    if rec.worker_id != new_worker.id:
        rec.worker_id = new_worker.id
        note = f"【{datetime.now():%Y-%m-%d %H:%M}】{new_worker.name} 接手（原签到人：{old_worker.name if old_worker else '—'}）"
        rec.check_in_addr = f"{rec.check_in_addr or '现场扫码签到'}\n{note}"
    db.commit()
    db.refresh(rec)
    rec.elevator = db.get(models.Elevator, rec.elevator_id)
    rec.worker = new_worker
    return rec


@app.put("/api/maintenance/records/{record_id}/complete", response_model=schemas.RecordOut)
def complete_record(
    record_id: int,
    payload: schemas.RecordComplete,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rec = db.get(models.MaintenanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "保养记录不存在")
    if rec.finish_time:
        raise HTTPException(400, "该记录已完成")
    ev = db.get(models.Elevator, rec.elevator_id)
    ensure_not_archived(ev)

    # 完成时按“电梯类型 × 所选周期”生成权威模板快照（历史以完成时的模板为准，
    # 之后模板调整不影响本记录）
    cycle = payload.kind if payload.kind in CYCLES else rec.kind
    template = get_checklist(ev.type, cycle)
    required_names = [t["name"] for t in template]
    required_set = set(required_names)

    # 提交项：必检项按名称归集；自定义项必须明确 custom=True 且名称不能与必检项重名
    submitted_required: dict[str, schemas.MaintenanceItem] = {}
    custom_items: list[dict] = []
    for it in payload.items:
        if it.result not in ("正常", "异常"):
            raise HTTPException(400, f"项目“{it.name}”结果值无效")
        if it.custom or it.name not in required_set:
            if it.name in required_set:
                raise HTTPException(400, f"“{it.name}”是必检项，不能作为自定义项提交")
            custom_items.append({
                "name": it.name, "result": it.result, "note": it.note,
                "required": False, "custom": True,
            })
        else:
            if it.name in submitted_required:
                raise HTTPException(400, f"项目“{it.name}”重复提交")
            submitted_required[it.name] = it
    # custom_items 字段与 items 中的自定义项等价，兼容两种提交方式
    for ci in payload.custom_items:
        if ci.name in required_set:
            raise HTTPException(400, f"“{ci.name}”是必检项，不能作为自定义项提交")
        if ci.name not in {c["name"] for c in custom_items}:
            custom_items.append({
                "name": ci.name, "result": ci.result, "note": ci.note,
                "required": False, "custom": True,
            })

    # 必检项不允许跳过
    missing = [n for n in required_names if n not in submitted_required]
    if missing:
        raise HTTPException(400, f"以下必检项未检查，不允许跳过：{'、'.join(missing[:5])}"
                             + ("…" if len(missing) > 5 else ""))

    # 按模板顺序组装完整清单；异常项必须有说明
    final_items = []
    abnormal_names = []
    for name in required_names:
        it = submitted_required[name]
        if it.result == "异常":
            abnormal_names.append(name)
            if not (it.note or "").strip():
                raise HTTPException(400, f"必检项“{name}”标记异常时必须填写异常说明")
        final_items.append({
            "name": name, "result": it.result, "note": it.note,
            "required": True, "custom": False,
        })
    for ci in custom_items:
        if ci["result"] == "异常":
            abnormal_names.append(ci["name"])
            if not ci["note"].strip():
                raise HTTPException(400, f"自定义项“{ci['name']}”标记异常时必须填写说明")
        final_items.append(ci)

    rec.kind = cycle
    rec.checklist = template
    rec.items = final_items
    rec.result = "异常" if abnormal_names else "正常"
    if abnormal_names:
        rec.abnormal_desc = payload.abnormal_desc or ("异常项：" + "、".join(abnormal_names))
    else:
        rec.abnormal_desc = ""
    rec.signature = payload.signature
    rec.finish_time = datetime.now()

    # 仅对“保养中”的电梯做状态联动；“停用”是人工设置状态，保养流程不得覆盖
    if ev.status == "保养中":
        open_repair = db.scalar(
            select(models.RepairOrder).where(
                models.RepairOrder.elevator_id == ev.id,
                models.RepairOrder.status.in_(["待接单", "已派单", "维修中"]),
            )
        )
        ev.status = "故障" if open_repair else "正常"

    # 推进维保计划：本次实际完成哪种保养，就按该周期顺延，
    # 并把计划周期同步为实际执行的类型（做了季度保后，下次到期日按季度走）
    if rec.plan_id:
        plan = db.get(models.MaintenancePlan, rec.plan_id)
        cycle_days = {"半月": 15, "季度": 90, "半年": 180, "年度": 365}.get(cycle, 15)
        base = max(plan.next_date, date.today())
        plan.next_date = base + timedelta(days=cycle_days)
        plan.cycle = cycle

    # 发现异常：自动生成待接单维修工单（以实际检查结果为准）
    if abnormal_names:
        desc = payload.abnormal_desc or ("保养异常项：" + "、".join(abnormal_names))
        order = models.RepairOrder(
            order_no=f"WX{datetime.now().strftime('%Y%m%d%H%M%S')}",
            elevator_id=ev.id,
            reporter=rec.worker.name if rec.worker else "维保员",
            reporter_phone=rec.worker.phone if rec.worker else None,
            report_time=datetime.now(),
            fault_desc=desc,
            fault_type="其他",
            level="一般",
            status="待接单",
        )
        db.add(order)
        if ev.status != "停用":
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
    include_archived: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    stmt = (
        select(models.MaintenanceRecord)
        .options(selectinload(models.MaintenanceRecord.elevator),
                 selectinload(models.MaintenanceRecord.worker))
        .order_by(models.MaintenanceRecord.check_in_time.desc())
    )
    if elevator_id:
        stmt = stmt.where(models.MaintenanceRecord.elevator_id == elevator_id)
        target = db.get(models.Elevator, elevator_id)
        if target and target.is_archived and user.role != ROLE_ADMIN:
            raise HTTPException(403, "权限不足：归档设备历史仅管理员可查看")
    elif not include_archived:
        stmt = stmt.join(models.Elevator).where(models.Elevator.is_archived == 0)
    elif include_archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足")
    if ongoing is True:
        stmt = stmt.where(models.MaintenanceRecord.finish_time.is_(None))
    elif ongoing is False:
        stmt = stmt.where(models.MaintenanceRecord.finish_time.isnot(None))
    records = db.scalars(stmt.limit(limit)).all()
    return records


# ---------------- 故障急修（报修/流转：管理员与维保员均可） ----------------
@app.get("/api/repairs", response_model=list[schemas.RepairOut])
def list_repairs(
    status: str | None = None,
    include_archived: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if include_archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足")
    stmt = select(models.RepairOrder).options(
        selectinload(models.RepairOrder.elevator), selectinload(models.RepairOrder.worker)
    )
    if status:
        stmt = stmt.where(models.RepairOrder.status == status)
    if not include_archived:
        stmt = stmt.join(models.Elevator).where(models.Elevator.is_archived == 0)
    orders = db.scalars(stmt.order_by(models.RepairOrder.report_time.desc())).all()
    out = []
    for o in orders:
        d = schemas.RepairOut.model_validate(o)
        if o.arrive_time and o.report_time:
            d.response_minutes = round((o.arrive_time - o.report_time).total_seconds() / 60, 1)
        out.append(d)
    return out


@app.post("/api/repairs", response_model=schemas.RepairOut)
def create_repair(
    payload: schemas.RepairCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    elevator_id = payload.elevator_id
    if not elevator_id and payload.elevator_code:
        ev = db.scalar(select(models.Elevator).where(models.Elevator.code == payload.elevator_code))
        if not ev:
            raise HTTPException(404, "电梯不存在")
        elevator_id = ev.id
    if not elevator_id:
        raise HTTPException(400, "必须指定电梯")
    ev = get_active_elevator(db, elevator_id)
    ensure_not_archived(ev)
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
    if ev.status != "停用":
        ev.status = "故障"
    db.add(order)
    db.commit()
    db.refresh(order)
    order.elevator = ev
    return order


@app.put("/api/repairs/{order_id}", response_model=schemas.RepairOut)
def update_repair(
    order_id: int,
    payload: schemas.RepairUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    order = db.get(models.RepairOrder, order_id)
    if not order:
        raise HTTPException(404, "工单不存在")
    ev = db.get(models.Elevator, order.elevator_id)
    if ev.is_archived and payload.status != "已完成":
        raise HTTPException(400, "设备已归档，不能继续流转工单")

    old_status = order.status
    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("status")

    if new_status == "维修中" and old_status != "维修中":
        order.arrive_time = datetime.now()
    if new_status == "已完成" and old_status != "已完成":
        order.finish_time = datetime.now()

    for k, v in data.items():
        setattr(order, k, v)

    if new_status in ("已完成", "已派单", "维修中"):
        # 停用/归档梯不自动恢复运行
        if ev.status not in ("停用",) and not ev.is_archived:
            ev.status = "正常" if new_status == "已完成" else "故障"

    db.commit()
    db.refresh(order)
    return order


# ---------------- 年检（登记仅管理员；提醒对全部登录用户可见） ----------------
@app.get("/api/inspections", response_model=list[schemas.InspectionOut])
def list_inspections(
    include_archived: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if include_archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足")
    today = date.today()
    stmt = (
        select(models.Inspection)
        .options(selectinload(models.Inspection.elevator))
        .order_by(models.Inspection.next_date)
    )
    if not include_archived:
        stmt = stmt.join(models.Elevator).where(models.Elevator.is_archived == 0)
    rows = db.scalars(stmt).all()
    out = []
    for r in rows:
        d = schemas.InspectionOut.model_validate(r)
        d.days_left = (r.next_date - today).days
        out.append(d)
    return out


@app.get("/api/inspections/expiring")
def expiring_inspections(
    days: int = WARN_DAYS,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """年检到期提醒：返回已过期 + N 天内到期的在用电梯。"""
    today = date.today()
    deadline = today + timedelta(days=days)
    elevators = db.scalars(
        select(models.Elevator)
        .where(models.Elevator.is_archived == 0)
        .options(selectinload(models.Elevator.inspections))
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
def create_inspection(
    payload: schemas.InspectionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    ev = get_active_elevator(db, payload.elevator_id)
    ensure_not_archived(ev)
    insp = models.Inspection(**payload.model_dump())
    db.add(insp)
    # 同步档案：最近年检日期 + 以两次检验间隔校准检验周期，
    # 保证列表/提醒与年检记录上的“下次检验日期”口径一致
    ev.last_inspect_date = payload.inspect_date
    interval = (payload.next_date - payload.inspect_date).days
    if interval > 0:
        ev.inspect_cycle_days = interval
    db.commit()
    db.refresh(insp)
    return insp


@app.get("/api/elevators/{elevator_id}/inspections", response_model=list[schemas.InspectionOut])
def elevator_inspections(
    elevator_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ev = db.get(models.Elevator, elevator_id)
    if ev and ev.is_archived and user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足：归档设备历史仅管理员可查看")
    return db.scalars(
        select(models.Inspection)
        .where(models.Inspection.elevator_id == elevator_id)
        .order_by(models.Inspection.inspect_date.desc())
    ).all()
