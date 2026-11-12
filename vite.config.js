import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => {
  const pagesBase = process.env.PAGES_BASE ?? '/star-garden-rumble/';
  // dev 走根路徑；build 與 preview 使用 GitHub Pages 子路徑。
  return {
    base: command === 'build' || isPreview ? pagesBase : '/',
  };
});
