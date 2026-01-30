/**
 * Parallel Audit Types
 *
 * Core type definitions for the parallel, evidence-based audit architecture.
 * All types support best-effort structure without strict schema locking.
 */

import type { NormalizedUrl } from './url.js';

// ============================================================================
// Core Evidence Types
// ============================================================================

export interface RawEvidence {
  /** Timestamp when evidence was gathered */
  gatheredAt: string;
  /** URL that was audited */
  url: string;
  /** Normalized URL components */
  normalizedUrl: NormalizedUrl;
}

export interface RobotsEvidence extends RawEvidence {
  type: 'robots';
  /** Raw robots.txt content (truncated) */
  content: string;
  /** Error if fetch failed */
  error?: string;
  /** HTTP status or 'timeout' */
  status: string;
}

export interface SitemapEvidence extends RawEvidence {
  type: 'sitemap';
  /** Raw sitemap content (truncated) */
  content: string;
  /** Sitemap URL that was fetched */
  sitemapUrl: string;
  /** Error if fetch failed */
  error?: string;
  /** HTTP status or 'timeout' */
  status: string;
}

export interface HeaderEvidence extends RawEvidence {
  type: 'headers';
  /** Headers from HTTPS HEAD request */
  httpsHeaders: Record<string, string>;
  /** Headers from HTTP HEAD request */
  httpHeaders: Record<string, string>;
  /** Redirect chain observed */
  redirectChain: string[];
  /** Error if fetch failed */
  error?: string;
}

export interface HtmlEvidence extends RawEvidence {
  type: 'html';
  /** Truncated HTML content */
  content: string;
  /** Error if fetch failed */
  error?: string;
  /** HTTP status or 'timeout' */
  status: string;
}

export interface UrlContextEvidence extends RawEvidence {
  type: 'urlContext';
  /** URL that was retrieved */
  retrievedUrl: string;
  /** Retrieval status from Gemini */
  retrievalStatus: string;
  /** Any error during retrieval */
  error?: string;
}

export interface SerpEvidence extends RawEvidence {
  type: 'serp';
  /** Queries executed */
  queries: string[];
  /** Raw SERP results per query */
  results: Record<string, unknown[]>;
  /** Error if search failed */
  error?: string;
}

/** Union type for all evidence types */
export type Evidence =
  | RobotsEvidence
  | SitemapEvidence
  | HeaderEvidence
  | HtmlEvidence
  | UrlContextEvidence
  | SerpEvidence;

// ============================================================================
// Stage A: Signal Gathering Result
// ============================================================================

export interface StageAResult {
  /** Evidence gathered for each signal type */
  evidence: {
    robots?: RobotsEvidence;
    sitemap?: SitemapEvidence;
    headers?: HeaderEvidence;
    html?: HtmlEvidence;
    homepageUrlContext?: UrlContextEvidence;
    serp?: SerpEvidence;
    pdpUrlContext?: UrlContextEvidence;
  };
  /** Timing information for each signal */
  timings: Record<string, number>;
  /** Any errors that occurred during gathering */
  errors: Array<{ source: string; message: string; timestamp: string }>;
  /** Whether gathering completed (some failures acceptable) */
  completed: boolean;
}

// ============================================================================
// Stage B: Analysis Finding
// ============================================================================

export interface RawFinding {
  /** Unique identifier */
  id: string;
  /** Analysis stage that produced this finding */
  stage: 'visual' | 'security' | 'crawl' | 'technical' | 'serp' | 'pdp';
  /** Category for grouping */
  category: 'seo' | 'technical' | 'design' | 'conversion' | 'content' | 'security';
  /** Finding title */
  title: string;
  /** Detailed description */
  description: string;
  /** Evidence supporting this finding */
  evidence: {
    /** Type of evidence */
    type: 'urlContext' | 'html' | 'serp' | 'robots' | 'sitemap' | 'headers';
    /** Quoted evidence text */
    quote: string;
    /** Location/context of evidence */
    location?: string;
  }[];
  /** Impact assessment */
  impact: 'High' | 'Medium' | 'Low';
  /** Why this matters */
  whyItMatters: string;
  /** Suggested fix */
  fix: string;
  /** Priority (1-5, calculated later) */
  priority?: number;
}

export interface StageBResult {
  /** Findings from each analysis type */
  findings: {
    visual?: RawFinding[];
    security?: RawFinding[];
    crawl?: RawFinding[];
    technical?: RawFinding[];
    serp?: RawFinding[];
    pdp?: RawFinding[];
  };
  /** Raw model outputs for debugging */
  rawOutputs: Record<string, string>;
  /** Timing information */
  timings: Record<string, number>;
  /** Any analysis errors */
  errors: Array<{ stage: string; message: string; timestamp: string }>;
  /** Whether analysis completed */
  completed: boolean;
}

// ============================================================================
// Merge Engine Types
// ============================================================================

