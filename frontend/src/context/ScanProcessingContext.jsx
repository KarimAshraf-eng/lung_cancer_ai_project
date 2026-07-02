import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export const ScanProcessingContext = createContext();

export const ScanProcessingProvider = ({ children }) => {
    const [processingQueue, setProcessingQueue] = useState([]);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState(null);
    const intervalRef = useRef(null);
    const hasNotifiedRef = useRef(false);

    // إضافة حالة للتحكم في النافذة العائمة بشكل عام
    const [overlayMode, setOverlayMode] = useState(() => {
        return localStorage.getItem('globalOverlayMode') || 'hidden';
    });

    useEffect(() => {
        if (overlayMode !== 'hidden') {
            localStorage.setItem('globalOverlayMode', overlayMode);
        }
    }, [overlayMode]);

    useEffect(() => {
        if (processingQueue.length === 0) {
            setOverlayMode('hidden');
            localStorage.removeItem('globalOverlayMode');
        }
    }, [processingQueue.length]);

    const requestNotificationPermission = useCallback(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }, []);

    useEffect(() => {
        const storedQueue = localStorage.getItem('processingQueue');
        if (storedQueue) {
            try {
                setProcessingQueue(JSON.parse(storedQueue));
            } catch (e) { console.error("Failed to parse queue", e); }
        }
    }, []);

    const startTracking = useCallback((scanId, name = 'Patient') => {
        setProcessingQueue(prev => {
            const exists = prev.find(p => p.id === scanId);
            if (exists) return prev;

            const newQueue = [...prev, { id: scanId, name }];
            localStorage.setItem('processingQueue', JSON.stringify(newQueue));
            return newQueue;
        });
        setOverlayMode('minimized'); // البدء بالحالة المصغرة التلقائية
        requestNotificationPermission();
    }, [requestNotificationPermission]);

    const removeFromQueue = useCallback((scanId) => {
        setProcessingQueue(prev => {
            const newQueue = prev.filter(p => p.id !== scanId);
            localStorage.setItem('processingQueue', JSON.stringify(newQueue));
            return newQueue;
        });
    }, []);

    const stopTracking = useCallback(() => {
        clearInterval(intervalRef.current);
        setProcessingQueue([]);
        setProgress(0);
        setStatus(null);
        setOverlayMode('hidden');
        localStorage.removeItem('processingQueue');
        localStorage.removeItem('globalOverlayMode');
    }, []);

    useEffect(() => {
        const activeScan = processingQueue.length > 0 ? processingQueue[0] : null;

        if (!activeScan) {
            clearInterval(intervalRef.current);
            setProgress(0);
            setStatus(null);
            return;
        }

        hasNotifiedRef.current = false;
        setStatus('Processing');
        setProgress(0);

        const poll = async () => {
            try {
                const res = await api.get(`/scans/${activeScan.id}/progress`);
                const data = res.data;
                setProgress(data.progress);
                setStatus(data.status);

                const isComplete = data.progress >= 100 || data.status === 'Completed';
                const isFailed = data.status === 'Failed' || data.status === 'Unknown';

                if (isComplete) {
                    if (!hasNotifiedRef.current) {
                        hasNotifiedRef.current = true;
                        sendNotification(
                            'LungVision - Analysis Complete ✅',
                            `Scan analysis for "${activeScan.name}" has finished successfully.`
                        );
                        removeFromQueue(activeScan.id);
                    }
                } else if (isFailed) {
                    if (!hasNotifiedRef.current) {
                        hasNotifiedRef.current = true;
                        toast.error(`Analysis failed for ${activeScan.name}.`);
                        removeFromQueue(activeScan.id);
                    }
                }
            } catch (err) {
                console.error('Progress polling error:', err);
            }
        };

        poll();
        intervalRef.current = setInterval(poll, 3000);

        return () => clearInterval(intervalRef.current);
    }, [processingQueue, removeFromQueue]);

    const sendNotification = (title, body) => {
        toast.success(title, { duration: 8000, icon: '🔬' });
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body,
                    icon: '/favicon.svg',
                    tag: 'lungvision-processing',
                    requireInteraction: true,
                });
            } catch (e) {
                console.warn('Browser notification failed:', e);
            }
        }
    };

    const cancelAnalysis = useCallback(async () => {
        const activeScan = processingQueue[0];
        if (!activeScan) return;

        try {
            await api.delete(`/scans/${activeScan.id}`);
            removeFromQueue(activeScan.id);
            toast.success('Analysis cancelled and scan deleted.');
        } catch (err) {
            console.error('Cancel analysis error:', err);
            toast.error('Failed to cancel analysis.');
        }
    }, [processingQueue, removeFromQueue]);

    const isProcessing = processingQueue.length > 0;
    const processingScanId = processingQueue.length > 0 ? processingQueue[0].id : null;
    const patientName = processingQueue.length > 0 ? processingQueue[0].name : '';
    const isCancelling = false;

    return (
        <ScanProcessingContext.Provider value={{
            isProcessing,
            processingScanId,
            progress,
            status,
            patientName,
            startTracking,
            stopTracking,
            cancelAnalysis,
            isCancelling,
            requestNotificationPermission,
            processingQueue,
            overlayMode,
            setOverlayMode,
        }}>
            {children}
        </ScanProcessingContext.Provider>
    );
};