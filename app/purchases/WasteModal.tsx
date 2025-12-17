import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

export function WasteModal({ ingredients, onClose, onSave }: { ingredients: any[], onClose: any, onSave: any }) {
    const [selectedIngId, setSelectedIngId] = useState<number | null>(null);
    const [qty, setQty] = useState("");
    const [unit, setUnit] = useState("kg");
    const [reason, setReason] = useState("Vencido");
    const [note, setNote] = useState("");

    // Update unit default when ingredient changes
    const handleIngredientChange = (id: number) => {
        setSelectedIngId(id);
        const ing = ingredients.find((i: any) => i.id === id);
        if (ing) setUnit(ing.purchaseUnit || ing.unit || 'un');
    };

    const handleSave = () => {
        if (selectedIngId && qty) {
            onSave(selectedIngId, parseFloat(qty), unit, reason, note);
        }
    };

    const selectedIng = ingredients.find((i: any) => i.id === selectedIngId);

    return (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                </button>

                <div className="mb-8 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                        <Trash2 className="text-red-500 w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Registrar Pérdida</h3>
                    <p className="text-gray-400 text-sm mt-1">Descuenta stock por merma o error.</p>
                </div>

                <div className="space-y-6">
                    {/* INGREDIENT SELECTOR */}
                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Producto Afectado</label>
                        <select
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-lg focus:border-red-500 outline-none transition-colors"
                            onChange={e => handleIngredientChange(parseInt(e.target.value))}
                            value={selectedIngId || ""}
                        >
                            <option value="" disabled>Seleccionar ingrediente...</option>
                            {ingredients.map((i: any) => (
                                <option key={i.id} value={i.id}>
                                    {i.name} (Actual: {i.stock} {i.unit})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* QUANTITY AND UNIT - SPLIT INTO TWO DISTINCT BLOCKS */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Cantidad Perdida</label>
                            <input
                                type="number"
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-xl font-mono focus:border-red-500 outline-none transition-colors placeholder:text-gray-700"
                                placeholder="0.00"
                                value={qty}
                                onChange={e => setQty(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Unidad de Medida</label>
                            <select
                                className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-lg font-bold focus:border-red-500 outline-none transition-colors appearance-none text-center cursor-pointer hover:bg-white/5"
                                value={unit}
                                onChange={e => setUnit(e.target.value)}
                                style={{ textAlignLast: 'center' }}
                            >
                                <option value="un">UNIDADES (un)</option>
                                <option value="kg">KILOS (kg)</option>
                                <option value="g">GRAMOS (g)</option>
                                <option value="l">LITROS (l)</option>
                                <option value="ml">MILILITROS (ml)</option>
                            </select>
                        </div>
                    </div>

                    {/* REASON */}
                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Motivo de la merma</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['Vencido', 'Dañado', 'Error', 'Otro'].map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setReason(r === 'Vencido' ? 'Expired' : r === 'Dañado' ? 'Damaged' : r === 'Error' ? 'Mistake' : 'Other')}
                                    className={`p-3 rounded-lg text-sm font-bold border transition-all ${(reason === 'Expired' && r === 'Vencido') ||
                                            (reason === 'Damaged' && r === 'Dañado') ||
                                            (reason === 'Mistake' && r === 'Error') ||
                                            (reason === 'Other' && r === 'Otro')
                                            ? 'bg-red-500 text-white border-red-500'
                                            : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
                                        }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* NOTE */}
                    <div>
                        <textarea
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-red-500 outline-none transition-colors min-h-[80px]"
                            placeholder="Detalles adicionales (opcional)..."
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        ></textarea>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!selectedIngId || !qty}
                        className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-900/20 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" />
                        CONFIRMAR PÉRDIDA
                    </button>
                </div>
            </div>
        </div>
    )
}
