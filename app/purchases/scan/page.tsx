'use client';
import { useState } from 'react';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Loader2, Sparkles, AlertTriangle, FileText, Check, ShoppingCart, Store } from 'lucide-react';
import { scanInvoiceImage } from '@/lib/ai/scanner';
import { parseInvoiceText, ExtractedData } from '@/lib/ai/parser';
import Header from '@/components/Header';
import { KontigoFinance } from '@/lib/accounting';
import { syncService } from '@/lib/sync_service';

export default function ScanPage() {
    const router = useRouter();
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
    const [result, setResult] = useState<ExtractedData | null>(null);
    const [rawText, setRawText] = useState("");

    const handleSave = async () => {
        if (!result || !result.supplierName || !result.total) {
            toast.error("Faltan datos críticos para guardar.");
            return;
        }

        setIsSaving(true);
        try {
            await db.transaction('rw', db.suppliers, db.purchaseOrders, db.journalEntries, db.accounts, async () => {
                // 1. Find or Create Supplier
                let supplier = await db.suppliers.where('name').equalsIgnoreCase(result.supplierName!.trim()).first();

                if (!supplier) {
                    const newId = await db.suppliers.add({
                        name: result.supplierName!.trim(),
                        rut: result.rut, // Persist RUT
                        category: 'General',
                        contactName: '',
                        email: '',
                        phone: '',
                        leadTimeDays: 1
                    });
                    supplier = await db.suppliers.get(newId as number);
                    toast.info(`Nuevo proveedor creado: ${result.supplierName}`);
                    syncService.autoSync(db.suppliers, 'suppliers').catch(console.error);
                } else if (!supplier.rut && result.rut) {
                    // Update RUT if missing in existing supplier
                    await db.suppliers.update(supplier.id!, { rut: result.rut });
                    syncService.autoSync(db.suppliers, 'suppliers').catch(console.error);
                }

                // 2. Create Purchase Order (Implicitly Received)
                await db.purchaseOrders.add({
                    supplierId: supplier!.id!,
                    date: result.date || new Date(),
                    dueDate: result.dueDate,
                    status: 'Received',
                    paymentStatus: paymentStatus,
                    totalCost: result.total!,
                    items: result.items.map(it => ({
                        ingredientId: 0, // Generic/AI Item placeholder
                        quantity: 1,
                        unitCost: it.price || 0,
                        purchaseUnit: 'un'
                    }))
                });

                // 3. Record in Accounting
                await KontigoFinance.recordPurchase(supplier!.name, result.total!, false, paymentStatus === 'Paid'); // false = expense, not asset by default for rapid scan

                // 4. Syc
                syncService.autoSync(db.purchaseOrders, 'purchase_orders').catch(console.error);
                syncService.autoSync(db.journalEntries, 'journal_entries').catch(console.error);
            });

            toast.success("Gasto registrado y proveedor guardado.");
            router.push('/purchases');
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar el registro.");
        } finally {
            setIsSaving(false);
        }
    };

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
                            {/* Supplier Section */}
                            <div className="bg-white/5 p-3 md:p-4 rounded-lg border border-toast-orange/20 space-y-3">
                                <div>
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-toast-orange mb-1">Empresa / Proveedor</p>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={result.supplierName || ''}
                                            onChange={(e) => setResult({ ...result, supplierName: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-toast-orange outline-none transition-all"
                                            placeholder="Nombre de la empresa..."
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 opacity-50 group-focus-within:opacity-0 pointer-events-none">
                                            <Store className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400 mb-1">RUT Empresa</p>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={result.rut || ''}
                                            onChange={(e) => setResult({ ...result, rut: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-toast-orange outline-none transition-all"
                                            placeholder="xx.xxx.xxx-x"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 opacity-50 pointer-events-none">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[9px] text-gray-500 italic">Se creará automáticamente si no existe.</p>
                            </div>

                            {/* Detailed Summary */}
                            <div className="grid grid-cols-2 gap-3 md:gap-4">
                                <div className="bg-white/5 p-3 md:p-4 rounded-lg border border-white/5">
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400 mb-1">Monto Neto</p>
                                    <input
                                        type="number"
                                        value={result.neto || 0}
                                        onChange={(e) => setResult({ ...result, neto: parseInt(e.target.value) })}
                                        className="w-full bg-transparent text-lg md:text-xl font-bold text-white outline-none focus:text-toast-orange"
                                    />
                                </div>
                                <div className="bg-white/5 p-3 md:p-4 rounded-lg border border-white/5">
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400 mb-1">IVA (19%)</p>
                                    <input
                                        type="number"
                                        value={result.iva || 0}
                                        onChange={(e) => setResult({ ...result, iva: parseInt(e.target.value) })}
                                        className="w-full bg-transparent text-lg md:text-xl font-bold text-white outline-none focus:text-toast-orange"
                                    />
                                </div>
                                <div className="bg-white/5 p-3 md:p-4 rounded-lg border border-white/5">
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400 mb-1">Fecha Emisión</p>
                                    <p className="text-lg md:text-xl font-bold text-white">{result.date ? result.date.toLocaleDateString() : '?'}</p>
                                </div>
                                <div className="bg-white/5 p-3 md:p-4 rounded-lg border border-toast-green/20 bg-toast-green/5">
                                    <p className="text-[10px] md:text-xs uppercase font-bold text-toast-green mb-1">TOTAL FINAL</p>
                                    <div className="flex items-center gap-1">
                                        <span className="text-toast-green font-bold">$</span>
                                        <input
                                            type="number"
                                            value={result.total || 0}
                                            onChange={(e) => setResult({ ...result, total: parseInt(e.target.value) })}
                                            className="w-full bg-transparent text-lg md:text-xl font-bold text-white outline-none focus:text-toast-green"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Payment Status Selector */}
                            <div className="bg-white/5 p-3 md:p-4 rounded-lg">
                                <p className="text-[10px] md:text-xs uppercase font-bold text-gray-400 mb-3">Estado del Pago</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setPaymentStatus('Paid')}
                                        className={`py-2 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border ${paymentStatus === 'Paid' ? 'bg-green-500/20 text-green-500 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'bg-black/20 text-gray-500 border-white/5 hover:border-white/10'}`}
                                    >
                                        <Check className={`w-4 h-4 ${paymentStatus === 'Paid' ? 'opacity-100' : 'opacity-0'}`} />
                                        Pagado
                                    </button>
                                    <button
                                        onClick={() => setPaymentStatus('Pending')}
                                        className={`py-2 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border ${paymentStatus === 'Pending' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'bg-black/20 text-gray-500 border-white/5 hover:border-white/10'}`}
                                    >
                                        <AlertTriangle className={`w-4 h-4 ${paymentStatus === 'Pending' ? 'opacity-100' : 'opacity-0'}`} />
                                        Por Pagar
                                    </button>
                                </div>

                                {paymentStatus === 'Pending' && (
                                    <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <label className="text-[10px] md:text-xs uppercase font-bold text-gray-400 mb-1 block">Fecha de Vencimiento</label>
                                        <input
                                            type="date"
                                            value={result.dueDate ? result.dueDate.toISOString().split('T')[0] : ''}
                                            onChange={(e) => {
                                                const newDate = e.target.value ? new Date(e.target.value) : undefined;
                                                setResult({ ...result, dueDate: newDate });
                                            }}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-toast-orange outline-none transition-all"
                                        />
                                        <p className="text-[9px] text-yellow-500/70 mt-1 italic flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Se generará una alerta si no se paga antes de esta fecha.
                                        </p>
                                    </div>
                                )}
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

                            {/* Action Button */}
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !result.supplierName || !result.total}
                                className="w-full bg-toast-green hover:bg-green-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-lg transition-all"
                            >
                                {isSaving ? (
                                    <><Loader2 className="animate-spin" /> Guardando...</>
                                ) : (
                                    <><Check className="w-6 h-6" /> Guardar Registro</>
                                )}
                            </button>

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
