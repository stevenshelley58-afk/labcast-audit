/**
 * Link Extractor
 * 
 * Extracts internal and external links from HTML samples.
 * Identifies broken links within the sampled set.
 * No network calls, no LLM calls, never throws.
 */

import type { HtmlSample } from "../audit.types.ts";

/**
 * Link data for a single page
 */
export interface PageLinks {
  url: string;
  internalLinks: string[];
  externalLinks: string[];
  brokenLinks: string[];
  nofollowLinks: string[];
}

/**
 * Site-wide link summary
 */
export interface LinksSummary {
  pages: PageLinks[];
  allInternalLinks: string[];
  allExternalLinks: string[];
  allBrokenLinks: string[];
  orphanPages: string[];
  linkGraph: Map<string, Set<string>>;
}

/**
 * Extracts links from HTML samples.
 * 
 * @param samples - HTML samples from crawled pages
 * @returns LinksSummary with page-level and site-wide data
 */
export function extractLinks(samples: HtmlSample[]): LinksSummary {
  if (!samples || samples.length === 0) {
    return {
      pages: [],
      allInternalLinks: [],
      allExternalLinks: [],
      allBrokenLinks: [],
      orphanPages: [],
      linkGraph: new Map(),
    };
  }

  // First pass: extract all page-level links
  const pages: PageLinks[] = samples.map(sample => extractPageLinks(sample));

  // Build set of all known URLs in sample
  const knownUrls = new Set(samples.map(s => normalizeForComparison(s.url)));

  // Build set of all discovered internal links
  const allInternalSet = new Set<string>();
  const allExternalSet = new Set<string>();
  const linkGraph = new Map<string, Set<string>>();

  for (const page of pages) {
    const sourceUrl = normalizeForComparison(page.url);
    const targets = new Set<string>();

    for (const link of page.internalLinks) {
      const normalized = normalizeForComparison(link);
      allInternalSet.add(link);
      targets.add(normalized);

      // Check if link is broken (not in known URLs)
      if (!knownUrls.has(normalized) && !isExternalUrl(link, page.url)) {
        // This is an internal link to a page we didn't sample
        // We can't determine if it's broken without crawling
      }
    }

    for (const link of page.externalLinks) {
      allExternalSet.add(link);
    }

    linkGraph.set(sourceUrl, targets);
  }

  // Find broken links (links to sampled pages that 404)
  const brokenSet = new Set<string>();
  for (const sample of samples) {
    if (sample.status === 404) {
      brokenSet.add(normalizeForComparison(sample.url));
    }
  }

  // Mark broken links in pages
  for (const page of pages) {
    page.brokenLinks = page.internalLinks.filter(link => {
      return brokenSet.has(normalizeForComparison(link));
    });
  }

  // Find orphan pages (pages with no incoming internal links)
  const urlsWithIncoming = new Set<string>();
  for (const targets of linkGraph.values()) {
    for (const target of targets) {
      urlsWithIncoming.add(target);
    }
  }

  const orphanPages: string[] = [];
  for (const sample of samples) {
    const normalized = normalizeForComparison(sample.url);
    // Root page is not considered orphan
    try {
      const url = new URL(sample.url);
      if (url.pathname === "/" || url.pathname === "") {
        continue;
      }
    } catch {
      continue;
    }

    if (!urlsWithIncoming.has(normalized)) {
      orphanPages.push(sample.url);
    }
  }

  return {
    pages,
    allInternalLinks: Array.from(allInternalSet),
    allExternalLinks: Array.from(allExternalSet),
    allBrokenLinks: Array.from(brokenSet),
    orphanPages,
    linkGraph,
  };
}

/**
 * Extracts links from a single HTML sample.
 * 
 * @param sample - HTML sample
 * @returns PageLinks
 */
function extractPageLinks(sample: HtmlSample): PageLinks {
  const url = sample.url || "";
  const html = sample.html || "";

  try {
    const baseDomain = extractDomain(url);
    if (!baseDomain) {
      return {
        url,
        internalLinks: [],
        externalLinks: [],
        brokenLinks: [],
        nofollowLinks: [],
      };
    }

    const internalLinks: string[] = [];
    const externalLinks: string[] = [];
    const nofollowLinks: string[] = [];
    const seen = new Set<string>();

    const regex = /<a[^>]*href=["']([^"']*)["'][^>]*>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const href = match[1].trim();
      const anchorTag = match[0];

      // Skip anchors, javascript:, mailto:, tel:, etc.
      if (!href || href.startsWith("#") || href.startsWith("javascript:") ||
          href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("data:")) {
        continue;
      }

      // Resolve relative URLs
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, url).toString();
      } catch {
        continue;
      }

      // Skip duplicates
      if (seen.has(absoluteUrl)) {
        continue;
      }
      seen.add(absoluteUrl);

      // Check nofollow
      const isNofollow = /rel=["'][^"']*nofollow[^"']*["']/i.test(anchorTag) ||
                         anchorTag.toLowerCase().includes('rel=') && anchorTag.toLowerCase().includes('nofollow');

      const linkDomain = extractDomain(absoluteUrl);
      const isInternal = linkDomain === baseDomain;

      if (isInternal) {
        internalLinks.push(absoluteUrl);
        if (isNofollow) {
          nofollowLinks.push(absoluteUrl);
        }
      } else {
        externalLinks.push(absoluteUrl);
      }
    }

    return {
      url,
      internalLinks,
      externalLinks,
      brokenLinks: [], // Populated later
      nofollowLinks,
    };
  } catch {
    return {
      url,
      internalLinks: [],
      externalLinks: [],
      brokenLinks: [],
      nofollowLinks: [],
    };
  }
}

/**
 * Extracts domain from URL.
 */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Checks if a URL is external relative to a base URL.
 */
function isExternalUrl(url: string, baseUrl: string): boolean {
  try {
    const targetDomain = new URL(url).hostname.toLowerCase();
    const baseDomain = new URL(baseUrl).hostname.toLowerCase();
    return targetDomain !== baseDomain;
  } catch {
    return false;
  }
}

/**
 * Normalizes URL for comparison (lowercase, remove protocol, trailing slashes).
 */
function normalizeForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    let normalized = parsed.hostname.toLowerCase() + parsed.pathname;
    // Remove trailing slash except for root
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}
