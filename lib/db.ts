import Dexie, { Table } from 'dexie';

// --- Interfaces ---
export interface ModifierOption {
    id: string;
    name: string;
    price: number;
    recipe?: RecipeItem[];
}

export interface ModifierGroup {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: ModifierOption[];
}

export interface Product {
    id?: number;
    name: string;
    price: number;
    categoryId: number;
    image?: string;
    modifiers?: ModifierGroup[];
    isAvailable: boolean;
    recipe?: RecipeItem[];
    // Batch Inventory for Production
    stock?: number;
    // New fields for Preparations (Sub-recipes)
    instructions?: string[]; // Steps 1, 2, 3...
    chefNote?: string;
    prepTime?: string; // Active preparation time
    cookTime?: string; // Cooking time
    totalTime?: string; // Total time to client
}

export interface Ingredient {
    id?: number;
    name: string;
    stock: number;
    unit: string;
    cost: number;
    supplierId?: number;
    minStock?: number;
    yieldPercent?: number;
    category?: string;
    purchaseUnit?: string;
    conversionFactor?: number;
    code?: string;
    // New Inventory Categorization
    family?: string;    // e.g. Abarrotes
    subFamily?: string; // e.g. Harinas
    storage?: string;   // e.g. Bodega Seca
    isInfinite?: boolean; // New: For items like Water, Gas, or Service that don't track stock
    // New fields for Preparations (Sub-recipes)
    isPreparation?: boolean;
    recipe?: RecipeItem[];
    instructions?: string[]; // Steps 1, 2, 3...
    chefNote?: string;
    prepTime?: string; // Active preparation time
    cookTime?: string; // Cooking time
    totalTime?: string; // Total time to client
}



export interface RecipeItem {
    ingredientId: number;
    quantity: number;
    unit?: string;
    section?: string; // e.g. "Masa", "Pino"
    notes?: string;   // e.g. "Harina de fuerza media"
}

export interface Category {
    id?: number;
    name: string;
    destination?: string; // Changed from union to string for custom areas
    course?: 'starter' | 'main' | 'dessert' | 'beverage';
    order?: number;
}


export interface Supplier {
    id?: number;
    name: string;
    contactName: string;
    email: string;
    phone: string;
    leadTimeDays: number;
    category: string;
}

export interface PurchaseOrderItem {
    ingredientId: number;
    quantity: number;
    unitCost: number;
    purchaseUnit?: string;
}

export interface PurchaseOrder {
    id?: number;
    supplierId: number;
    date: Date;
    status: 'Pending' | 'Ordered' | 'Received';
    totalCost: number;
    items: PurchaseOrderItem[];
}

export interface WasteLog {
    id?: number;
    ingredientId: number;
    quantity: number;
    reason: 'Expired' | 'Damaged' | 'Mistake' | 'Other';
    date: Date;
    note?: string;
}

export interface Customer {
    id?: number;
    name: string;
    phone: string;
    email: string;
    notes?: string;
    totalSpent: number;
    visitCount: number;
    lastVisit: Date;
}

export interface TicketItem {
    product: Product;
    quantity: number;
    selectedModifiers?: ModifierOption[];
    notes?: string;
}

export interface RestaurantTable {
    id?: number;
    name: string;
    status: 'available' | 'occupied' | 'reserved';
    currentOrderId?: number;
    x: number;
    y: number;
}

export interface Payment {
    id: string; // UUID
    amount: number;
    tip: number;
    method: 'cash' | 'card' | 'transfer';
    createdAt: Date;
}

export interface Order {
    id?: number;
    tableId: number;
    staffId?: number;
    covers?: number;
    items: TicketItem[];
    status: 'open' | 'ready' | 'paid' | 'cancelled';
    subtotal: number;
    tip: number;
    total: number;
    payments?: Payment[];
    createdAt: Date;
    closedAt?: Date;
}

export interface JobTitle {
    id?: number;
    name: string;
    active: boolean;
    permissions?: string[]; // Array of Permission IDs
}

export interface Staff {
    id?: number;
    name: string;
    pin: string;
    role: string; // Changed from enum to string for dynamic roles
    avatarColor?: string;
    phone?: string;
    email?: string;
    contractType: '40-hours' | '44-hours' | 'part-time' | 'art-22';
    contractDuration: 'indefinite' | 'fixed';
    startDate?: Date;
    weeklyHoursLimit: number;
    activeRole: string; // Changed from enum to string
    rut?: string;
    nationality?: string;
    birthDate?: Date;
    address?: string; // Standard address field
    status?: 'active' | 'inactive'; // New Status field
    salaryType?: 'monthly' | 'hourly';
    baseSalary?: number;
    gratification?: boolean;
    colacion?: number;
    movilizacion?: number;
    estimatedTips?: number; // New: Propinas (Informational)
    afp?: 'Modelo' | 'Uno' | 'Habitat' | 'Capital' | 'Provida' | 'PlanVital' | 'Cuprum';
    healthSystem?: 'Fonasa' | 'Isapre';
    healthFee?: number; // Isapre clp/uf
    seguroCesantia?: boolean;
    bankDetails?: {
        bank: string;
        accountType: 'corriente' | 'vista' | 'ahorro';
        accountNumber: string;
    };
}

