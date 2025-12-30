'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db, Staff, Shift } from '@/lib/db';
import { getStaffingForecast } from '@/lib/ai/staffing';
import { getOvertimeStatus } from '@/lib/compliance/rules';
import { Clock, Users, BrainCircuit, AlertTriangle, ShieldCheck, UserPlus, LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import ClockInModal from '@/components/ClockInModal';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';


import { usePermission } from '@/hooks/usePermission';
import { Lock } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function StaffPage() {
    const hasAccess = usePermission('admin:view');
    const [forecast, setForecast] = useState<any[]>([]);
    const [loadingForecast, setLoadingForecast] = useState(true);
    const [isClockInOpen, setIsClockInOpen] = useState(false);

    const activeShifts = useLiveQuery(async () => {
        // Fetch all shifts and filter manually for active ones (endTime is undefined/null)
        // IndexedDB querying for 'undefined' is not standard across browsers/adapters
        const allShifts = await db.shifts.toArray();
        const active = allShifts.filter(s => !s.endTime);

        // Hydrate with staff info & Sanitize specific fields
        const populated = await Promise.all(active.map(async (s) => {
            const staff = await db.staff.get(s.staffId);

            // Sanitize dates for safety
            const safeShift = {
                ...s,
                startTime: typeof s.startTime === 'string' ? new Date(s.startTime) : s.startTime,
                scheduledStart: s.scheduledStart && typeof s.scheduledStart === 'string' ? new Date(s.scheduledStart) : s.scheduledStart,
                scheduledEnd: s.scheduledEnd && typeof s.scheduledEnd === 'string' ? new Date(s.scheduledEnd) : s.scheduledEnd,
            };

            const overtimeStatus = getOvertimeStatus(safeShift);
            return { ...safeShift, staff, overtimeStatus };
        }));
        return populated;
    });

    useEffect(() => {
        // Load Forecast for "Tomorrow" (Simulation) or Today
        const today = new Date();
        getStaffingForecast(today).then(data => {
            setForecast(data);
            setLoadingForecast(false);
        });
    }, []);

    if (hasAccess === false) {
        return (
            <div className="flex h-screen w-full bg-[#1e1e1e]">
                <Sidebar />
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                        <Lock className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Acceso Restringido</h2>
                    <p className="text-gray-400 max-w-md mb-8">
                        Esta sección contiene información sensible de RRHH y métricas financieras.
                        Solo gerentes y administradores pueden acceder.
                    </p>
                    <Link href="/staff/schedule">
                        <button className="bg-toast-orange hover:brightness-110 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-orange-500/20">
                            Ver Mi Horario
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    const formatTime = (date: Date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="min-h-screen bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white pb-20">
            {/* Header */}
            <Header title="Control de Personal" backHref="/">

                <div className="flex flex-wrap gap-3 w-full justify-center md:justify-start">
                    <Link href="/staff/employees" className="bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Colaboradores
                    </Link>
                    <Link href="/staff/schedule" className="bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Ver Horarios
                    </Link>
                    <button
                        onClick={() => setIsClockInOpen(true)}
                        className="bg-toast-orange hover:brightness-110 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-orange-500/20 flex items-center gap-2">
                        <UserPlus className="w-4 h-4" />
                        Registrar Entrada
                    </button>
                </div>
            </Header>

            <main className="p-6 max-w-7xl mx-auto space-y-8">

                {/* AI FORECAST SECTION */}


                {/* ACTIVE SHIFTS SECTION */}
                {/* KPI DASHBOARD SECTION */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck className="text-green-400 w-5 h-5" />
                        <h2 className="text-lg font-bold text-gray-200">Gestión de Personal</h2>
                    </div>

                    {/* REAL LABOR EFFICIENCY METRICS */}
                    <LaborKPIs />

                    {/* ACTIVE STAFF LIST (Grouped) */}
                    <div className="bg-[#2a2a2a] rounded-xl border border-white/5 overflow-hidden flex flex-col max-h-[400px]">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#252525] shrink-0">
                            <h3 className="font-bold text-gray-200 text-sm">Turno Actual (Agrupado)</h3>
                            <span className="text-xs text-gray-500 italic">Click en nombre para ver detalles</span>
                        </div>

                        <div className="overflow-y-auto">
                            {(() => {
                                // Group by Staff ID
                                const grouped = new Map();
                                activeShifts?.forEach(s => {
                                    if (!s.staffId) return;
                                    if (!grouped.has(s.staffId)) grouped.set(s.staffId, []);
                                    grouped.get(s.staffId).push(s);
                                });

                                return Array.from(grouped.entries()).map(([staffId, shifts]) => {
                                    const staff = shifts[0].staff;
                                    const totalAlerts = shifts.filter((s: any) => s.overtimeStatus.isOvertime).length;

                                    return (
                                        <AddressableStaffRow
                                            key={staffId}
                                            staff={staff}
                                            shifts={shifts}
                                            totalAlerts={totalAlerts}
                                            formatTime={formatTime}
                                        />
                                    );
                                });
                            })()}

                            {(!activeShifts || activeShifts.length === 0) && (
                                <div className="p-8 text-center text-gray-500 italic text-sm">
                                    No hay personal activo.
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            <ClockInModal
                isOpen={isClockInOpen}
                onClose={() => setIsClockInOpen(false)}
                onSuccess={() => { /* LiveQuery will update */ }}
            />
        </div>
    );
}

// Sub-component for Accordion Logic

// --- KPI MICRO COMPONENT ---
function LaborKPIs() {
    // Top-level state for interactions
    const [selectedKPI, setSelectedKPI] = useState<{ title: string, dataKey: string, color: string, data: any[] } | null>(null);

    // Fetch Data (Last 30 Days)
    const metrics = useLiveQuery(async () => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 30);

        const orders = await db.orders.where('createdAt').above(start).toArray();
        const shifts = await db.shifts.where('startTime').above(start).toArray();

        // Sanitize: Ensure dates are Dates
        const safeOrders = orders.map(o => ({
            ...o,
            createdAt: typeof o.createdAt === 'string' ? new Date(o.createdAt) : o.createdAt
        }));

        const safeShifts = shifts.map(s => ({
            ...s,
            startTime: typeof s.startTime === 'string' ? new Date(s.startTime) : s.startTime,
            endTime: s.endTime && typeof s.endTime === 'string' ? new Date(s.endTime) : s.endTime,
            scheduledStart: s.scheduledStart && typeof s.scheduledStart === 'string' ? new Date(s.scheduledStart) : s.scheduledStart,
            scheduledEnd: s.scheduledEnd && typeof s.scheduledEnd === 'string' ? new Date(s.scheduledEnd) : s.scheduledEnd,
        }));

        // --- Aggregation for Totals (Existing Logic) ---
        const totalSales = safeOrders.filter(o => o.status !== 'cancelled').reduce((acc, o) => acc + o.total, 0);
        let totalHours = 0;
        let totalLaborCost = 0;
        let overtimeHours = 0;
        let plannedHours = 0;

        // Map for Daily History
        const dailyMap = new Map<string, { date: string, sales: number, hours: number, cost: number, overtime: number, planned: number }>();

        // Normalize helper: Returns YYYY-MM-DD in local time
        const toLocalKey = (d: Date) => {
            // Defensive check just in case
            if (!(d instanceof Date) || isNaN(d.getTime())) return 'Invalid';
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // Init last 30 days (Include TODAY)
        // We want 30 data points ending today.
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = toLocalKey(d);
            dailyMap.set(key, { date: d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }), sales: 0, hours: 0, cost: 0, overtime: 0, planned: 0 });
        }

        // Aggregate Orders
        safeOrders.forEach(o => {
            if (o.status === 'cancelled') return;
            const key = toLocalKey(o.createdAt);
            if (dailyMap.has(key)) {
                dailyMap.get(key)!.sales += o.total;
            }
        });

        // Aggregate Shifts
        await Promise.all(safeShifts.map(async (s) => {
            const staff = await db.staff.get(s.staffId);
            if (!staff) return;

            const key = toLocalKey(s.startTime);
            const entry = dailyMap.has(key) ? dailyMap.get(key)! : null;

            // Actual Duration
            const end = s.endTime || new Date();
            const durationHours = (end.getTime() - s.startTime.getTime()) / (1000 * 60 * 60);
            totalHours += durationHours;
            if (entry) entry.hours += durationHours;

            // Cost
            let rate = 0;
            if (staff.salaryType === 'hourly') {
                rate = staff.baseSalary || 0;
            } else {
                rate = (staff.baseSalary || 0) / 176;
            }
            const cost = durationHours * rate;
            totalLaborCost += cost;
            if (entry) entry.cost += cost;

            // Overtime
            if (durationHours > 9 || s.isOvertime) {
                const ot = (durationHours - 9 > 0 ? durationHours - 9 : 0);
                overtimeHours += ot;
                if (entry) entry.overtime += ot;
            }

            // Planned
            if (s.scheduledStart && s.scheduledEnd) {
                const pDur = (s.scheduledEnd.getTime() - s.scheduledStart.getTime()) / (1000 * 60 * 60);
                plannedHours += pDur;
                if (entry) entry.planned += pDur;
            }
        }));

        // Convert Map to Array & Calc derived daily metrics
        const history = Array.from(dailyMap.values()).map(d => ({
            ...d,
            splh: d.hours > 0 ? Math.round(d.sales / d.hours) : 0,
            laborCostPct: d.sales > 0 ? parseFloat(((d.cost / d.sales) * 100).toFixed(1)) : 0,
            overtimePct: d.hours > 0 ? parseFloat(((d.overtime / d.hours) * 100).toFixed(1)) : 0,
            adherence: d.planned > 0 ? parseFloat((((d.hours - d.planned) / d.planned) * 100).toFixed(1)) : 0
        }));

        // 3. Targets
        const targetSPLH = 25000;
        const targetLaborCost = 30;

        return {
            totalSales,
            totalHours,
            totalLaborCost,
            overtimeHours,
            plannedHours,
            splh: totalHours > 0 ? totalSales / totalHours : 0,
            laborCostPct: totalSales > 0 ? (totalLaborCost / totalSales) * 100 : 0,
            overtimePct: totalHours > 0 ? (overtimeHours / totalHours) * 100 : 0,
            adherence: plannedHours > 0 ? ((totalHours - plannedHours) / plannedHours) * 100 : 0,
            targetSPLH,
            targetLaborCost,
            history
        };
    });

    if (!metrics) return <div className="animate-pulse bg-white/5 h-32 rounded-xl mb-8"></div>;

    const formatCurrency = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {/* KPI A: SPLH */}
                <div
                    onClick={() => setSelectedKPI({ title: 'Evolución SPLH (30 días)', dataKey: 'splh', color: '#4ade80', data: metrics.history })}
                    className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 shadow-lg group hover:border-blue-500/30 transition-all cursor-pointer hover:bg-white/5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Ventas por Hora-Hombre (SPLH)</span>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${metrics.splh >= metrics.targetSPLH ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(metrics.splh)}
                        </span>
                        <span className="text-[10px] text-gray-500">Meta: {formatCurrency(metrics.targetSPLH)}</span>
                    </div>
                    <div className="w-full bg-gray-700 h-1 mt-3 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${metrics.splh >= metrics.targetSPLH ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, (metrics.splh / metrics.targetSPLH) * 100)}%` }} />
                    </div>
                </div>

                {/* KPI B: LABOR COST % */}
                <div
                    onClick={() => setSelectedKPI({ title: 'Evolución Costo Laboral %', dataKey: 'laborCostPct', color: '#facc15', data: metrics.history })}
                    className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 shadow-lg group hover:border-purple-500/30 transition-all cursor-pointer hover:bg-white/5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">% Costo Laboral</span>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${metrics.laborCostPct <= metrics.targetLaborCost ? 'text-green-400' : 'text-yellow-400'}`}>
                            {metrics.laborCostPct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-gray-500">Meta: 30%</span>
                    </div>
                    <div className="w-full bg-gray-700 h-1 mt-3 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${metrics.laborCostPct <= metrics.targetLaborCost ? 'bg-green-500' : 'bg-yellow-500'}`}
                            style={{ width: `${Math.min(100, metrics.laborCostPct)}%` }} />
                    </div>
                </div>

                {/* KPI C: OVERTIME RATIO */}
                <div
                    onClick={() => setSelectedKPI({ title: 'Evolución Ratio Horas Extras', dataKey: 'overtimePct', color: '#f87171', data: metrics.history })}
                    className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 shadow-lg group hover:border-red-500/30 transition-all cursor-pointer hover:bg-white/5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Ratio Horas Extras</span>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${metrics.overtimePct < 5 ? 'text-blue-400' : 'text-red-400'}`}>
                            {metrics.overtimePct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-gray-500">{Math.round(metrics.overtimeHours)}h extras</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 leading-tight">Del total de horas trabajadas</p>
                </div>

                {/* KPI D: PLAN ADHERENCE */}
                <div
                    onClick={() => setSelectedKPI({ title: 'Desviación Plan vs Real', dataKey: 'adherence', color: '#fb923c', data: metrics.history })}
                    className="bg-[#2a2a2a] p-4 rounded-xl border border-white/5 shadow-lg group hover:border-orange-500/30 transition-all cursor-pointer hover:bg-white/5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Desviación Plan vs Real</span>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${Math.abs(metrics.adherence) < 10 ? 'text-green-400' : 'text-orange-400'}`}>
                            {metrics.adherence > 0 ? '+' : ''}{Math.round(metrics.adherence)}%
                        </span>
                        <span className="text-[10px] text-gray-500">
                            {Math.round(metrics.totalHours - metrics.plannedHours)}h Desvío
                        </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 leading-tight">Diferencia vs Horario Planificado</p>
                </div>
            </div>

            {/* GRAPH MODAL */}
            {selectedKPI && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1e1e1e] rounded-2xl border border-white/10 w-full max-w-4xl h-[500px] shadow-2xl p-6 relative flex flex-col">
                        <button
                            onClick={() => setSelectedKPI(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-colors">
                            <LogOut className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <BrainCircuit className="text-toast-orange" />
                            {selectedKPI.title}
                        </h2>

                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={selectedKPI.data}>
                                    <defs>
                                        <linearGradient id="colorKPI" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={selectedKPI.color} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={selectedKPI.color} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="date" stroke="#666" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                                        tickFormatter={(val) => selectedKPI.dataKey === 'splh' ? `$${val}` : `${val}%`} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                                        itemStyle={{ color: selectedKPI.color }}
                                        formatter={(val: number) => [
                                            selectedKPI.dataKey === 'splh' ? `$${val.toLocaleString()}` : `${val}%`,
                                            selectedKPI.title
                                        ]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey={selectedKPI.dataKey}
                                        stroke={selectedKPI.color}
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorKPI)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function AddressableStaffRow({ staff, shifts, totalAlerts, formatTime }: { staff: any, shifts: any[], totalAlerts: number, formatTime: (date: Date) => string }) {
    const [expanded, setExpanded] = useState(false);

    // Helpers
    const fmtDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    };

    return (
        <div className="border-b border-white/5 last:border-0">
            {/* Header Row */}
            <div
                onClick={() => setExpanded(!expanded)}
                className="p-3 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner ${staff?.avatarColor || 'bg-gray-600'}`}>
                        {staff?.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{staff?.name}</span>
                            {totalAlerts > 0 && (
                                <span className={`text-[9px] font-bold px-1.5 rounded animate-pulse flex items-center gap-1 ${expanded ? 'bg-red-500/10 text-red-400' : 'bg-red-500 text-white'}`}>
                                    <AlertTriangle className="w-3 h-3" />
                                    {totalAlerts} ALERTA{totalAlerts > 1 ? 'S' : ''}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500">
                            {shifts.length} Turno{shifts.length !== 1 ? 's' : ''} Abierto{shifts.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
                <div className="text-gray-500">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div className="bg-black/20 text-xs animate-in slide-in-from-top-2 duration-200">
                    {shifts.map((shift: any) => (
                        <div key={shift.id} className="flex items-center justify-between p-3 pl-14 border-b border-white/5 last:border-0 hover:bg-white/5">
                            <div className="flex flex-col gap-1">
                                <span className="font-mono text-gray-300">
                                    {formatTime(shift.startTime)} - {shift.scheduledEnd ? formatTime(shift.scheduledEnd) : '?'}
                                </span>
                                {shift.overtimeStatus.isOvertime && (
                                    <span className="text-red-400 font-bold flex items-center gap-1">
                                        ⏱ Exceso: {fmtDuration(shift.overtimeStatus.minutesOver)}
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (shift.id) db.shifts.update(shift.id, { endTime: new Date() });
                                }}
                                className="text-gray-400 hover:text-red-400 p-2 rounded transition-colors flex items-center gap-1 bg-white/5 hover:bg-white/10"
                            >
                                <LogOut className="w-3 h-3" />
                                Salir
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
