import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Descriptions, Tabs, Table, Button, Tag, Space, Statistic, Row, Col, Image, Alert,
} from 'antd'
import { ArrowLeftOutlined, QrcodeOutlined, EditOutlined, RollbackOutlined } from '@ant-design/icons'
import {
  getElevator, getRecords, getRepairs, getElevatorInspections, qrUrl, restoreElevator,
} from '../api.js'
import { ElevatorStatusTag, InspectTag, RepairStatusTag, daysLeftText, fmtDate, fmtDateTime } from '../components/tags.jsx'
import { useAuth } from '../auth.jsx'
import { message } from 'antd'

export default function ElevatorDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [ev, setEv] = useState(null)
  const [records, setRecords] = useState([])
  const [repairs, setRepairs] = useState([])
  const [inspections, setInspections] = useState([])

  const reload = () => {
    getElevator(id).then(setEv)
    getRecords({ elevator_id: id, limit: 50, include_archived: 1 }).then(setRecords)
    getRepairs({ include_archived: 1 }).then(rs => setRepairs(rs.filter(r => r.elevator_id === Number(id))))
    getElevatorInspections(id).then(setInspections)
  }
  useEffect(reload, [id])

  const doRestore = async () => {
    await restoreElevator(id)
    message.success('设备已恢复（停用状态），检查确认后可手动启用')
    reload()
  }

  if (!ev) return null
  const archived = !!ev.is_archived

  return (
    <div>
      {archived && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message={<Space wrap>
            <Tag color="red">{ev.archive_type}归档</Tag>
            <span>该设备已于 {fmtDate(ev.archive_date)} 归档，经办人：{ev.archive_operator}，已退出日常维保与统计</span>
          </Space>}
          description={ev.archive_reason}
          action={isAdmin && <Button danger icon={<RollbackOutlined />} onClick={doRestore}>恢复设备</Button>}
        />
      )}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(archived && isAdmin ? '/archived' : '/elevators')}>
          返回{archived ? '归档库' : '列表'}
        </Button>
        <span className="page-title" style={{ margin: 0 }}>{ev.code}</span>
        {!archived && <>
          <ElevatorStatusTag status={ev.status} />
          <InspectTag status={ev.inspect_status} />
        </>}
        {isAdmin && !archived && (
          <Button icon={<EditOutlined />} onClick={() => navigate('/elevators')}>在列表中编辑/归档</Button>
        )}
      </Space>

      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card style={{ marginBottom: 16, textAlign: 'center' }}>
            <Image src={qrUrl(ev.code)} width={170} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 6 }} />
            <div style={{ color: '#999', marginTop: 8 }}><QrcodeOutlined /> 设备扫码码</div>
          </Card>
          <Card>
            <Statistic title="距下次年检" value={ev.inspect_days_left ?? '—'}
              suffix={ev.inspect_days_left !== null ? '天' : ''}
              valueStyle={{ color: ev.inspect_days_left < 0 ? '#ff4d4f' : ev.inspect_days_left <= 30 ? '#fa8c16' : '#52c41a' }} />
            <Statistic style={{ marginTop: 12 }} title="距下次维保" value={ev.plan_days_left ?? '—'}
              suffix={ev.plan_days_left !== null ? '天' : ''}
              valueStyle={{ color: ev.plan_days_left < 0 ? '#ff4d4f' : ev.plan_days_left <= 7 ? '#fa8c16' : '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, md: 3 }} bordered size="small">
              <Descriptions.Item label="使用登记证号">{ev.reg_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="安装地址" span={2}>{ev.address}</Descriptions.Item>
              <Descriptions.Item label="详细位置">{ev.location_detail || '—'}</Descriptions.Item>
              <Descriptions.Item label="品牌">{ev.brand}</Descriptions.Item>
              <Descriptions.Item label="型号">{ev.model}</Descriptions.Item>
              <Descriptions.Item label="类型">{ev.type}</Descriptions.Item>
              <Descriptions.Item label="层站数">{ev.floors}</Descriptions.Item>
              <Descriptions.Item label="载重 / 速度">{ev.load_kg}kg / {ev.speed}m/s</Descriptions.Item>
              <Descriptions.Item label="安装日期">{fmtDate(ev.install_date)}</Descriptions.Item>
              <Descriptions.Item label="投用日期">{fmtDate(ev.use_date)}</Descriptions.Item>
              <Descriptions.Item label="最近年检">{fmtDate(ev.last_inspect_date)}</Descriptions.Item>
              <Descriptions.Item label="下次年检">{fmtDate(ev.next_inspect_date)}</Descriptions.Item>
              <Descriptions.Item label="使用单位">{ev.property_company || '—'}</Descriptions.Item>
              <Descriptions.Item label="维保单位">{ev.maintenance_company || '—'}</Descriptions.Item>
              <Descriptions.Item label="下次维保" span={3}>
                {ev.next_plan_date ? `${fmtDate(ev.next_plan_date)}（${daysLeftText(ev.plan_days_left)}）` : '暂无生效计划'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={3}>{ev.remark || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card>
            <Tabs
              items={[
                {
                  key: 'records', label: `保养记录 (${records.length})`,
                  children: (
                    <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={records}
                      columns={[
                        { title: '签到时间', dataIndex: 'check_in_time', render: fmtDateTime, width: 160 },
                        { title: '维保人', render: (_, r) => r.worker?.name || '—', width: 90 },
                        { title: '类型', dataIndex: 'kind', width: 80, render: v => <Tag>{v}保</Tag> },
                        {
                          title: '结果', dataIndex: 'result', width: 90,
                          render: (v) => <Tag color={v === '正常' ? 'green' : v === '进行中' ? 'blue' : 'red'}>{v}</Tag>,
                        },
                        { title: '说明', dataIndex: 'abnormal_desc', render: (v) => v || '—' },
                      ]} />
                  ),
                },
                {
                  key: 'repairs', label: `急修工单 (${repairs.length})`,
                  children: (
                    <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={repairs}
                      columns={[
                        { title: '工单号', dataIndex: 'order_no', width: 170 },
                        { title: '报修时间', dataIndex: 'report_time', render: fmtDateTime, width: 160 },
                        { title: '故障', dataIndex: 'fault_desc' },
                        { title: '等级', dataIndex: 'level', width: 70, render: v => <Tag color={v === '紧急' ? 'red' : 'default'}>{v}</Tag> },
                        { title: '状态', dataIndex: 'status', width: 90, render: v => <RepairStatusTag status={v} /> },
                      ]} />
                  ),
                },
                {
                  key: 'inspections', label: `年检记录 (${inspections.length})`,
                  children: (
                    <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={inspections}
                      columns={[
                        { title: '检验日期', dataIndex: 'inspect_date', render: fmtDate, width: 120 },
                        { title: '下次检验', dataIndex: 'next_date', render: fmtDate, width: 120 },
                        { title: '检验机构', dataIndex: 'org' },
                        { title: '合格证号', dataIndex: 'certificate_no' },
                        { title: '结论', dataIndex: 'result', width: 100, render: v => <Tag color={v === '合格' || v === '复检合格' ? 'green' : 'red'}>{v}</Tag> },
                      ]} />
                  ),
                },
              ]} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
