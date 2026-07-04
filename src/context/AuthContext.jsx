import { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast'; // 🔴 إضافة toast
import api from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const checkSession = async () => {
            try {
                const response = await api.get('/auth/me');
                setUser(response.data);
            } catch (err) {
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        checkSession();
    }, []);

    const login = async (email, password) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('username', email);
            params.append('password', password);

            await api.post('/auth/login', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const userResponse = await api.get('/auth/me');
            setUser(userResponse.data);

            toast.success(`Welcome back, Dr. ${userResponse.data.name}!`); // 🔴 إشعار ترحيب
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.detail || "حدث خطأ أثناء تسجيل الدخول"); // 🔴 إشعار خطأ
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (err) {
            console.error(err);
        }
        setUser(null);
        toast.success("Logged out successfully.");
        navigate('/login');
    };

    return (
        <AuthContext.Provider value={{ user, setUser, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};