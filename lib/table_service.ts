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

                if (!sourceTable || !targetTable) throw new Error("Mesa no encontrada");
                if (!sourceTable.currentOrderId || !targetTable.currentOrderId) throw new Error("Ambas mesas deben tener ordenes activas");

                const sourceOrder = await db.orders.get(sourceTable.currentOrderId);
                const targetOrder = await db.orders.get(targetTable.currentOrderId);

                if (!sourceOrder || !targetOrder) throw new Error("Orden no encontrada");

                // 1. Move items from Source to Target
                const movedItems = sourceOrder.items.map(item => ({
                    ...item,
                    notes: `(Desde ${sourceTable.name}) ${item.notes || ''}`
                }));

                const updatedItems = [...targetOrder.items, ...movedItems];

                // Recalculate totals
                const totals = this.calculateOrderTotals(updatedItems);

                // Update Target Order
                await db.orders.update(targetOrder.id!, {
                    items: updatedItems,
                    subtotal: totals.subtotal,
                    total: totals.total,
                    updatedAt: new Date()
                });

                // Close Source Order (Cancel/Merge status) or Soft Delete
                await db.orders.update(sourceOrder.id!, {
                    status: 'cancelled', // or 'merged' if supported
                    total: 0,
                    subtotal: 0,
                    notes: `Fusionada con orden ${targetOrder.id} (${targetTable.name})`
                });

                // Free Source Table
                await db.restaurantTables.update(sourceTableId, {
                    status: 'available',
                    currentOrderId: undefined
                });

                // Trigger Sync
                await syncService.autoSync(db.orders, 'orders');
                await syncService.autoSync(db.restaurantTables, 'restaurant_tables');
                return true;
            });
        } catch (error: any) {
            console.error("Merge Error:", error);
            toast.error("Error al unir mesas: " + error.message);
            throw error;
        }
    },

    // JOIN: Add an empty table to an existing order (e.g., "Bring another table")
    async joinTableToOrder(emptyTableId: number, activeTableId: number) {
        try {
            return await db.transaction('rw', db.restaurantTables, db.orders, async () => {
                const emptyTable = await db.restaurantTables.get(emptyTableId);
                const activeTable = await db.restaurantTables.get(activeTableId);

                if (!emptyTable || !activeTable) throw new Error("Mesa no encontrada");
                if (emptyTable.status !== 'available') throw new Error("La mesa a unir debe estar libre");
                if (activeTable.status !== 'occupied' || !activeTable.currentOrderId) throw new Error("La mesa destino debe tener una orden activa");

                const activeOrder = await db.orders.get(activeTable.currentOrderId);
                if (!activeOrder) throw new Error("Orden activa no encontrada");

                // Update Empty Table to point to same order
                await db.restaurantTables.update(emptyTableId, {
                    status: 'occupied',
                    currentOrderId: activeOrder.id
                });

                // Optional: Update Order covers? Maybe asking user is better. kept simple for now.

                await syncService.autoSync(db.restaurantTables, 'restaurant_tables');
                return true;
            });
        } catch (error: any) {
            console.error("Join Error:", error);
            toast.error("Error al unir mesa a orden: " + error.message);
            throw error;
        }
    },

    // LINK: Link two empty tables with a new shared order
    async linkEmptyTables(tableId1: number, tableId2: number) {
        try {
            return await db.transaction('rw', db.restaurantTables, db.orders, async () => {
                const t1 = await db.restaurantTables.get(tableId1);
                const t2 = await db.restaurantTables.get(tableId2);

                if (!t1 || !t2) throw new Error("Mesa no encontrada");
                if (t1.status !== 'available' || t2.status !== 'available') throw new Error("Ambas mesas deben estar libres");

                // Create New Order
                const newOrderId = await db.orders.add({
                    tableId: tableId1, // Primary table
                    items: [],
                    status: 'open',
                    subtotal: 0,
                    tip: 0,
                    total: 0,
                    createdAt: new Date(),
                    covers: 4, // Default estimate
                    restaurantId: '1'
                });

                // Assign to BOTH
                await db.restaurantTables.update(tableId1, { status: 'occupied', currentOrderId: newOrderId as number });
                await db.restaurantTables.update(tableId2, { status: 'occupied', currentOrderId: newOrderId as number });

                await syncService.autoSync(db.orders, 'orders');
                await syncService.autoSync(db.restaurantTables, 'restaurant_tables');

                return newOrderId;
            });
        } catch (error: any) {
            console.error("Link Error:", error);
            toast.error("Error al vincular mesas: " + error.message);
            throw error;
        }
    },

    calculateOrderTotals(items: any[]) {
        const subtotal = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        return { subtotal, total: subtotal }; // Simplified
    }
};
