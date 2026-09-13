import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, DatePicker, Select,
  Radio, message, Alert, Tabs,
} from 'antd'
import { PlusOutlined, ReloadOutlined, NotificationOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  getExpiring, getInspections, getElevators, createInspection,
} from '../api.js'
import { InspectTag, daysLeftText, fmtDate } from '../components/tags.jsx'

export default function InspectionRemind() {
  const [days, setDays] = useState(30)
  const [expiring, setExpiring] = useState([])
  const [allRecords, setAllRecords] = useState([])
  const [elevators, setElevators] = useState([])
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const load = () => {
    getExpiring(days).then(setExpiring)
    getInspections().then(setAllRecords)
  }
  useEffect(() => { load() }, [days])
  useEffect(() => { getElevators().then(setElevators) }, [])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await createInspection({
        elevator_id: v.elevator_id,
        inspect_date: v.inspect_date.format('YYYY-MM-DD'),
        next_date: v.next_date.format('YYYY-MM-DD'),
        org: v.org,
        result: v.result,
        certificate_no: v.certificate_no,
        remark: v.remark,
      })
      message.success('年检记录已登记，档案年检日期已同步更新')
      setOpen(false); form.resetFields(); load()
    } catch (e) {
      message.error(e.userMessage || '保存失败')
    }
  }

  const overdueCount = expiring.filter(e => e.inspect_status === '已过期').length

  const expiringColumns = [
    { title: '设备编号', dataIndex: ['elevator', 'code'], width: 120,
      render: (v, r) => <a onClick={() => navigate(`/elevators/${r.elevator.id}`)}>{v}</a> },
    { title: '安装位置', render: (_, r) => `${r.elevator.address} ${r.elevator.location_detail || ''}` },
    { title: '物业单位', dataIndex: ['elevator', 'property_company'], width: 160 },
    { title: '下次检验日期', dataIndex: 'next_inspect_date', width: 130, render: fmtDate },
    { title: '剩余天数', dataIndex: 'days_left', width: 130, render: daysLeftText, sorter: (a, b) => a.days_left - b.days_left, defaultSortOrder: 'ascend' },
    { title: '状态', dataIndex: 'inspect_status', width: 100, render: v => <InspectTag status={v} /> },
    {
      title: '操作', width: 140,
      render: (_, r) => (
        <Button size="small" type="primary" ghost onClick={() => {
          form.setFieldsValue({
            elevator_id: r.elevator.id,
            inspect_date: dayjs(),
            next_date: dayjs().add(1, 'year'),
            result: '合格',
            org: '杭州市特种设备检测研究院',
          })
          setOpen(true)
        }}>登记年检结果</Button>
      ),
    },
  ]

  const recordColumns = [
    { title: '检验日期', dataIndex: 'inspect_date', width: 120, render: fmtDate },
    { title: '下次检验', dataIndex: 'next_date', width: 120, render: fmtDate },
    { title: '剩余', dataIndex: 'days_left', width: 110, render: daysLeftText },
    { title: '设备编号', dataIndex: ['elevator', 'code'], width: 120,
      render: (v, r) => <a onClick={() => navigate(`/elevators/${r.elevator_id}`)}>{v}</a> },
    { title: '位置', ellipsis: true, render: (_, r) => r.elevator?.address },
    { title: '检验机构', dataIndex: 'org' },
    { title: '合格证号', dataIndex: 'certificate_no', width: 150 },
    { title: '结论', dataIndex: 'result', width: 90,
      render: v => <Tag color={v === '合格' || v === '复检合格' ? 'green' : 'red'}>{v}</Tag> },
  ]

  return (
    <Card>
      <div className="toolbar">
        <Radio.Group value={days} onChange={e => setDays(e.target.value)} optionType="button" buttonStyle="solid"
          options={[
            { label: '未来 7 天', value: 7 },
            { label: '未来 30 天', value: 30 },
            { label: '未来 90 天', value: 90 },
          ]} />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <div className="spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          form.setFieldsValue({
            inspect_date: dayjs(), next_date: dayjs().add(1, 'year'),
            result: '合格', org: '杭州市特种设备检测研究院',
          })
          setOpen(true)
        }}>登记年检</Button>
      </div>

      {overdueCount > 0 && (
        <Alert type="error" showIcon icon={<NotificationOutlined />} style={{ marginBottom: 16 }}
          message={`${overdueCount} 台电梯年检合格证已过期，依据《特种设备安全法》不得继续使用，请立即停用并报检！`} />
      )}

      <Tabs items={[
        {
          key: 'expiring', label: `到期提醒（${expiring.length}）`,
          children: (
            <Table rowKey={(r) => r.elevator.id} dataSource={expiring} columns={expiringColumns}
              scroll={{ x: 900 }} pagination={false}
              rowClassName={(r) => r.inspect_status === '已过期' ? 'overdue-row' : ''} />
          ),
        },
        {
          key: 'all', label: `年检记录（${allRecords.length}）`,
          children: (
            <Table rowKey="id" dataSource={allRecords} columns={recordColumns}
              scroll={{ x: 1000 }} pagination={{ pageSize: 12 }} />
          ),
        },
      ]} />

      <Modal title="登记年检结果" open={open} onOk={submit} onCancel={() => setOpen(false)}
        okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          initialValues={{ result: '合格' }}>
          <Form.Item name="elevator_id" label="电梯" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择电梯"
              options={elevators.map(e => ({
                value: e.id, label: `${e.code} ｜ ${e.address} ${e.location_detail || ''}`,
              }))} />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="inspect_date" label="本次检验日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: 176 }} />
            </Form.Item>
            <Form.Item name="next_date" label="下次检验日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: 176 }} />
            </Form.Item>
          </Space>
          <Form.Item name="org" label="检验机构"><Input /></Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="certificate_no" label="合格证号"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item name="result" label="检验结论">
              <Select style={{ width: 160 }}
                options={['合格', '复检合格', '不合格'].map(v => ({ value: v, label: v }))} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
