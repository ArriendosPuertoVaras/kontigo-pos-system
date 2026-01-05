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

/**
 * Clean OCR noise and common misreads for professional parsing
 */
function preprocessOCR(text: string): string {
    return text
        .split('\n')
        .map(line => {
            // Remove isolated characters and noise, but preserve numbers and dots
            let cleaned = line.replace(/(^|\s)[^a-zA-Z0-9](\s|$)/g, ' ').trim();
            cleaned = cleaned.replace(/[^\w\s\$\.\,\-\:\/]/g, '');
            return cleaned;
        })
        .filter(line => line.length > 2)
        .join('\n');
}

export function parseInvoiceText(text: string): ExtractedData {
    const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const sanitizedText = preprocessOCR(text);
    const lines = sanitizedText.split('\n').map(l => l.trim()).filter(Boolean);

    const data: ExtractedData = { items: [] };

    // Regex Utils
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const rutRegex = /(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]|\d{7,8}-[\dkK])/;
    const amountRegex = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/; // Improved price capture

    const cleanAmount = (str: string) => {
        const num = str.replace(/[^\d]/g, '');
        return parseInt(num) || 0;
    };

    // 1. Detect RUT (Filter out placeholders)
    for (const line of rawLines) {
        const match = line.match(rutRegex);
        if (match) {
            const val = match[0].replace(/\./g, '');
            if (!val.startsWith('000') && !data.rut) {
                data.rut = match[0];
            }
        }
    }

    // 2. Identify Potential Amounts
    let detectedTotal = 0;
    let detectedNeto = 0;
    let detectedIva = 0;
    let maxAmount = 0;

    for (const line of lines) {
        const upper = line.toUpperCase();

        // Match numbers that look like prices
        const amounts = line.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
        const numericals = amounts.map(a => cleanAmount(a));

        if (numericals.length > 0) {
            const m = Math.max(...numericals);
            if (m > maxAmount) maxAmount = m;
        }

        const matches = line.match(amountRegex);
        const val = matches ? cleanAmount(matches[0]) : 0;

        if (val > 0) {
            // Prioritize specific keywords for Utility Bills / Invoices
            if (upper.includes('TOTAL') || upper.includes('A PAGAR') || upper.includes('VALOR TOTAL') || upper.includes('MONTO TOTAL')) {
                if (val > detectedTotal) detectedTotal = val;
            }
            if (upper.includes('NETO') || upper.includes('AFECTO') || upper.includes('SUBTOTAL')) {
                // In Chilean bills, "NETO" is usually smaller than Total
                if (detectedTotal === 0 || val < detectedTotal) {
                    if (val > detectedNeto) detectedNeto = val;
                }
            }
            if (upper.includes('IVA') || upper.includes('I.V.A')) {
                if (val > detectedIva) detectedIva = val;
            }
        }

        // --- SPECIFIC SERVICE FIELDS (Suralis, Saesa, etc.) ---
        // Folio Detection V4: Match Boleta/Factura N followed by numbers
        if (upper.includes('N°') || upper.includes('NUMERO') || upper.includes('FOLIO') || upper.includes('BOLETA') || upper.includes('FACTURA')) {
            const folioMatch = line.match(/(?:N|FOLIO|BOLETA|FACTURA)[^\d]*(\d{4,})/i);
            if (folioMatch && !data.folio) {
                // Ignore dates misread as folios
                if (!dateRegex.test(line)) data.folio = folioMatch[1];
            }
        }

        // Customer Number Detection V4: Specific keywords for utility accounts
        if (upper.includes('SERVICIO') || upper.includes('CLIENTE') || upper.includes('CUENTA') || upper.includes('CTA')) {
            const clientMatch = line.match(/(?:SERVICIO|CLIENTE|CUENTA|CTA)[^\d]*(\d{5,})/i);
            if (clientMatch && !data.customerNumber) data.customerNumber = clientMatch[1];
        }
    }

    // 3. Mathematical Healing (The "Contextual 19%" Layer)
    // Rule: if IVA != Neto * 0.19, one of them is wrong.
    const expectedIvaFromNeto = Math.round(detectedNeto * 0.19);
    const expectedNetoFromIva = Math.round(detectedIva / 0.19);

    const isIvaValid = detectedNeto > 0 && Math.abs(detectedIva - expectedIvaFromNeto) < 50;

    if (isIvaValid) {
        // Both match, solid extraction
        detectedTotal = detectedNeto + detectedIva;
    } else if (detectedTotal > 0) {
        // Use Total as anchor (most reliable in bills)
        detectedNeto = Math.round(detectedTotal / 1.19);
        detectedIva = detectedTotal - detectedNeto;
    } else if (maxAmount > 0) {
        // Use Max as anchor
        detectedTotal = maxAmount;
        detectedNeto = Math.round(detectedTotal / 1.19);
        detectedIva = detectedTotal - detectedNeto;
    }

    data.total = detectedTotal;
    data.neto = detectedNeto;
    data.iva = detectedIva;

    // 4. Dates
    for (const line of lines) {
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]) - 1;
            const yearStr = dateMatch[3];
            const year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
            if (day > 0 && day <= 31 && month >= 0 && month < 12) {
                const d = new Date(year, month, day);
                if (!data.date) data.date = d;
            }
        }
    }

    // 5. Supplier Name (Sanitized for Suralis style)
    const blackList = /FACTURA|BOLETA|ELECTRONICA|RUT|GIRO|DIRECCION|EMISION|VENCIMIENTO|TOTAL|NETO|IVA|CHILE|ALAMEDA|AVENIDA|CLIENTE|DETALLE/i;

    const potentialLines = sanitizedText.split('\n')
        .slice(0, 10) // Wider look for utility bills
        .filter(l => l.length > 4 && !blackList.test(l) && !dateRegex.test(l) && !rutRegex.test(l));

    if (potentialLines.length > 0) {
        let name = potentialLines.find(l => /S\.A|LTDA|SPA|LIMITADA|AQUACHILE|SURALIS|SAESA/i.test(l)) || potentialLines[0];
        // Clean OCR noise like "e " or "a " at start
        name = name.replace(/^[eaEA]\s+/, '').trim();
        data.supplierName = name;
    } else {
        data.supplierName = rawLines.find(l => l.length > 5 && !blackList.test(l)) || "Proveedor Desconocido";
    }

    // 6. Items
    lines.forEach(line => {
        if (line.length > 10 && !blackList.test(line)) {
            const m = line.match(amountRegex);
            if (m) {
                const amt = cleanAmount(m[0]);
                if (amt > 0 && amt < (data.total || 9999999)) {
                    data.items.push({ name: line.replace(m[0], '').trim(), price: amt });
                }
            }
        }
    });

    return data;
}
