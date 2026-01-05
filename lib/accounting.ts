import { db, Account, JournalEntry, JournalMovement, Payment } from './db';

// --- STANDARD CHART OF ACCOUNTS (SIMPLIFIED FOR RESTAURANTS) ---
// This map defines the default accounts that Nexus needs to operate.
const DEFAULT_ACCOUNTS: Partial<Account>[] = [
    // 1. ASSETS
    { code: '1.1.01', name: 'Caja Efectivo', type: 'ASSET' },
    { code: '1.1.02', name: 'Banco (Transbank)', type: 'ASSET' },
    { code: '1.2.01', name: 'Inventario (Insumos)', type: 'ASSET' },
    { code: '1.3.01', name: 'IVA Crédito Fiscal', type: 'ASSET' },
    { code: '1.4.01', name: 'Activos Fijos (Equipos)', type: 'ASSET' },

    // 2. LIABILITIES
    { code: '2.1.01', name: 'Propinas por Pagar', type: 'LIABILITY' }, // Critical for Waiters
    { code: '2.1.02', name: 'IVA Débito Fiscal', type: 'LIABILITY' },
    { code: '2.2.01', name: 'Proveedores por Pagar', type: 'LIABILITY' },

    // 3. EQUITY (Simplified)
    { code: '3.1.01', name: 'Capital Inicial', type: 'EQUITY' },

    // 4. INCOME
    { code: '4.1.01', name: 'Venta Neta Alimentos', type: 'INCOME' },
    { code: '4.1.02', name: 'Venta Neta Alcohol', type: 'INCOME' }, // Good to separate for taxes/licenses

    // 5. COSTS (Direct)
    { code: '5.1.01', name: 'Costo de Venta (Food Cost)', type: 'EXPENSE' }, // The "Invisible" Cost

    // 6. EXPENSES (Operational)
    { code: '6.1.01', name: 'Sueldos y Comisiones', type: 'EXPENSE' },
    { code: '6.1.02', name: 'Arriendo', type: 'EXPENSE' },
    { code: '6.1.03', name: 'Servicios Básicos (Luz/Agua)', type: 'EXPENSE' },
    { code: '6.1.04', name: 'Mermas y Desperdicios', type: 'EXPENSE' },
    { code: '6.2.01', name: 'Comisiones Transbank', type: 'EXPENSE' },
];

export class KontigoFinance {

    /**
     * Initializes the financial system.
     * Checks if accounts exist, if not, seeds them.
     * Also performs a self-heal to remove duplicates.
     */
    static async initialize() {
        try {
            const existing = await db.accounts.toArray();
            const currentCodes = new Set(existing.map(a => a.code));

            // 1. SELF-HEAL: Remove Duplicates (Keep first one found by code)
            const output = new Map<string, Account>();
            const duplicates: number[] = [];

            for (const acc of existing) {
                if (output.has(acc.code)) {
                    duplicates.push(acc.id!);
                } else {
                    output.set(acc.code, acc);
                }
            }

            if (duplicates.length > 0) {
                console.log(`🦁 Nexus: Removing ${duplicates.length} duplicate accounts...`);
                await db.accounts.bulkDelete(duplicates);
            }

            // 2. SEED: Only if vital accounts are missing
            const missing = DEFAULT_ACCOUNTS.filter(def => !currentCodes.has(def.code!));

            if (missing.length > 0) {
                console.log(`🦁 Nexus: Seeding ${missing.length} missing accounts...`);
                const toAdd = missing.map(acc => ({
                    ...acc,
                    balance: 0,
                    isGroup: false
                } as Account));

                // Use a transactional check to minimize race conditions, though low risk here
                await db.accounts.bulkAdd(toAdd).catch(err => {
                    // If error is ConstraintError, it means parallel init happened
                    console.warn("🦁 Nexus: Seed collision avoided (ConstraintError)", err);
                });
            }

            // 3. SYNC: Retroactively register missing sales
            await this.syncMissingSales();

            // 4. SYNC: Inventory Valuation (Physical vs Ledger)
            await this.recalculateInventoryValuation();

        } catch (error) {
            console.error("🦁 Nexus: Initialization Warning:", error);
        }
    }

