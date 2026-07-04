import { useState, useEffect, useCallback } from 'react';
import { Search, ScanSearch, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { EmptyState, ConfirmModal, getStatusBadge } from '../components/AdminShared';

const SCAN_STATUS_FILTERS = [
    { value: '', label: 'All Status' }, { value: 'Processing', label: 'Processing' },
    { value: 'Unreviewed', label: 'Unreviewed' }, { value: 'Completed', label: 'Completed' },
    { value: 'Failed', label: 'Failed' },
];

export default function AdminScans() {
    const [scans, setScans] = useState([]);
    const [scansTotal, setScansTotal] = useState(0);
    const [scanFilter, setScanFilter] = useState('');
    const [scanSearch, setScanSearch] = useState('');
    const [scanDeleteTarget, setScanDeleteTarget] = useState(null);
    const [scanPage, setScanPage] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchScans = useCallback(async () => {
        try {
            const res = await api.get('/admin/scans', {
                params: { status: scanFilter || undefined, search: scanSearch || undefined, limit: 50, offset: scanPage * 50 },
            });
            setScans(res.data.scans);
            setScansTotal(res.data.total);
        } catch (err) { toast.error('Failed to load scans.'); }
        finally { setLoading(false); }
    }, [scanFilter, scanSearch, scanPage]);

    useEffect(() => { fetchScans(); }, [fetchScans]);

    const confirmDeleteScan = async () => {
        if (!scanDeleteTarget) return;
        try {
            const res = await api.delete(`/admin/scans/${scanDeleteTarget.scan_id}`);
            toast.success(res.data.message);
            fetchScans();
            setScanDeleteTarget(null);
        } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); setScanDeleteTarget(null); }
    };

    if (loading) return <div className="h-full flex items-center justify-center"><div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div><h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">Scan Oversight</h2><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Monitor and manage all scans across the entire system.</p></div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative max-w-md flex-1">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search by patient name..." value={scanSearch} onChange={(e) => { setScanSearch(e.target.value); setScanPage(0); }} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    {SCAN_STATUS_FILTERS.map(f => (
                        <button key={f.value} onClick={() => { setScanFilter(f.value); setScanPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${scanFilter === f.value ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{f.label}</button>
                    ))}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-bold">{scansTotal} scans total</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead><tr className="bg-slate-50/80 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 text-xs border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider">
                            <th className="px-4 py-3 font-semibold">Patient</th>
                            <th className="px-3 py-3 font-semibold">ID</th>
                            <th className="px-4 py-3 font-semibold">Doctor</th>
                            <th className="px-3 py-3 font-semibold text-center">Status</th>
                            <th className="px-3 py-3 font-semibold text-center">Nodules</th>
                            <th className="px-3 py-3 font-semibold text-center">Max Conf.</th>
                            <th className="px-3 py-3 font-semibold text-center">Date</th>
                            <th className="px-4 py-3 font-semibold text-right">Action</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {scans.map((s, i) => (
                                <tr key={i} className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors">
                                    <td className="px-4 py-3"><p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{s.patient_name}</p></td>
                                    <td className="px-3 py-3"><p className="text-[10px] text-slate-500 font-mono">{s.patient_id_tag}</p></td>
                                    <td className="px-4 py-3"><p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Dr. {s.doctor_name}</p></td>
                                    <td className="px-3 py-3 text-center"><span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${getStatusBadge(s.display_status || s.status)}`}>{s.display_status || s.status}</span></td>
                                    <td className="px-3 py-3 text-center font-bold text-sm text-slate-800 dark:text-slate-200">{s.annotation_count}</td>
                                    <td className="px-3 py-3 text-center"><span className={`text-xs font-bold ${s.max_confidence > 0.9 ? 'text-rose-600' : s.max_confidence > 0.7 ? 'text-amber-600' : 'text-slate-500'}`}>{s.max_confidence ? `${Math.round(s.max_confidence * 100)}%` : '-'}</span></td>
                                    <td className="px-3 py-3 text-center text-[11px] text-slate-500">{s.created_at}</td>
                                    <td className="px-4 py-3 text-right"><button onClick={() => setScanDeleteTarget(s)} className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white dark:bg-rose-900/20 dark:text-rose-400 transition-all" title="Delete"><Trash2 size={14} /></button></td>
                                </tr>
                            ))}
                            {scans.length === 0 && <tr><td colSpan={8}><EmptyState icon={<ScanSearch size={32} className="opacity-30" />} message="No scans found" /></td></tr>}
                        </tbody>
                    </table>
                </div>
                {scansTotal > 50 && (
                    <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-center gap-2">
                        <button onClick={() => setScanPage(p => Math.max(0, p - 1))} disabled={scanPage === 0} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-all">Previous</button>
                        <span className="px-3 py-1.5 text-xs font-bold text-slate-500">Page {scanPage + 1} of {Math.ceil(scansTotal / 50)}</span>
                        <button onClick={() => setScanPage(p => p + 1)} disabled={(scanPage + 1) * 50 >= scansTotal} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-all">Next</button>
                    </div>
                )}
            </div>
            <ConfirmModal isOpen={!!scanDeleteTarget} title="Emergency Delete Scan?" message={`This will permanently delete scan #${scanDeleteTarget?.scan_id || ''} for patient ${scanDeleteTarget?.patient_name || ''}.`} onConfirm={confirmDeleteScan} onCancel={() => setScanDeleteTarget(null)} confirmText="Delete Scan" />
        </div>
    );
}