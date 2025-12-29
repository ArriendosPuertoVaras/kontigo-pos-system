
import { db } from '@/lib/db';
import { toast } from 'sonner';

export async function rebuildGhostIngredients() {
    console.log("👻 Starting Ghost Ingredient Rescue...");

    // 1. Get all products with recipes
    const products = await db.products.toArray();
    const ghostDetails: Record<number, { foundIn: string[], notes: Set<string> }> = {};
    const ghostIds = new Set<number>();

    // 2. Scan recipes for Ingredient IDs
    products.forEach(p => {
        if (p.recipe && Array.isArray(p.recipe)) {
            p.recipe.forEach(item => {
                if (item.ingredientId) {
                    ghostIds.add(item.ingredientId);

                    // Collect context to help name the ghost
                    if (!ghostDetails[item.ingredientId]) {
                        ghostDetails[item.ingredientId] = { foundIn: [], notes: new Set() };
                    }
                    if (ghostDetails[item.ingredientId].foundIn.length < 3) { // Limit to 3 examples
                        ghostDetails[item.ingredientId].foundIn.push(p.name);
                    }
                    if (item.notes) {
                        ghostDetails[item.ingredientId].notes.add(item.notes);
                    }
                }
            });
        }
    });

    if (ghostIds.size === 0) {
        return "No recipes found to analyze.";
    }

    // 3. Check which ones actually exist
    const existingIngredients = await db.ingredients.bulkGet(Array.from(ghostIds));
    const missingIds = Array.from(ghostIds).filter((id, index) => !existingIngredients[index]);

    if (missingIds.length === 0) {
        return "All ingredients in recipes exist. No ghosts found.";
    }

    console.log(`👻 Found ${missingIds.length} missing ingredients referenced in recipes.`);

    // 4. Create Ghost Ingredients
    const ghostsToCreate = missingIds.map(id => {
        const details = ghostDetails[id];
        const context = details.foundIn.join(", ");
        const notes = Array.from(details.notes).join(" ");

        let nameHint = `Ingrediente #${id}`;
        // Try to guess type based on context usually implies generic stuff, but let's just use context
        if (notes) nameHint += ` (${notes})`;

        return {
            id: id, // RESTORE THE ORIGINAL ID VITAL!!
            name: `${nameHint} [RECUPERADO]`,
            family: "RESUCITADOS",
            category: "Recuperados",
            stock: 0,
            cost: 1, // Default to avoid invalid math
            unit: 'un', // Unknown
            minStock: 5,
            storage: 'Bodega Seca'
        };
    });

    await db.ingredients.bulkAdd(ghostsToCreate);

    return `¡ÉXITO! Se han reconstruido ${ghostsToCreate.length} ingredientes basándose en tus Recetas. Ve a la categoría "RESUCITADOS" y renómbravos.`;
}
