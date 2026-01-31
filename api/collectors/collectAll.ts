/**
 * Collector Orchestrator
 * 
 * Orchestrates all collectors in parallel with bounded concurrency.
 * Each collector returns { data, error } - never throw.
 * Returns complete RawSnapshot with all 13 keys.
 * Handles partial failures gracefully.
 */

import type { 
  RawSnapshot, 
  AuditIdentity, 
  UrlSamplingPlanData,
  CollectorOutput,
} from "../audit.types.ts";
import { CONCURRENCY_LIMIT } from "../audit.config.ts";
import { pLimit } from "../audit.util.ts";

// Import all collectors
import { collectRootFetch } from "./fetchRoot.ts";
import { collectRobotsTxt } from "./robots.ts";
import { collectSitemaps } from "./sitemap.ts";
import { collectRedirectMap } from "./redirects.ts";
import { collectHtmlSamples } from "./htmlSample.ts";
import { collectDnsFacts } from "./dns.ts";
import { collectTlsFacts } from "./tls.ts";
import { collectWellKnown } from "./wellKnown.ts";

// Import collectors with external dependencies
import { collectScreenshots } from "./screenshots.ts";
import { collectLighthouse } from "./lighthouse.ts";
import { collectSerp } from "./serp.ts";
import { collectSquirrelscan } from "./squirrelscan.ts";

/**
 * Generates a URL sampling plan based on sitemap URLs.
 * Simple implementation: takes first MAX_PAGES URLs.
 * 
 * @param extractedUrls - URLs extracted from sitemaps
 * @param maxPages - Maximum pages to sample
 * @returns UrlSamplingPlanData
 */
function generateSamplingPlan(extractedUrls: string[], maxPages: number): UrlSamplingPlanData {
  const sampledUrls = extractedUrls.slice(0, maxPages);
  
  // Simple pattern grouping by path segments
  const patternGroups: UrlSamplingPlanData["patternGroups"] = [];
  const patternMap = new Map<string, string[]>();
  
  for (const url of sampledUrls) {
    try {
      const parsed = new URL(url);
      // Create pattern from path (e.g., /products/123 -> /products/*)
      const segments = parsed.pathname.split("/").filter(Boolean);
      const pattern = segments.length > 0 
        ? "/" + segments[0] + "/*"
        : "/";
      
      if (!patternMap.has(pattern)) {
        patternMap.set(pattern, []);
      }
      patternMap.get(pattern)!.push(url);
    } catch {
      // Invalid URL, skip
    }
  }
  
  for (const [pattern, urls] of patternMap) {
    patternGroups.push({
      pattern,
      urls,
      sampleSize: urls.length,
    });
  }
  
  return {
    sampledUrls,
    patternGroups,
  };
}

/**
 * Runs all collectors and returns a complete RawSnapshot.
 * 
 * @param identity - The audit identity
 * @returns RawSnapshot with all 13 collector outputs
 */
export async function collectAll(identity: AuditIdentity): Promise<RawSnapshot> {
  const { normalizedUrl } = identity;
  const limit = pLimit(CONCURRENCY_LIMIT);

  // Step 1: Collect independent collectors first
  const [
    rootFetchResult,
    robotsTxtResult,
    redirectMapResult,
    dnsFactsResult,
    tlsFactsResult,
    wellKnownResult,
    screenshotsResult,
    lighthouseResult,
    serpResult,
    squirrelscanResult,
  ] = await Promise.all([
    limit(() => collectRootFetch(normalizedUrl)),
    limit(() => collectRobotsTxt(normalizedUrl)),
    limit(() => collectRedirectMap(normalizedUrl)),
    limit(() => collectDnsFacts(normalizedUrl)),
    limit(() => collectTlsFacts(normalizedUrl)),
    limit(() => collectWellKnown(normalizedUrl)),
    limit(() => collectScreenshots(normalizedUrl)),
    limit(() => collectLighthouse(normalizedUrl)),
    limit(() => collectSerp(normalizedUrl)),
    limit(() => collectSquirrelscan(normalizedUrl)),
  ]);

  // Step 2: Collect sitemaps (depends on robots.txt sitemap references)
  const robotsSitemapRefs = robotsTxtResult.data?.sitemapRefs || [];
  const sitemapsResult = await limit(() => 
    collectSitemaps(normalizedUrl, robotsSitemapRefs)
  );

  // Step 3: Generate URL sampling plan (depends on sitemaps)
  const extractedUrls = sitemapsResult.data?.extractedUrls || [];
  const samplingPlan: CollectorOutput<UrlSamplingPlanData> = {
    data: generateSamplingPlan(extractedUrls, 50),
    error: null,
  };

  // Step 4: Collect HTML samples (depends on sampling plan)
  const sampledUrls = samplingPlan.data?.sampledUrls || [];
  const htmlSamplesResult = await limit(() => 
    collectHtmlSamples(sampledUrls)
  );

  // Build complete RawSnapshot
  const snapshot: RawSnapshot = {
    rootFetch: rootFetchResult,
    robotsTxt: robotsTxtResult,
    sitemaps: sitemapsResult,
    urlSamplingPlan: samplingPlan,
    htmlSamples: htmlSamplesResult,
    redirectMap: redirectMapResult,
    dnsFacts: dnsFactsResult,
    tlsFacts: tlsFactsResult,
    wellKnown: wellKnownResult,
    screenshots: screenshotsResult,
    lighthouse: lighthouseResult,
    serpRaw: serpResult,
    squirrelscan: squirrelscanResult,
  };

  return snapshot;
}

/**
 * Type guard to check if a collector output has data.
 */
export function hasData<T>(output: CollectorOutput<T>): output is { data: T; error: null } {
  return output.data !== null && output.error === null;
}

/**
 * Type guard to check if a collector output has an error.
 */
export function hasError<T>(output: CollectorOutput<T>): output is { data: null; error: string } {
  return output.error !== null;
}
