import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, evaluateVersion } from './version.ts';

test('semantik sürümleri sayısal karşılaştırır', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
});

test('minimum sürümün altındaki paketi zorunlu günceller', () => {
  assert.deepEqual(
    evaluateVersion('1.0.0', {
      latestVersion: '1.2.0',
      minimumVersion: '1.1.0',
      forceLatest: false,
      androidDownloadUrl: 'https://example.com/app.apk',
    }),
    { updateAvailable: true, updateRequired: true },
  );
});

test('forceLatest açıkken son APK sürümünü zorunlu tutar', () => {
  const result = evaluateVersion('1.1.0', {
    latestVersion: '1.2.0',
    minimumVersion: '1.0.0',
    forceLatest: true,
    androidDownloadUrl: 'https://example.com/app.apk',
  });
  assert.equal(result.updateRequired, true);
});
