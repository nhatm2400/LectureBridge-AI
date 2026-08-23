import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBrowserApiBaseUrl } from './api-base-url.mjs';

test('aligns a localhost API URL with a 127.0.0.1 browser', () => {
  assert.equal(
    resolveBrowserApiBaseUrl('http://localhost:8000', '127.0.0.1'),
    'http://127.0.0.1:8000'
  );
});

test('aligns a 127.0.0.1 API URL with a localhost browser', () => {
  assert.equal(
    resolveBrowserApiBaseUrl('http://127.0.0.1:8000', 'localhost'),
    'http://localhost:8000'
  );
});

test('does not rewrite a non-local API URL', () => {
  assert.equal(
    resolveBrowserApiBaseUrl('https://api.lecturebridge.example', 'lecturebridge.example'),
    'https://api.lecturebridge.example'
  );
});

test('keeps the configured URL during server rendering', () => {
  assert.equal(
    resolveBrowserApiBaseUrl('http://localhost:8000', undefined),
    'http://localhost:8000'
  );
});
