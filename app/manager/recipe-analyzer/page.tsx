'use client';
import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product, Ingredient } from '@/lib/db';
import { analyzeRecipe, RecipeAnalysisResult } from '@/lib/recipes';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, ChefHat, Plus, Save, Trash2, Calculator } from 'lucide-react';
import { RecipeBuilderModal } from '@/components/RecipeBuilderModal';
import Link from 'next/link';

export default function RecipeAnalyzerPage() {
    const products = useLiveQuery(() => db.products.toArray());
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
    const [analysis, setAnalysis] = useState<RecipeAnalysisResult | null>(null);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [targetCostPercentage, setTargetCostPercentage] = useState(30); // Default target 30%

    // Fetch Ingredients Map for efficient lookup
    const ingredientsMap = useLiveQuery(async () => {
        const ings = await db.ingredients.toArray();
        return new Map(ings.map(i => [i.id!, i]));
    });

    useEffect(() => {
        if (selectedProductId && products && ingredientsMap) {
            const prod = products.find(p => p.id === selectedProductId);
            if (prod) {
                const result = analyzeRecipe(prod, ingredientsMap);
                setAnalysis(result);
            }
        }
    }, [selectedProductId, products, ingredientsMap]);

    const handleProductChange = (id: number) => {
        setSelectedProductId(id);
    };

    if (!products || !ingredientsMap) return <div className="p-10 text-white">Cargando laboratorio...</div>;

    const formatPrice = (amount: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);

    return (
        <div className="h-screen overflow-y-auto bg-[#1a1a1a] text-white p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/tables" className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-2">
                            <ChefHat className="text-toast-orange w-8 h-8" />
                            Laboratorio de Costos
                        </h1>
                        <p className="text-gray-400">Análisis financiero de recetas en tiempo real</p>
                    </div>
                </div>

                {/* SELECTOR */}
                <div className="bg-[#2a2a2a] p-6 rounded-2xl border border-white/10 mb-8 shadow-xl">
                    <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">Seleccionar Plato a Analizar</label>
                    <select
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xl font-bold text-white focus:border-toast-orange focus:ring-1 focus:ring-toast-orange outline-none"
                        onChange={(e) => handleProductChange(Number(e.target.value))}
                        value={selectedProductId || ''}
                    >
                        <option value="">-- Selecciona un plato del menú --</option>
                        {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    {selectedProductId && (
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => setIsBuilderOpen(true)}
                                className="inline-flex items-center gap-2 bg-toast-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-orange-500/20"
                            >
                                <ChefHat className="w-4 h-4" />
                                {analysis && analysis.ingredients.length > 0 ? "Editar Receta" : "Crear Receta"}
                            </button>
                        </div>
                    )}
                </div>

                {analysis && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4 duration-500">

                        {/* LEFT: FINANCIAL DASHBOARD */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* KPI CARD: TOTAL COST */}
                            <div className="bg-[#2a2a2a] p-6 rounded-2xl border border-white/10 shadow-lg relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <TrendingUp className="w-24 h-24 text-gray-400" />
                                </div>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Costo Real (Receta)</p>
                                <div className="text-4xl font-extrabold text-white mb-2">{formatPrice(analysis.financials.total_cost)}</div>
                                <div className="text-xs text-gray-500">Calculado con precios de hoy</div>
                            </div>

                            {/* KPI CARD: MARGIN & TRAFFIC LIGHT */}
                            <div className={`p-6 rounded-2xl border shadow-lg relative overflow-hidden transition-all
                                ${analysis.financials.profitability_status === 'Excellent' ? 'bg-[#0f3923] border-[#1b5e3a]' : // Darker Green Background
                                    analysis.financials.profitability_status === 'Healthy' ? 'bg-blue-900/20 border-blue-800/50' :
                                        analysis.financials.profitability_status === 'Alert' ? 'bg-yellow-900/20 border-yellow-700/50' :
                                            'bg-[#3a0b0e] border-[#5c1216]'}`}> {/* Darker Red (Wine) Background */}

                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <p className={`text-sm font-bold uppercase tracking-widest mb-1
                                            ${analysis.financials.profitability_status === 'Excellent' ? 'text-[#4ade80] opacity-80' : // Muted Green Text
                                                analysis.financials.profitability_status === 'Healthy' ? 'text-blue-400' :
                                                    analysis.financials.profitability_status === 'Alert' ? 'text-yellow-400' :
                                                        'text-[#ff8080]'}`}> {/* Wine-ish Red Text */}
                                            Food Cost %
                                        </p>
                                        <div className={`text-5xl font-extrabold
                                            ${analysis.financials.profitability_status === 'Excellent' ? 'text-[#22c55e]' : // Darker Green (Emerald 500)
                                                analysis.financials.profitability_status === 'Healthy' ? 'text-blue-500' :
                                                    analysis.financials.profitability_status === 'Alert' ? 'text-yellow-500' :
                                                        'text-[#a01a25]'}`}> {/* Wine Red (Vino Tinto) */}
                                            {analysis.financials.food_cost_percentage}%
                                        </div>
                                    </div>
                                    {analysis.financials.profitability_status === 'Excellent' && <CheckCircle2 className="w-12 h-12 text-[#15803d]" />} {/* Dark Green Icon */}
                                    {analysis.financials.profitability_status === 'Alert' && <AlertTriangle className="w-12 h-12 text-yellow-600" />}
                                    {analysis.financials.profitability_status === 'Critical' && <TrendingDown className="w-12 h-12 text-[#721c24]" />} {/* Wine Icon */}
                                </div>

                                <div className="space-y-2 border-t border-black/20 pt-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Precio Venta (Neto):</span>
                                        <span className="font-mono font-bold">{formatPrice(analysis.selling_price_net || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Precio Venta (IVA Inc):</span>
                                        <span className="font-mono font-bold text-gray-300">{formatPrice((analysis.selling_price_net || 0) * 1.19)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Margen Bruto:</span>
                                        <span className="font-mono font-bold text-white">
                                            {formatPrice((analysis.selling_price_net || 0) - analysis.financials.total_cost)}
                                        </span>
                                    </div>
                                </div>

                                {/* Status Badge */}
                                <div className={`inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold uppercase
                                     ${analysis.financials.profitability_status === 'Excellent' ? 'bg-[#15803d] text-white' : // Dark Green Badge
                                        analysis.financials.profitability_status === 'Healthy' ? 'bg-blue-700 text-white' :
                                            analysis.financials.profitability_status === 'Alert' ? 'bg-yellow-700 text-white' :
                                                'bg-[#721c24] text-white'}`}> {/* Wine Red Badge */}
                                    {analysis.financials.profitability_status === 'Excellent' && 'Rentabilidad Excelente'}
                                    {analysis.financials.profitability_status === 'Healthy' && 'Rentabilidad Saludable'}
                                    {analysis.financials.profitability_status === 'Alert' && 'Revisar Margen'}
                                    {analysis.financials.profitability_status === 'Critical' && 'Pérdida Crítica'}
                                </div>
                            </div>

                            {/* PRICE SIMULATOR CARD */}
                            <div className="bg-[#2a2a2a] p-6 rounded-2xl border border-white/10 shadow-lg mb-8">
                                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                                    <Calculator className="w-5 h-5 text-toast-orange" />
                                    <h3 className="font-bold text-sm text-gray-300 uppercase tracking-widest">Simulador de Precios</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Food Cost Objetivo (%)</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-bold focus:border-toast-orange outline-none"
                                                value={targetCostPercentage}
                                                onChange={(e) => setTargetCostPercentage(Number(e.target.value))}
                                                min={15} max={100}
                                            />
                                            <span className="text-gray-400 font-bold">%</span>
                                        </div>
                                    </div>

                                    <div className="bg-black/20 p-3 rounded-lg space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">Precio Sugerido (Neto)</span>
                                            <span className="font-mono font-bold text-white">
                                                {formatPrice(Math.ceil((analysis.financials.total_cost / (targetCostPercentage / 100)) / 10) * 10)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">Precio Sugerido (Carta)</span>
                                            <span className="font-mono font-bold text-toast-orange">
                                                {formatPrice(Math.ceil(((analysis.financials.total_cost / (targetCostPercentage / 100)) * 1.19) / 10) * 10)}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {
                                            if (!selectedProductId) return;
                                            const newNet = Math.ceil((analysis.financials.total_cost / (targetCostPercentage / 100)) / 10) * 10;
                                            if (confirm(`¿Actualizar precio del producto a ${formatPrice(newNet)} (Neto)?`)) {
                                                await db.products.update(selectedProductId, { price: newNet });
                                                alert("Precio actualizado correctamente");
                                            }
                                        }}
                                        className="w-full bg-white/5 hover:bg-toast-orange hover:text-white text-gray-300 py-2 rounded-lg font-bold text-xs transition-all flex justify-center items-center gap-2 border border-white/5 hover:border-transparent"
                                    >
                                        <Save className="w-4 h-4" /> Aplicar Precio Sugerido
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: INGREDIENT BREAKDOWN */}
                        <div className="lg:col-span-2 bg-[#2a2a2a] rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <h3 className="font-bold text-xl text-white">Estructura de Costos</h3>
                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3" />
                                    Actualizado instántaneamente
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-black/20 text-xs text-gray-400 uppercase tracking-wider font-bold">
                                        <tr>
                                            <th className="px-6 py-4">Insumo</th>
                                            <th className="px-6 py-4 text-center">Rendimiento (Yield)</th>
                                            <th className="px-6 py-4 text-right">Cant. Bruta (Inv)</th>
                                            <th className="px-6 py-4 text-right">Costo Unit. Real</th>
                                            <th className="px-6 py-4 text-right">Costo Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {analysis.ingredients.map((ing, idx) => (
                                            <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4 font-medium text-white">
                                                    {ing.name}
                                                    {ing.gross_quantity_inventory !== ing.net_quantity_plate && (
                                                        <span className="block text-[10px] text-gray-500">
                                                            Inv: {ing.gross_quantity_inventory} {ing.purchase_unit}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${ing.yield_percent < 0.8 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                                        {(ing.yield_percent * 100).toFixed(0)}%
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-toast-orange font-mono text-sm font-bold">
                                                    {ing.net_quantity_plate} {ing.recipe_unit}
                                                    {ing.recipe_unit !== ing.purchase_unit && (
                                                        <span className="block text-[10px] text-gray-500 font-normal">
                                                            ({ing.gross_quantity_inventory} {ing.purchase_unit})
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-400 font-mono text-xs">
                                                    {formatPrice(ing.unit_cost_real)}/{ing.purchase_unit}
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-white font-mono">
                                                    {formatPrice(ing.total_line_cost)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-white/5 font-bold text-white border-t border-white/10">
                                        <tr>
                                            <td colSpan={4} className="px-6 py-4 text-right uppercase text-xs tracking-wider text-gray-400">Costo Total Receta</td>
                                            <td className="px-6 py-4 text-right text-lg text-toast-orange">{formatPrice(analysis.financials.total_cost)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* WARNINGS FOOTER */}
                            {analysis.warnings.length > 0 && (
                                <div className="p-4 bg-red-900/10 border-t border-red-500/20">
                                    <h4 className="text-red-400 font-bold text-sm mb-2 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" /> Alertas detectadas por el sistema:
                                    </h4>
                                    <ul className="list-disc list-inside text-xs text-red-300/80 space-y-1">
                                        {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* NEW: QUICK DETAILS LIST BELOW CARDS */}
                {analysis && selectedProductId && (
                    <div className="mt-8 pb-32"> {/* Added ample padding for scrolling */}
                        <h3 className="text-gray-500 uppercase tracking-widest text-xs font-bold mb-4">Detalle del Producto</h3>
                        <div className="bg-[#1e1e1e] border border-white/5 rounded-lg overflow-hidden divide-y divide-white/5">
                            <div className="flex items-center text-xs text-gray-500 font-bold bg-white/5 px-6 py-3 uppercase tracking-wider">
                                <div className="flex-1">Producto</div>
                                <div className="w-32 text-right">Costo Receta</div>
                                <div className="w-32 text-right">Venta Neto</div>
                                <div className="w-32 text-right">Venta c/IVA</div>
                            </div>
                            <div className="flex items-center px-6 py-4 hover:bg-white/5 transition-colors">
                                <div className="flex-1">
                                    <button
                                        onClick={() => setIsBuilderOpen(true)}
                                        className="font-bold text-white hover:text-toast-orange transition-colors flex items-center gap-2 group text-left"
                                    >
                                        {products?.find(p => p.id === selectedProductId)?.name}
                                        <ChefHat className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                </div>
                                <div className="w-32 text-right font-mono text-gray-300">
                                    {formatPrice(analysis.financials.total_cost)}
                                </div>
                                <div className="w-32 text-right font-mono text-gray-300">
                                    {formatPrice(analysis.selling_price_net || 0)}
                                </div>
                                <div className="w-32 text-right font-mono text-toast-orange font-bold">
                                    {formatPrice((analysis.selling_price_net || 0) * 1.19)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* EMPTY STATE */}
                {!analysis && selectedProductId && (
                    <div className="py-20 text-center">
                        <div className="animate-spin w-10 h-10 border-4 border-toast-orange border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-gray-400">El Analista está calculando costos...</p>
                    </div>
                )}

                {!selectedProductId && (
                    <div className="py-20 text-center border-2 border-dashed border-white/10 rounded-2xl bg-white/5">
                        <ChefHat className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-400">Selecciona un plato para comenzar el análisis</h3>
                        <p className="text-gray-500 mt-2 max-w-md mx-auto">
                            El sistema consultará los precios actuales de todos los insumos y calculará la rentabilidad basada en la receta técnica.
                        </p>
                    </div>
                )}
            </div>

            {/* RECIPE BUILDER MODAL */}
            {isBuilderOpen && selectedProductId && (
                <RecipeBuilderModal
                    entityId={selectedProductId}
                    entityType="product"
                    onClose={() => setIsBuilderOpen(false)}
                    onSave={() => {
                        setIsBuilderOpen(false);
                        // Trigger re-analysis by briefly resetting ID or relying on live query?
                        // Dexie useLiveQuery should auto-update 'products', triggering the effect.
                    }}
                />
            )}
        </div>
    );
}
