import assert from 'node:assert/strict';
import test from 'node:test';

import { selectUploadStrategy } from './upload-strategy.mjs';

test('local filesystem capability selects the authenticated local upload path', () => {
  assert.equal(
    selectUploadStrategy({
      upload_mode: 'local_filesystem',
      direct_object_upload_available: false,
      local_upload_available: true,
    }),
    'local_filesystem'
  );
});

test('object-storage capability selects the direct presigned upload path', () => {
  assert.equal(
    selectUploadStrategy({
      upload_mode: 'direct_object_storage',
      direct_object_upload_available: true,
      local_upload_available: false,
    }),
    'direct_object_storage'
  );
});

test('unavailable or inconsistent storage capability returns a clear error', () => {
  assert.throws(
    () =>
      selectUploadStrategy({
        upload_mode: 'unavailable',
        direct_object_upload_available: false,
        local_upload_available: false,
      }),
    /Video storage is unavailable/
  );
  assert.throws(
    () =>
      selectUploadStrategy({
        upload_mode: 'direct_object_storage',
        direct_object_upload_available: false,
        local_upload_available: false,
      }),
    /Video storage is unavailable/
  );
});
