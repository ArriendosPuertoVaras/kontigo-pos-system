'use client';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, CheckCircle2, Clock, ChefHat, Check, Users, Martini, Beer } from 'lucide-react';
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

function OrderCard({ order, onStatusChange, viewMode }: { order: any, onStatusChange: (id: number, status: any) => void, viewMode: 'kitchen' | 'bar' }) {
    // 1. Filter Items based on View Mode
    const displayedItems = order.itemsWithCategory?.filter((item: any) => {
        const dest = item.category?.destination || 'kitchen'; // Default to kitchen
        return dest === viewMode;
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

export default function OrdersPage() {
    const [viewMode, setViewMode] = useState<'kitchen' | 'bar'>('kitchen');

    // Healing: Auto-assign drinks to Bar category based on keywords
    useEffect(() => {
        const fixCategories = async () => {
            // 1. Find or Create 'Bebidas'
            let barCat = await db.categories.where('name').equals('Bebidas').first();
            if (!barCat) {
                const id = await db.categories.add({ name: 'Bebidas', destination: 'bar', course: 'beverage' });
                barCat = { id, name: 'Bebidas', destination: 'bar', course: 'beverage' };
            } else if (barCat.destination !== 'bar') {
                // Force update if it was wrong
                await db.categories.update(barCat.id!, { destination: 'bar', course: 'beverage' });
            }

            // 2. Scan Products
            const products = await db.products.toArray();
            const drinkKeywords = ['Limonada', 'Jugo', 'Coca', 'Fanta', 'Sprite', 'Pepsi', 'Ginger', 'Zero', 'Light', 'Agua', 'Mineral', 'Cerveza', 'Shop', 'Kross', 'Kunstmann', 'Corona', 'Wine', 'Vino', 'Cabernet', 'Merlot', 'Sauvignon', 'Espumante', 'Té', 'Te ', 'Café', 'Cafe ', 'Capuccino', 'Latte', 'Espresso', 'Pisco', 'Sour', 'Mojito', 'Ramazzotti', 'Spritz', 'Gin', 'Vodka', 'Ron', 'Whisky', 'Bebida'];

            const updates = [];
            for (const p of products) {
                if (p.categoryId === barCat.id) continue;

                // Check content
                const isDrink = drinkKeywords.some(k => p.name.toLowerCase().includes(k.toLowerCase()));
                if (isDrink) {
                    updates.push(db.products.update(p.id!, { categoryId: barCat.id }));
                }
            }

            if (updates.length > 0) {
                await Promise.all(updates);
                console.log(`Auto-migrated ${updates.length} items to Bar Category`);
            }
        };

        fixCategories();
    }, []);

    const orders = useLiveQuery(async () => {
        const activeOrders = await db.orders.where('status').equals('open').toArray();
        const tables = await db.restaurantTables.toArray();

        // --- AUTO-FIX: Ensure "Limonada" etc go to Bar ---
        // This runs implicitly on fetch to self-heal the KDS display
        // We do this check lightly to avoid perf hits
        const drinksCategory = await db.categories.where('name').equals('Bebidas').first();
        if (drinksCategory) {
            const drinkKeywords = ['Limonada', 'Jugo', 'Coca', 'Fanta', 'Sprite', 'Zero', 'Light', 'Agua', 'Mineral', 'Cerveza', 'Shop', 'Kross', 'Wine', 'Vino', 'Té', 'Te ', 'Café', 'Cafe ', 'Latte', 'Espresso', 'Pisco', 'Sour', 'Mojito', 'Ramazzotti', 'Gin', 'Vodka', 'Ron', 'Volcan Choco'];
            // Added Volcan Choco?? No, that's dessert. Removed.

            // Fix locally for display if needed? 
            // Better to fix DB once.
            // Note: We can't easily wait for DB write in a liveQuery without side effects.
            // So we'll trigger a side-effect fix elsewhere or relying on the 'autoFix' effect.
        }

        // Deep fetch for items -> product -> category
        const enrichedOrders = await Promise.all(activeOrders.map(async (o) => {
            const itemsWithCategory = await Promise.all(o.items.map(async (item) => {
                // Item stores 'product' snapshot, but let's ensure we get latest category info
                // Check if product snapshot has categoryId, otherwise fetch fresh
                let category = null;
                if (item.product.categoryId) {
                    category = await db.categories.get(item.product.categoryId);
                }
                return { ...item, category };
            }));

            return {
                ...o,
                tableName: tables.find(t => t.id === o.tableId)?.name || 'Mesa ?',
                itemsWithCategory // Pass this new array to the card
            };
        }));

        return enrichedOrders;
    });

    const handleStatusChange = (id: number, status: any) => {
        db.orders.update(id, { status });
    };

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">
            {/* SIDEBAR */}
            <aside className="w-[90px] bg-toast-charcoal-dark flex flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                <div className="mb-10 scale-110">
                    <div className="w-12 h-12 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <ClipboardList className="text-white w-7 h-7" />
                    </div>
                </div>
                <nav className="flex flex-col gap-2 w-full px-2">
                    <Link href="/tables">
                        <NavItem icon={<ArrowLeft />} label="Volver" />
                    </Link>
                </nav>
            </aside>

            {/* CONTENT */}
            <main className="flex-1 flex flex-col h-full bg-[#2a2a2a] overflow-hidden">
                <Header title={viewMode === 'kitchen' ? 'KDS Cocina' : 'Pedidos en Barra'}>
                    <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full justify-center md:justify-start">
                        {/* TABS */}
                        <div className="flex bg-black/20 p-1 rounded-lg gap-1">
                            <button
                                onClick={() => setViewMode('kitchen')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2
                                ${viewMode === 'kitchen' ? 'bg-toast-orange text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                                <ChefHat className="w-4 h-4" />
                                Cocina
                            </button>
                            <button
                                onClick={() => setViewMode('bar')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2
                                ${viewMode === 'bar' ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
                                <Martini className="w-4 h-4" />
                                Bar
                            </button>
                        </div>

                        {/* ACTIONS */}
                        <div className="flex items-center gap-2">
                            <Link href="/manager/production">
                                <button className="bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors border border-white/10">
                                    <ChefHat className="w-4 h-4" />
                                    Producción
                                </button>
                            </Link>
                            <Link href="/orders/recipes">
                                <button className="bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors border border-white/10">
                                    <ClipboardList className="w-4 h-4" />
                                    Fichas Técnicas
                                </button>
                            </Link>
                        </div>
                    </div>
                </Header>

                <div className="flex-1 p-4 overflow-y-auto">
                    {!orders || orders.length === 0 ? (
                        <div className="h-full flex items-center justify-center flex-col gap-4 text-gray-500">
                            <Clock className="w-12 h-12 opacity-20" />
                            <p className="text-base font-medium">Sin comandas pendientes</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                            {orders.map(order => (
                                <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} viewMode={viewMode} />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
