/**
 * SEO Audit System - Main Pipeline Runner
 *
 * This is the core orchestrator that runs the complete 5-stage audit pipeline:
 * Stage 0: Normalize + Identity
 * Stage 1: Collect (13 collectors)
 * Stage 2: Extract (all extractors)
 * Stage 3: Audits (4 deterministic + 2 LLM audits)
 * Stage 4: Synthesis (3rd LLM call)
 * Stage 5: Output
 *
 * Critical Requirements:
 * - Any URL returns a report, even if blocked
 * - No unhandled exceptions
 * - Same snapshot produces identical deterministic findings
 * - Exactly 3 LLM calls per run (visual, SERP, synthesis)
 * - Public report never contains exploit-enabling details
 * - privateFlags never appear in public report
 * - Coverage and limitations always present
 * - Lighthouse failures do not fail the run
 * - squirrelscan not installed does not fail the run
 */

import type {
  AuditRequest,
  AuditIdentity,
  RawSnapshot,
  SiteSnapshot,
  PublicReport,
  PrivateFlags,
  CoverageLimitations,
  AuditFinding,
  PrivateFlag,
} from "./audit.types.ts";
import {
  normalizeUrl,
  generateRunId,
  computeCacheKey,
} from "./audit.util.ts";
import {
  TOOL_VERSIONS,
  PROMPT_VERSIONS,
  AUDIT_SYSTEM_VERSION,
} from "./audit.config.ts";
import { rawSnapshotCache, siteSnapshotCache } from "./cache/store.ts";
import { collectAll } from "./collectors/collectAll.ts";
import { extractAll } from "./extractors/extractAll.ts";
import { runAllAudits } from "./audits/runAudits.ts";
import { synthesizeReport } from "./synthesis/synthesize.ts";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete audit result returned by runAuditPipeline
 */
export interface AuditResult {
  /** Identity information for this audit run */
  identity: AuditIdentity;
  /** Public-facing report (client-safe) */
  publicReport: PublicReport;
  /** Internal flags for review (never exposed to clients) */
  privateFlags: PrivateFlags;
  /** Coverage and limitations of this audit */
  coverage: CoverageLimitations;
  /** Timing information */
  timings: {
    startedAt: string;
    completedAt: string;
    stageDurations: {
      stage0: number; // Normalize + Identity
      stage1: number; // Collect
      stage2: number; // Extract
      stage3: number; // Audits
      stage4: number; // Synthesis
    };
  };
}

/**
 * Options for running the audit pipeline
 */
export interface RunAuditOptions {
  /** Skip cache and force fresh audit */
  skipCache?: boolean;
}

/**
 * Internal stage timing tracker
 */
interface StageTimer {
  start: number;
  end: number;
  duration: number;
}

// ============================================================================
// MAIN PIPELINE RUNNER
// ============================================================================

/**
 * Runs the complete 5-stage audit pipeline.
 *
 * This is the main entry point for the SEO audit system.
 * It orchestrates all stages from URL normalization to final report synthesis.
 *
 * @param request - The audit request containing the URL to audit
 * @param options - Optional settings (skipCache)
 * @returns Complete audit result with public report and private flags
 * @throws Never throws - all errors are caught and converted to findings
 */