export interface Shift {
    id?: number;
    staffId: number;
    startTime: Date;
    endTime?: Date;
    cashStart?: number;
    cashEnd?: number;
    salesTotal?: number;
    type: 'work' | 'day_off' | 'sick';
    scheduledStart?: Date;
    scheduledEnd?: Date;
    isOvertime?: boolean;
    managerApproval?: 'pending' | 'approved' | 'rejected';
    autoClockOut?: boolean;
}

export interface Printer {
    id?: number;
    name: string;
    ip: string;
    categories: string[];
    type: 'network' | 'usb';
}

export interface ModifierTemplate {
    id?: number;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: ModifierOption[];
}

export interface DTE {
    id?: number;
    orderId?: number;
    type: number;
    folio: number;
    date: Date;
    amount: number;
    receiverRut?: string;
    receiverName?: string;
    receiverAddress?: string;
    xmlContent?: string;
    status: 'issued' | 'received' | 'voided';
}

export interface CashCount {
    id?: number;
    shiftId: number;
    date: Date;
    staffId: number;
    declaredCash: number;
    systemCash: number;
    difference: number;
    notes?: string;
    details?: { denomination: number; quantity: number }[];
}

export interface DailyClose {
    id?: number;
    date: Date; // Closing Date
    startTime?: Date; // Opening Date/Time
    openingCash?: number; // Fondo de Caja
    totalSales: number;
    totalCash: number; // Cash from Sales
    totalCard: number;
    totalOnline: number;
    totalTips: number;
    dteCount: number;
    cashDifference: number;
    closedBy: string;
    status?: 'open' | 'closed';
}

export interface ProductionLog {
    id?: number;
    productId: number;
    productName: string; // Snapshot
    quantity: number;
    date: Date;
    staffId?: number; // Optional: who cooked it
    costPerUnit?: number; // Snapshot of cost at that time
}

// --- PHASE 3: FINANCIAL NEXUS (ACCOUNTING CORE) ---

export interface Account {
    id?: number;
    code: string; // e.g. "1.1.01"
    name: string; // e.g. "Caja Efectivo"
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    balance: number; // Current balance (cached) for quick dashboards
    isGroup?: boolean; // If true, it sums children
    parentCode?: string;
}

export interface JournalMovement {
    accountId: number;
    type: 'DEBIT' | 'CREDIT';
    amount: number;
}

export interface JournalEntry {
    id?: number;
    date: Date;
    description: string;
    referenceId?: string; // e.g. "ORDER-123", "BILL-456", "CLOSE-2023-10-20"
    movements: JournalMovement[];
    status: 'draft' | 'posted';
    created_at: Date;
}

export interface SystemSetting {
    id?: number;
    key: string;
    value: any;
}

// --- Database Definition ---
export class KontigoDatabase extends Dexie {
    products!: Table<Product>;
    categories!: Table<Category>;
    ingredients!: Table<Ingredient>;
    suppliers!: Table<Supplier>;
    purchaseOrders!: Table<PurchaseOrder>;
    wasteLogs!: Table<WasteLog>;
    customers!: Table<Customer>;
    restaurantTables!: Table<RestaurantTable>;
    orders!: Table<Order>;
    staff!: Table<Staff>;
    shifts!: Table<Shift>;
    printers!: Table<Printer>;
    modifierTemplates!: Table<ModifierTemplate>;
    dtes!: Table<DTE>;
    cashCounts!: Table<CashCount>;
    dailyCloses!: Table<DailyClose>;
    jobTitles!: Table<JobTitle>; // New Table

    // New Accounting Tables
    accounts!: Table<Account>;
    journalEntries!: Table<JournalEntry>;
    settings!: Table<SystemSetting>;
    productionLogs!: Table<ProductionLog>;

    constructor() {
        super('Kontigo_Final'); // Force final fresh DB
        console.log("--> INITIALIZING KONTIGO DATABASE: Kontigo_Final");

        this.version(8).stores({ // Bump to v8
            products: '++id, categoryId, name',
            categories: '++id, name, order',
            ingredients: '++id, name, supplierId, code',
            suppliers: '++id, name',
            purchaseOrders: '++id, supplierId, date, status',
            wasteLogs: '++id, ingredientId, date, reason',
            customers: '++id, name, phone, email',
            restaurantTables: '++id, status',
            orders: '++id, tableId, status, createdAt',
            staff: '++id, name, pin, role, status', // Added status index
            shifts: '++id, staffId, startTime',
            printers: '++id, name',
            modifierTemplates: '++id, name',
            dtes: '++id, type, folio, date',
            cashCounts: '++id, date',
            dailyCloses: '++id, date',
            jobTitles: '++id, &name, active',
            accounts: '++id, &code, type',
            journalEntries: '++id, date, status, referenceId',
            productionLogs: '++id, productId, date'
        });

        this.version(9).stores({
            settings: '++id, &key'
        });

        this.version(10).stores({
            dailyCloses: '++id, date, status' // Indexing status for fast lookup of open sessions
        });

        // Populate if empty
        this.on('populate', () => seedDatabase());
    }
}

