/**
 * Collector Orchestrator
 *
 * Runs all Layer 1 collectors in parallel.
 * No LLM calls - purely deterministic data collection.
 */

import { fetchRobots, fetchSitemap, fetchHeaders, fetchHtml } from '../fetchers.js';
import { normalizeUrl, buildAuditUrls } from '../url.js';
import { analyzeSecurityHeaders, type SecurityHeadersResult } from './security-headers.js';
import { collectPageSpeed, type PageSpeedResult } from './pagespeed.js';
import { collectShallowCrawl, type ShallowCrawlResult } from './shallow-crawl.js';
import type { RobotsEvidence, SitemapEvidence, HeaderEvidence, HtmlEvidence } from '../types.js';

// Re-export collector types
export type { SecurityHeadersResult } from './security-headers.js';
export type { PageSpeedResult, CoreWebVitals, PerformanceOpportunity } from './pagespeed.js';
export type { ShallowCrawlResult, CrawlLink, SampledPage } from './shallow-crawl.js';

// ============================================================================
// Types
// ============================================================================

export interface Layer1Config {
  /** Enable PageSpeed Insights collection */
  psiEnabled: boolean;
  /** PageSpeed API key (optional) */
  psiApiKey?: string;
  /** Security scope */
  securityScope: 'headers_only' | 'full';
  /** Crawl depth */
  crawlDepth: 'surface' | 'shallow' | 'deep';
  /** Request timeout */
  timeout: number;
  /** Content length limits */
  limits: {
    htmlLength: number;
    robotsLength: number;
    sitemapLength: number;
  };
}

