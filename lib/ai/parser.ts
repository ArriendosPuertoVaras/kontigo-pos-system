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
 * Clean OCR noise and common misreads
 */
function preprocessOCR(text: string): string {
    return text
        .split('\n')
        .map(line => {
            // Remove isolated characters (noise) like "a s @ #"
            let cleaned = line.replace(/(^|\s)[^a-zA-Z0-9](\s|$)/g, ' ').trim();
            // Remove non-printable/weird symbols
            cleaned = cleaned.replace(/[^\w\s\$\.\,\-\:\/]/g, '');
            return cleaned;
        })
        .filter(line => line.length > 2) // Ignore very short noise lines
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
    const amountRegex = /(?:[\$]|(?:\s|^))(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/;

    const cleanAmount = (str: string) => {
        const num = str.replace(/[^\d]/g, '');
        return parseInt(num) || 0;
    };

    // 1. Detect RUT (Filter out obvious noise)
    for (const line of rawLines) {
        const match = line.match(rutRegex);
        if (match) {
            const val = match[0].replace(/\./g, '');
            // Simple sanity: RUTs in Chile usually don't start with too many zeros unless placeholder
            if (!val.startsWith('000') && !data.rut) {
                data.rut = match[0];
            }
        }
    }

    // 2. Identify Amounts with advanced heuristic
    let detectedTotal = 0;
    let detectedNeto = 0;
    let detectedIva = 0;
    let maxAmount = 0;

    for (const line of lines) {
        const upper = line.toUpperCase();
        const amounts = line.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
        const numericals = amounts.map(a => cleanAmount(a));

        if (numericals.length > 0) {
            const m = Math.max(...numericals);
            if (m > maxAmount) maxAmount = m;
        }

        const matches = line.match(amountRegex);
        const val = matches ? cleanAmount(matches[1]) : 0;

        if (val > 0) {
            if (upper.includes('TOTAL') || upper.includes('A PAGAR') || upper.includes('PAGADO') || upper.includes('FINAL')) {
                if (val > detectedTotal) detectedTotal = val;
            }
            if (upper.includes('NETO') || upper.includes('SUBTOTAL') || upper.includes('AFECTO') || upper.includes('MONTO NETO')) {
                if (val > detectedNeto) detectedNeto = val;
            }
            if (upper.includes('IVA') || upper.includes('I.V.A')) {
                if (val > detectedIva) detectedIva = val;
            }
        }

        // Folio & Customer
        if (upper.includes('FOLIO') || upper.includes('BOLETA N') || upper.includes('FACTURA N')) {
            const f = line.match(/(\d{4,})/);
            if (f && !data.folio) data.folio = f[1];
        }
        if (upper.includes('CLIENTE') || upper.includes('CTA') || upper.includes('NRO CTA')) {
            const c = line.match(/(\d{5,})/);
            if (c && !data.customerNumber) data.customerNumber = c[1];
        }
    }

    // 3. Mathematical Healing (The "Professional" Layer)
    // We prioritize patterns that make mathematical sense
    if (detectedNeto > 0 && detectedIva > 0) {
        const sum = detectedNeto + detectedIva;
        if (detectedTotal === 0 || Math.abs(detectedTotal - sum) > 5) {
            detectedTotal = sum;
        }
    } else if (detectedTotal > 0) {
        // If we only have Total, try to split it
        if (detectedNeto === 0) detectedNeto = Math.round(detectedTotal / 1.19);
        if (detectedIva === 0) detectedIva = detectedTotal - detectedNeto;
    } else if (maxAmount > 0) {
        // Fallback to largest number found
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

    // 5. Supplier Name (High Quality Heuristic)
    const blackList = /FACTURA|BOLETA|ELECTRONICA|RUT|GIRO|DIRECCION|EMISION|VENCIMIENTO|TOTAL|NETO|IVA|CONTADO|PAGO|CHILE|ALAMEDA|AVENIDA|PISO|CIUDAD|COMUNA|REGION|CLIENTE|DETALLE/i;

    // Look at first 8 lines specifically, after cleaning
    const potentialLines = sanitizedText.split('\n')
        .slice(0, 8)
        .filter(l => l.length > 4 && !blackList.test(l) && !dateRegex.test(l) && !rutRegex.test(l));

    if (potentialLines.length > 0) {
        // Prefer lines containing business suffixes
        const business = potentialLines.find(l => /S\.A|LTDA|SPA|LIMITADA| SOCIEDAD/i.test(l));
        data.supplierName = business || potentialLines[0];
    } else {
        // Extreme fallback: first line of raw text that isn't empty nor obviously noise
        data.supplierName = rawLines.find(l => l.length > 5 && !blackList.test(l)) || "Proveedor Desconocido";
    }

    // 6. Items
    lines.forEach(line => {
        if (line.length > 10 && !blackList.test(line)) {
            const m = line.match(amountRegex);
            if (m) {
                const amt = cleanAmount(m[1]);
                if (amt > 0 && amt < (data.total || 9999999)) {
                    data.items.push({ name: line.replace(m[0], '').trim(), price: amt });
                }
            }
        }
    });

    return data;
}
