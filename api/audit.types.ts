/**
 * SEO Audit System - Core Type Definitions
 * 
 * All types follow the 5-stage audit pipeline:
 * Stage 0: Request & Identity
 * Stage 1: RawSnapshot (13 collectors)
 * Stage 2: SiteSnapshot (extracted signals)
 * Stage 3: Audit Findings
 * Stage 4: PublicReport & PrivateFlags
 */

// ============================================================================
// TRI-STATE TYPE
// ============================================================================

/**
 * TriState represents values that may be present, absent, or unknown.
 * Used throughout the audit system for optional/safe access patterns.
 */
export type TriState<T> =
  | { state: "present"; value: T }
  | { state: "absent" }
  | { state: "unknown"; reason?: string };

// ============================================================================
// STAGE 0: REQUEST & IDENTITY
// ============================================================================

/**
 * Initial audit request from user/API
 */
export interface AuditRequest {
  url: string;
}

/**
 * Audit identity - uniquely identifies this audit run
 */
export interface AuditIdentity {
  normalizedUrl: string;
  runId: string; // UUID v4
  cacheKey: string; // SHA256 hash
}

// ============================================================================
// COLLECTOR OUTPUT WRAPPER
// ============================================================================

/**
 * All collector outputs must return this wrapper - never throw
 */
export interface CollectorOutput<T> {
  data: T | null;
  error: string | null;
}

// ============================================================================
// STAGE 1: RAW SNAPSHOT (13 Collectors)
// ============================================================================

/**
 * Root fetch result - initial page fetch with redirect chain
 */
export interface RootFetchData {
  redirectChain: Array<{ url: string; status: number }>;
  finalStatus: number;
  finalHeaders: Record<string, string>;
  html: string;
}

/**
 * robots.txt fetch result
 */
export interface RobotsTxtData {
  status: number;
  headers: Record<string, string>;
  body: string;
  sitemapRefs: string[];
}

/**
 * Sitemap discovery and extraction result
 */
export interface SitemapsData {
  discoveredUrls: string[];
  extractedUrls: string[];
  errors: string[];
}

/**
 * URL sampling plan for deep crawling
 */
export interface UrlSamplingPlanData {
  sampledUrls: string[];
  patternGroups: Array<{
    pattern: string;
    urls: string[];
    sampleSize: number;
  }>;
}

/**
 * HTML sample from a crawled page
 */
export interface HtmlSample {
  url: string;
  status: number;
  headers: Record<string, string>;
  html: string;
}

export interface HtmlSamplesData {
  samples: HtmlSample[];
}

/**
 * Redirect map for all host variants
 */
export interface RedirectChain {
  chain: Array<{ url: string; status: number }>;
  finalUrl: string;
}

export interface RedirectMapData {
  httpRoot: RedirectChain;
  httpsRoot: RedirectChain;
  httpsWww: RedirectChain;
  httpWww: RedirectChain;
}

/**
 * DNS resolution facts
 */
export interface DnsFactsData {
  aRecords: string[];
  aaaaRecords: string[];
  cnameChain: string[];
  ttl: number;
  errors: string[];
}

/**
 * TLS/SSL certificate facts
 */
export interface TlsFactsData {
  protocol: string;
  certIssuer: string;
  expiryDate: string;
  sans: string[];
  errors: string[];
}

/**
 * Well-known endpoints data
 */
export interface WellKnownEndpoint {
  status: number;
  headers: Record<string, string>;
  bodySnippet: string;
}

export type WellKnownData = Record<string, WellKnownEndpoint>;

/**
 * Screenshot data
 */
export interface ScreenshotsData {
  desktop: string | null; // base64 or URL
  mobile: string | null; // base64 or URL
  finalUrl: string;
  consoleErrors: string[];
}

/**
 * Lighthouse performance audit data
 */
export interface LighthouseData {
  fullJson: Record<string, unknown>;
}

/**
 * SERP (Search Engine Results Page) data
 */
export interface SerpRawData {
  query: string;
  results: Array<{
    position: number;
    title: string;
    url: string;
    snippet: string;
  }>;
}

/**
 * Squirrelscan security scan data
 */
export interface SquirrelscanData {
  output: Record<string, unknown>;
}

