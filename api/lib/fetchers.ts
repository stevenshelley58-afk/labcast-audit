/**
 * Signal Fetchers
 *
 * Timeout-enabled fetchers for gathering raw signals (robots, sitemap, headers, HTML).
 * Implements single retry for transient errors as per architecture requirements.
 */

import type { RobotsEvidence, SitemapEvidence, HeaderEvidence, HtmlEvidence } from './types';
import { normalizeUrl } from './url';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const MAX_REDIRECT_HOPS = 5;

// Transient error status codes that warrant a retry
const TRANSIENT_STATUS_CODES = [429, 500, 502, 503, 504];

// ============================================================================
// Types
// ============================================================================

interface FetchResult<T> {
  data: T | null;
  error: string | null;
  durationMs: number;
}

interface FetchOptions {
  timeout?: number;
  retries?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
}

// ============================================================================
// Core Fetch with Timeout
// ============================================================================

/**
 * Fetch with timeout and optional retry logic
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Fetch result with data/error and timing
 */
async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<Response>> {
  const { timeout = DEFAULT_TIMEOUT, retries = 1 } = options;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual', // Handle redirects manually to capture chain
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      // Check if status warrants retry
      if (attempt < retries && TRANSIENT_STATUS_CODES.includes(response.status)) {
        await delay(1000 * (attempt + 1)); // Exponential backoff
        continue;
      }

      return { data: response, error: null, durationMs };
    } catch (err) {
      clearTimeout(timeoutId);
      const error = err instanceof Error ? err.message : String(err);

      // Retry on network errors (but not aborts unless it's a timeout)
      if (attempt < retries && shouldRetryError(error)) {
        await delay(1000 * (attempt + 1));
        continue;
      }

      const durationMs = Date.now() - startTime;

      // Distinguish timeout from other errors
      if (error.includes('abort') || error.includes('timeout')) {
        return { data: null, error: 'Timeout', durationMs };
      }

      return { data: null, error, durationMs };
    }
  }

  const durationMs = Date.now() - startTime;
  return { data: null, error: 'Max retries exceeded', durationMs };
}

/**
 * Determine if an error warrants a retry
 */
