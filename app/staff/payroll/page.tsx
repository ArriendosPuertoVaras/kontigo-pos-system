'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { calculateSalary } from '@/lib/payroll/chile';
import { ArrowLeft, DollarSign, FileText, Download, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function PayrollPage() {
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    const staffList = useLiveQuery(() => db.staff.toArray());
    const shifts = useLiveQuery(() => db.shifts.toArray()); // TODO: Filter by month

    // Compute Payroll for all
    const payrollData = staffList?.map(staff => {
        // Mock filter for shifts (assuming all active for demo)
        const staffShifts = shifts?.filter(s => s.staffId === staff.id) || [];
        const calculation = calculateSalary(staff, staffShifts, selectedMonth);
        return {
            staff,
            ...calculation
        };
    });

    const totalCost = payrollData?.reduce((acc, curr) => acc + curr.sueldoLiquidoEstimado, 0) || 0;

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-[#252525]">
                <div className="flex items-center gap-4">
                    <Link href="/staff" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Remuneraciones</h1>
                        <p className="text-xs text-gray-400">Cálculo de sueldos y leyes sociales</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="text-right mr-4">
                        <p className="text-xs text-gray-400 uppercase font-bold">Total a Pagar</p>
                        <p className="text-xl font-bold text-green-400">${totalCost.toLocaleString('es-CL')}</p>
                    </div>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg flex items-center gap-2">
                        <Printer className="w-4 h-4" />
                        Imprimir Libro
                    </button>
                    <button className="bg-toast-orange hover:brightness-110 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        PDF Liquidaciones
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="p-6 max-w-7xl mx-auto">
                <div className="bg-[#252525] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-black/20 text-gray-400 text-xs uppercase font-bold">
                            <tr>
                                <th className="p-4 pl-6">Colaborador</th>
                                <th className="p-4">Base + Grat.</th>
                                <th className="p-4">H. Extras</th>
                                <th className="p-4 text-red-400">Desc. Legales</th>
                                <th className="p-4 text-green-400">No Imponible</th>
                                <th className="p-4 text-right font-extrabold text-white">Líquido a Pagar</th>
                                <th className="p-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {payrollData?.map((item) => (
                                <tr key={item.staff.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 pl-6 font-bold text-gray-200">
                                        {item.staff.name}
                                        <div className="text-xs text-gray-500 font-normal">{item.staff.activeRole}</div>
                                    </td>
                                    <td className="p-4">
                                        ${(item.sueldoBase + item.gratificacion).toLocaleString()}
                                    </td>
                                    <td className="p-4">
                                        ${item.horasExtras.toLocaleString()}
                                        {/* <span className="text-xs text-gray-500 block">{item.horasExtrasCount} hrs</span> */}
                                    </td>
                                    <td className="p-4 text-red-300">
                                        -${item.descuentosTrabajador.total.toLocaleString()}
                                        <div className="text-[10px] text-gray-500">
                                            AFP {item.descuentosTrabajador.afpNombre} (${item.descuentosTrabajador.afpMonto})
                                        </div>
                                    </td>
                                    <td className="p-4 text-green-300">
                                        +${(item.haberesNoImponibles.colacion + item.haberesNoImponibles.movilizacion).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-right font-bold text-lg text-green-400 bg-green-500/5">
                                        ${item.sueldoLiquidoEstimado.toLocaleString()}
                                    </td>
                                    <td className="p-4 text-center">
                                        <button className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white" title="Ver Detalle">
                                            <FileText className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!payrollData?.length && (
                        <div className="p-12 text-center text-gray-500">
                            Cargando nómina...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
