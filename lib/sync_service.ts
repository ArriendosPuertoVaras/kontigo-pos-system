import { db } from './db';
import { supabase } from './supabase';
import { Table } from 'dexie';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

class SyncService {
    // Helper to convert camelCase object to snake_case for Postgres
    private toSnakeCase(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) {
            return obj.map(v => this.toSnakeCase(v));
        } else if (obj.constructor === Object) {
            return Object.keys(obj).reduce((result, key) => {
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                result[snakeKey] = this.toSnakeCase(obj[key]);
                return result;
            }, {} as any);
        }
        return obj;
    }

    private isSyncing = false;

    // Generic push function for a table
    // tableName: Dexie table name
    // supabaseTableName: Supabase table name (usually snake_case version of Dexie name)
    async pushTable(dexieTable: Table, supabaseTableName: string) {
        console.log(`[Sync] Syncing ${dexieTable.name} to ${supabaseTableName}...`);

        // 1. Get all local data
        let localData = await dexieTable.toArray();
        if (localData.length === 0) {
            console.log(`[Sync] No data in ${dexieTable.name} to sync.`);
            // Continue to mirror sync to ensure cloud is empty too if local is empty
        }

        // --- ROBUSTNESS: ORPHAN CHECK ---
        // Prevents "foreign key violation" if a Product references a deleted Category
        if (dexieTable.name === 'products') {
            const validCategories = await db.categories.toArray();
            const validIds = new Set(validCategories.map(c => c.id));

            const originalCount = localData.length;
            localData = localData.filter(p => validIds.has(p.categoryId));

            if (localData.length < originalCount) {
                console.warn(`[Sync] ⚠️ Skipped ${originalCount - localData.length} Orphan Products (Invalid Category ID). Run Database Cleanup.`);
            }
        }

        // ORPHAN CHECK: SHIFTS -> STAFF
        if (dexieTable.name === 'shifts') {
            const validStaff = await db.staff.toArray();
            const validIds = new Set(validStaff.map(s => s.id));
            localData = localData.filter(s => validIds.has(s.staffId));
        }

        // ORPHAN CHECK: CASH COUNTS -> SHIFTS & STAFF
        if (dexieTable.name === 'cashCounts') {
            const validShifts = await db.shifts.toArray();
            const validShiftIds = new Set(validShifts.map(s => s.id));

            const validStaff = await db.staff.toArray();
            const validStaffIds = new Set(validStaff.map(s => s.id));

            // Keep if:
            // 1. shiftId is null (general count) OR exists in valid shifts
            // 2. AND staffId exists in valid staff (Foreign Key constraint)
            localData = localData.filter(c => {
                const shiftOk = !c.shiftId || validShiftIds.has(c.shiftId);
                const staffOk = validStaffIds.has(c.staffId);
                return shiftOk && staffOk;
            });
        }
        // --------------------------------

        // Pre-fetch restaurant ID if needed
        let restaurantId: string | undefined;
        if (supabaseTableName === 'restaurant_staff') {
            const { data: rest } = await supabase.from('restaurants').select('id').limit(1).single();
            restaurantId = rest?.id;

            // AUTO-CREATE RESTAURANT IF MISSING
            if (!restaurantId) {
                console.log("[Sync] No restaurant found. Creating default restaurant...");
                const { data: newRest, error: createError } = await supabase
                    .from('restaurants')
                    .insert([{
                        name: 'Mi Restaurante Kontigo',
                        owner_email: 'admin@kontigo.cl',
                        commerce_code: 'KONTIGO-STGO',
                        active: true
                    }])
                    .select('id')
                    .single();

                if (createError || !newRest) {
                    console.error("[Sync] Failed to create default restaurant:", createError);
                    return; // Abort if creation fails
                }
                restaurantId = newRest.id;
            }
        }

        // 2. Convert to snake_case
        const payload = localData.map(item => {
            const converted = this.toSnakeCase(item);

            // SPECIFIC FIXES FOR SCHEMA MISMATCHES
            if (supabaseTableName === 'categories') {
                // 'order' is now supported and needed for sorting
            }
            // General: Ensure created_at exists to satisfy Not Null constraints
            if (!converted.created_at) {
                converted.created_at = new Date().toISOString();
            }

            if (supabaseTableName === 'ingredients') {
                const missingCols = ['yield_percent'];
                missingCols.forEach(col => {
                    if (col in converted) delete converted[col];
                });
            }
            if (supabaseTableName === 'restaurant_staff' && restaurantId) {
                if ('restaurant_id' in converted === false) {
                    converted.restaurant_id = restaurantId;
                }
                // Map 'role' -> 'role_name'
                if (converted.role) {
                    converted.role_name = converted.role;
                    delete converted.role;
                }
                // Map 'status' -> 'active' boolean
                if (converted.status) {
                    converted.active = converted.status === 'active';
                    delete converted.status;
                }
            }
            if (supabaseTableName === 'job_titles') {
                delete converted.id;
            }
            if (supabaseTableName === 'daily_closes') {
                // Schema now fixed by MASTER SCRIPT. No exclusions needed.
            }
            if (supabaseTableName === 'cash_counts') {
                // Schema now fixed by MASTER SCRIPT. No exclusions needed.
            }
            return converted;
        });

        // 3. Upsert to Supabase
        if (payload.length > 0) {
            let conflictTarget = 'id';
            if (supabaseTableName === 'job_titles') {
                conflictTarget = 'name';
            }
            if (supabaseTableName === 'accounts') {
                conflictTarget = 'code';
            }
            const { error } = await supabase
                .from(supabaseTableName)
                .upsert(payload, { onConflict: conflictTarget, ignoreDuplicates: false });

            if (error) {
                console.error(`[Sync] Error syncing ${supabaseTableName}:`, error);
                throw new Error(`Error en ${supabaseTableName}: ${error.message}`);
            }
        }

        console.log(`[Sync] synced ${localData.length} rows to ${supabaseTableName}.`);

        // 4. MIRROR SYNC: Delete records in Cloud that are NOT in Local
        const SAFE_TO_MIRROR = [
            'restaurant_staff', 'job_titles', 'ingredients', 'products', 'categories', 'suppliers', 'restaurant_tables',
            'purchase_orders', 'waste_logs', 'accounts', 'journal_entries',
            'shifts', 'customers', 'dtes', 'cash_counts', 'daily_closes', 'modifier_templates'
        ];

        if (SAFE_TO_MIRROR.includes(supabaseTableName)) {
            try {
                // Get all IDs currently in Supabase
                const { data: remoteIds, error: fetchError } = await supabase
                    .from(supabaseTableName)
                    .select('id');

                if (fetchError) throw fetchError;

                if (remoteIds && remoteIds.length > 0) {
                    const localIds = new Set(localData.map(d => d.id));
                    // Identify IDs that exist in Remote but NOT in Local
                    const idsToDelete = remoteIds
                        .filter(r => !localIds.has(r.id))
                        .map(r => r.id);

                    if (idsToDelete.length > 0) {
                        console.log(`[Sync] Mirroring: Deleting ${idsToDelete.length} obsolete records from ${supabaseTableName}...`);

                        // SAFETY NET: If deleting categories, ensure products are unlinked first (Double Check)
                        if (supabaseTableName === 'categories') {
                            // Attempt to NULLIFY category_id for products pointing to these to-be-deleted categories
                            // This handles any race condition or stray references
                            await supabase
                                .from('products')
                                .update({ category_id: null })
                                .in('category_id', idsToDelete);
                        }

                        const { error: deleteError } = await supabase
                            .from(supabaseTableName)
                            .delete()
                            .in('id', idsToDelete);

                        if (deleteError) {
                            console.error(`[Sync] Warning: Failed to clean up ${supabaseTableName}:`, JSON.stringify(deleteError, null, 2));
                        } else {
                            console.log(`[Sync] Cleanup successful.`);
                        }
                    }
                }
            } catch (cleanupError) {
                console.error(`[Sync] Mirror cleanup failed for ${supabaseTableName}`, cleanupError);
            }
        }
    }

    async pushAll(onProgress?: (msg: string) => void) {
        if (this.isSyncing) {
            console.log("[Sync] Sync already in progress, skipping.");
            return;
        }
        this.isSyncing = true;

        try {
            // 0. Categories (First, so Products can reference them)
            onProgress?.("Sincronizando Categorías...");
            await this.pushTable(db.categories, 'categories');

            // 1. Products (Menu & Recipes)
            onProgress?.("Sincronizando Menú y Recetas...");
            await this.pushTable(db.products, 'products');
            await this.pushTable(db.modifierTemplates, 'modifier_templates');

            // 2. Suppliers & CRM
            onProgress?.("Sincronizando Proveedores y Clientes...");
            await this.pushTable(db.suppliers, 'suppliers');
            await this.pushTable(db.customers, 'customers');

            // 3. Ingredients
            onProgress?.("Sincronizando Inventario...");
            await this.pushTable(db.ingredients, 'ingredients');

            // 4. Staff & Roles & Shifts
            onProgress?.("Sincronizando Personal y Turnos...");
            await this.pushTable(db.jobTitles, 'job_titles');
            await this.pushTable(db.staff, 'restaurant_staff');
            await this.pushTable(db.shifts, 'shifts');

            // 5. Tables & Operations history
            onProgress?.("Sincronizando Operaciones (Ventas, Compras, Finanzas)...");
            await this.pushTable(db.restaurantTables, 'restaurant_tables');
            await this.pushTable(db.orders, 'orders'); // SALES HISTORY
            await this.pushTable(db.dtes, 'dtes');
            await this.pushTable(db.purchaseOrders, 'purchase_orders');
            await this.pushTable(db.wasteLogs, 'waste_logs');
            await this.pushTable(db.cashCounts, 'cash_counts');
            await this.pushTable(db.dailyCloses, 'daily_closes');

            // 7. FINANCE
            onProgress?.("Sincronizando Contabilidad...");
            await this.pushTable(db.accounts, 'accounts');
            await this.pushTable(db.journalEntries, 'journal_entries');

            onProgress?.("¡Sincronización Completada!");
        } catch (error: any) {
            console.error("Sync Failed:", error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    // Pull data from Supabase to Dexie (Restore)
    async pullTable(dexieTable: Table, supabaseTableName: string) {
        console.log(`[Sync] Restoring ${supabaseTableName} to ${dexieTable.name}...`);

        const { data, error } = await supabase.from(supabaseTableName).select('*');

        if (error) {
            console.error(`[Sync] Error fetching ${supabaseTableName}:`, error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log(`[Sync] No data found in cloud for ${supabaseTableName}. Skipping restore to preserve local data.`);
            return;
        }

        // Only clear if we actually have data to replace it with
        await dexieTable.clear();
        console.log(`[Sync] Cleared local table ${dexieTable.name}`);

        // Map snake_case back to camelCase (basic implementation)
        const toCamelCase = (obj: any): any => {
            if (Array.isArray(obj)) return obj.map(v => toCamelCase(v));
            if (obj !== null && typeof obj === 'object') {
                return Object.keys(obj).reduce((result, key) => {
                    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                    result[camelKey] = toCamelCase(obj[key]);
                    return result;
                }, {} as any);
            }
            return obj;
        };

        const localData = data.map(item => {
            const converted = toCamelCase(item);

            // Fix Specific Mismatches
            if (supabaseTableName === 'restaurant_staff') {
                // Map active -> status
                if (converted.active !== undefined) {
                    converted.status = converted.active ? 'active' : 'inactive';
                }
                // Restore role from roleName if needed
                if (converted.roleName) {
                    converted.role = converted.roleName;
                    converted.activeRole = converted.roleName;
                }
            }
            return converted;
        });

        await dexieTable.bulkPut(localData);
        console.log(`[Sync] Restored ${localData.length} items to ${dexieTable.name}`);
    }

    /**
     * Efficiently checks if there is ANY data in the cloud to modify default behavior.
     * Uses 'products' table as a proxy for "Has Data".
     */
    async hasCloudData(): Promise<boolean> {
        try {
            const { count, error } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true });

            if (error) throw error;
            return (count || 0) > 0;
        } catch (e) {
            console.error("[Sync] Error checking cloud data:", e);
            return false;
        }
    }

    async restoreFromCloud(onProgress?: (msg: string) => void) {
        try {
            onProgress?.("Restaurando Categorías y Plantillas...");
            await this.pullTable(db.categories, 'categories');
            await this.pullTable(db.modifierTemplates, 'modifier_templates');

            onProgress?.("Restaurando Proveedores y Clientes...");
            await this.pullTable(db.suppliers, 'suppliers');
            await this.pullTable(db.customers, 'customers');

            // 4. Products & Inventory
            onProgress?.("Restaurando Inventario...");
            await this.pullTable(db.ingredients, 'ingredients');

            onProgress?.("Restaurando Productos...");
            await this.pullTable(db.products, 'products');

            // 5. Staff & Roles
            onProgress?.("Restaurando Personal y Turnos...");
            await this.pullTable(db.jobTitles, 'job_titles');
            await this.pullTable(db.staff, 'restaurant_staff');
            await this.pullTable(db.shifts, 'shifts');

            onProgress?.("Restaurando Mesas...");
            await this.pullTable(db.restaurantTables, 'restaurant_tables');

            onProgress?.("Restaurando Operaciones Completa...");
            await this.pullTable(db.orders, 'orders');
            await this.pullTable(db.purchaseOrders, 'purchase_orders');
            await this.pullTable(db.wasteLogs, 'waste_logs');
            await this.pullTable(db.dtes, 'dtes');
            await this.pushTable(db.cashCounts, 'cash_counts');
            await this.pushTable(db.dailyCloses, 'daily_closes');

            // 6. Finance
            onProgress?.("Restaurando Finanzas...");
            await this.pullTable(db.accounts, 'accounts');
            await this.pullTable(db.journalEntries, 'journal_entries');

            onProgress?.("¡Restauración Completada!");
            window.location.reload(); // Refresh to show data
        } catch (error: any) {
            console.error("Restore Failed:", error);
            throw error;
        }
    }
    /**
     * AUTO-SYNC: Checks connection and triggers push.
     * Designed to be called by event listeners or after mutations.
     */
    async autoSync(table: Table, supabaseName: string) {
        if (!navigator.onLine) {
            console.log(`[AutoSync] ⚠️ Offline. Queuing ${supabaseName} sync for later.`);
            // TODO: Add to a persistent queue if critical, but for now we rely on the "online" event listener to catch up.
            return;
        }

        try {
            await this.pushTable(table, supabaseName);
            console.log(`[AutoSync] ✅ ${supabaseName} synced successfully.`);
        } catch (err) {
            console.error(`[AutoSync] ❌ Failed to sync ${supabaseName}`, err);
        }
    }
}

export const syncService = new SyncService();

// GLOBAL LISTENER: When internet comes back, sync everything.
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log("[AutoSync] 🌐 Connection restored! Triggering full sync...");
        syncService.pushAll().catch(console.error);
    });
}
