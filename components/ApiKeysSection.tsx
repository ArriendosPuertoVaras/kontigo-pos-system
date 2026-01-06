'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Key, Copy, Plus, Trash2, Eye, EyeOff, ShieldAlert, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function ApiKeysSection() {
    const apiKeys = useLiveQuery(() => db.apiKeys.toArray());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
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

    const forceSync = async () => {
        setIsSyncing(true);
        const toastId = toast.loading("Forzando sincronización de llaves...");
        try {
            const { syncService } = await import('@/lib/sync_service');
            await syncService.pushTable(db.apiKeys, 'api_keys');
            toast.success("¡Sincronización Exitosa!", { id: toastId });
        } catch (e: any) {
            console.error(e);
            toast.error("Error sincronizando: " + (e.message || "Desconocido"), { id: toastId });
        } finally {
            setIsSyncing(false);
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
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Key className="w-5 h-5 text-green-400" />
                    Conectividad API & Delivery
                </h3>
            </div>

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

                <div className="flex gap-2">
                    <button
                        onClick={generateKey}
                        disabled={isGenerating}
                        className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" />
                        Generar Nueva Llave
                    </button>

                    <button
                        onClick={forceSync}
                        disabled={isSyncing}
                        className="w-12 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg flex items-center justify-center transition disabled:opacity-50"
                        title="Forzar Sincronización"
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* INTEGRATED TESTER: No Terminal Needed */}
            <div className="mt-8 pt-6 border-t border-white/5">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-blue-400" />
                    Probador de Integración
                </h4>
                <div className="bg-black/40 rounded-lg p-4 border border-white/5">
                    <p className="text-xs text-gray-400 mb-4">
                        Prueba que la API esté recibiendo pedidos correctamente sin usar código.
                    </p>
                    <button
                        onClick={async () => {
                            const activeKey = apiKeys?.find(k => k.status === 'active');
                            if (!activeKey) return toast.error("Necesitas una llave activa para probar");

                            const toastId = toast.loading("Diagnóstico de Nube en curso...");

                            try {
                                // 1. Check Cloud Sync First
                                const { createClient } = await import('@supabase/supabase-js');
                                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
                                const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
                                const supabase = createClient(supabaseUrl, supabaseKey);

                                const { data: cloudKey, error: cloudError } = await supabase
                                    .from('api_keys')
                                    .select('id')
                                    .eq('key_hash', activeKey.key_hash)
                                    .single();

                                if (cloudError || !cloudKey) {
                                    console.error("Cloud Check Failed:", cloudError);
                                    // SHOW EXACT ERROR TO USER FOR DEBUGGING
                                    const errMsg = cloudError?.message || "No encontrada";
                                    const errCode = cloudError?.code || "N/A";
                                    toast.error(`❌ Error Cloud: ${errMsg} (Code: ${errCode}). Intenta el botón de Sincronizar.`, { id: toastId, duration: 8000 });
                                    return;
                                }

                                // 2. Get Real Product
                                const realProduct = await db.products.filter(p => p.price > 0).first();
                                if (!realProduct) {
                                    toast.error("⚠️ Crea un producto en el menú para hacer la prueba.", { id: toastId });
                                    return;
                                }

                                // 3. Send Request
                                toast.loading(`Enviando pedido de: ${realProduct.name}...`, { id: toastId });
                                const res = await fetch('/api/v1/orders', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'x-api-key': activeKey.key_hash
                                    },
                                    body: JSON.stringify({
                                        source: "UberEats (Test)",
                                        subtotal: realProduct.price,
                                        tip: 0,
                                        total: realProduct.price,
                                        items: [
                                            {
                                                product: {
                                                    id: realProduct.id,
                                                    name: realProduct.name,
                                                    price: realProduct.price,
                                                    categoryId: realProduct.categoryId, // CRITICAL FOR KDS ROUTING
                                                    // FIX: Type error bypass
                                                    code: (realProduct as any).code || `GEN-${realProduct.id}`
                                                },
                                                quantity: 1,
                                                notes: "Sin cebolla (Prueba API)"
                                            }
                                        ]
                                    })
                                });

                                const data = await res.json();
                                if (res.ok) {
                                    toast.success("¡Éxito! Pedido en Cocina 👨‍🍳", { id: toastId });
                                } else {
                                    // SHOW DETAILS: data.details contains the real SQL error from the server
                                    toast.error(`Error API: ${data.error} (${data.details || ''})`, { id: toastId, duration: 8000 });
                                }
                            } catch (e: any) {
                                console.error(e);
                                toast.error("Error crítico: " + e.message, { id: toastId });
                            }
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2"
                    >
                        🚀 Simular Pedido con {apiKeys?.length ? "Producto Real" : "..."}
                    </button>
                </div>
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
