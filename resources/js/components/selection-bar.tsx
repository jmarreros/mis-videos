import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FolderInput, X } from 'lucide-react';

interface Props {
    count: number;
    total: number;
    onSelectAll: () => void;
    onClear: () => void;
    onMove: () => void;
}

export function SelectionBar({ count, total, onSelectAll, onClear, onMove }: Props) {
    return (
        <div
            className={cn(
                'fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 transition-all duration-300',
                count > 0 ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
            )}
        >
            <div className="bg-popover/95 flex items-center gap-1 rounded-2xl border p-1.5 pl-4 shadow-2xl backdrop-blur-lg">
                <span className="mr-2 text-sm font-medium tabular-nums">
                    {count} {count === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                {count < total && (
                    <Button variant="ghost" size="sm" onClick={onSelectAll}>
                        Todos
                    </Button>
                )}
                <Button size="sm" onClick={onMove}>
                    <FolderInput /> Mover
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={onClear} aria-label="Cancelar selección">
                    <X />
                </Button>
            </div>
        </div>
    );
}
