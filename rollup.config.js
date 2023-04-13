import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json'));

export default [
    {
        input: 'src/index.ts',
        output: {
            file: 'dist/index.js',
            format: 'esm'
        },
        plugins: [
            typescript({
                declaration: true,
                declarationDir: 'dist'
            })
        ],
        external: [Object.keys(pkg.dependencies), ...builtinModules]
    },
    {
        input: 'src/files/index.ts',
        output: {
            file: 'dist/files/index.js',
            format: 'esm'
        },
        plugins: [typescript(), nodeResolve({ preferBuiltins: true }), json()],
        external: ['SHIMS', ...builtinModules]
    },
    {
        input: 'src/files/shims.js',
        output: {
            file: 'dist/files/shims.js',
            format: 'esm'
        },
        plugins: [nodeResolve(), commonjs()],
        external: builtinModules
    }
];
