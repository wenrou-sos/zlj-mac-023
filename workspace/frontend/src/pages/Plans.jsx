import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Select, DatePicker, message, Input,
  Segmented, Alert, Popconfirm,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getPlans, createPlan, togglePlan, getElevators, getWorkers } from '../api.js'
import { daysLeftText, fmtDate } from '../components/tags.jsx'

export default function Plans() {
  const [rows, setRows] = useState([])
  const [elevators, setElevators] = useState([])
  const [workers, setWorkers] = useState([])
  const [scope, setScope] = useState('active')
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const load = () => getPlans(scope).then(setRows)
  useEffect(() => { load() }, [scope])
  useEffect(() => { getElevators().then(setElevators); getWorkers().then(setWorkers) }, [])

  const submit = async () => {
    const v = await form.validateFields()
    await createPlan({
      elevator_id: v.elevator_id,
      cycle: v.cycle,
      next_date: v.next_date.format('YYYY-MM-DD'),
      end_date: v.end_date ? v.end_date.format('YYYY-MM-DD') : null,
      assignee_id: v.assignee_id,
      remark: v.remark,
    })
    message.success('计划已创建')
    setOpen(false); form.resetFields(); load()
  }

  const columns = [
    { title: '设备编号', dataIndex: ['elevator', 'code'], width: 120,
      render: (v, r) => <a onClick={() => navigate(`/elevators/${r.elevator_id}`)}>{v}</a> },
    { title: '安装位置', render: (_, r) => <span>{r.elevator?.address} <span style={{ color: '#999' }}>{r.elevator?.location_detail}</span></span> },
    { title: '周期', dataIndex: 'cycle', width: 80, render: v => <Tag color="blue">{v}保</Tag> },
    { title: '下次维保日期', dataIndex: 'next_date', width: 130, render: fmtDate },
    {
      title: '剩余天数', dataIndex: 'days_left', width: 130,
      render: (v) => daysLeftText(v),
      sorter: (a, b) => a.days_left - b.days_left,
    },
    { title: '负责人', width: 100, render: (_, r) => workers.find(w => w.id === r.assignee_id)?.name || '—' },
    {
      title: '状态', dataIndex: 'active', width: 90,
      render: (v) => v ? <Tag color="green">生效中</Tag> : <Tag>已停用</Tag>,
    },
    {
      title: '操作', width: 130,
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => navigate('/scan')}>去签到</Button>
          <PopconfirmInline onOk={async () => { await togglePlan(r.id); message.success('状态已更新'); load() }}
            text={r.active ? '停用' : '启用'} danger={!!r.active} />
        </Space>
      ),
    },
  ]

  const overdueCount = rows.filter(r => r.overdue).length

  return (
    <Card>
      <div className="toolbar">
        <Segmented options={[
          { label: '生效计划', value: 'active' },
          { label: '全部计划', value: 'all' },
        ]} value={scope} onChange={setScope} />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <div className="spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增计划</Button>
      </div>

      {overdueCount > 0 && scope === 'active' && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          message={`有 ${overdueCount} 项维保计划已逾期，请尽快安排人员扫码执行保养`} />
      )}

      <Table rowKey="id" dataSource={rows} columns={columns}
        scroll={{ x: 900 }} pagination={{ pageSize: 12, showTotal: t => `共 ${t} 项` }}
        rowClassName={(r) => r.overdue && r.active ? 'overdue-row' : ''} />

      <Modal title="新增维保计划" open={open} onOk={submit} onCancel={() => setOpen(false)}
        okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          initialValues={{ cycle: '半月', next_date: dayjs().add(15, 'day') }}>
          <Form.Item name="elevator_id" label="电梯" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择电梯"
              options={elevators.map(e => ({
                value: e.id, label: `${e.code} ｜ ${e.address} ${e.location_detail || ''}`,
              }))} />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="cycle" label="维保周期" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={['半月', '季度', '半年', '年度'].map(v => ({ value: v, label: `${v}保` }))} />
            </Form.Item>
            <Form.Item name="assignee_id" label="负责人">
              <Select allowClear style={{ width: 200 }} placeholder="选择维保人员"
                options={workers.map(w => ({ value: w.id, label: `${w.name}（${w.team || w.role}）` }))} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="next_date" label="下次维保日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: 176 }} />
            </Form.Item>
            <Form.Item name="end_date" label="计划截止日期">
              <DatePicker style={{ width: 176 }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

function PopconfirmInline({ onOk, text, danger }) {
  return (
    <Popconfirm
      title={danger ? '确认停用该计划？' : '确认重新启用？'}
      onConfirm={onOk}>
      <Button size="small" type="link" danger={danger}>{text}</Button>
    </Popconfirm>
  )
}
