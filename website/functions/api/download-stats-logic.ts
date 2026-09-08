export type DownloadStatsRelease = {
  tag: string;
  version: string;
  publishedAt: string | null;
  macos: number;
  windows: number;
  total: number;
};

export type DownloadStats = {
  total: number;
  macos: number;
  windows: number;
  releases: DownloadStatsRelease[];
};

type Asset = { name?: unknown; download_count?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function semverFromTag(tag: string) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function assetsFromRelease(value: unknown): Asset[] {
  if (!isRecord(value) || !Array.isArray(value.assets)) return [];
  return value.assets.filter(isRecord) as Asset[];
}

function countAssets(assets: Asset[], pattern: RegExp) {
  return assets.reduce((count, asset) => {
    const downloadCount = typeof asset.download_count === "number" && Number.isFinite(asset.download_count)
      ? asset.download_count
      : 0;
    return typeof asset.name === "string" && pattern.test(asset.name) ? count + downloadCount : count;
  }, 0);
}

export function aggregateDownloadStats(input: unknown): DownloadStats {
  const releases: DownloadStatsRelease[] = [];
  if (!Array.isArray(input)) return { total: 0, macos: 0, windows: 0, releases };

  for (const release of input) {
    if (!isRecord(release) || release.draft !== false || release.prerelease !== false) continue;
    const tag = typeof release.tag_name === "string" ? release.tag_name : null;
    const version = tag ? semverFromTag(tag) : null;
    if (!tag || !version) {
      if (tag) console.warn(`download_stats skipped invalid release tag: ${tag}`);
      continue;
    }

    const assets = assetsFromRelease(release);
    const macos = countAssets(assets, /\.dmg$/i);
    const windows = countAssets(assets, /-setup\.exe$/i);
    releases.push({
      tag,
      version,
      publishedAt: typeof release.published_at === "string" ? release.published_at : null,
      macos,
      windows,
      total: macos + windows,
    });
  }

  const macos = releases.reduce((sum, release) => sum + release.macos, 0);
  const windows = releases.reduce((sum, release) => sum + release.windows, 0);
  return { total: macos + windows, macos, windows, releases };
}
