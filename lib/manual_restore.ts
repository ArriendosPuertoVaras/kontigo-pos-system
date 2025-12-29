
import { db } from '@/lib/db';

export async function restoreEmpanadaIngredients() {
    try {
        console.log("⬇️ INICIANDO DESCARGA DESDE LA NUBE (Ingredientes)...");
        const { syncService } = await import('@/lib/sync_service');

        // FORCE PULL from Supabase to Local
        // This will overwrite/merge local data with what's in the cloud (which is now correct)
        await syncService.pullTable(db.ingredients, 'ingredients');

        return `✅ ¡Sincronización Exitosa! Se han descargado los ingredientes desde la nube.`;
    } catch (error) {
        console.error("Pull Error:", error);
        return `❌ Error al descargar de la nube: ${(error as Error).message}`;
    }
}
