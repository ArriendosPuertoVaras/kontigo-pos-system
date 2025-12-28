'use client';
import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { useRouter } from 'next/navigation';
import { Wallet, Lock, History, AlertCircle, ArrowRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export default function CashDashboardPage() {
    const router = useRouter();

    // Check Active Session Status
    const activeSession = useLiveQuery(() => db.dailyCloses.where('status').equals('open').first());

    // Check if we have recent closes (history)
    const recentCloses = useLiveQuery(() => db.dailyCloses.where('status').equals('closed').reverse().limit(3).toArray());

    return (
        <div className="flex h-screen w-full bg-[#2a2a2a] text-white font-sans selection:bg-toast-orange selection:text-white relative">
            <Header title="Gestión de Caja" backHref="/manager" />

            <main className="flex-1 p-8 w-full max-w-6xl mx-auto flex flex-col gap-8 h-full overflow-y-auto pb-20">

                {/* STATUS BANNER */}
                <div className={`w-full p-6 rounded-2xl border flex items-center gap-6 shadow-xl transition-all
                    ${activeSession
                        ? 'bg-gradient-to-r from-green-900/40 to-green-800/20 border-green-500/30'
                        : 'bg-gradient-to-r from-gray-800 to-gray-900 border-white/10'
                    }`}>

                    <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 
                        ${activeSession ? 'bg-green-500 text-black' : 'bg-gray-700 text-gray-400'}`}>
                        {activeSession ? <Wallet className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold mb-1">
                            {activeSession ? 'Caja Abierta' : 'Caja Cerrada'}
                        </h2>
                        <p className="text-gray-400">
                            {activeSession
                                ? `Sesión iniciada a las ${activeSession.startTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} con $${activeSession.openingCash?.toLocaleString()}`
                                : 'No hay un turno activo en este momento.'}
                        </p>
                    </div>
                </div>


                {/* ACTION CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* OPEN BUTTON */}
                    <button
                        onClick={() => router.push('/manager/open')}
                        disabled={!!activeSession}
                        className={`group relative overflow-hidden rounded-3xl p-8 text-left transition-all duration-300 border
                            ${activeSession
                                ? 'bg-gray-800/50 border-white/5 opacity-50 cursor-not-allowed grayscale'
                                : 'bg-toast-charcoal border-white/10 hover:border-toast-green hover:shadow-2xl hover:shadow-green-900/20 hover:-translate-y-1'}
                        `}
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Wallet className="w-32 h-32" />
                        </div>

                        <div className="relative z-10">
                            <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-xl flex items-center justify-center mb-6">
                                <Wallet className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-white">Apertura de Caja</h3>
                            <p className="text-gray-400 mb-6">Iniciar un nuevo turno ingresando el fondo inicial.</p>

                            {!activeSession && (
                                <span className="inline-flex items-center gap-2 text-green-400 font-bold group-hover:gap-4 transition-all">
                                    Comenzar <ArrowRight className="w-5 h-5" />
                                </span>
                            )}
                        </div>
                    </button>

                    {/* CLOSE BUTTON */}
                    <button
                        onClick={() => router.push('/manager/close')}
                        disabled={!activeSession}
                        className={`group relative overflow-hidden rounded-3xl p-8 text-left transition-all duration-300 border
                            ${!activeSession
                                ? 'bg-gray-800/50 border-white/5 opacity-50 cursor-not-allowed grayscale'
                                : 'bg-toast-charcoal border-white/10 hover:border-toast-orange hover:shadow-2xl hover:shadow-orange-900/20 hover:-translate-y-1'}
                        `}
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Lock className="w-32 h-32" />
                        </div>

                        <div className="relative z-10">
                            <div className="w-12 h-12 bg-orange-500/20 text-toast-orange rounded-xl flex items-center justify-center mb-6">
                                <Lock className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-white">Cierre de Caja (Z)</h3>
                            <p className="text-gray-400 mb-6">Contar dinero, cuadrar ventas y finalizar el turno actual.</p>

                            {activeSession && (
                                <span className="inline-flex items-center gap-2 text-toast-orange font-bold group-hover:gap-4 transition-all">
                                    Cerrar Turno <ArrowRight className="w-5 h-5" />
                                </span>
                            )}
                        </div>
                    </button>

                </div>

                {/* HISTORY PREVIEW */}
                <div className="mt-8">
                    <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                        <History className="w-5 h-5" /> Historial Reciente
                    </h3>

                    <div className="bg-toast-charcoal rounded-2xl border border-white/5 overflow-hidden">
                        {recentCloses?.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No hay cierres registrados aún.</div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-medium">Fecha</th>
                                        <th className="p-4 font-medium text-right">Venta Total</th>
                                        <th className="p-4 font-medium text-right">Diferencia</th>
                                        <th className="p-4 font-medium">Cajero</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentCloses?.map(close => (
                                        <tr key={close.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="p-4 text-gray-300">
                                                <div className="font-bold text-white">{close.date.toLocaleDateString()}</div>
                                                <div className="text-xs text-gray-500">{close.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            <td className="p-4 text-right font-mono text-white">
                                                ${close.totalSales.toLocaleString()}
                                            </td>
                                            <td className={`p-4 text-right font-mono font-bold ${close.cashDifference === 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {close.cashDifference > 0 ? '+' : ''}{close.cashDifference.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-gray-400 text-sm">
                                                {close.closedBy}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* DIAGNOSTIC TOOLS (GHOST BUSTER) */}
                <div className="mt-8 border-t border-white/5 pt-8">
                    <h3 className="text-sm font-bold text-red-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> Zona de Diagnóstico
                    </h3>

                    <GhostSessionDetector />
                </div>
            </main>
        </div>
    );
}

function GhostSessionDetector() {
    // BRUTE FORCE: Fetch ALL to avoid index issues
    const allSessions = useLiveQuery(() => db.dailyCloses.toArray()) || [];

    // Safety: Filter logic ensuring we catch anything looking like an open session
    const ghosts = allSessions.filter(s => s.status === 'open');

    if (ghosts.length === 0) {
        return <div className="text-xs text-green-500 font-mono">✅ Sistema Limpio: No se detectaron sesiones fantasmas.</div>;
    }

    const forceClose = async (id: number) => {
        if (!confirm("¿SEGURO? Esto forzará el cierre de esta sesión corrupta.")) return;
        await db.dailyCloses.update(id, {
            status: 'closed',
            date: new Date(),
            closedBy: 'ADMIN_FORCE_FIX'
        });
        window.location.reload();
    };

    return (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
            <p className="text-xs text-red-300 font-bold">
                ⚠️ Se detectaron {ghosts.length} sesiones abiertas. Si el botón "Cierre de Caja" no funciona, usa estos botones para limpiar el sistema.
            </p>
            {ghosts.map(session => (
                <div key={session.id} className="flex justify-between items-center bg-black/40 p-2 rounded gap-4">
                    <div className="text-xs text-gray-300 font-mono">
                        ID: {session.id} | Inicio: {session.startTime ? new Date(session.startTime).toLocaleString() : 'S/F'} | Status: {session.status}
                    </div>
                    <button
                        onClick={() => session.id && forceClose(session.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-bold uppercase transition-colors"
                    >
                        Forzar Cierre
                    </button>
                </div>
            ))}
        </div>
    )
}
