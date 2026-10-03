import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { useVideoDrop } from '@/hooks/use-video-drop';
import { buildFolderTree, folderPath } from '@/lib/folders';
import { cn } from '@/lib/utils';
import { type FolderNode, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'folder-tree:expanded';

function loadExpanded(): number[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

type PageProps = SharedData & { folder?: { id: number } | null; video?: { folder_id: number | null } };

export function FolderTree() {
    const { props } = usePage<PageProps>();
    const tree = useMemo(() => buildFolderTree(props.folders), [props.folders]);
    const activeId = props.folder?.id ?? props.video?.folder_id ?? null;
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set(loadExpanded()));

    // Always reveal the folder currently being viewed.
    useEffect(() => {
        const path = folderPath(props.folders, activeId).slice(0, -1);
        if (path.some((id) => !expanded.has(id))) {
            setExpanded((prev) => new Set([...prev, ...path]));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId]);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]));
        } catch {
            // Storage unavailable; expansion just won't persist.
        }
    }, [expanded]);

    const toggle = (id: number, open: boolean) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (open) next.add(id);
            else next.delete(id);
            return next;
        });

    if (tree.length === 0) {
        return <p className="text-muted-foreground px-2 py-3 text-xs group-data-[collapsible=icon]:hidden">Aún no hay carpetas.</p>;
    }

    return (
        <SidebarMenu className="group-data-[collapsible=icon]:hidden">
            {tree.map((node) => (
                <FolderTreeItem key={node.id} node={node} activeId={activeId} expanded={expanded} onToggle={toggle} depth={0} />
            ))}
        </SidebarMenu>
    );
}

interface ItemProps {
    node: FolderNode;
    activeId: number | null;
    expanded: Set<number>;
    onToggle: (id: number, open: boolean) => void;
    depth: number;
}

function FolderTreeItem({ node, activeId, expanded, onToggle, depth }: ItemProps) {
    const drop = useVideoDrop(node.id);
    const isOpen = expanded.has(node.id);
    const isActive = node.id === activeId;
    const hasChildren = node.children.length > 0;
    const Icon = isActive || isOpen ? FolderOpen : Folder;

    const content = (
        <>
            <Link href={route('folders.show', node.id)} prefetch className="flex min-w-0 flex-1 items-center gap-2">
                <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
                <span className="truncate">{node.name}</span>
            </Link>
            {!!node.videos_count && <span className="text-muted-foreground ml-auto text-xs tabular-nums">{node.videos_count}</span>}
        </>
    );

    const chevron = hasChildren ? (
        <CollapsibleTrigger asChild>
            <button
                type="button"
                className="text-muted-foreground hover:text-foreground -ml-1 flex size-5 shrink-0 items-center justify-center rounded"
                aria-label={isOpen ? 'Contraer' : 'Expandir'}
            >
                <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
            </button>
        </CollapsibleTrigger>
    ) : (
        <span className="-ml-1 size-5 shrink-0" />
    );

    const dropClass = cn(drop.isOver && 'bg-primary/15 ring-primary ring-2');

    return (
        <Collapsible open={isOpen} onOpenChange={(open) => onToggle(node.id, open)} asChild>
            {depth === 0 ? (
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive} className={dropClass} {...drop.handlers}>
                        <div>
                            {chevron}
                            {content}
                        </div>
                    </SidebarMenuButton>
                    <Children node={node} activeId={activeId} expanded={expanded} onToggle={onToggle} depth={depth} />
                </SidebarMenuItem>
            ) : (
                <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={isActive} className={cn('pr-2', dropClass)} {...drop.handlers}>
                        <div>
                            {chevron}
                            {content}
                        </div>
                    </SidebarMenuSubButton>
                    <Children node={node} activeId={activeId} expanded={expanded} onToggle={onToggle} depth={depth} />
                </SidebarMenuSubItem>
            )}
        </Collapsible>
    );
}

function Children({ node, depth, ...rest }: ItemProps) {
    if (node.children.length === 0) return null;

    return (
        <CollapsibleContent>
            <SidebarMenuSub className="mr-0 pr-0">
                {node.children.map((child) => (
                    <FolderTreeItem key={child.id} node={child} depth={depth + 1} {...rest} />
                ))}
            </SidebarMenuSub>
        </CollapsibleContent>
    );
}