/**
 * Stage 1: RawSnapshot - all collector outputs
 */
export interface RawSnapshot {
  rootFetch: CollectorOutput<RootFetchData>;
  robotsTxt: CollectorOutput<RobotsTxtData>;
  sitemaps: CollectorOutput<SitemapsData>;
  urlSamplingPlan: CollectorOutput<UrlSamplingPlanData>;
  htmlSamples: CollectorOutput<HtmlSamplesData>;
  redirectMap: CollectorOutput<RedirectMapData>;
  dnsFacts: CollectorOutput<DnsFactsData>;
  tlsFacts: CollectorOutput<TlsFactsData>;
  wellKnown: CollectorOutput<WellKnownData>;
  screenshots: CollectorOutput<ScreenshotsData>;
  lighthouse: CollectorOutput<LighthouseData>;
  serpRaw: CollectorOutput<SerpRawData>;
  squirrelscan: CollectorOutput<SquirrelscanData>;
}

// ============================================================================
// STAGE 2: SITE SNAPSHOT (Extracted Signals)
// ============================================================================

/**
 * Per-page SEO signals extracted from HTML
 */
export interface PageSignals {
  url: string;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonical: string | null;
  canonicalSelf: boolean;
  h1: string | null;
  h1Count: number;
  headings: {
    h2: string[];
    h3: string[];
    h4: string[];
    h5: string[];
    h6: string[];
  };
  schema: Array<{
    type: string;
    jsonLd: Record<string, unknown>;
    valid: boolean;
    errors?: string[];
  }>;
  images: Array<{
    src: string;
    alt: string | null;
    width: number | null;
    height: number | null;
    size: number | null;
  }>;
  links: {
    internal: Array<{ url: string; text: string; nofollow: boolean }>;
    external: Array<{ url: string; text: string; nofollow: boolean }>;
    broken: string[];
  };
  mixedContent: boolean;
  hasViewport: boolean;
  hasLang: boolean;
  hasCharset: boolean;
  wordCount: number;
}

/**
 * Security headers tri-state map
 */
export type SecurityHeadersMap = {
  [header: string]: TriState<string>;
};

/**
 * Site-wide infrastructure signals
 */
export interface SiteWideSignals {
  securityHeaders: SecurityHeadersMap;
  httpsEnforced: TriState<boolean>;
  hostConsistency: TriState<boolean>;
  wwwPreference: TriState<"www" | "non-www">;
  robotsTxtValid: boolean;
  robotsBlockingCount: number;
  sitemapCount: number;
  totalUrls: number;
  uniqueUrls: number;
  templatePatterns: string[];
}

/**
 * Coverage and limitations tracking
 */
export interface CoverageLimitations {
  pagesSampled: number;
  pagesTotal: number;
  sitemapsProcessed: number;
  sitemapsFailed: number;
  dnsResolved: boolean;
  tlsVerified: boolean;
  lighthouseRun: boolean;
  screenshotsCaptured: boolean;
  serpChecked: boolean;
  squirrelscanRun: boolean;
  blockedByRobots: string[];
  fetchErrors: Array<{ url: string; error: string }>;
  timeoutUrls: string[];
  oversizedUrls: string[];
}

/**
 * URL template for grouping similar URLs
 */
export interface UrlTemplate {
  pattern: string;
  example: string;
  count: number;
  sampleUrls: string[];
}

/**
 * Stage 2: SiteSnapshot - extracted and normalized signals
 */
export interface SiteSnapshot {
  identity: AuditIdentity;
  urlSet: {
    all: string[];
    templates: UrlTemplate[];
  };
  pages: PageSignals[];
  siteWide: SiteWideSignals;
  coverage: CoverageLimitations;
  collectedAt: string; // ISO timestamp
}

// ============================================================================
// STAGE 3: AUDIT FINDINGS
// ============================================================================

/**
 * Severity levels for audit findings
 */
export type Severity = "critical" | "warning" | "info" | "pass";

/**
 * Finding types by category
 */
