
import { useState, useMemo } from 'react';
import { Ingredient } from '@/lib/db';
import { Calculator, DollarSign, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';

// Helper to convert units to a common base (e.g., everything to 'unit' 'kg' 'lt')
// Returns multiplier to convert FROM 'unit' TO 'base'
// We normalize TO the Ingredient's Native Cost Unit
function getConversionMultiplier(fromUnit: string, toUnit: string): number {
    const normalize = (u: string) => u.toLowerCase().trim();
    const from = normalize(fromUnit);
    const to = normalize(toUnit);

    if (from === to) return 1;

    // Mass
    if (to === 'kg') {
        if (from === 'gr' || from === 'g') return 0.001;
    }
    if (to === 'gr' || to === 'g') {
        if (from === 'kg') return 1000;
    }

    // Volume
    if (to === 'lt' || to === 'l') {
        if (from === 'ml' || from === 'cc') return 0.001;
    }
    if (to === 'ml' || to === 'cc') {
        if (from === 'lt' || from === 'l') return 1000;
    }

    // Fallback (e.g. Un -> Kg is impossible without density, assuming 1:1 error or handled upstream)
    return 1;
}

export function FinancialAnalysisBar({
    items,
    allIngredients,
    currentPrice,
    onApplyPrice
}: {
    items: { ingredientId: number, quantity: number, unit?: string }[],
    allIngredients: Ingredient[],
    currentPrice: number,
    onApplyPrice: (price: number) => void
}) {
    const [targetMargin, setTargetMargin] = useState(30); // Default 30% Food Cost

    // 1. Calculate Total Cost
    const totalCost = useMemo(() => {
        return items.reduce((sum, item) => {
            const ing = allIngredients.find(i => i.id === item.ingredientId);
            if (!ing) return sum;

            // Cost Calculation:
            // Ingredient Cost is per Ingredient Unit
            // Usage is Item Quantity in Item Unit
            // We need to convert Item Unit -> Ingredient Unit
            const multiplier = getConversionMultiplier(item.unit || ing.unit, ing.unit); // Convert usage to cost unit

            // However, cost is usually per 'purchaseUnit'.
            // Simplification: Assumes ing.cost is cost per ing.unit. 
            // In a real advanced system, we'd check purchaseUnit vs usage unit.
            // For this app's context based on `ingredients` table: `cost` seems to be unit cost.

            const cost = ing.cost * (item.quantity * multiplier);
            return sum + (isNaN(cost) ? 0 : cost);
        }, 0);
    }, [items, allIngredients]);

    // 2. Metrics
    const foodCostPercentage = currentPrice > 0 ? (totalCost / currentPrice) * 100 : 0;
    const grossMargin = currentPrice - totalCost;

    // 3. Suggested Price
    // Formula: Cost / (Target% / 100)
    // If target is 30% (0.3), Price = Cost / 0.3
    const suggestedPrice = targetMargin > 0 ? Math.ceil((totalCost / (targetMargin / 100)) / 10) * 10 : 0; // Round to 10

    // Color logic
    const marginColor = foodCostPercentage > 40 ? 'text-red-500' : foodCostPercentage > 30 ? 'text-yellow-500' : 'text-green-500';

    return (
        <div className="bg-[#1a1a1a] p-4 border-t border-white/5 grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">

            {/* 1. COSTO ACTUAL */}
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-blue-500/10 text-blue-400">
                    <Calculator className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500">Costo Total Receta</p>
                    <p className="text-xl font-bold text-white">${Math.round(totalCost).toLocaleString()}</p>
                </div>
            </div>

            {/* 2. RENTABILIDAD  */}
            <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full bg-opacity-10 ${foodCostPercentage > 40 ? 'bg-red-500 text-red-500' : 'bg-green-500 text-green-500'}`}>
                    <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500">Food Cost Actual</p>
                    <div className="flex items-baseline gap-2">
                        <p className={`text-xl font-bold ${marginColor}`}>
                            {foodCostPercentage.toFixed(1)}%
                        </p>
                        {foodCostPercentage > 40 && <AlertTriangle className="w-3 h-3 text-red-500" />}
                    </div>
                </div>
            </div>

            {/* 3. SIMULADOR HEADER (SPAN 2) */}
            <div className="lg:col-span-2 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] uppercase font-bold text-toast-orange flex items-center gap-2">
                        <DollarSign className="w-3 h-3" /> Calculadora de Precio Inteligente
                    </p>
                    <span className="text-xs font-bold text-white bg-black/40 px-2 py-0.5 rounded">
                        Meta Costo: {targetMargin}%
                    </span>
                </div>

                <div className="flex gap-4 items-center">
                    <input
                        type="range"
                        min="15"
                        max="60"
                        step="1"
                        value={targetMargin}
                        onChange={e => setTargetMargin(Number(e.target.value))}
                        className="flex-1 accent-toast-orange h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />

                    <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                        <div>
                            <p className="text-[9px] text-gray-500">Sugerido</p>
                            <p className="text-lg font-bold text-white">${suggestedPrice.toLocaleString()}</p>
                        </div>
                        <button
                            onClick={() => onApplyPrice(suggestedPrice)}
                            className="bg-toast-orange hover:bg-orange-600 text-white p-2 rounded-lg transition-colors"
                            title="Aplicar Precio Sugerido"
                        >
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

        </div>
    )
}
