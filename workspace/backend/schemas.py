"""Pydantic 模式（请求/响应）。"""
from datetime import date, datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- 电梯 ----------
class ElevatorBase(BaseModel):
    code: str
    reg_code: Optional[str] = None
    address: str
    location_detail: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    type: Optional[str] = "客梯"
    floors: Optional[int] = 18
    install_date: Optional[date] = None
    use_date: Optional[date] = None
    last_inspect_date: Optional[date] = None
    inspect_cycle_days: Optional[int] = 365
    status: Optional[str] = "正常"
    property_company: Optional[str] = None
    maintenance_company: Optional[str] = None
    load_kg: Optional[int] = 1000
    speed: Optional[float] = 1.75
    remark: Optional[str] = ""


class ElevatorCreate(ElevatorBase):
    pass


class ElevatorUpdate(BaseModel):
    reg_code: Optional[str] = None
    address: Optional[str] = None
    location_detail: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    type: Optional[str] = None
    floors: Optional[int] = None
    install_date: Optional[date] = None
    use_date: Optional[date] = None
    last_inspect_date: Optional[date] = None
    inspect_cycle_days: Optional[int] = None
    status: Optional[str] = None
    property_company: Optional[str] = None
    maintenance_company: Optional[str] = None
    load_kg: Optional[int] = None
    speed: Optional[float] = None
    remark: Optional[str] = None


class ElevatorOut(ORMModel):
    id: int
    code: str
    reg_code: Optional[str]
    address: str
    location_detail: Optional[str]
    brand: Optional[str]
    model: Optional[str]
    type: Optional[str]
    floors: Optional[int]
    install_date: Optional[date]
    use_date: Optional[date]
    last_inspect_date: Optional[date]
    inspect_cycle_days: Optional[int]
    status: Optional[str]
    property_company: Optional[str]
    maintenance_company: Optional[str]
    load_kg: Optional[int]
    speed: Optional[float]
    remark: Optional[str]
    # 动态计算字段
    next_inspect_date: Optional[date] = None
    inspect_days_left: Optional[int] = None
    inspect_status: Optional[str] = None
    next_plan_date: Optional[date] = None
    plan_days_left: Optional[int] = None


# ---------- 人员 ----------
class WorkerOut(ORMModel):
    id: int
    name: str
    phone: Optional[str]
    cert_no: Optional[str]
    team: Optional[str]
    role: Optional[str]


class WorkerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    cert_no: Optional[str] = None
    team: Optional[str] = None
    role: Optional[str] = "维保员"


# ---------- 维保计划 ----------
class PlanOut(ORMModel):
    id: int
    elevator_id: int
    cycle: str
    next_date: date
    end_date: Optional[date]
    assignee_id: Optional[int]
    active: Optional[int]
    remark: Optional[str]
    days_left: Optional[int] = None
    overdue: Optional[bool] = None
    elevator: Optional[ElevatorOut] = None


class PlanCreate(BaseModel):
    elevator_id: int
    cycle: str = "半月"
    next_date: date
    end_date: Optional[date] = None
    assignee_id: Optional[int] = None
    remark: Optional[str] = ""


# ---------- 保养记录 ----------
class CheckInCreate(BaseModel):
    elevator_code: str
    worker_id: int
    lat: Optional[float] = None
    lng: Optional[float] = None


class MaintenanceItem(BaseModel):
    name: str
    result: str = "正常"   # 正常/异常
    note: str = ""


class RecordComplete(BaseModel):
    kind: Optional[str] = "半月"
    items: list[MaintenanceItem] = []
    result: str = "正常"
    abnormal_desc: Optional[str] = ""
    signature: Optional[str] = ""


class RecordOut(ORMModel):
    id: int
    elevator_id: int
    worker_id: Optional[int]
    plan_id: Optional[int]
    kind: Optional[str]
    check_in_time: datetime
    check_in_lat: Optional[float]
    check_in_lng: Optional[float]
    check_in_addr: Optional[str]
    finish_time: Optional[datetime]
    items: Optional[Any]
    result: Optional[str]
    abnormal_desc: Optional[str]
    signature: Optional[str]
    elevator: Optional[ElevatorOut] = None
    worker: Optional[WorkerOut] = None


# ---------- 急修工单 ----------
class RepairCreate(BaseModel):
    elevator_code: Optional[str] = None
    elevator_id: Optional[int] = None
    reporter: Optional[str] = None
    reporter_phone: Optional[str] = None
    fault_desc: str
    fault_type: str = "其他"
    level: str = "一般"


class RepairUpdate(BaseModel):
    status: Optional[str] = None
    worker_id: Optional[int] = None
    solution: Optional[str] = None
    parts: Optional[list] = None
    cost: Optional[float] = None


class RepairOut(ORMModel):
    id: int
    order_no: str
    elevator_id: int
    reporter: Optional[str]
    reporter_phone: Optional[str]
    report_time: datetime
    fault_desc: Optional[str]
    fault_type: Optional[str]
    level: Optional[str]
    status: Optional[str]
    worker_id: Optional[int]
    arrive_time: Optional[datetime]
    finish_time: Optional[datetime]
    solution: Optional[str]
    parts: Optional[Any]
    cost: Optional[float]
    elevator: Optional[ElevatorOut] = None
    worker: Optional[WorkerOut] = None
    response_minutes: Optional[float] = None


# ---------- 年检 ----------
class InspectionCreate(BaseModel):
    elevator_id: int
    inspect_date: date
    next_date: date
    org: Optional[str] = None
    result: str = "合格"
    certificate_no: Optional[str] = None
    remark: Optional[str] = ""


class InspectionOut(ORMModel):
    id: int
    elevator_id: int
    inspect_date: date
    next_date: date
    org: Optional[str]
    result: Optional[str]
    certificate_no: Optional[str]
    remark: Optional[str]
    elevator: Optional[ElevatorOut] = None
    days_left: Optional[int] = None
