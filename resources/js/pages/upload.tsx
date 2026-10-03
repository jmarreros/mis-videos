import { FolderPickerDialog } from '@/components/folder-picker-dialog';
import { ThumbnailPicker } from '@/components/thumbnail-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { defaultThumbnailTime, FrameGrabber } from '@/lib/capture-thumbnail';
import { cancelUpload, resumableBytes, uploadVideo } from '@/lib/chunked-upload';
import { folderLabel } from '@/lib/folders';
import { formatBytes, formatDuration, titleFromFilename } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { CheckCircle2, CloudUpload, ExternalLink, Folder, Library, RotateCcw, Trash2, TriangleAlert, Upload as UploadIcon, X } from 'lucide-react';
import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type Status = 'ready' | 'queued' | 'uploading' | 'done' | 'error';

interface Item {
    id: string;
    file: File;
    title: string;
    folderId: number | null;
    status: Status;
    loaded: number;
    speed: number;
    error: string | null;
    url: string | null;
    resumeFrom: number;
    duration: number | null;
    width: number | null;
    height: number | null;
    unsupported: boolean;
    thumbTime: number;
    thumbBlob: Blob | null;
    thumbUrl: string | null;
    capturing: boolean;
}

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|ogv|mpe?g|3gp)$/i;

function isVideo(file: File) {
    return file.type.startsWith('video/') || VIDEO_EXTENSIONS.test(file.name);
}

function formatEta(item: Item) {
    if (!item.speed) return '';
    const seconds = (item.file.size - item.loaded) / item.speed;
    return seconds < 60 ? `${Math.ceil(seconds)} s` : formatDuration(seconds);
}

