# SvelteKit + OpenWhisk

A sveltekit adapter for OpenWhisk web functions.

## Installation

```shell
npm install -D @eslym/sveltekit-adapter-openwhisk
```

```shell
yarn add -D @eslym/sveltekit-adapter-openwhisk
```

## Usage

```js
import adapter from '@eslym/sveltekit-adapter-openwhisk';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://kit.svelte.dev/docs/integrations#preprocessors
    // for more information about preprocessors
    preprocess: vitePreprocess(),

    kit: {
        // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
        // If your environment is not supported or you settled on a specific environment, switch out the adapter.
        // See https://kit.svelte.dev/docs/adapters for more information about adapters.
        adapter: adapter({
            // the base url for the function, you will need to specify kit.paths.base when its not on root
            baseUrl: process.env.BASE_URL,
            // header to get connecting ip, 'do-connecting-ip' is an example for DigitalOcean App Platform
            ipHeader: 'do-connecting-ip'
        })
    }
};

export default config;
```

### Adapter Config

```ts
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
```

A working example project which can host with DigitalOcean App Platform: https://github.com/eslym/sveltekit-do-function

**I will not actively maintain this project, so please feel free to open pull request for any enhancement or make your own fork.**