export interface MergedFinding extends RawFinding {
  /** Source stages that reported similar findings (for deduplication) */
  sources: string[];
  /** Final priority score (1-5) */
  priority: number;
  /** Confidence based on evidence quality */
  confidence: 'high' | 'medium' | 'low';
}

export interface MergeResult {
  /** Deduplicated and normalized findings */
  findings: MergedFinding[];
  /** Findings that were dropped (no evidence) */
  droppedFindings: Array<{ finding: RawFinding; reason: string }>;
  /** Near-duplicates that were merged */
  mergedDuplicates: Array<{ kept: string; merged: string[] }>;
  /** Computed scores */
  scores: {
    overall: number;
    seo: number;
    technical: number;
    design: number;
    conversion: number;
  };
  /** Initial action plan skeleton */
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  /** Gaps in measurement (what we couldn't analyze) */
  measurementGaps: string[];
}

// ============================================================================
// ChatGPT Synthesis Types
// ============================================================================

export interface SynthesisInput {
  /** Merged findings from deterministic merge */
  findings: MergedFinding[];
  /** Scores computed by merge engine */
  scores: MergeResult['scores'];
  /** Action plan skeleton */
  actionPlan: MergeResult['actionPlan'];
  /** What we couldn't measure */
  measurementGaps: string[];
  /** Evidence summaries for context */
  evidenceSummaries: Record<string, string>;
}

export interface SynthesisResult {
  /** Executive summary paragraph */
  executiveSummary: string;
  /** Top issues with narrative explanation */
  topIssues: Array<{
    title: string;
    narrative: string;
    impact: string;
  }>;
  /** Prioritized next steps with rationale */
  nextSteps: Array<{
    action: string;
    rationale: string;
    expectedImpact: string;
  }>;
  /** Whether synthesis completed successfully */
  completed: boolean;
  /** Error if synthesis failed */
  error?: string;
  /** Timing information */
  durationMs: number;
}

// ============================================================================
// Final Report Types
// ============================================================================

export interface ParallelAuditReport {
  /** Overall scores */
  scores: {
    overall: number;
    seo: number;
    technical: number;
    design: number;
    conversion: number;
    security: number;
  };
  /** URL that was audited */
  url: string;
  /** Optional PDP URL */
  pdpUrl?: string;
  /** Executive summary from ChatGPT (or deterministic fallback) */
  summary: string;
  /** All findings (merged and deduplicated) */
  findings: MergedFinding[];
  /** Prioritized action items */
  actionItems: Array<{
    priority: number;
    category: string;
    action: string;
    expectedImpact: string;
  }>;
  /** Top issues narrative */
  topIssues: SynthesisResult['topIssues'];
  /** Generation metadata */
  generatedAt: string;
  /** Whether ChatGPT synthesis was used */
  usedSynthesis: boolean;
  /** Measurement gaps */
  measurementGaps: string[];
}

// ============================================================================
// Progressive Delivery Types
// ============================================================================

export type AuditProgressStage =
  | 'initializing'
  | 'gathering'
  | 'analyzing'
  | 'merging'
  | 'synthesizing'
  | 'complete';

