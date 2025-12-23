'use client';

import { CloudDownload, CloudUpload, AlertTriangle, X } from 'lucide-react';

interface SyncDecisionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPush: () => void;
    onPull: () => void;
    isSyncing: boolean;
}

export default function SyncDecisionModal({ isOpen, onClose, onPush, onPull, isSyncing }: SyncDecisionModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1e1e1e] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-toast-blue animate-pulse" />
                            Sincronización Inteligente
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">Elige la dirección de los datos para evitar errores.</p>
                    </div>
                    <button onClick={onClose} disabled={isSyncing} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-500 hover:text-white" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 grid gap-4">
                    {/* OPTION 1: PULL (SAFER) */}
                    <button
                        onClick={onPull}
                        disabled={isSyncing}
                        className="group relative flex items-start gap-4 p-4 rounded-xl border border-toast-blue/30 bg-toast-blue/5 hover:bg-toast-blue/10 transition-all text-left"
                    >
                        <div className="p-3 bg-toast-blue/20 rounded-lg text-toast-blue shrink-0 group-hover:scale-110 transition-transform">
                            <CloudDownload className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-toast-blue font-bold text-lg">Traer de la Nube</h3>
                            <p className="text-gray-400 text-sm leading-snug mt-1">
                                Actualiza este equipo con los datos más recientes.
                                <br />
                                <span className="text-xs text-white/50">Úsalo al iniciar el turno o cambiar de computador.</span>
                            </p>
                        </div>
                    </button>

                    {/* OPTION 2: PUSH (DESTRUCTIVE) */}
                    <button
                        onClick={onPush}
                        disabled={isSyncing}
                        className="group relative flex items-start gap-4 p-4 rounded-xl border border-toast-orange/30 bg-toast-orange/5 hover:bg-toast-orange/10 transition-all text-left"
                    >
                        <div className="p-3 bg-toast-orange/20 rounded-lg text-toast-orange shrink-0 group-hover:scale-110 transition-transform">
                            <CloudUpload className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-toast-orange font-bold text-lg">Enviar mis Cambios</h3>
                            <p className="text-gray-400 text-sm leading-snug mt-1">
                                Guarda tu trabajo local en la nube.
                                <br />
                                <span className="text-xs text-red-400/80 font-bold flex items-center gap-1 mt-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Sobrescribirá datos en la nube
                                </span>
                            </p>
                        </div>
                    </button>
                </div>

                {/* Footer */}
                <div className="p-4 bg-black/20 text-center text-xs text-gray-500 border-t border-white/5">
                    {isSyncing ? (
                        <span className="flex items-center justify-center gap-2 text-toast-blue">
                            <span className="w-3 h-3 border-2 border-toast-blue border-r-transparent rounded-full animate-spin" />
                            Procesando...
                        </span>
                    ) : (
                        "Mantén tu sistema actualizado para evitar conflictos."
                    )}
                </div>
            </div>
        </div>
    );
}
