/**
 * Robots.txt Collector
 * 
 * Fetches /robots.txt from the root domain and:
 * - Records status, headers, body
 * - Parses for sitemap references (Sitemap: lines)
 */

import type { CollectorOutput, RobotsTxtData } from "../audit.types.js";
import { safeFetch } from "../audit.util.js";
import { TIMEOUT_ROBOTS_TXT } from "../audit.config.js";

/**
 * Extracts sitemap references from robots.txt body.
 * Looks for "Sitemap:" lines (case-insensitive).
 * 
 * @param body - The robots.txt content
 * @returns Array of sitemap URLs
 */
function extractSitemapRefs(body: string): string[] {
  const sitemaps: string[] = [];
  const lines = body.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    // Match "Sitemap:" directive (case-insensitive)
    const match = trimmed.match(/^sitemap:\s*(.+)$/i);
    if (match) {
      const url = match[1].trim();
      if (url) {
        sitemaps.push(url);
      }
    }
  }

  return sitemaps;
}

/**
 * Fetches robots.txt from the root domain.
 * 
 * @param normalizedUrl - The normalized root URL
 * @returns CollectorOutput with RobotsTxtData
 */
export async function collectRobotsTxt(
  normalizedUrl: string
): Promise<CollectorOutput<RobotsTxtData>> {
  try {
    const rootUrl = new URL(normalizedUrl);
    const robotsUrl = `${rootUrl.protocol}//${rootUrl.host}/robots.txt`;

    const result = await safeFetch(robotsUrl, {
      timeout: TIMEOUT_ROBOTS_TXT,
      followRedirects: true,
    });

    if (result.error || !result.data) {
      return {
        data: null,
        error: result.error || "Failed to fetch robots.txt",
      };
    }

    const { status, headers, body } = result.data;

    // Parse sitemap references from body
    const sitemapRefs = extractSitemapRefs(body);

    const data: RobotsTxtData = {
      status,
      headers,
      body,
      sitemapRefs,
    };

    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error fetching robots.txt";
    return {
      data: null,
      error: errorMessage,
    };
  }
}
