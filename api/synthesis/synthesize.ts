/**
 * SEO Audit System - Synthesis Module (LLM Call #3 of 3)
 *
 * This is the final stage of the audit pipeline. It synthesizes all findings
 * from deterministic audits and LLM-generated audits into a comprehensive,
 * client-ready report.
 *
 * Pipeline:
 * 1. Visual Audit (Gemini) - LLM call #1
 * 2. SERP Audit (Gemini 2.5 Flash) - LLM call #2
 * 3. Synthesis (GPT 5.2) - LLM call #3 (THIS FILE)
 *
 * Critical Requirements:
 * - ALL input must be redacted before sending to LLM
 * - Private flags NEVER go to synthesis
 * - Model: GPT 5.2 (or fallback)
 * - Timeout: 60s
 * - Return safe PublicReport only
 */

import type {
  AuditFinding,
  AuditFindings,
  CoverageLimitations,
  SiteSnapshot,
  PublicReport,
  ExecutiveSummary,
  PriorityItem,
  CategorySummary,
  AuditIdentity,
} from "../audit.types.js";
import type { JSONSchema, LLMResponse } from "../llm/client.js";
import llmClient from "../llm/client.js";
import { getSynthesisPrompt } from "../llm/prompts.js";
import { redactSensitiveContent } from "../llm/redact.js";
import { TIMEOUT_LLM_SYNTHESIS, AUDIT_SYSTEM_VERSION } from "../audit.config.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Trace data from synthesis LLM call
 */
export interface SynthesisTrace {
  stepId: string;
  stepName: string;
  model: string;
  provider: "gemini" | "openai";
  durationMs: number;
  prompt: string;
  promptTemplate: string;
  systemInstruction: string;
  response: string;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  temperature?: number;
}

/**
 * Result from synthesis - contains public report and trace data
 * Private flags are handled separately and never go through synthesis
 */
export interface SynthesisResult {
  publicReport: PublicReport;
  trace: SynthesisTrace | null;
}

/**
 * Internal structure for synthesis input after redaction
 */
interface SynthesisInput {
  crawlFindings: AuditFinding[];
  technicalFindings: AuditFinding[];
  securityFindings: AuditFinding[];
  performanceFindings: AuditFinding[];
  visualFindings: AuditFinding[];
  serpFindings: AuditFinding[];
  coverage: CoverageLimitations;
  siteSummary: {
    totalPages: number;
    platform: string | null;
    hasSitemap: boolean;
    securityScore: number;
  };
}

/**
 * Raw synthesis output from LLM (before transformation to PublicReport)
 */
interface SynthesisLLMOutput {
  executiveSummary: {
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    headline: string;
    overview: string;
    keyStrengths: string[];
    keyIssues: string[];
    urgency: "immediate" | "high" | "medium" | "low";
  };
  priorities: Array<{
    rank: number;
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    effort: "high" | "medium" | "low";
  }>;
  findingsByCategory: Array<{
    name: string;
    score: number;
    findings: Array<{
      type: string;
      severity: string;
      message: string;
    }>;
    summary: string;
  }>;
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  limitations: string[];
}

// ============================================================================
// MAIN SYNTHESIS FUNCTION
// ============================================================================

/**
 * Synthesize all audit findings into a comprehensive, client-ready report.
 *
 * This is LLM call #3 of 3 in the audit pipeline.
 *
 * @param deterministicFindings - Findings from deterministic audits (crawl, technical, security, performance)
 * @param llmFindings - Findings from LLM audits (visual, SERP)
 * @param coverage - Coverage limitations and audit metadata
 * @param siteSnapshot - Full site snapshot with all collected data
 * @returns SynthesisResult containing the public report, or null if synthesis fails
 */
