import { useState } from 'react'
import { Card, Form, Input, Button, Typography, Alert, Space, Divider } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

const { Title, Text } = Typography

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onFinish = async (v) => {
    setLoading(true); setError('')
    try {
      await login(v.username, v.password)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(e.response?.data?.detail || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const quick = async (username, password) => {
    setLoading(true); setError('')
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(e.response?.data?.detail || '登录失败')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1677ff22, #0958d911)',
    }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SafetyOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          <Title level={4} style={{ marginTop: 10, marginBottom: 4 }}>电梯维保管理系统</Title>
          <Text type="secondary">请使用账号登录</Text>
        </div>

        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

        <Form onFinish={onFinish} initialValues={{ username: 'admin', password: 'admin123' }} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>登 录</Button>
        </Form>

        <Divider style={{ margin: '16px 0 12px', fontSize: 12 }}>演示账号（点击快速登录）</Divider>
        <Space style={{ width: '100%', justifyContent: 'center' }}>
          <Button size="small" onClick={() => quick('admin', 'admin123')}>管理员 admin</Button>
          <Button size="small" onClick={() => quick('worker1', '123456')}>维保员 worker1</Button>
        </Space>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: 12 }}>
          维保员共 6 个账号：worker1 ~ worker6，密码均为 123456
        </Text>
      </Card>
    </div>
  )
}
