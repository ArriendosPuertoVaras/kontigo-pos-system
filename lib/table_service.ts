import { db } from './db';
import { syncService } from './sync_service';
import { toast } from 'sonner';

export const TableService = {
    /**
     * Move an order from one table to another (empty) table.
     */
    async moveTable(sourceTableId: number, targetTableId: number) {
        try {
            return await db.transaction('rw', db.restaurantTables, db.orders, async () => {
                const sourceTable = await db.restaurantTables.get(sourceTableId);
                const targetTable = await db.restaurantTables.get(targetTableId);

                if (!sourceTable || sourceTable.status !== 'occupied' || !sourceTable.currentOrderId) {
                    throw new Error("Mesa de origen no válida o sin orden activa.");
                }
                if (!targetTable || targetTable.status !== 'available') {
                    throw new Error("Mesa de destino no está disponible.");
                }

                // 1. Update Order
                await db.orders.update(sourceTable.currentOrderId, {
                    tableId: targetTableId
                });

                // 2. Update Tables
                await db.restaurantTables.update(targetTableId, {
                    status: 'occupied',
                    currentOrderId: sourceTable.currentOrderId
                });

                await db.restaurantTables.update(sourceTableId, {
                    status: 'available',
                    currentOrderId: undefined
                });

                // 3. Trigger Sync
                // We do this after transaction, but calling it here queues it/promises it
                // We use setTimeout to break out of transaction for network ops if needed, 
                // but syncService adds to a queue so it's fine.
                syncService.autoSync(db.orders, 'orders');
                syncService.autoSync(db.restaurantTables, 'restaurant_tables');

                return true;
            });
        } catch (error: any) {
            console.error("Move Error:", error);
            toast.error("Error al mover mesa: " + error.message);
            throw error;
        }
    },

    /**
     * Merge source table's order INTO target table's order.
     * Source table becomes free.
     */
    async mergeTables(sourceTableId: number, targetTableId: number) {
        try {
            return await db.transaction('rw', db.restaurantTables, db.orders, async () => {
                const sourceTable = await db.restaurantTables.get(sourceTableId);
                const targetTable = await db.restaurantTables.get(targetTableId);

                if (!sourceTable?.currentOrderId || !targetTable?.currentOrderId) {
                    throw new Error("Ambas mesas deben tener órdenes activas para unir.");
                }

                const sourceOrder = await db.orders.get(sourceTable.currentOrderId);
                const targetOrder = await db.orders.get(targetTable.currentOrderId);

                if (!sourceOrder || !targetOrder) throw new Error("Orden no encontrada.");

                // 1. Merge Items
                const newItems = [...targetOrder.items];

                // Add source items with a note
                sourceOrder.items.forEach(item => {
                    newItems.push({
                        ...item,
                        notes: (item.notes ? item.notes + ' ' : '') + `(Mesa ${sourceTable.name})`
                    });
                });

                // 2. Recalculate Totals
                const newSubtotal = newItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
                const newTotal = newSubtotal + targetOrder.tip; // Keep target tip, or sum both? Usually target.

                // 3. Update Target Order
                await db.orders.update(targetOrder.id!, {
                    items: newItems,
                    subtotal: newSubtotal,
                    total: newTotal,
                    covers: (targetOrder.covers || 0) + (sourceOrder.covers || 0)
                });

                // 4. Close/Cancel Source Order
                await db.orders.update(sourceOrder.id!, {
                    status: 'cancelled', // Or a new status 'merged'
                    total: 0, // Zero out to avoid double counting sales if strictly summing closed orders
                    deletedAt: new Date() // Soft delete effectively
                });

                // 5. Free Source Table
                await db.restaurantTables.update(sourceTableId, {
                    status: 'available',
                    currentOrderId: undefined
                });

                // 6. Sync
                syncService.autoSync(db.orders, 'orders');
                syncService.autoSync(db.restaurantTables, 'restaurant_tables');

                return true;
            });
        } catch (error: any) {
            console.error("Merge Error:", error);
            toast.error("Error al unir mesas: " + error.message);
            throw error;
        }
    }
};
