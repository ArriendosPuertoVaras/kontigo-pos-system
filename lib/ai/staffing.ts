import { db } from '@/lib/db';
import { getDay, getHours } from 'date-fns';

/**
 * Predicts staffing needs for a specific future date based on historical patterns.
 * @param targetDate The date to forecast for
 */
export async function getStaffingForecast(targetDate: Date) {
    const targetDayOfWeek = getDay(targetDate); // 0=Sun, 1=Mon...

    // 1. Fetch historical orders for this Day of Week (last 30 days simplified -> all time for this MVP)
    // In strict production we would limit range, but filtering all by JS is fine for IndexedDB size here.
    const history = await db.orders
        .filter(o => {
            if (!o.createdAt) return false;
            const d = new Date(o.createdAt);
            if (isNaN(d.getTime())) return false;
            return getDay(d) === targetDayOfWeek;
        })
        .toArray();

    // 2. Aggregate by Hour with Category Split
    const hourlyLoad: Record<number, { count: number, totalItems: number, kitchenItems: number, barItems: number }> = {};

    // Initialize 0-23
    for (let i = 0; i < 24; i++) hourlyLoad[i] = { count: 0, totalItems: 0, kitchenItems: 0, barItems: 0 };

    history.forEach(order => {
        const h = getHours(order.createdAt);
        hourlyLoad[h].count += 1;

        order.items.forEach(item => {
            const qty = item.quantity;
            hourlyLoad[h].totalItems += qty;

            // Simple heuristic based on known Category IDs from seed
            // ID 1=Comida (Kitchen), ID 2=Bebidas (Bar)
            if (item.product.categoryId === 2 || item.product.categoryId === 4 || item.product.categoryId === 5) { // Bebidas, Vinos, Cafe
                hourlyLoad[h].barItems += qty;
            } else {
                hourlyLoad[h].kitchenItems += qty;
            }
        });
    });

    // 3. Calculate Average & Recommendation
    // If we have data from 4 Mondays, we divide by 4. 
    // For MVP, we just take the raw sum and assume "Activity Score" or divide by a heuristic factor (e.g., 4 weeks)
    // Let's assume the DB has roughly 1 month of seed data or we treat it as "Average Potential".
    // We'll normalize by dividing by 4 to simulate "Weekly Average".
    const weeksInData = 4; // Normalize

    const forecast = Object.entries(hourlyLoad).map(([hour, data]) => {
        const avgTotal = data.totalItems / weeksInData;
        const avgKitchen = data.kitchenItems / weeksInData;
        const avgBar = data.barItems / weeksInData;

        const isOpen = parseInt(hour) >= 9 && parseInt(hour) <= 23;

        const breakdown = {
            waiters: 0,
            kitchen: 0,
            bar: 0,
            steward: 0,
            cleaning: 0
        };

        if (isOpen) {
            // WAITERS: 1 per 15 items served
            breakdown.waiters = Math.max(1, Math.ceil(avgTotal / 15));

            // KITCHEN: 1 per 15 food items
            breakdown.kitchen = Math.max(1, Math.ceil(avgKitchen / 15));

            // BAR: 1 per 20 drinks (Only if drinks exist, else 0 or 1 bartender/barista)
            breakdown.bar = avgBar > 5 ? Math.ceil(avgBar / 20) : 0;

            // STEWARD: 1 per 50 items (dishes to wash)
            breakdown.steward = Math.ceil(avgTotal / 50);

            // CLEANING: Fixed 1 if busy, else 0 (waiters clean)
            breakdown.cleaning = avgTotal > 20 ? 1 : 0;
        }

        return {
            hour: parseInt(hour),
            metrics: {
                totalOrders: Math.round(data.count / weeksInData),
                items: Math.round(avgTotal)
            },
            recommended: breakdown,
            totalStaff: Object.values(breakdown).reduce((a, b) => a + b, 0),
            status: avgTotal > 30 ? 'busy' : (avgTotal > 10 ? 'moderate' : 'slow')
        };
    });

    return forecast;
}
