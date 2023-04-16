import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import { Adapter } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

interface AdapterOptions {
    /**
     * output directory, default: build
     */
    out?: string;
    /**
     * base url of the website, it will trying to get from BASE_URL environment variable during runtime when not set.
     */
    baseUrl?: string;

    /**
     * whether to log some debug info, it will trying to get from DEBUG environment variable during runtime when not set.
     * default: false
     */
    debug?: boolean;
    /**
     * header to get user's ip, it will trying to get from IP_HEADER environment variable during runtime when not set.
     * default: 'x-forwarded-proto'
     */
    ipHeader?: string;

    /**
     * precompress, default: false
     */
    precompress?: boolean;
    /**
     * whether to include polyfill for nodejs, default: true
     */
    polyfill?: boolean;
    
    /**
     * whether to include polyfill for nodejs, default: ''
     */
    envPrefix?: string;
}

const files = fileURLToPath(new URL('./files', import.meta.url).href);

function stringifyOrDefault(value: any, script: string) {
    return value ? JSON.stringify(value) : script;
}

export default function adapter(options: AdapterOptions): Adapter {
    const {
        out = 'build',
        baseUrl,
        precompress = false,
        polyfill = true,
        ipHeader,
        envPrefix = '',
        debug
    } = options;
    return {
        name: '@eslym/sveltekit-adapter-openwhisk',
        async adapt(builder) {
            const tmp = builder.getBuildDirectory('adapter-node');

            builder.rimraf(out);
            builder.rimraf(tmp);
            builder.mkdirp(tmp);

            builder.log.minor('Copying assets');
            builder.writeClient(`${out}/client${builder.config.kit.paths.base}`);
            builder.writePrerendered(`${out}/prerendered${builder.config.kit.paths.base}`);

            if (precompress) {
                builder.log.minor('Compressing assets');
                await Promise.all([
                    builder.compress(`${out}/client`),
                    builder.compress(`${out}/prerendered`)
                ]);
            }

            builder.log.minor('Building server');

            builder.writeServer(tmp);

            writeFileSync(
                `${tmp}/manifest.js`,
                `export const manifest = ${builder.generateManifest({ relativePath: './' })};\n\n` +
                    `export const prerendered = new Set(${JSON.stringify(
                        builder.prerendered.paths
                    )});\n`
            );

            const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

            // we bundle the Vite output so that deployments only need
            // their production dependencies. Anything in devDependencies
            // will get included in the bundled code
            const bundle = await rollup({
                input: {
                    index: `${tmp}/index.js`,
                    manifest: `${tmp}/manifest.js`
                },
                external: [
                    // dependencies could have deep exports, so we need a regex
                    ...Object.keys(pkg.dependencies || {}).map((d) => new RegExp(`^${d}(\\/.*)?$`))
                ],
                plugins: [
                    nodeResolve({
                        preferBuiltins: true,
                        exportConditions: ['node']
                    }),
                    commonjs({ strictRequires: true }),
                    json()
                ]
            });

            await bundle.write({
                dir: `${out}/server`,
                format: 'esm',
                sourcemap: true,
                chunkFileNames: `chunks/[name]-[hash].js`
            });

            builder.copy(files, out, {
                replace: {
                    MANIFEST: './server/manifest.js',
                    SERVER: './server/index.js',
                    SHIMS: './shims.js',
                    BASE_URL: stringifyOrDefault(baseUrl, `process.env[${JSON.stringify(envPrefix + 'BASE_URL')}]`),
                    DEBUG: stringifyOrDefault(debug, `process.env[${JSON.stringify(envPrefix + 'DEBUG')}] === 'true'`),
                    IP_HEADER: stringifyOrDefault(
                        ipHeader,
                        `process.env[${JSON.stringify(envPrefix + 'IP_HEADER')}] ?? 'x-forwarded-for'`
                    )
                }
            });

            // If polyfills aren't wanted then clear the file
            if (!polyfill) {
                writeFileSync(`${out}/shims.js`, '', 'utf-8');
            }
        }
    };
}
