import { defineConfig } from 'rolldown'

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      format: 'cjs',
      entryFileNames: '[name].js',
      dir: 'dist',
    },
    {
      format: 'esm',
      entryFileNames: '[name].mjs',
      dir: 'dist',
    },
  ],
  external: ['payload'],
  treeshake: true,
})
