import assert from 'node:assert/strict';
import test from 'node:test';
import { isSecureApiBaseUrl, isValidApiBaseUrl, normalizeApiBaseUrl } from './apiUrl.ts';

test('API adresinin sonundaki slash ve yanlış CLI parametresini temizler', () => {
  assert.equal(
    normalizeApiBaseUrl('https://outfit-combination-api.onrender.com/ --environment'),
    'https://outfit-combination-api.onrender.com',
  );
});

test('dağıtım ortamı için yalnız HTTPS adresini güvenli kabul eder', () => {
  assert.equal(isSecureApiBaseUrl('https://outfit-combination-api.onrender.com'), true);
  assert.equal(isSecureApiBaseUrl('http://10.0.2.2:5080'), false);
});

test('yalnız HTTP veya HTTPS backend adresini kabul eder', () => {
  assert.equal(isValidApiBaseUrl('https://outfit-combination-api.onrender.com'), true);
  assert.equal(isValidApiBaseUrl('http://10.0.2.2:5080'), true);
  assert.equal(isValidApiBaseUrl('outfit-combination-api.onrender.com'), false);
});
