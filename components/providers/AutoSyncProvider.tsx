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

        // Wait a bit for app to settle
        const timer = setTimeout(async () => {
            if (typeof window === 'undefined') return;

            if (navigator.onLine) {
                // 0. GATEKEEPER: Do nothing if we are not logged in (No Restaurant ID)
                const restaurantId = localStorage.getItem('kontigo_restaurant_id');
                if (!restaurantId) {
                    // We are at Login Screen (or just setup). Do NOT try to sync or restore.
                    return;
                }

                // 1. SMART CHECK: Health Check & Repair
                const productCount = await db.products.count();
                const categoryCount = await db.categories.count();

                // REPAIR: Logic Removed by User Request (No Auto-Seeding)
                // if (categoryCount <= 2) { ... }

                if (productCount === 0) {
                    console.log("🦁 Smart Sync: Local DB is empty. Checking cloud...");
                    try {
                        // Dynamically import service
                        const { syncService } = await import('@/lib/sync_service');
                        const hasCloud = await syncService.hasCloudData();

                        if (hasCloud) {
                            console.log("☁️ Smart Sync: Found data in cloud! Auto-Restoring...");
                            setStatus('saving');
                            toast.info("Descargando datos de la nube...");

                            try {
                                await syncService.restoreFromCloud((msg) => console.log(msg));
                                toast.success("✅ Datos recuperados exitosamente");
                                window.location.reload();
                                return;
                            } catch (e) {
                                console.error("Smart Sync Restore Failed:", e);
                                toast.error("Error al restaurar datos");
                                setStatus('error');
                            }
                        } else {
                            console.log("🦁 Smart Sync: Cloud appears empty.");
                            toast("Sistema listo (Modo Local)", {
                                description: "No se encontraron datos en la nube para sincronizar.",
                                duration: 5000
                            });
                        }
                    } catch (importError) {
                        console.error("Smart Sync Import Failed:", importError);
                        // Likely env vars missing or network error on script load
                        toast.error("Error de Configuración", {
                            description: "No se pudo conectar a los servicios de nube."
                        });
                    }
                } else {
                    console.log("🚀 Initial App Sync: Ensuring cloud consistency...");
                    performSync();
                }
            }
        }, 1500); // 1.5s is enough
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
