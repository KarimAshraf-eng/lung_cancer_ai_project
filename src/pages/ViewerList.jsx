import { useState, useEffect } from 'react';
import { Search, Activity, MonitorPlay, Filter, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function ViewerList() {
    const [historyList, setHistoryList] = useState([]);
    const [loadingList, setLoadingList] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    const fetchHistory = async () => {
        setLoadingList(true);
        try {
            const response = await api.get('/scans', {
                params: { page, limit: 10, search: searchTerm || undefined, status: statusFilter }
            });
            setHistoryList(response.data.data);
            setTotalPages(response.data.total_pages);
            setTotalItems(response.data.total_items);
        } catch (err) {
            toast.error("Failed to fetch history");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        if (location.state?.status) {
            setStatusFilter(location.state.status);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    useEffect(() => { setPage(1); }, [searchTerm, statusFilter]);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => { fetchHistory(); }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [page, searchTerm, statusFilter]);

    const handleDeleteScan = async (id) => {
        if (!window.confirm("Are you sure you want to permanently delete this scan? This action cannot be undone.")) return;

        const deleteToast = toast.loading("Deleting scan...");
        try {
            await api.delete(`/scans/${id}`);
            setHistoryList(prev => prev.filter(item => item.scan_id !== id));
            setTotalItems(prev => prev - 1);
            toast.success("Scan deleted permanently.", { id: deleteToast });
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to delete scan.", { id: deleteToast });
        }
    };

    const getStatusColor = (derivedStatus) => {
        if (derivedStatus === 'Needs Review') return 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20';
        if (derivedStatus === 'Completed') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20';
        if (derivedStatus === 'Processing') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20';
        return 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">Interactive AI Viewer</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Search for a patient to open their scans in the interactive diagnostic workspace.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 transition-colors">
                <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input type="text" placeholder="Search by Patient Name, ID, or Scan ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 dark:bg-slate-800 dark:text-white" />
                </div>

                <div className="md:w-64 relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Filter className="h-5 w-5 text-slate-400" />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block w-full pl-11 pr-10 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none transition-all bg-slate-50 dark:bg-slate-800 dark:text-white cursor-pointer font-medium text-slate-700 text-center">
                        <option value="All">All Statuses</option>
                        <option value="Needs Review">Needs Review</option>
                        <option value="Completed">Completed</option>
                        <option value="Processing">Processing</option>
                        <option value="Failed">Failed</option>
                    </select>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <Activity size={20} className="text-blue-500" /> Available Workspaces
                        <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 py-0.5 px-2.5 rounded-full text-xs ml-2">{totalItems} Total</span>
                    </h3>
                </div>

                <div className="flex-1 overflow-x-auto min-h-[300px]">
                    {loadingList ? (
                        <div className="p-12 text-center flex flex-col items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                        </div>
                    ) : historyList.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 dark:text-slate-400 h-full flex flex-col justify-center">
                            <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search size={24} className="text-slate-400 dark:text-slate-500" />
                            </div>
                            <p className="font-medium text-lg">No records found.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-sm border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-6 py-4 font-semibold text-center">ID</th>
                                    <th className="px-6 py-4 font-semibold text-center">Patient Name</th>
                                    <th className="px-6 py-4 font-semibold text-center">Upload Date</th>
                                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                                    <th className="px-6 py-4 font-semibold text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {historyList.map((item) => (
                                    <tr key={item.scan_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group">
                                        <td className="px-6 py-4 text-center">
                                            <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{item.patient_tag || 'N/A'}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <p className="font-bold text-slate-800 dark:text-slate-200">{item.patient_name}</p>
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">{item.upload_date}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${getStatusColor(item.derived_status)}`}>
                                                {item.derived_status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => navigate(`/scan-viewer/${item.scan_id}`)} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-500 font-bold text-sm transition-all duration-300 shadow-md shadow-slate-900/20 dark:shadow-blue-600/20">
                                                    <MonitorPlay size={16} /> Open Viewer
                                                </button>
                                                <button onClick={() => handleDeleteScan(item.scan_id)} className="inline-flex items-center justify-center p-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white font-bold text-sm transition-all duration-300 shadow-sm" title="Delete Scan">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {!loadingList && historyList.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                            Showing page <span className="font-bold text-slate-800 dark:text-slate-200">{page}</span> of <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"><ChevronLeft size={20} /></button>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"><ChevronRight size={20} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}