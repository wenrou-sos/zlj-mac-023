import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const loadMe = () => {
    const token = localStorage.getItem('token')
    if (!token) { setReady(true); return Promise.resolve() }
    return axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setReady(true))
  }

  useEffect(() => { loadMe() }, [])

  const login = async (username, password) => {
    const { data } = await axios.post('/api/auth/login', { username, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, reload: loadMe,
      isAdmin: user?.role === '管理员' }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
