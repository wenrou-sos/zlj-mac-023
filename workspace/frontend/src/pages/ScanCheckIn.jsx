import { useEffect, useRef, useState } from 'react'
import {
  Card, Steps, Button, Select, Space, Typography, message, Form, Input,
  Tag, Descriptions, Divider, Alert, Modal, Table, Radio, Empty, Tooltip,
} from 'antd'
import {
  ScanOutlined, EnvironmentOutlined, CheckCircleOutlined,
  PlusOutlined, DeleteOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import {
  getElevators, getWorkers, checkIn, completeRecord, takeOverRecord,
  getChecklist, qrUrl,
} from '../api.js'
import { ElevatorStatusTag, fmtDateTime } from '../components/tags.jsx'
import { useAuth } from '../auth.jsx'

const { Title, Text } = Typography

export default function ScanCheckIn() {
  const { user, isAdmin } = useAuth()
  const [elevators, setElevators] = useState([])
  const [workers, setWorkers] = useState([])
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [elevator, setElevator] = useState(null)
  const [workerId, setWorkerId] = useState(user?.role === '维保员' ? user.worker_id : null)
  const [record, setRecord] = useState(null)
  const [form] = Form.useForm()
  const scanTimer = useRef(null)

  // 保养填写状态
  const [cycle, setCycle] = useState('半月')
  const [template, setTemplate] = useState([])      // 必检项 [{name, required, custom}]
  const [results, setResults] = useState({})         // name -> '正常' | '异常'
  const [notes, setNotes] = useState({})             // name -> 说明
  const [custom, setCustom] = useState([])           // [{name, result, note}]
  const [loadingTpl, setLoadingTpl] = useState(false)

  useEffect(() => {
    getElevators().then(setElevators)
    getWorkers().then(setWorkers)
    return () => clearTimeout(scanTimer.current)
  }, [])

  const loadTemplate = (ev, cyc) => {
    setLoadingTpl(true)
    getChecklist(ev.id, cyc)
      .then((d) => { setTemplate(d.checklist); setResults({}); setNotes({}); setCustom([]) })
      .catch((e) => message.error(e.userMessage))
      .finally(() => setLoadingTpl(false))
  }

  const changeCycle = (cyc) => {
    setCycle(cyc)
    form.setFieldValue('kind', cyc)
    if (elevator) loadTemplate(elevator, cyc)
  }

  // 模拟扫码：随机扫到一台电梯
  const startScan = () => {
    if (!workerId) { message.warning('请先选择签到人员'); return }
    setScanning(true)
    scanTimer.current = setTimeout(() => {
      const ev = elevators[Math.floor(Math.random() * elevators.length)]
      doCheckIn(ev.code)
    }, 1200)
  }

  const scanSpecific = (code) => {
    if (!workerId) { message.warning('请先选择签到人员'); return }
    setScanning(true)
    scanTimer.current = setTimeout(() => doCheckIn(code), 600)
  }

  const enterMaint = (rec, msg) => {
    setRecord(rec)
    setElevator(rec.elevator)
    setScanning(false)
    setStep(rec.finish_time ? 3 : 1)
    if (!rec.finish_time) {
      const cyc = rec.kind || '半月'
      setCycle(cyc)
      form.setFieldsValue({
        kind: cyc,
        abnormal_desc: '',
        signature: workers.find(w => w.id === (rec.worker_id ?? workerId))?.name || '',
      })
      loadTemplate(rec.elevator, cyc)
      message.success(msg || '扫码签到成功！')
    } else {
      message.info('该电梯存在已完成签到记录')
    }
  }

  const doCheckIn = async (code) => {
    try {
      const lat = +(30.2 + Math.random() * 0.06).toFixed(6)
      const lng = +(120.1 + Math.random() * 0.06).toFixed(6)
      const rec = await checkIn({ elevator_code: code, worker_id: workerId, lat, lng })
      enterMaint(rec)
    } catch (e) {
      setScanning(false)
      if (e.conflict) {
        const c = e.conflict
        Modal.confirm({
          title: '该电梯已有未完成的保养',
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>{c.message}</p>
              <p style={{ color: '#999', marginBottom: 0 }}>
                原签到人：<b>{c.owner_name}</b>，签到时间：{fmtDateTime(c.check_in_time)}
              </p>
            </div>
          ),
          okText: `由${workers.find(w => w.id === workerId)?.name || '当前人员'}接手`,
          cancelText: '取消',
          onOk: async () => {
            const rec = await takeOverRecord(c.record_id, workerId)
            enterMaint(rec, '已接手，保养记录已转到当前维保人员名下')
          },
        })
        return
      }
      message.error(e.userMessage)
    }
  }

  const addCustom = () => {
    let name = ''
    Modal.confirm({
      title: '补充自定义检查项',
      content: <Input id="custom-item-name" placeholder="如：物业加装门禁联动装置检查"
        onChange={(e) => { name = e.target.value }} />,
      okText: '添加',
      cancelText: '取消',
      onOk: () => {
        name = name.trim()
        if (!name) { message.warning('请填写项目名称'); return Promise.reject() }
        if (template.some(t => t.name === name) || custom.some(c => c.name === name)) {
          message.warning('该项目已存在'); return Promise.reject()
        }
        setCustom([...custom, { name, result: '正常', note: '' }])
      },
    })
  }

  const submitFinish = async () => {
    try {
      await form.validateFields()
    } catch { return }

    // 必检项逐项判定，不允许跳过
    const unchecked = template.filter(t => !results[t.name])
    if (unchecked.length) {
      message.warning(`还有 ${unchecked.length} 个必检项未判定，请逐项检查（必检项不允许跳过）`)
      return
    }
    const abnormalNoNote = [
      ...template.filter(t => results[t.name] === '异常' && !(notes[t.name] || '').trim()).map(t => t.name),
      ...custom.filter(c => c.result === '异常' && !(c.note || '').trim()).map(c => c.name),
    ]
    if (abnormalNoNote.length) {
      message.warning(`请为异常项填写说明：${abnormalNoNote[0]}`)
      return
    }

    const items = [
      ...template.map(t => ({
        name: t.name, result: results[t.name], note: notes[t.name] || '',
        required: true, custom: false,
      })),
      ...custom.map(c => ({ ...c, required: false, custom: true })),
    ]
    const hasAbn = items.some(i => i.result === '异常')
    try {
      const rec = await completeRecord(record.id, {
        kind: cycle,
        items,
        result: hasAbn ? '异常' : '正常',
        abnormal_desc: form.getFieldValue('abnormal_desc') || '',
        signature: form.getFieldValue('signature'),
      })
      setRecord(rec); setElevator(rec.elevator); setStep(3)
      message.success(hasAbn ? '保养完成，异常已自动生成急修工单' : '保养记录已提交')
    } catch (e) {
      message.error(e.userMessage || '提交失败')
    }
  }

  const setAllNormal = () => {
    const next = {}
    template.forEach(t => { next[t.name] = '正常' })
    setResults(next)
    message.success('已将全部必检项标记为正常，如有异常可单独修改')
  }

  const reset = () => {
    setStep(0); setElevator(null); setRecord(null)
    setTemplate([]); setResults({}); setNotes({}); setCustom([])
    form.resetFields()
  }

  const doneCount = template.filter(t => results[t.name]).length
  const abnCount = Object.values(results).filter(v => v === '异常').length
    + custom.filter(c => c.result === '异常').length

  return (
    <Card>
      <Steps
        current={step}
        style={{ maxWidth: 720, margin: '8px auto 28px' }}
        items={[
          { title: '扫码签到' },
          { title: '现场保养' },
          { title: '提交记录' },
        ]}
      />

      {step === 0 && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Alert type="info" showIcon style={{ marginBottom: 20 }}
            message="演示环境无摄像头，点击「模拟扫码」将随机识别一台电梯；也可在下方选择指定电梯扫码。" />

          <Form layout="inline" style={{ marginBottom: 20, justifyContent: 'center' }}>
            {isAdmin ? (
              <Form.Item label="签到人员（管理员可代选）">
                <Select style={{ width: 300 }} placeholder="选择维保人员"
                  value={workerId} onChange={setWorkerId}
                  options={workers.map(w => ({ value: w.id, label: `${w.name}（${w.team || w.role}）` }))} />
              </Form.Item>
            ) : (
              <Form.Item label="签到人员">
                <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                  {user.name}（本人，不可代签）
                </Tag>
              </Form.Item>
            )}
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
            <Select showSearch style={{ width: 380 }} placeholder="搜索设备编号 / 地址"
              optionFilterProp="label"
              options={elevators.map(e => ({
                value: e.code,
                label: `${e.code} ｜ ${e.address} ${e.location_detail || ''}（${e.type}）`,
              }))}
              onChange={(code) => scanSpecific(code)}
              value={null}
            />
          </div>
        </div>
      )}

      {step >= 1 && elevator && record && (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div className="scan-result">
            <Space size="large" wrap>
              <img src={qrUrl(elevator.code)} alt="" style={{ width: 72, height: 72 }} />
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {elevator.code} <Tag>{elevator.type}</Tag> <ElevatorStatusTag status={elevator.status} />
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
              <Space wrap style={{ marginBottom: 12 }}>
                <span>保养类型：</span>
                <Select style={{ width: 200 }} value={cycle} onChange={changeCycle}
                  options={['半月', '季度', '半年', '年度'].map(v => ({ value: v, label: `${v}保（切换后清单按对应模板刷新）` }))} />
                <Text type="secondary">
                  维保人：{record.worker?.name || workers.find(w => w.id === workerId)?.name}
                </Text>
              </Space>

              <Alert type="info" showIcon icon={<InfoCircleOutlined />} style={{ marginBottom: 12 }}
                message={
                  <span>
                    本台<b style={{ margin: '0 4px' }}>{elevator.type}</b>
                    的<b style={{ margin: '0 4px' }}>{cycle}保</b>共
                    <b style={{ margin: '0 4px', color: '#1677ff' }}>{template.length}</b>
                    个必检项目，已判定 <b style={{ color: '#52c41a' }}>{doneCount}</b> / {template.length}
                    {abnCount > 0 && <span style={{ color: '#ff4d4f' }}>，异常 {abnCount}</span>}；
                    必检项不允许跳过，异常必须填写说明。
                  </span>
                }
                action={<Button size="small" onClick={setAllNormal}>全部标记正常</Button>} />

              <Card size="small" type="inner"
                title={<span>必检项目清单（{elevator.type} · {cycle}保模板）</span>}
                loading={loadingTpl}
                extra={<Tag color="blue">模板随类型/周期自动匹配</Tag>}>
                {template.length === 0 && !loadingTpl && <Empty description="未加载到模板" />}
                {template.map((t) => {
                  const r = results[t.name]
                  const note = notes[t.name] || ''
                  return (
                    <div key={t.name} style={{
                      padding: '10px 8px', borderBottom: '1px solid #f5f5f5',
                      background: r === '异常' ? '#fff2f0' : r ? '#f6ffed' : 'transparent',
                    }}>
                      <Space align="start" style={{ width: '100%' }}>
                        <Radio.Group size="small" value={r}
                          onChange={(e) => setResults({ ...results, [t.name]: e.target.value })}
                          options={[{ label: '正常', value: '正常' }, { label: '异常', value: '异常' }]}
                          optionType="button" buttonStyle="solid" />
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div>{t.name}</div>
                          {r === '异常' && (
                            <Input status="error" size="small" style={{ marginTop: 6, maxWidth: 420 }}
                              placeholder="异常情况说明（必填）" value={note}
                              onChange={(e) => setNotes({ ...notes, [t.name]: e.target.value })} />
                          )}
                          {r === '正常' && note && (
                            <Input size="small" style={{ marginTop: 6, maxWidth: 420 }}
                              placeholder="备注（可选）" value={note}
                              onChange={(e) => setNotes({ ...notes, [t.name]: e.target.value })} />
                          )}
                        </div>
                        {!r && <Tag>待检</Tag>}
                        {r === '异常' && <Tag color="red">异常</Tag>}
                        {r === '正常' && <Tag color="green">正常</Tag>}
                      </Space>
                    </div>
                  )
                })}
              </Card>

              <Card size="small" type="inner" style={{ marginTop: 12 }}
                title={<span>自定义补充项 <Tag color="purple">与必检项区分保存</Tag></span>}
                extra={<Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addCustom}>添加补充项</Button>}>
                {custom.length === 0 ? (
                  <Text type="secondary">无补充项。现场如有模板外的检查内容（如物业加装装置），可自行添加。</Text>
                ) : (
                  <Table size="small" pagination={false} rowKey="name" dataSource={custom}>
                    <Table.Column title="项目名称" dataIndex="name" />
                    <Table.Column title="结果" dataIndex="result" width={170}
                      render={(v, _, i) => (
                        <Radio.Group size="small" value={v} optionType="button" buttonStyle="solid"
                          options={[{ label: '正常', value: '正常' }, { label: '异常', value: '异常' }]}
                          onChange={(e) => setCustom(custom.map((c, j) => j === i ? { ...c, result: e.target.value } : c))} />
                      )} />
                    <Table.Column title="说明" dataIndex="note"
                      render={(v, _, i) => (
                        <Input size="small" value={v}
                          status={custom[i].result === '异常' && !(v || '').trim() ? 'error' : ''}
                          placeholder={custom[i].result === '异常' ? '异常说明必填' : '备注可选'}
                          onChange={(e) => setCustom(custom.map((c, j) => j === i ? { ...c, note: e.target.value } : c))} />
                      )} />
                    <Table.Column title="操作" width={60}
                      render={(_, __, i) => (
                        <Button size="small" type="link" danger icon={<DeleteOutlined />}
                          onClick={() => setCustom(custom.filter((_, j) => j !== i))} />
                      )} />
                  </Table>
                )}
              </Card>

              <Form.Item name="abnormal_desc" label="整体异常情况汇总" style={{ marginTop: 16 }}>
                <Input.TextArea rows={2} placeholder="如有异常可在此汇总说明（留空则系统自动汇总异常项名称）" />
              </Form.Item>
              <Form.Item name="signature" label="维保人员签名" rules={[{ required: true, message: '请签名确认' }]}>
                <Input style={{ width: 240 }} placeholder="输入姓名即视为电子签名" />
              </Form.Item>

              <Space>
                <Button type="primary" size="large" onClick={submitFinish}>
                  完成{cycle}保并提交
                </Button>
                <Button size="large" onClick={reset}>暂存（已签到，稍后再填）</Button>
              </Space>
            </Form>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircleOutlined style={{ fontSize: 56, color: '#52c41a' }} />
              <Title level={4} style={{ marginTop: 12 }}>{record.kind}保记录已提交</Title>
              <Descriptions bordered column={1} style={{ maxWidth: 520, margin: '20px auto', textAlign: 'left' }} size="small">
                <Descriptions.Item label="设备">{elevator.code}（{elevator.type}）</Descriptions.Item>
                <Descriptions.Item label="维保人">{record.worker?.name || user?.name}</Descriptions.Item>
                <Descriptions.Item label="保养类型">{record.kind}保</Descriptions.Item>
                <Descriptions.Item label="检查项目">
                  共 {record.items?.length || 0} 项
                  （必检 {(record.items || []).filter(i => !i.custom).length}，
                  补充 {(record.items || []).filter(i => i.custom).length}）
                </Descriptions.Item>
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