export interface Layer1Result {
  /** URL that was audited */
  url: string;
  /** Normalized URL components */
  normalizedUrl: ReturnType<typeof normalizeUrl>;
  /** Raw evidence from fetchers */
  evidence: {
    robots: RobotsEvidence;
    sitemap: SitemapEvidence;
    headers: HeaderEvidence;
    html: HtmlEvidence;
  };
  /** Security headers analysis */
  securityHeaders: SecurityHeadersResult;
  /** PageSpeed Insights data (null if disabled or failed) */
  pageSpeed: PageSpeedResult | null;
  /** Shallow crawl results */
  crawlData: ShallowCrawlResult;
  /** Timing information per collector */
  timings: {
    robots: number;
    sitemap: number;
    headers: number;
    html: number;
    securityHeaders: number;
    pageSpeed: number | null;
    crawl: number;
    total: number;
  };
  /** Errors encountered */
  errors: Array<{ collector: string; message: string }>;
  /** Explicit gaps in data collection */
  explicitGaps: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Layer1Config = {
  psiEnabled: true,
  securityScope: 'headers_only',
  crawlDepth: 'surface',
  timeout: 5000,
  limits: {
    htmlLength: 50000, // Larger limit for extraction
    robotsLength: 5000,
    sitemapLength: 10000,
  },
};

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Run all Layer 1 collectors in parallel
 */
export async function runLayer1Collectors(
  url: string,
  config: Partial<Layer1Config> = {}
): Promise<Layer1Result> {
  const cfg: Layer1Config = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const errors: Layer1Result['errors'] = [];
  const explicitGaps: string[] = [];

  // Normalize URL
  const normalizedUrl = normalizeUrl(url);
  const auditUrls = buildAuditUrls(normalizedUrl);

  // Track individual timings
  const timings: Layer1Result['timings'] = {
    robots: 0,
    sitemap: 0,
    headers: 0,
    html: 0,
    securityHeaders: 0,
    pageSpeed: null,
    crawl: 0,
    total: 0,
  };

  // Run basic fetchers in parallel
  const fetchStart = Date.now();

  const [robotsResult, sitemapResult, headersResult, htmlResult] = await Promise.all([
    timedFetch(() => fetchRobots(auditUrls.robots, url, cfg.limits.robotsLength)),
    timedFetch(() => fetchSitemap(auditUrls.sitemap, url, cfg.limits.sitemapLength)),
    timedFetch(() => fetchHeaders(auditUrls.httpsHead, auditUrls.httpHead, url)),
    timedFetch(() => fetchHtml(auditUrls.httpsGet, url, cfg.limits.htmlLength)),
  ]);

  timings.robots = robotsResult.duration;
  timings.sitemap = sitemapResult.duration;
  timings.headers = headersResult.duration;
  timings.html = htmlResult.duration;

  const evidence = {
    robots: robotsResult.data,
    sitemap: sitemapResult.data,
    headers: headersResult.data,
    html: htmlResult.data,
  };

  // Track errors from fetchers
  if (evidence.robots.error) {
    errors.push({ collector: 'robots', message: evidence.robots.error });
  }
  if (evidence.sitemap.error) {
    errors.push({ collector: 'sitemap', message: evidence.sitemap.error });
    explicitGaps.push('Sitemap not available or could not be parsed');
  }
  if (evidence.headers.error) {
    errors.push({ collector: 'headers', message: evidence.headers.error });
  }
  if (evidence.html.error) {
    errors.push({ collector: 'html', message: evidence.html.error });
  }

  // Run secondary collectors in parallel
  const secondaryStart = Date.now();

  // Security headers analysis
  const securityHeadersStart = Date.now();
  const securityHeaders = analyzeSecurityHeadersFromEvidence(
    evidence.headers.httpsHeaders,
    url.startsWith('https://')
  );
  timings.securityHeaders = Date.now() - securityHeadersStart;

  // PageSpeed Insights (if enabled)
  let pageSpeed: PageSpeedResult | null = null;
  if (cfg.psiEnabled) {
    const psiStart = Date.now();
    try {
      pageSpeed = await collectPageSpeed(url, cfg.psiApiKey, 60000);
      timings.pageSpeed = Date.now() - psiStart;

      if (pageSpeed.error) {
        errors.push({ collector: 'pageSpeed', message: pageSpeed.error });
        explicitGaps.push('PageSpeed Insights data unavailable: ' + pageSpeed.error);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({ collector: 'pageSpeed', message: error });
      explicitGaps.push('PageSpeed Insights collection failed');
      timings.pageSpeed = Date.now() - psiStart;
    }
  } else {
    explicitGaps.push('PageSpeed Insights collection disabled');
  }

  // Shallow crawl (uses already-fetched data)
  const crawlStart = Date.now();
  const crawlData = await collectShallowCrawl(
    url,
    evidence.robots.content,
    evidence.sitemap.content,
    evidence.html.content,
    {
      maxPages: cfg.crawlDepth === 'deep' ? 20 : cfg.crawlDepth === 'shallow' ? 10 : 5,
      maxDepth: cfg.crawlDepth === 'deep' ? 3 : cfg.crawlDepth === 'shallow' ? 2 : 1,
      checkLinkStatus: cfg.crawlDepth !== 'surface',
    }
  );
  timings.crawl = Date.now() - crawlStart;

  // Add crawl errors
  for (const crawlError of crawlData.errors) {
    errors.push({ collector: 'crawl', message: `${crawlError.url}: ${crawlError.error}` });
  }

  // Calculate total time
  timings.total = Date.now() - startTime;

  return {
    url,
    normalizedUrl,
    evidence,
    securityHeaders,
    pageSpeed,
    crawlData,
    timings,
    errors,
    explicitGaps,
  };
}

// ============================================================================
// Helper: Security Headers from Existing Headers
// ============================================================================

function analyzeSecurityHeadersFromEvidence(
  headers: Record<string, string>,
  isHttps: boolean
): SecurityHeadersResult {
  return analyzeSecurityHeaders(headers, isHttps);
}

// ============================================================================
// Utility: Timed Fetch Wrapper
// ============================================================================

interface TimedResult<T> {
  data: T;
  duration: number;
}

async function timedFetch<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = Date.now();
  const data = await fn();
  return {
    data,
    duration: Date.now() - start,
  };
}

// ============================================================================
// Event Emitter for SSE Updates
// ============================================================================

export type Layer1EventType =
  | 'layer1:start'
  | 'layer1:collector'
  | 'layer1:complete';

export interface Layer1Event {
  type: Layer1EventType;
  collector?: string;
  status?: 'started' | 'completed' | 'failed';
  message?: string;
  data?: unknown;
  timestamp: string;
}

/**
 * Run Layer 1 collectors with event callbacks for SSE streaming
 */
export async function runLayer1CollectorsWithEvents(
  url: string,
  config: Partial<Layer1Config> = {},
  onEvent: (event: Layer1Event) => void
): Promise<Layer1Result> {
  const emit = (
    type: Layer1EventType,
    extra: Partial<Omit<Layer1Event, 'type' | 'timestamp'>> = {}
  ) => {
    onEvent({
      type,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  };

  emit('layer1:start', { message: 'Starting Layer 1 collectors' });

  // Wrap each collector with event emission
  const cfg: Layer1Config = { ...DEFAULT_CONFIG, ...config };
  const normalizedUrl = normalizeUrl(url);
  const auditUrls = buildAuditUrls(normalizedUrl);

  const collectors = [
    { name: 'robots', fn: () => fetchRobots(auditUrls.robots, url, cfg.limits.robotsLength) },
    { name: 'sitemap', fn: () => fetchSitemap(auditUrls.sitemap, url, cfg.limits.sitemapLength) },
    { name: 'headers', fn: () => fetchHeaders(auditUrls.httpsHead, auditUrls.httpHead, url) },
    { name: 'html', fn: () => fetchHtml(auditUrls.httpsGet, url, cfg.limits.htmlLength) },
  ];

  // Run with individual progress events
  const results = await Promise.all(
    collectors.map(async ({ name, fn }) => {
      emit('layer1:collector', { collector: name, status: 'started' });
      try {
        const data = await fn();
        emit('layer1:collector', { collector: name, status: 'completed' });
        return { name, data, error: null };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emit('layer1:collector', { collector: name, status: 'failed', message: error });
        return { name, data: null, error };
      }
    })
  );

  // Now run the full collector to get complete result
  const result = await runLayer1Collectors(url, config);

  emit('layer1:complete', {
    message: 'Layer 1 collection complete',
    data: {
      timings: result.timings,
      errors: result.errors.length,
      gaps: result.explicitGaps.length,
    },
  });

  return result;
}
