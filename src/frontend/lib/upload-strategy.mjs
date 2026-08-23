/**
 * Select the browser upload path from authenticated backend capabilities.
 * Production object storage wins; local upload is accepted only when the
 * backend explicitly advertises supported local-filesystem mode.
 *
 * @param {{
 *   upload_mode?: string,
 *   direct_object_upload_available?: boolean,
 *   local_upload_available?: boolean,
 * }} capabilities
 * @returns {'direct_object_storage' | 'local_filesystem'}
 */
export function selectUploadStrategy(capabilities) {
  if (
    capabilities?.upload_mode === 'direct_object_storage' &&
    capabilities.direct_object_upload_available === true
  ) {
    return 'direct_object_storage';
  }
  if (
    capabilities?.upload_mode === 'local_filesystem' &&
    capabilities.local_upload_available === true
  ) {
    return 'local_filesystem';
  }
  throw new Error(
    'Video storage is unavailable. Contact an administrator to check the server storage configuration.'
  );
}
