'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/db';

type SyncStatus = 'saved' | 'saving' | 'error' | 'offline';

interface AutoSyncContextType {
    status: SyncStatus;
    lastSyncedAt: Date | null;
    triggerChange: () => void;
    forceSync: () => Promise<void>;
}

import { initSyncHooks } from '@/lib/sync_hooks';

const AutoSyncContext = createContext<AutoSyncContextType | undefined>(undefined);

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<SyncStatus>('saved');
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [pendingChanges, setPendingChanges] = useState(false);

    // Ref to hold the timer ID so we can clear it
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // The actual sync function
    const performSync = useCallback(async () => {
        if (typeof window === 'undefined') return;
        if (!navigator.onLine) {
            setStatus('offline');
            return;
        }

        setStatus('saving');
        try {
            // Dynamically import to ensure client-side execution
            const { syncService } = await import('@/lib/sync_service');
            await syncService.pushAll();

            setStatus('saved');
            setLastSyncedAt(new Date());
            setPendingChanges(false);
            console.log("☁️ Auto-Sync: Changes saved to cloud.");
        } catch (error: any) {
            console.error("Auto-Sync Failed:", error);
            setStatus('error');
            // DEBUG: Show the actual error to the user
            toast.error("Error de Sincronización", {
                description: error.message || "Revisa la consola para más detalles."
            });
        }
    }, []);



    // Initial Sync on Mount (Recover from offline close) or SMART RESTORE
    useEffect(() => {
        initSyncHooks();

        // --- STARTUP HANDSHAKE: Cloud-First Protocol ---
        const handshake = async () => {
            if (typeof window === 'undefined') return;
            const { syncService } = await import('@/lib/sync_service');
            const { db } = await import('@/lib/db');

            const restaurantId = localStorage.getItem('kontigo_restaurant_id');
            if (!restaurantId) return; // Login screen

            if (navigator.onLine) {
                console.log("☁️ Cloud-First: Initiating Startup Handshake...");
                setStatus('saving');
                const loadingToast = toast.loading("Sincronizando con la Nube...");

                try {
                    // 1. FORCE PULL: Download the truth from Supabase
                    // We use preventReload: true to handle the UI state manually
                    await syncService.restoreFromCloud((msg) => console.log(msg), true);

                    // 2. MARK AS READY: Enable Auto-Sync hooks
                    syncService.isReady = true;

                    setStatus('saved');
                    setLastSyncedAt(new Date());
                    toast.dismiss(loadingToast);
                    toast.success("✅ Conectado y Sincronizado");

                    console.log("☁️ Cloud-First: Handshake Complete. Device is Ready.");
                } catch (e) {
                    console.error("Cloud-First Handshake Failed:", e);
                    setStatus('error');
                    toast.dismiss(loadingToast);
                    toast.error("Error al sincronizar. Trabajando en modo local.");
                    // Allow local work as fallback
                    syncService.isReady = true;
                }
            } else {
                console.log("📡 Offline: Enabling local mode.");
                setStatus('offline');
                syncService.isReady = true;
            }
        };

        // Wait a bit for DB to be available
        const timer = setTimeout(handshake, 1000);
        return () => clearTimeout(timer);
    }, [performSync]);

    // Function called by components when they mutate data
    const triggerChange = useCallback(() => {
        setPendingChanges(true); // UI can show "Waiting..." or similar if needed
        setStatus('saving'); // Immediately show activity or "Unsaved" state? Let's say "saving" icon appears or "unsaved dot"

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer for 5 seconds (The "Quiet Courier" debounce)
        debounceTimerRef.current = setTimeout(() => {
            performSync();
        }, 5000);
    }, [performSync]);

    // Manual Force Sync (for Buttons)
    const forceSync = useCallback(async () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        await performSync();
    }, [performSync]);

    // Offline checking
    useEffect(() => {
        const handleOnline = () => {
            if (pendingChanges) triggerChange(); // Try syncing if we had pending stuff
            else setStatus('saved');
        };
        const handleOffline = () => setStatus('offline');

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [pendingChanges, triggerChange]);

    return (
        <AutoSyncContext.Provider value={{ status, lastSyncedAt, triggerChange, forceSync }}>
            {children}
        </AutoSyncContext.Provider>
    );
}

export function useAutoSync() {
    const context = useContext(AutoSyncContext);
    if (context === undefined) {
        throw new Error('useAutoSync must be used within an AutoSyncProvider');
    }
    return context;
}
