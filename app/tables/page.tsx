'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabase, RestaurantTable, Order } from '@/lib/db';
import Link from 'next/link';
import { UtensilsCrossed, LayoutGrid, ClipboardList, Package, Truck, ShoppingCart, Trash2, Users, Bell, Settings, LogOut, Search, Filter, Plus, Edit3, GripHorizontal } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { getOrderWaitTime, getWaitStatus, getOrderWaitTimeFormatted } from '@/lib/kds';

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ClockOutModal from '@/components/ClockOutModal';
import GuestCountModal from '@/components/GuestCountModal';
import { toast } from 'sonner';
import { syncService } from '@/lib/sync_service';
import { useAutoSync } from '@/components/providers/AutoSyncProvider';
import { RefreshCw } from 'lucide-react';
import { TableService } from '@/lib/table_service';

// --- NEW COMPONENTS ---

function ZoneTab({ label, active, onClick, count }: { label: string, active: boolean, onClick: () => void, count?: number }) {
    return (
        <button
            onClick={onClick}
            className={`px-6 py-2 rounded-full font-bold text-sm uppercase tracking-wider transition-all border flex items-center gap-2
            ${active
                    ? 'bg-toast-orange text-white border-toast-orange shadow-lg shadow-orange-900/40 transform scale-105 structure-active'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:border-white/20'}`}
        >
            {label}
            {count !== undefined && <span className="text-[10px] opacity-70 bg-black/20 px-1.5 py-0.5 rounded-full">{count}</span>}
        </button>
    );
}

