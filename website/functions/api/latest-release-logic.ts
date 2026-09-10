export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type ReleaseAssetKind =
  | "macos-arm64-installer"
  | "macos-x64-installer"
  | "macos-universal-installer"
  | "windows-x64-installer"
  | "auxiliary"
  | "unknown";

const MACOS_INSTALLER = /^Blink_.+_(aarch64|arm64|x64|universal)\.dmg$/i;
const WINDOWS_X64_INSTALLER = /^Blink_.+_x64-setup\.exe$/i;
const AUXILIARY = /(?:^|[._-])(updater?|update|latest|checksums?|signature|sig)(?:[._-]|$)/i;

export function classifyReleaseAsset(name: string): ReleaseAssetKind {
  const macos = name.match(MACOS_INSTALLER);
  if (macos) {
    const architecture = macos[1].toLowerCase();
    if (architecture === "aarch64" || architecture === "arm64") return "macos-arm64-installer";
    if (architecture === "x64") return "macos-x64-installer";
    return "macos-universal-installer";
  }
  if (WINDOWS_X64_INSTALLER.test(name)) return "windows-x64-installer";
  if (AUXILIARY.test(name)) return "auxiliary";
  return "unknown";
}

export function selectReleaseAssets(assets: ReleaseAsset[]) {
  const selected: Partial<Record<ReleaseAssetKind, ReleaseAsset>> = {};
  for (const asset of [...assets].sort((left, right) => left.name.localeCompare(right.name))) {
    const kind = classifyReleaseAsset(asset.name);
    if (kind !== "unknown" && !selected[kind]) selected[kind] = asset;
  }

  return {
    macosArm64: selected["macos-arm64-installer"]?.browser_download_url ?? null,
    macosX64: selected["macos-x64-installer"]?.browser_download_url ?? null,
    macosUniversal: selected["macos-universal-installer"]?.browser_download_url ?? null,
    windowsX64: selected["windows-x64-installer"]?.browser_download_url ?? null,
  };
}
