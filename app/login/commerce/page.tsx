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
    const [availableRestaurants, setAvailableRestaurants] = useState<any[]>([]);

    const linkDeviceToRestaurant = async (restaurantId: string, restaurantName: string) => {
        setLoading(true);
        try {
            // 3. Save Device Context
            localStorage.setItem('kontigo_restaurant_id', restaurantId);
            localStorage.setItem('kontigo_restaurant_name', restaurantName || 'Mi Restaurante');

            // 4. PROFESSIONAL CLEAN START (Nuclear Reset)
            toast.info("Vinculación exitosa. Limpiando dispositivo...");

            const { db } = await import('@/lib/db');
            const { syncService } = await import('@/lib/sync_service');

            // Nuclear Reset: Shutdown, Delete and Re-open
            await db.delete();
            await db.open();

            toast.info("Sincronizando con la nube...");

            // Mandatory Pull: Download the actual truth from Supabase
            await syncService.restoreFromCloud((msg) => {
                console.log(`[AutoLinkSync] ${msg}`);
            }, true);

            toast.success(`Dispositivo listo: ${restaurantName}`);
            router.push('/login');
        } catch (error: any) {
            console.error("Link Error:", error);
            toast.error(error.message || "Error al vincular el dispositivo");
        } finally {
            setLoading(false);
        }
    };

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

            // 2. Find ALL Linked Restaurants
            // We check the relational table 'restaurant_staff' to see which restaurants this user manages
            const { data: links, error: linkError } = await supabase
                .from('restaurant_staff')
                .select('restaurant_id, restaurants(name, code, plan_status)')
                .eq('user_id', authData.user.id);

            if (linkError) throw linkError;

            // Flatten links
            const restaurants = (links || []).map(l => ({
                id: l.restaurant_id,
                // @ts-ignore
                name: l.restaurants?.name,
                // @ts-ignore
                code: l.restaurants?.code
            }));

            // ALSO check if they are the owner directly in the restaurants table (Backup logic)
            const { data: owned } = await supabase
                .from('restaurants')
                .select('id, name, code')
                .eq('owner_email', authData.user.email);

            const allRestaurants = [...restaurants, ...(owned || [])];

            // Unique results by ID
            const uniqueRestaurants = Array.from(new Map(allRestaurants.map(r => [r.id, r])).values());

            if (uniqueRestaurants.length === 0) {
                throw new Error("No tienes restaurantes vinculados a esta cuenta.");
            }

            if (uniqueRestaurants.length === 1) {
                await linkDeviceToRestaurant(uniqueRestaurants[0].id, uniqueRestaurants[0].name);
            } else {
                setAvailableRestaurants(uniqueRestaurants);
                setLoading(false);
                toast.info("Múltiples restaurantes encontrados. Selecciona uno.");
            }

        } catch (error: any) {
            console.error("Login Error:", error);
            toast.error(error.message || "Error al iniciar sesión");
            setLoading(false);
        }
    };

    if (availableRestaurants.length > 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--toast-charcoal-dark)] p-4">
                <div className="bg-[var(--toast-charcoal)] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-[var(--toast-charcoal-light)]">
                    <div className="flex flex-col items-center mb-6">
                        <div className="bg-[var(--toast-orange)] p-4 rounded-full mb-4">
                            <Store className="w-10 h-10 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white text-center">
                            Selecciona tu Negocio
                        </h1>
                        <p className="text-[var(--toast-text-gray)] text-center mt-2">
                            Hemos encontrado varios locales asociados a tu cuenta.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {availableRestaurants.map(res => (
                            <button
                                key={res.id}
                                onClick={() => linkDeviceToRestaurant(res.id, res.name)}
                                className="w-full bg-[var(--toast-charcoal-light)] hover:bg-[var(--toast-orange)]/20 text-left p-4 rounded-xl border border-white/5 hover:border-[var(--toast-orange)]/50 transition-all group"
                            >
                                <div className="font-bold text-white group-hover:text-[var(--toast-orange)]">
                                    {res.name}
                                </div>
                                <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">
                                    Código: {res.code || 'N/A'}
                                </div>
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setAvailableRestaurants([])}
                        className="w-full mt-6 text-sm text-gray-500 hover:text-white transition-colors"
                    >
                        Volver al login
                    </button>
                </div>
            </div>
        );
    }

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

