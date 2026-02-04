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
  /** Raw markdown analysis text from LLM - passed directly to synthesis */
  analysisText: string | null;
  /** Legacy findings array - kept for backward compatibility, always empty */
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
 * @returns Visual audit result with analysis text (findings array is empty - use analysisText)
 */
export async function runVisualAudit(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<AuditFinding[]> {
  const result = await runVisualAuditWithTrace(rawSnapshot, siteSnapshot);
  // Note: findings array is empty - visual analysis is now in analysisText
  return result.findings;
}

/**
 * Runs visual audit with full trace data for debugging
 *
 * @param rawSnapshot - RawSnapshot containing screenshots
 * @param siteSnapshot - SiteSnapshot containing page signals
 * @returns Visual audit result with analysis text and trace data
 */
export async function runVisualAuditWithTrace(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<VisualAuditResult> {
  // Check if screenshots exist
  if (!rawSnapshot.screenshots.data) {
    console.log("Visual audit skipped: no screenshot data available");
    return { analysisText: null, findings: [], trace: null };
  }

  const { desktop, mobile } = rawSnapshot.screenshots.data;

  // Need at least one screenshot to analyze
  if (!desktop && !mobile) {
    console.log("Visual audit skipped: no desktop or mobile screenshots");
    return { analysisText: null, findings: [], trace: null };
  }

  // Build prompt with URL
  const prompt = getVisualAuditPrompt(siteSnapshot.identity.normalizedUrl);
  const systemInstruction = "You are a UX and design expert analyzing website screenshots for usability issues. Provide detailed, actionable analysis in markdown format.";

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
      return { analysisText: null, findings: [], trace: null };
    }

    // Return raw markdown text - no JSON parsing needed
    // The synthesis LLM will consume this directly
    return {
      analysisText: llmResponse.text,
      findings: [], // Empty - visual analysis is in analysisText
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
    return { analysisText: null, findings: [], trace: null };
  }
}

// JSON parsing removed - visual audit now returns raw markdown text
// The synthesis LLM consumes the markdown directly
