import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, List, Tag, Button, Alert } from 'antd'
import {
  ApartmentOutlined, CheckCircleOutlined, ToolOutlined,
  SafetyCertificateOutlined, ClockCircleOutlined, AlertOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { getDashboard, getExpiring, getPlans, getRepairs } from '../api.js'
import { daysLeftText } from '../components/tags.jsx'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [expiring, setExpiring] = useState([])
  const [plans, setPlans] = useState([])
  const [repairs, setRepairs] = useState([])
  const navigate = useNavigate()

  const load = () => {
    getDashboard().then(setData)
    getExpiring(30).then(setExpiring)
    getPlans('active').then(setPlans)
    getRepairs().then(setRepairs)
  }
  useEffect(() => { load() }, [])

  if (!data) return null

  const overduePlans = plans.filter(p => p.overdue)
  const openRepairs = repairs.filter(r => ['待接单', '已派单', '维修中'].includes(r.status))

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="电梯总数" value={data.elevator_total} prefix={<ApartmentOutlined />} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="正常运行" value={data.elevator_normal} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="故障中" value={data.elevator_fault} valueStyle={{ color: '#ff4d4f' }} prefix={<ToolOutlined />} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="未完成急修" value={data.repair_open} valueStyle={{ color: data.repair_open ? '#ff4d4f' : undefined }} prefix={<AlertOutlined />} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="年检30天内到期" value={data.inspect_soon} valueStyle={{ color: '#fa8c16' }} prefix={<SafetyCertificateOutlined />} suffix={`台 / 过期${data.inspect_overdue}`} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="本月保养次数" value={data.month_records} prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card className="stat-card"><Statistic title="已归档设备" value={data.archived_total || 0} valueStyle={{ color: '#8c8c8c' }} prefix={<InboxOutlined />} /></Card>
        </Col>
      </Row>

      {(data.inspect_overdue > 0 || data.repair_urgent > 0 || overduePlans.length > 0) && (
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message="存在需要立即处理的事项"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.inspect_overdue > 0 && <li>{data.inspect_overdue} 台电梯年检已过期，请尽快安排报检</li>}
              {data.repair_urgent > 0 && <li>{data.repair_urgent} 单紧急故障正在处理中</li>}
              {overduePlans.length > 0 && <li>{overduePlans.length} 项半月维保计划已逾期未执行</li>}
            </ul>
          }
        />
      )}

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="近 7 天保养签到趋势" extra={<Button type="link" onClick={() => navigate('/records')}>保养记录</Button>}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="签到次数" fill="#1677ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="年检到期提醒（30天内）" style={{ marginBottom: 16 }}
            extra={<Button type="link" onClick={() => navigate('/inspection')}>全部</Button>}>
            <List size="small" dataSource={expiring.slice(0, 5)}
              renderItem={(it) => (
                <List.Item
                  actions={[<Button key="go" size="small" type="link" onClick={() => navigate(`/elevators/${it.elevator.id}`)}>查看</Button>]}
                >
                  <List.Item.Meta
                    title={<span>{it.elevator.code} <Tag color={it.inspect_status === '已过期' ? 'red' : 'orange'} style={{ marginLeft: 4 }}>{it.inspect_status}</Tag></span>}
                    description={`${it.elevator.address} ${it.elevator.location_detail || ''}`}
                  />
                  <span>{daysLeftText(it.days_left)}</span>
                </List.Item>
              )}
            />
          </Card>
          <Card title="待处理急修工单" extra={<Button type="link" onClick={() => navigate('/repairs')}>全部</Button>}>
            <List size="small" dataSource={openRepairs.slice(0, 5)}
              renderItem={(o) => (
                <List.Item
                  actions={[<Button key="go" size="small" type="link" onClick={() => navigate('/repairs')}>处理</Button>]}
                >
                  <List.Item.Meta
                    title={<span>{o.order_no} {o.level === '紧急' && <Tag color="red">紧急</Tag>}</span>}
                    description={`${o.elevator.code} · ${o.fault_desc}`}
                  />
                  <Tag color={o.status === '待接单' ? 'red' : o.status === '维修中' ? 'blue' : 'orange'}>{o.status}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
