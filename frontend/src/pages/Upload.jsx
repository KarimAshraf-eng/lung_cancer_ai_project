import { useState, useEffect, useContext, useRef, useCallback, memo } from 'react';
import {
    UploadCloud,
    CheckCircle2,
    Activity,
    Search,
    User,
    FileText,
    Stethoscope,
    ChevronRight,
    X,
    Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { ScanProcessingContext } from '../context/ScanProcessingContext';

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const REQUIRED_EXTENSIONS = ['.mhd', '.raw'];

// ─── Extracted & Memoized Components ────────────────────────────────

const SectionHeader = memo(function SectionHeader({ step, icon: Icon, title }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25">
                <Icon size={20} strokeWidth={2.5} />
            </div>
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">
                    Step {step}
                </p>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {title}
                </h3>
            </div>
        </div>
    );
});

const FormField = memo(function FormField({ label, name, type = 'text', value, onChange, required = false, placeholder, children }) {
    const baseClasses =
        'w-full px-4 py-3 rounded-xl border outline-none transition-all duration-200 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border-slate-200 dark:border-slate-700 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300 dark:hover:border-slate-600';

    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300">
                {label}
                {required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            {children ? (
                children
            ) : (
                <input
                    type={type}
                    name={name}
                    required={required}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className={baseClasses}
                />
            )}
        </div>
    );
});

