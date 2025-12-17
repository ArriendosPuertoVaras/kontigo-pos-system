import Tesseract from 'tesseract.js';

export async function scanInvoiceImage(imageFile: File): Promise<string> {
    try {
        const { data: { text } } = await Tesseract.recognize(
            imageFile,
            'eng', // Using English mostly for numbers/keywords, 'spa' is better but larger download
            { logger: m => console.log(m) }
        );
        return text;
    } catch (error) {
        console.error("OCR Error:", error);
        throw new Error("Failed to scan image");
    }
}
