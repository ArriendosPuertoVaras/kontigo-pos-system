import { useState } from 'react';
import { db, seedDatabase } from '@/lib/db';
import { setSetting, SettingsKeys } from '@/lib/settings';
import { Store, Cloud, Check, Loader2, ArrowRight, User, Lock } from 'lucide-react';
import { syncService } from '@/lib/sync_service';

interface SetupRestaurantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export default function SetupRestaurantModal({ isOpen, onClose, onComplete }: SetupRestaurantModalProps) {
    const [step, setStep] = useState<'CHOICE' | 'REGISTER_DETAILS' | 'RESTORING'>('CHOICE');
    const [isLoading, setIsLoading] = useState(false);

    // Registration Form
    const [restaurantName, setRestaurantName] = useState("");
    const [adminName, setAdminName] = useState("");
    const [adminPin, setAdminPin] = useState("");
    const [accessCode, setAccessCode] = useState("");

    if (!isOpen) return null;

    const handleRegisterNew = async () => {
        if (!restaurantName || !adminName || adminPin.length < 4) return;

        // SECURITY GATE
        if (accessCode.trim().toUpperCase() !== 'KONTIGO-2025') {
            alert("⚠️ Código de Acceso Inválido. Contacta a soporte para obtener tu invitación.");
            return;
        }

        setIsLoading(true);

        try {
            // 1. Wipe Default Staff (but keep structure)
            await db.staff.clear();

            // 2. Create New Admin (Super User)
            await db.staff.add({
                name: adminName,
                pin: adminPin,
                role: 'manager',
                activeRole: 'manager',
                contractType: 'art-22',
                contractDuration: 'indefinite',
                weeklyHoursLimit: 45,
                salaryType: 'monthly',
                baseSalary: 0,
                status: 'active',
                avatarColor: 'bg-orange-500' // Distinctive color
            });

            // 3. Save Settings
            await setSetting(SettingsKeys.RESTAURANT_NAME, restaurantName);
            await setSetting(SettingsKeys.IS_CONFIGURED, true);

            // 4. Finish
            onComplete();
        } catch (e) {
            console.error(e);
            alert("Error al registrar sistema.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestore = async () => {
        setStep('RESTORING');
        try {
            await syncService.restoreFromCloud((msg) => console.log(msg));
            await setSetting(SettingsKeys.IS_CONFIGURED, true); // Assume configured if restored
            onComplete();
        } catch (e: any) {
            alert("Error al restaurar: " + e.message);
            setStep('CHOICE'); // Go back
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#111111]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#111111] w-full max-w-2xl rounded-3xl shadow-2xl border border-[#f3f2f0]/10 overflow-hidden flex flex-col font-sans">

                {/* HEADER */}
                <div className="p-8 bg-gradient-to-br from-[#e4f229]/5 to-transparent border-b border-[#f3f2f0]/5">
                    <h2 className="text-3xl font-bold text-[#f3f2f0] mb-2 tracking-tight">Bienvenido a Kontigo POS</h2>
                    <p className="text-[#9CA3AF]">Configuremos tu sistema para empezar.</p>
                </div>

                {/* CONTENT */}
                <div className="p-8">
                    {step === 'CHOICE' && (
                        <div className="grid md:grid-cols-2 gap-4">
                            <button
                                onClick={() => setStep('REGISTER_DETAILS')}
                                className="group relative bg-[#1A1A1A] hover:bg-[#222222] border border-[#f3f2f0]/5 hover:border-[#e4f229] p-8 rounded-2xl flex flex-col items-center gap-6 transition-all duration-300 text-center shadow-lg hover:shadow-[#e4f229]/10"
                            >
                                <div className="w-16 h-16 bg-[#e4f229]/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Store className="w-8 h-8 text-[#e4f229]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-[#f3f2f0]">Soy Negocio Nuevo</h3>
                                    <p className="text-sm text-[#9CA3AF] mt-2 leading-relaxed">Quiero registrar el nombre de mi restaurante y crear mi usuario administrador.</p>
                                </div>
                            </button>

                            <button
                                onClick={handleRestore}
                                className="group relative bg-[#1A1A1A] hover:bg-[#222222] border border-[#f3f2f0]/5 hover:border-blue-500 p-8 rounded-2xl flex flex-col items-center gap-6 transition-all duration-300 text-center shadow-lg hover:shadow-blue-500/10"
                            >
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Cloud className="w-8 h-8 text-blue-500" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-[#f3f2f0]">Ya tengo Cuenta</h3>
                                    <p className="text-sm text-[#9CA3AF] mt-2 leading-relaxed">Quiero descargar mi configuración, personal y menú desde la nube.</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {step === 'REGISTER_DETAILS' && (
                        <div className="space-y-6 animate-in slide-in-from-right-8 fade-in">

                            {/* ACCESS CODE FIELD */}
                            <div className="bg-[#e4f229]/5 border border-[#e4f229]/20 p-4 rounded-xl mb-4">
                                <label className="block text-[#e4f229] text-xs font-bold mb-2 uppercase tracking-widest flex items-center gap-2">
                                    Código de Invitación <Lock className="w-3 h-3" />
                                </label>
                                <input
                                    type="text"
                                    value={accessCode}
                                    onChange={e => setAccessCode(e.target.value.toUpperCase())}
                                    placeholder="KONTIGO-XXXX"
                                    className="w-full bg-[#111111] border border-[#e4f229]/30 rounded-lg p-3 text-[#f3f2f0] font-mono text-center tracking-widest focus:ring-1 ring-[#e4f229] outline-none placeholder:text-[#9CA3AF]/30"
                                />
                            </div>

                            <div>
                                <label className="block text-[#9CA3AF] text-xs font-bold mb-2 uppercase tracking-widest">Nombre del Restaurante</label>
                                <input
                                    type="text"
                                    value={restaurantName}
                                    onChange={e => setRestaurantName(e.target.value)}
                                    placeholder="Ej: La Picá del Puerto"
                                    className="w-full bg-[#1A1A1A] border border-[#f3f2f0]/10 rounded-xl p-4 text-[#f3f2f0] text-lg focus:ring-1 ring-[#e4f229] focus:border-[#e4f229] outline-none transition-all placeholder:text-[#9CA3AF]/30"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[#9CA3AF] text-xs font-bold mb-2 uppercase tracking-widest">Tu Nombre (Admin)</label>
                                    <input
                                        type="text"
                                        value={adminName}
                                        onChange={e => setAdminName(e.target.value)}
                                        placeholder="Ej: Ricardo"
                                        className="w-full bg-[#1A1A1A] border border-[#f3f2f0]/10 rounded-xl p-4 text-[#f3f2f0] text-lg focus:ring-1 ring-[#e4f229] focus:border-[#e4f229] outline-none transition-all placeholder:text-[#9CA3AF]/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[#9CA3AF] text-xs font-bold mb-2 uppercase tracking-widest">PIN (4 dígitos)</label>
                                    <input
                                        type="text"
                                        maxLength={4}
                                        value={adminPin}
                                        onChange={e => setAdminPin(e.target.value.replace(/\D/g, ''))}
                                        placeholder="0000"
                                        className="w-full bg-[#1A1A1A] border border-[#f3f2f0]/10 rounded-xl p-4 text-[#e4f229] text-xl font-mono text-center tracking-[1em] focus:ring-1 ring-[#e4f229] focus:border-[#e4f229] outline-none transition-all placeholder:text-[#9CA3AF]/30 placeholder:tracking-normal"
                                    />
                                </div>
                            </div>

                            <p className="text-xs text-[#9CA3AF] bg-[#e4f229]/5 border border-[#e4f229]/20 p-4 rounded-xl flex gap-2">
                                <span className="text-[#e4f229]">ℹ️</span> Al registrar, se borrarán los usuarios de demostración (Cocinero, Garzón, Barra) para dejar tu sistema limpio.
                            </p>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setStep('CHOICE')}
                                    className="px-6 py-4 rounded-xl text-[#9CA3AF] hover:text-[#f3f2f0] font-bold transition-colors text-sm uppercase tracking-wide"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleRegisterNew}
                                    disabled={!restaurantName || !adminName || adminPin.length < 4 || !accessCode || isLoading}
                                    className="flex-1 bg-[#e4f229] text-[#0a0806] font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-[#dbe627] hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#e4f229]/10 py-4 text-lg"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : <>Registrar Negocio <ArrowRight className="w-5 h-5" /></>}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'RESTORING' && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Cloud className="w-16 h-16 text-blue-500 animate-bounce mb-4" />
                            <h3 className="text-xl font-bold text-[#f3f2f0] mb-2">Descargando Configuración...</h3>
                            <p className="text-[#9CA3AF]">Estamos trayendo tu menú, personal y mesas desde la nube.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
