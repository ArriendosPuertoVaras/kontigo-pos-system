'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { User, Lock, Loader2, LogIn } from 'lucide-react';
import { getSetting, SettingsKeys } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function LoginPage() {
    const router = useRouter();

    // Form State
    const [credentials, setCredentials] = useState({
        email: '',
        password: ''
    });
    const [loading, setLoading] = useState(false);

    // Config State
    const [restaurantName, setRestaurantName] = useState("Kontigo POS");

    // Phase 2 Check
    useEffect(() => {
        const restaurantId = localStorage.getItem('kontigo_restaurant_id');
        if (!restaurantId) {
            router.replace('/login/commerce');
            return;
        }

        const loadSettings = async () => {
            const name = await getSetting<string>(SettingsKeys.RESTAURANT_NAME, "Kontigo POS");
            setRestaurantName(name);
        };
        loadSettings();
    }, []);


    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Authenticate with Supabase (Cloud Truth)
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: credentials.email,
                password: credentials.password
            });

            if (authError) throw new Error("Credenciales incorrectas");
            if (!authData.user) throw new Error("No usuario retornado");

            // 2. Identify Staff Member Locally
            const staffMember = await db.staff.where('email').equals(credentials.email).first();

            if (staffMember) {
                // Success: Existing Staff
                localStorage.setItem('kontigo_staff_id', staffMember.id!.toString());
                localStorage.setItem('kontigo_staff_name', staffMember.name);
                localStorage.setItem('kontigo_staff_role', staffMember.role);
                router.push('/tables');
                toast.success(`Bienvenido, ${staffMember.name}`);
            } else {
                // FALLBACK: Admin Access for Owner
                const newId = await db.staff.add({
                    name: 'Admin (Dueño)',
                    email: credentials.email,
                    role: 'admin',
                    activeRole: 'admin',
                    pin: '0000',
                    status: 'active',
                    weeklyHoursLimit: 45,
                    contractType: 'art-22',
                    contractDuration: 'indefinite'
                });

                localStorage.setItem('kontigo_staff_id', newId.toString());
                localStorage.setItem('kontigo_staff_name', 'Admin (Dueño)');
                localStorage.setItem('kontigo_staff_role', 'admin');

                router.push('/tables');
                toast.success("Bienvenido Dueño (Primer Acceso)");
            }

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Error al iniciar sesión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--toast-charcoal-dark)] p-4">
            <div className="bg-[var(--toast-charcoal)] border border-[var(--toast-charcoal-light)] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">

                {/* Header */}
                <div className="bg-[var(--toast-orange)] p-6 text-center">
                    <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">
                        {restaurantName}
                    </h2>
                    <p className="text-blue-100 text-xs mt-1">Acceso Seguro</p>
                </div>

                {/* Form */}
                <div className="p-8">
                    <form onSubmit={handleLogin} className="space-y-5">

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[var(--toast-text-gray)] uppercase tracking-wide ml-1">
                                Email / Usuario
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                                <input
                                    type="email"
                                    required
                                    className="w-full bg-[var(--toast-charcoal-light)] border border-transparent focus:border-[var(--toast-orange)] focus:ring-1 focus:ring-[var(--toast-orange)] text-white rounded-xl py-3 pl-10 pr-4 placeholder-gray-500 transition-all font-medium"
                                    placeholder="usuario@kontigo.cl"
                                    value={credentials.email}
                                    onChange={e => setCredentials({ ...credentials, email: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[var(--toast-text-gray)] uppercase tracking-wide ml-1">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                                <input
                                    type="password"
                                    required
                                    className="w-full bg-[var(--toast-charcoal-light)] border border-transparent focus:border-[var(--toast-orange)] focus:ring-1 focus:ring-[var(--toast-orange)] text-white rounded-xl py-3 pl-10 pr-4 placeholder-gray-500 transition-all font-medium"
                                    placeholder="••••••••"
                                    value={credentials.password}
                                    onChange={e => setCredentials({ ...credentials, password: e.target.value })}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[var(--toast-orange)] hover:bg-[var(--toast-orange-hover)] text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                            <span>INICIAR TURNO</span>
                        </button>

                    </form>
                </div>

                <div className="bg-[var(--toast-charcoal-light)]/50 p-4 text-center border-t border-[var(--toast-charcoal-light)]">
                    <p className="text-xs text-gray-500">
                        ¿Problemas para entrar? <span className="text-[var(--toast-orange)] cursor-pointer hover:underline">Solicitar reset</span>
                    </p>
                </div>
            </div>

            <div className="fixed bottom-4 text-center opacity-30 hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-gray-500 font-medium tracking-widest uppercase">
                    Powered by <span className="font-bold text-gray-400">Kontigo Lab SpA</span>
                </p>
            </div>
        </div>
    );
}
