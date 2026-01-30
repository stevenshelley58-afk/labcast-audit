/**
 * PageSpeed Insights Collector
 *
 * Integrates with Google's PageSpeed Insights API to fetch Core Web Vitals
 * and performance opportunities.
 */

// ============================================================================
// Types
// ============================================================================

export interface CoreWebVitals {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** Interaction to Next Paint (ms) - formerly FID */
  inp: number | null;
  /** Cumulative Layout Shift (score) */
  cls: number | null;
  /** Time to First Byte (ms) */
  ttfb: number | null;
  /** First Contentful Paint (ms) */
  fcp: number | null;
  /** Speed Index (ms) */
  speedIndex: number | null;
  /** Total Blocking Time (ms) */
  tbt: number | null;
}

export interface PerformanceOpportunity {
  /** Opportunity ID */
  id: string;
  /** Human-readable title */
  title: string;
  /** Description of the opportunity */
  description: string;
  /** Estimated savings in ms */
  savingsMs?: number;
  /** Estimated savings in bytes */
  savingsBytes?: number;
  /** Score (0-1) */
  score: number | null;
}

export interface PageSpeedResult {
  /** Core Web Vitals metrics */
  coreWebVitals: CoreWebVitals;
  /** Performance score (0-100) */
  performanceScore: number | null;
  /** Accessibility score (0-100) */
  accessibilityScore: number | null;
  /** Best Practices score (0-100) */
  bestPracticesScore: number | null;
  /** SEO score (0-100) */
  seoScore: number | null;
  /** List of performance opportunities */
  opportunities: PerformanceOpportunity[];
  /** List of passed audits */
  passedAudits: string[];
  /** Whether using field data (CrUX) or lab data */
  dataSource: 'field' | 'lab' | 'unavailable';
  /** Fetch timestamp */
  fetchedAt: string;
  /** Any errors */
  error?: string;
}

// ============================================================================
// PSI API Response Types
// ============================================================================

interface PSIAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  numericValue?: number;
  numericUnit?: string;
  details?: {
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: unknown[];
  };
}

interface PSICategory {
  score: number | null;
  auditRefs: Array<{ id: string; weight: number }>;
}

interface PSILighthouseResult {
  categories: {
    performance?: PSICategory;
    accessibility?: PSICategory;
    'best-practices'?: PSICategory;
    seo?: PSICategory;
  };
  audits: Record<string, PSIAudit>;
}

interface PSILoadingExperience {
  metrics?: {
    LARGEST_CONTENTFUL_PAINT_MS?: { percentile: number };
    INTERACTION_TO_NEXT_PAINT?: { percentile: number };
    CUMULATIVE_LAYOUT_SHIFT_SCORE?: { percentile: number };
    EXPERIMENTAL_TIME_TO_FIRST_BYTE?: { percentile: number };
    FIRST_CONTENTFUL_PAINT_MS?: { percentile: number };
  };
  origin_fallback?: boolean;
}