export async function runAuditPipeline(
  request: AuditRequest,
  options: RunAuditOptions = {}
): Promise<AuditResult> {
  const startedAt = new Date().toISOString();
  const stageTimers: Record<string, StageTimer> = {};

  console.log(`[AuditRunner] Starting audit pipeline for: ${request.url}`);

  try {
    // ========================================================================
    // STAGE 0: Normalize + Identity
    // ========================================================================
    stageTimers.stage0 = { start: Date.now(), end: 0, duration: 0 };

    const normalizedUrl = normalizeUrl(request.url);
    const runId = generateRunId();
    const cacheKey = await computeCacheKey(
      normalizedUrl,
      TOOL_VERSIONS,
      PROMPT_VERSIONS
    );

    const identity: AuditIdentity = {
      normalizedUrl,
      runId,
      cacheKey,
    };

    stageTimers.stage0.end = Date.now();
    stageTimers.stage0.duration = stageTimers.stage0.end - stageTimers.stage0.start;

    console.log(`[AuditRunner] Stage 0 complete: ${identity.normalizedUrl} (runId: ${runId})`);

    // ========================================================================
    // STAGE 1: Collect (13 collectors)
    // ========================================================================
    stageTimers.stage1 = { start: Date.now(), end: 0, duration: 0 };

    let rawSnapshot: RawSnapshot;

    // Check cache unless skipCache is true
    if (!options.skipCache) {
      const cachedRaw = rawSnapshotCache.get(cacheKey);
      if (cachedRaw) {
        console.log("[AuditRunner] RawSnapshot cache hit");
        rawSnapshot = cachedRaw;
      } else {
        console.log("[AuditRunner] RawSnapshot cache miss - collecting...");
        rawSnapshot = await collectAll(identity);
        rawSnapshotCache.set(cacheKey, rawSnapshot);
      }
    } else {
      console.log("[AuditRunner] Cache skipped - collecting fresh...");
      rawSnapshot = await collectAll(identity);
      rawSnapshotCache.set(cacheKey, rawSnapshot);
    }

    stageTimers.stage1.end = Date.now();
    stageTimers.stage1.duration = stageTimers.stage1.end - stageTimers.stage1.start;

    console.log(`[AuditRunner] Stage 1 complete: 13 collectors finished`);

    // ========================================================================
    // STAGE 2: Extract (all extractors)
    // ========================================================================
    stageTimers.stage2 = { start: Date.now(), end: 0, duration: 0 };

    let siteSnapshot: SiteSnapshot;

    // Check cache unless skipCache is true
    if (!options.skipCache) {
      const cachedSite = siteSnapshotCache.get(cacheKey);
      if (cachedSite) {
        console.log("[AuditRunner] SiteSnapshot cache hit");
        siteSnapshot = cachedSite;
      } else {
        console.log("[AuditRunner] SiteSnapshot cache miss - extracting...");
        const extractionResult = extractAll(rawSnapshot, identity);
        siteSnapshot = extractionResult.siteSnapshot;
        siteSnapshotCache.set(cacheKey, siteSnapshot);
      }
    } else {
      console.log("[AuditRunner] Cache skipped - extracting fresh...");
      const extractionResult = extractAll(rawSnapshot, identity);
      siteSnapshot = extractionResult.siteSnapshot;
      siteSnapshotCache.set(cacheKey, siteSnapshot);
    }

    stageTimers.stage2.end = Date.now();
    stageTimers.stage2.duration = stageTimers.stage2.end - stageTimers.stage2.start;

    console.log(`[AuditRunner] Stage 2 complete: ${siteSnapshot.pages.length} pages extracted`);

    // ========================================================================
    // STAGE 3: Audits (4 deterministic + 2 LLM audits)
    // ========================================================================
    stageTimers.stage3 = { start: Date.now(), end: 0, duration: 0 };

    // Run all audits including LLM-powered ones (visual, SERP)
    // This makes exactly 2 LLM calls (visual + SERP)
    const auditsOutput = await runAllAudits(siteSnapshot, rawSnapshot);

    const allFindings: AuditFinding[] = auditsOutput.findings;
    const privateFlagsFromAudits: PrivateFlag[] = auditsOutput.privateFlags;

    stageTimers.stage3.end = Date.now();
    stageTimers.stage3.duration = stageTimers.stage3.end - stageTimers.stage3.start;

    console.log(`[AuditRunner] Stage 3 complete: ${allFindings.length} findings (${privateFlagsFromAudits.length} private flags)`);

    // ========================================================================
    // STAGE 4: Synthesis (3rd LLM call)
    // ========================================================================
    stageTimers.stage4 = { start: Date.now(), end: 0, duration: 0 };

    // Separate deterministic findings from LLM findings
    // Deterministic: crawl_, tech_, sec_, perf_ prefixes
    // LLM: visual_, serp_ prefixes
    const deterministicFindings = allFindings.filter(
      (f) =>
        f.type.startsWith("crawl_") ||
        f.type.startsWith("tech_") ||
        f.type.startsWith("sec_") ||
        f.type.startsWith("perf_")
    );
    const llmFindings = allFindings.filter(
      (f) => f.type.startsWith("visual_") || f.type.startsWith("serp_")
    );

    // Run synthesis (3rd LLM call)
    const synthesisResult = await synthesizeReport(
      deterministicFindings,
      llmFindings,
      siteSnapshot.coverage,
      siteSnapshot
    );

    stageTimers.stage4.end = Date.now();
    stageTimers.stage4.duration = stageTimers.stage4.end - stageTimers.stage4.start;

    // ========================================================================
    // STAGE 5: Output
    // ========================================================================

    const completedAt = new Date().toISOString();

    // Build public report (synthesis may fail, have fallback)
    let publicReport: PublicReport;

    if (synthesisResult) {
      publicReport = synthesisResult.publicReport;
    } else {
      // Fallback: build minimal public report if synthesis failed
      publicReport = createFallbackPublicReport(
        identity,
        siteSnapshot.coverage,
        allFindings
      );
    }

    // Build private flags (combining audit flags + any synthesis issues)
    const privateFlags: PrivateFlags = {
      flags: privateFlagsFromAudits,
      rawDataQuality: assessDataQuality(rawSnapshot),
      confidenceScore: calculateConfidenceScore(siteSnapshot, allFindings),
      reviewerNotes: generateReviewerNotes(siteSnapshot, allFindings),
    };

    const auditResult: AuditResult = {
      identity,
      publicReport,
      privateFlags,
      coverage: siteSnapshot.coverage,
      timings: {
        startedAt,
        completedAt,
        stageDurations: {
          stage0: stageTimers.stage0.duration,
          stage1: stageTimers.stage1.duration,
          stage2: stageTimers.stage2.duration,
          stage3: stageTimers.stage3.duration,
          stage4: stageTimers.stage4.duration,
        },
      },
    };

    console.log(`[AuditRunner] Pipeline complete in ${Date.now() - stageTimers.stage0.start}ms`);
    console.log(`[AuditRunner] Public report score: ${publicReport.summary.score}`);

    return auditResult;
  } catch (error) {
    // Catch-all: this should never happen, but if it does,
    // return a graceful error report instead of throwing
    console.error("[AuditRunner] Unexpected pipeline error:", error);

    return createErrorAuditResult(
      request.url,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a fallback public report when synthesis fails.
 * Ensures we always return a valid report even if LLM synthesis fails.
 */
function createFallbackPublicReport(
  identity: AuditIdentity,
  coverage: CoverageLimitations,
  findings: AuditFinding[]
): PublicReport {
  // Calculate basic score based on findings
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  // Simple scoring: start at 100, deduct for issues
  let score = 100;
  score -= criticalCount * 15;
  score -= warningCount * 5;
  score = Math.max(0, Math.min(100, score));

  // Determine grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return {
    identity,
    summary: {
      score,
      grade,
      headline: "SEO Audit Report",
      overview: `Audit completed with ${findings.length} findings. Note: Report synthesis encountered an issue, displaying raw findings.`,
      keyStrengths: ["Audit completed successfully"],
      keyIssues: findings
        .filter((f) => f.severity === "critical" || f.severity === "warning")
        .slice(0, 5)
        .map((f) => f.message),
      urgency: criticalCount > 0 ? "immediate" : warningCount > 5 ? "high" : "medium",
    },
    priorities: findings
      .filter((f) => f.severity === "critical" || f.severity === "warning")
      .slice(0, 10)
      .map((f, i) => ({
        rank: i + 1,
        title: f.type,
        description: f.message,
        impact: f.severity === "critical" ? "high" : "medium",
        effort: "medium",
      })),
    categories: {
      crawl: createFallbackCategory("crawl", findings),
      technical: createFallbackCategory("technical", findings),
      security: createFallbackCategory("security", findings),
      performance: createFallbackCategory("performance", findings),
      visual: createFallbackCategory("visual", findings),
      serp: createFallbackCategory("serp", findings),
    },
    limitations: coverage,
    generatedAt: new Date().toISOString(),
    version: AUDIT_SYSTEM_VERSION,
  };
}

/**
 * Creates a fallback category summary from findings.
 */
function createFallbackCategory(
  categoryName: string,
  findings: AuditFinding[]
): {
  name: string;
  score: number;
  findings: AuditFinding[];
  summary: string;
} {
  const categoryFindings = findings.filter((f) =>
    f.type.startsWith(categoryName === "serp" ? "serp_" : `${categoryName}_`)
  );

  const criticalCount = categoryFindings.filter((f) => f.severity === "critical").length;
  const warningCount = categoryFindings.filter((f) => f.severity === "warning").length;

  let score = 100;
  score -= criticalCount * 20;
  score -= warningCount * 10;
  score = Math.max(0, Math.min(100, score));

  return {
    name: categoryName,
    score,
    findings: categoryFindings,
    summary: `${categoryFindings.length} findings in ${categoryName} category.`,
  };
}

/**
 * Assesses the quality of raw collector data.
 */
function assessDataQuality(raw: RawSnapshot): "high" | "medium" | "low" {
  let successCount = 0;
  let totalCount = 0;

  // Check each collector output
  for (const [key, value] of Object.entries(raw)) {
    totalCount++;
    if (value && value.data !== null && value.error === null) {
      successCount++;
    }
  }

  const successRate = successCount / totalCount;

  if (successRate >= 0.8) return "high";
  if (successRate >= 0.5) return "medium";
  return "low";
}

/**
 * Calculates confidence score based on coverage and findings.
 */
function calculateConfidenceScore(
  siteSnapshot: SiteSnapshot,
  findings: AuditFinding[]
): number {
  let score = 1.0;

  // Reduce confidence if we have low coverage
  if (siteSnapshot.coverage.pagesSampled < siteSnapshot.coverage.pagesTotal) {
    score -= 0.1;
  }

  // Reduce confidence if we had fetch errors
  if (siteSnapshot.coverage.fetchErrors.length > 0) {
    score -= 0.1 * Math.min(siteSnapshot.coverage.fetchErrors.length / 10, 0.3);
  }

  // Reduce confidence if many findings (might indicate data quality issues)
  if (findings.length > 50) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Generates reviewer notes for private flags.
 */
function generateReviewerNotes(
  siteSnapshot: SiteSnapshot,
  findings: AuditFinding[]
): string[] {
  const notes: string[] = [];

  if (siteSnapshot.coverage.pagesSampled < siteSnapshot.coverage.pagesTotal) {
    notes.push(
      `Sampled ${siteSnapshot.coverage.pagesSampled} of ${siteSnapshot.coverage.pagesTotal} pages`
    );
  }

  if (siteSnapshot.coverage.fetchErrors.length > 0) {
    notes.push(`${siteSnapshot.coverage.fetchErrors.length} URLs failed to fetch`);
  }

  if (findings.length > 30) {
    notes.push("High finding count - verify data quality");
  }

  return notes;
}

/**
 * Creates an error audit result when the pipeline fails completely.
 * This ensures we never throw and always return a valid result.
 */
function createErrorAuditResult(url: string, errorMessage: string): AuditResult {
  const runId = generateRunId();
  const normalizedUrl = normalizeUrl(url);

  return {
    identity: {
      normalizedUrl,
      runId,
      cacheKey: "error",
    },
    publicReport: {
      identity: {
        normalizedUrl,
        runId,
        cacheKey: "error",
      },
      summary: {
        score: 0,
        grade: "F",
        headline: "Audit Failed",
        overview: `The audit could not be completed due to an error: ${errorMessage}`,
        keyStrengths: [],
        keyIssues: ["Audit failed to complete"],
        urgency: "immediate",
      },
      priorities: [
        {
          rank: 1,
          title: "Retry Audit",
          description: "The audit encountered an error. Please try again.",
          impact: "high",
          effort: "low",
        },
      ],
      categories: {
        crawl: {
          name: "crawl",
          score: 0,
          findings: [],
          summary: "Audit failed - no crawl data available.",
        },
        technical: {
          name: "technical",
          score: 0,
          findings: [],
          summary: "Audit failed - no technical data available.",
        },
        security: {
          name: "security",
          score: 0,
          findings: [],
          summary: "Audit failed - no security data available.",
        },
        performance: {
          name: "performance",
          score: 0,
          findings: [],
          summary: "Audit failed - no performance data available.",
        },
        visual: {
          name: "visual",
          score: 0,
          findings: [],
          summary: "Audit failed - no visual data available.",
        },
        serp: {
          name: "serp",
          score: 0,
          findings: [],
          summary: "Audit failed - no SERP data available.",
        },
      },
      limitations: {
        pagesSampled: 0,
        pagesTotal: 0,
        sitemapsProcessed: 0,
        sitemapsFailed: 0,
        dnsResolved: false,
        tlsVerified: false,
        lighthouseRun: false,
        screenshotsCaptured: false,
        serpChecked: false,
        squirrelscanRun: false,
        blockedByRobots: [],
        fetchErrors: [{ url: normalizedUrl, error: errorMessage }],
        timeoutUrls: [],
        oversizedUrls: [],
      },
      generatedAt: new Date().toISOString(),
      version: AUDIT_SYSTEM_VERSION,
    },
    privateFlags: {
      flags: [
        {
          type: "tool_failure",
          severity: "high",
          message: "Pipeline failure",
          context: { error: errorMessage },
        },
      ],
      rawDataQuality: "low",
      confidenceScore: 0,
      reviewerNotes: ["Complete pipeline failure - manual review required"],
    },
    coverage: {
      pagesSampled: 0,
      pagesTotal: 0,
      sitemapsProcessed: 0,
      sitemapsFailed: 0,
      dnsResolved: false,
      tlsVerified: false,
      lighthouseRun: false,
      screenshotsCaptured: false,
      serpChecked: false,
      squirrelscanRun: false,
      blockedByRobots: [],
      fetchErrors: [{ url: normalizedUrl, error: errorMessage }],
      timeoutUrls: [],
      oversizedUrls: [],
    },
    timings: {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stageDurations: {
        stage0: 0,
        stage1: 0,
        stage2: 0,
        stage3: 0,
        stage4: 0,
      },
    },
  };
}
