/**
 * Lighthouse Collector
 * 
 * Runs Lighthouse performance audit on the homepage with mobile preset.
 * Categories: performance, accessibility, best-practices, seo
 * Returns full JSON report and key metrics summary.
 */

import type { CollectorOutput, LighthouseData } from "../audit.types.js";
import { TIMEOUT_LIGHTHOUSE } from "../audit.config.js";

/**
 * Key Lighthouse metrics for summary.
 */
interface LighthouseSummary {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** Cumulative Layout Shift */
  cls: number | null;
  /** Total Blocking Time (ms) */
  tbt: number | null;
  /** Total page weight in bytes */
  pageWeight: number | null;
  /** Number of network requests */
  numRequests: number | null;
  /** Overall performance score (0-100) */
  performanceScore: number | null;
  /** Accessibility score (0-100) */
  accessibilityScore: number | null;
  /** Best practices score (0-100) */
  bestPracticesScore: number | null;
  /** SEO score (0-100) */
  seoScore: number | null;
}

/**
 * Extended Lighthouse data including summary metrics.
 */
interface LighthouseDataWithSummary extends LighthouseData {
  summary: LighthouseSummary;
}

/**
 * Runs Lighthouse audit on a URL.
 * 
 * @param url - The URL to audit
 * @returns CollectorOutput with full Lighthouse JSON and summary metrics
 */
export async function collectLighthouse(
  url: string
): Promise<CollectorOutput<LighthouseDataWithSummary>> {
  let lighthouse;
  let chromeLauncher;

  try {
    // Dynamically import lighthouse to avoid dependency issues
    lighthouse = await import("lighthouse");
    chromeLauncher = await import("chrome-launcher");
  } catch {
    return {
      data: null,
      error: "Lighthouse not installed. Run: npm install lighthouse chrome-launcher",
    };
  }

  let chrome;

  try {
    // Launch Chrome
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const options = {
      logLevel: "error" as const,
      output: "json" as const,
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      port: chrome.port,
      maxWaitForLoad: TIMEOUT_LIGHTHOUSE,
    };

    // Run Lighthouse with mobile preset
    const runnerResult = await lighthouse.default(url, options, undefined);

    if (!runnerResult) {
      return {
        data: null,
        error: "Lighthouse audit returned no results",
      };
    }

    const { lhr } = runnerResult;

    // Extract summary metrics
    const audits = lhr.audits;
    const categories = lhr.categories;

    const summary: LighthouseSummary = {
      lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      tbt: audits["total-blocking-time"]?.numericValue ?? null,
      pageWeight: audits["total-byte-weight"]?.numericValue ?? null,
      numRequests: audits["network-requests"]?.details?.items?.length ?? null,
      performanceScore: categories["performance"]?.score 
        ? Math.round(categories["performance"].score * 100) 
        : null,
      accessibilityScore: categories["accessibility"]?.score 
        ? Math.round(categories["accessibility"].score * 100) 
        : null,
      bestPracticesScore: categories["best-practices"]?.score 
        ? Math.round(categories["best-practices"].score * 100) 
        : null,
      seoScore: categories["seo"]?.score 
        ? Math.round(categories["seo"].score * 100) 
        : null,
    };

    return {
      data: {
        fullJson: lhr as Record<string, unknown>,
        summary,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      data: null,
      error: `Lighthouse audit failed: ${errorMessage}`,
    };
  } finally {
    if (chrome) {
      await chrome.kill();
    }
  }
}
