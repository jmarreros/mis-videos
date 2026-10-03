import { HttpError, request } from '@/lib/http';
import { type Video } from '@/types';

interface UploadState {
    uuid: string;
    size: number;
    received_bytes: number;
    chunk_size: number;
}

export interface UploadProgress {
    loaded: number;
    total: number;
    /** Bytes per second, smoothed. */
    speed: number;
}

export interface CompleteData {
    title: string;
    folder_id: number | null;
    duration?: number | null;
    width?: number | null;
    height?: number | null;
    thumbnail?: Blob | null;
}

interface Options {
    file: File;
    signal: AbortSignal;
    onProgress: (progress: UploadProgress) => void;
    /** Called once all bytes are on the server; returns the metadata to save. */
    getCompleteData: () => CompleteData | Promise<CompleteData>;
}

const MAX_RETRIES = 5;

function storageKey(file: File): string {
    return `upload:${file.name}:${file.size}:${file.lastModified}`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        });
    });
}

function safeStorage<T>(fn: () => T): T | null {
    try {
        return fn();
    } catch {
        return null;
    }
}

async function startOrResume(file: File, signal: AbortSignal): Promise<UploadState> {
    const key = storageKey(file);
    const existing = safeStorage(() => localStorage.getItem(key));

    if (existing) {
        try {
            return await request<UploadState>('GET', route('uploads.show', existing), undefined, signal);
        } catch (error) {
            if (!(error instanceof HttpError && error.status === 404)) throw error;
        }
    }

    const state = await request<UploadState>(
        'POST',
        route('uploads.init'),
        { name: file.name, size: file.size, mime: file.type || null },
        signal,
    );
    safeStorage(() => localStorage.setItem(key, state.uuid));

    return state;
}

/** Bytes already on the server for this file from a previous (interrupted) session. */
export async function resumableBytes(file: File): Promise<number> {
    const uuid = safeStorage(() => localStorage.getItem(storageKey(file)));
    if (!uuid) return 0;
    try {
        const state = await request<UploadState>('GET', route('uploads.show', uuid));
        return state.received_bytes;
    } catch {
        return 0;
    }
}

export async function uploadVideo({ file, signal, onProgress, getCompleteData }: Options): Promise<{ video: Video; url: string }> {
    let state = await startOrResume(file, signal);
    let offset = state.received_bytes;
    let speed = 0;

    onProgress({ loaded: offset, total: file.size, speed });

    while (offset < file.size) {
        const end = Math.min(offset + state.chunk_size, file.size);
        const form = new FormData();
        form.append('offset', String(offset));
        form.append('chunk', file.slice(offset, end), 'chunk');

        const started = performance.now();

        for (let attempt = 0; ; attempt++) {
            try {
                state = await request<UploadState>('POST', route('uploads.chunk', state.uuid), form, signal);
                break;
            } catch (error) {
                if (signal.aborted) throw error;
                // The server tells us where it actually is; continue from there.
                if (error instanceof HttpError && error.status === 409 && typeof error.body.received_bytes === 'number') {
                    state = { ...state, received_bytes: error.body.received_bytes };
                    break;
                }
                if (attempt >= MAX_RETRIES || (error instanceof HttpError && error.status < 500 && error.status !== 429)) {
                    throw error;
                }
                await sleep(1000 * 2 ** attempt, signal);
            }
        }

        const seconds = (performance.now() - started) / 1000;
        const instant = (state.received_bytes - offset) / Math.max(seconds, 0.001);
        speed = speed ? speed * 0.7 + instant * 0.3 : instant;
        offset = state.received_bytes;

        onProgress({ loaded: offset, total: file.size, speed });
    }

    const data = await getCompleteData();
    const form = new FormData();
    form.append('title', data.title);
    if (data.folder_id) form.append('folder_id', String(data.folder_id));
    if (data.duration) form.append('duration', String(data.duration));
    if (data.width) form.append('width', String(data.width));
    if (data.height) form.append('height', String(data.height));
    if (data.thumbnail) form.append('thumbnail', data.thumbnail, 'thumbnail.jpg');

    const result = await request<{ video: Video; url: string }>('POST', route('uploads.complete', state.uuid), form, signal);
    safeStorage(() => localStorage.removeItem(storageKey(file)));

    return result;
}

export async function cancelUpload(file: File): Promise<void> {
    const key = storageKey(file);
    const uuid = safeStorage(() => localStorage.getItem(key));
    safeStorage(() => localStorage.removeItem(key));
    if (uuid) {
        await request('DELETE', route('uploads.destroy', uuid)).catch(() => undefined);
    }
}
