'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, Staff } from '@/lib/db';
import { UtensilsCrossed, Delete, User } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import SetupRestaurantModal from '@/components/SetupRestaurantModal';
import { getSetting, SettingsKeys, isSystemConfigured } from '@/lib/settings';
import { Settings2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const allStaff = useLiveQuery(() => db.staff.where('status').equals('active').toArray()) || [];
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [restaurantName, setRestaurantName] = useState("Kontigo POS");
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

    // Check Configuration & Load Name
    useEffect(() => {
        const loadSettings = async () => {
            const name = await getSetting<string>(SettingsKeys.RESTAURANT_NAME, "Kontigo POS");
            setRestaurantName(name);

            // Auto-open setup if not configured & no staff (fresh install)
            const configured = await isSystemConfigured();
            const staffCount = await db.staff.count();
            if (!configured && staffCount <= 4) { // 4 is default seed count
                // Optional: Auto open? ensuring manual trigger for now to not be annoying
            }
        };
        loadSettings();
    }, []);


    // Initial Seeding Trigger - REMOVED to prevent race condition with Cloud Restore
    // seedDatabase() is already handled by Dexie 'populate' event in lib/db.ts
    // useEffect(() => {
    //     import('@/lib/db').then(m => m.seedDatabase());
    // }, []);

    const handleNumClick = (num: string) => {
        if (pin.length < 4) {
            setPin(prev => prev + num);
            setError("");
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
        setError("");
    };

    const handleLogin = async () => {
        if (pin.length !== 4 || !selectedStaff) return;
        setIsLoading(true);

        try {
            // Check if PIN matches selected staff
            if (selectedStaff.pin === pin) {
                // Success
                localStorage.setItem('kontigo_staff_id', selectedStaff.id!.toString());
                localStorage.setItem('kontigo_staff_name', selectedStaff.name);
                localStorage.setItem('kontigo_staff_role', selectedStaff.role);

                router.push('/tables'); // or logic to route based on role
            } else {
                setError("PIN Incorrecto");
                setPin("");
            }
        } catch (e) {
            console.error(e);
            setError("Error de base de datos");
        }
        setIsLoading(false);
    };

    // Auto-submit on 4th digit
    useEffect(() => {
        if (pin.length === 4) {
            handleLogin();
        }
    }, [pin]);

    // SELF-HEALING: Fix invisible users (missing status) automatically
    useEffect(() => {
        db.staff.filter(s => !s.status).modify({ status: 'active' })
            .then(count => {
                if (count > 0) console.log(`🦁 Fixed ${count} invisible staff members`);
            })
            .catch(e => console.error("Auto-fix failed", e));
    }, []);

    const handleEmergencyRestore = async () => {
        if (!confirm("¿Descargar datos de la nube?")) return;
        setIsLoading(true);
        try {
            const { syncService } = await import('@/lib/sync_service');
            await syncService.restoreFromCloud((msg) => console.log(msg));

            // Check if we actually got staff
            const staffCount = await db.staff.count();
            if (staffCount === 0) {
                // FALLBACK: Cloud was empty, re-seed defaults
                const { seedDatabase } = await import('@/lib/db');
                await seedDatabase();
                alert("⚠️ La nube estaba vacía. Se han restaurado los usuarios por defecto.");
            } else {
                alert("✅ Datos Restaurados Correctamente");
            }
            window.location.reload();
        } catch (err: any) {
            alert("❌ Error al restaurar: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-toast-charcoal flex flex-col items-center justify-center p-4">

            {/* HEADER */}
            <div className="mb-8 flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-gradient-to-br from-toast-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
                    <UtensilsCrossed className="text-white w-10 h-10" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">{restaurantName}</h1>
                <p className="text-gray-400 text-sm mt-2 uppercase tracking-widest font-bold">
                    {selectedStaff ? `Hola, ${selectedStaff.name.split(' ')[0]}` : '¿Quién eres?'}
                </p>
            </div>

            {/* STEP 1: STAFF SELECTION */}
            {!selectedStaff && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-2xl animate-in slide-in-from-bottom-4 duration-500">
                    {allStaff.map(staff => (
                        <button
                            key={staff.id}
                            onClick={() => setSelectedStaff(staff)}
                            className="bg-[#252525] hover:bg-[#333] border border-white/5 hover:border-toast-orange/50 p-6 rounded-2xl flex flex-col items-center gap-3 transition-all group active:scale-95"
                        >
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-inner ${staff.avatarColor || 'bg-gray-600'} group-hover:scale-110 transition-transform`}>
                                {staff.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-white text-lg leading-tight">{staff.name.split(' ')[0]}</p>
                                <p className="text-xs text-toast-orange font-bold uppercase tracking-wider mt-1">{staff.activeRole || staff.role}</p>
                            </div>
                        </button>
                    ))}
                    {allStaff.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center gap-4 py-10 animate-in fade-in">
                            <p className="text-gray-500">No hay usuarios locales</p>
                            <button
                                onClick={handleEmergencyRestore}
                                disabled={isLoading}
                                className="bg-toast-orange hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-orange-500/20"
                            >
                                <UtensilsCrossed className={isLoading ? "animate-spin" : ""} />
                                {isLoading ? "Restaurando..." : "Descargar Personal de la Nube"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* SETUP BUTTON (If no staff or explicitly requested) */}
            {!selectedStaff && (
                <div className="fixed top-4 right-4">
                    <button
                        onClick={() => setIsSetupModalOpen(true)}
                        className="text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full"
                    >
                        <Settings2 className="w-4 h-4" />
                        Configurar Negocio
                    </button>
                </div>
            )}

            <SetupRestaurantModal
                isOpen={isSetupModalOpen}
                onClose={() => setIsSetupModalOpen(false)}
                onComplete={() => window.location.reload()}
            />

            {/* STEP 2: PIN ENTRY */}
            {selectedStaff && (
                <div className="w-full max-w-sm animate-in slide-in-from-right-8 duration-300">
                    {/* PIN Display */}
                    <div className="flex justify-center gap-4 mb-8">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 
                            ${i < pin.length ? 'bg-toast-orange scale-110 shadow-lg shadow-orange-500/50' : 'bg-white/10'}`}>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="text-red-500 text-center font-bold mb-6 animate-pulse bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                            {error}
                        </div>
                    )}

                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button
                                key={num}
                                onClick={() => handleNumClick(num.toString())}
                                className="h-20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all rounded-xl text-3xl font-bold text-white border-b-4 border-black/20"
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            onClick={() => {
                                setSelectedStaff(null);
                                setPin("");
                                setError("");
                            }}
                            className="h-20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all rounded-xl flex items-center justify-center text-gray-400 border-b-4 border-black/20"
                        >
                            <User className="w-8 h-8" />
                        </button>
                        <button
                            onClick={() => handleNumClick("0")}
                            className="h-20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all rounded-xl text-3xl font-bold text-white border-b-4 border-black/20"
                        >
                            0
                        </button>
                        <button
                            onClick={handleDelete}
                            className="h-20 bg-red-500/10 hover:bg-red-500/20 active:scale-95 transition-all rounded-xl flex items-center justify-center text-red-500 border-b-4 border-black/20"
                        >
                            <Delete className="w-8 h-8" />
                        </button>
                    </div>

                    <div className="mt-8 text-center flex flex-col gap-4">
                        <button onClick={() => setSelectedStaff(null)} className="text-gray-500 text-xs hover:text-white transition-colors">
                            ← Volver a selección de usuario
                        </button>
                    </div>
                </div>
            )}

        </div>

    );
}
