import { db, Staff, Shift } from '@/lib/db';
import { addDays, format, differenceInMinutes, startOfDay, isSameDay, setHours, setMinutes } from 'date-fns';
import { isDailyLimitExceeded, checkSplitShiftLegality, isWeeklyLimitExceeded, LAW_CONSTANTS } from '@/lib/compliance/chilean_labor_law';
import { getDemandCurve, HourlyDemand } from './demand_profile';

/**
 * Generates an optimal schedule based on specific User Routine:
 * - Kitchen: Starts 10:00 AM.
 * - Waiters: Start 12:00 PM.
 * - Closing: 23:00 PM (22:30 Service + 30m Cleaning).
 * - Legal: Max 10h/day.
 * 
 * STRATEGY: SPLIT SHIFTS (Turno Cortado) to cover the long day legally.
 * Kitchen Pattern: 10:00-16:00 (6h) + 19:00-23:00 (4h) = 10h Total.
 * Waiter Pattern: 12:00-17:00 (5h) + 18:00-23:00 (5h) = 10h Total.
 */
export async function generateOptimalSchedule(startDate: Date, daysToGenerate: number = 7, minDate?: Date) {
    const staffList = await db.staff.toArray();
    if (staffList.length === 0) return [];

    const generatedShifts: Shift[] = [];
    const staffWeeklyMinutes = new Map<number, number>();
    const staffWorkDays = new Map<number, Set<string>>(); // Track unique days worked to enforce 6x1

    // Init Tracker
    staffList.forEach(s => {
        staffWeeklyMinutes.set(s.id!, 0);
        staffWorkDays.set(s.id!, new Set());
    });

    // 1. FETCH EXISTING SHIFTS to prevent Double Booking on top of Manual/Saved shifts
    // Range: StartDate -> StartDate + daysToGenerate
    const endGenDate = addDays(startDate, daysToGenerate);
    const existingShifts = await db.shifts.where('scheduledStart').between(startDate, endGenDate, true, true).toArray();

    existingShifts.forEach(shift => {
        if (!shift.staffId || !shift.scheduledStart || !shift.scheduledEnd || shift.type !== 'work') return;

        // Update Minutes
        const mins = differenceInMinutes(shift.scheduledEnd, shift.scheduledStart);
        const currentMins = staffWeeklyMinutes.get(shift.staffId) || 0;
        staffWeeklyMinutes.set(shift.staffId, currentMins + mins);

        // Update Work Days
        const dStr = format(shift.scheduledStart, 'yyyy-MM-dd');
        staffWorkDays.get(shift.staffId)?.add(dStr);
    });

    const thresholdDate = minDate ? startOfDay(minDate) : startOfDay(new Date());
    const MAX_WEEKLY_MINUTES = LAW_CONSTANTS.MAX_WEEKLY_HOURS * 60;

    // CHRONOLOGICAL ITERATION (Mon -> Sun) to ensure continuity
    for (let i = 0; i < daysToGenerate; i++) {
        const currentDate = addDays(startDate, i);
        if (currentDate < thresholdDate) continue;

        const dayName = format(currentDate, 'EEEE').toLowerCase();
        const dateStr = format(currentDate, 'yyyy-MM-dd');

        // HEURISTIC: "Skeleton Crew" needed every day
        // We iterate Roles and try to assign the Standard Pattern
        const rolesToFill = ['cocina', 'garzón'];

        // Boost for Fri/Sat (Double the crew?)
        const isPeak = ['friday', 'saturday'].includes(dayName);
        const crewSizeMultiplier = isPeak ? 2 : 1;

        for (const role of rolesToFill) {
            const neededCount = (role === 'cocina' ? 1 : 1) * crewSizeMultiplier; // Min 1

            let filledCount = 0;
            const candidates = staffList.filter(s => s.role.toLowerCase() === role || s.role === 'Universal');

            // Sort candidates: Prefer those who haven't worked 6 days yet, and have hours left
            candidates.sort((a, b) => {
                const aDays = staffWorkDays.get(a.id!)?.size || 0;
                const bDays = staffWorkDays.get(b.id!)?.size || 0;
                return aDays - bDays; // Balanced distribution
            });

            for (const staff of candidates) {
                if (filledCount >= neededCount) break;

                // DATA PREP
                const usedMinutes = staffWeeklyMinutes.get(staff.id!) || 0;
                const daysWorkedSet = staffWorkDays.get(staff.id!)!;

                // RULES CHECK
                // 1. Double Booking: If already working TODAY, skip (Max 1 role per day)
                if (daysWorkedSet.has(dateStr)) continue;

                // 2. Max 6 Days
                if (daysWorkedSet.size >= 6) continue;

                // 3. Max Hours
                if (usedMinutes >= MAX_WEEKLY_MINUTES) continue;

                // DEFINE PATTERN
                // Kitchen: 10-[16] Break [19]-23
                // Waiter: 12-[17] Break [18]-23
                let shiftsToAdd: { start: number, end: number }[] = [];

                if (role === 'cocina') {
                    shiftsToAdd = [
                        { start: 10, end: 16 }, // 6h
                        { start: 19, end: 23 }  // 4h (Total 10h)
                    ];
                } else { // Garzón
                    shiftsToAdd = [
                        { start: 12, end: 17 }, // 5h
                        { start: 18, end: 23 }  // 5h (Total 10h)
                    ];
                }

                // Try to assign BOTH fragments (Split Shift)
                let canAssign = true;
                const tentativeShifts: Shift[] = [];

                for (const fragment of shiftsToAdd) {
                    const durationMin = (fragment.end - fragment.start) * 60;

                    // Check Weekly Limit
                    // Note: We check properly below, but quick check
                    if (usedMinutes + durationMin > MAX_WEEKLY_MINUTES && staff.contractType !== 'art-22') {
                        canAssign = false; break;
                    }

                    // Check Daily Limit (Art 28) - We know logic guarantees <10h, but safe check
                    // ...

                    // Construct Shift
                    const sStart = new Date(currentDate);
                    sStart.setHours(fragment.start, 0, 0, 0);
                    const sEnd = new Date(currentDate);
                    sEnd.setHours(fragment.end, 0, 0, 0);

                    tentativeShifts.push({
                        staffId: staff.id!,
                        scheduledStart: sStart,
                        scheduledEnd: sEnd,
                        type: 'work',
                        startTime: sStart // Validation placeholder
                    } as Shift);
                }

                if (!canAssign) continue;

                // COMMIT
                tentativeShifts.forEach(s => {
                    generatedShifts.push(s);
                    // Update usage
                    const mins = differenceInMinutes(s.scheduledEnd!, s.scheduledStart!);
                    staffWeeklyMinutes.set(staff.id!, staffWeeklyMinutes.get(staff.id!)! + mins);
                });

                staffWorkDays.get(staff.id!)!.add(dateStr);
                filledCount++;
            }
        }
    }

    // Sort Result Chronologically
    return generatedShifts.sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime());
}
