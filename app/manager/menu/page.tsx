'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Category, Product, ModifierTemplate } from '@/lib/db';
import { ArrowLeft, Plus, Trash2, Edit, Save, X, Package, LayoutGrid, Tag, Layers } from 'lucide-react';
import Link from 'next/link';
import { usePermission } from '@/hooks/usePermission';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MenuManagerPage() {
    const hasAccess = usePermission('menu:manage');
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<'categories' | 'products' | 'modifiers'>('categories');

    if (hasAccess === false) {
        return (
            <div className="flex h-screen w-full bg-[#2a2a2a] text-white font-sans items-center justify-center">
                <div className="flex flex-col items-center gap-4 p-8 bg-white/5 rounded-2xl border border-white/10 max-w-sm text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                        <Lock className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-1">Acceso Restringido</h2>
                        <p className="text-sm text-gray-400">No tienes permisos para gestionar el menú.</p>
                    </div>
                    <Link href="/tables">
                        <button className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors">
                            Volver
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-[#2a2a2a] text-white font-sans">
            {/* SIDEBAR */}
            <aside className="w-[200px] bg-toast-charcoal-dark flex flex-col py-6 border-r border-white/5">
                <div className="px-6 mb-8">
                    <Link href="/tables" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-bold uppercase mb-6">
                        <ArrowLeft className="w-4 h-4" /> Volver a Mesas
                    </Link>
                    <h1 className="text-xl font-bold leading-tight">Gestión<br />de Menú</h1>
                </div>

                <nav className="flex flex-col gap-1 px-2">
                    <NavButton
                        active={activeTab === 'categories'}
                        onClick={() => setActiveTab('categories')}
                        icon={<LayoutGrid className="w-4 h-4" />}
                        label="Categorías"
                    />
                    <NavButton
                        active={activeTab === 'products'}
                        onClick={() => setActiveTab('products')}
                        icon={<Tag className="w-4 h-4" />}
                        label="Productos"
                    />
                    <NavButton
                        active={activeTab === 'modifiers'}
                        onClick={() => setActiveTab('modifiers')}
                        icon={<Layers className="w-4 h-4" />}
                        label="Modificadores"
                        badge="Prox"
                    />
                </nav>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 overflow-y-auto p-8">
                {activeTab === 'categories' && <CategoriesView />}
                {activeTab === 'products' && <ProductsView />}
                {activeTab === 'modifiers' && <ModifiersView />}
            </main>
        </div>
    );
}

function NavButton({ active, onClick, icon, label, badge }: any) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${active ? 'bg-toast-orange text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            {icon}
            <span className="font-medium text-sm flex-1">{label}</span>
            {badge && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase">{badge}</span>}
        </button>
    )
}

// --- SUB-VIEWS ---


import { useAutoSync } from '@/components/providers/AutoSyncProvider';

function CategoriesView() {
    // AutoSync
    const { triggerChange } = useAutoSync();

    // FIX: Fetch ALL and sort in memory to handle items without 'order'
    const categories = useLiveQuery(async () => {
        const cats = await db.categories.toArray();
        return cats.sort((a, b) => (a.order || 999) - (b.order || 999));
    });

    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editDest, setEditDest] = useState<'kitchen' | 'bar'>('kitchen');

    // Create Mode
    const [newCatName, setNewCatName] = useState("");
    const [newCatDest, setNewCatDest] = useState<'kitchen' | 'bar'>('kitchen'); // Destination Selector

    // Drag State
    const [draggedId, setDraggedId] = useState<number | null>(null);

    const handleAdd = async () => {
        if (!newCatName.trim()) return;
        try {
            // Get max order safely to append at end
            const lastCat = await db.categories.orderBy('order').last();
            const nextOrder = (lastCat?.order || 0) + 1;

            await db.categories.add({
                name: newCatName.trim(),
                destination: newCatDest,
                order: nextOrder
            });
            setNewCatName("");
            triggerChange(); // Auto-Sync
        } catch (error) {
            console.error("Error adding category:", error);
        }
    };

    const handleUpdate = async (id: number) => {
        if (!editName.trim()) return;
        await db.categories.update(id, {
            name: editName.trim(),
            destination: editDest
        });
        setIsEditing(null);
        triggerChange(); // Auto-Sync
    };

    const handleDelete = async (id: number) => {
        if (confirm("¿Seguro que quieres borrar esta categoría? Los productos quedarán huérfanos.")) {
            await db.categories.delete(id);
            triggerChange(); // Auto-Sync
        }
    };

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image usually automatic
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetId: number) => {
        e.preventDefault();
        if (draggedId === null || draggedId === targetId || !categories) return;

        // Reorder Logic
        const currentIndex = categories.findIndex(c => c.id === draggedId);
        const targetIndex = categories.findIndex(c => c.id === targetId);

        if (currentIndex === -1 || targetIndex === -1) return;

        const newItems = [...categories];
        const [movedItem] = newItems.splice(currentIndex, 1);
        newItems.splice(targetIndex, 0, movedItem);

        // Update DB with strict sequential ordering
        // This fixes the "jumping" behavior by forcing a clean 0, 1, 2, 3... order
        await db.transaction('rw', db.categories, async () => {
            for (let i = 0; i < newItems.length; i++) {
                // Always update order to match visual index
                await db.categories.update(newItems[i].id!, { order: i });
            }
        });

        setDraggedId(null);
        triggerChange(); // Auto-Sync
    };

    if (categories === undefined) {
        return (
            <div className="max-w-2xl mx-auto text-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-toast-orange border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-400">Cargando base de datos...</p>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                    <LayoutGrid className="text-toast-orange" /> Categorías
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={async (e) => {
                            if (!confirm("⚠️ ¿Detectar y fusionar categorías duplicadas? (Ej: 'Bebidas' repetido 3 veces)")) return;

                            const btn = e.currentTarget;
                            const originalText = btn.innerText;
                            btn.innerText = "⏳ Procesando...";
                            btn.disabled = true;

                            try {
                                const allCats = await db.categories.toArray();
                                const groups = new Map<string, Category[]>();

                                // 1. Group by normalized name
                                for (const c of allCats) {
                                    const key = c.name.trim().toLowerCase();
                                    if (!groups.has(key)) groups.set(key, []);
                                    groups.get(key)!.push(c);
                                }

                                // SPECIAL CASE: Merge "Bebidas" into "Bebidas y Jugos" if requested
                                const bebidas = groups.get('bebidas');
                                const bebidasYJugos = groups.get('bebidas y jugos');

                                if (bebidas && bebidasYJugos) {
                                    // Move all from 'bebidas' to the first 'bebidas y jugos'
                                    const target = bebidasYJugos[0];
                                    for (const b of bebidas) {
                                        const products = await db.products.where('categoryId').equals(b.id!).toArray();
                                        for (const p of products) {
                                            await db.products.update(p.id!, { categoryId: target.id });
                                        }
                                        await db.categories.delete(b.id!);
                                    }
                                    groups.delete('bebidas'); // Done
                                    alert("✅ Se fusionaron todas las 'Bebidas' en 'Bebidas y Jugos'");
                                }

                                let mergedCount = 0;
                                let productsUpdated = 0;

                                // 2. Process Groups (Standard Dedupe)
                                await db.transaction('rw', db.categories, db.products, async () => {
                                    for (const [name, list] of groups.entries()) {
                                        if (list.length > 1) {
                                            // Sort to keep the "best" one (lowest ID usually)
                                            list.sort((a, b) => (a.id || 999999) - (b.id || 999999));

                                            const winner = list[0];
                                            const losers = list.slice(1);

                                            for (const loser of losers) {
                                                // Repoint products
                                                const affectedProducts = await db.products.where('categoryId').equals(loser.id!).toArray();
                                                for (const p of affectedProducts) {
                                                    await db.products.update(p.id!, { categoryId: winner.id });
                                                    productsUpdated++;
                                                }
                                                // Kill the clone
                                                await db.categories.delete(loser.id!);
                                                mergedCount++;
                                            }
                                        }
                                    }
                                });

                                // 3. Sync Logic 
                                if (mergedCount > 0) {
                                    const { syncService } = await import('@/lib/sync_service');
                                    await syncService.pushAll();

                                    alert(`✅ Limpieza Completa:\n- Fusionadas: ${mergedCount} categorías\n- Productos movidos: ${productsUpdated}`);
                                } else {
                                    alert("👍 No se encontraron otros duplicados.");
                                }

                            } catch (err) {
                                console.error(err);
                                alert("❌ Error al procesar");
                            }

                            btn.innerText = originalText;
                            btn.disabled = false;
                        }}
                        className="bg-toast-orange/10 hover:bg-toast-orange/20 text-toast-orange px-3 py-2 rounded-lg font-bold text-xs border border-toast-orange/20 transition-all">
                        ⚡ Consolidar Duplicados
                    </button>

                    {/* Basic Restore Button - Removed "Bebidas" to prevent re-creation */}
                    <button
                        onClick={async (e) => {
                            const btn = e.currentTarget;
                            btn.innerText = "⏳ ...";
                            try {
                                // REMOVE 'Bebidas' from this list to avoid re-creating it
                                const needed = ["Entradas", "Platos", "Caracter", "Postres", "Bebidas y Jugos", "Copete", "Cafe"];
                                const existing = await db.categories.toArray();
                                const existingNames = new Set(existing.map(c => c.name.toLowerCase().trim()));
                                let maxOrder = existing.reduce((max, c) => Math.max(max, c.order || 0), 0);
                                let added = 0;

                                for (const name of needed) {
                                    if (!existingNames.has(name.toLowerCase())) {
                                        maxOrder++;
                                        const dest = (name.includes("Bebidas") || name === "Copete" || name === "Cafe") ? 'bar' : 'kitchen';
                                        await db.categories.add({
                                            name, destination: dest, order: maxOrder
                                        });
                                        added++;
                                    }
                                }
                                if (added > 0) {
                                    const { syncService } = await import('@/lib/sync_service');
                                    await syncService.pushAll();
                                    alert(`✅ Restauradas ${added} categorías básicas`);
                                } else {
                                    alert("👍 Categorías básicas OK");
                                }
                            } catch (e) { console.error(e); }
                            btn.innerText = "🔄 Restaurar";
                        }}
                        className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg font-bold text-xs border border-blue-500/20 transition-all">
                        🔄 Básicos
                    </button>
                </div>
            </div>

            {/* ADD NEW + DESTINATION SELECTOR */}
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 mb-6 flex flex-col md:flex-row gap-3">
                <div className="flex-1 flex gap-2">
                    <input
                        type="text"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        placeholder="Nueva Categoría (ej. Entradas)"
                        className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-toast-orange"
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </div>

                {/* DESTINATION TOGGLE */}
                <div className="flex bg-black/30 p-1 rounded-lg shrink-0 h-[42px] self-start">
                    <button
                        onClick={() => setNewCatDest('kitchen')}
                        className={`px-4 rounded-md text-sm font-bold transition-all ${newCatDest === 'kitchen' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Cocina
                    </button>
                    <button
                        onClick={() => setNewCatDest('bar')}
                        className={`px-4 rounded-md text-sm font-bold transition-all ${newCatDest === 'bar' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Bar
                    </button>
                </div>

                <button onClick={handleAdd} className="bg-toast-orange hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2 h-[42px]">
                    <Plus className="w-4 h-4" /> Agregar
                </button>
            </div>

            {/* LIST */}
            <div className="flex flex-col gap-3">
                {categories.map((cat: Category) => (
                    <div
                        key={cat.id}
                        draggable={isEditing !== cat.id}
                        onDragStart={(e) => handleDragStart(e, cat.id!)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, cat.id!)}
                        className={`
                            bg-white/5 p-4 rounded-xl border flex items-center justify-between group transition-all
                            ${draggedId === cat.id ? 'opacity-50 border-toast-orange border-dashed' : 'border-white/5 hover:border-white/20'}
                        `}
                    >
                        {isEditing === cat.id ? (
                            <div className="flex-1 flex flex-col md:flex-row gap-2 mr-4 items-center">
                                <input
                                    autoFocus
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="flex-1 bg-black/40 border border-toast-orange rounded px-2 py-2 text-white w-full"
                                />
                                {/* EDIT DESTINATION TOGGLE */}
                                <div className="flex bg-black/30 p-1 rounded-lg">
                                    <button
                                        onClick={() => setEditDest('kitchen')}
                                        className={`px-3 py-1 rounded text-xs font-bold ${editDest === 'kitchen' ? 'bg-white text-black' : 'text-gray-500'}`}
                                    >COC</button>
                                    <button
                                        onClick={() => setEditDest('bar')}
                                        className={`px-3 py-1 rounded text-xs font-bold ${editDest === 'bar' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}
                                    >BAR</button>
                                </div>

                                <div className="flex gap-2">
                                    <button onClick={() => handleUpdate(cat.id!)} className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded"><Save className="w-4 h-4" /></button>
                                    <button onClick={() => setIsEditing(null)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded"><X className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 flex-1 cursor-grab active:cursor-grabbing">
                                {/* Drag Handle */}
                                <div className="text-gray-600 hover:text-white cursor-move p-1">
                                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                                </div>
                                <span className="font-bold text-lg">{cat.name}</span>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ml-2 ${cat.destination === 'bar'
                                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/20'
                                    : 'bg-orange-500/10 text-orange-400 border-orange-500/10'
                                    }`}>
                                    {cat.destination === 'bar' ? 'BAR' : 'COCINA'}
                                </span>
                            </div>
                        )}

                        {isEditing !== cat.id && (
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => {
                                        setIsEditing(cat.id!);
                                        setEditName(cat.name);
                                        setEditDest(cat.destination || 'kitchen');
                                    }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-blue-400"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(cat.id!)}
                                    className="p-2 hover:bg-red-500/10 rounded-lg text-red-500"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {categories.length === 0 && (
                    <div className="text-center py-10 text-gray-500 border border-dashed border-white/10 rounded-xl">
                        No hay categorías creadas.
                    </div>
                )}
            </div>
        </div>
    )
}


function ProductsView() {
    const categories = useLiveQuery(() => db.categories.toArray());
    const templates = useLiveQuery(() => db.modifierTemplates.toArray());
    const [selectedCat, setSelectedCat] = useState<number | 'all'>('all');

    // UI State
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', price: 0, categoryId: 0, image: '', isAvailable: true, modifiers: []
    });

    const resetForm = () => {
        setFormData({ name: '', price: 0, categoryId: categories?.[0]?.id || 0, image: '', isAvailable: true, modifiers: [] });
        setEditingProduct(null);
    };

    const generateDemoBurgers = async () => {
        try {
            // 1. Ensure Category
            let catId = categories?.find(c => c.name.toLowerCase().includes("hamb"))?.id;
            if (!catId) {
                catId = await db.categories.add({
                    name: "Hamburguesas",
                    destination: 'kitchen',
                    order: (categories?.length || 0) + 1
                }) as number;
            }

            // 2. Ensure Modifiers (Upsert logic to ensure new options exist)
            const puntoOptions = [
                { id: crypto.randomUUID(), name: "A la Inglesa", price: 0 },
                { id: crypto.randomUUID(), name: "A Punto", price: 0 },
                { id: crypto.randomUUID(), name: "3/4", price: 0 },
                { id: crypto.randomUUID(), name: "Bien Cocida", price: 0 }
            ];

            let puntoId = templates?.find(t => t.name.includes("Punto"))?.id;
            if (puntoId) {
                // Update existing to have new options
                await db.modifierTemplates.update(puntoId, { options: puntoOptions });
            } else {
                puntoId = await db.modifierTemplates.add({
                    name: "Punto de Carne",
                    minSelect: 1,
                    maxSelect: 1,
                    options: puntoOptions
                }) as number;
            }

            const extraOptions = [
                { id: crypto.randomUUID(), name: "Bacon Extra", price: 1000 },
                { id: crypto.randomUUID(), name: "Queso Cheddar", price: 1000 },
                { id: crypto.randomUUID(), name: "Huevo Frito", price: 800 },
                { id: crypto.randomUUID(), name: "Pepinillos", price: 500 },
                { id: crypto.randomUUID(), name: "Palta", price: 1200 },
                { id: crypto.randomUUID(), name: "Tomate", price: 500 },
                { id: crypto.randomUUID(), name: "Cebolla Caramelizada", price: 800 },
                { id: crypto.randomUUID(), name: "Jalapeños", price: 600 }
            ];

            let extraId = templates?.find(t => t.name.includes("Agregados"))?.id;
            if (extraId) {
                await db.modifierTemplates.update(extraId, { options: extraOptions });
            } else {
                extraId = await db.modifierTemplates.add({
                    name: "Agregados Premium",
                    minSelect: 0,
                    maxSelect: 8,
                    options: extraOptions
                }) as number;
            }

            // Fetch full templates to attach
            const puntoTpl = await db.modifierTemplates.get(puntoId!);
            const extraTpl = await db.modifierTemplates.get(extraId!);

            // Use fresh IDs for the link to avoid conflicts if previously linked to other products
            const modifiers = [
                { ...puntoTpl!, id: crypto.randomUUID() },
                { ...extraTpl!, id: crypto.randomUUID() }
            ];

            // 3. Create Products
            const burgers = [
                { name: "Hamburguesa Clásica", price: 8990 },
                { name: "Cheese Burger", price: 9990 },
                { name: "Bacon Delight", price: 11990 },
                { name: "Royal Burger", price: 12500 }
            ];

            for (const b of burgers) {
                // Check if already exists to avoid spamming
                const exists = await db.products.where('name').equals(b.name).first();
                if (!exists) {
                    await db.products.add({
                        ...b,
                        categoryId: catId!,
                        image: "",
                        isAvailable: true,
                        modifiers: modifiers
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const openNew = () => {
        resetForm();
        // Default to first category if none selected or 'all' selected
        const defaultCat = (selectedCat !== 'all' ? selectedCat : categories?.[0]?.id) || 0;
        setFormData(prev => ({ ...prev, categoryId: defaultCat }));
        setIsModalOpen(true);
    };

    const openEdit = (prod: Product) => {
        setEditingProduct(prod);
        setFormData({ ...prod });
        setIsModalOpen(true);
    };

    const { triggerChange } = useAutoSync(); // Hook for auto-save

    const handleSave = async () => {
        if (!formData.name || !formData.price || !formData.categoryId) return alert("Nombre, precio y categoría son obligatorios");
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name,
                price: Number(formData.price),
                categoryId: Number(formData.categoryId),
                image: formData.image,
                isAvailable: formData.isAvailable,
                modifiers: formData.modifiers // Save attached modifiers
            };

            if (editingProduct?.id) {
                await db.products.update(editingProduct.id, payload);
            } else {
                await db.products.add(payload as Product);
            }
            triggerChange(); // 🚀 TRIGGER AUTO-SYNC
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving product:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("¿Borrar producto?")) {
            await db.products.delete(id);
            triggerChange(); // 🚀 TRIGGER AUTO-SYNC
        }
    };

    // Filtered Products
    const products = useLiveQuery(async () => {
        if (selectedCat === 'all') return db.products.toArray();
        return db.products.where('categoryId').equals(selectedCat).toArray();
    }, [selectedCat]);

    const toggleModifier = (tpl: ModifierTemplate) => {
        setFormData(prev => {
            const current = prev.modifiers || [];
            const exists = current.find(m => m.name === tpl.name); // Simple match by name/structure

            if (exists) {
                return { ...prev, modifiers: current.filter(m => m.name !== tpl.name) };
            } else {
                // Clone template to product modifier group
                return {
                    ...prev,
                    modifiers: [...current, {
                        id: crypto.randomUUID(), // New ID for instance
                        name: tpl.name,
                        minSelect: tpl.minSelect,
                        maxSelect: tpl.maxSelect,
                        options: tpl.options
                    }]
                };
            }
        });
    };

    return (
        <div className="max-w-4xl mx-auto relative">
            <div className="mb-6 space-y-4">
                {/* TITLE ROW with Action */}
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        <Tag className="text-toast-orange" /> Productos
                    </h2>

                    <button
                        onClick={openNew}
                        className="bg-toast-orange hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-orange-500/20 transition-all text-sm">
                        <Plus className="w-4 h-4" /> Nuevo Producto
                    </button>
                </div>

                {/* FILTER TABS ROW */}
                <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSelectedCat('all')}
                            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${selectedCat === 'all'
                                ? 'bg-white text-black border-white'
                                : 'text-gray-400 border-white/10 hover:border-white/30'
                                }`}
                        >
                            Todos
                        </button>
                        {categories?.map((cat: Category) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCat(cat.id!)}
                                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${selectedCat === cat.id
                                    ? 'bg-toast-orange text-white border-toast-orange'
                                    : 'text-gray-400 border-white/10 hover:border-white/30'
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                {products?.map(prod => (
                    <div key={prod.id} className="bg-white/5 rounded-xl border border-white/5 p-4 flex gap-4 hover:border-white/20 transition-all group relative overflow-hidden">
                        {/* Image or Placeholder */}
                        <div className="w-16 h-16 rounded-lg bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                            {prod.image ? (
                                <img src={prod.image} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-2xl">🍽️</span>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-white truncate">{prod.name}</h4>
                            <p className="text-toast-orange font-mono">${prod.price.toLocaleString()}</p>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => openEdit(prod)} className="text-xs text-gray-400 hover:text-white underline">Editar</button>
                                <button onClick={(e) => handleDelete(e, prod.id!)} className="text-xs text-red-400 hover:text-red-300 underline">Eliminar</button>
                            </div>
                        </div>
                    </div>
                ))}
                {products?.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 border border-dashed border-white/10 rounded-xl">
                        No hay productos en esta categoría.
                    </div>
                )}
            </div>

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                {editingProduct ? <Edit className="w-5 h-5 text-toast-orange" /> : <Plus className="w-5 h-5 text-toast-orange" />}
                                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Nombre</label>
                                <input
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Precio</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Categoría</label>
                                    <select
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none appearance-none"
                                        value={formData.categoryId}
                                        onChange={e => setFormData({ ...formData, categoryId: Number(e.target.value) })}
                                    >
                                        {categories?.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* MODIFIERS SECTION */}
                            <div className="border-t border-white/5 pt-4">
                                <label className="block text-xs font-bold text-gray-400 mb-3 flex items-center justify-between">
                                    <span>Modificadores (Extras)</span>
                                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded">Opcional</span>
                                </label>

                                {templates?.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">No hay grupos creados. Ve a la pestaña "Modificadores" para crear uno.</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {templates?.map(tpl => {
                                            const isActive = formData.modifiers?.some(m => m.name === tpl.name);
                                            return (
                                                <button
                                                    key={tpl.id}
                                                    onClick={() => toggleModifier(tpl)}
                                                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-all flex justify-between items-center ${isActive
                                                        ? 'bg-toast-orange/20 border-toast-orange text-white'
                                                        : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/20'
                                                        }`}
                                                >
                                                    <span className="truncate">{tpl.name}</span>
                                                    {isActive && <div className="w-2 h-2 rounded-full bg-toast-orange"></div>}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">URL Imagen (Opcional)</label>
                                <input
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:border-toast-orange outline-none"
                                    value={formData.image || ''}
                                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                                    placeholder="https://..."
                                />
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <input
                                    type="checkbox"
                                    checked={formData.isAvailable ?? true}
                                    onChange={e => setFormData({ ...formData, isAvailable: e.target.checked })}
                                    className="w-5 h-5 accent-toast-orange"
                                />
                                <span className="text-sm font-medium">Disponible (Stock)</span>
                            </div>
                        </div>

                        <div className="p-6 pt-0 flex gap-3 shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold transition-colors">Cancelar</button>
                            <button onClick={handleSave} disabled={isSubmitting} className="flex-1 bg-toast-orange hover:bg-orange-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-orange-500/20">
                                {isSubmitting ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ModifiersView() {
    const templates = useLiveQuery(() => db.modifierTemplates?.toArray());
    const [isModalOpen, setIsModalOpen] = useState(false);

    // View State
    const [editingTemplate, setEditingTemplate] = useState<ModifierTemplate | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<ModifierTemplate>>({
        name: '', minSelect: 0, maxSelect: 1, options: []
    });

    // Option Form State (Inside Modal)
    const [newOptionName, setNewOptionName] = useState("");
    const [newOptionPrice, setNewOptionPrice] = useState(0);

    const openNew = () => {
        setEditingTemplate(null);
        setFormData({ name: '', minSelect: 0, maxSelect: 1, options: [] });
        setIsModalOpen(true);
    };

    const openEdit = (tpl: ModifierTemplate) => {
        setEditingTemplate(tpl);
        setFormData({ ...tpl });
        setIsModalOpen(true);
    };

    const addOption = () => {
        if (!newOptionName.trim()) return;
        setFormData(prev => ({
            ...prev,
            options: [
                ...(prev.options || []),
                { id: crypto.randomUUID(), name: newOptionName, price: newOptionPrice }
            ]
        }));
        setNewOptionName("");
        setNewOptionPrice(0);
    };

    const removeOption = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            options: prev.options?.filter((_, i) => i !== idx)
        }));
    };

    const handleSave = async () => {
        if (!formData.name) return alert("El nombre es obligatorio");

        if (editingTemplate?.id) {
            await db.modifierTemplates.update(editingTemplate.id, formData as any);
        } else {
            await db.modifierTemplates.add(formData as ModifierTemplate);
        }
        setIsModalOpen(false);
    };

    const handleDelete = async (id: number) => {
        if (confirm("¿Borrar este grupo de modificadores?")) {
            await db.modifierTemplates.delete(id);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                        <Layers className="text-toast-orange" /> Modificadores (Sub-Productos)
                    </h2>
                    <p className="text-gray-400 text-sm">Crea grupos reutilizables como "Término de Carne" o "Agregados".</p>
                </div>

                <button
                    onClick={openNew}
                    className="bg-toast-orange hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-orange-500/20 transition-all">
                    <Plus className="w-4 h-4" /> Nuevo Grupo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates?.map(tpl => (
                    <div key={tpl.id} className="bg-white/5 rounded-xl border border-white/5 p-4 hover:border-white/20 transition-all group relative">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-white text-lg">{tpl.name}</h4>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEdit(tpl)} className="text-blue-400"><Edit className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(tpl.id!)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Min: {tpl.minSelect} | Max: {tpl.maxSelect}</p>

                        <div className="space-y-1">
                            {tpl.options.slice(0, 3).map((opt, i) => (
                                <div key={i} className="flex justify-between text-sm bg-black/20 px-2 py-1 rounded">
                                    <span>{opt.name}</span>
                                    <span className="text-gray-400">+${opt.price}</span>
                                </div>
                            ))}
                            {tpl.options.length > 3 && (
                                <p className="text-center text-xs text-gray-500 pt-1">y {tpl.options.length - 3} más...</p>
                            )}
                        </div>
                    </div>
                ))}
                {!templates?.length && (
                    <div className="col-span-full py-12 text-center text-gray-500 border border-dashed border-white/10 rounded-xl">
                        No hay grupos de modificadores creados.
                    </div>
                )}
            </div>

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                {editingTemplate ? 'Editar Grupo' : 'Nuevo Grupo'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Nombre del Grupo</label>
                                <input
                                    placeholder="Ej. Término de la Carne"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Mínimo (Obligatorio)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none"
                                        value={formData.minSelect}
                                        onChange={e => setFormData({ ...formData, minSelect: Number(e.target.value) })}
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">0 = Opcional, 1 = Requerido</p>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Máximo (Selección)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none"
                                        value={formData.maxSelect}
                                        onChange={e => setFormData({ ...formData, maxSelect: Number(e.target.value) })}
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">1 = Único, 2+ = Múltiple</p>
                                </div>
                            </div>

                            <div className="border-t border-white/5 pt-4">
                                <label className="block text-xs font-bold text-gray-400 mb-2">Opciones / Variantes</label>

                                {/* Add Option Row */}
                                <div className="flex gap-2 mb-3">
                                    <input
                                        placeholder="Nombre (ej. Bien Cocido)"
                                        className="flex-[2] bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-toast-orange outline-none"
                                        value={newOptionName}
                                        onChange={e => setNewOptionName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addOption()}
                                    />
                                    <input
                                        type="number"
                                        placeholder="$ Extra"
                                        className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-toast-orange outline-none"
                                        value={newOptionPrice}
                                        onChange={e => setNewOptionPrice(Number(e.target.value))}
                                        onKeyDown={e => e.key === 'Enter' && addOption()}
                                    />
                                    <button onClick={addOption} className="bg-white/10 hover:bg-white/20 p-2 rounded text-green-400"><Plus className="w-4 h-4" /></button>
                                </div>

                                {/* List Options */}
                                <div className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
                                    {formData.options?.map((opt, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-black/30 px-3 py-2 rounded text-sm group">
                                            <div className="flex gap-2">
                                                <span>{opt.name}</span>
                                                {opt.price > 0 && <span className="text-toast-orange">+${opt.price}</span>}
                                            </div>
                                            <button onClick={() => removeOption(idx)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {formData.options?.length === 0 && <p className="text-center text-xs text-gray-600 py-2">Agrega opciones arriba.</p>}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-0 flex gap-3 shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold transition-colors">Cancelar</button>
                            <button onClick={handleSave} className="flex-1 bg-toast-orange hover:bg-orange-500 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-orange-500/20">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
