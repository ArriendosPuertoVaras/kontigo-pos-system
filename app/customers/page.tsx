'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Customer } from '@/lib/db';
import { UtensilsCrossed, ArrowLeft, Users, Plus, Search, Star, Phone, Mail, Edit2 } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useRouter } from 'next/navigation';

export default function CustomersPage() {
    const router = useRouter();
    // Queries
    const customers = useLiveQuery(() => db.customers.toArray());

    // Local State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [formData, setFormData] = useState<Partial<Customer>>({});

    // Derived State
    const filteredCustomers = customers?.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
    ) || [];

    const topSpenders = [...(customers || [])].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 3);

    // --- ACTIONS ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name && formData.phone) {
            const id = await db.customers.add({
                name: formData.name,
                phone: formData.phone,
                email: formData.email || "",
                notes: "",
                totalSpent: 0,
                visitCount: 0,
                lastVisit: new Date()
            } as Customer);

            // Sync
            const { syncService } = await import('@/lib/sync_service');
            await syncService.autoSync(db.customers, 'customers');

            setIsModalOpen(false);
            setFormData({});
            router.push(`/customers/${id}`);
        }
    };

    const openNewModal = () => {
        setFormData({});
        setIsModalOpen(true);
    };

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
                    <Link href="/" className="flex flex-col items-center justify-center w-full aspect-square rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                        <ArrowLeft className="w-7 h-7 mb-1" />
                        <span className="text-[10px] font-bold uppercase">Volver</span>
                    </Link>
                </nav>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col h-full bg-[#2a2a2a] overflow-hidden">
                <Header title="Base de Clientes">
                    <button onClick={openNewModal} className="bg-toast-orange hover:brightness-110 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 h-10">
                        <Plus className="w-5 h-5" /> Nuevo Cliente
                    </button>
                </Header>

                <div className="flex-1 p-8 overflow-y-auto grid grid-cols-12 gap-6">

                    {/* LEFT: STATS & SUMMARY */}
                    <div className="col-span-4 space-y-6">
                        {/* SEARCH */}
                        <div className="relative">
                            <Search className="absolute left-4 top-3.5 text-gray-500 w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o teléfono..."
                                className="w-full bg-toast-charcoal border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-toast-orange transition-all shadow-inner"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="bg-toast-charcoal p-6 rounded-xl border border-white/5">
                            <h3 className="text-gray-400 text-sm font-bold uppercase mb-4 flex items-center gap-2">
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                Mejores Clientes (VIP)
                            </h3>
                            <div className="space-y-4">
                                {topSpenders.map((customer, idx) => (
                                    <div key={customer.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer" onClick={() => router.push(`/customers/${customer.id}`)}>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center font-bold text-yellow-500 border border-yellow-500/30">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-white">{customer.name}</p>
                                            <p className="text-xs text-toast-green font-mono">${customer.totalSpent.toLocaleString()}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs text-gray-400 font-bold">{customer.visitCount}</p>
                                            <p className="text-[10px] text-gray-600 uppercase">Visitas</p>
                                        </div>
                                    </div>
                                ))}
                                {topSpenders.length === 0 && <p className="text-sm text-gray-500 italic">No hay datos suficientes.</p>}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: CUSTOMER GRID */}
                    <div className="col-span-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredCustomers.map(customer => (
                                <Link href={`/customers/${customer.id}`} key={customer.id}>
                                    <div className="bg-toast-charcoal p-5 rounded-xl border border-white/5 hover:border-white/20 transition-all group relative cursor-pointer h-full">
                                        <div className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </div>

                                        <div className="flex items-start gap-4 mb-4">
                                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-lg font-bold text-gray-400">
                                                {customer.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-lg leading-tight">{customer.name}</h3>
                                                <div className="flex items-center gap-2 text-gray-500 text-xs mt-1">
                                                    <Phone className="w-3 h-3" /> {customer.phone}
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-500 text-xs mt-0.5">
                                                    <Mail className="w-3 h-3" /> {customer.email}
                                                </div>
                                            </div>
                                        </div>

                                        {customer.notes && (
                                            <div className="bg-yellow-500/10 border border-yellow-500/10 rounded-lg p-3 mb-3">
                                                <p className="text-xs text-yellow-200/80 italic">"{customer.notes}"</p>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center pt-3 border-t border-white/5 absolute bottom-4 left-5 right-5">
                                            <div className="text-xs">
                                                <span className="text-gray-500">Última visita: </span>
                                                <span className="text-gray-300">{customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'N/A'}</span>
                                            </div>
                                            <div className="text-xs font-mono font-bold text-toast-green bg-toast-green/10 px-2 py-1 rounded">
                                                ${customer.totalSpent.toLocaleString()}
                                            </div>
                                        </div>
                                        {/* Spacer for absolute bottom */}
                                        <div className="h-6"></div>
                                    </div>
                                </Link>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <div className="col-span-full py-20 text-center text-gray-500">
                                    <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>No se encontraron clientes.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </main>

            {/* MODAL */}
            {isModalOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <form onSubmit={handleSubmit} className="bg-toast-charcoal-dark w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-8 animate-in zoom-in-95">
                        <h2 className="text-2xl font-bold text-white mb-6">Nuevo Cliente</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
                                <input required type="text" placeholder="Ej: Ricardo Peralta"
                                    className="w-full bg-toast-charcoal border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-toast-orange focus:ring-1 focus:ring-toast-orange transition-all"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono</label>
                                <input required type="tel" placeholder="+569..."
                                    className="w-full bg-toast-charcoal border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-toast-orange transition-all"
                                    value={formData.phone || ''}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
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
