/**
 * Performance Extractor
 * 
 * Extracts performance signals from Lighthouse data.
 * No network calls, no LLM calls, never throws.
 */

import type { LighthouseData } from "../audit.types.ts";

/**
 * Core Web Vitals and performance metrics
 */
export interface PerformanceMetrics {
  // Core Web Vitals
  lcp: number | null; // Largest Contentful Paint (seconds)
  cls: number | null; // Cumulative Layout Shift
  tbt: number | null; // Total Blocking Time (ms)
  inp: number | null; // Interaction to Next Paint (ms) - proxy
  fid: number | null; // First Input Delay (ms)
  
  // Loading metrics
  fcp: number | null; // First Contentful Paint (seconds)
  ttfb: number | null; // Time to First Byte (seconds)
  speedIndex: number | null; // Speed Index (seconds)
  
  // Resource metrics
  pageWeight: number | null; // Total page weight in bytes
  pageWeightKb: number | null; // Page weight in KB
  numRequests: number | null; // Number of network requests
  numJsRequests: number | null; // Number of JS requests
  numCssRequests: number | null; // Number of CSS requests
  numImageRequests: number | null; // Number of image requests
  
  // Performance score
  performanceScore: number | null; // 0-100
  
  // Category scores
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  pwaScore: number | null;
  
  // Opportunities
  opportunities: Array<{
    title: string;
    savings: string;
    score: number;
  }>;
  
  // Diagnostics
  diagnostics: string[];
}

/**
 * Performance category ratings
 */
export interface PerformanceRatings {
  lcpRating: "good" | "needs-improvement" | "poor" | "unknown";
  clsRating: "good" | "needs-improvement" | "poor" | "unknown";
  tbtRating: "good" | "needs-improvement" | "poor" | "unknown";
  overallRating: "good" | "needs-improvement" | "poor" | "unknown";
}

/**
 * Performance extraction result
 */
export interface PerfResult {
  metrics: PerformanceMetrics;
  ratings: PerformanceRatings;
  hasLighthouseData: boolean;
  lighthouseError: string | null;
}

/**
 * Extracts performance signals from Lighthouse data.
 * 
 * @param lighthouse - Lighthouse audit data
 * @returns PerfResult with metrics and ratings
 */
