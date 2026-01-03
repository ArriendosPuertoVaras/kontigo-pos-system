'use client';

import { useState } from 'react';
import { db } from '@/lib/db';
import { ArrowLeft, Download, Upload, CheckCircle, AlertTriangle, FileText, Loader2, Save, Cloud, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { parseExcel } from '@/lib/import-utils';
import { saveTemplateToDesktop } from '@/app/actions/download-template';
import { ImportType } from '@/lib/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { syncService } from '@/lib/sync_service';

const STEPS = [
    { id: 'categories', label: '1. Categorías', icon: FileText },
    { id: 'inventory', label: '2. Inventario', icon: FileText },
    { id: 'products', label: '3. Productos', icon: FileText },
    { id: 'recipes', label: '4. Recetas', icon: FileText },
    { id: 'master_recipes', label: '🌟 Fichas Maestras (Todo en 1)', icon: RefreshCw },
    { id: 'staff', label: '5. Personal', icon: FileText },
];

export default function DataImportPage() {
    const [activeTab, setActiveTab] = useState<ImportType>('categories');
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // --- Cloud Sync Handlers ---
    const handlePushToCloud = async () => {
        if (!confirm("⚠️ ¿Estás seguro de SUBIR tus datos a la nube? Esto sobrescribirá lo que haya en la nube.")) return;
        setIsSyncing(true);
        setLogs(prev => [...prev, "☁️ Iniciando subida a la nube..."]);
        try {
            await syncService.pushAll((msg) => setLogs(prev => [...prev, `📤 ${msg}`]));
            setLogs(prev => [...prev, "✅ Subida completada con éxito."]);
        } catch (e: any) {
            console.error(e);
            setLogs(prev => [...prev, `❌ Error en subida: ${e.message}`]);
        } finally {
            setIsSyncing(false);
        }
    };

    const handlePullFromCloud = async () => {
        if (!confirm("⚠️ ¿Estás seguro de DESCARGAR datos de la nube? Esto borrará tus datos locales actuales.")) return;
        setIsSyncing(true);
        setLogs(prev => [...prev, "☁️ Iniciando descarga desde la nube..."]);
        try {
            await syncService.restoreFromCloud((msg) => setLogs(prev => [...prev, `📥 ${msg}`]));
            setLogs(prev => [...prev, "✅ Descarga completada."]);
        } catch (e: any) {
            console.error(e);
            setLogs(prev => [...prev, `❌ Error en descarga: ${e.message}`]);
        } finally {
            setIsSyncing(false);
        }
    };

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

            if (activeTab === 'master_recipes') {
                setLogs(prev => [...prev, "🧬 Iniciando Importación Maestras..."]);

                // 1. Get current state for matching
                const existingCategories = await db.categories.toArray();
                const existingIngredients = await db.ingredients.toArray();
                const existingProducts = await db.products.toArray();

                // Maps to track created items during this loop
                const categoryMap = new Map(existingCategories.map(c => [c.name.toLowerCase(), c.id]));
                const ingredientMap = new Map(existingIngredients.map(i => [i.name.toLowerCase(), i.id]));
                const productMap = new Map(existingProducts.map(p => [p.name.toLowerCase(), p.id]));

                // Group by Product
                const productGroups = new Map<string, any>(); // Name -> { rows: [], info: {} }

                for (const row of previewData) {
                    const prodName = (row['Plato'] || '').trim();
                    if (!prodName) continue;

                    if (!productGroups.has(prodName)) {
                        productGroups.set(prodName, {
                            name: prodName,
                            price: Number(row['Precio']) || 0,
                            category: (row['Categoría'] || 'General').trim(),
                            instructions: (row['Preparación (Pasos)'] || '').split('|').map((s: string) => s.trim()).filter(Boolean),
                            chefNote: (row['Tips del Chef'] || '').trim(),
                            rows: []
                        });
                    }
                    productGroups.get(prodName).rows.push(row);
                }

                // --- PHASE 1: Categories & Ingredients ---
                for (const row of previewData) {
                    // CATEGORY
                    const catName = (row['Categoría'] || 'General').trim();
                    if (catName && !categoryMap.has(catName.toLowerCase())) {
                        const newId = await db.categories.add({ name: catName, destination: 'kitchen', order: 99 });
                        categoryMap.set(catName.toLowerCase(), newId as number);
                        setLogs(prev => [...prev, `📁 Categoría creada: ${catName}`]);
                    }

                    // INGREDIENT
                    const ingName = (row['Ingrediente'] || '').trim();
                    if (ingName && !ingredientMap.has(ingName.toLowerCase())) {
                        const newId = await db.ingredients.add({
                            name: ingName,
                            unit: (row['Unidad'] || 'un').trim(),
                            purchaseUnit: (row['Unidad'] || 'un').trim(),
                            stock: 0,
                            cost: 0,
                            family: row['Familia'],
                            subFamily: row['Sub-Familia'],
                            storage: row['Almacenaje'],
                            conversionFactor: 1
                        });
                        ingredientMap.set(ingName.toLowerCase(), newId as number);
                    }
                }

                // --- PHASE 2: Products & Recipes ---
                let productsProcessed = 0;
                for (const [name, group] of productGroups) {
                    const catId = categoryMap.get(group.category.toLowerCase()) || 1;

                    // Upsert Product
                    let productId = productMap.get(name.toLowerCase());
                    const productData = {
                        name: group.name,
                        price: group.price,
                        categoryId: catId,
                        instructions: group.instructions,
                        chefNote: group.chefNote,
                        isAvailable: true
                    };

                    if (productId) {
                        await db.products.update(productId, productData);
                    } else {
                        productId = await db.products.add(productData) as number;
                        productMap.set(name.toLowerCase(), productId);
                    }

                    // Build Recipe
                    const recipe = group.rows.map((row: any) => {
                        const iName = (row['Ingrediente'] || '').trim();
                        const iId = ingredientMap.get(iName.toLowerCase());
                        if (!iId) return null;
                        return {
                            ingredientId: iId,
                            quantity: Number(row['Cantidad']) || 0,
                            unit: (row['Unidad'] || 'un').trim()
                        };
                    }).filter(Boolean);

                    await db.products.update(productId, { recipe });
                    productsProcessed++;
                }

                count = productsProcessed;
                setLogs(prev => [...prev, `✅ Procesadas ${productGroups.size} Fichas Técnicas.`]);
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
                <Link href="/manager" className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
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

                    {/* CLOUD SYNC SECTION */}
                    <div className="mt-8 pt-8 border-t border-white/10">
                        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Cloud className="w-4 h-4" /> Nube
                        </h3>
                        <div className="grid gap-2">
                            <button
                                onClick={handlePushToCloud}
                                disabled={isSyncing}
                                className="w-full flex items-center gap-2 px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl transition-all disabled:opacity-50"
                            >
                                <Upload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                                <span className="text-xs font-bold">Subir a Nube</span>
                            </button>
                            <button
                                onClick={handlePullFromCloud}
                                disabled={isSyncing}
                                className="w-full flex items-center gap-2 px-4 py-3 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-xl transition-all disabled:opacity-50"
                            >
                                <Download className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                                <span className="text-xs font-bold">Bajar de Nube</span>
                            </button>
                        </div>
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
