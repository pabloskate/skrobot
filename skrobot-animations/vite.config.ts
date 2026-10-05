import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@skrobot/animations/trick-scene-3d.css',
        replacement: fileURLToPath(new URL('../packages/animations/src/three/TrickScene3D.css', import.meta.url)),
      },
      {
        find: '@skrobot/animations/three',
        replacement: fileURLToPath(new URL('../packages/animations/src/three/index.ts', import.meta.url)),
      },
      {
        find: '@skrobot/animations',
        replacement: fileURLToPath(new URL('../packages/animations/src/index.ts', import.meta.url)),
      },
    ],
  },
});
