import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity, Clock, AlertCircle, ArrowRight,
    CheckCircle2, Inbox, CalendarClock, User
} from 'lucide-react';
import api from '../api/axios';

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const response = await api.get('/dashboard/stats');
                setData(response.data);
            } catch (error) {
                console.error("Error fetching dashboard:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, []);

    if (loading) return (
        <div className="flex h-64 items-center justify-center animate-fade-in-up">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    if (!data) return <div className="p-6 text-red-500 bg-red-50 rounded-xl font-bold">Failed to load clinical workspace.</div>;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up pb-10">

            {/* Welcome Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-2">
                    Welcome back, Dr. {data.doctor_name.split(' ')[0]}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium">
                    Here is your clinical worklist and pending diagnostic tasks for today.
                </p>
            </div>

            {/* Clinical Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Awaiting Review (Urgent/Action Required) */}
                <div
                    onClick={() => navigate('/viewer-list', { state: { status: 'Needs Review' } })}
                    className="bg-orange-50 dark:bg-orange-500/10 rounded-3xl p-6 border border-orange-200 dark:border-orange-500/20 cursor-pointer hover:shadow-lg hover:shadow-orange-500/10 transition-all group"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-orange-100 dark:bg-orange-500/20 p-3.5 rounded-2xl text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
                            <AlertCircle size={28} />
                        </div>
                    </div>
                    <p className="text-sm text-orange-700 dark:text-orange-400 font-bold mb-1">Needs Review</p>
                    <div className="flex items-end gap-3">
                        <h3 className="text-4xl font-extrabold text-orange-600 dark:text-orange-500">{data.cards.awaiting_review}</h3>
                        <p className="text-sm font-medium text-orange-600/70 dark:text-orange-400/70 mb-1">Scans pending</p>
                    </div>
                </div>

                {/* Processing (Waiting for AI) */}
                <div
                    onClick={() => navigate('/viewer-list', { state: { status: 'Processing' } })}
                    className="bg-amber-50 dark:bg-amber-500/10 rounded-3xl p-6 border border-amber-200 dark:border-amber-500/20 transition-all cursor-pointer hover:shadow-lg hover:shadow-amber-500/10 group"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-amber-100 dark:bg-amber-500/20 p-3.5 rounded-2xl text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                            <Clock size={28} />
                        </div>
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-400 font-bold mb-1">AI Processing</p>
                    <div className="flex items-end gap-3">
                        <h3 className="text-4xl font-extrabold text-amber-600 dark:text-amber-500">{data.cards.processing}</h3>
                        <p className="text-sm font-medium text-amber-600/70 dark:text-amber-400/70 mb-1">In background</p>
                    </div>
                </div>

                {/* Uploaded Today */}
                <div className="bg-blue-50 dark:bg-blue-500/10 rounded-3xl p-6 border border-blue-200 dark:border-blue-500/20 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-100 dark:bg-blue-500/20 p-3.5 rounded-2xl text-blue-600 dark:text-blue-400">
                            <CalendarClock size={28} />
                        </div>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-400 font-bold mb-1">Uploaded Today</p>
                    <div className="flex items-end gap-3">
                        <h3 className="text-4xl font-extrabold text-blue-600 dark:text-blue-500">{data.cards.today_uploads}</h3>
                        <p className="text-sm font-medium text-blue-600/70 dark:text-blue-400/70 mb-1">New volumes</p>
                    </div>
                </div>
            </div>

            {/* Worklist Split Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">

                {/* Left Column: Priority Cases */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <AlertCircle size={20} className="text-rose-500" /> Priority Worklist
                        </h3>
                        <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-bold px-3 py-1 rounded-full">
                            High AI Confidence
                        </span>
                    </div>

                    <div className="p-2 flex-1">
                        {data.priority_cases.length === 0 ? (
                            <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                                <CheckCircle2 size={48} className="mb-3 opacity-20" />
                                <p className="font-medium">No urgent cases pending review.</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {data.priority_cases.map((patient, i) => (
                                    <div key={i} onClick={() => navigate(`/scan-viewer/${patient.scan_id}`)} className="p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                                                {patient.patient_name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{patient.patient_name}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">ID: {patient.patient_tag}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-4">
                                            <div>
                                                <p className="text-xs font-bold text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md mb-1">
                                                    {patient.max_confidence}% Match
                                                </p>
                                                <p className="text-[11px] text-slate-400 font-medium">{patient.date}</p>
                                            </div>
                                            <ArrowRight size={18} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Recent Scans */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Activity size={20} className="text-blue-500" /> Recent Activity
                        </h3>
                    </div>

                    <div className="p-2 flex-1">
                        {data.recent_activity.length === 0 ? (
                            <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                                <Inbox size={48} className="mb-3 opacity-20" />
                                <p className="font-medium">No recent scans uploaded.</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {data.recent_activity.map((activity, i) => (
                                    <div key={i} onClick={() => navigate(activity.status === 'Completed' ? `/scan-viewer/${activity.scan_id}` : '/viewer-list')} className="p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
                                                <User size={18} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{activity.patient_name}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{activity.time_ago}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider
                                                ${activity.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' :
                                                    activity.status === 'Processing' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20' :
                                                        activity.status === 'Needs Review' ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20' :
                                                            'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'}`}>
                                                {activity.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}