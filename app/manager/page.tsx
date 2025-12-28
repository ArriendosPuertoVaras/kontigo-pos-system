'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    ChevronLeft, ChevronRight, Calendar,
    TrendingUp, DollarSign, Users, AlertTriangle, MessageSquare, BarChart3, LayoutGrid, Edit3, Settings, UtensilsCrossed
} from 'lucide-react';
import Link from 'next/link';
import {
    format, isSameDay, startOfDay, endOfDay,
    startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    addDays, addWeeks, addMonths,
    eachDayOfInterval
} from 'date-fns';
import { es } from 'date-fns/locale';
import { generateMockData } from '@/lib/mock_generator';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { usePermission } from '@/hooks/usePermission';
import { Lock } from 'lucide-react';

export default function ManagerPage() {
    const hasAccess = usePermission('admin:view');

    // 1. STATE: Date & View Mode
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
    const [isSimulating, setIsSimulating] = useState(false);

    // 2. CALCULATE RANGE
    const getRange = () => {
        const d = selectedDate;
        if (viewMode === 'day') return { start: startOfDay(d), end: endOfDay(d) };
        if (viewMode === 'week') return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
        return { start: startOfMonth(d), end: endOfMonth(d) };
    };

    const { start, end } = getRange();

    // 3. FETCH DATA (Filtered by Range)
    const selectedOrders = useLiveQuery(async () => {
        return db.orders
            .where('createdAt')
            .between(start, end, true, true)
            .filter(o => o.status !== 'cancelled')
            .toArray();
    }, [start, end]);

    const activeShifts = useLiveQuery(async () => {
        return db.shifts.filter(s => !s.endTime).toArray();
    });

    const lowStockIngredients = useLiveQuery(async () => {
        return db.ingredients.filter(i => {
            // 1. Infinite Stock -> NEVER Alert
            if (i.isInfinite) return false;
            // 2. Custom Threshold or Default (e.g. 5)
            const threshold = i.minStock !== undefined ? i.minStock : 5;
            return i.stock <= threshold;
        }).toArray();
    });

    if (hasAccess === false) {
        return (
            <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans selection:bg-toast-orange selection:text-white relative">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center bg-[#1a1a1a] text-white">
                    <div className="flex flex-col items-center gap-4 p-8 bg-white/5 rounded-2xl border border-white/10 max-w-sm text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                            <Lock className="w-8 h-8 text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold mb-1">Acceso Restringido</h2>
                            <p className="text-sm text-gray-400">No tienes permisos para acceder al Panel de Administración.</p>
                        </div>
                        <Link href="/tables">
                            <button className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors">
                                Volver
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }



    // 4. COMPUTED KPI
    const totalSales = selectedOrders?.reduce((sum, o) => sum + o.total, 0) || 0;
    const ticketCount = selectedOrders?.length || 0;
    const avgTicket = ticketCount > 0 ? Math.round(totalSales / ticketCount) : 0;
    const activeStaffCount = activeShifts?.length || 0;

    // 5. CHART DATA PREPARATION
    let chartData: { label: string, value: number, active: boolean }[] = [];
    let chartTitle = "Ventas";

    if (viewMode === 'day') {
        // HOURLY (00-23)
        chartTitle = "Ventas por Hora";
        const salesByHour = new Array(24).fill(0);
        selectedOrders?.forEach(order => {
            const h = order.createdAt.getHours();
            salesByHour[h] += order.total;
        });
        chartData = salesByHour.map((val, i) => ({
            label: `${i}:00`,
            value: val,
            active: val > 0
        }));
    } else {
        // DAILY (Week or Month)
        chartTitle = viewMode === 'week' ? "Ventas de la Semana" : "Ventas del Mes";
        const days = eachDayOfInterval({ start, end });
        chartData = days.map(d => {
            const dayTotal = selectedOrders
                ?.filter(o => isSameDay(o.createdAt, d))
                .reduce((sum, o) => sum + o.total, 0) || 0;
            return {
                label: viewMode === 'week' ? format(d, 'EEEE', { locale: es }) : format(d, 'd'),
                value: dayTotal,
                active: isSameDay(d, new Date()) // Highlight today
            };
        });
    }

    // Filter visible data for Recharts
    const visibleChartData = chartData.filter((_, i) => {
        if (viewMode === 'day') return i >= 10; // Show from 10:00 onwards
        return true;
    }).map(d => ({
        hour: d.label, // mapped for chart
        total: d.value
    }));


    // NAVIGATION HANDLERS
    const moveDate = (direction: 'prev' | 'next') => {
        const delta = direction === 'next' ? 1 : -1;
        if (viewMode === 'day') setSelectedDate(d => addDays(d, delta));
        if (viewMode === 'week') setSelectedDate(d => addWeeks(d, delta));
        if (viewMode === 'month') setSelectedDate(d => addMonths(d, delta));
    };

    const formatDateLabel = () => {
        if (viewMode === 'day') return format(selectedDate, "EEEE d 'de' MMMM", { locale: es });
        if (viewMode === 'month') return format(selectedDate, "MMMM yyyy", { locale: es });
        return `Semana del ${format(start, "d MMM", { locale: es })}`;
    };

    const formatMoney = (val: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans selection:bg-toast-orange selection:text-white relative">
            <Sidebar />
            <main className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-[1600px] mx-auto w-full">
                    <Header title="Panel Gerencial">
                        <div className="flex gap-2">
                            <Link href="/staff" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded-lg text-xs font-bold transition">
                                <Users className="w-3.5 h-3.5" /> RRHH
                            </Link>
                            <Link href="/manager/recipe-analyzer" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded-lg text-xs font-bold transition">
                                <TrendingUp className="w-3.5 h-3.5" /> COSTOS
                            </Link>
                            <Link href="/manager/accounting" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded-lg text-xs font-bold transition">
                                <DollarSign className="w-3.5 h-3.5" /> FINANZAS
                            </Link>
                        </div>
                    </Header>

                    {/* DATE NAVIGATION & ACTIONS (Compact) */}
                    <div className="flex items-center justify-between mb-4 mt-2">
                        <div className="flex items-center gap-3">
                            {/* VIEW MODE TOGGLE */}
                            <div className="bg-black/20 p-0.5 rounded-lg flex text-[10px] font-bold border border-white/5">
                                {(['day', 'week', 'month'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setViewMode(m)}
                                        className={`px-3 py-1 rounded transition-all capitalize ${viewMode === m ? 'bg-toast-charcoal text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center bg-[#2a2a2a] rounded-lg p-1 border border-white/5">
                                <button onClick={() => moveDate('prev')} className="p-1 hover:bg-white/10 rounded transition"><ChevronLeft className="w-3.5 h-3.5" /></button>
                                <span className="px-3 py-1 text-xs font-bold text-gray-300 flex items-center gap-1.5 capitalize min-w-[120px] justify-center">
                                    <Calendar className="w-3.5 h-3.5 text-toast-orange" />
                                    {formatDateLabel()}
                                </span>
                                <button onClick={() => moveDate('next')} className="p-1 hover:bg-white/10 rounded transition"><ChevronRight className="w-3.5 h-3.5" /></button>
                            </div>
                            {isSameDay(selectedDate, new Date()) && (
                                <span className="text-[9px] font-bold text-toast-orange bg-toast-orange/10 px-2 py-0.5 rounded border border-toast-orange/20 animate-pulse">
                                    EN VIVO
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded-lg text-xs font-bold transition">
                                <MessageSquare className="w-3.5 h-3.5" /> Chat Equipo
                            </button>
                        </div>
                    </div>

                    {/* KPI CARDS (Compact) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        {/* TOTAL SALES */}
                        <div className="bg-[#1e3a29] border border-[#2d5c40] p-4 rounded-xl relative overflow-hidden group hover:scale-[1.01] transition-transform shadow-lg">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <DollarSign className="w-10 h-10 text-green-400" />
                            </div>
                            <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1">Venta Total</p>
                            <h3 className="text-xl font-black text-white">{formatMoney(totalSales)}</h3>
                        </div>

                        {/* TICKET PROMEDIO */}
                        <div className="bg-[#1e2330] border border-[#2d364f] p-4 rounded-xl relative overflow-hidden group hover:scale-[1.01] transition-transform shadow-lg">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingUp className="w-10 h-10 text-blue-400" />
                            </div>
                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Ticket Prom.</p>
                            <h3 className="text-xl font-black text-white">{formatMoney(avgTicket)}</h3>
                        </div>

                        {/* PERSONAL ACTIVO */}
                        <div className="bg-[#3a251e] border border-[#5c3a2d] p-4 rounded-xl relative overflow-hidden group hover:scale-[1.01] transition-transform shadow-lg">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Users className="w-10 h-10 text-orange-400" />
                            </div>
                            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Personal</p>
                            <h3 className="text-xl font-black text-white">{activeStaffCount}</h3>
                        </div>

                        {/* STOCK ALERTS */}
                        <div className="bg-[#3a1e1e] border border-[#5c2d2d] p-4 rounded-xl relative overflow-hidden group hover:scale-[1.01] transition-transform shadow-lg">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <AlertTriangle className="w-10 h-10 text-red-500" />
                            </div>
                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Alertas Stock</p>
                            <h3 className="text-xl font-black text-white">{lowStockIngredients?.length || 0}</h3>
                        </div>
                    </div>

                    {/* CHARTS & LISTS GRID (Compact) */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* SALES CHART */}
                        <div className="lg:col-span-2 bg-[#2a2a2a] border border-white/5 rounded-xl p-4 shadow-xl flex flex-col">
                            <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-wider">{chartTitle}</h3>
                            <div className="flex-1 w-full min-h-[250px] flex items-end">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={visibleChartData}>
                                        <XAxis
                                            dataKey="hour"
                                            stroke="#666"
                                            fontSize={10}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '10px' }}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        />
                                        <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: STAFF & ALERTS */}
                        <div className="space-y-4">
                            {/* ACTIVE STAFF */}
                            <div className="bg-[#2a2a2a] border border-white/5 rounded-xl p-4 shadow-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Equipo Activo</h3>
                                    <span className="text-[10px] font-bold text-orange-400">{activeShifts?.length || 0}</span>
                                </div>
                                <div className="space-y-3 max-h-40 overflow-y-auto">
                                    {!activeShifts || activeShifts.length === 0 ? (
                                        <p className="text-[10px] text-gray-500 text-center py-2">Sin personal activo</p>
                                    ) : (
                                        activeShifts.map(shift => {
                                            return (
                                                <div key={shift.id} className="flex items-center gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold">
                                                        S{shift.staffId}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-white">Staff #{shift.staffId}</p>
                                                        <p className="text-[9px] text-green-400 flex items-center gap-1">
                                                            {new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - Ahora
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            {/* ALERTS */}
                            <div className="bg-[#2a2a2a] border border-white/5 rounded-xl p-4 shadow-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Stock Bajo</h3>
                                    <span className="text-[10px] font-bold text-red-400">{lowStockIngredients?.length || 0}</span>
                                </div>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {lowStockIngredients?.map(ing => (
                                        <div key={ing.id} className="flex justify-between items-center p-1.5 bg-red-500/5 border border-red-500/10 rounded-lg">
                                            <span className="text-[10px] text-gray-300">{ing.name}</span>
                                            <span className="text-[9px] font-bold text-red-400">{ing.stock} {ing.unit}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BOTTOM: POPULAR ITEMS (Compact) */}
                    <div className="mt-4 bg-[#2a2a2a] border border-white/5 rounded-xl p-4 shadow-xl">
                        <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider">Productos Top (Simulado)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {[1, 2, 3, 4, 5, 6].map((_, i) => (
                                <div key={i} className="bg-black/20 p-2 rounded-lg border border-white/5">
                                    <div className="h-10 bg-white/5 rounded mb-2"></div>
                                    <div className="h-2 w-3/4 bg-white/10 rounded mb-1"></div>
                                    <div className="h-1.5 w-1/2 bg-white/10 rounded"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
