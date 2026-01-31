/**
 * Audit Orchestrator
 *
 * Orchestrates all audits: deterministic first, then LLM-powered.
 * Input: SiteSnapshot, RawSnapshot
 * Output: Record<auditType, AuditFinding[]> with tracking
 *
 * Deterministic audits: NO network calls, NO LLM calls, NEVER throws.
 * LLM audits (visual, SERP): Async, may fail gracefully, 30s timeout each.
 */

import type { SiteSnapshot, AuditFinding, RawSnapshot, PrivateFlag } from "../audit.types.ts";
import { auditCrawl } from "./crawl.audit.ts";
import { auditTechnical } from "./technical.audit.ts";
import { auditSecurity, type SecurityAuditResult } from "./security.audit.ts";
import { auditPerformance } from "./performance.audit.ts";
import { runVisualAudit } from "./visual.audit.ts";
import { runSerpAudit } from "./serp.audit.ts";

/**
 * Result from running deterministic audits only
 * (crawl, technical, security, performance)
 * For full audit including LLM, use runAllAudits()
 */
export interface RunAuditsResult {
  findings: Record<string, AuditFinding[]>;
  privateFlags: PrivateFlag[];
  meta: {
    completedAudits: string[];
    failedAudits: string[];
    totalFindings: number;
    durationMs: number;
  };
}

/**
 * Audit function type
 */
type AuditFunction = (snapshot: SiteSnapshot, raw: RawSnapshot) => AuditFinding[];

/**
 * Security audit wrapper type
 */
type SecurityAuditFunction = (snapshot: SiteSnapshot, raw: RawSnapshot) => SecurityAuditResult;

/**
 * Runs all deterministic audits in parallel.
 * 
 * @param snapshot - SiteSnapshot from extractors
 * @param raw - RawSnapshot for additional data access
 * @returns RunAuditsResult with all findings grouped by type
 */
export function runAudits(snapshot: SiteSnapshot, raw: RawSnapshot): RunAuditsResult {
  const startTime = Date.now();

  const findings: Record<string, AuditFinding[]> = {
    crawl: [],
    technical: [],
    security: [],
    performance: [],
  };

  const privateFlags: PrivateFlag[] = [];
  const completedAudits: string[] = [];
  const failedAudits: string[] = [];

  try {
    // Run crawl audit
    try {
      const crawlFindings = auditCrawl(snapshot, raw);
      findings.crawl = crawlFindings;
      completedAudits.push("crawl");
    } catch (error) {
      failedAudits.push("crawl");
      findings.crawl.push(createErrorFinding("crawl", error));
    }

    // Run technical audit
    try {
      const technicalFindings = auditTechnical(snapshot, raw);
      findings.technical = technicalFindings;
      completedAudits.push("technical");
    } catch (error) {
      failedAudits.push("technical");
      findings.technical.push(createErrorFinding("technical", error));
    }

    // Run security audit (returns both findings and private flags)
    try {
      const securityResult = auditSecurity(snapshot, raw);
      findings.security = securityResult.findings;
      privateFlags.push(...securityResult.privateFlags);
      completedAudits.push("security");
    } catch (error) {
      failedAudits.push("security");
      findings.security.push(createErrorFinding("security", error));
    }

    // Run performance audit
    try {
      const performanceFindings = auditPerformance(snapshot, raw);
      findings.performance = performanceFindings;
      completedAudits.push("performance");
    } catch (error) {
      failedAudits.push("performance");
      findings.performance.push(createErrorFinding("performance", error));
    }

  } catch (globalError) {
    // Catch-all for any unexpected errors at the orchestrator level
    findings.crawl.push({
      type: "crawl_unreachable",
      severity: "critical",
      message: "Audit orchestrator encountered an error",
      evidence: {
        error: globalError instanceof Error ? globalError.message : "Unknown error",
      },
    });
  }

  const durationMs = Date.now() - startTime;
  const totalFindings = Object.values(findings).reduce((sum, arr) => sum + arr.length, 0);

  return {
    findings,
    privateFlags,
    meta: {
      completedAudits,
      failedAudits,
      totalFindings,
      durationMs,
    },
  };
}

/**
 * Runs audits selectively based on requested types.
 * 
 * @param snapshot - SiteSnapshot from extractors
 * @param raw - RawSnapshot for additional data access
 * @param auditTypes - Array of audit types to run
 * @returns RunAuditsResult with findings for requested types only
 */
export function runSelectiveAudits(
  snapshot: SiteSnapshot,
  raw: RawSnapshot,
  auditTypes: string[]
): RunAuditsResult {
  const startTime = Date.now();

  const findings: Record<string, AuditFinding[]> = {
    crawl: [],
    technical: [],
    security: [],
    performance: [],
  };

  const privateFlags: PrivateFlag[] = [];
  const completedAudits: string[] = [];
  const failedAudits: string[] = [];

  // Map audit types to their functions
  const auditMap: Record<string, AuditFunction | SecurityAuditFunction> = {
    crawl: auditCrawl,
    technical: auditTechnical,
    security: auditSecurity,
    performance: auditPerformance,
  };

  for (const auditType of auditTypes) {
    const auditFn = auditMap[auditType];
    
    if (!auditFn) {
      // Unknown audit type
      failedAudits.push(auditType);
      continue;
    }

    try {
      if (auditType === "security") {
        // Security audit returns special result with private flags
        const result = (auditFn as SecurityAuditFunction)(snapshot, raw);
        findings[auditType] = result.findings;
        privateFlags.push(...result.privateFlags);
      } else {
        // Standard audit returns findings array
        findings[auditType] = (auditFn as AuditFunction)(snapshot, raw);
      }
      completedAudits.push(auditType);
    } catch (error) {
      failedAudits.push(auditType);
      findings[auditType].push(createErrorFinding(auditType, error));
    }
  }

  const durationMs = Date.now() - startTime;
  const totalFindings = Object.values(findings).reduce((sum, arr) => sum + arr.length, 0);

  return {
    findings,
    privateFlags,
    meta: {
      completedAudits,
      failedAudits,
      totalFindings,
      durationMs,
    },
  };
}

