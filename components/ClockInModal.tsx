'use client';
import { useState, useEffect } from 'react';
import { db, Staff } from '@/lib/db';
import { X, User, ArrowRight, Loader, CheckCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ClockInModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ClockInModal({ isOpen, onClose, onSuccess }: ClockInModalProps) {
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            db.staff.toArray().then(setStaffList);
            setSelectedStaff(null);
            setPin('');
            setError('');
        }
    }, [isOpen]);

    // State for Attendance Mode
    const [mode, setMode] = useState<'in' | 'out'>('in');
    const [activeShiftId, setActiveShiftId] = useState<number | null>(null);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            db.staff.toArray().then(setStaffList);
            setSelectedStaff(null);
            setPin('');
            setError('');
            setSuccessMsg('');
            setMode('in');
            setLoading(false);
        }
    }, [isOpen]);

    const verifyAndProceed = async () => {
        if (!selectedStaff) return;
        setLoading(true);
        setError('');

        if (selectedStaff.pin !== pin) {
            setError('PIN Incorrecto');
            setLoading(false);
            return;
        }

        // Check for active shift
        const activeShift = await db.shifts
            .where('staffId').equals(selectedStaff.id!)
            .filter(s => !s.endTime)
            .first();

        if (activeShift) {
            // Found Active Shift -> Switch to CLOCK OUT mode
            setMode('out');
            setActiveShiftId(activeShift.id!);
            setLoading(false);
        } else {
            // No Active Shift -> Perform CLOCK IN immediately
            await performClockIn();
        }
    };

    const performClockIn = async () => {
        try {
            await db.shifts.add({
                staffId: selectedStaff!.id!,
                startTime: new Date(),
                type: 'work',
                scheduledStart: new Date(),
                isOvertime: false
            });
            setSuccessMsg('¡Entrada Registrada!');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err) {
            console.error(err);
            setError('Error al registrar entrada');
        } finally {
            setLoading(false);
        }
    };

    const performClockOut = async () => {
        setLoading(true);
        try {
            if (activeShiftId) {
                await db.shifts.update(activeShiftId, { endTime: new Date() });
                setSuccessMsg('¡Turno Cerrado!');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            }
        } catch (err) {
            setError('Error al cerrar turno');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] w-full max-w-md rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#252525]">
                    <h3 className="font-bold text-white">Registrar Entrada / Turno</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Step 1: Select Staff */}
                    {!selectedStaff ? (
                        <div className="grid grid-cols-2 gap-3">
                            {staffList.map(staff => (
                                <button
                                    key={staff.id}
                                    onClick={() => setSelectedStaff(staff)}
                                    className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex flex-col items-center gap-2 transition-colors">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-inner ${staff.avatarColor || 'bg-gray-600'}`}>
                                        {staff.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="text-sm font-medium text-gray-200">{staff.name}</span>
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500">{staff.role}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        // Step 2: Enter PIN
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${selectedStaff.avatarColor || 'bg-gray-600'}`}>
                                    {selectedStaff.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-white">{selectedStaff.name}</p>
                                    <button onClick={() => { setSelectedStaff(null); setPin(''); setError(''); }} className="text-xs text-blue-400 hover:underline">Cambiar usuario</button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-xs uppercase font-bold mb-2">Ingresa tu PIN</label>
                                <input
                                    type="password"
                                    autoFocus
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={pin}
                                    onChange={(e) => { setPin(e.target.value); setError(''); }}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-4 text-center text-3xl tracking-[1em] text-white focus:ring-2 focus:ring-toast-orange outline-none"
                                />
                                {error && <p className="text-red-400 text-xs mt-2 text-center font-bold animate-pulse">{error}</p>}
                            </div>

                            <button
                                disabled={pin.length < 4 || loading || !!successMsg}
                                onClick={mode === 'in' ? verifyAndProceed : performClockOut}
                                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                                ${pin.length === 4
                                        ? (mode === 'in' ? 'bg-toast-orange text-white' : 'bg-red-500 text-white')
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>

                                {loading ? <Loader className="w-5 h-5 animate-spin" /> :
                                    successMsg ? <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {successMsg}</span> :
                                        mode === 'out' ? <>Cerrar Turno <LogOut className="w-5 h-5" /></> :
                                            <>Confirmar y Entrar <ArrowRight className="w-5 h-5" /></>}
                            </button>

                            {mode === 'out' && !successMsg && (
                                <p className="text-center text-xs text-yellow-500 mt-2 animate-pulse">
                                    ⚠️ Tienes un turno abierto. Presiona para salir.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
