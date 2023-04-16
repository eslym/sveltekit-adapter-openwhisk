import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import { Adapter } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

interface AdapterOptions {
    out?: string;
    base_url: string;
    debug?: boolean;
    ip_header?: string;
    precompress?: boolean;
    polyfill?: boolean;
}

const files = fileURLToPath(new URL('./files', import.meta.url).href);

export default function adapter(options: AdapterOptions): Adapter {
    const {
        out = 'build',
        base_url,
        precompress = false,
        polyfill = true,
        ip_header = 'x-forwarded-for'
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
                    BASE_URL: JSON.stringify(base_url),
                    DEBUG: JSON.stringify(!!options.debug),
                    IP_HEADER: JSON.stringify(ip_header)
                }
            });

            // If polyfills aren't wanted then clear the file
            if (!polyfill) {
                writeFileSync(`${out}/shims.js`, '', 'utf-8');
            }
        }
    };
}
