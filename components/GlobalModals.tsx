'use client';

import { useEffect, useState } from 'react';
import ClockInModal from './ClockInModal';

export default function GlobalModals() {
    const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);

    useEffect(() => {
        const handleOpen = () => setIsAttendanceOpen(true);
        window.addEventListener('open-attendance-modal', handleOpen);
        return () => window.removeEventListener('open-attendance-modal', handleOpen);
    }, []);

    return (
        <>
            <ClockInModal
                isOpen={isAttendanceOpen}
                onClose={() => setIsAttendanceOpen(false)}
                onSuccess={() => {
                    // Refresh data if needed via global event or context
                    window.dispatchEvent(new CustomEvent('refresh-shift-data'));
                }}
            />
        </>
    );
}
