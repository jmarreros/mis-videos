import { router } from '@inertiajs/react';
import { DragEvent, useState } from 'react';

export const VIDEO_DRAG_TYPE = 'application/x-mis-videos';

export function setVideoDragData(event: DragEvent, ulids: string[]) {
    event.dataTransfer.setData(VIDEO_DRAG_TYPE, JSON.stringify(ulids));
    event.dataTransfer.effectAllowed = 'move';
}

export function moveVideos(ulids: string[], folderId: number | null, onSuccess?: () => void) {
    router.post(route('videos.move'), { ids: ulids, folder_id: folderId }, { preserveScroll: true, onSuccess });
}

/** Turns any element into a drop target that moves dragged videos into `folderId` (null = root). */
export function useVideoDrop(folderId: number | null) {
    const [isOver, setIsOver] = useState(false);

    const accepts = (event: DragEvent) => event.dataTransfer.types.includes(VIDEO_DRAG_TYPE);

    return {
        isOver,
        handlers: {
            onDragOver: (event: DragEvent) => {
                if (!accepts(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setIsOver(true);
            },
            onDragLeave: () => setIsOver(false),
            onDrop: (event: DragEvent) => {
                setIsOver(false);
                if (!accepts(event)) return;
                event.preventDefault();
                const ulids = JSON.parse(event.dataTransfer.getData(VIDEO_DRAG_TYPE) || '[]') as string[];
                if (ulids.length) moveVideos(ulids, folderId);
            },
        },
    };
}
