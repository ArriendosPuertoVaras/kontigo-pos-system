'use client';

import { useState, useEffect } from 'react';
import { db, RestaurantConfig } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Save, FileKey, ShieldCheck, AlertTriangle, Upload, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DteConfigSection() {
    // Fetch existing config (Multi-tenant aware: assumes user is filtered by SyncService in valid context, 
    // but locally we just get the first record or the one matching local storage if we tracked it rigorously.
    // For now, simpler approach: Get the one config record.)
    const config = useLiveQuery(() => db.restaurantConfig.toCollection().first());

    // Local State for Form
    const [formData, setFormData] = useState<Partial<RestaurantConfig>>({
        siiEnvironment: 'certificacion',
        businessName: '',
        rut: '',
        address: ''
    });

    const [isSaving, setIsSaving] = useState(false);

    // Sync Form with DB
    useEffect(() => {
        if (config) {
            setFormData(config);
        }
    }, [config]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const restaurantId = localStorage.getItem('kontigo_restaurant_id') || 'local_override';

            if (config) {
                // Update
                await db.restaurantConfig.update(config.id!, {
                    ...formData,
                    restaurantId
                });
            } else {
                // Create
                await db.restaurantConfig.add({
                    ...formData,
                    restaurantId
                } as RestaurantConfig);
            }

            // Trigger Auto-Sync
            const { syncService } = await import('@/lib/sync_service');
            await syncService.autoSync(db.restaurantConfig, 'restaurant_config');

            toast.success("Configuración Tributaria Guardada");
        } catch (e: any) {
            console.error(e);
            toast.error("Error guardando configuración: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Verify Extension
        if (!file.name.endsWith('.p12')) {
            toast.error("El certificado debe ser un archivo .p12");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            // Store base64 in state
            setFormData(prev => ({ ...prev, siiCertificateP12: base64 }));
            toast.success("Certificado cargado (Pendiente guardar)");
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="bg-[#2a2a2a] border border-white/5 rounded-xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-toast-orange" />
                        Identidad Tributaria & DTE
                    </h3>
                    <p className="text-sm text-gray-400">Configura los datos del SII para la emisión de boletas legales.</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border
                    ${formData.siiEnvironment === 'produccion'
                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'}`}>
                    <ShieldCheck className="w-4 h-4" />
                    {formData.siiEnvironment === 'produccion' ? 'Producción (Legal)' : 'Certificación (Test)'}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. Datos Básicos */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">Datos Empresa</h4>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1">
                            <label className="text-xs text-blue-200 block mb-1">RUT Empresa</label>
                            <input
                                value={formData.rut || ''}
                                onChange={e => setFormData({ ...formData, rut: e.target.value })}
                                placeholder="76.xxx.xxx-x"
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-toast-orange outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-blue-200 block mb-1">Razón Social</label>
                            <input
                                value={formData.businessName || ''}
                                onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                                placeholder="Mi Restaurant SpA"
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-toast-orange outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-blue-200 block mb-1">Dirección Casa Matriz</label>
                        <input
                            value={formData.address || ''}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Av. Providencia 1234, Santiago"
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-toast-orange outline-none"
                        />
                    </div>
                </div>

                {/* 2. Credenciales SII */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">Credenciales Digitales</h4>

                    <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                        <label className="text-xs text-blue-200 block mb-2 flex items-center justify-between">
                            <span>Certificado Digital (.p12)</span>
                            {formData.siiCertificateP12 && <span className="text-green-400 flex items-center gap-1 text-[10px]"><CheckCircle2 className="w-3 h-3" /> Cargado</span>}
                        </label>

                        <div className="relative group">
                            <input
                                type="file"
                                accept=".p12"
                                onChange={handleFileUpload}
                                className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-toast-orange/10 file:text-toast-orange hover:file:bg-toast-orange/20 cursor-pointer"
                            />
                            <div className="absolute top-0 right-0 p-2 opacity-50">
                                <FileKey className="w-5 h-5 text-gray-500" />
                            </div>
                        </div>

                        <div className="mt-3">
                            <label className="text-xs text-blue-200 block mb-1">Contraseña del Certificado</label>
                            <input
                                type="password"
                                value={formData.siiCertificatePassword || ''}
                                onChange={e => setFormData({ ...formData, siiCertificatePassword: e.target.value })}
                                placeholder="••••••••"
                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-toast-orange outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4 bg-yellow-500/5 p-3 rounded-lg border border-yellow-500/10">
                        <div className="p-2 bg-yellow-500/10 rounded-full">
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-yellow-500 block mb-0.5">Ambiente SII</label>
                            <select
                                value={formData.siiEnvironment}
                                onChange={e => setFormData({ ...formData, siiEnvironment: e.target.value as any })}
                                className="bg-transparent text-sm text-yellow-200 outline-none w-full cursor-pointer"
                            >
                                <option value="certificacion" className="bg-[#2a2a2a]">Certificación (Pruebas)</option>
                                <option value="produccion" className="bg-[#2a2a2a]">Producción (Real)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-white/5 pt-4 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-toast-orange hover:bg-orange-600 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all"
                >
                    {isSaving ? <Upload className="w-4 h-4 animate-bounce" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>
        </div>
    );
}
