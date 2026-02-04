/**
 * Visual Audit - LLM-powered UX and design analysis
 *
 * Analyzes desktop and mobile screenshots for both homepage and PDP using
 * Gemini vision model to identify UX issues, visual hierarchy problems,
 * and mobile usability concerns.
 *
 * Input: RawSnapshot (screenshots for homepage + PDP), SiteSnapshot (page signals)
 * Output: VisualAuditResult with raw markdown analysis text
 *
 * HTML signals passed to prompt:
 * - Page title, H1 heading, meta description
 * - Image count, schema markup presence
 *
 * Model: Gemini with vision support
 * Timeout: 30 seconds
 * Failure handling: Throws error (no silent failures)
 * - Missing screenshots -> Error
 * - LLM returns null -> Error
 * - Response too short (<200 chars) -> Error
 */

import type { RawSnapshot, SiteSnapshot, AuditFinding } from "../audit.types.js";
import llmClient from "../llm/client.js";
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
 * Minimum response length to consider the analysis valid
 * Anything shorter suggests a failed or incomplete analysis
 */
const MIN_RESPONSE_LENGTH = 200;

/**
 * Extract HTML signals from page signals for visual audit context
 */
function extractHtmlSignals(pageSignals: SiteSnapshot["pages"][0] | undefined): {
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  imageCount: number;
  hasSchema: boolean;
} {
  if (!pageSignals) {
    return {
      title: null,
      h1: null,
      metaDescription: null,
      imageCount: 0,
      hasSchema: false,
    };
  }

  return {
    title: pageSignals.title,
    h1: pageSignals.h1,
    metaDescription: pageSignals.metaDescription,
    imageCount: pageSignals.images.length,
    hasSchema: pageSignals.schema.length > 0,
  };
}

/**
 * Find page signals by URL from the site snapshot
 */
function findPageSignals(siteSnapshot: SiteSnapshot, url: string): SiteSnapshot["pages"][0] | undefined {
  // Try exact match first
  let page = siteSnapshot.pages.find((p) => p.url === url);
  if (page) return page;

  // Try matching without trailing slash differences
  const normalizedUrl = url.replace(/\/$/, "");
  page = siteSnapshot.pages.find((p) => p.url.replace(/\/$/, "") === normalizedUrl);
  if (page) return page;

  // Try matching by path (in case of www/non-www differences)
  try {
    const targetPath = new URL(url).pathname;
    page = siteSnapshot.pages.find((p) => {
      try {
        return new URL(p.url).pathname === targetPath;
      } catch {
        return false;
      }
    });
  } catch {
    // URL parsing failed, return undefined
  }

  return page;
}

/**
 * Runs visual audit with full trace data for debugging
 *
 * Analyzes both homepage and PDP screenshots using the LLM vision model.
 * Uses HTML signals from siteSnapshot to provide context to the analysis.
 *
 * @param rawSnapshot - RawSnapshot containing screenshots for homepage and PDP
 * @param siteSnapshot - SiteSnapshot containing page signals (title, h1, meta, etc.)
 * @returns Visual audit result with analysis text and trace data
 * @throws Error if no screenshots are available, LLM returns null, or response is too short
 */
export async function runVisualAuditWithTrace(
  rawSnapshot: RawSnapshot,
  siteSnapshot: SiteSnapshot
): Promise<VisualAuditResult> {
  // Check if screenshots data exists
  if (!rawSnapshot.screenshots.data) {
    throw new Error("Visual audit failed: no screenshot data available");
  }

  const screenshotsData = rawSnapshot.screenshots.data;

  // Collect all available screenshots and build prompts for each page type
  const images: string[] = [];
  const pageAnalyses: Array<{ pageType: "homepage" | "pdp"; url: string }> = [];

  // Process homepage screenshots
  if (screenshotsData.homepage) {
    const { desktop, mobile, finalUrl } = screenshotsData.homepage;
    if (desktop) images.push(desktop);
    if (mobile) images.push(mobile);
    if (desktop || mobile) {
      pageAnalyses.push({ pageType: "homepage", url: finalUrl });
    }
  }

  // Process PDP screenshots
  if (screenshotsData.pdp) {
    const { desktop, mobile, finalUrl } = screenshotsData.pdp;
    if (desktop) images.push(desktop);
    if (mobile) images.push(mobile);
    if (desktop || mobile) {
      pageAnalyses.push({ pageType: "pdp", url: finalUrl });
    }
  }

  // Fallback to legacy screenshot fields if new structure not populated
  if (images.length === 0 && (screenshotsData.desktop || screenshotsData.mobile)) {
    if (screenshotsData.desktop) images.push(screenshotsData.desktop);
    if (screenshotsData.mobile) images.push(screenshotsData.mobile);
    pageAnalyses.push({ pageType: "homepage", url: screenshotsData.finalUrl });
  }

  // Fail if no screenshots available
  if (images.length === 0) {
    throw new Error("Visual audit failed: no desktop or mobile screenshots available for any page");
  }

  // Build combined prompt for all pages
  // We analyze all pages in one LLM call for better cross-page consistency analysis
  const promptParts: string[] = [];
  const systemInstruction = "You are a UX and design expert analyzing website screenshots for usability issues. Provide detailed, actionable analysis in markdown format.";

  for (const { pageType, url } of pageAnalyses) {
    // Find page signals from siteSnapshot
    const pageSignals = findPageSignals(siteSnapshot, url);
    const htmlSignals = extractHtmlSignals(pageSignals);

    // Get prompt for this page type
    const pagePrompt = getVisualAuditPrompt(url, pageType, htmlSignals);
    promptParts.push(pagePrompt);
  }

  // Combine prompts with clear separation
  const combinedPrompt = pageAnalyses.length > 1
    ? `You are analyzing ${pageAnalyses.length} pages from the same website. The screenshots are provided in order: ${pageAnalyses.map((p) => `${p.pageType} (desktop, mobile)`).join(", ")}.

Analyze each page according to its specific requirements, then provide cross-page observations about consistency and overall UX.

${promptParts.join("\n\n---\n\n")}`
    : promptParts[0];

  // Calculate total image size
  const imageSize = images.reduce((total, img) => {
    // Base64 is ~4/3 larger than binary
    return total + Math.ceil((img.length * 3) / 4);
  }, 0);

  // Call LLM with vision capability and get metadata
  const llmResponse = await Promise.race([
    llmClient.generateWithVisionAndMetadata(combinedPrompt, images, {
      provider: "gemini",
      timeout: TIMEOUT_VISUAL_AUDIT,
      temperature: 0.3, // Lower temperature for consistent analysis
    }),
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("Visual audit timeout")), TIMEOUT_VISUAL_AUDIT)
    ),
  ]);

  // Fail if LLM returned null
  if (!llmResponse) {
    throw new Error("Visual audit failed: LLM returned null response");
  }

  // Fail if response is too short (suggests incomplete analysis)
  if (!llmResponse.text || llmResponse.text.length < MIN_RESPONSE_LENGTH) {
    throw new Error(
      `Visual audit failed: response too short (${llmResponse.text?.length || 0} chars, minimum ${MIN_RESPONSE_LENGTH}). This suggests an incomplete or failed analysis.`
    );
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
      prompt: combinedPrompt,
      promptTemplate: combinedPrompt,
      systemInstruction,
      response: llmResponse.text,
      usageMetadata: llmResponse.usageMetadata,
      temperature: llmResponse.temperature,
      hasImage: true,
      imageSize,
    },
  };
}

// JSON parsing removed - visual audit now returns raw markdown text
// The synthesis LLM consumes the markdown directly
