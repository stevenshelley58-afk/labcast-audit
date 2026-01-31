/**
 * SERP Audit - LLM-powered search results analysis
 * 
 * Analyzes SERP results and page metadata using Gemini 2.5 Flash
 * to identify snippet quality issues, intent mismatches, and CTR opportunities.
 * 
 * Input: RawSnapshot (SERP data), SiteSnapshot (page titles/descriptions)
 * Output: AuditFinding[] - SERP-related findings
 * 
 * Model: Gemini 2.5 Flash
 * Timeout: 30 seconds
 * Failure handling: Returns empty array, logs error
 */

import type { RawSnapshot, SiteSnapshot, AuditFinding } from "../audit.types.js";
import llmClient, { type LLMResponse } from "../llm/client.js";
import { getSerpAuditPrompt } from "../llm/prompts.js";

/**
 * Result from SERP audit including trace data for debugging
 */
export interface SerpAuditResult {
  findings: AuditFinding[];
  trace: {
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
  } | null;
}

/**
 * Timeout for SERP audit LLM call (30 seconds)
 */
const TIMEOUT_SERP_AUDIT = 30000;

/**
 * Runs SERP audit using LLM text analysis
 *
 * @param rawSnapshot - RawSnapshot containing SERP data
 * @param siteSnapshot - SiteSnapshot containing page titles/descriptions
 * @returns Array of SERP audit findings (empty on failure)
 */
export async function runSerpAudit(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<AuditFinding[]> {
  const result = await runSerpAuditWithTrace(rawSnapshot, siteSnapshot);
  return result.findings;
}

/**
 * Runs SERP audit with full trace data for debugging
 *
 * @param rawSnapshot - RawSnapshot containing SERP data
 * @param siteSnapshot - SiteSnapshot containing page titles/descriptions
 * @returns SERP audit result with findings and trace data
 */
export async function runSerpAuditWithTrace(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<SerpAuditResult> {
  // Check if SERP data exists
  if (!rawSnapshot.serpRaw.data) {
    console.log("SERP audit skipped: no SERP data available");
    return { findings: [], trace: null };
  }

  const serpData = rawSnapshot.serpRaw.data;

  // Need at least a query to analyze
  if (!serpData.query) {
    console.log("SERP audit skipped: no query in SERP data");
    return { findings: [], trace: null };
  }

  // Extract page titles and descriptions from siteSnapshot
  const pageTitles = siteSnapshot.pages.map((page) => ({
    url: page.url,
    title: page.title ?? "(missing)",
    description: page.metaDescription,
  }));

  // Build prompt with SERP data and page metadata
  const prompt = getSerpAuditPrompt(
    serpData.query,
    serpData.results,
    pageTitles
  );
  const systemInstruction = "You are an SEO expert analyzing search engine results and page metadata.";

  try {
    // Call LLM for text analysis with metadata
    const llmResponse = await Promise.race([
      llmClient.generateTextWithMetadata(prompt, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        timeout: TIMEOUT_SERP_AUDIT,
        temperature: 0.3, // Lower temperature for consistent analysis
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("SERP audit timeout")), TIMEOUT_SERP_AUDIT)
      ),
    ]);

    if (!llmResponse) {
      console.error("SERP audit failed: LLM returned null response");
      return { findings: [], trace: null };
    }

    // Parse JSON response
    const parsed = parseSerpAuditResponse(llmResponse.text);

    if (!parsed || !Array.isArray(parsed.findings)) {
      console.error("SERP audit failed: invalid response format");
      return {
        findings: [],
        trace: {
          stepId: "serp",
          stepName: "SERP Analysis",
          model: llmResponse.model,
          provider: llmResponse.provider,
          durationMs: llmResponse.durationMs,
          prompt,
          promptTemplate: prompt,
          systemInstruction,
          response: llmResponse.text,
          usageMetadata: llmResponse.usageMetadata,
          temperature: llmResponse.temperature,
        }
      };
    }

    // Convert to AuditFinding format
    const findings = parsed.findings.map((finding): AuditFinding => ({
      type: mapSerpTypeToFindingType(finding.type),
      severity: mapSerpImpactToSeverity(finding.impact),
      message: finding.description,
      evidence: {
        action: finding.action,
        serpType: finding.type,
        query: serpData.query,
        resultCount: serpData.results.length,
        analyzedPages: pageTitles.length,
      },
    }));

    return {
      findings,
      trace: {
        stepId: "serp",
        stepName: "SERP Analysis",
        model: llmResponse.model,
        provider: llmResponse.provider,
        durationMs: llmResponse.durationMs,
        prompt,
        promptTemplate: prompt,
        systemInstruction,
        response: llmResponse.text,
        usageMetadata: llmResponse.usageMetadata,
        temperature: llmResponse.temperature,
      },
    };

  } catch (error) {
    console.error("SERP audit error:", error instanceof Error ? error.message : "Unknown error");
    return { findings: [], trace: null };
  }
}

/**
 * Raw finding from LLM SERP audit response
 */
interface RawSerpFinding {
  type: string;
  impact: string;
  description: string;
  action: string;
}

/**
 * Parsed response structure from SERP audit
 */
interface SerpAuditResponse {
  findings: RawSerpFinding[];
}

/**
 * Parse and validate LLM response
 */
function parseSerpAuditResponse(response: string): SerpAuditResponse | null {
  try {
    // Try to extract JSON if wrapped in markdown
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || 
                      response.match(/```\s*([\s\S]*?)```/) ||
                      [null, response];
    
    const jsonStr = jsonMatch[1]?.trim() || response.trim();
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.findings || !Array.isArray(parsed.findings)) {
      console.error("SERP audit: missing findings array in response");
      return null;
    }

    return parsed as SerpAuditResponse;
  } catch (error) {
    console.error("SERP audit: failed to parse JSON response:", error);
    return null;
  }
}

/**
 * Map SERP finding type to FindingType
 */
function mapSerpTypeToFindingType(type: string): AuditFinding["type"] {
  const typeMap: Record<string, AuditFinding["type"]> = {
    "snippet_quality": "serp_title_mismatch",
    "intent_mismatch": "serp_wrong_page_ranking",
    "missing_page_type": "serp_not_indexed",
    "ctr_opportunity": "serp_description_mismatch",
  };

  return typeMap[type.toLowerCase()] || "serp_description_mismatch";
}

/**
 * Map SERP impact to Severity
 */
function mapSerpImpactToSeverity(impact: string): AuditFinding["severity"] {
  const impactMap: Record<string, AuditFinding["severity"]> = {
    "high": "critical",
    "medium": "warning",
    "low": "info",
  };

  return impactMap[impact.toLowerCase()] || "info";
}
