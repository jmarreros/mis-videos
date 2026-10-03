import { type Video } from '@/types';
import { useCallback, useEffect, useState } from 'react';

export function useSelection(videos: Video[]) {
    const [active, setActive] = useState(false);
    const [ids, setIds] = useState<string[]>([]);

    // Drop ids that are no longer on the page (moved or deleted).
    useEffect(() => {
        setIds((prev) => prev.filter((id) => videos.some((video) => video.ulid === id)));
    }, [videos]);

    const clear = useCallback(() => {
        setIds([]);
        setActive(false);
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && clear();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [clear]);

    return {
        active: active || ids.length > 0,
        ids,
        has: (id: string) => ids.includes(id),
        start: () => setActive(true),
        clear,
        selectAll: () => setIds(videos.map((video) => video.ulid)),
        toggle: (video: Video) => setIds((prev) => (prev.includes(video.ulid) ? prev.filter((id) => id !== video.ulid) : [...prev, video.ulid])),
    };
}
