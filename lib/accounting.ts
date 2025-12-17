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

        } catch (error) {
            console.error("🦁 Nexus: Initialization Warning:", error);
        }
    }

    /**
     * Scans all orders and payments to ensure they are recorded in the accounting system.
     * Recover sales that occurred before Nexus was initialized.
     */
    static async syncMissingSales() {
        const orders = await db.orders.toArray();
        const entries = await db.journalEntries.toArray();
        const registeredPaymentIds = new Set(entries.filter(e => e.referenceId).map(e => e.referenceId!.replace('SALE-', '')));

        let recoveredCount = 0;

        for (const order of orders) {
            if (!order.payments) continue;

            for (const payment of order.payments) {
                if (!registeredPaymentIds.has(payment.id)) {
                    console.log(`🦁 Nexus: Recovering missing sale: ${payment.id}`);
                    await this.registerSale(payment);
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

    // --- TRIGGERS (THE AUTOPILOT) ---

    /**
     * CASE 2: THE PURCHASE (Factura)
     * Records an invoice. Simple version: Assumes it goes to Inventory vs Bank.
     */
    static async recordPurchase(supplierName: string, totalAmount: number, isAsset: boolean = true) {
        // Find Accounts
        const inventoryAcc = await this.getAccount('1.2.01'); // Inventario
        const expenseAcc = await this.getAccount('6.1.03'); // Servicios (Fallback)
        const bankAcc = await this.getAccount('1.1.02');      // Banco
        const ivaCreditAcc = await this.getAccount('1.3.01'); // IVA Crédito

        if (!inventoryAcc || !expenseAcc || !bankAcc || !ivaCreditAcc) {
            throw new Error("Missing Default Accounts for Purchase");
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
                accountId: bankAcc.id!,
                type: 'CREDIT',
                amount: totalAmount
            }
        ];

        await this.postEntry({
            date: new Date(),
            description: `Compra a ${supplierName}`,
            referenceId: `PURCHASE-${Date.now()}`,
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
    static async registerSale(payment: Payment, isBill: boolean = true) {
        // 1. Get Accounts
        const cashAcc = await this.getAccount('1.1.01');      // Caja
        const bankAcc = await this.getAccount('1.1.02');      // Banco
        const tipLiabilityAcc = await this.getAccount('2.1.01'); // Propinas por Pagar
        const vatLiabilityAcc = await this.getAccount('2.1.02'); // IVA Débito
        const salesFoodAcc = await this.getAccount('4.1.01'); // Venta Alimentos

        if (!cashAcc || !bankAcc || !tipLiabilityAcc || !vatLiabilityAcc || !salesFoodAcc) {
            console.error("🦁 Nexus: Missing Critical Accounts for Sale!");
            return; // Fail gracefully or throw
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
    static async recordWaste(ingredientName: string, costAmount: number, reason: string) {
        // Find Accounts
        const inventoryAcc = await this.getAccount('1.2.01'); // Inventario (Asset)
        const wasteAcc = await this.getAccount('6.1.04');     // Mermas (Expense)

        if (!inventoryAcc || !wasteAcc) {
            console.error("🦁 Nexus: Missing Accounts for Waste Recording!");
            return;
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

    // TODO: Add recordDailyClose() and recordConsumption()
}
