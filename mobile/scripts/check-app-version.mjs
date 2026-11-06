import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appVersion = JSON.parse(await readFile(new URL('../app-version.json', import.meta.url), 'utf8'));
const semver = /^\d+\.\d+\.\d+$/;

if (!semver.test(appVersion.version)) {
  throw new Error(`app-version.json içindeki sürüm geçersiz: ${appVersion.version}`);
}

if (packageJson.version !== appVersion.version) {
  throw new Error(
    `package.json (${packageJson.version}) ve app-version.json (${appVersion.version}) aynı olmalı.`,
  );
}

console.log(`Uygulama sürümü doğrulandı: ${appVersion.version}`);
