import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Input, Modal, Descriptions, message, Drawer, Image,
} from 'antd'
import { ReloadOutlined, RollbackOutlined, SearchOutlined, QrcodeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getElevators, restoreElevator, qrUrl } from '../api.js'
import { fmtDate } from '../components/tags.jsx'

const TYPE_COLOR = { 报废: 'red', 移交: 'orange', 退场: 'default' }

export default function ArchivedElevators() {
  const [rows, setRows] = useState([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const [detail, setDetail] = useState(null)
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    getElevators({ archived: 1, keyword: keyword || undefined })
      .then(setRows).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const doRestore = async () => {
    try {
      const ev = await restoreElevator(restoring.id)
      message.success(`已恢复，设备当前为「停用」状态，检查确认后可在档案中手动启用`)
      setRestoring(null)
      load()
      navigate(`/elevators/${ev.id}`)
    } catch (e) {
      message.error(e.userMessage || '恢复失败')
    }
  }

  const columns = [
    {
      title: '设备编号', dataIndex: 'code', width: 130,
      render: (v, r) => <a onClick={() => setDetail(r)}>{v}</a>,
    },
    { title: '安装位置', render: (_, r) => <span>{r.address}<span style={{ color: '#999' }}> {r.location_detail}</span></span> },
    { title: '品牌/型号', width: 150, render: (_, r) => `${r.brand} · ${r.model}` },
    {
      title: '归档类型', dataIndex: 'archive_type', width: 100,
      render: (v) => <Tag color={TYPE_COLOR[v] || 'default'}>{v}</Tag>,
    },
    { title: '归档日期', dataIndex: 'archive_date', width: 120, render: fmtDate },
    { title: '经办人', dataIndex: 'archive_operator', width: 110 },
    { title: '原因', dataIndex: 'archive_reason', ellipsis: true },
    {
      title: '操作', width: 150,
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => setDetail(r)}>历史</Button>
          <Button size="small" type="link" icon={<RollbackOutlined />}
            onClick={() => setRestoring(r)}>恢复</Button>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={<span>归档库 <Tag color="red">报废</Tag><Tag color="orange">移交</Tag><Tag>退场</Tag></span>}
      extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
    >
      <div className="toolbar">
        <Input.Search placeholder="按设备编号/登记证号/地址查询" allowClear style={{ width: 300 }}
          value={keyword} onChange={(e) => setKeyword(e.target.value)}
          onSearch={load} enterButton={<SearchOutlined />} />
      </div>

      <Table rowKey="id" loading={loading} dataSource={rows} columns={columns}
        scroll={{ x: 1000 }} pagination={false}
        locale={{ emptyText: '暂无归档设备' }} />

      <Modal
        title={`恢复设备 · ${restoring?.code || ''}`}
        open={!!restoring} onOk={doRestore} onCancel={() => setRestoring(null)}
        okText="确认恢复" cancelText="取消"
      >
        <p>确认将该设备从归档库恢复到在用档案吗？</p>
        <ul style={{ color: '#666' }}>
          <li>恢复后设备状态为<b>停用</b>，需检查确认后手动启用；</li>
          <li>原维保计划保持停用状态，需在「维保计划」中重新排期启用；</li>
          <li>全部历史记录随设备一并恢复可见。</li>
        </ul>
      </Modal>

      <Drawer width={620} title={`归档设备 · ${detail?.code || ''}`}
        open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={TYPE_COLOR[detail.archive_type]}>{detail.archive_type}</Tag>
              <span style={{ color: '#999' }}>{fmtDate(detail.archive_date)} 经办人：{detail.archive_operator}</span>
            </Space>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="安装位置">{detail.address} {detail.location_detail}</Descriptions.Item>
              <Descriptions.Item label="品牌型号">{detail.brand} {detail.model}（{detail.floors} 层站）</Descriptions.Item>
              <Descriptions.Item label="登记证号">{detail.reg_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="使用 / 维保单位">{detail.property_company} / {detail.maintenance_company}</Descriptions.Item>
              <Descriptions.Item label="归档原因">{detail.archive_reason || '—'}</Descriptions.Item>
              <Descriptions.Item label="设备二维码"><Image src={qrUrl(detail.code)} width={120} /></Descriptions.Item>
            </Descriptions>
            <p style={{ color: '#999', marginTop: 16 }}>
              <QrcodeOutlined /> 历次保养记录、急修工单、年检记录请在
              <Button type="link" onClick={() => { navigate(`/elevators/${detail.id}`); setDetail(null) }}>设备详情</Button>
              中查看（完整保留）。
            </p>
            <Button danger icon={<RollbackOutlined />} onClick={() => setRestoring(detail)}>恢复该设备</Button>
          </>
        )}
      </Drawer>
    </Card>
  )
}
