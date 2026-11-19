import { readFile, writeFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
let html = await readFile(new URL('index.html', publicDir), 'utf8');
const css = await readFile(new URL('style.css', publicDir), 'utf8');
const js = await readFile(new URL('app.js', publicDir), 'utf8');

html = html.replace(/<link rel="stylesheet" href="\/style\.css[^"]*">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script src="\/app\.js[^"]*" defer><\/script>/, () => `<script>\n${js}\n</script>`);
html = html.replace(/__RAZ_BUILD__/g, Date.now().toString());

if (html.includes('/style.css?v=') || html.includes('src="/app.js')) {
  console.error('inline failed: external refs remain');
  process.exit(1);
}
await writeFile(new URL('index.html', publicDir), html);
console.log('index.html inlined');
