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
  Severity,
} from "../audit.types.js";
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
  // visualFindings removed - visual analysis is now passed as raw text
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
 * Parsed markdown sections from LLM response
 */
interface ParsedMarkdownSections {
  executiveOverview: string;
  keyStrengths: string[];
  keyIssues: string[];
  crawlSummary: string;
  technicalSummary: string;
  securitySummary: string;
  performanceSummary: string;
  visualSummary: string;
  serpSummary: string;
  immediateActions: string[];
  shortTermActions: string[];
  longTermActions: string[];
}

/**
 * Category finding counts for score calculation
 */
interface CategoryCounts {
  critical: number;
  warning: number;
  info: number;
  pass: number;
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
 * @param llmFindings - Findings from LLM audits (SERP - visual is now passed as text)
 * @param coverage - Coverage limitations and audit metadata
 * @param siteSnapshot - Full site snapshot with all collected data
 * @param visualAnalysisText - Raw markdown analysis from visual audit LLM (optional)
 * @returns SynthesisResult containing the public report, or null if synthesis fails
 */
export async function synthesizeReport(
  deterministicFindings: AuditFinding[],
  llmFindings: AuditFinding[],
  coverage: CoverageLimitations,
  siteSnapshot: SiteSnapshot,
  visualAnalysisText?: string | null
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

    // Step 3: Combine all findings for score calculation
    const allFindings = [...deterministicFindings, ...llmFindings];

    // Step 4: Calculate scores deterministically
    const overallScore = calculateOverallScore(allFindings);
    const grade = calculateGrade(overallScore);
    const urgency = calculateUrgency(allFindings);

    // Step 5: Calculate category scores deterministically
    const categoryScores = calculateCategoryScores(allFindings, synthesisInput);

    // Step 6: Build AuditFindings structure for prompt
    const findingsForPrompt: AuditFindings = {
      crawl: synthesisInput.crawlFindings,
      technical: synthesisInput.technicalFindings,
      security: synthesisInput.securityFindings,
      performance: synthesisInput.performanceFindings,
      visual: [], // Empty - visual analysis is now passed as raw text
      serp: synthesisInput.serpFindings,
    };

    // Step 7: Generate prompt with visual analysis text (markdown-only prompt)
    // Truncate visual analysis if too long to avoid timeout
    const maxVisualLength = 4000; // ~1000 tokens
    let truncatedVisualText = visualAnalysisText;
    if (visualAnalysisText && visualAnalysisText.length > maxVisualLength) {
      truncatedVisualText = visualAnalysisText.substring(0, maxVisualLength) + "\n\n[Analysis truncated for length]";
      console.log(`[Synthesis] Truncated visual analysis from ${visualAnalysisText.length} to ${maxVisualLength} chars`);
    }
    const prompt = getSynthesisPrompt(findingsForPrompt, synthesisInput.coverage, truncatedVisualText);

    // Step 8: Call LLM for narrative text only (no JSON schema)
    console.log(`[Synthesis] Calling LLM with ${TIMEOUT_LLM_SYNTHESIS / 1000}s timeout for markdown narrative...`);
    const systemInstruction = "You are an SEO expert synthesizing audit findings into actionable recommendations. Return ONLY markdown text, no JSON.";

    const llmResult = await llmClient.generateTextWithMetadata(
      prompt,
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

    console.log("[Synthesis] LLM synthesis successful, parsing markdown...");

    // Step 9: Parse markdown response into sections
    const parsedSections = parseMarkdownSections(llmResult.text);

    // Step 10: Build priorities from findings (deterministic)
    const priorities = buildPrioritiesFromFindings(allFindings);

    // Step 11: Assemble final PublicReport with deterministic scores + LLM narratives
    const publicReport = assemblePublicReport(
      siteSnapshot.identity,
      overallScore,
      grade,
      urgency,
      parsedSections,
      priorities,
      categoryScores,
      findingsForPrompt,
      coverage
    );

    console.log(`[Synthesis] Synthesis complete. Overall score: ${publicReport.summary.score}`);

    return {
      publicReport,
      trace: {
        stepId: "synthesis",
        stepName: "Report Synthesis",
        model: llmResult.model,
        provider: llmResult.provider,
        durationMs: llmResult.durationMs,
        prompt,
        promptTemplate: prompt,
        systemInstruction,
        response: llmResult.text,
        usageMetadata: llmResult.usageMetadata,
        temperature: llmResult.temperature,
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

  // SERP findings from LLM (visual analysis is passed as raw text, not findings)
  const serpFindings = llmFindings.filter((f) =>
    f.type.startsWith("serp_")
  );

  return {
    crawlFindings,
    technicalFindings,
    securityFindings,
    performanceFindings,
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

// ============================================================================
// DETERMINISTIC SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate overall score deterministically from findings.
 * Formula: 100 - (criticalCount * 15) - (warningCount * 5)
 */
function calculateOverallScore(findings: AuditFinding[]): number {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  const score = 100 - (criticalCount * 15) - (warningCount * 5);
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate grade from score.
 * A (90+), B (80+), C (70+), D (60+), F (<60)
 */
function calculateGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Calculate urgency based on critical findings count.
 */
function calculateUrgency(findings: AuditFinding[]): "immediate" | "high" | "medium" | "low" {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;

  if (criticalCount >= 3) return "immediate";
  if (criticalCount >= 1) return "high";

  const warningCount = findings.filter((f) => f.severity === "warning").length;
  if (warningCount >= 5) return "medium";

  return "low";
}

/**
 * Calculate category scores deterministically.
 * Formula: 100 - (categoryCritical * 20) - (categoryWarning * 10)
 */
function calculateCategoryScores(
  allFindings: AuditFinding[],
  synthesisInput: SynthesisInput
): Record<string, number> {
  const calculateCategoryScore = (categoryFindings: AuditFinding[]): number => {
    const critical = categoryFindings.filter((f) => f.severity === "critical").length;
    const warning = categoryFindings.filter((f) => f.severity === "warning").length;
    const score = 100 - (critical * 20) - (warning * 10);
    return Math.max(0, Math.min(100, score));
  };

  return {
    crawl: calculateCategoryScore(synthesisInput.crawlFindings),
    technical: calculateCategoryScore(synthesisInput.technicalFindings),
    security: calculateCategoryScore(synthesisInput.securityFindings),
    performance: calculateCategoryScore(synthesisInput.performanceFindings),
    visual: 100, // Visual findings are text-based, default to 100
    serp: calculateCategoryScore(synthesisInput.serpFindings),
  };
}

// ============================================================================
// MARKDOWN PARSING FUNCTIONS
// ============================================================================

/**
 * Parse markdown response from LLM into structured sections.
 */
function parseMarkdownSections(markdown: string): ParsedMarkdownSections {
  const sections: ParsedMarkdownSections = {
    executiveOverview: "",
    keyStrengths: [],
    keyIssues: [],
    crawlSummary: "",
    technicalSummary: "",
    securitySummary: "",
    performanceSummary: "",
    visualSummary: "",
    serpSummary: "",
    immediateActions: [],
    shortTermActions: [],
    longTermActions: [],
  };

  // Extract executive overview (first section or content before first heading)
  const execMatch = markdown.match(/##\s*Executive\s*(?:Summary|Overview)[^\n]*\n([\s\S]*?)(?=##\s*|$)/i);
  if (execMatch) {
    sections.executiveOverview = execMatch[1].trim();
  } else {
    // Fallback: take first paragraphs before any heading
    const firstParagraphs = markdown.match(/^([\s\S]*?)(?=##\s*)/);
    if (firstParagraphs) {
      sections.executiveOverview = firstParagraphs[1].trim();
    }
  }

  // Extract key strengths
  const strengthsMatch = markdown.match(/##\s*(?:Key\s*)?Strengths[^\n]*\n([\s\S]*?)(?=##\s*|$)/i);
  if (strengthsMatch) {
    sections.keyStrengths = parseBulletList(strengthsMatch[1]);
  }

  // Extract key issues
  const issuesMatch = markdown.match(/##\s*(?:Key\s*)?Issues[^\n]*\n([\s\S]*?)(?=##\s*|$)/i);
  if (issuesMatch) {
    sections.keyIssues = parseBulletList(issuesMatch[1]);
  }

  // Extract category summaries
  const crawlMatch = markdown.match(/###?\s*Crawl[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (crawlMatch) sections.crawlSummary = crawlMatch[1].trim();

  const techMatch = markdown.match(/###?\s*Technical[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (techMatch) sections.technicalSummary = techMatch[1].trim();

  const securityMatch = markdown.match(/###?\s*Security[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (securityMatch) sections.securitySummary = securityMatch[1].trim();

  const perfMatch = markdown.match(/###?\s*Performance[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (perfMatch) sections.performanceSummary = perfMatch[1].trim();

  const visualMatch = markdown.match(/###?\s*Visual[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (visualMatch) sections.visualSummary = visualMatch[1].trim();

  const serpMatch = markdown.match(/###?\s*SERP[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (serpMatch) sections.serpSummary = serpMatch[1].trim();

  // Extract action items
  const immediateMatch = markdown.match(/###?\s*Immediate[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (immediateMatch) sections.immediateActions = parseBulletList(immediateMatch[1]);

  const shortTermMatch = markdown.match(/###?\s*Short[\s-]*Term[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (shortTermMatch) sections.shortTermActions = parseBulletList(shortTermMatch[1]);

  const longTermMatch = markdown.match(/###?\s*Long[\s-]*Term[^\n]*\n([\s\S]*?)(?=###?\s*|$)/i);
  if (longTermMatch) sections.longTermActions = parseBulletList(longTermMatch[1]);

  return sections;
}

/**
 * Parse a bullet list from markdown text.
 */
function parseBulletList(text: string): string[] {
  const lines = text.split("\n");
  const items: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*[-*•]\s+(.+)/);
    if (match) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Build priorities from findings deterministically.
 * Sorts by severity, takes top 5.
 */
function buildPrioritiesFromFindings(findings: AuditFinding[]): PriorityItem[] {
  // Sort by severity (critical first)
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    pass: 3,
  };

  const sorted = [...findings]
    .filter((f) => f.severity === "critical" || f.severity === "warning")
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 5);

  return sorted.map((finding, index) => ({
    rank: index + 1,
    title: finding.message.split(".")[0] || finding.message,
    description: finding.message,
    impact: finding.severity === "critical" ? "high" : "medium" as "high" | "medium" | "low",
    effort: "medium" as "high" | "medium" | "low", // Default to medium
  }));
}

/**
 * Generate a headline from findings.
 */
function generateHeadline(score: number, criticalCount: number, warningCount: number): string {
  if (score >= 90) {
    return "Excellent SEO Health - Minor Optimizations Recommended";
  } else if (score >= 80) {
    return "Good SEO Foundation - Some Improvements Needed";
  } else if (score >= 70) {
    return "Moderate SEO Issues - Attention Required";
  } else if (score >= 60) {
    return `SEO Needs Work - ${criticalCount} Critical Issues Found`;
  } else {
    return `Significant SEO Problems - ${criticalCount} Critical, ${warningCount} Warnings`;
  }
}

/**
 * Assemble the final PublicReport from deterministic scores and LLM narratives.
 */
function assemblePublicReport(
  identity: AuditIdentity,
  score: number,
  grade: "A" | "B" | "C" | "D" | "F",
  urgency: "immediate" | "high" | "medium" | "low",
  parsedSections: ParsedMarkdownSections,
  priorities: PriorityItem[],
  categoryScores: Record<string, number>,
  findings: AuditFindings,
  coverage: CoverageLimitations
): PublicReport {
  const criticalCount = Object.values(findings)
    .flat()
    .filter((f) => f.severity === "critical").length;
  const warningCount = Object.values(findings)
    .flat()
    .filter((f) => f.severity === "warning").length;

  // Build executive summary
  const executiveSummary: ExecutiveSummary = {
    score,
    grade,
    headline: generateHeadline(score, criticalCount, warningCount),
    overview: parsedSections.executiveOverview || "Audit analysis complete. See detailed findings below.",
    keyStrengths: parsedSections.keyStrengths.length > 0
      ? parsedSections.keyStrengths
      : ["Site is accessible and loading"],
    keyIssues: parsedSections.keyIssues.length > 0
      ? parsedSections.keyIssues
      : criticalCount > 0
        ? [`${criticalCount} critical issues require attention`]
        : ["No critical issues found"],
    urgency,
  };

  // Build category summaries with deterministic scores and LLM narratives
  const categories: PublicReport["categories"] = {
    crawl: {
      name: "crawl",
      score: categoryScores.crawl,
      findings: findings.crawl,
      summary: parsedSections.crawlSummary || buildDefaultCategorySummary("crawl", findings.crawl),
    },
    technical: {
      name: "technical",
      score: categoryScores.technical,
      findings: findings.technical,
      summary: parsedSections.technicalSummary || buildDefaultCategorySummary("technical", findings.technical),
    },
    security: {
      name: "security",
      score: categoryScores.security,
      findings: findings.security,
      summary: parsedSections.securitySummary || buildDefaultCategorySummary("security", findings.security),
    },
    performance: {
      name: "performance",
      score: categoryScores.performance,
      findings: findings.performance,
      summary: parsedSections.performanceSummary || buildDefaultCategorySummary("performance", findings.performance),
    },
    visual: {
      name: "visual",
      score: categoryScores.visual,
      findings: findings.visual,
      summary: parsedSections.visualSummary || buildDefaultCategorySummary("visual", findings.visual),
    },
    serp: {
      name: "serp",
      score: categoryScores.serp,
      findings: findings.serp,
      summary: parsedSections.serpSummary || buildDefaultCategorySummary("serp", findings.serp),
    },
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
 * Build a default category summary when LLM text is not available.
 */
function buildDefaultCategorySummary(category: string, findings: AuditFinding[]): string {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  if (findings.length === 0) {
    return `No ${category} issues detected.`;
  }

  const parts: string[] = [];
  if (criticalCount > 0) parts.push(`${criticalCount} critical issue${criticalCount > 1 ? "s" : ""}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`);

  return `Found ${parts.join(" and ")} in ${category} audit.`;
}

// ============================================================================
// EXPORT ADDITIONAL HELPERS (for testing and external use)
// ============================================================================

export {
  calculateSecurityScore,
  calculateOverallScore,
  calculateGrade,
  calculateUrgency,
  categorizeFindings,
  prioritizeFindings,
  redactFindings,
  redactCoverage,
  redactSiteSnapshot,
  parseMarkdownSections,
};
