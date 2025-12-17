import { getDay } from 'date-fns';

/**
 * DEMAND PROFILE SYSTEM 📉
 * Defines how many staff members are needed at each hour of the day.
 * In the future, this will be trained by real Sales Data.
 * For now, we use heuristic curves for "Lunch" and "Dinner" peaks.
 */

export interface HourlyDemand {
    hour: number;   // 0-23
    count: number;  // How many staff needed
}

export const OPENING_HOUR = 10;
export const CLOSING_HOUR = 24; // Midnight for simplicity in logic

/**
 * Returns the efficient staffing needed for a specific role and day.
 * This is the "Shape" of the container we need to fill with staff blocks.
 */
export function getDemandCurve(role: string, date: Date): HourlyDemand[] {
    const dayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday...
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Fri/Sat
    const isSunday = dayOfWeek === 0;

    const curve: HourlyDemand[] = [];
    const normalizedRole = role.toUpperCase();

    for (let h = OPENING_HOUR; h < CLOSING_HOUR; h++) {
        let count = 0;

        // --- WAITER STRATEGY ---
        if (normalizedRole === 'WAITER' || normalizedRole === 'UNIVERSAL') {
            // Lunch Peak (13:00 - 15:00)
            if (h >= 12 && h < 16) count += 2;
            if (h >= 13 && h < 15) count += 1; // Peak of peak

            // Dinner Peak (20:00 - 23:00)
            if (isWeekend) {
                if (h >= 19 && h < 24) count += 2;
                if (h >= 20 && h < 23) count += 2; // High intensity
            } else if (!isSunday) {
                if (h >= 20 && h < 23) count += 2;
            }

            // Sunday Special (Lunch Heavy, Dead Night)
            if (isSunday && h >= 12 && h < 17) count += 1;
        }

        // --- KITCHEN STRATEGY ---
        if (normalizedRole === 'KITCHEN' || normalizedRole === 'UNIVERSAL') {
            // Prep (10-12)
            if (h >= 10 && h < 12) count += 1; // Opener

            // Service Lunch
            if (h >= 12 && h < 16) count += 2;

            // Service Dinner
            if (h >= 19 && h < 23) count += (isWeekend ? 3 : 2);

            // Closer
            if (h >= 23 && h < 24) count += 1;
        }

        // --- MANAGER ---
        if (normalizedRole === 'MANAGER') {
            // Always 1 manager/supervisor on duty during operation
            count = 1;
        }

        curve.push({ hour: h, count });
    }

    return curve;
}
