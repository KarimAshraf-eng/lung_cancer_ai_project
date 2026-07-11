import { useState, useEffect, useContext, useCallback, memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Activity, Eye, Filter, Check, Download, Save, ArrowLeft, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { ScanProcessingContext } from '../context/ScanProcessingContext';
import ConfirmDialog from '../components/ConfirmDialog';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// ════════════════════════════════════════════════════════════════════
// 🔴🔴🔴 التعديل: إخراج SymptomBlock بره الـ Main Component
// ════════════════════════════════════════════════════════════════════
// المشكلة: كان جوه الـ Reports component، فكل ما الـ state يتغير،
// كان بيتعمله re-create من جديد، فالـ input كان بيفقد الـ focus.
// الحل: إخراجه بره الـ component كـ memoized component مستقل.
// ════════════════════════════════════════════════════════════════════
const SymptomBlock = memo(({ label, checkName, detailName, checked, detailValue, onChange, isRose }) => (
    <div className={`p-4 rounded-xl border transition-colors ${checked ? (isRose ? 'border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/10' : 'border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/10') : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'}`}>
        <label className="flex items-center gap-2 cursor-pointer mb-1">
            <input
                type="checkbox"
                name={checkName}
                checked={checked || false}
                onChange={onChange}
                className={`w-5 h-5 rounded dark:bg-slate-700 dark:border-slate-600 ${isRose ? 'text-rose-500' : 'text-blue-600'}`}
            />
            <span className={`font-bold text-sm ${isRose ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>{label}</span>
        </label>
        {checked && (
            <div className="mt-3 animate-fade-in-up">
                <input
                    type="text"
                    name={detailName}
                    value={detailValue || ''}
                    onChange={onChange}
                    placeholder={`Type details for ${label.toLowerCase()}...`}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-white dark:bg-slate-900 dark:text-white transition-colors"
                />
            </div>
        )}
    </div>
));

export default function Reports() {
    const navigate = useNavigate();
    const location = useLocation();
    const { startTracking } = useContext(ScanProcessingContext);

    const [view, setView] = useState('list');
    const [selectedScanId, setSelectedScanId] = useState(null);

    const [historyList, setHistoryList] = useState([]);
    const [loadingList, setLoadingList] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [scanData, setScanData] = useState(null);
    const [patientData, setPatientData] = useState({});
    const [annotations, setAnnotations] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [saving, setSaving] = useState(false);

    const [reanalyzeDialog, setReanalyzeDialog] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    useEffect(() => {
        if (location.state?.scanId) {
            handleOpenReport(location.state.scanId);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state]);

    const fetchHistory = async () => {
        setLoadingList(true);
        try {
            const response = await api.get('/scans', {
                params: {
                    page: page,
                    limit: 10,
                    search: searchTerm || undefined,
                    status: statusFilter
                }
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

    useEffect(() => { setPage(1); }, [searchTerm, statusFilter]);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (view === 'list') fetchHistory();
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [view, page, searchTerm, statusFilter]);

    const handleOpenReport = (id) => {
        setSelectedScanId(id);
        setView('details');
        fetchDetails(id);
    };

    const handleBackToList = () => {
        setSelectedScanId(null);
        setView('list');
    };

    const fetchDetails = async (id) => {
        setLoadingDetails(true);
        try {
            // 🔴🔴 التعديل: بنبعت include_rejected=true عشان نجيب كل الأورام (حتى الـ Rejected)
            const response = await api.get(`/scans/${id}/results?include_rejected=true`);
            setScanData(response.data);
            if (response.data.status === 'Completed') {
                setPatientData(response.data.patient_details);
                setAnnotations(response.data.results.sort((a, b) => a.slice_number - b.slice_number));
            }
        } catch (err) {
            toast.error("Failed to load report details.");
        } finally {
            setLoadingDetails(false);
        }
    };

    // 🔴🔴🔴 استخدام useCallback عشان نمنع الـ re-renders الغير ضرورية
    const handlePatientChange = useCallback((e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setPatientData(prev => ({ ...prev, [e.target.name]: value }));
    }, []);

    const toggleNoduleStatus = (id, newStatus) => {
        setAnnotations(prev => prev.map(ann => ann.id === id ? { ...ann, status: newStatus } : ann));
    };

    const handleSaveAll = async () => {
        setSaving(true);
        const saveToast = toast.loading('Saving changes...');
        try {
            const safePayload = {
                name: patientData.name || '',
                age: Number(patientData.age) || 0,
                gender: patientData.gender || 'Male',
                has_previous_tumors: patientData.has_previous_tumors || false,
                prev_tumors_details: patientData.prev_tumors_details || null,
                occupational_exposure: patientData.occupational_exposure || false,
                occ_exposure_details: patientData.occ_exposure_details || null,
                chest_pain_complaint: patientData.chest_pain_complaint || false,
                chest_pain_details: patientData.chest_pain_details || null,
                chronic_cough: patientData.chronic_cough || false,
                chronic_cough_details: patientData.chronic_cough_details || null,
                coughing_blood: patientData.coughing_blood || false,
                coughing_blood_details: patientData.coughing_blood_details || null,
                weight_loss: patientData.weight_loss || false,
                weight_loss_details: patientData.weight_loss_details || null,
                previous_chest_diseases: patientData.previous_chest_diseases || null,
                is_smoker: patientData.is_smoker || false,
                pack_years: patientData.pack_years ? Number(patientData.pack_years) : 0,
                smoking_cessation_date: patientData.smoking_cessation_date || null,
                family_history: patientData.family_history || null,
                doctor_notes: patientData.doctor_notes || null
            };

            await api.put(`/scans/${selectedScanId}/patient`, safePayload);

            const updatePromises = annotations.map(ann =>
                api.put(`/scans/${selectedScanId}/annotations/${ann.id}`, {
                    status: ann.status,
                    coord_x: ann.coord_x,
                    coord_y: ann.coord_y,
                    start_slice: ann.start_slice,
                    end_slice: ann.end_slice
                })
            );
            await Promise.all(updatePromises);

            toast.success("All changes saved successfully!", { id: saveToast });
            // 🔴🔴🔴 التعديل: نشيل fetchDetails عشان الـ Rejected يفضل ظاهر في الـ UI
            // الـ state المحلي فيه بالفعل الـ status الجديد (Rejected/Approved)
        } catch (err) {
            console.error("Save Error:", err.response?.data);
            toast.error("An error occurred while saving.", { id: saveToast });
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadPDF = async () => {
        const downloadToast = toast.loading('Generating PDF...');
        try {
            // 🔴🔴🔴 التعديل: إضافة timestamp عشان نتجنب الـ browser caching
            const response = await api.get(`/reports/${selectedScanId}/get-pdf-data?t=${Date.now()}`);
            const { filename, pdf_base64 } = response.data;

            const link = document.createElement('a');
            link.href = `data:application/pdf;base64,${pdf_base64}`;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();

            setTimeout(() => document.body.removeChild(link), 200);

            toast.success('PDF downloaded successfully!', { id: downloadToast });
        } catch (err) {
            toast.error('Error downloading PDF.', { id: downloadToast, duration: 6000 });
        }
    };

    const handleReanalyze = async () => {
        const reanalyzeToast = toast.loading('Starting re-analysis...');
        try {
            const res = await api.post(`/scans/${selectedScanId}/reanalyze`);
            const deletedCount = res.data.deleted_annotations;
            startTracking(selectedScanId, patientData.name || 'Patient');
            toast.success(`Re-analysis started! ${deletedCount} old nodules removed.`, { id: reanalyzeToast, duration: 5000 });
            setTimeout(() => navigate(`/scan-viewer/${selectedScanId}`), 2000);
        } catch (err) {
            toast.error("Failed to start re-analysis.", { id: reanalyzeToast, duration: 5000 });
        }
    };

    const openDeleteDialog = (id, e) => {
        if (e) e.stopPropagation();
        setDeleteTargetId(id);
        setDeleteDialog(true);
    };

    const handleDeleteScan = async () => {
        const deleteToast = toast.loading('Deleting scan...');
        try {
            await api.delete(`/scans/${deleteTargetId}`);
            setHistoryList(prev => prev.filter(item => item.scan_id !== deleteTargetId));
            setTotalItems(prev => prev - 1);
            toast.success("Scan deleted successfully.", { id: deleteToast });
            if (view === 'details' && selectedScanId === deleteTargetId) {
                handleBackToList();
            }
        } catch (err) {
            toast.error("Failed to delete scan.", { id: deleteToast });
        } finally {
            setDeleteDialog(false);
            setDeleteTargetId(null);
        }
    };

    const getStatusColor = (derivedStatus) => {
        if (derivedStatus === 'Needs Review') return 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20';
        if (derivedStatus === 'Completed') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20';
        if (derivedStatus === 'Processing') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20';
        return 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20';
    };

    // ==========================================
    // 1. LIST VIEW
    // ==========================================
    if (view === 'list') {
        return (
            <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">Reports & History</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Review patient scans, verify AI findings, and generate PDF reports.</p>
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
                            <Activity size={20} className="text-blue-500" /> Scans History
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
                                        <th className="px-6 py-4 font-semibold text-center">Patient Name</th>
                                        <th className="px-6 py-4 font-semibold text-center">Patient ID</th>
                                        <th className="px-6 py-4 font-semibold text-center">Upload Date</th>
                                        <th className="px-6 py-4 font-semibold text-center">Status</th>
                                        <th className="px-6 py-4 font-semibold text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {historyList.map((item) => (
                                        <tr key={item.scan_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group">
                                            <td className="px-6 py-4 text-center">
                                                <p className="font-bold text-slate-800 dark:text-slate-200">{item.patient_name}</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{item.patient_tag || 'N/A'}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">{item.upload_date}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${getStatusColor(item.derived_status)}`}>
                                                    {item.derived_status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => handleOpenReport(item.scan_id)} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-500 font-bold text-sm transition-all duration-300 shadow-md">
                                                        <Eye size={16} /> View Report
                                                    </button>
                                                    <button onClick={(e) => openDeleteDialog(item.scan_id, e)} className="inline-flex items-center justify-center p-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-600 hover:text-white font-bold text-sm transition-all duration-300" title="Delete Scan">
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

                <ConfirmDialog
                    isOpen={deleteDialog}
                    onClose={() => setDeleteDialog(false)}
                    onConfirm={handleDeleteScan}
                    title="Delete Scan?"
                    message="Are you sure you want to permanently delete this scan? This will remove all associated data including the PDF report and AI nodules."
                    confirmText="Yes, Delete"
                    confirmColor="rose"
                />
            </div>
        );
    }

    // ==========================================
    // 2. DETAILS VIEW
    // ==========================================
    if (loadingDetails) {
        return <div className="h-full flex items-center justify-center"><div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (!scanData || scanData.status !== 'Completed') {
        return (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
                <button onClick={handleBackToList} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors">
                    <ArrowLeft size={20} /> Back to List
                </button>
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-8 text-center">
                    <p className="text-amber-600 dark:text-amber-400 font-bold">This scan is not ready for review yet. Status: {scanData?.status || 'Unknown'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up pb-10">
            <button onClick={handleBackToList} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors bg-white dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md">
                <ArrowLeft size={16} /> Back to List
            </button>

            <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                    <Activity size={24} className="text-blue-500" /> Patient Details & Clinical History
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Full Name</label><input type="text" name="name" value={patientData.name || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium" /></div>
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Age</label><input type="number" name="age" value={patientData.age || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium" /></div>
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Gender</label><select name="gender" value={patientData.gender || 'Male'} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium cursor-pointer"><option value="Male">Male</option><option value="Female">Female</option></select></div>
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Hospital ID</label><input type="text" value={patientData.tag || 'N/A'} disabled className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-100 dark:bg-slate-800/50 text-slate-500 font-medium cursor-not-allowed" /></div>
                </div>

                <div className="p-5 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 mb-6">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                        <input type="checkbox" name="is_smoker" checked={patientData.is_smoker || false} onChange={handlePatientChange} className="w-5 h-5 text-amber-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700" />
                        <span className="font-bold text-amber-600 dark:text-amber-400">Smoker</span>
                    </label>
                    {patientData.is_smoker && (
                        <div className="grid grid-cols-2 gap-4 mt-3 animate-fade-in-up">
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Pack-years</label><input type="number" name="pack_years" value={patientData.pack_years || ''} onChange={handlePatientChange} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none bg-white dark:bg-slate-900 dark:text-white" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Quit Date</label><input type="date" name="smoking_cessation_date" value={patientData.smoking_cessation_date || ''} onChange={handlePatientChange} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none bg-white dark:bg-slate-900 dark:text-white" /></div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <SymptomBlock label="Prev. Tumors" checkName="has_previous_tumors" detailName="prev_tumors_details" checked={patientData.has_previous_tumors} detailValue={patientData.prev_tumors_details} onChange={handlePatientChange} isRose />
                    <SymptomBlock label="Occ. Exposure" checkName="occupational_exposure" detailName="occ_exposure_details" checked={patientData.occupational_exposure} detailValue={patientData.occ_exposure_details} onChange={handlePatientChange} />
                    <SymptomBlock label="Chest Pain" checkName="chest_pain_complaint" detailName="chest_pain_details" checked={patientData.chest_pain_complaint} detailValue={patientData.chest_pain_details} onChange={handlePatientChange} />
                    <SymptomBlock label="Chronic Cough" checkName="chronic_cough" detailName="chronic_cough_details" checked={patientData.chronic_cough} detailValue={patientData.chronic_cough_details} onChange={handlePatientChange} />
                    <SymptomBlock label="Hemoptysis" checkName="coughing_blood" detailName="coughing_blood_details" checked={patientData.coughing_blood} detailValue={patientData.coughing_blood_details} onChange={handlePatientChange} isRose />
                    <SymptomBlock label="Weight Loss" checkName="weight_loss" detailName="weight_loss_details" checked={patientData.weight_loss} detailValue={patientData.weight_loss_details} onChange={handlePatientChange} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Previous Chest Diseases</label><input type="text" name="previous_chest_diseases" value={patientData.previous_chest_diseases || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-50 dark:bg-slate-800 dark:text-white" /></div>
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Family History</label><input type="text" name="family_history" value={patientData.family_history || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-50 dark:bg-slate-800 dark:text-white" /></div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Doctor Notes (Final Impression)</label>
                    <textarea name="doctor_notes" value={patientData.doctor_notes || ''} onChange={handlePatientChange} rows="4" className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-50 dark:bg-slate-800 dark:text-white resize-none" placeholder="Enter final radiological impression..."></textarea>
                </div>
            </div>

            {/* Nodules Review Section */}
            <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                    <Check size={24} className="text-blue-500" /> AI Findings Review ({annotations.length})
                </h3>

                {annotations.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">No nodules detected or remaining.</div>
                ) : (
                    <div className="space-y-4">
                        {annotations.map((ann, idx) => (
                            <div key={ann.id} className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start gap-4 transition-colors ${ann.status === 'Approved' ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5' : ann.status === 'Rejected' ? 'border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5 opacity-60' : 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5'}`}>
                                {/* 🔴🔴🔴 صورة الورم (snapshot) */}
                                <div className="shrink-0">
                                    <img
                                        src={`${BACKEND_URL}/snapshots/scan_${selectedScanId}_nodule_${ann.id}.png`}
                                        alt={`Nodule ${idx + 1}`}
                                        className="w-24 h-24 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                </div>
                                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 shrink-0">{idx + 1}</span>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-white">Slice: {ann.slice_number}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Confidence: {Math.round((ann.confidence || 0) * 100)}% | Diameter: {ann.diameter?.toFixed(1)} mm
                                            </p>
                                            <p className={`text-xs font-bold mt-1 ${ann.status === 'Approved' ? 'text-emerald-600' : ann.status === 'Rejected' ? 'text-rose-500' : 'text-amber-500'}`}>
                                                Status: {ann.status}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button onClick={() => toggleNoduleStatus(ann.id, 'Approved')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ann.status === 'Approved' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/10'}`}>Approve</button>
                                        <button onClick={() => toggleNoduleStatus(ann.id, 'Rejected')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ann.status === 'Rejected' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-100 dark:hover:bg-rose-500/10'}`}>Reject</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
                <button onClick={() => setReanalyzeDialog(true)} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-amber-600 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors">
                    <RefreshCw size={18} /> Re-analyze Scan
                </button>
                <button onClick={handleSaveAll} disabled={saving} className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 disabled:opacity-50 transition-all">
                    {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />} Save All Changes
                </button>
                <button onClick={handleDownloadPDF} className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/25 transition-all">
                    <Download size={18} /> Download PDF
                </button>
            </div>

            <ConfirmDialog
                isOpen={reanalyzeDialog}
                onClose={() => setReanalyzeDialog(false)}
                onConfirm={handleReanalyze}
                title="Re-analyze Scan?"
                message="This will delete all current AI annotations and run the AI model again. This process takes time."
                confirmText="Yes, Re-analyze"
                confirmColor="amber"
            />
        </div>
    );
}
