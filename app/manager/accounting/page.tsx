'use client';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Account, JournalEntry } from '@/lib/db';
import { KontigoFinance } from '@/lib/accounting';
import { ArrowLeft, RefreshCw, Layers, TrendingUp, TrendingDown, DollarSign, Trash2 } from 'lucide-react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function AccountingDashboard() {
    const accounts = useLiveQuery(() => db.accounts.toArray());
    const journalEntries = useLiveQuery(() => db.journalEntries
        .filter(e => !e.deletedAt)
        .reverse()
        .limit(50)
        .toArray()
    );
    const [initializing, setInitializing] = useState(false);

    useEffect(() => {
        // Auto-init on load if needed
        KontigoFinance.initialize();
    }, []);

    const handleManualInit = async () => {
        setInitializing(true);
        await KontigoFinance.initialize();
        setInitializing(false);
    };

    const handleDeleteEntry = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar este asiento contable? Se revertirán los saldos de las cuentas afectadas.')) return;
        try {
            await KontigoFinance.reverseEntryBalances(id);
        } catch (error: any) {
            alert(`Error al eliminar: ${error.message}`);
        }
    };

    if (!accounts) return <div className="p-10 text-white">Cargando Nexus...</div>;

    const formatMoney = (val: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

    const typeMap: Record<string, string> = {
        'ASSET': 'ACTIVO',
        'LIABILITY': 'PASIVO',
        'EQUITY': 'PATRIMONIO',
        'INCOME': 'INGRESOS',
        'EXPENSE': 'GASTOS'
    };

    const typeColor: Record<string, string> = {
        'ASSET': 'text-emerald-400',
        'LIABILITY': 'text-red-400',
        'EQUITY': 'text-blue-400',
        'INCOME': 'text-green-400',
        'EXPENSE': 'text-orange-400'
    };

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans selection:bg-toast-orange selection:text-white">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <Header title="Finanzas & Contabilidad" backHref="/manager" />

                <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">

                            {/* LEFT: PLAN OF ACCOUNTS */}
                            <div className="lg:col-span-1 bg-[#2a2a2a] rounded-xl border border-white/10 overflow-hidden flex flex-col h-[70vh]">
                                <div className="p-3 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
                                    <h2 className="font-bold text-sm">Plan de Cuentas</h2>
                                    <span className="text-[10px] text-mono text-gray-400">{accounts?.length} cuentas</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                                    {accounts.length === 0 && (
                                        <div className="text-center py-6">
                                            <p className="text-gray-500 mb-3 text-xs">No hay cuentas init.</p>
                                            <button onClick={handleManualInit} disabled={initializing} className="px-3 py-1.5 bg-toast-orange rounded text-[10px] font-bold">
                                            </button>
                                        </div>
                                    )}

                                    {/* Manual Sync Utility */}
                                    <div className="mb-4 flex justify-end px-2">
                                        <button
                                            onClick={async () => {
                                                setInitializing(true);
                                                // DEBUG: Get raw values to show user
                                                const ingredients = await db.ingredients.toArray();
                                                let totalVal = 0;
                                                ingredients.forEach(i => {
                                                    if (i.stock > 0 && i.cost > 0) totalVal += i.stock * i.cost;
                                                });
                                                alert(`DEBUG INVENTARIO:\n- Ingredientes: ${ingredients.length}\n- Valor Calculado: ${totalVal}\n- Costos > 0: ${ingredients.filter(i => i.cost > 0).length}`);

                                                await KontigoFinance.recalculateInventoryValuation();
                                                setInitializing(false);
                                                window.location.reload();
                                            }}
                                            disabled={initializing}
                                            className="text-[10px] text-toast-orange hover:text-white border border-toast-orange hover:bg-toast-orange/10 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${initializing ? 'animate-spin' : ''}`} />
                                            Sincronizar Inventario
                                        </button>

                                        <button
                                            onClick={async () => {
                                                if (!confirm("⚠️ ¿REINICIAR FINANZAS? ⚠️\n\nEsto borrará todo el historial contable y lo regenerará desde CERO usando tus Ventas, Compras y Mermas reales.\n\nÚsalo solo si los saldos son incorrectos.")) return;

                                                try {
                                                    setInitializing(true);
                                                    const orderCount = await db.orders.count();
                                                    alert(`DEBUG: Iniciando regeneración. Órdenes encontradas: ${orderCount}`);

                                                    await KontigoFinance.regenerateFinancials();

                                                    const entryCount = await db.journalEntries.count();
                                                    alert(`✅ Regeneración Completada.\n\n- Asientos Generados: ${entryCount}`);

                                                    setInitializing(false);
                                                    window.location.reload();
                                                } catch (e: any) {
                                                    alert(`❌ ERROR CRÍTICO: ${e.message}`);
                                                    console.error(e);
                                                    setInitializing(false);
                                                }
                                            }}
                                            disabled={initializing}
                                            className="ml-2 text-[10px] text-red-400 hover:text-white border border-red-400 hover:bg-red-400/10 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                        >
                                            <RefreshCw className={`w-3 h-3 ${initializing ? 'animate-spin' : ''}`} />
                                            Reiniciar Finanzas
                                        </button>
                                    </div>

                                    {/* Group by Type */}
                                    {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map(type => {
                                        const typeAccounts = accounts.filter(a => a.type === type).sort((a, b) => a.code.localeCompare(b.code));
                                        if (typeAccounts.length === 0) return null;
                                        return (
                                            <div key={type} className="mb-3">
                                                <h3 className={`text-[10px] font-bold uppercase mb-1.5 ml-1 ${typeColor[type]}`}>{typeMap[type]}</h3>
                                                {typeAccounts.map(acc => (
                                                    <div key={acc.id} className="flex justify-between items-center p-1.5 rounded hover:bg-white/5 text-xs group cursor-pointer transition-colors">
                                                        <div className="flex flex-col">
                                                            <span className="text-gray-500 text-[9px] font-mono leading-none mb-0.5">{acc.code}</span>
                                                            <span className="font-medium text-gray-200 group-hover:text-white">{acc.name}</span>
                                                        </div>
                                                        <span className={`font-mono font-bold text-[10px] ${acc.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                            {formatMoney(acc.balance)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* RIGHT: JOURNAL ENTRIES (LIBRO DIARIO) */}
                            <div className="lg:col-span-2 bg-[#2a2a2a] rounded-xl border border-white/10 overflow-hidden flex flex-col h-[70vh]">
                                <div className="p-3 border-b border-white/5 bg-black/20 shrink-0">
                                    <h2 className="font-bold text-sm flex items-center gap-1.5">
                                        <TrendingUp className="w-4 h-4 text-gray-400" />
                                        Libro Diario (Últimos Movimientos)
                                    </h2>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {(!journalEntries || journalEntries.length === 0) ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50 p-8">
                                            <Layers className="w-12 h-12 mb-3" />
                                            <p className="text-sm">Esperando movimientos contables...</p>
                                            <p className="text-[10px]">El sistema generará asientos automáticos al vender o comprar.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-white/5">
                                            {journalEntries.map(entry => (
                                                <div key={entry.id} className="p-3 hover:bg-white/5 transition-colors text-xs">
                                                    <div className="flex justify-between items-start gap-3 mb-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                                <span className="text-[9px] font-mono text-toast-orange bg-orange-500/10 px-1.5 py-0.5 rounded shrink-0">#{entry.id}</span>
                                                                <span className="font-bold text-white text-xs truncate">{entry.description}</span>
                                                            </div>
                                                            <p className="text-[9px] text-gray-500 ml-0.5 truncate leading-tight">
                                                                Ref: {entry.referenceId || 'Manual'} • {new Date(entry.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${entry.status === 'posted' ? 'bg-green-900/40 text-green-400 border border-green-500/20' : 'bg-gray-700 text-gray-300'}`}>
                                                                {entry.status === 'posted' ? 'Publicado' : 'Borrador'}
                                                            </div>
                                                            <button
                                                                onClick={() => handleDeleteEntry(entry.id!)}
                                                                className="p-1 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded transition-colors group"
                                                                title="Eliminar Asiento"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Movements Table */}
                                                    <div className="bg-black/20 rounded border border-white/5 overflow-hidden mt-2">
                                                        <table className="w-full text-left text-[10px]">
                                                            <thead className="text-gray-500 bg-white/5">
                                                                <tr>
                                                                    <th className="px-2 py-1">Cuenta</th>
                                                                    <th className="px-2 py-1 text-right w-16">Debe</th>
                                                                    <th className="px-2 py-1 text-right w-16">Haber</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {entry.movements.map((mov, idx) => {
                                                                    const acc = accounts.find(a => a.id === mov.accountId);
                                                                    return (
                                                                        <tr key={idx} className="border-b border-white/5 last:border-0 text-gray-300">
                                                                            <td className="px-2 py-1">
                                                                                <span className="text-gray-500 font-mono mr-1.5">{acc?.code}</span>
                                                                                {acc?.name}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-right font-mono text-gray-400">
                                                                                {mov.type === 'DEBIT' ? formatMoney(mov.amount) : '-'}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-right font-mono text-gray-400">
                                                                                {mov.type === 'CREDIT' ? formatMoney(mov.amount) : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
