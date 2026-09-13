import axios from 'axios'

const api = axios.create({ baseURL: '/' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      if (!location.pathname.startsWith('/login')) location.href = '/login'
    }
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') {
      err.userMessage = detail
    } else if (detail && typeof detail === 'object' && detail.message) {
      // 409 冲突等结构化错误
      err.userMessage = detail.message
      err.conflict = detail
    } else {
      err.userMessage = err.message || '请求失败'
    }
    err.httpStatus = err.response?.status
    return Promise.reject(err)
  }
)

// 电梯档案
export const getElevators = (params) => api.get('/api/elevators', { params }).then(r => r.data)
export const getElevator = (id) => api.get(`/api/elevators/${id}`).then(r => r.data)
export const getElevatorByCode = (code) => api.get(`/api/elevators/code/${encodeURIComponent(code)}`).then(r => r.data)
export const createElevator = (data) => api.post('/api/elevators', data).then(r => r.data)
export const updateElevator = (id, data) => api.put(`/api/elevators/${id}`, data).then(r => r.data)
export const deleteElevator = (id) => api.delete(`/api/elevators/${id}`).then(r => r.data)
export const archiveElevator = (id, archive_type, reason) =>
  api.post(`/api/elevators/${id}/archive`, { archive_type, reason }).then(r => r.data)
export const restoreElevator = (id) =>
  api.post(`/api/elevators/${id}/restore`).then(r => r.data)

// 人员
export const getWorkers = () => api.get('/api/workers').then(r => r.data)
export const createWorker = (data) => api.post('/api/workers', data).then(r => r.data)

// 计划
export const getPlans = (scope = 'active') => api.get('/api/plans', { params: { scope } }).then(r => r.data)
export const createPlan = (data) => api.post('/api/plans', data).then(r => r.data)
export const togglePlan = (id) => api.put(`/api/plans/${id}/toggle`).then(r => r.data)

// 扫码签到 / 保养
export const checkIn = (data) => api.post('/api/maintenance/check-in', data).then(r => r.data)
export const takeOverRecord = (id, workerId) =>
  api.post(`/api/maintenance/records/${id}/take-over`, { worker_id: workerId }).then(r => r.data)
export const completeRecord = (id, data) => api.put(`/api/maintenance/records/${id}/complete`, data).then(r => r.data)
export const getRecords = (params) => api.get('/api/maintenance/records', { params }).then(r => r.data)

// 急修
export const getRepairs = (params) => api.get('/api/repairs', { params }).then(r => r.data)
export const createRepair = (data) => api.post('/api/repairs', data).then(r => r.data)
export const updateRepair = (id, data) => api.put(`/api/repairs/${id}`, data).then(r => r.data)

// 年检
export const getInspections = () => api.get('/api/inspections').then(r => r.data)
export const getExpiring = (days = 30) => api.get('/api/inspections/expiring', { params: { days } }).then(r => r.data)
export const createInspection = (data) => api.post('/api/inspections', data).then(r => r.data)
export const getElevatorInspections = (id) => api.get(`/api/elevators/${id}/inspections`).then(r => r.data)

// 仪表盘
export const getDashboard = () => api.get('/api/dashboard').then(r => r.data)

export const qrUrl = (code) => `/api/qrcode/${encodeURIComponent(code)}`
