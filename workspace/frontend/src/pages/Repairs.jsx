import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Select, DatePicker, Input,
  Segmented, message, Drawer, Descriptions, Timeline, Alert,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  getRepairs, createRepair, updateRepair, getElevators, getWorkers,
} from '../api.js'
import { RepairStatusTag, fmtDateTime } from '../components/tags.jsx'

export default function Repairs() {
  const [rows, setRows] = useState([])
  const [elevators, setElevators] = useState([])
  const [workers, setWorkers] = useState([])
  const [filter, setFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [current, setCurrent] = useState(null) // 处理抽屉
  const [form] = Form.useForm()
  const [procForm] = Form.useForm()
  const navigate = useNavigate()

  const load = () => {
    getRepairs(filter === 'all' ? null : filter).then(setRows)
  }
  useEffect(() => { load() }, [filter])
  useEffect(() => { getElevators().then(setElevators); getWorkers().then(setWorkers) }, [])

  const submitCreate = async () => {
    const v = await form.validateFields()
    try {
      await createRepair({
        elevator_id: v.elevator_id,
        reporter: v.reporter,
        reporter_phone: v.reporter_phone,
        fault_desc: v.fault_desc,
        fault_type: v.fault_type,
        level: v.level,
      })
      message.success('报修工单已创建')
      setCreateOpen(false); form.resetFields(); load()
    } catch (e) {
      message.error(e.userMessage || '保存失败')
    }
  }

  const openProcess = (o) => {
    setCurrent(o)
    procForm.setFieldsValue({
      worker_id: o.worker_id,
      solution: o.solution,
      cost: o.cost,
      parts_text: (o.parts || []).join('、'),
    })
  }

  // 状态流转：待接单 -> 已派单 -> 维修中 -> 已完成
  const advance = async (nextStatus) => {
    try {
      const v = await procForm.validateFields()
      const payload = {
        status: nextStatus,
        worker_id: v.worker_id,
        solution: v.solution,
        parts: v.parts_text ? v.parts_text.split(/[、,\s]+/).filter(Boolean) : [],
        cost: v.cost || 0,
      }
      await updateRepair(current.id, payload)
      message.success(`工单已更新为「${nextStatus}」`)
      const updated = await getRepairs()
      setRows(filter === 'all' ? updated : updated.filter(r => r.status === filter))
      setCurrent(updated.find(r => r.id === current.id))
    } catch (e) {
      if (e?.response) message.error(e.userMessage || '操作失败')
    }
  }

  const columns = [
    { title: '工单号', dataIndex: 'order_no', width: 170 },
    { title: '报修时间', dataIndex: 'report_time', width: 150, render: fmtDateTime, sorter: (a, b) => new Date(a.report_time) - new Date(b.report_time), defaultSortOrder: 'descend' },
    { title: '设备', dataIndex: ['elevator', 'code'], width: 120,
      render: (v, r) => <a onClick={() => navigate(`/elevators/${r.elevator_id}`)}>{v}</a> },
    { title: '位置', ellipsis: true, render: (_, r) => `${r.elevator?.address || ''} ${r.elevator?.location_detail || ''}` },
    { title: '故障类型', dataIndex: 'fault_type', width: 90, render: v => <Tag>{v}</Tag> },
    { title: '故障描述', dataIndex: 'fault_desc', ellipsis: true },
    { title: '等级', dataIndex: 'level', width: 70,
      render: v => <Tag color={v === '紧急' ? 'red' : 'default'}>{v}</Tag> },
    { title: '维保人', width: 90, render: (_, r) => r.worker?.name || '—' },
    { title: '状态', dataIndex: 'status', width: 90, render: v => <RepairStatusTag status={v} /> },
    {
      title: '操作', width: 90,
      render: (_, r) => <Button size="small" type="link" onClick={() => openProcess(r)}>
        {r.status === '已完成' ? '查看' : '处理'}
      </Button>,
    },
  ]

  const nextAction = { '待接单': '派单', '已派单': '出发/到达', '维修中': '完成维修' }
  const nextStatus = { '待接单': '已派单', '已派单': '维修中', '维修中': '已完成' }
  const urgentOpen = rows.filter(r => r.level === '紧急' && r.status !== '已完成').length

  return (
    <Card>
      <div className="toolbar">
        <Segmented options={[
          { label: '全部', value: 'all' },
          { label: '待接单', value: '待接单' },
          { label: '已派单', value: '已派单' },
          { label: '维修中', value: '维修中' },
          { label: '已完成', value: '已完成' },
        ]} value={filter} onChange={setFilter} />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <div className="spacer" />
        <Button type="primary" danger={urgentOpen > 0} icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          故障报修
        </Button>
      </div>

      {urgentOpen > 0 && filter !== '已完成' && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          message={`有 ${urgentOpen} 单紧急故障未完成，请立即派单处理（接报后 30 分钟内到达现场）`} />
      )}

      <Table rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1200 }}
        pagination={{ pageSize: 12, showTotal: t => `共 ${t} 单` }}
        rowClassName={(r) => r.level === '紧急' && r.status !== '已完成' ? 'urgent-row' : ''} />

      <Modal title="故障报修登记" open={createOpen} onOk={submitCreate} onCancel={() => setCreateOpen(false)}
        okText="提交报修" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          initialValues={{ fault_type: '门系统', level: '一般' }}>
          <Form.Item name="elevator_id" label="故障电梯" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择电梯"
              options={elevators.map(e => ({
                value: e.id, label: `${e.code} ｜ ${e.address} ${e.location_detail || ''}`,
              }))} />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="reporter" label="报修人"><Input style={{ width: 180 }} placeholder="物业/业主" /></Form.Item>
            <Form.Item name="reporter_phone" label="联系电话"><Input style={{ width: 190 }} /></Form.Item>
          </Space>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="fault_type" label="故障类型">
              <Select style={{ width: 180 }} options={['门系统', '曳引系统', '轿厢', '控制系统', '其他'].map(v => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="level" label="紧急程度">
              <Select style={{ width: 190 }} options={[{ value: '一般', label: '一般' }, { value: '紧急', label: '紧急（困人/停梯）' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="fault_desc" label="故障现象" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="如：电梯停在 3 楼不开门，轿厢内有乘客" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title={`急修工单 · ${current?.order_no || ''}`} width={580}
        open={!!current} onClose={() => setCurrent(null)}>
        {current && (
          <>
            <Space style={{ marginBottom: 16 }}>
              <RepairStatusTag status={current.status} />
              <Tag color={current.level === '紧急' ? 'red' : 'default'}>{current.level}</Tag>
              <Tag>{current.fault_type}</Tag>
            </Space>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="故障电梯">
                {current.elevator?.code} · {current.elevator?.address} {current.elevator?.location_detail}
              </Descriptions.Item>
              <Descriptions.Item label="故障现象">{current.fault_desc}</Descriptions.Item>
              <Descriptions.Item label="报修人">{current.reporter || '—'} {current.reporter_phone ? `（${current.reporter_phone}）` : ''}</Descriptions.Item>
              <Descriptions.Item label="报修时间">{fmtDateTime(current.report_time)}</Descriptions.Item>
              <Descriptions.Item label="到达时间">{fmtDateTime(current.arrive_time)}</Descriptions.Item>
              <Descriptions.Item label="响应时长">
                {current.response_minutes != null ? `${current.response_minutes} 分钟` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="完成时间">{fmtDateTime(current.finish_time)}</Descriptions.Item>
            </Descriptions>

            <Timeline style={{ marginTop: 20 }} items={[
              { color: 'blue', children: `报修登记 ${fmtDateTime(current.report_time)}` },
              { color: current.arrive_time ? 'green' : 'gray', children: current.arrive_time ? `维保人员到达现场 ${fmtDateTime(current.arrive_time)}` : '尚未到达现场' },
              { color: current.finish_time ? 'green' : 'gray', children: current.finish_time ? `维修完成 ${fmtDateTime(current.finish_time)}` : '维修未完成' },
            ]} />

            {current.status !== '已完成' ? (
              <Form form={procForm} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="worker_id" label="指派维保人员" rules={[{ required: true }]}>
                  <Select placeholder="选择维保人员"
                    options={workers.map(w => ({ value: w.id, label: `${w.name}（${w.team || w.role} ${w.phone}）` }))} />
                </Form.Item>
                {current.status === '维修中' && (
                  <>
                    <Form.Item name="solution" label="处置措施" rules={[{ required: true }]}>
                      <Input.TextArea rows={3} placeholder="故障原因分析及维修处理过程" />
                    </Form.Item>
                    <Form.Item name="parts_text" label="更换配件（顿号分隔）">
                      <Input placeholder="如：门锁触点x1、门滑块x2" />
                    </Form.Item>
                    <Form.Item name="cost" label="维修费用（元）"><Input type="number" min={0} style={{ width: 200 }} /></Form.Item>
                  </>
                )}
                <Button type="primary" block onClick={() => advance(nextStatus[current.status])}>
                  {nextAction[current.status]}
                </Button>
              </Form>
            ) : (
              <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
                <Descriptions.Item label="维保人">{current.worker?.name || '—'}</Descriptions.Item>
                <Descriptions.Item label="处置措施">{current.solution || '—'}</Descriptions.Item>
                <Descriptions.Item label="更换配件">{(current.parts || []).join('、') || '无'}</Descriptions.Item>
                <Descriptions.Item label="维修费用">¥ {current.cost || 0}</Descriptions.Item>
              </Descriptions>
            )}
          </>
        )}
      </Drawer>
    </Card>
  )
}
