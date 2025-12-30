
export const PERMISSIONS_LIST = [
    {
        category: 'Punto de Venta (POS)',
        items: [
            { id: 'pos:view', label: 'Acceso al POS' },
            { id: 'pos:order', label: 'Ingresar Pedidos' },
            { id: 'pos:charge', label: 'Cobrar Mesa' },
            { id: 'pos:discount', label: 'Aplicar Descuentos' },
            { id: 'pos:void', label: 'Anular Productos/Pedidos' },
            { id: 'menu:manage', label: 'Gestionar Menú (Crear/Editar)' },
        ]
    },
    {
        category: 'Cocina (KDS)',
        items: [
            { id: 'kds:view', label: 'Ver Pantalla KDS' },
            { id: 'kds:view_recipes', label: 'Ver Fichas Técnicas (Solo Lectura)' },
            { id: 'kds:complete', label: 'Completar Platos' },
        ]
    },
    {
        category: 'Inventario',
        items: [
            { id: 'inventory:view', label: 'Ver Stock' },
            { id: 'inventory:edit', label: 'Ajustar/Modificar Stock' },
            { id: 'inventory:purchase', label: 'Ingresar Compras' },
        ]
    },
    {
        category: 'Administración',
        items: [
            { id: 'admin:view', label: 'Acceso a Administración' },
            { id: 'admin:staff', label: 'Gestionar Personal' },
            { id: 'admin:reports', label: 'Ver Reportes Financieros' },
            { id: 'admin:settings', label: 'Configuración del Sistema' },
        ]
    }
];

export type PermissionId = string;
