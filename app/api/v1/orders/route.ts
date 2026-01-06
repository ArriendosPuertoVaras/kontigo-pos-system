
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Server-Side Supabase Client
// We PRIORITIZE the Service Role Key to bypass RLS for API operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Debug Log (Server Side)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ API Warning: SUPABASE_SERVICE_ROLE_KEY is missing. RLS might block inserts.");
}

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
        // 3a. Find a valid Table ID (Critical for FK Constraints)
        let targetTableId = body.tableId;

        if (!targetTableId) {
            // STRATEGY: Enforce Strict 'Delivery' Zone Isolation

            // 1. Try to find an AVAILABLE table in the 'Delivery' zone
            const { data: availableDeliveryTable } = await supabase
                .from('restaurant_tables')
                .select('id, name')
                .eq('restaurant_id', restaurantId)
                .ilike('zone', '%Delivery%') // Strict Zone Check
                .eq('status', 'available')
                .limit(1)
                .maybeSingle();

            if (availableDeliveryTable) {
                targetTableId = availableDeliveryTable.id;
                console.log(`[API] Assigned to existing Delivery table: ${availableDeliveryTable.name}`);
            } else {
                // 2. If no available space in Delivery Zone, create a overflow table
                // This prevents hijacking 'Salon' tables

                // Count existing delivery tables to allow naming "Delivery N"
                const { count } = await supabase
                    .from('restaurant_tables')
                    .select('*', { count: 'exact', head: true })
                    .eq('restaurant_id', restaurantId)
                    .ilike('zone', '%Delivery%');

                const nextNum = (count || 0) + 1;
                const newTableName = `Delivery ${nextNum}`;

                console.log(`[API] Creating new table '${newTableName}' in Delivery zone`);

                const { data: newTable, error: createError } = await supabase
                    .from('restaurant_tables')
                    .insert({
                        name: newTableName,
                        status: 'occupied',
                        restaurant_id: restaurantId,
                        zone: 'Delivery', // Explicitly set Zone
                        x: 0, // Hidden/special coordinates
                        y: 0
                    })
                    .select()
                    .single();

                if (createError || !newTable) {
                    console.error("Failed to create Delivery table:", createError);
                    return NextResponse.json({ error: 'Infrastructure Error: Could not assign Delivery table' }, { status: 500 });
                }

                targetTableId = newTable.id;
            }
        }
        // 3b. Construct Order Object compatible with Supabase Schema
        const newOrder = {
            restaurant_id: restaurantId,
            status: 'open', // New orders start as open
            table_id: targetTableId,
            created_at: new Date().toISOString(),
            subtotal: body.subtotal || 0,
            tip: body.tip || 0,
            total: body.total || body.subtotal || 0,
            // JSONB Items mapping (critical for sync compatibility)
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

        // 5. CRITICAL: Link Table to Order (Update Status)
        // This ensures the Table View shows "Occupied"
        const { error: linkError } = await supabase
            .from('restaurant_tables')
            .update({
                status: 'occupied',
                current_order_id: insertedOrder.id
            })
            .eq('id', targetTableId);

        if (linkError) {
            console.error("[API] ⚠️ Failed to update table status:", linkError);
        } else {
            console.log(`[API] Table ${targetTableId} marked as Occupied linked to Order ${insertedOrder.id}`);
        }

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
