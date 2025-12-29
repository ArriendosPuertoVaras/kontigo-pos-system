
import { db } from '@/lib/db';

export async function restoreEmpanadaIngredients() {
    // 0. Get Current Tenant Context
    const currentRestaurantId = localStorage.getItem('kontigo_restaurant_id') || 'default';

    // 1. Find the specific product
    // "Empanaditas de Prieta con Manzana y Nuez"
    const products = await db.products.filter(p => p.name.includes("Empanaditas de Prieta")).toArray();
    const product = products[0];

    if (!product) {
        console.error("❌ PRODUCTO NO ENCONTRADO: Buscando 'Empanaditas de Prieta'");
        return "❌ Error: No se encontró el producto 'Empanaditas de Prieta'.";
    }

    // Check if recipe exists, but be lenient if we are forcing it
    if (!product.recipe || product.recipe.length === 0) {
        return "❌ El producto existe pero NO tiene receta vinculada.";
    }

    // 2. Exact Data from USER SCREENSHOTS (Inventory View)
    // Order matches the Recipe Screenshot to ensure correct ID mapping
    const restoreMap = [
        { name: "Harina sin Polvos", unit: "kg", cost: 700, stock: 25, category: "GENERAL", storage: "" },
        { name: "Manteca de Cerdo", unit: "kg", cost: 2900, stock: 2, category: "GENERAL", storage: "" },
        { name: "Salmuera", unit: "ml", cost: 0, stock: 9999, category: "OTROS", storage: "Fresco" }, // Infinity represented as high number
        { name: "Vino Blanco", unit: "ml", cost: 1700, stock: 5, category: "BEBIDAS Y LICORES", storage: "" },
        { name: "Prieta", unit: "kg", cost: 4600, stock: 5, category: "CARNES Y CECINAS", storage: "Refrigerado" },
        { name: "Cebolla", unit: "kg", cost: 1200, stock: 10, category: "FRUTAS Y VERDURAS", storage: "" },
        { name: "Manzana Verde", unit: "kg", cost: 1350, stock: 18, category: "FRUTAS Y VERDURAS", storage: "Refrigerado" },
        { name: "Nueces", unit: "kg", cost: 10000, stock: 1, category: "GENERAL", storage: "" },
        { name: "Orégano", unit: "kg", cost: 7500, stock: 1, category: "GENERAL", storage: "" },
        { name: "Comino", unit: "kg", cost: 6600, stock: 1, category: "GENERAL", storage: "" },
        { name: "Ají Color", unit: "kg", cost: 6600, stock: 1, category: "GENERAL", storage: "" },
        { name: "Aceite vegetal", unit: "l", cost: 1200, stock: 5, category: "GENERAL", storage: "" },
        { name: "Huevo", unit: "un", cost: 180, stock: 30, category: "LACTEOS Y HUEVOS", storage: "" },
        { name: "Leche entera", unit: "l", cost: 900, stock: 12, category: "LACTEOS Y HUEVOS", storage: "" }
    ];

    console.log(`Analyzing Recipe with ${product.recipe.length} items vs ${restoreMap.length} detailed records...`);

    // 3. Map IDs to Names & Metadata
    const recoveredIngredients: any[] = [];

    // Safety check: Don't exceed array bounds
    const loopLimit = Math.min(product.recipe.length, restoreMap.length);

    for (let i = 0; i < loopLimit; i++) {
        const recipeItem = product.recipe[i];
        const data = restoreMap[i];

        // Define isInfinite check based on large stock or cost 0
        const isInfinite = data.stock > 1000 || data.cost === 0;

        recoveredIngredients.push({
            id: recipeItem.ingredientId, // VITAL: Reuse the ID referenced in the recipe
            name: data.name,
            unit: data.unit,
            stock: isInfinite ? 0 : data.stock, // Stock 0 for infinite to avoid weirdness
            cost: data.cost,
            minStock: 5,
            family: data.category,
            category: data.category,
            storage: data.storage || 'Bodega Seca',
            isInfinite: isInfinite,
            restaurantId: currentRestaurantId // Assign to current tenant
        });
    }

    // 4. Save to DB
    if (recoveredIngredients.length > 0) {
        await db.ingredients.bulkPut(recoveredIngredients);
        return `✅ ¡ÉXITO! Se han restaurado ${recoveredIngredients.length} ingredientes con sus nombres reales. Ve a ver tu ficha técnica.`;
    }

    return "⚠️ No se pudieron procesar los ingredientes.";
}
