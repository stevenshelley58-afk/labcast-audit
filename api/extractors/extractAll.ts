/**
 * Extractor Orchestrator
 * 
 * Orchestrates all extractors to transform RawSnapshot into SiteSnapshot.
 * No network calls, no LLM calls, never throws.
 * All extractors return TriState - never throw.
 * Handles missing data gracefully (return "unknown").
 */

import type { 
  RawSnapshot, 
  SiteSnapshot,
  AuditIdentity,
  PageSignals,
  UrlTemplate,
} from "../audit.types.js";

// Import all extractors
import { extractHtmlSignals } from "./htmlSignals.js";
import { extractSchema, type SchemaSummary } from "./schema.js";
import { extractLinks, type LinksSummary } from "./links.js";
import { extractImages, type ImagesSummary } from "./images.js";
import { extractSecurityHeaders, type SecurityHeadersResult } from "./securityHeaders.js";
import { extractInfra, type InfraResult } from "./infra.js";
import { extractPerf, type PerfResult } from "./perf.js";
import { extractCoverage, type CoverageResult, getUnknownRates } from "./coverage.js";
import { extractUrlset, type UrlsetResult } from "./urlset.js";

/**
 * Complete extraction result with all intermediate data
 */
export interface ExtractionResult {
  siteSnapshot: SiteSnapshot;
  intermediate: {
    schema: SchemaSummary;
    links: LinksSummary;
    images: ImagesSummary;
    securityHeaders: SecurityHeadersResult;
    infra: InfraResult;
    perf: PerfResult;
    coverage: CoverageResult;
    urlset: UrlsetResult;
  };
}

/**
 * Orchestrates all extractors to transform RawSnapshot into SiteSnapshot.
 * 
 * @param raw - RawSnapshot from collectors
 * @param identity - Audit identity
 * @returns ExtractionResult with SiteSnapshot and intermediate data
 */
export function extractAll(
  raw: RawSnapshot,
  identity: AuditIdentity
): ExtractionResult {
  // Extract HTML signals (per-page SEO data)
  const htmlSamples = raw.htmlSamples?.data?.samples || [];
  const pageSignals = extractHtmlSignals(htmlSamples);

  // Extract schema data
  const schemaSummary = extractSchema(htmlSamples);

  // Extract links
  const linksSummary = extractLinks(htmlSamples);

  // Extract images
  const imagesSummary = extractImages(htmlSamples);

  // Extract security headers
  const rootFetchData = raw.rootFetch?.data || null;
  const redirectMapData = raw.redirectMap?.data || null;
  const securityHeadersResult = extractSecurityHeaders(rootFetchData, redirectMapData);

  // Extract infrastructure signals
  const tlsFactsData = raw.tlsFacts?.data || null;
  const dnsFactsData = raw.dnsFacts?.data || null;
  const infraResult = extractInfra(tlsFactsData, dnsFactsData, redirectMapData);

  // Extract performance signals
  const lighthouseData = raw.lighthouse?.data || null;
  const perfResult = extractPerf(lighthouseData);

  // Extract coverage and limitations
  const coverageResult = extractCoverage(raw);

  // Extract URL templates
  const sitemapsData = raw.sitemaps?.data || null;
  const urlsetResult = extractUrlset(htmlSamples, sitemapsData);

  // Build UrlTemplate array for SiteSnapshot
  const urlTemplates: UrlTemplate[] = urlsetResult.templates.map(t => ({
    pattern: t.pattern,
    example: t.sampleUrls[0] || "",
    count: t.count,
    sampleUrls: t.sampleUrls,
  }));

  // Build SiteWideSignals
  const siteWideSignals = {
    securityHeaders: securityHeadersResult.headers,
    httpsEnforced: infraResult.httpsEnforced,
    hostConsistency: infraResult.hostConsistency,
    wwwPreference: infraResult.wwwPreference,
    robotsTxtValid: isRobotsTxtValid(raw),
    robotsBlockingCount: coverageResult.blockedByRobots.length,
    sitemapCount: coverageResult.sitemapsProcessed,
    totalUrls: urlsetResult.allUrls.length,
    uniqueUrls: new Set(urlsetResult.allUrls).size,
    templatePatterns: urlsetResult.templates.map(t => t.pattern),
  };

  // Build CoverageLimitations
  const coverageLimitations = {
    pagesSampled: coverageResult.pagesSampled,
    pagesTotal: coverageResult.pagesTotal,
    sitemapsProcessed: coverageResult.sitemapsProcessed,
    sitemapsFailed: coverageResult.sitemapsFailed,
    dnsResolved: coverageResult.dnsResolved,
    tlsVerified: coverageResult.tlsVerified,
    lighthouseRun: coverageResult.lighthouseRun,
    screenshotsCaptured: coverageResult.screenshotsCaptured,
    serpChecked: coverageResult.serpChecked,
    squirrelscanRun: coverageResult.squirrelscanRun,
    blockedByRobots: coverageResult.blockedByRobots,
    fetchErrors: coverageResult.fetchErrors,
    timeoutUrls: coverageResult.timeoutUrls,
    oversizedUrls: coverageResult.oversizedUrls,
  };

  // Build SiteSnapshot
  const siteSnapshot: SiteSnapshot = {
    identity,
    urlSet: {
      all: urlsetResult.allUrls,
      templates: urlTemplates,
    },
    pages: pageSignals,
    siteWide: siteWideSignals,
    coverage: coverageLimitations,
    collectedAt: new Date().toISOString(),
  };

  return {
    siteSnapshot,
    intermediate: {
      schema: schemaSummary,
      links: linksSummary,
      images: imagesSummary,
      securityHeaders: securityHeadersResult,
      infra: infraResult,
      perf: perfResult,
      coverage: coverageResult,
      urlset: urlsetResult,
    },
  };
}

