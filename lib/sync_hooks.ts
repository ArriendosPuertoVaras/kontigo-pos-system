import { db } from './db';
import { syncService } from './sync_service';

/**
 * Sync Mapping: Dexie Table -> Supabase Table
 */
const SYNC_MAP: Record<string, string> = {
    products: 'products',
    categories: 'categories',
    ingredients: 'ingredients',
    suppliers: 'suppliers',
    purchaseOrders: 'purchase_orders',
    wasteLogs: 'waste_logs',
    customers: 'customers',
    restaurantTables: 'restaurant_tables',
    orders: 'orders',
    staff: 'staff',
    shifts: 'shifts',
    printers: 'printers',
    modifierTemplates: 'modifier_templates',
    dtes: 'dtes',
    cashCounts: 'cash_counts',
    dailyCloses: 'daily_closes',
    jobTitles: 'job_titles',
    accounts: 'accounts',
    journalEntries: 'journal_entries',
    settings: 'settings',
    productionLogs: 'production_logs'
};

export function initSyncHooks() {
    if (typeof window === 'undefined') return;

    console.log("🦁 Nexus: Initializing Global Auto-Sync Hooks...");

    Object.entries(SYNC_MAP).forEach(([dexieName, supabaseName]) => {
        const table = (db as any)[dexieName];
        if (!table) return;

        // 1. TICKET TAGGING: Every new record gets the Restaurant ID automatically
        table.hook('creating', (primKey: any, obj: any) => {
            const restaurantId = localStorage.getItem('kontigo_restaurant_id');
            if (restaurantId && !obj.restaurantId) {
                obj.restaurantId = restaurantId;
                console.log(`[Hook] 🏷️ Tagged new ${dexieName} with ${restaurantId}`);
            }
        });

        // 2. AUTO-PUSH: Trigger sync on any change
        const triggerSync = () => {
            if (syncService.isSyncing) return; // Prevent loops

            // Debounce or just trigger
            console.log(`[Hook] ⚡ Auto-Sync triggered by ${dexieName}`);
            syncService.autoSync(table, supabaseName);
        };

        table.hook('updating', (mods: any, primKey: any, obj: any) => {
            // Apply restaurantId if missing even on updates (Self-healing)
            const restaurantId = localStorage.getItem('kontigo_restaurant_id');
            if (restaurantId && !obj.restaurantId) {
                mods.restaurantId = restaurantId;
            }
            triggerSync();
        });

        table.hook('deleting', (primKey: any, obj: any) => {
            triggerSync();
        });
    });
}
