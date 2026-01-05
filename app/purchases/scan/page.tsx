'use client';
import { useState } from 'react';
import { ArrowLeft, Camera, Loader2, Sparkles, AlertTriangle, FileText, Check } from 'lucide-react';
import Link from 'next/link';
import { scanInvoiceImage } from '@/lib/ai/scanner';
import { parseInvoiceText, ExtractedData } from '@/lib/ai/parser';
import Header from '@/components/Header';

export default function ScanPage() {
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [result, setResult] = useState<ExtractedData | null>(null);
    const [rawText, setRawText] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImage(file);
            setPreview(URL.createObjectURL(file));
            setResult(null);
            setRawText("");
        }
    };

    const handleScan = async () => {
        if (!image) return;
        setIsScanning(true);
        try {
            const text = await scanInvoiceImage(image);
            setRawText(text);
            const data = parseInvoiceText(text);
            setResult(data);
        } catch (error) {
            alert("Error al escanear imagen.");
        }
        setIsScanning(false);
    };

    return (
        <div className="flex flex-col h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative bg-[#2a2a2a]">

            <Header title="Escáner IA de Facturas" backHref="/purchases" />

            <main className="flex-1 p-4 md:p-10 overflow-y-auto w-full flex flex-col md:flex-row gap-4 md:gap-8">

                {/* LEFT: UPLOAD */}
                <div className="flex-1 flex flex-col gap-4 md:gap-6 min-h-[300px]">
                    <div className="flex-1 border-2 border-dashed border-white/10 rounded-2xl bg-toast-charcoal flex flex-col items-center justify-center p-6 md:p-8 relative overflow-hidden">
                        {preview ? (
                            <img src={preview} alt="Invoice" className="max-h-full object-contain z-10" />
                        ) : (
                            <div className="text-center text-gray-500 z-10">
                                <Camera className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-50" />
                                <p className="text-base md:text-lg font-bold">Sube una foto de tu factura/boleta</p>
                                <p className="text-xs md:text-sm">JPG o PNG</p>
                            </div>
                        )}

                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer z-20"
                        />
                    </div>

                    <button
                        onClick={handleScan}
                        disabled={!image || isScanning}
                        className="bg-toast-orange disabled:opacity-50 hover:brightness-110 text-white font-bold py-3 md:py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-lg md:text-xl transition-all"
                    >
                        {isScanning ? (
                            <><Loader2 className="animate-spin" /> Analizando...</>
                        ) : (
                            <><Sparkles className="fill-current" /> Escanear con IA</>
                        )}
                    </button>

                    <div className="text-[10px] md:text-xs text-gray-500 text-center">
                        Powered by Tesseract OCR (Local Browser Mode)
                    </div>
                </div>

                {/* RIGHT: RESULTS */}
                <div className="flex-1 bg-toast-charcoal rounded-2xl border border-white/5 p-6 md:p-8 flex flex-col min-h-[400px]">
                    <h2 className="text-base md:text-lg font-bold text-white mb-4 md:mb-6 border-b border-white/5 pb-4">Datos Detectados</h2>

                    {!result && !isScanning && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 opacity-50 py-10">
                            <FileText className="w-10 h-10 md:w-12 md:h-12 mb-2" />
                            <p className="text-sm md:text-base">Los resultados aparecerán aquí</p>
                        </div>
                    )}

                    {isScanning && (
                        <div className="flex-1 flex flex-col items-center justify-center text-toast-orange gap-4 py-10">
                            <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-toast-orange border-t-transparent rounded-full animate-spin"></div>
                            <p className="animate-pulse font-bold text-sm md:text-base">Leyendo texto...</p>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Summary */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                                <div className="bg-white/5 p-3 md:p-4 rounded-lg">
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400">Fecha</p>
                                    <p className="text-lg md:text-xl font-bold text-white">{result.date ? result.date.toLocaleDateString() : '?'}</p>
                                </div>
                                <div className="bg-white/5 p-3 md:p-4 rounded-lg">
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400">Total Detectado</p>
                                    <p className="text-lg md:text-xl font-bold text-green-400">{result.total ? `$${result.total}` : '?'}</p>
                                </div>
                            </div>

                            {/* Items */}
                            <div className="flex-1 overflow-y-auto border border-white/5 rounded-lg bg-black/20 p-2 max-h-[300px] md:max-h-[400px]">
                                <p className="text-[10px] text-gray-500 mb-2 px-2">Items Sugeridos:</p>
                                {result.items.length === 0 ? (
                                    <p className="text-xs md:text-sm text-gray-500 p-4">No se detectaron items claros.</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {result.items.map((item, i) => (
                                            <li key={i} className="flex justify-between items-center p-2 hover:bg-white/5 rounded group cursor-pointer">
                                                <span className="text-xs md:text-sm text-gray-300">{item.name}</span>
                                                <button className="text-[10px] md:text-xs bg-toast-orange/20 text-toast-orange px-2 py-1 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity font-bold">
                                                    Agregar
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Raw Text Toggle (Debug) */}
                            <details className="text-[9px] md:text-xs text-gray-500">
                                <summary className="cursor-pointer hover:text-white">Ver Texto Crudo (Debug)</summary>
                                <pre className="mt-2 p-2 bg-black rounded overflow-x-auto whitespace-pre-wrap max-h-32 md:max-h-40">
                                    {rawText}
                                </pre>
                            </details>
                        </div>
                    )}
                </div>

            </main>

        </div>
    );
}