export const db = new KontigoDatabase();

// --- Seeder Function ---
export async function seedDatabase() {
    try {
        const staffCount = await db.staff.count();

        // ONLY Seed Emergency Admin if absolutely empty (Critical for Login)
        if (staffCount === 0) {
            console.log("🦁 Nexus: Seeding Default Staff...");
            await db.staff.bulkAdd([
                {
                    name: "Admin",
                    pin: "0000",
                    role: "manager",
                    activeRole: "manager",
                    contractType: "art-22",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 45,
                    salaryType: "monthly",
                    baseSalary: 0,
                    estimatedTips: 0,
                    status: 'active'
                },
                {
                    name: "Cocinero",
                    pin: "1111",
                    role: "Cocina",
                    activeRole: "Cocina",
                    contractType: "44-hours",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 45,
                    salaryType: "monthly",
                    baseSalary: 500000,
                    estimatedTips: 50000,
                    status: 'active',
                    avatarColor: "bg-red-500"
                },
                {
                    name: "Garzón",
                    pin: "2222",
                    role: "Garzón",
                    activeRole: "Garzón",
                    contractType: "part-time",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 30,
                    salaryType: "hourly",
                    baseSalary: 2500,
                    estimatedTips: 150000,
                    status: 'active',
                    avatarColor: "bg-blue-500"
                },
                {
                    name: "Barra",
                    pin: "3333",
                    role: "Barra",
                    activeRole: "Barra",
                    contractType: "44-hours",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 45,
                    salaryType: "monthly",
                    baseSalary: 550000,
                    estimatedTips: 100000,
                    status: 'active',
                    avatarColor: "bg-purple-500"
                }
            ]);
        }

    } catch (e) {
        console.error("Database Check Failed:", e);
    }

    // MIGRATION: Ensure all staff have 'status' (Fix for "Loading..." issue)
    try {
        const legacyStaff = await db.staff.filter(s => !s.status).toArray();
        if (legacyStaff.length > 0) {
            console.log(`Migrating ${legacyStaff.length} staff members to active status...`);
            await db.staff.bulkPut(legacyStaff.map(s => ({ ...s, status: 'active' })));
        }
    } catch (e) { console.error("Migration Failed:", e); }

    // MIGRATION: Fix "waiter" role to "Garzón" (Language Standardization)
    try {
        const waiterStaff = await db.staff.filter(s => s.role === 'waiter' || s.activeRole === 'waiter').toArray();
        if (waiterStaff.length > 0) {
            console.log(`🦁 Nexus: Migrating ${waiterStaff.length} staff from 'waiter' to 'Garzón'...`);
            const updates = waiterStaff.map(s => ({
                ...s,
                role: s.role === 'waiter' ? 'Garzón' : s.role,
                activeRole: s.activeRole === 'waiter' ? 'Garzón' : s.activeRole
            }));
            await db.staff.bulkPut(updates as any); // Type cast if needed
        }
    } catch (e) { console.error("Role Migration Failed:", e); }

    // Seed Job Titles if empty
    try {
        const titleCount = await db.jobTitles.count();
        if (titleCount === 0) {
            console.log("Seeding Default Job Titles...");
            await db.jobTitles.bulkAdd([
                { name: 'Administrador', active: true },
                { name: 'Garzón', active: true },
                { name: 'Cocina', active: true },
                { name: 'Barra', active: true },
                { name: 'Copero', active: true },
                { name: 'Aseo', active: true },
                { name: 'Manager', active: true } // Legacy fallback
            ]);
        }
    } catch (e) { console.error("Job Title Seed Failed", e); }

    // CHECK: Enable Default Staff if missing (e.g. only Admin exists)
    try {
        const cookExists = await db.staff.where('role').equals('Cocina').count();
        if (cookExists === 0) {
            console.log("🦁 Nexus: Seeding Missing Default Staff...");
            await db.staff.bulkAdd([
                {
                    name: "Cocinero",
                    pin: "1111",
                    role: "Cocina",
                    activeRole: "Cocina",
                    contractType: "44-hours",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 45,
                    salaryType: "monthly",
                    baseSalary: 500000,
                    estimatedTips: 50000,
                    status: 'active',
                    avatarColor: "bg-red-500"
                },
                {
                    name: "Garzón",
                    pin: "2222",
                    role: "Garzón",
                    activeRole: "Garzón",
                    contractType: "part-time",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 30,
                    salaryType: "hourly",
                    baseSalary: 2500,
                    estimatedTips: 150000,
                    status: 'active',
                    avatarColor: "bg-blue-500"
                },
                {
                    name: "Barra",
                    pin: "3333",
                    role: "Barra",
                    activeRole: "Barra",
                    contractType: "44-hours",
                    contractDuration: "indefinite",
                    weeklyHoursLimit: 45,
                    salaryType: "monthly",
                    baseSalary: 550000,
                    estimatedTips: 100000,
                    status: 'active',
                    avatarColor: "bg-purple-500"
                }
            ]);
        }
    } catch (e) {
        console.error("Staff Seed Check Failed:", e);
    }
}

