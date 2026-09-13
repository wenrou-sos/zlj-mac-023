"""保养项目清单模板：按 电梯类型 × 维保周期 取对应模板。

- 模板项全部为必检项（required=True），签到时整体快照存入保养记录，
  之后模板调整只影响新的签到，不改变历史记录。
- 自定义补充项不在模板内，提交时标记 custom=True。
"""

# 曳引式电梯（客梯/货梯）半月保基础项目
LIFT_HALF_MONTH = [
    "机房曳引机运行及油位检查",
    "控制柜元器件及接线检查",
    "制动器动作及间隙检查",
    "层门、轿门门锁啮合检查",
    "光幕/安全触板有效性检查",
    "限速器外观及转动检查",
    "井道导轨润滑及支架紧固",
    "轿厢与应急照明检查",
    "五方通话及报警装置测试",
    "平层精度及运行舒适感检查",
    "底坑清洁及缓冲器检查",
    "门机皮带、地坎滑槽检查",
]

LIFT_QUARTER = [
    "导靴磨损量与间隙测量",
    "曳引钢丝绳张力与断丝磨损检查",
    "平层感应装置清洁与位置检查",
]

LIFT_HALF_YEAR = [
    "限速器电气安全开关动作试验",
    "安全钳传动机构检查与润滑",
    "液压缓冲器复位与油位检查",
    "电气绝缘电阻抽测",
    "层门自闭装置与门球间隙全面调整",
]

LIFT_YEAR = [
    "限速器动作速度校验",
    "安全钳-限速器联动试验",
    "空载/额定载荷平层精度试验",
    "接地电阻测试",
    "制动器制动力矩复测与调整",
    "上行超速保护/UCMP 功能试验",
]

# 货梯在客梯基础上增加的项目（并入半月保，之后各周期同样包含）
GOODS_EXTRA = [
    "超载报警及称重装置校验",
    "轿厢护脚板、地坎载货强度检查",
]

# 自动扶梯/自动人行道
ESCALATOR_HALF_MONTH = [
    "驱动主机运行及油位检查",
    "控制柜接线与元器件检查",
    "工作制动器动作及间隙检查",
    "附加制动器外观检查",
    "扶手带运行速度与张紧度检查",
    "扶手带入口保护开关试验",
    "梳齿板完整性与啮合深度检查",
    "梯级运行与缺级/下陷保护检查",
    "围裙板间隙及防夹刷检查",
    "梯级链润滑与张紧度检查",
    "急停开关与检修控制检查",
    "照明、报警与停止按钮检查",
]

ESCALATOR_QUARTER = [
    "驱动链磨损与张紧检查",
    "主轴及扶手带驱动轴固定检查",
    "超速保护开关动作试验",
    "梳齿板安全开关试验",
]

ESCALATOR_HALF_YEAR = [
    "附加制动器动作试验",
    "梯级链伸长量测量",
    "围裙板安全开关试验",
    "电气绝缘电阻抽测",
]

ESCALATOR_YEAR = [
    "超速保护装置校验",
    "空载制动距离测试",
    "接地电阻测试",
    "梯级与导轨全面磨损检查",
    "扶手带强度及摩擦力检查",
    "防逆转保护功能试验",
]

CYCLES = ["半月", "季度", "半年", "年度"]


def _items(names):
    return [{"name": n, "required": True, "custom": False} for n in names]


# 周期越长，包含此前各周期的全部项目
_LIFT_TABLE = {
    "半月": LIFT_HALF_MONTH,
    "季度": LIFT_HALF_MONTH + LIFT_QUARTER,
    "半年": LIFT_HALF_MONTH + LIFT_QUARTER + LIFT_HALF_YEAR,
    "年度": LIFT_HALF_MONTH + LIFT_QUARTER + LIFT_HALF_YEAR + LIFT_YEAR,
}

_ESCALATOR_TABLE = {
    "半月": ESCALATOR_HALF_MONTH,
    "季度": ESCALATOR_HALF_MONTH + ESCALATOR_QUARTER,
    "半年": ESCALATOR_HALF_MONTH + ESCALATOR_QUARTER + ESCALATOR_HALF_YEAR,
    "年度": ESCALATOR_HALF_MONTH + ESCALATOR_QUARTER + ESCALATOR_HALF_YEAR + ESCALATOR_YEAR,
}


def get_checklist(elevator_type: str | None, cycle: str | None) -> list[dict]:
    """返回某类型电梯某周期的必检项目模板（深拷贝由调用方自行注意：只读使用）。"""
    cycle = cycle if cycle in CYCLES else "半月"
    if elevator_type in ("扶梯", "自动扶梯", "自动人行道"):
        return _items(_ESCALATOR_TABLE[cycle])
    names = list(_LIFT_TABLE[cycle])
    if elevator_type == "货梯":
        # 货梯专属项插入到半月基础项之后
        names = LIFT_HALF_MONTH + GOODS_EXTRA + names[len(LIFT_HALF_MONTH):]
    return _items(names)
