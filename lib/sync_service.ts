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
    public isReady = false; // Flag to enable auto-sync only after initial pull
    public lastError: string | null = null;

    private channel: any = null;
    public channelStatus: 'connecting' | 'connected' | 'error' | 'disconnected' | 'timed_out' = 'disconnected';
    private subscriptionCallbacks: Array<{ tableName: string, dexieTable: Table, onUpdate?: (payload: any) => void }> = [];
    private activeListeners: Set<string> = new Set();

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

                // CRITICAL FIX: Ensure 'email' is preserved
                // (No action needed as we don't delete it, but verifying logic flow)


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

        // 4. MIRROR SYNC (DEPRECATED): We no longer delete cloud records automatically
        // to match local state. This is to ensure a Cloud-First architecture where
        // local devices can never 'wipe' the master database.
        /*
        const SAFE_TO_MIRROR = [ ... ];
        if (SAFE_TO_MIRROR.includes(supabaseTableName)) { ... }
        */
        console.log(`[Sync] ${supabaseTableName} push complete (Non-destructive).`);
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
            await this.pushTable(db.apiKeys, 'api_keys'); // Sync API Keys

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

        // FILTER: ONLY DOWNLOAD DATA FOR MY RESTAURANT AND NOT DELETED
        const { data, error } = await supabase
            .from(supabaseTableName)
            .select('*')
            .eq('restaurant_id', restaurantId)
            .is('deleted_at', null);

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

            // Logically deleted items transformation
            if ('deletedAt' in camelItem && typeof camelItem.deletedAt === 'string') {
                camelItem.deletedAt = new Date(camelItem.deletedAt);
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
            await this.pullTable(db.apiKeys, 'api_keys');

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
            await this.pullTable(db.cashCounts, 'cash_counts');
            await this.pullTable(db.dailyCloses, 'daily_closes');

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

            // Loose ID Set for comparison (handles "1" vs 1)
            const validCategoryIds = new Set(allCategories.map(c => String(c.id)));
            const firstValidCatId = allCategories[0]?.id;

            // FIRST PASS: TRY TO HEAL PRODUCTS WITH INVALID IDS (match by Name or loose ID)
            let healedCount = 0;
            for (const p of allProducts) {
                const pCatIdStr = String(p.categoryId);

                // If ID is valid (strictly or loosely), ensure strict number type if needed
                if (validCategoryIds.has(pCatIdStr)) {
                    // Ensure type consistency if needed, but Dexie handles mixed types fine usually.
                    // If p.categoryId is string "5", but ID is 5, it matches now.
                    continue;
                }

                // If invalid, try to match by Name
                const match = allCategories.find(c =>
                    c.name.trim().toLowerCase() === String(p.categoryId).trim().toLowerCase()
                );

                if (match && match.id) {
                    await db.products.update(p.id!, { categoryId: match.id });
                    p.categoryId = match.id;
                    healedCount++;
                    continue;
                }

                // If still invalid, and we have a valid category, move to first one (Emergency)
                // Instead of creating "RESCATADOS" which annoys the user, we default to the first one.
                if (firstValidCatId) {
                    await db.products.update(p.id!, { categoryId: firstValidCatId });
                    healedCount++;
                    console.log(`[Sync] 🚑 Moved orphan product ${p.name} to first valid category (${allCategories[0].name})`);
                }
            }
            if (healedCount > 0) {
                console.log(`[Sync] 🚑 Rescued ${healedCount} products.`);
                // Force push changes
                await this.pushTable(db.products, 'products');
            }

            // AGGRESSIVE CLEANUP: "RESCATADOS" MUST DIE
            // The user hates this category. If it exists, we empty it and kill it.
            const jail = allCategories.find(c => c.name === "⚠️ RESCATADOS");
            if (jail) {
                // 1. Check for inmates
                const inmates = await db.products.where('categoryId').equals(jail.id!).toArray();

                if (inmates.length > 0) {
                    console.log(`[Sync] 🧹 Creating amnesty for ${inmates.length} items in 'RESCATADOS'...`);
                    // Move them to a safe haven (First legitimate category)
                    // We prefer "Kitchen" dest categories if possible, but first valid is fine as fallback.
                    const safeHaven = allCategories.find(c => c.id !== jail.id!) || allCategories[0];

                    if (safeHaven) {
                        for (const inmate of inmates) {
                            await db.products.update(inmate.id!, { categoryId: safeHaven.id });
                        }
                        console.log(`[Sync] 🚑 Moved ${inmates.length} items from 'RESCATADOS' to '${safeHaven.name}'`);
                        await this.pushTable(db.products, 'products');
                    }
                }

                // 2. Delete the jail LOGICALLY so it syncs to cloud
                await db.categories.update(jail.id!, { deletedAt: new Date() });
                await this.pushTable(db.categories, 'categories');
                console.log("[Sync] 🧹 Marked '⚠️ RESCATADOS' for deletion in cloud.");
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

            // --- EMERGENCY RESTORE: DISABLED FOR CLOUD-FIRST PURITY ---
            // We no longer want to inject "defaults" if the user has a small menu.
            /*
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
            */
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
                            // LOGICAL DELETE: mark as deleted instead of wiping from DB
                            await db.categories.update(loser.id!, { deletedAt: new Date() });
                            mergedCount++;
                        }
                    }
                }
            });

            if (mergedCount > 0 || changesMade) {
                console.log(`[Sync] 🤝 Consolidated ${mergedCount} duplicate categories.`);
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

    /**
     * SYNC DELETE: Physically deletes from local Dexie AND cloud Supabase.
     */
    async syncDelete(table: Table, supabaseName: string, id: number | string) {
        const restaurantId = localStorage.getItem('kontigo_restaurant_id');

        console.log(`[SyncDelete] 🔥 Deleting ID ${id} from ${table.name} and ${supabaseName}...`);

        try {
            // 1. Delete from Dexie
            await table.delete(id);

            // 2. Delete from Supabase if online
            if (navigator.onLine && restaurantId) {
                const { error } = await supabase
                    .from(supabaseName)
                    .delete()
                    .eq('id', id)
                    .eq('restaurant_id', restaurantId);

                if (error) {
                    console.error(`[SyncDelete] ❌ Cloud delete failed for ${supabaseName}:`, error);
                    // We don't throw here to avoid blocking UI, as local is already gone.
                } else {
                    console.log(`[SyncDelete] ✅ Cloud delete success for ${supabaseName}.`);
                }
            }
        } catch (err) {
            console.error(`[SyncDelete] 💥 Fatal error:`, err);
            throw err;
        }
    }

    // --- GATEKEEPER ---
    async checkSubscriptionStatus(): Promise<boolean> {
        // BYPASS: Always allow sync for emergency restore scenarios
        return true;
    }

    // --- REALTIME NEXUS ---
    /**
     * Listens for changes in Supabase and updates local Dexie.
     * Use this for critical shared state like 'restaurant_tables' or 'orders'.
     */
    // --- NEXUS REALTIME ENGINE (Supabase Channels) ---
    private channels: Map<string, any> = new Map(); // Multiple channels for isolated table sync

    async subscribeToTable(tableName: string, dexieTable: Table, onUpdate?: (payload: any) => void) {
        let restaurantId = localStorage.getItem('kontigo_restaurant_id');

        // HEALER: Remove unexpected quotes if they exist
        if (restaurantId) {
            restaurantId = restaurantId.replace(/^[\"\'](.+)[\"\']$/, '$1');
        }

        // Store for later if ID is missing (e.g. session starting)
        const exists = this.subscriptionCallbacks.find(s => s.tableName === tableName);
        if (!exists) {
            this.subscriptionCallbacks.push({ tableName, dexieTable, onUpdate });
        }

        if (!restaurantId) {
            console.warn(`📡 [Realtime] Delaying connection for ${tableName}: No Restaurant ID yet.`);
            this.channelStatus = 'connecting';
            return;
        }

        // --- NEW: NEXUS SELF-HEALING (Cloud Auth vs Local context) ---
        this.healNexusHealth(restaurantId).catch(console.error);

        const supabaseTableName = tableName === 'restaurantTables' ? 'restaurant_tables' : tableName;
        const channelKey = `nexus:${supabaseTableName}`;

        // Cleanup existing channel for this table if it exists
        if (this.channels.has(channelKey)) {
            const oldChannel = this.channels.get(channelKey);
            if (oldChannel.state === 'joined' || oldChannel.state === 'joining') {
                console.log(`📡 [Realtime] Channel for ${supabaseTableName} already active.`);
                return;
            }
            supabase.removeChannel(oldChannel);
            this.channels.delete(channelKey);
        }

        console.log(`📡 [Realtime] Creating Isolated Nexus Channel for ${supabaseTableName}...`);
        const channel = supabase.channel(channelKey);
        this.channels.set(channelKey, channel);
        this.channelStatus = 'connecting';

        channel
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: supabaseTableName,
                    filter: `restaurant_id=eq.${restaurantId}`
                },
                async (payload: any) => {
                    console.log(`📡 [Realtime] Pulse on ${tableName}:`, payload.eventType);

                    try {
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            const camelItem = this.toCamelCase(payload.new);

                            // Specific transforms for local Dexie compatibility
                            if (tableName === 'orders') {
                                if ('createdAt' in camelItem && typeof camelItem.createdAt === 'string') camelItem.createdAt = new Date(camelItem.createdAt);
                                if ('closedAt' in camelItem && typeof camelItem.closedAt === 'string') camelItem.closedAt = new Date(camelItem.closedAt);
                            }

                            // Atomic Update Local DB (Overwrite with source of truth)
                            await dexieTable.put(camelItem);
                            onUpdate?.(camelItem);
                        } else if (payload.eventType === 'DELETE') {
                            const id = payload.old.id;
                            if (id) await dexieTable.delete(id);
                            onUpdate?.({ id, deleted: true });
                        }
                    } catch (err) {
                        console.error(`📡 [Realtime] Failed to apply update for ${tableName}:`, err);
                    }
                }
            );

        // Always attempt to subscribe (it's idempotent if already joined)
        channel.subscribe((status: string, err?: any) => {
            console.log(`📡 [Realtime] [${supabaseTableName}] Status: ${status}`, err || '');

            // Global status management (Aggregated)
            if (status === 'SUBSCRIBED') {
                this.channelStatus = 'connected';
                this.lastError = null;
            } else if (status === 'TIMED_OUT') {
                this.channelStatus = 'timed_out';
                this.lastError = `Nexus ${tableName}: Timeout`;
                setTimeout(() => this.subscribeToTable(tableName, dexieTable, onUpdate), 5000);
            } else if (status === 'CHANNEL_ERROR') {
                this.channelStatus = 'error';
                const errorDetail = err?.message || err || 'Error de vinculación RLS/Canal';
                this.lastError = `Nexus ${tableName}: Error (${errorDetail})`;
                console.error(`📡 [Realtime] ${tableName} Error:`, err);
            }
        });
    }

    /**
     * Call this when restaurantId becomes available (e.g. after login/handshake)
     */
    async retrySubscriptions() {
        if (this.subscriptionCallbacks.length === 0) return;
        console.log(`📡 [Realtime] Retrying ${this.subscriptionCallbacks.length} subscriptions...`);
        for (const sub of this.subscriptionCallbacks) {
            await this.subscribeToTable(sub.tableName, sub.dexieTable, sub.onUpdate);
        }
    }

    /**
     * SELF-HEALING: Verifies that the user is authenticated in Supabase
     * and that their Cloud Profile is linked to the correct restaurant.
     * If there's a mismatch, it ATTEMPTS TO FIX IT automatically.
     */
    async healNexusHealth(localRestaurantId: string) {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error("🕵️ Nexus Health: Session error detected.", sessionError);
                this.lastError = `Error de sesión: ${sessionError.message}`;
                return;
            }

            if (!session) {
                console.warn("🕵️ Nexus Health: No Supabase Session found. RLS will block and trigger Red Status.");
                this.lastError = "No hay sesión activa de Supabase. Re-inicia sesión.";
                return;
            }

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('restaurant_id')
                .eq('id', session.user.id)
                .single();

            // HEAL: If profile missing or mismatching, update it!
            if (error || !profile || profile.restaurant_id !== localRestaurantId) {
                console.warn(`🕵️ Nexus Healing: Mismatch detected. Attempting to update cloud profile...`);

                const { error: patchError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: session.user.id,
                        restaurant_id: localRestaurantId,
                        role: 'manager',
                        name: session.user.user_metadata?.full_name || 'Admin'
                    });

                if (patchError) {
                    console.error("🕵️ Nexus Healing: Failed to patch profile.", patchError);
                    this.lastError = "Error de permisos: No se pudo marcar perfil";
                } else {
                    console.log("🕵️ Nexus Healing: ✅ Cloud profile updated successfully.");
                    this.lastError = null;
                    // Trigger a re-subscription attempt now that RLS is happy
                    setTimeout(() => this.retrySubscriptions(), 1000);
                }
            } else {
                console.log("🕵️ Nexus Health: ✅ Session and Profile are synced.");
                this.lastError = null;
            }
        } catch (err) {
            console.error("🕵️ Nexus Health Check crashed:", err);
            this.lastError = "Fallo en diagnóstico Nexus";
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
