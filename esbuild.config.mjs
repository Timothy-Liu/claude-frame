import * as esbuild from 'esbuild';
import * as fs from 'fs';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  sourcemap: true,
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
};

const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
};

const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/index.ts'],
  outfile: 'dist/webview/index.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

function copyStaticAssets() {
  fs.mkdirSync('dist/webview', { recursive: true });
  fs.copyFileSync('src/webview/index.html', 'dist/webview/index.html');
  fs.copyFileSync('src/webview/index.css', 'dist/webview/index.css');
}

if (watch) {
  const [ext, web] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);
  copyStaticAssets();
  await ext.watch();
  await web.watch();
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
  copyStaticAssets();
}
