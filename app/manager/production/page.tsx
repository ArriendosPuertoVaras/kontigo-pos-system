'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product, RecipeItem, Ingredient } from '@/lib/db';
import { useState } from 'react';
import { ChefHat, Minus, Plus, Save, AlertCircle, ArrowLeft, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { syncService } from '@/lib/sync_service';
import { getRecipeItemConversion } from '@/lib/recipes';

// Helper to calculate max possible production based on ingredients
function calculateMaxProduction(product: Product, ingredients: Ingredient[]) {
    if (!product.recipe || product.recipe.length === 0) return 999;

    let max = 9999;

    for (const item of product.recipe) {
        const ingredient = ingredients.find(i => i.id === item.ingredientId);
        if (!ingredient) continue;

        // If ingredient has 0 or less stock, max is 0
        if (ingredient.stock <= 0) return 0;

        // Use normalized quantity (in ingredient units)
        const { convertedQuantity } = getRecipeItemConversion(ingredient, item);
        if (convertedQuantity <= 0) continue;

        // Calculate how many times we can fit the recipe item in the stock
        const possible = Math.floor(ingredient.stock / convertedQuantity);
        if (possible < max) max = possible;
    }

    return max;
}

export default function ProductionPage() {
    const router = useRouter();
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState<number>(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allowNegativeStock, setAllowNegativeStock] = useState(false);

    // Fetch Kitchen Products with Recipes
    const products = useLiveQuery(async () => {
        const all = await db.products.toArray();
        const cats = await db.categories.toArray();

        // Filter for Kitchen items that HAVE a recipe
        return all.filter(p => {
            const cat = cats.find(c => c.id === p.categoryId);
            const isKitchen = cat?.destination === 'kitchen';
            const hasRecipe = p.recipe && p.recipe.length > 0;
            return isKitchen && hasRecipe;
        }).sort((a, b) => a.name.localeCompare(b.name));
    });

    const ingredients = useLiveQuery(() => db.ingredients.toArray());

    const selectedProduct = products?.find(p => p.id === selectedProductId);

    // Calculate details for the selected product
    const maxProduction = selectedProduct && ingredients
        ? calculateMaxProduction(selectedProduct, ingredients)
        : 0;

    const canProduce = selectedProduct && (allowNegativeStock || (quantity > 0 && quantity <= maxProduction));

    const handleProduce = async () => {
        if (!selectedProduct || !canProduce || !ingredients) return;

        setIsSubmitting(true);
        try {
            await db.transaction('rw', [db.ingredients, db.products, db.productionLogs], async () => {
                // 1. Deduct Ingredients
                if (selectedProduct.recipe) {
                    for (const item of selectedProduct.recipe) {
                        const ingredient = ingredients.find(i => i.id === item.ingredientId);
                        if (ingredient) {
                            // Use conversion to deduce correct amount in ingredient's unit
                            const { convertedQuantity } = getRecipeItemConversion(ingredient, item);
                            const amountNeeded = convertedQuantity * quantity;

                            await db.ingredients.update(ingredient.id!, {
                                stock: ingredient.stock - amountNeeded
                            });
                        }
                    }
                }

                // 2. Increase Product Stock
                const currentStock = selectedProduct.stock || 0;
                await db.products.update(selectedProduct.id!, {
                    stock: currentStock + quantity
                });

                // 3. Log History
                await db.productionLogs.add({
                    productId: selectedProduct.id!,
                    productName: selectedProduct.name,
                    quantity: quantity,
                    date: new Date(),
                });
            });

            // 4. Trigger Sync
            if (navigator.onLine) {
                syncService.autoSync(db.products, 'products').catch(console.error);
                syncService.autoSync(db.ingredients, 'ingredients').catch(console.error);
                syncService.autoSync(db.productionLogs, 'production_logs').catch(console.error);
            }

            toast.success(`Producción Registrada: +${quantity} ${selectedProduct.name}`);
            setQuantity(1); // Reset
            setAllowNegativeStock(false);

        } catch (error) {
            console.error("Production Error:", error);
            toast.error("Error al registrar producción");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!products || !ingredients) return <div className="p-8 text-white">Cargando datos...</div>;

    return (
        <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden">
            <header className="flex-none p-6 border-b border-white/10 flex justify-between items-center bg-gray-800/50">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6 text-gray-300" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <ChefHat className="text-orange-500" />
                            Producción de Cocina
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Registra preparaciones para control de stock por lote.</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* LEFT: Product List */}
                <div className="w-1/3 border-r border-white/10 overflow-y-auto p-4 space-y-2">
                    <h2 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">Recetas Disponibles</h2>
                    {products.length === 0 && (
                        <div className="text-gray-500 text-center py-8">
                            No hay productos de cocina con receta configurada.
                        </div>
                    )}
                    {products.map(product => (
                        <button
                            key={product.id}
                            onClick={() => { setSelectedProductId(product.id || null); setQuantity(1); }}
                            className={`w-full text-left p-3 rounded-xl transition-all flex justify-between items-center group
                                ${selectedProductId === product.id
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                }`}
                        >
                            <span className="font-medium truncate">{product.name}</span>
                            <div className="flex flex-col items-end">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${(product.stock || 0) > 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                                    }`}>
                                    Stock: {product.stock || 0}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* RIGHT: Production Form */}
                <div className="flex-1 p-8 bg-gray-900 overflow-y-auto">
                    {selectedProduct ? (
                        <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4">
                            {/* Product Header */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-3xl font-bold text-white">{selectedProduct.name}</h2>
                                    <div className="flex items-center gap-2 text-gray-400 mt-2">
                                        <Package className="w-4 h-4" />
                                        <span>Stock Actual: <b className="text-white">{selectedProduct.stock || 0}</b></span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-gray-400">Máximo Producible</div>
                                    <div className="text-2xl font-mono font-bold text-green-400">
                                        {maxProduction} uni.
                                    </div>
                                    <div className="text-xs text-gray-500">según ingredientes</div>
                                </div>
                            </div>

                            {/* Quantity Input */}
                            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                                <label className="block text-sm font-medium text-gray-400 mb-4">Cantidad a Producir</label>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3 bg-black/30 p-2 rounded-xl border border-white/10">
                                        <button
                                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                            className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 active:scale-95 transition-all text-white"
                                        >
                                            <Minus className="w-6 h-6" />
                                        </button>
                                        <input
                                            type="number"
                                            value={quantity}
                                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                                            className="w-24 text-center bg-transparent text-3xl font-bold text-white outline-none"
                                        />
                                        <button
                                            onClick={() => setQuantity(Math.min(maxProduction, quantity + 1))}
                                            className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 active:scale-95 transition-all text-white"
                                        >
                                            <Plus className="w-6 h-6" />
                                        </button>
                                    </div>

                                    <button
                                        onClick={handleProduce}
                                        disabled={!canProduce || isSubmitting}
                                        className={`flex-1 h-16 rounded-xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg transition-all
                                            ${canProduce
                                                ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/20 active:scale-95'
                                                : allowNegativeStock
                                                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white shadow-yellow-500/20 active:scale-95'
                                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-50'
                                            }`}
                                    >
                                        {isSubmitting ? 'Guardando...' : (
                                            <>
                                                {allowNegativeStock ? <AlertTriangle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                                                {allowNegativeStock ? 'Forzar Producción' : 'Registrar Producción'}
                                            </>
                                        )}
                                    </button>
                                </div>
                                {quantity > maxProduction && (
                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="text-red-400 text-sm flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            <span>Ingredientes insuficientes en sistema.</span>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={allowNegativeStock}
                                                onChange={(e) => setAllowNegativeStock(e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500"
                                            />
                                            <span className="text-sm text-gray-400 group-hover:text-white transition-colors">
                                                Forzar (Stock Negativo)
                                            </span>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Ingredient Impact Preview */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4 text-gray-200">Impacto en Inventario</h3>
                                <div className="bg-black/20 rounded-xl overflow-hidden border border-white/5">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white/5 text-gray-400">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Ingrediente</th>
                                                <th className="px-4 py-3 text-right">Requerido (Receta)</th>
                                                <th className="px-4 py-3 text-right">Descuento Total ({quantity})</th>
                                                <th className="px-4 py-3 text-right">Disponible</th>
                                                <th className="px-4 py-3 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {selectedProduct.recipe?.map((item, idx) => {
                                                const ingredient = ingredients.find(i => i.id === item.ingredientId);
                                                if (!ingredient) return null;

                                                const { convertedQuantity, resolvedUnit } = getRecipeItemConversion(ingredient, item);
                                                const totalNeeded = convertedQuantity * quantity;
                                                const hasStock = ingredient.stock >= totalNeeded;

                                                return (
                                                    <tr key={idx} className="hover:bg-white/5">
                                                        <td className="px-4 py-3 text-gray-300 font-medium">{ingredient.name}</td>
                                                        <td className="px-4 py-3 text-right text-gray-500">
                                                            {item.quantity} {resolvedUnit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-white font-bold">
                                                            {totalNeeded.toFixed(3)} {ingredient.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-400">
                                                            {ingredient.stock?.toFixed(3)} {ingredient.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {hasStock ? (
                                                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>
                                                            ) : (
                                                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 animate-in fade-in zoom-in-95">
                            <ChefHat className="w-24 h-24 mb-6 opacity-20" />
                            <p className="text-xl font-medium">Selecciona una receta para comenzar</p>
                            <p className="text-sm mt-2 max-w-md text-center opacity-60">
                                Solo aparecen productos configurados como "Cocina" y que tienen una receta válida.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
