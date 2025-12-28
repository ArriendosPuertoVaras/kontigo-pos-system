'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Ingredient, RecipeItem } from '@/lib/db';
import { KontigoFinance } from '@/lib/accounting';
import { syncService } from '@/lib/sync_service';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { ArrowLeft, Save, Trash2, Plus, Calculator, DollarSign, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// New Helper to calculate cost recursively
// NOTE: In production, move to a shared lib/costing.ts
const calculateRecipeCost = async (recipeItems: RecipeItem[]) => {
    let total = 0;
    if (!recipeItems) return 0;

    for (const item of recipeItems) {
        const ing = await db.ingredients.get(item.ingredientId);
        if (ing && ing.cost) {
            // Basic unit conversion logic (Simplified)
            // Ideally we need a robust converter.
            // Assuming cost is per 'unit' and quantity matches.
            total += (ing.cost * item.quantity);
        }
    }
    return total;
};

export default function PreparationEditor({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const preparationId = parseInt(id);

    const preparation = useLiveQuery(() => db.ingredients.get(preparationId));
    const allIngredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray());

    const [form, setForm] = useState<Partial<Ingredient>>({});
    const [items, setItems] = useState<RecipeItem[]>([]);

    // Derived Cost State
    const [calculatedCost, setCalculatedCost] = useState(0);

    useEffect(() => {
        if (preparation) {
            setForm(preparation);
            setItems(preparation.recipe || []);
        }
    }, [preparation]);

    // Live Cost Calculation Effect
    useEffect(() => {
        const calc = async () => {
            let total = 0;
            if (!allIngredients) return;

            items.forEach(item => {
                const ing = allIngredients.find(i => i.id === item.ingredientId);
                if (ing) {
                    let factor = 1;
                    const baseUnit = ing.unit?.toLowerCase() || '';
                    const targetUnit = item.unit?.toLowerCase() || baseUnit;

                    if (baseUnit === 'kg' && targetUnit === 'gr') factor = 0.001;
                    if (baseUnit === 'gr' && targetUnit === 'kg') factor = 1000;
                    if (baseUnit === 'l' && targetUnit === 'ml') factor = 0.001;
                    if (baseUnit === 'ml' && targetUnit === 'l') factor = 1000;

                    total += (ing.cost || 0) * factor * item.quantity;
                }
            });
            setCalculatedCost(total);
        };
        calc();
    }, [items, allIngredients]);


    const handleSave = async () => {
        if (!form.name) return;

        // Auto-update cost based on recipe if it's a preparation
        await db.ingredients.update(preparationId, {
            ...form,
            recipe: items,
            cost: calculatedCost, // SAVE THE CALCULATED COST!
            isPreparation: true
        });

        // Trigger Finance Sync (Inventory Valuation)
        KontigoFinance.recalculateInventoryValuation().catch(console.error);

        // AUTO-SYNC
        syncService.autoSync(db.products, 'products').catch(console.error);
        syncService.autoSync(db.ingredients, 'ingredients').catch(console.error);

        toast.success("Preparación Guardada y Costo Actualizado");
        router.back();
    };

    const addItem = () => {
        setItems([...items, { ingredientId: 0, quantity: 1, unit: 'kg' }]);
    };

    const removeItem = (idx: number) => {
        const newItems = [...items];
        newItems.splice(idx, 1);
        setItems(newItems);
    };

    const updateItem = (idx: number, field: keyof RecipeItem, val: any) => {
        const newItems = [...items];
        newItems[idx] = { ...newItems[idx], [field]: val };
        setItems(newItems);
    };

    const availableIngredients = allIngredients?.filter(i => i.id !== preparationId) || [];

    if (!preparation) return <div className="text-white p-10">Cargando Receta...</div>;

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans relative">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <Header title={`Editando: ${preparation.name}`} backHref="/inventory/preparations" />

                <div className="flex-1 overflow-y-auto p-4 lg:p-8">
                    <div className="max-w-4xl mx-auto space-y-6">

                        {/* INFO CARD */}
                        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-lg">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Nombre de la Preparación</label>
                                    <input
                                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-lg font-bold text-white focus:border-toast-orange outline-none"
                                        value={form.name || ''}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Unidad Final</label>
                                        <select
                                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 outline-none"
                                            value={form.unit || 'l'}
                                            onChange={e => setForm({ ...form, unit: e.target.value })}
                                        >
                                            <option value="l">Litros (l)</option>
                                            <option value="kg">Kilos (kg)</option>
                                            <option value="un">Unidades (un)</option>
                                            <option value="gr">Gramos (gr)</option>
                                            <option value="ml">Mililitros (ml)</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 mb-1 text-toast-orange">Costo Calculado</label>
                                        <div className="w-full bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 font-mono font-bold text-toast-orange flex items-center gap-2">
                                            <Calculator className="w-4 h-4" />
                                            ${Math.round(calculatedCost)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RECIPE BUILDER */}
                        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-lg">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <RefreshCw className="w-5 h-5 text-gray-400" />
                                    Ingredientes (Mise en Place)
                                </h3>
                                <button onClick={addItem} className="text-sm bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1">
                                    <Plus className="w-4 h-4" /> Añadir Ingrediente
                                </button>
                            </div>

                            <table className="w-full text-left border-separate border-spacing-y-2">
                                <thead className="text-gray-500 text-xs uppercase">
                                    <tr>
                                        <th className="pl-2">Ingrediente</th>
                                        <th className="w-24">Cantidad</th>
                                        <th className="w-24">Unidad</th>
                                        <th className="w-24 text-right">Costo Sub</th>
                                        <th className="w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => {
                                        const ing = availableIngredients.find(i => i.id == item.ingredientId);

                                        // Conversion Logic
                                        const baseUnit = ing?.unit?.toLowerCase() || '';
                                        const targetUnit = item.unit?.toLowerCase() || baseUnit;
                                        let factor = 1;

                                        if (baseUnit === 'kg' && targetUnit === 'gr') factor = 0.001;
                                        if (baseUnit === 'gr' && targetUnit === 'kg') factor = 1000;
                                        if (baseUnit === 'l' && targetUnit === 'ml') factor = 0.001;
                                        if (baseUnit === 'ml' && targetUnit === 'l') factor = 1000;

                                        const unitCost = (ing?.cost || 0) * factor;
                                        const subTotal = unitCost * item.quantity;

                                        return (
                                            <tr key={idx} className="bg-black/20">
                                                <td className="p-2 rounded-l-lg">
                                                    <select
                                                        className="w-full bg-transparent outline-none text-sm"
                                                        value={item.ingredientId}
                                                        onChange={e => {
                                                            const newIng = availableIngredients.find(i => i.id === Number(e.target.value));
                                                            const newItems = [...items];
                                                            newItems[idx] = {
                                                                ...newItems[idx],
                                                                ingredientId: Number(e.target.value),
                                                                unit: newIng?.unit || 'un' // Reset unit on change
                                                            };
                                                            setItems(newItems);
                                                        }}
                                                    >
                                                        <option value={0} disabled>Seleccionar...</option>
                                                        {availableIngredients.map(i => (
                                                            <option key={i.id} value={i.id}>
                                                                {i.name} (${i.cost}/{i.unit})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="p-2">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent border-b border-white/10 focus:border-toast-orange outline-none text-center"
                                                        value={item.quantity}
                                                        onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <select
                                                        className="w-full bg-transparent border-b border-white/10 outline-none text-xs text-gray-400 focus:text-white"
                                                        value={item.unit}
                                                        onChange={e => updateItem(idx, 'unit', e.target.value)}
                                                    >
                                                        <option value="kg">kg</option>
                                                        <option value="gr">gr</option>
                                                        <option value="l">L</option>
                                                        <option value="ml">ml</option>
                                                        <option value="un">un</option>
                                                    </select>
                                                </td>
                                                <td className="p-2 text-right font-mono text-xs text-gray-300">
                                                    ${Math.round(subTotal)}
                                                </td>
                                                <td className="p-2 rounded-r-lg text-right">
                                                    <button onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-500 transition">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>

                            {items.length === 0 && (
                                <div className="text-center py-8 text-gray-500 text-sm italic">
                                    Esta preparación aún no tiene ingredientes.
                                </div>
                            )}

                        </div>

                        {/* ACTIONS */}
                        <div className="flex gap-4 pt-4">
                            <button onClick={() => router.back()} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-gray-300">
                                Cancelar
                            </button>
                            <button onClick={handleSave} className="flex-1 py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white shadow-lg shadow-green-900/20 flex items-center justify-center gap-2">
                                <Save className="w-5 h-5" /> Guardar Preparación
                            </button>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
