'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Search, Settings, AlertTriangle, Plus, Filter, Trash2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

// Duplicated NavItem for independence
function NavItem({ icon, label, active = false, badge = 0, onClick }: { icon: any, label: string, active?: boolean, badge?: number, onClick?: () => void }) {
    return (
        <div
            onClick={onClick}
            className={`relative flex flex-col items-center justify-center w-full py-3 rounded-xl transition-all duration-200 group cursor-pointer
            ${active ? 'bg-gradient-to-b from-white/10 to-transparent text-toast-orange shadow-inner border border-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            <div className={`w-5 h-5 mb-1 transition-transform group-active:scale-90 ${active ? 'text-toast-orange drop-shadow-lg' : ''}`}>{icon}</div>
            <span className={`text-[9px] font-bold tracking-wider uppercase ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
            {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 bg-toast-orange rounded-r-md"></div>}
        </div>
    )
}

import { usePermission } from '@/hooks/usePermission';
import { Lock } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function InventoryPage() {
    const hasAccess = usePermission('inventory:view');
    const router = useRouter();

    const ingredients = useLiveQuery(() => db.ingredients.toArray());
    const [search, setSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState("");

    const filtered = ingredients?.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = filterCategory ? i.category === filterCategory : true;
        return matchesSearch && matchesCategory;
    }) || [];

    // Calculate unique existing sub-families for autocomplete
    const uniqueSubFamilies = Array.from(new Set(ingredients?.map(i => i.subFamily).filter(Boolean))).sort() as string[];

    const lowStockCount = ingredients?.filter(i => !i.isInfinite && i.stock <= (i.minStock || 5) && i.stock > 0).length || 0;
    const noStockCount = ingredients?.filter(i => !i.isInfinite && i.stock === 0).length || 0;

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingIngredient, setEditingIngredient] = useState<any | null>(null);

    const [isActionsOpen, setIsActionsOpen] = useState(false);

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
                            <p className="text-sm text-gray-400">No tienes permisos para ver el Inventario.</p>
                        </div>
                        <button onClick={() => router.push('/tables')} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors">
                            Volver
                        </button>
                    </div>
                </div>
            </div>
        );
    }



    const handleCleanupDuplicates = async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!ingredients) return;

        const btn = e.currentTarget;
        const originalText = btn.innerText; // Should be "Limpiar Duplicados" or derived from children

        // Use a simple loading state visual
        btn.disabled = true;

        const uniqueNames = new Set();
        const duplicates: number[] = [];

        ingredients.forEach(ing => {
            const key = ing.name.toLowerCase().trim();
            if (uniqueNames.has(key)) {
                duplicates.push(ing.id!);
            } else {
                uniqueNames.add(key);
            }
        });

        if (duplicates.length === 0) {
            // No duplicates
            // We can't easily change innerText if there are icons inside, 
            // but we can try to be safe. Or simple alert removal?
            // Let's just use a fire-and-forget console log or slight UI visual if we had state.
            // Since we want to avoid alerts, doing nothing is actually acceptable 
            // OR we can wiggle the button.
            // But let's try to be helpful.
            console.log("No duplicates found");
        } else {
            await db.ingredients.bulkDelete(duplicates);
            console.log(`Removed ${duplicates.length} duplicates`);
        }

        // Restore
        btn.disabled = false;
    };

    const handleDelete = async (id: number, name: string) => {
        await db.ingredients.delete(id);
    };

    const handleGenerateMissingCodes = async () => {
        setIsActionsOpen(false);
        if (!ingredients) return;

        let count = 0;
        const updates: Promise<any>[] = [];

        // Helper to generate SKU (duplicated to avoid dependency issues outside component)
        const generateSKU = (n: string, c: string) => {
            const catCode = (c || 'GEN').substring(0, 3).toUpperCase();
            const nameCode = (n || 'UNK').substring(0, 3).toUpperCase();
            const random = Math.floor(Math.random() * 900) + 100;
            return `${catCode}-${nameCode}-${random}`;
        };

        ingredients.forEach(item => {
            if (!item.code) {
                const newCode = generateSKU(item.name, item.category || 'General');
                updates.push(db.ingredients.update(item.id!, { code: newCode }));
                count++;
            }
        });

        await Promise.all(updates);
        alert(`Se han generado ${count} códigos nuevos.`);
    };

    const handleCleanupClick = (e: any) => {
        setIsActionsOpen(false);
        handleCleanupDuplicates(e);
    }

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">
            {/* SIDEBAR */}
            <aside className="w-[90px] bg-toast-charcoal-dark flex flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                <div className="mb-10 scale-110">
                    <div className="w-12 h-12 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Package className="text-white w-7 h-7" />
                    </div>
                </div>
                <nav className="flex flex-col gap-2 w-full px-2">
                    <NavItem icon={<ArrowLeft />} label="Volver" onClick={() => router.push('/tables')} />
                </nav>
            </aside>

            {/* CONTENT */}
            <main className="flex-1 flex flex-col h-full bg-[#2a2a2a] overflow-hidden">
                <Header title="Inventario / Stock">

                    <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 w-full">
                        {/* SEARCH & FILTER GROUP */}
                        <div className="flex items-center gap-2 bg-black/20 p-1 rounded-lg border border-white/5">
                            <select
                                className="hidden md:block bg-transparent text-sm text-white focus:outline-none appearance-none cursor-pointer px-3 py-1 font-medium hover:text-toast-orange transition-colors"
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                            >
                                <option value="">Todas las Categorías</option>
                                <option value="ABARROTES">Abarrotes</option>
                                <option value="VERDURAS">Verduras</option>
                                <option value="CARNES">Carnes</option>
                                <option value="LACTEOS">Lácteos</option>
                                <option value="BEBESTIBLES">Bebestibles</option>
                                <option value="CONGELADOS">Congelados</option>
                                <option value="LIMPIEZA">Limpieza</option>
                                <option value="OTROS">Otros</option>
                            </select>
                            <div className="w-px h-4 bg-white/10 hidden md:block"></div>
                            <div className="relative flex-1 md:flex-none">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 w-3 h-3" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="bg-transparent border-none pl-7 pr-3 py-1 text-sm text-white focus:ring-0 placeholder-gray-600 w-full md:w-40 transition-all"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    suppressHydrationWarning
                                />
                            </div>
                        </div>



                    </div>
                </Header>

                <div className="flex-1 p-8 overflow-y-auto">
                    {/* KPI CARDS */}
                    {/* KPI CARDS */}
                    <div className="flex flex-wrap items-center gap-4 mb-6">
                        <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg flex items-center gap-3 min-w-[180px]">
                            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                                <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-yellow-500 text-[10px] font-bold uppercase tracking-wider">Stock Bajo</p>
                                <p className="text-xl font-bold text-white leading-none mt-0.5">
                                    {lowStockCount}
                                </p>
                            </div>
                        </div>

                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-3 min-w-[180px]">
                            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                                <XCircle className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-red-500 text-[10px] font-bold uppercase tracking-wider">Sin Stock</p>
                                <p className="text-xl font-bold text-white leading-none mt-0.5">
                                    {noStockCount}
                                </p>
                            </div>
                        </div>

                        {/* ACTIONS (Moved from Header) */}
                        <div className="flex items-center gap-3 ml-auto">
                            <div className="relative">
                                <button
                                    onClick={() => setIsActionsOpen(!isActionsOpen)}
                                    className="bg-white/5 hover:bg-white/10 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-white/5 h-9"
                                >
                                    <Settings className="w-4 h-4" /> Gestionar
                                </button>

                                {isActionsOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-56 bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl overflow-hidden z-20 flex flex-col py-1">
                                        <button
                                            onClick={handleGenerateMissingCodes}
                                            className="text-left px-4 py-3 hover:bg-white/5 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-3 transition-colors"
                                        >
                                            <Settings className="w-3 h-3 text-toast-orange" /> Generar Códigos Faltantes
                                        </button>

                                        <button
                                            onClick={handleCleanupClick}
                                            className="text-left px-4 py-3 hover:bg-white/5 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-3 transition-colors"
                                        >
                                            <Filter className="w-3 h-3 text-red-400" /> Limpiar Duplicados
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-lg h-9"
                            >
                                <Plus className="w-4 h-4" /> Nuevo
                            </button>
                        </div>
                    </div>

                    {/* TABLE */}
                    <div className="bg-toast-charcoal rounded-xl border border-white/5 overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-white/5 text-gray-300 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-4 py-2 whitespace-nowrap">Código</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Ingrediente</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Familia (Categoría)</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Sub-Familia</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Almacenamiento</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Stock Actual</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Unidad</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Costo Unit.</th>
                                    <th className="px-4 py-2 whitespace-nowrap">Estado</th>
                                    <th className="px-4 py-2 text-right whitespace-nowrap">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filtered.map(item => (
                                    <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-2 font-mono text-xs text-toast-orange whitespace-nowrap">{item.code || '-'}</td>
                                        <td className="px-4 py-2 font-semibold text-white whitespace-nowrap">{item.name}</td>
                                        <td className="px-4 py-2"><span className="bg-white/5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider text-gray-400 whitespace-nowrap">{item.family || item.category || 'General'}</span></td>
                                        <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">{item.subFamily || '-'}</td>
                                        <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">{item.storage || '-'}</td>
                                        <td className="px-4 py-2 font-mono text-white text-sm whitespace-nowrap">
                                            {item.isInfinite ? <span className="text-xl leading-none">∞</span> : item.stock}
                                        </td>
                                        <td className="px-4 py-2 text-xs whitespace-nowrap">{item.unit}</td>
                                        <td className="px-4 py-2 text-xs whitespace-nowrap">${item.cost || 0}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            {item.isInfinite ? (
                                                <span className="text-blue-400 font-bold text-[10px] bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">INFINITO</span>
                                            ) : item.stock === 0 ? (
                                                <span className="text-red-500 font-bold text-[10px] bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">SIN STOCK</span>
                                            ) : item.stock <= (item.minStock || 5) ? (
                                                <span className="text-yellow-500 font-bold text-[10px] bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">BAJO</span>
                                            ) : (
                                                <span className="text-green-500 font-bold text-[10px] bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">OK</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setEditingIngredient(item)}
                                                    className="text-gray-500 hover:text-white p-1 rounded hover:bg-white/5 transition-all"
                                                    title="Editar"
                                                >
                                                    <Settings className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id!, item.name)}
                                                    className="text-gray-500 hover:text-red-500 p-1 rounded hover:bg-white/5 transition-all"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main >

            {/* CREATE MODAL */}
            {
                isCreateModalOpen && (
                    <CreateIngredientModal
                        onClose={() => setIsCreateModalOpen(false)}
                        existingSubFamilies={uniqueSubFamilies}
                    />
                )
            }

            {/* EDIT MODAL */}
            {
                editingIngredient && (
                    <EditInventoryItemModal
                        ingredient={editingIngredient}
                        onClose={() => setEditingIngredient(null)}
                        existingSubFamilies={uniqueSubFamilies}
                    />
                )
            }
        </div >
    )
}

