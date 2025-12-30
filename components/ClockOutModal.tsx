'use client';
import { useState, useEffect } from 'react';
import { db, Staff } from '@/lib/db';
import { X, LogOut, AlertTriangle, Loader, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ClockOutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ClockOutModal({ isOpen, onClose }: ClockOutModalProps) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (isOpen) {
            setPin('');
            setError('');
            setLoading(false);
            setSuccess(false);
        }
    }, [isOpen]);

    const handleClockOut = async () => {
        if (pin.length < 4) return;
        setLoading(true);
        setError('');

        try {
            // 1. Find staff by PIN
            const staff = await db.staff.where('pin').equals(pin).first();

            if (!staff) {
                // DEBUG: Help user find their PIN
                const currentStaffId = sessionStorage.getItem('kontigo_staff_id');
                if (currentStaffId) {
                    const actualStaff = await db.staff.get(parseInt(currentStaffId));
                    if (actualStaff) {
                        setError(`PIN Incorrecto. (Tu PIN actual es: ${actualStaff.pin})`);
                        setLoading(false);
                        return;
                    }
                }
                setError('PIN Incorrecto');
                setLoading(false);
                return;
            }

            // 2. Find active shift for this staff
            const activeShift = await db.shifts
                .where('staffId').equals(staff.id!)
                .filter(s => !s.endTime)
                .first();

            if (!activeShift) {
                setError('No tienes un turno activo para cerrar.');
                setLoading(false);
                return;
            }

            // 3. Close Shift
            await db.shifts.update(activeShift.id!, {
                endTime: new Date()
            });

            // 4. Success UI
            setSuccess(true);

            // 5. Logout? The user asked "close shift... exit".
            // We'll wait a moment then redirect or close.
            setTimeout(() => {
                // If the current logged in user is the one clocking out, we should logout.
                // But the user might be clocking out while manager is logged in?
                // The requirement: "tengan que poner su clave y usuario para salir".
                // This implies logging out.

                // If it's the current session user:
                const sessionStaffId = sessionStorage.getItem('kontigo_staff_id');
                if (sessionStaffId && parseInt(sessionStaffId) === staff.id) {
                    sessionStorage.removeItem('kontigo_staff_id');
                    router.push('/login');
                } else {
                    // Just close modal if it was someone else (unlikely case but handle it)
                    onClose();
                    // Optional: Force reload to update UI state if needed
                    window.location.reload();
                }
            }, 2000);

        } catch (err) {
            console.error(err);
            setError('Error al procesar salida.');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] w-full max-w-sm rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#252525]">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <LogOut className="w-4 h-4 text-red-400" />
                        Cerrar Turno
                    </h3>
                    {!success && <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>}
                </div>

                <div className="p-8 text-center space-y-6">
                    {success ? (
                        <div className="animate-in zoom-in py-8">
                            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-white">¡Turno Cerrado!</h2>
                            <p className="text-gray-400 mt-2">Hasta la próxima.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <p className="text-gray-400 text-sm mb-4">
                                    Ingresa tu PIN para registrar tu salida y cerrar el turno.
                                </p>
                                <input
                                    type="password"
                                    autoFocus
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={pin}
                                    onChange={(e) => { setPin(e.target.value); setError(''); }}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-4 text-center text-4xl tracking-[1em] text-white focus:ring-2 focus:ring-red-500 outline-none font-mono"
                                    placeholder="••••"
                                />
                                {error && <p className="text-red-400 text-xs mt-3 font-bold animate-pulse flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> {error}</p>}
                            </div>

                            <button
                                disabled={pin.length < 4 || loading}
                                onClick={handleClockOut}
                                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                                ${pin.length === 4
                                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20 hover:bg-red-500 hover:scale-[1.02]'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                                {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'CONFIRMAR SALIDA'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