export type FindingType =
  // Crawl findings
  | "crawl_robots_blocked"
  | "crawl_sitemap_missing"
  | "crawl_sitemap_empty"
  | "crawl_unreachable"
  | "crawl_timeout"
  // Technical findings
  | "tech_missing_title"
  | "tech_duplicate_title"
  | "tech_title_too_long"
  | "tech_title_too_short"
  | "tech_missing_meta_desc"
  | "tech_duplicate_meta_desc"
  | "tech_meta_desc_too_long"
  | "tech_missing_canonical"
  | "tech_canonical_mismatch"
  | "tech_missing_h1"
  | "tech_multiple_h1"
  | "tech_broken_links"
  | "tech_missing_viewport"
  | "tech_missing_lang"
  | "tech_missing_charset"
  // Security findings
  | "sec_missing_https"
  | "sec_mixed_content"
  | "sec_missing_hsts"
  | "sec_missing_csp"
  | "sec_missing_xframe"
  | "sec_expired_cert"
  | "sec_weak_tls"
  // Performance findings
  | "perf_slow_ttfb"
  | "perf_large_html"
  | "perf_unoptimized_images"
  | "perf_render_blocking"
  | "perf_poor_cls"
  | "perf_poor_lcp"
  | "perf_poor_fid"
  // Visual findings
  | "visual_mobile_unfriendly"
  | "visual_text_too_small"
  | "visual_elements_too_close"
  | "visual_viewport_issues"
  // SERP findings
  | "serp_not_indexed"
  | "serp_wrong_page_ranking"
  | "serp_title_mismatch"
  | "serp_description_mismatch";

/**
 * Individual audit finding
 */
export interface AuditFinding {
  type: FindingType;
  severity: Severity;
  message: string;
  evidence: Record<string, unknown>;
  affectedUrls?: string[];
}

/**
 * Audit findings grouped by category
 */
export interface AuditFindings {
  crawl: AuditFinding[];
  technical: AuditFinding[];
  security: AuditFinding[];
  performance: AuditFinding[];
  visual: AuditFinding[];
  serp: AuditFinding[];
}

// ============================================================================
// STAGE 4: PUBLIC REPORT & PRIVATE FLAGS
// ============================================================================

/**
 * Executive summary for public report
 */
export interface ExecutiveSummary {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  headline: string;
  overview: string;
  keyStrengths: string[];
  keyIssues: string[];
  urgency: "immediate" | "high" | "medium" | "low";
}

/**
 * Priority item in action plan
 */
export interface PriorityItem {
  rank: number;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  affectedUrls?: string[];
  estimatedTrafficImpact?: string;
}

/**
 * Category summary for public report
 */
export interface CategorySummary {
  name: string;
  score: number;
  findings: AuditFinding[];
  summary: string;
}

/**
 * Stage 4: PublicReport - client-facing audit results
 */
export interface PublicReport {
  identity: AuditIdentity;
  summary: ExecutiveSummary;
  priorities: PriorityItem[];
  categories: {
    crawl: CategorySummary;
    technical: CategorySummary;
    security: CategorySummary;
    performance: CategorySummary;
    visual: CategorySummary;
    serp: CategorySummary;
  };
  limitations: CoverageLimitations;
  generatedAt: string;
  version: string;
}

/**
 * Internal flag for private review (not shown to clients)
 */
export interface PrivateFlag {
  type: "data_quality" | "confidence" | "tool_failure" | "edge_case";
  severity: "high" | "medium" | "low";
  message: string;
  context: Record<string, unknown>;
}

/**
 * Stage 4: PrivateFlags - internal review data
 */
export interface PrivateFlags {
  flags: PrivateFlag[];
  rawDataQuality: "high" | "medium" | "low";
  confidenceScore: number; // 0-1
  reviewerNotes: string[];
}

// ============================================================================
// FETCH UTILITIES
// ============================================================================

/**
 * Options for safeFetch
 */
export interface FetchOptions {
  timeout?: number;
  maxBytes?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD" | "POST";
}

/**
 * Result from safeFetch - never throws
 */
export interface FetchResult {
  data: {
    url: string;
    status: number;
    headers: Record<string, string>;
    body: string;
    redirectChain: Array<{ url: string; status: number }>;
  } | null;
  error: string | null;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Cache entry with TTL
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Cache keys for different stages
 */
export type CacheKeyType = "rawSnapshot" | "siteSnapshot" | "publicReport" | "privateFlags";
