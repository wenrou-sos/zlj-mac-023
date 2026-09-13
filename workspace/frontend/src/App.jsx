import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Badge, Tag, Spin, Dropdown, Button } from 'antd'
import {
  DashboardOutlined, ApartmentOutlined, ScanOutlined, CalendarOutlined,
  ToolOutlined, SafetyCertificateOutlined, FileTextOutlined,
  UserOutlined, LogoutOutlined, InboxOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Elevators from './pages/Elevators.jsx'
import ElevatorDetail from './pages/ElevatorDetail.jsx'
import ArchivedElevators from './pages/ArchivedElevators.jsx'
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
  { key: '/archived', icon: <InboxOutlined />, label: '归档库', adminOnly: true },
  { key: '/scan', icon: <ScanOutlined />, label: '扫码签到' },
  { key: '/plans', icon: <CalendarOutlined />, label: '维保计划' },
  { key: '/records', icon: <FileTextOutlined />, label: '保养记录' },
  { key: '/repairs', icon: <ToolOutlined />, label: '故障急修' },
  { key: '/inspection', icon: <SafetyCertificateOutlined />, label: '年检提醒' },
]

export default function App() {
  const { user, ready, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [stats, setStats] = useState(null)

  const loadStats = () => getDashboard().then(setStats).catch(() => {})
  useEffect(() => { if (user) loadStats() }, [location.pathname, user])

  if (!ready) return <div style={{ paddingTop: 120, textAlign: 'center' }}><Spin size="large" /></div>
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (location.pathname === '/login') return <Navigate to="/dashboard" replace />

  const selected = '/' + (location.pathname.split('/')[1] || 'dashboard')

  const menuItems = MENU
    .filter((m) => !m.adminOnly || isAdmin)
    .map((m) => {
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
          <Dropdown
            menu={{
              items: [
                { key: 'role', label: `角色：${user.role}${user.worker_id ? `（绑定人员 #${user.worker_id}）` : ''}`, disabled: true },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); navigate('/login') } },
              ],
            }}
          >
            <Button type="text" icon={<UserOutlined />}>
              {user.name} <Tag color={isAdmin ? 'gold' : 'blue'} style={{ marginLeft: 6 }}>{user.role}</Tag>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 20 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/elevators" element={<Elevators />} />
            <Route path="/elevators/:id" element={<ElevatorDetail />} />
            <Route path="/archived" element={<ArchivedElevators />} />
            <Route path="/scan" element={<ScanCheckIn />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/records" element={<Records />} />
            <Route path="/repairs" element={<Repairs />} />
            <Route path="/inspection" element={<InspectionRemind />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
