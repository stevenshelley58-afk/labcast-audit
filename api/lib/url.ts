/**
 * URL Normalization Utility
 *
 * Handles URL parsing, validation, and normalization for the audit system.
 * Ensures consistent URL handling across all stages.
 */

export interface NormalizedUrl {
  /** Full normalized URL */
  href: string;
  /** Origin (protocol + host) */
  origin: string;
  /** Protocol (https: or http:) */
  protocol: string;
  /** Hostname without www */
  hostname: string;
  /** Hostname with www if present */
  host: string;
  /** Pathname */
  pathname: string;
  /** Search/query string */
  search: string;
  /** Hash fragment */
  hash: string;
}

/**
 * Normalize a URL string to ensure https scheme and valid format
 *
 * @param rawUrl - Raw URL input from user
 * @returns Normalized URL object
 * @throws Error if URL is invalid
 */
export function normalizeUrl(rawUrl: string): NormalizedUrl {
  let url = rawUrl.trim();

  // Ensure protocol
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Validate and parse
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  // Normalize protocol to lowercase
  const protocol = parsed.protocol.toLowerCase();

  // Normalize hostname (remove www for consistency in comparisons)
  const host = parsed.host.toLowerCase();
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

  // Reconstruct normalized URL
  const normalizedHref = `${protocol}//${host}${parsed.pathname}${parsed.search}${parsed.hash}`;

  return {
    href: normalizedHref,
    origin: `${protocol}//${host}`,
    protocol,
    hostname,
    host,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
}

/**
 * Validate a URL without normalizing it
 *
 * @param url - URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the hostname from a URL string
 *
 * @param url - URL string
 * @returns hostname or null if invalid
 */
export function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Build common audit-related URLs for a target
 *
 * @param normalizedUrl - Normalized URL object
 * @returns Object with common audit URLs
 */
export function buildAuditUrls(normalizedUrl: NormalizedUrl): {
  robots: string;
  sitemap: string;
  httpsHead: string;
  httpHead: string;
  httpsGet: string;
} {
  const origin = normalizedUrl.origin;

  return {
    robots: `${origin}/robots.txt`,
    sitemap: `${origin}/sitemap.xml`,
    httpsHead: normalizedUrl.href,
    httpHead: `http://${normalizedUrl.host}${normalizedUrl.pathname}`,
    httpsGet: normalizedUrl.href,
  };
}

/**
 * Truncate a URL for display/logging purposes
 *
 * @param url - URL to truncate
 * @param maxLength - Maximum length (default 60)
 * @returns Truncated URL string
 */
export function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * Compare two URLs for equality (ignoring protocol and www)
 *
 * @param url1 - First URL
 * @param url2 - Second URL
 * @returns true if URLs are equivalent
 */
export function urlsEqual(url1: string, url2: string): boolean {
  try {
    const normalized1 = normalizeUrl(url1);
    const normalized2 = normalizeUrl(url2);

    return (
      normalized1.hostname === normalized2.hostname &&
      normalized1.pathname === normalized2.pathname &&
      normalized1.search === normalized2.search
    );
  } catch {
    return false;
  }
}

/**
 * Get the apex domain (e.g., example.com from www.example.com or sub.example.com)
 *
 * @param hostname - Hostname to process
 * @returns Apex domain
 */
export function getApexDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');

  // Handle common two-part TLDs
  const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'org.uk', 'net.au'];
  const lastTwo = parts.slice(-2).join('.');

  if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }

  // Standard case: last two parts
  return parts.slice(-2).join('.');
}

/**
 * Build SERP search queries for a domain
 *
 * @param hostname - Domain hostname
 * @returns Array of search queries for SERP analysis
 */
export function buildSerpQueries(hostname: string): string[] {
  const apexDomain = getApexDomain(hostname);

  return [
    `site:${apexDomain}`,
    `${apexDomain} reviews`,
    `"${apexDomain}" brand`,
  ];
}
