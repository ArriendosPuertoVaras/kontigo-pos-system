'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, WasteLog } from '@/lib/db';
import { KontigoFinance } from '@/lib/accounting';
import { UtensilsCrossed, ArrowLeft, Trash2, Plus, AlertTriangle, History, Calendar, FileText } from 'lucide-react';
import Link from 'next/link';
import { WasteModal } from '../purchases/WasteModal';
import Header from '@/components/Header';

const getConversionMultiplier = (itemUnit: string, ingredient: any) => {
    if (itemUnit === ingredient.unit) return 1;
    if (itemUnit === ingredient.purchaseUnit) return ingredient.conversionFactor || 1;
    if (itemUnit === 'kg' && ingredient.unit === 'g') return 1000;
    if (itemUnit === 'g' && ingredient.unit === 'kg') return 0.001;
    if (itemUnit === 'l' && ingredient.unit === 'ml') return 1000;
    if (itemUnit === 'ml' && ingredient.unit === 'l') return 0.001;
    return 1;
};

export default function WastePage() {
    // Queries
    const ingredients = useLiveQuery(() => db.ingredients.toArray());
    const wasteLogs = useLiveQuery(() => db.wasteLogs.reverse().toArray());

    // Local State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<WasteLog>>({ date: new Date(), reason: 'Expired' });

    // KPIs
    const totalWasteValue = wasteLogs?.reduce((sum, log) => {
        const item = ingredients?.find(i => i.id === log.ingredientId);
        return sum + (log.quantity * (item?.cost || 0));
    }, 0) || 0;

    // --- ACTIONS ---
    // --- ACTIONS ---
    const handleReportWaste = async (ingredientId: number, qty: number, unit: string, reason: string, note: string) => {
        const ingredient = await db.ingredients.get(ingredientId);
        if (!ingredient) return;

        const conversion = getConversionMultiplier(unit, ingredient);
        const stockDeduction = qty * conversion;

        let wasteCostToRecord = 0;

        await db.transaction('rw', db.ingredients, db.wasteLogs, async () => {
            await db.wasteLogs.add({
                ingredientId,
                quantity: qty,
                reason: reason as any,
                date: new Date(),
                note: `${note} (${unit})`
            });
            await db.ingredients.update(ingredientId, { stock: ingredient.stock - stockDeduction });

            // Calculate Cost for later
            const totalCost = stockDeduction * (ingredient.cost || 0);
            if (totalCost > 0) {
                wasteCostToRecord = Math.round(totalCost);
            }
        });

        // 3. Close Modal Immediately (UI First)
        console.log('🦁 Waste Debug: Transaction complete, closing modal');
        setIsModalOpen(false);

        // 4. Update Financial Nexus (Accounting) - Background Logic
        if (wasteCostToRecord > 0) {
            // We don't await this to block UI, but we catch errors
            KontigoFinance.recordWaste(ingredient.name, wasteCostToRecord, reason)
                .then(() => console.log('🦁 Waste Debug: Recorded in Nexus'))
                .catch(err => console.error('🦁 Waste Debug: Nexus Error', err));
        }

        // Alert is optional now, UI update is immediate
    };

    const getIngredientName = (id: number) => ingredients?.find(i => i.id === id)?.name || '...';
    const getIngredientUnit = (id: number) => ingredients?.find(i => i.id === id)?.unit || '';

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">
            {/* SIDEBAR (Mini) */}
            <aside className="w-[90px] bg-toast-charcoal-dark flex flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                <div className="mb-10 scale-110">
                    <div className="w-12 h-12 bg-gradient-to-br from-toast-orange to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <UtensilsCrossed className="text-white w-7 h-7" />
                    </div>
                </div>
                <nav className="flex flex-col gap-2 w-full px-2">
                    <Link href="/" className="flex flex-col items-center justify-center w-full py-3 rounded-xl transition-all duration-200 group text-gray-400 hover:text-white hover:bg-white/5">
                        <ArrowLeft className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-bold uppercase">Volver</span>
                    </Link>
                </nav>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col h-full bg-[#2a2a2a] overflow-hidden">
                <Header title="Control de Mermas">
                    <button onClick={() => setIsModalOpen(true)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 h-10">
                        <Plus className="w-5 h-5" /> Reportar Merma
                    </button>
                </Header>

                <div className="flex-1 p-8 overflow-y-auto grid grid-cols-12 gap-6">

                    {/* LEFT: KPIs & SUMMARY */}
                    <div className="col-span-4 space-y-6">
                        <div className="bg-toast-charcoal p-4 rounded-xl border border-white/5">
                            <h3 className="text-gray-400 text-sm font-bold uppercase mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-toast-orange" />
                                Impacto Financiero
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-white text-sm">Pérdida Total (Mes)</span>
                                    <span className="font-mono text-3xl font-bold text-red-500">
                                        ${totalWasteValue.toLocaleString()}
                                    </span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 w-[15%]"></div>
                                </div>
                                <p className="text-xs text-gray-500">Representa el 1.2% de las ventas totales.</p>
                            </div>
                        </div>

                        <div className="bg-toast-charcoal p-4 rounded-xl border border-white/5">
                            <h3 className="text-gray-400 text-sm font-bold uppercase mb-4">Motivos Frecuentes</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-white">Vencimiento</span>
                                    <span className="text-gray-400">45%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-white">Error Preparación</span>
                                    <span className="text-gray-400">30%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-white">Daño Físico</span>
                                    <span className="text-gray-400">25%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: HISTORY LOG */}
                    <div className="col-span-8 space-y-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <History className="text-gray-400 w-5 h-5" />
                            Historial Reciente
                        </h2>

                        <div className="bg-toast-charcoal rounded-xl border border-white/5 overflow-hidden">
                            <table className="w-full text-left text-sm text-gray-400">
                                <thead className="bg-white/5 text-gray-300 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="px-6 py-4">Fecha</th>
                                        <th className="px-6 py-4">Ingrediente</th>
                                        <th className="px-6 py-4">Motivo</th>
                                        <th className="px-6 py-4 text-right">Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {wasteLogs?.map(log => (
                                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 flex items-center gap-2">
                                                <Calendar className="w-4 h-4 opacity-50" />
                                                {log.date.toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-white">{getIngredientName(log.ingredientId)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase
                                                    ${log.reason === 'Expired' ? 'bg-red-500/10 text-red-500' :
                                                        log.reason === 'Damaged' ? 'bg-orange-500/10 text-orange-500' :
                                                            'bg-gray-500/20 text-gray-400'}`}>
                                                    {log.reason === 'Expired' ? 'Vencido' :
                                                        log.reason === 'Damaged' ? 'Dañado' :
                                                            log.reason === 'Mistake' ? 'Error' : 'Otro'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-white">
                                                -{log.quantity} {getIngredientUnit(log.ingredientId)}
                                            </td>
                                        </tr>
                                    ))}
                                    {wasteLogs?.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                                                No hay registros de mermas.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>

            {/* REPORT MODAL */}
            {/* REPORT MODAL */}
            {isModalOpen && (
                <WasteModal
                    ingredients={ingredients || []}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleReportWaste}
                />
            )}
        </div>
    );
}
