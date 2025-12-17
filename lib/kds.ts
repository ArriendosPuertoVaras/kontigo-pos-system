import { differenceInMinutes } from 'date-fns';

export type WaitStatus = 'normal' | 'warning' | 'critical';

export const KDS_THRESHOLDS = {
    WARNING: 10, // Minutes for Yellow
    CRITICAL: 20 // Minutes for Red
};

export function getOrderWaitTime(createdAt: Date | string): number {
    const start = new Date(createdAt);
    const now = new Date();
    // Use seconds to be more precise or debug
    const diffMs = now.getTime() - start.getTime();
    return Math.floor(diffMs / 60000); // Still return minutes for compatibility, but ensure calculation is fresh
}

export function getOrderWaitTimeFormatted(createdAt: Date | string): string {
    const start = new Date(createdAt);
    const now = new Date();
    const diff = Math.max(0, now.getTime() - start.getTime());
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getWaitStatus(minutes: number): WaitStatus {
    if (minutes >= KDS_THRESHOLDS.CRITICAL) return 'critical';
    if (minutes >= KDS_THRESHOLDS.WARNING) return 'warning';
    return 'normal';
}

export function getStatusColorClasses(status: WaitStatus, type: 'border' | 'bg' | 'text' | 'ring' = 'text'): string {
    const colors = {
        normal: {
            border: 'border-green-500',
            bg: 'bg-green-500',
            bgLight: 'bg-green-500/10',
            text: 'text-green-500',
            ring: 'ring-green-500'
        },
        warning: {
            border: 'border-yellow-500',
            bg: 'bg-yellow-500',
            bgLight: 'bg-yellow-500/10',
            text: 'text-yellow-500',
            ring: 'ring-yellow-500'
        },
        critical: {
            border: 'border-red-500',
            bg: 'bg-red-500',
            bgLight: 'bg-red-500/10',
            text: 'text-red-500',
            ring: 'ring-red-500'
        }
    };

    const c = colors[status];

    // Custom mapping for composite classes often used in UI
    if (type === 'bg' && (status === 'normal' || status === 'warning' || status === 'critical')) return c.bg;

    return c[type as keyof typeof c] || '';
}
