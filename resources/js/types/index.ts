import { LucideIcon } from 'lucide-react';

export interface Auth {
    user: User;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface SharedData {
    name: string;
    auth: Auth;
    folders: Folder[];
    flash: { success?: string | null; error?: string | null };
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}

export interface Folder {
    id: number;
    name: string;
    parent_id: number | null;
    videos_count?: number;
    children_count?: number;
}

export interface FolderNode extends Folder {
    children: FolderNode[];
}

export interface FolderRef {
    id: number;
    name: string;
}

export interface Video {
    id: number;
    ulid: string;
    title: string;
    folder_id: number | null;
    folder?: FolderRef | null;
    original_name: string;
    mime: string;
    size: number;
    duration: number | null;
    width: number | null;
    height: number | null;
    stream_url: string;
    thumbnail_url: string | null;
    completed_at: string | null;
    favorited_at: string | null;
    created_at: string;
    updated_at: string;
}