function shouldRetryError(error: string): boolean {
  const retryablePatterns = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'network',
    'fetch failed',
  ];

  return retryablePatterns.some(pattern =>
    error.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Simple delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Robots.txt Fetcher
// ============================================================================

/**
 * Fetch robots.txt with timeout and retry
 *
 * @param url - Target URL (robots.txt will be appended)
 * @param targetUrl - Original target URL for evidence
 * @param maxLength - Maximum content length (default 5000)
 * @returns RobotsEvidence
 */
export async function fetchRobots(
  url: string,
  targetUrl: string,
  maxLength: number = 5000
): Promise<RobotsEvidence> {
  const startTime = Date.now();
  const result = await fetchWithTimeout(url, { timeout: 5000, retries: 1 });

  if (result.error || !result.data) {
    return {
      type: 'robots',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status: result.error || 'Failed',
      error: result.error || 'Failed',
    };
  }

  const status = result.data.status.toString();

  // Handle 404 gracefully - no robots.txt is common
  if (result.data.status === 404) {
    return {
      type: 'robots',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status: '404',
    };
  }

  if (!result.data.ok) {
    return {
      type: 'robots',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status,
      error: `HTTP ${result.data.status}`,
    };
  }

  try {
    const text = await result.data.text();
    return {
      type: 'robots',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: text.substring(0, maxLength),
      status,
    };
  } catch (err) {
    return {
      type: 'robots',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status: 'Parse Error',
      error: err instanceof Error ? err.message : 'Failed to parse robots.txt',
    };
  }
}

// ============================================================================
// Sitemap Fetcher
// ============================================================================

/**
 * Fetch sitemap.xml with timeout and retry
 *
 * @param url - Sitemap URL
 * @param targetUrl - Original target URL for evidence
 * @param maxLength - Maximum content length (default 5000)
 * @returns SitemapEvidence
 */
export async function fetchSitemap(
  url: string,
  targetUrl: string,
  maxLength: number = 5000
): Promise<SitemapEvidence> {
  const result = await fetchWithTimeout(url, { timeout: 5000, retries: 1 });

  if (result.error || !result.data) {
    return {
      type: 'sitemap',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      sitemapUrl: url,
      content: '',
      status: result.error || 'Failed',
      error: result.error || 'Failed',
    };
  }

  const status = result.data.status.toString();

  // Handle 404 gracefully - no sitemap is common
  if (result.data.status === 404) {
    return {
      type: 'sitemap',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      sitemapUrl: url,
      content: '',
      status: '404',
    };
  }

  if (!result.data.ok) {
    return {
      type: 'sitemap',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      sitemapUrl: url,
      content: '',
      status,
      error: `HTTP ${result.data.status}`,
    };
  }

  try {
    const text = await result.data.text();
    return {
      type: 'sitemap',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      sitemapUrl: url,
      content: text.substring(0, maxLength),
      status,
    };
  } catch (err) {
    return {
      type: 'sitemap',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      sitemapUrl: url,
      content: '',
      status: 'Parse Error',
      error: err instanceof Error ? err.message : 'Failed to parse sitemap',
    };
  }
}

// ============================================================================
// Headers Fetcher (with redirect chain capture)
// ============================================================================

/**
 * Fetch headers with redirect chain capture
 *
 * @param httpsUrl - HTTPS URL to check
 * @param httpUrl - HTTP URL to check
 * @param targetUrl - Original target URL for evidence
 * @returns HeaderEvidence
 */
export async function fetchHeaders(
  httpsUrl: string,
  httpUrl: string,
  targetUrl: string
): Promise<HeaderEvidence> {
  const httpsResult = await fetchWithRedirectChain(httpsUrl);
  const httpResult = await fetchWithRedirectChain(httpUrl);

  return {
    type: 'headers',
    url: targetUrl,
    gatheredAt: new Date().toISOString(),
    normalizedUrl: normalizeUrl(targetUrl),
    httpsHeaders: httpsResult.headers,
    httpHeaders: httpResult.headers,
    redirectChain: [...httpsResult.redirects, ...httpResult.redirects],
    error: httpsResult.error || httpResult.error,
  };
}

interface RedirectChainResult {
  headers: Record<string, string>;
  redirects: string[];
  error?: string;
}

/**
 * Fetch with redirect chain tracking
 */
async function fetchWithRedirectChain(url: string): Promise<RedirectChainResult> {
  const redirects: string[] = [];
  let currentUrl = url;
  let hops = 0;

  while (hops < MAX_REDIRECT_HOPS) {
    const result = await fetchWithTimeout(currentUrl, {
      timeout: 5000,
      retries: 0, // No retry within redirect following
    });

    if (result.error || !result.data) {
      return {
        headers: {},
        redirects,
        error: result.error || 'Failed',
      };
    }

    // Extract headers
    const headers: Record<string, string> = {};
    result.data.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Check for redirect
    if ([301, 302, 307, 308].includes(result.data.status)) {
      const location = headers['location'];
      if (location) {
        redirects.push(`${result.data.status} → ${location}`);
        currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).toString();
        hops++;
        continue;
      }
    }

    // Final response
    return { headers, redirects };
  }

  return {
    headers: {},
    redirects,
    error: `Max redirect hops (${MAX_REDIRECT_HOPS}) exceeded`,
  };
}

// ============================================================================
// HTML Fetcher
// ============================================================================

/**
 * Fetch HTML content with timeout and retry
 *
 * @param url - URL to fetch
 * @param targetUrl - Original target URL for evidence
 * @param maxLength - Maximum content length (default 5000)
 * @returns HtmlEvidence
 */
export async function fetchHtml(
  url: string,
  targetUrl: string,
  maxLength: number = 5000
): Promise<HtmlEvidence> {
  const result = await fetchWithTimeout(url, { timeout: 5000, retries: 1 });

  if (result.error || !result.data) {
    return {
      type: 'html',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status: result.error || 'Failed',
      error: result.error || 'Failed',
    };
  }

  const status = result.data.status.toString();

  if (!result.data.ok) {
    return {
      type: 'html',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status,
      error: `HTTP ${result.data.status}`,
    };
  }

  try {
    const text = await result.data.text();
    return {
      type: 'html',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: text.substring(0, maxLength),
      status,
    };
  } catch (err) {
    return {
      type: 'html',
      url: targetUrl,
      gatheredAt: new Date().toISOString(),
      normalizedUrl: normalizeUrl(targetUrl),
      content: '',
      status: 'Parse Error',
      error: err instanceof Error ? err.message : 'Failed to parse HTML',
    };
  }
}
