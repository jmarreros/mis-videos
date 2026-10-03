import { type BreadcrumbItem, type FolderRef } from '@/types';

export function folderBreadcrumbs(folders: FolderRef[]): BreadcrumbItem[] {
    return [{ title: 'Biblioteca', href: route('library') }, ...folders.map((folder) => ({ title: folder.name, href: route('folders.show', folder.id) }))];
}
