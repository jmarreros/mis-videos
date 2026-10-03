export function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export class HttpError extends Error {
    constructor(
        public status: number,
        public body: Record<string, unknown>,
    ) {
        super((body?.message as string) || `Error ${status}`);
    }
}

export async function request<T = Record<string, unknown>>(
    method: string,
    url: string,
    body?: FormData | Record<string, unknown>,
    signal?: AbortSignal,
): Promise<T> {
    const isForm = body instanceof FormData;
    const response = await fetch(url, {
        method,
        signal,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken(),
            ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });

    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new HttpError(response.status, data);
    }

    return data as T;
}
