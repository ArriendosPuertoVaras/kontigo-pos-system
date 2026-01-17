'use client';
import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Ingredient, Product } from '@/lib/db';
import { ArrowLeft, ChefHat, Plus, Save, Trash2, RefreshCw, Edit, AlertTriangle, Camera } from 'lucide-react';
import { FinancialAnalysisBar } from './FinancialAnalysisBar';
import { useAutoSync } from '@/components/providers/AutoSyncProvider';


// --- RECIPE BUILDER ROW COMPONENT ---

function RecipeRow({ item, ingredient, onRemove, onUpdate, onUpdateNote, onEditSubRecipe }: {
    item: { ingredientId: number, quantity: number, unit?: string, notes?: string },
    ingredient: Ingredient | undefined,
    onRemove: (id: number) => void,
    onUpdate: (id: number, qty: number, unit: string) => void,
    onUpdateNote: (id: number, note: string) => void,
    onEditSubRecipe?: (id: number) => void
}) {
    // If item has a saved unit, use it. Otherwise default to ingredient's unit.
    const currentUnit = item.unit || ingredient?.unit || 'un';

    // Local state for input to allow smooth typing (e.g. "0.", "1.5")
    const [inputValue, setInputValue] = useState(item.quantity === 0 ? '' : item.quantity.toString());

    // Sync from parent strict value only if it differs significantly (external update)
    useEffect(() => {
        const parsedLocal = parseFloat(inputValue || '0');
        if (Math.abs(parsedLocal - item.quantity) > 0.0001) {
            setInputValue(item.quantity === 0 ? '' : item.quantity.toString());
        }
    }, [item.quantity]);

    // Determine available units based on base unit (or current unit if it's standard)
    // List of all available units to allow full flexibility
    const availableUnits = ['un', 'kg', 'gr', 'lt', 'ml', 'cc'];

    const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setInputValue(raw);

        const val = parseFloat(raw);
        if (!isNaN(val)) {
            onUpdate(item.ingredientId, val, currentUnit);
        } else {
            if (raw === '') onUpdate(item.ingredientId, 0, currentUnit);
        }
    };

    const handleUnitChange = (newUnit: string) => {
        // Optional: Convert value when switching unit for better UX? 
        // For now, let's just switch the label and let user adjust number (safest) 
        // OR we can try to smart convert.
        let newQty = item.quantity;
        if (currentUnit === 'kg' && newUnit === 'gr') newQty = item.quantity * 1000;
        else if (currentUnit === 'gr' && newUnit === 'kg') newQty = item.quantity / 1000;
        else if ((currentUnit === 'lt' || currentUnit === 'l') && (newUnit === 'ml' || newUnit === 'cc')) newQty = item.quantity * 1000;
        else if ((currentUnit === 'ml' || currentUnit === 'cc') && (newUnit === 'lt' || newUnit === 'l')) newQty = item.quantity / 1000;

        onUpdate(item.ingredientId, newQty, newUnit);
    };

    return (
        <tr className="group hover:bg-white/5 border-b border-white/5 last:border-0">
            <td className="px-4 py-3 font-medium text-white">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span>{ingredient?.name || "Desconocido"}</span>
                        {ingredient?.isPreparation && onEditSubRecipe && (
                            <button
                                onClick={() => onEditSubRecipe(item.ingredientId)}
                                className="p-1 hover:bg-white/10 rounded-full text-blue-400 transition-colors"
                                title="Editar Sub-receta"
                            >
                                <ChefHat className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {ingredient?.isPreparation && <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Sub-Receta</span>}
                </div>
            </td>
            <td className="px-4 py-3">
                <input
                    type="number"
                    min="0"
                    step="0.001"
                    className="w-24 bg-black/40 border border-white/20 rounded p-1 text-right text-white font-mono focus:border-toast-orange outline-none"
                    value={inputValue}
                    onChange={handleQtyChange}
                    placeholder="0.00"
                />
            </td>
            <td className="px-4 py-3">
                {availableUnits.length > 1 ? (
                    <select
                        className="bg-black/20 text-gray-300 text-sm border-none rounded focus:ring-1 focus:ring-toast-orange cursor-pointer w-full"
                        value={currentUnit}
                        onChange={(e) => handleUnitChange(e.target.value)}
                    >
                        {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                ) : (
                    <span className="text-gray-400 text-sm pl-1">{currentUnit}</span>
                )}
            </td>
            <td className="px-4 py-3">
                <input
                    type="text"
                    className="w-full bg-transparent border-b border-transparent hover:border-white/20 focus:border-toast-orange outline-none text-xs text-gray-300 focus:text-white transition-colors placeholder:text-gray-600"
                    value={item.notes || ''}
                    onChange={(e) => onUpdateNote(item.ingredientId, e.target.value)}
                    placeholder="Nota técnica..."
                />
            </td>
            <td className="px-4 py-3 text-right">
                <button
                    onClick={() => onRemove(item.ingredientId)}
                    className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
}


export function RecipeBuilderModal({
    entityId,
    entityType = 'product',
    onClose,
    onSave
}: {
    entityId: number,
    entityType?: 'product' | 'ingredient',
    onClose: () => void,
    onSave: () => void
}) {
    // Auto-Sync Hook
    const { triggerChange } = useAutoSync();

    // Dynamic query based on entity type
    const product = useLiveQuery(async () => {
        if (entityType === 'product') return await db.products.get(entityId);
        return await db.ingredients.get(entityId);
    }, [entityId, entityType]);

    const allIngredients = useLiveQuery(() => db.ingredients.toArray()) || [];

    // Local state for the recipe being built
    const [recipeItems, setRecipeItems] = useState<{ ingredientId: number, quantity: number, unit?: string, section?: string, notes?: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Section Management
    const [activeSection, setActiveSection] = useState<string>("General");
    const [availableSections, setAvailableSections] = useState<string[]>(["General", "Masa", "Relleno", "Terminación"]);
    const [newSectionName, setNewSectionName] = useState("");
    const [isAddingSection, setIsAddingSection] = useState(false);

    // Sub-recipe recursion
    const [editingSubRecipe, setEditingSubRecipe] = useState<number | null>(null);



    // UI Tab State
    const [activeTab, setActiveTab] = useState<'ingredients' | 'preparation'>('ingredients');
    const [instructions, setInstructions] = useState<string[]>([]);
    const [chefNote, setChefNote] = useState("");
    const [image, setImage] = useState("");

    // Time Fields (NEW)
    const [prepTime, setPrepTime] = useState("");
    const [cookTime, setCookTime] = useState("");
    const [totalTime, setTotalTime] = useState("");

    // File Input Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize with existing recipe
    useEffect(() => {
        if (product) {
            setRecipeItems(product.recipe || []);
            setInstructions(product.instructions || []);
            setChefNote(product.chefNote || "");
            setImage('image' in product ? (product as any).image : "");

            // New time fields initialization
            setPrepTime(product.prepTime || "");
            setCookTime(product.cookTime || "");
            setTotalTime(product.totalTime || "");

            if (product.recipe) {
                // Extract existing sections from recipe to populate dropdown
                const existingSections = new Set(product.recipe.map(i => i.section || "General"));
                setAvailableSections(prev => Array.from(new Set([...prev, ...existingSections])));
            }
        }
    }, [product]);

    const handleAddIngredient = (ingId: number) => {
        setRecipeItems(prevItems => {
            const exists = prevItems.find(i => i.ingredientId === ingId && (i.section || "General") === activeSection);
            if (exists) return prevItems;
            return [...prevItems, {
                ingredientId: ingId,
                quantity: 0,
                section: activeSection,
                notes: ""
            }];
        });
        setSearchTerm("");
    };

    const handleRemoveIngredient = (ingId: number, section: string) => {
        setRecipeItems(prevItems => prevItems.filter(i => !(i.ingredientId === ingId && (i.section || "General") === section)));
    };

    const handleUpdateItem = (ingId: number, updates: Partial<{ quantity: number, unit: string, notes: string }>, section: string) => {
        setRecipeItems(prevItems => prevItems.map(i => {
            if (i.ingredientId === ingId && (i.section || "General") === section) {
                return { ...i, ...updates };
            }
            return i;
        }));
    };

    const handleSave = async () => {
        if (!product) return;
        setIsSaving(true);
        try {
            const updateData = {
                recipe: recipeItems,
                instructions: instructions.filter(i => i.trim() !== ""),
                chefNote: chefNote,
                image: image,
                prepTime: prepTime,
                cookTime: cookTime,
                totalTime: totalTime
            };

            if (entityType === 'product') {
                await db.products.update(entityId, updateData);
            } else {
                await db.ingredients.update(entityId, updateData);
            }
            triggerChange(); // Call AutoSync
            onSave();
        } catch (error) {
            console.error(error);
            alert("Error al guardar receta");
        } finally {
            setIsSaving(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreateNewIngredient = async (isPrep: boolean = false) => {
        if (!searchTerm.trim()) return;
        const nameCode = searchTerm.substring(0, 3).toUpperCase();
        const rnd = Math.floor(Math.random() * 900) + 100;
        const autoCode = `GEN-${nameCode}-${rnd}`;

        try {
            const id = await db.ingredients.add({
                name: searchTerm.trim(),
                category: isPrep ? 'Preparación' : 'General',
                stock: 0,
                unit: isPrep ? 'lt' : 'un', // Preparations usually liquid/mass
                cost: 0,
                purchaseUnit: isPrep ? 'lt' : 'un',
                conversionFactor: 1,
                code: autoCode,
                isPreparation: isPrep,
                recipe: []
            });
            handleAddIngredient(id as number);
            triggerChange(); // Call AutoSync
        } catch (e) {
            console.error("Error creating quick ingredient:", e);
            alert("Error al crear ingrediente");
        }
    };

    const handleAddSection = () => {
        if (newSectionName.trim()) {
            setAvailableSections([...availableSections, newSectionName.trim()]);
            setActiveSection(newSectionName.trim());
            setNewSectionName("");
            setIsAddingSection(false);
        }
    };

    // Ingredient Editing (Sidebar)
    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);

    const handleUpdateIngredient = async () => {
        if (!editingIngredient || !editingIngredient.id) return;
        try {
            await db.ingredients.update(editingIngredient.id, {
                name: editingIngredient.name,
                unit: editingIngredient.unit,
                cost: editingIngredient.cost,
                isPreparation: editingIngredient.isPreparation
            });
            setEditingIngredient(null);
            triggerChange(); // Call AutoSync
        } catch (error) {
            console.error("Error creating/updating ingredient:", error);
            alert("Error al actualizar ingrediente");
        }
    };

    // Filter ingredients for search
    const filteredIngredients = allIngredients.filter(ing =>
        ing.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (entityType !== 'ingredient' || ing.id !== entityId) // Prevent adding self to self
    );

    // Group items for rendering
    const groupedItems = recipeItems.reduce((acc, item) => {
        const sec = item.section || "General";
        if (!acc[sec]) acc[sec] = [];
        acc[sec].push(item);
        return acc;
    }, {} as Record<string, typeof recipeItems>);

    if (!product) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1e1e1e] w-full max-w-[95vw] h-[90vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">

                {/* Header */}
                <div className="h-20 bg-toast-charcoal border-b border-white/10 flex items-center justify-between px-6 shrink-0 relative overflow-hidden">
                    {/* Background Blur of Image */}
                    {image && <div className="absolute inset-0 opacity-20 blur-xl bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url(${image})` }} />}

                    <div className="relative z-10 flex items-center gap-4">
                        {/* Image Editor */}
                        <div className="group relative w-12 h-12 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            {image ? (
                                <img src={image} alt="Dish" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600">
                                    <ChefHat className="w-6 h-6" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-4 h-4 text-white" />
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleImageUpload}
                        />

                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">
                                {product.name}
                            </h2>
                            <p className="text-xs text-toast-orange/80 font-mono flex items-center gap-2">
                                {entityType === 'product' ? 'Ficha Técnica' : 'Sub-Receta'}
                                {entityType === 'ingredient' && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">PREPARACIÓN</span>}
                            </p>
                        </div>
                    </div>

                    <button onClick={onClose} className="relative z-10 p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* LEFT SIDEBAR: INGREDIENTS & SECTIONS */}
                    <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 flex flex-col bg-black/20 shrink-0 h-1/3 md:h-auto">

                        {/* EDIT MODE */}
                        {editingIngredient ? (
                            <div className="p-4 flex-1 flex flex-col animate-in slide-in-from-left-4">
                                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                    <Edit className="w-4 h-4 text-toast-orange" /> Settear Ingrediente
                                </h3>

                                <div className="space-y-4 flex-1">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Nombre</label>
                                        <input
                                            className="w-full bg-black/40 border border-white/10 rounded p-2 text-white text-sm focus:border-toast-orange outline-none"
                                            value={editingIngredient.name}
                                            onChange={e => setEditingIngredient({ ...editingIngredient, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Unidad Base</label>
                                            <select
                                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white text-sm focus:border-toast-orange outline-none"
                                                value={editingIngredient.unit}
                                                onChange={e => setEditingIngredient({ ...editingIngredient, unit: e.target.value })}
                                            >
                                                {['un', 'kg', 'gr', 'lt', 'ml', 'cc'].map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Costo Unit.</label>
                                            <input
                                                type="number"
                                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white text-sm focus:border-toast-orange outline-none"
                                                value={editingIngredient.cost}
                                                onChange={e => setEditingIngredient({ ...editingIngredient, cost: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-600 text-toast-orange focus:ring-toast-orange bg-gray-700"
                                                checked={editingIngredient.isPreparation || false}
                                                onChange={e => setEditingIngredient({ ...editingIngredient, isPreparation: e.target.checked })}
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-white block">Es Sub-Receta</span>
                                                <span className="text-xs text-gray-400 block">Compuesto por otros ingredientes</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => setEditingIngredient(null)}
                                        className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleUpdateIngredient}
                                        className="flex-1 py-2 bg-toast-orange hover:bg-orange-600 text-white rounded-lg text-xs font-bold"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // LIST MODE
                            <>
                                <div className="p-4 space-y-4 border-b border-white/5">
                                    {/* Section Selector */}
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Agregar a Sección</label>
                                        <div className="flex gap-2">
                                            <select
                                                className="flex-1 bg-[#2a2a2a] text-white text-sm p-2 rounded-lg border border-white/10 outline-none focus:border-toast-orange"
                                                value={activeSection}
                                                onChange={(e) => setActiveSection(e.target.value)}
                                            >
                                                {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <button
                                                onClick={() => setIsAddingSection(!isAddingSection)}
                                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-300"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {isAddingSection && (
                                            <div className="mt-2 flex gap-2 animate-in slide-in-from-top-2">
                                                <input
                                                    autoFocus
                                                    className="flex-1 bg-black/40 text-white text-xs p-2 rounded border border-toast-orange"
                                                    placeholder="Nueva sección..."
                                                    value={newSectionName}
                                                    onChange={e => setNewSectionName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleAddSection()}
                                                />
                                                <button onClick={handleAddSection} className="px-3 bg-toast-orange text-white text-xs font-bold rounded">OK</button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Search */}
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="🔍 Buscar o crear..."
                                            className="w-full bg-[#2a2a2a] text-white p-3 rounded-xl border border-white/10 focus:border-toast-orange outline-none"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* List */}
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {filteredIngredients.map(ing => (
                                        <div key={ing.id} className="flex gap-1 group">
                                            <button
                                                onClick={() => handleAddIngredient(ing.id!)}
                                                className="flex-1 text-left p-2 rounded-l-lg hover:bg-white/5 text-gray-300 hover:text-white transition-colors flex justify-between items-center"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    {ing.isPreparation && <ChefHat className="w-3 h-3 text-blue-400 shrink-0" />}
                                                    <span className="text-sm truncate">{ing.name}</span>
                                                </div>
                                                <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 text-toast-orange" />
                                            </button>

                                            {/* ACTION BUTTONS */}
                                            {ing.isPreparation ? (
                                                <button
                                                    onClick={() => setEditingSubRecipe(ing.id!)}
                                                    className="px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-l border-white/5"
                                                    title="Editar Sub-receta"
                                                >
                                                    <ChefHat className="w-3 h-3" />
                                                </button>
                                            ) : (
                                                <div className="w-0" />
                                            )}

                                            <button
                                                onClick={() => setEditingIngredient(ing)}
                                                className="px-2 hover:bg-white/10 text-gray-500 hover:text-white rounded-r-lg border-l border-white/5"
                                                title="Configurar Ingrediente"
                                            >
                                                <Edit className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {filteredIngredients.length === 0 && searchTerm && (
                                        <div className="p-4 space-y-2">
                                            <p className="text-gray-500 text-xs text-center">No encontrado.</p>
                                            <button
                                                onClick={() => handleCreateNewIngredient(false)}
                                                className="w-full bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg p-2 text-xs transition-all"
                                            >
                                                Creating Ingrediente "{searchTerm}"
                                            </button>
                                            <button
                                                onClick={() => handleCreateNewIngredient(true)}
                                                className="w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/50 rounded-lg p-2 text-xs font-bold transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChefHat className="w-3 h-3" /> Crear Preparación "{searchTerm}"
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* RIGHT: RECIPE CANVAS */}
                    <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-y-auto">
                        <div className="p-8 space-y-8">
                            {/* TAB SWITCHER */}
                            <div className="flex gap-4 border-b border-white/10 mb-6">
                                <button
                                    onClick={() => setActiveTab('ingredients')}
                                    className={`pb-2 text-sm font-bold transition-colors border-b-2 ${activeTab === 'ingredients' ? 'text-toast-orange border-toast-orange' : 'text-gray-500 border-transparent hover:text-white'}`}
                                >
                                    Ingredientes
                                </button>
                                <button
                                    onClick={() => setActiveTab('preparation')}
                                    className={`pb-2 text-sm font-bold transition-colors border-b-2 ${activeTab === 'preparation' ? 'text-toast-orange border-toast-orange' : 'text-gray-500 border-transparent hover:text-white'}`}
                                >
                                    Preparación
                                </button>
                            </div>

                            {activeTab === 'ingredients' ? (
                                <>
                                    {Object.entries(groupedItems).sort((a, b) => a[0] === 'General' ? -1 : 1).map(([section, items]) => (
                                        <div key={section} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <h3 className="text-lg font-bold text-toast-orange mb-3 pb-2 border-b border-white/10 flex justify-between items-end">
                                                <span>{section}</span>
                                                <span className="text-xs text-gray-500 font-normal">{items.length} ingredientes</span>
                                            </h3>
                                            <table className="w-full text-left">
                                                <thead className="text-[10px] font-bold text-gray-600 uppercase">
                                                    <tr>
                                                        <th className="px-4 py-2 w-1/3">Ingrediente</th>
                                                        <th className="px-4 py-2 w-24">Cant. BRUTA</th>
                                                        <th className="px-4 py-2 w-16">Unidad</th>
                                                        <th className="px-4 py-2">Notas Técnicas</th>
                                                        <th className="px-4 py-2 w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {items.map((item) => {
                                                        const ing = allIngredients.find(i => i.id === item.ingredientId);
                                                        return (
                                                            <RecipeRow
                                                                key={`${item.ingredientId}-${section}`}
                                                                item={item}
                                                                ingredient={ing}
                                                                onRemove={(id) => handleRemoveIngredient(id, section)}
                                                                onUpdate={(id, qty, unit) => {
                                                                    handleUpdateItem(id, { quantity: qty, unit: unit }, section);
                                                                }}
                                                                onUpdateNote={(id, note) => handleUpdateItem(id, { notes: note }, section)}
                                                                onEditSubRecipe={(id) => setEditingSubRecipe(id)}
                                                            />
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}

                                    {recipeItems.length === 0 && (
                                        <div className="h-40 flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-white/5 rounded-2xl">
                                            <ChefHat className="w-10 h-10 mb-2 opacity-50" />
                                            <p>Receta vacía. Selecciona ingredientes.</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* PREPARATION EDITOR */
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-4">

                                    {/* TIME FIELDS (NEW) */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Tiempo de Prep. (Activo)</label>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-toast-orange outline-none"
                                                placeholder="Ej: 35-40 min"
                                                value={prepTime}
                                                onChange={(e) => setPrepTime(e.target.value)}
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1">Ciclo de producción completo</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Tiempo de Cocción</label>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-toast-orange outline-none"
                                                placeholder="Ej: 15-18 min"
                                                value={cookTime}
                                                onChange={(e) => setCookTime(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Total (al Cliente)</label>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-toast-orange font-bold text-sm focus:border-toast-orange outline-none"
                                                placeholder="Ej: 18-20 min"
                                                value={totalTime}
                                                onChange={(e) => setTotalTime(e.target.value)}
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1">Tiempo de salida real</p>
                                        </div>
                                    </div>

                                    {/* Instructions List */}
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-4">Pasos de la Receta</h3>
                                        <div className="space-y-3">
                                            {instructions.map((step, idx) => (
                                                <div key={idx} className="flex gap-2 items-start group">
                                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white shrink-0 text-sm mt-1">
                                                        {idx + 1}
                                                    </div>
                                                    <textarea
                                                        className="flex-1 bg-black/40 border-l-2 border-white/10 focus:border-toast-orange p-3 rounded-r-lg text-gray-300 text-sm outline-none resize-none transition-all placeholder:text-gray-600"
                                                        rows={2}
                                                        placeholder={`Describe el paso ${idx + 1}...`}
                                                        value={step}
                                                        onChange={(e) => {
                                                            const newSteps = [...instructions];
                                                            newSteps[idx] = e.target.value;
                                                            setInstructions(newSteps);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => setInstructions(instructions.filter((_, i) => i !== idx))}
                                                        className="p-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => setInstructions([...instructions, ""])}
                                                className="w-full py-3 border-2 border-dashed border-white/10 rounded-xl text-gray-500 hover:text-toast-orange hover:border-toast-orange/30 hover:bg-toast-orange/5 transition-all text-sm font-bold flex items-center justify-center gap-2"
                                            >
                                                <Plus className="w-4 h-4" /> Agregar Paso
                                            </button>
                                        </div>
                                    </div>

                                    {/* Chef Note */}
                                    <div>
                                        <h3 className="text-lg font-bold text-yellow-500 mb-2 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" /> Nota del Chef
                                        </h3>
                                        <textarea
                                            className="w-full bg-yellow-900/10 border border-yellow-700/30 rounded-xl p-4 text-yellow-100 text-sm outline-none resize-none placeholder:text-yellow-700/50"
                                            rows={3}
                                            placeholder="Tips importantes, advertencias de temperatura, presentación..."
                                            value={chefNote}
                                            onChange={(e) => setChefNote(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer & Financial Analysis */}
                <div className="border-t border-white/10 bg-black/20 shrink-0">
                    <FinancialAnalysisBar
                        items={recipeItems}
                        allIngredients={allIngredients}
                        currentPrice={'price' in product ? (product as any).price : 0}
                        onApplyPrice={(newPrice) => {
                            db.products.update(entityId, { price: newPrice });
                            triggerChange(); // Call AutoSync
                        }}
                    />

                    <div className="p-4 flex justify-between items-center border-t border-white/5">
                        <div className="text-xs text-gray-500">
                            Total Items: {recipeItems.length}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-8 py-3 bg-toast-orange hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar Ficha
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* NESTED MODAL FOR SUB-RECIPES */}
            {editingSubRecipe && (
                <RecipeBuilderModal
                    entityId={editingSubRecipe}
                    entityType="ingredient"
                    onClose={() => setEditingSubRecipe(null)}
                    onSave={() => setEditingSubRecipe(null)}
                />
            )}
        </div>
    );
}
