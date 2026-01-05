'use client';
// HMR Force Refresh
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wifi, LayoutGrid, Users, ChefHat, Briefcase, Calculator, CloudUpload, RefreshCw, Check, AlertCircle, ArrowLeft, WifiOff as WiFiOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { toast } from 'sonner';
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
        const id = sessionStorage.getItem('kontigo_staff_id');
        const localName = sessionStorage.getItem('kontigo_staff_name');
        const localRole = sessionStorage.getItem('kontigo_staff_role');

        if (!id) return { staffName: 'Staff', staffRole: 'Personal' };

        const staff = await db.staff.get(Number(id));
        if (staff) {
            return { staffName: staff.name, staffRole: staff.role };
        }

        // Fallback to localStorage if DB lookup fails (e.g. after fresh login before sync)
        if (localName) {
            return { staffName: localName, staffRole: localRole || 'Miembro de Equipo' };
        }

        return { staffName: 'Staff', staffRole: 'Personal' };
    }, []) || { staffName: 'Cargando...', staffRole: '...' };

    const [currentTime, setCurrentTime] = useState('');
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);

    // Auto-Sync Hook
    const { status, forceSync } = useAutoSync();

    useEffect(() => {
        // Initial time
        setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));

        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
        }, 60000); // 1 min update is enough for HH:MM

        // --- AGGRESSIVE SELF-FIX: "Ghost Buster 2.0" ---
        const fixGhostUser = async () => {
            const id = sessionStorage.getItem('kontigo_staff_id');
            const localName = sessionStorage.getItem('kontigo_staff_name');

            // Case 1: We are currently logged in as the Ghost (or someone with that name)
            if (localName === 'Admin (Dueño)') {
                // Find ANY real user to switch to (Active, and NOT named Admin (Dueño))
                const realUser = await db.staff
                    .filter(s => s.name !== 'Admin (Dueño)' && s.status === 'active')
                    .first();

                if (realUser) {
                    // SWITCH IDENTITY
                    console.log("👻 GHOST BUSTER: Switching to real user:", realUser.name);
                    sessionStorage.setItem('kontigo_staff_id', realUser.id!.toString());
                    sessionStorage.setItem('kontigo_staff_name', realUser.name);
                    sessionStorage.setItem('kontigo_staff_role', realUser.role);
                    window.location.reload();
                    return;
                }
            }

            // Case 2: We are a real user, but the Ghost still haunts the database
            // (Only run this if we are safe)
            if (id && localName !== 'Admin (Dueño)') {
                const ghosts = await db.staff.where('name').equals('Admin (Dueño)').toArray();
                if (ghosts.length > 0) {
                    console.log(`👻 GHOST BUSTER: Deleting ${ghosts.length} ghost records`);
                    await db.staff.bulkDelete(ghosts.map(g => g.id!));
                    toast.success("Sistema auto-reparado: Usuario fantasma eliminado");
                }
            }
        };
        fixGhostUser();

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
            <div className="flex items-center justify-between w-full md:w-auto gap-2 md:gap-4 shrink-0">
                <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                    {/* HAMBURGER (Mobile Only) */}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                        className="md:hidden p-2 text-white/70 active:text-white active:bg-white/10 rounded-lg shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                    </button>

                    <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                        {backHref && (
                            <Link href={backHref} className="text-gray-400 md:hover:text-white p-1 md:hover:bg-white/10 rounded-full transition-colors shrink-0">
                                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                            </Link>
                        )}
                        <h1 className="text-sm md:text-xl font-bold tracking-tight text-white/90 truncate flex items-center gap-2">
                            {title}
                            <span className="hidden xs:inline-block px-1.5 py-0.5 rounded bg-toast-orange text-[8px] md:text-[10px] text-white font-bold tracking-wider">v2.0</span>
                        </h1>
                        {status === 'offline' ? (
                            <span className="flex items-center gap-1.5 bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full text-[8px] md:text-[10px] font-bold border border-red-500/20 hidden sm:flex animate-pulse">
                                <WiFiOff className="w-3 h-3" /> OFFLINE
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 bg-toast-green/10 text-toast-green px-2 py-0.5 rounded-full text-[8px] md:text-[10px] font-bold border border-toast-green/20 hidden sm:flex cursor-pointer hover:bg-toast-green/20 transition-colors" title="Conectado a la Nube">
                                <Wifi className="w-3 h-3" /> ONLINE
                            </span>
                        )}
                    </div>
                </div>

                {/* Mobile Time/User/Sync (Compact) */}
                <div className="md:hidden flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={handleSync}
                        disabled={syncStatus === 'syncing'}
                        className={`p-1.5 rounded-full transition-all border
                        ${syncStatus === 'idle' ? 'bg-white/5 border-white/10 text-gray-400' : ''}
                        ${syncStatus === 'syncing' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse' : ''}
                        ${syncStatus === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : ''}
                        ${syncStatus === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : ''}
                        `}
                    >
                        {syncStatus === 'idle' && <CloudUpload className="w-3.5 h-3.5" />}
                        {syncStatus === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {syncStatus === 'success' && <Check className="w-3.5 h-3.5" />}
                        {syncStatus === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                    </button>

                    <div className="w-7 h-7 bg-toast-charcoal-light ring-1 ring-white/10 rounded-full flex items-center justify-center font-bold text-[10px] text-white">
                        {staffName.charAt(0)}
                    </div>
                </div>
            </div>

            {children && (
                <div className="w-full md:w-auto md:flex-1 order-3 md:order-2 flex justify-center mt-2 md:mt-0 relative">
                    {children}
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
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 md:hover:bg-white/10 md:hover:text-white text-gray-400 transition-all text-xs font-bold"
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
                    className="flex items-center gap-3 pl-3 border-l border-white/10 cursor-pointer md:hover:bg-white/5 py-1 px-2 rounded-lg transition-colors group"
                >
                    <div className="text-right leading-tight">
                        <p className="text-sm font-semibold text-white group-md:hover:text-toast-orange transition-colors">
                            {staffName}
                        </p>
                        <p className="text-[10px] text-toast-blue uppercase font-bold tracking-wider">
                            {staffRole}
                        </p>
                    </div>
                    <div className="w-9 h-9 bg-toast-charcoal-light ring-2 ring-white/10 group-md:hover:ring-toast-orange/50 rounded-full flex items-center justify-center font-bold text-xs transition-all">
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
