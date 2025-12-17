import { Ingredient, Product, RecipeItem, db } from './db';

// --- INTERFACES BASED ON "MASTER RECIPE ARCHITECT" SPEC ---

export type RecipeCategory = 'Menu Item' | 'Sub-Recipe';
export type IngredientType = 'Raw Material' | 'Sub-Recipe';
export type PurchaseUnit = 'kg' | 'lt' | 'un';

export interface RecipeIngredientAnalysis {
    name: string;
    type: IngredientType;
    purchase_unit: string;
    yield_percent: number; // 0.0 to 1.0 (e.g., 0.85)
    gross_quantity_inventory: number; // The amount deducted from stock (Net / Yield)
    net_quantity_plate: number; // The amount actually consumed/served
    unit_cost_real: number; // Purchase Price / Yield
    total_line_cost: number; // unit_cost_real * net_quantity_plate ?? No, usually unit_cost_real * gross? 
    // Wait, let's follow the User's Rule:
    // "Si el usuario ingresa 'Peso Neto' (lo que va en el plato), debes calcular cuánto 'Peso Bruto' se descuenta del inventario usando el Yield"
    // So Cost = Cost_Real * Net? Or Cost_Purchase * Gross? They should be equal. 
    // Cost_Real = Price_Purch / Yield.
    // Line_Cost = Cost_Real * Net_Quantity.
    // Check: (Price / Yield) * Net = (Price / Yield) * (Gross * Yield) ?? 
    // No, Net = Gross * Yield. => Gross = Net / Yield.
    // Line Cost = Price_Purch * Gross.
    // Line Cost equivalent = (Price_Purch / Yield) * Net.
    // YES. Math holds.
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

            // 1. Determine Yield
            // Default to 1.0 if not set. Warn if low.
            const yieldPct = ing.yieldPercent || 1.0;
            if (yieldPct < 0.5) warnings.push(`Alerta: Rendimiento muy bajo (${yieldPct * 100}%) para ${ing.name}. Verificar merma.`);

            // 2. Quantities
            // The item.quantity in Recipe definition is usually the NET quantity (what goes in the plate), 
            // unless we decide otherwise. The prompt implies user inputs Net.
            const netQuantity = item.quantity;
            const grossQuantity = netQuantity / yieldPct;

            // 3. Costs
            const purchaseCost = ing.cost || 0; // Cost per unit (e.g. per Kg specific in DB)
            // Note: DB Ingredient.cost is usually "Cost per Unit". 
            // We assume ing.cost is Cost per 1 unit of ing.unit.

            // Real Unit Cost (Impacted by Yield)
            // Example: Buy at 1000/kg. Yield 0.5. Real Cost = 2000/kg (of net product).
            const realUnitCost = purchaseCost / yieldPct;

            // Line Cost
            const lineCost = realUnitCost * netQuantity;

            totalCost += lineCost;

            analysisIngredients.push({
                name: ing.name,
                type: 'Raw Material', // TODO: Detect sub-recipe types in Phase 2b
                purchase_unit: ing.unit || 'un',
                yield_percent: yieldPct,
                gross_quantity_inventory: Number(grossQuantity.toFixed(4)),
                net_quantity_plate: Number(netQuantity.toFixed(4)),
                unit_cost_real: Number(realUnitCost.toFixed(2)),
                total_line_cost: Number(lineCost.toFixed(2))
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
