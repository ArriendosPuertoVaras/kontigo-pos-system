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

    // Regex Utils - ELASTIC RUT (v5)
    // Matches: 12.345.678-9, 12345678-9, 12 345 678 - 9, etc.
    const rutRegex = /(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\-]*[\dkK])/;
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const amountRegex = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/;

    const cleanAmount = (str: string) => {
        const num = str.replace(/[^\d]/g, '');
        return parseInt(num) || 0;
    };

    // 1. Detect RUT (Filter out placeholders and suspicious noise)
    for (const line of rawLines) {
        const match = line.match(rutRegex);
        if (match) {
            let val = match[0].replace(/[\.\s\-]/g, '');
            // Sanity: RUTs in Chile are 7-9 digits + 1 verificador. 
            // Also ignore obvious noise like "000000"
            if (val.length >= 8 && !val.startsWith('000') && !data.rut) {
                data.rut = match[0].trim();
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
        const amounts = line.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
        const numericals = amounts.map(a => cleanAmount(a));

        if (numericals.length > 0) {
            const m = Math.max(...numericals);
            if (m > maxAmount) maxAmount = m;
        }

        const matches = line.match(amountRegex);
        const val = matches ? cleanAmount(matches[0]) : 0;

        if (val > 0) {
            if (upper.includes('TOTAL') || upper.includes('A PAGAR') || upper.includes('VALOR TOTAL') || upper.includes('PAGADO')) {
                if (val > detectedTotal) detectedTotal = val;
            }
            if (upper.includes('NETO') || upper.includes('AFECTO') || upper.includes('SUBTOTAL')) {
                if (detectedTotal === 0 || val < detectedTotal) {
                    if (val > detectedNeto) detectedNeto = val;
                }
            }
            if (upper.includes('IVA') || upper.includes('I.V.A')) {
                if (val > detectedIva) detectedIva = val;
            }
        }

        // --- ENHANCED SERVICE FIELDS V5 ---

        // CUSTOMER NUMBER (Priority for Service Bills)
        if (upper.includes('SERVICIO') || upper.includes('CTA') || upper.includes('CUENTA') || upper.includes('CLIENTE')) {
            const clientMatch = line.match(/(?:SERVICIO|CTA|CUENTA|CLIENTE)[^\d]*(\d{5,})/i);
            if (clientMatch && !data.customerNumber) {
                data.customerNumber = clientMatch[1];
            }
        }

        // FOLIO / BOLETA (Priority for explicit document tags)
        if (upper.includes('N°') || upper.includes('NUMERO') || upper.includes('FOLIO') || upper.includes('BOLETA') || upper.includes('FACTURA')) {
            const folioMatch = line.match(/(?:BOLETA|FACTURA|DETALLE|N°)[^\d]*(\d{4,})/i);
            if (folioMatch) {
                const found = folioMatch[1];
                // HEURISTIC: If we already found a customer number and this matches it, 
                // look for a DIFFERENT number for the folio. 
                // Usually Boleta numbers are 7-10 digits in Chile.
                if (!data.folio && found !== data.customerNumber) {
                    if (!dateRegex.test(line)) data.folio = found;
                }
            }
        }
    }

    // 3. Mathematical Healing
    const expectedIvaFromNeto = Math.round(detectedNeto * 0.19);
    const isIvaValid = detectedNeto > 0 && Math.abs(detectedIva - expectedIvaFromNeto) < 50;

    if (isIvaValid) {
        detectedTotal = detectedNeto + detectedIva;
    } else if (detectedTotal > 0) {
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

    // 5. Supplier Name (Advanced Cleaner V5)
    const blackList = /FACTURA|BOLETA|ELECTRONICA|RUT|GIRO|DIRECCION|EMISION|VENCIMIENTO|TOTAL|NETO|IVA|CHILE|ALAMEDA|AVENIDA|CLIENTE|DETALLE/i;
    const potentialLines = sanitizedText.split('\n')
        .slice(0, 10)
        .filter(l => l.length > 4 && !blackList.test(l) && !dateRegex.test(l) && !rutRegex.test(l));

    if (potentialLines.length > 0) {
        let name = potentialLines.find(l => /S\.A|LTDA|SPA|LIMITADA|SURALIS|SAESA|AGUAS/i.test(l)) || potentialLines[0];
        // Clean multi-character noise prefixes (O, E, A, S, etc. followed by space)
        name = name.replace(/^[a-zA-Z]\s+/, '').trim();
        data.supplierName = name;
    } else {
        data.supplierName = "Proveedor Desconocido";
    }

    return data;
}
