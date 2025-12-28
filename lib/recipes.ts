import { Ingredient, Product, RecipeItem, db } from './db';

// --- INTERFACES BASED ON "MASTER RECIPE ARCHITECT" SPEC ---

export type RecipeCategory = 'Menu Item' | 'Sub-Recipe';
export type IngredientType = 'Raw Material' | 'Sub-Recipe';
export type PurchaseUnit = 'kg' | 'lt' | 'un';

export interface RecipeIngredientAnalysis {
    name: string;
    type: IngredientType;
    purchase_unit: string;
    recipe_unit: string; // New field for clarity
    yield_percent: number; // 0.0 to 1.0 (e.g., 0.85)
    gross_quantity_inventory: number; // The amount deducted from stock (Net / Yield)
    net_quantity_plate: number; // The amount actually consumed/served
    unit_cost_real: number; // Purchase Price / Yield
    total_line_cost: number; // unit_cost_real * total usage
}



export interface RecipeFinancials {
    total_cost: number;
    selling_price_net: number | null; // Null for sub-recipes
    suggested_min_price: number; // Cost / 0.30
    food_cost_percentage: number | null; // Cost / Selling Net
    profitability_status: 'Excellent' | 'Healthy' | 'Alert' | 'Critical' | 'N/A';
}

export interface RecipeAnalysisResult {
    recipe_name: string;
    category: RecipeCategory;
    selling_price_net: number | null;
    ingredients: RecipeIngredientAnalysis[];
    financials: RecipeFinancials;
    warnings: string[];
}

// --- LOGIC ENGINE ---

/**
 * Computes the conversion factor and normalized quantity for a recipe item
 * based on the ingredient's inventory unit.
 */
export function getRecipeItemConversion(
    ingredient: Ingredient,
    recipeItem: { quantity: number, unit?: string }
): { factor: number, convertedQuantity: number, warning?: string, resolvedUnit: string } {

    const dbUnit = ingredient.unit.toLowerCase().trim();
    let recipeUnit = recipeItem.unit ? recipeItem.unit.toLowerCase().trim() : dbUnit;

    let conversionFactor = 1;
    let warning: string | undefined;

    // Weight Conversions
    if ((dbUnit === 'kg' || dbUnit === 'kilo') && (recipeUnit === 'g' || recipeUnit === 'gr' || recipeUnit === 'gramos')) {
        conversionFactor = 0.001;
    } else if ((dbUnit === 'g' || dbUnit === 'gr') && (recipeUnit === 'kg' || recipeUnit === 'kilo')) {
        conversionFactor = 1000;
    }

    // Volume Conversions
    else if ((dbUnit === 'lt' || dbUnit === 'l' || dbUnit === 'litro') && (recipeUnit === 'ml' || recipeUnit === 'cc')) {
        conversionFactor = 0.001;
    } else if ((dbUnit === 'ml' || dbUnit === 'cc') && (recipeUnit === 'lt' || recipeUnit === 'l' || recipeUnit === 'litro')) {
        conversionFactor = 1000;
    }

    // Fallback for Mismatches
    else if (dbUnit !== recipeUnit) {
        // Check for Critical "Unit vs Weight" error
        const isGOrMl = ['g', 'gr', 'gramo', 'gram', 'gramos', 'ml', 'cc', 'mililitro'].includes(recipeUnit);
        const isUnit = ['un', 'u', 'und', 'unidad'].includes(dbUnit);

        if (isUnit && isGOrMl) {
            // KITCHEN STANDARD ASSUMPTION: 
            // If buying in "Units" (e.g. 1 Box of Milk) and recipe uses "ml" (e.g. 100ml).
            // We ASSUME 1 Unit = 1000 ml/g (1 Litre/Kilo Standard).
            if (recipeItem.quantity > 1.0) {
                conversionFactor = 0.001;
                warning = `ℹ️ Auto-Corrección (${ingredient.name}): Inventario en 'Unidad', Receta en '${recipeUnit}'. Se asumió 1 Unidad = 1000 ${recipeUnit}.`;
            } else {
                warning = `⚠️ Ambigüedad en ${ingredient.name}: Inv='Unidad', Receta='${recipeUnit}'. Se usó factor 1. Verificar.`;
            }
        }
    }

    // --- HEURISTIC SAFEGUARD (Auto-Correction) ---
    // Fixes "8 un" walnuts case where Inventory is KG.
    // If conversionFactor is 1 (No direct conversion found)
    // AND dbUnit is Mass/Vol (Kg/Lt)
    // AND Quantity > 2 (implied grams/units mismatch)
    const isDbMassVol = ['kg', 'kilo', 'kilogramo', 'lt', 'l', 'litro', 'liter'].includes(dbUnit);

    if (conversionFactor === 1 && isDbMassVol && recipeItem.quantity > 2.0) {
        conversionFactor = 0.001;
        warning = `ℹ️ Auto-Corrección (${ingredient.name}): Cantidad ${recipeItem.quantity} es alta para '${dbUnit}'. Se asumió gramos/ml y se dividió por 1000.`;

        // CORRECTION: If we are assuming it is grams because context implies it, 
        // we should report it as 'gr' to the UI to avoid confusion (Calculated as grams, displayed as Units).
        // 1 un of walnuts -> 1 gr of walnuts
        recipeUnit = 'gr';
    }

    return {
        factor: conversionFactor,
        convertedQuantity: recipeItem.quantity * conversionFactor,
        warning,
        resolvedUnit: recipeUnit
    };
}

