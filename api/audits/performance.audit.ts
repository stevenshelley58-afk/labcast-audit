/**
 * Performance Audit Module
 * 
 * Analyzes Lighthouse performance data to identify CWV issues
 * and optimization opportunities.
 * Produces deterministic findings - no network calls, no LLM calls.
 * Never throws, returns empty array if no findings.
 */

import type { SiteSnapshot, AuditFinding, RawSnapshot } from "../audit.types.js";
import { PERF_THRESHOLD_GOOD, PERF_THRESHOLD_NEEDS_IMPROVEMENT } from "../audit.config.js";

/**
 * Lighthouse metric thresholds (from CWV spec)
 */
const CWV_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },      // ms
  CLS: { good: 0.1, poor: 0.25 },       // unitless
  TBT: { good: 200, poor: 600 },        // ms
  FCP: { good: 1800, poor: 3000 },      // ms
  TTFB: { good: 800, poor: 1800 },      // ms
  INP: { good: 200, poor: 500 },        // ms (experimental)
};

/**
 * Runs performance audit on SiteSnapshot.
 * 
 * @param snapshot - SiteSnapshot from extractors
 * @param raw - RawSnapshot for Lighthouse data access
 * @returns Array of performance findings
 */
export function auditPerformance(snapshot: SiteSnapshot, raw: RawSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  try {
    const lighthouse = raw.lighthouse?.data?.fullJson;
    
    if (!lighthouse) {
      // No Lighthouse data available
      return findings;
    }

    // Check Core Web Vitals
    const cwvFindings = checkCoreWebVitals(lighthouse);
    findings.push(...cwvFindings);

    // Check performance score
    const scoreFindings = checkPerformanceScore(lighthouse);
    findings.push(...scoreFindings);

    // Check for optimization opportunities
    const opportunityFindings = checkOpportunities(lighthouse);
    findings.push(...opportunityFindings);

    // Check for render-blocking resources
    const renderBlockingFindings = checkRenderBlocking(lighthouse);
    findings.push(...renderBlockingFindings);

    // Check image optimization
    const imageFindings = checkImageOptimization(lighthouse);
    findings.push(...imageFindings);

    // Check JS execution
    const jsFindings = checkJavaScriptExecution(lighthouse);
    findings.push(...jsFindings);

    // Check caching
    const cacheFindings = checkCaching(lighthouse);
    findings.push(...cacheFindings);

  } catch {
    // Never throw - return findings collected so far
  }

  return findings;
}

/**
 * Extracts numeric metric value from Lighthouse audit.
 */
