# 电梯维保管理系统

电梯档案与维保计划管理，支持 **扫码签到、保养记录、故障急修工单、年检到期提醒**。

技术栈：React 18 + Vite + Ant Design 5 ｜ FastAPI + SQLAlchemy 2 ｜ PostgreSQL（默认零配置 SQLite，可一键切换）。

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 登录鉴权 | 账号登录（HMAC 令牌），管理员 / 维保员两种角色；未登录只能看到登录页 |
| 工作台 | 设备/工单/年检统计卡片、近 7 天保养趋势、到期与急修待办（只统计在用设备） |
| 电梯档案 | 档案查询、按编号/地址/状态搜索、每台设备专属二维码（PNG 动态生成）；新增/编辑仅管理员 |
| 归档库 | **报废/移交/退场**仅管理员可执行，不删除任何数据；归档设备可按编号查询、查看完整历史并恢复（仅管理员菜单可见） |
| 扫码签到 | 维保员以本人身份扫码 → GPS 定位签到 → 勾选 12 项半月保项目 → 电子签名；不可代签；换人扫码需确认接手 |
| 保养记录 | 签到/完成时间、项目清单、异常描述；异常自动生成急修工单；完成后维保计划自动顺延 15 天 |
| 维保计划 | 半月/季度/半年/年度计划，逾期红色高亮；新增、停用/启用仅管理员 |
| 故障急修 | 报修登记 → 派单 → 到达（自动记录响应时长）→ 维修完成（措施/配件/费用）；两种角色均可流转 |
| 年检提醒 | 自动计算下次检验日期与剩余天数，过期/30/90 天预警；**年检登记仅管理员**，登记后档案自动同步 |

## 角色与权限

| 操作 | 管理员（admin） | 维保员（worker1~6） |
| --- | :---: | :---: |
| 查看档案 / 计划 / 记录 / 提醒 | ✔ | ✔ |
| 扫码签到、保养、报修、工单流转 | ✔（可代选人员） | ✔（仅本人，禁止代签） |
| 新增 / 编辑电梯档案 | ✔ | ✗ 403 |
| 归档（报废/移交/退场）与恢复 | ✔ | ✗ 403 |
| 新增/停用维保计划、登记年检 | ✔ | ✗ 403 |
| 物理删除设备及历史 | ✗（接口已禁用） | ✗ |

归档前置校验：存在未完成急修工单或进行中保养时不允许归档；归档后设备退出日常列表与统计、
计划自动停用、禁止扫码/报修/工单流转，但保养记录、工单、年检**永久保留**；
恢复后设备为"停用"状态，需管理员检查后手动启用并重新排期计划。

## 本地模拟数据

执行 seed 后内置：13 台电梯（12 台在用，覆盖正常/保养中/故障/停用、年检正常/即将到期/已过期；
另含 1 台"退场"归档设备 DT-20230013，带完整保养/工单/年检历史）、
6 名持证维保人员、7 个登录账号、12 条维保计划、历史保养记录、急修工单（含待接单/维修中/已完成）、年检记录。

登录账号：

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| admin | admin123 | 管理员 |
| worker1 ~ worker6 | 123456 | 维保员（分别绑定 6 名维保人员） |

## 快速启动

### 1. 后端（FastAPI，端口 8000）

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 seed.py                       # 生成模拟数据（已存在数据时跳过）
python3 -m uvicorn main:app --reload
```

- API 文档：http://127.0.0.1:8000/docs
- 默认数据库：`backend/elevator.db`（SQLite）

### 2. 前端（Vite，端口 5173）

```bash
cd frontend
npm install
npm run dev
```

打开 http://127.0.0.1:5173 （Vite 已配置 `/api` 代理到 8000 端口）。

## 切换到 PostgreSQL

只需设置环境变量，无需改代码（驱动为 psycopg2）：

```bash
createdb elevator
export DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/elevator"
python3 seed.py
python3 -m uvicorn main:app --reload
```

## 端到端冒烟测试

后端启动后执行，覆盖：扫码签到 → 异常保养 → 自动开工单 → 工单流转 → 年检登记：

```bash
cd backend
python3 e2e_test.py
```

## 目录结构

```
backend/
  main.py          # FastAPI 路由（登录鉴权/档案/归档/计划/签到/保养/急修/年检/统计/二维码）
  auth.py          # 密码哈希、签名令牌、角色依赖（管理员/维保员）
  models.py        # SQLAlchemy 模型
  schemas.py       # Pydantic 校验
  services.py      # 年检/维保到期计算
  seed.py          # 本地模拟数据（含账号与归档样例）
  e2e_test.py      # 端到端冒烟测试（12 组，含权限与归档恢复）
frontend/
  src/auth.jsx     # 登录态 Context / 路由守卫
  src/pages/       # Login / Dashboard / Elevators / ArchivedElevators / ElevatorDetail
                   # ScanCheckIn / Plans / Records / Repairs / InspectionRemind
  src/api.js       # 接口封装（自动附带令牌、401 跳登录）
```
