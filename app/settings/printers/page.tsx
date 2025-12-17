'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Printer } from '@/lib/db';
import { ArrowLeft, Printer as PrinterIcon, Plus, Trash2, Check, Wifi } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

export default function PrintersPage() {
    const router = useRouter();
    const printers = useLiveQuery(() => db.printers.toArray());
    const categories = useLiveQuery(() => db.categories.toArray());

    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [newIp, setNewIp] = useState("192.168.1.200");
    const [selectedCats, setSelectedCats] = useState<string[]>([]);

    const toggleCat = (catName: string) => {
        if (selectedCats.includes(catName)) {
            setSelectedCats(prev => prev.filter(c => c !== catName));
        } else {
            setSelectedCats(prev => [...prev, catName]);
        }
    };

    const handleSave = async () => {
        if (!newName || !newIp || selectedCats.length === 0) {
            alert("Completa todos los campos y selecciona al menos una categoría.");
            return;
        }

        await db.printers.add({
            name: newName,
            ip: newIp,
            categories: selectedCats,
            type: 'network'
        });

        setIsAdding(false);
        setNewName("");
        setSelectedCats([]);
    };

    const handleDelete = async (id: number) => {
        if (confirm("¿Eliminar impresora?")) {
            await db.printers.delete(id);
        }
    };

    return (
        <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">

            {/* SIDEBAR (Simple) */}
            <aside className="w-[90px] bg-toast-charcoal-dark flex flex-col items-center py-6 border-r border-white/5 z-20 shadow-xl">
                <nav className="flex flex-col gap-2 w-full px-2">
                    <Link href="/" className="flex flex-col items-center justify-center w-full aspect-square rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                        <ArrowLeft className="w-7 h-7 mb-1" />
                        <span className="text-[10px] font-bold uppercase">Volver</span>
                    </Link>
                </nav>
            </aside>

            <main className="flex-1 p-10 bg-[#2a2a2a] overflow-y-auto">
                <Header title="Configuración de Impresoras" />
                <div className="mb-8">
                    <p className="text-gray-400">Define dónde se imprimen los pedidos de cocina y bar.</p>
                </div>

                <div className="grid grid-cols-12 gap-8">
                    {/* LIST */}
                    <div className="col-span-8 space-y-4">
                        {printers?.map(p => (
                            <div key={p.id} className="bg-toast-charcoal p-6 rounded-xl border border-white/5 flex justify-between items-center group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                                        <PrinterIcon className="text-gray-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{p.name}</h3>
                                        <div className="flex items-center gap-2 text-sm text-gray-400 font-mono">
                                            <Wifi className="w-3 h-3" /> {p.ip}
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                            {p.categories.map(cat => (
                                                <span key={cat} className="text-[10px] font-bold bg-toast-blue/10 text-toast-blue px-2 py-1 rounded border border-toast-blue/20">
                                                    {cat}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(p.id!)} className="p-3 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-500 transition-colors">
                                    <Trash2 />
                                </button>
                            </div>
                        ))}

                        {printers?.length === 0 && !isAdding && (
                            <div className="text-center py-10 opacity-50">
                                <p>No hay impresoras configuradas.</p>
                            </div>
                        )}
                    </div>

                    {/* ADD FORM */}
                    <div className="col-span-4">
                        {!isAdding ? (
                            <button onClick={() => setIsAdding(true)} className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-white hover:border-toast-orange hover:bg-white/5 transition-all">
                                <Plus /> Agregar Impresora
                            </button>
                        ) : (
                            <div className="bg-toast-charcoal p-6 rounded-xl border border-white/10 shadow-2xl animate-in zoom-in-95">
                                <h3 className="font-bold text-lg mb-4 text-white">Nueva Impresora</h3>

                                <label className="block text-xs uppercase text-gray-500 font-bold mb-1">Nombre</label>
                                <input type="text" placeholder="Ej. Cocina Fría" className="w-full bg-black/30 border border-white/10 rounded p-3 mb-4 text-white" value={newName} onChange={e => setNewName(e.target.value)} />

                                <label className="block text-xs uppercase text-gray-500 font-bold mb-1">Dirección IP</label>
                                <input type="text" placeholder="192.168.1.X" className="w-full bg-black/30 border border-white/10 rounded p-3 mb-4 text-white font-mono" value={newIp} onChange={e => setNewIp(e.target.value)} />

                                <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Categorías Asignadas</label>
                                <div className="grid grid-cols-2 gap-2 mb-6">
                                    {categories?.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => toggleCat(cat.name)}
                                            className={`p-2 rounded text-xs font-bold border transition-colors
                                                ${selectedCats.includes(cat.name)
                                                    ? 'bg-toast-orange text-white border-toast-orange'
                                                    : 'border-white/10 text-gray-400 hover:bg-white/5'}`}
                                        >
                                            {cat.name}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-bold text-gray-400">Cancelar</button>
                                    <button onClick={handleSave} className="flex-1 py-3 bg-toast-green hover:bg-green-600 rounded-lg font-bold text-white shadow-lg">Guardar</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </main>
        </div>
    );
}
