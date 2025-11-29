import { defineConfig } from 'vitest/config'
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    projects: [
      {
        extends: true,
        test:{
          name: 'integration',
          include: ['tests/integration/**/*.{spec,test}.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.{spec,test}.ts']
        }
      }
    ]
  }
})