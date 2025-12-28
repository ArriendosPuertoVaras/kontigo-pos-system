'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity, AlertTriangle, CheckCircle, Database, Package, DollarSign, RefreshCw } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { KontigoFinance } from '@/lib/accounting';

export default function SystemHealthPage() {
    const ingredients = useLiveQuery(() => db.ingredients.toArray());
    const products = useLiveQuery(() => db.products.toArray());
    const accounts = useLiveQuery(() => db.accounts.toArray());

    const [isSyncing, setIsSyncing] = useState(false);

    // 1. Calculate Real Inventory Value
    let totalStockValue = 0;
    let itemsWithStockNoCost = 0;
    let itemsWithCostNoStock = 0;
    let healthyItems = 0;

    const ghostInventory = ingredients?.filter(i => {
        const hasStock = i.stock > 0;
        const hasCost = i.cost > 0;

        if (hasStock && hasCost) {
            totalStockValue += i.stock * i.cost;
            healthyItems++;
        } else if (hasStock && !hasCost) {
            itemsWithStockNoCost++;
            return true;
        } else if (!hasStock && hasCost) {
            itemsWithCostNoStock++;
        }
        return false;
    }) || [];

    // 2. Get Accounting Value
    const inventoryAccount = accounts?.find(a => a.code === '1.1.01') || accounts?.find(a => a.name.includes('Inventario') || a.code === '1.2.01');
    const ledgerValue = inventoryAccount?.balance || 0;
    const diff = totalStockValue - ledgerValue;

    const handleSync = async () => {
        setIsSyncing(true);
        await KontigoFinance.initialize(); // Ensure accounts exist
        await KontigoFinance.recalculateInventoryValuation();
        window.location.reload();
    };

    const formatMoney = (val: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans relative">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <Header title="Diagnóstico de Salud del Sistema" backHref="/settings" />

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-4xl mx-auto space-y-8">

                        <div className="flex items-center gap-4 mb-6">
                            <Link href="/settings" className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-2">
                                    <Activity className="text-toast-orange" />
                                    Centro de Control de Datos
                                </h1>
                                <p className="text-gray-400 text-sm">Detecta y corrige inconsistencias en tus datos financieros e inventario.</p>
                            </div>
                        </div>

                        {/* VALUATION CARD */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                                    <Package className="w-24 h-24" />
                                </div>
                                <h3 className="text-gray-400 text-sm font-bold uppercase mb-1">Valor Real (Físico)</h3>
                                <p className="text-3xl font-bold text-white mb-1">{formatMoney(totalStockValue)}</p>
                                <p className="text-xs text-gray-500">Calculado sumando (Stock * Costo) de {ingredients?.length} insumos.</p>
                            </div>

                            <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                                    <Database className="w-24 h-24" />
                                </div>
                                <h3 className="text-gray-400 text-sm font-bold uppercase mb-1">Valor Contable (Ledger)</h3>
                                <p className={`text-3xl font-bold mb-1 ${Math.abs(diff) > 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {formatMoney(ledgerValue)}
                                </p>
                                <p className="text-xs text-gray-500">Saldo actual en la cuenta contable "Inventario".</p>
                            </div>

                            <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 flex flex-col justify-center items-center text-center">
                                {Math.abs(diff) > 10 ? (
                                    <>
                                        <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
                                        <p className="text-red-400 font-bold mb-2">Descuadre Detectado</p>
                                        <p className="text-xs text-gray-400 mb-4">El valor físico no coincide con el contable.</p>
                                        <button
                                            onClick={handleSync}
                                            disabled={isSyncing}
                                            className="bg-toast-orange hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> Sincronizar Ahora
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
                                        <p className="text-green-400 font-bold">Datos Sincronizados</p>
                                        <p className="text-xs text-gray-400">Tu contabilidad refleja la realidad.</p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* GHOST INVENTORY WARNING */}
                        {itemsWithStockNoCost > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                                <h3 className="text-red-400 font-bold text-lg flex items-center gap-2 mb-4">
                                    <AlertTriangle className="w-5 h-5" />
                                    Inventario Fantasma Detectado ({itemsWithStockNoCost} ítems)
                                </h3>
                                <p className="text-gray-300 text-sm mb-4">
                                    Tienes productos en stock que valen <strong>$0</strong> porque no les has asignado un <strong>Costo Unitario</strong>.
                                    Esto hace que tu valoración de inventario sea incorrecta.
                                </p>

                                <div className="bg-black/30 rounded-lg overflow-hidden border border-white/5">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-2">Ingrediente</th>
                                                <th className="px-4 py-2">Stock Actual</th>
                                                <th className="px-4 py-2">Costo (Error)</th>
                                                <th className="px-4 py-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {ghostInventory.map(item => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-2 font-medium">{item.name}</td>
                                                    <td className="px-4 py-2 text-white">{item.stock} {item.unit}</td>
                                                    <td className="px-4 py-2 text-red-400 font-bold">$0</td>
                                                    <td className="px-4 py-2 text-right">
                                                        <Link href="/inventory" className="text-toast-orange hover:underline text-xs">Ir a Editar</Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* STATS SUMMARY */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-white/5">
                                <h4 className="text-gray-500 text-xs font-bold uppercase">Total Insumos</h4>
                                <p className="text-2xl font-bold text-white">{ingredients?.length || 0}</p>
                            </div>
                            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-white/5">
                                <h4 className="text-gray-500 text-xs font-bold uppercase">Con Costo ($)</h4>
                                <p className="text-2xl font-bold text-green-400">{healthyItems}</p>
                            </div>
                            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-white/5">
                                <h4 className="text-gray-500 text-xs font-bold uppercase">Sin Costo ($0)</h4>
                                <p className="text-2xl font-bold text-red-400">{itemsWithStockNoCost}</p>
                            </div>
                            <div className="bg-[#2a2a2a] p-4 rounded-lg border border-white/5">
                                <h4 className="text-gray-500 text-xs font-bold uppercase">Productos Venta</h4>
                                <p className="text-2xl font-bold text-blue-400">{products?.length || 0}</p>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
