/**
 * Shallow Crawl Collector
 *
 * Performs sitemap-first URL sampling and link graph extraction.
 * Pure deterministic collection - no LLM required.
 */

// ============================================================================
// Types
// ============================================================================

export interface CrawlLink {
  /** Source URL */
  from: string;
  /** Target URL */
  to: string;
  /** Link text/anchor */
  text: string;
  /** Whether it's an internal link */
  isInternal: boolean;
  /** Link position (nav, footer, content, etc.) */
  position?: 'nav' | 'footer' | 'sidebar' | 'content' | 'header' | 'unknown';
}

export interface SampledPage {
  /** Page URL */
  url: string;
  /** HTTP status */
  status: number | null;
  /** Page title */
  title: string | null;
  /** Discovered via */
  source: 'sitemap' | 'crawl' | 'homepage';
  /** Number of internal links found */
  internalLinks: number;
  /** Number of external links found */
  externalLinks: number;
}

export interface ShallowCrawlResult {
  /** Sampled URLs with basic info */
  sampledUrls: SampledPage[];
  /** Link graph (limited to prevent bloat) */
  linkGraph: CrawlLink[];
  /** Maximum crawl depth reached */
  crawlDepth: number;
  /** URLs found in sitemap */
  sitemapUrls: string[];
  /** Robots.txt rules summary */
  robotsRules: {
    allowAll: boolean;
    disallowPatterns: string[];
    crawlDelay?: number;
    sitemapUrls: string[];
  };
  /** Canonical host (detected) */
  canonicalHost: string;
  /** Total URLs discovered */
  totalUrlsDiscovered: number;
  /** Crawl statistics */
  stats: {
    pagesChecked: number;
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
    brokenLinks: number;
  };
  /** Errors during crawl */
  errors: Array<{ url: string; error: string }>;
}

export interface CrawlConfig {
  /** Maximum pages to sample */
  maxPages: number;
  /** Maximum depth for crawling */
  maxDepth: number;
  /** Timeout per request */
  timeout: number;
  /** Whether to check link status */
  checkLinkStatus: boolean;
  /** Maximum links to store in graph */
  maxLinksInGraph: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CrawlConfig = {
  maxPages: 10,
  maxDepth: 2,
  timeout: 5000,
  checkLinkStatus: false,
  maxLinksInGraph: 100,
};

// ============================================================================
// Robots.txt Parser
// ============================================================================

interface RobotsRules {
  allowAll: boolean;
  disallowPatterns: string[];
  crawlDelay?: number;
  sitemapUrls: string[];
}

function parseRobotsTxt(content: string): RobotsRules {
  const rules: RobotsRules = {
    allowAll: true,
    disallowPatterns: [],
    sitemapUrls: [],
  };

  if (!content) {
    return rules;
  }

  const lines = content.split('\n');
  let inUserAgentAll = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    // Track user-agent sections
    if (trimmed.startsWith('user-agent:')) {
      const agent = trimmed.replace('user-agent:', '').trim();
      inUserAgentAll = agent === '*';
    }

    // Extract disallow patterns
    if (inUserAgentAll && trimmed.startsWith('disallow:')) {
      const pattern = line.trim().replace(/^disallow:\s*/i, '').trim();
      if (pattern && pattern !== '') {
        rules.disallowPatterns.push(pattern);
        rules.allowAll = false;
      }
    }

    // Extract crawl delay
    if (inUserAgentAll && trimmed.startsWith('crawl-delay:')) {
      const delay = parseInt(trimmed.replace('crawl-delay:', '').trim(), 10);
      if (!isNaN(delay)) {
        rules.crawlDelay = delay;
      }
    }

    // Extract sitemap URLs (case-insensitive)
    if (trimmed.startsWith('sitemap:')) {
      const sitemapUrl = line.trim().replace(/^sitemap:\s*/i, '').trim();
      if (sitemapUrl) {
        rules.sitemapUrls.push(sitemapUrl);
      }
    }
  }

