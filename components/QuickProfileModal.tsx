'use client';

import { useState, useEffect } from 'react';
import { db, Staff } from '@/lib/db';
import { X, Lock, User, AtSign, Save } from 'lucide-react';
import { toast } from 'sonner';

interface QuickProfileModalProps {
    onClose: () => void;
}

export default function QuickProfileModal({ onClose }: QuickProfileModalProps) {
    const [staff, setStaff] = useState<Staff | null>(null);
    const [newPin, setNewPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const id = sessionStorage.getItem('kontigo_staff_id');
        if (id) {
            db.staff.get(parseInt(id)).then(s => {
                if (s) setStaff(s);
            });
        }
    }, []);

    const handleSave = async () => {
        if (!staff?.id) return;
        if (newPin.length !== 4) {
            toast.error("El PIN debe tener 4 dígitos");
            return;
        }

        setIsLoading(true);
        try {
            await db.staff.update(staff.id, { pin: newPin });
            toast.success("PIN actualizado correctamente");
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar");
        }
        setIsLoading(false);
    };

    if (!staff) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-[#1e1e1e] rounded-2xl border border-white/10 w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-[#252525] px-6 py-4 flex justify-between items-center border-b border-white/5">
                    <h3 className="text-lg font-bold text-white">Mi Perfil</h3>
                    <div className="flex gap-2">
                        <a href="/staff/schedule" className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-toast-orange border border-toast-orange/20 flex items-center gap-2">
                            <span className="hidden sm:inline">Ver Mis Turnos</span>
                            📅
                        </a>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* AVATAR + NAME */}
                    <div className="flex flex-col items-center">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg mb-3 ${staff.avatarColor || 'bg-gradient-to-br from-toast-orange to-orange-700'}`}>
                            {staff.name.substring(0, 2).toUpperCase()}
                        </div>
                        <h2 className="text-xl font-bold text-white text-center">{staff.name}</h2>
                        <span className="text-xs font-bold text-toast-orange uppercase tracking-wider bg-toast-orange/10 px-3 py-1 rounded-full mt-1 border border-toast-orange/20">
                            {staff.activeRole || staff.role}
                        </span>
                    </div>

                    {/* DETAILS */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg border border-white/5">
                            <AtSign className="w-5 h-5 text-gray-500" />
                            <div className="flex-1">
                                <p className="text-[10px] uppercase font-bold text-gray-500">Email (Personal)</p>
                                <p className="text-sm text-gray-300 truncate">{staff.email || 'No registrado'}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg border border-white/5">
                            <Lock className="w-5 h-5 text-toast-blue" />
                            <div className="flex-1">
                                <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Actualizar PIN</p>
                                <input
                                    type="text"
                                    maxLength={4}
                                    placeholder="Nuevo PIN (4 dígitos)"
                                    className="bg-transparent border-b border-white/20 w-full text-white focus:outline-none focus:border-toast-blue transition-colors text-lg tracking-widest font-mono"
                                    value={newPin}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 4) setNewPin(val);
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        Tu PIN actual: <span className="font-mono text-white">****</span> (Oculto)
                    </p>

                    <button
                        onClick={handleSave}
                        disabled={newPin.length !== 4 || isLoading}
                        className="w-full py-3 bg-toast-orange hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                    >
                        {isLoading ? (
                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Guardar Cambios
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
