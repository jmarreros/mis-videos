import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { setVideoDragData } from '@/hooks/use-video-drop';
import { formatDate, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type Video } from '@/types';
import { Link } from '@inertiajs/react';
import { Check, Film, FolderInput, MoreVertical, Pencil, Play, Trash2 } from 'lucide-react';

interface Props {
    video: Video;
    selected?: boolean;
    selecting?: boolean;
    onToggleSelect?: (video: Video) => void;
    /** Ids dragged along when this card is dragged (the selection, if it's part of it). */
    dragIds?: string[];
    showFolder?: boolean;
    onRename?: (video: Video) => void;
    onMove?: (video: Video) => void;
    onDelete?: (video: Video) => void;
}

export function VideoCard({ video, selected, selecting, onToggleSelect, dragIds, showFolder, onRename, onMove, onDelete }: Props) {
    const hasActions = onRename || onMove || onDelete;

    const handleClick = (event: React.MouseEvent) => {
        if (selecting || event.metaKey || event.ctrlKey) {
            event.preventDefault();
            onToggleSelect?.(video);
        }
    };

    return (
        <div
            className="group relative"
            draggable
            onDragStart={(event) => setVideoDragData(event, selected && dragIds?.length ? dragIds : [video.ulid])}
        >
            <Link href={route('videos.show', video.ulid)} onClick={handleClick} className="block focus-visible:outline-none" prefetch="hover">
                <div
                    className={cn(
                        'bg-muted relative aspect-video overflow-hidden rounded-xl ring-1 ring-black/5 transition-all duration-300 dark:ring-white/5',
                        'group-hover:shadow-xl group-hover:shadow-black/20 group-focus-within:ring-primary',
                        selected && 'ring-primary ring-[3px]',
                    )}
                >
                    {video.thumbnail_url ? (
                        <img
                            src={video.thumbnail_url}
                            alt=""
                            loading="lazy"
                            draggable={false}
                            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                        />
                    ) : (
                        <div className="from-muted to-accent flex size-full items-center justify-center bg-gradient-to-br">
                            <Film className="text-muted-foreground/60 size-10" />
                        </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 group-hover:opacity-100">
                        <div className="flex size-12 scale-90 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-transform duration-300 group-hover:scale-100">
                            <Play className="size-5 translate-x-0.5 fill-white text-white" />
                        </div>
                    </div>

                    {video.duration ? (
                        <span className="absolute right-2 bottom-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-sm">
                            {formatDuration(video.duration)}
                        </span>
                    ) : null}
                </div>
            </Link>

            {onToggleSelect && (
                <button
                    type="button"
                    onClick={() => onToggleSelect(video)}
                    aria-label={selected ? 'Quitar de la selección' : 'Seleccionar'}
                    className={cn(
                        'absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border-2 transition-all',
                        selected
                            ? 'bg-primary border-primary text-primary-foreground opacity-100'
                            : 'border-white/80 bg-black/30 text-transparent opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:text-white/70',
                        selecting && 'opacity-100',
                    )}
                >
                    <Check className="size-3.5" strokeWidth={3} />
                </button>
            )}

            <div className="mt-3 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <Link href={route('videos.show', video.ulid)} onClick={handleClick} className="hover:text-primary line-clamp-2 text-sm leading-snug font-medium transition-colors">
                        {video.title}
                    </Link>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                        {showFolder && <>{video.folder?.name ?? 'Biblioteca'} · </>}
                        {formatDate(video.created_at)}
                    </p>
                </div>

                {hasActions && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground hover:bg-accent -mr-1 rounded-md p-1 transition-opacity data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                aria-label="Opciones"
                            >
                                <MoreVertical className="size-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            {onRename && (
                                <DropdownMenuItem onSelect={() => onRename(video)}>
                                    <Pencil /> Renombrar
                                </DropdownMenuItem>
                            )}
                            {onMove && (
                                <DropdownMenuItem onSelect={() => onMove(video)}>
                                    <FolderInput /> Mover a…
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => onDelete(video)} className="text-destructive focus:text-destructive">
                                        <Trash2 /> Eliminar
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
}
