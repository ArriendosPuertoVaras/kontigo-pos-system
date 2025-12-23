'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

type SyncStatus = 'saved' | 'saving' | 'error' | 'offline';

interface AutoSyncContextType {
    status: SyncStatus;
    lastSyncedAt: Date | null;
    triggerChange: () => void;
    forceSync: () => Promise<void>;
}

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
        } catch (error) {
            console.error("Auto-Sync Failed:", error);
            setStatus('error');
            // Don't toast on background error to avoid annoyance, just show icon
        }
    }, []);

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
