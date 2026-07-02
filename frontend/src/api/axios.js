import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
    baseURL: BACKEND_URL,
    // 🔴 هذا السطر سحري: يخبر axios بإرفاق الـ HttpOnly Cookies مع كل طلب 🔴
    withCredentials: true,
});

// لم نعد بحاجة لـ interceptor لإرسال التوكن، المتصفح سيفعل ذلك تلقائياً وبأمان!
export default api;