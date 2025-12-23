import { db } from './db';
import { supabase } from './supabase';
import { Table } from 'dexie';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

class SyncService {
    // Helper to convert camelCase object to snake_case for Postgres
    private toSnakeCase(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(v => this.toSnakeCase(v));
        } else if (obj !== null && obj.constructor === Object) {
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
        const localData = await dexieTable.toArray();
        if (localData.length === 0) {
            console.log(`[Sync] No data in ${dexieTable.name} to sync.`);
            // Continue to mirror sync to ensure cloud is empty too if local is empty
        }

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
                if ('order' in converted) delete converted.order;
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
            return converted;
        });

        // 3. Upsert to Supabase
        if (payload.length > 0) {
            let conflictTarget = 'id';
            if (supabaseTableName === 'job_titles') {
                conflictTarget = 'name';
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
        const SAFE_TO_MIRROR = ['restaurant_staff', 'job_titles', 'ingredients', 'products', 'categories', 'suppliers', 'restaurant_tables'];

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
            // 0. Products (Menu & Recipes) - FIRST to update FK references (e.g. categoryId)
            // This is critical for cleanup: we must move products OUT of a category before we can delete the category.
            onProgress?.("Sincronizando Menú y Recetas...");
            await this.pushTable(db.products, 'products');

            // 1. Categories (Now safe to clean up)
            onProgress?.("Sincronizando Categorías...");
            await this.pushTable(db.categories, 'categories');

            // 2. Suppliers
            onProgress?.("Sincronizando Proveedores...");
            await this.pushTable(db.suppliers, 'suppliers');

            // 3. Ingredients
            onProgress?.("Sincronizando Inventario...");
            await this.pushTable(db.ingredients, 'ingredients');

            // 4. Staff & Roles
            onProgress?.("Sincronizando Personal y Cargos...");
            await this.pushTable(db.jobTitles, 'job_titles');
            await this.pushTable(db.staff, 'restaurant_staff');

            // 5. Tables
            onProgress?.("Sincronizando Mesas...");
            await this.pushTable(db.restaurantTables, 'restaurant_tables');

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

        // CLEAR LOCAL DATA FIRST to avoid mixing real data with mocks
        await dexieTable.clear();
        console.log(`[Sync] Cleared local table ${dexieTable.name}`);

        const { data, error } = await supabase.from(supabaseTableName).select('*');

        if (error) {
            console.error(`[Sync] Error fetching ${supabaseTableName}:`, error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log(`[Sync] No data found in cloud for ${supabaseTableName}.`);
            return;
        }

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

    async restoreFromCloud(onProgress?: (msg: string) => void) {
        try {
            onProgress?.("Restaurando Categorías...");
            await this.pullTable(db.categories, 'categories');

            onProgress?.("Restaurando Proveedores...");
            await this.pullTable(db.suppliers, 'suppliers');

            // 4. Products & Inventory
            onProgress?.("Restaurando Inventario...");
            await this.pullTable(db.ingredients, 'ingredients');

            onProgress?.("Restaurando Productos...");
            await this.pullTable(db.products, 'products');

            // 5. Staff & Roles
            onProgress?.("Restaurando Personal...");
            await this.pullTable(db.jobTitles, 'job_titles');
            await this.pullTable(db.staff, 'restaurant_staff');

            onProgress?.("Restaurando Mesas...");
            await this.pullTable(db.restaurantTables, 'restaurant_tables');

            onProgress?.("¡Restauración Completada!");
            window.location.reload(); // Refresh to show data
        } catch (error: any) {
            console.error("Restore Failed:", error);
            throw error;
        }
    }
}

export const syncService = new SyncService();
