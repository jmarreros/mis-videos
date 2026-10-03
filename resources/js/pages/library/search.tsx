import { EmptyState } from '@/components/empty-state';
import { SelectionBar } from '@/components/selection-bar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoCard } from '@/components/video-card';
import { VideoGrid } from '@/components/video-grid';
import { useLibraryActions } from '@/hooks/use-library-actions';
import { useSelection } from '@/hooks/use-selection';
import AppLayout from '@/layouts/app-layout';
import { buildFolderTree, flattenTree } from '@/lib/folders';
import { type SharedData, type Video } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { LoaderCircle, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
    filters: { q: string; folder: number | null };
    videos: Video[];
}

export default function SearchPage({ filters, videos }: Props) {
    const { folders } = usePage<SharedData>().props;
    const [query, setQuery] = useState(filters.q);
    const [folder, setFolder] = useState<string>(filters.folder ? String(filters.folder) : 'all');
    const [loading, setLoading] = useState(false);
    const firstRender = useRef(true);
    const selection = useSelection(videos);
    const actions = useLibraryActions({ onMoved: selection.clear });
    const options = useMemo(() => flattenTree(buildFolderTree(folders)), [folders]);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timer = setTimeout(() => {
            const params: Record<string, string> = {};
            if (query.trim()) params.q = query.trim();
            if (folder !== 'all') params.folder = folder;
            router.get(route('search'), params, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onStart: () => setLoading(true),
                onFinish: () => setLoading(false),
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [query, folder]);

    return (
        <AppLayout breadcrumbs={[{ title: 'Buscar', href: route('search') }]}>
            <Head title="Buscar" />

            <div className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 md:px-8 md:py-8">
                <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">Buscar videos</h1>

                <div className="mb-8 flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
                        <Input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar por título…"
                            className="h-11 rounded-xl pl-10 text-base md:text-sm"
                        />
                        {loading && <LoaderCircle className="text-muted-foreground absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin" />}
                    </div>
                    <Select value={folder} onValueChange={setFolder}>
                        <SelectTrigger className="h-11 rounded-xl sm:w-64">
                            <SelectValue placeholder="Todas las carpetas" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las carpetas</SelectItem>
                            {options.map(({ folder: option, depth }) => (
                                <SelectItem key={option.id} value={String(option.id)}>
                                    <span style={{ paddingLeft: `${depth * 0.9}rem` }}>{option.name}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {videos.length === 0 ? (
                    <EmptyState
                        icon={SearchX}
                        title="Sin resultados"
                        description={filters.q ? `No hay videos que coincidan con «${filters.q}».` : 'Todavía no hay videos aquí.'}
                    />
                ) : (
                    <>
                        <p className="text-muted-foreground mb-4 text-sm">
                            {videos.length} {videos.length === 1 ? 'resultado' : 'resultados'}
                            {folder !== 'all' && ' (incluye subcarpetas)'}
                        </p>
                        <VideoGrid>
                            {videos.map((video) => (
                                <VideoCard
                                    key={video.ulid}
                                    video={video}
                                    showFolder
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
                    </>
                )}
            </div>

            <SelectionBar
                count={selection.ids.length}
                total={videos.length}
                onSelectAll={selection.selectAll}
                onClear={selection.clear}
                onMove={() => actions.moveVideos(selection.ids, null)}
            />
            {actions.dialogs}
        </AppLayout>
    );
}
