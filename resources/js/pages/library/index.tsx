import { EmptyState } from '@/components/empty-state';
import { FolderCard } from '@/components/folder-card';
import { FolderDialog } from '@/components/folder-dialog';
import { SelectionBar } from '@/components/selection-bar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { VideoCard } from '@/components/video-card';
import { VideoGrid } from '@/components/video-grid';
import { useLibraryActions } from '@/hooks/use-library-actions';
import { useSelection } from '@/hooks/use-selection';
import AppLayout from '@/layouts/app-layout';
import { folderBreadcrumbs } from '@/lib/breadcrumbs';
import { type Folder, type FolderRef, type Video } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { ArrowDownUp, CheckSquare, FolderInput, FolderPlus, Library, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
    folder: Folder | null;
    ancestors: FolderRef[];
    subfolders: Folder[];
    videos: Video[];
}

type Sort = 'newest' | 'oldest' | 'title';

const sortLabels: Record<Sort, string> = { newest: 'Más recientes', oldest: 'Más antiguos', title: 'Título (A–Z)' };

export default function LibraryIndex({ folder, ancestors, subfolders, videos }: Props) {
    const [creating, setCreating] = useState(false);
    const [sort, setSort] = useState<Sort>('newest');
    const selection = useSelection(videos);
    const actions = useLibraryActions({ onMoved: selection.clear });

    const sorted = useMemo(() => {
        const list = [...videos];
        if (sort === 'oldest') list.reverse();
        if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true, sensitivity: 'base' }));
        return list;
    }, [videos, sort]);

    const breadcrumbs = folderBreadcrumbs(folder ? [...ancestors, folder] : []);
    const title = folder?.name ?? 'Biblioteca';
    const isEmpty = subfolders.length === 0 && videos.length === 0;
    const uploadHref = route('upload', folder ? { folder: folder.id } : {});

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={title} />

            <div className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 md:px-8 md:py-8">
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {subfolders.length > 0 && `${subfolders.length} ${subfolders.length === 1 ? 'carpeta' : 'carpetas'} · `}
                            {videos.length} {videos.length === 1 ? 'video' : 'videos'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setCreating(true)}>
                            <FolderPlus />
                            <span className="hidden sm:inline">Nueva carpeta</span>
                        </Button>
                        <Button asChild>
                            <Link href={uploadHref}>
                                <Upload />
                                Subir
                            </Link>
                        </Button>
                        {folder && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label="Opciones de carpeta">
                                        <MoreHorizontal />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onSelect={() => actions.renameFolder(folder)}>
                                        <Pencil /> Renombrar carpeta
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => actions.moveFolder(folder)}>
                                        <FolderInput /> Mover carpeta
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => actions.deleteFolder(folder)} className="text-destructive focus:text-destructive">
                                        <Trash2 /> Eliminar carpeta
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

                {isEmpty ? (
                    <EmptyState
                        icon={Library}
                        title={folder ? 'Esta carpeta está vacía' : 'Tu biblioteca está vacía'}
                        description="Sube tu primer video o crea carpetas para organizar tu colección."
                    >
                        <Button asChild>
                            <Link href={uploadHref}>
                                <Upload /> Subir video
                            </Link>
                        </Button>
                        <Button variant="outline" onClick={() => setCreating(true)}>
                            <FolderPlus /> Nueva carpeta
                        </Button>
                    </EmptyState>
                ) : (
                    <div className="space-y-10">
                        {subfolders.length > 0 && (
                            <section>
                                <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Carpetas</h2>
                                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
                                    {subfolders.map((sub) => (
                                        <FolderCard
                                            key={sub.id}
                                            folder={sub}
                                            onRename={actions.renameFolder}
                                            onMove={actions.moveFolder}
                                            onDelete={actions.deleteFolder}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {videos.length > 0 && (
                            <section>
                                <div className="mb-4 flex items-center justify-between gap-2">
                                    <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Videos</h2>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant={selection.active ? 'secondary' : 'ghost'}
                                            size="sm"
                                            onClick={selection.active ? selection.clear : selection.start}
                                        >
                                            <CheckSquare /> {selection.active ? 'Cancelar' : 'Seleccionar'}
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm">
                                                    <ArrowDownUp /> <span className="hidden sm:inline">{sortLabels[sort]}</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {(Object.keys(sortLabels) as Sort[]).map((key) => (
                                                    <DropdownMenuItem key={key} onSelect={() => setSort(key)} className={key === sort ? 'text-primary' : ''}>
                                                        {sortLabels[key]}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                <VideoGrid>
                                    {sorted.map((video) => (
                                        <VideoCard
                                            key={video.ulid}
                                            video={video}
                                            selected={selection.has(video.ulid)}
                                            selecting={selection.active}
                                            onToggleSelect={selection.toggle}
                                            dragIds={selection.ids}
                                            onRename={actions.renameVideo}
                                            onMove={(v) => actions.moveVideos([v.ulid], v.folder_id)}
                                            onDelete={actions.deleteVideo}
                                        />
                                    ))}
                                </VideoGrid>
                            </section>
                        )}
                    </div>
                )}
            </div>

            <SelectionBar
                count={selection.ids.length}
                total={videos.length}
                onSelectAll={selection.selectAll}
                onClear={selection.clear}
                onMove={() => actions.moveVideos(selection.ids, folder?.id ?? null)}
            />

            <FolderDialog open={creating} onOpenChange={setCreating} parentId={folder?.id ?? null} />
            {actions.dialogs}
        </AppLayout>
    );
}
