import { HttpError, request, xsrfToken } from '@/lib/http';
import { type Video } from '@/types';

interface UploadState {
    uuid: string;
    size: number;
    part_size: number;
    part_count: number;
    parts: { number: number; size: number }[];
}

interface PartTarget {
    url: string;
    headers: Record<string, string>;
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
    /** Called once all bytes are stored; returns the metadata to save. */
    getCompleteData: () => CompleteData | Promise<CompleteData>;
}

const MAX_RETRIES = 5;
const CONCURRENCY = 3;

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

    const state = await request<UploadState>('POST', route('uploads.init'), { name: file.name, size: file.size, mime: file.type || null }, signal);
    safeStorage(() => localStorage.setItem(key, state.uuid));

    return state;
}

/** Bytes already stored for this file by a previous (interrupted) session. */
export async function resumableBytes(file: File): Promise<number> {
    const uuid = safeStorage(() => localStorage.getItem(storageKey(file)));
    if (!uuid) return 0;
    try {
        const state = await request<UploadState>('GET', route('uploads.show', uuid));
        return state.parts.reduce((sum, part) => sum + part.size, 0);
    } catch {
        return 0;
    }
}

/**
 * PUTs a part to its target URL: a presigned S3 URL (cross-origin, no extra
 * headers allowed) or this server when the media disk is local.
 */
function putPart(target: PartTarget, body: Blob, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', target.url);
        Object.entries(target.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
        if (new URL(target.url, location.href).origin === location.origin) {
            xhr.setRequestHeader('X-XSRF-TOKEN', xsrfToken());
            xhr.setRequestHeader('Accept', 'application/json');
        }

        const abort = () => xhr.abort();
        signal.addEventListener('abort', abort);

        xhr.upload.onprogress = (event) => onProgress(event.loaded);
        xhr.onload = () => {
            signal.removeEventListener('abort', abort);
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new HttpError(xhr.status, { message: `Error al subir la parte (${xhr.status})` }));
        };
        xhr.onerror = () => {
            signal.removeEventListener('abort', abort);
            reject(new HttpError(0, { message: 'Error de red al subir. Si usas S3, revisa la configuración CORS del bucket.' }));
        };
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

        xhr.send(body);
    });
}

export async function uploadVideo({ file, signal, onProgress, getCompleteData }: Options): Promise<{ video: Video; url: string }> {
    const state = await startOrResume(file, signal);

    const done = new Set(state.parts.map((part) => part.number));
    let completedBytes = state.parts.reduce((sum, part) => sum + part.size, 0);
    const inFlight = new Map<number, number>();
    const pending = Array.from({ length: state.part_count }, (_, i) => i + 1).filter((number) => !done.has(number));

    const startedAt = performance.now();
    const resumedBytes = completedBytes;
    let speed = 0;

    const report = () => {
        const loaded = completedBytes + [...inFlight.values()].reduce((sum, bytes) => sum + bytes, 0);
        const seconds = (performance.now() - startedAt) / 1000;
        if (seconds > 0.5) speed = (loaded - resumedBytes) / seconds;
        onProgress({ loaded: Math.min(loaded, file.size), total: file.size, speed });
    };
    report();

    const uploadPart = async (number: number) => {
        const start = (number - 1) * state.part_size;
        const body = file.slice(start, Math.min(start + state.part_size, file.size));

        for (let attempt = 0; ; attempt++) {
            try {
                const target = await request<PartTarget>('POST', route('uploads.parts.sign', { upload: state.uuid, number }), undefined, signal);
                await putPart(target, body, signal, (loaded) => {
                    inFlight.set(number, loaded);
                    report();
                });
                break;
            } catch (error) {
                inFlight.delete(number);
                if (signal.aborted) throw error;
                const retryable = !(error instanceof HttpError) || error.status === 0 || error.status >= 500 || error.status === 429 || error.status === 403;
                if (attempt >= MAX_RETRIES || !retryable) throw error;
                await sleep(1000 * 2 ** attempt, signal);
            }
        }

        inFlight.delete(number);
        completedBytes += body.size;
        report();
    };

    const worker = async () => {
        for (let number = pending.shift(); number !== undefined; number = pending.shift()) {
            await uploadPart(number);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

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
