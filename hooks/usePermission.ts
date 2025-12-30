import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { PermissionId } from '@/lib/permissions';

export function usePermission(requiredPermission: PermissionId) {
    const access = useLiveQuery(async () => {
        // 1. Get current role from LocalStorage (Legacy Auth)
        const currentRoleName = sessionStorage.getItem('kontigo_staff_role');
        if (!currentRoleName) return false;

        // 2. Admin/Manager override (Super Admins) - Case Insensitive
        const normalizedRole = currentRoleName.toLowerCase().trim();
        if (['manager', 'admin', 'administrador', 'gerente', 'ceo', 'dueño'].includes(normalizedRole)) return true;

        // 3. Find the JobTitle with this name
        const role = await db.jobTitles.where('name').equals(currentRoleName).first();
        if (!role) return false;

        // 4. Check array
        return role.permissions?.includes(requiredPermission) || false;
    });

    return access;
}
