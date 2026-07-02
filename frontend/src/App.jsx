import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Upload from './pages/Upload';
import Reports from './pages/Reports';
import ScanViewer from './pages/ScanViewer';
import ViewerList from './pages/ViewerList';
import Profile from './pages/Profile';
import Patients from './pages/Patients';

// 🔴 استدعاء صفحات الإدارة الجديدة
import AdminOverview from './pages/AdminOverview';
import AdminDoctors from './pages/AdminDoctors';
import AdminScans from './pages/AdminScans';
import AdminPatientSearch from './pages/AdminPatientSearch';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminSystemHealth from './pages/AdminSystemHealth';

import { AuthProvider, AuthContext } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ScanProcessingProvider } from './context/ScanProcessingContext';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, isLoading } = useContext(AuthContext);
  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user?.is_admin) return <Navigate to="/" replace />;
  return children;
};

const DoctorOnlyRoute = ({ children }) => {
  const { user, isLoading } = useContext(AuthContext);
  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user?.is_admin) return <Navigate to="/admin/overview" replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DoctorOnlyRoute><Dashboard /></DoctorOnlyRoute>} />
        <Route path="patients" element={<DoctorOnlyRoute><Patients /></DoctorOnlyRoute>} />
        <Route path="upload" element={<DoctorOnlyRoute><Upload /></DoctorOnlyRoute>} />
        <Route path="reports" element={<DoctorOnlyRoute><Reports /></DoctorOnlyRoute>} />
        <Route path="profile" element={<Profile />} />
        <Route path="viewer-list" element={<DoctorOnlyRoute><ViewerList /></DoctorOnlyRoute>} />
        <Route path="scan-viewer/:scanId" element={<DoctorOnlyRoute><ScanViewer /></DoctorOnlyRoute>} />

        {/* 🔴 مسارات الـ Admin الجديدة المنفصلة */}
        <Route path="admin/overview" element={<ProtectedRoute adminOnly={true}><AdminOverview /></ProtectedRoute>} />
        <Route path="admin/doctors" element={<ProtectedRoute adminOnly={true}><AdminDoctors /></ProtectedRoute>} />
        <Route path="admin/scans" element={<ProtectedRoute adminOnly={true}><AdminScans /></ProtectedRoute>} />
        <Route path="admin/patients" element={<ProtectedRoute adminOnly={true}><AdminPatientSearch /></ProtectedRoute>} />
        <Route path="admin/analytics" element={<ProtectedRoute adminOnly={true}><AdminAnalytics /></ProtectedRoute>} />
        <Route path="admin/system-health" element={<ProtectedRoute adminOnly={true}><AdminSystemHealth /></ProtectedRoute>} />
        {/* توجيه مسار /admin القديم إلى /admin/overview تلقائياً */}
        <Route path="admin" element={<Navigate to="/admin/overview" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ScanProcessingProvider>
            <Toaster position="top-right" toastOptions={{ className: 'dark:bg-slate-800 dark:text-white', duration: 4000 }} />
            <AppRoutes />
          </ScanProcessingProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;