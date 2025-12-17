'use client';
import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Account, JournalEntry } from '@/lib/db';
import { KontigoFinance } from '@/lib/accounting';
import { ArrowLeft, RefreshCw, Layers, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

export default function AccountingDashboard() {
    const accounts = useLiveQuery(() => db.accounts.toArray());
    const journalEntries = useLiveQuery(() => db.journalEntries.orderBy('date').reverse().limit(50).toArray());
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
                <div className="flex-1 overflow-y-auto p-5 sm:p-8">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Link href="/manager" className="p-1.5 bg-white/5 rounded-full hover:bg-white/10 transition">
                                    <ArrowLeft className="w-5 h-5" />
                                </Link>
                                <div>
                                    <h1 className="text-2xl font-bold flex items-center gap-2">
                                        <Layers className="text-toast-orange w-6 h-6" />
                                        Kontigo Finance
                                    </h1>
                                    <p className="text-gray-400 text-xs">Libro Contable y Plan de Cuentas en Tiempo Real</p>
                                </div>
                            </div>
                        </div>

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
                                                {initializing ? 'Creando...' : 'Inicializar Nexus'}
                                            </button>
                                        </div>
                                    )}

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
                                                    <div className="flex justify-between items-start mb-1.5">
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[9px] font-mono text-toast-orange bg-orange-500/10 px-1 py-0.5 rounded">#{entry.id}</span>
                                                                <span className="font-bold text-white text-xs">{entry.description}</span>
                                                            </div>
                                                            <p className="text-[9px] text-gray-500 mt-0.5 ml-0.5">Ref: {entry.referenceId || 'Manual'} • {new Date(entry.date).toLocaleString()}</p>
                                                        </div>
                                                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${entry.status === 'posted' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-300'}`}>
                                                            {entry.status === 'posted' ? 'Publicado' : 'Borrador'}
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
