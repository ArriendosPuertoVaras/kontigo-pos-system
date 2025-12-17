'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, Staff } from '@/lib/db';
import { calculateSalary } from '@/lib/payroll/chile';
import { ArrowLeft, User, CreditCard, Save, Calculator, AlertTriangle, Info, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';

// Helper to format RUT
function formatRut(rut: string) {
    if (!rut) return '';
    // Clean data
    let value = rut.replace(/\./g, '').replace(/-/g, '');

    if (value.match(/^(\d{2})(\d{3}){2}(\w{1})$/)) {
        value = value.replace(/^(\d{2})(\d{3})(\d{3})(\w{1})$/, '$1.$2.$3-$4');
    }
    else if (value.match(/^(\d)(\d{3}){2}(\w{0,1})$/)) {
        value = value.replace(/^(\d)(\d{3})(\d{3})(\w{0,1})$/, '$1.$2.$3-$4');
    }
    else if (value.match(/^(\d)(\d{3})(\d{0,2})$/)) {
        value = value.replace(/^(\d)(\d{3})(\d{0,2})$/, '$1.$2.$3');
    }
    else if (value.match(/^(\d)(\d{0,2})$/)) {
        value = value.replace(/^(\d)(\d{0,2})$/, '$1.$2');
    }

    // Simple formatter for standard length
    if (value.length > 1 && value.length < 13 && !value.includes('-')) {
        const body = value.slice(0, -1);
        const dv = value.slice(-1);
        return body.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
    }
    return value;
}

export default function EmployeeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params?.id);
    const staff = useLiveQuery(() => db.staff.get(id), [id]);

    const [formData, setFormData] = useState<Partial<Staff>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Sync formData when staff loads
    useEffect(() => {
        if (staff) setFormData(staff);
    }, [staff]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (id && formData) {
                await db.staff.update(id, formData);
                // Redirect to list instead of alert
                router.push('/staff/employees');
            }
        } catch (error) {
            console.error("Error updating staff", error);
            alert('Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        // Removed confirmation as requested
        try {
            if (id) {
                await db.staff.delete(id);
                router.push('/staff/employees');
            }
        } catch (error) {
            console.error("Error deleting staff", error);
        }
    };

    // Live Calculation of Tips (Current Month)
    const currentTips = useLiveQuery(async () => {
        if (!id) return 0;
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);

        try {
            const orders = await db.orders
                .where('staffId').equals(id)
                .and(o => o.createdAt >= start && o.createdAt <= end)
                .toArray();
            return orders.reduce((sum, o) => sum + (o.tip || 0), 0);
        } catch (e) { return 0; }
    }, [id]) || 0;

    // Live Calculation Salary
    const sim = calculateSalary({ ...formData, estimatedTips: currentTips } as Staff, [], new Date());

    if (!staff) return <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">Cargando...</div>;

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans p-4 pb-20">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/staff/employees" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{formData.name}</h1>
                        <p className="text-xs text-gray-400 font-mono">{formData.rut || 'RUT Pendiente'} • {formData.activeRole}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleDelete}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 border border-red-500/20">
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-toast-orange hover:brightness-110 text-white px-5 py-2 rounded-xl font-bold text-xs shadow-xl shadow-orange-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Guardando...' : 'Guardar Ficha'}
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* COL 1 & 2: FORMS (Span 7/12) */}
                <div className="lg:col-span-7 space-y-4">
                    {/* 1. Datos Personales & Rol */}
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-toast-orange border-b border-white/5 pb-2">
                            <User className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Contrato y Jornada</h2>
                        </div>

                        <div className="grid grid-cols-6 gap-3">
                            <div className="col-span-6 md:col-span-3">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Nombre Completo</label>
                                <input
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="col-span-3 md:col-span-3">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Cargo</label>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none appearance-none"
                                    value={formData.role || 'waiter'}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as any, activeRole: e.target.value as any })}
                                >
                                    <option value="manager">Administrador</option>
                                    <option value="waiter">Garzón</option>
                                    <option value="kitchen">Cocina</option>
                                    <option value="bar">Barra</option>
                                    <option value="steward">Copero</option>
                                    <option value="cleaning">Aseo</option>
                                </select>
                            </div>

                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Email</label>
                                <input
                                    type="email"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.email || ''}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Teléfono</label>
                                <input
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.phone || ''}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">RUT</label>
                                <input
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none font-mono"
                                    value={formData.rut || ''}
                                    onChange={e => setFormData({ ...formData, rut: e.target.value })}
                                    onBlur={e => setFormData({ ...formData, rut: formatRut(e.target.value) })}
                                    maxLength={13}
                                />
                            </div>

                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Inicio Contrato</label>
                                <input
                                    type="date"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={(() => {
                                        try {
                                            if (!formData.startDate) return '';
                                            const d = new Date(formData.startDate);
                                            return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
                                        } catch (e) { return ''; }
                                    })()}
                                    onChange={e => setFormData({ ...formData, startDate: new Date(e.target.value) })}
                                />
                            </div>

                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Duración</label>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none appearance-none"
                                    value={formData.contractDuration || 'indefinite'}
                                    onChange={e => setFormData({ ...formData, contractDuration: e.target.value as any })}
                                >
                                    <option value="indefinite">Indefinido</option>
                                    <option value="fixed">Plazo Fijo</option>
                                </select>
                            </div>

                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Jornada</label>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none appearance-none"
                                    value={formData.contractType || '44-hours'}
                                    onChange={e => {
                                        const type = e.target.value as any;
                                        let hours = 44;
                                        if (type === '40-hours') hours = 40;
                                        if (type === 'part-time') hours = 30;
                                        if (type === 'art-22') hours = 0;
                                        setFormData({ ...formData, contractType: type, weeklyHoursLimit: hours });
                                    }}
                                >
                                    <option value="44-hours">Full Time (44h)</option>
                                    <option value="40-hours">Full Time (40h)</option>
                                    <option value="part-time">Part Time</option>
                                    <option value="art-22">Art. 22</option>
                                </select>
                            </div>

                            {/* Conditional Hours Input */}
                            {formData.contractType !== 'art-22' && (
                                <div className="col-span-2">
                                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">
                                        {formData.contractType === 'part-time' ? 'Horas (Máx 30)' : 'Horas Sem.'}
                                    </label>
                                    <input
                                        type="number"
                                        className={`w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none font-bold ${formData.contractType !== 'part-time' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        value={formData.weeklyHoursLimit || 0}
                                        readOnly={formData.contractType !== 'part-time'}
                                        max={30}
                                        onChange={e => {
                                            let val = Number(e.target.value);
                                            if (formData.contractType === 'part-time' && val > 30) val = 30;
                                            setFormData({ ...formData, weeklyHoursLimit: val });
                                        }}
                                    />
                                    {formData.contractType === 'part-time' && (
                                        <p className="text-[9px] text-yellow-500 mt-1">
                                            * Tope Gratificación se ajustará a {formData.weeklyHoursLimit}/44
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Remuneraciones */}
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-green-400 border-b border-white/5 pb-2">
                            <CreditCard className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Haberes y Descuentos</h2>
                        </div>

                        <div className="grid grid-cols-6 gap-3">
                            <div className="col-span-6">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Sueldo Base Liq. (Mín $529k Full)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                                    <input
                                        type="number"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg pl-6 pr-4 py-2 text-white focus:border-toast-orange outline-none font-bold text-base"
                                        value={formData.baseSalary || 0}
                                        onChange={e => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="col-span-6 border-t border-white/5 pt-4 mt-2">
                                <label className="block text-[10px] uppercase font-bold text-yellow-500 mb-0.5">Propinas (Mes Actual)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 text-xs">$</span>
                                    <input
                                        type="text"
                                        readOnly
                                        disabled
                                        className="w-full bg-black/20 border border-yellow-500/30 rounded-lg pl-6 pr-4 py-2 text-yellow-500 font-bold text-sm cursor-not-allowed opacity-80"
                                        value={currentTips.toLocaleString('es-CL')}
                                    />
                                </div>
                                <p className="text-[9px] text-gray-500 mt-1">* Suma real de comandas de este mes.</p>
                            </div>

                            {/* No Imponibles */}
                            <div className="col-span-3">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Colación</label>
                                <input
                                    type="number"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm"
                                    value={formData.colacion || 0}
                                    onChange={e => setFormData({ ...formData, colacion: Number(e.target.value) })}
                                />
                            </div>
                            <div className="col-span-3">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Movilización</label>
                                <input
                                    type="number"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm"
                                    value={formData.movilizacion || 0}
                                    onChange={e => setFormData({ ...formData, movilizacion: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="pt-2 border-t border-white/5">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Previsión y Salud (Leyes Sociales)</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] text-gray-500 mb-0.5">AFP</label>
                                    <select
                                        className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-xs"
                                        value={formData.afp || ''}
                                        onChange={e => setFormData({ ...formData, afp: e.target.value as any })}
                                    >
                                        <option value="Modelo">Modelo (10.58%)</option>
                                        <option value="Uno">Uno (10.49%)</option>
                                        <option value="Habitat">Habitat (11.27%)</option>
                                        <option value="Capital">Capital (11.44%)</option>
                                        <option value="Provida">Provida (11.45%)</option>
                                        <option value="PlanVital">PlanVital (11.16%)</option>
                                        <option value="Cuprum">Cuprum (11.44%)</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-[10px] text-gray-500 mb-0.5">Salud</label>
                                        <select
                                            className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-xs"
                                            value={formData.healthSystem || 'Fonasa'}
                                            onChange={e => setFormData({ ...formData, healthSystem: e.target.value as any })}
                                        >
                                            <option value="Fonasa">Fonasa (7%)</option>
                                            <option value="Isapre">Isapre</option>
                                        </select>
                                    </div>
                                    {formData.healthSystem === 'Isapre' && (
                                        <div className="flex-1">
                                            <label className="block text-[10px] text-gray-500 mb-0.5">Valor (Pesos/UF)</label>
                                            <input
                                                type="number"
                                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-xs"
                                                value={formData.healthFee || 0}
                                                onChange={e => setFormData({ ...formData, healthFee: Number(e.target.value) })}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Datos Bancarios */}
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-blue-400 border-b border-white/5 pb-2">
                            <CreditCard className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Datos Bancarios</h2>
                        </div>

                        <div className="grid grid-cols-6 gap-3">
                            <div className="col-span-6 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Banco</label>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.bankDetails?.bank || ''}
                                    onChange={e => setFormData({
                                        ...formData,
                                        bankDetails: {
                                            accountType: formData.bankDetails?.accountType || 'vista',
                                            accountNumber: formData.bankDetails?.accountNumber || '',
                                            bank: e.target.value
                                        }
                                    })}
                                >
                                    <option value="">Seleccione...</option>
                                    <option value="BancoEstado">BancoEstado</option>
                                    <option value="Banco de Chile">Banco de Chile</option>
                                    <option value="Banco Santander">Banco Santander</option>
                                    <option value="Bci">Bci</option>
                                    <option value="Scotiabank">Scotiabank</option>
                                    <option value="Itaú">Itaú</option>
                                    <option value="Banco Falabella">Banco Falabella</option>
                                    <option value="Banco Ripley">Banco Ripley</option>
                                    <option value="Banco Bice">Banco Bice</option>
                                    <option value="Banco Security">Banco Security</option>
                                    <option value="Banco Consorcio">Banco Consorcio</option>
                                    <option value="Banco Internacional">Banco Internacional</option>
                                    <option value="Coopeuch">Coopeuch</option>
                                </select>
                            </div>

                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">Tipo de Cuenta</label>
                                <select
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.bankDetails?.accountType || 'vista'}
                                    onChange={e => setFormData({
                                        ...formData,
                                        bankDetails: {
                                            bank: formData.bankDetails?.bank || '',
                                            accountNumber: formData.bankDetails?.accountNumber || '',
                                            accountType: e.target.value as any
                                        }
                                    })}
                                >
                                    <option value="vista">Cta Vista/RUT</option>
                                    <option value="corriente">Cta Corriente</option>
                                    <option value="ahorro">Cta Ahorro</option>
                                </select>
                            </div>

                            <div className="col-span-3 md:col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-0.5">N° Cuenta</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                    placeholder="Ej: 12345678"
                                    value={formData.bankDetails?.accountNumber || ''}
                                    onChange={e => setFormData({
                                        ...formData,
                                        bankDetails: {
                                            bank: formData.bankDetails?.bank || '',
                                            accountType: formData.bankDetails?.accountType || 'vista',
                                            accountNumber: e.target.value
                                        }
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* COL 3: SIMULATION CARD (Span 5/12) */}
                <div className="lg:col-span-5">
                    <div className="bg-gradient-to-b from-[#2a2a2a] to-[#202020] p-6 rounded-2xl border border-white/10 shadow-2xl sticky top-6">
                        <div className="flex items-center gap-2 text-blue-400 mb-4">
                            <Calculator className="w-5 h-5" />
                            <h2 className="font-bold text-lg">Simulacíon Legal 2025</h2>
                        </div>

                        {/* ALERTS */}
                        {sim.alertas.length > 0 && (
                            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                {sim.alertas.map((alert, i) => (
                                    <div key={i} className="flex gap-2 text-xs text-red-500 font-bold mb-1 last:mb-0">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>{alert}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* TABLA PRINCIPAL */}
                            <div className="space-y-2 text-sm">
                                <Row label="Sueldo Base" value={sim.sueldoBase} />
                                <Row label="Gratificación Legal (25%)" value={sim.gratificacion} />
                                <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-white">
                                    <span>Total Imponible</span>
                                    <span>${sim.totalImponible.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* DESCUENTOS */}
                            <div className="bg-black/20 p-3 rounded-lg space-y-2 text-xs">
                                <p className="text-gray-400 font-bold uppercase mb-1">Descuentos (Cargo Trabajador)</p>
                                <Row label={`AFP ${sim.descuentosTrabajador.afpNombre}`} value={-sim.descuentosTrabajador.afpMonto} color="text-red-300" />
                                <Row label="Salud (Fonasa/Isapre)" value={-sim.descuentosTrabajador.saludMonto} color="text-red-300" />
                                <Row label="Seguro Cesantía (0.6%)" value={-sim.descuentosTrabajador.cesantiaMonto} color="text-red-300" />
                            </div>

                            {/* NO IMPONIBLES */}
                            <div className="bg-black/20 p-3 rounded-lg space-y-2 text-xs">
                                <p className="text-gray-400 font-bold uppercase mb-1">No Imponibles</p>
                                <Row label="Colación + Movilización" value={sim.haberesNoImponibles.colacion + sim.haberesNoImponibles.movilizacion} color="text-green-300" />
                                {sim.haberesNoImponibles.propinas > 0 && (
                                    <Row label="Propinas (Informativo)" value={sim.haberesNoImponibles.propinas} color="text-yellow-500" />
                                )}
                            </div>

                            {/* RESULTADO LIQUIDO */}
                            <div className="bg-green-600/10 border border-green-500/30 rounded-xl p-4 text-center">
                                <p className="text-xs text-green-400 font-bold uppercase mb-1">Sueldo Líquido Estimado</p>
                                <p className="text-3xl font-extrabold text-white tracking-tight">
                                    ${sim.sueldoLiquidoEstimado.toLocaleString()}
                                </p>
                            </div>

                            {/* COSTO EMPRESA BREAKDOWN */}
                            <div className="bg-white/5 border border-white/5 rounded-xl p-4 mt-4">
                                <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
                                    <Info className="w-4 h-4 text-purple-400" />
                                    <p className="text-xs text-purple-400 font-bold uppercase">Aportes Patronales (Costo Empresa)</p>
                                </div>
                                <div className="space-y-2 text-xs text-gray-400">
                                    <Row label="SIS (1.49%)" value={sim.costoEmpresaTotal.aporteSis} />
                                    <Row label="Mutual (0.93% Base)" value={sim.costoEmpresaTotal.aporteMutual} />
                                    <Row label="Cesantía Empleador (2.4% / 3.0%)" value={sim.costoEmpresaTotal.aporteCesantia} />
                                    <Row label="Seguro Social Nuevo (1% - 2025)" value={sim.costoEmpresaTotal.aporteSeguroSocialNuevo} highlight />
                                </div>
                                <div className="border-t border-white/10 mt-3 pt-2 flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-300">Costo Final Mensual</span>
                                    <span className="text-lg font-bold text-white">${sim.costoEmpresaTotal.costoFinalMensual.toLocaleString()}</span>
                                </div>
                                <p className="text-[9px] text-gray-600 mt-2 text-center">
                                    * Incluye Imponible + Aportes Patronales + Asignaciones. No incluye Propinas.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, color = "text-gray-300", highlight = false }: { label: string, value: number, color?: string, highlight?: boolean }) {
    return (
        <div className={`flex justify-between items-center ${highlight ? 'bg-purple-500/10 -mx-1 px-1 rounded' : ''}`}>
            <span className={color}>{label}</span>
            <span className={color}>
                {value < 0 ? '-' : ''}${Math.abs(value).toLocaleString()}
            </span>
        </div>
    )
}
