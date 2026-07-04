import { useState, useEffect, useCallback } from 'react';
import { Users, Heart, Zap, TrendingUp, Brain, Clock, Activity, ArrowUpRight, LogIn, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { StatCard, StatusPill, getStatusDot, getStatusBadge, formatDateTime, EmptyState } from '../components/AdminShared';

const PERIODS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_year', label: 'This Year' },
    { value: 'all', label: 'All Time' },
];

export default function AdminOverview() {
    const navigate = useNavigate();
    const [overview, setOverview] = useState(null);
    const [period, setPeriod] = useState('today');
    const [liveActivity, setLiveActivity] = useState([]);   // 🔴🔴 جديد: بدل recentLogins
    const [recentActivity, setRecentActivity] = useState([]);
    const [aiStatus, setAiStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchOverview = useCallback(async () => {
        try {
            const [overviewRes, activityRes, scansRes, aiRes] = await Promise.all([
                api.get('/admin/overview', { params: { period } }),
                api.get('/admin/recent-logins', { params: { limit: 20 } }),  // 🔴🔴 زي الـ limit لـ 20
                api.get('/admin/recent-activity'),
                api.get('/admin/ai-status'),
            ]);
            setOverview(overviewRes.data);
            setLiveActivity(activityRes.data);   // 🔴🔴 بدل recentLogins
            setRecentActivity(scansRes.data);
            setAiStatus(aiRes.data);
        } catch (err) {
            console.error("Failed to load overview data.");
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        fetchOverview();
        const interval = setInterval(fetchOverview, 2000);  // 🔴🔴 كل ثانيتين للتحديث اللحظي

        let ws;
        try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
            const wsUrl = baseUrl.replace(/^http/, 'ws');
            ws = new WebSocket(`${wsUrl}/ws/admin-updates`);
            ws.onmessage = () => {
                fetchOverview();  // تحديث فوري عند وصول أي إشعار (login/logout)
            };
        } catch (e) {
            console.error("WebSocket connection failed", e);
        }

        return () => {
            clearInterval(interval);
            if (ws) ws.close();
        };
    }, [fetchOverview]);

    if (loading && !overview) {
        return <div className="h-full flex items-center justify-center"><div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (!overview) return null;

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* الاحصائيات العلوية */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={<Users size={22} />} label="Doctors" value={overview.total_doctors} accent="blue" sub={`${overview.active_doctors} active now`} />
                <StatCard icon={<Heart size={22} />} label="Patients" value={overview.total_patients} accent="emerald" />
                <StatCard icon={<Zap size={22} />} label="Total Scans" value={overview.total_scans} accent="violet">
                    <div className="flex gap-1.5 flex-wrap">
                        <StatusPill label={`${overview.unreviewed_count || 0} Unreviewed`} color="violet" />
                        <StatusPill label={`${overview.processing_count} Running`} color="amber" />
                        {overview.failed_count > 0 && <StatusPill label={`${overview.failed_count} Failed`} color="rose" />}
                        {(overview.reviewed_count || 0) > 0 && <StatusPill label={`${overview.reviewed_count || 0} Completed`} color="emerald" />}
                    </div>
                </StatCard>
                <StatCard icon={<TrendingUp size={22} />} label="Period Scans" value={overview.scanned_count_in_period} accent="amber" sub={`${overview.scanned_patients_in_period} unique patients`} />
            </div>

            {/* حالة الذكاء الاصطناعي */}
            {aiStatus && (
                <div className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-700 text-white p-5 rounded-2xl shadow-lg shadow-indigo-500/20">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
                                <Brain size={28} className="text-white animate-pulse" />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold flex items-center gap-2">
                                    AI Model Status
                                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${aiStatus.is_busy ? 'bg-amber-500/30 text-amber-200' : 'bg-emerald-500/30 text-emerald-200'}`}>
                                        {aiStatus.is_busy ? 'Processing...' : 'Ready'}
                                    </span>
                                </h3>
                                <p className="text-indigo-200 text-sm mt-0.5">Queue: {aiStatus.queue_length} scans pending</p>
                            </div>
                        </div>
                        <div className="flex gap-6 text-center">
                            <div><p className="text-2xl font-black">{aiStatus.queue_length}</p><p className="text-[10px] text-indigo-200 uppercase font-bold">In Queue</p></div>
                            <div className="w-px bg-white/20"></div>
                            <div><p className="text-2xl font-black text-amber-300">{aiStatus.high_confidence_unreviewed}</p><p className="text-[10px] text-indigo-200 uppercase font-bold">Unreviewed</p></div>
                            <div className="w-px bg-white/20"></div>
                            <div><p className="text-2xl font-black text-rose-300">{aiStatus.stuck_processing}</p><p className="text-[10px] text-indigo-200 uppercase font-bold">Stuck</p></div>
                        </div>
                    </div>
                </div>
            )}

            {/* اختيار الفترة الزمنية */}
            <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <Clock size={14} className="text-slate-400 ml-1" />
                {PERIODS.map(p => (
                    <button key={p.value} onClick={() => setPeriod(p.value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === p.value ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/25' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{p.label}</button>
                ))}
            </div>

            {/* ════════════════════════════════════════════════════════════════
                🔴🔴 التعديل: "Live Doctor Activity" بدل "Recent Logins"
                بيراقب login + logout مع نقطة خضراء (online) ونقطة حمراء (offline)
            ════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Latest Scans */}
                <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col h-[600px]">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Activity size={16} className="text-violet-500" /> Latest Scans
                        </h3>
                        <button onClick={() => navigate('/admin/scans')} className="text-[10px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1">
                            View All <ArrowUpRight size={10} />
                        </button>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-slate-800/50 overflow-y-auto flex-1 custom-scrollbar">
                        {recentActivity.length === 0 ? (
                            <EmptyState icon={<Activity size={32} className="opacity-30" />} message="No scans recorded yet" />
                        ) : (
                            recentActivity.map((act, i) => (
                                <div key={i} className="px-6 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${getStatusDot(act.display_status || act.status)}`}></div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{act.patient_name}</p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">by Dr. {act.doctor_name} · <span className="font-mono">{act.patient_tag}</span></p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${getStatusBadge(act.display_status || act.status)}`}>{act.display_status || act.status}</span>
                                        <p className="text-[10px] text-slate-400 mt-1">{act.created_at}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 🔴🔴 Live Doctor Activity */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col h-[600px]">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Wifi size={16} className="text-emerald-500 animate-pulse" />
                                Live Doctor Activity
                            </h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Real-time login/logout monitoring</p>
                        </div>
                        <button
                            onClick={() => navigate('/admin/doctor-activity')}
                            className="text-[10px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1"
                        >
                            View All <ArrowUpRight size={10} />
                        </button>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-slate-800/50 overflow-y-auto flex-1 custom-scrollbar">
                        {liveActivity.length === 0 ? (
                            <p className="p-6 text-sm text-slate-400 text-center">No activity yet</p>
                        ) : (
                            liveActivity.map((evt, i) => {
                                const isLogin = evt.event_type === 'login';
                                const isOnline = evt.is_online;

                                return (
                                    <div key={i} className="px-5 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            {/* Avatar مع مؤشر online/offline */}
                                            <div className="relative shrink-0">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-200 dark:border-slate-600">
                                                    {evt.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                {/* 🔴🔴 نقطة خضراء (online) أو حمراء (offline) */}
                                                <span
                                                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${isOnline
                                                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                                                            : 'bg-rose-500'
                                                        }`}
                                                ></span>
                                            </div>

                                            {/* اسم الدكتور + نوع الحدث */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                                    {evt.name}
                                                    {isLogin ? (
                                                        <LogIn size={11} className="text-emerald-500 shrink-0" />
                                                    ) : (
                                                        <LogOut size={11} className="text-rose-400 shrink-0" />
                                                    )}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    {isLogin ? 'Logged in' : 'Logged out'} · {formatDateTime(evt.timestamp)}
                                                </p>
                                            </div>

                                            {/* حالة online/offline */}
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                <span className={`text-[9px] font-bold uppercase tracking-tight ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                                                    }`}>
                                                    {isOnline ? 'Online' : 'Offline'}
                                                </span>
                                                <span className={`text-[8px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${isLogin
                                                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                        : 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400'
                                                    }`}>
                                                    {isLogin ? 'IN' : 'OUT'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
