export interface MobileVersionInfo {
  latestVersion: string;
  minimumVersion: string;
  forceLatest: boolean;
  androidDownloadUrl: string;
}

export interface VersionDecision {
  updateAvailable: boolean;
  updateRequired: boolean;
}

function numericParts(version: string): number[] {
  const clean = version.trim().replace(/^v/i, '').split('-')[0] ?? '';
  const parts = clean.split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareVersions(left: string, right: string): number {
  const leftParts = numericParts(left);
  const rightParts = numericParts(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function evaluateVersion(
  currentVersion: string,
  info: MobileVersionInfo,
): VersionDecision {
  const updateAvailable = compareVersions(currentVersion, info.latestVersion) < 0;
  const belowMinimum = compareVersions(currentVersion, info.minimumVersion) < 0;
  return {
    updateAvailable,
    updateRequired: belowMinimum || (info.forceLatest && updateAvailable),
  };
}
