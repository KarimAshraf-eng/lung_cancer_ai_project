import { useState, useEffect, useCallback } from 'react';
import {
    Activity, Search, ArrowLeft, ChevronRight, LogIn, LogOut,
    Wifi, WifiOff, Eye, Clock, Calendar, User, Mail,
    TrendingUp, LogOut as LogoutIcon, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { EmptyState, formatDateTime } from '../components/AdminShared';

export default function DoctorActivity() {
    const [view, setView] = useState('list');   // 'list' أو 'detail'
    const [doctors, setDoctors] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // حالة التفاصيل
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [historyData, setHistoryData] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // ════════════════════════════════════════════════════════════════════
    // جلب قائمة كل الدكاترة مع حالة online/offline
    // ════════════════════════════════════════════════════════════════════
    const fetchDoctors = useCallback(async (searchQuery = '') => {
        try {
            const res = await api.get('/admin/doctor-activity', {
                params: { search: searchQuery || undefined }
            });
            setDoctors(res.data);
        } catch (err) {
            toast.error('Failed to load doctors activity.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDoctors();
        // 🔴🔴 Polling كل 5 ثواني للتحديث اللحظي لحالة الـ online/offline
        const interval = setInterval(() => fetchDoctors(search), 5000);

        // WebSocket للتحديث الفوري عند login/logout جديد
        let ws;
        try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
            const wsUrl = baseUrl.replace(/^http/, 'ws');
            ws = new WebSocket(`${wsUrl}/ws/admin-updates`);
            ws.onmessage = () => fetchDoctors(search);
        } catch (e) {
            console.error('WebSocket connection failed', e);
        }

        return () => {
            clearInterval(interval);
            if (ws) ws.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // debounce للبحث
    useEffect(() => {
        const timer = setTimeout(() => {
            if (view === 'list') fetchDoctors(search);
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, view]);

    // ════════════════════════════════════════════════════════════════════
    // جلب سجل login/logout كامل لدكتور معين
    // ════════════════════════════════════════════════════════════════════
    const fetchDoctorHistory = useCallback(async (doctorId) => {
        setLoadingHistory(true);
        try {
            const res = await api.get(`/admin/doctors/${doctorId}/login-history`, {
                params: { limit: 100 }
            });
            setHistoryData(res.data);
        } catch (err) {
            toast.error('Failed to load doctor login history.');
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    const handleViewHistory = (doctor) => {
        setSelectedDoctor(doctor);
        setView('detail');
        fetchDoctorHistory(doctor.id);
    };

    const handleBackToList = () => {
        setView('list');
        setSelectedDoctor(null);
        setHistoryData(null);
        // refresh الـ list عشان نشوف آخر حالة
        fetchDoctors(search);
    };

    // ════════════════════════════════════════════════════════════════════
    // VIEW: صفحة التفاصيل (سجل دكتور معين)
    // ════════════════════════════════════════════════════════════════════
    if (view === 'detail') {
        return (
            <div className="space-y-6 animate-fade-in-up pb-10">
                {/* زرار الرجوع */}
                <button
                    onClick={handleBackToList}
                    className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors bg-white dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md"
                >
                    <ArrowLeft size={16} />
                    <span className="text-sm">Back to Doctor Activity</span>
                </button>

                {loadingHistory ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : !historyData ? (
                    <EmptyState
                        icon={<User size={40} className="opacity-30" />}
                        message="Unable to load login history"
                    />
                ) : (
                    <>
                        {/* ═══ بطاقة معلومات الدكتور ═══ */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                            <div className={`absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full blur-3xl pointer-events-none ${historyData.doctor_info.is_online
                                    ? 'bg-emerald-500/10 dark:bg-emerald-500/5'
                                    : 'bg-rose-500/10 dark:bg-rose-500/5'
                                }`}></div>

                            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10">
                                {/* Avatar مع مؤشر الحالة */}
                                <div className="relative shrink-0">
                                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0 border ${historyData.doctor_info.is_online
                                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                        }`}>
                                        {historyData.doctor_info.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white dark:border-slate-900 ${historyData.doctor_info.is_online
                                            ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                                            : 'bg-rose-500'
                                        }`}></span>
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white">
                                            Dr. {historyData.doctor_info.name}
                                        </h3>
                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${historyData.doctor_info.is_online
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                                                : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
                                            }`}>
                                            {historyData.doctor_info.is_online ? '● Online Now' : '● Offline'}
                                        </span>
                                        {!historyData.doctor_info.is_active && (
                                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                                                Suspended
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1.5">
                                            <Mail size={14} className="text-slate-400" /> {historyData.doctor_info.email}
                                        </span>
                                        <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                        <span className="flex items-center gap-1.5">
                                            <Calendar size={14} className="text-slate-400" /> Joined {historyData.doctor_info.created_at}
                                        </span>
                                        {historyData.doctor_info.last_login && (
                                            <>
                                                <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                                <span className="flex items-center gap-1.5">
                                                    <Clock size={14} className="text-slate-400" /> Last login: {formatDateTime(historyData.doctor_info.last_login)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ═══ إحصائيات سريعة ═══ */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl p-5 border border-emerald-200/60 dark:border-emerald-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <LogIn size={16} className="text-emerald-600 dark:text-emerald-400" />
                                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Logins</p>
                                </div>
                                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{historyData.stats.total_logins}</p>
                            </div>
                            <div className="bg-rose-50 dark:bg-rose-500/10 rounded-2xl p-5 border border-rose-200/60 dark:border-rose-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <LogOut size={16} className="text-rose-600 dark:text-rose-400" />
                                    <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Total Logouts</p>
                                </div>
                                <p className="text-3xl font-black text-rose-700 dark:text-rose-400">{historyData.stats.total_logouts}</p>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-5 border border-blue-200/60 dark:border-blue-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity size={16} className="text-blue-600 dark:text-blue-400" />
                                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Events</p>
                                </div>
                                <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{historyData.stats.events_returned}</p>
                            </div>
                            <div className={`rounded-2xl p-5 border ${historyData.doctor_info.is_online
                                    ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/20'
                                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-700/50'
                                }`}>
                                <div className="flex items-center gap-2 mb-2">
                                    {historyData.doctor_info.is_online
                                        ? <Wifi size={16} className="text-violet-600 dark:text-violet-400" />
                                        : <WifiOff size={16} className="text-slate-500" />
                                    }
                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${historyData.doctor_info.is_online
                                            ? 'text-violet-600 dark:text-violet-400'
                                            : 'text-slate-500'
                                        }`}>Current Status</p>
                                </div>
                                <p className={`text-3xl font-black ${historyData.doctor_info.is_online
                                        ? 'text-violet-700 dark:text-violet-400'
                                        : 'text-slate-600 dark:text-slate-400'
                                    }`}>
                                    {historyData.doctor_info.is_online ? 'Active' : 'Away'}
                                </p>
                            </div>
                        </div>

                        {/* ═══ الجدول الزمني الكامل للأحداث ═══ */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Clock size={20} className="text-blue-500" />
                                    Complete Login/Logout History
                                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 py-0.5 px-2.5 rounded-full text-xs ml-2">
                                        {historyData.history.length} Events
                                    </span>
                                </h3>
                            </div>

                            <div className="p-6">
                                {historyData.history.length === 0 ? (
                                    <EmptyState
                                        icon={<Clock size={32} className="opacity-30" />}
                                        message="No login/logout events recorded"
                                    />
                                ) : (
                                    <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-5 pb-4">
                                        {historyData.history.map((evt, idx) => {
                                            const isLogin = evt.event_type === 'login';
                                            return (
                                                <div key={idx} className="relative pl-8">
                                                    {/* النقطة على الـ timeline */}
                                                    <div className={`absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-white dark:border-slate-900 shadow-sm ${isLogin ? 'bg-emerald-500' : 'bg-rose-500'
                                                        }`}></div>

                                                    <div className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${isLogin
                                                            ? 'border-emerald-100 dark:border-emerald-500/20'
                                                            : 'border-rose-100 dark:border-rose-500/20'
                                                        }`}>
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isLogin
                                                                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                                                        : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'
                                                                    }`}>
                                                                    {isLogin ? <LogIn size={18} /> : <LogOut size={18} />}
                                                                </div>
                                                                <div>
                                                                    <p className={`text-sm font-bold ${isLogin
                                                                            ? 'text-emerald-700 dark:text-emerald-400'
                                                                            : 'text-rose-700 dark:text-rose-400'
                                                                        }`}>
                                                                        {isLogin ? 'Doctor Logged In' : 'Doctor Logged Out'}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                                                                        <Clock size={11} />
                                                                        {formatDateTime(evt.timestamp)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {evt.ip_address && (
                                                                <div className="text-right">
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">IP Address</p>
                                                                    <p className="text-xs font-mono text-slate-600 dark:text-slate-300">{evt.ip_address}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════
    // VIEW: القائمة الرئيسية (كل الدكاترة)
    // ════════════════════════════════════════════════════════════════════
    return (
        <div className="space-y-6 animate-fade-in-up pb-10">
            {/* العنوان والوصف */}
            <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    <Activity size={24} className="text-blue-500" />
                    Doctor Activity Monitor
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Real-time monitoring of doctor online/offline status and complete login/logout history.
                </p>
            </div>

            {/* شريط البحث */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 transition-colors">
                <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search doctors by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="block w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 dark:bg-slate-800 dark:text-white"
                    />
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Auto-refreshing every 5s
                </div>
            </div>

            {/* قائمة الدكاترة */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <User size={20} className="text-blue-500" /> All Doctors
                        <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 py-0.5 px-2.5 rounded-full text-xs ml-2">
                            {doctors.length} Total
                        </span>
                        <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 py-0.5 px-2.5 rounded-full text-xs ml-1">
                            {doctors.filter(d => d.is_online).length} Online
                        </span>
                    </h3>
                </div>

                <div className="flex-1 overflow-x-auto min-h-[300px]">
                    {loading ? (
                        <div className="p-12 text-center flex flex-col items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-sm text-slate-500">Loading doctors...</p>
                        </div>
                    ) : doctors.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 dark:text-slate-400 h-full flex flex-col justify-center">
                            <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search size={24} className="text-slate-400 dark:text-slate-500" />
                            </div>
                            <p className="font-medium text-lg">No doctors found.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-sm border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-6 py-4 font-semibold text-center">Doctor</th>
                                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                                    <th className="px-6 py-4 font-semibold text-center">Last Event</th>
                                    <th className="px-6 py-4 font-semibold text-center">Last Login</th>
                                    <th className="px-6 py-4 font-semibold text-center">Login Count</th>
                                    <th className="px-6 py-4 font-semibold text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {doctors.map((doc) => (
                                    <tr
                                        key={doc.id}
                                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group ${!doc.is_active ? 'opacity-60' : ''
                                            }`}
                                    >
                                        {/* Doctor info */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="relative shrink-0">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border ${doc.is_online
                                                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                                        }`}>
                                                        {doc.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${doc.is_online
                                                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                                                            : 'bg-rose-500'
                                                        }`}></span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">Dr. {doc.name}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{doc.email}</p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Online/Offline status */}
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${doc.is_online
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${doc.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                                                    }`}></span>
                                                {doc.is_online ? 'Online' : 'Offline'}
                                            </span>
                                            {!doc.is_active && (
                                                <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1 font-bold uppercase">Suspended</p>
                                            )}
                                        </td>

                                        {/* Last event type */}
                                        <td className="px-6 py-4 text-center">
                                            {doc.last_event_type ? (
                                                <span className={`inline-flex items-center gap-1 text-xs font-bold ${doc.last_event_type === 'login'
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : 'text-rose-500 dark:text-rose-400'
                                                    }`}>
                                                    {doc.last_event_type === 'login'
                                                        ? <><LogIn size={12} /> Login</>
                                                        : <><LogOut size={12} /> Logout</>
                                                    }
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                            {doc.last_event_time && (
                                                <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(doc.last_event_time)}</p>
                                            )}
                                        </td>

                                        {/* Last login time */}
                                        <td className="px-6 py-4 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                                            {doc.last_login ? formatDateTime(doc.last_login) : 'Never'}
                                        </td>

                                        {/* Login count */}
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-100 dark:border-blue-500/20">
                                                <TrendingUp size={12} className="text-blue-500" />
                                                <span className="text-sm font-bold text-blue-700 dark:text-blue-400">{doc.login_count}</span>
                                            </div>
                                        </td>

                                        {/* Action: View button */}
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleViewHistory(doc)}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 font-bold text-xs transition-all duration-300 shadow-sm"
                                            >
                                                <Eye size={14} /> View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
