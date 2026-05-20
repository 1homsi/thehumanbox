/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests live next to the code they exercise as *.test.ts(x).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // node environment is fine for the bits we test today (wire
    // decoder, merge layer). Add `environment: 'jsdom'` later when
    // we start testing React components.
    environment: 'node',
    globals: false,
  },
})
