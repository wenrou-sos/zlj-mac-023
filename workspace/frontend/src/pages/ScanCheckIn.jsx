import { useEffect, useRef, useState } from 'react'
import {
  Card, Steps, Button, Select, Space, Typography, message, Form, Input, Radio,
  Checkbox, Tag, Descriptions, Divider, Alert,
} from 'antd'
import {
  ScanOutlined, EnvironmentOutlined, CheckCircleOutlined, SafetyOutlined,
} from '@ant-design/icons'
import {
  getElevators, getWorkers, checkIn, completeRecord, qrUrl,
} from '../api.js'
import { ElevatorStatusTag } from '../components/tags.jsx'
import { fmtDateTime } from '../components/tags.jsx'

const { Title, Text } = Typography

// 半月维护项目（TSG T5002 基本项目，演示用）
const DEFAULT_ITEMS = [
  '机房曳引机运行及油位检查',
  '控制柜元器件及接线检查',
  '制动器动作及间隙检查',
  '层门、轿门门锁啮合检查',
  '光幕/安全触板有效性检查',
  '限速器外观及转动检查',
  '井道导轨润滑及支架紧固',
  '轿厢与应急照明检查',
  '五方通话及报警装置测试',
  '平层精度及运行舒适感检查',
  '底坑清洁及缓冲器检查',
  '门机皮带、地坎滑槽检查',
]

