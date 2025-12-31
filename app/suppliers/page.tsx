'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Supplier } from '@/lib/db';
import { UtensilsCrossed, Settings, Truck, Mail, Phone, Clock, ArrowLeft, Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { usePermission } from '@/hooks/usePermission';
import Sidebar from '@/components/Sidebar';

export default function SuppliersPage() {
    const hasAccess = usePermission('admin:view');
    const router = useRouter();
    const suppliers = useLiveQuery(() => db.suppliers.toArray());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Supplier>>({});

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
                        No tienes permisos para gestionar proveedores.
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name && formData.category) {
            const id = await db.suppliers.add({
                name: formData.name,
                category: formData.category,
                email: "",
                phone: "",
                contactName: "",
                leadTimeDays: 1
            } as Supplier);

            // Trigger sync
            const { syncService } = await import('@/lib/sync_service');
            await syncService.autoSync(db.suppliers, 'suppliers');

            setIsModalOpen(false);
            setFormData({});
            router.push(`/suppliers/${id}`);
        }
    };

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">
            {/* SIDEBAR (Mini Version for Navigation context) */}
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
                <Header title="Gestión de Proveedores">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-toast-orange hover:brightness-110 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 h-10"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Proveedor
                    </button>
                </Header>

                {/* CONTENT GRID */}
                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {suppliers?.map(supplier => (
                            <div key={supplier.id} className="bg-toast-charcoal p-4 rounded-xl border border-white/5 shadow-lg hover:border-white/10 transition-colors group relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-50 text-[100px] leading-none text-white/5 -rotate-12 select-none group-hover:scale-110 transition-transform">
                                    <Truck />
                                </div>

                                {/* Edit Actions */}
                                <div className="absolute z-20 top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Link href={`/suppliers/${supplier.id}`}>
                                        <button className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white backdrop-blur-sm">
                                            <Settings className="w-4 h-4" />
                                        </button>
                                    </Link>
                                </div>

                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <span className="text-xs font-bold text-toast-orange bg-toast-orange/10 px-2 py-1 rounded uppercase tracking-wider mb-2 inline-block">
                                                {supplier.category}
                                            </span>
                                            <h3 className="text-xl font-bold text-white">{supplier.name}</h3>
                                        </div>
                                    </div>

                                    <div className="space-y-3 text-gray-400 text-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                                <span className="font-bold text-white/70">{(supplier.contactName || '?').slice(0, 2).toUpperCase()}</span>
                                            </div>
                                            <div>
                                                <p className="text-white font-medium">{supplier.contactName || 'Sin Contacto'}</p>
                                                <p className="text-xs">Contacto Principal</p>
                                            </div>
                                        </div>
                                        <div className="h-px bg-white/5 my-2"></div>
                                        <div className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer">
                                            <Mail className="w-4 h-4" /> {supplier.email || '-'}
                                        </div>
                                        <div className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer">
                                            <Phone className="w-4 h-4" /> {supplier.phone || '-'}
                                        </div>
                                        <div className="flex items-center gap-2 text-yellow-500/80">
                                            <Clock className="w-4 h-4" /> Entrega: {supplier.leadTimeDays || 1} {supplier.leadTimeDays === 1 ? 'día' : 'días'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* EMPTY STATE */}
                        {suppliers && suppliers.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500 opacity-50">
                                <Truck className="w-20 h-20 mb-4" />
                                <p className="text-xl">No hay proveedores registrados</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* MODAL */}
            {isModalOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <form onSubmit={handleSubmit} className="bg-toast-charcoal-dark w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-8 animate-in zoom-in-95">
                        <h2 className="text-2xl font-bold text-white mb-6">Nuevo Proveedor</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Empresa</label>
                                <input required type="text" placeholder="Ej: Distribuidora Central"
                                    className="w-full bg-toast-charcoal border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-toast-orange focus:ring-1 focus:ring-toast-orange transition-all"
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Categoría</label>
                                <input required type="text" placeholder="Ej: Carnes"
                                    className="w-full bg-toast-charcoal border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-toast-orange transition-all"
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded-lg font-bold text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" className="flex-1 bg-toast-orange hover:brightness-110 text-white font-bold py-3 rounded-lg shadow-lg">
                                Crear & Editar
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
