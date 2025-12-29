import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// This script should be run via a dedicated admin page or console
export async function migrateLegacyData(targetRestaurantId: string) {
    if (!targetRestaurantId) {
        console.error("Migration Aborted: No Target Restaurant ID provided.");
        return;
    }

    console.log(`🦁 MIGRATION: Starting Legacy Data Migration to Restaurant ID: ${targetRestaurantId}...`);
    let totalMigrated = 0;

    const tablesToMigrate = [
        db.products,
        db.categories,
        db.ingredients,
        db.suppliers,
        db.purchaseOrders,
        db.wasteLogs,
        db.customers,
        db.restaurantTables,
        db.orders,
        db.staff,
        db.shifts,
        db.printers,
        db.modifierTemplates,
        db.dtes,
        db.cashCounts,
        db.dailyCloses,
        db.jobTitles,
        db.accounts,
        db.journalEntries,
        db.productionLogs,
        db.settings
    ];

    try {
        await db.transaction('rw', tablesToMigrate, async () => {
            for (const table of tablesToMigrate) {
                // Find records that DO NOT have a restaurantId
                // Note: filter() is not efficient for huge datasets but fine for client-side migration of thousands
                const orphans = await table.filter(item => !item.restaurantId).toArray();

                if (orphans.length > 0) {
                    console.log(`... Migrating ${orphans.length} records in ${table.name}`);

                    // Simple bulk update
                    // Since Dexie doesn't have SQL-like "UPDATE WHERE NULL", we update in memory and put back
                    const updates = orphans.map(item => ({
                        ...item,
                        restaurantId: targetRestaurantId
                    }));

                    // @ts-ignore
                    await table.bulkPut(updates);
                    totalMigrated += orphans.length;
                }
            }
        });

        console.log(`✅ MIGRATION COMPLETE: Migrated ${totalMigrated} records to ${targetRestaurantId}.`);
        alert(`Migración Completa: ${totalMigrated} registros actualizados.`);

        // TRIGGER SYNC to Push these changes to Cloud
        // Ideally, the user should hit "Sync" after this.

    } catch (error) {
        console.error("❌ MIGRATION FAILED:", error);
        alert("Error en la migración. Ver consola.");
    }
}
