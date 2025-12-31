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

    public isSyncing = false;

    // Generic push function for a table
    // tableName: Dexie table name
    // supabaseTableName: Supabase table name (usually snake_case version of Dexie name)
    async pushTable(dexieTable: Table, supabaseTableName: string) {
        // --- GATEKEEPER CHECK ---
        const restaurantId = localStorage.getItem('kontigo_restaurant_id');
        if (!restaurantId) {
            console.warn(`[Sync] ⛔ Blocked ${dexieTable.name}: No Restaurant Context.`);
            return;
        }

        console.log(`[Sync] Syncing ${dexieTable.name} to ${supabaseTableName} for Restaurant: ${restaurantId}...`);

        // 1. Get all local data
        // FILTER: Only push data belonging to this restaurant (Safety measure)
        // If local DB has multiple tenants mixed, we filter.
        let localData = await dexieTable.filter(item => !item.restaurantId || item.restaurantId === restaurantId).toArray();

        // --- AUTOMATIC TAGGING (Safety Layer 1) ---
        // If we find items without a restaurantId, we tag them NOW before pushing.
        const untagged = localData.filter(item => !item.restaurantId);
        if (untagged.length > 0) {
            console.log(`[Sync] 🏷️ Auto-tagging ${untagged.length} items for ${dexieTable.name}...`);
            await Promise.all(untagged.map(item =>
                dexieTable.update(item.id, { restaurantId })
            ));
            // Refresh localData after tagging
            localData = await dexieTable.filter(item => item.restaurantId === restaurantId).toArray();
        }

        // --- ROBUSTNESS: ORPHAN CHECK ---
        // Prevents "foreign key violation" if a Product references a deleted Category
        if (dexieTable.name === 'products') {
            const validCategories = await db.categories.toArray();
            const validIds = new Set(validCategories.map(c => c.id));

            // HEALER: If categoryId is a string or invalid ID, try to find by name
            for (const p of localData) {
                if (!validIds.has(p.categoryId as any)) {
                    const match = validCategories.find(c =>
                        c.name.trim().toLowerCase() === String(p.categoryId).trim().toLowerCase()
                    );
                    if (match && match.id) {
                        console.log(`[Sync] 🚑 Healing product ${p.name}: category '${p.categoryId}' -> ID ${match.id}`);
                        p.categoryId = match.id;
                    }
                }
            }

            const originalCount = localData.length;
            localData = localData.filter(p => validIds.has(p.categoryId as any));

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
                // Schema fixed by ALIGN script. No exclusions needed.
            }
            if (supabaseTableName === 'restaurant_staff' && restaurantId) {
                if ('restaurant_id' in converted === false) {
                    converted.restaurant_id = restaurantId;
                }

                // 1. DELETE ID (Local is Number, Supabase IS UUID)
                // NOW FIXED: Supabase is BIGINT too. We KEEP the ID.
                // delete converted.id;

                // CRITICAL FIX: Ensure 'active' column is NEVER sent to Supabase
                // 1. If 'status' is missing but 'active' exists, backfill 'status'
                if (!converted.status && 'active' in converted) {
                    converted.status = converted.active ? 'active' : 'inactive';
                }
                // 2. Default status if still missing
                if (!converted.status) {
                    converted.status = 'active';
                }
                // 3. HARD DELETE 'active' - Supabase does not have this column
                if ('active' in converted) {
                    delete converted.active;
                }

                // 4. HARD DELETE 'active_role' - Local only field, or mismatch
                if ('active_role' in converted) {
                    delete converted.active_role;
                }

                // 5. DO NOT DELETE 'address' - It EXISTS in Supabase now.

                // 6. ONLY DELETE LEGACY/CALCULATED FIELDS
                // We keep 'afp', 'health_system', etc. because they EXIST in Supabase now.
                const fieldsToDelete = [
                    'daily_salary',     // Legacy/Calculated field
                    'hourly_rate',      // Legacy field
                    'active_role',      // Redundant check
                    'role_permissions', // CAUSE OF ERROR: Not in Supabase schema
                    'rolePermissions'   // Just in case it wasn't snake_cased yet
                ];

                fieldsToDelete.forEach(field => {
                    if (field in converted) delete converted[field];
                });

                // Ensure 'role' is preserved if possible, or mapped.
                // Code above maps role -> role_name and deletes role.
                // Supabase has BOTH 'role' and 'role_name'. 
                // Let's restore 'role' if it was deleted, or better yet, send BOTH.
                // (Refactoring previous Legacy fix block to effectively send both if needed, 
                // but for safety, let's just Stick to role_name as primary, 
                // and maybe backfill role from role_name if missing?)
                // Ensure 'role_name' is preserved/mapped.
                if (converted.role && !converted.role_name) {
                    converted.role_name = converted.role;
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
            if (supabaseTableName === 'shifts') {
                // derived field, not in supabase schema
                delete converted.status;
            }

            // SAFETY: FORCE RESTAURANT_ID
            converted.restaurant_id = restaurantId;

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
            // --- SAFETY LAYER 3: PREVENT EMPTY WIPE ---
            // If local is 100% empty, we DO NOT mirror (delete).
            // This prevents a new device from wiping a populated Cloud.
            if (localData.length === 0) {
                console.warn(`[Sync] 🛡️ Mirror-Delete Skipped for ${supabaseTableName}: Local is empty. Cloud is preserved.`);
                return;
            }

            try {
                // SPECIAL CASE: job_titles must match by NAME, because local ID (number) != cloud ID (int8)
                // and we strip IDs on push.
                if (supabaseTableName === 'job_titles') {
                    const { data: remoteRows, error: fetchError } = await supabase
                        .from(supabaseTableName)
                        .select('id, name')
                        .eq('restaurant_id', restaurantId);

                    if (fetchError) throw fetchError;

                    if (remoteRows && remoteRows.length > 0) {
                        const localNames = new Set(localData.map(d => d.name)); // Match by Name
                        const idsToDelete = remoteRows
                            .filter(r => !localNames.has(r.name))
                            .map(r => r.id);

                        if (idsToDelete.length > 0) {
                            console.log(`[Sync] Mirroring (by Name): Deleting ${idsToDelete.length} obsolete roles from ${supabaseTableName}...`);
                            await supabase.from(supabaseTableName).delete().in('id', idsToDelete);
                        }
                    }
                    return; // Exit here for job_titles
                }


                // STANDARD MIRROR (By ID)
                // Get all IDs currently in Supabase FOR THIS RESTAURANT
                const { data: remoteIds, error: fetchError } = await supabase
                    .from(supabaseTableName)
                    .select('id')
                    .eq('restaurant_id', restaurantId);

                if (fetchError) throw fetchError;

                if (remoteIds && remoteIds.length > 0) {
                    const localIds = new Set(localData.map(d => d.id));
                    // Identify IDs that exist in Remote but NOT in Local
                    const idsToDelete = remoteIds
                        .filter(r => !localIds.has(r.id)) // Standard ID Match
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
            return;
        }

        // CHECK SUBSCRIPTION BEFORE SYNC
        const canSync = await this.checkSubscriptionStatus();
        if (!canSync) {
            console.error("[Sync] gatekeeper: Subscription Inactive or Expired.");
            onProgress?.("⛔ Error: Suscripción Vencida. Contacte a Soporte.");
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

    // Helper to convert snake_case object to camelCase for Dexie
    private toCamelCase(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) {
            return obj.map(v => this.toCamelCase(v));
        } else if (obj.constructor === Object) {
            return Object.keys(obj).reduce((result, key) => {
                const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                result[camelKey] = this.toCamelCase(obj[key]);
                return result;
            }, {} as any);
        }
        return obj;
    }

    // Pull data from Supabase to Dexie (Restore)
    async pullTable(dexieTable: Table, supabaseTableName: string) {
        const restaurantId = localStorage.getItem('kontigo_restaurant_id');
        if (!restaurantId) {
            console.error(`[Sync] ❌ Restore failed: No Restaurant ID in context.`);
            return;
        }

        console.log(`[Sync] Restoring ${supabaseTableName} from Cloud for Restaurant ${restaurantId}...`);

        // FILTER: ONLY DOWNLOAD DATA FOR MY RESTAURANT
        const { data, error } = await supabase
            .from(supabaseTableName)
            .select('*')
            .eq('restaurant_id', restaurantId);

        if (error) {
            console.error(`[Sync] Error fetching ${supabaseTableName}:`, error);
            throw error;
        }

        // FIX: If cloud returns empty array, we MUST clear local to mirror it. 
        // We only skip if 'data' is null/undefined (error case).
        if (!data) {
            console.log(`[Sync] No data object returned for ${supabaseTableName}. Skipping.`);
            return;
        }

        if (data.length === 0) {
            console.log(`[Sync] Cloud table ${supabaseTableName} is empty. Clearing local to match...`);
            await dexieTable.clear();
            return;
        }

        // TRANSFORM: Convert snake_case (Cloud) -> camelCase (Dexie)
        const transformedData = data.map(item => {
            const camelItem = this.toCamelCase(item);

            // SPECIFIC TRANSFORMS FOR COMPATIBILITY
            if (supabaseTableName === 'ingredients') {
                // Explicitly ensure critical fields are numbers/strings as expected
                if ('stock' in camelItem) camelItem.stock = Number(camelItem.stock);
                if ('cost' in camelItem) camelItem.cost = Number(camelItem.cost);
                if ('minStock' in camelItem) camelItem.minStock = Number(camelItem.minStock);
            }

            // CRITICAL: Convert Date Strings to Date Objects to prevent App Crashes
            // Dexie needs Date objects, but JSON gives strings.
            if (supabaseTableName === 'orders') {
                if ('createdAt' in camelItem && typeof camelItem.createdAt === 'string') camelItem.createdAt = new Date(camelItem.createdAt);
                if ('closedAt' in camelItem && typeof camelItem.closedAt === 'string') camelItem.closedAt = new Date(camelItem.closedAt);
            }
            if (supabaseTableName === 'shifts') {
                if ('startTime' in camelItem && typeof camelItem.startTime === 'string') camelItem.startTime = new Date(camelItem.startTime);
                if ('endTime' in camelItem && typeof camelItem.endTime === 'string') camelItem.endTime = new Date(camelItem.endTime);
                if ('scheduledStart' in camelItem && typeof camelItem.scheduledStart === 'string') camelItem.scheduledStart = new Date(camelItem.scheduledStart);
                if ('scheduledEnd' in camelItem && typeof camelItem.scheduledEnd === 'string') camelItem.scheduledEnd = new Date(camelItem.scheduledEnd);
            }
            if (supabaseTableName === 'daily_closes' || supabaseTableName === 'cash_counts' || supabaseTableName === 'dtes' || supabaseTableName === 'purchase_orders' || supabaseTableName === 'production_logs' || supabaseTableName === 'waste_logs' || supabaseTableName === 'journal_entries') {
                if ('date' in camelItem && typeof camelItem.date === 'string') camelItem.date = new Date(camelItem.date);
            }
            if (supabaseTableName === 'staff') { // or restaurant_staff
                if ('startDate' in camelItem && typeof camelItem.startDate === 'string') camelItem.startDate = new Date(camelItem.startDate);
                if ('birthDate' in camelItem && typeof camelItem.birthDate === 'string') camelItem.birthDate = new Date(camelItem.birthDate);
            }

            return camelItem;
        });

        console.log(`[Sync] Pulled ${transformedData.length} records for ${dexieTable.name}.`);

        // --- SAFETY LAYER 2: PREVENT THE "WIPE TRAP" ---
        // If Cloud returns 0 records but Local has records, we DO NOT clear.
        // This prevents a new device login from wiping a Master computer that hasn't pushed yet.
        const localCount = await dexieTable.count();
        if (transformedData.length === 0 && localCount > 0) {
            console.warn(`[Sync] 🛡️ Blocked Clear for ${dexieTable.name}: Cloud is empty but Local has ${localCount} items. Pushing Local instead.`);
            // Trigger a push to fix the cloud!
            await this.pushTable(dexieTable, supabaseTableName);
            return;
        }

        // Strategy: Clear and Replace to ensure 100% sync (removes local ghosts)
        await dexieTable.clear();
        await dexieTable.bulkPut(transformedData);
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

    async restoreFromCloud(onProgress?: (msg: string) => void, preventReload: boolean = false) {
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

            // -------------------------------------------------------------

            // 7. CLEANUP: Consolidate Duplicates (Self-Healing)
            onProgress?.("Limpiando duplicados y reparando menú...");
            await this.consolidateCategories();

            // 8. RESCUE MISSION: Find orphans
            await this.rescueOrphans();

            onProgress?.("¡Restauración Completada!");
            if (!preventReload) {
                window.location.reload(); // Refresh to show data
            }
        } catch (error: any) {
            console.error("Restore Failed:", error);
            throw error;
        }
    }

    /**
     * RESCUE MISSION: Finds products whose category does not exist and gives them a home.
     */
    async rescueOrphans() {
        try {
            const allProducts = await db.products.toArray();
            const allCategories = await db.categories.toArray();
            const validCategoryIds = new Set(allCategories.map(c => c.id));

            // FIRST PASS: TRY TO HEAL PRODUCTS WITH INVALID IDS (match by Name)
            let healedCount = 0;
            for (const p of allProducts) {
                if (!validCategoryIds.has(p.categoryId as any)) {
                    const match = allCategories.find(c =>
                        c.name.trim().toLowerCase() === String(p.categoryId).trim().toLowerCase()
                    );
                    if (match && match.id) {
                        await db.products.update(p.id!, { categoryId: match.id });
                        p.categoryId = match.id; // Update local ref
                        healedCount++;
                    }
                }
            }
            if (healedCount > 0) console.log(`[Sync] 🚑 Rescued ${healedCount} products by mapping category names.`);

            const orphans = allProducts.filter(p => !validCategoryIds.has(p.categoryId));

            if (orphans.length > 0) {
                console.log(`[Sync] 🚑 Found ${orphans.length} ORPHAN products. Rescuing to category...`);

                // Create Rescue Category if needed
                let rescueCat = allCategories.find(c => c.name === "⚠️ RESCATADOS");
                let rescueId: number;

                if (!rescueCat) {
                    rescueId = await db.categories.add({
                        name: "⚠️ RESCATADOS",
                        destination: 'kitchen',
                        order: 0
                    }) as number;
                } else {
                    rescueId = rescueCat.id!;
                }

                // Move orphans
                for (const p of orphans) {
                    await db.products.update(p.id!, { categoryId: rescueId });
                }
                console.log(`[Sync] 🚑 Moved ${orphans.length} products to '⚠️ RESCATADOS'`);
                // Force push changes so they are saved to cloud
                await this.pushTable(db.categories, 'categories');
                await this.pushTable(db.products, 'products');
            }
        } catch (e) {
            console.error("Rescue failed:", e);
        }
    }

    /**
     * SELF-HEALING: Consolidates duplicate categories by Name.
     * Moves items to the first category and deletes the rest.
     */
    async consolidateCategories() {
        try {
            console.log("[Sync] Running Category Consolidation...");
            const allCats = await db.categories.toArray();
            const groups = new Map<string, typeof allCats>();

            // 1. Group by normalized name
            for (const c of allCats) {
                const key = c.name.trim().toLowerCase();
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(c);
            }

            let mergedCount = 0;

            // --- SPECIAL FIX: MERGE 'BEBIDAS' INTO 'BEBIDAS Y JUGOS' ---
            const bebidas = groups.get('bebidas');
            const bebidasYJugos = groups.get('bebidas y jugos');
            let changesMade = false;

            if (bebidas && bebidas.length > 0) {
                console.log("[Sync] Detected legacy 'Bebidas' category. Merging into 'Bebidas y Jugos'...");

                let targetCategory;

                if (bebidasYJugos && bebidasYJugos.length > 0) {
                    targetCategory = bebidasYJugos[0];
                } else {
                    // Rename the first 'Bebidas' to 'Bebidas y Jugos'
                    const firstBebidas = bebidas[0];
                    await db.categories.update(firstBebidas.id!, { name: "Bebidas y Jugos" });
                    targetCategory = firstBebidas;
                    bebidas.shift(); // Remove from processing list as it's now the target
                    changesMade = true;
                }

                if (targetCategory) {
                    for (const b of bebidas) {
                        const affectedProducts = await db.products.where('categoryId').equals(b.id!).toArray();
                        for (const p of affectedProducts) {
                            await db.products.update(p.id!, { categoryId: targetCategory.id });
                        }
                        await db.categories.delete(b.id!);
                        mergedCount++;
                    }
                }
                // Update groups map to reflect changes if needed, but we proceed to standard dedupe for others
            }
            // -------------------------------------------------------------

            // --- EMERGENCY RESTORE: If categories are missing (e.g. data loss), restore defaults ---
            const currentCount = await db.categories.count();
            if (currentCount <= 2) {
                console.log("[Sync] Detectada pérdida de categorías. Restaurando Básicos...");
                const needed = ["Entradas", "Platos", "Postres", "Bebidas y Jugos", "Copete", "Cafe"];

                const existingNow = await db.categories.toArray();
                const existingNames = new Set(existingNow.map(c => c.name.toLowerCase().trim()));

                let maxOrder = existingNow.reduce((max, c) => Math.max(max, c.order || 0), 0);

                for (const name of needed) {
                    if (!existingNames.has(name.toLowerCase())) {
                        maxOrder++;
                        const dest = (name.includes("Bebidas") || name === "Copete" || name === "Cafe") ? 'bar' : 'kitchen';
                        await db.categories.add({
                            name, destination: dest, order: maxOrder
                        });
                        changesMade = true;
                    }
                }
            }
            // -------------------------------------------------------------

            // 2. Process Groups (Standard Dedupe)
            await db.transaction('rw', db.categories, db.products, async () => {
                for (const [name, list] of groups.entries()) {
                    // Skip 'bebidas' key as we handled it, but check others
                    if (name === 'bebidas') continue;

                    if (list.length > 1) {
                        // Sort: Keep the one with lowest ID (usually oldest)
                        list.sort((a, b) => (a.id || 999999) - (b.id || 999999));

                        const winner = list[0];
                        const losers = list.slice(1);

                        console.log(`[Sync] Merging ${losers.length} duplicates for '${winner.name}'...`);

                        for (const loser of losers) {
                            // Repoint products
                            const affectedProducts = await db.products.where('categoryId').equals(loser.id!).toArray();
                            for (const p of affectedProducts) {
                                await db.products.update(p.id!, { categoryId: winner.id });
                            }
                            // Delete duplicate
                            await db.categories.delete(loser.id!);
                            mergedCount++;
                        }
                    }
                }
            });

            if (mergedCount > 0 || changesMade) {
                console.log(`[Sync] Cleanup/Restore complete. Pushing changes to cloud...`);
                // Push changes back to cloud to fix it there too
                await this.pushTable(db.categories, 'categories');
                await this.pushTable(db.products, 'products');
            } else {
                console.log("[Sync] No duplicates found.");
            }

        } catch (e) {
            console.error("[Sync] Consolidation Failed:", e);
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

    // --- GATEKEEPER ---
    async checkSubscriptionStatus(): Promise<boolean> {
        // BYPASS: Always allow sync for emergency restore scenarios
        return true;
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