export interface AuditProgressUpdate {
  /** Current stage */
  stage: AuditProgressStage;
  /** Stage-specific progress (0-100) */
  progress: number;
  /** Human-readable status message */
  message: string;
  /** Partial results available so far */
  partialResults?: Partial<ParallelAuditReport>;
  /** Which analyses have completed */
  completedAnalyses: string[];
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Evidence Archive (for debugging and re-runs)
// ============================================================================

export interface EvidenceArchive {
  /** Audit ID */
  id: string;
  /** URL audited */
  url: string;
  /** When audit started */
  startedAt: string;
  /** When audit completed */
  completedAt?: string;
  /** All raw signals gathered */
  rawSignals: StageAResult['evidence'];
  /** All model outputs */
  modelOutputs: {
    gemini: Record<string, string>;
    chatgpt?: string;
    chatgpt_metadata?: string;
  };
  /** Parse status and drops */
  parseStatus: {
    findingsParsed: number;
    findingsDropped: number;
    dropReasons: Record<string, number>;
    parseErrors: string[];
  };
  /** Final report (if completed) */
  finalReport?: ParallelAuditReport;
  /** Any fatal errors */
  errors: Array<{ phase: string; message: string; timestamp: string }>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ParallelAuditConfig {
  /** Timeouts for network operations */
  timeouts: {
    robots: number;
    sitemap: number;
    headers: number;
    html: number;
    urlContext: number;
    serp: number;
  };
  /** Content truncation limits */
  limits: {
    htmlLength: number;
    robotsLength: number;
    sitemapLength: number;
    maxRedirectHops: number;
    maxFindingsPerStage: number;
  };
  /** Gemini model configuration */
  gemini: {
    model: string;
    maxConcurrentCalls: number;
  };
  /** ChatGPT model configuration */
  chatgpt?: {
    model: string;
    enabled: boolean;
    timeout: number;
  };
  /** Whether to enable PDP analysis */
  enablePdp: boolean;
  /** Whether to use progressive delivery */
  progressiveDelivery: boolean;
}

/** Default configuration */
export const DEFAULT_PARALLEL_CONFIG: ParallelAuditConfig = {
  timeouts: {
    robots: 5000,
    sitemap: 5000,
    headers: 5000,
    html: 5000,
    urlContext: 15000,
    serp: 15000,
  },
  limits: {
    htmlLength: 5000,
    robotsLength: 5000,
    sitemapLength: 5000,
    maxRedirectHops: 5,
    maxFindingsPerStage: 10,
  },
  gemini: {
    model: 'gemini-2.0-flash',
    maxConcurrentCalls: 6,
  },
  chatgpt: {
    model: 'gpt-4o',
    enabled: true,
    timeout: 30000,
  },
  enablePdp: false,
  progressiveDelivery: true,
};

// ============================================================================
// Hybrid Audit Types (4-Layer Pipeline)
// ============================================================================

export interface HybridAuditConfig {
  /** Crawl depth for URL sampling */
  crawlDepth: 'surface' | 'shallow' | 'deep';
  /** Visual audit mode */
  visualMode: 'url_context' | 'rendered' | 'both' | 'none';
  /** Enable PageSpeed Insights */
  psiEnabled: boolean;
  /** Security analysis scope */
  securityScope: 'headers_only' | 'full';
  /** Provider configuration */
  providers: {
    gemini: {
      maxConcurrent: number;
    };
    openai: {
      maxConcurrent: number;
    };
  };
  /** Enable codebase analysis */
  enableCodebasePeek: boolean;
  /** Enable PDP analysis */
  enablePdp: boolean;
}

export const DEFAULT_HYBRID_CONFIG: HybridAuditConfig = {
  crawlDepth: 'surface',
  visualMode: 'url_context',
  psiEnabled: true,
  securityScope: 'headers_only',
  providers: {
    gemini: { maxConcurrent: 3 },
    openai: { maxConcurrent: 2 },
  },
  enableCodebasePeek: true,
  enablePdp: true,
};

export interface HybridAuditFinding {
  /** Unique finding ID */
  id: string;
  /** Finding title/observation */
  finding: string;
  /** Evidence supporting this finding */
  evidence: string;
  /** Why this matters */
  whyItMatters: string;
  /** Recommended fix */
  fix: string;
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Category */
  category: 'seo' | 'technical' | 'design' | 'conversion' | 'content' | 'security';
  /** Source audit */
  source: string;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Numeric priority score (1-5) */
  priorityScore: number;
}

export interface HybridAuditScores {
  overall: number;
  technical: number;
  onPage: number;
  content: number;
  performance: number;
  security: number;
  visual: number;
}

export interface HybridAuditReport {
  /** URL audited */
  url: string;
  /** Optional PDP URL */
  pdpUrl?: string;
  /** Calculated scores */
  scores: HybridAuditScores;
  /** Executive summary */
  summary: string;
  /** All merged findings */
  findings: HybridAuditFinding[];
  /** Top issues with narratives */
  topIssues: Array<{
    title: string;
    narrative: string;
    relatedFindings: string[];
    category: string;
  }>;
  /** Prioritized action items */
  actionItems: Array<{
    action: string;
    rationale: string;
    expectedImpact: string;
    effort: string;
    category: string;
  }>;
  /** Action plan buckets */
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  /** Score justifications */
  scoreJustifications: {
    technical: string;
    onPage: string;
    content: string;
    performance: string;
    security: string;
    overall: string;
  };
  /** Measurement gaps */
  explicitGaps: string[];
  /** Generation timestamp */
  generatedAt: string;
  /** Whether synthesis was used */
  usedSynthesis: boolean;
  /** Metadata */
  metadata: {
    totalCost: number;
    totalDurationMs: number;
    layerTimings: {
      layer1: number;
      layer2: number;
      layer3: number;
      layer4: number;
    };
    completedAudits: string[];
    providersUsed: string[];
  };
}

// ============================================================================
// SSE Event Types for Hybrid Audit
// ============================================================================

export type HybridAuditEventType =
  | 'audit:start'
  | 'layer1:start'
  | 'layer1:collector'
  | 'layer1:complete'
  | 'layer2:start'
  | 'layer2:progress'
  | 'layer2:complete'
  | 'layer3:start'
  | 'layer3:audit'
  | 'layer3:finding'
  | 'layer3:complete'
  | 'layer4:start'
  | 'layer4:complete'
  | 'audit:complete'
  | 'audit:error';

export interface HybridAuditEvent {
  type: HybridAuditEventType;
  message?: string;
  data?: unknown;
  timestamp: string;
}