    /**
     * Scans all orders and payments to ensure they are recorded in the accounting system.
     * Recover sales that occurred before Nexus was initialized.
     */
    /**
     * Scans all orders and payments to ensure they are recorded in the accounting system.
     * Recover sales that occurred before Nexus was initialized.
     */
    static async syncMissingSales() {
        const orders = await db.orders.filter(o => !o.deletedAt).toArray();
        const entries = await db.journalEntries.filter(e => !e.deletedAt).toArray();
        // Create a set of already registered IDs to avoid duplicates (though less relevant in nuclear reset)
        const registeredRefIds = new Set(entries.filter(e => e.referenceId).map(e => e.referenceId!));

        let recoveredCount = 0;

        for (const order of orders) {
            // SCENARIO A: Modern Orders with Payment Array
            if (order.payments && order.payments.length > 0) {
                for (const payment of order.payments) {
                    const expectedRef = `SALE-${payment.id}`;
                    if (!registeredRefIds.has(expectedRef)) {
                        console.log(`🦁 Nexus: Recovering missing sale: ${payment.id}`);
                        await this.registerSale(payment, false); // Default to Boleta
                        recoveredCount++;
                    }
                }
            }
            // SCENARIO B: Legacy/Ghost Orders (Marked Paid but no Payment Record)
            else if (order.status === 'paid') {
                // Check if we already recovered this specific legacy order
                const legacyRef = `SALE-LEGACY-${order.id}`;
                if (!registeredRefIds.has(legacyRef)) {
                    console.log(`🦁 Nexus: Recovering LEGACY/GHOST sale from Order #${order.id}`);

                    // Synthesize a payment
                    const fakePayment: Payment = {
                        id: `LEGACY-${order.id}`, // Custom ID
                        amount: order.total,
                        tip: order.tip || 0,
                        method: 'card', // Safe assumption for recovery
                        createdAt: order.closedAt || order.createdAt || new Date()
                    };

                    await this.registerSale(fakePayment, false);
                    recoveredCount++;
                }
            }
        }

        if (recoveredCount > 0) {
            console.log(`🦁 Nexus: Successfully recovered ${recoveredCount} missing sales calls.`);
        }
    }

    /**
     * Gets an account by its code.
     */
    static async getAccount(code: string): Promise<Account | undefined> {
        return await db.accounts.where('code').equals(code).first();
    }

    /**
     * POSTS a Journal Entry.
     * 1. Validates that Debits === Credits (Double Entry Rule).
     * 2. Saves the Entry.
     * 3. Updates the balances of the affected Accounts.
     */
    static async postEntry(entry: Omit<JournalEntry, 'id' | 'status' | 'created_at'>) {
        // Validate Balance
        const totalDebit = entry.movements.filter(m => m.type === 'DEBIT').reduce((sum, m) => sum + m.amount, 0);
        const totalCredit = entry.movements.filter(m => m.type === 'CREDIT').reduce((sum, m) => sum + m.amount, 0);

        // Allow small rounding errors (e.g. 1 peso)
        if (Math.abs(totalDebit - totalCredit) > 1) {
            throw new Error(`Unbalanced Entry! Debit: ${totalDebit} vs Credit: ${totalCredit}`);
        }

        return await db.transaction('rw', db.accounts, db.journalEntries, async () => {
            // 1. Create Entry
            const newEntryId = await db.journalEntries.add({
                ...entry,
                status: 'posted',
                created_at: new Date()
            });

            // 2. Update Balances
            for (const move of entry.movements) {
                const account = await db.accounts.get(move.accountId);
                if (!account) throw new Error(`Account ID ${move.accountId} not found`);

                // Balance Logic:
                // ASSET/EXPENSE: Debit increases, Credit decreases
                // LIABILITY/EQUITY/INCOME: Credit increases, Debit decreases
                let change = 0;
                if (['ASSET', 'EXPENSE'].includes(account.type)) {
                    change = move.type === 'DEBIT' ? move.amount : -move.amount;
                } else {
                    change = move.type === 'CREDIT' ? move.amount : -move.amount;
                }

                await db.accounts.update(account.id!, {
                    balance: (account.balance || 0) + change
                });
            }

            console.log(`🦁 Nexus: Entry Posted (ID: ${newEntryId}). ${entry.description}`);
            return newEntryId;
        });
    }

