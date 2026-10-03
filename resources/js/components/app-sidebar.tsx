import { FolderDialog } from '@/components/folder-dialog';
import { FolderTree } from '@/components/folder-tree';
import { NavUser } from '@/components/nav-user';
import { Button } from '@/components/ui/button';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInput,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useVideoDrop } from '@/hooks/use-video-drop';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { FolderPlus, Library, Search, Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';
import AppLogo from './app-logo';

export function AppSidebar() {
    const page = usePage<SharedData & { folder?: { id: number } | null }>();
    const [creating, setCreating] = useState(false);
    const [query, setQuery] = useState('');
    const rootDrop = useVideoDrop(null);
    const currentFolderId = page.props.folder?.id;

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('search'), query.trim() ? { q: query.trim() } : {});
    };

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={route('library')} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>

                <Button asChild className="mt-1 w-full shadow-md shadow-violet-500/20 group-data-[collapsible=icon]:hidden">
                    <Link href={route('upload', currentFolderId ? { folder: currentFolderId } : {})}>
                        <Upload />
                        Subir video
                    </Link>
                </Button>

                <form onSubmit={submitSearch} className="relative group-data-[collapsible=icon]:hidden">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                    <SidebarInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar videos…" className="h-9 pl-8" />
                </form>

                <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Subir video">
                            <Link href={route('upload')}>
                                <Upload />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Buscar">
                            <Link href={route('search')}>
                                <Search />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Biblioteca</SidebarGroupLabel>
                    <SidebarGroupAction title="Nueva carpeta" onClick={() => setCreating(true)}>
                        <FolderPlus />
                        <span className="sr-only">Nueva carpeta</span>
                    </SidebarGroupAction>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                asChild
                                tooltip="Todos los videos"
                                isActive={route().current('library')}
                                className={cn(rootDrop.isOver && 'bg-primary/15 ring-primary ring-2')}
                                {...rootDrop.handlers}
                            >
                                <Link href={route('library')} prefetch>
                                    <Library />
                                    <span>Inicio</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                    <FolderTree />
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>

            <FolderDialog open={creating} onOpenChange={setCreating} parentId={null} />
        </Sidebar>
    );
}
