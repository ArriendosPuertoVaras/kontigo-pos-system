'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Ingredient } from '@/lib/db';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { ArrowLeft, ChefHat, Plus, Search, Scale, ChevronRight } from 'lucide-react';

export default function PreparationsPage() {
    const router = useRouter();
    const [search, setSearch] = useState("");

    // Filter only ingredients that are marked as preparations or have a recipe
    const preparations = useLiveQuery(() =>
        db.ingredients.filter(i => i.isPreparation === true || (i.recipe && i.recipe.length > 0) as boolean).toArray()
    );

    const filtered = preparations?.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    ) || [];

    const handleCreate = async () => {
        const name = prompt("Nombre de la nueva preparación (ej. Salsa de Tomate):");
        if (!name) return;

        const id = await db.ingredients.add({
            name,
            cost: 0,
            stock: 0,
            unit: 'l', // Default logic needed in real UI
            isPreparation: true,
            recipe: [], // Empty recipe start
            category: 'Preparaciones'
        });

        router.push(`/inventory/preparations/${id}`);
    };

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans relative">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <Header title="Cocina / Producción" backHref="/inventory" />

                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-5xl mx-auto">

                        {/* HERO SECTION */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
                                    <ChefHat className="text-toast-orange w-8 h-8" />
                                    Preparaciones y Sub-Recetas
                                </h1>
                                <p className="text-gray-400 text-sm">Gestiona tus recetas internas, mise en place y salsas.</p>
                            </div>

                            <button
                                onClick={handleCreate}
                                className="bg-toast-orange hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-orange-900/20"
                            >
                                <Plus className="w-5 h-5" /> Nueva Receta
                            </button>
                        </div>

                        {/* SEARCH */}
                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Buscar preparación..."
                                className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:border-toast-orange focus:ring-1 focus:ring-toast-orange outline-none transition"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        {/* GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filtered?.map(prep => (
                                <div
                                    key={prep.id}
                                    onClick={() => router.push(`/inventory/preparations/${prep.id}`)}
                                    className="bg-[#2a2a2a] border border-white/5 rounded-xl p-5 hover:border-toast-orange/50 transition cursor-pointer group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition">
                                        <ChefHat className="w-16 h-16" />
                                    </div>

                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-lg text-white group-hover:text-toast-orange transition-colors">{prep.name}</h3>
                                            <p className="text-xs text-gray-500">{prep.recipe?.length || 0} ingredientes</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold border ${prep.stock > 0 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-gray-700/30 border-gray-600 text-gray-400'}`}>
                                            {prep.stock > 0 ? `${prep.stock} ${prep.unit}` : 'Sin Stock'}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-sm mt-2">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Scale className="w-4 h-4" />
                                            <span>Simulado: <span className="text-white font-mono">${Math.round(prep.cost || 0)}/{prep.unit}</span></span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transform group-hover:translate-x-1 transition" />
                                    </div>
                                </div>
                            ))}

                            {filtered.length === 0 && (
                                <div className="col-span-full py-12 text-center text-gray-500 border-2 border-dashed border-white/5 rounded-xl">
                                    <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No se encontraron preparaciones.</p>
                                    <button onClick={handleCreate} className="text-toast-orange hover:underline text-sm font-bold mt-2">Crear la primera</button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