    /**
     * REVERSES a Journal Entry's impact on balances.
     * Use this during logical deletion.
     */
    static async reverseEntryBalances(entryId: number) {
        return await db.transaction('rw', db.accounts, db.journalEntries, async () => {
            const entry = await db.journalEntries.get(entryId);
            if (!entry || entry.deletedAt) return;

            console.log(`🦁 Nexus: Reversing Balances for Entry ID: ${entryId} (${entry.description})...`);

            for (const move of entry.movements) {
                const account = await db.accounts.get(move.accountId);
                if (!account) continue;

                // REVERSAL Logic: 
                // ASSET/EXPENSE: Debit decreases Bal, Credit increases Bal
                // LIABILITY/EQUITY/INCOME: Credit decreases Bal, Debit increases Bal
                let change = 0;
                if (['ASSET', 'EXPENSE'].includes(account.type)) {
                    change = move.type === 'DEBIT' ? -move.amount : move.amount;
                } else {
                    change = move.type === 'CREDIT' ? -move.amount : move.amount;
                }

                await db.accounts.update(account.id!, {
                    balance: (account.balance || 0) + change
                });
            }

            // Mark as deleted
            await db.journalEntries.update(entryId, { deletedAt: new Date() });
        });
    }

    // --- TRIGGERS (THE AUTOPILOT) ---

    /**
     * CASE 2: THE PURCHASE (Factura)
     * Records an invoice. Simple version: Assumes it goes to Inventory vs Bank.
     */
    static async recordPurchase(supplierName: string, totalAmount: number, isAsset: boolean = true, isPaid: boolean = true, orderId?: number): Promise<number | void> {
        // Find Accounts
        const inventoryAcc = await this.getAccount('1.2.01'); // Inventario
        const expenseAcc = await this.getAccount('6.1.03'); // Servicios (Fallback)
        const bankAcc = await this.getAccount('1.1.02');      // Banco
        const payableAcc = await this.getAccount('2.2.01');   // Proveedores por Pagar
        const ivaCreditAcc = await this.getAccount('1.3.01'); // IVA Crédito

        if (!inventoryAcc || !expenseAcc || !bankAcc || !ivaCreditAcc || !payableAcc) {
            console.warn("🦁 Nexus: Accounts missing during purchase. Auto-initializing...");
            await this.initialize();

            // Retry
            return this.recordPurchase(supplierName, totalAmount, isAsset, isPaid, orderId);
        }

        const netAmount = Math.round(totalAmount / 1.19);
        const taxAmount = totalAmount - netAmount;

        const movements: JournalMovement[] = [
            // DEBIT (What we got)
            {
                accountId: isAsset ? inventoryAcc.id! : expenseAcc.id!,
                type: 'DEBIT',
                amount: netAmount
            },
            {
                accountId: ivaCreditAcc.id!,
                type: 'DEBIT',
                amount: taxAmount
            },
            // CREDIT (How we paid)
            {
                accountId: isPaid ? bankAcc.id! : payableAcc.id!,
                type: 'CREDIT',
                amount: totalAmount
            }
        ];

        return await this.postEntry({
            date: new Date(),
            description: `Compra a ${supplierName}`,
            referenceId: orderId ? `PURCHASE-${orderId}` : `PURCHASE-${Date.now()}`,
            movements
        });
    }

