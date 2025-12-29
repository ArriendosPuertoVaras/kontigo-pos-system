'use client';
// HMR Force Refresh
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wifi, LayoutGrid, Users, ChefHat, Briefcase, Calculator, CloudUpload, RefreshCw, Check, AlertCircle, ArrowLeft, WifiOff as WiFiOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import SyncDecisionModal from './SyncDecisionModal';
import QuickProfileModal from './QuickProfileModal';
import { useAutoSync } from './providers/AutoSyncProvider';

interface HeaderProps {
    title: string;
    children?: React.ReactNode;
    backHref?: string;
}

export default function Header({ title, children, backHref }: HeaderProps) {
    const pathname = usePathname();
    // Live Data Binding for Header Profile
    const { staffName, staffRole } = useLiveQuery(async () => {
        const id = localStorage.getItem('kontigo_staff_id');
        if (!id) return { staffName: 'Staff', staffRole: 'Personal' };

        const staff = await db.staff.get(Number(id));
        if (staff) {
            return { staffName: staff.name, staffRole: staff.role };
        }
        return { staffName: 'Staff', staffRole: 'Personal' };
    }, []) || { staffName: 'Cargando...', staffRole: '...' };

    useEffect(() => {
        // Initial time
        setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));

        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
        }, 60000); // 1 min update is enough for HH:MM

        return () => clearInterval(timer);
    }, []);

    const navItems = [
        { href: '/manager/accounting', label: 'Finanzas', icon: Calculator },
        { href: '/staff', label: 'RRHH', icon: Users },
        { href: '/manager/recipe-analyzer', label: 'Costos', icon: ChefHat },
    ];

    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [syncMsg, setSyncMsg] = useState('');

    // Import syncService dynamically or at top level if possible, but here we'll assume import
    // We need to import it at top level actually. See file edits below.

    const handleSync = () => {
        // Instead of blind sync, OPEN DECISION MODAL
        setShowSyncModal(true);
    };

    return (
        <header className="relative h-auto min-h-[5rem] border-b border-white/5 flex flex-wrap items-center justify-between px-4 md:px-8 py-3 bg-toast-charcoal shadow-sm z-10 shrink-0 gap-4">
            {/* LEFT: Page Title & Global Nav */}
            <div className="flex items-center justify-between w-full md:w-auto gap-4 shrink-0">
                <div className="flex items-center gap-4">
                    {/* HAMBURGER (Mobile Only) */}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                        className="md:hidden p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                    </button>

                    <div className="flex items-center gap-2">
                        {backHref && (
                            <Link href={backHref} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors mr-1">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                        )}
                        <h1 className="text-lg md:text-xl font-bold tracking-tight text-white/90 truncate flex items-center gap-2">
                            {title}
                            <span className="px-2 py-0.5 rounded bg-toast-orange text-[10px] text-white font-bold tracking-wider">v2.0 SECURE</span>
                        </h1>
                        {status === 'offline' ? (
                            <span className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-red-500/20 hidden sm:flex animate-pulse">
                                <WiFiOff className="w-3 h-3" /> OFFLINE
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 bg-toast-green/10 text-toast-green px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-toast-green/20 hidden sm:flex cursor-pointer hover:bg-toast-green/20 transition-colors" title="Conectado a la Nube">
                                <Wifi className="w-3 h-3" /> ONLINE
                            </span>
                        )}
                    </div>
                </div>

                {/* Mobile Time/User (Compact) */}
                <div className="md:hidden flex items-center gap-2">
                    {/* Mobile Sync Button */}
                    <button
                        onClick={handleSync}
                        disabled={syncStatus === 'syncing'}
                        className={`p-2 rounded-full transition-all border
                        ${syncStatus === 'idle' ? 'bg-white/5 border-white/10 text-gray-400' : ''}
                        ${syncStatus === 'syncing' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse' : ''}
                        ${syncStatus === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : ''}
                        ${syncStatus === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : ''}
                        `}
                    >
                        {syncStatus === 'idle' && <CloudUpload className="w-4 h-4" />}
                        {syncStatus === 'syncing' && <RefreshCw className="w-4 h-4 animate-spin" />}
                        {syncStatus === 'success' && <Check className="w-4 h-4" />}
                        {syncStatus === 'error' && <AlertCircle className="w-4 h-4" />}
                    </button>

                    {/* Mobile Restore Button */}
                    <button
                        onClick={async () => {
                            if (!confirm("⚠️ RESTAURAR DATOS\n\n¿Reemplazar datos locales con la Nube?")) return;
                            setSyncStatus('syncing');
                            try {
                                const { syncService } = await import('@/lib/sync_service');
                                await syncService.restoreFromCloud();
                                alert("✅ Restaurado");
                            } catch (e: any) {
                                alert("Error: " + e.message);
                                setSyncStatus('error');
                                setTimeout(() => setSyncStatus('idle'), 3000);
                            }
                        }}
                        className="p-2 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <div className="w-8 h-8 bg-toast-charcoal-light ring-1 ring-white/10 rounded-full flex items-center justify-center font-bold text-xs text-white">
                        {staffName.charAt(0)}
                    </div>
                </div>
            </div>

            {/* CENTER: Page Specific Controls */}
            {children && (
                <div className="w-full md:w-auto md:flex-1 order-3 md:order-2 flex justify-center">
                    <div className="w-full md:w-auto flex justify-center">
                        {children}
                    </div>
                </div>
            )}

            {/* RIGHT: User & Time (Desktop) */}
            <div className="hidden md:flex items-center gap-6 order-2 md:order-3">
                {/* AUTO-SYNC STATUS INDICATOR - THE QUIET COURIER */}
                <button
                    onClick={() => setShowSyncModal(true)} // Still allow opening modal for manual "Pull" or Force Push
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold
                    ${status === 'saved' ? 'bg-green-500/5 border-green-500/20 text-green-400 hover:bg-green-500/10' : ''}
                    ${status === 'saving' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : ''}
                    ${status === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : ''}
                    ${status === 'offline' ? 'bg-white/5 border-white/10 text-gray-500' : ''}
                    `}
                    title="Estado de Sincronización"
                >
                    {status === 'saved' && (
                        <>
                            <Check className="w-3 h-3" />
                            <span>Guardado</span>
                        </>
                    )}
                    {status === 'saving' && (
                        <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Guardando...</span>
                        </>
                    )}
                    {status === 'error' && (
                        <>
                            <AlertCircle className="w-3 h-3" />
                            <span>Error al Guardar</span>
                        </>
                    )}
                    {status === 'offline' && (
                        <>
                            <WiFiOff className="w-3 h-3" />
                            <span>Offline</span>
                        </>
                    )}
                </button>

                {/* RESTORE BUTTON (Desktop) */}
                <button
                    onClick={async () => {
                        if (!confirm("⚠️ PRECAUCIÓN: RESTAURAR DATOS\n\nEsto borrará todos los datos locales y los reemplazará con la copia de la Nube.\n\n¿Estás seguro de continuar?")) return;

                        setSyncStatus('syncing');
                        setSyncMsg('Restaurando...');
                        try {
                            const { syncService } = await import('@/lib/sync_service');
                            await syncService.restoreFromCloud((msg) => setSyncMsg(msg));
                            setSyncStatus('success');
                            alert("✅ RESTAURACIÓN COMPLETADA");
                            window.location.reload();
                        } catch (e: any) {
                            console.error(e);
                            setSyncStatus('error');
                            setSyncMsg('Error');
                            alert("❌ Error al restaurar: " + (e.message || e));
                            setTimeout(() => setSyncStatus('idle'), 3000);
                        }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 hover:text-white text-gray-400 transition-all text-xs font-bold"
                    title="Restaurar desde la Nube"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span>Restaurar</span>
                </button>

                <div className="text-2xl font-light tabular-nums text-white/80 whitespace-nowrap">
                    {currentTime}
                </div>
                <div
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-3 pl-3 border-l border-white/10 cursor-pointer hover:bg-white/5 py-1 px-2 rounded-lg transition-colors group"
                >
                    <div className="text-right leading-tight">
                        <p className="text-sm font-semibold text-white group-hover:text-toast-orange transition-colors">
                            {staffName}
                        </p>
                        <p className="text-[10px] text-toast-blue uppercase font-bold tracking-wider">
                            {staffRole}
                        </p>
                    </div>
                    <div className="w-9 h-9 bg-toast-charcoal-light ring-2 ring-white/10 group-hover:ring-toast-orange/50 rounded-full flex items-center justify-center font-bold text-xs transition-all">
                        {staffName.charAt(0)}
                    </div>
                </div>
            </div>

            {/* QUICK PROFILE MODAL */}
            {showProfileModal && (
                <QuickProfileModal onClose={() => setShowProfileModal(false)} />
            )}

            {/* SYNC DECISION MODAL - THE SAFETY GUARD */}
            <SyncDecisionModal
                isOpen={showSyncModal}
                onClose={() => setShowSyncModal(false)}
                isSyncing={syncStatus === 'syncing'}
                onPush={async () => {
                    setSyncStatus('syncing');
                    setSyncMsg('Enviando...');
                    try {
                        const { syncService } = await import('@/lib/sync_service');
                        await syncService.pushAll((msg) => setSyncMsg(msg));
                        setSyncStatus('success');
                        setTimeout(() => setSyncStatus('idle'), 3000);
                        alert("✅ RESPALDO EXITOSO\n\nTus datos locales han sido enviados a la nube.");
                        setShowSyncModal(false);
                    } catch (error: any) {
                        console.error(error);
                        setSyncStatus('error');
                        setSyncMsg('Error');
                        alert(`❌ Error al enviar: ${error.message || error}`);
                        setTimeout(() => setSyncStatus('idle'), 5000);
                    }
                }}
                onPull={async () => {
                    if (!confirm("⚠️ ¿Estás seguro de reemplazar tus datos locales con la copia de la Nube?")) return;

                    setSyncStatus('syncing');
                    setSyncMsg('Descargando...');
                    try {
                        const { syncService } = await import('@/lib/sync_service');
                        await syncService.restoreFromCloud((msg) => setSyncMsg(msg));
                        setSyncStatus('success');
                        alert("✅ DATOS ACTUALIZADOS\n\nEl sistema se recargará ahora.");
                        window.location.reload();
                    } catch (e: any) {
                        console.error(e);
                        setSyncStatus('error');
                        setSyncMsg('Error');
                        alert(`❌ Error al descargar: ${e.message || e}`);
                        setTimeout(() => setSyncStatus('idle'), 5000);
                    }
                }}
            />
        </header>
    );
}
