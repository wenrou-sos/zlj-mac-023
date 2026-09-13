import { Tag } from 'antd'

export const STATUS_COLOR = {
  '正常': 'green',
  '保养中': 'blue',
  '故障': 'red',
  '停用': 'default',
}

const INSPECT_COLOR = {
  '正常': 'green',
  '即将到期': 'orange',
  '已过期': 'red',
  '未建档': 'default',
}

const REPAIR_COLOR = {
  '待接单': 'red',
  '已派单': 'orange',
  '维修中': 'blue',
  '已完成': 'green',
}

export function ElevatorStatusTag({ status }) {
  return <Tag color={STATUS_COLOR[status] || 'default'}>{status}</Tag>
}

export function InspectTag({ status }) {
  return <Tag color={INSPECT_COLOR[status] || 'default'}>{status}</Tag>
}

export function RepairStatusTag({ status }) {
  return <Tag color={REPAIR_COLOR[status] || 'default'}>{status}</Tag>
}

export function daysLeftText(days) {
  if (days === null || days === undefined) return '—'
  if (days < 0) return <span style={{ color: '#ff4d4f' }}>已逾期 {-days} 天</span>
  if (days === 0) return <span style={{ color: '#fa8c16' }}>今天到期</span>
  if (days <= 7) return <span style={{ color: '#fa8c16' }}>剩 {days} 天</span>
  return <span style={{ color: '#52c41a' }}>剩 {days} 天</span>
}

export function fmtDateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtDate(v) {
  if (!v) return '—'
  return String(v).slice(0, 10)
}
