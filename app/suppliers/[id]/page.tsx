'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, Supplier } from '@/lib/db';
import { ArrowLeft, Truck, Mail, Phone, Calendar, RefreshCw, ShieldCheck, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function SupplierDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params?.id);
    const supplier = useLiveQuery(() => db.suppliers.get(id), [id]);

    const [formData, setFormData] = useState<Partial<Supplier>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (supplier) setFormData(supplier);
    }, [supplier]);

    // --- AUTO-SAVE ---
    useEffect(() => {
        if (!id || Object.keys(formData).length === 0) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                await db.suppliers.update(id, formData);
                const { syncService } = await import('@/lib/sync_service');
                await syncService.autoSync(db.suppliers, 'suppliers');
            } catch (error) {
                console.error("Auto-save failed", error);
            } finally {
                setIsSaving(false);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [formData, id]);

    const handleDelete = async () => {
        if (confirm("¿Estás seguro de eliminar este proveedor?")) {
            if (id) {
                await db.suppliers.delete(id);
                const { syncService } = await import('@/lib/sync_service');
                await syncService.pushAll();
                router.push('/suppliers');
            }
        }
    };

    if (!supplier) return <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">Cargando...</div>;

    const handleChange = (field: keyof Supplier, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans p-4 pb-48 overflow-y-auto">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/suppliers" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{formData.name}</h1>
                        <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                            <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] uppercase">{formData.category || 'General'}</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Auto-Save Indicator */}
                    {isSaving ? (
                        <span className="text-xs text-toast-orange font-bold animate-pulse flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Guardando...
                        </span>
                    ) : (
                        <span className="text-xs text-green-500 font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Sincronizado
                        </span>
                    )}

                    <button
                        onClick={handleDelete}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 border border-red-500/20">
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Datos Empresa */}
                <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center gap-2 text-toast-orange border-b border-white/5 pb-2">
                        <Truck className="w-4 h-4" />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Datos Empresa</h2>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Nombre Empresa</label>
                        <input
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                            value={formData.name || ''}
                            onChange={e => handleChange('name', e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Categoría</label>
                            <input
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                value={formData.category || ''}
                                onChange={e => handleChange('category', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Días Entrega</label>
                            <div className="relative">
                                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 w-3 h-3" />
                                <input
                                    type="number"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-7 pr-2 py-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.leadTimeDays || 1}
                                    onChange={e => handleChange('leadTimeDays', Number(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Contacto */}
                <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center gap-2 text-blue-400 border-b border-white/5 pb-2">
                        <User className="w-4 h-4" />
                        <h2 className="font-bold text-sm uppercase tracking-wider">Contacto Principal</h2>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Nombre Contacto</label>
                        <input
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                            value={formData.contactName || ''}
                            onChange={e => handleChange('contactName', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 w-3 h-3" />
                                <input
                                    type="email"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-7 pr-2 py-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.email || ''}
                                    onChange={e => handleChange('email', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Teléfono</label>
                            <div className="relative">
                                <Phone className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 w-3 h-3" />
                                <input
                                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-7 pr-2 py-2 text-white text-sm focus:border-toast-orange outline-none"
                                    value={formData.phone || ''}
                                    onChange={e => handleChange('phone', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
