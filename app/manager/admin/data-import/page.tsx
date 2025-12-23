'use client';

import { useState } from 'react';
import { db } from '@/lib/db';
import { ArrowLeft, Download, Upload, CheckCircle, AlertTriangle, FileText, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { parseExcel } from '@/lib/import-utils';
import { saveTemplateToDesktop } from '@/app/actions/download-template';
import { ImportType } from '@/lib/types';
import { useLiveQuery } from 'dexie-react-hooks';

const STEPS = [
    { id: 'categories', label: '1. Categorías', icon: FileText },
    { id: 'inventory', label: '2. Inventario', icon: FileText },
    { id: 'products', label: '3. Productos', icon: FileText },
    { id: 'recipes', label: '4. Recetas', icon: FileText },
    { id: 'staff', label: '5. Personal', icon: FileText },
];

export default function DataImportPage() {
    const [activeTab, setActiveTab] = useState<ImportType>('categories');
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Handlers ---

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLogs([]);
        setPreviewData([]);

        try {
            const { data, errors } = await parseExcel(file);

            if (errors.length > 0) {
                setLogs(prev => [...prev, ...errors]);
            }

            setPreviewData(data);
            setLogs(prev => [...prev, `✅ Archivo cargado: ${data.length} filas encontradas.`]);

        } catch (error) {
            console.error(error);
            setLogs(prev => [...prev, "❌ Error crítico al leer el archivo."]);
        }
    };

    const handleCommit = async () => {
        if (previewData.length === 0) return;
        setIsProcessing(true);
        setLogs(prev => [...prev, "🔄 Procesando importación a Base de Datos..."]);

        try {
            let count = 0;

            if (activeTab === 'staff') {
                const staff = previewData.map(row => ({
                    name: row['Nombre'],
                    pin: row['PIN'],
                    role: row['Rol'] || 'Garzón',
                    activeRole: row['Rol'] || 'Garzón',
                    salaryType: (row['Tipo Contrato'] || '').toLowerCase().includes('mensual') ? 'monthly' : 'hourly',
                    baseSalary: Number(row['Salario']) || 0,
                    status: 'active',
                    contractType: 'indefinite',
                    weeklyHoursLimit: 45
                }));
                // @ts-ignore
                await db.staff.bulkAdd(staff);
                count = staff.length;
            }

            if (activeTab === 'categories') {
                const cats = previewData.map(row => ({
                    name: row['Nombre'],
                    destination: (row['Destino'] || '').toLowerCase().includes('barra') ? 'bar' : 'kitchen',
                    order: 99
                }));
                // @ts-ignore
                await db.categories.bulkAdd(cats);
                count = cats.length;
            }

            if (activeTab === 'inventory') {
                const items = previewData.map(row => ({
                    name: row['Insumo'],
                    family: row['Familia'],
                    subFamily: row['SubFamilia'],
                    unit: row['Unidad'],
                    stock: Number(row['Stock']) || 0,
                    cost: Number(row['Costo']) || 0,
                    minStock: Number(row['Stock Minimo']) || 5,
                    category: row['Familia'], // Sync
                    purchaseUnit: row['Unidad'],
                    conversionFactor: 1
                }));
                // @ts-ignore
                await db.ingredients.bulkAdd(items);
                count = items.length;
            }

            if (activeTab === 'products') {
                // We need category IDs
                const categories = await db.categories.toArray();

                const products = previewData.map(row => {
                    const catName = row['Categoria'];
                    const cat = categories.find(c => c.name.toLowerCase() === (catName || '').toLowerCase());
                    return {
                        name: row['Producto'],
                        price: Number(row['Precio']) || 0,
                        categoryId: cat ? cat.id : 1, // Fallback ID 1
                        isAvailable: true
                    };
                });
                // @ts-ignore
                await db.products.bulkAdd(products);
                count = products.length;
            }

            if (activeTab === 'recipes') {
                // Complex: Match Product Name -> ID && Match Ingredient Name -> ID
                const products = await db.products.toArray();
                const ingredients = await db.ingredients.toArray();

                let updated = 0;

                // Group by Product
                const updates = new Map<number, any[]>(); // productId -> RecipeItem[]

                for (const row of previewData) {
                    const prodName = row['Plato'];
                    const ingName = row['Insumo'];

                    const prod = products.find(p => p.name.toLowerCase() === (prodName || '').toLowerCase());
                    const ing = ingredients.find(i => i.name.toLowerCase() === (ingName || '').toLowerCase());

                    if (prod && ing) {
                        const current = updates.get(prod.id!) || [];
                        current.push({
                            ingredientId: ing.id!,
                            quantity: Number(row['Cantidad']),
                            unit: row['Unidad']
                        });
                        updates.set(prod.id!, current);
                    } else {
                        setLogs(prev => [...prev, `⚠️ Salto: No encontré plato '${prodName}' o insumo '${ingName}'`]);
                    }
                }

                // Commit Updates
                for (const [pid, recipe] of updates.entries()) {
                    await db.products.update(pid, { recipe });
                    updated++;
                }
                count = updated;
            }

            setLogs(prev => [...prev, `✅ ÉXITO: Se importaron ${count} registros correctamente.`]);
            setPreviewData([]); // Clear

        } catch (e: any) {
            console.error(e);
            setLogs(prev => [...prev, `❌ ERROR CRÍTICO: ${e.message}`]);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Render ---

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-8 pb-32">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/manager/admin" className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Centro de Carga Masiva</h1>
                    <p className="text-neutral-400">Importa tus datos históricos desde Excel/CSV</p>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-8">
                {/* Sidebar Navigation */}
                <div className="col-span-3 space-y-2">
                    {STEPS.map(step => (
                        <button
                            key={step.id}
                            onClick={() => { setActiveTab(step.id as ImportType); setPreviewData([]); setLogs([]); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === step.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-white/5 text-neutral-400 hover:bg-white/10'
                                }`}
                        >
                            <step.icon className="w-5 h-5" />
                            <span className="font-medium">{step.label}</span>
                        </button>
                    ))}

                    <div className="mt-8 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                        <div className="flex items-center gap-2 text-orange-400 mb-2">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-bold text-sm">Importante</span>
                        </div>
                        <p className="text-xs text-orange-300/80 leading-relaxed">
                            Sigue el orden numérico (1 al 5) para evitar errores de dependencias (ej: crear un plato sin tener su categoría creada).
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="col-span-9 space-y-6">

                    {/* Step 1: Download Template */}
                    <div className="bg-neutral-800/50 border border-white/5 rounded-2xl p-6">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs">1</span>
                            Obtener Plantilla
                        </h2>
                        <div className="flex items-center justify-between">
                            <p className="text-neutral-400 text-sm">
                                Descarga el formato correcto para importar <strong>{activeTab.toUpperCase()}</strong>.
                            </p>
                            <button
                                onClick={async () => {
                                    setLogs(prev => [...prev, "⏳ Generando plantilla..."]);
                                    const res = await saveTemplateToDesktop(activeTab);
                                    if (res.success) {
                                        setLogs(prev => [...prev, `✅ ${res.message}`]);
                                        setLogs(prev => [...prev, "👉 Ahora arrastra ese archivo en el paso 2 (Subir Archivo)."]);
                                    } else {
                                        setLogs(prev => [...prev, `❌ ${res.message}`]);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Guardar en Escritorio
                            </button>
                        </div>
                    </div>

                    {/* Step 2: Upload */}
                    <div className="bg-neutral-800/50 border border-white/5 rounded-2xl p-6">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs">2</span>
                            Subir Archivo
                        </h2>

                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <Upload className="w-8 h-8 text-neutral-500 group-hover:text-indigo-400 mb-2 transition-colors" />
                                <p className="text-sm text-neutral-400">
                                    <span className="font-bold">Click para subir</span> o arrastra el archivo aquí
                                </p>
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".xlsx, .xls"
                                onChange={handleFileUpload}
                            />
                        </label>
                    </div>

                    {/* Step 3: Preview & Commit */}
                    {previewData.length > 0 && (
                        <div className="bg-neutral-800/50 border border-white/5 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs">3</span>
                                    Vista Previa ({previewData.length})
                                </h2>
                                <button
                                    onClick={handleCommit}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Confirmar e Importar
                                </button>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-white/10 max-h-64">
                                <table className="w-full text-sm text-left text-neutral-400">
                                    <thead className="text-xs uppercase bg-black/40 text-neutral-300 sticky top-0">
                                        <tr>
                                            {Object.keys(previewData[0]).map(key => (
                                                <th key={key} className="px-4 py-3">{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.slice(0, 10).map((row, i) => (
                                            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                                {Object.values(row).map((val: any, j) => (
                                                    <td key={j} className="px-4 py-2">{val}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {previewData.length > 10 && (
                                    <div className="p-2 text-center text-xs text-neutral-500 bg-black/20">
                                        ... y {previewData.length - 10} filas más
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Logs Console */}
                    <div className="bg-black/80 rounded-xl p-4 font-mono text-xs h-40 overflow-y-auto border border-white/10">
                        {logs.length === 0 ? (
                            <span className="text-neutral-600">Esperando archivo...</span>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className={`mb-1 ${log.includes('❌') ? 'text-red-400' : log.includes('⚠️') ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {log}
                                </div>
                            ))
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
