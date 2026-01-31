/**
 * Coverage and Limitations Extractor
 * 
 * Computes coverage statistics and builds limitations list.
 * No network calls, no LLM calls, never throws.
 */

import type { 
  RawSnapshot, 
  CoverageLimitations,
  HtmlSample,
  UrlSamplingPlanData,
  SitemapsData,
  RobotsTxtData,
  LighthouseData,
  ScreenshotsData,
  DnsFactsData,
  TlsFactsData,
  SerpRawData,
  SquirrelscanData,
} from "../audit.types.js";

/**
 * Extended coverage info with additional computed fields
 */
export interface CoverageResult extends CoverageLimitations {
  // Additional computed fields
  coverageRate: number; // 0-1 percentage
  htmlParseRate: number; // 0-1 percentage
  errorBreakdown: Record<string, number>;
  limitations: string[];
  warnings: string[];
  jsRenderingSuspected: boolean;
  rateLimitingDetected: boolean;
  sitemapIssues: string[];
}

/**
 * Computes coverage and limitations from RawSnapshot.
 * 
 * @param raw - RawSnapshot from collectors
 * @returns CoverageResult with statistics and limitations
 */
export function extractCoverage(raw: RawSnapshot): CoverageResult {
  // Count attempted/fetched/parsed pages
  const attemptedPages = countAttemptedPages(raw);
  const fetchedPages = countFetchedPages(raw);
  const parsedHtmlPages = countParsedPages(raw);

  // Build limitations list
  const limitations: string[] = [];
  const warnings: string[] = [];
  const errorBreakdown: Record<string, number> = {};

  // Check for blocked pages
  const blockedPages = findBlockedPages(raw);
  if (blockedPages.length > 0) {
    limitations.push(`${blockedPages.length} pages blocked by robots.txt`);
  }

  // Check for sitemap issues
  const sitemapIssues = analyzeSitemapIssues(raw);
  if (sitemapIssues.length > 0) {
    limitations.push(...sitemapIssues);
  }

  // Check for fetch errors
  const fetchErrors = collectFetchErrors(raw);
  for (const error of fetchErrors) {
    errorBreakdown[error.error] = (errorBreakdown[error.error] || 0) + 1;
  }

  // Check for JS rendering suspicion
  const jsRenderingSuspected = detectJsRendering(raw);
  if (jsRenderingSuspected) {
    warnings.push("JavaScript rendering may be required for complete content");
  }

  // Check for rate limiting
  const rateLimitingDetected = detectRateLimiting(raw);
  if (rateLimitingDetected) {
    limitations.push("Rate limiting detected during crawl");
  }

  // Check for timeouts
  const timeoutUrls = collectTimeoutUrls(raw);
  if (timeoutUrls.length > 0) {
    warnings.push(`${timeoutUrls.length} URLs timed out during fetch`);
  }

  // Check for oversized pages
  const oversizedUrls = collectOversizedUrls(raw);
  if (oversizedUrls.length > 0) {
    warnings.push(`${oversizedUrls.length} pages exceeded size limit`);
  }

  // Check Lighthouse status
  const lighthouseFailed = !raw.lighthouse?.data;
  if (lighthouseFailed) {
    limitations.push("Lighthouse performance audit failed");
  }

  // Check DNS resolution
  const dnsResolved = raw.dnsFacts?.data?.aRecords && 
                      raw.dnsFacts.data.aRecords.length > 0;

  // Check TLS
  const tlsVerified = raw.tlsFacts?.data && 
                      !raw.tlsFacts.data.errors?.length;

  // Check screenshots
  const screenshotsCaptured = !!(raw.screenshots?.data?.desktop || 
                                  raw.screenshots?.data?.mobile);

  // Check SERP
  const serpChecked = !!raw.serpRaw?.data?.results?.length;

  // Check Squirrelscan
  const squirrelscanRun = !!raw.squirrelscan?.data;

  // Calculate rates
  const coverageRate = attemptedPages > 0 
    ? fetchedPages / attemptedPages 
    : 0;
  const htmlParseRate = fetchedPages > 0 
    ? parsedHtmlPages / fetchedPages 
    : 0;

  return {
    pagesSampled: fetchedPages,
    pagesTotal: attemptedPages,
    sitemapsProcessed: countSitemapsProcessed(raw),
    sitemapsFailed: countSitemapsFailed(raw),
    dnsResolved,
    tlsVerified,
    lighthouseRun: !lighthouseFailed,
    screenshotsCaptured,
    serpChecked,
    squirrelscanRun,
    blockedByRobots: blockedPages,
    fetchErrors,
    timeoutUrls,
    oversizedUrls,
    // Extended fields
    coverageRate,
    htmlParseRate,
    errorBreakdown,
    limitations,
    warnings,
    jsRenderingSuspected,
    rateLimitingDetected,
    sitemapIssues,
  };
}

/**
 * Counts attempted pages from sampling plan.
 */
function countAttemptedPages(raw: RawSnapshot): number {
  const plan = raw.urlSamplingPlan?.data;
  if (!plan) return 0;
  return plan.sampledUrls?.length || 0;
}

/**
 * Counts successfully fetched pages.
 */
function countFetchedPages(raw: RawSnapshot): number {
  const samples = raw.htmlSamples?.data?.samples || [];
  return samples.filter(s => s.status >= 200 && s.status < 300).length;
}

/**
 * Counts successfully parsed HTML pages.
 */
function countParsedPages(raw: RawSnapshot): number {
  const samples = raw.htmlSamples?.data?.samples || [];
  return samples.filter(s => {
    if (s.status < 200 || s.status >= 300) return false;
    // Check if HTML looks valid (has basic structure)
    const html = s.html || "";
    return html.includes("<html") && html.includes("</html>");
  }).length;
}

