import { EmptyState } from '@/components/empty-state';
import { SelectionBar } from '@/components/selection-bar';
import { VideoCard } from '@/components/video-card';
import { VideoGrid } from '@/components/video-grid';
import { useLibraryActions } from '@/hooks/use-library-actions';
import { useSelection } from '@/hooks/use-selection';
import AppLayout from '@/layouts/app-layout';
import { type Video } from '@/types';
import { Head } from '@inertiajs/react';
import { Star } from 'lucide-react';

export default function Favorites({ videos }: { videos: Video[] }) {
    const selection = useSelection(videos);
    const actions = useLibraryActions({ onMoved: selection.clear });

    return (
        <AppLayout breadcrumbs={[{ title: 'Favoritos', href: route('favorites') }]}>
            <Head title="Favoritos" />

            <div className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-6 md:px-8 md:py-8">
                <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">Favoritos</h1>

                {videos.length === 0 ? (
                    <EmptyState icon={Star} title="Aún no hay favoritos" description="Marca un video con la estrella para tenerlo siempre a mano." />
                ) : (
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
