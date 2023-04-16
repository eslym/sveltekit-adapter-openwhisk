import 'SHIMS';
import { Server } from 'SERVER';
import { manifest, prerendered } from 'MANIFEST';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import type { Stats } from 'node:fs';
import { lookup } from 'mrmime';

declare global {
    const BASE_URL: string;
    const DEBUG: boolean;
}

interface OpenWhiskRequest {
    __ow_method: string;
    __ow_headers: Record<string, string>;
    __ow_path: string;
    __ow_query: string;
    __ow_body: string;
}

interface OpenWhiskResponse {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: string;
}

interface ActionResponse {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: Buffer;
}

const server = new Server(manifest);
const dir = dirname(fileURLToPath(import.meta.url));

const methodWitoutBody = new Set(['GET', 'HEAD']);

const extraPlainText = new Set([
    'application/javascript',
    'application/json',
    'application/xml',
    'application/rss+xml',
    'application/atom+xml',
    'application/xhtml+xml'
]);

const handlers = [
    async (url: URL, args: OpenWhiskRequest) =>
        handleStatic(url.pathname, 'client', args.__ow_headers, true),
    async (url: URL, args: OpenWhiskRequest) =>
        handleStatic(url.pathname, 'static', args.__ow_headers),
    handlePrerendered,
    handleSSR
];

export async function main(args: OpenWhiskRequest): Promise<OpenWhiskResponse> {
    await server.init({ env: process.env });
    const url = new URL(args.__ow_path, BASE_URL);
    if (DEBUG) {
        console.log('args', args);
        console.log('url', url);
    }
    url.search = args.__ow_query;
    for (const handler of handlers) {
        const res = await handler(url, args);
        if (res) {
            const ct = res.headers?.['content-type']?.split(';')?.[0]?.trim() ?? '';
            const body =
                ct.startsWith('text/') || extraPlainText.has(ct)
                    ? res.body.toString('utf-8')
                    : res.body.toString('base64');
            return {
                ...res,
                body
            };
        }
    }
    return {
        statusCode: 404,
        headers: {
            'content-type': 'text/plain'
        },
        body: 'Not Found'
    };
}

async function handleSSR(url: URL, args: OpenWhiskRequest): Promise<ActionResponse> {
    if (!BASE_URL) {
        return {
            statusCode: 500,
            headers: {
                'content-type': 'text/plain'
            },
            body: Buffer.from('ORIGIN is not defined')
        };
    }
    const opts: RequestInit = {
        method: args.__ow_method,
        headers: args.__ow_headers
    };
    if (!methodWitoutBody.has(args.__ow_method)) {
        opts.body = Buffer.from(args.__ow_body, 'base64');
    }
    const request = new Request(url);
    const respond = await server.respond(request, {
        getClientAddress() {
            return args.__ow_headers['x-forwarded-for'] ?? '';
        }
    });
    return {
        statusCode: respond.status,
        headers: Object.fromEntries(respond.headers.entries()),
        body: Buffer.from(await respond.arrayBuffer())
    };
}

async function handleStatic(
    path: string,
    client: string,
    reqHeaders: Record<string, string>,
    immutable: boolean = false
): Promise<ActionResponse | undefined> {
    try {
        path = decodeURIComponent(path);
    } catch (e) {
        return undefined;
    }
    const fullPath = join(dir, client, path);
    const stat = await statIfExists(fullPath);
    if (!stat || stat.isDirectory()) return undefined;
    const data = await readFile(fullPath);
    const type = (lookup(path) as string | undefined) ?? 'application/octet-stream';
    const resHeaders: Record<string, string> = {
        'Content-Type': type
    };

    // set last modified
    resHeaders['Last-Modified'] = stat.mtime.toUTCString();

    // calculate etag with sha1
    const hash = crypto.createHash('sha1');
    hash.update(data);
    resHeaders['ETag'] = hash.digest('hex');

    // compare etag
    if (reqHeaders['if-none-match'] === resHeaders['ETag']) {
        return {
            statusCode: 304,
            headers: resHeaders
        };
    }

    if (immutable && path.startsWith(`/${manifest.appPath}/immutable/`)) {
        resHeaders['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
        resHeaders['Cache-Control'] = 'public, max-age=3600';
    }

    return {
        statusCode: 200,
        headers: resHeaders,
        body: data
    };
}

async function handlePrerendered(
    url: URL,
    args: OpenWhiskRequest
): Promise<ActionResponse | undefined> {
    const headers = args.__ow_headers;
    try {
        const path = decodeURIComponent(url.pathname);

        if (prerendered.has(path)) {
            return handleStatic(path, 'prerendered', headers, false);
        }

        if (path.endsWith('/') && prerendered.has(path.slice(0, -1))) {
            let query = args.__ow_query;
            if (query.length) query = '?' + query;
            return {
                statusCode: 308,
                headers: {
                    Location: path.slice(0, -1) + query
                }
            };
        }
    } catch (e) {}
    return undefined;
}

async function statIfExists(path: string): Promise<Stats | null> {
    try {
        return await stat(path);
    } catch (err: any) {
        if (err?.code === 'ENOENT') return null;
        throw err;
    }
}
