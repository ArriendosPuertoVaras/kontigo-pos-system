'use server';

import * as XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ImportType } from '@/lib/types';

// Redefine templates here or import if shared (imports from lib might not work if lib uses client-only stuff, but lib/import-utils seems safe-ish except for the buffer blob part which is browser only)
// Safest is to duplicate the simple data structure or move TEMPLATES to a shared constants file.
// For speed, duplicating the small data structure here.

const TEMPLATES: Record<ImportType, any[]> = {
    staff: [
        { Nombre: "Juan Perez", Rol: "Cocina", PIN: "1234", "Tipo Contrato": "Mensual", Salario: "500000" },
        { Nombre: "Maria Gonzalez", Rol: "Garzón", PIN: "5678", "Tipo Contrato": "Por Hora", Salario: "2500" }
    ],
    categories: [
        { Nombre: "Entradas", Destino: "Cocina" },
        { Nombre: "Bebidas y Jugos", Destino: "Barra" },
        { Nombre: "Abarrotes", Destino: "Bodega" }
    ],
    inventory: [
        { Insumo: "Harina", Familia: "Abarrotes", SubFamilia: "Harinas", Unidad: "kg", Costo: "1200", Stock: "10", "Stock Minimo": "5" },
        { Insumo: "Tomate", Familia: "Verduras", SubFamilia: "Frescos", Unidad: "kg", Costo: "800", Stock: "5", "Stock Minimo": "2" }
    ],
    products: [
        { Producto: "Lomo a lo Pobre", Categoria: "Fondos", Precio: "12990" },
        { Producto: "Pisco Sour", Categoria: "Bebidas y Jugos", Precio: "4500" }
    ],
    recipes: [
        { Plato: "Lomo a lo Pobre", Insumo: "Lomo Liso", Cantidad: "0.300", Unidad: "kg" },
        { Plato: "Lomo a lo Pobre", Insumo: "Papas", Cantidad: "0.400", Unidad: "kg" }
    ],
    master_recipes: [
        {
            Plato: "Empanaditas de Prieta",
            Precio: "12500",
            Categoría: "Entradas",
            Ingrediente: "Prieta",
            Cantidad: "50",
            Unidad: "gr",
            Familia: "Carnes",
            SubFamilia: "Embutidos",
            Almacenaje: "Refrigerado",
            "Preparación (Pasos)": "1. Masa: Formar corona... | 2. Relleno: Sofreír...",
            "Tips del Chef": "No cocines demasiado la manzana..."
        }
    ]
};

export async function saveTemplateToDesktop(type: ImportType) {
    try {
        const data = TEMPLATES[type];
        if (!data) throw new Error("Tipo de plantilla no válido");

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Define path - Dynamic resolution of Desktop
        const homeDir = os.homedir();
        const desktopPath = path.join(homeDir, 'Desktop', `template_${type}.xlsx`);

        // Write file
        await fs.writeFile(desktopPath, buffer);

        return { success: true, message: `Archivo guardado en: ${desktopPath}` };
    } catch (error: any) {
        console.error("Error saving template:", error);
        return { success: false, message: `Error al guardar: ${error.message}` };
    }
}
