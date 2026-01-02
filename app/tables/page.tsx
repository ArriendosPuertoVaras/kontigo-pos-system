'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabase, RestaurantTable, Order } from '@/lib/db';
import Link from 'next/link';
import { UtensilsCrossed, LayoutGrid, ClipboardList, Package, Truck, ShoppingCart, Trash2, Users, Bell, Settings, LogOut, Search, Filter } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { getOrderWaitTime, getWaitStatus, getOrderWaitTimeFormatted } from '@/lib/kds'; // Fixed import

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ClockOutModal from '@/components/ClockOutModal';
import GuestCountModal from '@/components/GuestCountModal'; // NEW Import
import { syncService } from '@/lib/sync_service';

// --- COMPONENTS ---

export default function TablesPage() {
    const router = useRouter();

    // --- STATE: Ticker for Time Updates (Every 30s) ---
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 30000); // Update every 30 seconds to keep times fresh
        return () => clearInterval(interval);
    }, []);

    // --- REALTIME NEXUS: Listen for Shared State Changes ---
    useEffect(() => {
        // Initialize subscriptions
        const initRealtime = async () => {
            await syncService.subscribeToTable('restaurant_tables', db.restaurantTables, () => {
                console.log("♻️ [UI] Refreshing Tables due to Realtime event...");
                setNow(Date.now()); // Trigger useLiveQuery refresh
            });
            await syncService.subscribeToTable('orders', db.orders, () => {
                console.log("♻️ [UI] Refreshing Orders due to Realtime event...");
                setNow(Date.now());
            });
        };

        initRealtime();
    }, []);

    // Fetched Data
    const data = useLiveQuery(async () => {
        const t = await db.restaurantTables.toArray();
        // Fetch both OPEN (active) and READY (waiting for delivery) orders
        const o = await db.orders.where('status').anyOf('open', 'ready').toArray();
        const c = await db.categories.toArray();

        const map = new Map<number, Order>();
        o.forEach(ord => map.set(ord.id!, ord));

        // Category Map for Destination Lookup
        const catMap = new Map<number, string>();
        c.forEach(cat => catMap.set(cat.id!, cat.destination || 'kitchen'));

        return { tables: t, orderMap: map, catMap };
    }, [now]);

    const tables = data?.tables;
    const orderMap = data?.orderMap;
    const catMap = data?.catMap;

    // ... (Stats Logic Unchanged) ...
    // Quick Stats
    const totalTables = tables?.length || 0;
    const occupiedTables = tables?.filter(t => t.status === 'occupied').length || 0;
    const availableTables = tables?.filter(t => t.status === 'available').length || 0;

    // ... (Guest Count Logic Unchanged) ...
    const [selectedTableForGuestCount, setSelectedTableForGuestCount] = useState<RestaurantTable | null>(null);
    const [guestCount, setGuestCount] = useState(2);
    const [showClockOut, setShowClockOut] = useState(false);

    // ... (Effect Unchanged) ...
    useEffect(() => {
        const handleClockOut = () => setShowClockOut(true);
        window.addEventListener('open-clock-out', handleClockOut);
        return () => window.removeEventListener('open-clock-out', handleClockOut);
    }, []);

    // ... (Table Management Logic Unchanged) ...
    const [isEditMode, setIsEditMode] = useState(false);

    const handleAddTable = async () => {
        const nextNumber = (tables?.length || 0) + 1;
        await db.restaurantTables.add({
            name: `Mesa ${nextNumber}`,
            status: 'available',
            x: 0,
            y: 0
        });
    };

    const handleDeleteTable = async (id: number) => {
        if (confirm("¿Seguro que deseas eliminar esta mesa?")) {
            await db.restaurantTables.delete(id);
        }
    };

    // --- ALERT LOGIC (Removed Global Toast in favor of Per-Table Blinking) ---
    // (Keeping generic notification state if needed for other things, but disabling the auto-toast for Ready)
    const [notification, setNotification] = useState<string | null>(null);

    const handleTableClick = async (table: RestaurantTable) => {
        if (table.status === 'available') {
            setSelectedTableForGuestCount(table);
            setGuestCount(2);
        } else {
            // Navigate to Order
            router.push(`/?tableId=${table.id}`);
        }
    };

    const handleConfirmGuestCount = async (count: number) => {
        if (!selectedTableForGuestCount) return;

        try {
            const orderId = await db.orders.add({
                tableId: selectedTableForGuestCount.id!,
                items: [],
                status: 'open',
                subtotal: 0,
                tip: 0,
                total: 0,
                createdAt: new Date(),
                covers: count
            });

            await db.restaurantTables.update(selectedTableForGuestCount.id!, {
                status: 'occupied',
                currentOrderId: orderId as number
            });

            router.push(`/?tableId=${selectedTableForGuestCount.id}`);

            // TRANSACTIONAL SYNC: Ensure cloud has this order NOW
            const { syncService } = await import('@/lib/sync_service');
            await syncService.autoSync(db.orders, 'orders');
            await syncService.autoSync(db.restaurantTables, 'restaurant_tables');

        } catch (e) {
            console.error("Error creating order:", e);
        } finally {
            setSelectedTableForGuestCount(null);
        }
    };

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">

            <GuestCountModal
                isOpen={!!selectedTableForGuestCount}
                onClose={() => setSelectedTableForGuestCount(null)}
                onConfirm={handleConfirmGuestCount}
                tableName={selectedTableForGuestCount?.name || ''}
            />

            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#2a2a2a]">

                <Header title="Mapa de Mesas">
                    <div className="flex items-center gap-6 w-full justify-between">
                        <div className="hidden lg:flex gap-3">
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                                <span className="text-xs font-bold text-gray-300">Libres: {availableTables}</span>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                                <span className="text-xs font-bold text-gray-300">Ocupadas: {occupiedTables}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg
                                    ${isEditMode
                                        ? 'bg-toast-orange text-white hover:bg-orange-600 shadow-orange-900/20'
                                        : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'}`}
                            >
                                <Settings className={`w-4 h-4 ${isEditMode ? 'animate-spin' : ''}`} />
                                {isEditMode ? 'Finalizar Edición' : 'Editar Mesas'}
                            </button>

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar mesa..."
                                    className="pl-10 pr-4 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-toast-orange/50 w-32 md:w-48 transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </Header>

                <div className="flex-1 overflow-y-auto p-8">
                    {!tables ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                            <span>Cargando mapa...</span>
                        </div>
                    ) : (

                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 max-w-7xl mx-auto pb-20">
                            {tables.map(table => {
                                let containerClass = "";
                                let iconClass = "";
                                let textClass = "";
                                let label = "";
                                let waitTime = 0;
                                let waitTimeLabel = "";

                                // Ready Flags
                                let hasKitchenReady = false;
                                let hasBarReady = false;
                                let hasParrillaReady = false;

                                if (table.status === 'occupied') {
                                    const order = orderMap?.get(table.currentOrderId!);
                                    if (order) {
                                        waitTime = getOrderWaitTime(order.createdAt);
                                        waitTimeLabel = getOrderWaitTimeFormatted(order.createdAt);

                                        // CHECK FOR READY STATUS & DELIVERY
                                        // CHECK FOR READY STATUS per Section (Independent delivery)
                                        const readySections = (order as any).readySections || [];
                                        const deliveredSections = (order as any).deliveredSections || [];

                                        readySections.forEach((s: string) => {
                                            const section = s.toLowerCase();
                                            if (deliveredSections.includes(section)) return; // Skip if already delivered

                                            if (section === 'bar') hasBarReady = true;
                                            else if (section === 'parrilla') hasParrillaReady = true;
                                            else hasKitchenReady = true; // Default/Kitchen
                                        });
                                    }
                                    const status = getWaitStatus(waitTime);

                                    label = 'Ocupada';

                                    if (status === 'critical') {
                                        containerClass = 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.3)]'; // Removed pulse, used for ready
                                        iconClass = 'bg-red-600 text-white border-red-500 shadow-lg';
                                        textClass = 'text-red-400 font-bold';
                                    } else if (status === 'warning') {
                                        containerClass = 'bg-yellow-500/10 border-yellow-500/50 hover:bg-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.2)]';
                                        iconClass = 'bg-yellow-500 text-black border-yellow-400 shadow-md';
                                        textClass = 'text-yellow-400 font-bold';
                                    } else {
                                        containerClass = 'bg-green-500/10 border-green-500/50 hover:bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.2)]';
                                        iconClass = 'bg-green-600 text-white border-green-500 shadow-md';
                                        textClass = 'text-green-400 font-bold';
                                    }
                                } else if (table.status === 'reserved') {
                                    label = 'Reservada';
                                    containerClass = 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 opacity-80';
                                    iconClass = 'bg-purple-900/50 text-purple-300 border-purple-500/50';
                                    textClass = 'text-purple-400';
                                } else {
                                    label = 'Libre';
                                    containerClass = 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10';
                                    iconClass = 'bg-transparent text-gray-500 border-gray-600 group-hover:border-white group-hover:text-white';
                                    textClass = 'text-gray-500 group-hover:text-white';
                                }

                                return (
                                    <div key={table.id} className="relative group">
                                        <button
                                            onClick={() => handleTableClick(table)}
                                            className={`w-full aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition-all overflow-hidden ${containerClass} ${isEditMode ? 'animate-pulse' : ''}`}
                                        >
                                            {/* READY INDICATORS (BLINKING) */}
                                            <div className="absolute top-2 left-2 flex gap-1">
                                                {hasKitchenReady && (
                                                    <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)] animate-[ping_1s_ease-in-out_infinite]" title="Cocina Lista"></div>
                                                )}
                                                {hasParrillaReady && (
                                                    <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)] animate-[ping_1s_ease-in-out_infinite] delay-150" title="Parrilla Lista"></div>
                                                )}
                                                {hasBarReady && (
                                                    <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-[ping_1s_ease-in-out_infinite] delay-300" title="Bar Listo"></div>
                                                )}
                                            </div>

                                            {/* Table Icon / Number */}
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 mb-1 transition-transform group-hover:scale-110 ${iconClass}`}>
                                                {table.name.replace('Mesa ', '')}
                                            </div>

                                            <span className={`text-sm font-bold uppercase tracking-wider ${textClass}`}>
                                                {label}
                                            </span>

                                            {/* Wait Time Badge for Occupied */}
                                            {table.status === 'occupied' && (
                                                <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${waitTime >= 20 ? 'bg-red-500 text-white border-red-400' :
                                                        waitTime >= 10 ? 'bg-yellow-500 text-black border-yellow-400' :
                                                            'bg-green-500/20 text-green-400 border-green-500/30'
                                                        }`}>
                                                        {waitTimeLabel}
                                                    </span>
                                                </div>
                                            )}

                                        </button>

                                        {/* DELETE BUTTON (EDIT MODE ONLY) */}
                                        {isEditMode && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteTable(table.id!);
                                                }}
                                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg z-10 hover:scale-110 transition-transform"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                )
                            })}

                            {/* ADD NEW TABLE BUTTON (EDIT MODE ONLY) */}
                            {isEditMode && (
                                <button
                                    onClick={handleAddTable}
                                    className="aspect-square rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:bg-white/5 hover:border-toast-orange/50 hover:text-toast-orange text-gray-500 transition-colors group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-toast-orange/10 transition-colors">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider">Nueva Mesa</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <ClockOutModal
                    isOpen={showClockOut}
                    onClose={() => setShowClockOut(false)}
                />

                {
                    notification && (
                        <div className="fixed top-24 right-8 bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl z-[100] flex items-center gap-4 animate-bounce hover:animate-none cursor-pointer" onClick={() => setNotification(null)}>
                            <Bell className="w-8 h-8 animate-pulse text-white fill-white" />
                            <div>
                                <p className="font-bold text-lg leading-none uppercase tracking-wider">Atención</p>
                                <p className="font-medium">{notification}</p>
                            </div>
                        </div>
                    )
                }
            </main >
        </div >
    );
}