/**
 * Creates a standardized error finding.
 */
function createErrorFinding(auditType: string, error: unknown): AuditFinding {
  return {
    type: "crawl_unreachable",
    severity: "critical",
    message: `${auditType} audit failed to complete`,
    evidence: {
      auditType,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Merges findings from multiple audits into a single array.
 * Useful for generating consolidated reports.
 * 
 * @param findings - Record of findings by type
 * @returns Flat array of all findings with type preserved in evidence
 */
export function mergeFindings(findings: Record<string, AuditFinding[]>): AuditFinding[] {
  const merged: AuditFinding[] = [];

  for (const [type, typeFindings] of Object.entries(findings)) {
    for (const finding of typeFindings) {
      // Add audit type to evidence for traceability
      merged.push({
        ...finding,
        evidence: {
          ...finding.evidence,
          _auditType: type,
        },
      });
    }
  }

  // Sort by severity: critical > warning > info > pass
  const severityOrder = { critical: 0, warning: 1, info: 2, pass: 3 };
  
  merged.sort((a, b) => {
    const aOrder = severityOrder[a.severity] ?? 4;
    const bOrder = severityOrder[b.severity] ?? 4;
    return aOrder - bOrder;
  });

  return merged;
}

/**
 * Gets summary statistics for audit findings.
 * 
 * @param findings - Record of findings by type
 * @returns Summary statistics
 */
export function getFindingsSummary(findings: Record<string, AuditFinding[]>): {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
} {
  const allFindings = Object.values(findings).flat();
  
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const finding of allFindings) {
    byType[finding.type] = (byType[finding.type] || 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
  }

  return {
    total: allFindings.length,
    byType,
    bySeverity,
  };
}

/**
 * Filters findings by severity.
 * 
 * @param findings - Array of findings
 * @param minSeverity - Minimum severity to include
 * @returns Filtered findings
 */
export function filterFindingsBySeverity(
  findings: AuditFinding[],
  minSeverity: "critical" | "warning" | "info" | "pass"
): AuditFinding[] {
  const severityOrder = { critical: 0, warning: 1, info: 2, pass: 3 };
  const minLevel = severityOrder[minSeverity];

  return findings.filter(f => (severityOrder[f.severity] ?? 4) <= minLevel);
}

/**
 * Deduplicates findings by type and affected URLs.
 * 
 * @param findings - Array of findings
 * @returns Deduplicated findings
 */
export function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  const deduplicated: AuditFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.type}:${(finding.affectedUrls || []).sort().join(",")}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(finding);
    }
  }

  return deduplicated;
}

/**
 * Result from running all audits including LLM-powered audits
 */
export interface RunAllAuditsResult {
  findings: AuditFinding[];
  privateFlags: PrivateFlag[];
}

/**
 * Runs all audits: deterministic first, then LLM-powered (visual + SERP).
 * 
 * This is the main entry point for complete audit execution.
 * - Runs deterministic audits (crawl, technical, security, performance)
 * - Runs visual audit with Gemini vision (30s timeout)
 * - Runs SERP audit with Gemini 2.5 Flash (30s timeout)
 * - LLM failures are handled gracefully (return empty arrays)
 * 
 * @param siteSnapshot - SiteSnapshot from extractors
 * @param rawSnapshot - RawSnapshot for additional data access
 * @returns All findings and private flags combined
 */
export async function runAllAudits(
  siteSnapshot: SiteSnapshot,
  rawSnapshot: RawSnapshot
): Promise<RunAllAuditsResult> {
  // Step 1: Run deterministic audits first (synchronous, fast)
  const deterministicResult = runAudits(siteSnapshot, rawSnapshot);
  
  // Collect all findings from deterministic audits
  const allFindings: AuditFinding[] = [];
  const allPrivateFlags: PrivateFlag[] = [...deterministicResult.privateFlags];
  
  // Flatten deterministic findings
  for (const findings of Object.values(deterministicResult.findings)) {
    allFindings.push(...findings);
  }
  
  // Step 2: Run LLM audits in parallel (async, with timeouts)
  // These fail gracefully - if they timeout or error, we still get empty arrays
  const [visualFindings, serpFindings] = await Promise.all([
    runVisualAudit(rawSnapshot, siteSnapshot).catch((error) => {
      console.error("Visual audit failed (non-blocking):", error);
      return [] as AuditFinding[];
    }),
    runSerpAudit(rawSnapshot, siteSnapshot).catch((error) => {
      console.error("SERP audit failed (non-blocking):", error);
      return [] as AuditFinding[];
    }),
  ]);
  
  // Add LLM findings to the collection
  allFindings.push(...visualFindings, ...serpFindings);
  
  return {
    findings: allFindings,
    privateFlags: allPrivateFlags,
  };
}