function CreateIngredientModal({ onClose, existingSubFamilies }: { onClose: () => void, existingSubFamilies: string[] }) {
    const [name, setName] = useState("");
    const [family, setFamily] = useState("Abarrotes");
    const [subFamily, setSubFamily] = useState("");
    const [storage, setStorage] = useState("Bodega Seca");
    const [unit, setUnit] = useState("un");
    const [stock, setStock] = useState(0);
    const [minStock, setMinStock] = useState(5);
    const [cost, setCost] = useState(0);
    const [code, setCode] = useState("");
    const [isInfinite, setIsInfinite] = useState(false);

    const generateSKU = (n: string, c: string) => {
        const catCode = (c || 'GEN').substring(0, 3).toUpperCase();
        const nameCode = (n || 'UNK').substring(0, 3).toUpperCase();
        const random = Math.floor(Math.random() * 900) + 100;
        return `${catCode}-${nameCode}-${random}`;
    };

    const handleNameChange = (val: string) => {
        setName(val);
        if (!code) setCode(generateSKU(val, family));
    };

    const handleFamilyChange = (val: string) => {
        setFamily(val);
        // Regenerate if code seems auto-generated (contains hyphen)
        if (code.includes('-')) setCode(generateSKU(name, val));
    };

    const handleSave = async () => {
        if (!name.trim()) return alert("El nombre es obligatorio");

        await db.ingredients.add({
            name,
            family,
            subFamily,
            storage,
            stock: Number(stock),
            unit,
            category: family, // Fallback/Sync
            cost: Number(cost),
            purchaseUnit: unit, // Default
            conversionFactor: 1, // Default
            code: code || generateSKU(name, family),
            isInfinite,
            minStock: Number(minStock)
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Plus className="text-green-500" /> Nuevo Ingrediente
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">Nombre</label>
                        <input className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none" value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Ej. Tomates, Pan..." autoFocus />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Familia (Categoría)</label>
                            <select
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none appearance-none"
                                value={family}
                                onChange={e => handleFamilyChange(e.target.value)}
                            >
                                <option value="Abarrotes">Abarrotes</option>
                                <option value="Frutas y Verduras">Frutas y Verduras</option>
                                <option value="Carnes y Cecinas">Carnes y Cecinas</option>
                                <option value="Lácteos y Huevos">Lácteos y Huevos</option>
                                <option value="Bebidas y Licores">Bebidas y Licores</option>
                                <option value="Congelados">Congelados</option>
                                <option value="Limpieza">Limpieza</option>
                                <option value="Otros">Otros</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Sub-Familia</label>
                            <input
                                list="create-subfamilies"
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none"
                                value={subFamily}
                                onChange={e => setSubFamily(e.target.value)}
                                placeholder="Ej. Harinas"
                            />
                            <datalist id="create-subfamilies">
                                {existingSubFamilies.map(sf => (
                                    <option key={sf} value={sf} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Almacenamiento</label>
                            <select
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none appearance-none"
                                value={storage}
                                onChange={e => setStorage(e.target.value)}
                            >
                                <option value="Bodega Seca">Bodega Seca</option>
                                <option value="Refrigerado">Refrigerado (0° a 5°C)</option>
                                <option value="Congelado">Congelado (-18°C)</option>
                                <option value="Fresco">Fresco / Ambiente</option>
                            </select>
                        </div>
                        <div className="w-24">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Código</label>
                            <input
                                readOnly
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-gray-400 font-mono outline-none cursor-not-allowed text-xs"
                                value={code}
                                placeholder="AUTO"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Stock Inicial</label>
                            <div className="flex">
                                <input type="number" className="w-full bg-black/30 border border-white/10 rounded-l-lg px-3 py-2 text-white focus:border-green-500 outline-none" value={stock} onChange={e => setStock(Number(e.target.value))} />
                                <select className="bg-black/30 border border-white/10 border-l-0 rounded-r-lg px-2 py-2 text-white focus:border-green-500 outline-none text-xs" value={unit} onChange={e => setUnit(e.target.value)}>
                                    <option value="un">un</option>
                                    <option value="kg">kg</option>
                                    <option value="l">l</option>
                                    <option value="gr">gr</option>
                                    <option value="ml">ml</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Costo Unitario ($)</label>
                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none" value={cost} onChange={e => setCost(Number(e.target.value))} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Stock Mínimo</label>
                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none" value={minStock} onChange={e => setMinStock(Number(e.target.value))} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input
                            type="checkbox"
                            checked={isInfinite}
                            onChange={e => setIsInfinite(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 bg-black/30 text-green-600 focus:ring-offset-0 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-sm text-gray-300">Es Servicio / Stock Infinito (Ej. Agua, Gas)</span>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-lg font-bold">Cancelar</button>
                        <button onClick={handleSave} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function EditInventoryItemModal({ ingredient, onClose, existingSubFamilies }: { ingredient: any, onClose: () => void, existingSubFamilies: string[] }) {
    const [form, setForm] = useState({ ...ingredient });

    const handleSave = async () => {
        if (!form.name.trim()) return alert("El nombre es obligatorio");
        await db.ingredients.update(ingredient.id, {
            name: form.name,
            family: form.family,
            subFamily: form.subFamily,
            storage: form.storage,
            category: form.family, // Sync
            stock: Number(form.stock),
            unit: form.unit,
            cost: Number(form.cost),
            code: form.code, // Allow updating code manually if needed
            isInfinite: form.isInfinite,
            minStock: Number(form.minStock),
            purchaseUnit: form.unit === ingredient.unit ? form.unit : ingredient.purchaseUnit
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Settings className="text-toast-orange" /> Editar Ingrediente
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">Nombre</label>
                        <input className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Familia (Categoría)</label>
                            <select
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none appearance-none"
                                value={form.family || form.category || "Abarrotes"}
                                onChange={e => setForm({ ...form, family: e.target.value, category: e.target.value })}
                            >
                                <option value="Abarrotes">Abarrotes</option>
                                <option value="Frutas y Verduras">Frutas y Verduras</option>
                                <option value="Carnes y Cecinas">Carnes y Cecinas</option>
                                <option value="Lácteos y Huevos">Lácteos y Huevos</option>
                                <option value="Bebidas y Licores">Bebidas y Licores</option>
                                <option value="Congelados">Congelados</option>
                                <option value="Limpieza">Limpieza</option>
                                <option value="Otros">Otros</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Sub-Familia</label>
                            <input
                                list="edit-subfamilies"
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none"
                                value={form.subFamily || ''}
                                onChange={e => setForm({ ...form, subFamily: e.target.value })}
                            />
                            <datalist id="edit-subfamilies">
                                {existingSubFamilies.map(sf => (
                                    <option key={sf} value={sf} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Almacenamiento</label>
                            <select
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none appearance-none"
                                value={form.storage || 'Bodega Seca'}
                                onChange={e => setForm({ ...form, storage: e.target.value })}
                            >
                                <option value="Bodega Seca">Bodega Seca</option>
                                <option value="Refrigerado">Refrigerado (0° a 5°C)</option>
                                <option value="Congelado">Congelado (-18°C)</option>
                                <option value="Fresco">Fresco / Ambiente</option>
                            </select>
                        </div>

                        <div className="w-24">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Código</label>
                            <input
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-gray-300 font-mono outline-none text-xs focus:border-toast-orange"
                                value={form.code || ''}
                                onChange={e => setForm({ ...form, code: e.target.value })}
                                placeholder="COD"
                            />
                        </div>
                    </div>
                    <div className="w-full">
                        <label className="block text-xs font-bold text-gray-400 mb-1">Unidad</label>
                        <select className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                            <option value="un">un</option>
                            <option value="kg">kg</option>
                            <option value="l">l</option>
                            <option value="gr">gr</option>
                            <option value="ml">ml</option>
                        </select>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Stock Actual</label>
                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Costo Unitario ($)</label>
                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none" value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Stock Mínimo</label>
                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-toast-orange outline-none" value={form.minStock || 5} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input
                            type="checkbox"
                            checked={form.isInfinite || false}
                            onChange={e => setForm({ ...form, isInfinite: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-600 bg-black/30 text-toast-orange focus:ring-offset-0 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-sm text-gray-300">Es Servicio / Stock Infinito (Ej. Agua, Gas)</span>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-lg font-bold">Cancelar</button>
                        <button onClick={handleSave} className="flex-1 bg-toast-orange hover:bg-orange-600 text-white py-3 rounded-lg font-bold">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
