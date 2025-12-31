'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db, Staff, Shift } from '@/lib/db';
import { syncService } from '@/lib/sync_service';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, Plus, Save, X, Check, Trash2, AlertTriangle, BrainCircuit, ChevronDown } from 'lucide-react';
import { startOfWeek, addDays, format, isSameDay, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { checkWeeklyHoursCompliance, getOvertimeStatus } from '@/lib/compliance/rules';
import Sidebar from '@/components/Sidebar';

import Header from '@/components/Header';
import { generateOptimalSchedule } from '@/lib/ai/scheduler';

export default function PlannerPage() {
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [weekDays, setWeekDays] = useState<Date[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<{ staffId: number, date: Date, staffName: string } | null>(null);

    // Modal Form State
    const [shiftType, setShiftType] = useState<'work' | 'day_off' | 'sick'>('work');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [error, setError] = useState<string | null>(null); // For custom alerts

    const [suggestedShifts, setSuggestedShifts] = useState<Partial<Shift>[]>([]);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    useEffect(() => {
        const days = [];
        for (let i = 0; i < 7; i++) {
            days.push(addDays(currentWeekStart, i));
        }
        setWeekDays(days);
    }, [currentWeekStart]);

    const staffList = useLiveQuery(() => db.staff.toArray());
    const shifts = useLiveQuery(() => db.shifts.toArray()); // In real app, filter by date range

    const getShiftsFor = (staffId: number, date: Date) => {
        let combined = shifts ? [...shifts] : [];

        // Merge Real + Suggested
        if (suggestedShifts.length > 0) {
            const ghosts = suggestedShifts.filter(s => s.staffId === staffId && s.scheduledStart);
            // Add ghost property for UI
            const ghostsWithFlag = ghosts.map(g => ({ ...g, isGhost: true } as any));
            combined = [...combined, ...ghostsWithFlag];
        }

        return combined.filter(s =>
            s.staffId === staffId &&
            s.scheduledStart &&
            isSameDay(new Date(s.scheduledStart), date)
        ).sort((a, b) => (a.scheduledStart && b.scheduledStart) ? new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() : 0);
    };

    const handleCellClick = (staffId: number, staffName: string, date: Date) => {
        setSelectedSlot({ staffId, date, staffName });
        // Smart Defaults: Check if staff already has a shift this day
        const existing = getShiftsFor(staffId, date);
        if (existing.length > 0) {
            // Found existing shift(s). Default to AFTER the last one.
            const lastShift = existing[existing.length - 1];
            if (lastShift.scheduledEnd) {
                const lastEnd = new Date(lastShift.scheduledEnd);
                // Add 1 hour break
                const newStart = new Date(lastEnd.getTime() + 60 * 60 * 1000);
                setStartTime(format(newStart, 'HH:mm'));
                // Default 5 hour shift?
                const newEnd = new Date(newStart.getTime() + 5 * 60 * 60 * 1000);
                setEndTime(format(newEnd, 'HH:mm'));
                setShiftType('work');
                setError(null);
                return;
            }
        }

        // Default if no shifts
        setShiftType('work');
        setStartTime('10:00'); // Standard Kitchen Opening
        setEndTime('15:00');
        setError(null);
    };

    const handleDeleteShift = async (id: number) => {
        await db.shifts.delete(id);
        await syncService.pushAll(); // Sync deletion
    }

    const handleSaveShift = async () => {
        if (!selectedSlot) return;
        setError(null);

        // 1. Prepare Dates
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const start = new Date(selectedSlot.date);
        start.setHours(startH, startM);

        const end = new Date(selectedSlot.date);
        end.setHours(endH, endM);

        // 2. Compliance Check (Only for Work shifts)
        if (shiftType === 'work') {
            try {
                const compliance = await checkWeeklyHoursCompliance(selectedSlot.staffId, start, end);
                if (!compliance.compliant) {
                    setError(compliance.message);
                    return; // Blocking save
                }
            } catch (e) {
                console.error(e);
            }
        }

        // 3. Save to DB
        await db.shifts.add({
            staffId: selectedSlot.staffId,
            startTime: start,
            scheduledStart: start,
            scheduledEnd: end,
            type: shiftType,
        });

        // AUTO SYNC
        await syncService.autoSync(db.shifts, 'shifts');

        // Don't close immediately if adding multiple? User wants to see it. 
        // For now, let's keep modal open or close? Usually close is better UX.
        // User asked for "add block", implies staying in modal? 
        // Let's close for simplicity, user can click again to add another block (Planner flow).
        // Actually, re-reading: "no pude guardar... sale un mensaje rapido". 
        // Now with `error` state, it will stay.

        // If error, we returned. Use success callback?
        setSelectedSlot(null);
    };

    const [isPublished, setIsPublished] = useState(false);

    const handlePublish = () => {
        // Immediate visual feedback
        setIsPublished(true);
        // Reset after 3 seconds so they can publish again if needed
        setTimeout(() => setIsPublished(false), 3000);
    };

    const [showNextWeek, setShowNextWeek] = useState(false);



    // CONFIRM GHOST SHIFT
    const confirmGhostShift = async (shift: any) => {
        await db.shifts.add({
            staffId: shift.staffId,
            type: shift.type,
            scheduledStart: shift.scheduledStart,
            scheduledEnd: shift.scheduledEnd,
            startTime: shift.scheduledStart // Required by TS
        });
        await syncService.autoSync(db.shifts, 'shifts');

        // Remove from suggestions
        setSuggestedShifts(prev => prev.filter(s => s !== shift)); // Simple ref check might fail
        // View State
    };
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');

    // Derived: days to show based on view
    const daysToShow = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 30;

    useEffect(() => {
        // Reset suggestions when view changes because the "Next Period" definition changes
        setSuggestedShifts([]);
        setShowNextWeek(false);
    }, [viewMode]);

    const handleNext = () => {
        setCurrentWeekStart(d => addDays(d, daysToShow));
    };

    const handlePrev = () => {
        setCurrentWeekStart(d => addDays(d, -daysToShow));
    };

    const handleAiSuggest = async () => {
        setIsGeneratingAi(true);
        // AI RULE: Always suggest starting from TOMORROW (or Today if early).
        // User complained about "past dates".
        // If we force nextStart to be "Today", scheduler will filter out < Today inside.
        // But renderPlannerGrid below renders starting from `nextStart`.
        // So `nextStart` MUST be >= Today.

        const today = startOfWeek(new Date(), { weekStartsOn: 1 }); // Actually, let's align to grid?
        // No, user wants future. 
        // Let's make the Suggestion Grid start exactly at Today.
        const nextStart = new Date();

        setShowNextWeek(true);

        setTimeout(async () => {
            // Generate for NEXT Period
            const suggestions = await generateOptimalSchedule(nextStart, daysToShow, new Date());
            setSuggestedShifts(suggestions);
            setIsGeneratingAi(false);
        }, 1500);
    };

    // Render Grid Helper
    const renderPlannerGrid = (start: Date, title: string, isFuture: boolean = false) => {
        const days = Array.from({ length: daysToShow }, (_, i) => addDays(start, i));

        // CSS Grid Template
        // day: [200px_1fr]
        // week: [200px_repeat(7,1fr)]
        // month: [200px_repeat(30,120px)]
        const gridTemplate = viewMode === 'day' ? 'grid-cols-[200px_1fr]'
            : viewMode === 'week' ? 'grid-cols-[200px_repeat(7,1fr)]'
                : 'grid-cols-[200px_repeat(30,100px)]';

        return (
            <div className={`mb-8 ${isFuture ? 'opacity-90' : ''} ${viewMode === 'month' ? 'overflow-x-auto pb-4 max-w-full' : ''}`}>
                <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-[#1e1e1e] sticky left-0 z-20 w-fit">
                    <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded ${isFuture ? 'bg-purple-900/30 text-purple-300 border border-purple-500/30' : 'bg-gray-800 text-gray-400'}`}>
                        {title}
                    </span>
                    {isFuture && <span className="text-xs text-gray-500 italic">Sugerencia basada en IA y cumplimiento de 44h</span>}
                </div>

                <div className={`min-w-full ${viewMode === 'month' ? 'w-fit' : ''}`}>
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
                            // Calculate weekly hours (Strictly speaking "Period Hours")
                            const periodMinutes = shifts?.reduce((acc, s) => {
                                if (s.staffId !== staff.id || s.type !== 'work' || !s.scheduledStart || !s.scheduledEnd) return acc;
                                const sDate = new Date(s.scheduledStart);
                                if (sDate >= days[0] && sDate <= addDays(days[days.length - 1], 1)) {
                                    const duration = (new Date(s.scheduledEnd).getTime() - sDate.getTime()) / 1000 / 60;
                                    return acc + duration;
                                }
                                return acc;
                            }, 0) || 0;

                            const ghostMinutes = isFuture ? suggestedShifts.reduce((acc, s) => {
                                if (s.staffId !== staff.id || s.type !== 'work' || !s.scheduledStart || !s.scheduledEnd) return acc;
                                const sDate = new Date(s.scheduledStart);
                                if (sDate >= days[0] && sDate <= addDays(days[days.length - 1], 1)) {
                                    return acc + differenceInMinutes(s.scheduledEnd, s.scheduledStart);
                                }
                                return acc;
                            }, 0) : 0;

                            const totalMinutes = periodMinutes + ghostMinutes;
                            const periodHours = totalMinutes / 60;
                            // Limit logic changes for Month? 45h/week -> ~180h/month. 
                            // For MVP show Total Period Hours.

                            return (
                                <div key={staff.id} className={`grid ${gridTemplate} border-b border-white/5 hover:bg-white/5 transition-colors group`}>
                                    {/* Staff Info */}
                                    <div className="p-3 border-r border-white/5 flex flex-col justify-center bg-[#252525] group-hover:bg-[#2a2a2a] sticky left-0 z-10 border-r shadow-xl">
                                        <div className="font-bold text-gray-200 truncate w-[180px]">{staff.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] uppercase font-bold text-gray-500 bg-black/30 px-1 rounded">
                                                {staff.role}
                                            </span>
                                            <span className={`text-[10px] font-mono font-bold ml-auto flex items-center gap-1 ${periodHours > 44 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                                                {periodHours > 44 && <AlertTriangle className="w-3 h-3" />}
                                                {Number(periodHours.toFixed(1))}h
                                            </span>
                                        </div>
                                    </div>

                                    {/* Days */}
                                    {days.map((day, i) => {
                                        const cellShifts = getShiftsFor(staff.id!, day);
                                        // Calculate Daily Compliance
                                        const dailyMinutes = cellShifts.reduce((acc, s) => {
                                            if (s.type !== 'work' || !s.scheduledStart || !s.scheduledEnd) return acc;
                                            return acc + differenceInMinutes(s.scheduledEnd, s.scheduledStart);
                                        }, 0);
                                        const isDailyViolation = dailyMinutes > 600; // > 10h

                                        return (
                                            <div
                                                key={i}
                                                onClick={() => handleCellClick(staff.id!, staff.name, day)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={async (e) => {
                                                    e.preventDefault();
                                                    const data = e.dataTransfer.getData('application/json');
                                                    if (!data) return;
                                                    const sourceShift = JSON.parse(data);
                                                    const start = new Date(day);
                                                    const sourceS = new Date(sourceShift.scheduledStart);
                                                    start.setHours(sourceS.getHours(), sourceS.getMinutes());
                                                    const end = new Date(day);
                                                    const sourceE = new Date(sourceShift.scheduledEnd);
                                                    end.setHours(sourceE.getHours(), sourceE.getMinutes());

                                                    await db.shifts.add({
                                                        staffId: staff.id!,
                                                        type: sourceShift.type,
                                                        scheduledStart: start,
                                                        scheduledEnd: end,
                                                        startTime: start
                                                    });
                                                    await syncService.autoSync(db.shifts, 'shifts');
                                                }}
                                                className={`border-l border-white/5 p-1 min-h-[60px] relative cursor-pointer hover:bg-white/5 flex gap-1 overflow-hidden transition-all ${isFuture ? 'bg-purple-900/5' : ''} ${isDailyViolation ? 'bg-red-900/20 border-red-500/50' : ''}`}
                                            >
                                                {isDailyViolation && <div className="absolute top-0 right-0 p-0.5"><AlertTriangle className="w-3 h-3 text-red-500" /></div>}
                                                {cellShifts.length > 0 ? (
                                                    cellShifts.map((shift: any, idx) => {
                                                        let colorClass = 'bg-blue-500/20 text-blue-300 border-blue-500';
                                                        if (shift.isGhost) {
                                                            colorClass = 'bg-purple-500/10 text-purple-300 border-purple-500/30 border-dashed hover:opacity-100 opacity-60';
                                                        } else if (shift.type === 'sick') colorClass = 'bg-teal-900/50 text-teal-400 border-teal-700';
                                                        else if (shift.type === 'day_off') colorClass = 'bg-gray-800/50 text-gray-500 border-gray-700';
                                                        else if (idx > 0 && !shift.isGhost) colorClass = 'bg-[#722F37] text-rose-200 border-rose-900 shadow-md';

                                                        return (
                                                            <div
                                                                key={shift.id || `ghost-${idx}`}
                                                                draggable={!shift.isGhost}
                                                                onDragStart={(e) => {
                                                                    if (shift.isGhost) {
                                                                        e.preventDefault();
                                                                        return;
                                                                    }
                                                                    e.dataTransfer.setData('application/json', JSON.stringify(shift));
                                                                    e.dataTransfer.effectAllowed = 'copy';
                                                                }}
                                                                onClick={(e) => {
                                                                    if (shift.isGhost) {
                                                                        e.stopPropagation();
                                                                        confirmGhostShift(shift);
                                                                    }
                                                                }}
                                                                className={`flex-1 rounded p-1 text-[10px] font-bold border-l-2 shadow-sm truncate flex flex-col justify-center items-center hover:brightness-110 cursor-grab active:cursor-grabbing ${colorClass}`}
                                                            >
                                                                {shift.isGhost && <div className="text-[8px] uppercase tracking-tighter mb-0.5 diff-glow text-purple-200">✨</div>}
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
        <div className="flex h-screen w-full bg-[#1e1e1e] text-white font-sans overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full relative text-sm">
                {/* Header Toolbar */}
                <Header title="PLANIFICADOR">
                    <div className="flex flex-wrap items-center gap-4 justify-center">

                        {/* VIEW TOGGLE */}
                        <div className="flex bg-black/20 rounded p-0.5 border border-white/5">
                            <button
                                onClick={() => setViewMode('day')}
                                className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode === 'day' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                DÍA
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode === 'week' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                SEMANA
                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode === 'month' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                MES
                            </button>
                        </div>

                        {/* DATE NAV */}
                        <div className="flex items-center bg-black/20 rounded-lg p-1 border border-white/5">
                            <button
                                onClick={handlePrev}
                                className="p-1 hover:bg-white/10 rounded text-gray-400">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 font-mono font-bold text-gray-300 w-[140px] text-center text-xs md:text-sm">
                                {viewMode === 'day' ? format(currentWeekStart, 'd MMM', { locale: es }) :
                                    viewMode === 'month' ? format(currentWeekStart, 'MMMM yyyy', { locale: es }) :
                                        `${format(currentWeekStart, 'd MMM')} - ${format(addDays(currentWeekStart, 6), 'd MMM', { locale: es })}`}
                            </span>
                            <button
                                onClick={handleNext}
                                className="p-1 hover:bg-white/10 rounded text-gray-400">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex gap-2">
                            {/* AI GENERATE BUTTON */}
                            <button
                                onClick={handleAiSuggest}
                                disabled={isGeneratingAi || suggestedShifts.length > 0}
                                className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors
                                ${suggestedShifts.length > 0 ? 'bg-purple-900/50 text-purple-400 border border-purple-500/50' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]'}
                            `}>
                                <BrainCircuit className={`w-4 h-4 ${isGeneratingAi ? 'animate-spin' : ''}`} />
                                {isGeneratingAi ? 'Pensando...' : suggestedShifts.length > 0 ? 'Sugerencia Lista' : 'Sugerir IA'}
                            </button>

                            <button
                                onClick={handlePublish}
                                disabled={isPublished}
                                className={`px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all duration-300 ${isPublished
                                    ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)] scale-105'
                                    : 'bg-toast-orange hover:bg-orange-600 text-white'
                                    }`}>
                                {isPublished ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                {isPublished ? 'Publicado!' : 'Publicar'}
                            </button>
                        </div>
                    </div>
                </Header>

                {/* Grid Container */}
                <div className="flex-1 overflow-auto bg-[#1e1e1e] p-4 relative">
                    {renderPlannerGrid(currentWeekStart, viewMode === 'day' ? "Vista Diaria" : viewMode === 'week' ? "Vista Semanal" : "Vista Mensual")}

                    {/* ADVANCED AI PREVIEW */}
                    {showNextWeek && suggestedShifts.length > 0 && (
                        <div className="animate-in slide-in-from-bottom-10 fade-in duration-700">
                            <div className="border-t border-purple-500/20 my-8 pt-4 flex items-center justify-center">
                                <div className="bg-purple-900/20 text-purple-300 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border border-purple-500/30">
                                    <BrainCircuit className="w-4 h-4" />
                                    SUGERENCIA PARA EL SIGUIENTE PERIODO ({daysToShow} DÍAS)
                                    <ChevronDown className="w-4 h-4 animate-bounce" />
                                </div>
                            </div>
                            {/* Force the suggestion grid to start from Today so it aligns with the data */}
                            {renderPlannerGrid(new Date(), "Planificación Recomendada", true)}
                        </div>
                    )}
                </div>

                {/* ASSIGNMENT MODAL */}
                {selectedSlot && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Asignar Turno</h2>
                                    <p className="text-gray-400 text-sm">{selectedSlot.staffName}</p>
                                    <p className="text-toast-orange text-xs font-bold uppercase mt-1">
                                        {format(selectedSlot.date, 'EEEE d MMMM', { locale: es })}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedSlot(null)} className="text-gray-500 hover:text-white">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-4 bg-black/20 p-4 rounded-xl">
                                {/* Existing Shifts List */}
                                {getShiftsFor(selectedSlot.staffId, selectedSlot.date).length > 0 && (
                                    <div className="mb-4 space-y-2 border-b border-white/10 pb-4">
                                        <h3 className="text-xs font-bold text-gray-500 uppercase">Turnos Asignados</h3>
                                        {getShiftsFor(selectedSlot.staffId, selectedSlot.date).map(s => (
                                            <div key={s.id} className="flex items-center justify-between bg-white/5 p-2 rounded text-xs text-gray-300">
                                                <span>
                                                    {s.type === 'work' ? `${format(new Date(s.scheduledStart!), 'HH:mm')} - ${format(new Date(s.scheduledEnd!), 'HH:mm')}` :
                                                        s.type === 'day_off' ? 'Día Libre' : 'Enfermo'}
                                                </span>
                                                <button onClick={() => handleDeleteShift(s.id!)} className="text-red-400 hover:text-red-300">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nuevo Bloque</label>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tipo de Jornada</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setShiftType('work')}
                                            className={`py-2 rounded-lg text-sm font-bold border transition-colors ${shiftType === 'work' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-transparent hover:bg-white/5'}`}>
                                            Trabajo
                                        </button>
                                        <button
                                            onClick={() => setShiftType('day_off')}
                                            className={`py-2 rounded-lg text-sm font-bold border transition-colors ${shiftType === 'day_off' ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-transparent hover:bg-white/5'}`}>
                                            Día Libre
                                        </button>
                                        <button
                                            onClick={() => setShiftType('sick')}
                                            className={`py-2 rounded-lg text-sm font-bold border transition-colors ${shiftType === 'sick' ? 'bg-teal-900/50 border-teal-500 text-teal-400' : 'border-transparent hover:bg-white/5'}`}>
                                            Enfermo
                                        </button>
                                    </div>
                                </div>

                                {shiftType === 'work' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Entrada</label>
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg p-2 text-white font-mono focus:border-toast-orange outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Salida</label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg p-2 text-white font-mono focus:border-toast-orange outline-none"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex gap-2 items-start animate-pulse">
                                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                                    <div className="text-xs text-red-200">
                                        <strong className="block text-red-400 font-bold mb-1">¡Alerta Legal!</strong>
                                        {error}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleSaveShift}
                                className="w-full bg-toast-orange hover:brightness-110 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20">
                                <Check className="w-5 h-5" />
                                Guardar Turno
                            </button>
                        </div>
                    </div>
                )}

            </main >
        </div >
    );
}
