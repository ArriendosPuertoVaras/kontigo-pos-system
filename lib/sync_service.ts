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

    // Generic push function for a table
    // tableName: Dexie table name
    // supabaseTableName: Supabase table name (usually snake_case version of Dexie name)
    async pushTable(dexieTable: Table, supabaseTableName: string) {
        console.log(`[Sync] Syncing ${dexieTable.name} to ${supabaseTableName}...`);

        // 1. Get all local data
        const localData = await dexieTable.toArray();
        if (localData.length === 0) {
            console.log(`[Sync] No data in ${dexieTable.name} to sync.`);
            return;
        }

        // 2. Convert to snake_case
        const payload = localData.map(item => {
            const converted = this.toSnakeCase(item);

            // SPECIFIC FIXES FOR SCHEMA MISMATCHES
            if (supabaseTableName === 'categories') {
                if ('order' in converted) delete converted.order;
            }
            if (supabaseTableName === 'ingredients') {
                // Strip columns that might be missing in remote schema to allow sync to proceed
                // Strip columns that might be missing in remote schema to allow sync to proceed
                // We are now enabling these columns: 'min_stock', 'code', 'category', 'purchase_unit', 'conversion_factor'
                const missingCols = ['yield_percent'];
                missingCols.forEach(col => {
                    if (col in converted) delete converted[col];
                });
            }
            if (supabaseTableName === 'staff') {
                // 'active' is not in the schema (likely calculated or deprecated), so we strip it
                if ('active' in converted) delete converted.active;
            }

            return converted;
        });

        // 3. Upsert to Supabase
        // We use upsert to insert or update existing records based on primary key (usually 'id')
        const { error } = await supabase
            .from(supabaseTableName)
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            console.error(`[Sync] Error syncing ${supabaseTableName}:`, error);
            throw new Error(`Error en ${supabaseTableName}: ${error.message}`);
        }

        console.log(`[Sync] synced ${localData.length} rows to ${supabaseTableName}.`);
    }

    async pushAll(onProgress?: (msg: string) => void) {
        try {
            // 1. Categories (Dependencies first)
            onProgress?.("Sincronizando Categorías...");
            await this.pushTable(db.categories, 'categories');

            // 2. Suppliers
            onProgress?.("Sincronizando Proveedores...");
            await this.pushTable(db.suppliers, 'suppliers');

            // 3. Ingredients
            onProgress?.("Sincronizando Inventario...");
            await this.pushTable(db.ingredients, 'ingredients');

            // 4. Products (Menu & Recipes)
            // Note: If recipe is a JSON column in Supabase 'products', this works automatically.
            // If recipe is a separate table, we'd need extra logic here. 
            // Assuming simplified JSON storage for Phase 1.
            onProgress?.("Sincronizando Menú y Recetas...");
            await this.pushTable(db.products, 'products');

            // 5. Staff
            onProgress?.("Sincronizando Personal...");
            await this.pushTable(db.staff, 'staff');

            // 6. Tables
            onProgress?.("Sincronizando Mesas...");
            await this.pushTable(db.restaurantTables, 'restaurant_tables');

            onProgress?.("¡Sincronización Completada!");
        } catch (error: any) {
            console.error("Sync Failed:", error);
            throw error;
        }
    }
}

export const syncService = new SyncService();
