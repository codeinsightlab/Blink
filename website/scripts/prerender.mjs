import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { readFile, writeFile } from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {default:App}=await server.ssrLoadModule('/src/App.tsx');
  const {copy,SITE_URL}=await server.ssrLoadModule('/src/content.ts');
  const origin=SITE_URL ? new URL(SITE_URL).origin : '';
  const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  const meta=[`<meta property="og:type" content="website"/>`,`<meta property="og:locale" content="zh_CN"/>`,`<meta property="og:site_name" content="Blink"/>`,`<meta property="og:title" content="${esc(copy.title)}"/>`,`<meta property="og:description" content="${esc(copy.description)}"/>`,`<meta name="twitter:card" content="summary_large_image"/>`,`<meta name="twitter:title" content="${esc(copy.title)}"/>`,`<meta name="twitter:description" content="${esc(copy.description)}"/>`];
  if(origin)meta.push(`<link rel="canonical" href="${origin}/"/>`,`<meta property="og:url" content="${origin}/"/>`,`<meta property="og:image" content="${origin}/og.png"/>`,`<meta name="twitter:image" content="${origin}/og.png"/>`,`<meta property="og:image:alt" content="Blink — One key. Your way."/>`);
  let html=await readFile('dist/index.html','utf8');
  html=html.replace('<div id="root"></div>',`<div id="root">${renderToString(createElement(App))}</div>`).replace('<!-- seo:generated -->',meta.join('\n'));
  await writeFile('dist/index.html',html);
  await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\n${origin?`Sitemap: ${origin}/sitemap.xml\n`:''}`);
  await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin?`<url><loc>${origin}/</loc></url>`:''}</urlset>`);
  console.log('Prerendered homepage, social metadata, robots.txt and sitemap.xml.');
} finally {await server.close();}
