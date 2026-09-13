import { useEffect, useState } from 'react'
import {
  Card, Table, Input, Select, Button, Space, Modal, Form, InputNumber,
  DatePicker, message, Image, Tag, Row, Col, Alert,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, QrcodeOutlined, InboxOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  getElevators, createElevator, updateElevator, archiveElevator, qrUrl,
} from '../api.js'
import { ElevatorStatusTag, InspectTag, daysLeftText } from '../components/tags.jsx'
import { useAuth } from '../auth.jsx'

export default function Elevators() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState()
  const [inspectStatus, setInspectStatus] = useState()
  const [modal, setModal] = useState({ open: false, record: null })
  const [archiving, setArchiving] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [archiveForm] = Form.useForm()
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const load = () => {
    setLoading(true)
    getElevators({ keyword: keyword || undefined, status, inspect_status: inspectStatus })
      .then(setRows).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [status, inspectStatus])

  const openEdit = (record) => {
    setModal({ open: true, record })
    form.setFieldsValue(record ? {
      ...record,
      install_date: record.install_date ? dayjs(record.install_date) : null,
      use_date: record.use_date ? dayjs(record.use_date) : null,
      last_inspect_date: record.last_inspect_date ? dayjs(record.last_inspect_date) : null,
    } : {
      type: '客梯', floors: 18, load_kg: 1000, speed: 1.75, inspect_cycle_days: 365, status: '正常',
    })
  }

  const submit = async () => {
    const v = await form.validateFields()
    const payload = {
      ...v,
      install_date: v.install_date ? v.install_date.format('YYYY-MM-DD') : null,
      use_date: v.use_date ? v.use_date.format('YYYY-MM-DD') : null,
      last_inspect_date: v.last_inspect_date ? v.last_inspect_date.format('YYYY-MM-DD') : null,
    }
    try {
      if (modal.record) {
        await updateElevator(modal.record.id, payload)
        message.success('档案已更新')
      } else {
        await createElevator(payload)
        message.success('档案已创建')
      }
      setModal({ open: false, record: null })
      load()
    } catch (e) {
      message.error(e.userMessage || '保存失败')
    }
  }

  const submitArchive = async () => {
    const v = await archiveForm.validateFields()
    try {
      await archiveElevator(archiving.id, v.archive_type, v.reason)
      message.success(`已${v.archive_type}归档，历史记录完整保留，可在归档库恢复`)
      setArchiving(null)
      archiveForm.resetFields()
      load()
    } catch (e) {
      message.error(e.userMessage || '归档失败')
    }
  }

  const columns = [
    {
      title: '二维码', dataIndex: 'code', width: 80, align: 'center',
      render: (code) => (
        <img className="qr-thumb" src={qrUrl(code)} alt={code} title="点击查看大图"
          onClick={() => setQrCode(code)} />
      ),
    },
    { title: '设备编号', dataIndex: 'code', width: 120, render: (v, r) => <a onClick={() => navigate(`/elevators/${r.id}`)}>{v}</a> },
    {
      title: '安装位置', render: (_, r) => (
        <>
          <div>{r.address}</div>
          <div style={{ color: '#999', fontSize: 12 }}>{r.location_detail}</div>
        </>
      ),
    },
    { title: '品牌/型号', width: 150, render: (_, r) => <span>{r.brand}<span style={{ color: '#999' }}> · {r.model}</span></span> },
    { title: '类型', dataIndex: 'type', width: 70, render: (v) => <Tag>{v}</Tag> },
    { title: '层站', dataIndex: 'floors', width: 60, align: 'center' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <ElevatorStatusTag status={v} /> },
    {
      title: '年检状态', width: 130,
      render: (_, r) => (
        <>
          <div><InspectTag status={r.inspect_status} /></div>
          <div style={{ fontSize: 12 }}>{daysLeftText(r.inspect_days_left)}</div>
        </>
      ),
    },
    {
      title: '下次维保', width: 110,
      render: (_, r) => daysLeftText(r.plan_days_left),
    },
    {
      title: '操作', width: isAdmin ? 180 : 80,
      render: (_, r) => (
        <Space size="small" wrap>
          <Button size="small" type="link" onClick={() => navigate(`/elevators/${r.id}`)}>详情</Button>
          {isAdmin && <Button size="small" type="link" onClick={() => openEdit(r)}>编辑</Button>}
          {isAdmin && (
            <Button size="small" type="link" danger onClick={() => {
              archiveForm.setFieldsValue({ archive_type: '报废', reason: '' })
              setArchiving(r)
            }}>归档</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <div className="toolbar">
        <Input.Search placeholder="编号 / 登记证号 / 地址 / 品牌 / 物业" allowClear style={{ width: 280 }}
          value={keyword} onChange={e => setKeyword(e.target.value)} onSearch={load} />
        <Select placeholder="运行状态" allowClear style={{ width: 130 }} value={status} onChange={setStatus}
          options={['正常', '保养中', '故障', '停用'].map(v => ({ value: v, label: v }))} />
        <Select placeholder="年检状态" allowClear style={{ width: 130 }} value={inspectStatus} onChange={setInspectStatus}
          options={['正常', '即将到期', '已过期', '未建档'].map(v => ({ value: v, label: v }))} />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <div className="spacer" />
        {isAdmin && <Button onClick={() => navigate('/archived')} icon={<InboxOutlined />}>归档库</Button>}
        {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>新增电梯</Button>}
      </div>

      {!isAdmin && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="您当前为维保员角色，仅可查看档案与扫码作业；档案新增、编辑、归档请联系管理员。" />
      )}

      <Table rowKey="id" loading={loading} dataSource={rows} columns={columns}
        scroll={{ x: 1100 }} pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 台` }} />

      <Modal title={modal.record ? '编辑电梯档案' : '新增电梯档案'} open={modal.open} width={820}
        onOk={submit} onCancel={() => setModal({ open: false, record: null })} destroyOnClose
        okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="code" label="设备编号（扫码码值）" rules={[{ required: true }]}
              tooltip="修改后设备二维码码值同步变化，现场旧码将无法扫码"
              extra={modal.record ? <span style={{ color: '#fa8c16' }}>修改编号后需重新张贴二维码</span> : null}>
              <Input placeholder="如 DT-2024001" />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="reg_code" label="使用登记证编号"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="status" label="运行状态"><Select options={['正常', '保养中', '故障', '停用'].map(v => ({ value: v, label: v }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="address" label="安装地址" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="location_detail" label="详细位置（栋/单元）"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="brand" label="品牌"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="model" label="型号"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="type" label="类型"><Select options={['客梯', '货梯', '扶梯'].map(v => ({ value: v, label: v }))} /></Form.Item></Col>
            <Col span={6}><Form.Item name="floors" label="层站数"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="load_kg" label="额定载重(kg)"><InputNumber min={100} step={100} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="speed" label="额定速度(m/s)"><InputNumber min={0.1} step={0.25} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="inspect_cycle_days" label="检验周期(天)"><InputNumber min={30} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="last_inspect_date" label="最近年检日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="install_date" label="安装日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="use_date" label="投用日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="property_company" label="使用单位（物业）"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="maintenance_company" label="维保单位"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`设备归档 · ${archiving?.code || ''}`}
        open={!!archiving} onOk={submitArchive}
        onCancel={() => setArchiving(null)}
        okText="确认归档" cancelText="取消" okButtonProps={{ danger: true }}
      >
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="归档不是删除：设备历次保养、急修工单、年检记录将长期保留，可随时在归档库按编号查询或恢复。" />
        <p style={{ color: '#666', marginBottom: 8 }}>
          {archiving?.address} {archiving?.location_detail}
        </p>
        <Form form={archiveForm} layout="vertical">
          <Form.Item name="archive_type" label="归档类型" rules={[{ required: true }]}>
            <Select options={[
              { value: '报废', label: '报废（设备达到寿命/无维修价值）' },
              { value: '移交', label: '移交（设备移交其他单位管理）' },
              { value: '退场', label: '退场（拆除/项目结束）' },
            ]} />
          </Form.Item>
          <Form.Item name="reason" label="原因 / 说明" rules={[{ required: true, message: '请填写归档原因' }]}>
            <Input.TextArea rows={3} placeholder="如：使用满15年，设备老化无维修价值" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`设备二维码 · ${qrCode}`} open={!!qrCode} footer={null} onCancel={() => setQrCode(null)}>
        {qrCode && (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Image src={qrUrl(qrCode)} width={260} />
            <div style={{ marginTop: 12, color: '#666' }}>
              <QrcodeOutlined /> 维保人员可在「扫码签到」页扫描此码
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}
