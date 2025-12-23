'use client';
import ProductionDashboard from '@/components/ProductionDashboard';
import { usePermission } from '@/hooks/usePermission';
import Sidebar from '@/components/Sidebar';
import { Lock } from 'lucide-react';
import Link from 'next/link';

export default function ProductionPage() {
    const hasAccess = usePermission('admin:view');

    if (hasAccess === false) {
        return (
            <div className="flex h-screen w-full bg-[#1e1e1e]">
                <Sidebar />
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                        <Lock className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Acceso Restringido</h2>
                    <p className="text-gray-400 max-w-md mb-8">
                        No tienes permisos para ver el Plan de Producción.
                    </p>
                    <Link href="/">
                        <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold transition-all">
                            Volver al Inicio
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    return <ProductionDashboard />;
}