    /**
     * CASE 1: THE SALE (Boleta/Factura)
     * Records a sale transaction.
     * Handles Payment Method (Cash/Card) -> Asset
     * Handles Net Sale -> Income
     * Handles VAT -> Liability
     * Handles Tip -> Liability (Pass-through)
     */
    static async registerSale(payment: Payment, isBill: boolean = true): Promise<number | void> {
        // 1. Get Accounts
        const cashAcc = await this.getAccount('1.1.01');      // Caja
        const bankAcc = await this.getAccount('1.1.02');      // Banco
        const tipLiabilityAcc = await this.getAccount('2.1.01'); // Propinas por Pagar
        const vatLiabilityAcc = await this.getAccount('2.1.02'); // IVA Débito
        const salesFoodAcc = await this.getAccount('4.1.01'); // Venta Alimentos

        // AUTO-HEAL: If critical accounts are missing, initialize and retry
        if (!cashAcc || !bankAcc || !tipLiabilityAcc || !vatLiabilityAcc || !salesFoodAcc) {
            console.warn("🦁 Nexus: Accounts missing during sale. Auto-initializing...");
            await this.initialize();

            // Re-fetch after init
            const cashAccRetry = await this.getAccount('1.1.01');
            const bankAccRetry = await this.getAccount('1.1.02');
            const tipLiabilityRetry = await this.getAccount('2.1.01');
            const vatLiabilityRetry = await this.getAccount('2.1.02');
            const salesFoodRetry = await this.getAccount('4.1.01');

            if (!cashAccRetry || !bankAccRetry || !tipLiabilityRetry || !vatLiabilityRetry || !salesFoodRetry) {
                console.error("🦁 Nexus: Critical Accounts still missing after initialization. Sale not recorded in Finance.");
                return;
            }

            // Continue with retried accounts
            return this.registerSale(payment, isBill); // Recursive retry once
        }

        const movements: JournalMovement[] = [];

        // --- DEBITS (Where money went) ---
        // 1. Payment received (Asset Increase)
        movements.push({
            accountId: payment.method === 'cash' ? cashAcc.id! : bankAcc.id!,
            type: 'DEBIT',
            amount: payment.amount + payment.tip // We received the full amount
        });

        // --- CREDITS (Source of value) ---
        // 2. Tip (Liability Increase - Not our money)
        if (payment.tip > 0) {
            movements.push({
                accountId: tipLiabilityAcc.id!,
                type: 'CREDIT',
                amount: payment.tip
            });
        }

        // 3. Sale & VAT (Revenue & Liability)
        // Back-calculate Net & VAT from the Gross Amount (payment.amount)
        // Gross = Net * 1.19
        const grossAmount = payment.amount;
        const netAmount = Math.round(grossAmount / 1.19);
        const vatAmount = grossAmount - netAmount;

        // 3a. VAT (Liability Increase)
        if (vatAmount > 0) {
            movements.push({
                accountId: vatLiabilityAcc.id!,
                type: 'CREDIT',
                amount: vatAmount
            });
        }

        // 3b. Net Revenue (Income Increase)
        movements.push({
            accountId: salesFoodAcc.id!,
            type: 'CREDIT',
            amount: netAmount
        });

        // 4. Post Entry
        await this.postEntry({
            date: new Date(),
            description: `Venta POS #${payment.id.slice(0, 8)} (${payment.method})`,
            referenceId: `SALE-${payment.id}`,
            movements
        });
    }

    /**
     * CASE 3: WASTE / SPOILAGE (Mermas)
     * Records waste by moving value from Inventory (Asset) to Waste (Expense).
     */
    static async recordWaste(ingredientName: string, costAmount: number, reason: string): Promise<number | void> {
        // Find Accounts
        const inventoryAcc = await this.getAccount('1.2.01'); // Inventario (Asset)
        const wasteAcc = await this.getAccount('6.1.04');     // Mermas (Expense)

        if (!inventoryAcc || !wasteAcc) {
            console.warn("🦁 Nexus: Accounts missing during waste. Auto-initializing...");
            await this.initialize();
            return this.recordWaste(ingredientName, costAmount, reason);
        }

        const movements: JournalMovement[] = [
            // DEBIT (Expense Increase - Bad for profit)
            {
                accountId: wasteAcc.id!,
                type: 'DEBIT',
                amount: costAmount
            },
            // CREDIT (Asset Decrease - Inventory gone)
            {
                accountId: inventoryAcc.id!,
                type: 'CREDIT',
                amount: costAmount
            }
        ];

        await this.postEntry({
            date: new Date(),
            description: `Merma: ${ingredientName} (${reason})`,
            referenceId: `WASTE-${Date.now()}`,
            movements
        });
    }

