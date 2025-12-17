import { db, Staff, Order } from '@/lib/db';
import { addDays, subDays, setHours, setMinutes, getDay } from 'date-fns';

/**
 * MOCK DATA GENERATOR 🧪
 * Populates the DB with:
 * 1. Extra Staff (2 Cooks, 1 Barman, 1 Waiter)
 * 2. 30 Days of Sales History following "Google Maps" popularity curves.
 */

export async function generateMockData(baseDate: Date = new Date()) {
    console.log("🌱 STARTING MOCK DATA GENERATION...");

    // 1. ADD MOCK STAFF
    const mockStaff: Partial<Staff>[] = [
        { name: "Cocinero Mock 1", role: "kitchen", activeRole: "kitchen", pin: "1111", salaryType: 'hourly', baseSalary: 5000, contractType: "part-time", weeklyHoursLimit: 30 },
        { name: "Cocinero Mock 2", role: "kitchen", activeRole: "kitchen", pin: "2222", salaryType: 'hourly', baseSalary: 5000, contractType: "44-hours", weeklyHoursLimit: 44 },
        { name: "Barman Estrella", role: "bar", activeRole: "bar", pin: "3333", salaryType: 'hourly', baseSalary: 5500, contractType: "44-hours", weeklyHoursLimit: 44 },
        { name: "Garzón Refuerzo", role: "waiter", activeRole: "waiter", pin: "4444", salaryType: 'hourly', baseSalary: 4500, contractType: "part-time", weeklyHoursLimit: 20 },
    ];

    const staffToAdd: Staff[] = [];
    for (const s of mockStaff) {
        // Check duplication by name
        if (!s.name) continue;
        const exists = await db.staff.where('name').equals(s.name).first();
        if (!exists) {
            staffToAdd.push(s as Staff);
        }
    }

    if (staffToAdd.length > 0) {
        await db.staff.bulkAdd(staffToAdd);
        console.log(`✅ ${staffToAdd.length} Mock Staff Added`);
    } else {
        console.log("ℹ️ No new mock staff to add.");
    }

    // 2. GENERATE SALES HISTORY (30 Days)
    const today = baseDate;
    const TABLE_COUNT = 20;

    // Google Maps Popularity Curves (0-1.0 Intensity)
    const getIntensity = (day: number, hour: number) => {
        const isWeekend = day === 5 || day === 6; // Fri/Sat
        const isSunday = day === 0;

        // LUNCH PEAK (Universal)
        if (hour >= 13 && hour < 15) return 0.8;
        if (hour === 14) return 1.0; // Peak Lunch

        // DINNER PEAK
        if (isWeekend) {
            if (hour >= 20 && hour < 23) return 1.0; // Packed
            if (hour >= 23 && hour < 24) return 0.7;
            if (hour >= 18 && hour < 20) return 0.5;
        } else if (!isSunday) {
            if (hour >= 20 && hour < 22) return 0.7; // Normal Dinner
        } else {
            // Sunday
            if (hour >= 13 && hour < 16) return 0.9; // Strong Sunday Lunch
        }

        return 0.1; // Base trickle
    };

    // Generate
    const ordersToAdd: Order[] = [];

    // Start from 0 (Today) to 30 (Last Month)
    for (let i = 0; i <= 30; i++) {
        const date = subDays(today, i);
        const dayOfWeek = getDay(date);

        // Iterate Operating Hours (12:00 to 24:00)
        for (let h = 12; h < 24; h++) {
            const intensity = getIntensity(dayOfWeek, h);

            // How many orders this hour?
            // Max capacity: 20 tables. Turnover ~1.5h. 
            // Max orders/hour ~ 15.
            const maxOrders = 15;
            const ordersThisHour = Math.floor(Math.random() * maxOrders * intensity);

            for (let o = 0; o < ordersThisHour; o++) {
                const orderTime = setMinutes(setHours(date, h), Math.floor(Math.random() * 60));

                // Random total
                const totalAmount = Math.floor(Math.random() * 30000) + 10000;
                const tipAmount = Math.floor(totalAmount * 0.1);

                ordersToAdd.push({
                    status: 'paid', // Correct status from 'closed' to 'paid'
                    tableId: Math.floor(Math.random() * TABLE_COUNT) + 1,
                    items: [], // Simplified for stats
                    subtotal: totalAmount, // Added missing field
                    tip: tipAmount,       // Added missing field
                    total: totalAmount + tipAmount,
                    createdAt: orderTime,
                    closedAt: new Date(orderTime.getTime() + 45 * 60000), // 45 min later
                    payments: [
                        {
                            id: crypto.randomUUID(),
                            amount: totalAmount + tipAmount,
                            tip: tipAmount,
                            method: Math.random() > 0.6 ? 'card' : 'cash',
                            createdAt: new Date(orderTime.getTime() + 45 * 60000)
                        }
                    ]
                } as Order);
            }
        }
    }

    if (ordersToAdd.length > 0) {
        await db.orders.bulkAdd(ordersToAdd);
    }

    console.log(`✅ Generated ${ordersToAdd.length} Past Orders.`);
}
