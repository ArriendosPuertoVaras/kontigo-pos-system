'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { ArrowLeft, UserPlus, Search, MoreVertical, Briefcase, DollarSign, Calendar } from 'lucide-react';
import Link from 'next/link';

import { useRouter } from 'next/navigation';

export default function EmployeeListPage() {
    const router = useRouter();
    const staffList = useLiveQuery(() => db.staff.toArray());

    const handleCreate = async () => {
        try {
            const id = await db.staff.add({
                name: 'Nuevo Colaborador',
                role: 'waiter',
                activeRole: 'waiter',
                pin: '0000',
                contractType: '44-hours',
                contractDuration: 'indefinite',
                weeklyHoursLimit: 44,
                salaryType: 'monthly',
                baseSalary: 529000 // New Minimum Wage Default
            });
            router.push(`/staff/employees/${id}`);
        } catch (error) {
            console.error("Failed to create staff", error);
        }
    };

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-white font-sans">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-[#252525]">
                <div className="flex items-center gap-4">
                    <Link href="/staff" className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Colaboradores</h1>
                        <p className="text-xs text-gray-400">Gestión de contratos y fichas</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            className="bg-black/20 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-toast-orange outline-none w-64"
                        />
                    </div>
                    <button
                        onClick={handleCreate}
                        className="bg-toast-orange hover:brightness-110 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-orange-500/20 flex items-center gap-2 active:scale-95 transition-transform"
                    >
                        <UserPlus className="w-4 h-4" />
                        Nuevo Colaborador
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 max-w-7xl mx-auto">
                {/* GRID LAYOUT */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">

                    {/* Create New Card */}
                    <button
                        onClick={handleCreate}
                        className="group flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-white/10 hover:border-toast-orange hover:bg-white/5 transition-all aspect-[3/4] gap-4"
                    >
                        <div className="w-12 h-12 rounded-full bg-toast-orange/10 flex items-center justify-center text-toast-orange group-hover:scale-110 transition-transform">
                            <UserPlus className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-xs text-gray-400 group-hover:text-white uppercase tracking-wider">Nuevo Colaborador</span>
                    </button>

                    {/* Staff Cards */}
                    {staffList?.map((staff) => (
                        <Link
                            key={staff.id}
                            href={`/staff/employees/${staff.id}`}
                            className="group relative bg-[#252525] hover:bg-[#2a2a2a] p-4 rounded-2xl border border-white/5 hover:border-toast-orange/50 transition-all flex flex-col items-center text-center gap-3 aspect-[3/4] shadow-lg hover:shadow-xl hover:-translate-y-1"
                        >
                            <div className={`w-16 h-16 rounded-full ${staff.avatarColor || 'bg-gray-600'} flex items-center justify-center text-2xl font-bold shadow-inner mb-1 ring-4 ring-[#1e1e1e]`}>
                                {staff.name.charAt(0)}
                            </div>

                            <div className="flex-1 w-full flex flex-col justify-center">
                                <h3 className="font-bold text-sm leading-tight group-hover:text-toast-orange transition-colors line-clamp-2">{staff.name}</h3>
                                <p className="text-[10px] text-gray-400 font-mono mt-1 uppercase tracking-wider">{staff.role}</p>
                            </div>

                            {/* Status / Type Badge */}
                            <div className="w-full pt-3 border-t border-white/5 flex flex-col gap-1">
                                <span className={`text-[9px] py-1 px-2 rounded-full font-bold border border-white/5 block mx-auto w-fit ${staff.contractType === 'part-time' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {staff.contractType === 'part-time' ? 'PART TIME' :
                                        staff.contractType === 'art-22' ? 'ART. 22' : 'FULL TIME'}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>

                {!staffList?.length && (
                    <div className="p-12 text-center text-gray-500">
                        Cargando colaboradores...
                    </div>
                )}
            </div>
        </div>
    );
}
