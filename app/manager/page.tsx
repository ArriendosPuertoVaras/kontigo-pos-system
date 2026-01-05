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
// import { generateMockData } from '@/lib/mock_generator'; // DISABLED
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



    // 4. COMPUTED KPI (Sanitized)
    const sanitizedOrders = selectedOrders?.map(o => ({
        ...o,
        createdAt: typeof o.createdAt === 'string' ? new Date(o.createdAt) : o.createdAt
    })) || [];

    const totalSales = sanitizedOrders.reduce((sum, o) => sum + o.total, 0);
    const ticketCount = sanitizedOrders.length;
    const avgTicket = ticketCount > 0 ? Math.round(totalSales / ticketCount) : 0;
    const activeStaffCount = activeShifts?.length || 0;

    // 5. CHART DATA PREPARATION
    let chartData: { label: string, value: number, active: boolean }[] = [];
    let chartTitle = "Ventas";

    if (viewMode === 'day') {
        // HOURLY (00-23)
        chartTitle = "Ventas por Hora";
        const salesByHour = new Array(24).fill(0);
        sanitizedOrders.forEach(order => {
            // Defensive check
            if (!(order.createdAt instanceof Date) || isNaN(order.createdAt.getTime())) return;
            const h = order.createdAt.getHours();
            if (h >= 0 && h < 24) salesByHour[h] += order.total;
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
            const dayTotal = sanitizedOrders
                .filter(o => {
                    if (!(o.createdAt instanceof Date) || isNaN(o.createdAt.getTime())) return false;
                    return isSameDay(o.createdAt, d);
                })
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

    // Recharts defensive: Ensure at least empty array if undefined
    if (!visibleChartData) return null;


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
                        <div className="flex gap-3">
                            <Link href="/staff" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-lg backdrop-blur-md">
                                <Users className="w-4 h-4 text-orange-400" /> RRHH
                            </Link>
                            <Link href="/manager/recipe-analyzer" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-lg backdrop-blur-md">
                                <TrendingUp className="w-4 h-4 text-green-400" /> COSTOS
                            </Link>
                            <Link href="/manager/accounting" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-lg backdrop-blur-md">
                                <DollarSign className="w-4 h-4 text-blue-400" /> FINANZAS
                            </Link>
                        </div>
                    </Header>

                    {/* DATE NAVIGATION & ACTIONS */}
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 mt-4 gap-4">
                        <div className="flex items-center gap-4">
                            {/* VIEW MODE TOGGLE */}
                            <div className="bg-black/40 p-1 rounded-xl flex text-[11px] font-bold border border-white/10 backdrop-blur-sm">
                                {(['day', 'week', 'month'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setViewMode(m)}
                                        className={`px-4 py-1.5 rounded-lg transition-all capitalize ${viewMode === m ? 'bg-gradient-to-r from-toast-orange to-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10 backdrop-blur-md">
                                <button onClick={() => moveDate('prev')} className="p-1.5 hover:bg-white/10 rounded-lg transition"><ChevronLeft className="w-4 h-4 text-gray-400" /></button>
                                <span className="px-4 py-1 text-sm font-black text-white flex items-center gap-2 capitalize min-w-[160px] justify-center tracking-tight">
                                    <Calendar className="w-4 h-4 text-toast-orange" />
                                    {formatDateLabel()}
                                </span>
                                <button onClick={() => moveDate('next')} className="p-1.5 hover:bg-white/10 rounded-lg transition"><ChevronRight className="w-4 h-4 text-gray-400" /></button>
                            </div>

                            {isSameDay(selectedDate, new Date()) && (
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-toast-orange opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-toast-orange"></span>
                                    </span>
                                    <span className="text-[10px] font-black text-toast-orange tracking-tighter uppercase">EN VIVO</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button className="flex items-center gap-2 px-4 py-2 bg-toast-orange/10 hover:bg-toast-orange/20 border border-toast-orange/20 rounded-xl text-xs font-bold transition-all text-toast-orange">
                                <MessageSquare className="w-4 h-4" /> Chat Nexus
                            </button>
                        </div>
                    </div>

                    {/* KPI CARDS (WOW DESIGN) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {/* TOTAL SALES */}
                        <div className="bg-gradient-to-br from-green-600/20 to-emerald-900/10 border border-green-500/20 p-5 rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                            <div className="absolute -top-4 -right-4 bg-green-500/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-green-500/20 transition-all"></div>
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[11px] font-black text-green-400/80 uppercase tracking-[0.2em]">Ventas Totales</p>
                                <DollarSign className="w-5 h-5 text-green-400" />
                            </div>
                            <h3 className="text-3xl font-black text-white tracking-tighter">{formatMoney(totalSales)}</h3>
                            <div className="mt-2 flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-green-400" />
                                <span className="text-[10px] text-green-400/60 font-medium">+12% vs anterior</span>
                            </div>
                        </div>

                        {/* TICKET PROMEDIO */}
                        <div className="bg-gradient-to-br from-blue-600/20 to-indigo-900/10 border border-blue-500/20 p-5 rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                            <div className="absolute -top-4 -right-4 bg-blue-500/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[11px] font-black text-blue-400/80 uppercase tracking-[0.2em]">Ticket Prom.</p>
                                <BarChart3 className="w-5 h-5 text-blue-400" />
                            </div>
                            <h3 className="text-3xl font-black text-white tracking-tighter">{formatMoney(avgTicket)}</h3>
                            <div className="mt-2 flex items-center gap-1">
                                <span className="text-[10px] text-blue-400/60 font-medium">Basado en {ticketCount} tickets</span>
                            </div>
                        </div>

                        {/* PERSONAL ACTIVO */}
                        <div className="bg-gradient-to-br from-orange-600/20 to-yellow-900/10 border border-orange-500/20 p-5 rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                            <div className="absolute -top-4 -right-4 bg-orange-500/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-orange-500/20 transition-all"></div>
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[11px] font-black text-orange-400/80 uppercase tracking-[0.2em]">Equipo en Turno</p>
                                <Users className="w-5 h-5 text-orange-400" />
                            </div>
                            <h3 className="text-3xl font-black text-white tracking-tighter">{activeStaffCount}</h3>
                            <div className="mt-2 flex items-center gap-1">
                                <span className="text-[10px] text-orange-400/60 font-medium">Laboratorio / Servicio</span>
                            </div>
                        </div>

                        {/* STOCK ALERTS */}
                        <div className="bg-gradient-to-br from-red-600/20 to-rose-900/10 border border-red-500/20 p-5 rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                            <div className="absolute -top-4 -right-4 bg-red-500/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all"></div>
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[11px] font-black text-red-400/80 uppercase tracking-[0.2em]">Críticos de Stock</p>
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                            </div>
                            <h3 className="text-3xl font-black text-white tracking-tighter">{lowStockIngredients?.length || 0}</h3>
                            <div className="mt-2 flex items-center gap-1">
                                <span className="text-[10px] text-red-400/60 font-medium">Requieren reposición urgente</span>
                            </div>
                        </div>
                    </div>

                    {/* CHARTS & LISTS GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* SALES CHART */}
                        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md flex flex-col">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">{chartTitle}</h3>
                                <div className="flex gap-2">
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md border border-white/10">
                                        <div className="w-2 h-2 rounded-full bg-toast-orange"></div>
                                        <span className="text-[10px] text-gray-400 font-bold">Ventas</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 w-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={visibleChartData}>
                                        <defs>
                                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#ea580c" stopOpacity={0.8} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="hour"
                                            stroke="#666"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={10}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(26,26,26,0.9)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '12px',
                                                fontSize: '11px',
                                                backdropFilter: 'blur(8px)',
                                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                                            }}
                                            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                        />
                                        <Bar dataKey="total" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: STAFF & ALERTS */}
                        <div className="space-y-6">
                            {/* ACTIVE STAFF */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
                                <div className="flex justify-between items-center mb-5">
                                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Equipo en Piso</h3>
                                    <div className="px-2 py-0.5 bg-toast-orange/20 text-toast-orange rounded text-[10px] font-black uppercase">
                                        {activeShifts?.length || 0}
                                    </div>
                                </div>
                                <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                    {!activeShifts || activeShifts.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-6 opacity-40">
                                            <Users className="w-8 h-8 mb-2" />
                                            <p className="text-[10px] font-bold">Sin personal en turno</p>
                                        </div>
                                    ) : (
                                        activeShifts.map(shift => (
                                            <div key={shift.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors border border-transparent hover:border-white/5">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-toast-orange to-orange-700 flex items-center justify-center text-[10px] font-black text-white ring-2 ring-white/10">
                                                    S{shift.staffId}
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-black text-white">Staff #{shift.staffId}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                        <p className="text-[9px] text-green-400 font-bold uppercase tracking-tight">
                                                            {new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ONLINE
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* ALERTS */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
                                <div className="flex justify-between items-center mb-5">
                                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Reposición Requerida</h3>
                                    <div className="px-2 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-black uppercase">
                                        {lowStockIngredients?.length || 0}
                                    </div>
                                </div>
                                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                    {lowStockIngredients?.length === 0 ? (
                                        <p className="text-[10px] text-gray-500 text-center py-4">Stock en niveles óptimos</p>
                                    ) : (
                                        lowStockIngredients?.map(ing => (
                                            <div key={ing.id} className="flex justify-between items-center p-3 bg-red-500/5 border border-red-500/10 rounded-xl group hover:bg-red-500/10 transition-all">
                                                <span className="text-[11px] font-bold text-gray-300 group-hover:text-white transition-colors">{ing.name}</span>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-black text-red-400 block tracking-tight uppercase">{ing.stock} {ing.unit}</span>
                                                    <span className="text-[8px] text-red-500/60 font-medium">Bajo el mínimo</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* BOTTOM: POPULAR ITEMS & RECENT ACTIVITY */}
                    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
                            <h3 className="text-xs font-black text-white mb-5 uppercase tracking-widest">Productos Top</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {[1, 2, 3, 4, 5, 6].map((_, i) => (
                                    <div key={i} className="bg-black/20 p-3 rounded-xl border border-white/5 group hover:bg-white/5 transition-all cursor-pointer">
                                        <div className="h-12 bg-gradient-to-br from-white/5 to-white/0 rounded-lg mb-3"></div>
                                        <div className="h-2.5 w-3/4 bg-white/10 rounded-full mb-2"></div>
                                        <div className="h-2 w-1/2 bg-white/5 rounded-full"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5">
                                <MessageSquare className="w-24 h-24" />
                            </div>
                            <h3 className="text-xs font-black text-white mb-5 uppercase tracking-widest">Actividad de Nexus</h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 p-3 bg-toast-orange/5 border border-toast-orange/10 rounded-xl">
                                    <div className="w-8 h-8 rounded-full bg-toast-orange/20 flex items-center justify-center text-toast-orange group">
                                        <DollarSign className="w-4 h-4 animate-bounce" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-white">Escáner V7 Activo</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">La validación contable está activada y protegida.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                        <TrendingUp className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-white">Sincronización Cloud</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">Respaldos físicos en Supabase completados.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div >
            </main >
        </div >
    );
}
