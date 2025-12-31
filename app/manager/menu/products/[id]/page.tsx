'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product, ModifierTemplate, Category } from '@/lib/db';
import { ArrowLeft, Save, Trash2, Tag, Layers, RefreshCw, ShieldCheck, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params?.id);

    // Data Queries
    const product = useLiveQuery(() => db.products.get(id), [id]);
    const categories = useLiveQuery(() => db.categories.toArray());
    const templates = useLiveQuery(() => db.modifierTemplates.toArray());

    const [formData, setFormData] = useState<Partial<Product>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (product) setFormData(product);
    }, [product]);

    // --- AUTO-SAVE ---
    useEffect(() => {
        if (!id || Object.keys(formData).length === 0) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                await db.products.update(id, formData);

                const { syncService } = await import('@/lib/sync_service');
                await syncService.autoSync(db.products, 'products');
            } catch (error) {
                console.error("Auto-save failed", error);
            } finally {
                setIsSaving(false);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [formData, id]);

    const handleDelete = async () => {
        if (confirm("¿Estás seguro de eliminar este producto?")) {
            if (id) {
                await db.products.delete(id);
                const { syncService } = await import('@/lib/sync_service');
                await syncService.pushAll();
                router.push('/manager/menu');
            }
        }
    };

    const handleChange = (field: keyof Product, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const toggleModifier = (tpl: ModifierTemplate) => {
        setFormData(prev => {
            const current = prev.modifiers || [];
            const exists = current.find(m => m.name === tpl.name);

            if (exists) {
                return { ...prev, modifiers: current.filter(m => m.name !== tpl.name) };
            } else {
                // Clone template to product modifier group
                return {
                    ...prev,
                    modifiers: [...current, {
                        id: crypto.randomUUID(),
                        name: tpl.name,
                        minSelect: tpl.minSelect,
                        maxSelect: tpl.maxSelect,
                        options: tpl.options
                    }]
                };
            }
        });
    };

    if (!product) return <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">Cargando...</div>;

    const isModifierActive = (tplName: string) => {
        return formData.modifiers?.some(m => m.name === tplName);
    }

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans p-4 pb-48 overflow-y-auto">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/manager/menu" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{formData.name}</h1>
                        <p className="text-xs text-gray-400 font-mono">
                            Producto #{id}
                        </p>
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

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* COLUMN 1: BASIC INFO */}
                <div className="col-span-1 md:col-span-2 space-y-6">
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-toast-orange border-b border-white/5 pb-2">
                            <Tag className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Información Básica</h2>
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Nombre del Producto</label>
                            <input
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-toast-orange outline-none font-bold"
                                value={formData.name || ''}
                                onChange={e => handleChange('name', e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Precio ($)</label>
                                <input
                                    type="number"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-toast-orange outline-none font-mono"
                                    value={formData.price || 0}
                                    onChange={e => handleChange('price', Number(e.target.value))}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Categoría</label>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-toast-orange outline-none appearance-none"
                                    value={formData.categoryId || 0}
                                    onChange={e => handleChange('categoryId', Number(e.target.value))}
                                >
                                    <option value={0} disabled>Seleccionar Categoría</option>
                                    {categories?.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Image URL (Optional) */}
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">URL Imagen</label>
                            <input
                                type="text"
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-xs focus:border-toast-orange outline-none text-gray-400"
                                value={formData.image || ''}
                                onChange={e => handleChange('image', e.target.value)}
                                placeholder="http://..."
                            />
                        </div>
                    </div>

                    {/* MODIFIERS SECTION */}
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-blue-400 border-b border-white/5 pb-2">
                            <Layers className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Grupos de Modificadores</h2>
                        </div>
                        <p className="text-xs text-gray-500">
                            Activa los grupos de modificadores que aplican a este producto (ej. Punto de Carne, Agregados).
                        </p>

                        <div className="grid grid-cols-1 gap-2">
                            {templates?.map(tpl => {
                                const active = isModifierActive(tpl.name);
                                return (
                                    <button
                                        key={tpl.id}
                                        onClick={() => toggleModifier(tpl)}
                                        className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${active
                                                ? 'bg-blue-500/10 border-blue-500/50 text-white'
                                                : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5'
                                            }`}
                                    >
                                        <div>
                                            <p className="font-bold text-sm">{tpl.name}</p>
                                            <p className="text-[10px] opacity-70">
                                                {tpl.options.length} opciones (Min: {tpl.minSelect}, Max: {tpl.maxSelect})
                                            </p>
                                        </div>
                                        {active ? <ShieldCheck className="w-5 h-5 text-blue-400" /> : <Plus className="w-5 h-5 opacity-50" />}
                                    </button>
                                )
                            })}
                            {templates?.length === 0 && (
                                <p className="text-xs text-gray-500 italic p-4 text-center border border-dashed border-white/10 rounded-lg">
                                    No hay plantillas de modificadores creadas. Ve a la pestaña "Modificadores" en el menú principal para crear una.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUMN 2: PREVIEW / STATUS */}
                <div className="space-y-6">
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4 sticky top-6">
                        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400 border-b border-white/5 pb-2">Estado</h2>

                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">Disponible</span>
                            <button
                                onClick={() => handleChange('isAvailable', !formData.isAvailable)}
                                className={`w-12 h-6 rounded-full p-1 transition-colors ${formData.isAvailable ? 'bg-green-500' : 'bg-gray-600'}`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${formData.isAvailable ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {formData.image && (
                            <div className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/50">
                                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                        )}

                        {!formData.image && (
                            <div className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/20 flex items-center justify-center flex-col gap-2 text-gray-600">
                                <Tag className="w-8 h-8 opacity-20" />
                                <span className="text-xs">Sin Imagen</span>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
