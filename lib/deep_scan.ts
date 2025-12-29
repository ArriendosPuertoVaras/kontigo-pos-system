
import { db } from '@/lib/db';

export async function checkAllData() {
    // 1. Count ALL ingredients regardless of restaurantId
    const allIngredients = await db.ingredients.toArray();
    console.log(`🔍 FULL SCAN REPORT:`);
    console.log(`- Total Ingredients Found: ${allIngredients.length}`);

    if (allIngredients.length > 0) {
        // Group by restaurantId
        const byTenant: Record<string, number> = {};
        allIngredients.forEach(i => {
            const tenant = i.restaurantId || 'UNDEFINED';
            byTenant[tenant] = (byTenant[tenant] || 0) + 1;
        });

        console.log(`- Distribution by Tenant:`, byTenant);
        console.log(`- First 3 items:`, allIngredients.slice(0, 3).map(i => `${i.name} (${i.restaurantId})`));
    } else {
        console.log("❌ The table is completely empty.");
    }

    return allIngredients.length;
}
