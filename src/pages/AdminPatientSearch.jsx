import { useState, useEffect, useCallback } from 'react';
import { Search, UserSearch, ArrowLeft, ChevronRight, ArrowRight, Users, Activity, FileText, Stethoscope, Calendar, CheckCircle2, XCircle, Clock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { EmptyState, getStatusBadge } from '../components/AdminShared';

export default function AdminPatientSearch() {
    const [view, setView] = useState('main'); // 'main', 'patient-profile'
    const [globalPatientQuery, setGlobalPatientQuery] = useState('');
    const [globalPatientResults, setGlobalPatientResults] = useState([]);
    const [isSearchingPatients, setIsSearchingPatients] = useState(true);
    const [patientProfile, setPatientProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);

    // 🔴 تم التعديل لجلب جميع المرضى في حال كان البحث فارغاً
    const searchPatientsGlobal = useCallback(async (query) => {
        setIsSearchingPatients(true);
        try {
            const params = query && query.trim().length > 0 ? { q: query.trim() } : {};
            const res = await api.get('/admin/patients/search', { params });
            setGlobalPatientResults(res.data);
        } catch (err) { toast.error('Patient search failed.'); }
        finally { setIsSearchingPatients(false); }
    }, []);

    // تحميل جميع المرضى عند فتح الصفحة لأول مرة
    useEffect(() => {
        searchPatientsGlobal('');
    }, [searchPatientsGlobal]);

    const fetchPatientProfile = useCallback(async (patientId) => {
        setLoadingProfile(true);
        try {
            const res = await api.get(`/admin/patients/${patientId}`);
            setPatientProfile(res.data);
        } catch (err) { toast.error('Failed to load patient profile.'); }
        finally { setLoadingProfile(false); }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { if (view === 'main') searchPatientsGlobal(globalPatientQuery); }, 400);
        return () => clearTimeout(timer);
    }, [globalPatientQuery, view, searchPatientsGlobal]);

    useEffect(() => {
        if (view === 'patient-profile' && selectedPatient?.id) fetchPatientProfile(selectedPatient.id);
    }, [view, selectedPatient, fetchPatientProfile]);

    const goToPatientProfile = (patient) => {
        setSelectedPatient(patient);
        setView('patient-profile');
    };

    const goBack = () => {
        setView('main');
        setSelectedPatient(null);
        setPatientProfile(null);
    };

    const renderBreadcrumb = () => {
        if (view === 'main') return null;
        const crumbs = [{ label: 'Patient Search', onClick: goBack }];
        if (view === 'patient-profile') crumbs.push({ label: patientProfile?.patient_info?.name || selectedPatient?.name || 'Patient' });

        return (
            <button onClick={goBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors bg-white dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 hover:shadow-md">
                <ArrowLeft size={16} />
                <span className="text-sm">{crumbs.map((c, i) => <span key={i}>{i > 0 && <ChevronRight size={12} className="inline mx-2 opacity-40" />}{i === crumbs.length - 1 ? <span className="text-slate-800 dark:text-white">{c.label}</span> : <span className="hover:text-blue-600 cursor-pointer" onClick={c.onClick}>{c.label}</span>}</span>)}</span>
            </button>
        );
    };

    if (view === 'patient-profile') {
        if (loadingProfile) return <div className="flex items-center justify-center py-16"><div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;
        if (!patientProfile) return <div className="text-center text-slate-400 py-16"><Users size={40} className="mx-auto opacity-30 mb-3" /><p>Unable to load patient profile.</p><button onClick={goBack} className="text-blue-500 mt-2 font-bold">Back</button></div>;

        const pi = patientProfile.patient_info;

        return (
            <div className="space-y-8 animate-fade-in-up pb-10">
                {renderBreadcrumb()}

                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10">
                        <div className="w-20 h-20 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl font-black shrink-0 border border-emerald-200 dark:border-emerald-500/30">
                            {pi.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white">{pi.name}</h3>
                                {pi.is_smoker && <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">Smoker</span>}
                                {pi.has_previous_tumors && <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">Prev. Tumors</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1.5"><User size={16} className="text-slate-400" /> ID: <span className="font-mono text-slate-700 dark:text-slate-300">{pi.patient_id_tag}</span></span>
                                <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                <span>{pi.age}Y • {pi.gender}</span>
                                <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                <span className="flex items-center gap-1.5"><Users size={16} className="text-slate-400" /> Examined by {patientProfile.summary.total_doctors} Doctor(s)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {patientProfile.examining_doctors.map(doc => (
                    <div key={doc.doctor_id} className="mt-8 bg-slate-50/50 dark:bg-slate-800/20 rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
                        <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                            <Stethoscope size={22} className="text-blue-500" /> Dr. {doc.doctor_name}'s Radiological Timeline
                        </h4>

                        <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-4 space-y-8 pb-4">
                            {doc.timeline.map((entry, i) => {
                                const pendingCount = entry.nodules.filter(n => n.status === 'Pending').length;
                                const derivedStatus = entry.status === 'Completed' && pendingCount > 0 ? 'Unreviewed' : entry.status;
                                const statusColor = derivedStatus === 'Completed' ? 'bg-emerald-500' : derivedStatus === 'Unreviewed' ? 'bg-indigo-500' : derivedStatus === 'Processing' ? 'bg-amber-500' : 'bg-rose-500';

                                return (
                                    <div key={i} className="relative pl-8">
                                        <div className={`absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-white dark:border-slate-950 ${statusColor} shadow-sm`}></div>

                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h5 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                                            <FileText size={18} className="text-slate-400" /> Scan #{entry.scan_id.substring(0, 8)}...
                                                        </h5>
                                                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${getStatusBadge(derivedStatus)}`}>
                                                            {derivedStatus}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-2">
                                                        <Calendar size={14} /> {entry.date}
                                                    </p>
                                                </div>
                                                <div className="flex gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                                    <div className="text-center px-2">
                                                        <p className="text-xl font-black text-slate-800 dark:text-white">{entry.nodules_count}</p>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Nodules</p>
                                                    </div>
                                                    {pendingCount > 0 && (
                                                        <>
                                                            <div className="w-px bg-slate-200 dark:bg-slate-700"></div>
                                                            <div className="text-center px-2">
                                                                <p className="text-xl font-black text-amber-500">{pendingCount}</p>
                                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Pending</p>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {entry.nodules.length > 0 ? (
                                                <div>
                                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 pl-1">Detected Nodules</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {entry.nodules.map((n, ni) => (
                                                            <div key={ni} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/50">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${n.confidence > 0.9 ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30' : n.confidence > 0.7 ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'}`}>
                                                                    {n.confidence ? `${Math.round(n.confidence * 100)}%` : '?'}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                                                                        Slice {n.slice_number} {n.diameter ? `• ${n.diameter}mm` : ''}
                                                                    </p>
                                                                    <p className="text-[10px] font-medium text-slate-500 flex items-center gap-1.5 mt-1">
                                                                        {n.status === 'Approved' ? <CheckCircle2 size={12} className="text-emerald-500" /> : n.status === 'Rejected' ? <XCircle size={12} className="text-rose-500" /> : <Clock size={12} className="text-amber-500" />}
                                                                        <span className={n.status === 'Approved' ? 'text-emerald-600 dark:text-emerald-400' : n.status === 'Rejected' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>{n.status}</span>
                                                                        <span className="opacity-50">• {n.source}</span>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50 text-center text-sm font-medium text-slate-500">
                                                    No nodules detected or remaining in this scan.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {doc.timeline.length === 0 && (
                                <p className="text-slate-500 dark:text-slate-400 ml-8 italic">No scans recorded for this patient by this doctor.</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up pb-12">
            <div>
                <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">Patient Search</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Search globally for any patient across all registered doctors.</p>
            </div>

            {/* 🔴 تم تحويل العرض إلى العرض الكامل (w-full بدلاً من max-w-xl) */}
            <div className="relative w-full">
                <UserSearch size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" />
                <input type="text" placeholder="Search by patient name or ID..." value={globalPatientQuery} onChange={(e) => setGlobalPatientQuery(e.target.value)} className="w-full pl-12 pr-12 py-3.5 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-sm bg-white dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base font-medium shadow-sm" autoFocus />
                {isSearchingPatients && <div className="absolute right-4 top-1/2 -translate-y-1/2"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
            </div>

            {!isSearchingPatients && globalPatientResults.length === 0 && (
                <EmptyState icon={<Search size={40} className="opacity-30" />} message="No patients found matching your search criteria" />
            )}

            {globalPatientResults.length > 0 && (
                <div className="mt-8 space-y-4">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                        Found {globalPatientResults.length} Patient(s)
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {globalPatientResults.map(p => (
                            <div key={p.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col lg:flex-row gap-6 p-6">

                                <div className="flex gap-5 min-w-[280px]">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner">
                                        {p.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-white text-lg">{p.name}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">ID: {p.patient_id_tag}</p>
                                        <div className="flex items-center gap-2 mt-2.5">
                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">{p.age}Y • {p.gender.charAt(0)}</span>
                                            {p.is_smoker && <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">Smoker</span>}
                                            {p.has_previous_tumors && <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400">Prev. Tumor</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-100 dark:border-slate-700/50">
                                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                                        <Stethoscope size={12} /> Examined By ({p.examining_doctors.length})
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {p.examining_doctors.map(doc => (
                                            <div key={doc.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[9px] font-bold">
                                                    {doc.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Dr. {doc.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 🔴 تم إزالة عدد الأورام من هنا كما طلبت */}
                                <div className="flex flex-col sm:flex-row lg:flex-col items-center lg:items-end justify-between gap-4 lg:gap-0 lg:min-w-[160px] pl-0 lg:pl-6 lg:border-l border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-6 text-center w-full sm:w-auto lg:justify-end">
                                        <div>
                                            <p className="text-xl font-black text-slate-800 dark:text-white leading-none">{p.total_scans}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Total Scans</p>
                                        </div>
                                    </div>
                                    <button onClick={() => goToPatientProfile(p)} className="w-full sm:w-auto lg:w-full px-5 py-2.5 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-500 font-bold text-sm transition-all shadow-md mt-auto flex items-center justify-center gap-2">
                                        View Full Profile <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}