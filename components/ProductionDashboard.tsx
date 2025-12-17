'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Check, AlertTriangle, Clock, ChefHat, RefreshCw, Save, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PlanItem {
    id: number;
    ingredient_id: number;
    suggested_qty: number;
    actual_qty_prepped: number;
    unit: string;
    // Joined fields
    ingredient: {
        name: string;
        category: string;
    };
}

interface ProductionPlan {
    id: number;
    target_date: string;
    status: string;
    items: PlanItem[];
}

export default function ProductionDashboard() {
    const [plan, setPlan] = useState<ProductionPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'urgent' | 'prep' | 'batch'>('urgent');

    useEffect(() => {
        fetchTodayPlan();
    }, []);

    const fetchTodayPlan = async () => {
        setLoading(true);
        const todayStr = new Date().toISOString().split('T')[0];

        try {
            // 1. Get Plan
            const { data: plans, error } = await supabase
                .from('production_plans')
                .select(`
                    id, target_date, status,
                    items:production_plan_items (
                        id, ingredient_id, suggested_qty, actual_qty_prepped, unit,
                        ingredient:ingredients (name, category)
                    )
                `)
                .eq('target_date', todayStr)
                .limit(1);

            if (error) throw error;

            if (plans && plans.length > 0) {
                // @ts-ignore - Supabase types are tricky with deep joins, trust the query
                setPlan(plans[0]);
            } else {
                setPlan(null); // No plan for today
            }
        } catch (err) {
            console.error("Error fetching plan:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateQty = async (itemId: number, qty: number) => {
        // Optimistic UI update
        if (!plan) return;

        const newItems = plan.items.map(i =>
            i.id === itemId ? { ...i, actual_qty_prepped: qty } : i
        );
        setPlan({ ...plan, items: newItems });

        // DB Update (Debounce would be better in prod, but direct update for KDS is usually fine for low traffic)
        await supabase
            .from('production_plan_items')
            .update({ actual_qty_prepped: qty })
            .eq('id', itemId);
    };

    const toggleDone = (item: PlanItem) => {
        const isComplete = item.actual_qty_prepped >= item.suggested_qty;
        const newQty = isComplete ? 0 : item.suggested_qty; // Toggle between full and 0? Or just set to full.
        // Usually "Done" means "I did it all". If I uncheck, maybe I made a mistake, so 0 or keep as is?
        // Let's set to specific suggested value if not done.
        handleUpdateQty(item.id, newQty);
    };

    // --- CATEGORIZATION LOGIC ---
    const categorizedItems = useMemo(() => {
        const buckets = {
            urgent: [] as PlanItem[],
            prep: [] as PlanItem[],
            batch: [] as PlanItem[]
        };

        if (!plan) return buckets;

        plan.items.forEach(item => {
            const name = item.ingredient.name.toLowerCase();
            const cat = (item.ingredient.category || '').toLowerCase();

            // Heuristic Rule Engine
            if (cat.includes('salsa') || name.includes('salsa') || name.includes('caldo') || name.includes('base')) {
                buckets.batch.push(item);
            } else if (name.includes('congelado') || name.includes('marinar') || cat.includes('carnes')) {
                // Assuming meats usually need prep/marinating, simplistic logic
                buckets.prep.push(item);
            } else {
                // Default to Urgent (Fresh veg, dairy, daily usage)
                buckets.urgent.push(item);
            }
        });

        return buckets;
    }, [plan]);

    // --- GENERATION LOGIC ---
    const handleGenerate = async (guestCount: number) => {
        setLoading(true);
        try {
            // 1. Create Plan Header
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: planData, error: planError } = await supabase
                .from('production_plans')
                .insert({ target_date: todayStr, status: 'pending', predicted_covers: guestCount })
                .select()
                .single();

            if (planError) throw planError;
            const planId = planData.id;

            // 2. Simple "Explosion" Logic
            // Assumption: Each guest eats 1 Main Dish. 
            // Distribution: Randomly distributed across top active dishes (mocked by picking random items)
            // Real Logic: Should use historical product mix.

            // Fetch products/ingredients for calculation
            // We need to fetch from Supabase to match IDs suitable for plan items? 
            // Or local DB? The production_plan_items needs ingredient_id (Supabase ID? or synced ID?)
            // Assuming IDs are synced. Let's list ingredients that are "preparations"
            const { data: preps } = await supabase.from('ingredients').select('id, name, unit').eq('is_preparation', true);

            if (!preps || preps.length === 0) {
                alert("No hay sub-recetas (preparaciones) definidas para calcular.");
                setLoading(false);
                return;
            }

            // Generate Mock Items based on guest count
            // E.g. 50 guests -> ~20kg Masa, ~10L Salsa (Mock Ratios)
            const itemsToInsert = preps.map(p => ({
                plan_id: planId,
                ingredient_id: p.id,
                suggested_qty: parseFloat((Math.random() * (guestCount * 0.2)).toFixed(2)) + 1, // Mock logic: 0.2 unit per guest + 1 buffer
                actual_qty_prepped: 0,
                unit: p.unit
            }));

            const { error: itemsError } = await supabase
                .from('production_plan_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            // 3. Refresh
            fetchTodayPlan();

        } catch (err: any) {
            console.error("Error creating plan:", JSON.stringify(err, null, 2));
            alert("Error: " + (err.message || err.details || "Unknown error"));
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-white flex items-center gap-4"><RefreshCw className="animate-spin" /> Cargando Plan de Producción...</div>;

    // EMPTY STATE WITH GENERATOR
    if (!plan) return (
        <div className="bg-[#1a1a1a] min-h-screen text-white flex flex-col font-sans">
            <header className="px-8 py-6 bg-[#222] border-b border-white/5 flex justify-between items-center shadow-lg z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => window.history.back()} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <ChefHat className="text-toast-orange w-8 h-8" />
                            Plan de Producción
                        </h1>
                        <p className="text-gray-400 font-medium mt-1 uppercase tracking-wider text-sm">
                            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
                        </p>
                    </div>
                </div>
            </header>
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-500 animate-in fade-in zoom-in duration-500">
                <ChefHat className="w-24 h-24 mx-auto mb-6 text-toast-orange/20" />
                <h2 className="text-3xl font-bold mb-4 text-white">No hay plan para hoy</h2>
                <p className="max-w-md mb-8 text-lg">Indica cuántos clientes esperas para generar una orden de producción sugerida.</p>

                <div className="bg-[#2a2a2a] p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-4 w-full max-w-sm">
                    <div>
                        <label className="text-xs font-bold uppercase text-gray-400 mb-2 block text-left">Clientes Esperados</label>
                        <input
                            type="number"
                            id="guest-input"
                            defaultValue={50}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-xl focus:border-toast-orange outline-none transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => {
                            const val = (document.getElementById('guest-input') as HTMLInputElement).value;
                            handleGenerate(parseInt(val) || 0);
                        }}
                        className="bg-toast-orange hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Generar Plan
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-[#1a1a1a] min-h-screen text-white flex flex-col font-sans">
            {/* HEADER */}
            <header className="px-8 py-6 bg-[#222] border-b border-white/5 flex justify-between items-center shadow-lg z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => window.history.back()} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <ChefHat className="text-toast-orange w-8 h-8" />
                            Plan de Producción
                        </h1>
                        <p className="text-gray-400 font-medium mt-1 uppercase tracking-wider text-sm">
                            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
                        </p>
                    </div>
                </div>

                <div className="flex gap-4">
                    {/* TAB NAVIGATION */}
                    <div className="flex bg-black/30 p-1.5 rounded-xl gap-1">
                        <TabButton
                            active={activeTab === 'urgent'}
                            onClick={() => setActiveTab('urgent')}
                            icon={<AlertTriangle className="w-5 h-5" />}
                            label="Urgent Today"
                            count={categorizedItems.urgent.length}
                            color="text-red-400"
                        />
                        <TabButton
                            active={activeTab === 'prep'}
                            onClick={() => setActiveTab('prep')}
                            icon={<Clock className="w-5 h-5" />}
                            label="Prep Tomorrow"
                            count={categorizedItems.prep.length}
                            color="text-blue-400"
                        />
                        <TabButton
                            active={activeTab === 'batch'}
                            onClick={() => setActiveTab('batch')}
                            icon={<Save className="w-5 h-5" />}
                            label="Batch Cooking"
                            count={categorizedItems.batch.length}
                            color="text-emerald-400"
                        />
                    </div>
                </div>
            </header>

            {/* CONTENT */}
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-4">
                    {categorizedItems[activeTab].length === 0 ? (
                        <div className="text-center py-20 opacity-30">
                            <Check className="w-16 h-16 mx-auto mb-4" />
                            <p className="text-2xl font-bold">Todo listo en esta sección.</p>
                        </div>
                    ) : (
                        categorizedItems[activeTab].map(item => (
                            <ProductionRow
                                key={item.id}
                                item={item}
                                onUpdate={handleUpdateQty}
                                onToggle={() => toggleDone(item)}
                            />
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}

// --- SUB COMPONENTS ---

function TabButton({ active, onClick, icon, label, count, color }: any) {
    return (
        <button
            onClick={onClick}
            className={`px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-3
            ${active ? 'bg-white/10 text-white shadow-inner' : 'text-gray-500 hover:text-white hover:bg-white/5'}
            `}
        >
            <span className={active ? color : 'text-current'}>{icon}</span>
            {label}
            {count > 0 && <span className="bg-white/10 px-2 py-0.5 rounded-full text-xs">{count}</span>}
        </button>
    );
}

function ProductionRow({ item, onUpdate, onToggle }: { item: PlanItem, onUpdate: (id: number, qty: number) => void, onToggle: () => void }) {
    const isDone = item.actual_qty_prepped >= item.suggested_qty;
    const progress = Math.min(100, (item.actual_qty_prepped / item.suggested_qty) * 100);

    // Status Color
    const statusColor = isDone ? 'bg-green-500' : (progress > 0 ? 'bg-yellow-500' : 'bg-red-500');

    return (
        <div className={`
            relative overflow-hidden rounded-2xl border transition-all duration-300
            ${isDone ? 'bg-[#1a2e1a] border-green-500/30' : 'bg-[#252525] border-white/5'}
        `}>
            {/* PROGRESS BAR BACKGROUND */}
            <div
                className={`absolute left-0 top-0 bottom-0 opacity-10 transition-all duration-500 ${statusColor}`}
                style={{ width: `${progress}%` }}
            />

            <div className="flex items-center p-6 relative z-10">
                {/* CHECKBOX */}
                <button
                    onClick={onToggle}
                    className={`
                        w-16 h-16 rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all mr-6
                        ${isDone ? 'bg-green-500 border-green-500 text-black' : 'border-white/20 hover:border-white/50 text-transparent'}
                    `}
                >
                    <Check className="w-10 h-10 stroke-[3]" />
                </button>

                {/* INFO */}
                <div className="flex-1">
                    <h3 className={`text-2xl font-bold mb-1 ${isDone ? 'text-green-100 line-through decoration-green-500/50' : 'text-white'}`}>
                        {item.ingredient.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm font-mono text-gray-400 uppercase">
                        <span>Sugerido:</span>
                        <span className="text-white font-bold">{item.suggested_qty} {item.unit}</span>
                    </div>
                </div>

                {/* INPUT */}
                <div className="flex flex-col items-end gap-1">
                    <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Producido</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            className={`
                                w-32 h-16 text-3xl font-mono font-bold text-center bg-black/40 border-2 rounded-xl outline-none focus:scale-105 transition-all
                                ${isDone ? 'border-green-500/50 text-green-400' : 'border-white/10 text-white focus:border-toast-orange'}
                            `}
                            value={item.actual_qty_prepped}
                            onChange={(e) => onUpdate(item.id, parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-xl font-bold text-gray-500 w-8">{item.unit}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
