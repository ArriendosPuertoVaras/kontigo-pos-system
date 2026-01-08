'use client';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, CheckCircle2, Clock, ChefHat, Check, Users, Martini, Beer, Book } from 'lucide-react';
import Header from '@/components/Header';

// Duplicated NavItem for independence
function NavItem({ icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`relative flex flex-col items-center justify-center w-full py-3 rounded-xl transition-all duration-200 group
            ${active ? 'bg-gradient-to-b from-white/10 to-transparent text-toast-orange shadow-inner border border-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            <div className={`w-5 h-5 mb-1 transition-transform group-active:scale-90 ${active ? 'text-toast-orange drop-shadow-lg' : ''}`}>{icon}</div>
            <span className={`text-[9px] font-bold tracking-wider uppercase ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
            {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 bg-toast-orange rounded-r-md"></div>}
        </button>
    )
}

function OrderCard({ order, onStatusChange, viewMode }: { order: any, onStatusChange: (id: number, status: any) => void, viewMode: string }) {
    // 1. Filter Items based on View Mode
    const displayedItems = order.itemsWithCategory?.filter((item: any) => {
        const dest = item.category?.destination || 'kitchen'; // Default to kitchen
        return dest.toLowerCase() === viewMode.toLowerCase();
    }) || [];

    if (displayedItems.length === 0) return null; // Don't show empty tickets for this station

    // 2. Group/Sort logic
    // Order: Starter -> Main -> Dessert -> Beverage
    const courseOrder = { 'starter': 1, 'main': 2, 'dessert': 3, 'beverage': 4 };

    const sortedItems = [...displayedItems].sort((a: any, b: any) => {
        const cA = a.category?.course || 'main';
        const cB = b.category?.course || 'main';
        return (courseOrder[cA as keyof typeof courseOrder] || 99) - (courseOrder[cB as keyof typeof courseOrder] || 99);
    });

    // Grouping for Display
    let currentCourse = '';

    // --- Ticker for Updates ---
    const [ticker, setTicker] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTicker(t => t + 1), 1000); // Update every second for clock
        return () => clearInterval(interval);
    }, []);

    // Time elapsed logic
    const elapsed = new Date().getTime() - new Date(order.createdAt).getTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Get Status from shared logic
    const { getWaitStatus, getStatusColorClasses } = require('@/lib/kds');
    const status = getWaitStatus(minutes);

    // Default colors (Green/Normal)
    let statusColor = "border-green-500";
    let statusBg = "bg-green-500/10";
    let statusText = "text-green-500";

    if (status === 'warning') {
        statusColor = "border-yellow-500";
        statusBg = "bg-yellow-500/10";
        statusText = "text-yellow-500";
    } else if (status === 'critical') {
        statusColor = "border-red-500";
        statusBg = "bg-red-500/10";
        statusText = "text-red-500";
    }

    return (
        <div className={`bg-[#2a2a2a] rounded-xl border-l-4 ${statusColor} shadow-xl flex flex-col h-auto min-h-[160px] animate-in fade-in zoom-in duration-300 relative group`}>
            {/* Header */}
            <div className={`p-3 flex justify-between items-start border-b border-white/5 ${statusBg} rounded-tr-xl`}>
                <div>
                    <h3 className="font-bold text-base text-white leading-tight">{order.tableName}</h3>
                    {order.covers && <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1"><Users className="w-3 h-3" /> {order.covers} pax</span>}
                </div>
                <div className={`font-mono text-sm font-bold ${statusText} flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md`}>
                    <Clock className="w-3 h-3" />
                    {timeString}
                </div>
            </div>

            {/* Items List (Adaptive Height using flex-1 and no max-h restriction) */}
            <div className="p-3 space-y-3 flex-1">
                {sortedItems.map((item: any, i: number) => {
                    const course = item.category?.course || 'main';
                    const showHeader = course !== currentCourse && viewMode === 'kitchen'; // Only group titles in Kitchen
                    if (showHeader) currentCourse = course;

                    const courseLabel: any = { 'starter': 'ENTRADAS', 'main': 'FONDOS', 'dessert': 'POSTRES', 'beverage': 'BEBIDAS' };

                    return (
                        <div key={i}>
                            {showHeader && (
                                <div className="text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-1 border-b border-white/5 pb-0.5 mt-1">
                                    {courseLabel[course] || 'GENERAL'}
                                </div>
                            )}
                            <div className="flex gap-3 items-start relative group/item">
                                <div className={`font-bold px-2 py-0.5 rounded text-sm min-w-[24px] text-center shrink-0 border border-white/10 shadow-sm
                                    ${item.quantity > 1 ? 'bg-toast-orange text-white' : 'bg-[#3a3a3a] text-gray-300'}`}>
                                    {item.quantity}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-100 font-semibold leading-tight">{item.product.name}</p>
                                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                        <div className="flex flex-col mt-0.5">
                                            {item.selectedModifiers.map((m: any, idx: number) => (
                                                <span key={idx} className="text-[10px] text-gray-400 italic leading-tight">
                                                    + {m.name}
                                                </span>
                                            ))}
                                            {item.notes && (
                                                <span className="text-[10px] text-yellow-400 mt-1 font-bold leading-tight block">
                                                    NOTE: {item.notes}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="p-3 bg-black/20 border-t border-white/5 rounded-br-xl">
                <button
                    onClick={() => onStatusChange(order.id, 'ready')}
                    className="w-full bg-[#3a3a3a] hover:bg-green-600 hover:text-white text-gray-300 py-3 rounded-lg transition-all font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 group-hover:shadow-lg shadow-green-500/20">
                    <Check className="w-4 h-4" />
                    Listo
                </button>
            </div>
        </div>
    );
}

import { usePermission } from '@/hooks/usePermission';
import { Lock, Settings, X, Save } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function OrdersPage() {
    const hasAccess = usePermission('kds:view');
    const [viewMode, setViewMode] = useState<string>('kitchen');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [stationFilter, setStationFilter] = useState<string[]>([]);
    const [tempFilter, setTempFilter] = useState<string[]>([]);

    // Load Settings from LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem('kds_station_filter');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setStationFilter(parsed);
                // Set initial view mode if possible
                if (parsed.length > 0 && !parsed.includes(viewMode)) {
                    setViewMode(parsed[0]);
                }
            } catch (e) {
                console.error("Failed to parse station filter", e);
            }
        }
    }, []);

    const handleOpenSettings = () => {
        setTempFilter([...stationFilter]);
        setIsSettingsOpen(true);
    };

    const handleSaveSettings = () => {
        setStationFilter(tempFilter);
        localStorage.setItem('kds_station_filter', JSON.stringify(tempFilter));
        setIsSettingsOpen(false);
        // Ensure viewMode is valid
        if (tempFilter.length > 0 && !tempFilter.includes(viewMode)) {
            setViewMode(tempFilter[0]);
        }
    };

    const toggleFilter = (tab: string) => {
        if (tempFilter.includes(tab)) {
            setTempFilter(tempFilter.filter(t => t !== tab));
        } else {
            setTempFilter([...tempFilter, tab]);
        }
    };

    const data = useLiveQuery(async () => {
        const activeOrders = await db.orders.where('status').equals('open').toArray();
        const tables = await db.restaurantTables.toArray();
        const categories = await db.categories.toArray();

        // Extract Unique Destinations for Tabs
        // Extract Unique Destinations for Tabs
        const destinations = Array.from(new Set(categories.map(c => c.destination || 'kitchen')));

        // Normalize strings to Lowercase Set to avoid duplicates like "Bar" vs "bar"
        const distSet = new Set(destinations.filter(Boolean).map((d: string) => d.trim().toLowerCase()));
        if (distSet.size === 0) distSet.add('kitchen');
        const distinctTabs = Array.from(distSet);

        // Deep fetch for items -> product -> category
        const enrichedOrders = await Promise.all(activeOrders.map(async (o) => {
            const itemsWithCategory = await Promise.all(o.items.map(async (item) => {
                let category = item.product.categoryId
                    ? categories.find(c => c.id === item.product.categoryId)
                    : null;
                return { ...item, category };
            }));

            // Find ALL tables associated with this order (for merged/joined tables)
            const linkedTables = tables.filter(t => t.currentOrderId === o.id);

            let finalTableName = 'Mesa ?';
            if (linkedTables.length > 0) {
                // Sort by ID to stand stable
                finalTableName = linkedTables
                    .sort((a, b) => (a.id || 0) - (b.id || 0))
                    .map(t => t.name)
                    .join(' + ');
            } else {
                // Fallback to the ID stored in order if no table claims it (shouldn't happen active)
                finalTableName = tables.find(t => t.id === o.tableId)?.name || `Mesa ${o.tableId}`;
            }

            return {
                ...o,
                tableName: finalTableName,
                itemsWithCategory
            };
        }));

        return { orders: enrichedOrders, tabs: distinctTabs };
    });

    const orders = data?.orders;
    const allTabs = data?.tabs || ['kitchen'];

    // FILTER TABS BASED ON STATION SETTINGS
    const visibleTabs = stationFilter.length > 0
        ? allTabs.filter(t => stationFilter.includes(t))
        : allTabs; // If no filter, show all

    // If current ViewMode becomes invisible, switch to first visible
    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.includes(viewMode)) {
            setViewMode(visibleTabs[0]);
        }
    }, [visibleTabs, viewMode]);


    const handleStatusChange = async (id: number, status: any) => {
        if (status === 'ready') {
            const order = await db.orders.get(id);
            if (!order) return;

            // 1. Determine which areas are required for this order
            const categories = await db.categories.toArray();

            // Helper to get destination robustly (handles number/string ID mismatches)
            const getDestination = (categoryId: any) => {
                const cat = categories.find(c => c.id == categoryId || c.name.trim().toLowerCase() === String(categoryId).trim().toLowerCase());
                return (cat?.destination || 'kitchen').toLowerCase();
            };

            const requiredSections = new Set(order.items.map(item => getDestination(item.product.categoryId)));

            // 2. Update readySections for the current station
            const currentReady = (order.readySections || []).map(s => s.toLowerCase());
            const normalizedViewMode = viewMode.toLowerCase();

            if (!currentReady.includes(normalizedViewMode)) {
                const updatedReady = [...currentReady, normalizedViewMode];

                // 3. Check if all required sections are now ready
                const allSectionsReady = Array.from(requiredSections).every(s => updatedReady.includes(s));

                await db.orders.update(id, {
                    readySections: updatedReady,
                    status: allSectionsReady ? 'ready' : 'open'
                });
            }
        } else {
            db.orders.update(id, { status });
        }

        // AUTO SYNC
        const { syncService } = await import('@/lib/sync_service');
        await syncService.autoSync(db.orders, 'orders');
    };

    if (hasAccess === false) {
        return (
            <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center bg-toast-charcoal text-white">
                    <div className="flex flex-col items-center gap-4 p-8 bg-white/5 rounded-2xl border border-white/10 max-w-sm text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                            <Lock className="w-8 h-8 text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold mb-1">Acceso Restringido</h2>
                            <p className="text-sm text-gray-400">No tienes permisos para ver la Pantalla de Cocina (KDS).</p>
                        </div>
                        <Link href="/tables">
                            <button className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors">
                                Volver
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">
            {/* SIDEBAR (Desktop Only) */}
            <aside className="hidden md:flex w-[90px] bg-toast-charcoal-dark flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                <div className="mb-10 scale-110">
                    <div className="w-12 h-12 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <ClipboardList className="text-white w-7 h-7" />
                    </div>
                </div>
                <nav className="flex flex-col gap-2 w-full px-2">
                    <Link href="/tables">
                        <NavItem icon={<ArrowLeft />} label="Volver" />
                    </Link>
                    <div className="h-px bg-white/10 my-2 w-full"></div>
                    <NavItem
                        icon={<Settings />}
                        label="Config"
                        onClick={handleOpenSettings}
                        active={isSettingsOpen}
                    />

                    <div className="h-px bg-white/10 my-2 w-full"></div>

                    <Link href="/orders/recipes">
                        <NavItem icon={<Book />} label="Recetas" />
                    </Link>
                </nav>
            </aside>

            {/* CONTENT */}
            <main className="flex-1 flex flex-col h-full bg-[#2a2a2a] overflow-hidden">
                <Header title={`KDS: ${viewMode === 'kitchen' ? 'Cocina' : (viewMode === 'bar' ? 'Barra' : viewMode)}`}>
                    <div className="flex flex-col md:flex-row items-center gap-3 w-full justify-start overflow-x-auto pb-2 scrollbar-hide">
                        {/* DYNAMIC TABS (FILTERED) */}
                        <div className="flex bg-black/20 p-1 rounded-lg gap-1 shrink-0">
                            {visibleTabs.sort().sort((a, b) => a === 'kitchen' ? -1 : (b === 'kitchen' ? 1 : 0)).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setViewMode(tab)}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 whitespace-nowrap
                                    ${viewMode === tab ? 'bg-toast-orange text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                                    {tab.toLowerCase().includes('bar') ? <Martini className="w-4 h-4" /> : <ChefHat className="w-4 h-4" />}
                                    {tab === 'kitchen' ? 'Cocina' : (tab === 'bar' ? 'Bar' : tab)}
                                </button>
                            ))}
                            {visibleTabs.length === 0 && (
                                <div className="px-4 py-1.5 text-xs text-gray-500 italic">
                                    Ninguna área seleccionada
                                </div>
                            )}
                        </div>
                    </div>
                </Header>

                {/* STATION SETTINGS MODAL */}
                {isSettingsOpen && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-toast-charcoal-dark w-full max-w-md rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95">
                            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-toast-charcoal">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-toast-orange" />
                                    Configuración de Estación
                                </h3>
                                <button onClick={() => setIsSettingsOpen(false)}><X className="text-gray-400 hover:text-white" /></button>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-400 mb-4">
                                    Selecciona las áreas que debe mostrar ESTA pantalla. La configuración se guardará solo en este dispositivo.
                                </p>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {allTabs.map(tab => (
                                        <label key={tab} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:bg-white/5 cursor-pointer bg-black/20">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                                                ${tempFilter.includes(tab) ? 'bg-toast-orange border-toast-orange text-white' : 'border-gray-500'}`}>
                                                {tempFilter.includes(tab) && <Check className="w-3 h-3" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={tempFilter.includes(tab)}
                                                onChange={() => toggleFilter(tab)}
                                            />
                                            <span className="text-sm font-bold text-white capitalize">
                                                {tab === 'kitchen' ? 'Cocina' : (tab === 'bar' ? 'Bar' : tab)}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 border-t border-white/10 bg-toast-charcoal flex justify-end gap-3">
                                <button
                                    onClick={() => setTempFilter([])}
                                    className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider"
                                >
                                    Mostrar Todo
                                </button>
                                <button
                                    onClick={handleSaveSettings}
                                    className="px-6 py-2 bg-toast-green hover:bg-green-600 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-green-900/20"
                                >
                                    <Save className="w-4 h-4" />
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 p-4 overflow-y-auto pb-[80px]">
                    {!orders || orders.length === 0 ? (
                        <div className="h-full flex items-center justify-center flex-col gap-4 text-gray-500">
                            <Clock className="w-12 h-12 opacity-20" />
                            <p className="text-base font-medium">Sin comandas pendientes</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                            {orders
                                .filter(order => !(order.readySections || []).map((s: string) => s.toLowerCase()).includes(viewMode.toLowerCase()))
                                .map(order => (
                                    <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} viewMode={viewMode} />
                                ))}
                        </div>
                    )}
                </div>

                {/* MOBILE TACTICAL NAVIGATION (Bottom Bar) */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-toast-charcoal-dark border-t border-white/10 grid grid-cols-3 h-[65px] z-50">
                    <button
                        onClick={() => window.location.href = '/tables'}
                        className="flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">Volver</span>
                    </button>
                    <button
                        onClick={handleOpenSettings}
                        className={`flex flex-col items-center justify-center gap-0.5 ${isSettingsOpen ? 'text-toast-orange' : 'text-gray-400'}`}
                    >
                        <Settings className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">Config</span>
                    </button>
                    <button
                        onClick={() => window.location.href = '/orders/recipes'}
                        className="flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-white"
                    >
                        <Book className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">Recetas</span>
                    </button>
                </div>
            </main>
        </div>
    )
}
