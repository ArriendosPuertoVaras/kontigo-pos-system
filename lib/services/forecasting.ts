import { supabase } from '@/lib/supabase';
import { startOfDay } from 'date-fns';

/**
 * PRODUCTION FORECASTING ENGINE
 * Generates a daily production plan based on sales history and current stock.
 */

// Configuration
const SAFETY_MARGIN = 1.15; // 15% buffer
const LOOKBACK_WEEKS = 4;

interface ProductionPlanItem {
    ingredient_id: number;
    suggested_qty: number;
    unit?: string;
}

export async function generateDailyProductionPlan(targetDate: Date) {
    try {
        console.log(`🤖 Starting Production Forecast for: ${targetDate.toISOString()}`);

        // 1. Create the Master Plan Record
        const { data: plan, error: planError } = await supabase
            .from('production_plans')
            .insert({
                target_date: targetDate, // Supabase handles Date objects -> ISO string
                status: 'pending'
            })
            .select()
            .single();

        if (planError || !plan) throw new Error(`Failed to create plan: ${planError?.message}`);
        const planId = plan.id;
        console.log(`✅ Plan Created (ID: ${planId})`);

        // 2. Fetch Active Menu Items (Products)
        // detailedColumns ensures we get the recipe JSON
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('id, name, recipe')
            .eq('isAvailable', true); // Assuming active items only

        if (prodError || !products) throw new Error(`Failed to fetch products: ${prodError?.message}`);

        // 3. Aggregate Demand (The "Recipe Explosion")
        // We calculate TOTAL demand for each ingredient across ALL predicted dishes.
        // Map<IngredientID, TotalQuantityNeeded>
        const ingredientDemand = new Map<number, number>();

        // We also need the day of week (0=Sunday, 6=Saturday) matching postgres
        const dayOfWeek = targetDate.getDay();

        for (const product of products) {
            if (!product.recipe || !Array.isArray(product.recipe)) continue;

            // A. PREDICTION
            // Call the RPC function to get historical average
            const { data: avgSales, error: rpcError } = await supabase
                .rpc('get_avg_sales_last_4_weeks', {
                    p_item_id: product.id,
                    p_day_int: dayOfWeek
                });

            if (rpcError) {
                console.error(`RPC Error for product ${product.id}:`, rpcError);
                continue;
            }

            const predictedQty = (avgSales || 0) * SAFETY_MARGIN;

            if (predictedQty <= 0) continue;

            // B. EXPLOSION
            for (const item of product.recipe) {
                const totalForItem = predictedQty * item.quantity;
                const currentTotal = ingredientDemand.get(item.ingredientId) || 0;
                ingredientDemand.set(item.ingredientId, currentTotal + totalForItem);
            }
        }

        // 4. Stock Deduction & Plan Item Generation
        const planItemsToInsert = [];

        // Fetch current stock for all involved ingredients
        const ingredientIds = Array.from(ingredientDemand.keys());
        if (ingredientIds.length > 0) {
            const { data: ingredients, error: ingError } = await supabase
                .from('ingredients')
                .select('id, stock, unit')
                .in('id', ingredientIds);

            if (ingError) throw new Error(`Failed to fetch ingredients: ${ingError.message}`);

            // Create a lookup map for ingredients
            const ingredientMap = new Map(ingredients.map(i => [i.id, i]));

            for (const [ingId, neededQty] of ingredientDemand.entries()) {
                const ingredient = ingredientMap.get(ingId);
                const currentStock = ingredient?.stock || 0;
                const unit = ingredient?.unit || 'un';

                // C. DEDUCTION
                const toPrep = Math.max(0, neededQty - currentStock);

                // Only add to plan if we actually need to prep something
                if (toPrep > 0) {
                    planItemsToInsert.push({
                        plan_id: planId,
                        ingredient_id: ingId,
                        suggested_qty: parseFloat(toPrep.toFixed(4)), // Precision handling
                        actual_qty_prepped: 0,
                        unit: unit,
                        // recipe_id: null // Implicitly null as this is raw ingredient prep
                    });
                }
            }
        }

        // 5. Bulk Insert Items
        if (planItemsToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('production_plan_items')
                .insert(planItemsToInsert);

            if (insertError) throw new Error(`Failed to insert plan items: ${insertError.message}`);
        }

        console.log(`🚀 Production Plan Generated Successfully! Items: ${planItemsToInsert.length}`);
        return { success: true, planId, itemsCount: planItemsToInsert.length };

    } catch (error: any) {
        console.error("❌ Production Forecasting Failed:", error.message);
        return { success: false, error: error.message };
    }
}
