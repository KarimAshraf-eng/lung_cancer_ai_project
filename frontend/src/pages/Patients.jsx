import { useState, useEffect } from 'react';
import { Search, Activity, Users, ArrowLeft, Calendar, FileText, AlertCircle, ChevronRight, Layers, Cigarette, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function Patients() {
    const navigate = useNavigate();
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientTimeline, setPatientTimeline] = useState(null);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    useEffect(() => {
        fetchPatients();
    }, []);

    useEffect(() => {
        const delayDebounce = setTimeout(() => {
            if (!selectedPatient) fetchPatients();
        }, 300);
        return () => clearTimeout(delayDebounce);
    }, [searchTerm]);

    const fetchPatients = async () => {
        try {
            const res = await api.get('/patients', { params: { search: searchTerm || undefined } });
            setPatients(res.data);
        } catch (err) {
            toast.error("Failed to load patients directory.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPatient = async (id) => {
        setLoadingTimeline(true);
        setSelectedPatient(id);
        try {
            const res = await api.get(`/patients/${id}`);
            setPatientTimeline(res.data);
        } catch (err) {
            toast.error("Failed to load patient timeline.");
            setSelectedPatient(null);
        } finally {
            setLoadingTimeline(false);
        }
    };

    const handleBackToList = () => {
        setSelectedPatient(null);
        setPatientTimeline(null);
    };

    // --- 1. Timeline View (Details) ---
    if (selectedPatient && patientTimeline) {
        const { patient_info, timeline } = patientTimeline;

        return (
            <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up pb-10">
                <button onClick={handleBackToList} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <ArrowLeft size={20} /> Back to Directory
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Patient Identity Card */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
                            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-2xl font-black mb-4">
                                {patient_info.name.substring(0, 2).toUpperCase()}
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">{patient_info.name}</h2>
                            <p className="text-slate-500 dark:text-slate-400 font-mono text-sm mb-6">MRN: {patient_info.tag}</p>

                            <div className="space-y-4">
                                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="text-slate-500 dark:text-slate-400">Age</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{patient_info.age} years</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="text-slate-500 dark:text-slate-400">Gender</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{patient_info.gender}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="text-slate-500 dark:text-slate-400">Smoker</span>
                                    <span className={`font-bold ${patient_info.is_smoker ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {patient_info.is_smoker ? (patient_info.pack_years ? `Yes (${patient_info.pack_years} py)` : 'Yes') : 'No'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="text-slate-500 dark:text-slate-400">Prev. Tumors</span>
                                    <span className={`font-bold ${patient_info.has_previous_tumors ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'}`}>{patient_info.has_previous_tumors ? 'Yes' : 'No'}</span>
                                </div>
                            </div>
                        </div>

                        {patient_info.doctor_notes && (
                            <div className="bg-amber-50 dark:bg-amber-500/10 p-6 rounded-3xl border border-amber-200 dark:border-amber-500/20 transition-colors">
                                <h3 className="font-bold text-amber-800 dark:text-amber-500 flex items-center gap-2 mb-2"><FileText size={18} /> Final Impression</h3>
                                <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{patient_info.doctor_notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Timeline History */}
                    <div className="lg:col-span-2">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors h-full">
                            <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2 mb-8">
                                <Activity className="text-blue-500" /> Radiological Timeline
                            </h3>

                            <div className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-3 space-y-8">
                                {timeline.map((scan) => (
                                    <div key={scan.scan_id} className="relative pl-8">
                                        <div className={`absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-white dark:border-slate-900 ${scan.status === 'Completed' ? 'bg-emerald-500' : scan.status === 'Processing' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>

                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all group">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                                                    <Calendar size={16} /> {scan.date}
                                                </div>
                                                <span className={`px-3 py-1 rounded-lg text-xs font-bold ${scan.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                    scan.status === 'Processing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                                                        'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                                                    }`}>
                                                    {scan.status}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-extrabold text-slate-800 dark:text-white text-lg">
                                                        {scan.nodules_count > 0 ? `${scan.nodules_count} Nodules Detected` : "No Nodules Detected"}
                                                    </p>
                                                    {scan.nodules_count > 0 && (
                                                        <p className="text-sm text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1 mt-1">
                                                            <AlertCircle size={14} /> Max Confidence: {(scan.max_confidence * 100).toFixed(1)}%
                                                        </p>
                                                    )}
                                                </div>

                                                {/* 🔴 التعديل: زرين منفصلين لعرض الأشعة وعرض التقرير */}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => navigate(`/scan-viewer/${scan.scan_id}`)}
                                                        className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-colors"
                                                    >
                                                        Open Scan
                                                    </button>
                                                    {scan.status === 'Completed' && (
                                                        <button
                                                            onClick={() => navigate('/reports', { state: { scanId: scan.scan_id } })}
                                                            className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 transition-colors"
                                                        >
                                                            Open Report
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {timeline.length === 0 && (
                                    <p className="text-slate-500 dark:text-slate-400 ml-8">No scans recorded for this patient.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- 2. Directory List View ---
    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight transition-colors">Patients Directory</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 transition-colors">Manage and view complete medical histories of your patients.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search patients by name or ID tag..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 dark:bg-slate-800 dark:text-white"
                    />
                </div>
            </div>

            {loading ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Loading patients...</p>
                </div>
            ) : patients.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users size={24} className="text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="font-medium text-lg">No patients found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {patients.map((p) => (
                        <div
                            key={p.id}
                            onClick={() => handleSelectPatient(p.id)}
                            className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer group flex flex-col"
                        >
                            {/* Header: Avatar, Name, ID */}
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xl shrink-0">
                                    {p.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-slate-800 dark:text-white text-lg truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        {p.name}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">MRN: {p.patient_id_tag}</p>
                                </div>
                            </div>

                            {/* Middle: Demographics & Risk Badges */}
                            <div className="flex flex-wrap gap-2 mb-6">
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-md text-xs font-bold">
                                    {p.age} Yrs • {p.gender.charAt(0)}
                                </span>
                                {p.is_smoker && (
                                    <span className="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1">
                                        <Cigarette size={12} /> Smoker
                                    </span>
                                )}
                                {p.has_previous_tumors && (
                                    <span className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1">
                                        <AlertTriangle size={12} /> Prev. Tumors
                                    </span>
                                )}
                            </div>

                            <div className="flex-1"></div> {/* Spacer */}

                            {/* Bottom: CT Studies Count & Date */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between mt-auto">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                                        <Layers size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">CT Studies</p>
                                        <p className="font-extrabold text-slate-800 dark:text-white leading-none">{p.total_scans}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Last Exam</p>
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                        <Calendar size={12} /> {p.last_scan_date}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}