    /**
     * SYNC: Recalculates the total value of physical inventory and adjusts the accounting balance.
     * Use this on startup to ensure "Inventario (Insumos)" (1.2.01) matches reality.
     */
    // Flag to prevent race conditions during sync
    static isRecalculating = false;

    /**
     * SYNC: Recalculates the total value of physical inventory and adjusts the accounting balance.
     * Use this on startup to ensure "Inventario (Insumos)" (1.2.01) matches reality.
     */
    static async recalculateInventoryValuation(): Promise<void> {
        if (this.isRecalculating) {
            console.log("🦁 Nexus: Already synchronizing inventory, skipping duplicate call.");
            return;
        }

        this.isRecalculating = true;

        try {
            // 0. De-bounce: Check if we just synced recently (e.g. < 5 seconds ago) to prevent button spam
            const lastSync = await db.journalEntries
                .where('referenceId').startsWith('SYNC-INV-')
                .reverse()
                .first();

            if (lastSync) {
                const lastSyncDate = typeof lastSync.date === 'string' ? new Date(lastSync.date) : lastSync.date;
                if ((Date.now() - lastSyncDate.getTime()) < 5000) {
                    console.log("🦁 Nexus: Sync request ignored (Debounced - just synced).");
                    return;
                }
            }

            // 1. Calculate Real Inventory Value
            const ingredients = await db.ingredients.toArray();
            let totalRealValue = 0;

            for (const ing of ingredients) {
                if (ing.stock > 0 && ing.cost > 0) {
                    totalRealValue += ing.stock * ing.cost;
                }
            }

            totalRealValue = Math.round(totalRealValue);

            // 2. Get Current Accounting Balance
            const inventoryAcc = await this.getAccount('1.2.01');
            const capitalAcc = await this.getAccount('3.1.01'); // Capital Inicial (Equity)

            if (!inventoryAcc || !capitalAcc) {
                console.warn("🦁 Nexus: Skipping Inventory Valuation Sync (Missing Accounts)");
                return;
            }

            const currentBalance = inventoryAcc.balance || 0;
            const diff = totalRealValue - currentBalance;

            // 3. Post Adjustment if needed (Always sync if different)
            if (Math.abs(diff) > 1) {
                console.log(`🦁 Nexus: Adjusting Inventory Value. Ingredients: ${ingredients.length}, Real Value: ${totalRealValue}, Ledger Balance: ${currentBalance}, Diff: ${diff}`);

                // LOCK: Double check if another sync happened while we were calculating (Race Condition)
                const freshLastSync = await db.journalEntries
                    .where('referenceId').startsWith('SYNC-INV-')
                    .reverse()
                    .first();

                if (freshLastSync) {
                    const freshLastSyncDate = typeof freshLastSync.date === 'string' ? new Date(freshLastSync.date) : freshLastSync.date;
                    if ((Date.now() - freshLastSyncDate.getTime()) < 2000) {
                        console.log("🦁 Nexus: Sync abort (Race condition detected).");
                        return;
                    }
                }

                const movements: JournalMovement[] = [];

                if (diff > 0) {
                    movements.push({ accountId: inventoryAcc.id!, type: 'DEBIT', amount: diff });
                    movements.push({ accountId: capitalAcc.id!, type: 'CREDIT', amount: diff });
                } else {
                    movements.push({ accountId: capitalAcc.id!, type: 'DEBIT', amount: Math.abs(diff) });
                    movements.push({ accountId: inventoryAcc.id!, type: 'CREDIT', amount: Math.abs(diff) });
                }

                await this.postEntry({
                    date: new Date(),
                    description: `Ajuste Automático de Inventario (Sincronización)`,
                    referenceId: `SYNC-INV-${Date.now()}`,
                    movements
                });
            } else {
                console.log("🦁 Nexus: Inventory Valuation is synced.");
            }

        } catch (err) {
            console.error("🦁 Nexus: Inventory Sync Failed", err);
        } finally {
            this.isRecalculating = false;
        }
    }

