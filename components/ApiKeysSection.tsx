'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Key, Copy, Plus, Trash2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export default function ApiKeysSection() {
    const apiKeys = useLiveQuery(() => db.apiKeys.toArray());
    const [isGenerating, setIsGenerating] = useState(false);
    const [showKey, setShowKey] = useState<number | null>(null);

    const generateKey = async () => {
        setIsGenerating(true);
        try {
            const restaurantId = localStorage.getItem('kontigo_restaurant_id') || 'unknown';
            const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const key = `sk_live_${randomPart}`;

            await db.apiKeys.add({
                name: "Nueva API Key",
                key_hash: key,
                prefix: "sk_live",
                created_at: new Date(),
                status: 'active',
                restaurantId
            });

            // Trigger sync immediately so it works on backend
            const { syncService } = await import('@/lib/sync_service');
            await syncService.autoSync(db.apiKeys, 'api_keys');

            toast.success("Llave API Generada y Sincronizada");
        } catch (e) {
            console.error(e);
            toast.error("Error generando llave");
        } finally {
            setIsGenerating(false);
        }
    };

    const revokeKey = async (id: number) => {
        if (!confirm("¿Revocar esta llave? Dejará de funcionar inmediatamente.")) return;
        await db.apiKeys.update(id, { status: 'revoked' });
        // Trigger sync
        const { syncService } = await import('@/lib/sync_service');
        await syncService.autoSync(db.apiKeys, 'api_keys');
        toast.info("Llave revocada");
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copiado al portapapeles");
    };

    return (
        <div className="bg-[#2a2a2a] border border-white/5 rounded-xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Key className="w-5 h-5 text-green-400" />
                Conectividad API & Delivery
            </h3>
            <p className="text-sm text-gray-400 mb-6">Gestiona las llaves de acceso para integrar UberEats, Rappi o ERPs externos.</p>

            <div className="space-y-4">
                {apiKeys?.map(apiKey => (
                    <div key={apiKey.id} className="bg-black/20 p-4 rounded-lg border border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex-1 overflow-hidden">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`w-2 h-2 rounded-full ${apiKey.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></span>
                                <input
                                    className="bg-transparent text-sm font-bold text-white focus:outline-none focus:border-b border-white/20"
                                    defaultValue={apiKey.name}
                                    onBlur={(e) => db.apiKeys.update(apiKey.id!, { name: e.target.value })}
                                />
                                <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded uppercase tracking-wider">{apiKey.status}</span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-xs text-gray-400 bg-black/40 px-3 py-2 rounded border border-white/5 w-full">
                                {showKey === apiKey.id ? (
                                    <span className="truncate select-all">{apiKey.key_hash}</span>
                                ) : (
                                    <span className="truncate">sk_live_••••••••••••••••</span>
                                )}
                                <button onClick={() => setShowKey(showKey === apiKey.id ? null : apiKey.id!)} className="hover:text-white ml-auto">
                                    {showKey === apiKey.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => copyToClipboard(apiKey.key_hash)} className="hover:text-white">
                                    <Copy className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {apiKey.status === 'active' && (
                            <button
                                onClick={() => revokeKey(apiKey.id!)}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2 rounded-lg transition-colors"
                                title="Revocar Llave"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}

                {(!apiKeys || apiKeys.length === 0) && (
                    <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-white/10 rounded-lg">
                        No hay llaves activas. Crea una para comenzar.
                    </div>
                )}

                <button
                    onClick={generateKey}
                    disabled={isGenerating}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    Generar Nueva Llave API
                </button>
            </div>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-200">
                    <strong className="block mb-1 text-blue-300">¿Cómo usar esto?</strong>
                    Usa esta llave en el header <code>x-api-key</code> para autenticar tus peticiones POST a <code>/api/v1/orders</code>.
                </div>
            </div>
        </div>
    );
}
