'use client';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, CashCount, DailyClose } from '@/lib/db';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, AlertTriangle, CheckCircle2, Save, Banknote, Coins, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/Header';

// Denominations for Chilean Peso
const DENOMINATIONS = [
    { value: 20000, type: 'bill' },
    { value: 10000, type: 'bill' },
    { value: 5000, type: 'bill' },
    { value: 2000, type: 'bill' },
    { value: 1000, type: 'bill' },
    { value: 500, type: 'coin' },
    { value: 100, type: 'coin' },
    { value: 50, type: 'coin' },
    { value: 10, type: 'coin' }
];

export default function CashClosePage() {
    const router = useRouter();
    const [counts, setCounts] = useState<Record<number, number>>({});
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 1. Fetch Active Session
    const activeSession = useLiveQuery(() => db.dailyCloses.where('status').equals('open').first());

    // 2. Fetch Orders since Session Start
    const sessionOrders = useLiveQuery(async () => {
        if (!activeSession) return [];

        // Safety fallback: if no startTime, assume today 00:00 (legacy)
        const start = activeSession.startTime || new Date(new Date().setHours(0, 0, 0, 0));

        return db.orders
            .where('createdAt').above(start)
            .filter(o => o.status !== 'cancelled')
            .toArray();
    }, [activeSession]);

    // 3. Calculate Core Metrics
    const openingCash = activeSession?.openingCash || 0;

    // Cash Sales (Sum of 'cash' payments in orders)
    const cashSales = sessionOrders?.reduce((acc, order) => {
        const cashPayments = order.payments?.filter(p => p.method === 'cash') || [];
        return acc + cashPayments.reduce((sum, p) => sum + p.amount, 0);
    }, 0) || 0;

    // Total Expected Cash in Drawer = Opening + Sales
    const expectedCash = openingCash + cashSales;

    // Declared by User
    const declaredTotal = Object.entries(counts).reduce((sum, [denom, qty]) => {
        return sum + (parseInt(denom) * qty);
    }, 0);

    const difference = declaredTotal - expectedCash;

    const handleCountChange = (value: number, qty: number) => {
        setCounts(prev => ({
            ...prev,
            [value]: Math.max(0, qty)
        }));
    };

    const handleSaveClose = async () => {
        if (!activeSession || !sessionOrders) return;
        setIsSubmitting(true);

        try {
            // Include 'dtes' in the transaction because we query it inside
            await db.transaction('rw', db.cashCounts, db.dailyCloses, db.dtes, async () => {

                // 1. Calculate Finals
                const totalSales = sessionOrders.reduce((sum, o) => sum + o.total, 0);
                const totalCard = sessionOrders.reduce((acc, o) => acc + (o.payments?.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0) || 0), 0);
                const totalOnline = sessionOrders.reduce((acc, o) => acc + (o.payments?.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0) || 0), 0);
                const totalTips = sessionOrders.reduce((sum, o) => sum + o.tip, 0);
                const dteCount = await db.dtes.where('date').above(activeSession.startTime || new Date()).count();

                // 2. Save Cash Count Record (Audit Trail)
                await db.cashCounts.add({
                    shiftId: 1, // Mock
                    staffId: 1, // Mock
                    date: new Date(),
                    declaredCash: declaredTotal,
                    systemCash: expectedCash,
                    difference: difference,
                    notes: notes,
                    details: Object.entries(counts).map(([d, q]) => ({ denomination: Number(d), quantity: q }))
                });

                // 3. UPDATE Existing Daily Close (Close the Session)
                await db.dailyCloses.update(activeSession.id!, {
                    date: new Date(), // Closing Time
                    status: 'closed',
                    totalSales,
                    totalCash: cashSales, // Only Sales Cash (Excluding Opening)
                    totalCard,
                    totalOnline,
                    totalTips,
                    dteCount,
                    cashDifference: difference,
                    closedBy: "Admin User", // TODO: Real staff name
                    // openingCash is already there
                });
            });

            alert("✅ Cierre Z Guardado. Turno finalizado.");
            router.push('/manager');

        } catch (e) {
            console.error(e);
            alert("❌ Error al guardar cierre");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER ---

    // Loading State
    if (activeSession === undefined) return <div className="p-10 text-white">Cargando sesión...</div>;

    // No Active Session State
    if (activeSession === null) {
        return (
            <div className="flex h-screen w-full bg-[#2a2a2a] text-white flex-col items-center justify-center p-4">
                <div className="bg-toast-charcoal border border-white/10 rounded-2xl p-8 max-w-md text-center shadow-2xl">
                    <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">No hay Caja Abierta</h2>
                    <p className="text-gray-400 mb-6">Debes abrir un turno antes de poder realizar un cierre.</p>
                    <button
                        onClick={() => router.push('/manager/open')}
                        className="w-full bg-toast-orange hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors shadow-lg"
                    >
                        Ir a Apertura de Caja
                    </button>
                    <button
                        onClick={() => router.push('/manager')}
                        className="mt-3 w-full text-gray-400 hover:text-white py-2"
                    >
                        Volver al Menú
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative bg-[#2a2a2a]">

            <Header title="Cierre de Caja (Z)">
                <div className="text-sm font-mono bg-white/5 px-4 py-2 rounded-lg text-white flex gap-2 items-center">
                    <span className="text-gray-400 text-xs uppercase">Inicio:</span>
                    {activeSession.startTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '--:--'}
                </div>
            </Header>

            <main className="flex-1 p-4 md:p-8 w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-6 h-full overflow-hidden pb-20 md:pb-8">

                {/* LEFT: BLIND COUNTER */}
                <div className="flex-[2] bg-toast-charcoal rounded-2xl border border-white/5 p-6 shadow-xl flex flex-col min-h-0">
                    <h2 className="text-lg font-bold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2 shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-gray-500" /> 1. Conteo de Efectivo
                    </h2>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {DENOMINATIONS.map((denom) => (
                            <div key={denom.value} className="flex justify-between items-center bg-black/20 p-2 md:p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${denom.type === 'bill' ? 'bg-green-900/40 text-green-500' : 'bg-yellow-900/40 text-yellow-500'}`}>
                                        {denom.type === 'bill' ? <Banknote className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
                                    </div>
                                    <span className="font-bold text-lg w-20 text-right">${denom.value}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">x</span>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={counts[denom.value] || ''}
                                        onChange={(e) => handleCountChange(denom.value, parseInt(e.target.value) || 0)}
                                        className="w-20 bg-black/40 border border-white/10 rounded px-3 py-2 text-right text-white font-mono focus:border-toast-orange outline-none"
                                        onFocus={(e) => e.target.select()}
                                    />
                                </div>

                                <div className="w-24 text-right font-mono text-gray-400 font-bold">
                                    ${((counts[denom.value] || 0) * denom.value).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-end shrink-0">
                        <div className="text-sm text-gray-400">Total Contado Manualmente</div>
                        <div className="text-4xl font-bold text-white tracking-tight">${declaredTotal.toLocaleString()}</div>
                    </div>
                </div>

                {/* RIGHT: SUMMARY & ACTIONS */}
                <div className="md:w-[400px] flex flex-col gap-4">

                    {/* EXPECTED BREAKDOWN CARD */}
                    <div className="bg-white/5 rounded-2xl border border-white/5 p-6 shadow-lg">
                        <h3 className="font-bold text-gray-300 mb-4 uppercase tracking-wider text-xs flex items-center gap-2">
                            <Calculator className="w-4 h-4" /> Desglose Esperado
                        </h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-gray-400">
                                <span>(+) Fondo Inicial</span>
                                <span className="font-mono text-white">${openingCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>(+) Ventas Efectivo</span>
                                <span className="font-mono text-white">${cashSales.toLocaleString()}</span>
                            </div>
                            <div className="h-px bg-white/10 my-1"></div>
                            <div className="flex justify-between text-toast-blue font-bold text-lg">
                                <span>(=) Total Esperado</span>
                                <span>${expectedCash.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* CONFIRMATION CARD */}
                    <div className={`rounded-2xl border p-6 shadow-xl transition-all duration-300 ${difference === 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle className={difference === 0 ? 'text-green-500' : 'text-red-500'} />
                            Resultado Cierre
                        </h3>

                        <div className="space-y-2 text-sm mb-4">
                            <div className="flex justify-between font-bold text-lg items-center">
                                <span>Diferencia:</span>
                                <span className={`text-2xl ${difference === 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {difference > 0 ? '+' : ''}{difference.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {difference !== 0 && (
                            <div className="text-xs text-red-300 bg-red-500/20 p-3 rounded-lg mb-4 border border-red-500/20 leading-relaxed">
                                ⚠️ <strong>Descuadre:</strong> El dinero contado no coincide con lo esperado por el sistema. Recuenta o justifica abajo.
                            </div>
                        )}

                        <textarea
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-toast-orange outline-none h-24 resize-none placeholder:text-gray-600"
                            placeholder="Notas de cierre (opcional)..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={handleSaveClose}
                        disabled={isSubmitting || declaredTotal === 0}
                        className="w-full py-5 bg-toast-orange hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-3 text-xl active:scale-95 transition-all"
                    >
                        {isSubmitting ? 'Cerrando...' : <><Save className="w-6 h-6" /> CONFIRMAR CIERRE</>}
                    </button>

                </div>

            </main>
        </div>
    )
}