interface PSIResponse {
  lighthouseResult?: PSILighthouseResult;
  loadingExperience?: PSILoadingExperience;
  originLoadingExperience?: PSILoadingExperience;
  error?: {
    message: string;
    code: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// Opportunity audit IDs to extract
const OPPORTUNITY_AUDITS = [
  'render-blocking-resources',
  'unused-css-rules',
  'unused-javascript',
  'modern-image-formats',
  'offscreen-images',
  'unminified-css',
  'unminified-javascript',
  'efficient-animated-content',
  'duplicated-javascript',
  'legacy-javascript',
  'uses-responsive-images',
  'uses-optimized-images',
  'uses-text-compression',
  'uses-rel-preconnect',
  'server-response-time',
  'redirects',
  'uses-http2',
  'dom-size',
  'critical-request-chains',
  'font-display',
  'total-byte-weight',
  'third-party-summary',
  'bootup-time',
  'mainthread-work-breakdown',
];

// ============================================================================
// Main Collector
// ============================================================================

/**
 * Fetch PageSpeed Insights data for a URL
 */
export async function collectPageSpeed(
  url: string,
  apiKey?: string,
  timeout: number = 60000
): Promise<PageSpeedResult> {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build API URL
    const params = new URLSearchParams({
      url,
      strategy: 'mobile',
      category: 'performance',
      category_: 'accessibility',
      category__: 'best-practices',
      category___: 'seo',
    });

    // Note: PSI API accepts multiple category params but URLSearchParams dedups
    // So we build the URL manually
    let apiUrl = `${PSI_API_URL}?url=${encodeURIComponent(url)}&strategy=mobile`;
    apiUrl += '&category=performance&category=accessibility&category=best-practices&category=seo';

    if (apiKey) {
      apiUrl += `&key=${apiKey}`;
    }

    const response = await fetch(apiUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `PSI API error: ${response.status} - ${errorData.error?.message || response.statusText}`
      );
    }

    const data: PSIResponse = await response.json();

    if (data.error) {
      throw new Error(`PSI API error: ${data.error.message}`);
    }

    return parsePSIResponse(data, fetchedAt);
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err instanceof Error ? err.message : String(err);

    return {
      coreWebVitals: {
        lcp: null,
        inp: null,
        cls: null,
        ttfb: null,
        fcp: null,
        speedIndex: null,
        tbt: null,
      },
      performanceScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      seoScore: null,
      opportunities: [],
      passedAudits: [],
      dataSource: 'unavailable',
      fetchedAt,
      error: error.includes('abort') ? 'Timeout' : error,
    };
  }
}

/**
 * Parse PSI API response into our format
 */
function parsePSIResponse(data: PSIResponse, fetchedAt: string): PageSpeedResult {
  const lighthouse = data.lighthouseResult;
  const fieldData = data.loadingExperience || data.originLoadingExperience;

  // Determine data source
  let dataSource: 'field' | 'lab' | 'unavailable' = 'unavailable';
  if (fieldData?.metrics && Object.keys(fieldData.metrics).length > 0) {
    dataSource = 'field';
  } else if (lighthouse?.audits) {
    dataSource = 'lab';
  }

  // Extract Core Web Vitals
  const coreWebVitals = extractCoreWebVitals(lighthouse, fieldData);

  // Extract scores
  const performanceScore = lighthouse?.categories?.performance?.score
    ? Math.round(lighthouse.categories.performance.score * 100)
    : null;
  const accessibilityScore = lighthouse?.categories?.accessibility?.score
    ? Math.round(lighthouse.categories.accessibility.score * 100)
    : null;
  const bestPracticesScore = lighthouse?.categories?.['best-practices']?.score
    ? Math.round(lighthouse.categories['best-practices'].score * 100)
    : null;
  const seoScore = lighthouse?.categories?.seo?.score
    ? Math.round(lighthouse.categories.seo.score * 100)
    : null;

  // Extract opportunities
  const opportunities = extractOpportunities(lighthouse?.audits || {});

  // Extract passed audits
  const passedAudits = extractPassedAudits(lighthouse?.audits || {});

  return {
    coreWebVitals,
    performanceScore,
    accessibilityScore,
    bestPracticesScore,
    seoScore,
    opportunities,
    passedAudits,
    dataSource,
    fetchedAt,
  };
}

/**
 * Extract Core Web Vitals from PSI response
 */