export function extractPerf(lighthouse: LighthouseData | null): PerfResult {
  if (!lighthouse || !lighthouse.fullJson) {
    return {
      metrics: getEmptyMetrics(),
      ratings: getUnknownRatings(),
      hasLighthouseData: false,
      lighthouseError: "No Lighthouse data available",
    };
  }

  try {
    const json = lighthouse.fullJson;
    const audits = json.audits as Record<string, unknown> || {};
    const categories = json.categories as Record<string, unknown> || {};

    // Extract Core Web Vitals
    const lcp = extractNumericValue(audits["largest-contentful-paint"]);
    const cls = extractNumericValue(audits["cumulative-layout-shift"]);
    const tbt = extractNumericValue(audits["total-blocking-time"]);
    const fid = extractNumericValue(audits["max-potential-fid"]);
    const inp = extractNumericValue(audits["experimental-interaction-to-next-paint"]);
    
    // Extract loading metrics
    const fcp = extractNumericValue(audits["first-contentful-paint"]);
    const ttfb = extractNumericValue(audits["server-response-time"]);
    const speedIndex = extractNumericValue(audits["speed-index"]);
    
    // Extract resource metrics
    const resourceSummary = extractResourceSummary(audits["resource-summary"]);
    let pageWeight = 0;
    let numRequests = 0;
    let numJsRequests = 0;
    let numCssRequests = 0;
    let numImageRequests = 0;
    
    for (const item of resourceSummary) {
      const resourceType = item.resourceType as string;
      const requestCount = (item.requestCount as number) || 0;
      const transferSize = (item.transferSize as number) || 0;
      
      numRequests += requestCount;
      pageWeight += transferSize;
      
      if (resourceType === "script") numJsRequests += requestCount;
      if (resourceType === "stylesheet") numCssRequests += requestCount;
      if (resourceType === "image") numImageRequests += requestCount;
    }
    
    // Extract scores
    const performanceCategory = categories["performance"] as Record<string, unknown> || {};
    const performanceScore = performanceCategory.score ? 
      Math.round((performanceCategory.score as number) * 100) : null;
    
    const accessibilityScore = extractCategoryScore(categories["accessibility"]);
    const bestPracticesScore = extractCategoryScore(categories["best-practices"]);
    const seoScore = extractCategoryScore(categories["seo"]);
    const pwaScore = extractCategoryScore(categories["pwa"]);
    
    // Extract opportunities
    const opportunities: PerformanceMetrics["opportunities"] = [];
    const opportunityIds = [
      "unused-css-rules",
      "unused-javascript",
      "modern-image-formats",
      "efficiently-encode-images",
      "render-blocking-resources",
      "unminified-css",
      "unminified-javascript",
    ];
    
    for (const id of opportunityIds) {
      const audit = audits[id] as Record<string, unknown>;
      if (isScoredAudit(audit) && audit.score < 1) {
        opportunities.push({
          title: (audit.title as string) || id,
          savings: (audit.displayValue as string) || "",
          score: audit.score,
        });
      }
    }
    
    // Extract diagnostics
    const diagnostics: string[] = [];
    const diagnosticIds = [
      "mainthread-work-breakdown",
      "bootup-time",
      "uses-long-cache-ttl",
      "total-byte-weight",
      "dom-size",
    ];
    
    for (const id of diagnosticIds) {
      const audit = audits[id] as Record<string, unknown>;
      if (isScoredAudit(audit) && audit.score < 1) {
        diagnostics.push((audit.title as string) || id);
      }
    }

    const metrics: PerformanceMetrics = {
      lcp,
      cls,
      tbt,
      inp,
      fid,
      fcp,
      ttfb,
      speedIndex,
      pageWeight: pageWeight > 0 ? pageWeight : null,
      pageWeightKb: pageWeight > 0 ? Math.round(pageWeight / 1024) : null,
      numRequests: numRequests > 0 ? numRequests : null,
      numJsRequests: numJsRequests > 0 ? numJsRequests : null,
      numCssRequests: numCssRequests > 0 ? numCssRequests : null,
      numImageRequests: numImageRequests > 0 ? numImageRequests : null,
      performanceScore,
      accessibilityScore,
      bestPracticesScore,
      seoScore,
      pwaScore,
      opportunities,
      diagnostics,
    };

    const ratings = calculateRatings(metrics);

    return {
      metrics,
      ratings,
      hasLighthouseData: true,
      lighthouseError: null,
    };
  } catch (error) {
    return {
      metrics: getEmptyMetrics(),
      ratings: getUnknownRatings(),
      hasLighthouseData: false,
      lighthouseError: error instanceof Error ? error.message : "Unknown error parsing Lighthouse data",
    };
  }
}

/**
 * Extracts numeric value from Lighthouse audit.
 */
function extractNumericValue(audit: unknown): number | null {
  if (!audit || typeof audit !== "object") return null;
  const a = audit as Record<string, unknown>;
  
  if (a.numericValue !== undefined && a.numericValue !== null) {
    return typeof a.numericValue === "number" ? a.numericValue : null;
  }
  
  // Try to parse from displayValue
  if (a.displayValue) {
    const match = String(a.displayValue).match(/[\d.]+/);
    if (match) {
      return parseFloat(match[0]);
    }
  }
  
  return null;
}

/**
 * Extracts category score from Lighthouse category.
 */
function extractCategoryScore(category: unknown): number | null {
  if (!category || typeof category !== "object") return null;
  const c = category as Record<string, unknown>;
  
  if (c.score !== undefined && c.score !== null) {
    return typeof c.score === "number" ? Math.round(c.score * 100) : null;
  }
  
  return null;
}

/**
 * Calculates ratings based on metrics.
 */
