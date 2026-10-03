import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildFolderTree, flattenTree } from '@/lib/folders';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Check, Folder, Library } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    /** Currently selected folder (null = root). */
    value: number | null;
    /** Folders that cannot be chosen (e.g. a folder and its descendants when moving it). */
    disabledIds?: Set<number>;
    confirmLabel?: string;
    onSelect: (folderId: number | null) => void;
}

export function FolderPickerDialog({ open, onOpenChange, title, description, value, disabledIds, confirmLabel = 'Mover aquí', onSelect }: Props) {
    const { folders } = usePage<SharedData>().props;
    const items = useMemo(() => flattenTree(buildFolderTree(folders)), [folders]);
    const [selected, setSelected] = useState<number | null>(value);

    useEffect(() => {
        if (open) setSelected(value);
    }, [open, value]);

    const option = (id: number | null, label: string, depth: number, icon: React.ReactNode) => {
        const disabled = id !== null && disabledIds?.has(id);
        const active = selected === id;
        return (
            <button
                key={id ?? 'root'}
                type="button"
                disabled={disabled}
                onClick={() => setSelected(id)}
                onDoubleClick={() => !disabled && onSelect(id)}
                style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
                className={cn(
                    'flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors',
                    active ? 'bg-primary/15 text-foreground' : 'hover:bg-accent',
                    disabled && 'pointer-events-none opacity-40',
                )}
            >
                {icon}
                <span className="truncate">{label}</span>
                {active && <Check className="text-primary ml-auto size-4 shrink-0" />}
            </button>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>

                <div className="-mx-2 max-h-[50vh] space-y-0.5 overflow-y-auto px-2">
                    {option(null, 'Biblioteca (raíz)', 0, <Library className="text-muted-foreground size-4 shrink-0" />)}
                    {items.map(({ folder, depth }) =>
                        option(folder.id, folder.name, depth + 1, <Folder className="text-muted-foreground size-4 shrink-0" />),
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => onSelect(selected)}>{confirmLabel}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
