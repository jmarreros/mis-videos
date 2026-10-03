import { type Folder, type FolderNode } from '@/types';

export function buildFolderTree(folders: Folder[]): FolderNode[] {
    const nodes = new Map<number, FolderNode>();
    folders.forEach((folder) => nodes.set(folder.id, { ...folder, children: [] }));

    const roots: FolderNode[] = [];
    nodes.forEach((node) => {
        const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
        (parent ? parent.children : roots).push(node);
    });

    const sort = (list: FolderNode[]) => {
        list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }));
        list.forEach((node) => sort(node.children));
    };
    sort(roots);

    return roots;
}

/** IDs of the folder and all of its ancestors, root first. */
export function folderPath(folders: Folder[], id: number | null | undefined): number[] {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const path: number[] = [];
    let current = id ? byId.get(id) : undefined;

    while (current) {
        path.unshift(current.id);
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }

    return path;
}

/** IDs of the folder and every folder nested below it. */
export function descendantIds(folders: Folder[], id: number): Set<number> {
    const ids = new Set([id]);
    let added = true;

    while (added) {
        added = false;
        folders.forEach((folder) => {
            if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
                ids.add(folder.id);
                added = true;
            }
        });
    }

    return ids;
}

/** Flattened tree with depth, handy for <select> style lists. */
export function flattenTree(nodes: FolderNode[], depth = 0): { folder: FolderNode; depth: number }[] {
    return nodes.flatMap((node) => [{ folder: node, depth }, ...flattenTree(node.children, depth + 1)]);
}

export function folderLabel(folders: Folder[], id: number | null | undefined): string {
    if (!id) return 'Biblioteca';
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    return folderPath(folders, id)
        .map((folderId) => byId.get(folderId)?.name)
        .join(' / ');
}
