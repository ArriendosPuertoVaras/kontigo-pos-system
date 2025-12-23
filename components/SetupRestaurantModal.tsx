import { useState } from 'react';
import { db, seedDatabase } from '@/lib/db';
import { setSetting, SettingsKeys } from '@/lib/settings';
import { Store, Cloud, Check, Loader2, ArrowRight, User } from 'lucide-react';
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

    if (!isOpen) return null;

    const handleRegisterNew = async () => {
        if (!restaurantName || !adminName || adminPin.length < 4) return;
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
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#1a1a1a] w-full max-w-2xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">

                {/* HEADER */}
                <div className="p-8 bg-gradient-to-r from-orange-600/20 to-transparent border-b border-white/5">
                    <h2 className="text-3xl font-bold text-white mb-2">Bienvenido a Kontigo POS</h2>
                    <p className="text-gray-400">Configuremos tu sistema para empezar.</p>
                </div>

                {/* CONTENT */}
                <div className="p-8">
                    {step === 'CHOICE' && (
                        <div className="grid md:grid-cols-2 gap-4">
                            <button
                                onClick={() => setStep('REGISTER_DETAILS')}
                                className="group relative bg-[#252525] hover:bg-[#333] border border-white/10 hover:border-orange-500/50 p-8 rounded-xl flex flex-col items-center gap-4 transition-all text-center"
                            >
                                <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Store className="w-8 h-8 text-orange-500" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Soy Negocio Nuevo</h3>
                                    <p className="text-sm text-gray-500 mt-1">Quiero registrar el nombre de mi restaurante y crear mi usuario administrador.</p>
                                </div>
                            </button>

                            <button
                                onClick={handleRestore}
                                className="group relative bg-[#252525] hover:bg-[#333] border border-white/10 hover:border-blue-500/50 p-8 rounded-xl flex flex-col items-center gap-4 transition-all text-center"
                            >
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Cloud className="w-8 h-8 text-blue-500" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Ya tengo Cuenta</h3>
                                    <p className="text-sm text-gray-500 mt-1">Quiero descargar mi configuración, personal y menú desde la nube.</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {step === 'REGISTER_DETAILS' && (
                        <div className="space-y-6 animate-in slide-in-from-right-8 fade-in">
                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-2 uppercase tracking-wider">Nombre del Restaurante</label>
                                <input
                                    type="text"
                                    value={restaurantName}
                                    onChange={e => setRestaurantName(e.target.value)}
                                    placeholder="Ej: La Picá del Puerto"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white text-lg focus:ring-2 ring-orange-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-sm font-bold mb-2 uppercase tracking-wider">Tu Nombre (Admin)</label>
                                    <input
                                        type="text"
                                        value={adminName}
                                        onChange={e => setAdminName(e.target.value)}
                                        placeholder="Ej: Ricardo"
                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white text-lg focus:ring-2 ring-orange-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-sm font-bold mb-2 uppercase tracking-wider">Crea un PIN (4 dígitos)</label>
                                    <input
                                        type="text"
                                        maxLength={4}
                                        value={adminPin}
                                        onChange={e => setAdminPin(e.target.value.replace(/\D/g, ''))}
                                        placeholder="0000"
                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white text-lg font-mono text-center tracking-widest focus:ring-2 ring-orange-500 outline-none"
                                    />
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 bg-orange-500/5 border border-orange-500/10 p-3 rounded-lg">
                                ℹ️ Al registrar, se borrarán los usuarios de demostración (Cocinero, Garzón, Barra) para dejar tu sistema limpio.
                            </p>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setStep('CHOICE')}
                                    className="px-6 py-4 rounded-xl text-gray-400 hover:text-white font-bold transition-colors"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleRegisterNew}
                                    disabled={!restaurantName || !adminName || adminPin.length < 4 || isLoading}
                                    className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : <>Registrar Negocio <ArrowRight className="w-5 h-5" /></>}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'RESTORING' && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Cloud className="w-16 h-16 text-blue-500 animate-bounce mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Descargando Configuración...</h3>
                            <p className="text-gray-500">Estamos trayendo tu menú, personal y mesas desde la nube.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
