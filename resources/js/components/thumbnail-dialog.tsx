import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { frameToBlob } from '@/lib/capture-thumbnail';
import { formatDuration } from '@/lib/format';
import { type Video } from '@/types';
import { router } from '@inertiajs/react';
import { Camera, ImageUp, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Props {
    video: Video;
    player: HTMLVideoElement | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ThumbnailDialog({ video, player, open, onOpenChange }: Props) {
    const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) setPreview(null);
    }, [open]);

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview.url);
    }, [preview]);

    const captureFrame = async () => {
        if (!player) return;
        try {
            player.pause();
            const blob = await frameToBlob(player);
            setPreview({ blob, url: URL.createObjectURL(blob) });
        } catch {
            toast.error('No se pudo capturar el fotograma');
        }
    };

    const pickFile = (file: File | undefined) => {
        if (file) setPreview({ blob: file, url: URL.createObjectURL(file) });
    };

    const save = () => {
        if (!preview) return;
        const form = new FormData();
        form.append('thumbnail', preview.blob, preview.blob instanceof File ? preview.blob.name : 'thumbnail.jpg');
        router.post(route('videos.thumbnail', video.ulid), form, {
            preserveScroll: true,
            forceFormData: true,
            onStart: () => setSaving(true),
            onFinish: () => setSaving(false),
            onSuccess: () => onOpenChange(false),
        });
    };

    const current = preview?.url ?? video.thumbnail_url;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Miniatura</DialogTitle>
                    <DialogDescription>
                        Pausa el video en el momento que quieras y captura el fotograma, o sube una imagen propia.
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-muted relative aspect-video overflow-hidden rounded-xl">
                    {current ? (
                        <img src={current} alt="" className="size-full object-cover" />
                    ) : (
                        <div className="text-muted-foreground flex size-full items-center justify-center text-sm">Sin miniatura</div>
                    )}
                    {preview && <span className="bg-primary text-primary-foreground absolute top-2 left-2 rounded-md px-2 py-0.5 text-xs font-medium">Nueva</span>}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" onClick={captureFrame} disabled={!player}>
                        <Camera /> Fotograma actual {player && `(${formatDuration(player.currentTime)})`}
                    </Button>
                    <Button variant="outline" onClick={() => fileInput.current?.click()}>
                        <ImageUp /> Subir imagen
                    </Button>
                    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={save} disabled={!preview || saving}>
                        {saving && <LoaderCircle className="animate-spin" />}
                        Guardar miniatura
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
