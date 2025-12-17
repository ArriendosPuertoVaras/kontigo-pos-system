
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Simple env parser since we cant rely on nextjs env loading here in a standalone script
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
    console.error("❌ ERROR: Could not find Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    console.log("🔄 Testing Supabase Connection...");
    const { data, error } = await supabase.from('staff').select('count', { count: 'exact', head: true });

    if (error) {
        console.error("❌ CONNECTION FAILED:", error.message);
    } else {
        console.log("✅ CONNECTION SUCCESSFUL!");
        console.log(`   Connected to project: ${supabaseUrl}`);
        console.log(`   Table 'staff' is accessible.`);
    }
}

testConnection();
