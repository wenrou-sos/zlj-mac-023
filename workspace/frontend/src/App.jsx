import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Badge, Tag } from 'antd'
import {
  DashboardOutlined,
  ApartmentOutlined,
  ScanOutlined,
  CalendarOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Elevators from './pages/Elevators.jsx'
import ElevatorDetail from './pages/ElevatorDetail.jsx'
import ScanCheckIn from './pages/ScanCheckIn.jsx'
import Plans from './pages/Plans.jsx'
import Repairs from './pages/Repairs.jsx'
import InspectionRemind from './pages/InspectionRemind.jsx'
import Records from './pages/Records.jsx'
import { getDashboard } from './api.js'

const { Header, Sider, Content } = Layout

const MENU = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/elevators', icon: <ApartmentOutlined />, label: '电梯档案' },
  { key: '/scan', icon: <ScanOutlined />, label: '扫码签到' },
  { key: '/plans', icon: <CalendarOutlined />, label: '维保计划' },
  { key: '/records', icon: <FileTextOutlined />, label: '保养记录' },
  { key: '/repairs', icon: <ToolOutlined />, label: '故障急修' },
  { key: '/inspection', icon: <SafetyCertificateOutlined />, label: '年检提醒' },
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [stats, setStats] = useState(null)

  const loadStats = () => getDashboard().then(setStats).catch(() => {})
  useEffect(() => { loadStats() }, [location.pathname])

  const selected = '/' + (location.pathname.split('/')[1] || 'dashboard')

  const menuItems = MENU.map((m) => {
    if (m.key === '/repairs' && stats?.repair_open > 0) {
      return { ...m, label: <span>故障急修 <Badge count={stats.repair_open} size="small" /></span> }
    }
    if (m.key === '/inspection' && stats && (stats.inspect_soon + stats.inspect_overdue) > 0) {
      return { ...m, label: <span>年检提醒 <Tag color={stats.inspect_overdue ? 'red' : 'orange'} style={{ marginLeft: 4 }}>{stats.inspect_soon + stats.inspect_overdue}</Tag></span> }
    }
    return m
  })

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" width={210} style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ color: '#fff', textAlign: 'center', padding: '18px 8px', fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>
          电梯维保管理
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)', position: 'sticky', top: 0, zIndex: 10,
        }}>
          <span style={{ fontSize: 15, color: '#555' }}>{MENU.find(m => m.key === selected)?.label || ''}</span>
          <span style={{ color: '#999', fontSize: 13 }}>
            维保单位：杭州安捷电梯工程有限公司 · 本地演示数据
          </span>
        </Header>
        <Content style={{ margin: 20 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard onRefresh={loadStats} />} />
            <Route path="/elevators" element={<Elevators />} />
            <Route path="/elevators/:id" element={<ElevatorDetail />} />
            <Route path="/scan" element={<ScanCheckIn />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/records" element={<Records />} />
            <Route path="/repairs" element={<Repairs />} />
            <Route path="/inspection" element={<InspectionRemind />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
