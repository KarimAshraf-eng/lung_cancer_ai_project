import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Search, CircleDot, Eye, Pencil, KeyRound, ToggleLeft, ToggleRight, Trash2, X, Loader2, ArrowLeft, ChevronRight, FileText, Activity, Calendar, Clock, User, Stethoscope, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { EmptyState, ConfirmModal, formatDateTime, getStatusBadge } from '../components/AdminShared';

const DOCTOR_FILTERS = [
    { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' },
];

export default function AdminDoctors() {
    const [view, setView] = useState('main'); // 'main', 'doctor-detail', 'patient-detail'
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [selectedPatient, setSelectedPatient] = useState(null);

    const [doctors, setDoctors] = useState([]);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [doctorFilter, setDoctorFilter] = useState('all');

    const [doctorPatients, setDoctorPatients] = useState([]);
    const [patientSearch, setPatientSearch] = useState('');
    const [patientDetail, setPatientDetail] = useState(null);

    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [resetTarget, setResetTarget] = useState(null);
    const [newDoctor, setNewDoctor] = useState({ name: '', email: '', password: '' });
    const [editForm, setEditForm] = useState({ name: '', email: '' });
    const [resetPassword, setResetPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDoctors = useCallback(async (search = '') => {
        try {
            const res = await api.get('/admin/doctors', { params: { search: search || undefined } });
            setDoctors(res.data);
        } catch (err) { toast.error('Failed to load doctors.'); }
        finally { setLoading(false); }
    }, []);

    const fetchDoctorPatients = useCallback(async (doctorId, search = '') => {
        try {
            const res = await api.get(`/admin/doctors/${doctorId}/patients`, { params: { search: search || undefined } });
            setDoctorPatients(res.data);
        } catch (err) { toast.error('Failed to load patients.'); }
    }, []);

    const fetchPatientDetail = useCallback(async (doctorId, patientId) => {
        try {
            const res = await api.get(`/admin/doctors/${doctorId}/patients/${patientId}`);
            setPatientDetail(res.data);
        } catch (err) { toast.error('Failed to load patient details.'); }
    }, []);

    useEffect(() => { fetchDoctors(); }, [fetchDoctors]);

    useEffect(() => {
        const timer = setTimeout(() => { if (view === 'main') fetchDoctors(doctorSearch); }, 300);
        return () => clearTimeout(timer);
    }, [doctorSearch, view, fetchDoctors]);

    useEffect(() => {
        const timer = setTimeout(() => { if (view === 'doctor-detail' && selectedDoctor) fetchDoctorPatients(selectedDoctor.id, patientSearch); }, 300);
        return () => clearTimeout(timer);
    }, [patientSearch, view, selectedDoctor, fetchDoctorPatients]);

    useEffect(() => {
        if (view === 'doctor-detail' && selectedDoctor) fetchDoctorPatients(selectedDoctor.id);
    }, [view, selectedDoctor, fetchDoctorPatients]);

    useEffect(() => {
        if (view === 'patient-detail' && selectedDoctor && selectedPatient) fetchPatientDetail(selectedDoctor.id, selectedPatient.id);
    }, [view, selectedDoctor, selectedPatient, fetchPatientDetail]);

    const handleAddDoctor = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.post('/admin/doctors', newDoctor);
            toast.success(`Dr. ${newDoctor.name} added successfully!`);
            setNewDoctor({ name: '', email: '', password: '' });
            setShowAddModal(false);
            fetchDoctors();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add doctor.'); }
        finally { setIsSubmitting(false); }
    };

    const handleEditDoctor = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.put(`/admin/doctors/${editingDoctor.id}`, editForm);
            toast.success('Doctor updated successfully!');
            setShowEditModal(false);
            setEditingDoctor(null);
            fetchDoctors();
            if (selectedDoctor?.id === editingDoctor.id) setSelectedDoctor(prev => ({ ...prev, name: editForm.name || prev.name, email: editForm.email || prev.email }));
        } catch (err) { toast.error(err.response?.data?.detail || 'Update failed.'); }
        finally { setIsSubmitting(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!resetTarget) return;
        setIsSubmitting(true);
        try {
            await api.put(`/admin/doctors/${resetTarget.id}/reset-password`, { new_password: resetPassword });
            toast.success(`Password reset for Dr. ${resetTarget.name}!`);
            setShowResetModal(false);
            setResetTarget(null);
            setResetPassword('');
        } catch (err) { toast.error(err.response?.data?.detail || 'Reset failed.'); }
        finally { setIsSubmitting(false); }
    };

    const handleToggleStatus = async (doctorId) => {
        try {
            const res = await api.put(`/admin/doctors/${doctorId}/toggle-status`);
            setDoctors(prev => prev.map(d => d.id === doctorId ? { ...d, is_active: res.data.is_active } : d));
            if (selectedDoctor?.id === doctorId) setSelectedDoctor(prev => ({ ...prev, is_active: res.data.is_active }));
            toast.success('Account status updated.');
        } catch (err) { toast.error(err.response?.data?.detail || 'Action failed'); }
    };

    const confirmDeleteDoctor = async () => {
        if (!deleteTarget) return;
        try {
            const res = await api.delete(`/admin/doctors/${deleteTarget.id}`);
            toast.success(res.data.message);
            fetchDoctors();
            if (view === 'doctor-detail' && selectedDoctor?.id === deleteTarget.id) goBack();
            setDeleteTarget(null);
        } catch (err) { toast.error(err.response?.data?.detail || 'Deletion failed'); setDeleteTarget(null); }
    };

    const filteredDoctors = doctors.filter(d => {
        if (doctorFilter === 'active') return d.is_active;
        if (doctorFilter === 'suspended') return !d.is_active;
        return true;
    });

    const goBack = () => {
        if (view === 'patient-detail') { setView('doctor-detail'); setPatientDetail(null); setSelectedPatient(null); }
        else if (view === 'doctor-detail') { setView('main'); setSelectedDoctor(null); setDoctorPatients([]); }
    };

    const renderBreadcrumb = () => {
        if (view === 'main') return null;
        const crumbs = [{ label: 'Doctors', onClick: () => { setView('main'); setSelectedDoctor(null); setSelectedPatient(null); } }];
        if (selectedDoctor) crumbs.push({ label: `Dr. ${selectedDoctor.name}`, onClick: () => { setView('doctor-detail'); setSelectedPatient(null); } });
        if (selectedPatient && view === 'patient-detail') crumbs.push({ label: selectedPatient.name });

        return (
            <button onClick={goBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors bg-white dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6 hover:shadow-md">
                <ArrowLeft size={16} />
                <span className="text-sm">{crumbs.map((c, i) => <span key={i}>{i > 0 && <ChevronRight size={12} className="inline mx-2 opacity-40" />}{i === crumbs.length - 1 ? <span className="text-slate-800 dark:text-white">{c.label}</span> : <span className="hover:text-blue-600 cursor-pointer" onClick={c.onClick}>{c.label}</span>}</span>)}</span>
            </button>
        );
    };

    if (loading) return <div className="h-full flex items-center justify-center"><div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div className="animate-fade-in">
            {renderBreadcrumb()}

            {view === 'main' && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">Doctor Management</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage all registered doctors in the system.</p>
                        </div>
                        <button onClick={() => setShowAddModal(true)} className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center gap-2 shrink-0"><UserPlus size={18} /> Register Doctor</button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative max-w-md flex-1">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search by name or email..." value={doctorSearch} onChange={(e) => setDoctorSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                        </div>
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                            {DOCTOR_FILTERS.map(f => (
                                <button key={f.value} onClick={() => setDoctorFilter(f.value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${doctorFilter === f.value ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{f.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead><tr className="bg-slate-50/80 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 text-xs border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider">
                                    <th className="px-5 py-3.5 font-semibold">Doctor</th>
                                    <th className="px-4 py-3.5 font-semibold text-center">Status</th>
                                    <th className="px-4 py-3.5 font-semibold text-center">Scans</th>
                                    <th className="px-4 py-3.5 font-semibold text-center">Patients</th>
                                    <th className="px-4 py-3.5 font-semibold text-center">Last Login</th>
                                    <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {filteredDoctors.map(doc => (
                                        <tr key={doc.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">{doc.name.substring(0, 2).toUpperCase()}</div>
                                                        {doc.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900"></div>}
                                                    </div>
                                                    <div><p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{doc.name}</p><p className="text-[11px] text-slate-500 dark:text-slate-400">{doc.email}</p></div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${doc.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'}`}><CircleDot size={10} /> {doc.is_active ? 'Active' : 'Suspended'}</span></td>
                                            <td className="px-4 py-4 text-center font-bold text-slate-800 dark:text-slate-200 text-sm">{doc.scan_count}</td>
                                            <td className="px-4 py-4 text-center font-bold text-slate-800 dark:text-slate-200 text-sm">{doc.patient_count}</td>
                                            <td className="px-4 py-4 text-center"><p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{formatDateTime(doc.last_login)}</p></td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button onClick={() => { setSelectedDoctor(doc); setView('doctor-detail'); }} className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white transition-all" title="View Patients"><Eye size={15} /></button>
                                                    <button onClick={() => { setEditingDoctor(doc); setEditForm({ name: doc.name, email: doc.email }); setShowEditModal(true); }} className="p-2 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-600 hover:text-white dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-600 dark:hover:text-white transition-all" title="Edit"><Pencil size={15} /></button>
                                                    <button onClick={() => { setResetTarget(doc); setResetPassword(''); setShowResetModal(true); }} className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-600 dark:hover:text-white transition-all" title="Reset Password"><KeyRound size={15} /></button>
                                                    <button onClick={() => handleToggleStatus(doc.id)} className={`p-2 rounded-lg transition-all ${doc.is_active ? 'bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white dark:bg-orange-900/20 dark:text-orange-400' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white dark:bg-emerald-900/20 dark:text-emerald-400'}`} title={doc.is_active ? 'Suspend' : 'Activate'}>{doc.is_active ? <ToggleLeft size={15} /> : <ToggleRight size={15} />}</button>
                                                    <button onClick={() => setDeleteTarget(doc)} className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white dark:bg-rose-900/20 dark:text-rose-400 transition-all" title="Delete"><Trash2 size={15} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredDoctors.length === 0 && <tr><td colSpan={6}><EmptyState icon={<Users size={32} className="opacity-30" />} message="No doctors found" /></td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {view === 'doctor-detail' && selectedDoctor && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-lg shadow-blue-500/20">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-black backdrop-blur-sm">{selectedDoctor.name.substring(0, 2).toUpperCase()}</div>
                                <div>
                                    <h3 className="text-xl font-extrabold">Dr. {selectedDoctor.name}</h3>
                                    <p className="text-blue-200 text-sm">{selectedDoctor.email}</p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${selectedDoctor.is_active ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>{selectedDoctor.is_active ? 'Active' : 'Suspended'}</span>
                                        <span className="text-xs text-blue-200">{selectedDoctor.scan_count} scans &middot; {selectedDoctor.patient_count} patients</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs text-blue-200 flex items-center gap-1.5"><Clock size={12} /> {formatDateTime(selectedDoctor.last_login)}</div>
                        </div>
                    </div>

                    <div className="relative max-w-md">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Search patients..." value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-2"><Users size={16} className="text-blue-500" /><h3 className="text-sm font-bold text-slate-800 dark:text-white">Patients</h3><span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 py-0.5 px-2.5 rounded-full text-xs">{doctorPatients.length}</span></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead><tr className="bg-slate-50/80 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 text-xs border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider">
                                    <th className="px-4 py-3 font-semibold">Name</th>
                                    <th className="px-3 py-3 font-semibold">ID</th>
                                    <th className="px-3 py-3 font-semibold text-center">Age</th>
                                    <th className="px-3 py-3 font-semibold text-center">Total Scans</th>
                                    <th className="px-3 py-3 font-semibold text-center">Nodules</th>
                                    <th className="px-4 py-3 font-semibold text-center">Latest Scan</th>
                                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {doctorPatients.map(p => (
                                        <tr key={p.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors">
                                            <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">{p.name.substring(0, 2).toUpperCase()}</div><p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{p.name}</p></div></td>
                                            <td className="px-3 py-4"><p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{p.patient_id_tag}</p></td>
                                            <td className="px-3 py-4 text-center"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">{p.age}Y</span></td>
                                            <td className="px-3 py-4 text-center"><span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{p.total_scans}</span></td>
                                            <td className="px-3 py-4 text-center">{p.total_nodules > 0 ? <span className="font-bold text-rose-600 dark:text-rose-400 text-sm">{p.total_nodules}</span> : <span className="text-emerald-500 font-bold text-sm">Clear</span>}</td>
                                            <td className="px-4 py-4 text-center">
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${getStatusBadge(p.last_scan_display_status || p.last_scan_status)}`}>
                                                        {p.last_scan_display_status || p.last_scan_status}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{p.last_scan_date}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right"><button onClick={() => { setSelectedPatient(p); setView('patient-detail'); }} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 font-bold text-xs transition-all"><Eye size={12} /> View</button></td>
                                        </tr>
                                    ))}
                                    {doctorPatients.length === 0 && <tr><td colSpan={7}><EmptyState icon={<Users size={32} className="opacity-30" />} message="No patients found for this doctor" /></td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* 🔴 الجزء الجديد المحدث بالكامل لصفحة Patient Detail */}
            {view === 'patient-detail' && patientDetail && (
                <div className="space-y-8 animate-fade-in-up pb-10">
                    {/* بطاقة معلومات المريض العلوية (تصميم جديد) */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

                        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10">
                            <div className="w-20 h-20 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl font-black shrink-0 border border-emerald-200 dark:border-emerald-500/30">
                                {patientDetail.patient_info.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white">{patientDetail.patient_info.name}</h3>
                                    {patientDetail.patient_info.is_smoker && <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">Smoker</span>}
                                    {patientDetail.patient_info.has_previous_tumors && <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">Prev. Tumors</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1.5"><User size={16} className="text-slate-400" /> ID: <span className="font-mono text-slate-700 dark:text-slate-300">{patientDetail.patient_info.patient_id_tag}</span></span>
                                    <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                    <span>{patientDetail.patient_info.age}Y • {patientDetail.patient_info.gender}</span>
                                    <span className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                    <span className="flex items-center gap-1.5"><Stethoscope size={16} className="text-slate-400" /> Dr. {patientDetail.doctor_info.name}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* قسم الـ Timeline الجديد للأشعات */}
                    <div className="mt-8">
                        <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                            <Activity size={20} className="text-blue-500" /> Radiological Timeline
                        </h4>

                        <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 space-y-8 pb-4">
                            {patientDetail.timeline.map((entry, i) => {
                                // 🔴 حساب الحالة الصحيحة (Unreviewed بدل Completed إذا كان هناك Pending)
                                const derivedStatus = entry.status === 'Completed' && entry.pending_count > 0 ? 'Unreviewed' : entry.status;
                                const statusColor = derivedStatus === 'Completed' ? 'bg-emerald-500' : derivedStatus === 'Unreviewed' ? 'bg-indigo-500' : derivedStatus === 'Processing' ? 'bg-amber-500' : 'bg-rose-500';

                                return (
                                    <div key={i} className="relative pl-8">
                                        {/* نقطة التايم لاين */}
                                        <div className={`absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-[#f8fafc] dark:border-slate-950 ${statusColor} shadow-sm`}></div>

                                        {/* بطاقة الأشعة */}
                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
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
                                                    {entry.pending_count > 0 && (
                                                        <>
                                                            <div className="w-px bg-slate-200 dark:bg-slate-700"></div>
                                                            <div className="text-center px-2">
                                                                <p className="text-xl font-black text-amber-500">{entry.pending_count}</p>
                                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Pending</p>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* تفاصيل الأورام (Nodules) */}
                                            {entry.nodules.length > 0 ? (
                                                <div>
                                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 pl-1">Detected Nodules</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                            {patientDetail.timeline.length === 0 && (
                                <p className="text-slate-500 dark:text-slate-400 ml-8 italic">No scans recorded for this patient.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals for Add/Edit/Reset/Delete */}
            {showAddModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2"><UserPlus size={22} className="text-blue-500" /> Register Doctor</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleAddDoctor} className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Full Name</label><input type="text" required value={newDoctor.name} onChange={(e) => setNewDoctor(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2 border rounded-xl bg-white dark:bg-slate-800 dark:text-white" /></div>
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Email</label><input type="email" required value={newDoctor.email} onChange={(e) => setNewDoctor(p => ({ ...p, email: e.target.value }))} className="w-full px-4 py-2 border rounded-xl bg-white dark:bg-slate-800 dark:text-white" /></div>
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Password</label><input type="password" required minLength={4} value={newDoctor.password} onChange={(e) => setNewDoctor(p => ({ ...p, password: e.target.value }))} className="w-full px-4 py-2 border rounded-xl bg-white dark:bg-slate-800 dark:text-white" /></div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 rounded-xl border font-bold text-sm">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm flex justify-center">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Add Doctor'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && editingDoctor && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowEditModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2"><Pencil size={22} className="text-violet-500" /> Edit Doctor</h3>
                            <button onClick={() => setShowEditModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleEditDoctor} className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Full Name</label><input type="text" required value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2 border rounded-xl bg-white dark:bg-slate-800 dark:text-white" /></div>
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Email</label><input type="email" required value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} className="w-full px-4 py-2 border rounded-xl bg-white dark:bg-slate-800 dark:text-white" /></div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2 rounded-xl border font-bold text-sm">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm flex justify-center">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showResetModal && resetTarget && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowResetModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2"><KeyRound size={22} className="text-amber-500" /> Reset Password</h3>
                            <button onClick={() => setShowResetModal(false)} className="p-2 rounded-xl text-slate-400"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">New Password</label><input type="password" required minLength={4} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="w-full px-4 py-2 border rounded-xl bg-white dark:bg-slate-800 dark:text-white" /></div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowResetModal(false)} className="flex-1 px-4 py-2 rounded-xl border font-bold text-sm">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-sm flex justify-center">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Reset'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={!!deleteTarget} title="Delete Doctor Permanently?" message={`This will permanently delete Dr. ${deleteTarget?.name || ''} and ALL their data.`} onConfirm={confirmDeleteDoctor} onCancel={() => setDeleteTarget(null)} confirmText="Delete Forever" />
        </div>
    );
}