'use client';
import { useState } from 'react';
import { Users, X, Minus, Plus, Check } from 'lucide-react';

interface GuestCountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (count: number) => void;
    tableName: string;
}

export default function GuestCountModal({ isOpen, onClose, onConfirm, tableName }: GuestCountModalProps) {
    const [count, setCount] = useState(2);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(count);
        onClose();
        setCount(2); // Reset for next time
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1e1e1e] rounded-2xl border border-white/10 w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#252525]">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-toast-orange" />
                            {tableName}
                        </h2>
                        <p className="text-xs text-gray-400">¿Cuántas personas?</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex flex-col items-center gap-6">

                    {/* Big Counter */}
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setCount(Math.max(1, count - 1))}
                            className="w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all text-white"
                        >
                            <Minus className="w-6 h-6" />
                        </button>

                        <div className="text-6xl font-bold text-white tabular-nums min-w-[80px] text-center">
                            {count}
                        </div>

                        <button
                            onClick={() => setCount(count + 1)}
                            className="w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all text-white"
                        >
                            <Plus className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Quick Select Grid */}
                    <div className="grid grid-cols-4 gap-2 w-full">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                            <button
                                key={num}
                                onClick={() => setCount(num)}
                                className={`py-2 rounded-lg font-bold border transition-all
                                ${count === num
                                        ? 'bg-toast-orange text-white border-toast-orange shadow-lg'
                                        : 'bg-[#2a2a2a] text-gray-400 border-transparent hover:bg-white/5 hover:text-white'}`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-[#252525]">
                    <button
                        onClick={handleConfirm}
                        className="w-full py-4 bg-toast-green hover:brightness-110 text-white font-bold rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-green-900/20 active:scale-95 transition-all"
                    >
                        ABRIR MESA <Check className="w-5 h-5" />
                    </button>
                </div>

            </div>
        </div>
    );
}
