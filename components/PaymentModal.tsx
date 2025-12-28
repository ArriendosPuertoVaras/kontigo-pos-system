'use client';
import { useState, useEffect } from 'react';
import { db, Order, Payment } from '@/lib/db';
import { KontigoFinance } from '@/lib/accounting'; // Import Nexus
import { generateDTE } from '@/lib/dte_mock';
import { openCashDrawer } from '@/lib/printing';
import { toast } from 'sonner';
import { syncService } from '@/lib/sync_service';
import { X, CreditCard, Banknote, Smartphone, Receipt, Users, CheckCircle2, AlertCircle, FileText, Building2 } from 'lucide-react';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
    onPaymentSuccess: () => void; // Triggered after a payment is made (to refresh UI)
}

function formatPrice(amount: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
}

import { useLiveQuery } from 'dexie-react-hooks';

export default function PaymentModal({ isOpen, onClose, order, onPaymentSuccess }: PaymentModalProps) {
    if (!isOpen || !order) return null;

    // SECURITY: Live Check for Open Session
    const activeSession = useLiveQuery(() => db.dailyCloses.where('status').equals('open').first());

    // Derived State from Order
    // Calculate total paid and tips from existing payments
    const payments = order.payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalTipsCollected = payments.reduce((sum, p) => sum + p.tip, 0);
    const remainingBalance = Math.max(0, order.total - totalPaid);

    // Form State
    const [amountToPay, setAmountToPay] = useState<number>(remainingBalance);
    const [tipType, setTipType] = useState<'0%' | '10%' | '15%' | 'manual'>('10%');
    const [manualTip, setManualTip] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('card');
    const [isProcessing, setIsProcessing] = useState(false);

    // Fiscal Data State
    const [documentType, setDocumentType] = useState<'boleta' | 'factura'>('boleta');
    const [rut, setRut] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [businessAddress, setBusinessAddress] = useState('');

    // Item Selection State (for "Pay my items")
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);

    const toggleItemSelection = (index: number, price: number) => {
        const newIndices = selectedItemIndices.includes(index)
            ? selectedItemIndices.filter(i => i !== index)
            : [...selectedItemIndices, index];

        setSelectedItemIndices(newIndices);

        // Calculate total of selected items
        if (newIndices.length > 0) {
            // Need to recalculate sum based on indices
            const sum = newIndices.reduce((acc, idx) => {
                const item = order.items[idx];
                const itemPrice = (item.product.price + (item.selectedModifiers?.reduce((a, b) => a + b.price, 0) || 0)) * item.quantity;
                return acc + itemPrice;
            }, 0);
            setAmountToPay(sum);
        } else {
            setAmountToPay(0);
        }
    };

    // Initial sync
    useEffect(() => {
        if (isOpen) {
            // Recalculate remaining just in case
            const paid = (order.payments || []).reduce((s, p) => s + p.amount, 0);
            setAmountToPay(Math.max(0, order.total - paid));
            setTipType('10%');
            setDocumentType('boleta'); // Reset to default
        }
    }, [isOpen, order]);

    const calculateTipAmount = () => {
        if (tipType === 'manual') return manualTip;
        if (tipType === '0%') return 0;
        const pct = parseInt(tipType.replace('%', ''));
        return Math.round(amountToPay * (pct / 100));
    };

    const tipAmount = calculateTipAmount();
    const totalCharge = amountToPay + tipAmount;

    const handleSplit = (parts: number) => {
        const share = Math.round(remainingBalance / parts);
        setAmountToPay(share);
    };

    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handlePayment = async () => {
        setErrorMessage(null); // Clear previous errors

        // SECURITY CHECK: ACTIVE CASH SESSION (FINAL GATE)
        const activeSession = await db.dailyCloses.where('status').equals('open').first();

        // DEBUG: Force user to see what the system sees
        console.log("DEBUG CHECK:", activeSession);

        if (!activeSession) {
            setErrorMessage("⛔ ACCESO DENEGADO: Caja Cerrada. Realiza la Apertura de Caja primero.");
            return;
        }

        if (!amountToPay || isNaN(amountToPay) || amountToPay <= 0) {
            setErrorMessage("El monto a pagar no es válido.");
            return;
        }

        if (documentType === 'factura') {
            if (!rut || !businessName) {
                setErrorMessage("Para Factura, el RUT y Razón Social son obligatorios.");
                return;
            }
        }

        setIsProcessing(true);

        try {
            const newPayment: Payment = {
                id: crypto.randomUUID(),
                amount: amountToPay,
                tip: tipAmount,
                method: paymentMethod,
                createdAt: new Date()
            };

            const updatedPayments = [...(order.payments || []), newPayment];

            // Recalculate Totals based on this NEW reality
            const newTotalPaid = totalPaid + amountToPay;
            const newTotalTips = totalTipsCollected + tipAmount;

            // Check if fully paid (Exact match or overpayment handling)
            // We use a small epsilon for float safety, though we work with integers usually on CLP
            const isFullyPaid = newTotalPaid >= order.total;

            await db.transaction('rw', [db.orders, db.dtes, db.printers, db.accounts, db.journalEntries], async () => {
                // 1. Update DB
                await db.orders.update(order.id!, {
                    payments: updatedPayments,
                    tip: newTotalTips,
                    status: isFullyPaid ? 'paid' : order.status,
                    closedAt: isFullyPaid ? new Date() : undefined,
                });

                // 2. Generate Fiscal Document (Mock Logic)
                // Only generate IF paying something meaningful and it's not just a tip
                if (amountToPay > 0) {
                    await generateDTE(order, documentType, documentType === 'factura' ? {
                        rut, name: businessName, address: businessAddress
                    } : undefined);
                }

                // 3. Kick Cash Drawer (NEW)
                if (paymentMethod === 'cash' && amountToPay > 0) {
                    await openCashDrawer();
                }

                // 4. FINANCIAL NEXUS (Auto-Accounting)
                // Register the sale immediately
                await KontigoFinance.registerSale(newPayment, documentType === 'factura');
            });

            // 3. Trigger External Success Handler
            if (onPaymentSuccess) {
                try {
                    onPaymentSuccess();
                } catch (e) {
                    console.warn("UI refresh after payment encountered minor issue:", e);
                }
            }

            // 4. Handle UI State
            if (!isFullyPaid) {
                // Prepare for next payment
                const nextRemaining = Math.max(0, order.total - newTotalPaid);
                setAmountToPay(nextRemaining);
                setTipType('10%');
                setManualTip(0);
                setIsSelectionMode(false);
                setSelectedItemIndices([]);
                // Do NOT close modal
            } else {
                // Fully Paid -> Close
                // 5. UPDATE INVENTORY VALUATION (Async)
                KontigoFinance.recalculateInventoryValuation().catch(console.error);

                // 6. AUTO-SYNC (Cloud) - Fire and Forget
                if (navigator.onLine) {
                    console.log("🦁 Nexus: Auto-Syncing Sale to Cloud...");
                    syncService.autoSync(db.orders, 'orders').catch(console.error);
                    // Also sync finance since we just touched it
                    syncService.autoSync(db.journalEntries, 'journal_entries').catch(console.error);
                    syncService.autoSync(db.accounts, 'accounts').catch(console.error);
                }

                const methodFormatted = paymentMethod === 'cash' ? 'efectivo' : paymentMethod === 'card' ? 'tarjeta' : 'transferencia';
                toast.success(`Pago con ${methodFormatted} registrado!`);
                onClose();
            }

        } catch (error) {
            console.error("Payment Processing Error:", error);
            setErrorMessage("Error al procesar el pago o generar DTE. Intente nuevamente.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1e1e1e] rounded-2xl border border-white/10 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-auto max-h-[90vh]">

                {/* LEFT: PAYMENT INPUT */}
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    <button onClick={onClose} className="absolute top-2 right-2 p-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-full transition-all z-50">
                        <X className="w-4 h-4" />
                    </button>

                    <div className="p-4 pb-0 flex-none">
                        <h2 className="text-lg font-bold text-white mb-0.5">Registrar Pago</h2>
                        <p className="text-gray-400 text-xs">Selecciona el monto y método</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-3 min-h-0 scrollbar-hide">

                        {/* Amount Input Section */}
                        <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-2">
                            <div className="flex justify-between items-end mb-1">
                                <label className="text-[10px] font-bold text-toast-orange uppercase tracking-wider">Monto a Pagar</label>
                                <span className="text-[10px] text-gray-400">Saldo: {formatPrice(remainingBalance)}</span>
                            </div>

                            {/* MODE SWITCHER: Amount vs items */}
                            <div className="flex gap-2 mb-2">
                                <button
                                    onClick={() => { setIsSelectionMode(false); setAmountToPay(remainingBalance); }}
                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase ${!isSelectionMode ? 'bg-toast-orange text-white' : 'bg-[#3a3a3a] text-gray-400'}`}>
                                    Monto Manual
                                </button>
                                <button
                                    onClick={() => { setIsSelectionMode(true); setAmountToPay(0); setSelectedItemIndices([]); }}
                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase ${isSelectionMode ? 'bg-toast-orange text-white' : 'bg-[#3a3a3a] text-gray-400'}`}>
                                    Seleccionar Items
                                </button>
                            </div>

                            {isSelectionMode ? (
                                <div className="bg-[#2a2a2a] rounded-lg border border-white/10 max-h-[120px] overflow-y-auto p-2 space-y-1">
                                    <p className="text-[10px] text-gray-400 mb-2 px-1">Selecciona productos a pagar:</p>
                                    {order.items.map((item, idx) => {
                                        const price = (item.product.price + (item.selectedModifiers?.reduce((a, b: any) => a + b.price, 0) || 0)) * item.quantity;
                                        const isSelected = selectedItemIndices.includes(idx);
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => toggleItemSelection(idx, price)}
                                                className={`flex justify-between items-center p-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-toast-orange/20 border border-toast-orange text-white' : 'hover:bg-white/5 text-gray-400 border border-transparent'}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${isSelected ? 'border-toast-orange bg-toast-orange' : 'border-gray-500'}`}>
                                                        {isSelected && <CheckCircle2 className="w-2 h-2 text-white" />}
                                                    </div>
                                                    <span className="text-[10px] font-bold">{item.quantity}x {item.product.name}</span>
                                                </div>
                                                <span className="text-[10px]">{formatPrice(price)}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="flex gap-4 items-center">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-500">$</span>
                                        <input
                                            type="number"
                                            value={amountToPay}
                                            onChange={(e) => setAmountToPay(parseInt(e.target.value) || 0)}
                                            className="w-full bg-[#2a2a2a] text-white text-xl font-bold py-1.5 pl-8 pr-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-toast-orange border border-white/10"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Quick Split Buttons */}
                            {!isSelectionMode && remainingBalance > 0 && (
                                <div className="flex gap-1.5 overflow-x-auto pb-1">
                                    <button onClick={() => setAmountToPay(remainingBalance)} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-[10px] text-gray-300 font-bold whitespace-nowrap">
                                        Total Restante
                                    </button>
                                    <button onClick={() => handleSplit(2)} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-[10px] text-gray-300 font-bold flex items-center gap-1">
                                        <Users className="w-3 h-3" /> 1/2
                                    </button>
                                    <button onClick={() => handleSplit(3)} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-[10px] text-gray-300 font-bold flex items-center gap-1">
                                        <Users className="w-3 h-3" /> 1/3
                                    </button>
                                    <button onClick={() => handleSplit(4)} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-[10px] text-gray-300 font-bold flex items-center gap-1">
                                        <Users className="w-3 h-3" /> 1/4
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* NEW: Fiscal Data Section */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Documento Tributario</label>
                            <div className="flex bg-[#2a2a2a] rounded-lg p-0.5 border border-white/10">
                                <button
                                    onClick={() => setDocumentType('boleta')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-bold text-xs transition-all ${documentType === 'boleta' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Receipt className="w-3 h-3" /> Boleta
                                </button>
                                <button
                                    onClick={() => setDocumentType('factura')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-bold text-xs transition-all ${documentType === 'factura' ? 'bg-toast-orange text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <FileText className="w-3 h-3" /> Factura
                                </button>
                            </div>

                            {documentType === 'factura' && (
                                <div className="bg-[#2a2a2a] border border-toast-orange/30 p-3 rounded-lg space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="text-[9px] font-bold text-gray-500 uppercase">RUT Empresa</label>
                                            <input
                                                type="text"
                                                placeholder="76.xxx.xxx-x"
                                                value={rut}
                                                onChange={(e) => setRut(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-white text-xs outline-none focus:border-toast-orange"
                                            />
                                        </div>
                                        <div className="flex-[2]">
                                            <label className="text-[9px] font-bold text-gray-500 uppercase">Razón Social</label>
                                            <input
                                                type="text"
                                                placeholder="Ej: Inversiones SpA"
                                                value={businessName}
                                                onChange={(e) => setBusinessName(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-white text-xs outline-none focus:border-toast-orange"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Dirección Tributaria</label>
                                        <div className="flex gap-2 items-center">
                                            <Building2 className="w-3 h-3 text-gray-500" />
                                            <input
                                                type="text"
                                                placeholder="Av. Providencia 1234, Of 505"
                                                value={businessAddress}
                                                onChange={(e) => setBusinessAddress(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-white text-xs outline-none focus:border-toast-orange"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tip Selection */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Propina (Sugerido 10%)</label>
                            <div className="flex gap-2">
                                {(['0%', '10%', '15%'] as const).map((pct) => (
                                    <button
                                        key={pct}
                                        onClick={() => setTipType(pct)}
                                        className={`flex-1 py-2 rounded-lg font-bold border text-xs transition-all
                                    ${tipType === pct
                                                ? 'bg-toast-green/20 text-toast-green border-toast-green'
                                                : 'bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-white/5'}`}
                                    >
                                        {pct}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setTipType('manual')}
                                    className={`flex-1 py-2 rounded-lg font-bold border text-xs transition-all
                                ${tipType === 'manual'
                                            ? 'bg-toast-green/20 text-toast-green border-toast-green'
                                            : 'bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-white/5'}`}
                                >
                                    Manual
                                </button>
                            </div>
                            {tipType === 'manual' && (
                                <input
                                    type="number"
                                    autoFocus
                                    value={manualTip}
                                    onChange={(e) => setManualTip(parseInt(e.target.value) || 0)}
                                    placeholder="Monto Propina"
                                    className="w-full bg-[#2a2a2a] text-white p-2 text-xs rounded-lg border border-white/10 focus:ring-1 focus:ring-toast-green outline-none"
                                />
                            )}
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] text-gray-400">Monto Propina:</span>
                                <span className="text-sm font-bold text-toast-green">+ {formatPrice(tipAmount)}</span>
                            </div>
                        </div>

                        {/* Method Selection */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Método de Pago</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setPaymentMethod('card')}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all gap-1
                                ${paymentMethod === 'card' ? 'bg-blue-500/20 text-blue-400 border-blue-500' : 'bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-white/5'}`}>
                                    <CreditCard className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase">Tarjeta</span>
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('cash')}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all gap-1
                                ${paymentMethod === 'cash' ? 'bg-green-500/20 text-green-400 border-green-500' : 'bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-white/5'}`}>
                                    <Banknote className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase">Efectivo</span>
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('transfer')}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all gap-1
                                ${paymentMethod === 'transfer' ? 'bg-purple-500/20 text-purple-400 border-purple-500' : 'bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-white/5'}`}>
                                    <Smartphone className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase">Webpay</span>
                                </button>
                            </div>

                            {/* CASH: Change Calculator */}
                            {paymentMethod === 'cash' && (
                                <div className="bg-[#111] p-3 rounded-xl border border-white/10 mt-2 animate-in slide-in-from-top-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-bold text-green-500 uppercase">Dinero Recibido</label>
                                        <div className="flex gap-2">
                                            {[1000, 2000, 5000, 10000, 20000].map(val => (
                                                <button
                                                    key={val}
                                                    onClick={() => {
                                                        // If selecting bill, ensure it covers the amount or adds up? 
                                                        // Simple version: Standard bills
                                                        // Let's implement a quick "Amount Received" state below
                                                    }}
                                                    className="hidden px-2 py-1 bg-green-900/30 text-green-400 text-[10px] rounded border border-green-500/20 hover:bg-green-500 hover:text-black">
                                                    {val / 1000}k
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <div className="relative flex-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                placeholder="Monto entregado"
                                                className="w-full bg-black text-white text-lg font-bold py-1.5 pl-6 rounded border border-white/20 focus:border-green-500 outline-none"
                                                // Quick hack: Just calculating change visually for now, not storing "Received" state yet to keep complexity low
                                                // We can add a local state for 'cashReceived' if user wants.
                                                // For now, let's just make the section distinct.
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    const change = val - totalCharge;
                                                    const changeEl = document.getElementById('change-display');
                                                    if (changeEl) changeEl.innerText = change >= 0 ? formatPrice(change) : '$0';
                                                }}
                                            />
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[9px] text-gray-400 font-bold uppercase">Vuelto</div>
                                            <div id="change-display" className="text-2xl font-black text-green-500">$0</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error Feedback */}
                        {errorMessage && (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-2 flex items-center gap-2 animate-in slide-in-from-top-2">
                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                <p className="text-xs text-red-400 font-bold leading-tight">{errorMessage}</p>
                            </div>
                        )}

                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 pt-2 border-t border-white/10 flex-none bg-[#1e1e1e] z-10 space-y-2">
                        <div className="flex justify-between items-center">
                            <div className="text-gray-400 text-xs text uppercase tracking-wider font-bold">Total a cobrar</div>
                            <div className="text-2xl font-bold text-white">{formatPrice(totalCharge)}</div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-3 rounded-xl font-bold text-sm text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
                            >
                                CANCELAR
                            </button>
                            <button
                                disabled={isProcessing || totalCharge <= 0 || !activeSession}
                                onClick={handlePayment}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-all flex items-center justify-center gap-2
                                ${isProcessing || totalCharge <= 0 || !activeSession
                                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-toast-orange to-orange-600 text-white hover:brightness-110 active:scale-95 shadow-orange-500/20'}`}
                            >
                                {!activeSession ? '⛔ CAJA CERRADA' : (isProcessing ? 'Generando DTE...' : 'CONFIRMAR PAGO')}
                            </button>
                        </div>
                        {!activeSession && (
                            <div className="mt-2 text-[10px] text-red-500 text-center font-bold bg-red-500/10 p-2 rounded border border-red-500/20 animate-pulse">
                                DEBES ABRIR CAJA PARA PODER COBRAR
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: SUMMARY & HISTORY */}
                <div className="w-full md:w-[320px] bg-black/20 border-l border-white/5 p-4 flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-gray-400" />
                            Resumen de Orden
                        </h3>
                        <div className="bg-[#2a2a2a] p-4 rounded-lg space-y-2 border border-white/5">
                            <div className="flex justify-between text-gray-400 text-sm">
                                <span>Total Consumo</span>
                                <span>{formatPrice(order.total)}</span>
                            </div>
                            <div className="flex justify-between text-gray-400 text-sm">
                                <span>Propinas Recaudadas</span>
                                <span>{formatPrice(totalTipsCollected)}</span>
                            </div>
                            <div className="h-px bg-white/10 my-2"></div>
                            <div className="flex justify-between text-white font-bold">
                                <span>Pagado</span>
                                <span className="text-green-400">{formatPrice(totalPaid)}</span>
                            </div>
                            <div className="flex justify-between text-red-400 font-bold text-lg mt-2">
                                <span>Pendiente</span>
                                <span>{formatPrice(remainingBalance)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Historial de Pagos</h3>
                        {payments.length === 0 ? (
                            <div className="text-center text-gray-600 py-8 italic">
                                No hay pagos registrados
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {[...payments].reverse().map((p) => (
                                    <div key={p.id} className="bg-[#2a2a2a] p-3 rounded border border-white/5 flex flex-col gap-1">
                                        <div className="flex justify-between items-center text-white font-bold">
                                            <span>{formatPrice(p.amount)}</span>
                                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded uppercase text-gray-300">{p.method}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span>Propina: {formatPrice(p.tip)}</span>
                                            <span>{p.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {remainingBalance === 0 && (
                        <div className="mt-4 bg-green-500/20 border border-green-500/50 p-4 rounded-xl flex items-center gap-3 animate-in zoom-in">
                            <CheckCircle2 className="w-8 h-8 text-green-500" />
                            <div>
                                <p className="font-bold text-green-400 leading-tight">Orden Pagada</p>
                                <p className="text-xs text-green-300/80">Total completado con éxito</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
