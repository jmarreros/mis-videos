import { formatDuration } from '@/lib/format';
import { Film, ImageUp, LoaderCircle } from 'lucide-react';
import { useRef } from 'react';

interface Props {
    thumbnailUrl: string | null;
    duration: number | null;
    time: number;
    capturing: boolean;
    unsupported: boolean;
    disabled?: boolean;
    onTimeChange: (time: number) => void;
    onCustomImage: (file: File) => void;
}

export function ThumbnailPicker({ thumbnailUrl, duration, time, capturing, unsupported, disabled, onTimeChange, onCustomImage }: Props) {
    const fileInput = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-2">
            <div className="bg-muted relative aspect-video overflow-hidden rounded-lg">
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt="" className="size-full object-cover" />
                ) : (
                    <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs">
                        <Film className="size-6 opacity-60" />
                        {unsupported ? 'Vista previa no disponible' : 'Generando…'}
                    </div>
                )}
                {capturing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <LoaderCircle className="size-5 animate-spin text-white" />
                    </div>
                )}
            </div>

            {!disabled && (
                <div className="flex items-center gap-2">
                    {duration ? (
                        <>
                            <input
                                type="range"
                                min={0}
                                max={duration}
                                step={Math.max(duration / 500, 0.04)}
                                value={time}
                                onChange={(e) => onTimeChange(Number(e.target.value))}
                                className="h-1.5 min-w-0 flex-1 cursor-pointer"
                                aria-label="Elegir fotograma de la miniatura"
                            />
                            <span className="text-muted-foreground w-12 text-right text-xs tabular-nums">{formatDuration(time)}</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground flex-1 text-xs">Sube una imagen como miniatura</span>
                    )}
                    <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1"
                        title="Usar una imagen propia"
                    >
                        <ImageUp className="size-4" />
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onCustomImage(file);
                            e.target.value = '';
                        }}
                    />
                </div>
            )}
        </div>
    );
}