export async function synthesizeReport(
  deterministicFindings: AuditFinding[],
  llmFindings: AuditFinding[],
  coverage: CoverageLimitations,
  siteSnapshot: SiteSnapshot
): Promise<SynthesisResult | null> {
  console.log("[Synthesis] Starting synthesis (LLM call #3 of 3)...");

  try {
    // Step 1: Redact ALL input before processing
    const redactedDeterministic = redactFindings(deterministicFindings);
    const redactedLLM = redactFindings(llmFindings);
    const redactedCoverage = redactCoverage(coverage);
    const redactedSnapshot = redactSiteSnapshot(siteSnapshot);

    // Step 2: Prepare synthesis input
    const synthesisInput = prepareSynthesisInput(
      redactedDeterministic,
      redactedLLM,
      redactedCoverage,
      redactedSnapshot
    );

    // Step 3: Build AuditFindings structure for prompt
    const findingsForPrompt: AuditFindings = {
      crawl: synthesisInput.crawlFindings,
      technical: synthesisInput.technicalFindings,
      security: synthesisInput.securityFindings,
      performance: synthesisInput.performanceFindings,
      visual: synthesisInput.visualFindings,
      serp: synthesisInput.serpFindings,
    };

    // Step 4: Generate prompt
    const prompt = getSynthesisPrompt(findingsForPrompt, synthesisInput.coverage);

    // Step 5: Define JSON schema for structured output
    const schema: JSONSchema = {
      type: "object",
      properties: {
        executiveSummary: {
          type: "object",
          properties: {
            score: { type: "number", minimum: 0, maximum: 100 },
            grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
            headline: { type: "string" },
            overview: { type: "string" },
            keyStrengths: { type: "array", items: { type: "string" } },
            keyIssues: { type: "array", items: { type: "string" } },
            urgency: { type: "string", enum: ["immediate", "high", "medium", "low"] },
          },
          required: ["score", "grade", "headline", "overview", "keyStrengths", "keyIssues", "urgency"],
        },
        priorities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rank: { type: "number" },
              title: { type: "string" },
              description: { type: "string" },
              impact: { type: "string", enum: ["high", "medium", "low"] },
              effort: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["rank", "title", "description", "impact", "effort"],
          },
        },
        findingsByCategory: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              score: { type: "number", minimum: 0, maximum: 100 },
              findings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    severity: { type: "string" },
                    message: { type: "string" },
                  },
                  required: ["type", "severity", "message"],
                },
              },
              summary: { type: "string" },
            },
            required: ["name", "score", "findings", "summary"],
          },
        },
        actionPlan: {
          type: "object",
          properties: {
            immediate: { type: "array", items: { type: "string" } },
            shortTerm: { type: "array", items: { type: "string" } },
            longTerm: { type: "array", items: { type: "string" } },
          },
          required: ["immediate", "shortTerm", "longTerm"],
        },
        limitations: { type: "array", items: { type: "string" } },
      },
      required: ["executiveSummary", "priorities", "findingsByCategory", "actionPlan", "limitations"],
    };

    // Step 6: Call LLM for synthesis (GPT-4o or fallback)
    console.log(`[Synthesis] Calling LLM with ${TIMEOUT_LLM_SYNTHESIS / 1000}s timeout...`);
    const systemInstruction = "You are an SEO expert synthesizing audit findings into actionable recommendations.";

    const llmResult = await llmClient.generateStructuredWithMetadata<SynthesisLLMOutput>(
      prompt,
      schema,
      {
        provider: "openai",
        timeout: TIMEOUT_LLM_SYNTHESIS,
        temperature: 0.7,
      }
    );

    if (!llmResult) {
      console.error("[Synthesis] LLM synthesis failed - returning null");
      return null;
    }

    console.log("[Synthesis] LLM synthesis successful, building public report...");

    // Step 7: Transform LLM output to PublicReport
    const publicReport = transformToPublicReport(
      llmResult.data,
      siteSnapshot.identity,
      coverage,
      deterministicFindings.length + llmFindings.length
    );

    console.log(`[Synthesis] Synthesis complete. Overall score: ${publicReport.summary.score}`);

    return {
      publicReport,
      trace: {
        stepId: "synthesis",
        stepName: "Report Synthesis",
        model: llmResult.metadata.model,
        provider: llmResult.metadata.provider,
        durationMs: llmResult.metadata.durationMs,
        prompt,
        promptTemplate: prompt,
        systemInstruction,
        response: llmResult.metadata.text,
        usageMetadata: llmResult.metadata.usageMetadata,
        temperature: llmResult.metadata.temperature,
      },
    };
  } catch (error) {
    console.error("[Synthesis] Unexpected error during synthesis:", error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Redact an array of findings by redacting all string fields
 */
function redactFindings(findings: AuditFinding[]): AuditFinding[] {
  return findings.map((finding) => ({
    ...finding,
    message: redactSensitiveContent(finding.message),
    evidence: redactObject(finding.evidence),
    affectedUrls: finding.affectedUrls?.map((url) => redactSensitiveContent(url)),
  }));
}

/**
 * Redact coverage data
 */
function redactCoverage(coverage: CoverageLimitations): CoverageLimitations {
  return {
    ...coverage,
    fetchErrors: coverage.fetchErrors.map((err) => ({
      url: redactSensitiveContent(err.url),
      error: redactSensitiveContent(err.error),
    })),
    blockedByRobots: coverage.blockedByRobots.map((url) => redactSensitiveContent(url)),
    timeoutUrls: coverage.timeoutUrls.map((url) => redactSensitiveContent(url)),
    oversizedUrls: coverage.oversizedUrls.map((url) => redactSensitiveContent(url)),
  };
}

/**
 * Redact site snapshot - only keep what's needed for synthesis
 */
function redactSiteSnapshot(siteSnapshot: SiteSnapshot): SiteSnapshot {
  return {
    ...siteSnapshot,
    pages: siteSnapshot.pages.map((page) => ({
      ...page,
      url: redactSensitiveContent(page.url),
      title: page.title ? redactSensitiveContent(page.title) : null,
      metaDescription: page.metaDescription ? redactSensitiveContent(page.metaDescription) : null,
      canonical: page.canonical ? redactSensitiveContent(page.canonical) : null,
      h1: page.h1 ? redactSensitiveContent(page.h1) : null,
      headings: {
        h2: page.headings.h2.map((h) => redactSensitiveContent(h)),
        h3: page.headings.h3.map((h) => redactSensitiveContent(h)),
        h4: page.headings.h4.map((h) => redactSensitiveContent(h)),
        h5: page.headings.h5.map((h) => redactSensitiveContent(h)),
        h6: page.headings.h6.map((h) => redactSensitiveContent(h)),
      },
      images: page.images.map((img) => ({
        ...img,
        src: redactSensitiveContent(img.src),
        alt: img.alt ? redactSensitiveContent(img.alt) : null,
      })),
      links: {
        internal: page.links.internal.map((link) => ({
          ...link,
          url: redactSensitiveContent(link.url),
          text: redactSensitiveContent(link.text),
        })),
        external: page.links.external.map((link) => ({
          ...link,
          url: redactSensitiveContent(link.url),
          text: redactSensitiveContent(link.text),
        })),
        broken: page.links.broken.map((url) => redactSensitiveContent(url)),
      },
    })),
    urlSet: {
      ...siteSnapshot.urlSet,
      all: siteSnapshot.urlSet.all.map((url) => redactSensitiveContent(url)),
      templates: siteSnapshot.urlSet.templates.map((template) => ({
        ...template,
        pattern: redactSensitiveContent(template.pattern),
        example: redactSensitiveContent(template.example),
        sampleUrls: template.sampleUrls.map((url) => redactSensitiveContent(url)),
      })),
    },
  };
}

/**
 * Recursively redact all string values in an object
 */
function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      redacted[key] = redactSensitiveContent(value);
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        redacted[key] = value.map((item) =>
          typeof item === "string"
            ? redactSensitiveContent(item)
            : typeof item === "object" && item !== null
            ? redactObject(item as Record<string, unknown>)
            : item
        );
      } else {
        redacted[key] = redactObject(value as Record<string, unknown>);
      }
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Prepare synthesis input by categorizing findings
 */
function prepareSynthesisInput(
  deterministicFindings: AuditFinding[],
  llmFindings: AuditFinding[],
  coverage: CoverageLimitations,
  siteSnapshot: SiteSnapshot
): SynthesisInput {
  // Categorize deterministic findings by type
  const crawlFindings = deterministicFindings.filter((f) =>
    f.type.startsWith("crawl_")
  );
  const technicalFindings = deterministicFindings.filter((f) =>
    f.type.startsWith("tech_")
  );
  const securityFindings = deterministicFindings.filter((f) =>
    f.type.startsWith("sec_")
  );
  const performanceFindings = deterministicFindings.filter((f) =>
    f.type.startsWith("perf_")
  );

  // Categorize LLM findings
  const visualFindings = llmFindings.filter((f) =>
    f.type.startsWith("visual_")
  );
  const serpFindings = llmFindings.filter((f) =>
    f.type.startsWith("serp_")
  );

  return {
    crawlFindings,
    technicalFindings,
    securityFindings,
    performanceFindings,
    visualFindings,
    serpFindings,
    coverage,
    siteSummary: {
      totalPages: siteSnapshot.pages.length,
      platform: siteSnapshot.siteWide.templatePatterns[0] || null,
      hasSitemap: siteSnapshot.siteWide.sitemapCount > 0,
      securityScore: calculateSecurityScore(siteSnapshot),
    },
  };
}

/**
 * Calculate a simple security score based on site snapshot
 * Returns score from 0-100
 */
function calculateSecurityScore(siteSnapshot: SiteSnapshot): number {
  let score = 100;
  const penalties: Record<string, number> = {
    https: 30,
    hsts: 10,
    csp: 10,
    xframe: 10,
    mixedContent: 20,
  };

  // Check HTTPS enforcement
  if (siteSnapshot.siteWide.httpsEnforced.state === "absent") {
    score -= penalties.https;
  }

  // Check security headers
  const headers = siteSnapshot.siteWide.securityHeaders;
  if (headers["strict-transport-security"]?.state === "absent") {
    score -= penalties.hsts;
  }
  if (headers["content-security-policy"]?.state === "absent") {
    score -= penalties.csp;
  }
  if (headers["x-frame-options"]?.state === "absent") {
    score -= penalties.xframe;
  }

  // Check for mixed content on any page
  const hasMixedContent = siteSnapshot.pages.some((p) => p.mixedContent);
  if (hasMixedContent) {
    score -= penalties.mixedContent;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Categorize findings by their category for grouping
 */
function categorizeFindings(
  findings: AuditFinding[]
): Record<string, AuditFinding[]> {
  const categories: Record<string, AuditFinding[]> = {};

  for (const finding of findings) {
    // Extract category from type (e.g., "crawl_robots_blocked" -> "crawl")
    const category = finding.type.split("_")[0] || "other";

    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(finding);
  }

  return categories;
}

/**
 * Sort findings by severity (critical first, then warning, info, pass)
 */
function prioritizeFindings(findings: AuditFinding[]): AuditFinding[] {
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    pass: 3,
  };

  return [...findings].sort((a, b) => {
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Transform LLM output to full PublicReport structure
 */
function transformToPublicReport(
  llmOutput: SynthesisLLMOutput,
  identity: AuditIdentity,
  coverage: CoverageLimitations,
  totalFindings: number
): PublicReport {
  // Build executive summary
  const executiveSummary: ExecutiveSummary = {
    score: llmOutput.executiveSummary.score,
    grade: llmOutput.executiveSummary.grade,
    headline: llmOutput.executiveSummary.headline,
    overview: llmOutput.executiveSummary.overview,
    keyStrengths: llmOutput.executiveSummary.keyStrengths,
    keyIssues: llmOutput.executiveSummary.keyIssues,
    urgency: llmOutput.executiveSummary.urgency,
  };

  // Build priorities
  const priorities: PriorityItem[] = llmOutput.priorities.map((p) => ({
    rank: p.rank,
    title: p.title,
    description: p.description,
    impact: p.impact,
    effort: p.effort,
  }));

  // Build category summaries
  const categories: PublicReport["categories"] = {
    crawl: buildCategorySummary("crawl", llmOutput.findingsByCategory),
    technical: buildCategorySummary("technical", llmOutput.findingsByCategory),
    security: buildCategorySummary("security", llmOutput.findingsByCategory),
    performance: buildCategorySummary("performance", llmOutput.findingsByCategory),
    visual: buildCategorySummary("visual", llmOutput.findingsByCategory),
    serp: buildCategorySummary("serp", llmOutput.findingsByCategory),
  };

  return {
    identity,
    summary: executiveSummary,
    priorities,
    categories,
    limitations: coverage,
    generatedAt: new Date().toISOString(),
    version: AUDIT_SYSTEM_VERSION,
  };
}

/**
 * Build a CategorySummary from LLM output
 */
function buildCategorySummary(
  categoryName: string,
  llmCategories: SynthesisLLMOutput["findingsByCategory"]
): CategorySummary {
  const categoryData = llmCategories.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase()
  );

  if (!categoryData) {
    // Return empty category if not found
    return {
      name: categoryName,
      score: 100,
      findings: [],
      summary: `No ${categoryName} issues detected.`,
    };
  }

  return {
    name: categoryName,
    score: categoryData.score,
    findings: categoryData.findings.map((f) => ({
      type: f.type as AuditFinding["type"],
      severity: f.severity as AuditFinding["severity"],
      message: f.message,
      evidence: {},
    })),
    summary: categoryData.summary,
  };
}

// ============================================================================
// EXPORT ADDITIONAL HELPERS (for testing and external use)
// ============================================================================

export {
  calculateSecurityScore,
  categorizeFindings,
  prioritizeFindings,
  redactFindings,
  redactCoverage,
  redactSiteSnapshot,
};
