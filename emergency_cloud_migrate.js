const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURATION ---
const RESTAURANT_ID = 'e72836f6-edce-462d-a36f-27e0303eae94'; // Mi Restaurante Kontigo

// 1. LEGACY (SOURCE)
const oldUrl = 'https://nqrthjyopokfrfvtbkch.supabase.co';
const oldKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xcnRoanlvcG9rZnJmdnRia2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTAxMzgsImV4cCI6MjA4MTM4NjEzOH0.AxEK_sEAV95RDnKrfwaGdm_3KIO9THq9cNPP5jBCauA';
const sourceDB = createClient(oldUrl, oldKey);

// 2. NEW (DESTINATION)
const newUrl = 'https://iahezqmgklquchwtlasc.supabase.co';
const newKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhaGV6cW1na2xxdWNod3RsYXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NzUzNTEsImV4cCI6MjA4NTQ1MTM1MX0.YOuxrzFsCmhzc_BtDarGclLvr-oJNw47EcIl1raJhj4';
const destDB = createClient(newUrl, newKey);

async function migrateTable(tableName) {
    console.log(`\n📦 Migrando tabla: ${tableName}...`);

    // 1. Fetch from Source
    const { data: rows, error: readError } = await sourceDB
        .from(tableName)
        .select('*')
        .eq('restaurant_id', RESTAURANT_ID);

    if (readError) {
        console.error(`❌ Error leyendo ${tableName} de Legacy:`, readError.message);
        return;
    }

    if (!rows || rows.length === 0) {
        console.log(`⚠️ No hay datos para ${tableName} en Legacy.`);
        return;
    }

    console.log(`   -> Encontrados ${rows.length} registros. Subiendo...`);

    // 3. Clean Data (Strict Schema Matching - AGGRESSIVE)
    // Stripping ALL columns that don't exist in the bare-bones new schema.
    const cleanRows = rows.map(row => {
        const {
            created_at, updated_at, deleted_at, // Timestamps
            sort_order, type,                   // Categories
            recipe, image_url,                  // Products
            family, sub_family, storage, cost, supplier_id, instructions, chef_note, prep_time, cook_time, total_time, // Ingredients
            contact_name, email, phone,         // Suppliers
            ...rest
        } = row;
        return rest;
    });

    // 3. Upsert to Destination
    const { error: writeError } = await destDB
        .from(tableName)
        .upsert(cleanRows);

    if (writeError) {
        console.error(`❌ Error escribiendo en ${tableName}:`, writeError.message);
    } else {
        console.log(`✅ ${tableName} migrada exitosamente!`);
    }
}

async function runMigration() {
    console.log("🚀 INICIANDO MIGRACIÓN NUBE-A-NUBE DE EMERGENCIA");

    // Order matters for Foreign Keys
    await migrateTable('categories');
    await migrateTable('products');
    await migrateTable('ingredients');
    await migrateTable('suppliers');
    // await migrateTable('orders'); // Optional, maybe skip for now if schema is tricky

    console.log("\n🏁 PROCESO TERMINADO.");
}

runMigration();
