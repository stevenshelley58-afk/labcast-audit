/**
 * Sitemap Collector
 * 
 * Discovers and fetches sitemaps:
 * - Collects candidates from robots.txt sitemap lines
 * - Checks common sitemap paths (/sitemap.xml, /sitemap_index.xml)
 * - Parses sitemap index (supports nested sitemaps)
 * - Parses urlset (supports gzipped sitemaps)
 * - Caps extracted URLs to MAX_SITEMAP_URLS (50k)
 */

import type { CollectorOutput, SitemapsData } from "../audit.types.ts";
import { safeFetch } from "../audit.util.ts";
import { TIMEOUT_SITEMAP, MAX_SITEMAP_URLS } from "../audit.config.ts";

/**
 * Extracts URLs from a sitemap XML body.
 * Handles both urlset and sitemapindex formats.
 * 
 * @param xml - The sitemap XML content
 * @returns Object with urls (from urlset) and sitemapRefs (from sitemapindex)
 */
function parseSitemapXml(xml: string): { urls: string[]; sitemapRefs: string[] } {
  const urls: string[] = [];
  const sitemapRefs: string[] = [];

  try {
    // Check if it's a sitemap index
    const sitemapLocMatches = xml.matchAll(/<sitemap>.*?<loc>(.*?)<\/loc>.*?<\/sitemap>/gs);
    for (const match of sitemapLocMatches) {
      if (match[1]) {
        sitemapRefs.push(match[1].trim());
      }
    }

    // Extract URLs from urlset
    const urlLocMatches = xml.matchAll(/<url>.*?<loc>(.*?)<\/loc>.*?<\/url>/gs);
    for (const match of urlLocMatches) {
      if (match[1]) {
        urls.push(match[1].trim());
      }
    }

    // Also try simple <loc> extraction for malformed sitemaps
    if (urls.length === 0 && sitemapRefs.length === 0) {
      const simpleLocMatches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
      for (const match of simpleLocMatches) {
        if (match[1]) {
          urls.push(match[1].trim());
        }
      }
    }
  } catch {
    // Parsing error - return empty arrays
  }

  return { urls, sitemapRefs };
}

/**
 * Checks if a URL is a gzipped sitemap.
 */
function isGzippedSitemap(url: string): boolean {
  return url.toLowerCase().endsWith(".gz") || url.includes(".xml.gz");
}

/**
 * Decompresses gzipped data (Node.js environment).
 */
async function decompressGzip(data: Uint8Array): Promise<string> {
  const { gunzip } = await import("node:zlib");
  const { promisify } = await import("node:util");
  
  const gunzipAsync = promisify(gunzip);
  const result = await gunzipAsync(data);
  return result.toString("utf-8");
}

/**
 * Fetches a single sitemap (handles both regular and gzipped).
 */
async function fetchSingleSitemap(
  url: string
): Promise<{ urls: string[]; sitemapRefs: string[]; error?: string }> {
  try {
    const result = await safeFetch(url, {
      timeout: TIMEOUT_SITEMAP,
      followRedirects: true,
    });

    if (result.error || !result.data) {
      return { urls: [], sitemapRefs: [], error: result.error || "Fetch failed" };
    }

    const contentType = result.data.headers["content-type"] || "";
    const isGzip = isGzippedSitemap(url) || contentType.includes("gzip");

    let body: string;

    if (isGzip) {
      // For gzipped sitemaps, we need to handle binary data
      // The safeFetch returns string, so we need to re-fetch for binary
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_SITEMAP);
        
        const response = await fetch(url, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const buffer = new Uint8Array(await response.arrayBuffer());
        body = await decompressGzip(buffer);
      } catch (gzipError) {
        const msg = gzipError instanceof Error ? gzipError.message : "Gzip decompression failed";
        return { urls: [], sitemapRefs: [], error: msg };
      }
    } else {
      body = result.data.body;
    }

    const { urls, sitemapRefs } = parseSitemapXml(body);
    return { urls, sitemapRefs };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { urls: [], sitemapRefs: [], error: msg };
  }
}

/**
 * Discovers and fetches all sitemaps for a domain.
 * 
 * @param normalizedUrl - The normalized root URL
 * @param robotsSitemapRefs - Sitemap references from robots.txt
 * @returns CollectorOutput with SitemapsData
 */
export async function collectSitemaps(
  normalizedUrl: string,
  robotsSitemapRefs: string[] = []
): Promise<CollectorOutput<SitemapsData>> {
  const discoveredUrls: string[] = [];
  const extractedUrls: string[] = [];
  const errors: string[] = [];
  const processedSitemaps = new Set<string>();

  try {
    const rootUrl = new URL(normalizedUrl);
    const baseOrigin = `${rootUrl.protocol}//${rootUrl.host}`;

    // Build list of candidate sitemap URLs
    const candidates = new Set<string>(robotsSitemapRefs);
    
    // Add common sitemap paths
    const commonPaths = [
      "/sitemap.xml",
      "/sitemap_index.xml",
      "/sitemap-index.xml",
    ];
    
    for (const path of commonPaths) {
      candidates.add(`${baseOrigin}${path}`);
    }

    // Track discovered URLs
    discoveredUrls.push(...Array.from(candidates));

    // Queue for processing sitemaps (handles nested sitemap indexes)
    const sitemapQueue: string[] = Array.from(candidates);

    while (sitemapQueue.length > 0 && extractedUrls.length < MAX_SITEMAP_URLS) {
      const sitemapUrl = sitemapQueue.shift()!;
      
      if (processedSitemaps.has(sitemapUrl)) {
        continue;
      }
      
      processedSitemaps.add(sitemapUrl);

      const result = await fetchSingleSitemap(sitemapUrl);

      if (result.error) {
        errors.push(`${sitemapUrl}: ${result.error}`);
        continue;
      }

      // Add nested sitemap references to queue
      for (const ref of result.sitemapRefs) {
        if (!processedSitemaps.has(ref)) {
          sitemapQueue.push(ref);
          discoveredUrls.push(ref);
        }
      }

      // Add extracted URLs (respect cap)
      const remainingSlots = MAX_SITEMAP_URLS - extractedUrls.length;
      const urlsToAdd = result.urls.slice(0, remainingSlots);
      extractedUrls.push(...urlsToAdd);

      // If we hit the cap, stop processing
      if (extractedUrls.length >= MAX_SITEMAP_URLS) {
        errors.push(`Reached MAX_SITEMAP_URLS limit (${MAX_SITEMAP_URLS})`);
        break;
      }
    }

    const data: SitemapsData = {
      discoveredUrls: Array.from(new Set(discoveredUrls)),
      extractedUrls,
      errors,
    };

    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error collecting sitemaps";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
