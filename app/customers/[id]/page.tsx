'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, Customer } from '@/lib/db';
import { ArrowLeft, User, Phone, Mail, StickyNote, RefreshCw, ShieldCheck, Trash2, Trophy, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function CustomerDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params?.id);
    const customer = useLiveQuery(() => db.customers.get(id), [id]);

    const [formData, setFormData] = useState<Partial<Customer>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (customer) setFormData(customer);
    }, [customer]);

    // --- AUTO-SAVE ---
    useEffect(() => {
        if (!id || Object.keys(formData).length === 0) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                // Ensure ID is passed for update, though dexie uses key
                await db.customers.update(id, formData);

                const { syncService } = await import('@/lib/sync_service');
                await syncService.autoSync(db.customers, 'customers');
            } catch (error) {
                console.error("Auto-save failed", error);
            } finally {
                setIsSaving(false);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [formData, id]);

    const handleDelete = async () => {
        if (confirm("¿Estás seguro de eliminar este cliente?")) {
            if (id) {
                await db.customers.delete(id);
                const { syncService } = await import('@/lib/sync_service');
                await syncService.pushAll();
                router.push('/customers');
            }
        }
    };

    if (!customer) return <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">Cargando...</div>;

    const handleChange = (field: keyof Customer, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans p-4 pb-48 overflow-y-auto">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/customers" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{formData.name}</h1>
                        <p className="text-xs text-gray-400 font-mono">
                            Cliente #{id}
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

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* COLUMN 1: EDITABLE FIELDS */}
                <div className="col-span-1 md:col-span-2 space-y-6">
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-toast-orange border-b border-white/5 pb-2">
                            <User className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Datos Personales</h2>
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Nombre Completo</label>
                            <input
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white text-sm focus:border-toast-orange outline-none"
                                value={formData.name || ''}
                                onChange={e => handleChange('name', e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
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
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Notas / Preferencias</label>
                            <div className="relative">
                                <textarea
                                    rows={4}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-toast-orange outline-none resize-none"
                                    value={formData.notes || ''}
                                    onChange={e => handleChange('notes', e.target.value)}
                                    placeholder="Alergias, mesa preferida, etc."
                                />
                                <StickyNote className="absolute right-3 top-3 text-gray-600 w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUMN 2: STATS (Read Only) */}
                <div className="space-y-6">
                    <div className="bg-[#252525] p-5 rounded-xl border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 text-yellow-500 border-b border-white/5 pb-2">
                            <Trophy className="w-4 h-4" />
                            <h2 className="font-bold text-sm uppercase tracking-wider">Historial</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-black/20 p-4 rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="text-gray-400 text-xs">Total Gastado</p>
                                    <p className="text-2xl font-bold text-toast-green">${(formData.totalSpent || 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-black/20 p-4 rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="text-gray-400 text-xs">Visitas Totales</p>
                                    <p className="text-2xl font-bold text-white">{(formData.visitCount || 0)}</p>
                                </div>
                            </div>
                            <div className="bg-black/20 p-4 rounded-lg flex items-center gap-3">
                                <Calendar className="text-gray-500 w-8 h-8" />
                                <div>
                                    <p className="text-gray-400 text-xs text-right">Última Visita</p>
                                    <p className="text-sm font-bold text-white text-right">
                                        {formData.lastVisit ? new Date(formData.lastVisit).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
