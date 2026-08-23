const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/**
 * Keep local browser and API requests on the same loopback hostname so
 * HttpOnly SameSite cookies work whether the UI was opened through
 * localhost or 127.0.0.1. Non-local deployment URLs are left untouched.
 *
 * @param {string} configuredUrl
 * @param {string | undefined} browserHostname
 * @returns {string}
 */
export function resolveBrowserApiBaseUrl(configuredUrl, browserHostname) {
  if (!browserHostname) return configuredUrl;

  try {
    const parsed = new URL(configuredUrl);
    const configuredHostname = parsed.hostname.toLowerCase();
    const currentHostname = browserHostname.toLowerCase();

    if (
      LOOPBACK_HOSTNAMES.has(configuredHostname) &&
      LOOPBACK_HOSTNAMES.has(currentHostname)
    ) {
      parsed.hostname = currentHostname;
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    // Preserve the configured value so the existing request error remains clear.
  }

  return configuredUrl;
}
