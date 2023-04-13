declare module 'ENV' {
    export function env(key: string, fallback?: any): string;
}

declare module 'MANIFEST' {
    import { SSRManifest } from '@sveltejs/kit';

    export const manifest: SSRManifest;
    export const prerendered: Set<string>;
}

declare module 'SERVER' {
    export { Server } from '@sveltejs/kit';
}

declare module 'SHIMS' {
    const val: {};
    export default val;
}
