'use client';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { generateMockData } from '@/lib/mock_generator';
import { db } from '@/lib/db';
import { Trash2, Database, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePermission } from '@/hooks/usePermission';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
    const router = useRouter();
    const canAccess = usePermission('admin:settings');
    const [isSimulating, setIsSimulating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (canAccess === false) { // Check explicitly for false (loading is undefined)
            // router.push('/'); // Uncomment to strict redirect, for now just hiding content
        }
    }, [canAccess]);

    if (canAccess === false) {
        return (
            <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans relative">
                <Sidebar />
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Acceso Restringido</h2>
                    <p className="text-gray-400 max-w-md mb-8">No tienes permisos para ver esta sección.</p>
                    <button
                        onClick={() => router.push('/')}
                        className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold transition-all"
                    >
                        Volver al Inicio
                    </button>
                </div>
            </div>
        )
    }

    const handleSimulate = async () => {
        setIsSimulating(true);
        try {
            await generateMockData(new Date());
            alert('Datos Simulados Cargados 🚀');
            window.location.reload();
        } catch (err: any) {
            console.error('Error al generar datos: ' + err.message);
            alert('Error: ' + err.message);
        } finally {
            setIsSimulating(false);
        }
    };

    const handleWipeData = async () => {
        if (!confirm("⚠️ ¿BOMBA NUCLEAR? ☢️\n\nEsto borrará la base de datos 'Kontigo_Final' NIVEL NAVEGADOR.\n\nEs la opción más destructiva posible.")) return;

        setIsDeleting(true);
        try {
            console.log("💣 Closing DB connection...");
            db.close();

            console.log("💣 Nuking 'Kontigo_Final'...");
            await new Promise<void>((resolve, reject) => {
                const req = window.indexedDB.deleteDatabase('Kontigo_Final');
                req.onsuccess = () => {
                    console.log("✅ Database Deleted Successfully");
                    resolve();
                };
                req.onerror = (e) => {
                    console.error("❌ Delete Failed", e);
                    reject(e);
                };
                req.onblocked = () => {
                    console.warn("⚠️ Delete Blocked (Close other tabs)");
                };
            });

            console.log("💣 Clearing LocalStorage...");
            localStorage.clear();

            alert("Exito. Reiniciando Sistema...");
            window.location.href = '/';

        } catch (e) {
            console.error("Error clearing DB:", e);
            alert("Error al borrar datos. Intenta nuevamente.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex h-screen w-full bg-[#1a1a1a] text-white font-sans relative">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <Header title="Ajustes Generales" />

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-4xl mx-auto space-y-8">

                        {/* DATA MANAGEMENT SECTION */}
                        <div className="bg-[#2a2a2a] border border-white/5 rounded-xl p-6 shadow-xl">
                            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                <Database className="w-5 h-5 text-toast-orange" />
                                Gestión de Datos
                            </h3>
                            <p className="text-sm text-gray-400 mb-6">Controla los datos de prueba y limpieza del sistema.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* SIMULATE */}
                                <div className="bg-black/20 p-4 rounded-lg border border-white/5 flex flex-col justify-between">
                                    <div>
                                        <h4 className="font-bold text-white mb-2">Simular Datos de Prueba</h4>
                                        <p className="text-xs text-gray-500 mb-4">Genera pedidos, ventas y movimientos históricos para probar dashboards.</p>
                                    </div>
                                    <button
                                        onClick={handleSimulate}
                                        disabled={isSimulating}
                                        className="w-full py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold transition shadow-lg shadow-purple-900/20 disabled:opacity-50"
                                    >
                                        {isSimulating ? 'Generando...' : 'Generar Datos Demo'}
                                    </button>
                                </div>

                                {/* WIPE */}
                                <div className="bg-red-500/5 p-4 rounded-lg border border-red-500/10 flex flex-col justify-between">
                                    <div>
                                        <h4 className="font-bold text-red-400 mb-2 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            Zona de Peligro
                                        </h4>
                                        <p className="text-xs text-red-400/70 mb-4">Borra permanentemente toda la base de datos local del navegador.</p>
                                    </div>
                                    <button
                                        onClick={handleWipeData}
                                        disabled={isDeleting}
                                        className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        {isDeleting ? 'Borrando...' : 'Borrar Todo (Factory Reset)'}
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
