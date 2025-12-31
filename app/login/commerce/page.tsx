'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Store, ShieldCheck, Loader2 } from 'lucide-react';

export default function CommerceLoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Auth with Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim()
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("No user found");

            // 2. Find Linked Restaurant
            // We check the relational table 'restaurant_staff' to see which restaurant this owner manages
            const { data: linkData, error: linkError } = await supabase
                .from('restaurant_staff')
                .select('restaurant_id, restaurants(name, plan_status)')
                .eq('user_id', authData.user.id)
                .single();

            let restaurantId = linkData?.restaurant_id;
            // @ts-ignore: Supabase join inference is tricky
            let restaurantName = linkData?.restaurants?.name;

            // FALLBACK FOR MIGRATION/FIRST USE: 
            // If the user logs in but has no link yet (maybe they are just 'auth.users'), 
            // we might want option to 'Create' or 'Select' if they have multiple.
            // For now, assuming 1-to-1 or creating one if missing logic could go here or in a separate step.

            if (!restaurantId) {
                // Temporary: fetch ANY restaurant if the link table is empty (Legacy support)
                // In production, force them to create one or have an invite.
                const { data: fallback } = await supabase.from('restaurants').select('id, name').limit(1).single();
                if (fallback) {
                    restaurantId = fallback.id;
                    restaurantName = fallback.name;
                } else {
                    throw new Error("No Restaurante asociado a esta cuenta.");
                }
            }

            // 3. Save Device Context
            localStorage.setItem('kontigo_restaurant_id', restaurantId);
            localStorage.setItem('kontigo_restaurant_name', restaurantName || 'Mi Restaurante');

            // 4. PROFESSIONAL AUTO-SYNC / MASTER SETUP
            // This ensures the device is 100% operational with the latest data without manual steps.
            toast.info("Vinculación exitosa. Sincronizando datos...");

            const { syncService } = await import('@/lib/sync_service');
            const { db } = await import('@/lib/db');

            // 4a. Identification: Is this a Master Device? (Had untagged data BEFORE joining the cloud)
            let isMaster = false;
            const tables = [db.categories, db.products, db.ingredients, db.staff, db.restaurantTables, db.settings];

            for (const table of tables) {
                const untaggedCount = await table.filter(item => !item.restaurantId).count();
                if (untaggedCount > 0) isMaster = true;
            }

            // 4b. Tag local data with restaurant_id
            for (const table of tables) {
                const untagged = await table.filter(item => !item.restaurantId).toArray();
                if (untagged.length > 0) {
                    await Promise.all(untagged.map(item =>
                        // @ts-ignore
                        table.update(item.id!, { restaurantId })
                    ));
                }
            }

            // 4c. Intelligent Pull: Try to get cloud state
            await syncService.restoreFromCloud((msg) => {
                console.log(`[AutoLinkSync] ${msg}`);
            }, true);

            // 4d. Verify Link: If it was a Master Device, FORCE PUSH to ensure Cloud has the data.
            if (isMaster) {
                console.log("[AutoLinkSync] Master Device detected. Establishing cloud mirror...");
                await syncService.pushAll((msg) => console.log(`[AutoLinkSync-Master] ${msg}`));
            }

            toast.success(`Dispositivo listo: ${restaurantName}`);

            // 5. Redirect to Staff Login (Operational Layer)
            router.push('/login');

        } catch (error: any) {
            console.error("Login Error:", error);
            toast.error(error.message || "Error al vincular el dispositivo");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--toast-charcoal-dark)] p-4">
            <div className="bg-[var(--toast-charcoal)] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-[var(--toast-charcoal-light)]">
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-[var(--toast-orange)] p-4 rounded-full mb-4 shadow-lg shadow-[var(--toast-orange)]/20">
                        <Store className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white text-center">
                        Configuración de Dispositivo
                    </h1>
                    <p className="text-[var(--toast-text-gray)] text-center mt-2">
                        Ingresa tus credenciales de Dueño para vincular este iPad a tu restaurante.
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-[var(--toast-text-gray)] mb-1">
                            Email Corporativo
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[var(--toast-charcoal-light)] text-white border-transparent rounded-lg focus:ring-2 focus:ring-[var(--toast-orange)] p-3"
                            placeholder="dueño@restaurante.cl"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--toast-text-gray)] mb-1">
                            Contraseña Maestra
                        </label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[var(--toast-charcoal-light)] text-white border-transparent rounded-lg focus:ring-2 focus:ring-[var(--toast-orange)] p-3"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="bg-[var(--toast-orange)]/10 p-4 rounded-lg flex items-start gap-3 border border-[var(--toast-orange)]/30">
                        <ShieldCheck className="w-5 h-5 text-[var(--toast-orange)] shrink-0 mt-0.5" />
                        <p className="text-xs text-[var(--toast-text-gray)]">
                            Esta acción se realiza <strong>una sola vez</strong> por dispositivo. A partir de ahora, este iPad solo mostrará información de tu local.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[var(--toast-orange)] hover:bg-[var(--toast-orange-hover)] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-[var(--toast-orange)]/25 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Verificando...
                            </>
                        ) : (
                            "Vincular Dispositivo"
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-sm text-gray-500">
                        ¿No tienes cuenta? <a href="#" className="text-[var(--toast-orange)] hover:underline">Contactar Soporte</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
