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
 * Advanced OCR Pre-processor
 */
function cleanOCR(text: string): string {
    return text.split('\n')
        .map(line => line.trim())
        .filter(l => l.length > 2)
        .join('\n');
}

export function parseInvoiceText(text: string): ExtractedData {
    const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const cleanedText = cleanOCR(text);
    const lines = cleanedText.split('\n');

    const data: ExtractedData = { items: [] };

    const cleanAmount = (str: string) => parseInt(str.replace(/[^\d]/g, '')) || 0;

    // 1. EXTRACT ALL POTENTIAL AMOUNTS
    const allNumbersMatch = text.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
    const candidates = Array.from(new Set(allNumbersMatch.map(cleanAmount)))
        .filter(n => n > 100)
        .sort((a, b) => b - a);

    // 2. FUZZY MATHEMATICAL HARMONY ENGINE (V7)
    // Goal: Find Neto + IVA ≈ Total (with Chilean rounding tolerance)
    let foundA = 0, foundB = 0, foundC = 0;
    let harmonyFound = false;

    for (let i = 0; i < candidates.length; i++) {
        const total = candidates[i];
        for (let j = i + 1; j < candidates.length; j++) {
            const neto = candidates[j];
            for (let k = j + 1; k < candidates.length; k++) {
                const iva = candidates[k];

                const sum = neto + iva;
                // Chilean Rounding Law allows up to 5-10 pesos, but utility bills have small fees.
                // We use a 50 CLP tolerance.
                if (Math.abs(sum - total) < 50) {
                    const expectedIva = Math.round(neto * 0.19);
                    if (Math.abs(iva - expectedIva) < Math.max(100, neto * 0.05)) {
                        foundA = neto; foundB = iva; foundC = total;
                        harmonyFound = true;
                        break;
                    }
                }
            }
            if (harmonyFound) break;
        }
        if (harmonyFound) break;
    }

    if (harmonyFound) {
        data.neto = foundA;
        data.iva = foundB;
        data.total = foundC;
    }

    // 3. IDENTIFIERS (RUT, FOLIO, CLIENT)
    const rutRegex = /(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\-]*[\dkK])/;
    for (const line of rawLines) {
        const match = line.match(rutRegex);
        if (match) {
            const val = match[0].replace(/[^\dkK]/g, '');
            if (val.length >= 8 && !val.startsWith('000') && !data.rut) {
                data.rut = match[0].trim().replace(/\s+/g, '');
            }
        }
    }

    for (const line of rawLines) {
        const upper = line.toUpperCase();

        // CUSTOMER NUMBER (Service accounts)
        if (upper.includes('SERVICIO') || upper.includes('CLIENTE') || upper.includes('CUENTA') || upper.includes('CTA')) {
            const clientMatch = line.match(/(?:SERVICIO|CLIENTE|CTA|CTA)[^\d]*(\d{5,})/i);
            if (clientMatch && !data.customerNumber) {
                data.customerNumber = clientMatch[1];
            }
        }

        // FOLIO / BOLETA (Suralis specific format support)
        // Matches "BOLETA ELECTRONICA N 00384729" or "DOC N 12345"
        if (upper.includes('BOLETA') || upper.includes('FACTURA') || upper.includes('N°') || upper.includes('FOLIO')) {
            const folioMatch = line.match(/(?:N|FOLIO|BOLETA|FACTURA)[^\d]*(\d{4,})/i);
            if (folioMatch) {
                const num = folioMatch[1];
                // Avoid using customer number as folio if possible
                if (num !== data.customerNumber && !data.folio) {
                    // Ignore placeholders like 000
                    if (!num.startsWith('000') || num.length > 5) {
                        data.folio = num;
                    }
                }
            }
        }
    }

    // 4. SUPPLIER NAME (Fuzzy Cleaning V7)
    const blackList = /FACTURA|BOLETA|ELECTRONICA|RUT|GIRO|DIRECCION|EMISION|VENCIMIENTO|TOTAL|NETO|IVA|CLIENTE|DETALLE/i;
    const potentialLines = cleanedText.split('\n').slice(0, 10).filter(l =>
        l.length > 5 && !blackList.test(l) && !rutRegex.test(l) && !/\d{5,}/.test(l)
    );

    if (potentialLines.length > 0) {
        let name = potentialLines.find(l => /S\.A|LTDA|SPA|LIMITADA|SURALIS|SAESA/i.test(l)) || potentialLines[0];
        // Professional Sanitization
        name = name.replace(/^[OEA]\s+/, '') // Remove logo noise
            .replace(/S\.A\..*$/i, 'S.A.') // Cleanup messy S.A.
            .replace(/S\.A\s+[a-z]$/i, 'S.A.')
            .replace(/\s+/g, ' ')
            .trim();
        data.supplierName = name;
    }

    // 5. DATES (Issue vs Due Date Support)
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const extractedDates: { date: Date, line: string }[] = [];

    for (const line of rawLines) {
        const match = line.match(dateRegex);
        if (match) {
            const d = new Date(parseInt(match[3].length === 2 ? '20' + match[3] : match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            if (!isNaN(d.getTime())) {
                extractedDates.push({ date: d, line: line.toUpperCase() });
            }
        }
    }

    if (extractedDates.length > 0) {
        // Find Emission Date (Fecha de Emisión)
        const issueDate = extractedDates.find(ed => ed.line.includes('EMISION') || (ed.line.includes('FECHA') && !ed.line.includes('VENCE')));
        data.date = issueDate ? issueDate.date : extractedDates[0].date;

        // Find Due Date (Fecha de Vencimiento)
        const dueDate = extractedDates.find(ed => ed.line.includes('VENCE') || ed.line.includes('VENCIMIENTO') || ed.line.includes('LIMITE'));
        if (dueDate) data.dueDate = dueDate.date;
    }

    // FINAL FALLBACK: If harmony failed but we have candidates, use best guess
    if (!data.total && candidates.length > 0) {
        data.total = candidates[0];
        data.neto = Math.round(data.total / 1.19);
        data.iva = data.total - data.neto;
    }

    return data;
}
