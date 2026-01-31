/**
 * Crawl Audit Module
 * 
 * Analyzes robots.txt, sitemaps, redirects, and URL structure.
 * Produces deterministic findings - no network calls, no LLM calls.
 * Never throws, returns empty array if no findings.
 */

import type { SiteSnapshot, AuditFinding, RawSnapshot } from "../audit.types.js";
import { isPresent } from "../audit.util.js";
import { MAX_REDIRECT_HOPS } from "../audit.config.js";

/**
 * Runs crawl audit on SiteSnapshot.
 * 
 * @param snapshot - SiteSnapshot from extractors
 * @param raw - RawSnapshot for additional data access
 * @returns Array of crawl findings
 */
export function auditCrawl(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  try {
    // Check robots.txt blocking
    const robotsFindings = checkRobotsBlocking(snapshot, raw);
    findings.push(...robotsFindings);

    // Check sitemap issues
    const sitemapFindings = checkSitemapIssues(snapshot, raw);
    findings.push(...sitemapFindings);

    // Check redirect chains
    const redirectFindings = checkRedirectChains(raw);
    findings.push(...redirectFindings);

    // Check canonical and redirect conflicts
    const conflictFindings = checkCanonicalRedirectConflicts(snapshot, raw);
    findings.push(...conflictFindings);

    // Check for parameterized URLs
    const paramFindings = checkParameterizedUrls(snapshot);
    findings.push(...paramFindings);

  } catch {
    // Never throw - return findings collected so far
  }

  return findings;
}

/**
 * Checks if robots.txt blocks important sections.
 */
function checkRobotsBlocking(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const robotsTxt = raw.robotsTxt?.data;
  if (!robotsTxt || robotsTxt.status !== 200) {
    return findings;
  }

  const body = robotsTxt.body.toLowerCase();
  const lines = body.split(/\r?\n/);

  // Check for important sections being blocked
  const importantPaths = [
    { path: "/", name: "home", pattern: /^\s*disallow:\s*\/?\s*$/i },
    { path: "/products", name: "products", pattern: /disallow:\s*\/?products/i },
    { path: "/collections", name: "collections", pattern: /disallow:\s*\/?collections/i },
    { path: "/blog", name: "blog", pattern: /disallow:\s*\/?blog/i },
    { path: "/shop", name: "shop", pattern: /disallow:\s*\/?shop/i },
  ];

  const blockedImportant: string[] = [];
  const blockingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    
    for (const important of importantPaths) {
      if (important.pattern.test(trimmed)) {
        blockedImportant.push(important.name);
        blockingLines.push(line.trim());
      }
    }
  }

  if (blockedImportant.length > 0) {
    // Determine severity based on what's blocked
    const hasHome = blockedImportant.includes("home");
    const severity = hasHome ? "critical" : "warning";

    findings.push({
      type: "crawl_robots_blocked",
      severity,
      message: `robots.txt blocks important sections: ${blockedImportant.join(", ")}`,
      evidence: {
        blockedSections: blockedImportant,
        robotsLines: blockingLines.slice(0, 10),
        robotsSample: robotsTxt.body.slice(0, 500),
      },
      affectedUrls: ["/robots.txt"],
    });
  }

  return findings;
}

/**
 * Checks for sitemap issues.
 */
function checkSitemapIssues(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const sitemapsData = raw.sitemaps?.data;
  const robotsTxt = raw.robotsTxt?.data;

  // Check if sitemap is missing
  const hasSitemapRefs = robotsTxt?.sitemapRefs && robotsTxt.sitemapRefs.length > 0;
  const hasExtractedUrls = sitemapsData?.extractedUrls && sitemapsData.extractedUrls.length > 0;

  if (!hasSitemapRefs && !hasExtractedUrls) {
    findings.push({
      type: "crawl_sitemap_missing",
      severity: "warning",
      message: "No sitemap.xml found or referenced in robots.txt",
      evidence: {
        robotsSitemapRefs: robotsTxt?.sitemapRefs || [],
        discoveredUrls: sitemapsData?.discoveredUrls || [],
      },
      affectedUrls: ["/sitemap.xml"],
    });
    return findings;
  }

  // Check if sitemap is empty or invalid
  if (hasSitemapRefs && !hasExtractedUrls) {
    findings.push({
      type: "crawl_sitemap_empty",
      severity: "warning",
      message: "Sitemap referenced but could not be parsed or is empty",
      evidence: {
        sitemapUrls: robotsTxt.sitemapRefs,
        errors: sitemapsData?.errors || ["Failed to extract URLs from sitemap"],
      },
      affectedUrls: robotsTxt.sitemapRefs,
    });
  }

  // Check for non-canonical hosts in sitemap
  if (hasExtractedUrls && sitemapsData) {
    const extractedUrls = sitemapsData.extractedUrls;
    const canonicalHost = snapshot.identity.normalizedUrl;
    
    try {
      const expectedHost = new URL(canonicalHost).hostname.toLowerCase();
      const nonCanonicalUrls: string[] = [];

      for (const url of extractedUrls.slice(0, 100)) {
        try {
          const urlHost = new URL(url).hostname.toLowerCase();
          if (urlHost !== expectedHost) {
            nonCanonicalUrls.push(url);
          }
        } catch {
          // Invalid URL, skip
        }
      }

      if (nonCanonicalUrls.length > 0) {
        findings.push({
          type: "crawl_sitemap_missing", // Reuse type for sitemap issues
          severity: "info",
          message: "Sitemap contains URLs with non-canonical hostnames",
          evidence: {
            expectedHost,
            nonCanonicalSamples: nonCanonicalUrls.slice(0, 10),
            nonCanonicalCount: nonCanonicalUrls.length,
          },
          affectedUrls: nonCanonicalUrls.slice(0, 5),
        });
      }
    } catch {
      // URL parsing error, skip
    }
  }

  return findings;
}