function calculateRatings(metrics: PerformanceMetrics): PerformanceRatings {
  // LCP thresholds (seconds)
  // Good: < 2.5s, Needs improvement: < 4s, Poor: >= 4s
  const lcpRating = metrics.lcp === null 
    ? "unknown" 
    : metrics.lcp < 2.5 
      ? "good" 
      : metrics.lcp < 4 
        ? "needs-improvement" 
        : "poor";
  
  // CLS thresholds
  // Good: < 0.1, Needs improvement: < 0.25, Poor: >= 0.25
  const clsRating = metrics.cls === null 
    ? "unknown" 
    : metrics.cls < 0.1 
      ? "good" 
      : metrics.cls < 0.25 
        ? "needs-improvement" 
        : "poor";
  
  // TBT thresholds (ms)
  // Good: < 200ms, Needs improvement: < 600ms, Poor: >= 600ms
  const tbtRating = metrics.tbt === null 
    ? "unknown" 
    : metrics.tbt < 200 
      ? "good" 
      : metrics.tbt < 600 
        ? "needs-improvement" 
        : "poor";
  
  // Overall rating based on worst metric
  const ratings = [lcpRating, clsRating, tbtRating].filter(r => r !== "unknown");
  
  let overallRating: "good" | "needs-improvement" | "poor" | "unknown" = "unknown";
  
  if (ratings.length > 0) {
    if (ratings.includes("poor")) {
      overallRating = "poor";
    } else if (ratings.includes("needs-improvement")) {
      overallRating = "needs-improvement";
    } else {
      overallRating = "good";
    }
  }
  
  return {
    lcpRating,
    clsRating,
    tbtRating,
    overallRating,
  };
}

/**
 * Returns empty metrics object.
 */
function getEmptyMetrics(): PerformanceMetrics {
  return {
    lcp: null,
    cls: null,
    tbt: null,
    inp: null,
    fid: null,
    fcp: null,
    ttfb: null,
    speedIndex: null,
    pageWeight: null,
    pageWeightKb: null,
    numRequests: null,
    numJsRequests: null,
    numCssRequests: null,
    numImageRequests: null,
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    pwaScore: null,
    opportunities: [],
    diagnostics: [],
  };
}

/**
 * Returns unknown ratings object.
 */
function getUnknownRatings(): PerformanceRatings {
  return {
    lcpRating: "unknown",
    clsRating: "unknown",
    tbtRating: "unknown",
    overallRating: "unknown",
  };
}

/**
 * Type guard for scored audits.
 */
function isScoredAudit(audit: unknown): audit is { score: number; title: unknown; displayValue: unknown } {
  return (
    audit !== null &&
    typeof audit === "object" &&
    "score" in audit &&
    typeof (audit as Record<string, unknown>).score === "number"
  );
}

/**
 * Extracts resource summary from audit.
 */
function extractResourceSummary(audit: unknown): Array<Record<string, unknown>> {
  if (!audit || typeof audit !== "object") return [];
  const a = audit as Record<string, unknown>;
  const details = a.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== "object") return [];
  const items = details.items;
  if (!Array.isArray(items)) return [];
  return items as Array<Record<string, unknown>>;
}

/**
 * Helper to check if performance is good enough for Core Web Vitals.
 */
export function passesCoreWebVitals(metrics: PerformanceMetrics): boolean {
  return (
    metrics.lcp !== null && metrics.lcp < 2.5 &&
    metrics.cls !== null && metrics.cls < 0.1 &&
    metrics.tbt !== null && metrics.tbt < 200
  );
}

/**
 * Gets the worst performing metric name.
 */
export function getWorstMetric(metrics: PerformanceMetrics): string | null {
  const scores: Array<{ name: string; value: number | null; threshold: number }> = [
    { name: "LCP", value: metrics.lcp, threshold: 2.5 },
    { name: "CLS", value: metrics.cls, threshold: 0.1 },
    { name: "TBT", value: metrics.tbt, threshold: 200 },
  ];
  
  let worst: { name: string; ratio: number } | null = null;
  
  for (const { name, value, threshold } of scores) {
    if (value !== null) {
      const ratio = value / threshold;
      if (!worst || ratio > worst.ratio) {
        worst = { name, ratio };
      }
    }
  }
  
  return worst?.name || null;
}
