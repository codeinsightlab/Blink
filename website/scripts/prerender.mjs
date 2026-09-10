import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx");
  const { copy, SITE_URL } = await server.ssrLoadModule("/src/content.ts");
  const { changelogMeta } = await server.ssrLoadModule("/src/Changelog.tsx");
  const { default: changelog } = await server.ssrLoadModule("/src/changelog.json");
  const origin = SITE_URL ? new URL(SITE_URL).origin : "";
  const esc = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const socialMeta = (title, description, pathname) => [
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:locale" content="zh_CN"/>`,
    `<meta property="og:site_name" content="Blink"/>`,
    `<meta property="og:title" content="${esc(title)}"/>`,
    `<meta property="og:description" content="${esc(description)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${esc(title)}"/>`,
    `<meta name="twitter:description" content="${esc(description)}"/>`,
    ...(origin ? [
      `<link rel="canonical" href="${origin}${pathname}"/>`,
      `<meta property="og:url" content="${origin}${pathname}"/>`,
      `<meta property="og:image" content="${origin}/og.png"/>`,
      `<meta name="twitter:image" content="${origin}/og.png"/>`,
      `<meta property="og:image:alt" content="Blink — One key. Your way."/>`,
    ] : []),
  ];
  const template = await readFile("dist/index.html", "utf8");
  const homeHtml = template
    .replace('<div id="root"></div>', `<div id="root">${renderToString(createElement(App))}</div>`)
    .replace("<!-- seo:generated -->", socialMeta(copy.title, copy.description, "/").join("\n"));
  await writeFile("dist/index.html", homeHtml);
  const changelogHtml = template
    .replace(`<title>${copy.title}</title>`, `<title>${changelogMeta.title}</title>`)
    .replace(`content="${copy.description}"`, `content="${changelogMeta.description}"`)
    .replace('<div id="root"></div>', `<div id="root">${renderToString(createElement(App, { route: "/changelog" }))}</div>`)
    .replace("<!-- seo:generated -->", socialMeta(changelogMeta.title, changelogMeta.description, "/changelog").join("\n"));
  await mkdir("dist/changelog", { recursive: true });
  await writeFile("dist/changelog/index.html", changelogHtml);
  await writeFile("dist/changelog.html", changelogHtml);
  await writeFile(
    "dist/robots.txt",
    `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ""}`,
  );
  await writeFile(
    "dist/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? `<url><loc>${origin}/</loc></url><url><loc>${origin}/changelog</loc><lastmod>${changelog[0].releaseDate}</lastmod></url>` : ""}</urlset>`,
  );
  console.log("Prerendered homepage and changelog with social metadata, robots.txt and sitemap.xml.");
} finally {
  await server.close();
}
