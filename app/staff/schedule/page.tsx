'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, User } from 'lucide-react';
import { startOfWeek, addDays, format, isSameDay, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import Header from '@/components/Header';

import { usePermission } from '@/hooks/usePermission';

import Sidebar from '@/components/Sidebar';

export default function PublicSchedulePage() {
    const hasAdminAccess = usePermission('admin:view');
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

    // Render Grid Helper
    const renderPlannerGrid = (start: Date, title: string) => {
        const daysToShow = viewMode === 'day' ? 1 : 7;
        const days = Array.from({ length: daysToShow }, (_, i) => addDays(start, i));
        const gridTemplate = viewMode === 'day' ? 'grid-cols-[200px_1fr]' : 'grid-cols-[200px_repeat(7,1fr)]';

        return (
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-[#1e1e1e] sticky left-0 z-20 w-fit">
                    <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded bg-gray-800 text-gray-400">
                        {title}
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
                                if (sDate >= days[0] && sDate <= addDays(days[days.length - 1], 1)) {
                                    const duration = (new Date(s.scheduledEnd).getTime() - sDate.getTime()) / 1000 / 60;
                                    return acc + duration;
                                }
                                return acc;
                            }, 0) || 0;

                            const periodHours = periodMinutes / 60;

                            return (
                                <div key={staff.id} className={`grid ${gridTemplate} border-b border-white/5 hover:bg-white/5 transition-colors group`}>
                                    {/* Staff Info */}
                                    <div className="p-3 border-r border-white/5 flex flex-col justify-center bg-[#252525] group-hover:bg-[#2a2a2a] sticky left-0 z-10 border-r shadow-xl">
                                        <div className="font-bold text-gray-200 truncate w-[180px]">{staff.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] uppercase font-bold text-gray-500 bg-black/30 px-1 rounded">
                                                {staff.role}
                                            </span>
                                            <span className="text-[9px] font-mono text-gray-400 ml-auto">
                                                {Number(periodHours.toFixed(1))}h
                                            </span>
                                        </div>
                                    </div>

                                    {/* Days */}
                                    {days.map((day, i) => {
                                        const cellShifts = getShiftsFor(staff.id!, day);
                                        return (
                                            <div key={i} className="border-l border-white/5 p-1 min-h-[60px] relative flex gap-1 overflow-hidden">
                                                {cellShifts.length > 0 ? (
                                                    cellShifts.map((shift: any, idx) => {
                                                        let colorClass = 'bg-blue-500/20 text-blue-300 border-blue-500';
                                                        if (shift.type === 'sick') colorClass = 'bg-teal-900/50 text-teal-400 border-teal-700';
                                                        else if (shift.type === 'day_off') colorClass = 'bg-gray-800/50 text-gray-500 border-gray-700';
                                                        else if (idx > 0) colorClass = 'bg-[#722F37] text-rose-200 border-rose-900 shadow-md';

                                                        return (
                                                            <div
                                                                key={shift.id}
                                                                className={`flex-1 rounded p-1 text-[10px] font-bold border-l-2 shadow-sm truncate flex flex-col justify-center items-center ${colorClass}`}
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
        </div>
    );
}
