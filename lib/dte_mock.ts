import { db, Order, DTE } from './db';

// MOCK SII Service
// In real life, this would be an API call to SimpleAPI or LibreDTE

export const SII_ENV = 'CERTIFICACION'; // 'PRODUCCION' when live

export async function generateDTE(order: Order, type: 'boleta' | 'factura', receiverData?: { rut: string, name: string, address: string }): Promise<DTE> {

    // 1. Simulate Network Delay (Removed to prevent Transaction Inactive Error in Dexie)
    // await new Promise(resolve => setTimeout(resolve, 1500));

    // 2. Assign Folio (Mock: just count existing DTEs + 1)
    const count = await db.dtes.where('type').equals(type).count();
    const folio = count + 1;

    // 3. Generate "XML" (JSON payload for now)
    const payload = {
        encabezado: {
            idDoc: {
                tipoDTE: type === 'boleta' ? 39 : 33, // 39=Boleta, 33=Factura
                folio: folio,
                fechaEmision: new Date().toISOString().split('T')[0],
            },
            emisor: {
                rut: "76.123.456-7",
                razonSocial: "Restaurant Kontigo SpA",
                giro: "Venta de Comidas",
                direccion: "Av. Siempre Viva 742"
            },
            receptor: {
                rut: receiverData?.rut || "66.666.666-6", // 666... is for "Consumidor Final"
                razonSocial: receiverData?.name || "Consumidor Final",
                direccion: receiverData?.address || "Santiago, Chile"
            },
            totales: {
                montoNeto: Math.round(order.total / 1.19),
                iva: order.total - Math.round(order.total / 1.19),
                montoTotal: order.total
            }
        },
        detalles: order.items.map((item, idx) => ({
            nroLinDet: idx + 1,
            nmbItem: item.product.name,
            qtyItem: item.quantity,
            prcItem: item.product.price,
            montoItem: item.product.price * item.quantity
        }))
    };

    // 4. Create Record
    const dte: DTE = {
        orderId: order.id!,
        type: type === 'boleta' ? 39 : 33,
        folio,
        receiverRut: receiverData?.rut,
        receiverName: receiverData?.name,
        receiverAddress: receiverData?.address,
        amount: order.total,
        status: 'issued', // We assume success for mock
        xmlContent: JSON.stringify(payload, null, 2),
        date: new Date()
    };

    // 5. Save to DB
    const id = await db.dtes.add(dte);
    return { ...dte, id: id as number };
}