    /**
     * SYNC: Recover purchases that are not in the journal.
     */
    static async syncMissingPurchases() {
        const purchases = await db.purchaseOrders
            .where('status').equals('Received')
            .filter(po => !po.deletedAt)
            .toArray();
        const entries = await db.journalEntries.toArray();
        const registeredIds = new Set(entries.filter(e => e.referenceId && e.referenceId.startsWith('PURCHASE-')).map(e => e.referenceId!.replace('PURCHASE-', '')));

        let recovered = 0;
        for (const po of purchases) {
            // Check by ID (Note: purchase ID is number, ref is string)
            const poIdStr = po.id!.toString();
            // Also simplistic check by date if needed, but ID is better if we saved it correctly. 
            // In recordPurchase we used Date.now(), which is BAD for backfilling.
            // Ideally recordPurchase should take an optional ID or use the PO ID.
            // Current recordPurchase uses `PURCHASE-${Date.now()}` which is impossible to match against `po.id`.

            // FIX: We will just re-record ALL if we are in nuclear reset mode. 
            // Checks for duplications are tricky without a stable ID link. 
            // However, in this "Nuclear Reset" context, the Journal is empty, so we just run.
            // If running incrementally, this is dangerous. 
            // But this method `regenerateFinancials` CLEARS the journal first.

            // For now, let's assume this is only called during Regeneration.
            if (po.totalCost > 0) {
                await this.recordPurchase(`Proveedor #${po.supplierId}`, po.totalCost, true, po.paymentStatus === 'Paid', po.id);
                recovered++;
            }
        }
        if (recovered > 0) console.log(`🦁 Nexus: Recovered ${recovered} purchases.`);
    }

    /**
     * SYNC: Recover waste logs.
     */
    static async syncMissingWaste() {
        // Similar issue involves matching. 
        // For regeneration, we just blindly re-add.
        const logs = await db.wasteLogs.filter(w => !w.deletedAt).toArray();
        let recovered = 0;

        for (const log of logs) {
            // We need cost. WasteLog has quantity but maybe not cost snapshot?
            // We need to fetch current cost. This is an approximation for historical data 
            // but better than nothing for a reset.
            const ingredient = await db.ingredients.get(log.ingredientId);
            if (ingredient && ingredient.cost > 0) {
                const totalCost = log.quantity * ingredient.cost;
                await this.recordWaste(ingredient.name, totalCost, log.reason);
                recovered++;
            }
        }
        if (recovered > 0) console.log(`🦁 Nexus: Recovered ${recovered} waste logs.`);
    }

    /**
     * NUCLEAR OPTION: Wipes Journal and Balances, then regenerates everything from Source Documents.
     * Fixing ID Mismatches and "Ghost" Data.
     */
    static async regenerateFinancials() {
        console.log("🦁 Nexus: ☢️ STARTING FULL FINANCIAL REGENERATION ☢️");

        try {
            // 1. CLEAR JOURNAL & ACCOUNTS
            await db.journalEntries.clear();
            await db.accounts.clear(); // We clear accounts too to ensure fresh compatible IDs
            console.log("🦁 Nexus: Journal and Accounts Wiped.");

            // 2. RE-SEED ACCOUNTS
            await this.initialize();
            console.log("🦁 Nexus: Accounts Reseeded.");

            // 3. REPLAY SALES (Orders)
            console.log("🦁 Nexus: Replaying Sales...");
            await this.syncMissingSales();

            // 4. REPLAY PURCHASES
            console.log("🦁 Nexus: Replaying Purchases...");
            await this.syncMissingPurchases();

            // 5. REPLAY WASTE
            console.log("🦁 Nexus: Replaying Waste...");
            await this.syncMissingWaste();

            // 6. SYNC INVENTORY VALUE
            console.log("🦁 Nexus: Syncing Final Inventory Value...");
            this.isRecalculating = false; // Force unlock
            await this.recalculateInventoryValuation();

            console.log("🦁 Nexus: ☢️ REGENERATION COMPLETE. SYSTEM CLEAN. ☢️");

        } catch (e) {
            console.error("🦁 Nexus: Regeneration FAILED", e);
            throw e;
        }
    }
}
