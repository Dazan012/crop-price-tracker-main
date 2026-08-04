import axios from 'axios';

const API_BASE = `http://${window.location.hostname}:8000/api`;

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Skip redirect for logout/delete-account (token expected to be invalid)
      const url = err.config?.url || '';
      const skipRedirect = url.includes('/auth/logout/') || url.includes('/auth/delete-account/');
      if (!skipRedirect) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login/', data),
  register: (data) => api.post('/auth/register/', data),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/'),
  sendVerification: () => api.post('/auth/send-verification/'),
  verifyEmail: (code) => api.post('/auth/verify-email/', { code }),
  resendVerification: () => api.post('/auth/resend-verification/'),
  deleteAccount: (password) => api.post('/auth/delete-account/', { password }),
  changePassword: (data) => api.post('/auth/change-password/', data),
  setPassword: (data) => api.post('/auth/set-password/', data),
  forgotPassword: (email) => api.post('/auth/forgot-password/', { email }),
  resetPassword: (data) => api.post('/auth/reset-password/', data),
  updateProfile: (data) => api.patch('/auth/profile/', data),
  getPreferences: () => api.get('/auth/preferences/'),
  updatePreferences: (data) => api.patch('/auth/preferences/', data),
  // Frictionless auth (passwordless)
  sendMagicLink: (email) => api.post('/auth/magic-link/send/', { email }),
  verifyMagicLink: (token) => api.post('/auth/magic-link/verify/', { token }),
  sendPhoneCode: (phone) => api.post('/auth/phone/send-code/', { phone }),
  verifyPhoneCode: (phone, code) => api.post('/auth/phone/verify/', { phone, code }),
  googleAuth: (credential) => api.post('/auth/google/', { credential }),
  googleAuthCode: (code) => api.post('/auth/google/', { code }),
  completeOnboarding: (data) => api.post('/auth/complete-onboarding/', data),
  // Security
  loginHistory: () => api.get('/auth/login-history/'),
  accountStatus: () => api.get('/auth/account-status/'),
};

export const dataAPI = {
  regions: () => api.get('/regions/'),
  markets: (regionId) => api.get('/markets/', { params: regionId ? { region: regionId } : {} }),
  crops: (category) => api.get('/crops/', { params: category ? { category } : {} }),
  regionCrops: (region) => api.get('/region-crops/', { params: { region } }),
};

export const priceAPI = {
   list: (params) => api.get('/prices/', { params }),
   submit: (data) => api.post('/prices/submit/', data),
   delete: (id) => api.delete(`/prices/${id}/`),
   segments: (cropId, params) => api.get(`/prices/segments/${cropId}/`, { params }),
   ohlc: (params) => api.get('/prices/ohlc/', { params }),
   heatmap: (params) => api.get('/prices/heatmap/', { params }),
   forecast: (params) => api.get('/prices/forecast/', { params }),
 };

export const anomalyAPI = {
  list: () => api.get('/anomalies/'),
};

export const reviewAPI = {
  list: () => api.get('/reviews/'),
  review: (id, data) => api.post(`/reviews/${id}/`, data),
};

export const dashboardAPI = {
  stats: () => api.get('/dashboard/'),
};

export const forecastAPI = {
  crop: (cropId) => api.get(`/forecast/${cropId}/`),
  cropMarket: (cropId, marketId) => api.get(`/forecast/${cropId}/${marketId}/`),
  enhanced: (params) => api.get('/prices/forecast/', { params }),
};

export const agentAPI = {
  pending: () => api.get('/agents/pending/'),
  approve: (userId, data) => api.post(`/agents/${userId}/approve/`, data),
  submissions: (params) => api.get('/agent/submissions/', { params }),
  stats: () => api.get('/agent/stats/'),
  updateNote: (id, data) => api.patch(`/agent/submission/${id}/note/`, data),
};

export const recommendAPI = {
  list: () => api.get('/recommendations/'),
};

export const traderAPI = {
  spreadAnalysis: (params) => api.get('/spread-analysis/', { params }),
  supplyTracker: (params) => api.get('/supply-tracker/', { params }),
};

export const farmerAPI = {
  bestMarket: (params) => api.get('/best-market/', { params }),
  transportCost: (params) => api.get('/transport-cost/', { params }),
  calculateTransport: (params) => api.get('/calculate-transport/', { params }),
  multiStageTransport: (params) => api.post('/multi-stage-transport/', params),
  sellAdvisor: (params) => api.get('/sell-advisor/', { params }),
};

export const alertAPI = {
  list: () => api.get('/alerts/'),
  create: (data) => api.post('/alerts/create/', data),
  delete: (id) => api.delete(`/alerts/${id}/`),
  check: () => api.get('/alerts/check/'),
};

export const cooperativeAPI = {
  list: (params) => api.get('/cooperatives/', { params }),
  my: () => api.get('/cooperatives/my/'),
  create: (data) => api.post('/cooperatives/create/', data),
  join: (id) => api.post(`/cooperatives/${id}/join/`),
  leave: (id) => api.post(`/cooperatives/${id}/leave/`),
};

export const matchAPI = {
  list: (params) => api.get('/matches/', { params }),
  my: () => api.get('/matches/my/'),
  create: (data) => api.post('/matches/create/', data),
  cancel: (id) => api.post(`/matches/${id}/cancel/`),
};

export const adminAPI = {
  listUsers: () => api.get('/admin/users/'),
  updateUser: (userId, data) => api.patch(`/admin/users/${userId}/`, data),
};

export const transportDataAPI = {
  routes: () => api.get('/transport-routes/'),
  pricingRules: () => api.get('/pricing-rules/'),
};

export const notificationAPI = {
  list: (params) => api.get('/notifications/', { params }),
  summary: () => api.get('/notifications/summary/'),
  markRead: (id) => api.patch(`/notifications/${id}/read/`),
  markAllRead: () => api.post('/notifications/mark-all-read/'),
  create: (data) => api.post('/notifications/create/', data),
  seedDemo: () => api.post('/notifications/seed-demo/'),
};

export const searchAPI = {
  search: (params) => api.get('/search/', { params }),
};

export const weatherAPI = {
  list: (params) => api.get('/weather/', { params }),
  hourly: (params) => api.get('/weather/hourly/', { params }),
  alert: (region) => api.get('/weather/alert/', { params: { region } }),
  cropWeather: (params) => api.get('/weather/crop-weather/', { params }),
  checkNotifications: (data) => api.post('/weather/check-notifications/', data),
};

export const reportAPI = {
  downloadUrl: (fmt, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `/api/reports/${fmt}/${query ? `?${query}` : ''}`;
  },
  download: (fmt, params = {}) => {
    const query = new URLSearchParams(params).toString();
    window.open(`/api/reports/${fmt}/${query ? `?${query}` : ''}`, '_blank');
  },
};

export default api;
