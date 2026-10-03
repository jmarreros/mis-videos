import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useVideoDrop } from '@/hooks/use-video-drop';
import { cn } from '@/lib/utils';
import { type Folder } from '@/types';
import { Link } from '@inertiajs/react';
import { Folder as FolderIcon, FolderInput, MoreVertical, Pencil, Trash2 } from 'lucide-react';

interface Props {
    folder: Folder;
    onRename: (folder: Folder) => void;
    onMove: (folder: Folder) => void;
    onDelete: (folder: Folder) => void;
}

export function FolderCard({ folder, onRename, onMove, onDelete }: Props) {
    const drop = useVideoDrop(folder.id);
    const parts = [
        folder.children_count ? `${folder.children_count} ${folder.children_count === 1 ? 'carpeta' : 'carpetas'}` : null,
        `${folder.videos_count ?? 0} ${folder.videos_count === 1 ? 'video' : 'videos'}`,
    ].filter(Boolean);

    return (
        <div
            {...drop.handlers}
            className={cn(
                'group bg-card hover:border-primary/40 hover:bg-accent/40 relative flex items-center gap-3 rounded-xl border p-3 transition-all hover:shadow-md',
                drop.isOver && 'border-primary bg-primary/10 ring-primary ring-2',
            )}
        >
            <Link href={route('folders.show', folder.id)} prefetch className="flex min-w-0 flex-1 items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105">
                    <FolderIcon className="size-5 fill-current/20" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{folder.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{parts.join(' · ')}</p>
                </div>
            </Link>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1 transition-opacity data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Opciones de carpeta"
                    >
                        <MoreVertical className="size-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => onRename(folder)}>
                        <Pencil /> Renombrar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onMove(folder)}>
                        <FolderInput /> Mover a…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(folder)} className="text-destructive focus:text-destructive">
                        <Trash2 /> Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
