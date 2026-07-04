import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, ChevronLeft, ChevronRight, Save, Trash2, Crosshair, RotateCcw, Eye, EyeOff, SlidersHorizontal, ChevronDown, Loader2, FileEdit } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { WINDOW_PRESETS, PRESET_COLORS, buildWindowingLUT, applyWindowingToImageData } from '../utils/windowing';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export default function ScanViewer() {
    const { scanId } = useParams();
    const navigate = useNavigate();
    const [scanData, setScanData] = useState(null);
    const [annotations, setAnnotations] = useState([]);

    const [doctorNotes, setDoctorNotes] = useState('');

    const [currentSlice, setCurrentSlice] = useState(0);
    const [totalSlices, setTotalSlices] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [fps, setFps] = useState(10);
    const playerRef = useRef(null);

    const [draggingId, setDraggingId] = useState(null);

    const [windowWidth, setWindowWidth] = useState(2000);
    const [windowCenter, setWindowCenter] = useState(0);
    const [selectedPreset, setSelectedPreset] = useState('default');
    const [inverted, setInverted] = useState(false);

    const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
    const presetDropdownRef = useRef(null);
    const [isFirstLoad, setIsFirstLoad] = useState(true);

    const canvasRef = useRef(null);
    const ctxRef = useRef(null);
    const pixelCacheRef = useRef(new Map());
    const loadingSetRef = useRef(new Set());
    const lutRef = useRef(buildWindowingLUT(2000, 0, false));
    const currentSliceRef = useRef(0);

    // 🔴 Ref جديد لحفظ الأورام اللي عدت عشان ميقفش عليها مرتين
    const activeNodulesRef = useRef(new Set());

    useEffect(() => { currentSliceRef.current = currentSlice; }, [currentSlice]);

    useEffect(() => {
        lutRef.current = buildWindowingLUT(windowWidth, windowCenter, inverted);
        renderSliceToCanvas(currentSliceRef.current);
    }, [windowWidth, windowCenter, inverted]);

    const renderSliceToCanvas = useCallback((sliceNum) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cached = pixelCacheRef.current.get(sliceNum);
        if (!cached) return;

        if (!ctxRef.current) ctxRef.current = canvas.getContext('2d');
        const ctx = ctxRef.current;

        if (canvas.width !== cached.width || canvas.height !== cached.height) {
            canvas.width = cached.width;
            canvas.height = cached.height;
        }

        const imageData = new ImageData(
            new Uint8ClampedArray(cached.pixels),
            cached.width,
            cached.height
        );

        applyWindowingToImageData(imageData, lutRef.current);
        ctx.putImageData(imageData, 0, 0);
    }, []);

    const loadSlicePixels = useCallback(async (sliceNum) => {
        if (pixelCacheRef.current.has(sliceNum) || loadingSetRef.current.has(sliceNum)) return;
        loadingSetRef.current.add(sliceNum);

        try {
            const url = `${BACKEND_URL}/windowed-slice?scan_id=${scanId}&slice_num=${sliceNum}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();

            const bitmap = await createImageBitmap(blob);
            const offscreen = document.createElement('canvas');
            offscreen.width = bitmap.width;
            offscreen.height = bitmap.height;
            const offCtx = offscreen.getContext('2d');
            offCtx.drawImage(bitmap, 0, 0);

            const imgData = offCtx.getImageData(0, 0, bitmap.width, bitmap.height);
            pixelCacheRef.current.set(sliceNum, {
                width: bitmap.width,
                height: bitmap.height,
                pixels: new Uint8ClampedArray(imgData.data),
            });

            bitmap.close();

            if (sliceNum === currentSliceRef.current) {
                setIsFirstLoad(false);
                renderSliceToCanvas(sliceNum);
            }
        } catch (e) {
            console.error(`Failed to load slice ${sliceNum}:`, e);
        } finally {
            loadingSetRef.current.delete(sliceNum);
        }
    }, [scanId, renderSliceToCanvas]);

    useEffect(() => {
        if (totalSlices === 0 || !scanId) return;
        if (pixelCacheRef.current.has(currentSlice)) {
            setIsFirstLoad(false);
            renderSliceToCanvas(currentSlice);
        } else {
            loadSlicePixels(currentSlice);
        }
    }, [currentSlice, totalSlices, scanId, loadSlicePixels, renderSliceToCanvas]);

    useEffect(() => {
        if (totalSlices === 0) return;
        const PRELOAD_AHEAD = 15;
        for (let i = 1; i <= PRELOAD_AHEAD; i++) {
            const nextSlice = (currentSlice + i) % totalSlices;
            loadSlicePixels(nextSlice);
        }
    }, [currentSlice, totalSlices, loadSlicePixels]);

    // 🔴 تحديث منطق الإيقاف التلقائي (يقف عند اكتشاف ورم لأول مرة فقط) 🔴
    useEffect(() => {
        const currentNodulesInRange = annotations.filter(a => {
            if (a.status === 'Rejected') return false;
            const start = a.start_slice ?? Math.max(0, a.slice_number - 8);
            const end = a.end_slice ?? Math.min(totalSlices - 1, a.slice_number + 8);
            return currentSlice >= start && currentSlice <= end;
        });

        const currentIds = new Set(currentNodulesInRange.map(a => a.id));

        if (isPlaying) {
            let hasNewNodule = false;
            for (const id of currentIds) {
                if (!activeNodulesRef.current.has(id)) {
                    hasNewNodule = true;
                    break;
                }
            }
            if (hasNewNodule) {
                setIsPlaying(false);
            }
        }

        activeNodulesRef.current = currentIds;
    }, [currentSlice, annotations, isPlaying, totalSlices]);

    useEffect(() => {
        if (!isPlaying || totalSlices === 0) {
            clearInterval(playerRef.current);
            return;
        }
        playerRef.current = setInterval(() => {
            setCurrentSlice(prev => (prev + 1 >= totalSlices ? 0 : prev + 1));
        }, 1000 / fps);
        return () => clearInterval(playerRef.current);
    }, [isPlaying, totalSlices, fps]);

    const applyPreset = (preset) => {
        setWindowWidth(preset.ww);
        setWindowCenter(preset.wc);
        setSelectedPreset(preset.id);
        setPresetDropdownOpen(false);
    };
    const handleWWChange = (e) => { setWindowWidth(parseInt(e.target.value)); setSelectedPreset('custom'); };
    const handleWCChange = (e) => { setWindowCenter(parseInt(e.target.value)); setSelectedPreset('custom'); };
    const resetWindowing = () => { setWindowWidth(2000); setWindowCenter(0); setSelectedPreset('default'); setInverted(false); };

    useEffect(() => {
        const handler = (e) => {
            if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target)) {
                setPresetDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        fetchData();
    }, [scanId]);

    const fetchData = async () => {
        try {
            const res = await api.get(`/scans/${scanId}/results`);
            setScanData(res.data);
            setAnnotations(res.data.results);
            setTotalSlices(res.data.total_slices || 0);
            if (res.data.patient_details?.doctor_notes) {
                setDoctorNotes(res.data.patient_details.doctor_notes);
            }
        } catch (e) {
            toast.error("Failed to load scan data.");
        }
    };

    const handleImageClick = async (e) => {
        if (draggingId) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const realX = ((e.clientX - rect.left) / rect.width) * 512;
        const realY = ((e.clientY - rect.top) / rect.height) * 512;
        try {
            const res = await api.post(`/scans/${scanId}/annotations`, {
                slice_number: currentSlice,
                coord_x: realX,
                coord_y: realY,
                diameter: 40.0,
                start_slice: Math.max(0, currentSlice - 8),
                end_slice: Math.min(totalSlices - 1, currentSlice + 8)
            });
            setAnnotations(prev => [...prev, res.data]);
            toast.success("Nodule added successfully.");
        } catch { toast.error("Failed to add nodule."); }
    };

    const handleDragEnd = async (e, id) => {
        setDraggingId(null);
        const rect = e.currentTarget.parentElement.getBoundingClientRect();
        const realX = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 512, 0), 512);
        const realY = Math.min(Math.max(((e.clientY - rect.top) / rect.height) * 512, 0), 512);
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, coord_x: realX, coord_y: realY } : a));
        try {
            await api.put(`/scans/${scanId}/annotations/${id}`, { coord_x: realX, coord_y: realY });
            toast.success("Nodule position updated.");
        } catch { toast.error("Failed to update position."); }
    };

    const updateStatus = async (id, status) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, status } : a));
        try {
            if (status === 'Rejected') {
                await api.delete(`/scans/${scanId}/annotations/${id}`);
                setAnnotations(prev => prev.filter(a => a.id !== id));
            } else {
                await api.put(`/scans/${scanId}/annotations/${id}`, { status });
            }
            toast.success(`Nodule marked as ${status}`);
        } catch { toast.error("Failed to update status."); }
    };

    // 🔴 تحديث نطاق الشريحة للورم
    const updateAnnotationField = async (id, field, value) => {
        try {
            await api.put(`/scans/${scanId}/annotations/${id}`, { [field]: value });
            toast.success("Slice bounds updated.");
        } catch {
            toast.error("Failed to update slice bounds.");
        }
    };

    const handleFinishReview = async () => {
        const saveToast = toast.loading("Saving review and notes...");
        try {
            const safePayload = {
                name: scanData.patient_details.name,
                age: Number(scanData.patient_details.age) || 0,
                gender: scanData.patient_details.gender,
                has_previous_tumors: !!scanData.patient_details.has_previous_tumors,
                prev_tumors_details: scanData.patient_details.prev_tumors_details || null,
                chest_pain_complaint: !!scanData.patient_details.chest_pain_complaint,
                chest_pain_details: scanData.patient_details.chest_pain_details || null,
                chronic_cough: !!scanData.patient_details.chronic_cough,
                chronic_cough_details: scanData.patient_details.chronic_cough_details || null,
                coughing_blood: !!scanData.patient_details.coughing_blood,
                coughing_blood_details: scanData.patient_details.coughing_blood_details || null,
                weight_loss: !!scanData.patient_details.weight_loss,
                weight_loss_details: scanData.patient_details.weight_loss_details || null,
                occupational_exposure: !!scanData.patient_details.occupational_exposure,
                occ_exposure_details: scanData.patient_details.occ_exposure_details || null,
                previous_chest_diseases: scanData.patient_details.previous_chest_diseases || null,
                is_smoker: !!scanData.patient_details.is_smoker,
                pack_years: Number(scanData.patient_details.pack_years) || 0,
                smoking_cessation_date: scanData.patient_details.smoking_cessation_date || null,
                family_history: scanData.patient_details.family_history || null,
                doctor_notes: doctorNotes || null
            };

            await api.put(`/scans/${scanId}/patient`, safePayload);
            toast.success("Saved successfully!", { id: saveToast });
            navigate('/reports');
        } catch (err) {
            toast.error("Failed to save review.", { id: saveToast });
        }
    };

    const activePresetInfo = WINDOW_PRESETS.find(p => p.id === selectedPreset);
    const activePresetName = selectedPreset === 'custom' ? 'Custom' : (activePresetInfo?.name || 'Custom');

    if (!scanData || totalSlices === 0) {
        return <div className="p-10 text-center font-bold text-slate-500 animate-pulse">Loading Diagnostic Workspace...</div>;
    }

    const sortedAnnotations = [...annotations].sort((a, b) => a.slice_number - b.slice_number);

    // 🔴 فلترة بناءً على الـ Start والـ End
    const currentNodules = sortedAnnotations.filter(a => {
        const start = a.start_slice ?? Math.max(0, a.slice_number - 8);
        const end = a.end_slice ?? Math.min(totalSlices - 1, a.slice_number + 8);
        return currentSlice >= start && currentSlice <= end;
    });

    return (
        <div className="h-[calc(100vh-100px)] flex gap-3 animate-fade-in-up p-2">
            {/* ========== Left Sidebar ========== */}
            <div className="w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-base flex items-center gap-2">
                        <Crosshair size={18} className="text-blue-500" /> Findings
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{sortedAnnotations.length} nodules in volume</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[150px]">
                    {sortedAnnotations.length === 0 && <div className="text-center text-sm text-slate-400 mt-10">No nodules found.</div>}
                    {sortedAnnotations.map((ann, index) => {
                        const start = ann.start_slice ?? Math.max(0, ann.slice_number - 8);
                        const end = ann.end_slice ?? Math.min(totalSlices - 1, ann.slice_number + 8);
                        const isActive = currentSlice >= start && currentSlice <= end;

                        return (
                            <div key={ann.id} className={`p-3 rounded-xl border transition-all ${isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 shadow-md shadow-blue-500/10' : 'border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500/30'}`}>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="font-bold text-slate-800 dark:text-white text-sm">Nodule #{index + 1}</span>
                                    <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md font-bold">Center: {ann.slice_number}</span>
                                </div>
                                <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-2">Conf: {(ann.confidence * 100).toFixed(1)}%</div>

                                {/* 🔴 مربعات تحديد البداية والنهاية */}
                                <div className="flex gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                                    <div className="flex-1">
                                        <label className="text-[9px] text-slate-500 uppercase font-bold mb-1 block">Start Slice</label>
                                        <input
                                            type="number"
                                            value={start}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                setAnnotations(prev => prev.map(x => x.id === ann.id ? { ...x, start_slice: val } : x));
                                            }}
                                            onBlur={(e) => updateAnnotationField(ann.id, 'start_slice', parseInt(e.target.value) || 0)}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[9px] text-slate-500 uppercase font-bold mb-1 block">End Slice</label>
                                        <input
                                            type="number"
                                            value={end}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                setAnnotations(prev => prev.map(x => x.id === ann.id ? { ...x, end_slice: val } : x));
                                            }}
                                            onBlur={(e) => updateAnnotationField(ann.id, 'end_slice', parseInt(e.target.value) || 0)}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-1.5">
                                    <button onClick={() => { setCurrentSlice(ann.slice_number); setIsPlaying(false); }} className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-1 rounded-lg text-[11px] font-bold hover:bg-blue-500 hover:text-white transition-colors">View</button>
                                    <button onClick={() => updateStatus(ann.id, 'Rejected')} className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-500/30 text-rose-500 p-1 rounded-lg hover:bg-rose-500 hover:text-white transition-colors" title="Delete"><Trash2 size={12} /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">
                        <FileEdit size={14} /> Final Impression (Doctor Notes)
                    </label>
                    <textarea
                        value={doctorNotes}
                        onChange={(e) => setDoctorNotes(e.target.value)}
                        placeholder="Write your final report and recommendations here..."
                        className="w-full h-24 p-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 resize-none dark:text-white transition-colors"
                    />
                </div>

                <div className="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button onClick={handleFinishReview} className="w-full bg-slate-900 dark:bg-blue-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors shadow-md text-sm">
                        <Save size={16} /> Save & Finish Review
                    </button>
                </div>
            </div>

            {/* ========== CT Viewer ========== */}
            <div className="flex-1 flex flex-col bg-black rounded-2xl overflow-hidden shadow-2xl relative border border-slate-800 min-w-0">
                <div className="absolute top-0 left-0 right-0 px-4 py-2.5 flex justify-between items-center text-white z-20 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                    <div className="font-mono text-xs opacity-70 drop-shadow-md">
                        Patient: {scanData.patient_details.name} | ID: {scanData.patient_details.tag}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {selectedPreset !== 'default' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm ${selectedPreset === 'custom' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-white/10 text-white border-white/20'}`}>
                                {activePresetName}{inverted && ' (INV)'}
                            </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded-full backdrop-blur-sm border border-slate-700/50">WW: {windowWidth} | WC: {windowCenter}</span>
                        <div className="font-bold text-blue-400 bg-blue-900/40 px-2.5 py-0.5 rounded-full backdrop-blur-md border border-blue-500/30 shadow-lg text-xs whitespace-nowrap">Z: {currentSlice} / {totalSlices - 1}</div>
                    </div>
                </div>

                <div className="flex-1 w-full min-h-0 flex items-center justify-center bg-zinc-950 overflow-hidden">
                    <div
                        className="relative cursor-crosshair overflow-hidden"
                        onClick={handleImageClick}
                        style={{
                            maxWidth: 'calc(100% - 8px)',
                            maxHeight: 'calc(100% - 8px)',
                            aspectRatio: '1 / 1',
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full block"
                            style={{ imageRendering: 'auto' }}
                        />

                        {isFirstLoad && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-10">
                                <Loader2 size={36} className="text-blue-500 animate-spin mb-3" />
                                <span className="text-slate-400 text-xs font-bold">Preparing viewer...</span>
                            </div>
                        )}

                        {currentNodules.map(ann => {
                            const boxSizePct = (ann.diameter / 512) * 100;
                            const leftPct = ((ann.coord_x - ann.diameter / 2) / 512) * 100;
                            const topPct = ((ann.coord_y - ann.diameter / 2) / 512) * 100;
                            const displayIndex = sortedAnnotations.findIndex(a => a.id === ann.id) + 1;
                            return (
                                <div key={ann.id} draggable onDragStart={() => setDraggingId(ann.id)} onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                    className={`absolute border-[2.5px] ${ann.source === 'Doctor' ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)]' : 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]'} cursor-move group hover:bg-rose-500/10 transition-colors`}
                                    style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${boxSizePct}%`, height: `${boxSizePct}%` }}
                                    onClick={(e) => e.stopPropagation()}>
                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-bold whitespace-nowrap px-2 py-0.5 rounded shadow-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700">
                                        #{displayIndex} | {(ann.confidence * 100).toFixed(1)}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-slate-900 border-t border-slate-800 z-20 px-3 py-2 flex items-center gap-2.5 shrink-0">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition-transform hover:scale-105 shadow-lg shadow-blue-600/30 shrink-0">
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button onClick={() => setCurrentSlice(p => Math.max(0, p - 1))} className="text-slate-400 hover:text-white transition-colors shrink-0"><ChevronLeft size={20} /></button>
                    <input type="range" min="0" max={totalSlices - 1} value={currentSlice} onChange={(e) => { setCurrentSlice(parseInt(e.target.value)); setIsPlaying(false); }} className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    <button onClick={() => setCurrentSlice(p => Math.min(totalSlices - 1, p + 1))} className="text-slate-400 hover:text-white transition-colors shrink-0"><ChevronRight size={20} /></button>
                    <select value={fps} onChange={(e) => setFps(Number(e.target.value))} className="bg-slate-800 text-slate-300 text-[11px] font-bold rounded-lg border border-slate-700 px-1.5 py-1 outline-none cursor-pointer shrink-0">
                        <option value={5}>0.5x</option><option value={10}>1x</option><option value={20}>2x</option><option value={30}>3x</option>
                    </select>

                    <div className="h-5 w-px bg-slate-700 shrink-0" />

                    <div className="relative shrink-0" ref={presetDropdownRef}>
                        <button onClick={() => setPresetDropdownOpen(!presetDropdownOpen)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap border ${selectedPreset === 'custom' ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30' : `${PRESET_COLORS[selectedPreset]?.active || 'bg-slate-500'} text-white border-white/10`}`}>
                            <SlidersHorizontal size={12} />{activePresetName}<ChevronDown size={12} />
                        </button>
                        {presetDropdownOpen && (
                            <div className="absolute bottom-full left-0 mb-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 min-w-[160px]">
                                {WINDOW_PRESETS.map(preset => {
                                    const isActive = selectedPreset === preset.id;
                                    return (
                                        <button key={preset.id} onClick={() => applyPreset(preset)} title={preset.description}
                                            className={`w-full text-left px-3 py-1.5 text-[11px] font-bold transition-all flex items-center justify-between ${isActive ? `${PRESET_COLORS[preset.id]?.active || 'bg-blue-600'} text-white` : 'text-slate-300 hover:bg-slate-700'}`}>
                                            <span>{preset.name}</span>
                                            <span className="text-[9px] opacity-60 font-mono">{preset.ww}/{preset.wc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono font-bold">WW</span>
                        <input type="range" min={1} max={4000} step={10} value={windowWidth} onChange={handleWWChange} className="w-16 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500" />
                        <span className="text-[10px] text-blue-400 font-mono font-bold w-8 text-right">{windowWidth}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono font-bold">WC</span>
                        <input type="range" min={-1024} max={3071} step={1} value={windowCenter} onChange={handleWCChange} className="w-16 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500" />
                        <span className="text-[10px] text-blue-400 font-mono font-bold w-8 text-right">{windowCenter}</span>
                    </div>

                    <div className="h-5 w-px bg-slate-700 shrink-0" />

                    <button onClick={() => setInverted(!inverted)} className={`p-1.5 rounded-lg transition-all shrink-0 ${inverted ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`} title={inverted ? 'Disable Inversion' : 'Enable Inversion'}>
                        {inverted ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={resetWindowing} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-all shrink-0" title="Reset Windowing">
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}