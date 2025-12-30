'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ChevronLeft, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import { startOfWeek, addDays, format, isSameDay, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

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
        const eDate = new Date(s.scheduledEnd);
        if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) return acc;

        if (sDate >= startOfWeekDate && sDate <= addDays(endOfWeekDate, 1)) { // +1 safe buffer
            return acc + (eDate.getTime() - sDate.getTime()) / 1000 / 60;
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
        const hasShift = allShifts.some(s => {
            if (s.staffId !== staff.id || s.type !== 'work' || !s.scheduledStart) return false;
            const sDate = new Date(s.scheduledStart);
            if (isNaN(sDate.getTime())) return false;
            return isSameDay(sDate, d);
        });
        if (hasShift) daysWorked++;
        if (hasShift && getDay(d) === 0) worksSunday = true; // 0 is Sunday
    }
    if (daysWorked > 6) violations.push("Trabaja más de 6 días seguidos");

    // 3. Sunday Warning (Informational for "2 Sundays" rule)
    if (worksSunday) violations.push("Trabaja Domingo (Revisar compensación)");

    return violations;
}

export default function PublicSchedulePage() {
    // READ ONLY MODE - No Permissions Check for Editing
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [weekDays, setWeekDays] = useState<Date[]>([]);

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
        return shifts.filter(s => {
            if (s.staffId !== staffId || !s.scheduledStart) return false;
            const sDate = new Date(s.scheduledStart);
            if (isNaN(sDate.getTime())) return false;
            return isSameDay(sDate, date);
        }).sort((a, b) => {
            const dateA = new Date(a.scheduledStart!);
            const dateB = new Date(b.scheduledStart!);
            // Safe sort (bad dates to end)
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateA.getTime() - dateB.getTime();
        });
    };

    const handleNext = () => {
        setCurrentWeekStart(d => addDays(d, viewMode === 'day' ? 1 : 7));
    };

    const handlePrev = () => {
        setCurrentWeekStart(d => addDays(d, viewMode === 'day' ? -1 : -7));
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
                    <span className="text-[10px] text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Solo Lectura
                    </span>
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
                                const eDate = new Date(s.scheduledEnd);
                                if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) return acc;

                                if (sDate >= days[0] && sDate <= addDays(days[days.length - 1], 1)) {
                                    const duration = (eDate.getTime() - sDate.getTime()) / 1000 / 60;
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
                                                className={`
                                                    border-l border-white/5 p-1 min-h-[60px] relative flex gap-1 overflow-hidden transition-colors
                                                `}
                                            >
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
                                                                className={`
                                                                    flex-1 rounded p-1 text-[10px] font-bold border-l-2 shadow-sm truncate flex flex-col justify-center items-center 
                                                                    ${colorClass} 
                                                                    cursor-default
                                                                `}
                                                            >
                                                                {shift.type === 'day_off' ? 'LIB' : shift.type === 'sick' ? 'ENF' :
                                                                    (() => {
                                                                        try {
                                                                            const s = new Date(shift.scheduledStart!);
                                                                            const e = new Date(shift.scheduledEnd!);
                                                                            if (isNaN(s.getTime()) || isNaN(e.getTime())) return 'ERR';
                                                                            return `${format(s, 'HH:mm')} - ${format(e, 'HH:mm')}`
                                                                        } catch { return 'ERR' }
                                                                    })()
                                                                }
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
                <Header title="HORARIOS (PÚBLICO)">
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
        </div>
    );
}
