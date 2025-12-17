
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { addDays, subDays, setHours, setMinutes, getDay } = require('date-fns');

// --- 1. CONFIGURATION ---
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            envConfig[key.trim()] = value.trim();
        }
    });
}
const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ ERROR: Missing Supabase Credentials.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 2. DATA DEFINITIONS ---

const MOCK_STAFF = [
    { name: "Ricardo Manager", pin: "1234", role: "manager", active_role: 'manager', contract_type: 'art-22', hourly_rate: 0 },
    { name: "Juan Cocinero", pin: "0000", role: "kitchen", active_role: 'kitchen', contract_type: '44-hours', hourly_rate: 5000 },
    { name: "Ana Garzona", pin: "1111", role: "waiter", active_role: 'waiter', contract_type: '44-hours', hourly_rate: 4500 },
    { name: "Barman Estrella", pin: "3333", role: "bar", active_role: 'bar', contract_type: '44-hours', hourly_rate: 5500 }
];

const TABLE_COUNT = 20;

// --- 3. SEEDING FUNCTIONS ---

async function seedStaff() {
    console.log("👤 Seeding Staff...");
    const { error } = await supabase.from('staff').upsert(MOCK_STAFF, { onConflict: 'name' });
    if (error) console.error("Error seeding staff:", error.message);
}

async function seedTables() {
    console.log("🪑 Seeding Tables...");
    const tables = [];
    for (let i = 1; i <= TABLE_COUNT; i++) {
        const row = Math.floor((i - 1) / 5);
        const col = (i - 1) % 5;
        tables.push({
            name: `Mesa ${i}`,
            status: 'available',
            x: col,
            y: row
        });
    }
    // We confirm names to avoid duplicates if re-run, but upsert helps
    // Since ID is auto-gen, we upsert on name if we had a unique constraint, otherwise just insert if empty.
    // Ideally we truncate or check count. For safety, we check count.
    const { count } = await supabase.from('restaurant_tables').select('*', { count: 'exact', head: true });
    if (count === 0) {
        const { error } = await supabase.from('restaurant_tables').insert(tables);
        if (error) console.error("Error seeding tables:", error.message);
    }
}

async function seedOrders() {
    console.log("🍕 Seeding Orders (This may take a moment)...");

    // Check if we already have orders to avoid double seeding
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    if (count > 0) {
        console.log("   Orders already exist. Skipping history generation to avoid duplication.");
        return;
    }

    const today = new Date();
    const ordersToAdd = [];
    const paymentsToAdd = []; // If we were splitting tables, but we store payments in JSONB in orders for now based on schema?
    // Wait, schema has `payments jsonb` column in `orders`.

    // Get Staff IDs for random assignment
    const { data: staffList } = await supabase.from('staff').select('id');
    const staffIds = staffList ? staffList.map(s => s.id) : [];

    // Get Table IDs
    const { data: tableList } = await supabase.from('restaurant_tables').select('id');
    const tableIds = tableList ? tableList.map(t => t.id) : [];

    if (staffIds.length === 0 || tableIds.length === 0) {
        console.warn("   Skipping orders: No staff or tables found.");
        return;
    }

    // Google Maps Curve Logic (Simplified)
    for (let i = 0; i <= 30; i++) {
        const date = subDays(today, i);
        const dayOfWeek = getDay(date);

        for (let h = 12; h < 24; h++) {
            let intensity = 0.1;
            if (h >= 13 && h <= 15) intensity = 0.8; // Lunch
            if (h >= 20 && h <= 23) intensity = 0.9; // Dinner

            const maxOrders = 5; // Reduced for script performance vs 15 in local
            const ordersThisHour = Math.floor(Math.random() * maxOrders * intensity);

            for (let o = 0; o < ordersThisHour; o++) {
                const orderTime = setMinutes(setHours(date, h), Math.floor(Math.random() * 60));
                const total = Math.floor(Math.random() * 30000) + 10000;
                const tip = Math.floor(total * 0.1);

                ordersToAdd.push({
                    table_id: tableIds[Math.floor(Math.random() * tableIds.length)],
                    staff_id: staffIds[Math.floor(Math.random() * staffIds.length)],
                    status: 'paid',
                    subtotal: total,
                    tip: tip,
                    total: total + tip,
                    created_at: orderTime.toISOString(),
                    closed_at: new Date(orderTime.getTime() + 45 * 60000).toISOString(),
                    payments: [
                        { method: Math.random() > 0.6 ? 'card' : 'cash', amount: total + tip, tip: tip }
                    ]
                });
            }
        }
    }

    // Batch insert
    const BATCH_SIZE = 50;
    for (let i = 0; i < ordersToAdd.length; i += BATCH_SIZE) {
        const batch = ordersToAdd.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('orders').insert(batch);
        if (error) console.error("Error inserting order batch:", error.message);
    }
    console.log(`✅ Seeded ~${ordersToAdd.length} orders.`);
}

async function main() {
    await seedStaff();
    await seedTables();
    await seedOrders();
    console.log("✨ Seeding Complete!");
}

main();
