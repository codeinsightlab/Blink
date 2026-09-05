export type SupportedPlatform = "macos" | "windows" | "other";

export const RELEASE_REPOSITORY = "codeinsightlab/Blink-Releases";
export const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
export const RELEASE_PAGE_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest`;

type GitHubRelease = {
  html_url?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
};

export function detectPlatform(): SupportedPlatform {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/Mac/i.test(platform)) return "macos";
  if (/Win/i.test(platform)) return "windows";
  return "other";
}

function assetMatches(platform: SupportedPlatform, name: string) {
  if (platform === "macos") return /_aarch64\.dmg$/i.test(name);
  if (platform === "windows") return /_x64-setup\.exe$/i.test(name);
  return false;
}

export async function resolveLatestDownload(platform: SupportedPlatform) {
  if (platform === "other") return RELEASE_PAGE_URL;
  const response = await fetch(RELEASE_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`Release lookup failed: ${response.status}`);
  const release = (await response.json()) as GitHubRelease;
  const asset = release.assets?.find(({ name }) => assetMatches(platform, name));
  return asset?.browser_download_url || release.html_url || RELEASE_PAGE_URL;
}