/**
 * Calculates the full financial profile of a recipe item (Product)
 * @param product The product definition (Menu Item)
 * @param ingredientsMap A map of ALL ingredients available (for fast lookup)
 * @param subRecipesMap (Optional) Future support for sub-recipes
 */
export function analyzeRecipe(
    product: Product,
    ingredientsMap: Map<number, Ingredient>
): RecipeAnalysisResult {

    const warnings: string[] = [];
    const analysisIngredients: RecipeIngredientAnalysis[] = [];
    let totalCost = 0;

    if (!product.recipe || product.recipe.length === 0) {
        warnings.push("Receta vacía o no definida.");
    } else {
        product.recipe.forEach(item => {
            const ing = ingredientsMap.get(item.ingredientId);
            if (!ing) {
                warnings.push(`Ingrediente ID ${item.ingredientId} no encontrado en base de datos.`);
                return;
            }

            // USE SHARED CONVERSION LOGIC
            const conversion = getRecipeItemConversion(ing, item);
            if (conversion.warning) warnings.push(conversion.warning);

            // 1. Determine Yield
            const yieldPct = ing.yieldPercent || 1.0;
            if (yieldPct < 0.5) warnings.push(`Alerta: Rendimiento muy bajo (${yieldPct * 100}%) para ${ing.name}. Verificar merma.`);

            // 2. Quantities
            const grossQuantity = conversion.convertedQuantity / yieldPct;

            // 3. Costs
            const purchaseCost = ing.cost || 0;

            // Real Unit Cost (Impacted by Yield)
            const realUnitCost = purchaseCost / yieldPct;

            // Line Cost = Real Cost * Normalized Quantity
            const lineCost = purchaseCost * grossQuantity;

            // WARN if High Cost (heuristic check for > $15,000 for single line item)
            if (lineCost > 15000) {
                warnings.push(`💰 Costo Alto en ${ing.name}: $${lineCost.toFixed(0)}. Verificar unidades.`);
            }

            totalCost += lineCost;

            analysisIngredients.push({
                name: ing.name,
                type: 'Raw Material',
                purchase_unit: ing.unit || 'un',
                recipe_unit: conversion.resolvedUnit,
                yield_percent: yieldPct,
                gross_quantity_inventory: Number(grossQuantity.toFixed(4)),
                net_quantity_plate: Number(item.quantity.toFixed(2)), // Show original quantity
                unit_cost_real: Number(realUnitCost.toFixed(2)),
                total_line_cost: Number(lineCost.toFixed(0))
            });
        });
    }

    // 4. Financials
    // Assume product.price is GROSS (with IVA). We need NET.
    // Chile IVA = 19%. Net = Gross / 1.19
    const sellingPriceGross = product.price || 0;
    const sellingPriceNet = sellingPriceGross > 0 ? sellingPriceGross / 1.19 : null;

    const foodCostPct = sellingPriceNet && sellingPriceNet > 0
        ? (totalCost / sellingPriceNet)
        : null;

    // 5. Semaphores
    let status: RecipeFinancials['profitability_status'] = 'N/A';
    if (foodCostPct !== null) {
        if (foodCostPct < 0.25) status = 'Excellent';
        else if (foodCostPct < 0.35) status = 'Healthy';
        else if (foodCostPct < 0.45) status = 'Alert';
        else status = 'Critical';
    }

    if (status === 'Critical') warnings.push("Costo crítico (>45%). Se pierde dinero o el margen es ínfimo.");
    if (status === 'Alert') warnings.push("Costo elevado. Revisar porciones o precio venta.");

    return {
        recipe_name: product.name,
        category: 'Menu Item', // Default for now
        selling_price_net: sellingPriceNet ? Number(sellingPriceNet.toFixed(0)) : null,
        ingredients: analysisIngredients,
        financials: {
            total_cost: Number(totalCost.toFixed(0)),
            selling_price_net: sellingPriceNet ? Number(sellingPriceNet.toFixed(0)) : null,
            suggested_min_price: Number((totalCost / 0.30).toFixed(0)), // Suggesting price for 30% FC
            food_cost_percentage: foodCostPct ? Number((foodCostPct * 100).toFixed(1)) : null,
            profitability_status: status
        },
        warnings
    };
}
