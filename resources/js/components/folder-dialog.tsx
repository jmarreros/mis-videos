import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { folderLabel } from '@/lib/folders';
import { type Folder, type SharedData } from '@/types';
import { useForm, usePage } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import { FormEvent, useEffect } from 'react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Parent for a new folder; ignored when renaming. */
    parentId?: number | null;
    /** Folder being renamed. */
    folder?: Pick<Folder, 'id' | 'name'> | null;
}

export function FolderDialog({ open, onOpenChange, parentId = null, folder = null }: Props) {
    const { folders } = usePage<SharedData>().props;
    const { data, setData, post, patch, processing, errors, reset, clearErrors } = useForm({
        name: folder?.name ?? '',
        parent_id: parentId,
    });

    useEffect(() => {
        if (open) {
            clearErrors();
            setData({ name: folder?.name ?? '', parent_id: parentId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onOpenChange(false);
            },
        };

        if (folder) {
            patch(route('folders.update', folder.id), options);
        } else {
            post(route('folders.store'), options);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle>{folder ? 'Renombrar carpeta' : 'Nueva carpeta'}</DialogTitle>
                        {!folder && <DialogDescription>Se creará dentro de: {folderLabel(folders, parentId)}</DialogDescription>}
                    </DialogHeader>

                    <div className="space-y-2">
                        <Input
                            autoFocus
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            placeholder="Nombre de la carpeta"
                            maxLength={120}
                        />
                        <InputError message={errors.name || errors.parent_id} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={processing || !data.name.trim()}>
                            {processing && <LoaderCircle className="animate-spin" />}
                            {folder ? 'Guardar' : 'Crear carpeta'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
