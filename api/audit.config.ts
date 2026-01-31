/**
 * SEO Audit System - Configuration Constants
 * 
 * All timeout values, limits, and version constants defined here.
 * These values are used across the audit pipeline.
 */

// ============================================================================
// AUDIT LIMITS
// ============================================================================

/**
 * Maximum number of pages to sample during deep crawl
 */
export const MAX_PAGES = 50;

/**
 * Maximum URLs to extract from sitemaps (prevents memory issues with huge sitemaps)
 */
export const MAX_SITEMAP_URLS = 50000;

/**
 * Maximum bytes to fetch per request (2MB)
 */
export const MAX_BYTES_PER_FETCH = 2 * 1024 * 1024;

/**
 * Maximum redirect hops to follow
 */
export const MAX_REDIRECT_HOPS = 10;

/**
 * Maximum concurrent requests for fetch operations
 */
export const CONCURRENCY_LIMIT = 6;

// ============================================================================
// TIMEOUTS (from spec section 8)
// ============================================================================

/**
 * Default fetch timeout - 8 seconds
 */
export const TIMEOUT_DEFAULT = 8000;

/**
 * Root page fetch timeout - 10 seconds (primary page, allow more time)
 */
export const TIMEOUT_ROOT_FETCH = 10000;

/**
 * robots.txt fetch timeout - 5 seconds
 */
export const TIMEOUT_ROBOTS_TXT = 5000;

/**
 * Sitemap fetch timeout - 15 seconds (XML can be large)
 */
export const TIMEOUT_SITEMAP = 15000;

/**
 * HTML sample fetch timeout - 8 seconds
 */
export const TIMEOUT_HTML_SAMPLE = 8000;

/**
 * DNS resolution timeout - 5 seconds
 */
export const TIMEOUT_DNS = 5000;

/**
 * TLS handshake timeout - 5 seconds
 */
export const TIMEOUT_TLS = 5000;

/**
 * Well-known endpoint fetch timeout - 5 seconds
 */
export const TIMEOUT_WELL_KNOWN = 5000;

/**
 * Screenshot capture timeout - 20 seconds (Puppeteer/Playwright)
 */
export const TIMEOUT_SCREENSHOT = 20000;

/**
 * Lighthouse audit timeout - 60 seconds (full performance audit)
 */
export const TIMEOUT_LIGHTHOUSE = 60000;

/**
 * SERP fetch timeout - 10 seconds
 */
export const TIMEOUT_SERP = 10000;

/**
 * Squirrelscan timeout - 30 seconds (security scan)
 */
export const TIMEOUT_SQUIRRELSCAN = 30000;

/**
 * LLM synthesis timeout - 60 seconds
 */
export const TIMEOUT_LLM_SYNTHESIS = 60000;

/**
 * Overall audit timeout - 10 minutes
 */
export const TIMEOUT_AUDIT_TOTAL = 10 * 60 * 1000;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/**
 * Maximum retries for transient failures
 */
export const MAX_RETRIES = 3;

/**
 * Base delay between retries (exponential backoff)
 */
export const RETRY_BASE_DELAY = 1000;

// ============================================================================
// TOOL VERSIONS
// ============================================================================

/**
 * Version of the audit system
 */
export const AUDIT_SYSTEM_VERSION = "2.0.0";

/**
 * Lighthouse version (for cache key)
 */
export const TOOL_VERSION_LIGHTHOUSE = "11.0.0";

/**
 * Puppeteer/Playwright version (for cache key)
 */
export const TOOL_VERSION_SCREENSHOT = "21.0.0";

/**
 * Squirrelscan version (for cache key)
 */
export const TOOL_VERSION_SQUIRRELSCAN = "1.0.0";

/**
 * Combined tool versions string for cache key computation
 */
export const TOOL_VERSIONS = [
  `lighthouse:${TOOL_VERSION_LIGHTHOUSE}`,
  `screenshot:${TOOL_VERSION_SCREENSHOT}`,
  `squirrelscan:${TOOL_VERSION_SQUIRRELSCAN}`,
].join(";");

// ============================================================================
// PROMPT VERSIONS
// ============================================================================