const ToggleSwitch = memo(function ToggleSwitch({ checked, onChange, name, colorClass = 'bg-blue-500', ringClass = 'ring-blue-500/30' }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            name={name}
            onClick={() => onChange({ target: { name, type: 'checkbox', checked: !checked } })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 ${ringClass} ${checked ? colorClass : 'bg-slate-200 dark:bg-slate-600'}`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}
            />
        </button>
    );
});

const SymptomCard = memo(function SymptomCard({ label, description, checkName, detailName, detailPlaceholder, isSmoker = false, checked, onChange, detailValue, children }) {
    const isActive = checked;
    const accentColor = isSmoker
        ? { border: 'border-amber-300', bg: 'bg-amber-50/60', darkBorder: 'dark:border-amber-500/30', darkBg: 'dark:bg-amber-500/5', dot: 'bg-amber-400' }
        : { border: 'border-blue-200', bg: 'bg-blue-50/40', darkBorder: 'dark:border-blue-500/30', darkBg: 'dark:bg-blue-500/5', dot: 'bg-blue-400' };

    const colorClass = isSmoker ? 'bg-amber-500' : 'bg-blue-500';
    const ringClass = isSmoker ? 'ring-amber-500/30' : 'ring-blue-500/30';

    return (
        <div
            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isActive
                ? `${accentColor.border} ${accentColor.bg} ${accentColor.darkBorder} ${accentColor.darkBg} shadow-sm`
                : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
        >
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${isActive ? accentColor.dot : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <div>
                        <p className="font-semibold text-sm text-slate-700 dark:text-slate-200">{label}</p>
                        {description && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
                <ToggleSwitch
                    checked={isActive}
                    onChange={onChange}
                    name={checkName}
                    colorClass={colorClass}
                    ringClass={ringClass}
                />
            </div>

            {isActive && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {children || (
                        <input
                            type="text"
                            name={detailName}
                            value={detailValue}
                            onChange={onChange}
                            placeholder={detailPlaceholder || `Details about ${label.toLowerCase()}...`}
                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200"
                        />
                    )}
                </div>
            )}
        </div>
    );
});

// ─── Initial States ────────────────────────────────────────────────
const initialPatientData = {
    patient_name: '',
    patient_age: '',
    patient_gender: 'Male',
    patient_tag: '',
};

const initialHistoryData = {
    has_previous_tumors: false,
    prev_tumors_details: '',
    occupational_exposure: false,
    occ_exposure_details: '',
    chest_pain_complaint: false,
    chest_pain_details: '',
    chronic_cough: false,
    chronic_cough_details: '',
    coughing_blood: false,
    coughing_blood_details: '',
    weight_loss: false,
    weight_loss_details: '',
    is_smoker: false,
    pack_years: '',
    smoking_cessation_date: '',
    has_previous_chest_diseases: false,
    previous_chest_diseases: '',
    has_family_history: false,
    family_history: '',
};

// ─── Main Component ────────────────────────────────────────────────

export default function Upload() {
    const navigate = useNavigate();
    const { startTracking, status, processingQueue } = useContext(ScanProcessingContext);
    const navigatedRef = useRef(false);
    const navigationTimerRef = useRef(null);

    const [isUploadingFiles, setIsUploadingFiles] = useState(false);

    const [patientData, setPatientData] = useState(initialPatientData);
    const [historyData, setHistoryData] = useState(initialHistoryData);
    const [files, setFiles] = useState([]);
    const [isFetchingPatient, setIsFetchingPatient] = useState(false);

    const fileInputRef = useRef(null);

    const handlePatientChange = useCallback((e) => {
        setPatientData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }, []);

    const handleHistoryChange = useCallback((e) => {
        setHistoryData((prev) => ({
            ...prev,
            [e.target.name]:
                e.target.type === 'checkbox' ? e.target.checked : e.target.value,
        }));
    }, []);

    const fetchPatientData = useCallback(async () => {
        const tag = patientData.patient_tag?.trim();
        if (!tag) {
            toast.error('Please enter a Patient ID / Tag first.');
            return;
        }

        setIsFetchingPatient(true);
        try {
            const res = await api.get(`/patients/by-tag/${encodeURIComponent(tag)}`);
            const p = res.data;

            setPatientData((prev) => ({
                ...prev,
                patient_name: p.name || '',
                patient_age: p.age?.toString() || '',
                patient_gender: p.gender || 'Male',
            }));

            setHistoryData({
                has_previous_tumors: !!p.has_previous_tumors,
                prev_tumors_details: p.prev_tumors_details || '',
                occupational_exposure: !!p.occupational_exposure,
                occ_exposure_details: p.occ_exposure_details || '',
                chest_pain_complaint: !!p.chest_pain_complaint,
                chest_pain_details: p.chest_pain_details || '',
                chronic_cough: !!p.chronic_cough,
                chronic_cough_details: p.chronic_cough_details || '',
                coughing_blood: !!p.coughing_blood,
                coughing_blood_details: p.coughing_blood_details || '',
                weight_loss: !!p.weight_loss,
                weight_loss_details: p.weight_loss_details || '',
                is_smoker: !!p.is_smoker,
                pack_years: p.pack_years?.toString() || '',
                smoking_cessation_date: p.smoking_cessation_date || '',
                has_previous_chest_diseases: !!(p.previous_chest_diseases && p.previous_chest_diseases.trim()),
                previous_chest_diseases: p.previous_chest_diseases || '',
                has_family_history: !!(p.family_history && p.family_history.trim()),
                family_history: p.family_history || '',
            });

            toast.success('Patient data loaded successfully!');
        } catch (err) {
            if (err.response?.status === 404) {
                toast('Patient not found. You can register a new patient.', {
                    icon: 'ℹ️',
                    duration: 4000,
                });
            } else {
                toast.error(err.response?.data?.detail || 'Error fetching patient data.');
            }
        } finally {
            setIsFetchingPatient(false);
        }
    }, [patientData.patient_tag]);

    const handleFileChange = useCallback((e) => {
        const selected = Array.from(e.target.files || []);

        if (selected.length === 0) {
            setFiles([]);
            return;
        }

        const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE);
        if (oversized.length > 0) {
            toast.error(`File(s) exceed the 500 MB limit: ${oversized.map((f) => f.name).join(', ')}`);
            setFiles([]);
            e.target.value = '';
            return;
        }

        const extensions = selected.map((f) => {
            const name = f.name.toLowerCase();
            return name.endsWith('.raw') ? '.raw' : name.endsWith('.mhd') ? '.mhd' : null;
        });

        const invalidFiles = selected.filter((_, i) => extensions[i] === null);
        if (invalidFiles.length > 0) {
            toast.error(`Invalid file type(s): ${invalidFiles.map((f) => f.name).join(', ')}. Only .mhd and .raw are allowed.`);
            setFiles([]);
            e.target.value = '';
            return;
        }

        const hasMhd = extensions.includes('.mhd');
        const hasRaw = extensions.includes('.raw');
        if (selected.length === 2 && (!hasMhd || !hasRaw)) {
            toast.error('Please select exactly one .mhd file and one .raw file.');
            setFiles([]);
            e.target.value = '';
            return;
        }

        if (selected.length !== 2) {
            toast.error('Please select exactly TWO files: one .mhd and one .raw.');
            setFiles([]);
            e.target.value = '';
            return;
        }

        setFiles(selected);
    }, []);

    const removeFile = useCallback((index) => {
        setFiles((prev) => {
            const next = prev.filter((_, i) => i !== index);
            return next;
        });
    }, []);

    const resetForm = useCallback(() => {
        setPatientData(initialPatientData);
        setHistoryData(initialHistoryData);
        setFiles([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    const handleSubmit = useCallback(
        async (e) => {
            e.preventDefault();

            if (files.length !== 2) {
                toast.error('Please select exactly two files (.mhd and .raw).');
                return;
            }

            const name = patientData.patient_name?.trim();
            const tag = patientData.patient_tag?.trim();
            const age = patientData.patient_age?.trim();

            if (!name) {
                toast.error('Patient Name is required.');
                return;
            }
            if (!age || Number(age) <= 0) {
                toast.error('Please enter a valid age.');
                return;
            }

            setIsUploadingFiles(true);

            const formData = new FormData();

            formData.append('patient_name', name);
            formData.append('patient_age', age);
            formData.append('patient_gender', patientData.patient_gender);
            formData.append('patient_tag', tag);

            Object.entries(historyData).forEach(([key, val]) => {
                if (key === 'pack_years') {
                    formData.append(key, val ? Number(val) : 0);
                } else if (typeof val === 'boolean') {
                    formData.append(key, val);
                } else {
                    formData.append(key, val ?? '');
                }
            });

            files.forEach((file) => formData.append('files', file));

            try {
                const response = await api.post('/scans/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 10 * 60 * 1000,
                });

                const scanId = response.data?.scan_id;
                if (!scanId) {
                    throw new Error('No scan_id returned from server.');
                }

                setIsUploadingFiles(false);
                startTracking(scanId, name);
                toast.success('Upload successful! AI Analysis has started.');

                resetForm();

            } catch (err) {
                setIsUploadingFiles(false);

                if (err.code === 'ECONNABORTED') {
                    toast.error('Upload timed out. The files may be too large. Please try again.');
                } else {
                    toast.error(err.response?.data?.detail || err.message || 'Upload failed.');
                }
            }
        },
        [files, patientData, historyData, startTracking, resetForm],
    );

    useEffect(() => {
        navigatedRef.current = false;
    }, [processingQueue]);

    useEffect(() => {
        const activeScan = processingQueue && processingQueue.length > 0 ? processingQueue[0] : null;

        if ((status === 'Completed' || status === 'Needs Review') && activeScan && !navigatedRef.current) {
            navigatedRef.current = true;
            toast.success('Analysis Complete! Redirecting...');

            navigationTimerRef.current = setTimeout(() => {
                navigate(`/scan-viewer/${activeScan.id}`);
            }, 1500);

            return () => {
                if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
            };
        }

        if (status === 'Failed' && !navigatedRef.current) {
            navigatedRef.current = true;
            toast.error('Analysis failed. Please try again.');
        }
    }, [status, processingQueue, navigate]);

    useEffect(() => {
        return () => {
            if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
        };
    }, []);

    const symptomItems = [
        { label: 'Previous Tumors', description: 'History of benign or malignant tumors', checkName: 'has_previous_tumors', detailName: 'prev_tumors_details' },
        { label: 'Occupational Exposure', description: 'Asbestos, silica, chemicals, etc.', checkName: 'occupational_exposure', detailName: 'occ_exposure_details' },
        { label: 'Chest Pain', description: 'Current or recurrent chest pain', checkName: 'chest_pain_complaint', detailName: 'chest_pain_details' },
        { label: 'Chronic Cough', description: 'Persistent cough for 8+ weeks', checkName: 'chronic_cough', detailName: 'chronic_cough_details' },
        { label: 'Hemoptysis', description: 'Coughing up blood', checkName: 'coughing_blood', detailName: 'coughing_blood_details' },
        { label: 'Weight Loss', description: 'Unintentional weight loss', checkName: 'weight_loss', detailName: 'weight_loss_details' },
    ];

    return (
        <div className="max-w-4xl mx-auto relative pb-12">

            {/* شاشة الرفع المؤقتة */}
            {isUploadingFiles && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                    <div className="relative bg-white dark:bg-slate-900 p-10 rounded-[2rem] shadow-2xl w-full max-w-md mx-4 flex flex-col items-center border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 fade-in duration-300">
                        <div className="w-24 h-24 rounded-3xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-6 shadow-inner border border-blue-100 dark:border-blue-500/20">
                            <UploadCloud size={48} className="text-blue-500 animate-bounce" />
                        </div>
                        <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">Uploading Files</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium leading-relaxed mb-8 max-w-xs">
                            Transferring CT scan files securely to the server. Please do not close this window.
                        </p>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
                            <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out w-1/2 animate-pulse" />
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                    Upload New CT Scan
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                    Fill in patient details, clinical history, and upload the CT scan files to begin AI analysis.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                    <SectionHeader step={1} icon={User} title="Patient Information" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <FormField label="Patient ID / Tag" name="patient_tag" required placeholder="Enter ID to auto-fill or register new...">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        name="patient_tag"
                                        required
                                        value={patientData.patient_tag}
                                        onChange={handlePatientChange}
                                        placeholder="Enter ID to auto-fill or register new..."
                                        className="w-full pl-10 pr-28 py-3 rounded-xl border outline-none transition-all duration-200 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border-slate-200 dark:border-slate-700 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300 dark:hover:border-slate-600"
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), fetchPatientData())}
                                    />
                                    <button
                                        type="button"
                                        onClick={fetchPatientData}
                                        disabled={isFetchingPatient}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isFetchingPatient ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Search size={13} />
                                                Fetch
                                            </>
                                        )}
                                    </button>
                                </div>
                            </FormField>
                        </div>

                        <FormField
                            label="Patient Name"
                            name="patient_name"
                            required
                            value={patientData.patient_name}
                            onChange={handlePatientChange}
                            placeholder="Full name..."
                        />

                        <FormField
                            label="Age"
                            name="patient_age"
                            type="number"
                            required
                            value={patientData.patient_age}
                            onChange={handlePatientChange}
                            placeholder="Years"
                        />

                        <FormField label="Gender" name="patient_gender" required value={patientData.patient_gender} onChange={handlePatientChange}>
                            <select
                                name="patient_gender"
                                value={patientData.patient_gender}
                                onChange={handlePatientChange}
                                className="w-full px-4 py-3 rounded-xl border outline-none transition-all duration-200 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer appearance-none"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                    backgroundPosition: 'right 0.75rem center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundSize: '1.25em 1.25em',
                                    paddingRight: '2.5rem',
                                }}
                            >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </FormField>
                    </div>
                </section>

                <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                    <SectionHeader step={2} icon={Stethoscope} title="Clinical History & Symptoms" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SymptomCard
                            label="Smoker"
                            description="Current or former smoker"
                            checkName="is_smoker"
                            isSmoker
                            checked={historyData.is_smoker}
                            onChange={handleHistoryChange}
                        >
                            {historyData.is_smoker && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Pack-years
                                        </label>
                                        <input
                                            type="number"
                                            name="pack_years"
                                            value={historyData.pack_years}
                                            onChange={handleHistoryChange}
                                            placeholder="e.g. 20"
                                            min="0"
                                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all duration-200"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Quit Date
                                        </label>
                                        <input
                                            type="date"
                                            name="smoking_cessation_date"
                                            value={historyData.smoking_cessation_date}
                                            onChange={handleHistoryChange}
                                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all duration-200"
                                        />
                                    </div>
                                </div>
                            )}
                        </SymptomCard>

                        {symptomItems.map((item) => (
                            <SymptomCard
                                key={item.checkName}
                                label={item.label}
                                description={item.description}
                                checkName={item.checkName}
                                detailName={item.detailName}
                                checked={historyData[item.checkName]}
                                onChange={handleHistoryChange}
                                detailValue={historyData[item.detailName]}
                            />
                        ))}

                        <SymptomCard
                            label="Previous Chest Diseases"
                            description="COPD, tuberculosis, asthma, etc."
                            checkName="has_previous_chest_diseases"
                            detailName="previous_chest_diseases"
                            detailPlaceholder="e.g. COPD, tuberculosis, asthma..."
                            checked={historyData.has_previous_chest_diseases}
                            onChange={handleHistoryChange}
                            detailValue={historyData.previous_chest_diseases}
                        />

                        <SymptomCard
                            label="Family History"
                            description="Relevant conditions in close relatives"
                            checkName="has_family_history"
                            detailName="family_history"
                            detailPlaceholder="e.g. Lung cancer in first-degree relative..."
                            checked={historyData.has_family_history}
                            onChange={handleHistoryChange}
                            detailValue={historyData.family_history}
                        />
                    </div>
                </section>

                <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
                    <SectionHeader step={3} icon={FileText} title="Upload CT Scan Files" />

                    <div
                        className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all duration-300 ${files.length === 2
                            ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5'
                            : 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 hover:border-blue-400 dark:hover:border-blue-500/40 hover:bg-blue-50/30 dark:hover:bg-blue-500/5'
                            }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            id="ct-files"
                            multiple
                            accept=".mhd,.raw"
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {files.length === 0 && (
                            <label
                                htmlFor="ct-files"
                                className="flex flex-col items-center cursor-pointer group"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <UploadCloud size={32} className="text-blue-500 dark:text-blue-400" />
                                </div>
                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                    Drop your files here or{' '}
                                    <span className="text-blue-600 dark:text-blue-400">browse</span>
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                    Select exactly one{' '}
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">.mhd</span> and one{' '}
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">.raw</span> file
                                    &nbsp;(max 500 MB each)
                                </p>
                            </label>
                        )}

                        {files.length > 0 && (
                            <div className="w-full space-y-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={18} className="text-emerald-500" />
                                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                            {files.length === 2
                                                ? 'Both files selected correctly'
                                                : `${files.length} file(s) selected — Need 2`}
                                        </span>
                                    </div>
                                    <label
                                        htmlFor="ct-files"
                                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                                    >
                                        Change files
                                    </label>
                                </div>

                                {files.map((file, index) => {
                                    const ext = file.name.toLowerCase().split('.').pop();
                                    const isMhd = ext === 'mhd';
                                    return (
                                        <div
                                            key={`${file.name}-${index}`}
                                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                                        >
                                            <div
                                                className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${isMhd
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                                                    : 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400'
                                                    }`}
                                            >
                                                .{ext}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                                    {file.name}
                                                </p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(index)}
                                                className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        All fields marked with <span className="text-rose-500">*</span> are required
                    </p>

                    <button
                        type="submit"
                        disabled={isUploadingFiles || files.length !== 2}
                        className="group flex items-center gap-2.5 py-3 px-8 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 disabled:from-slate-400 disabled:to-slate-400 dark:disabled:from-slate-700 dark:disabled:to-slate-700 disabled:shadow-none transition-all duration-300 disabled:cursor-not-allowed"
                    >
                        <Activity size={20} className="group-hover:animate-pulse" />
                        Start AI Analysis
                        <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </form>
        </div>
    );
}