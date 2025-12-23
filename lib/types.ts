export type ImportType = 'staff' | 'categories' | 'inventory' | 'products' | 'recipes';

export interface ImportRow {
    [key: string]: string | number | boolean;
}

export interface ParseResult {
    data: any[];
    errors: string[];
    meta: {
        fields: string[];
    };
}
