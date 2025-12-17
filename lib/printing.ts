import { db, TicketItem, Printer } from '@/lib/db';

export async function printOrderToKitchen(ticket: TicketItem[], tableName: string): Promise<{ success: boolean, message: string }> {
    try {
        // 1. Fetch Configuration
        const printers = await db.printers.toArray();
        const categories = await db.categories.toArray();
        const categoryMap = new Map(categories.map(c => [c.id, c.name]));

        if (printers.length === 0) {
            console.warn("No printers configured. Assuming KDS usage.");
            return { success: true, message: "Orden enviada a KDS (Sin impresión física)" };
        }

        // 2. Group Items by Printer
        // Map<PrinterIP, Items[]>
        const printJobs = new Map<string, { printer: Printer, items: TicketItem[] }>();

        for (const item of ticket) {
            const catName = categoryMap.get(item.product.categoryId);
            if (!catName) continue; // Should not happen

            // Find valid printer for this category
            // Priority: First printer that claims this category
            const printer = printers.find(p => p.categories.includes(catName));

            if (printer) {
                if (!printJobs.has(printer.ip)) {
                    printJobs.set(printer.ip, { printer, items: [] });
                }
                printJobs.get(printer.ip)!.items.push(item);
            } else {
                console.warn(`No printer found for category: ${catName}`);
            }
        }

        // 3. Execute Print Jobs (Simulation)
        const results: string[] = [];

        for (const [ip, job] of printJobs) {
            const escapeCodes = generateEscPos(job.items, tableName, job.printer.name);
            console.log(`[PRINTER ${job.printer.name} (${ip})] Sending bytes...`, escapeCodes);

            // In a real app, we would do:
            // await fetch(`http://${ip}/print`, { body: escapeCodes, method: 'POST' });

            results.push(`🖨️ Enviado a ${job.printer.name} (${job.items.length} items)`);
        }

        if (results.length === 0) {
            return { success: true, message: "Orden guardada (Sin impresión requerida)" };
        }

        return { success: true, message: results.join("\n") };
    } catch (error) {
        console.error("Print Error:", error);
        return { success: false, message: "Error al imprimir" };
    }
}

export async function openCashDrawer(): Promise<void> {
    try {
        const printers = await db.printers.toArray();
        // Usually the receipt printer ("Caja" or "Bar") controls the drawer
        // We'll try to find a printer named "Caja" or just take the first one
        const cashierPrinter = printers.find(p => p.name.toLowerCase().includes('caja')) || printers[0];

        if (!cashierPrinter) {
            console.warn("No printer found to open drawer.");
            return;
        }

        // ESC p m t1 t2 (Kick drawer)
        // m = 0, t1 = 50ms, t2 = 50ms
        const kickCommand = '\x1B\x70\x00\x32\x32';

        console.log(`[DRAWER] Sending kick command to ${cashierPrinter.name}...`);
        // await fetch(`http://${cashierPrinter.ip}/raw`, { body: kickCommand, method: 'POST' });

    } catch (e) {
        console.error("Failed to open drawer:", e);
    }
}

// Simple Mock for ESC/POS generation
function generateEscPos(items: TicketItem[], tableName: string, printerName: string) {
    let buffer = `\x1B\x40`; // Initialize
    buffer += `\x1B\x61\x01`; // Center
    buffer += `\x1D\x21\x11KONTIGO POS\n`; // Double Size
    buffer += `\x1D\x21\x00${printerName}\n`;
    buffer += `\x0A`;
    buffer += `Mesa: ${tableName}\n`;
    buffer += `Fecha: ${new Date().toLocaleTimeString()}\n`;
    buffer += `--------------------------------\n`;
    buffer += `\x1B\x61\x00`; // Left align

    items.forEach(item => {
        buffer += `${item.quantity} x ${item.product.name}\n`;
        if (item.selectedModifiers) {
            item.selectedModifiers.forEach(mod => {
                buffer += `   + ${mod.name}\n`;
            });
        }
    });

    buffer += `--------------------------------\n`;
    buffer += `\x0A\x0A\x0A\x0A\x1D\x56\x00`; // Cut
    return buffer;
}
