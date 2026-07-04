import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { User, Lock, Mail, Save } from 'lucide-react';
import toast from 'react-hot-toast'; // 🔴 إضافة toast
import api from '../api/axios';

export default function Profile() {
    const { user, setUser } = useContext(AuthContext);

    const [formData, setFormData] = useState({ name: '', password: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user) setFormData(prev => ({ ...prev, name: user.name }));
    }, [user]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const profileToast = toast.loading("Updating profile..."); // 🔴 Loading toast

        try {
            const response = await api.put('/doctors/update-profile', formData);
            setUser(response.data);
            toast.success("Profile updated successfully!", { id: profileToast }); // 🔴 Success toast
            setFormData(prev => ({ ...prev, password: '' }));
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to update profile.", { id: profileToast }); // 🔴 Error toast
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user) return <div className="p-6">Loading profile...</div>;

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-8 border-b border-slate-200 dark:border-slate-800 pb-4 transition-colors">
                <User size={32} className="text-blue-600 dark:text-blue-500" />
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">My Profile</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manage your account settings and password.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-6 transition-colors">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address (Cannot be changed)</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="email"
                            disabled
                            value={user.email}
                            className="bg-slate-50 dark:bg-slate-800/50 block w-full pl-10 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed transition-colors"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <User className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            name="name"
                            required
                            value={formData.name}
                            onChange={handleChange}
                            className="block w-full pl-10 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white transition-colors"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">New Password (Leave blank to keep current)</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="block w-full pl-10 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 dark:bg-slate-800 dark:text-white transition-colors"
                            placeholder="Enter new password"
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 transition-colors">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-700 font-bold shadow-md shadow-blue-500/20"
                    >
                        <Save size={20} />
                        {isSubmitting ? 'Saving Changes...' : 'Save Profile Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
}