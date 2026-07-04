import { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Activity, Eye, Filter, Check, Download, Save, ArrowLeft, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { ScanProcessingContext } from '../context/ScanProcessingContext';
import ConfirmDialog from '../components/ConfirmDialog';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

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
            const response = await api.get(`/scans/${id}/results`);
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

    const handlePatientChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setPatientData({ ...patientData, [e.target.name]: value });
    };

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
                has_previous_tumors: !!patientData.has_previous_tumors,
                prev_tumors_details: patientData.prev_tumors_details || null,
                chest_pain_complaint: !!patientData.chest_pain_complaint,
                chest_pain_details: patientData.chest_pain_details || null,
                chronic_cough: !!patientData.chronic_cough,
                chronic_cough_details: patientData.chronic_cough_details || null,
                coughing_blood: !!patientData.coughing_blood,
                coughing_blood_details: patientData.coughing_blood_details || null,
                weight_loss: !!patientData.weight_loss,
                weight_loss_details: patientData.weight_loss_details || null,
                occupational_exposure: !!patientData.occupational_exposure,
                occ_exposure_details: patientData.occ_exposure_details || null,
                previous_chest_diseases: patientData.previous_chest_diseases || null,
                is_smoker: !!patientData.is_smoker,
                pack_years: Number(patientData.pack_years) || 0,
                smoking_cessation_date: patientData.smoking_cessation_date || null,
                family_history: patientData.family_history || null,
                doctor_notes: patientData.doctor_notes || null
            };

            await api.put(`/scans/${selectedScanId}/patient`, safePayload);

            for (const ann of annotations) {
                if (ann.status === 'Rejected') {
                    await api.delete(`/scans/${selectedScanId}/annotations/${ann.id}`);
                } else if (ann.status === 'Approved') {
                    await api.put(`/scans/${selectedScanId}/annotations/${ann.id}`, { status: 'Approved' });
                }
            }

            toast.success("All changes saved successfully!", { id: saveToast });
            await fetchDetails(selectedScanId);
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
            const response = await api.get(`/reports/${selectedScanId}/get-pdf-data`);
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
        }
    };

    const SymptomBlock = ({ label, checkName, detailName, isRose }) => (
        <div className={`p-4 rounded-xl border transition-colors ${patientData[checkName] ? (isRose ? 'border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/10' : 'border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/10') : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'}`}>
            <label className="flex items-center gap-2 cursor-pointer mb-1">
                <input type="checkbox" name={checkName} checked={patientData[checkName] || false} onChange={handlePatientChange} className={`w-5 h-5 rounded dark:bg-slate-700 dark:border-slate-600 ${isRose ? 'text-rose-500' : 'text-blue-600'}`} />
                <span className={`font-bold text-sm ${isRose ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>{label}</span>
            </label>
            {patientData[checkName] && (
                <div className="mt-3 animate-fade-in-up">
                    <input type="text" name={detailName} value={patientData[detailName] || ''} onChange={handlePatientChange} placeholder={`Type details for ${label.toLowerCase()}...`} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-white dark:bg-slate-900 dark:text-white transition-colors" />
                </div>
            )}
        </div>
    );

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
                <ConfirmDialog
                    isOpen={deleteDialog}
                    onClose={() => setDeleteDialog(false)}
                    onConfirm={handleDeleteScan}
                    title="Delete This Scan?"
                    message="This action is permanent and cannot be undone. All scan data, AI annotations, and the generated report will be permanently deleted."
                    confirmText="Yes, Delete"
                    confirmColor="rose"
                />

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight transition-colors">Patient Records</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 transition-colors">Search, filter, and manage AI diagnostic reports.</p>
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
                            <Activity size={20} className="text-blue-500" /> Recent Scans
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
                                                    <button onClick={() => handleOpenReport(item.scan_id)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white font-bold text-sm transition-all duration-300 shadow-sm">
                                                        <Eye size={16} /> Open Report
                                                    </button>
                                                    <button onClick={(e) => openDeleteDialog(item.scan_id, e)} className="inline-flex items-center justify-center p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white font-bold text-sm transition-all duration-300 shadow-sm" title="Delete Scan">
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

    // ==========================================
    // 2. DETAILS VIEW
    // ==========================================
    if (loadingDetails) return <div className="p-10 text-center animate-pulse font-bold text-slate-500 dark:text-slate-400">Loading Report Details...</div>;

    if (scanData?.status === "Processing") return (
        <div className="max-w-6xl mx-auto space-y-6">
            <button onClick={handleBackToList} className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 font-bold transition-colors">
                <ArrowLeft size={20} /> Back to List
            </button>
            <div className="p-10 text-center bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
                <h2 className="text-xl font-bold text-amber-700 dark:text-amber-500">Scan is still processing...</h2>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up pb-10">
            <ConfirmDialog
                isOpen={reanalyzeDialog}
                onClose={() => setReanalyzeDialog(false)}
                onConfirm={handleReanalyze}
                title="Re-run AI Analysis"
                message="This will permanently delete all AI-detected nodules from this scan and run a fresh analysis using the current AI model. Doctor-added nodules will be preserved."
                confirmText="Yes, Re-analyze"
                confirmColor="amber"
                icon={<RefreshCw size={32} className="text-amber-500" />}
            />

            <ConfirmDialog
                isOpen={deleteDialog}
                onClose={() => setDeleteDialog(false)}
                onConfirm={handleDeleteScan}
                title="Delete This Scan?"
                message="This action is permanent and cannot be undone. All scan data, AI annotations, and the generated report will be permanently deleted."
                confirmText="Yes, Delete"
                confirmColor="rose"
            />

            <div className="flex justify-between items-center">
                <button onClick={handleBackToList} className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 font-bold transition-colors bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <ArrowLeft size={20} /> Back to List
                </button>
                <button onClick={() => { setDeleteTargetId(selectedScanId); setDeleteDialog(true); }} className="bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white font-bold transition-all">
                    <Trash2 size={20} /> Delete Scan
                </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 transition-colors">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">Patient Information & Medical History</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Full Name</label><input type="text" name="name" value={patientData.name || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium" /></div>
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Age</label><input type="number" name="age" value={patientData.age || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium" /></div>
                    <div><label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Gender</label><select name="gender" value={patientData.gender || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white font-medium"><option value="Male">Male</option><option value="Female">Female</option></select></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className={`p-5 rounded-2xl border transition-colors ${patientData.is_smoker ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'}`}>
                        <label className="flex items-center gap-3 cursor-pointer mb-4">
                            <input type="checkbox" name="is_smoker" checked={patientData.is_smoker || false} onChange={handlePatientChange} className="w-5 h-5 text-amber-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700" />
                            <span className="font-bold text-slate-800 dark:text-white">Smoker</span>
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Pack-years</label>
                                <input type="number" name="pack_years" value={patientData.pack_years || ''} onChange={handlePatientChange} disabled={!patientData.is_smoker} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none bg-white dark:bg-slate-900 dark:text-white disabled:opacity-50" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Quit Date</label>
                                <input type="date" name="smoking_cessation_date" value={patientData.smoking_cessation_date || ''} onChange={handlePatientChange} disabled={!patientData.is_smoker} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none bg-white dark:bg-slate-900 dark:text-white disabled:opacity-50" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <SymptomBlock label="Prev. Tumors" checkName="has_previous_tumors" detailName="prev_tumors_details" />
                        <SymptomBlock label="Occ. Exposure" checkName="occupational_exposure" detailName="occ_exposure_details" />
                    </div>

                    <SymptomBlock label="Chest Pain" checkName="chest_pain_complaint" detailName="chest_pain_details" />
                    <SymptomBlock label="Chronic Cough" checkName="chronic_cough" detailName="chronic_cough_details" />
                    <SymptomBlock label="Hemoptysis" checkName="coughing_blood" detailName="coughing_blood_details" isRose />
                    <SymptomBlock label="Weight Loss" checkName="weight_loss" detailName="weight_loss_details" />

                    <div className="col-span-1 md:col-span-2 mt-2">
                        <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Previous Chest Diseases</label>
                        <input type="text" name="previous_chest_diseases" value={patientData.previous_chest_diseases || ''} onChange={handlePatientChange} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-50 dark:bg-slate-800 dark:text-white" />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">Final Radiological Impression (Doctor Note)</label>
                        <textarea name="doctor_notes" rows="4" value={patientData.doctor_notes || ''} onChange={handlePatientChange} className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl outline-none bg-slate-50 dark:bg-slate-800 dark:text-white leading-relaxed"></textarea>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-6 flex items-center gap-2 transition-colors">
                    Radiological Findings
                    <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm py-1 px-3 rounded-full">{annotations.length} Nodules</span>
                </h3>

                {annotations.length === 0 ? (
                    <div className="p-10 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 font-bold text-slate-400">
                        No nodules detected or all rejected nodules were deleted.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {annotations.map((ann, index) => (
                            <div key={ann.id} className={`bg-white dark:bg-slate-900 rounded-3xl shadow-sm border overflow-hidden transition-all duration-300 ${ann.status === 'Rejected' ? 'opacity-60 border-rose-200 dark:border-rose-900 scale-95' : 'border-slate-100 dark:border-slate-800 hover:shadow-xl dark:hover:border-slate-700'}`}>
                                <div className="h-56 bg-slate-900 flex items-center justify-center relative">
                                    <img src={`${BACKEND_URL}/snapshots/scan_${selectedScanId}_nodule_${ann.id}.png?t=${new Date().getTime()}`} alt={`Nodule ${ann.id}`} className="h-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full">Slice: {ann.slice_number}</div>
                                    {ann.status === 'Rejected' && <div className="absolute inset-0 bg-rose-500/20 flex items-center justify-center"><Trash2 size={48} className="text-white drop-shadow-md opacity-50" /></div>}
                                </div>
                                <div className="p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="font-extrabold text-lg text-slate-800 dark:text-slate-200">Nodule #{index + 1}</span>
                                        <span className={`text-xs font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider ${ann.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : ann.status === 'Rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>{ann.status}</span>
                                    </div>
                                    <div className="space-y-2 mb-6">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500 dark:text-slate-400 font-medium">AI Confidence</span>
                                            <span className="font-extrabold text-blue-600 dark:text-blue-400">{(ann.confidence * 100).toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <button onClick={() => toggleNoduleStatus(ann.id, 'Approved')} className={`flex-1 py-3 rounded-xl flex justify-center items-center gap-2 text-sm font-bold transition-all ${ann.status === 'Approved' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400'}`}><Check size={18} /> Approve</button>
                                        <button onClick={() => toggleNoduleStatus(ann.id, 'Rejected')} className={`flex-1 py-3 rounded-xl flex justify-center items-center gap-2 text-sm font-bold transition-all ${ann.status === 'Rejected' ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400'}`}><Trash2 size={18} /> Reject</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap justify-end gap-4 mt-12 pt-6 border-t border-slate-200 dark:border-slate-800">
                <button onClick={handleSaveAll} disabled={saving} className="bg-blue-600 text-white px-8 py-3 rounded-xl flex items-center gap-2 hover:bg-blue-700 font-bold shadow-md shadow-blue-500/20 disabled:bg-slate-400 transition-all text-lg">
                    <Save size={22} /> {saving ? 'Saving...' : 'Save All Changes'}
                </button>
                <button onClick={handleDownloadPDF} className="bg-emerald-500 text-white px-8 py-3 rounded-xl flex items-center gap-2 hover:bg-emerald-600 font-bold shadow-md shadow-emerald-500/20 transition-all text-lg">
                    <Download size={22} /> Download PDF
                </button>
                <button onClick={() => setReanalyzeDialog(true)} className="bg-amber-500 text-white px-8 py-3 rounded-xl flex items-center gap-2 hover:bg-amber-600 font-bold shadow-md shadow-amber-500/20 transition-all text-lg">
                    <RefreshCw size={22} /> Re-analyze with AI
                </button>
            </div>
        </div>
    );
}