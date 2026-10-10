import { ThumbnailDialog } from '@/components/thumbnail-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VideoCard } from '@/components/video-card';
import { useLibraryActions } from '@/hooks/use-library-actions';
import AppLayout from '@/layouts/app-layout';
import { folderBreadcrumbs } from '@/lib/breadcrumbs';
import { formatBytes, formatDate, formatDuration, formatResolution } from '@/lib/format';
import { type FolderRef, type Video } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Calendar, Check, CircleCheck, Clock, Download, Folder, FolderInput, HardDrive, Image, Library, Monitor, Pencil, Star, Trash2, X } from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';

interface Props {
    video: Video;
    ancestors: FolderRef[];
    related: Video[];
}

export default function VideoShow({ video, ancestors, related }: Props) {
    const player = useRef<HTMLVideoElement>(null);
    const [editing, setEditing] = useState(false);
    const [thumbOpen, setThumbOpen] = useState(false);
    const actions = useLibraryActions();
    const form = useForm({ title: video.title });

    const breadcrumbs = [...folderBreadcrumbs(ancestors), { title: video.title, href: route('videos.show', video.ulid) }];
    const folderHref = video.folder ? route('folders.show', video.folder.id) : route('library');

    const setCompleted = (completed: boolean) =>
        router.patch(route('videos.completed', video.ulid), { completed }, { preserveScroll: true, preserveState: true, only: ['video', 'related', 'flash'], onSuccess: () => router.flushAll() });

    const toggleFavorite = () =>
        router.patch(route('videos.favorite', video.ulid), { favorite: !video.favorited_at }, { preserveScroll: true, preserveState: true, only: ['video', 'related', 'flash'], onSuccess: () => router.flushAll() });

    const saveTitle = (event: FormEvent) => {
        event.preventDefault();
        form.patch(route('videos.update', video.ulid), { preserveScroll: true, onSuccess: () => setEditing(false) });
    };

    const meta = [
        { icon: Calendar, label: formatDate(video.created_at) },
        video.duration ? { icon: Clock, label: formatDuration(video.duration) } : null,
        video.width ? { icon: Monitor, label: formatResolution(video.width, video.height) } : null,
        { icon: HardDrive, label: formatBytes(video.size) },
    ].filter((item): item is { icon: typeof Calendar; label: string } => item !== null);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={video.title} />

            <div className="mx-auto w-full max-w-[1400px] flex-1 px-0 pb-10 sm:px-4 sm:pt-6 md:px-8">
                <div className="overflow-hidden bg-black shadow-2xl shadow-black/30 sm:rounded-2xl">
                    <video
                        key={video.ulid}
                        ref={player}
                        src={video.stream_url}
                        poster={video.thumbnail_url ?? undefined}
                        controls
                        crossOrigin="anonymous"
                        autoPlay
                        onEnded={() => !video.completed_at && setCompleted(true)}
                        playsInline
                        preload="metadata"
                        className="mx-auto max-h-[75vh] w-full bg-black"
                        style={video.width && video.height ? { aspectRatio: `${video.width} / ${video.height}` } : undefined}
                    />
                </div>

                <div className="mt-5 px-4 sm:px-0">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            {editing ? (
                                <form onSubmit={saveTitle} className="flex items-center gap-2">
                                    <Input
                                        autoFocus
                                        value={form.data.title}
                                        onChange={(e) => form.setData('title', e.target.value)}
                                        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
                                        className="h-11 text-lg font-semibold"
                                        maxLength={255}
                                    />
                                    <Button type="submit" size="icon" disabled={form.processing || !form.data.title.trim()} aria-label="Guardar título">
                                        <Check />
                                    </Button>
                                    <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancelar">
                                        <X />
                                    </Button>
                                </form>
                            ) : (
                                <h1 className="group flex items-start gap-2 text-xl font-semibold tracking-tight md:text-2xl">
                                    <span className="break-words">{video.title}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            form.setData('title', video.title);
                                            setEditing(true);
                                        }}
                                        className="text-muted-foreground hover:text-foreground mt-1 shrink-0 rounded-md p-1 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                                        aria-label="Editar título"
                                    >
                                        <Pencil className="size-4" />
                                    </button>
                                </h1>
                            )}
                            {form.errors.title && <p className="text-destructive mt-1 text-sm">{form.errors.title}</p>}

                            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                                <Link href={folderHref} className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium transition-colors">
                                    {video.folder ? <Folder className="size-3.5" /> : <Library className="size-3.5" />}
                                    {video.folder?.name ?? 'Biblioteca'}
                                </Link>
                                {meta.map(({ icon: Icon, label }) => (
                                    <span key={label} className="inline-flex items-center gap-1.5">
                                        <Icon className="size-3.5" /> {label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button variant={video.completed_at ? 'default' : 'secondary'} onClick={() => setCompleted(!video.completed_at)}>
                                <CircleCheck /> {video.completed_at ? 'Completado' : 'Marcar como completado'}
                            </Button>
                            <Button variant="secondary" size="icon" onClick={toggleFavorite} title={video.favorited_at ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
                                <Star className={video.favorited_at ? 'fill-amber-400 text-amber-400' : ''} />
                            </Button>
                            <Button variant="secondary" onClick={() => actions.moveVideos([video.ulid], video.folder_id)}>
                                <FolderInput /> Mover
                            </Button>
                            <Button variant="secondary" onClick={() => setThumbOpen(true)}>
                                <Image /> Miniatura
                            </Button>
                            <Button variant="secondary" size="icon" asChild title="Descargar">
                                <a href={`${video.stream_url}?download=1`}>
                                    <Download />
                                </a>
                            </Button>
                            <Button variant="secondary" size="icon" title="Eliminar" onClick={() => actions.deleteVideo(video)} className="hover:text-destructive">
                                <Trash2 />
                            </Button>
                        </div>
                    </div>
                </div>

                {related.length > 0 && (
                    <section className="mt-12 px-4 sm:px-0">
                        <h2 className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
                            Más en {video.folder?.name ?? 'Biblioteca'}
                        </h2>
                        <div className="grid grid-cols-1 gap-x-5 gap-y-8 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {related.map((item) => (
                                <VideoCard key={item.ulid} video={item} />
                            ))}
                        </div>
                    </section>
                )}
            </div>

            <ThumbnailDialog video={video} player={player.current} open={thumbOpen} onOpenChange={setThumbOpen} />
            {actions.dialogs}
        </AppLayout>
    );
}
