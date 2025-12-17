'use client';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, CashCount, DailyClose } from '@/lib/db';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, AlertTriangle, CheckCircle2, Save, Banknote, Coins } from 'lucide-react';
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
    const [step, setStep] = useState<'count' | 'verify'>('count');

    // System Data (Calculated live for "Expected")
    // In a real scenario, this would filter by the current Shift ID
    const todayOrders = useLiveQuery(async () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return db.orders
            .where('createdAt').above(start)
            .filter(o => o.status !== 'cancelled')
            .toArray();
    });

    const expectedCash = todayOrders?.reduce((acc, order) => {
        const cashPayments = order.payments?.filter(p => p.method === 'cash') || [];
        return acc + cashPayments.reduce((sum, p) => sum + p.amount, 0);
    }, 0) || 0;

    const declaredTotal = Object.entries(counts).reduce((sum, [denom, qty]) => {
        return sum + (parseInt(denom) * qty);
    }, 0);

    const difference = declaredTotal - expectedCash;

    const handleCountChange = (value: number, qty: number) => {
        setCounts(prev => ({
            ...prev,
            [value]: Math.max(0, qty) // No negative counts
        }));
    };

    const handleSaveClose = async () => {
        if (!todayOrders) return;
        setIsSubmitting(true);

        try {
            await db.transaction('rw', db.cashCounts, db.dailyCloses, async () => {
                // 1. Save Cash Count
                await db.cashCounts.add({
                    shiftId: 1, // Mock Shift ID for now
                    staffId: 1, // Mock Logged In User
                    date: new Date(),
                    declaredCash: declaredTotal,
                    systemCash: expectedCash,
                    difference: difference,
                    notes: notes,
                    details: Object.entries(counts).map(([d, q]) => ({ denomination: Number(d), quantity: q }))
                });

                // 2. Create Daily Close Report (Z)
                const totalSales = todayOrders.reduce((sum, o) => sum + o.total, 0);

                await db.dailyCloses.add({
                    date: new Date(),
                    totalSales: totalSales,
                    totalCash: expectedCash, // Recorded Cash
                    totalCard: todayOrders.reduce((acc, o) => acc + (o.payments?.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0) || 0), 0),
                    totalOnline: todayOrders.reduce((acc, o) => acc + (o.payments?.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0) || 0), 0),
                    totalTips: todayOrders.reduce((sum, o) => sum + o.tip, 0),
                    dteCount: await db.dtes.count(), // Simple count for now
                    cashDifference: difference,
                    closedBy: "Ricardo Manager"
                });
            });

            alert("Cierre Z Guardado Exitosamente");
            router.push('/manager');

        } catch (e) {
            console.error(e);
            alert("Error al guardar cierre");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative bg-[#2a2a2a]">

            {/* HEADER */}
            <Header title="Cierre de Caja (Z)">
                <div className="text-sm font-mono bg-white/5 px-4 py-2 rounded-lg text-white">
                    {new Date().toLocaleDateString()}
                </div>
            </Header>

            <main className="flex-1 p-8 w-full max-w-5xl mx-auto flex gap-8 h-full overflow-hidden">

                {/* LEFT: BLIND COUNTER */}
                <div className="flex-1 bg-toast-charcoal rounded-2xl border border-white/5 p-8 shadow-xl">
                    <h2 className="text-lg font-bold text-gray-300 mb-6 uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-gray-500" /> 1. Conteo de Efectivo
                    </h2>

                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                        {DENOMINATIONS.map((denom) => (
                            <div key={denom.value} className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${denom.type === 'bill' ? 'bg-green-900/40 text-green-500' : 'bg-yellow-900/40 text-yellow-500'}`}>
                                        {denom.type === 'bill' ? <Banknote className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
                                    </div>
                                    <span className="font-bold text-lg w-24 text-right">${denom.value}</span>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-500">x</span>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={counts[denom.value] || ''}
                                        onChange={(e) => handleCountChange(denom.value, parseInt(e.target.value) || 0)}
                                        className="w-20 bg-black/40 border border-white/10 rounded px-3 py-2 text-right text-white font-mono focus:border-toast-orange outline-none"
                                    />
                                </div>

                                <div className="w-24 text-right font-mono text-gray-400">
                                    ${((counts[denom.value] || 0) * denom.value).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-end">
                        <div className="text-sm text-gray-400">Total Declarado (Contado)</div>
                        <div className="text-3xl font-bold text-white">${declaredTotal.toLocaleString()}</div>
                    </div>
                </div>

                {/* RIGHT: SUMMARY & ACTIONS */}
                <div className="w-[350px] flex flex-col gap-6">

                    {/* CONFIRMATION CARD */}
                    <div className={`rounded-2xl border p-6 shadow-xl transition-colors ${difference === 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle className={difference === 0 ? 'text-green-500' : 'text-red-500'} />
                            Resultado Preliminar
                        </h3>

                        <div className="space-y-2 text-sm mb-4">
                            <div className="flex justify-between text-gray-400">
                                <span>Esperado (Sistema):</span>
                                <span>${expectedCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>Declarado (Tú):</span>
                                <span>${declaredTotal.toLocaleString()}</span>
                            </div>
                            <div className="h-px bg-white/10 my-1"></div>
                            <div className="flex justify-between font-bold text-lg">
                                <span>Diferencia:</span>
                                <span className={difference === 0 ? 'text-green-400' : 'text-red-400'}>
                                    {difference > 0 ? '+' : ''}{difference.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {difference !== 0 && (
                            <div className="text-xs text-red-300 bg-red-500/20 p-2 rounded mb-4">
                                ⚠️ Hay una diferencia de caja. Por favor cuenta nuevamente o justifica en las notas.
                            </div>
                        )}

                        <textarea
                            className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm text-white focus:border-toast-orange outline-none h-24 resize-none"
                            placeholder="Notas / Justificación de diferencia..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={handleSaveClose}
                        disabled={isSubmitting || declaredTotal === 0}
                        className="w-full py-4 bg-toast-orange hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-lg active:scale-95 transition-all"
                    >
                        {isSubmitting ? 'Guardando...' : <><Save /> Cerrar Caja</>}
                    </button>

                </div>

            </main>
        </div>
    )
}
