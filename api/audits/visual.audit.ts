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
import llmClient, { type LLMResponse } from "../llm/client.js";
import { getVisualAuditPrompt } from "../llm/prompts.js";

/**
 * Result from visual audit including trace data for debugging
 */
export interface VisualAuditResult {
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
    hasImage: boolean;
    imageSize?: number;
  } | null;
}

/**
 * Timeout for visual audit LLM call (30 seconds)
 */
const TIMEOUT_VISUAL_AUDIT = 30000;

/**
 * Runs visual audit using LLM vision analysis
 *
 * @param rawSnapshot - RawSnapshot containing screenshots
 * @param siteSnapshot - SiteSnapshot containing page signals
 * @returns Visual audit result with findings and trace data
 */
export async function runVisualAudit(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<AuditFinding[]> {
  const result = await runVisualAuditWithTrace(rawSnapshot, siteSnapshot);
  return result.findings;
}

/**
 * Runs visual audit with full trace data for debugging
 *
 * @param rawSnapshot - RawSnapshot containing screenshots
 * @param siteSnapshot - SiteSnapshot containing page signals
 * @returns Visual audit result with findings and trace data
 */
export async function runVisualAuditWithTrace(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<VisualAuditResult> {
  // Check if screenshots exist
  if (!rawSnapshot.screenshots.data) {
    console.log("Visual audit skipped: no screenshot data available");
    return { findings: [], trace: null };
  }

  const { desktop, mobile } = rawSnapshot.screenshots.data;

  // Need at least one screenshot to analyze
  if (!desktop && !mobile) {
    console.log("Visual audit skipped: no desktop or mobile screenshots");
    return { findings: [], trace: null };
  }

  // Extract page signals for context
  const rootPage = siteSnapshot.pages[0];
  const title = rootPage?.title ?? "Unknown";
  const h1 = rootPage?.h1 ?? "Unknown";
  const hasCta = rootPage?.h1 !== null; // Simple CTA proxy detection

  // Build prompt with URL and deterministic signals
  const prompt = getVisualAuditPrompt(siteSnapshot.identity.normalizedUrl);
  const systemInstruction = "You are a UX and design expert analyzing website screenshots for usability issues.";

  // Collect available images
  const images: string[] = [];
  if (desktop) images.push(desktop);
  if (mobile) images.push(mobile);

  // Calculate image size
  const imageSize = images.reduce((total, img) => {
    // Base64 is ~4/3 larger than binary
    return total + Math.ceil((img.length * 3) / 4);
  }, 0);

  try {
    // Call LLM with vision capability and get metadata
    const llmResponse = await Promise.race([
      llmClient.generateWithVisionAndMetadata(prompt, images, {
        provider: "gemini",
        timeout: TIMEOUT_VISUAL_AUDIT,
        temperature: 0.3, // Lower temperature for consistent analysis
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Visual audit timeout")), TIMEOUT_VISUAL_AUDIT)
      ),
    ]);

    if (!llmResponse) {
      console.error("Visual audit failed: LLM returned null response");
      return { findings: [], trace: null };
    }

    // Parse JSON response
    const parsed = parseVisualAuditResponse(llmResponse.text);

    if (!parsed || !Array.isArray(parsed.findings)) {
      console.error("Visual audit failed: invalid response format");
      return {
        findings: [],
        trace: {
          stepId: "visual",
          stepName: "Visual Analysis",
          model: llmResponse.model,
          provider: llmResponse.provider,
          durationMs: llmResponse.durationMs,
          prompt,
          promptTemplate: prompt,
          systemInstruction,
          response: llmResponse.text,
          usageMetadata: llmResponse.usageMetadata,
          temperature: llmResponse.temperature,
          hasImage: true,
          imageSize,
        }
      };
    }

    // Convert to AuditFinding format
    const findings = parsed.findings.map((finding): AuditFinding => ({
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

    return {
      findings,
      trace: {
        stepId: "visual",
        stepName: "Visual Analysis",
        model: llmResponse.model,
        provider: llmResponse.provider,
        durationMs: llmResponse.durationMs,
        prompt,
        promptTemplate: prompt,
        systemInstruction,
        response: llmResponse.text,
        usageMetadata: llmResponse.usageMetadata,
        temperature: llmResponse.temperature,
        hasImage: true,
        imageSize,
      },
    };

  } catch (error) {
    console.error("Visual audit error:", error instanceof Error ? error.message : "Unknown error");
    return { findings: [], trace: null };
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
