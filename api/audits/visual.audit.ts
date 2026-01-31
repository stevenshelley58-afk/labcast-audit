/**
 * Visual Audit - LLM-powered UX and design analysis
 *
 * Analyzes desktop and mobile screenshots using Gemini vision model
 * to identify UX issues, visual hierarchy problems, and mobile usability concerns.
 *
 * Input: RawSnapshot (screenshots), SiteSnapshot (page signals)
 * Output: AuditFinding[] - visual/UX findings
 *
 * Model: Gemini with vision support
 * Timeout: 30 seconds
 * Failure handling: Returns empty array, logs error
 */

import type { RawSnapshot, SiteSnapshot, AuditFinding } from "../audit.types.js";
import llmClient from "../llm/client.js";
import { getVisualAuditPrompt } from "../llm/prompts.js";

/**
 * Timeout for visual audit LLM call (30 seconds)
 */
const TIMEOUT_VISUAL_AUDIT = 30000;

/**
 * Runs visual audit using LLM vision analysis
 * 
 * @param rawSnapshot - RawSnapshot containing screenshots
 * @param siteSnapshot - SiteSnapshot containing page signals
 * @returns Array of visual audit findings (empty on failure)
 */
export async function runVisualAudit(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<AuditFinding[]> {
  // Check if screenshots exist
  if (!rawSnapshot.screenshots.data) {
    console.log("Visual audit skipped: no screenshot data available");
    return [];
  }

  const { desktop, mobile } = rawSnapshot.screenshots.data;

  // Need at least one screenshot to analyze
  if (!desktop && !mobile) {
    console.log("Visual audit skipped: no desktop or mobile screenshots");
    return [];
  }

  // Extract page signals for context
  const rootPage = siteSnapshot.pages[0];
  const title = rootPage?.title ?? "Unknown";
  const h1 = rootPage?.h1 ?? "Unknown";
  const hasCta = rootPage?.h1 !== null; // Simple CTA proxy detection

  // Build prompt with URL and deterministic signals
  const prompt = getVisualAuditPrompt(siteSnapshot.identity.normalizedUrl);

  // Collect available images
  const images: string[] = [];
  if (desktop) images.push(desktop);
  if (mobile) images.push(mobile);

  try {
    // Call LLM with vision capability
    const response = await Promise.race([
      llmClient.generateWithVision(prompt, images, {
        provider: "gemini",
        timeout: TIMEOUT_VISUAL_AUDIT,
        temperature: 0.3, // Lower temperature for consistent analysis
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Visual audit timeout")), TIMEOUT_VISUAL_AUDIT)
      ),
    ]);

    if (!response) {
      console.error("Visual audit failed: LLM returned null response");
      return [];
    }

    // Parse JSON response
    const parsed = parseVisualAuditResponse(response);
    
    if (!parsed || !Array.isArray(parsed.findings)) {
      console.error("Visual audit failed: invalid response format");
      return [];
    }

    // Convert to AuditFinding format
    return parsed.findings.map((finding): AuditFinding => ({
      type: mapVisualCategoryToFindingType(finding.category),
      severity: mapVisualSeverity(finding.severity),
      message: finding.description,
      evidence: {
        recommendation: finding.recommendation,
        category: finding.category,
        analyzedScreenshots: {
          desktop: !!desktop,
          mobile: !!mobile,
        },
        pageContext: {
          title,
          h1,
          hasCta,
        },
      },
    }));

  } catch (error) {
    console.error("Visual audit error:", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

/**
 * Raw finding from LLM visual audit response
 */
interface RawVisualFinding {
  category: string;
  severity: string;
  description: string;
  recommendation: string;
}

/**
 * Parsed response structure from visual audit
 */
interface VisualAuditResponse {
  findings: RawVisualFinding[];
}

/**
 * Parse and validate LLM response
 */
function parseVisualAuditResponse(response: string): VisualAuditResponse | null {
  try {
    // Try to extract JSON if wrapped in markdown
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || 
                      response.match(/```\s*([\s\S]*?)```/) ||
                      [null, response];
    
    const jsonStr = jsonMatch[1]?.trim() || response.trim();
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.findings || !Array.isArray(parsed.findings)) {
      console.error("Visual audit: missing findings array in response");
      return null;
    }

    return parsed as VisualAuditResponse;
  } catch (error) {
    console.error("Visual audit: failed to parse JSON response:", error);
    return null;
  }
}

/**
 * Map visual category to FindingType
 */
function mapVisualCategoryToFindingType(category: string): AuditFinding["type"] {
  const categoryMap: Record<string, AuditFinding["type"]> = {
    "visual_hierarchy": "visual_mobile_unfriendly",
    "cta": "visual_viewport_issues",
    "trust": "visual_text_too_small",
    "ux_friction": "visual_elements_too_close",
    "mobile": "visual_mobile_unfriendly",
  };

  return categoryMap[category.toLowerCase()] || "visual_viewport_issues";
}

/**
 * Map visual severity to Severity
 */
function mapVisualSeverity(severity: string): AuditFinding["severity"] {
  const severityMap: Record<string, AuditFinding["severity"]> = {
    "critical": "critical",
    "warning": "warning",
    "info": "info",
    "high": "warning",
    "medium": "warning",
    "low": "info",
  };

  return severityMap[severity.toLowerCase()] || "info";
}
