import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: {
        __ROOT_PATH__: '"sdmc:/switch/lainNX"',
    },
    test: {
        server: {
            deps: {
                inline: ['@nx.js/constants'],
            }
        },
    },
});