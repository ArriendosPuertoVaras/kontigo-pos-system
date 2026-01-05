'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, Ingredient } from '@/lib/db';
import { ArrowLeft, Package, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function IngredientDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params?.id);
    const ingredient = useLiveQuery(() => db.ingredients.get(id), [id]);

    const [formData, setFormData] = useState<Partial<Ingredient>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Sync formData when ingredient loads
    useEffect(() => {
        if (ingredient) setFormData(ingredient);
    }, [ingredient]);

    // --- AUTO-SAVE IMPLEMENTATION (Debounced) ---
    useEffect(() => {
        // Skip initial empty load or if no ID
        if (!id || Object.keys(formData).length === 0) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                // Determine updates
                const updates = { ...formData };

                // Sync Categories
                if (updates.family) updates.category = updates.family;

                await db.ingredients.update(id, updates);

                // Trigger Cloud Sync for this specific change
                const { syncService } = await import('@/lib/sync_service');
                await syncService.autoSync(db.ingredients, 'ingredients');

            } catch (error) {
                console.error("Auto-save failed", error);
            } finally {
                setIsSaving(false);
            }
        }, 800); // 800ms debounce

        return () => clearTimeout(timer);
    }, [formData, id]);

    const handleDelete = async () => {
        if (confirm("¿Estás seguro de eliminar este ingrediente?")) {
            try {
                if (id) {
                    const { syncService } = await import('@/lib/sync_service');
                    await syncService.syncDelete(db.ingredients, 'ingredients', id);
                    router.push('/inventory');
                }
            } catch (error) {
                console.error("Error deleting ingredient", error);
            }
        }
    };

    if (!ingredient) return <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">Cargando...</div>;

    // Helper for inputs
    const handleChange = (field: keyof Ingredient, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans p-4 pb-48 overflow-y-auto">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/inventory" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{formData.name}</h1>
                        <p className="text-xs text-gray-400 font-mono">{formData.code || 'SKU Pendiente'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Auto-Save Indicator */}
                    {isSaving ? (
                        <span className="text-xs text-toast-orange font-bold animate-pulse flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Guardando...
                        </span>
                    ) : (
                        <span className="text-xs text-green-500 font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Sincronizado
                        </span>
                    )}

                    <button
                        onClick={handleDelete}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 border border-red-500/20">
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. Datos Básicos */}
                <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center gap-2 text-toast-orange border-b border-white/5 pb-2">
                        <Package className="w-4 h-4" />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Información Básica</h2>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Nombre</label>
                        <input
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                            value={formData.name || ''}
                            onChange={e => handleChange('name', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Familia</label>
                            <select
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none appearance-none"
                                value={formData.family || formData.category || 'Abarrotes'}
                                onChange={e => handleChange('family', e.target.value)}
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
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Sub-Familia</label>
                            <input
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                value={formData.subFamily || ''}
                                onChange={e => handleChange('subFamily', e.target.value)}
                                placeholder="Ej. Harinas"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Almacenamiento</label>
                            <select
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none appearance-none"
                                value={formData.storage || 'Bodega Seca'}
                                onChange={e => handleChange('storage', e.target.value)}
                            >
                                <option value="Bodega Seca">Bodega Seca</option>
                                <option value="Refrigerado">Refrigerado</option>
                                <option value="Congelado">Congelado</option>
                                <option value="Fresco">Fresco</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Código (SKU)</label>
                            <input
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none font-mono"
                                value={formData.code || ''}
                                onChange={e => handleChange('code', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* 2. Stock y Costos */}
                <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center gap-2 text-green-400 border-b border-white/5 pb-2">
                        <Package className="w-4 h-4" />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Inventario y Costos</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Stock Actual</label>
                            <input
                                type="number"
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none font-bold"
                                value={formData.stock || 0}
                                onChange={e => handleChange('stock', Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Unidad</label>
                            <select
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                value={formData.unit || 'un'}
                                onChange={e => handleChange('unit', e.target.value)}
                            >
                                <option value="un">un</option>
                                <option value="kg">kg</option>
                                <option value="l">l</option>
                                <option value="gr">gr</option>
                                <option value="ml">ml</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Costo Unitario ($)</label>
                            <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                                <input
                                    type="number"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-5 pr-2 py-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.cost || 0}
                                    onChange={e => handleChange('cost', Number(e.target.value))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Stock Mínimo</label>
                            <input
                                type="number"
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                value={formData.minStock || 5}
                                onChange={e => handleChange('minStock', Number(e.target.value))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Rendimiento (%)</label>
                        <div className="relative">
                            <input
                                type="number"
                                max={100}
                                min={1}
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                value={Math.round((formData.yieldPercent || 1) * 100)}
                                onChange={e => handleChange('yieldPercent', Number(e.target.value) / 100)}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                        </div>
                    </div>

                    <div className="pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.isInfinite || false}
                                onChange={e => handleChange('isInfinite', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 bg-black/30 text-toast-orange focus:ring-0"
                            />
                            <span className="text-sm text-gray-300">Es Servicio / Stock Infinito (Ej. Agua)</span>
                        </label>
                    </div>

                </div>

            </div>
        </div>
    );
}
