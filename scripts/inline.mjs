import { readFile, writeFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
const template = await readFile(new URL('template.html', import.meta.url), 'utf8');
const css = await readFile(new URL('style.css', publicDir), 'utf8');
const js = await readFile(new URL('app.js', publicDir), 'utf8');

let html = template
  .replace(/<link rel="stylesheet" href="\/style\.css[^"]*">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="\/app\.js[^"]*" defer><\/script>/, () => `<script>\n${js}\n</script>`)
  .replace(/__RAZ_BUILD__/g, Date.now().toString());

if (html.includes('/style.css?v=') || html.includes('src="/app.js')) {
  console.error('inline failed: external refs remain');
  process.exit(1);
}
await writeFile(new URL('index.html', publicDir), html);
console.log('index.html inlined');
