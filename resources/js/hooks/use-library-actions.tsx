import { ConfirmDialog } from '@/components/confirm-dialog';
import { FolderDialog } from '@/components/folder-dialog';
import { FolderPickerDialog } from '@/components/folder-picker-dialog';
import { RenameVideoDialog } from '@/components/rename-video-dialog';
import { moveVideos } from '@/hooks/use-video-drop';
import { descendantIds } from '@/lib/folders';
import { type Folder, type SharedData, type Video } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { useState } from 'react';

type State =
    | { type: 'rename-video'; video: Video }
    | { type: 'move-videos'; ulids: string[]; current: number | null }
    | { type: 'delete-video'; video: Video }
    | { type: 'rename-folder'; folder: Folder }
    | { type: 'move-folder'; folder: Folder }
    | { type: 'delete-folder'; folder: Folder }
    | null;

/** Rename / move / delete dialogs for videos and folders, shared by every listing page. */
export function useLibraryActions({ onMoved }: { onMoved?: () => void } = {}) {
    const { folders } = usePage<SharedData>().props;
    const [state, setState] = useState<State>(null);
    const [processing, setProcessing] = useState(false);
    const close = () => setState(null);

    const visitOptions = {
        preserveScroll: true,
        onStart: () => setProcessing(true),
        onFinish: () => setProcessing(false),
        onSuccess: close,
    };

    const dialogs = (
        <>
            <RenameVideoDialog video={state?.type === 'rename-video' ? state.video : null} onOpenChange={(open) => !open && close()} />

            <FolderPickerDialog
                open={state?.type === 'move-videos'}
                onOpenChange={(open) => !open && close()}
                title={state?.type === 'move-videos' && state.ulids.length > 1 ? `Mover ${state.ulids.length} videos` : 'Mover video'}
                description="Elige la carpeta de destino."
                value={state?.type === 'move-videos' ? state.current : null}
                onSelect={(folderId) => {
                    if (state?.type !== 'move-videos') return;
                    moveVideos(state.ulids, folderId, () => {
                        close();
                        onMoved?.();
                    });
                }}
            />

            <FolderPickerDialog
                open={state?.type === 'move-folder'}
                onOpenChange={(open) => !open && close()}
                title={state?.type === 'move-folder' ? `Mover «${state.folder.name}»` : 'Mover carpeta'}
                description="Se moverá junto con todo su contenido."
                value={state?.type === 'move-folder' ? state.folder.parent_id : null}
                disabledIds={state?.type === 'move-folder' ? descendantIds(folders, state.folder.id) : undefined}
                onSelect={(parentId) => {
                    if (state?.type !== 'move-folder') return;
                    router.patch(route('folders.update', state.folder.id), { parent_id: parentId }, visitOptions);
                }}
            />

            <FolderDialog
                open={state?.type === 'rename-folder'}
                onOpenChange={(open) => !open && close()}
                folder={state?.type === 'rename-folder' ? state.folder : null}
            />

            <ConfirmDialog
                open={state?.type === 'delete-video'}
                onOpenChange={(open) => !open && close()}
                title="¿Eliminar video?"
                description={
                    state?.type === 'delete-video' ? (
                        <>
                            «{state.video.title}» y su archivo se eliminarán del servidor de forma permanente.
                        </>
                    ) : null
                }
                confirmLabel="Eliminar"
                destructive
                processing={processing}
                onConfirm={() => state?.type === 'delete-video' && router.delete(route('videos.destroy', state.video.ulid), visitOptions)}
            />

            <ConfirmDialog
                open={state?.type === 'delete-folder'}
                onOpenChange={(open) => !open && close()}
                title="¿Eliminar carpeta?"
                description={
                    state?.type === 'delete-folder' ? (
                        <>Se eliminará «{state.folder.name}». Sus videos y subcarpetas no se pierden: pasan a la carpeta superior.</>
                    ) : null
                }
                confirmLabel="Eliminar carpeta"
                destructive
                processing={processing}
                onConfirm={() => state?.type === 'delete-folder' && router.delete(route('folders.destroy', state.folder.id), visitOptions)}
            />
        </>
    );

    return {
        dialogs,
        renameVideo: (video: Video) => setState({ type: 'rename-video', video }),
        moveVideos: (ulids: string[], current: number | null) => setState({ type: 'move-videos', ulids, current }),
        deleteVideo: (video: Video) => setState({ type: 'delete-video', video }),
        renameFolder: (folder: Folder) => setState({ type: 'rename-folder', folder }),
        moveFolder: (folder: Folder) => setState({ type: 'move-folder', folder }),
        deleteFolder: (folder: Folder) => setState({ type: 'delete-folder', folder }),
    };
}
