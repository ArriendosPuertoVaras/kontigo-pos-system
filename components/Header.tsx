'use client';
// HMR Force Refresh
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wifi, LayoutGrid, Users, ChefHat, Briefcase, Calculator, CloudUpload, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface HeaderProps {
    title: string;
    children?: React.ReactNode; // For page-specific controls (Search, Filters, Stats)
}

export default function Header({ title, children }: HeaderProps) {
    const pathname = usePathname();
    const [staffName, setStaffName] = useState('Staff');
    const [staffRole, setStaffRole] = useState('Personal');
    const [currentTime, setCurrentTime] = useState('');

    useEffect(() => {
        setStaffName(localStorage.getItem('kontigo_staff_name') || 'Staff');
        setStaffRole(localStorage.getItem('kontigo_staff_role') || 'Personal');

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

    const handleSync = async () => {
        if (syncStatus === 'syncing') return;
        setSyncStatus('syncing');
        setSyncMsg('Iniciando...');

        try {
            // Dynamic import to avoid SSR issues if any (though syncService is client side)
            const { syncService } = await import('@/lib/sync_service');
            await syncService.pushAll((msg) => setSyncMsg(msg));
            setSyncStatus('success');
            setTimeout(() => setSyncStatus('idle'), 3000);
        } catch (error) {
            console.error(error);
            setSyncStatus('error');
            setSyncMsg('Error al sincronizar');
            setTimeout(() => setSyncStatus('idle'), 5000);
        }
    };

    return (
        <header className="h-auto min-h-[5rem] border-b border-white/5 flex flex-wrap items-center justify-between px-4 md:px-8 py-3 bg-toast-charcoal shadow-sm z-10 shrink-0 gap-4">
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

                    <div className="flex items-center gap-4">
                        <h1 className="text-lg md:text-xl font-bold tracking-tight text-white/90 truncate">{title}</h1>
                        <span className="flex items-center gap-1.5 bg-toast-green/10 text-toast-green px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-toast-green/20 hidden sm:flex">
                            <Wifi className="w-3 h-3" /> ONLINE
                        </span>
                    </div>
                </div>

                {/* Mobile Time/User (Compact) */}
                <div className="md:hidden flex items-center gap-2">
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
                {/* SYNC BUTTON */}
                <button
                    onClick={handleSync}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold
                    ${syncStatus === 'idle' ? 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10' : ''}
                    ${syncStatus === 'syncing' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : ''}
                    ${syncStatus === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : ''}
                    ${syncStatus === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : ''}
                    `}
                    title="Sincronizar con la Nube"
                >
                    {syncStatus === 'idle' && <CloudUpload className="w-4 h-4" />}
                    {syncStatus === 'syncing' && <RefreshCw className="w-4 h-4 animate-spin" />}
                    {syncStatus === 'success' && <Check className="w-4 h-4" />}
                    {syncStatus === 'error' && <AlertCircle className="w-4 h-4" />}

                    {syncStatus !== 'idle' ? <span>{syncMsg}</span> : <span>Backup</span>}
                </button>

                <div className="text-2xl font-light tabular-nums text-white/80 whitespace-nowrap">
                    {currentTime}
                </div>
                <div className="flex items-center gap-3 pl-3 border-l border-white/10">
                    <div className="text-right leading-tight">
                        <p className="text-sm font-semibold text-white">
                            {staffName}
                        </p>
                        <p className="text-[10px] text-toast-blue uppercase font-bold tracking-wider">
                            {staffRole}
                        </p>
                    </div>
                    <div className="w-9 h-9 bg-toast-charcoal-light ring-2 ring-white/10 rounded-full flex items-center justify-center font-bold text-xs">
                        {staffName.charAt(0)}
                    </div>
                </div>
            </div>
        </header>
    );
}