/**
 * Checks if robots.txt is valid.
 */
function isRobotsTxtValid(raw: RawSnapshot): boolean {
  const robotsTxt = raw.robotsTxt?.data;
  if (!robotsTxt) return false;
  
  // Valid if we got a 200 status and some content
  return robotsTxt.status === 200 && robotsTxt.body.length > 0;
}

/**
 * Quick extraction - returns only SiteSnapshot without intermediate data.
 * 
 * @param raw - RawSnapshot from collectors
 * @param identity - Audit identity
 * @returns SiteSnapshot
 */
export function extractSiteSnapshot(
  raw: RawSnapshot,
  identity: AuditIdentity
): SiteSnapshot {
  return extractAll(raw, identity).siteSnapshot;
}

/**
 * Extracts with extended options.
 * Allows selective extraction for performance.
 */
export interface ExtractOptions {
  includeHtmlSignals?: boolean;
  includeSchema?: boolean;
  includeLinks?: boolean;
  includeImages?: boolean;
  includeSecurityHeaders?: boolean;
  includeInfra?: boolean;
  includePerf?: boolean;
  includeCoverage?: boolean;
  includeUrlset?: boolean;
}

/**
 * Extracts selectively based on options.
 * 
 * @param raw - RawSnapshot from collectors
 * @param identity - Audit identity
 * @param options - Extraction options
 * @returns Partial SiteSnapshot with selected data
 */
export function extractSelective(
  raw: RawSnapshot,
  identity: AuditIdentity,
  options: ExtractOptions = {}
): Partial<SiteSnapshot> & { identity: AuditIdentity; collectedAt: string } {
  const htmlSamples = raw.htmlSamples?.data?.samples || [];
  const sitemapsData = raw.sitemaps?.data || null;
  
  // Default all to true if not specified
  const opts = {
    includeHtmlSignals: true,
    includeSchema: true,
    includeLinks: true,
    includeImages: true,
    includeSecurityHeaders: true,
    includeInfra: true,
    includePerf: true,
    includeCoverage: true,
    includeUrlset: true,
    ...options,
  };

  const result: Partial<SiteSnapshot> & { identity: AuditIdentity; collectedAt: string } = {
    identity,
    collectedAt: new Date().toISOString(),
  };

  if (opts.includeHtmlSignals) {
    result.pages = extractHtmlSignals(htmlSamples);
  }

  if (opts.includeUrlset) {
    const urlsetResult = extractUrlset(htmlSamples, sitemapsData);
    result.urlSet = {
      all: urlsetResult.allUrls,
      templates: urlsetResult.templates.map(t => ({
        pattern: t.pattern,
        example: t.sampleUrls[0] || "",
        count: t.count,
        sampleUrls: t.sampleUrls,
      })),
    };
  }

  if (opts.includeCoverage) {
    const coverageResult = extractCoverage(raw);
    result.coverage = {
      pagesSampled: coverageResult.pagesSampled,
      pagesTotal: coverageResult.pagesTotal,
      sitemapsProcessed: coverageResult.sitemapsProcessed,
      sitemapsFailed: coverageResult.sitemapsFailed,
      dnsResolved: coverageResult.dnsResolved,
      tlsVerified: coverageResult.tlsVerified,
      lighthouseRun: coverageResult.lighthouseRun,
      screenshotsCaptured: coverageResult.screenshotsCaptured,
      serpChecked: coverageResult.serpChecked,
      squirrelscanRun: coverageResult.squirrelscanRun,
      blockedByRobots: coverageResult.blockedByRobots,
      fetchErrors: coverageResult.fetchErrors,
      timeoutUrls: coverageResult.timeoutUrls,
      oversizedUrls: coverageResult.oversizedUrls,
    };
  }

  if (opts.includeSecurityHeaders || opts.includeInfra) {
    const rootFetchData = raw.rootFetch?.data || null;
    const redirectMapData = raw.redirectMap?.data || null;
    const tlsFactsData = raw.tlsFacts?.data || null;
    const dnsFactsData = raw.dnsFacts?.data || null;

    const securityHeaders = opts.includeSecurityHeaders 
      ? extractSecurityHeaders(rootFetchData, redirectMapData)
      : null;
    
    const infra = opts.includeInfra 
      ? extractInfra(tlsFactsData, dnsFactsData, redirectMapData)
      : null;

    if (securityHeaders || infra) {
      result.siteWide = {
        securityHeaders: securityHeaders?.headers || {},
        httpsEnforced: infra?.httpsEnforced || { state: "unknown", reason: "Not extracted" },
        hostConsistency: infra?.hostConsistency || { state: "unknown", reason: "Not extracted" },
        wwwPreference: infra?.wwwPreference || { state: "unknown", reason: "Not extracted" },
        robotsTxtValid: isRobotsTxtValid(raw),
        robotsBlockingCount: 0,
        sitemapCount: sitemapsData ? 1 : 0,
        totalUrls: result.urlSet?.all.length || 0,
        uniqueUrls: new Set(result.urlSet?.all).size || 0,
        templatePatterns: result.urlSet?.templates.map(t => t.pattern) || [],
      };
    }
  }

  return result;
}

// Re-export all extractor functions for convenience
export {
  extractHtmlSignals,
  extractSchema,
  extractLinks,
  extractImages,
  extractSecurityHeaders,
  extractInfra,
  extractPerf,
  extractCoverage,
  extractUrlset,
  getUnknownRates,
};

// Re-export types
export type {
  SchemaSummary,
  LinksSummary,
  ImagesSummary,
  SecurityHeadersResult,
  InfraResult,
  PerfResult,
  CoverageResult,
  UrlsetResult,
};