  return rules;
}

// ============================================================================
// Sitemap Parser
// ============================================================================

function parseSitemap(content: string, maxUrls: number = 50): string[] {
  const urls: string[] = [];

  // Try XML sitemap format
  const locMatches = content.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of locMatches) {
    if (urls.length >= maxUrls) break;
    const url = match[1].trim();
    if (url.startsWith('http')) {
      urls.push(url);
    }
  }

  // If no XML matches, try plain text format
  if (urls.length === 0) {
    const lines = content.split('\n');
    for (const line of lines) {
      if (urls.length >= maxUrls) break;
      const url = line.trim();
      if (url.startsWith('http')) {
        urls.push(url);
      }
    }
  }

  return urls;
}

// ============================================================================
// Link Extractor
// ============================================================================

interface ExtractedLinks {
  internal: CrawlLink[];
  external: CrawlLink[];
  title: string | null;
}

function extractLinks(html: string, baseUrl: string, sourceUrl: string): ExtractedLinks {
  const result: ExtractedLinks = {
    internal: [],
    external: [],
    title: null,
  };

  try {
    const baseUrlObj = new URL(baseUrl);
    const baseHost = baseUrlObj.hostname.replace(/^www\./, '');

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }

    // Find position context
    const findPosition = (index: number): CrawlLink['position'] => {
      const before = html.substring(Math.max(0, index - 500), index).toLowerCase();
      if (before.includes('<nav') || before.includes('class="nav')) return 'nav';
      if (before.includes('<header') || before.includes('class="header')) return 'header';
      if (before.includes('<footer') || before.includes('class="footer')) return 'footer';
      if (before.includes('<aside') || before.includes('class="sidebar')) return 'sidebar';
      return 'content';
    };

    // Extract anchor tags
    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].trim().substring(0, 100); // Limit text length
      const position = findPosition(match.index);

      // Skip non-http links
      if (
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        continue;
      }

      // Resolve relative URLs
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }

      // Check if internal
      try {
        const linkHost = new URL(absoluteUrl).hostname.replace(/^www\./, '');
        const isInternal = linkHost === baseHost;

        const link: CrawlLink = {
          from: sourceUrl,
          to: absoluteUrl,
          text,
          isInternal,
          position,
        };

        if (isInternal) {
          result.internal.push(link);
        } else {
          result.external.push(link);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Silently handle parse errors
  }

  return result;
}

// ============================================================================
// Main Collector
// ============================================================================

/**
 * Perform a shallow crawl starting from a URL
 */
