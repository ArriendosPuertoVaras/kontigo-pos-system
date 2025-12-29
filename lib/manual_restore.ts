
import { db } from '@/lib/db';

export async function restoreEmpanadaIngredients() {
    try {
        const { syncService } = await import('@/lib/sync_service');

        // 1. Sync Job Titles (Gerente, Garzón, etc.)
        const jobTitlesCount = await db.jobTitles.count();
        console.log(`[ForceSync] Pushing ${jobTitlesCount} Job Titles...`);
        try {
            await syncService.pushTable(db.jobTitles, 'job_titles');
        } catch (e) {
            console.error(e);
            return `❌ Error JobTitles: ${(e as Error).message}`;
        }

        // 2. Sync Staff (The actual people)
        const staffCount = await db.staff.count();
        console.log(`[ForceSync] Pushing ${staffCount} Staff members...`);

        try {
            await syncService.pushTable(db.staff, 'restaurant_staff');
        } catch (e) {
            console.error(e);
            return `❌ Error Staff: ${(e as Error).message}`;
        }

        return `✅ ¡ÉXITO! Se enviaron ${staffCount} colaboradores y ${jobTitlesCount} cargos a Supabase. Revisa la tabla ahora.`;

    } catch (error) {
        console.error("General Sync Error:", error);
        return `⚠️ Error General: ${(error as Error).message}`;
    }
}
