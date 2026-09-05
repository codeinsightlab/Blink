export type SupportedPlatform = "macos" | "windows" | "other";

export const RELEASE_REPOSITORY = "codeinsightlab/Blink-Releases";
export const RELEASE_API_URL = "/api/latest-release";
export const RELEASE_PAGE_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest`;

type LatestRelease = {
  macos?: string | null;
  windows?: string | null;
  releasePage?: string;
};

export function detectPlatform(): SupportedPlatform {
  if (typeof navigator === "undefined") return "other";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent;
  if (/Mac/i.test(platform)) return "macos";
  if (/Win/i.test(platform)) return "windows";
  return "other";
}

export async function resolveLatestDownload(platform: SupportedPlatform) {
  if (platform === "other") return RELEASE_PAGE_URL;
  const response = await fetch(RELEASE_API_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Release lookup failed: ${response.status}`);
  const release = (await response.json()) as LatestRelease;
  const asset = platform === "macos" ? release.macos : release.windows;
  return asset || release.releasePage || RELEASE_PAGE_URL;
}
