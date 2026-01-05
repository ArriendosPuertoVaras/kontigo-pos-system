export interface ExtractedData {
    date?: Date;
    dueDate?: Date;
    total?: number;
    iva?: number;
    neto?: number;
    rut?: string;
    supplierName?: string;
    folio?: string;
    customerNumber?: string;
    items: { name: string; price?: number }[];
}

export function parseInvoiceText(text: string): ExtractedData {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const data: ExtractedData = { items: [] };

    // Regex Utils
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const rutRegex = /(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]|\d{7,8}-[\dkK])/;
    const amountRegex = /(?:[\$]|(?:\s|^))(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/;

    // Heuristic for cleaning price (removes dots if they are thousands separators)
    const cleanAmount = (str: string) => {
        const num = str.replace(/[^\d]/g, '');
        return parseInt(num) || 0;
    };

    // 1. Detect RUT (Heuristic: First one found is usually the supplier's RUT)
    for (const line of lines) {
        const match = line.match(rutRegex);
        if (match && !data.rut) {
            data.rut = match[0];
            break;
        }
    }

    // 2. Identify Total, IVA, Neto (Chilean pattern)
    let maxFoundAmount = 0;

    for (const line of lines) {
        const upper = line.toUpperCase();

        // Match potential amounts in this line
        const amounts = line.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
        const numericalAmounts = amounts.map(item => cleanAmount(item));

        if (numericalAmounts.length > 0) {
            const lineMax = Math.max(...numericalAmounts);
            if (lineMax > maxFoundAmount) maxFoundAmount = lineMax;
        }

        // Keywords for Total
        if (upper.includes('TOTAL') || upper.includes('A PAGAR') || upper.includes('SALDO') || upper.includes('MONTO FINAL')) {
            const matches = line.match(amountRegex);
            if (matches) {
                const val = cleanAmount(matches[1]);
                if (val > 100) data.total = val;
            }
        }

        if (upper.includes('IVA') || upper.includes('I.V.A')) {
            const matches = line.match(amountRegex);
            if (matches) data.iva = cleanAmount(matches[1]);
        }

        if (upper.includes('NETO') || upper.includes('SUBTOTAL') || upper.includes('AFECTO')) {
            const matches = line.match(amountRegex);
            if (matches) data.neto = cleanAmount(matches[1]);
        }

        // 2b. Folio and Customer Number
        if (upper.includes('FOLIO') || upper.includes('BOLETA N') || upper.includes('FACTURA N')) {
            const folioMatch = line.match(/(\d{4,})/);
            if (folioMatch && !data.folio) data.folio = folioMatch[1];
        }

        if (upper.includes('CLIENTE') || upper.includes('NRO CTA') || upper.includes('N° CTA')) {
            const clientMatch = line.match(/(\d{6,})/);
            if (clientMatch && !data.customerNumber) data.customerNumber = clientMatch[1];
        }
    }

    // Mathematical Validation (Nexus Core Heuristic)
    // If Neto + IVA exists, it's more reliable than a random "TOTAL" keyword match
    if (data.neto && data.iva) {
        const calculatedTotal = data.neto + data.iva;
        if (!data.total || Math.abs(data.total - calculatedTotal) > 10) {
            console.log(`[Parser] ⚖️ Correcting Total: detected ${data.total} -> calculated ${calculatedTotal}`);
            data.total = calculatedTotal;
        }
    } else if (data.total && !data.neto && !data.iva) {
        // Reverse calculate if only total found (assuming 19% IVA)
        data.neto = Math.round(data.total / 1.19);
        data.iva = data.total - data.neto;
    }

    // Fallback for Total if not found via keyword but we see a large number
    if (!data.total && maxFoundAmount > 0) {
        data.total = maxFoundAmount;
    }

    // 3. Dates
    for (const line of lines) {
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]) - 1;
            const yearStr = dateMatch[3];
            const year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
            const detectedDate = new Date(year, month, day);

            if (!data.date) {
                data.date = detectedDate;
            } else if (!data.dueDate && (data.date as any) < detectedDate) {
                data.dueDate = detectedDate;
            }
        }
    }

    // 4. Supplier Name (Aggressive improvement)
    const garbageKeywords = /FACTURA|BOLETA|ELECTRONICA|RUT|GIRO|DIRECCION|TELEFONO|EMISION|VENCIMIENTO|TOTAL|NETO|IVA|BOLETA|GUIA|RUT|CONTADO|PAGO|CHILE|S\.A|LTDA|ALAMEDA|HIGGINS|AVENIDA|PASAJE|CALLE|N°|NUMERO|LOCAL|PISO|CIUDAD|COMUNA|REGION/i;

    const possibleSuppliers = lines.slice(0, 15).filter(l =>
        l.length > 5 &&
        l.length < 50 &&
        !dateRegex.test(l) &&
        !rutRegex.test(l) &&
        !/\d{3,}/.test(l) && // Exclude lines with numbers (likely addresses or noise)
        (l.toUpperCase().includes(' S.A') || l.toUpperCase().includes(' LTDA') || l.toUpperCase().includes(' SPA') || !garbageKeywords.test(l))
    );

    if (possibleSuppliers.length > 0) {
        data.supplierName = possibleSuppliers[0];
    }

    // 5. Items (Keep simple for now but avoid keywords)
    lines.forEach(line => {
        const isGarbage = /TOTAL|IVA|NETO|FECHA|RUT|FOLIO/i.test(line);
        if (!isGarbage && line.length > 10) {
            const matches = line.match(amountRegex);
            const amt = matches ? cleanAmount(matches[1]) : 0;
            if (amt > 0 && data.total && amt < data.total) { // Basic sanity check
                data.items.push({ name: line.replace(matches ? matches[0] : '', '').trim() });
            }
        }
    });

    return data;
}
