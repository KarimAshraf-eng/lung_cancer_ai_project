import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Brain, CheckCircle2, XCircle, Target, TrendingUp, AlertTriangle, ClipboardList, User, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { EmptyState, StatCard, SectionCard, RiskBar } from '../components/AdminShared';

export default function AdminAnalytics() {
    const [analytics, setAnalytics] = useState(null);
    const [aiAnalytics, setAiAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchAnalytics = useCallback(async () => {
        try {
            const [analyticsRes, aiAnalyticsRes] = await Promise.all([
                api.get('/admin/analytics'),
                api.get('/admin/ai-analytics'),
            ]);
            setAnalytics(analyticsRes.data);
            setAiAnalytics(aiAnalyticsRes.data);
        } catch (err) { toast.error('Failed to load analytics.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    if (loading) return <div className="h-full flex items-center justify-center"><div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;
    if (!analytics) return <EmptyState icon={<BarChart3 size={40} className="opacity-30" />} message="Analytics data will appear once scans are processed" />;

    // حساب نسب الذكور والإناث
    const genderData = analytics.demographics.gender_distribution || {};
    const maleCount = genderData['Male'] || 0;
    const femaleCount = genderData['Female'] || 0;
    const totalGender = maleCount + femaleCount || 1; // لتجنب القسمة على صفر
    const malePct = Math.round((maleCount / totalGender) * 100);
    const femalePct = Math.round((femaleCount / totalGender) * 100);

    return (
        <div className="space-y-6 animate-fade-in-up pb-10">
            <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">System Analytics</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Performance metrics and patient insights across the entire system.</p>
            </div>

            {/* AI Performance Summary */}
            {aiAnalytics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard icon={<Brain size={22} />} label="Total Detections" value={aiAnalytics.total_annotations} accent="violet" />
                    <StatCard icon={<CheckCircle2 size={22} />} label="Approval Rate" value={`${aiAnalytics.approval_rate}%`} accent="emerald" sub={`${aiAnalytics.approved} approved`} />
                    <StatCard icon={<XCircle size={22} />} label="False Positive" value={`${aiAnalytics.false_positive_rate}%`} accent="rose" sub={`${aiAnalytics.rejected} rejected`} />
                    <StatCard icon={<Target size={22} />} label="Avg Confidence" value={`${Math.round(aiAnalytics.avg_confidence * 100)}%`} accent="blue" sub={`${aiAnalytics.pending} pending review`} />
                </div>
            )}

            {/* AI Accuracy Breakdown */}
            {aiAnalytics && (
                <SectionCard title="AI Model Accuracy" icon={<Brain size={16} />} iconColor="text-violet-500">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-2">
                        <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-4 text-center border border-violet-200/60 dark:border-violet-500/20">
                            <p className="text-2xl font-black text-violet-700 dark:text-violet-400">{aiAnalytics.ai_analysis.total_ai_detections}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">AI Detections</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-200/60 dark:border-emerald-500/20">
                            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{aiAnalytics.ai_analysis.approval_rate}%</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">AI Approval Rate</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-500/10 rounded-xl p-4 text-center border border-rose-200/60 dark:border-rose-500/20">
                            <p className="text-2xl font-black text-rose-700 dark:text-rose-400">{aiAnalytics.ai_analysis.false_positive_rate}%</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">AI False Positive Rate</p>
                        </div>
                    </div>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Patient Demographics */}
                <SectionCard title="Patient Demographics" icon={<ClipboardList size={16} />} iconColor="text-cyan-500">
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 flex flex-col justify-center items-center text-center border border-slate-100 dark:border-slate-700/50">
                            <p className="text-4xl font-black text-slate-800 dark:text-white">{analytics.demographics.total_patients}</p>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-2">Total Patients</p>
                        </div>
                        <div className="grid grid-rows-2 gap-4">
                            <div className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl p-4 flex items-center justify-between border border-amber-100 dark:border-amber-500/20">
                                <div>
                                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Smokers</p>
                                    <p className="text-2xl font-black text-amber-700 dark:text-amber-400 leading-none mt-1">{analytics.demographics.smoker_percentage}%</p>
                                </div>
                            </div>
                            <div className="bg-rose-50 dark:bg-rose-500/10 rounded-2xl p-4 flex items-center justify-between border border-rose-100 dark:border-rose-500/20">
                                <div>
                                    <p className="text-[10px] font-bold text-rose-600 dark:text-rose-500 uppercase tracking-wider">Tumor History</p>
                                    <p className="text-2xl font-black text-rose-700 dark:text-rose-400 leading-none mt-1">{analytics.demographics.tumor_history_percentage}%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* Gender Split */}
                <SectionCard title="Gender Split" icon={<Users size={16} />} iconColor="text-pink-500">
                    <div className="flex flex-col justify-center h-full pt-2 pb-4">
                        <div className="flex items-center justify-between mb-8 px-2">
                            {/* Male Side */}
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-100 dark:border-blue-500/20 shadow-sm">
                                    <User size={28} />
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-slate-800 dark:text-white leading-none">{malePct}%</p>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1.5">Male ({maleCount})</p>
                                </div>
                            </div>

                            {/* Female Side */}
                            <div className="flex items-center gap-4 text-right flex-row-reverse">
                                <div className="w-14 h-14 rounded-2xl bg-pink-50 dark:bg-pink-500/10 text-pink-500 flex items-center justify-center border border-pink-100 dark:border-pink-500/20 shadow-sm">
                                    <User size={28} />
                                </div>
                                <div>
                                    <p className="text-3xl font-black text-slate-800 dark:text-white leading-none">{femalePct}%</p>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1.5">Female ({femaleCount})</p>
                                </div>
                            </div>
                        </div>

                        {/* Dual Progress Bar */}
                        <div className="relative w-full h-8 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 shadow-inner">
                            <div
                                className={`h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-1000 ease-out flex items-center ${malePct > 0 ? 'pl-4' : 'px-0'}`}
                                style={{ width: `${malePct}%`, opacity: malePct === 0 ? 0 : 1 }}
                            >
                                {malePct > 10 && <span className="text-xs font-bold text-white/90">{malePct}%</span>}
                            </div>
                            <div
                                className={`h-full bg-gradient-to-l from-pink-600 to-pink-400 transition-all duration-1000 ease-out flex items-center justify-end ${femalePct > 0 ? 'pr-4' : 'px-0'}`}
                                style={{ width: `${femalePct}%`, opacity: femalePct === 0 ? 0 : 1 }}
                            >
                                {femalePct > 10 && <span className="text-xs font-bold text-white/90">{femalePct}%</span>}
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* Nodule Risk Distribution */}
                <SectionCard title="Nodule Risk Distribution" icon={<AlertTriangle size={16} />} iconColor="text-rose-500" className="xl:col-span-2">
                    <div className="space-y-5 py-2">
                        {Object.entries(analytics.risk_distribution).map(([label, count]) => {
                            const colorMap = {
                                'Low (0-40%)': 'bg-emerald-500',
                                'Medium (40-70%)': 'bg-amber-500',
                                'High (70-90%)': 'bg-orange-500',
                                'Critical (90-100%)': 'bg-rose-500'
                            };
                            return <RiskBar key={label} label={label} value={count} color={colorMap[label]} />;
                        })}
                    </div>
                </SectionCard>

            </div>
        </div>
    );
}