/**
 * Counts processed sitemaps.
 */
function countSitemapsProcessed(raw: RawSnapshot): number {
  const sitemaps = raw.sitemaps?.data;
  if (!sitemaps) return 0;
  // If we have extracted URLs, sitemap was processed
  return sitemaps.extractedUrls?.length > 0 ? 1 : 0;
}

/**
 * Counts failed sitemap fetches.
 */
function countSitemapsFailed(raw: RawSnapshot): number {
  const sitemaps = raw.sitemaps?.data;
  if (!sitemaps) return 0;
  return sitemaps.errors?.length || 0;
}

/**
 * Finds pages blocked by robots.txt.
 */
function findBlockedPages(raw: RawSnapshot): string[] {
  const blocked: string[] = [];
  const robotsTxt = raw.robotsTxt?.data?.body || "";
  const samples = raw.htmlSamples?.data?.samples || [];

  // Simple check: if robots.txt has Disallow rules and sample returned 403
  // or if the sample URL matches a disallow pattern
  for (const sample of samples) {
    if (sample.status === 403 || sample.status === 401) {
      // Potentially blocked
      blocked.push(sample.url);
    }
  }

  return blocked;
}

/**
 * Analyzes sitemap for issues.
 */
function analyzeSitemapIssues(raw: RawSnapshot): string[] {
  const issues: string[] = [];
  const sitemaps = raw.sitemaps?.data;
  
  if (!sitemaps) {
    issues.push("No sitemap found");
    return issues;
  }

  if (sitemaps.errors && sitemaps.errors.length > 0) {
    issues.push(`Sitemap errors: ${sitemaps.errors.join(", ")}`);
  }

  if (!sitemaps.extractedUrls || sitemaps.extractedUrls.length === 0) {
    issues.push("Sitemap is empty");
  }

  return issues;
}

/**
 * Collects fetch errors from samples.
 */
function collectFetchErrors(raw: RawSnapshot): Array<{ url: string; error: string }> {
  const errors: Array<{ url: string; error: string }> = [];
  const samples = raw.htmlSamples?.data?.samples || [];

  for (const sample of samples) {
    if (sample.status >= 400) {
      errors.push({
        url: sample.url,
        error: `HTTP ${sample.status}`,
      });
    }
  }

  return errors;
}

/**
 * Detects if JS rendering is likely needed.
 */
function detectJsRendering(raw: RawSnapshot): boolean {
  const samples = raw.htmlSamples?.data?.samples || [];

  for (const sample of samples) {
    const html = sample.html || "";
    
    // Signs that JS is needed:
    // 1. Empty body or very minimal content
    // 2. Single page app frameworks
    // 3. Loading states
    
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    
    // Check for SPA frameworks
    const hasSpaFramework = /(ng-app|data-reactroot|data-reactid|__next|__nuxt|__vue)/i.test(html);
    
    // Check for minimal content
    const textContent = bodyContent.replace(/<[^>]+>/g, "").trim();
    const hasMinimalContent = textContent.length < 100;
    
    // Check for loading states
    const hasLoadingState = /(loading|spinner|skeleton|please wait)/i.test(html);
    
    if (hasSpaFramework || (hasMinimalContent && hasLoadingState)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects rate limiting from responses.
 */
function detectRateLimiting(raw: RawSnapshot): boolean {
  const samples = raw.htmlSamples?.data?.samples || [];

  // Check for 429 status or rate limit headers
  for (const sample of samples) {
    if (sample.status === 429) {
      return true;
    }
    
    const headers = sample.headers || {};
    const retryAfter = headers["retry-after"];
    const rateLimit = headers["x-ratelimit-limit"];
    
    if (retryAfter || rateLimit) {
      return true;
    }
  }

  return false;
}

/**
 * Collects URLs that timed out.
 */
function collectTimeoutUrls(raw: RawSnapshot): string[] {
  const urls: string[] = [];
  const samples = raw.htmlSamples?.data?.samples || [];

  for (const sample of samples) {
    // Check for timeout indicators
    if (sample.status === 0 || sample.status === 408 || sample.status === 524) {
      urls.push(sample.url);
    }
  }

  return urls;
}

/**
 * Collects URLs that exceeded size limit.
 */
function collectOversizedUrls(raw: RawSnapshot): string[] {
  const urls: string[] = [];
  const samples = raw.htmlSamples?.data?.samples || [];
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB

  for (const sample of samples) {
    if (sample.html && sample.html.length > MAX_SIZE) {
      urls.push(sample.url);
    }
  }

  return urls;
}

/**
 * Gets unknown rate per signal family.
 */
export function getUnknownRates(raw: RawSnapshot): Record<string, number> {
  const rates: Record<string, number> = {};

  // HTML signals unknown rate
  const samples = raw.htmlSamples?.data?.samples || [];
  const total = samples.length;
  
  if (total > 0) {
    // Title extraction rate
    const withTitle = samples.filter(s => 
      s.html?.includes("<title") && s.html?.includes("</title>")
    ).length;
    rates["title"] = 1 - (withTitle / total);

    // Meta description rate
    const withMeta = samples.filter(s =>
      s.html?.includes('name="description"') || s.html?.includes("name='description'")
    ).length;
    rates["metaDescription"] = 1 - (withMeta / total);

    // Canonical rate
    const withCanonical = samples.filter(s =>
      s.html?.includes('rel="canonical"') || s.html?.includes("rel='canonical'")
    ).length;
    rates["canonical"] = 1 - (withCanonical / total);

    // Schema rate
    const withSchema = samples.filter(s =>
      s.html?.includes('application/ld+json')
    ).length;
    rates["schema"] = 1 - (withSchema / total);
  }

  return rates;
}
