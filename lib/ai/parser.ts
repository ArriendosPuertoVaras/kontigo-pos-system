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

    // 1. EXTRACT ALL POTENTIAL AMOUNTS
    // Match anything that looks like a CLP price: 27.193, 27193, 27.193,00
    const allNumbersMatch = text.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
    const cleanAmount = (str: string) => parseInt(str.replace(/[^\d]/g, '')) || 0;
    const candidates = Array.from(new Set(allNumbersMatch.map(cleanAmount)))
        .filter(n => n > 500) // Filter out noise (page numbers, small fees)
        .sort((a, b) => b - a); // Largest first

    // 2. MATHEMATICAL HARMONY ENGINE (V6)
    // Goal: Find Neto + IVA = Total where IVA is ~19% of Neto
    let foundA = 0, foundB = 0, foundC = 0;
    let harmonyFound = false;

    // Try to find the trio in the candidates
    for (let i = 0; i < candidates.length; i++) {
        const total = candidates[i];
        for (let j = i + 1; j < candidates.length; j++) {
            const neto = candidates[j];
            for (let k = j + 1; k < candidates.length; k++) {
                const iva = candidates[k];

                // Test Ratio: Neto + IVA = Total
                if (Math.abs((neto + iva) - total) < 10) {
                    // Test Tax: IVA is ~19% of Neto
                    const expectedIva = Math.round(neto * 0.19);
                    if (Math.abs(iva - expectedIva) < Math.max(50, neto * 0.02)) {
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

    // 3. KEYWORD FALLBACK (If harmony fails)
    if (!harmonyFound) {
        for (const line of lines) {
            const upper = line.toUpperCase();
            const amounts = line.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/g) || [];
            if (amounts.length > 0) {
                const val = cleanAmount(amounts[amounts.length - 1]);
                if (upper.includes('TOTAL') || upper.includes('PAGAR')) {
                    if (val > (data.total || 0)) data.total = val;
                } else if (upper.includes('NETO') || upper.includes('AFECTO')) {
                    if (val > (data.neto || 0)) data.neto = val;
                } else if (upper.includes('IVA')) {
                    if (val > (data.iva || 0)) data.iva = val;
                }
            }
        }
        // Force calculation if partial found
        if (data.total && (!data.neto || !data.iva)) {
            data.neto = Math.round(data.total / 1.19);
            data.iva = data.total - data.neto;
        }
    }

    // 4. RUT AND IDENTIFIERS
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

    // 5. FOLIO AND CUSTOMER (Utility Specialized)
    for (const line of rawLines) {
        const upper = line.toUpperCase();

        // CUSTOMER NUMBER (Look for SERVICE/CLIENTE/CTA and then a number)
        if (upper.includes('SERVICIO') || upper.includes('CLIENTE') || upper.includes('CTA')) {
            const clientMatch = line.match(/(?:SERVICIO|CLIENTE|CTA)[^\d]*(\d{5,})/i);
            if (clientMatch && !data.customerNumber) {
                data.customerNumber = clientMatch[1];
            }
        }

        // FOLIO (Look for numeric strings of 7-10 digits usually at top or near Boleta label)
        if (upper.includes('BOLETA') || upper.includes('FACTURA') || upper.includes('ELECTRONICA') || upper.includes('N°')) {
            const folioMatch = line.match(/(?:N|FOLIO|BOLETA|FACTURA)[^\d]*(\d{4,})/i);
            if (folioMatch) {
                const num = folioMatch[1];
                if (num !== data.customerNumber && !data.folio) {
                    data.folio = num;
                }
            }
        }
    }

    // 6. SUPPLIER NAME
    const blackList = /FACTURA|BOLETA|ELECTRONICA|RUT|GIRO|DIRECCION|EMISION|VENCIMIENTO|TOTAL|NETO|IVA|CLIENTE|DETALLE/i;
    const potentialLines = cleanedText.split('\n').slice(0, 10).filter(l =>
        l.length > 5 && !blackList.test(l) && !rutRegex.test(l) && !/\d{5,}/.test(l)
    );

    if (potentialLines.length > 0) {
        let name = potentialLines.find(l => /S\.A|LTDA|SPA|LIMITADA|SURALIS|SAESA|AGUAS/i.test(l)) || potentialLines[0];
        // Clean prefixes and messy suffixes
        name = name.replace(/^[OEA]\s+/, '') // Logo noise
            .replace(/\.\s+[a-z]$/i, '') // Ending noise
            .replace(/\s+[iI]$/, '')    // Ending "i" noise
            .trim();
        data.supplierName = name;
    } else {
        data.supplierName = "Proveedor Desconocido";
    }

    // 7. DATES
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    for (const line of lines) {
        const match = line.match(dateRegex);
        if (match) {
            const d = new Date(parseInt(match[3].length === 2 ? '20' + match[3] : match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            if (!isNaN(d.getTime()) && !data.date) data.date = d;
        }
    }

    return data;
}
