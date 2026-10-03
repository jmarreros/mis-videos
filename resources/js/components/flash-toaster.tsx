import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { Toaster, toast } from 'sonner';

export function FlashToaster() {
    const { flash, errors } = usePage<SharedData & { errors: Record<string, string> }>().props;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash]);

    // Validation errors on actions that don't render an inline form (e.g. moving).
    useEffect(() => {
        const messages = Object.values(errors ?? {});
        if (messages.length && document.querySelector('[role="dialog"]') === null) {
            toast.error(messages[0]);
        }
    }, [errors]);

    return <Toaster theme="dark" position="bottom-right" richColors closeButton />;
}
