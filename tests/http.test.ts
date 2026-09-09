import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, assertSameOrigin } from '../lib/http';

test('acepta solicitudes directas del mismo origen', () => {
  const request = new Request('https://cash.example.com/api/auth/login', {
    headers: { origin: 'https://cash.example.com' },
  });
  assert.doesNotThrow(() => assertSameOrigin(request));
});

test('acepta el host público comunicado por un proxy inverso', () => {
  const request = new Request('http://127.0.0.1:3052/api/auth/login', {
    headers: {
      origin: 'https://cash.example.com',
      host: '127.0.0.1:3052',
      'x-forwarded-host': 'cash.example.com',
      'x-forwarded-proto': 'https',
    },
  });
  assert.doesNotThrow(() => assertSameOrigin(request));
});

test('rechaza un origen distinto al host público', () => {
  const request = new Request('http://127.0.0.1:3052/api/auth/login', {
    headers: {
      origin: 'https://attacker.example',
      host: '127.0.0.1:3052',
      'x-forwarded-host': 'cash.example.com',
      'x-forwarded-proto': 'https',
    },
  });
  assert.throws(
    () => assertSameOrigin(request),
    (error) => {
      return error instanceof ApiError && error.status === 403;
    },
  );
});

test('rechaza encabezados Origin malformados', () => {
  const request = new Request('https://cash.example.com/api/auth/login', {
    headers: { origin: 'no-es-una-url' },
  });
  assert.throws(() => assertSameOrigin(request), ApiError);
});
