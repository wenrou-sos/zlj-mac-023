"""SQLAlchemy 数据模型。"""
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Float, Text, ForeignKey, JSON
)
from sqlalchemy.orm import relationship

from database import Base


class Elevator(Base):
    """电梯档案"""
    __tablename__ = "elevators"

    id = Column(Integer, primary_key=True)
    code = Column(String(32), unique=True, nullable=False, index=True)  # 设备编号（扫码码值）
    reg_code = Column(String(32), unique=True)          # 特种设备使用登记证编号
    address = Column(String(200), nullable=False)       # 小区/楼宇地址
    location_detail = Column(String(200))               # 详细位置（栋/单元）
    brand = Column(String(50))                          # 品牌
    model = Column(String(50))                          # 型号
    type = Column(String(20), default="客梯")           # 客梯/货梯/扶梯
    floors = Column(Integer, default=18)                # 层站数
    install_date = Column(Date)                         # 安装日期
    use_date = Column(Date)                             # 投用日期
    last_inspect_date = Column(Date)                    # 最近一次年检日期
    inspect_cycle_days = Column(Integer, default=365)   # 检验周期
    status = Column(String(20), default="正常")         # 正常/保养中/故障/停用
    property_company = Column(String(100))              # 使用单位（物业）
    maintenance_company = Column(String(100))           # 维保单位
    load_kg = Column(Integer, default=1000)             # 额定载重
    speed = Column(Float, default=1.75)                 # 额定速度 m/s
    remark = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.now)

    plans = relationship("MaintenancePlan", back_populates="elevator", cascade="all, delete-orphan")
    records = relationship("MaintenanceRecord", back_populates="elevator", cascade="all, delete-orphan")
    repairs = relationship("RepairOrder", back_populates="elevator", cascade="all, delete-orphan")
    inspections = relationship("Inspection", back_populates="elevator", cascade="all, delete-orphan")


class Worker(Base):
    """维保人员"""
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    phone = Column(String(20))
    cert_no = Column(String(50))                         # 作业人员证编号
    team = Column(String(50))                            # 班组
    role = Column(String(20), default="维保员")          # 维保员/安全员

    records = relationship("MaintenanceRecord", back_populates="worker")
    repairs = relationship("RepairOrder", back_populates="worker")


class MaintenancePlan(Base):
    """维保计划（每台电梯按周期生成/维护）"""
    __tablename__ = "maintenance_plans"

    id = Column(Integer, primary_key=True)
    elevator_id = Column(Integer, ForeignKey("elevators.id"), nullable=False)
    cycle = Column(String(10), default="半月")           # 半月/季度/半年/年度
    next_date = Column(Date, nullable=False)             # 下次维保日期
    end_date = Column(Date)                              # 计划截止
    assignee_id = Column(Integer, ForeignKey("workers.id"))
    active = Column(Integer, default=1)
    remark = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.now)

    elevator = relationship("Elevator", back_populates="plans")


class MaintenanceRecord(Base):
    """保养记录（扫码签到 + 保养项 + 自查）"""
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True)
    elevator_id = Column(Integer, ForeignKey("elevators.id"), nullable=False)
    worker_id = Column(Integer, ForeignKey("workers.id"))
    plan_id = Column(Integer, ForeignKey("maintenance_plans.id"), nullable=True)
    kind = Column(String(10), default="半月")            # 保养类型
    check_in_time = Column(DateTime, nullable=False)     # 签到时间
    check_in_lat = Column(Float)
    check_in_lng = Column(Float)
    check_in_addr = Column(String(200), default="现场扫码签到")
    finish_time = Column(DateTime)                       # 完成时间
    items = Column(JSON, default=list)                   # 保养项目清单 [{name, result, note}]
    result = Column(String(20), default="正常")          # 正常/异常
    abnormal_desc = Column(Text, default="")
    signature = Column(String(50), default="")           # 维保人员签名（文字）
    created_at = Column(DateTime, default=datetime.now)

    elevator = relationship("Elevator", back_populates="records")
    worker = relationship("Worker", back_populates="records")


class RepairOrder(Base):
    """故障急修工单"""
    __tablename__ = "repair_orders"

    id = Column(Integer, primary_key=True)
    order_no = Column(String(32), unique=True, index=True)
    elevator_id = Column(Integer, ForeignKey("elevators.id"), nullable=False)
    reporter = Column(String(50))                        # 报修人
    reporter_phone = Column(String(20))
    report_time = Column(DateTime, nullable=False)
    fault_desc = Column(Text, nullable=False)
    fault_type = Column(String(30), default="其他")      # 门系统/曳引系统/轿厢/其他
    level = Column(String(10), default="一般")           # 一般/紧急
    status = Column(String(20), default="待接单")        # 待接单/已派单/维修中/已完成
    worker_id = Column(Integer, ForeignKey("workers.id"))
    arrive_time = Column(DateTime)                       # 到达时间
    finish_time = Column(DateTime)
    solution = Column(Text, default="")                  # 处置措施
    parts = Column(JSON, default=list)                   # 更换配件
    cost = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.now)

    elevator = relationship("Elevator", back_populates="repairs")
    worker = relationship("Worker", back_populates="repairs")


class Inspection(Base):
    """年检记录"""
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True)
    elevator_id = Column(Integer, ForeignKey("elevators.id"), nullable=False)
    inspect_date = Column(Date, nullable=False)          # 检验日期
    next_date = Column(Date, nullable=False)             # 下次检验日期
    org = Column(String(100))                            # 检验机构
    result = Column(String(20), default="合格")          # 合格/复检合格/不合格
    certificate_no = Column(String(50))                  # 检验合格证号
    remark = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.now)

    elevator = relationship("Elevator", back_populates="inspections")
