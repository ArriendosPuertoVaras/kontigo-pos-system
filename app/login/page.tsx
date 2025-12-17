'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, Staff } from '@/lib/db';
import { UtensilsCrossed, Delete, User } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export default function LoginPage() {
    const router = useRouter();
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Initial Seeding Trigger (in case it's first run)
    // We do this here because layout might run before db is ready? 
    // Actually layout runs first, but this page is public.
    useEffect(() => {
        // Ensure seeder runs if we land here directly (Critical for Emergency Admin)
        import('@/lib/db').then(m => m.seedDatabase());
    }, []);

    const handleNumClick = (num: string) => {
        if (pin.length < 4) {
            setPin(prev => prev + num);
            setError("");
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
        setError("");
    };

    const handleLogin = async () => {
        if (pin.length !== 4) return;
        setIsLoading(true);

        try {
            const staffMember = await db.staff.where('pin').equals(pin).first();

            if (staffMember) {
                // Success
                localStorage.setItem('kontigo_staff_id', staffMember.id!.toString());
                localStorage.setItem('kontigo_staff_name', staffMember.name);
                localStorage.setItem('kontigo_staff_role', staffMember.role);

                // Track "Clock In" implicitly? Or verify shift?
                // For MVP, we just let them in. 
                // We'll create a shift on entry if none exists later.

                router.push('/tables'); // Default to Table Selection on Login
            } else {
                setError("PIN Incorrecto");
                setPin("");
            }
        } catch (e) {
            console.error(e);
            setError("Error de base de datos");
        }
        setIsLoading(false);
    };

    // Auto-submit on 4th digit
    useEffect(() => {
        if (pin.length === 4) {
            handleLogin();
        }
    }, [pin]);

    return (
        <div className="min-h-screen bg-toast-charcoal flex flex-col items-center justify-center p-4">

            <div className="mb-8 flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-gradient-to-br from-toast-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
                    <UtensilsCrossed className="text-white w-10 h-10" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Kontigo POS</h1>
                <p className="text-gray-400 text-sm mt-2 uppercase tracking-widest font-bold">Acceso Personal</p>
            </div>

            <div className="w-full max-w-sm">
                {/* PIN Display */}
                <div className="flex justify-center gap-4 mb-8">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 
                            ${i < pin.length ? 'bg-toast-orange scale-110 shadow-lg shadow-orange-500/50' : 'bg-white/10'}`}>
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="text-red-500 text-center font-bold mb-6 animate-pulse bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                        {error}
                    </div>
                )}

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            onClick={() => handleNumClick(num.toString())}
                            className="h-20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all rounded-xl text-3xl font-bold text-white border-b-4 border-black/20"
                        >
                            {num}
                        </button>
                    ))}
                    <div className="flex items-center justify-center opacity-50">
                        <User className="text-gray-500 w-8 h-8" />
                    </div>
                    <button
                        onClick={() => handleNumClick("0")}
                        className="h-20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all rounded-xl text-3xl font-bold text-white border-b-4 border-black/20"
                    >
                        0
                    </button>
                    <button
                        onClick={handleDelete}
                        className="h-20 bg-red-500/10 hover:bg-red-500/20 active:scale-95 transition-all rounded-xl flex items-center justify-center text-red-500 border-b-4 border-black/20"
                    >
                        <Delete className="w-8 h-8" />
                    </button>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-gray-500 text-xs">
                        Ingresa tu PIN de 4 dígitos.<br />
                        (Demo: 1234, 0000, 1111)
                    </p>
                </div>
            </div>
        </div>
    );
}
