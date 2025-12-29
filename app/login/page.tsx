'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { User, Lock, Loader2, LogIn } from 'lucide-react';
import { getSetting, SettingsKeys, isSystemConfigured } from '@/lib/settings';
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

            // If we have a local owner from migration, autofill logic could go here
            // But for security, better to keep it clean.
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
            // We need to match this Cloud User (Email) to a Local Staff (for permissions/name)
            // If it's the OWNER (based on Supabase role or metadata), we grant Full Access.

            // Try to find staff by email
            const staffMember = await db.staff.where('email').equals(credentials.email).first();

            if (staffMember) {
                // Success: Existing Staff
                localStorage.setItem('kontigo_staff_id', staffMember.id!.toString());
                localStorage.setItem('kontigo_staff_name', staffMember.name);
                localStorage.setItem('kontigo_staff_role', staffMember.role);
                router.push('/tables');
                toast.success(`Bienvenido, ${staffMember.name}`);
            } else {
                // FALLBACK: Is it the Owner who hasn't been created in local DB yet?
                // Or maybe the admin@kontigo.cl we just used?
                // Let's allow entry as 'Admin' temporarily if matches owner email behavior
                // Ideally, we sync here from cloud 'restaurant_staff' table...

                // For now, let's allow access and Create a provisional local user (Self-Healing)
                const newId = await db.staff.add({
                    name: 'Admin (Dueño)',
                    email: credentials.email,
                    role: 'admin',
                    activeRole: 'admin',
                    pin: '0000', // Legacy strict requirement
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
        <button onClick={() => setSelectedStaff(null)} className="text-gray-500 text-xs hover:text-white transition-colors">
            ← Volver a selección de usuario
        </button>
                    </div >
                </div >
            )
}

{/* CORPORATE FOOTER */ }
<div className="fixed bottom-4 text-center opacity-30 hover:opacity-100 transition-opacity">
    <p className="text-[10px] text-gray-500 font-medium tracking-widest uppercase">
        Powered by <span className="font-bold text-gray-400">Kontigo Lab SpA</span>
    </p>
</div>
        </div >

    );
}
