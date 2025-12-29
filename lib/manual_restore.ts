
import { db } from '@/lib/db';

export async function restoreEmpanadaIngredients() {
    try {
        console.log("⬇️ INTENTO DE DESCARGA DIRECTA (Bypassing SyncService)...");
        const { supabase } = await import('@/lib/supabase');

        // 1. Direct Fetch
        const { data, error } = await supabase.from('ingredients').select('*');

        if (error) throw error;
        if (!data || data.length === 0) return "⚠️ La nube dice que no hay ingredientes (0 encontrados).";

        console.log(`⬇️ Descargados ${data.length} ingredientes de Supabase. Guardando localmente...`);

        // 2. Direct Save to Dexie
        await db.ingredients.clear();
        await db.ingredients.bulkPut(data);

        return `✅ ¡RECUPERADO! Se descargaron ${data.length} ingredientes desde la Nube.`;
    } catch (error) {
        console.error("Direct Pull Error:", error);
        return `❌ Error Fatal: ${(error as Error).message}`;
    }
}