export default function UploadPage({ folderId }: { folderId: number | null }) {
    const { folders } = usePage<SharedData>().props;
    const [items, setItems] = useState<Item[]>([]);
    const [dragging, setDragging] = useState(false);
    const [picker, setPicker] = useState<{ target: string | 'all'; value: number | null } | null>(null);
    const [defaultFolder, setDefaultFolder] = useState<number | null>(folderId);

    const itemsRef = useRef(items);
    itemsRef.current = items;
    const grabbers = useRef(new Map<string, FrameGrabber>());
    const captures = useRef(new Map<string, Promise<unknown>>());
    const controllers = useRef(new Map<string, AbortController>());
    const captureTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const fileInput = useRef<HTMLInputElement>(null);

    const update = useCallback((id: string, patch: Partial<Item> | ((item: Item) => Partial<Item>)) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item)));
    }, []);

    const setThumbnail = useCallback(
        (id: string, blob: Blob) => {
            update(id, (item) => {
                if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
                return { thumbBlob: blob, thumbUrl: URL.createObjectURL(blob), capturing: false };
            });
        },
        [update],
    );

    const capture = useCallback(
        (id: string, time: number) => {
            const grabber = grabbers.current.get(id);
            if (!grabber) return;
            update(id, { capturing: true });
            const promise = grabber
                .grab(time)
                .then((blob) => setThumbnail(id, blob))
                .catch(() => update(id, { capturing: false }));
            captures.current.set(id, promise);
        },
        [update, setThumbnail],
    );

    const addFiles = (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        const videos = files.filter(isVideo);
        if (videos.length < files.length) toast.error('Algunos archivos se ignoraron porque no son videos.');

        const added: Item[] = videos
            .filter((file) => !itemsRef.current.some((item) => item.file.name === file.name && item.file.size === file.size && item.status !== 'done'))
            .map((file) => ({
                id: crypto.randomUUID(),
                file,
                title: titleFromFilename(file.name) || file.name,
                folderId: defaultFolder,
                status: 'ready',
                loaded: 0,
                speed: 0,
                error: null,
                url: null,
                resumeFrom: 0,
                duration: null,
                width: null,
                height: null,
                unsupported: false,
                thumbTime: 0,
                thumbBlob: null,
                thumbUrl: null,
                capturing: false,
            }));

        setItems((prev) => [...prev, ...added]);

        added.forEach((item) => {
            const grabber = new FrameGrabber(item.file);
            grabbers.current.set(item.id, grabber);
            grabber.meta
                .then((meta) => {
                    const time = defaultThumbnailTime(meta.duration);
                    update(item.id, { duration: meta.duration, width: meta.width, height: meta.height, thumbTime: time });
                    capture(item.id, time);
                })
                .catch(() => update(item.id, { unsupported: true }));

            resumableBytes(item.file).then((bytes) => bytes && update(item.id, { resumeFrom: bytes }));
        });
    };

    const changeThumbTime = (id: string, time: number) => {
        update(id, { thumbTime: time });
        clearTimeout(captureTimers.current.get(id));
        captureTimers.current.set(
            id,
            setTimeout(() => capture(id, time), 120),
        );
    };

    const removeItem = (id: string) => {
        const item = itemsRef.current.find((i) => i.id === id);
        controllers.current.get(id)?.abort();
        grabbers.current.get(id)?.dispose();
        grabbers.current.delete(id);
        if (item?.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
        if (item && item.status !== 'done' && (item.loaded > 0 || item.resumeFrom > 0)) cancelUpload(item.file);
        setItems((prev) => prev.filter((i) => i.id !== id));
    };

    const start = async (id: string) => {
        const controller = new AbortController();
        controllers.current.set(id, controller);
        update(id, { status: 'uploading', error: null });

        try {
            const result = await uploadVideo({
                file: itemsRef.current.find((i) => i.id === id)!.file,
                signal: controller.signal,
                onProgress: ({ loaded, speed }) => update(id, { loaded, speed }),
                getCompleteData: async () => {
                    await captures.current.get(id);
                    const item = itemsRef.current.find((i) => i.id === id)!;
                    return {
                        title: item.title.trim() || item.file.name,
                        folder_id: item.folderId,
                        duration: item.duration,
                        width: item.width,
                        height: item.height,
                        thumbnail: item.thumbBlob,
                    };
                },
            });
            update(id, { status: 'done', url: result.url, loaded: itemsRef.current.find((i) => i.id === id)?.file.size ?? 0 });
            grabbers.current.get(id)?.dispose();
            grabbers.current.delete(id);
        } catch (error) {
            if (controller.signal.aborted) return;
            update(id, { status: 'error', error: error instanceof Error ? error.message : 'Error desconocido' });
        } finally {
            controllers.current.delete(id);
        }
    };

    // Uploads run one at a time, in order.
    useEffect(() => {
        if (items.some((item) => item.status === 'uploading')) return;
        const next = items.find((item) => item.status === 'queued');
        if (next) {
            start(next.id);
        } else if (items.length > 0 && items.every((item) => item.status === 'done')) {
            router.reload({ only: ['folders'] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.map((item) => item.status).join()]);

    const uploading = items.some((item) => item.status === 'uploading' || item.status === 'queued');

    useEffect(() => {
        if (!uploading) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        const removeInertiaGuard = router.on('before', (event) => {
            if (event.detail.visit.method === 'get' && !event.detail.visit.only.length && !event.detail.visit.prefetch) {
                return window.confirm('Hay subidas en curso. Si sales se pausarán (podrás reanudarlas). ¿Salir?');
            }
        });
        window.addEventListener('beforeunload', warn);
        return () => {
            window.removeEventListener('beforeunload', warn);
            removeInertiaGuard();
        };
    }, [uploading]);

    useEffect(
        () => () => {
            controllers.current.forEach((controller) => controller.abort());
            grabbers.current.forEach((grabber) => grabber.dispose());
        },
        [],
    );

    const queueAll = () => setItems((prev) => prev.map((item) => (item.status === 'ready' || item.status === 'error' ? { ...item, status: 'queued' } : item)));

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
    };

    const pending = items.filter((item) => item.status === 'ready' || item.status === 'error');
    const active = items.filter((item) => item.status !== 'done');
    const totalBytes = active.reduce((sum, item) => sum + item.file.size, 0);
    const loadedBytes = active.reduce((sum, item) => sum + item.loaded, 0);

    return (
        <AppLayout breadcrumbs={[{ title: 'Subir videos', href: route('upload') }]}>
            <Head title="Subir videos" />

            <div
                className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8"
                onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('Files')) return;
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
                onDrop={onDrop}
            >
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Subir videos</h1>
                        <p className="text-muted-foreground mt-1 text-sm">Elige la carpeta, ajusta el título y la miniatura, y sube.</p>
                    </div>
                    <Button variant="outline" onClick={() => setPicker({ target: 'all', value: defaultFolder })}>
                        {defaultFolder ? <Folder /> : <Library />}
                        <span className="max-w-56 truncate">Destino: {folderLabel(folders, defaultFolder)}</span>
                    </Button>
                </div>

                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className={cn(
                        'group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center transition-all',
                        items.length ? 'gap-1 px-6 py-6' : 'gap-3 px-6 py-16 md:py-24',
                        dragging ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-accent/40',
                    )}
                >
                    <div className="from-primary/10 pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div
                        className={cn(
                            'bg-primary/10 text-primary relative flex items-center justify-center rounded-2xl transition-transform group-hover:-translate-y-0.5',
                            items.length ? 'size-10' : 'size-16',
                        )}
                    >
                        <CloudUpload className={items.length ? 'size-5' : 'size-8'} />
                    </div>
                    <p className="relative font-medium">{dragging ? 'Suelta los archivos aquí' : 'Arrastra tus videos o haz clic para elegirlos'}</p>
                    {!items.length && <p className="text-muted-foreground relative text-sm">MP4, MOV, WebM… sin límite de tamaño. Puedes subir varios a la vez.</p>}
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="video/*,.mkv,.avi,.m4v,.mov"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = '';
                    }}
                />

                {items.length > 0 && (
                    <>
                        <div className="bg-background/85 sticky top-14 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3 backdrop-blur-lg md:-mx-8 md:px-8">
                            <div className="text-sm">
                                <span className="font-medium">
                                    {items.length} {items.length === 1 ? 'archivo' : 'archivos'}
                                </span>
                                {totalBytes > 0 && (
                                    <span className="text-muted-foreground">
                                        {' '}
                                        · {uploading ? `${formatBytes(loadedBytes)} de ` : ''}
                                        {formatBytes(totalBytes)}
                                    </span>
                                )}
                            </div>
                            {pending.length > 0 && (
                                <Button onClick={queueAll} className="shadow-primary/25 shadow-md">
                                    <UploadIcon />
                                    {pending.length === 1 ? 'Subir video' : `Subir ${pending.length} videos`}
                                </Button>
                            )}
                            {!pending.length && !uploading && (
                                <Button variant="secondary" asChild>
                                    <Link href={defaultFolder ? route('folders.show', defaultFolder) : route('library')}>Ir a la biblioteca</Link>
                                </Button>
                            )}
                        </div>

                        <ul className="mt-2 space-y-3">
                            {items.map((item) => (
                                <UploadRow
                                    key={item.id}
                                    item={item}
                                    folderName={folderLabel(folders, item.folderId)}
                                    onTitle={(title) => update(item.id, { title })}
                                    onPickFolder={() => setPicker({ target: item.id, value: item.folderId })}
                                    onThumbTime={(time) => changeThumbTime(item.id, time)}
                                    onCustomThumb={(file) => {
                                        captures.current.delete(item.id);
                                        setThumbnail(item.id, file);
                                    }}
                                    onRetry={() => update(item.id, { status: 'queued' })}
                                    onRemove={() => removeItem(item.id)}
                                />
                            ))}
                        </ul>
                    </>
                )}
            </div>

            <FolderPickerDialog
                open={!!picker}
                onOpenChange={(open) => !open && setPicker(null)}
                title={picker?.target === 'all' ? 'Carpeta de destino' : 'Carpeta para este video'}
                description={picker?.target === 'all' ? 'Se aplicará a los videos que aún no se han subido.' : undefined}
                value={picker?.value ?? null}
                confirmLabel="Elegir"
                onSelect={(id) => {
                    if (picker?.target === 'all') {
                        setDefaultFolder(id);
                        setItems((prev) => prev.map((item) => (item.status === 'done' ? item : { ...item, folderId: id })));
                    } else if (picker) {
                        update(picker.target, { folderId: id });
                    }
                    setPicker(null);
                }}
            />
        </AppLayout>
    );
}

