'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { DollarSign, ArrowRight, Wallet, AlertCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export default function OpenRegisterPage() {
    const router = useRouter();
    const [openingCash, setOpeningCash] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [existingSession, setExistingSession] = useState(false);

    // Check for existing open session
    const activeSession = useLiveQuery(async () => {
        return await db.dailyCloses.where('status').equals('open').first();
    });

    useEffect(() => {
        if (activeSession) {
            setExistingSession(true);
        }
    }, [activeSession]);

    const handleOpenRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        const amount = parseInt(openingCash.replace(/\D/g, '')) || 0;

        // Validation? Allow 0 opening cash? Yes, usually.

        setIsSubmitting(true);
        try {
            await db.dailyCloses.add({
                date: new Date(), // This will be the "Business Date"
                startTime: new Date(), // Real login time
                status: 'open',
                openingCash: amount,
                // Initialize counters to 0
                totalSales: 0,
                totalCash: 0,
                totalCard: 0,
                totalOnline: 0,
                totalTips: 0,
                dteCount: 0,
                cashDifference: 0,
                closedBy: ''
            });

            // Redirect to POS
            router.push('/');

        } catch (error) {
            console.error("Error opening register:", error);
            alert("Error al abrir caja. Intenta nuevamente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCurrency = (value: string) => {
        const number = parseInt(value.replace(/\D/g, '')) || 0;
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(number);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        setOpeningCash(rawValue);
    };

    if (existingSession) {
        return (
            <div className="flex h-screen w-full bg-[#2a2a2a] text-white flex-col items-center justify-center p-4">
                <div className="bg-toast-charcoal border border-white/10 rounded-2xl p-8 max-w-md text-center shadow-2xl">
                    <div className="w-16 h-16 bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Ya existe una Caja Abierta</h2>
                    <p className="text-gray-400 mb-6">No puedes abrir una nueva caja sin cerrar la anterior.</p>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="bg-toast-blue hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors"
                        >
                            Ir al POS
                        </button>
                        <button
                            onClick={() => router.push('/manager/close')}
                            className="bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-colors border border-white/10"
                        >
                            Ir a Cierre de Caja
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-[#2a2a2a] text-white font-sans selection:bg-toast-orange selection:text-white relative">
            <Header title="Apertura de Turno" backHref="/manager" />

            <main className="flex-1 flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">

                <div className="w-full max-w-lg">
                    {/* Welcome Card */}
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-white mb-2">¡Hola! 👋</h1>
                        <p className="text-gray-400 text-lg">Comencemos un nuevo turno de ventas.</p>
                    </div>

                    <form onSubmit={handleOpenRegister} className="bg-toast-charcoal border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                        {/* Decorative glow */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-toast-orange to-toast-red"></div>

                        <div className="mb-8">
                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Wallet className="w-4 h-4" /> Fondo de Caja Inicial
                            </label>

                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-8 h-8" />
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={openingCash ? formatCurrency(openingCash) : ''}
                                    onChange={handleInputChange}
                                    placeholder="$0"
                                    className="w-full bg-black/30 border-2 border-white/10 rounded-2xl py-6 pl-14 pr-6 text-4xl font-bold text-white focus:border-toast-orange focus:bg-black/50 outline-none transition-all placeholder:text-gray-700"
                                    autoFocus
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2 pl-2">Ingresa el dinero en sencillo que hay en la caja.</p>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-toast-green hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xl py-5 rounded-xl shadow-lg shadow-green-900/20 flex items-center justify-center gap-3 transition-all transform active:scale-[0.98]"
                        >
                            {isSubmitting ? 'Abriendo...' : (
                                <>
                                    Abrir Caja y Comenzar <ArrowRight className="w-6 h-6" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 flex justify-center">
                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-white/5 px-4 py-2 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            Sistema Listo y Sincronizado
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
