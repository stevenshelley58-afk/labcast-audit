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
import llmClient from "../llm/client.js";
import { getSerpAuditPrompt } from "../llm/prompts.js";

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
  // Check if SERP data exists
  if (!rawSnapshot.serpRaw.data) {
    console.log("SERP audit skipped: no SERP data available");
    return [];
  }

  const serpData = rawSnapshot.serpRaw.data;

  // Need at least a query to analyze
  if (!serpData.query) {
    console.log("SERP audit skipped: no query in SERP data");
    return [];
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

  try {
    // Call LLM for text analysis
    const response = await Promise.race([
      llmClient.generateText(prompt, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        timeout: TIMEOUT_SERP_AUDIT,
        temperature: 0.3, // Lower temperature for consistent analysis
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("SERP audit timeout")), TIMEOUT_SERP_AUDIT)
      ),
    ]);

    if (!response) {
      console.error("SERP audit failed: LLM returned null response");
      return [];
    }

    // Parse JSON response
    const parsed = parseSerpAuditResponse(response);
    
    if (!parsed || !Array.isArray(parsed.findings)) {
      console.error("SERP audit failed: invalid response format");
      return [];
    }

    // Convert to AuditFinding format
    return parsed.findings.map((finding): AuditFinding => ({
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

  } catch (error) {
    console.error("SERP audit error:", error instanceof Error ? error.message : "Unknown error");
    return [];
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