interface RowProps {
    item: Item;
    folderName: string;
    onTitle: (title: string) => void;
    onPickFolder: () => void;
    onThumbTime: (time: number) => void;
    onCustomThumb: (file: File) => void;
    onRetry: () => void;
    onRemove: () => void;
}

function UploadRow({ item, folderName, onTitle, onPickFolder, onThumbTime, onCustomThumb, onRetry, onRemove }: RowProps) {
    const done = item.status === 'done';
    const percent = item.file.size ? Math.floor((item.loaded / item.file.size) * 100) : 0;
    const locked = done;

    return (
        <li
            className={cn(
                'bg-card animate-in fade-in slide-in-from-bottom-2 grid gap-4 rounded-2xl border p-3 duration-300 sm:grid-cols-[220px_1fr] sm:p-4',
                done && 'border-emerald-500/30',
                item.status === 'error' && 'border-destructive/40',
            )}
        >
            <ThumbnailPicker
                thumbnailUrl={item.thumbUrl}
                duration={item.duration}
                time={item.thumbTime}
                capturing={item.capturing}
                unsupported={item.unsupported}
                disabled={locked}
                onTimeChange={onThumbTime}
                onCustomImage={onCustomThumb}
            />

            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-start gap-2">
                    <Input
                        value={item.title}
                        onChange={(e) => onTitle(e.target.value)}
                        disabled={locked}
                        placeholder="Título del video"
                        className="h-10 font-medium"
                        maxLength={255}
                    />
                    {done ? (
                        <Button variant="ghost" size="icon" asChild title="Ver video">
                            <Link href={item.url!}>
                                <ExternalLink />
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" onClick={onRemove} title={item.status === 'uploading' ? 'Cancelar subida' : 'Quitar'}>
                            {item.status === 'uploading' ? <X /> : <Trash2 />}
                        </Button>
                    )}
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <button
                        type="button"
                        onClick={onPickFolder}
                        disabled={locked}
                        className="bg-secondary text-secondary-foreground hover:bg-accent inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors disabled:opacity-70"
                    >
                        <Folder className="size-3.5 shrink-0" />
                        <span className="truncate">{folderName}</span>
                    </button>
                    <span className="truncate" title={item.file.name}>
                        {item.file.name}
                    </span>
                    <span>{formatBytes(item.file.size)}</span>
                    {item.duration ? <span>{formatDuration(item.duration)}</span> : null}
                    {item.width ? (
                        <span>
                            {item.width}×{item.height}
                        </span>
                    ) : null}
                </div>

                <div className="mt-auto">
                    {done ? (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-500">
                            <CheckCircle2 className="size-4" /> Subido
                        </p>
                    ) : item.status === 'error' ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-destructive flex items-center gap-1.5 text-sm">
                                <TriangleAlert className="size-4 shrink-0" /> {item.error}
                            </p>
                            <Button size="sm" variant="outline" onClick={onRetry}>
                                <RotateCcw /> Reintentar
                            </Button>
                        </div>
                    ) : item.status === 'ready' ? (
                        <p className="text-muted-foreground text-xs">
                            {item.resumeFrom > 0
                                ? `Subida interrumpida anteriormente: se reanudará desde ${Math.floor((item.resumeFrom / item.file.size) * 100)}%`
                                : 'Listo para subir'}
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            <div className="bg-secondary h-2 overflow-hidden rounded-full">
                                <div
                                    className={cn(
                                        'from-primary h-full rounded-full bg-gradient-to-r to-indigo-500 transition-[width] duration-300',
                                        item.status === 'queued' && 'opacity-40',
                                    )}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
                                <span>
                                    {item.status === 'queued' ? 'En cola' : percent >= 100 ? 'Procesando…' : `${percent}% · ${formatBytes(item.loaded)} de ${formatBytes(item.file.size)}`}
                                </span>
                                {item.status === 'uploading' && item.speed > 0 && percent < 100 && (
                                    <span>
                                        {formatBytes(item.speed)}/s · {formatEta(item)}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}
