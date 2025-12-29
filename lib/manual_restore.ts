
import { db } from '@/lib/db';

export async function restoreEmpanadaIngredients() {
    // 1. Find the specific product
    // "Empanaditas de Prieta con Manzana y Nuez"
    const products = await db.products.filter(p => p.name.includes("Empanaditas de Prieta")).toArray();
    const product = products[0];

    if (!product) return "❌ No se encontró el producto 'Empanaditas de Prieta'.";
    if (!product.recipe || product.recipe.length === 0) return "❌ El producto no tiene receta.";

    // 2. The List of Names form the Screenshot (IN ORDER)
    const restoreMap = [
        { name: "Harina sin Polvos", unit: "gr" },
        { name: "Manteca de Cerdo", unit: "gr" },
        { name: "Salmuera", unit: "ml" },
        { name: "Vino Blanco", unit: "ml" },
        { name: "Prieta", unit: "gr" },
        { name: "Cebolla", unit: "gr" },
        { name: "Manzana Verde", unit: "gr" },
        { name: "Nueces", unit: "un" },
        { name: "Orégano", unit: "gr" },
        { name: "Comino", unit: "gr" },
        { name: "Ají Color", unit: "gr" },
        { name: "Aceite vegetal", unit: "ml" },
        { name: "Huevo", unit: "un" },
        { name: "Leche entera", unit: "ml" }
    ];

    console.log(`Analyzing Recipe with ${product.recipe.length} items vs ${restoreMap.length} names...`);

    // 3. Map IDs to Names
    const recoveredIngredients: any[] = [];

    // Safety check: Don't exceed array bounds
    const loopLimit = Math.min(product.recipe.length, restoreMap.length);

    for (let i = 0; i < loopLimit; i++) {
        const recipeItem = product.recipe[i];
        const restoreData = restoreMap[i];

        recoveredIngredients.push({
            id: recipeItem.ingredientId, // VITAL: Reuse the ID referenced in the recipe
            name: restoreData.name,
            unit: restoreData.unit, // Use the unit from screenshot/map
            stock: 0,
            cost: 1, // Placeholder
            minStock: 5,
            family: 'Recuperados',
            category: 'General',
            storage: 'Bodega Seca'
        });
    }

    // 4. Save to DB
    if (recoveredIngredients.length > 0) {
        await db.ingredients.bulkPut(recoveredIngredients);
        return `✅ ¡ÉXITO! Se han restaurado ${recoveredIngredients.length} ingredientes con sus nombres reales. Ve a ver tu ficha técnica.`;
    }

    return "⚠️ No se pudieron procesar los ingredientes.";
}
