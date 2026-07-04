import { TrendingUp, ArrowUpRight, AlertTriangle, UploadCloud, CheckCircle2, XCircle, Clock, UserPlus, Activity } from 'lucide-react';

export const formatDateTime = (iso) => {
    if (!iso || iso === 'Never') return 'Never';
    return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

export const getStatusBadge = (status) => {
    const map = {
        'Completed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
        'Processing': 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
        'Failed': 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
        'Unreviewed': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
};

export const getStatusDot = (status) => {
    const map = { 'Completed': 'bg-emerald-500', 'Processing': 'bg-amber-500', 'Failed': 'bg-rose-500', 'Unreviewed': 'bg-indigo-500' };
    return map[status] || 'bg-slate-400';
};

export const getActivityIcon = (type) => {
    if (type === 'scan_upload') return <UploadCloud size={14} className="text-blue-500" />;
    if (type === 'annotation_approved') return <CheckCircle2 size={14} className="text-emerald-500" />;
    if (type === 'annotation_rejected') return <XCircle size={14} className="text-rose-500" />;
    if (type === 'annotation_pending') return <Clock size={14} className="text-amber-500" />;
    if (type === 'login') return <UserPlus size={14} className="text-violet-500" />;
    return <Activity size={14} className="text-slate-400" />;
};

export const getActivityColor = (type) => {
    if (type === 'scan_upload') return 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-500/5';
    if (type === 'annotation_approved') return 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5';
    if (type === 'annotation_rejected') return 'border-l-rose-500 bg-rose-50/50 dark:bg-rose-500/5';
    if (type === 'annotation_pending') return 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-500/5';
    if (type === 'login') return 'border-l-violet-500 bg-violet-50/50 dark:bg-violet-500/5';
    return 'border-l-slate-400';
};

export function StatCard({ icon, label, value, accent, sub, children, trend }) {
    const bgColors = {
        blue: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200/60 dark:border-blue-500/20',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20',
        violet: 'bg-violet-50 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/20',
        amber: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20',
        rose: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20',
        cyan: 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200/60 dark:border-cyan-500/20',
        indigo: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200/60 dark:border-indigo-500/20',
    };
    const iconColors = {
        blue: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20',
        emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20',
        violet: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/20',
        amber: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20',
        rose: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20',
        cyan: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20',
        indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/20',
    };

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 hover:shadow-lg transition-all duration-300 group ${bgColors[accent] || 'border-slate-100 dark:border-slate-800'}`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform ${iconColors[accent] || ''}`}>
                        {icon}
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-white mt-1 tracking-tight">{value}</p>
                    {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{sub}</p>}
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${trend > 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' : 'text-rose-600 bg-rose-50 dark:bg-rose-500/10'}`}>
                        {trend > 0 ? <TrendingUp size={12} /> : <ArrowUpRight size={12} className="rotate-45" />}
                        {Math.abs(trend)}%
                    </div>
                )}
            </div>
            {children && <div className="mt-3">{children}</div>}
        </div>
    );
}

export function StatusPill({ label, color }) {
    const colors = {
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
        rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
        violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
    };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colors[color] || colors.blue}`}>{label}</span>;
}

export function MiniBarChart({ data, maxVal, color = 'bg-blue-500' }) {
    const max = maxVal || Math.max(...data.map(d => d.value), 1);
    return (
        <div className="flex items-end gap-1 h-16">
            {data.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-full rounded-t-md bg-slate-100 dark:bg-slate-800 overflow-hidden" style={{ height: '48px' }}>
                        <div className={`w-full rounded-t-md ${color} transition-all duration-700 ease-out`} style={{ height: `${(d.value / max) * 100}%`, marginTop: `${100 - (d.value / max) * 100}%` }}></div>
                    </div>
                    <span className="text-[8px] text-slate-400 font-bold">{d.label}</span>
                </div>
            ))}
        </div>
    );
}

export function ProgressBar({ value, max, color = 'blue' }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    const bgMap = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', violet: 'bg-violet-500', cyan: 'bg-cyan-500' };
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bgMap[color]} transition-all duration-500`} style={{ width: `${pct}%` }}></div>
            </div>
            <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{value}</span>
        </div>
    );
}

export function RiskBar({ label, value, color }) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-28 shrink-0">{label}</span>
            <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value > 0 ? Math.max(value, 4) : 0}%` }}></div>
            </div>
            <span className="text-xs font-black text-slate-800 dark:text-white w-6 text-right">{value}</span>
        </div>
    );
}

export function EmptyState({ icon, message }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            {icon}
            <p className="mt-3 text-sm font-medium">{message}</p>
        </div>
    );
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Delete', dangerColor = 'rose' }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onCancel}>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                <div className={`w-14 h-14 rounded-2xl bg-${dangerColor}-100 dark:bg-${dangerColor}-500/10 flex items-center justify-center mx-auto mb-5`}>
                    <AlertTriangle size={28} className={`text-${dangerColor}-500`} />
                </div>
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-white text-center mb-2">{title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">{message}</p>
                <div className="flex gap-3 mt-6">
                    <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                    <button onClick={onConfirm} className={`flex-1 px-4 py-2.5 rounded-xl bg-${dangerColor}-500 text-white font-bold text-sm hover:bg-${dangerColor}-600 transition-colors shadow-lg shadow-${dangerColor}-500/25`}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
}

export function SectionCard({ title, icon, iconColor, children, headerRight, className = '' }) {
    return (
        <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden ${className}`}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span className={iconColor || 'text-blue-500'}>{icon}</span> {title}
                </h3>
                {headerRight}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}