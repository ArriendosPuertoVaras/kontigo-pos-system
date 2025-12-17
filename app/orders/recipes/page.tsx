'use client';
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { ArrowLeft, ChefHat, Search, Clock, Scale, Plus, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { RecipeBuilderModal } from '@/components/RecipeBuilderModal';

export default function KitchenRecipesPage() {
    const products = useLiveQuery(() => db.products.toArray());
    const ingredients = useLiveQuery(() => db.ingredients.toArray());
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
    const [search, setSearch] = useState("");

    const [productionQty, setProductionQty] = useState(1);

    // Modal State
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newDishName, setNewDishName] = useState("");

    const selectedProduct = useMemo(() =>
        products?.find(p => p.id === selectedProductId),
        [selectedProductId, products]);

    const filteredProducts = useMemo(() =>
        products?.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) || [],
        [products, search]);

    // Resolve ingredients for the selected product
    const recipeDetails = useMemo(() => {
        if (!selectedProduct || !selectedProduct.recipe || !ingredients) return [];
        return selectedProduct.recipe.map(item => {
            const ing = ingredients.find(i => i.id === item.ingredientId);
            const unit = item.unit || ing?.unit || 'un';
            return {
                name: ing?.name || "Ingrediente Desconocido",
                quantity: item.quantity * productionQty,
                unit: unit
            };
        });
    }, [selectedProduct, ingredients, productionQty]);

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (confirm("¿Estás seguro de borrar este plato?")) {
            await db.products.delete(id);
            if (selectedProductId === id) setSelectedProductId(null);
        }
    };

    const handleCreateDish = async () => {
        if (!newDishName.trim()) return;

        // Find default category (Kitchen) or create 'General'
        let cat = await db.categories.where('name').equals('General').first();
        if (!cat) {
            // Try any kitchen category
            cat = await db.categories.where('destination').equals('kitchen').first();
        }
        const catId = cat?.id || 0; // If 0, it might be hidden in some views, but works for now

        const id = await db.products.add({
            name: newDishName,
            price: 0, // Default, can be edited in manager
            categoryId: catId,
            image: '',
            isAvailable: true,
            recipe: []
        });

        setIsCreateOpen(false);
        setNewDishName("");
        setSelectedProductId(id as number);
        setIsBuilderOpen(true); // Open builder immediately
    };

    return (
        <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col md:flex-row h-auto md:h-screen overflow-y-auto md:overflow-hidden">
            {/* SIDEBAR: RECIPE LIST - Narrower on MD, Full on LG */}
            <aside className="w-full md:w-[240px] lg:w-[350px] bg-[#222] border-b md:border-b-0 md:border-r border-white/10 flex flex-col z-20 shadow-xl shrink-0 h-[400px] md:h-full transition-all duration-300">
                <div className="p-4 lg:p-6 pb-2">
                    <Link href="/orders" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-xs font-bold uppercase mb-4 lg:mb-6 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> <span className="hidden lg:inline">Volver al KDS</span><span className="lg:hidden">Volver</span>
                    </Link>
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2 truncate">
                            <ChefHat className="text-toast-orange shrink-0" />
                            <span className="truncate">Fichas</span>
                        </h1>
                        <button
                            onClick={() => setIsCreateOpen(true)}
                            className="bg-toast-orange hover:bg-orange-600 text-white p-2 rounded-lg shadow-lg shadow-orange-500/20 transition-all shrink-0"
                            title="Agregar Plato"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2 lg:py-3 text-sm text-white focus:border-toast-orange outline-none"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            suppressHydrationWarning
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 lg:px-4 pb-4 space-y-1">
                    {filteredProducts.map(p => (
                        <div key={p.id} className="relative group">
                            <button
                                onClick={() => {
                                    setSelectedProductId(p.id!);
                                }}
                                className={`w-full text-left p-3 lg:p-4 rounded-xl transition-all border relative overflow-hidden pr-12 lg:pr-16
                                ${selectedProductId === p.id
                                        ? 'bg-toast-orange text-white border-toast-orange shadow-lg'
                                        : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white'}`}
                            >
                                <span className="font-bold block relative z-10 text-sm lg:text-base truncate">{p.name}</span>
                                {/* Decorative Chef Hat bg */}
                                {selectedProductId === p.id && <ChefHat className="absolute -right-2 -bottom-2 w-16 h-16 text-white/20 rotate-12" />}
                            </button>

                            {/* ACTION BUTTONS */}
                            <div className={`absolute right-1 lg:right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-20 
                                ${selectedProductId === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProductId(p.id!);
                                        setIsBuilderOpen(true);
                                    }}
                                    className={`p-1.5 rounded-lg ${selectedProductId === p.id ? 'hover:bg-white/20 text-white' : 'hover:bg-white/20 text-gray-400 hover:text-white'}`}
                                    title="Editar Ficha"
                                >
                                    <Edit className="w-3 h-3 lg:w-4 lg:h-4" />
                                </button>
                                <button
                                    onClick={(e) => handleDelete(e, p.id!)}
                                    className={`p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-500`}
                                    title="Eliminar Plato"
                                >
                                    <Trash2 className="w-3 h-3 lg:w-4 lg:h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No encontrado
                        </div>
                    )}
                </div>
            </aside>

            {/* MAIN CONTENT: RECIPE CARD */}
            <main id="main-content" className="flex-1 overflow-y-visible md:overflow-y-auto bg-[#1a1a1a] p-4 md:p-6 lg:p-12 flex items-start justify-center min-h-[500px]">
                {selectedProduct ? (
                    <div className="w-full max-w-4xl animate-in zoom-in-95 duration-300">
                        {/* CARD HEADER */}
                        <div className="bg-[#2a2a2a] rounded-t-3xl border border-white/10 p-4 md:p-6 lg:p-8 flex flex-col-reverse lg:flex-row justify-between items-start relative overflow-hidden gap-6 lg:gap-8">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <ChefHat className="w-64 h-64" />
                            </div>

                            <div className="relative z-10 w-full lg:w-auto flex-1 text-center lg:text-left">
                                <span className="text-toast-orange font-bold text-[10px] md:text-xs uppercase tracking-widest mb-1 md:mb-2 block">Estación Cocina</span>
                                <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-black text-white mb-4 md:mb-6 leading-tight max-w-full lg:max-w-2xl mx-auto lg:mx-0">{selectedProduct.name}</h2>

                                <div className="flex flex-wrap gap-2 md:gap-4 justify-center lg:justify-start">
                                    {/* TIME INFO */}
                                    {(selectedProduct.prepTime || selectedProduct.cookTime || selectedProduct.totalTime) ? (
                                        <>
                                            {selectedProduct.prepTime && (
                                                <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 justify-center min-w-[80px]">
                                                    <Clock className="w-4 h-4 text-blue-400" />
                                                    <div className="flex flex-col leading-none text-left">
                                                        <span className="text-[8px] text-gray-500 font-bold uppercase">Prep</span>
                                                        <span className="font-bold text-white text-xs">{selectedProduct.prepTime}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {selectedProduct.cookTime && (
                                                <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 justify-center min-w-[80px]">
                                                    <Clock className="w-4 h-4 text-red-400" />
                                                    <div className="flex flex-col leading-none text-left">
                                                        <span className="text-[8px] text-gray-500 font-bold uppercase">Cocción</span>
                                                        <span className="font-bold text-white text-xs">{selectedProduct.cookTime}</span>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 justify-center min-w-[100px]">
                                                <Clock className="w-4 h-4 text-toast-orange" />
                                                <div className="flex flex-col leading-none text-left">
                                                    <span className="text-[8px] text-gray-500 font-bold uppercase">Total</span>
                                                    <span className="font-bold text-white text-sm">{selectedProduct.totalTime || "-----"}</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 justify-center min-w-[100px] md:min-w-[120px]">
                                            <Clock className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                                            <div className="flex flex-col leading-none text-left">
                                                <span className="text-[8px] md:text-[9px] text-gray-500 font-bold uppercase">Tiempo</span>
                                                <span className="font-bold text-white text-xs md:text-base">-- min</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 justify-center min-w-[100px] md:min-w-[160px]">
                                        <Scale className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                                        <div className="flex flex-col leading-none text-left">
                                            <span className="text-[8px] md:text-[9px] text-gray-500 font-bold uppercase">Calculadora</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="w-12 bg-transparent text-white font-bold text-xs md:text-base border-b border-white/20 focus:border-toast-orange outline-none text-center"
                                                    value={productionQty}
                                                    onChange={e => setProductionQty(Math.max(1, parseInt(e.target.value) || 1))}
                                                />
                                                <span className="font-bold text-white text-xs md:text-base">Unidad(es)</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* MANAGER EDIT BUTTON IN MAIN VIEW TOO */}
                                    <button
                                        onClick={() => setIsBuilderOpen(true)}
                                        className="bg-white/5 hover:bg-white/10 text-white px-3 py-2 rounded-lg border border-white/10 flex items-center gap-2 transition-colors lg:ml-2 text-xs md:text-sm font-bold"
                                    >
                                        <Edit className="w-4 h-4" /> Editar
                                    </button>
                                </div>
                            </div>

                            {/* IMAGE PLACEHOLDER OR REAL IMAGE - Constrained width on mobile/tablet */}
                            <div className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 bg-black/40 rounded-2xl border-4 border-[#3a3a3a] shadow-2xl overflow-hidden shrink-0 relative z-10 self-center mx-auto lg:mx-0">
                                {selectedProduct.image ? (
                                    <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                                        <ChefHat className="w-8 h-8 md:w-12 md:h-12 mb-2" />
                                        <span className="text-[10px] md:text-xs font-bold text-center px-4">Sin Foto</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CARD BODY */}
                        <div className="bg-[#222] rounded-b-3xl border-x border-b border-white/10 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">

                            {/* INGREDIENTS */}
                            <div>
                                <h3 className="text-xl font-bold text-white border-b border-white/10 pb-4 mb-6 flex items-center gap-2">
                                    <Scale className="text-toast-orange" />
                                    Ingredientes & Mise en Place
                                </h3>

                                {recipeDetails.length > 0 ? (
                                    <ul className="space-y-0">
                                        {recipeDetails.map((ing, idx) => (
                                            <li key={idx} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded-lg transition-colors">
                                                <span className="font-medium text-gray-200 text-sm md:text-base">{ing.name}</span>
                                                <span className="font-mono font-bold text-toast-orange bg-toast-orange/10 px-2 py-1 rounded text-xs md:text-sm whitespace-nowrap ml-2">
                                                    {ing.quantity} {ing.unit}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="p-6 bg-white/5 rounded-xl text-center text-gray-500 italic">
                                        No hay ingredientes definidos para este plato.
                                    </div>
                                )}
                            </div>

                            {/* STEPS (MOCK FOR NOW) */}
                            <div>
                                <h3 className="text-xl font-bold text-white border-b border-white/10 pb-4 mb-6 flex items-center gap-2">
                                    <ChefHat className="text-toast-orange" />
                                    Preparación y Montaje
                                </h3>

                                <div className="space-y-6">
                                    {(selectedProduct.instructions && selectedProduct.instructions.length > 0) ? (
                                        selectedProduct.instructions.map((step, idx) => (
                                            <div key={idx} className="flex gap-4">
                                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white shrink-0 text-sm">{idx + 1}</div>
                                                <div>
                                                    <p className="text-gray-300 leading-relaxed text-sm md:text-base">{step}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-gray-500 italic text-sm">No hay pasos de preparación registrados.</div>
                                    )}

                                    {selectedProduct.chefNote && (
                                        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-xl">
                                            <p className="text-yellow-500 text-xs font-bold uppercase mb-1">Nota del Chef</p>
                                            <p className="text-yellow-200/80 text-sm">{selectedProduct.chefNote}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="text-center opacity-30 flex flex-col items-center">
                        <ChefHat className="w-32 h-32 mb-6" />
                        <h2 className="text-3xl font-bold mb-2">Selecciona un Plato</h2>
                        <p className="text-xl">para ver su Ficha Técnica Operativa</p>
                    </div>
                )}
            </main>

            {/* CREATE DISH DIALOG */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-2xl border border-white/10 shadow-xl">
                        <h3 className="text-xl font-bold text-white mb-4">Nuevo Plato</h3>
                        <input
                            autoFocus
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white mb-6 focus:border-toast-orange outline-none"
                            placeholder="Nombre del plato..."
                            value={newDishName}
                            onChange={e => setNewDishName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateDish()}
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setIsCreateOpen(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold">Cancelar</button>
                            <button onClick={handleCreateDish} className="flex-1 py-3 rounded-xl bg-toast-orange hover:bg-orange-600 text-white font-bold">Crear</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT RECIPE MODAL */}
            {isBuilderOpen && selectedProductId && (
                <RecipeBuilderModal
                    entityId={selectedProductId}
                    entityType="product"
                    onClose={() => setIsBuilderOpen(false)}
                    onSave={() => setIsBuilderOpen(false)}
                />
            )}
        </div>
    );
}
