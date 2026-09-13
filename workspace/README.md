# 电梯维保管理系统

电梯档案与维保计划管理，支持 **扫码签到、保养记录、故障急修工单、年检到期提醒**。

技术栈：React 18 + Vite + Ant Design 5 ｜ FastAPI + SQLAlchemy 2 ｜ PostgreSQL（默认零配置 SQLite，可一键切换）。

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 工作台 | 设备/工单/年检统计卡片、近 7 天保养趋势、到期与急修待办 |
| 电梯档案 | 档案增删改查、按编号/地址/状态搜索、每台设备专属二维码（PNG 动态生成） |
| 扫码签到 | 模拟扫码（或选择设备）→ GPS 定位签到 → 勾选 12 项半月保项目 → 电子签名提交 |
| 保养记录 | 签到/完成时间、项目清单、异常描述；异常自动生成急修工单；完成后维保计划自动顺延 15 天 |
| 维保计划 | 半月/季度/半年/年度计划，逾期红色高亮，可停用/启用 |
| 故障急修 | 报修登记 → 派单 → 到达（自动记录响应时长）→ 维修完成（措施/配件/费用） |
| 年检提醒 | 自动计算下次检验日期与剩余天数，过期/30/90 天预警，登记年检后档案自动同步 |

## 本地模拟数据

执行 seed 后内置：12 台电梯（覆盖正常/保养中/故障/停用、年检正常/即将到期/已过期）、
6 名持证维保人员、12 条维保计划、历史保养记录、6 张急修工单（含待接单/维修中/已完成）、年检记录。

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
  main.py          # FastAPI 路由（档案/计划/签到/保养/急修/年检/统计/二维码）
  models.py        # SQLAlchemy 模型
  schemas.py       # Pydantic 校验
  services.py      # 年检/维保到期计算
  seed.py          # 本地模拟数据
  e2e_test.py      # 端到端冒烟测试
frontend/
  src/pages/       # Dashboard / Elevators / ElevatorDetail / ScanCheckIn
                   # Plans / Records / Repairs / InspectionRemind
  src/api.js       # 接口封装
```
