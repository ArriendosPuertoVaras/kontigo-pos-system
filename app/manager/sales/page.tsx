'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Order } from '@/lib/db';
import Sidebar from '@/components/Sidebar';
import { Calendar, DollarSign, Clock, CreditCard, User, Filter, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Simple formatter
const formatMoney = (val: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
const formatDate = (date: Date) => date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function SalesDashboard() {
    // 1. Filter State
    const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');

    // 2. Fetch Orders (Source of Truth)
    const orders = useLiveQuery(async () => {
        let collection = db.orders.where('status').equals('paid');

        // Apply Date Filters
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (period === 'today') {
            return await collection.filter(o => o.createdAt >= startOfDay).reverse().sortBy('createdAt');
        } else if (period === 'week') {
            const startOfWeek = new Date(startOfDay);
            startOfWeek.setDate(startOfDay.getDate() - 7);
            return await collection.filter(o => o.createdAt >= startOfWeek).reverse().sortBy('createdAt');
        } else if (period === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            return await collection.filter(o => o.createdAt >= startOfMonth).reverse().sortBy('createdAt');
        } else {
            return await collection.reverse().sortBy('createdAt');
        }
    }, [period]);

    // 3. Loading State
    if (!orders) return <div className="p-10 text-white">Cargando Ventas...</div>;

    // 4. Calculations
    const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
    const totalTips = orders.reduce((sum, o) => sum + (o.tip || 0), 0);
    const totalOrders = orders.length;

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans selection:bg-toast-orange selection:text-white">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <div className="flex-1 overflow-y-auto p-5 sm:p-8">
                    <div className="max-w-7xl mx-auto pb-20">
                        {/* HEADER */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Link href="/manager" className="p-1.5 bg-white/5 rounded-full hover:bg-white/10 transition">
                                    <ArrowLeft className="w-5 h-5" />
                                </Link>
                                <div>
                                    <h1 className="text-2xl font-bold flex items-center gap-2">
                                        <DollarSign className="text-toast-orange w-6 h-6" />
                                        Registro de Ventas
                                    </h1>
                                    <p className="text-gray-400 text-xs">Historial detallado de transacciones (Source of Truth)</p>
                                </div>
                            </div>

                            {/* PERIOD TOGGLES */}
                            <div className="flex bg-[#2a2a2a] p-1 rounded-lg border border-white/10">
                                {(['today', 'week', 'month', 'all'] as const).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all ${period === p ? 'bg-toast-orange text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                            }`}
                                    >
                                        {{ today: 'Hoy', week: '7 Días', month: 'Mes', all: 'Todo' }[p]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* KPI CARDS */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <DollarSign className="w-24 h-24" />
                                </div>
                                <p className="text-gray-400 text-xs font-bold uppercase mb-1">Ventas Totales</p>
                                <p className="text-3xl font-black text-white">{formatMoney(totalSales)}</p>
                            </div>

                            <div className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <User className="w-24 h-24" />
                                </div>
                                <p className="text-gray-400 text-xs font-bold uppercase mb-1">Propinas Recaudadas</p>
                                <p className="text-3xl font-black text-green-400">{formatMoney(totalTips)}</p>
                            </div>

                            <div className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Clock className="w-24 h-24" />
                                </div>
                                <p className="text-gray-400 text-xs font-bold uppercase mb-1">Transacciones</p>
                                <p className="text-3xl font-black text-blue-400">{totalOrders}</p>
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="bg-[#2a2a2a] rounded-xl border border-white/10 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-black/20 text-gray-400 text-xs uppercase font-bold border-b border-white/5">
                                        <tr>
                                            <th className="px-4 py-3">ID Recibo</th>
                                            <th className="px-4 py-3">Fecha & Hora</th>
                                            <th className="px-4 py-3">Mesa / Cliente</th>
                                            <th className="px-4 py-3">Método Pago</th>
                                            <th className="px-4 py-3 text-right">Propina</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {orders.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-10 text-center text-gray-500 italic">
                                                    No hay ventas registradas en este período.
                                                </td>
                                            </tr>
                                        ) : (
                                            orders.map(order => {
                                                // Determine main payment method (most value)
                                                const mainPayment = order.payments?.sort((a, b) => b.amount - a.amount)[0];
                                                const method = mainPayment?.method || 'Mixto/Desc';

                                                return (
                                                    <tr key={order.id} className="hover:bg-white/5 transition-colors group">
                                                        <td className="px-4 py-3 font-mono text-gray-400 group-hover:text-white">
                                                            #{order.id?.toString().slice(0, 8)}...
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-300">
                                                            {formatDate(order.createdAt)}
                                                        </td>
                                                        <td className="px-4 py-3 text-white font-medium">
                                                            {order.tableId ? `Mesa ${order.tableId}` : 'Barra / Para Llevar'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border 
                                                                ${method === 'cash' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                                                                    method === 'card' ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                                                                        'border-purple-500/30 text-purple-400 bg-purple-500/10'}`}>
                                                                {method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : method}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-green-400/80 font-mono">
                                                            {order.tip > 0 ? formatMoney(order.tip) : '-'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-white font-mono">
                                                            {formatMoney(order.total)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
