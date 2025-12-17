import { db, Shift, Staff } from '@/lib/db';
import { startOfWeek, endOfWeek, differenceInHours, differenceInMinutes } from 'date-fns';

/**
 * Checks if adding a new shift would violate the weekly hour limit (40h Law).
 * @param staffId The employee ID
 * @param proposedStart Start time of the new/edited shift
 * @param proposedEnd End time of the new/edited shift (estimated)
 * @returns Object with compliance status and remaining hours.
 */
export async function checkWeeklyHoursCompliance(staffId: number, proposedStart: Date, proposedEnd: Date) {
    const staff = await db.staff.get(staffId);
    if (!staff) throw new Error("Staff not found");

    // Art. 22 Bypass (No Hourly Limit)
    if (staff.contractType === 'art-22') {
        return {
            compliant: true,
            limit: 0,
            currentHours: 0,
            newHours: 0,
            remainingHours: 999,
            message: "Art. 22: Sin límite horario."
        };
    }

    const limit = staff.weeklyHoursLimit || 40; // Default to 40h Law

    // Get all shifts for the week of the proposed start
    const start = startOfWeek(proposedStart, { weekStartsOn: 1 }); // Monday start
    const end = endOfWeek(proposedStart, { weekStartsOn: 1 });

    const shifts = await db.shifts
        .where('staffId')
        .equals(staffId)
        .and(shift => {
            // Only count WORK shifts (ignore day_off, sick)
            if (shift.type && shift.type !== 'work') return false;

            const sTime = new Date(shift.startTime).getTime();
            return sTime >= start.getTime() && sTime <= end.getTime();
        })
        .toArray();

    // Sum existing hours
    let totalMinutes = 0;
    shifts.forEach(s => {
        // Use scheduledEnd if completed, or just scheduled duration logic. 
        // For simplicity, we use scheduled duration if available, else actual.
        // If it's a future shift, it must have scheduled times.
        const sStart = s.scheduledStart || s.startTime;
        const sEnd = s.scheduledEnd || s.endTime || new Date(sStart.getTime() + 8 * 60 * 60 * 1000); // Assume 8h if unknown
        totalMinutes += differenceInMinutes(sEnd, sStart);
    });

    // Add proposed shift
    const proposedMinutes = differenceInMinutes(proposedEnd, proposedStart);
    const newTotalMinutes = totalMinutes + proposedMinutes;
    const newTotalHours = newTotalMinutes / 60;

    return {
        compliant: newTotalHours <= limit,
        limit: limit,
        currentHours: totalMinutes / 60,
        newHours: newTotalHours,
        remainingHours: limit - (totalMinutes / 60),
        message: newTotalHours > limit
            ? `ALERTA LEGAL: Excede límite de ${limit} horas (Total prohibido: ${newTotalHours.toFixed(1)}h)`
            : `Cumple normativa (${newTotalHours.toFixed(1)} / ${limit} hrs)`
    };
}

/**
 * Checks if adding a shift violates the Daily limit (Art. 28: Max 10 hours).
 * @param existingShifts Array of shifts for that staff on that specific day
 * @param newBlockDurationHours Duration of the new shift in hours
 * @returns boolean: true if compliant, false if violates Art. 28
 */
export function checkDailyCompliance(existingShifts: Partial<Shift>[], newBlockDurationHours: number): boolean {
    // Calculate existing hours for the day
    const existingHours = existingShifts.reduce((acc, s) => {
        const start = s.scheduledStart || s.startTime;
        const end = s.scheduledEnd || s.endTime;
        if (!start || !end) return acc;

        const durationMs = new Date(end).getTime() - new Date(start).getTime();
        return acc + (durationMs / 1000 / 60 / 60);
    }, 0);

    const total = existingHours + newBlockDurationHours;
    return total <= 10; // Hard limit of 10 hours per day
}

/**
 * Checks if a specific active shift is in Overtime violation.
 * @param shift The active shift object
 * @returns Status object
 */
export function getOvertimeStatus(shift: Shift) {
    if (!shift.scheduledEnd) return { isOvertime: false, minutesOver: 0 };

    const now = new Date();
    // Normalize dates to handle potential 1970 or incorrectly saved dates
    // Case: User scheduled 10:00 - 18:00 but Date object is 1970-01-01
    const sEnd = new Date(shift.scheduledEnd);

    // Construct a "Today's scheduled end" to compare fairly
    const scheduledEndToday = new Date(now);
    scheduledEndToday.setHours(sEnd.getHours(), sEnd.getMinutes(), sEnd.getSeconds());

    // Handle overnight shifts later (if start > end, add day). 
    // MVP Assumption: Shifts are same-day.

    // Calculate diff against NOW
    const diff = differenceInMinutes(now, scheduledEndToday);

    // Filter out "future" shifts that haven't happened yet (negative diff)
    // Filter out insane values (e.g. > 24 hours) just in case
    if (diff > 10 && diff < 1440) {
        return {
            isOvertime: true,
            minutesOver: diff,
            severity: diff > 60 ? 'critical' : 'warning',
            actionRequired: true
        };
    }

    return { isOvertime: false, minutesOver: 0 };
}
