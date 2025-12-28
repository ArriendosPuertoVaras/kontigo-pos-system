
import * as XLSX from 'xlsx';
import { ImportType, ImportRow, ParseResult } from './types';
export type { ImportType, ImportRow, ParseResult };

// --- Templates ---

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
    ]
};

// --- Functions ---

export function downloadTemplate(type: ImportType) {
    const data = TEMPLATES[type];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

    XLSX.writeFile(workbook, `template_${type}.xlsx`);
}

export function parseExcel(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                // Basic validation: Check if we have data
                if (jsonData.length === 0) {
                    resolve({
                        data: [],
                        errors: ["El archivo parece estar vacío."],
                        meta: { fields: [] }
                    });
                    return;
                }

                // Get headers from the first row keys
                const fields = Object.keys(jsonData[0] as object);

                resolve({
                    data: jsonData,
                    errors: [], // XLSX doesn't return per-row errors like Papa, custom validation needed later
                    meta: { fields }
                });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
}

// --- Specific Validators ---

export function validateStaff(row: ImportRow): string | null {
    if (!row['Nombre']) return "Falta nombre";
    if (!row['PIN']) return "Falta PIN";
    return null;
}

export function validateInventory(row: ImportRow): string | null {
    if (!row['Insumo']) return "Falta nombre del insumo";
    if (!row['Familia']) return "Falta familia";
    if (!row['Unidad']) return "Falta unidad";
    return null;
}
