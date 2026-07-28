import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        setupFiles: ['./tests/setup-env.ts'],
        passWithNoTests: true,
    },
})