export default function TablesPage() {
    const router = useRouter();
    const [now, setNow] = useState(Date.now());
    const { status: autoSyncStatus } = useAutoSync();
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error' | 'timed_out'>('connecting');
    const [lastNexusError, setLastNexusError] = useState<string | null>(null);

    // --- ZONE STATE ---
    const [activeZone, setActiveZone] = useState<string>('TODAS');
    const [draggedTableId, setDraggedTableId] = useState<number | null>(null);

    // Monitor Realtime Status
    useEffect(() => {
        const interval = setInterval(() => {
            setRealtimeStatus(syncService.channelStatus as any);
            setLastNexusError(syncService.lastError);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const initRealtime = async () => {
            await syncService.subscribeToTable('restaurant_tables', db.restaurantTables, () => setNow(Date.now()));
            await syncService.subscribeToTable('orders', db.orders, () => setNow(Date.now()));
        };
        initRealtime();
    }, []);

    // Fetched Data
    const data = useLiveQuery(async () => {
        const t = await db.restaurantTables.toArray();
        const o = await db.orders.where('status').anyOf('open', 'ready').toArray();

        const map = new Map<number, Order>();
        o.forEach(ord => map.set(ord.id!, ord));

        // Get Unique Zones CLEANLY (No hardcodes)
        const zones = new Set<string>();
        const rawZoneNames = new Set<string>();

        if (t.length > 0) {
            t.forEach(table => {
                const z = table.zone || 'General';
                zones.add(z.toUpperCase());
                rawZoneNames.add(z);
            });
        } else {
            // Only if DB is completely empty show at least General
            zones.add('GENERAL');
            rawZoneNames.add('General');
        }

        const sortedZones = Array.from(zones).sort();
        const sortedRawZones = Array.from(rawZoneNames).sort();

        // Pass 'zones' explicitly for the dropdown to use
        return { tables: t, orderMap: map, zones: ['TODAS', ...sortedZones], rawZones: sortedRawZones };
    }, [now]);

    const tables = data?.tables || [];
    const orderMap = data?.orderMap;
    // Fallback to minimal state if loading
    const availableZones = data?.zones || ['TODAS', 'GENERAL'];
    const rawZones = data?.rawZones || ['General'];

    // Filter Tables by Zone
    const filteredTables = tables.filter(t => {
        if (activeZone === 'TODAS') return true;
        return (t.zone || 'GENERAL').toUpperCase() === activeZone;
    });

    // Stats
    const totalTables = tables.length;
    const occupiedTables = tables.filter(t => t.status === 'occupied').length;
    const availableTables = tables.filter(t => t.status === 'available').length;

    const [selectedTableForGuestCount, setSelectedTableForGuestCount] = useState<RestaurantTable | null>(null);
    const [guestCount, setGuestCount] = useState(2);
    const [showClockOut, setShowClockOut] = useState(false);

    useEffect(() => {
        const handleClockOut = () => setShowClockOut(true);
        window.addEventListener('open-clock-out', handleClockOut);
        return () => window.removeEventListener('open-clock-out', handleClockOut);
    }, []);

    // --- TABLE EDITING ---
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingTableId, setEditingTableId] = useState<number | null>(null); // Specific table being edited
    const [editForm, setEditForm] = useState({ name: '', zone: '' });

    const handleAddTable = async () => {
        const nextNumber = tables.length + 1;
        // Default to current active zone if specific, else General
        let defaultZone = 'General';
        if (activeZone !== 'TODAS') {
            // Find the raw spelling that matches this uppercase zone
            const match = rawZones.find(z => z.toUpperCase() === activeZone);
            if (match) defaultZone = match;
        }

        await db.restaurantTables.add({
            name: `Mesa ${nextNumber}`,
            status: 'available',
            x: 0,
            y: 0,
            zone: defaultZone
        });
    };

    const handleDeleteTable = async (id: number) => {
        if (confirm("¿Seguro que deseas eliminar esta mesa?")) {
            await db.restaurantTables.delete(id);
        }
    };

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent, table: RestaurantTable) => {
        if (table.status !== 'occupied') {
            e.preventDefault(); // Only drag occupied tables
            return;
        }
        setDraggedTableId(table.id!);
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Custom ghost image
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Essential for 'drop' to fire
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetTable: RestaurantTable) => {
        e.preventDefault();

        if (!draggedTableId) return;
        if (draggedTableId === targetTable.id) return;

        try {
            if (targetTable.status === 'available') {
                // MOVE
                if (confirm(`¿Mover pedido de la mesa origen a ${targetTable.name}?`)) {
                    await TableService.moveTable(draggedTableId, targetTable.id!);
                    toast.success("Mesa movida correctamente");
                }
            } else if (targetTable.status === 'occupied') {
                // MERGE
                if (confirm(`¿Juntar mesas? Se unirá el pedido de la mesa origen con ${targetTable.name}.`)) {
                    await TableService.mergeTables(draggedTableId, targetTable.id!);
                    toast.success("Mesas unidas correctamente");
                }
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setDraggedTableId(null);
        }
    };

    // --- CLICK HANDLER ---
    const handleTableClick = (table: RestaurantTable) => {
        if (isEditMode) {
            // Edit Metadata
            setEditingTableId(table.id!);
            setEditForm({ name: table.name, zone: table.zone || 'General' });
        } else {
            // Normal Operations
            if (table.status === 'available') {
                setSelectedTableForGuestCount(table);
                setGuestCount(2);
            } else {
                router.push(`/?tableId=${table.id}`);
            }
        }
    };

    const saveTableEdit = async () => {
        if (!editingTableId) return;

        // Capitalize nicely if it's new
        const finalZone = editForm.zone.trim() || 'General';

        await db.restaurantTables.update(editingTableId, {
            name: editForm.name,
            zone: finalZone
        });
        setEditingTableId(null);
        // Sync
        syncService.autoSync(db.restaurantTables, 'restaurant_tables');
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
                covers: count,
                restaurantId: '1' // Assuming singleton for now
            });

            await db.restaurantTables.update(selectedTableForGuestCount.id!, {
                status: 'occupied',
                currentOrderId: orderId as number
            });

            router.push(`/?tableId=${selectedTableForGuestCount.id}`);

            // Sync
            syncService.autoSync(db.orders, 'orders');
            syncService.autoSync(db.restaurantTables, 'restaurant_tables');

        } catch (e) { console.error(e); } finally { setSelectedTableForGuestCount(null); }
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

                {/* --- EDIT TABLE MODAL --- */}
                {editingTableId && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                        <div className="bg-toast-charcoal-dark p-6 rounded-2xl border border-white/10 w-full max-w-sm shadow-2xl relative">
                            <h3 className="text-xl font-bold mb-4">Editar Mesa</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Nombre</label>
                                    <input
                                        value={editForm.name}
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-toast-orange outline-none font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 font-bold uppercase mb-1 block">Zona</label>
                                    <div className="relative">
                                        <input
                                            value={editForm.zone}
                                            onChange={e => setEditForm({ ...editForm, zone: e.target.value })}
                                            placeholder="Ej: Salon, Terraza..."
                                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-toast-orange outline-none font-bold mb-2"
                                        />

                                        {/* Quick Select Chips */}
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {rawZones.map(z => (
                                                <button
                                                    key={z}
                                                    onClick={() => setEditForm({ ...editForm, zone: z })}
                                                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors font-bold uppercase
                                                        ${editForm.zone === z
                                                            ? 'bg-toast-orange border-toast-orange text-white'
                                                            : 'cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 text-gray-400'}`}
                                                >
                                                    {z}
                                                </button>
                                            ))}
                                            <div className="text-[10px] px-2 py-1 rounded-full border border-dashed border-white/20 text-gray-500">
                                                + Crea nueva escribiendo arriba
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={() => setEditingTableId(null)} className="flex-1 bg-white/5 py-3 rounded-lg font-bold hover:bg-white/10 transition-all">Cancelar</button>
                                    <button onClick={saveTableEdit} className="flex-1 bg-toast-orange py-3 rounded-lg font-bold text-white hover:bg-orange-600 transition-all">Guardar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <Header title="Mapa de Mesas">
                    <div className="flex items-center gap-4 w-full justify-between">
                        <div className="hidden lg:flex gap-3 items-center">
                            {/* STATUS PILLS */}
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                                <span className="text-xs font-bold text-gray-300">Libres: {availableTables}</span>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                                <span className="text-xs font-bold text-gray-300">Ocupadas: {occupiedTables}</span>
                            </div>
                        </div>

                        {/* EDIT MODE TOGGLE */}
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

                            <button
                                onClick={async () => {
                                    toast.loading("Sincronizando...");
                                    await syncService.restoreFromCloud(() => { }, true);
                                    await syncService.retrySubscriptions();
                                    toast.dismiss();
                                    toast.success("Actualizado");
                                }}
                                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </Header>

                {/* --- ZONE TABS --- */}
                <div className="border-b border-white/5 bg-black/20 p-2 overflow-x-auto">
                    <div className="flex items-center gap-2 min-w-max mx-auto max-w-7xl px-4">
                        {availableZones.map(zone => (
                            <ZoneTab
                                key={zone}
                                label={zone}
                                active={activeZone === zone}
                                onClick={() => setActiveZone(zone)}
                                count={zone === 'TODAS' ? tables.length : tables.filter(t => (t.zone || 'GENERAL').toUpperCase() === zone).length}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gradient-to-b from-[#2a2a2a] to-[#222]">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-4 max-w-7xl mx-auto pb-20">
                        {filteredTables.map(table => {
                            let containerClass = "";
                            let iconClass = "";
                            let textClass = "";
                            let label = "";
                            let waitTime = 0;
                            let waitTimeLabel = "";

                            // Ready Flags
                            let hasKitchenReady = false;
                            let hasBarReady = false;

                            if (table.status === 'occupied') {
                                const order = orderMap?.get(table.currentOrderId!);
                                if (order) {
                                    waitTime = getOrderWaitTime(order.createdAt);
                                    waitTimeLabel = getOrderWaitTimeFormatted(order.createdAt);
                                    const readySections = (order as any).readySections || [];
                                    const deliveredSections = (order as any).deliveredSections || [];
                                    readySections.forEach((s: string) => {
                                        if (deliveredSections.includes(s.toLowerCase())) return;
                                        if (s.toLowerCase() === 'bar') hasBarReady = true;
                                        else hasKitchenReady = true;
                                    });
                                }
                                const status = getWaitStatus(waitTime);
                                label = 'Ocupada';

                                if (status === 'critical') {
                                    containerClass = 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20 shadow-red-900/20';
                                    iconClass = 'bg-red-600 text-white border-red-500 shadow-md';
                                    textClass = 'text-red-400 font-bold';
                                } else if (status === 'warning') {
                                    containerClass = 'bg-yellow-500/10 border-yellow-500/50 hover:bg-yellow-500/20 shadow-yellow-900/20';
                                    iconClass = 'bg-yellow-500 text-black border-yellow-400 shadow-md';
                                    textClass = 'text-yellow-400 font-bold';
                                } else {
                                    containerClass = 'bg-green-500/10 border-green-500/50 hover:bg-green-500/20 shadow-green-900/20';
                                    iconClass = 'bg-green-600 text-white border-green-500 shadow-md';
                                    textClass = 'text-green-400 font-bold';
                                }
                            } else {
                                label = 'Libre';
                                // FIXED: cleaner look for empty tables, no dashed border unless edit mode
                                containerClass = 'bg-[#1a1a1a] border-white/5 hover:border-white/20 hover:bg-white/5';
                                iconClass = 'bg-white/5 text-gray-500 border-transparent group-hover:text-white group-hover:bg-white/10';
                                textClass = 'text-gray-600 group-hover:text-gray-400';
                            }

                            // Highlight valid drop target if dragging
                            const isDragTarget = draggedTableId && draggedTableId !== table.id && !isEditMode;

                            // If table is AVAILABLE, it's a valid target for MOVE
                            // If table is OCCUPIED, it's a valid target for MERGE
                            const isValidTarget = isDragTarget;

                            if (draggedTableId && isValidTarget) {
                                containerClass += " ring-2 ring-dashed ring-toast-orange/50 scale-95";
                            }

                            return (
                                <div key={table.id} className="relative group">
                                    <div
                                        draggable={!isEditMode && table.status === 'occupied'}
                                        onDragStart={(e) => handleDragStart(e, table)}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, table)}
                                        onClick={() => handleTableClick(table)}
                                        className={`w-full aspect-square rounded-xl border flex flex-col items-center justify-between p-2 transition-all overflow-hidden relative
                                            ${containerClass} ${isEditMode ? 'animate-pulse cursor-context-menu border-dashed border-toast-orange/30' : 'cursor-pointer'}
                                            ${draggedTableId === table.id ? 'opacity-50 scale-95 grayscale' : ''}
                                            `}
                                    >
                                        {/* READY INDICATORS */}
                                        <div className="absolute top-2 left-2 flex gap-1">
                                            {hasKitchenReady && <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></div>}
                                            {hasBarReady && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping delay-150"></div>}
                                        </div>

                                        {/* Drag Handle */}
                                        {!isEditMode && table.status === 'occupied' && (
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity">
                                                <GripHorizontal className="w-5 h-5 text-white drop-shadow-md" />
                                            </div>
                                        )}

                                        {/* EDIT ICON */}
                                        {isEditMode && (
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                                <Edit3 className="w-8 h-8 text-white drop-shadow-lg" />
                                            </div>
                                        )}

                                        {/* TOP: Number/Icon */}
                                        <div className={`mt-1 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border mb-1 transition-transform group-hover:scale-110 flex-shrink-0 ${iconClass}`}>
                                            {table.name.replace(/\D/g, '') || table.name.charAt(0)}
                                        </div>

                                        {/* MIDDLE: Name & Status */}
                                        <div className="flex flex-col items-center justify-center w-full min-h-0 flex-1">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight text-center line-clamp-2 w-full">
                                                {table.name}
                                            </p>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider ${textClass}`}>
                                                {label}
                                            </span>
                                        </div>

                                        {/* BOTTOM: Zone Label (Only if needed) */}
                                        {table.zone && activeZone === 'TODAS' && (
                                            <div className="mt-1 flex-shrink-0 relative">
                                                <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border whitespace-nowrap overflow-hidden text-ellipsis max-w-full block
                                                    ${(table.zone.toLowerCase().includes('delivery')) ? 'bg-orange-500/20 text-orange-200 border-orange-500/30' : 'bg-black/40 text-gray-500 border-white/5'}
                                                `}>
                                                    {table.zone}
                                                </span>
                                            </div>
                                        )}

                                    </div>

                                    {/* DELETE BUTTON (EDIT MODE ONLY) */}
                                    {isEditMode && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteTable(table.id!);
                                            }}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg z-20 hover:scale-110 transition-transform"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}

                        {/* ADD BUTTON */}
                        {isEditMode && (
                            <button
                                onClick={handleAddTable}
                                className="aspect-square rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:bg-white/5 hover:border-toast-orange/50 hover:text-toast-orange text-gray-500 transition-colors"
                            >
                                <Plus className="w-8 h-8 opacity-50" />
                                <span className="text-xs font-bold uppercase tracking-wider">Nueva</span>
                            </button>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
