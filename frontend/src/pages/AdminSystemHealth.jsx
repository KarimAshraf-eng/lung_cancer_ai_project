import { useState, useEffect, useCallback } from 'react';
import { Server, HardDrive, Database, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { SectionCard } from '../components/AdminShared';

export default function AdminSystemHealth() {
    const [storage, setStorage] = useState(null);
    const [loading, setLoading] = useState(true);

    // دالة جلب بيانات التخزين فقط
    const fetchSystemHealth = useCallback(async () => {
        try {
            const storageRes = await api.get('/admin/storage');
            setStorage(storageRes.data);
        } catch (err) {
            setStorage({ error: true });
        } finally {
            // نوقف شاشة التحميل بعد أول مرة فقط
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // جلب البيانات أول مرة
        fetchSystemHealth();

        // 1. تحديث تلقائي (Polling) كل 5 ثوانٍ
        const interval = setInterval(fetchSystemHealth, 5000);

        // 2. ربط الصفحة بـ WebSockets لتلقي الإشعارات اللحظية من السيرفر
        let ws;
        try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
            const wsUrl = baseUrl.replace(/^http/, 'ws');
            ws = new WebSocket(`${wsUrl}/ws/admin-updates`);
            ws.onmessage = () => {
                fetchSystemHealth(); // تحديث فوري عند وصول إشعار
            };
        } catch (e) {
            console.error("WebSocket connection failed", e);
        }

        // تنظيف عند الخروج من الصفحة
        return () => {
            clearInterval(interval);
            if (ws) ws.close();
        };
    }, [fetchSystemHealth]);

    if (loading && !storage) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up max-w-5xl mx-auto pb-10">
            <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    <Server size={24} className="text-blue-500" />
                    System Health Monitor
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Real-time monitoring of server storage capacity and database utilization.
                </p>
            </div>

            <SectionCard title="Storage & Database Utilization" icon={<HardDrive size={18} />} iconColor="text-cyan-500">
                {storage && !storage.error ? (
                    <div className="space-y-8 py-2">
                        {/* الإجمالي */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/20 rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center border border-cyan-200 dark:border-cyan-500/30">
                                    <Database size={28} className="text-cyan-600 dark:text-cyan-400" />
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                                        {storage.total_size_formatted}
                                    </p>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">
                                        Total Storage Used
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:items-end gap-1 border-l-0 sm:border-l border-slate-200 dark:border-slate-700 sm:pl-6">
                                <p className="text-xl font-bold text-slate-700 dark:text-slate-200">
                                    {storage.total_scans_in_db} <span className="text-sm font-medium text-slate-500">Scans in DB</span>
                                </p>
                                <p className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-lg">
                                    Avg {storage.avg_size_per_scan} / Scan
                                </p>
                            </div>
                        </div>

                        {/* التفاصيل (Uploads, Snapshots, Reports) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { label: 'CT Scans (Raw Data)', data: storage.uploads, color: 'bg-blue-500', text: 'text-blue-500', bgL: 'bg-blue-50 dark:bg-blue-500/5' },
                                { label: 'Generated Snapshots', data: storage.snapshots, color: 'bg-violet-500', text: 'text-violet-500', bgL: 'bg-violet-50 dark:bg-violet-500/5' },
                                { label: 'Medical PDF Reports', data: storage.reports, color: 'bg-emerald-500', text: 'text-emerald-500', bgL: 'bg-emerald-50 dark:bg-emerald-500/5' },
                            ].map(item => (
                                <div key={item.label} className={`p-5 rounded-2xl border border-slate-100 dark:border-slate-800 ${item.bgL}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{item.label}</span>
                                        <span className={`text-sm font-black ${item.text}`}>{item.data.percentage}%</span>
                                    </div>
                                    <div className="h-3 bg-white dark:bg-slate-900 rounded-full overflow-hidden shadow-inner mb-3">
                                        <div
                                            className={`h-full rounded-full ${item.color} transition-all duration-1000 ease-out`}
                                            style={{ width: `${item.data.percentage}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                        <span>{item.data.size_formatted}</span>
                                        <span>{item.data.file_count} Files</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center py-16">
                        {storage?.error ? (
                            <div className="text-center">
                                <HardDrive size={40} className="mx-auto text-rose-300 dark:text-rose-900/50 mb-3" />
                                <p className="text-sm font-bold text-rose-500">Failed to load storage metrics from server.</p>
                            </div>
                        ) : (
                            <Loader2 size={32} className="animate-spin text-slate-400" />
                        )}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}