function extractCoreWebVitals(
  lighthouse?: PSILighthouseResult,
  fieldData?: PSILoadingExperience
): CoreWebVitals {
  const cwv: CoreWebVitals = {
    lcp: null,
    inp: null,
    cls: null,
    ttfb: null,
    fcp: null,
    speedIndex: null,
    tbt: null,
  };

  // Prefer field data (CrUX) if available
  if (fieldData?.metrics) {
    const metrics = fieldData.metrics;
    cwv.lcp = metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null;
    cwv.inp = metrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null;
    cwv.cls = metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile
      ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 // CLS is reported as score * 100
      : null;
    cwv.ttfb = metrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile ?? null;
    cwv.fcp = metrics.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? null;
  }

  // Fall back to lab data from Lighthouse
  if (lighthouse?.audits) {
    const audits = lighthouse.audits;

    if (cwv.lcp === null && audits['largest-contentful-paint']?.numericValue) {
      cwv.lcp = Math.round(audits['largest-contentful-paint'].numericValue);
    }
    if (cwv.cls === null && audits['cumulative-layout-shift']?.numericValue !== undefined) {
      cwv.cls = audits['cumulative-layout-shift'].numericValue;
    }
    if (cwv.fcp === null && audits['first-contentful-paint']?.numericValue) {
      cwv.fcp = Math.round(audits['first-contentful-paint'].numericValue);
    }
    if (cwv.speedIndex === null && audits['speed-index']?.numericValue) {
      cwv.speedIndex = Math.round(audits['speed-index'].numericValue);
    }
    if (cwv.tbt === null && audits['total-blocking-time']?.numericValue) {
      cwv.tbt = Math.round(audits['total-blocking-time'].numericValue);
    }
    if (cwv.ttfb === null && audits['server-response-time']?.numericValue) {
      cwv.ttfb = Math.round(audits['server-response-time'].numericValue);
    }
  }

  return cwv;
}

/**
 * Extract performance opportunities from audits
 */
function extractOpportunities(audits: Record<string, PSIAudit>): PerformanceOpportunity[] {
  const opportunities: PerformanceOpportunity[] = [];

  for (const auditId of OPPORTUNITY_AUDITS) {
    const audit = audits[auditId];
    if (!audit) continue;

    // Only include if there are savings or score < 1
    const hasSavings =
      (audit.details?.overallSavingsMs && audit.details.overallSavingsMs > 0) ||
      (audit.details?.overallSavingsBytes && audit.details.overallSavingsBytes > 0);
    const hasScore = audit.score !== null && audit.score < 0.9;

    if (hasSavings || hasScore) {
      opportunities.push({
        id: audit.id,
        title: audit.title,
        description: audit.description,
        savingsMs: audit.details?.overallSavingsMs,
        savingsBytes: audit.details?.overallSavingsBytes,
        score: audit.score,
      });
    }
  }

  // Sort by savings (highest first)
  opportunities.sort((a, b) => {
    const aSavings = (a.savingsMs || 0) + (a.savingsBytes || 0) / 1000;
    const bSavings = (b.savingsMs || 0) + (b.savingsBytes || 0) / 1000;
    return bSavings - aSavings;
  });

  return opportunities;
}

/**
 * Extract passed audits
 */
function extractPassedAudits(audits: Record<string, PSIAudit>): string[] {
  const passed: string[] = [];

  for (const [id, audit] of Object.entries(audits)) {
    if (audit.score === 1) {
      passed.push(id);
    }
  }

  return passed;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a human-readable rating for a Core Web Vital
 */
export function getCWVRating(
  metric: 'lcp' | 'inp' | 'cls' | 'ttfb' | 'fcp',
  value: number | null
): 'good' | 'needs-improvement' | 'poor' | 'unknown' {
  if (value === null) return 'unknown';

  const thresholds = {
    lcp: { good: 2500, poor: 4000 },
    inp: { good: 200, poor: 500 },
    cls: { good: 0.1, poor: 0.25 },
    ttfb: { good: 800, poor: 1800 },
    fcp: { good: 1800, poor: 3000 },
  };

  const threshold = thresholds[metric];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Format a CWV value for display
 */
export function formatCWVValue(
  metric: 'lcp' | 'inp' | 'cls' | 'ttfb' | 'fcp' | 'speedIndex' | 'tbt',
  value: number | null
): string {
  if (value === null) return 'N/A';

  if (metric === 'cls') {
    return value.toFixed(3);
  }

  // Time-based metrics
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${Math.round(value)}ms`;
}
