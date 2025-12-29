'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, User, Clock, Check, X, Trash2, AlertTriangle, Info } from 'lucide-react';
import { startOfWeek, addDays, format, isSameDay, differenceInMinutes, setHours, setMinutes, parse, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import Header from '@/components/Header';
import { usePermission } from '@/hooks/usePermission';
import Sidebar from '@/components/Sidebar';
import { toast } from 'sonner';

// Helper to check labor laws (Dynamic)
function getLaborViolations(staff: any, allShifts: any[], day: Date) {
    if (!allShifts || !staff) return [];

    // Skip alerts for Article 22 (No Limit)
    if (staff.contractType === 'art-22') return [];

    // 1. Weekly Hours Logic
    const startOfWeekDate = startOfWeek(day, { weekStartsOn: 1 });
    const endOfWeekDate = addDays(startOfWeekDate, 6);

    const weeklyMinutes = allShifts.reduce((acc, s) => {
        if (s.staffId !== staff.id || s.type !== 'work' || !s.scheduledStart || !s.scheduledEnd) return acc;
        const sDate = new Date(s.scheduledStart);
        if (sDate >= startOfWeekDate && sDate <= addDays(endOfWeekDate, 1)) { // +1 safe buffer
            return acc + (new Date(s.scheduledEnd).getTime() - sDate.getTime()) / 1000 / 60;
        }
        return acc;
    }, 0);

    const weeklyHours = weeklyMinutes / 60;
    const violations = [];

    // Determine Limit (Default to 40 if not set, or use contract limit)
    let limit = staff.weeklyHoursLimit || 40;

    // Dynamic Alerts based on Contract
    if (staff.contractType === 'part-time') {
        const ptLimit = 30; // Part time is legally max 30h
        if (weeklyHours > ptLimit) violations.push(`Excede límite Part-Time (${ptLimit}h)`);
    } else {
        if (weeklyHours > limit) violations.push(`Excede límite semanal (${limit}h)`);
    }

    // 2. Max 6 Consecutive Days (Still applies generally)
    let daysWorked = 0;
    let worksSunday = false;
    for (let i = 0; i < 7; i++) {
        const d = addDays(startOfWeekDate, i);
        const hasShift = allShifts.some(s => s.staffId === staff.id && s.type === 'work' && isSameDay(new Date(s.scheduledStart), d));
        if (hasShift) daysWorked++;
        if (hasShift && getDay(d) === 0) worksSunday = true; // 0 is Sunday
    }
    if (daysWorked > 6) violations.push("Trabaja más de 6 días seguidos");

    // 3. Sunday Warning (Informational for "2 Sundays" rule)
    if (worksSunday) violations.push("Trabaja Domingo (Revisar compensación)");

    return violations;
}

export default function PublicSchedulePage() {
    const hasAdminAccess = usePermission('admin:view');
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [weekDays, setWeekDays] = useState<Date[]>([]);

    // Modals
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
    const [editingShift, setEditingShift] = useState<any | null>(null);

    // View State
    const [viewMode, setViewMode] = useState<'day' | 'week'>('week');

    useEffect(() => {
        const days = [];
        for (let i = 0; i < 7; i++) {
            days.push(addDays(currentWeekStart, i));
        }
        setWeekDays(days);
    }, [currentWeekStart]);

    const staffList = useLiveQuery(() => db.staff.toArray());
    const shifts = useLiveQuery(() => db.shifts.toArray());

    const getShiftsFor = (staffId: number, date: Date) => {
        if (!shifts) return [];
        return shifts.filter(s =>
            s.staffId === staffId &&
            s.scheduledStart &&
            isSameDay(new Date(s.scheduledStart), date)
        ).sort((a, b) => (a.scheduledStart && b.scheduledStart) ? new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() : 0);
    };

    const handleNext = () => {
        setCurrentWeekStart(d => addDays(d, viewMode === 'day' ? 1 : 7));
    };

    const handlePrev = () => {
        setCurrentWeekStart(d => addDays(d, viewMode === 'day' ? -1 : -7));
    };

    const handleCellClick = (staffId: number, day: Date) => {
        if (!hasAdminAccess) return;
        setSelectedStaffId(staffId);
        setSelectedDate(day);
        setEditingShift(null); // New Shift
        setIsShiftModalOpen(true);
    };

    const handleShiftClick = (e: React.MouseEvent, shift: any) => {
        if (!hasAdminAccess) return;
        e.stopPropagation(); // Prevent cell click
        setSelectedStaffId(shift.staffId);
        setSelectedDate(new Date(shift.scheduledStart));
        setEditingShift(shift);
        setIsShiftModalOpen(true);
    };

    // --- DRAG AND DROP ---
    const handleDragStart = (e: React.DragEvent, shiftId: number) => {
        if (!hasAdminAccess) return;
        e.dataTransfer.setData("shiftId", shiftId.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!hasAdminAccess) return;
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e: React.DragEvent, targetStaffId: number, targetDate: Date) => {
        if (!hasAdminAccess) return;
        e.preventDefault();
        const shiftId = Number(e.dataTransfer.getData("shiftId"));
        if (!shiftId || !shifts) return;

        const shift = shifts.find(s => s.id === shiftId);
        if (!shift) return;

        // Calculate new times preserving duration and time of day
        const oldStart = new Date(shift.scheduledStart!);
        const newStart = new Date(targetDate);
        newStart.setHours(oldStart.getHours(), oldStart.getMinutes());

        const duration = new Date(shift.scheduledEnd!).getTime() - oldStart.getTime();
        const newEnd = new Date(newStart.getTime() + duration);

        await db.shifts.update(shiftId, {
            staffId: targetStaffId, // Allow moving between staff
            startTime: newStart, // Sync legacy field
            scheduledStart: newStart,
            scheduledEnd: newEnd
        });
        toast.success("Turno movido");
    };


    // Render Grid Helper
    const renderPlannerGrid = (start: Date, title: string) => {
        const daysToShow = viewMode === 'day' ? 1 : 7;
        const days = Array.from({ length: daysToShow }, (_, i) => addDays(start, i));
        const gridTemplate = viewMode === 'day' ? 'grid-cols-[200px_1fr]' : 'grid-cols-[200px_repeat(7,1fr)]';

        return (
            <div className="mb-8 select-none">
                <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-[#1e1e1e] sticky left-0 z-20 w-fit">
                    <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded bg-gray-800 text-gray-400">
                        {title}
                    </span>
                    {hasAdminAccess && <span className="text-[10px] text-green-500 bg-green-900/20 px-2 py-0.5 rounded border border-green-900">Modo Edición + Arrastrar</span>}
                </div>

                <div className="min-w-full">
                    {/* Grid Header */}
                    <div className={`grid ${gridTemplate} border-b border-white/10 bg-[#252525] sticky top-0 z-10`}>
                        <div className="p-3 font-bold text-gray-500 uppercase text-xs flex items-center sticky left-0 bg-[#252525] z-20 border-r border-white/5 shadow-xl">
                            Colaboradores
                        </div>
                        {days.map((day, i) => (
                            <div key={i} className={`p-2 text-center border-l border-white/5 ${isSameDay(day, new Date()) ? 'bg-toast-orange/10' : ''}`}>
                                <div className="text-[10px] uppercase text-gray-500 font-bold mb-0.5">{format(day, 'EEE', { locale: es })}</div>
                                <div className={`text-sm font-bold ${isSameDay(day, new Date()) ? 'text-toast-orange' : 'text-gray-300'}`}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Grid Body */}
                    <div>
                        {staffList?.map((staff) => {
                            // Calculate weekly hours
                            const periodMinutes = shifts?.reduce((acc, s) => {
                                if (s.staffId !== staff.id || s.type !== 'work' || !s.scheduledStart || !s.scheduledEnd) return acc;
                                const sDate = new Date(s.scheduledStart);
                                if (sDate >= days[0] && sDate <= addDays(days[days.length - 1], 1)) {
                                    const duration = (new Date(s.scheduledEnd).getTime() - sDate.getTime()) / 1000 / 60;
                                    return acc + duration;
                                }
                                return acc;
                            }, 0) || 0;

                            const periodHours = periodMinutes / 60;
                            const violations = getLaborViolations(staff, shifts || [], days[0]);

                            return (
                                <div key={staff.id} className={`grid ${gridTemplate} border-b border-white/5 hover:bg-white/5 transition-colors group`}>
                                    {/* Staff Info */}
                                    <div className="p-3 border-r border-white/5 flex flex-col justify-center bg-[#252525] group-hover:bg-[#2a2a2a] sticky left-0 z-10 border-r shadow-xl relative">
                                        <div className="font-bold text-gray-200 truncate w-[180px]">{staff.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] uppercase font-bold text-gray-500 bg-black/30 px-1 rounded">
                                                {staff.role}
                                            </span>
                                            <span className={`text-[9px] font-mono ml-auto ${violations.length > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                                                {Number(periodHours.toFixed(1))}h
                                            </span>
                                        </div>

                                        {/* Labor Violation Indicator */}
                                        {violations.length > 0 && (
                                            <div className="absolute top-1 right-1 group/tooltip">
                                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                                <div className="absolute left-full top-0 ml-2 bg-black border border-white/10 p-2 rounded w-48 z-50 hidden group-hover/tooltip:block pointer-events-none">
                                                    {violations.map((v, idx) => (
                                                        <div key={idx} className="text-[10px] text-red-300 mb-0.5">• {v}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Days */}
                                    {days.map((day, i) => {
                                        const cellShifts = getShiftsFor(staff.id!, day);
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => handleCellClick(staff.id!, day)}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, staff.id!, day)}
                                                className={`
                                                    border-l border-white/5 p-1 min-h-[60px] relative flex gap-1 overflow-hidden transition-colors
                                                    ${hasAdminAccess ? 'cursor-pointer hover:bg-white/10 active:bg-white/20' : ''}
                                                `}
                                            >
                                                {hasAdminAccess && (
                                                    <div
                                                        className="absolute top-0 right-0 bottom-0 w-6 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer bg-white/5 hover:bg-white/10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCellClick(staff.id!, day);
                                                        }}
                                                        title="Agregar otro turno (Turno Cortado)"
                                                    >
                                                        <span className="text-lg font-bold text-toast-orange drop-shadow-md pb-1">+</span>
                                                    </div>
                                                )}

                                                {hasAdminAccess && cellShifts.length === 0 && (
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                                                        <span className="text-xl text-white/10">+</span>
                                                    </div>
                                                )}

                                                {cellShifts.length > 0 ? (
                                                    cellShifts.map((shift: any, idx) => {
                                                        let colorClass = 'bg-blue-500/20 text-blue-300 border-blue-500';
                                                        if (shift.type === 'sick') colorClass = 'bg-teal-900/50 text-teal-400 border-teal-700';
                                                        else if (shift.type === 'day_off') colorClass = 'bg-gray-800/50 text-gray-500 border-gray-700';
                                                        else if (shift.scheduledEnd && new Date(shift.scheduledEnd).getHours() < 12) colorClass = 'bg-indigo-500/20 text-indigo-300 border-indigo-500'; // Morning shift hint

                                                        // Split Shift visual separation is automatic via flex gap
                                                        return (
                                                            <div
                                                                key={shift.id}
                                                                draggable={hasAdminAccess}
                                                                onDragStart={(e) => handleDragStart(e, shift.id!)}
                                                                onClick={(e) => handleShiftClick(e, shift)}
                                                                className={`
                                                                    flex-1 rounded p-1 text-[10px] font-bold border-l-2 shadow-sm truncate flex flex-col justify-center items-center 
                                                                    ${colorClass} 
                                                                    ${hasAdminAccess ? 'hover:scale-95 transition-transform cursor-grab active:cursor-grabbing' : ''}
                                                                `}
                                                            >
                                                                {shift.type === 'day_off' ? 'LIB' : shift.type === 'sick' ? 'ENF' :
                                                                    `${format(new Date(shift.scheduledStart!), 'HH:mm')} - ${format(new Date(shift.scheduledEnd!), 'HH:mm')}`}
                                                            </div>
                                                        )
                                                    })
                                                ) : null}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen w-full bg-[#1e1e1e]">
            {/* SIDEBAR IS ESSENTIAL FOR NAVIGATION */}
            <Sidebar />

            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header with Back Button */}
                <Header title="HORARIOS (PÚBLICO)" backHref={hasAdminAccess ? "/staff" : "/"}>
                    <div className="flex flex-wrap items-center gap-4 justify-center">
                        {/* DATE NAV */}
                        <div className="flex items-center bg-black/20 rounded-lg p-1 border border-white/5">
                            <button
                                onClick={handlePrev}
                                className="p-1 hover:bg-white/10 rounded text-gray-400">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 font-mono font-bold text-gray-300 w-[140px] text-center text-xs md:text-sm">
                                {format(currentWeekStart, 'd MMM')} - {format(addDays(currentWeekStart, 6), 'd MMM', { locale: es })}
                            </span>
                            <button
                                onClick={handleNext}
                                className="p-1 hover:bg-white/10 rounded text-gray-400">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </Header>

                {/* Grid Container */}
                <main className="flex-1 overflow-auto bg-[#1e1e1e] p-4 relative">
                    {renderPlannerGrid(currentWeekStart, "Horario Semanal")}
                </main>
            </div>

            {/* EDIT SHIFT MODAL */}
            {isShiftModalOpen && selectedDate && selectedStaffId && (
                <ShiftModal
                    staffId={selectedStaffId}
                    date={selectedDate}
                    existingShift={editingShift}
                    onClose={() => setIsShiftModalOpen(false)}
                />
            )}
        </div>
    );
}

// --- SHIFT MODAL COMPONENT ---

function ShiftModal({ staffId, date, existingShift, onClose }: { staffId: number, date: Date, existingShift: any, onClose: () => void }) {
    const defaultStart = existingShift?.scheduledStart ? format(new Date(existingShift.scheduledStart), 'HH:mm') : "09:00";
    const defaultEnd = existingShift?.scheduledEnd ? format(new Date(existingShift.scheduledEnd), 'HH:mm') : "17:00";

    // Default to 'work' unless existing shift exists
    const [type, setType] = useState<'work' | 'day_off' | 'sick'>(existingShift?.type || 'work');
    const [startStr, setStartStr] = useState(defaultStart);
    const [endStr, setEndStr] = useState(defaultEnd);

    const handleSave = async () => {
        try {
            // Build Dates
            const [sh, sm] = startStr.split(':').map(Number);
            const [eh, em] = endStr.split(':').map(Number);

            let sDate = setMinutes(setHours(date, sh), sm);
            let eDate = setMinutes(setHours(date, eh), em);

            // Handle Overnight
            if (eDate <= sDate && type === 'work') {
                eDate = addDays(eDate, 1);
            }

            const payload = {
                staffId,
                type,
                startTime: sDate, // Legacy/Required by schema (using same for scheduled)
                scheduledStart: sDate,
                scheduledEnd: eDate,
            };

            if (existingShift) {
                await db.shifts.update(existingShift.id, payload);
                toast.success("Turno actualizado");
            } else {
                await db.shifts.add(payload as any);
                toast.success("Turno creado");
            }
            onClose();
        } catch (e) {
            console.error(e);
            toast.error("Error al guardar turno");
        }
    };

    const handleDelete = async () => {
        if (!existingShift) return;
        if (!confirm("¿Eliminar este turno?")) return;
        await db.shifts.delete(existingShift.id);
        toast.success("Turno eliminado");
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                        <Clock className="w-5 h-5 text-toast-orange" />
                        {existingShift ? 'Editar Turno' : 'Nuevo Turno'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-2 bg-black/30 p-1 rounded-lg">
                        {(['work', 'day_off', 'sick'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`flex-1 py-1.5 text-xs font-bold uppercase rounded transition-all ${type === t ? 'bg-white text-black shadow' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                {t === 'work' ? 'Trabajo' : t === 'day_off' ? 'Libre' : 'Licencia'}
                            </button>
                        ))}
                    </div>

                    {type === 'work' && (
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Entrada</label>
                                <input
                                    type="time"
                                    value={startStr}
                                    onChange={e => setStartStr(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-center focus:border-toast-orange outline-none"
                                />
                            </div>
                            <span className="text-gray-600 mt-4">-</span>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Salida</label>
                                <input
                                    type="time"
                                    value={endStr}
                                    onChange={e => setEndStr(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-center focus:border-toast-orange outline-none"
                                />
                            </div>
                        </div>
                    )}

                    <div className="text-center pt-2">
                        <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">
                            {format(date, "EEEE d 'de' MMMM", { locale: es })}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        {existingShift && (
                            <button onClick={handleDelete} className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={handleSave} className="flex-1 bg-toast-orange hover:bg-orange-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
                            <Check className="w-4 h-4" /> Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
