import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, UploadCloud, FileText, LogOut, ShieldCheck, User, MonitorPlay, Moon, Sun, Menu, X, Users, ChevronsUpDown, Minus, CircleStop, Loader2, ScanSearch, UserSearch, BarChart3, Server } from 'lucide-react';
import { useContext, useState, useRef, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import { ScanProcessingContext } from '../context/ScanProcessingContext';
import ConfirmDialog from './ConfirmDialog';

export default function Layout() {
    const location = useLocation();
    const { user, logout } = useContext(AuthContext);
    const { theme, toggleTheme } = useContext(ThemeContext);
    const { isProcessing, progress, patientName, processingQueue, cancelAnalysis, overlayMode, setOverlayMode, isCancelling } = useContext(ScanProcessingContext);
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isQueueDropdownOpen, setIsQueueDropdownOpen] = useState(false);
    const queueDropdownRef = useRef(null);
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const isAdmin = user?.is_admin === true;

    // 🔴 تحديث قائمة الـ Admin الجانبية (Sidebar)
    const menuItems = isAdmin
        ? [
            { name: 'Overview', path: '/admin/overview', icon: <ShieldCheck size={20} /> },
            { name: 'Doctors', path: '/admin/doctors', icon: <Users size={20} /> },
            { name: 'Scans', path: '/admin/scans', icon: <ScanSearch size={20} /> },
            { name: 'Patient Search', path: '/admin/patients', icon: <UserSearch size={20} /> },
            { name: 'Analytics', path: '/admin/analytics', icon: <BarChart3 size={20} /> },
            { name: 'System Health', path: '/admin/system-health', icon: <Server size={20} /> },
            { name: 'My Profile', path: '/profile', icon: <User size={20} /> },
        ]
        : [
            { name: 'Dashboard', path: '/', icon: <Activity size={20} /> },
            { name: 'Patients', path: '/patients', icon: <Users size={20} /> },
            { name: 'Upload Scan', path: '/upload', icon: <UploadCloud size={20} /> },
            { name: 'AI Viewer', path: '/viewer-list', icon: <MonitorPlay size={20} /> },
            { name: 'Reports', path: '/reports', icon: <FileText size={20} /> },
            { name: 'My Profile', path: '/profile', icon: <User size={20} /> },
        ];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (queueDropdownRef.current && !queueDropdownRef.current.contains(event.target)) {
                setIsQueueDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 🔴 تحديث التوجيه التلقائي للـ Admin
    useEffect(() => {
        if (isAdmin && !location.pathname.startsWith('/admin') && location.pathname !== '/profile' && location.pathname !== '/login') {
            navigate('/admin/overview', { replace: true });
        }
    }, [isAdmin, location.pathname, navigate]);

    const handleConfirmCancel = () => {
        cancelAnalysis();
        setShowCancelDialog(false);
    };

    const getPageTitle = () => {
        if (isAdmin) {
            if (location.pathname === '/profile') return 'My Profile';
            const match = menuItems.find(i => location.pathname === i.path);
            return match?.name || 'System Control Center';
        }
        const match = menuItems.find(i => location.pathname === i.path || (i.name === 'AI Viewer' && location.pathname.includes('/scan-viewer')));
        return match?.name || (location.pathname === '/' ? 'Dashboard' : 'Portal');
    };

    return (
        <div className="flex h-screen bg-[#f8fafc] dark:bg-slate-950 font-sans selection:bg-blue-200 transition-colors duration-300 overflow-hidden relative">
            {isMobileMenuOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            <div className={`fixed md:static inset-y-0 left-0 w-72 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-8 pb-4 relative">
                    <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-6 right-6 md:hidden text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>

                    <div className="flex items-center gap-3">
                        <div className={`${isAdmin ? 'bg-amber-50' : 'bg-blue-50'} p-2 rounded-xl shadow-lg ${isAdmin ? 'shadow-amber-500/30' : 'shadow-blue-500/30'}`}>
                            {isAdmin ? <ShieldCheck size={28} className="text-amber-600" /> : <Activity size={28} className="text-blue-600" />}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200">LungVision</h1>
                            <p className="text-xs text-blue-300 font-medium tracking-wider uppercase mt-1">{isAdmin ? 'System Admin' : 'AI Diagnostics'}</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
                    {menuItems.map((item, index) => {
                        const isActive = location.pathname === item.path || (item.name === 'AI Viewer' && location.pathname.includes('/scan-viewer'));
                        return (
                            <Link
                                key={item.name}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                style={{ animationDelay: `${index * 0.1}s` }}
                                className={`animate-slide-in flex items-center space-x-3 w-full p-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden ${isActive ? (isAdmin ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/30' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30') : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                            >
                                <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:text-blue-400'}`}>
                                    {item.icon}
                                </div>
                                <span className="font-medium relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 m-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className={`w-10 h-10 rounded-full ${isAdmin ? 'bg-gradient-to-tr from-amber-500 to-amber-400' : 'bg-gradient-to-tr from-blue-500 to-blue-400'} flex items-center justify-center text-white font-bold shadow-md shrink-0`}>
                            {user?.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold text-white truncate">{user?.name}</p>
                            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                    </div>
                    <button onClick={logout} className="flex items-center justify-center space-x-2 w-full p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 font-medium group">
                        <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span>Log out</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative w-full">
                <header className="h-20 flex items-center justify-between px-6 md:px-10 sticky top-0 z-10 bg-[#f8fafc]/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 transition-colors duration-300">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <Menu size={26} />
                        </button>
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                                {getPageTitle()}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center space-x-4">
                        {!isAdmin && isProcessing && (
                            <div className="relative hidden sm:block" ref={queueDropdownRef}>
                                <button onClick={() => setIsQueueDropdownOpen(!isQueueDropdownOpen)} className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 rounded-xl px-4 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all group">
                                    <div className="relative">
                                        <Activity size={18} className="text-blue-600 dark:text-blue-400 animate-pulse" />
                                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 max-w-[100px] truncate">{patientName}</span>
                                        <div className="w-16 h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                                            <div className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                        </div>
                                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{progress}%</span>
                                    </div>
                                </button>
                                {isQueueDropdownOpen && (
                                    <div className="absolute top-full mt-3 right-0 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-3 z-50 animate-in fade-in slide-in-from-top-2">
                                        <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Processing Queue</h4>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto px-3 space-y-2">
                                            {processingQueue.map((item, idx) => (
                                                <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${idx === 0 ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'}`}>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                                                        <Activity size={14} className={idx === 0 ? "animate-pulse" : ""} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm font-bold truncate ${idx === 0 ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>{item.name}</p>
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{idx === 0 ? `Analyzing... ${progress}%` : 'Waiting in Queue'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={toggleTheme} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all duration-300 focus:outline-none">
                            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} className="text-amber-400" />}
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-10 pb-20">
                    <Outlet />
                </main>

                {!isAdmin && isProcessing && overlayMode === 'micro' && (
                    <button onClick={() => setOverlayMode('minimized')} className="fixed bottom-6 right-6 z-[100] w-14 h-14 bg-white dark:bg-slate-900 rounded-full shadow-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-500 hover:scale-110 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 animate-in zoom-in fade-in">
                        <Activity size={24} className="animate-pulse" />
                        <span className="absolute top-0 right-0 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 border-2 border-white dark:border-slate-900"></span>
                        </span>
                    </button>
                )}

                {!isAdmin && isProcessing && overlayMode === 'minimized' && (
                    <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 min-w-[340px]">
                            <div className="flex items-center justify-between mb-4 gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-500/20">
                                        <Activity size={24} className="text-blue-500 animate-pulse" />
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-extrabold text-slate-800 dark:text-white leading-tight">AI Analysis Running</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Patient: {patientName}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setOverlayMode('full')} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors"><ChevronsUpDown size={18} /></button>
                                    <button onClick={() => setOverlayMode('micro')} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><Minus size={18} /></button>
                                </div>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden mb-2">
                                <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden" style={{ width: `${progress}%` }}><div className="absolute inset-0 bg-white/20 animate-pulse"></div></div>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-md">{progress}% complete</span>
                                <button onClick={() => setShowCancelDialog(true)} disabled={isCancelling} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors disabled:opacity-50 flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2 py-1 rounded-md">
                                    {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <CircleStop size={12} />} Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!isAdmin && isProcessing && overlayMode === 'full' && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300">
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                        <div className="relative bg-white dark:bg-slate-900 p-10 rounded-[2rem] shadow-2xl w-full max-w-md mx-4 flex flex-col items-center border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 fade-in duration-300">
                            <button onClick={() => setOverlayMode('minimized')} className="absolute top-5 right-5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-all duration-200"><Minus size={22} /></button>
                            <div className="w-24 h-24 rounded-3xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-6 shadow-inner border border-blue-100 dark:border-blue-500/20">
                                <Activity size={48} className="text-blue-500 animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white mb-2">AI Analysis in Progress</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium leading-relaxed mb-8 max-w-xs">
                                {processingQueue.length > 1 ? `Currently analyzing the scan for "${patientName}". There are ${processingQueue.length - 1} other scans pending.` : `Currently analyzing the scan for "${patientName}". This process may take a few minutes.`}
                            </p>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
                                <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden" style={{ width: `${progress}%` }}><div className="absolute inset-0 bg-white/20 animate-pulse"></div></div>
                            </div>
                            <div className="w-full flex justify-between text-xs font-bold text-slate-400"><span>0%</span><span className="text-blue-600 dark:text-blue-400">{progress}%</span><span>100%</span></div>
                            <button onClick={() => setShowCancelDialog(true)} disabled={isCancelling} className="mt-8 flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold border-2 border-rose-200 dark:border-rose-500/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-200 disabled:opacity-50">
                                {isCancelling ? <><Loader2 size={18} className="animate-spin" /> Cancelling...</> : <><CircleStop size={18} /> Cancel Analysis</>}
                            </button>
                        </div>
                    </div>
                )}

                <ConfirmDialog isOpen={showCancelDialog} onClose={() => setShowCancelDialog(false)} onConfirm={handleConfirmCancel} title="Cancel AI Analysis?" message="Are you sure you want to cancel the analysis? This will permanently delete the scan files, progress, and all detected nodules from the system." confirmText="Yes, Cancel & Delete" confirmColor="rose" />
            </div>
        </div>
    );
}