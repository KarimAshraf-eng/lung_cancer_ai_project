import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText, confirmColor, icon }) {
    if (!isOpen) return null;

    const colorClasses = confirmColor === 'rose'
        ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30'
        : confirmColor === 'amber'
            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in bg-slate-900/60 backdrop-blur-sm">
            <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up border border-slate-200 dark:border-slate-800 overflow-hidden">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors z-10">
                    <X size={20} />
                </button>

                <div className="p-8">
                    <div className={`w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center ${confirmColor === 'rose' ? 'bg-rose-100 dark:bg-rose-500/10' : confirmColor === 'amber' ? 'bg-amber-100 dark:bg-amber-500/10' : 'bg-blue-100 dark:bg-blue-500/10'}`}>
                        {icon || <AlertTriangle size={32} className={confirmColor === 'rose' ? 'text-rose-500' : confirmColor === 'amber' ? 'text-amber-500' : 'text-blue-500'} />}
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-800 dark:text-white text-center mb-3">
                        {title || 'Are you sure?'}
                    </h3>

                    <p className="text-slate-500 dark:text-slate-400 text-center text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="px-8 pb-8 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl font-bold text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-all ${colorClasses}`}
                    >
                        {confirmText || 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}