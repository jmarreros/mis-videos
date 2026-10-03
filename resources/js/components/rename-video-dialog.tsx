import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Video } from '@/types';
import { useForm } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import { FormEvent, useEffect } from 'react';

export function RenameVideoDialog({ video, onOpenChange }: { video: Video | null; onOpenChange: (open: boolean) => void }) {
    const { data, setData, patch, processing, errors, clearErrors } = useForm({ title: video?.title ?? '' });

    useEffect(() => {
        if (video) {
            clearErrors();
            setData('title', video.title);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [video]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!video) return;
        patch(route('videos.update', video.ulid), { preserveScroll: true, onSuccess: () => onOpenChange(false) });
    };

    return (
        <Dialog open={!!video} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle>Renombrar video</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Input autoFocus value={data.title} onChange={(e) => setData('title', e.target.value)} maxLength={255} />
                        <InputError message={errors.title} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={processing || !data.title.trim()}>
                            {processing && <LoaderCircle className="animate-spin" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
