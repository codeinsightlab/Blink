import { aggregateDownloadStats } from "./download-stats-logic";

type Env = Record<string, never>;

const GITHUB_RELEASES_URL = "https://api.github.com/repos/codeinsightlab/Blink-Releases/releases?per_page=100";
const RELEASE_PAGE_URL = "https://github.com/codeinsightlab/Blink-Releases/releases";
const CACHE_TTL_SECONDS = 5 * 60;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`,
      ...init.headers,
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/download-stats", request.url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Blink-Website" },
    });
    if (!response.ok) {
      return json({ error: "download_stats_lookup_failed", releasePage: RELEASE_PAGE_URL }, { status: 502, headers: { "cache-control": "no-store" } });
    }
    const payload = aggregateDownloadStats(await response.json());
    const result = json(payload);
    await cache.put(cacheKey, result.clone());
    return result;
  } catch {
    return json({ error: "download_stats_lookup_failed", releasePage: RELEASE_PAGE_URL }, { status: 502, headers: { "cache-control": "no-store" } });
  }
};