/**
 * Version of LLM prompts for synthesis
 */
export const PROMPT_VERSION_SYNTHESIS = "2.0.0";

/**
 * Version of LLM prompts for categorization
 */
export const PROMPT_VERSION_CATEGORIZE = "2.0.0";

/**
 * Version of LLM prompts for report generation
 */
export const PROMPT_VERSION_REPORT = "2.0.0";

/**
 * Combined prompt versions string for cache key computation
 */
export const PROMPT_VERSIONS = [
  `synthesis:${PROMPT_VERSION_SYNTHESIS}`,
  `categorize:${PROMPT_VERSION_CATEGORIZE}`,
  `report:${PROMPT_VERSION_REPORT}`,
].join(";");

// ============================================================================
// SAMPLING CONFIGURATION
// ============================================================================

/**
 * Maximum URLs per pattern group in sampling plan
 */
export const MAX_URLS_PER_PATTERN = 5;

/**
 * Minimum sample size per pattern group
 */
export const MIN_SAMPLE_PER_PATTERN = 1;

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * Default TTL for cache entries (24 hours in milliseconds)
 */
export const CACHE_TTL_DEFAULT = 24 * 60 * 60 * 1000;

/**
 * Cache TTL for RawSnapshot (12 hours - data can change)
 */
export const CACHE_TTL_RAW_SNAPSHOT = 12 * 60 * 60 * 1000;

/**
 * Cache TTL for SiteSnapshot (12 hours)
 */
export const CACHE_TTL_SITE_SNAPSHOT = 12 * 60 * 60 * 1000;

/**
 * Cache TTL for PublicReport (24 hours)
 */
export const CACHE_TTL_PUBLIC_REPORT = 24 * 60 * 60 * 1000;

/**
 * Cache TTL for PrivateFlags (24 hours)
 */
export const CACHE_TTL_PRIVATE_FLAGS = 24 * 60 * 60 * 1000;

// ============================================================================
// THRESHOLDS
// ============================================================================

/**
 * Large page threshold (bytes) - pages larger than this trigger warning
 */
export const THRESHOLD_LARGE_PAGE = 1024 * 1024; // 1MB

/**
 * Slow TTFB threshold (ms)
 */
export const THRESHOLD_SLOW_TTFB = 600;

/**
* Title length limits
 */
export const TITLE_LENGTH_MIN = 30;
export const TITLE_LENGTH_MAX = 60;

/**
 * Meta description length limits
 */
export const META_DESC_LENGTH_MIN = 70;
export const META_DESC_LENGTH_MAX = 155;

/**
 * Image size threshold for optimization warning (bytes)
 */
export const THRESHOLD_IMAGE_SIZE = 100 * 1024; // 100KB

/**
 * Maximum broken links before truncating
 */
export const MAX_BROKEN_LINKS_REPORTED = 50;

/**
 * Performance score thresholds
 */
export const PERF_THRESHOLD_GOOD = 90;
export const PERF_THRESHOLD_NEEDS_IMPROVEMENT = 50;

// ============================================================================
// SECURITY HEADER CHECKLIST
// ============================================================================

/**
 * Required security headers for tri-state checking
 */
export const SECURITY_HEADERS_CHECKLIST = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
] as const;

// ============================================================================
// WELL-KNOWN ENDPOINTS
// ============================================================================

/**
 * Well-known endpoints to check
 */
export const WELL_KNOWN_ENDPOINTS = [
  "/.well-known/security.txt",
  "/.well-known/change-password",
  "/.well-known/ai-plugin.json",
  "/ads.txt",
  "/app-ads.txt",
] as const;

// ============================================================================
// SITEMAP PATTERNS
// ============================================================================

/**
 * Common sitemap paths to check
 */
export const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap.php",
  "/sitemap.txt",
  "/sitemap.json",
  "/sitemap/",
] as const;

// ============================================================================
// USER AGENTS
// ============================================================================

/**
 * User agent for fetch requests
 */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (SEOAuditBot/2.0)";

/**
 * Mobile user agent for mobile screenshots
 */
export const USER_AGENT_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