export async function collectShallowCrawl(
  url: string,
  robotsTxt: string,
  sitemapContent: string,
  homepageHtml: string,
  config: Partial<CrawlConfig> = {}
): Promise<ShallowCrawlResult> {
  const cfg: CrawlConfig = { ...DEFAULT_CONFIG, ...config };

  const result: ShallowCrawlResult = {
    sampledUrls: [],
    linkGraph: [],
    crawlDepth: 0,
    sitemapUrls: [],
    robotsRules: {
      allowAll: true,
      disallowPatterns: [],
      sitemapUrls: [],
    },
    canonicalHost: '',
    totalUrlsDiscovered: 0,
    stats: {
      pagesChecked: 0,
      totalLinks: 0,
      internalLinks: 0,
      externalLinks: 0,
      brokenLinks: 0,
    },
    errors: [],
  };

  try {
    const baseUrl = new URL(url);
    result.canonicalHost = baseUrl.hostname;

    // Parse robots.txt
    result.robotsRules = parseRobotsTxt(robotsTxt);

    // Parse sitemap
    result.sitemapUrls = parseSitemap(sitemapContent, cfg.maxPages * 2);

    // Extract links from homepage
    const homepageLinks = extractLinks(homepageHtml, url, url);

    // Add homepage to sampled URLs
    result.sampledUrls.push({
      url,
      status: 200,
      title: homepageLinks.title,
      source: 'homepage',
      internalLinks: homepageLinks.internal.length,
      externalLinks: homepageLinks.external.length,
    });

    result.stats.pagesChecked = 1;
    result.stats.internalLinks = homepageLinks.internal.length;
    result.stats.externalLinks = homepageLinks.external.length;
    result.stats.totalLinks = homepageLinks.internal.length + homepageLinks.external.length;

    // Add links to graph (limited)
    const allLinks = [...homepageLinks.internal, ...homepageLinks.external];
    result.linkGraph = allLinks.slice(0, cfg.maxLinksInGraph);

    // Collect URLs to sample
    const urlsToSample = new Set<string>();

    // Add sitemap URLs first (higher priority)
    for (const sitemapUrl of result.sitemapUrls) {
      if (urlsToSample.size >= cfg.maxPages - 1) break;
      urlsToSample.add(sitemapUrl);
    }

    // Add discovered internal links
    for (const link of homepageLinks.internal) {
      if (urlsToSample.size >= cfg.maxPages - 1) break;
      urlsToSample.add(link.to);
    }

    // Sample additional pages (if checkLinkStatus is enabled)
    if (cfg.checkLinkStatus && urlsToSample.size > 0) {
      const samplesToCheck = Array.from(urlsToSample).slice(0, cfg.maxPages - 1);

      await Promise.all(
        samplesToCheck.map(async (pageUrl) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), cfg.timeout);

            const response = await fetch(pageUrl, {
              method: 'HEAD',
              redirect: 'follow',
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            result.sampledUrls.push({
              url: pageUrl,
              status: response.status,
              title: null,
              source: result.sitemapUrls.includes(pageUrl) ? 'sitemap' : 'crawl',
              internalLinks: 0,
              externalLinks: 0,
            });

            result.stats.pagesChecked++;
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            result.errors.push({ url: pageUrl, error });

            result.sampledUrls.push({
              url: pageUrl,
              status: null,
              title: null,
              source: result.sitemapUrls.includes(pageUrl) ? 'sitemap' : 'crawl',
              internalLinks: 0,
              externalLinks: 0,
            });

            result.stats.brokenLinks++;
          }
        })
      );
    } else {
      // Just add URLs without checking status
      for (const pageUrl of urlsToSample) {
        result.sampledUrls.push({
          url: pageUrl,
          status: null,
          title: null,
          source: result.sitemapUrls.includes(pageUrl) ? 'sitemap' : 'crawl',
          internalLinks: 0,
          externalLinks: 0,
        });
      }
    }

    // Update totals
    result.totalUrlsDiscovered =
      new Set([
        ...result.sitemapUrls,
        ...homepageLinks.internal.map((l) => l.to),
      ]).size + 1; // +1 for homepage

    // Determine crawl depth
    result.crawlDepth = cfg.checkLinkStatus ? 1 : 0;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    result.errors.push({ url, error });
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a URL is allowed by robots.txt rules
 */
export function isUrlAllowed(url: string, rules: RobotsRules): boolean {
  if (rules.allowAll) return true;

  try {
    const pathname = new URL(url).pathname;

    for (const pattern of rules.disallowPatterns) {
      // Simple pattern matching
      if (pattern === '/') {
        // Disallow all
        return false;
      }

      // Check prefix match
      if (pathname.startsWith(pattern)) {
        return false;
      }

      // Check wildcard patterns
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        if (regex.test(pathname)) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return true;
  }
}

/**
 * Get unique internal links from link graph
 */
export function getUniqueInternalLinks(linkGraph: CrawlLink[]): string[] {
  const urls = new Set<string>();
  for (const link of linkGraph) {
    if (link.isInternal) {
      urls.add(link.to);
    }
  }
  return Array.from(urls);
}

/**
 * Get navigation links (typically main menu items)
 */
export function getNavLinks(linkGraph: CrawlLink[]): CrawlLink[] {
  return linkGraph.filter((link) => link.position === 'nav' || link.position === 'header');
}
