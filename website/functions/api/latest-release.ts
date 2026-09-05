type Env = Record<string, never>;

type GitHubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

const GITHUB_RELEASE_URL = "https://api.github.com/repos/codeinsightlab/Blink-Releases/releases/latest";
const RELEASE_PAGE_URL = "https://github.com/codeinsightlab/Blink-Releases/releases/latest";
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

function isAsset(value: unknown): value is ReleaseAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.name === "string" && typeof asset.browser_download_url === "string";
}

function assetUrl(assets: ReleaseAsset[], pattern: RegExp) {
  return assets.find(({ name }) => pattern.test(name))?.browser_download_url ?? null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/latest-release", request.url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(GITHUB_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Blink-Website",
      },
    });
    if (!response.ok) {
      return json(
        { error: "release_lookup_failed", releasePage: RELEASE_PAGE_URL },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }

    const release = (await response.json()) as GitHubRelease;
    const assets = Array.isArray(release.assets) ? release.assets.filter(isAsset) : [];
    const payload = {
      tag: typeof release.tag_name === "string" ? release.tag_name : null,
      macos: assetUrl(assets, /_aarch64\.dmg$/i),
      windows: assetUrl(assets, /_x64-setup\.exe$/i),
      releasePage: typeof release.html_url === "string" ? release.html_url : RELEASE_PAGE_URL,
    };
    const result = json(payload);
    await cache.put(cacheKey, result.clone());
    return result;
  } catch {
    return json(
      { error: "release_lookup_failed", releasePage: RELEASE_PAGE_URL },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
};
