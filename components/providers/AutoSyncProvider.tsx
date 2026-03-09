'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { Loader2, Cloud, ShieldCheck } from 'lucide-react';

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
    const [isInitializing, setIsInitializing] = useState(false);
    const [showResetButton, setShowResetButton] = useState(false);

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

        // GLOBAL SUBSCRIPTIONS (Listen everywhere, regardless of page)
        const registerGlobalListeners = async () => {
            // Dynamically import to ensure client-side execution
            const { syncService } = await import('@/lib/sync_service');

            // Critical Business Data (Must update in background)
            await syncService.subscribeToTable('orders', db.orders, () => {
                console.log("☁️ AutoSync: Background Order Update");
                // Optional: Trigger a UI refresh event if needed
            });
            await syncService.subscribeToTable('restaurant_tables', db.restaurantTables);
            try {
                // If kdsTickets table exists (it might not in all schemas yet, catch error)
                if ('kdsTickets' in db) {
                    await syncService.subscribeToTable('kds_tickets', (db as any).kdsTickets);
                }
            } catch (e) { /* ignore */ }

            await syncService.subscribeToTable('shifts', db.shifts);
        };
        registerGlobalListeners();

        // --- STARTUP HANDSHAKE: Cloud-First Protocol ---
        const handshake = async () => {
            if (typeof window === 'undefined') return;
            const { syncService } = await import('@/lib/sync_service');
            const { db, seedDatabase } = await import('@/lib/db');

            const restaurantId = localStorage.getItem('kontigo_restaurant_id');
            if (!restaurantId) {
                setIsInitializing(false);
                return; // Login screen - no block
            }

            // --- STARTUP HANDSHAKE: Cloud-First Protocol ---
            const isHandshakeDone = sessionStorage.getItem('kontigo_handshake_done') === 'true';

            if (navigator.onLine) {
                console.log("☁️ Cloud-First: Checking Startup Handshake...");

                let handshakeTimeout: NodeJS.Timeout | null = null;

                // Only show overlay if handshake wasn't done in this session
                if (!isHandshakeDone) {
                    setIsInitializing(true);
                    setStatus('saving');
                    console.log("☁️ Cloud-First: Initiating Visual Handshake...");
                    handshakeTimeout = setTimeout(() => {
                        setShowResetButton(true);
                    }, 15000); // 15 seconds limit
                } else {
                    console.log("☁️ Cloud-First: Handshake already done. Syncing in background.");
                }

                try {
                    // 0. RUN MIGRATIONS: ensure DB schema is healthy
                    await seedDatabase();

                    // 1. FORCE PULL: Download the truth from Supabase
                    // Overwrites local state with the cloud truth. Zero local injection.
                    // We use preventReload: true to handle the UI state manually
                    await syncService.restoreFromCloud((msg) => console.log(msg), true);

                    // 3. MARK AS READY: Enable Auto-Sync hooks
                    syncService.isReady = true;

                    // 4. RETRY REALTIME: Re-subscribe now that we have restaurantId
                    await syncService.retrySubscriptions();

                    // 5. PERSIST SESSION STATE: Handshake complete
                    sessionStorage.setItem('kontigo_handshake_done', 'true');

                    setStatus('saved');
                    setLastSyncedAt(new Date());

                    console.log("☁️ Cloud-First: Handshake Complete. Device is Ready.");
                } catch (e) {
                    console.error("Cloud-First Handshake Failed:", e);
                    setStatus('error');
                    toast.error("Error de conexión. Iniciando en modo offline.", {
                        description: "Los cambios locales se guardarán y sincronizarán al recuperar internet."
                    });
                    // Allow local work as fallback
                    syncService.isReady = true;
                } finally {
                    setIsInitializing(false);
                    if (handshakeTimeout) clearTimeout(handshakeTimeout);
                }
            } else {
                console.log("📡 Offline: Enabling local mode.");
                setStatus('offline');
                syncService.isReady = true;
                setIsInitializing(false);
            }
        };

        // Start handshake IMMEDIATELY (No 1s delay to prevent Race Conditions)
        handshake();
    }, [performSync]);

    // Function called by components when they mutate data
    const triggerChange = useCallback(() => {
        setPendingChanges(true);
        setStatus('saving');

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer for 1 second (High Performance for Restaurants)
        debounceTimerRef.current = setTimeout(() => {
            performSync();
        }, 1000);
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
            {/* Blocking Handshake Overlay */}
            {isInitializing && (
                <div className="fixed inset-0 z-[9999] bg-[#1a1a1a] flex flex-col items-center justify-center text-white">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full"></div>
                        <div className="relative bg-[#252525] p-6 rounded-3xl border border-white/10 shadow-2xl">
                            <div className="relative flex items-center justify-center">
                                <Cloud className="w-16 h-16 text-toast-orange animate-pulse" />
                                <Loader2 className="absolute w-24 h-24 text-toast-orange/30 animate-spin" />
                            </div>
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold tracking-tight mb-2">Sincronizando con Kontigo Cloud</h2>
                    <p className="text-gray-400 text-sm max-w-xs text-center leading-relaxed">
                        Estamos validando tu información para asegurar que este dispositivo tenga la versión más actualizada de tu restaurante.
                    </p>

                    <div className="mt-8 flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest border-t border-white/5 pt-8">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        Protocolo de Integridad Perfecto Activo
                    </div>

                    {showResetButton && (
                        <div className="mt-6 flex flex-col items-center animate-in fade-in duration-500">
                            <p className="text-red-400 text-xs mb-3 text-center max-w-xs font-medium">
                                Parece que una sesión de una versión anterior o error de red está bloqueando la conexión.
                            </p>
                            <button
                                onClick={() => {
                                    localStorage.clear();
                                    sessionStorage.clear();
                                    window.location.reload();
                                }}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-red-500/20"
                            >
                                Forzar Reinicio del Sistema
                            </button>
                        </div>
                    )}
                </div>
            )}
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
