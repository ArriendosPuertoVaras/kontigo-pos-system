export interface ExtractedData {
    date?: Date;
    total?: number;
    items: { name: string; price?: number }[];
}

export function parseInvoiceText(text: string): ExtractedData {
    const lines = text.split('\n');
    const data: ExtractedData = { items: [] };

    // Regex Utils
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const priceRegex = /\$?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/;

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        // 1. Detect Date
        if (!data.date) {
            const dateMatch = cleanLine.match(dateRegex);
            if (dateMatch) {
                // Simplified Date Parser (Assuming DD/MM/YYYY)
                const day = parseInt(dateMatch[1]);
                const month = parseInt(dateMatch[2]) - 1;
                const year = dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3]);
                data.date = new Date(year, month, day);
            }
        }

        // 2. Detect Total
        // Look for keywords "TOTAL", "SUMA"
        if (cleanLine.toUpperCase().includes('TOTAL') || cleanLine.toUpperCase().includes('SUMA')) {
            const priceMatch = cleanLine.match(priceRegex);
            if (priceMatch) {
                // Remove dots/commas for parsing (CLP usually ignores cents or uses comma)
                // This is a naive heuristic for demo
                const rawNum = priceMatch[1].replace(/[.,]/g, '');
                data.total = parseInt(rawNum);
            }
        }

        // 3. Detect Items (Heuristic: Text followed by Price)
        // Ignoring short lines, dates, or totals
        const isKeyword = /TOTAL|SUBTOTAL|FECHA|DATE|IVA|NETO/i.test(cleanLine);
        if (!isKeyword && cleanLine.length > 5) {
            const priceMatch = cleanLine.match(priceRegex);
            if (priceMatch) {
                // Split Name and Price
                const priceStr = priceMatch[0];
                const name = cleanLine.replace(priceStr, '').trim();

                // Naive clean
                if (name.length > 3 && !/\d/.test(name)) { // Assume items don't have many digits in name
                    data.items.push({ name });
                }
            }
        }
    }

    return data;
}