function getMetricValue(lighthouse: Record<string, unknown>, metricName: string): number | null {
  try {
    const audits = lighthouse.audits as Record<string, unknown> | undefined;
    if (!audits) return null;

    const metric = audits[metricName] as Record<string, unknown> | undefined;
    if (!metric) return null;

    const numericValue = metric.numericValue;
    if (typeof numericValue === "number") {
      return numericValue;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Gets metric display value.
 */
function getMetricDisplay(lighthouse: Record<string, unknown>, metricName: string): string {
  try {
    const audits = lighthouse.audits as Record<string, unknown> | undefined;
    if (!audits) return "unknown";

    const metric = audits[metricName] as Record<string, unknown> | undefined;
    if (!metric) return "unknown";

    const displayValue = metric.displayValue;
    if (typeof displayValue === "string") {
      return displayValue;
    }

    const numericValue = metric.numericValue;
    if (typeof numericValue === "number") {
      return numericValue.toFixed(2);
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Gets audit score (0-1).
 */
function getAuditScore(lighthouse: Record<string, unknown>, auditName: string): number | null {
  try {
    const audits = lighthouse.audits as Record<string, unknown> | undefined;
    if (!audits) return null;

    const audit = audits[auditName] as Record<string, unknown> | undefined;
    if (!audit) return null;

    const score = audit.score;
    if (typeof score === "number") {
      return score;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Checks Core Web Vitals metrics.
 */
function checkCoreWebVitals(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // LCP - Largest Contentful Paint
  const lcp = getMetricValue(lighthouse, "largest-contentful-paint");
  if (lcp !== null && lcp > CWV_THRESHOLDS.LCP.good) {
    const isPoor = lcp > CWV_THRESHOLDS.LCP.poor;
    findings.push({
      type: "perf_poor_lcp",
      severity: isPoor ? "critical" : "warning",
      message: `Largest Contentful Paint (LCP) is ${getMetricDisplay(lighthouse, "largest-contentful-paint")} (threshold: ${CWV_THRESHOLDS.LCP.good}ms)`,
      evidence: {
        metric: "LCP",
        value: lcp,
        displayValue: getMetricDisplay(lighthouse, "largest-contentful-paint"),
        threshold: CWV_THRESHOLDS.LCP.good,
        status: isPoor ? "poor" : "needs-improvement",
      },
    });
  }

  // CLS - Cumulative Layout Shift
  const cls = getMetricValue(lighthouse, "cumulative-layout-shift");
  if (cls !== null && cls > CWV_THRESHOLDS.CLS.good) {
    const isPoor = cls > CWV_THRESHOLDS.CLS.poor;
    findings.push({
      type: "perf_poor_cls",
      severity: isPoor ? "critical" : "warning",
      message: `Cumulative Layout Shift (CLS) is ${getMetricDisplay(lighthouse, "cumulative-layout-shift")} (threshold: ${CWV_THRESHOLDS.CLS.good})`,
      evidence: {
        metric: "CLS",
        value: cls,
        displayValue: getMetricDisplay(lighthouse, "cumulative-layout-shift"),
        threshold: CWV_THRESHOLDS.CLS.good,
        status: isPoor ? "poor" : "needs-improvement",
      },
    });
  }

  // TBT - Total Blocking Time (proxy for FID)
  const tbt = getMetricValue(lighthouse, "total-blocking-time");
  if (tbt !== null && tbt > CWV_THRESHOLDS.TBT.good) {
    const isPoor = tbt > CWV_THRESHOLDS.TBT.poor;
    findings.push({
      type: "perf_poor_fid",
      severity: isPoor ? "critical" : "warning",
      message: `Total Blocking Time (TBT) is ${getMetricDisplay(lighthouse, "total-blocking-time")} (threshold: ${CWV_THRESHOLDS.TBT.good}ms)`,
      evidence: {
        metric: "TBT",
        value: tbt,
        displayValue: getMetricDisplay(lighthouse, "total-blocking-time"),
        threshold: CWV_THRESHOLDS.TBT.good,
        status: isPoor ? "poor" : "needs-improvement",
      },
    });
  }

  // FCP - First Contentful Paint
  const fcp = getMetricValue(lighthouse, "first-contentful-paint");
  if (fcp !== null && fcp > CWV_THRESHOLDS.FCP.good) {
    findings.push({
      type: "perf_slow_ttfb",
      severity: "info",
      message: `First Contentful Paint (FCP) is ${getMetricDisplay(lighthouse, "first-contentful-paint")}`,
      evidence: {
        metric: "FCP",
        value: fcp,
        displayValue: getMetricDisplay(lighthouse, "first-contentful-paint"),
        threshold: CWV_THRESHOLDS.FCP.good,
      },
    });
  }

  // TTFB - Time to First Byte
  const ttfb = getMetricValue(lighthouse, "server-response-time");
  if (ttfb !== null && ttfb > CWV_THRESHOLDS.TTFB.good) {
    findings.push({
      type: "perf_slow_ttfb",
      severity: "warning",
      message: `Time to First Byte (TTFB) is ${getMetricDisplay(lighthouse, "server-response-time")} (threshold: ${CWV_THRESHOLDS.TTFB.good}ms)`,
      evidence: {
        metric: "TTFB",
        value: ttfb,
        displayValue: getMetricDisplay(lighthouse, "server-response-time"),
        threshold: CWV_THRESHOLDS.TTFB.good,
      },
    });
  }

  return findings;
}

/**
 * Checks overall performance score.
 */
function checkPerformanceScore(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  try {
    const categories = lighthouse.categories as Record<string, unknown> | undefined;
    if (!categories) return findings;

    const performance = categories.performance as Record<string, unknown> | undefined;
    if (!performance) return findings;

    const score = performance.score;
    if (typeof score !== "number") return findings;

    const scorePercent = Math.round(score * 100);

    if (scorePercent < PERF_THRESHOLD_GOOD) {
      const isPoor = scorePercent < PERF_THRESHOLD_NEEDS_IMPROVEMENT;
      findings.push({
        type: "perf_large_html",
        severity: isPoor ? "critical" : "warning",
        message: `Performance score is ${scorePercent}/100`,
        evidence: {
          score: scorePercent,
          threshold: PERF_THRESHOLD_GOOD,
          status: isPoor ? "poor" : "needs-improvement",
        },
      });
    }

  } catch {
    // Skip if data is malformed
  }

  return findings;
}

/**
 * Checks for optimization opportunities.
 */
function checkOpportunities(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const opportunityAudits = [
    { name: "uses-responsive-images", label: "responsive images" },
    { name: "uses-optimized-images", label: "optimized images" },
    { name: "uses-webp-images", label: "WebP images" },
    { name: "uses-text-compression", label: "text compression" },
    { name: "uses-http2", label: "HTTP/2" },
    { name: "efficiently-encode-images", label: "efficient image encoding" },
    { name: "unminified-css", label: "minified CSS" },
    { name: "unminified-javascript", label: "minified JavaScript" },
    { name: "unused-css-rules", label: "unused CSS" },
    { name: "unused-javascript", label: "unused JavaScript" },
    { name: "modern-image-formats", label: "modern image formats" },
    { name: "offscreen-images", label: "lazy-loaded images" },
  ];

  const opportunities: Array<{ label: string; savings?: number; score: number | null }> = [];

  for (const { name, label } of opportunityAudits) {
    const score = getAuditScore(lighthouse, name);
    
    // Score < 1 means there's room for improvement
    if (score !== null && score < 1) {
      const audit = (lighthouse.audits as Record<string, unknown> | undefined)?.[name] as Record<string, unknown> | undefined;
      const numericValue = audit?.numericValue as number | undefined;
      
      opportunities.push({
        label,
        savings: numericValue,
        score,
      });
    }
  }

  if (opportunities.length > 0) {
    // Sort by savings (largest first)
    opportunities.sort((a, b) => (b.savings || 0) - (a.savings || 0));

    const topOpportunities = opportunities.slice(0, 5);
    const totalSavings = topOpportunities.reduce((sum, o) => sum + (o.savings || 0), 0);

    if (totalSavings > 1000) {  // Only report if meaningful savings
      findings.push({
        type: "perf_unoptimized_images",
        severity: "warning",
        message: `${opportunities.length} optimization opportunities identified (potential ${(totalSavings / 1024).toFixed(1)}KB savings)`,
        evidence: {
          opportunityCount: opportunities.length,
          potentialSavingsKB: Math.round(totalSavings / 1024),
          topOpportunities: topOpportunities.map(o => ({
            type: o.label,
            savingsKB: o.savings ? Math.round(o.savings / 1024) : 0,
          })),
        },
      });
    }
  }

  return findings;
}

/**
 * Checks for render-blocking resources.
 */
function checkRenderBlocking(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const score = getAuditScore(lighthouse, "render-blocking-resources");
  if (score !== null && score < 1) {
    const audit = (lighthouse.audits as Record<string, unknown> | undefined)?.["render-blocking-resources"] as Record<string, unknown> | undefined;
    const details = audit?.details as Record<string, unknown> | undefined;
    const items = details?.items as unknown[] | undefined;
    const blockingCount = items?.length || 0;

    if (blockingCount > 0) {
      findings.push({
        type: "perf_render_blocking",
        severity: "warning",
        message: `${blockingCount} render-blocking resources detected`,
        evidence: {
          blockingResourceCount: blockingCount,
          sampleResources: items?.slice(0, 5).map((item: unknown) => {
            const i = item as Record<string, unknown>;
            return {
              url: i.url || "unknown",
              wastedMs: i.wastedMs || 0,
            };
          }),
          recommendation: "Add async/defer attributes or inline critical CSS",
        },
      });
    }
  }

  return findings;
}

/**
 * Checks for image optimization issues.
 */
function checkImageOptimization(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const oversizedScore = getAuditScore(lighthouse, "uses-responsive-images");
  const encodingScore = getAuditScore(lighthouse, "efficiently-encode-images");
  const formatScore = getAuditScore(lighthouse, "modern-image-formats");

  const issues: string[] = [];

  if (oversizedScore !== null && oversizedScore < 1) {
    issues.push("oversized images");
  }
  if (encodingScore !== null && encodingScore < 1) {
    issues.push("inefficient encoding");
  }
  if (formatScore !== null && formatScore < 1) {
    issues.push("legacy formats");
  }

  if (issues.length > 0) {
    findings.push({
      type: "perf_unoptimized_images",
      severity: "warning",
      message: `Image optimization issues: ${issues.join(", ")}`,
      evidence: {
        issues,
        oversizedScore,
        encodingScore,
        formatScore,
        recommendation: "Use responsive images, WebP format, and efficient encoding",
      },
    });
  }

  return findings;
}

/**
 * Checks for JavaScript execution issues.
 */
function checkJavaScriptExecution(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const bootupTime = getMetricValue(lighthouse, "bootup-time");
  const mainthreadWork = getMetricValue(lighthouse, "mainthread-work-breakdown");

  if (bootupTime !== null && bootupTime > 1000) {
    findings.push({
      type: "perf_large_html",
      severity: "warning",
      message: `High JavaScript bootup time (${(bootupTime / 1000).toFixed(2)}s)`,
      evidence: {
        bootupTimeMs: bootupTime,
        threshold: 1000,
        recommendation: "Reduce JS bundle size, code-split, and defer non-critical scripts",
      },
    });
  }

  if (mainthreadWork !== null && mainthreadWork > 3000) {
    findings.push({
      type: "perf_large_html",
      severity: "warning",
      message: `Excessive main thread work (${(mainthreadWork / 1000).toFixed(2)}s)`,
      evidence: {
        mainthreadWorkMs: mainthreadWork,
        threshold: 3000,
        recommendation: "Optimize JS execution and reduce long tasks",
      },
    });
  }

  return findings;
}

/**
 * Checks for caching issues.
 */
function checkCaching(lighthouse: Record<string, unknown>): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const score = getAuditScore(lighthouse, "uses-long-cache-ttl");
  if (score !== null && score < 1) {
    const audit = (lighthouse.audits as Record<string, unknown> | undefined)?.["uses-long-cache-ttl"] as Record<string, unknown> | undefined;
    const details = audit?.details as Record<string, unknown> | undefined;
    const items = details?.items as unknown[] | undefined;
    const uncachedCount = items?.length || 0;

    if (uncachedCount > 0) {
      findings.push({
        type: "perf_large_html",
        severity: "info",
        message: `${uncachedCount} static assets lack efficient cache policies`,
        evidence: {
          uncachedAssetCount: uncachedCount,
          sampleAssets: items?.slice(0, 5).map((item: unknown) => {
            const i = item as Record<string, unknown>;
            return {
              url: i.url || "unknown",
              cacheLifetimeMs: i.cacheLifetimeMs || 0,
            };
          }),
          recommendation: "Set long cache TTLs for static assets",
        },
      });
    }
  }

  return findings;
}