/**
 * Checks for excessive redirect chains.
 */
function checkRedirectChains(raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const redirectMap = raw.redirectMap?.data;
  if (!redirectMap) {
    return findings;
  }

  const chains = [
    { name: "httpRoot", chain: redirectMap.httpRoot },
    { name: "httpsRoot", chain: redirectMap.httpsRoot },
    { name: "httpsWww", chain: redirectMap.httpsWww },
    { name: "httpWww", chain: redirectMap.httpWww },
  ];

  const excessiveChains: Array<{ name: string; hops: number; urls: string[] }> = [];

  for (const { name, chain } of chains) {
    const hopCount = chain.chain.length;
    
    if (hopCount > 3) {
      excessiveChains.push({
        name,
        hops: hopCount,
        urls: chain.chain.map(c => c.url),
      });
    }
  }

  if (excessiveChains.length > 0) {
    findings.push({
      type: "crawl_unreachable", // Using this type for redirect chain issues
      severity: "warning",
      message: `Excessive redirect chains detected (${excessiveChains.length} chains with >3 hops)`,
      evidence: {
        chainDetails: excessiveChains.map(c => ({
          variant: c.name,
          hops: c.hops,
          chain: c.urls.slice(0, 5),
        })),
        maxHops: MAX_REDIRECT_HOPS,
      },
    });
  }

  return findings;
}

/**
 * Checks for canonical and redirect conflicts.
 */
function checkCanonicalRedirectConflicts(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const redirectMap = raw.redirectMap?.data;
  if (!redirectMap) {
    return findings;
  }

  // Get the canonical final URL from redirect chains
  const httpsRootFinal = redirectMap.httpsRoot?.finalUrl;
  const httpsWwwFinal = redirectMap.httpsWww?.finalUrl;

  // Check for inconsistent redirects (www vs non-www)
  if (httpsRootFinal && httpsWwwFinal) {
    try {
      const rootHost = new URL(httpsRootFinal).hostname.toLowerCase();
      const wwwHost = new URL(httpsWwwFinal).hostname.toLowerCase();

      // If both exist without redirecting to each other, there's a conflict
      const rootToWww = rootHost === `www.${wwwHost}` || wwwHost === `www.${rootHost}`;
      
      if (!rootToWww && rootHost !== wwwHost) {
        findings.push({
          type: "crawl_unreachable",
          severity: "warning",
          message: "Inconsistent host configuration: www and non-www hosts serve different content",
          evidence: {
            httpsRoot: httpsRootFinal,
            httpsWww: httpsWwwFinal,
            recommendation: "Choose one canonical version (www or non-www) and redirect the other",
          },
        });
      }
    } catch {
      // URL parsing error, skip
    }
  }

  // Check for HTTP not redirecting to HTTPS
  const httpRootFinal = redirectMap.httpRoot?.finalUrl;
  const httpWwwFinal = redirectMap.httpWww?.finalUrl;

  if (httpRootFinal) {
    try {
      const httpProtocol = new URL(httpRootFinal).protocol;
      if (httpProtocol === "http:") {
        findings.push({
          type: "crawl_unreachable",
          severity: "critical",
          message: "HTTP root does not redirect to HTTPS",
          evidence: {
            httpUrl: httpRootFinal,
            httpsUrl: httpsRootFinal,
            recommendation: "Implement 301 redirect from HTTP to HTTPS",
          },
        });
      }
    } catch {
      // URL parsing error, skip
    }
  }

  return findings;
}

/**
 * Checks for parameterized URLs.
 */
function checkParameterizedUrls(snapshot: SiteSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const parameterizedUrls: string[] = [];
  const commonParams = new Set([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "ref", "source", "campaign", "medium",
    "sort", "filter", "page", "limit", "order",
  ]);

  for (const url of snapshot.urlSet.all.slice(0, 200)) {
    try {
      const urlObj = new URL(url);
      if (urlObj.search && urlObj.search.length > 1) {
        parameterizedUrls.push(url);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  if (parameterizedUrls.length > 0) {
    // Analyze parameter patterns
    const paramTypes = new Map<string, number>();
    
    for (const url of parameterizedUrls.slice(0, 50)) {
      try {
        const urlObj = new URL(url);
        for (const [key] of urlObj.searchParams) {
          const type = commonParams.has(key.toLowerCase()) ? key.toLowerCase() : "other";
          paramTypes.set(type, (paramTypes.get(type) || 0) + 1);
        }
      } catch {
        // Invalid URL, skip
      }
    }

    findings.push({
      type: "crawl_unreachable", // Informational finding
      severity: "info",
      message: `Detected ${parameterizedUrls.length} URLs with query parameters`,
      evidence: {
        parameterizedCount: parameterizedUrls.length,
        sampleUrls: parameterizedUrls.slice(0, 10),
        parameterTypes: Object.fromEntries(paramTypes),
        recommendation: "Ensure canonical tags are set on parameterized URLs to avoid duplicate content",
      },
    });
  }

  return findings;
}
