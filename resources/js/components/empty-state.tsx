import { type LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description?: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="relative mb-5">
                <div className="bg-primary/20 absolute inset-0 rounded-full blur-xl" />
                <div className="bg-primary/10 text-primary relative flex size-16 items-center justify-center rounded-2xl">
                    <Icon className="size-7" />
                </div>
            </div>
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>}
            {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
        </div>
    );
}
