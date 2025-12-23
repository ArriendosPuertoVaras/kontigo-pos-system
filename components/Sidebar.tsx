'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    UtensilsCrossed,
    LayoutGrid,
    ClipboardList,
    Package,
    Truck,
    ShoppingCart,
    Trash2,
    Users,
    Bell,
    Settings,
    LogOut,
    Briefcase,
    Leaf,
    ChefHat,
    Upload
} from 'lucide-react';

import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect } from 'react';

export default function Sidebar() {
    const pathname = usePathname() || '/';
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);

    // --- REAL ALERTS DATA ---
    const lowStockItems = useLiveQuery(() => db.ingredients.filter(i => i.stock <= (i.minStock || 0)).toArray());
    const activeOrders = useLiveQuery(() => db.orders.where('status').equals('open').toArray());
    // Only show shifts that have been open for more than 12 hours as an "Alert" or maybe just all open shifts for now?
    // Let's just show all open shifts for visibility
    const openShifts = useLiveQuery(() => db.shifts.filter(s => !s.endTime).toArray());

    const totalAlerts = (lowStockItems?.length || 0) + (activeOrders?.length || 0) + (openShifts?.length || 0);

    useEffect(() => {
        const toggle = () => setIsOpen(prev => !prev);
        window.addEventListener('toggle-sidebar', toggle);

        // Initialize Accounting System
        import('@/lib/accounting').then(mod => {
            mod.KontigoFinance.initialize().catch(err => console.error("Finance Init Error:", err));
        });

        return () => window.removeEventListener('toggle-sidebar', toggle);
    }, []);

    // Close on navigation
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Close notifications when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const sidebar = document.getElementById('sidebar-container');
            if (sidebar && !sidebar.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        };

        if (showNotifications) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showNotifications]);

    const handleLogout = () => {
        localStorage.removeItem('kontigo_staff_id');
        localStorage.removeItem('kontigo_staff_name');
        localStorage.removeItem('kontigo_staff_role');
        router.push('/login');
    };

    return (
        <>
            {/* OVERLAY for Mobile */}
            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm animate-in fade-in"
                />
            )}

            <aside id="sidebar-container" className={`
                w-[80px] bg-toast-charcoal-dark flex flex-col items-center py-4 border-r border-white/5 shadow-xl flex-shrink-0 h-full
                fixed md:relative top-0 left-0 bottom-0 z-30 transition-transform duration-300
                ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* LOGO */}
                <div className="mb-6 scale-90">
                    <div className="w-10 h-10 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <UtensilsCrossed className="text-white w-6 h-6" />
                    </div>
                </div>

                <nav className="flex flex-col gap-1 w-full px-2 flex-1 overflow-y-auto no-scrollbar">
                    <NavItem href="/tables" icon={<LayoutGrid />} label="Mesas" isActive={pathname === '/tables'} />
                    <NavItem href="/?mode=pos" icon={<UtensilsCrossed />} label="POS" isActive={pathname === '/'} />
                    <NavItem href="/orders" icon={<ClipboardList />} label="KDS" isActive={pathname === '/orders'} />
                    <NavItem href="/manager/menu" icon={<ChefHat />} label="Menú" isActive={pathname === '/manager/menu'} />
                    <NavItem href="/staff/schedule" icon={<ClipboardList />} label="Turnos" isActive={pathname === '/staff/schedule'} />
                    <NavItem href="/inventory" icon={<Package />} label="Inventario" isActive={pathname === '/inventory'} />
                    <NavItem href="/manager" icon={<Briefcase />} label="Admin" isActive={pathname === '/manager'} />
                    <NavItem href="/manager/production" icon={<ClipboardList />} label="Prod." isActive={pathname === '/manager/production'} />
                    <NavItem href="/manager/admin/data-import" icon={<Upload />} label="Import" isActive={pathname === '/manager/admin/data-import'} />

                    <div className="h-px bg-white/10 w-full my-1"></div>

                    <NavItem href="/suppliers" icon={<Truck />} label="Prov." isActive={pathname === '/suppliers'} />
                    <NavItem href="/purchases" icon={<ShoppingCart />} label="Comp." isActive={pathname === '/purchases'} />
                    <NavItem href="/waste" icon={<Trash2 />} label="Mermas" isActive={pathname === '/waste'} danger />

                    <div className="h-px bg-white/10 w-full my-1"></div>

                    <NavItem href="/customers" icon={<Users />} label="Client." isActive={pathname === '/customers'} />

                    <div className="h-px bg-white/10 w-full my-1"></div>

                    {/* CLOCK IN/OUT BUTTON */}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-clock-out'))}
                        className="relative flex flex-col items-center justify-center w-full py-2 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-500/10 transition-all group cursor-pointer"
                    >
                        <div className="w-5 h-5 mb-0.5"><Users className="w-5 h-5" /></div>
                        <span className="w-full text-[9px] font-bold uppercase text-center">Fichar</span>
                    </button>

                    <div className="relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowNotifications(!showNotifications);
                            }}
                            className={`relative flex flex-col items-center justify-center w-full py-2 rounded-lg transition-all group cursor-pointer ${showNotifications ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <Bell className="w-5 h-5 mb-0.5" />
                            <span className="w-full text-[9px] font-bold uppercase text-center">Alertas</span>
                            {totalAlerts > 0 && (
                                <span className="absolute top-1 right-1 bg-toast-red text-white text-[8px] font-bold w-3 h-3 rounded-full flex items-center justify-center border border-toast-charcoal-dark">
                                    {totalAlerts}
                                </span>
                            )}
                        </button>


                    </div>


                </nav>

                {/* NOTIFICATIONS PANEL (Moved outside NAV to avoid clipping) */}
                {showNotifications && (
                    <div className="absolute left-[85px] bottom-20 w-80 bg-[#252525] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-left-2 duration-200">
                        <div className="p-3 border-b border-white/5 bg-black/20 flex justify-between items-center">
                            <h3 className="font-bold text-sm text-gray-200">Notificaciones</h3>
                            <span className="text-[10px] text-toast-orange font-bold px-2 py-0.5 bg-toast-orange/10 rounded-full">{
                                (lowStockItems?.length || 0) + (activeOrders?.length || 0) + (openShifts?.length || 0)
                            } Nuevas</span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {/* 1. Low Stock Alerts */}
                            {lowStockItems?.map(ing => (
                                <div key={`stock-${ing.id}`} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-bold text-red-400">Stock Crítico</span>
                                        <span className="text-[10px] text-gray-500">Ahora</span>
                                    </div>
                                    <p className="text-xs text-gray-300 group-hover:text-white">
                                        El insumo "{ing.name}" tiene {ing.stock} {ing.unit} (Mín: {ing.minStock}).
                                    </p>
                                </div>
                            ))}

                            {/* 2. Active Orders / "requests" */}
                            {activeOrders?.map(order => (
                                <div key={`order-${order.id}`} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-bold text-blue-400">Pedido Activo</span>
                                        <span className="text-[10px] text-gray-500">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-xs text-gray-300 group-hover:text-white">
                                        Mesa {order.tableId} tiene un pedido en curso ({order.status}).
                                    </p>
                                </div>
                            ))}

                            {/* 3. System Alerts (Open Shifts > 12h or just open) */}
                            {openShifts?.map(shift => (
                                <div key={`shift-${shift.id}`} className="p-3 hover:bg-white/5 transition-colors cursor-pointer group">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-bold text-yellow-400">Turno Abierto</span>
                                        <span className="text-[10px] text-gray-500">{new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-xs text-gray-300 group-hover:text-white">
                                        Usuario {shift.staffId} turno sin cerrar.
                                    </p>
                                </div>
                            ))}

                            {/* Empty State */}
                            {(!lowStockItems?.length && !activeOrders?.length && !openShifts?.length) && (
                                <div className="p-6 text-center text-gray-500 text-xs">
                                    No hay notificaciones nuevas.
                                </div>
                            )}
                        </div>
                        <div className="p-2 bg-black/20 text-center border-t border-white/5">
                            <button className="text-[10px] text-gray-400 hover:text-white uppercase tracking-wider font-bold">Ver Todo</button>
                        </div>
                    </div>
                )}

                <div className="mt-auto flex flex-col gap-2 w-full px-2 mb-2">
                    <button
                        onClick={() => router.push('/settings')}
                        className={`relative flex flex-col items-center justify-center w-full py-2 rounded-lg transition-all duration-200 group
                    ${pathname === '/settings' || pathname.startsWith('/settings/') ? 'bg-white/10 text-toast-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Settings className="w-5 h-5 mb-0.5" />
                        <span className="w-full text-[9px] font-bold uppercase text-center">Ajustes</span>
                    </button>

                    <button
                        onClick={handleLogout}
                        className="flex flex-col items-center justify-center w-full py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all group">
                        <LogOut className="w-5 h-5 mb-0.5" />
                        <span className="w-full text-[9px] font-bold uppercase text-center">Salir</span>
                    </button>
                </div>
            </aside >
        </>
    );
}

import { usePermission } from '@/hooks/usePermission';

function NavItem({ href, icon, label, isActive, danger = false, permission }: { href: string, icon: any, label: string, isActive?: boolean, danger?: boolean, permission?: string }) {
    const hasAccess = permission ? usePermission(permission as any) : true;
    if (hasAccess === false) return null;

    return (
        <Link href={href} className={`relative flex flex-col items-center justify-center w-full py-2.5 rounded-xl transition-all duration-200 group
              ${isActive
                ? 'bg-gradient-to-b from-white/10 to-transparent text-toast-orange shadow-inner border border-white/5'
                : danger
                    ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}>
            <div className={`w-5 h-5 mb-0.5 transition-transform group-active:scale-90 ${isActive ? 'text-toast-orange drop-shadow-lg' : ''} ${danger ? 'group-hover:text-red-400' : ''}`}>{icon}</div>
            <span className={`w-full text-[9px] font-bold uppercase text-center ${isActive ? 'text-white' : 'text-gray-500'}`}>{label}</span>

            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-toast-orange rounded-r-md"></div>}
        </Link>
    )
}
