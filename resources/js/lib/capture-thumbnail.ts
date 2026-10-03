export interface VideoMeta {
    duration: number;
    width: number;
    height: number;
}

const MAX_WIDTH = 1280;

function waitFor(video: HTMLVideoElement, event: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener(event, onEvent);
            video.removeEventListener('error', onError);
        };
        const onEvent = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error('El navegador no puede leer este video'));
        };
        video.addEventListener(event, onEvent);
        video.addEventListener('error', onError);
    });
}

/** Draws the current frame of a <video> into a JPEG blob. */
export function frameToBlob(video: HTMLVideoElement, quality = 0.85): Promise<Blob> {
    const scale = Math.min(1, MAX_WIDTH / (video.videoWidth || MAX_WIDTH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la miniatura'))), 'image/jpeg', quality);
    });
}

/**
 * Reads metadata and grabs frames from a local video file without uploading it.
 * Grabs are serialised, so moving a slider quickly never mixes up frames.
 */
export class FrameGrabber {
    private video: HTMLVideoElement;
    private url: string;
    private queue: Promise<unknown> = Promise.resolve();
    readonly meta: Promise<VideoMeta>;

    constructor(file: File) {
        this.url = URL.createObjectURL(file);
        this.video = document.createElement('video');
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.preload = 'auto';
        this.video.src = this.url;
        this.video.load();

        this.meta = waitFor(this.video, 'loadedmetadata').then(() => ({
            duration: this.video.duration,
            width: this.video.videoWidth,
            height: this.video.videoHeight,
        }));
        this.meta.catch(() => undefined);
    }

    grab(time: number): Promise<Blob> {
        const run = async () => {
            const { duration } = await this.meta;
            const target = Math.max(0, Math.min(time, Math.max(duration - 0.1, 0)));
            if (Math.abs(this.video.currentTime - target) > 0.01 || this.video.readyState < 2) {
                const seeked = waitFor(this.video, 'seeked');
                this.video.currentTime = target;
                await seeked;
            }
            return frameToBlob(this.video);
        };

        const result = this.queue.then(run, run);
        this.queue = result.catch(() => undefined);
        return result;
    }

    dispose(): void {
        this.video.removeAttribute('src');
        this.video.load();
        URL.revokeObjectURL(this.url);
    }
}

/** Default frame: 10% into the video, at least 1s in (frame 0 is often black) and at most 30s. */
export function defaultThumbnailTime(duration: number): number {
    if (!isFinite(duration) || duration <= 0) return 0;
    return Math.min(Math.max(duration * 0.1, Math.min(1, duration / 2)), 30);
}
