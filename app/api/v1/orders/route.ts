
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Server-Side Supabase Client (Admin context if needed, but here using service key logic if env vars set, 
// or standard client with RLS. Ideally we need a SERVICE_ROLE key for bypassing RLS if the API key is valid.)
// For this MVP, we rely on the env vars used by the app.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
    try {
        console.log("📨 [API] Incoming Order Injection Request");

        // 1. Security: Validate API Key
        const apiKey = req.headers.get('x-api-key');
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 });
        }

        // Check if key exists and is active
        const { data: keyData, error: keyError } = await supabase
            .from('api_keys')
            .select('restaurant_id, status, name')
            .eq('key_hash', apiKey) // In production, hash this. Here detailed as per step.
            .single();

        if (keyError || !keyData) {
            console.warn(`[API] Invalid Key Attempt: ${apiKey}`);
            return NextResponse.json({ error: 'Invalid API Key' }, { status: 403 });
        }

        if (keyData.status !== 'active') {
            return NextResponse.json({ error: 'API Key is revoked' }, { status: 403 });
        }

        const restaurantId = keyData.restaurant_id;
        console.log(`[API] Authenticated as ${keyData.name} for Restaurant: ${restaurantId}`);

        // 2. Parse Payload
        const body = await req.json();

        // Zod validation would go here. For now, basic checks.
        if (!body.items || !Array.isArray(body.items)) {
            return NextResponse.json({ error: 'Invalid payload: items array required' }, { status: 400 });
        }

        // 3. Construct Order Object compatible with Supabase Schema
        const newOrder = {
            restaurant_id: restaurantId,
            status: 'open', // New orders start as open
            table_id: body.tableId || 9999, // 9999 could be "Delivery" table
            created_at: new Date().toISOString(),
            subtotal: body.subtotal || 0,
            tip: body.tip || 0,
            total: body.total || 0,
            // JSONB Items mapping (critical for sync compatibility)
            // The POS expects TicketItem[] structure.
            // External systems might send simplified JSON. We might need a transformer here.
            // Assuming "Passive" mode: We store what they send if it matches, or we wrap it.
            // Let's assume the payload IS the TicketItem[] for now or close to it.
            items: body.items,
            delivered_sections: [],
            ready_sections: []
        };

        // 4. Insert into Supabase
        const { data: insertedOrder, error: insertError } = await supabase
            .from('orders')
            .insert(newOrder)
            .select()
            .single();

        if (insertError) {
            console.error("[API] Insert Error:", insertError);
            return NextResponse.json({ error: 'Database Insert Failed', details: insertError.message }, { status: 500 });
        }

        console.log(`[API] ✅ Order Created: ID ${insertedOrder.id}`);

        // 5. Connect to Inventory? 
        // Note: The POS Client (local device) is the "Brain" that processes inventory.
        // If we deduct inventory purely server-side, we might desync if logic is complex (recipes).
        // Strategy: The POS syncs this order down, sees it's "New" (or we tag it), and *Then* processes inventory?
        // OR: We deduct here if we have recipe logic on server. 
        // CURRENT ARCHITECTURE: Logic is in Client (Recipes in Dexie). 
        // So for Phase 1 MVP, we inject the order. The KDS (Client) will see it. 
        // The "stock deduction" might happen when the order is "Confirmed" or "Closed" on the POS.
        // If the order is "Open", stock is theoretical. 
        // Let's stick to "Injection" -> "KDS Visibility". 

        return NextResponse.json({
            success: true,
            orderId: insertedOrder.id,
            status: 'queued_for_kds'
        }, { status: 201 });

    } catch (e: any) {
        console.error("API Error", e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
