import { useEffect, useState } from 'react'
import { Card, Table, Tag, Button, Segmented, Drawer, Descriptions, Empty, Space } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getRecords } from '../api.js'
import { ElevatorStatusTag } from '../components/tags.jsx'
import { fmtDateTime } from '../components/tags.jsx'

export default function Records() {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState(null)
  const navigate = useNavigate()

  const load = () => {
    const params = { limit: 200 }
    if (filter === 'ongoing') params.ongoing = true
    if (filter === 'done') params.ongoing = false
    getRecords(params).then(setRows)
  }
  useEffect(() => { load() }, [filter])

  const columns = [
    { title: '签到时间', dataIndex: 'check_in_time', width: 160, render: fmtDateTime, sorter: (a, b) => new Date(a.check_in_time) - new Date(b.check_in_time), defaultSortOrder: 'descend' },
    { title: '设备编号', dataIndex: ['elevator', 'code'], width: 120,
      render: (v, r) => <a onClick={() => navigate(`/elevators/${r.elevator_id}`)}>{v}</a> },
    { title: '安装位置', ellipsis: true, render: (_, r) => `${r.elevator?.address || ''} ${r.elevator?.location_detail || ''}` },
    { title: '维保人', width: 90, render: (_, r) => r.worker?.name || '—' },
    { title: '类型', dataIndex: 'kind', width: 80, render: v => <Tag>{v}保</Tag> },
    { title: '完成时间', dataIndex: 'finish_time', width: 160, render: fmtDateTime },
    {
      title: '结论', dataIndex: 'result', width: 90,
      render: (v) => <Tag color={v === '正常' ? 'green' : v === '进行中' ? 'blue' : 'red'}>{v}</Tag>,
    },
    { title: '签名', dataIndex: 'signature', width: 90, render: v => v || '—' },
    {
      title: '操作', width: 80,
      render: (_, r) => <Button size="small" type="link" onClick={() => setDetail(r)}>查看</Button>,
    },
  ]

  return (
    <Card>
      <div className="toolbar">
        <Segmented options={[
          { label: '全部', value: 'all' },
          { label: '进行中', value: 'ongoing' },
          { label: '已完成', value: 'done' },
        ]} value={filter} onChange={setFilter} />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>
      <Table rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1000 }}
        pagination={{ pageSize: 12, showTotal: t => `共 ${t} 条` }} />

      <Drawer title="保养记录详情" width={560} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="设备">
                {detail.elevator?.code} <ElevatorStatusTag status={detail.elevator?.status} />
                <div style={{ color: '#999' }}>{detail.elevator?.address} {detail.elevator?.location_detail}</div>
              </Descriptions.Item>
              <Descriptions.Item label="维保人">{detail.worker?.name}（{detail.worker?.team}）</Descriptions.Item>
              <Descriptions.Item label="保养类型">{detail.kind}保</Descriptions.Item>
              <Descriptions.Item label="签到时间">{fmtDateTime(detail.check_in_time)}</Descriptions.Item>
              <Descriptions.Item label="签到定位">
                {detail.check_in_lat ? `${detail.check_in_lat}, ${detail.check_in_lng}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="完成时间">{fmtDateTime(detail.finish_time)}</Descriptions.Item>
              <Descriptions.Item label="结论">
                <Tag color={detail.result === '正常' ? 'green' : detail.result === '进行中' ? 'blue' : 'red'}>{detail.result}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="异常说明">{detail.abnormal_desc || '—'}</Descriptions.Item>
              <Descriptions.Item label="签名">{detail.signature || '—'}</Descriptions.Item>
            </Descriptions>

            <h4 style={{ margin: '20px 0 10px' }}>
              保养项目清单
              {detail.kind && <Tag color="blue" style={{ marginLeft: 8 }}>{detail.kind}保模板</Tag>}
              <span style={{ fontSize: 12, color: '#999', fontWeight: 'normal' }}>
                必检 {(detail.items || []).filter(i => !i.custom).length} 项 ·
                补充 {(detail.items || []).filter(i => i.custom).length} 项
              </span>
            </h4>
            {detail.items?.length ? (
              <Table rowKey="name" size="small" pagination={false} dataSource={detail.items}
                columns={[
                  {
                    title: '检查项目', dataIndex: 'name',
                    render: (v, r) => (
                      <Space size={4}>
                        {v}
                        {r.custom
                          ? <Tag color="purple" style={{ marginInlineStart: 4 }}>补充</Tag>
                          : <Tag color="blue" style={{ marginInlineStart: 4 }}>必检</Tag>}
                      </Space>
                    ),
                  },
                  { title: '结果', dataIndex: 'result', width: 80,
                    render: v => <Tag color={v === '正常' ? 'green' : 'red'}>{v}</Tag> },
                  { title: '说明', dataIndex: 'note', render: v => v || '—' },
                ]} />
            ) : <Empty description="尚未填写保养项目（进行中）" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </>
        )}
      </Drawer>
    </Card>
  )
}
