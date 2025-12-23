'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, PurchaseOrder, PurchaseOrderItem } from '@/lib/db';
import { UtensilsCrossed, ArrowLeft, ShoppingCart, Plus, Check, Package, Loader2, Search, X, Trash2, Settings, Store, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { WasteModal } from './WasteModal';
import Header from '@/components/Header';
// ... imports
import { usePermission } from '@/hooks/usePermission';
import { Lock } from 'lucide-react';

// Extends the standard item to include the transient supplier ID for the cart
type CartItem = PurchaseOrderItem & { supplierId: number };

const getConversionMultiplier = (itemUnit: string, ingredient: any) => {
    if (itemUnit === ingredient.unit) return 1;
    if (itemUnit === ingredient.purchaseUnit) return ingredient.conversionFactor || 1;
    if (itemUnit === 'kg' && ingredient.unit === 'g') return 1000;
    if (itemUnit === 'g' && ingredient.unit === 'kg') return 0.001;
    if (itemUnit === 'l' && ingredient.unit === 'ml') return 1000;
    if (itemUnit === 'ml' && ingredient.unit === 'l') return 0.001;
    return 1;
};

export default function PurchasesPage() {
    const hasAccess = usePermission('admin:view');

    if (hasAccess === false) {
        return (
            <div className="flex h-screen w-full bg-[#1e1e1e]">
                {/* SIDEBAR */}
                <aside className="w-[90px] bg-toast-charcoal-dark flex flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                    <div className="mb-10 scale-110">
                        <div className="w-12 h-12 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <UtensilsCrossed className="text-white w-7 h-7" />
                        </div>
                    </div>
                    <nav className="flex flex-col gap-2 w-full px-2">
                        <Link href="/" className="flex flex-col items-center justify-center w-full py-3 rounded-xl transition-all duration-200 group text-gray-400 hover:text-white hover:bg-white/5">
                            <ArrowLeft className="w-5 h-5 mb-1" />
                            <span className="text-[9px] font-bold uppercase">Volver</span>
                        </Link>
                    </nav>
                </aside>

                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                        <Lock className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Acceso Restringido</h2>
                    <p className="text-gray-400 max-w-md mb-8">
                        No tienes permisos para gestionar compras.
                    </p>
                    <Link href="/">
                        <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold transition-all">
                            Volver al Inicio
                        </button>
                    </Link>
                </div>
            </div>
        );
    }
    // Queries
    const suppliers = useLiveQuery(() => db.suppliers.toArray());
    const ingredients = useLiveQuery(() => db.ingredients.toArray());
    const orders = useLiveQuery(() => db.purchaseOrders.reverse().toArray());
    const wasteLogs = useLiveQuery(() => db.wasteLogs.reverse().toArray());

    // Local State: Navigation
    const [viewMode, setViewMode] = useState<'purchases' | 'waste'>('purchases');

    // Local State: Shopping
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [catalogSearch, setCatalogSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Local State: Waste & Editing
    const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
    const [editingIngredient, setEditingIngredient] = useState<any | null>(null);

    // Derived State
    const categories = Array.from(new Set(ingredients?.map((i) => i.category).filter(Boolean) as string[]));

    const filteredCatalog = ingredients?.filter((ing) => {
        const matchesSearch = catalogSearch.trim() === "" || ing.name.toLowerCase().includes(catalogSearch.toLowerCase());
        const matchesCategory = selectedCategory ? ing.category === selectedCategory : true;
        return matchesSearch && matchesCategory;
    }) || [];

    // --- HELPERS ---
    const getSupplierName = (id: number) => suppliers?.find((s) => s.id === id)?.name || 'Desconocido';
    const getIngredientName = (id: number) => ingredients?.find((i) => i.id === id)?.name || '...';

    const getConversionMultiplier = (itemUnit: string, ingredient: { unit: string; purchaseUnit?: string; conversionFactor?: number }) => {
        if (itemUnit === ingredient.unit) return 1;
        if (itemUnit === ingredient.purchaseUnit) return ingredient.conversionFactor || 1;
        if (itemUnit === 'kg' && ingredient.unit === 'g') return 1000;
        if (itemUnit === 'g' && ingredient.unit === 'kg') return 0.001;
        if (itemUnit === 'l' && ingredient.unit === 'ml') return 1000;
        if (itemUnit === 'ml' && ingredient.unit === 'l') return 0.001;
        return 1;
    };

    // Group Cart Items by Supplier
    const cartBySupplier = cart.reduce((acc, item) => {
        if (!acc[item.supplierId]) acc[item.supplierId] = [];
        acc[item.supplierId].push(item);
        return acc;
    }, {} as Record<number, CartItem[]>);

    // --- ACTIONS ---
    const handleCreateOrders = async () => {
        if (cart.length === 0) return;
        setIsSubmitting(true);

        const supplierIds = Object.keys(cartBySupplier).map(Number);

        await db.transaction('rw', db.purchaseOrders, async () => {
            for (const supplierId of supplierIds) {
                const items = cartBySupplier[supplierId];
                // Strip the supplierId from item to match Schema
                const cleanItems: PurchaseOrderItem[] = items.map(({ supplierId, ...rest }) => rest);
                const totalCost = cleanItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

                await db.purchaseOrders.add({
                    supplierId,
                    date: new Date(),
                    status: 'Pending',
                    totalCost,
                    items: cleanItems
                });
            }
        });

        setIsDrawerOpen(false);
        setCart([]);
        setIsSubmitting(false);
        setCatalogSearch("");
    };

    const handleReceiveOrder = async (order: PurchaseOrder) => {
        if (order.status !== 'Pending') return;
        await db.transaction('rw', db.ingredients, db.purchaseOrders, async () => {
            for (const item of order.items) {
                const ingredient = await db.ingredients.get(item.ingredientId);
                if (ingredient) {
                    if (ingredient) {
                        const conversion = getConversionMultiplier(item.purchaseUnit || 'un', ingredient);
                        const netIncrease = item.quantity * conversion * (ingredient.yieldPercent || 1);
                        await db.ingredients.update(item.ingredientId, { stock: ingredient.stock + netIncrease });
                    }
                }
            }
            if (order.id) {
                await db.purchaseOrders.update(order.id, { status: 'Received' });
            }
        });
    };

    const addToCart = (ingredient: any, qty: number, unit: string, supplierId: number) => {
        setCart([...cart, {
            ingredientId: ingredient.id,
            quantity: qty,
            purchaseUnit: unit,
            unitCost: ingredient.cost,
            supplierId: supplierId
        }]);
    };

    const handleReportWaste = async (ingredientId: number, qty: number, unit: string, reason: string, note: string) => {
        const ingredient = await db.ingredients.get(ingredientId);
        if (!ingredient) return;

        const conversion = getConversionMultiplier(unit, ingredient);
        const stockDeduction = qty * conversion;

        await db.transaction('rw', db.ingredients, db.wasteLogs, async () => {
            await db.wasteLogs.add({
                ingredientId,
                quantity: qty, // Store the raw quantity
                reason: reason as any,
                date: new Date(),
                note: `${note} (${unit})` // Append unit to note for record
            });
            await db.ingredients.update(ingredientId, { stock: ingredient.stock - stockDeduction });
        });
        setIsWasteModalOpen(false);
    };

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">

            {/* SIDEBAR */}
            <aside className="w-[90px] bg-toast-charcoal-dark flex flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                <div className="mb-10 scale-110">
                    <div className="w-12 h-12 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <UtensilsCrossed className="text-white w-7 h-7" />
                    </div>
                </div>
                <nav className="flex flex-col gap-2 w-full px-2">
                    <Link href="/" className="flex flex-col items-center justify-center w-full py-3 rounded-xl transition-all duration-200 group text-gray-400 hover:text-white hover:bg-white/5">
                        <ArrowLeft className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-bold uppercase">Volver</span>
                    </Link>
                </nav>
            </aside>

            {/* MAIN CONTENT DASHBOARD */}
            <main className="flex-1 flex flex-col h-full bg-[#2a2a2a] overflow-hidden relative">
                <Header title="Gestión de Compras">

                    <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full justify-center">
                        {/* VIEW MODE TOGGLES (Moved from Title area) */}
                        <div className="flex gap-4 items-center bg-black/20 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('purchases')}
                                className={`text-sm font-bold tracking-tight flex items-center gap-2 transition-colors px-3 py-1.5 rounded-md ${viewMode === 'purchases' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <ShoppingCart className={`w-4 h-4 ${viewMode === 'purchases' ? "text-toast-orange" : ""}`} />
                                Compras
                            </button>
                            <div className="h-4 w-px bg-white/10"></div>
                            <button
                                onClick={() => setViewMode('waste')}
                                className={`text-sm font-bold tracking-tight flex items-center gap-2 transition-colors px-3 py-1.5 rounded-md ${viewMode === 'waste' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Trash2 className={`w-4 h-4 ${viewMode === 'waste' ? "text-red-500" : ""}`} />
                                Mermas
                            </button>
                        </div>

                        {/* ACTIONS */}
                        {viewMode === 'purchases' ? (
                            <div className="flex gap-2">
                                <button onClick={() => setIsDrawerOpen(true)} className="bg-toast-orange hover:brightness-110 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 group h-9 text-sm">
                                    <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                                    {cart.length > 0 ? `Ver Carrito (${cart.length})` : 'Nueva Compra'}
                                </button>
                                <Link href="/purchases/scan" className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 h-9 text-sm">
                                    <Sparkles className="w-4 h-4" /> Escanear (AI)
                                </Link>
                            </div>
                        ) : (
                            <button onClick={() => setIsWasteModalOpen(true)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 h-9 text-sm">
                                <Plus className="w-4 h-4" /> Reportar Merma
                            </button>
                        )}
                    </div>
                </Header>

                <div className="flex-1 p-8 overflow-y-auto">
                    {/* --- VIEW: PURCHASES --- */}
                    {viewMode === 'purchases' && (
                        <>
                            {orders?.length === 0 ? (
                                <div className="text-gray-400 text-center mt-20">
                                    <Store className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p className="text-lg">Tu panel de compras está limpio.</p>
                                    <p className="text-sm">Usa el botón "Nueva Compra" para abrir el catálogo.</p>
                                </div>
                            ) : (
                                <div className="mt-4 space-y-4">
                                    <h2 className="font-bold text-xl text-gray-400 uppercase text-xs tracking-wider mb-6">Historial de Órdenes</h2>
                                    {orders?.map((order: any) => (
                                        <div key={order.id} className="bg-white/5 p-4 rounded-lg flex justify-between items-center group hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white 
                                                    ${order.status === 'Received' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                                    {order.status === 'Received' ? <Check className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-toast-orange text-lg">{getSupplierName(order.supplierId)}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {format(order.date, "d MMM, HH:mm", { locale: es })} • {order.items.map((i: any) => `${i.quantity} ${i.purchaseUnit || 'un'} ${getIngredientName(i.ingredientId)}`).join(', ')} • ${order.totalCost.toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            {order.status === 'Pending' ? (
                                                <button
                                                    onClick={() => handleReceiveOrder(order)}
                                                    className="bg-toast-green hover:bg-green-600 text-white px-4 py-2 rounded font-bold text-sm shadow-lg flex items-center gap-2 animate-pulse"
                                                >
                                                    <Check className="w-4 h-4" /> Recibir
                                                </button>
                                            ) : (
                                                <span className="text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                                                    RECIBIDO
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* --- VIEW: WASTE --- */}
                    {viewMode === 'waste' && (
                        <div className="mt-4 space-y-4">
                            {wasteLogs?.length === 0 ? (
                                <div className="text-gray-400 text-center mt-20">
                                    <Trash2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p className="text-lg">No hay mermas registradas.</p>
                                    <p className="text-sm">¡Excelente control de inventario!</p>
                                </div>
                            ) : (
                                <>
                                    <h2 className="font-bold text-xl text-gray-400 uppercase text-xs tracking-wider mb-6">Historial de Pérdidas</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {wasteLogs?.map((log: any) => (
                                            <div key={log.id} className="bg-red-500/5 border border-red-500/10 p-4 rounded-xl flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold text-white text-lg">{getIngredientName(log.ingredientId)}</p>
                                                    <p className="text-red-400 font-bold text-sm bg-red-500/10 inline-block px-2 py-0.5 rounded mt-1">
                                                        -{log.quantity} en stock
                                                    </p>
                                                    <p className="text-gray-500 text-xs mt-2 italic">"{log.note || 'Sin nota'}"</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs font-bold text-gray-400 block mb-1">{format(log.date, "d MMM", { locale: es })}</span>
                                                    <span className="text-xs text-red-500 border border-red-500/30 px-2 py-1 rounded bg-red-500/10 uppercase font-bold">
                                                        {log.reason === 'Mistake' ? 'Error' : log.reason}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* --- DRAWER (CATALOG) --- */}
            {
                isDrawerOpen && (
                    <>
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity" onClick={() => setIsDrawerOpen(false)} />
                        <div className="absolute top-0 right-0 bottom-0 w-[500px] bg-toast-charcoal shadow-2xl z-50 border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-300">
                            <div className="h-20 flex items-center justify-between px-6 border-b border-white/5 bg-toast-charcoal-dark">
                                <h2 className="text-xl font-bold text-white flex gap-2 items-center"><Search className="text-toast-orange" /> Catálogo Maestro</h2>
                                <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
                            </div>

                            <div className="p-4 border-b border-white/5 bg-[#252525]">
                                <input type="text" placeholder="Buscar..." className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-toast-orange" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} autoFocus />

                                {/* Categories */}
                                <div className="flex gap-2 overflow-x-auto pb-2 mt-4 no-scrollbar">
                                    <button onClick={() => setSelectedCategory(null)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${!selectedCategory ? 'bg-toast-orange text-white border-toast-orange' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'}`}>Todos</button>
                                    {categories.map(cat => (
                                        <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${selectedCategory === cat ? 'bg-toast-orange text-white border-toast-orange' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'}`}>{cat}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {filteredCatalog.length === 0 && <p className="text-gray-500 text-center py-4">No se encontraron productos.</p>}
                                {filteredCatalog.map(ing => (
                                    <div key={ing.id} className='relative group'>
                                        <IngredientCard ingredient={ing} suppliers={suppliers || []} onAdd={addToCart} />
                                        {/* Edit Button overlay */}
                                        <button onClick={() => setEditingIngredient(ing)} className="absolute top-2 right-2 text-gray-500 hover:text-white hover:bg-black/50 p-1 rounded transition-colors opacity-0 group-hover:opacity-100">
                                            <Settings className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Footer Cart Summary */}
                            <div className="bg-[#1a1a1a] border-t border-white/10 p-4">
                                <div className="flex justify-between items-end mb-4">
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase font-bold">Resumen del Carrito</p>
                                        <p className="text-sm text-gray-300">
                                            {Object.entries(cart.reduce((acc, item) => {
                                                const unit = item.purchaseUnit || 'un';
                                                acc[unit] = (acc[unit] || 0) + item.quantity;
                                                return acc;
                                            }, {} as Record<string, number>)).map(([unit, qty]) => `${qty} ${unit}`).join(', ')}
                                            <span className="opacity-50 mx-1">•</span>
                                            {Object.keys(cartBySupplier).length} Prov.
                                        </p>
                                    </div>
                                    <div className="text-right"><p className="text-xs text-toast-orange font-bold uppercase">Total Estimado</p><p className="text-2xl font-bold text-white">${cart.reduce((a, b) => a + (b.quantity * b.unitCost), 0).toLocaleString()}</p></div>
                                </div>
                                <button onClick={handleCreateOrders} disabled={cart.length === 0 || isSubmitting} className="w-full bg-toast-orange text-white font-bold py-4 rounded-xl disabled:opacity-50">
                                    {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : `Generar Orden`}
                                </button>
                            </div>
                        </div>
                    </>
                )
            }

            {/* --- MODAL: WASTE REPORT --- */}
            {
                isWasteModalOpen && (
                    <WasteModal
                        ingredients={ingredients || []}
                        onClose={() => setIsWasteModalOpen(false)}
                        onSave={handleReportWaste}
                    />
                )
            }

            {/* --- MODAL: EDIT INGREDIENT (YIELD) --- */}
            {
                editingIngredient && (
                    <EditIngredientModal
                        ingredient={editingIngredient}
                        onClose={() => setEditingIngredient(null)}
                    />
                )
            }
        </div>
    );
}

// --- SUB-COMPONENTS ---

function IngredientCard({ ingredient, suppliers, onAdd }: { ingredient: any, suppliers: any[], onAdd: any }) {
    const [qty, setQty] = useState(1);
    const [unit, setUnit] = useState(ingredient.purchaseUnit || 'un');
    const [supplierId, setSupplierId] = useState<number | null>(null);
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState("");

    const suggestedSuppliers = suppliers.sort((a, b) => {
        if (a.category === ingredient.category) return -1;
        return 1;
    });

    const handleAdd = () => {
        if (!supplierId && suggestedSuppliers.length > 0 && !isCreatingSupplier) {
            onAdd(ingredient, qty, unit, suggestedSuppliers[0].id);
        } else if (supplierId) {
            onAdd(ingredient, qty, unit, supplierId);
        } else {
            alert("Selecciona un proveedor");
            return;
        }
        setQty(1);
    };

    const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (e.target.value === "NEW") {
            setIsCreatingSupplier(true);
            setSupplierId(null);
        } else {
            setSupplierId(parseInt(e.target.value));
        }
    };

    const saveNewSupplier = async () => {
        if (!newSupplierName.trim()) {
            setIsCreatingSupplier(false);
            return;
        }
        const id = await db.suppliers.add({
            name: newSupplierName,
            category: ingredient.category || 'General',
            contactName: '',
            email: '',
            phone: '',
            leadTimeDays: 1
        });
        setSupplierId(id as number);
        setIsCreatingSupplier(false);
        setNewSupplierName("");
    };

    return (
        <div className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors group">
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h4 className="font-bold text-white text-sm">{ingredient.name}</h4>
                    <span className="text-[10px] text-gray-500 bg-black/20 px-1.5 py-0.5 rounded">{ingredient.category || 'General'}</span>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-400">Stock: {ingredient.stock} {ingredient.unit}</p>
                </div>
            </div>
            <div className="flex gap-2 items-center mt-2">
                <input type="number" value={qty} onChange={e => setQty(parseFloat(e.target.value))} className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-toast-orange outline-none" placeholder="Cant" />
                <select value={unit} onChange={e => setUnit(e.target.value)} className="w-20 bg-black/40 border border-white/10 rounded px-1 py-1 text-xs text-white outline-none">
                    <option value="kg">kg</option><option value="un">un</option><option value="l">l</option><option value="ml">ml</option><option value="g">g</option>
                </select>
                {isCreatingSupplier ? (
                    <input type="text" autoFocus placeholder="Nombre..." className="flex-1 bg-black/40 border border-toast-orange rounded px-2 py-1 text-xs text-white outline-none" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} onBlur={saveNewSupplier} onKeyDown={(e) => { if (e.key === 'Enter') saveNewSupplier(); if (e.key === 'Escape') setIsCreatingSupplier(false); }} />
                ) : (
                    <select className="flex-1 bg-black/40 border border-white/10 rounded px-1 py-1 text-xs text-white outline-none max-w-[120px]" onChange={handleSupplierChange} value={supplierId || ""}>
                        <option value="" disabled>Proveedores...</option>
                        {suggestedSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        <option value="NEW" className="font-bold bg-toast-orange text-white text-center">+ Nuevo...</option>
                    </select>
                )}
                <button onClick={handleAdd} className="bg-white/10 hover:bg-toast-orange text-white p-1.5 rounded transition-colors"><Plus className="w-4 h-4" /></button>
            </div>
        </div>
    )
}

function EditIngredientModal({ ingredient, onClose }: { ingredient: any, onClose: any }) {
    const [purchaseUnit, setPurchaseUnit] = useState(ingredient.purchaseUnit || 'kg');
    const [conversion, setConversion] = useState(ingredient.conversionFactor || 1);
    const [yieldPct, setYieldPct] = useState(ingredient.yieldPercent || 1);

    const handleSave = async () => {
        await db.ingredients.update(ingredient.id, {
            purchaseUnit,
            conversionFactor: parseFloat(conversion as any),
            yieldPercent: parseFloat(yieldPct as any)
        });
        onClose();
    };

    const handleDelete = async () => {
        await db.ingredients.delete(ingredient.id);
        onClose();
    };

    return (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-toast-charcoal border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between items-start mb-1">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Settings className="text-toast-orange" /> Configurar {ingredient.name}
                    </h3>
                    <button onClick={handleDelete} className="text-gray-500 hover:text-red-500 transition-colors p-1" title="Eliminar Producto">
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-sm text-gray-400 mb-4 border-b border-white/5 pb-4">Ajustes de costo y rendimiento.</p>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-gray-400 uppercase font-bold">Unidad de Compra</label>
                        <div className="flex gap-2 mt-1">
                            <input type="text" className="flex-1 bg-black/30 border border-white/10 rounded p-2 text-white text-sm" value={purchaseUnit} onChange={e => setPurchaseUnit(e.target.value)} />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">Ej: 'kg', 'bolsa', 'pack'</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold">Factor Conv.</label>
                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded p-2 text-white mt-1 text-sm font-mono" value={conversion} onChange={e => setConversion(e.target.value)} />
                            <p className="text-[10px] text-gray-500 mt-1">1 {purchaseUnit} = X {ingredient.unit}</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold">Rendimiento (%)</label>
                            <input type="number" step="0.1" max="1" className="w-full bg-black/30 border border-white/10 rounded p-2 text-white mt-1 text-sm font-mono" value={yieldPct} onChange={e => setYieldPct(e.target.value)} />
                            <p className="text-[10px] text-gray-500 mt-1">1.0 = 100%</p>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <button onClick={onClose} className="flex-1 text-gray-400 hover:text-white text-xs font-bold">Cancelar</button>
                        <button onClick={handleSave} className="flex-1 bg-toast-orange hover:brightness-110 text-white font-bold py-2 rounded shadow-lg text-sm">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