export default function ScanCheckIn() {
  const [elevators, setElevators] = useState([])
  const [workers, setWorkers] = useState([])
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [elevator, setElevator] = useState(null)
  const [workerId, setWorkerId] = useState(null)
  const [record, setRecord] = useState(null)
  const [form] = Form.useForm()
  const scanTimer = useRef(null)

  useEffect(() => {
    getElevators().then(setElevators)
    getWorkers().then(setWorkers)
    return () => clearTimeout(scanTimer.current)
  }, [])

  // 模拟扫码：随机扫到一台电梯
  const startScan = () => {
    if (!workerId) {
      message.warning('请先选择签到人员')
      return
    }
    setScanning(true)
    scanTimer.current = setTimeout(() => {
      const ev = elevators[Math.floor(Math.random() * elevators.length)]
      doCheckIn(ev.code)
    }, 1200)
  }

  const scanSpecific = (code) => {
    if (!workerId) {
      message.warning('请先选择签到人员')
      return
    }
    setScanning(true)
    scanTimer.current = setTimeout(() => doCheckIn(code), 600)
  }

  const doCheckIn = async (code) => {
    try {
      // 模拟定位坐标
      const lat = +(30.2 + Math.random() * 0.06).toFixed(6)
      const lng = +(120.1 + Math.random() * 0.06).toFixed(6)
      const rec = await checkIn({ elevator_code: code, worker_id: workerId, lat, lng })
      setRecord(rec)
      setElevator(rec.elevator)
      setScanning(false)
      setStep(rec.finish_time ? 3 : 1)
      if (!rec.finish_time) {
        form.setFieldsValue({
          kind: rec.kind || '半月',
          abnormal_desc: '',
          signature: workers.find(w => w.id === workerId)?.name || '',
        })
        message.success('扫码签到成功！')
      } else {
        message.info('该电梯存在已完成签到记录')
      }
    } catch (e) {
      setScanning(false)
      message.error(e.userMessage)
    }
  }

  const submitFinish = async () => {
    const v = await form.validateFields()
    const itemStates = v.itemStates || {}
    const notes = v.notes || {}
    const items = DEFAULT_ITEMS.map((name) => ({
      name,
      result: itemStates[name] === false ? '异常' : '正常',
      note: notes[name] || '',
    }))
    const hasAbn = items.some(i => i.result === '异常')
    if (hasAbn && !v.abnormal_desc) {
      message.warning('存在异常项目，请填写异常情况说明')
      return
    }
    const rec = await completeRecord(record.id, {
      kind: v.kind,
      items,
      result: hasAbn ? '异常' : '正常',
      abnormal_desc: v.abnormal_desc,
      signature: v.signature,
    })
    setRecord(rec)
    setElevator(rec.elevator)
    setStep(3)
    message.success(hasAbn ? '保养完成，异常已自动生成急修工单' : '保养记录已提交')
  }

  const reset = () => {
    setStep(0); setElevator(null); setRecord(null); form.resetFields()
  }

  const worker = workers.find(w => w.id === workerId)

  return (
    <Card>
      <Steps
        current={step}
        style={{ maxWidth: 720, margin: '8px auto 28px' }}
        items={[
          { title: '扫码签到', icon: <ScanOutlined /> },
          { title: '现场保养', },
          { title: '提交记录', icon: <SafetyOutlined /> },
        ]}
      />

      {step === 0 && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Alert type="info" showIcon style={{ marginBottom: 20 }}
            message="演示环境无摄像头，点击「模拟扫码」将随机识别一台电梯；也可在下方选择指定电梯扫码。" />

          <Form layout="inline" style={{ marginBottom: 20, justifyContent: 'center' }}>
            <Form.Item label="签到人员">
              <Select style={{ width: 260 }} placeholder="选择维保人员（模拟当前登录人）"
                value={workerId} onChange={setWorkerId}
                options={workers.map(w => ({ value: w.id, label: `${w.name}（${w.team || w.role}）` }))} />
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center' }}>
            <div onClick={startScan}
              style={{
                width: 220, height: 220, margin: '0 auto', borderRadius: 16,
                border: '3px dashed #1677ff', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                color: '#1677ff', background: scanning ? '#e6f4ff' : '#fafcff',
                opacity: scanning ? 0.7 : 1, transition: 'all .2s',
              }}>
              <ScanOutlined style={{ fontSize: 56 }} />
              <div style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>
                {scanning ? '正在识别设备码…' : '点击模拟扫码'}
              </div>
            </div>

            <Divider style={{ margin: '28px 0 16px' }}>或选择设备直接扫码</Divider>
            <Select showSearch style={{ width: 360 }} placeholder="搜索设备编号 / 地址"
              optionFilterProp="label"
              options={elevators.map(e => ({
                value: e.code,
                label: `${e.code} ｜ ${e.address} ${e.location_detail || ''}`,
              }))}
              onChange={(code) => scanSpecific(code)}
              value={null}
            />
          </div>
        </div>
      )}

      {step >= 1 && elevator && record && (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="scan-result">
            <Space size="large" wrap>
              <img src={qrUrl(elevator.code)} alt="" style={{ width: 72, height: 72 }} />
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {elevator.code} <ElevatorStatusTag status={elevator.status} />
                </Title>
                <div style={{ color: '#666' }}>{elevator.address} · {elevator.location_detail}</div>
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                  {elevator.brand} {elevator.model} · {elevator.floors} 层站
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ color: '#52c41a' }}><CheckCircleOutlined /> 签到成功</div>
                <div style={{ color: '#999', fontSize: 12 }}>{fmtDateTime(record.check_in_time)}</div>
                <div style={{ color: '#999', fontSize: 12 }}>
                  <EnvironmentOutlined /> {record.check_in_lat}, {record.check_in_lng}
                </div>
              </div>
            </Space>
          </div>

          {step === 1 && (
            <Form form={form} layout="vertical">
              <Space style={{ marginBottom: 8 }}>
                <Form.Item name="kind" label="保养类型" style={{ marginBottom: 0 }}>
                  <Select style={{ width: 120 }}
                    options={['半月', '季度', '半年', '年度'].map(v => ({ value: v, label: `${v}保` }))} />
                </Form.Item>
                <Text type="secondary" style={{ paddingTop: 30 }}>
                  签到人：{worker?.name}（{worker?.cert_no}）
                </Text>
              </Space>

              <Card size="small" type="inner" title="保养项目（勾选=正常，取消勾选=异常）" style={{ marginTop: 12 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {DEFAULT_ITEMS.map((name) => (
                    <Space key={name} align="start" style={{ width: '100%' }}>
                      <Form.Item name={['itemStates', name]} valuePropName="checked" noStyle
                        initialValue={true}>
                        <Checkbox>{name}</Checkbox>
                      </Form.Item>
                      <Form.Item name={['notes', name]} noStyle>
                        <Input placeholder="备注（可选）" style={{ width: 300, marginLeft: 8 }} size="small" />
                      </Form.Item>
                    </Space>
                  ))}
                </Space>
              </Card>

              <Form.Item name="abnormal_desc" label="异常情况说明（有项目异常时必填）">
                <Input.TextArea rows={2} placeholder="如：层门门锁触点烧蚀，需更换" />
              </Form.Item>
              <Form.Item name="signature" label="维保人员签名" rules={[{ required: true, message: '请签名确认' }]}>
                <Input style={{ width: 240 }} placeholder="输入姓名即视为电子签名" />
              </Form.Item>

              <Space>
                <Button type="primary" size="large" onClick={submitFinish}>完成保养并提交</Button>
                <Button size="large" onClick={reset}>暂存（已签到，稍后再填）</Button>
              </Space>
            </Form>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircleOutlined style={{ fontSize: 56, color: '#52c41a' }} />
              <Title level={4} style={{ marginTop: 12 }}>保养记录已提交</Title>
              <Descriptions bordered column={1} style={{ maxWidth: 520, margin: '20px auto', textAlign: 'left' }} size="small">
                <Descriptions.Item label="设备">{elevator.code}</Descriptions.Item>
                <Descriptions.Item label="签到时间">{fmtDateTime(record.check_in_time)}</Descriptions.Item>
                <Descriptions.Item label="完成时间">{fmtDateTime(record.finish_time)}</Descriptions.Item>
                <Descriptions.Item label="保养结论">
                  <Tag color={record.result === '正常' ? 'green' : 'red'}>{record.result}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="签名">{record.signature}</Descriptions.Item>
              </Descriptions>
              {record.result === '异常' && (
                <Alert type="warning" showIcon style={{ maxWidth: 520, margin: '0 auto 16px' }}
                  message="系统已根据异常情况自动生成待接单急修工单，可在「故障急修」中派单处理。" />
              )}
              <Button type="primary" onClick={reset}>继续扫码下一台</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
