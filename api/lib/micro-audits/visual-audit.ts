/**
 * Visual Audit Micro-Audit
 *
 * Analyzes visual design and UX using either:
 * - Mode A: Gemini URL Context (visits the page live)
 * - Mode B: Screenshot analysis (GPT-4o Vision)
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import {
  VISUAL_AUDIT_URL_CONTEXT_PROMPT,
  VISUAL_AUDIT_SCREENSHOT_PROMPT,
  interpolatePrompt,
} from './prompts.js';

// ============================================================================
// Mode A: URL Context (Gemini)
// ============================================================================

export async function runVisualAuditUrlContext(
  url: string
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('visual-url-context');
  const registry = getProviderRegistry();

  const prompt = interpolatePrompt(VISUAL_AUDIT_URL_CONTEXT_PROMPT, { url });

  try {
    const result = await registry.generateWith('gemini', {
      prompt,
      options: {
        model: assignment.model,
        systemInstruction:
          'You are a UX/Visual Design auditor. Visit the URL and analyze the visual design. Respond with valid JSON only.',
        responseFormat: 'json',
        temperature: 0.4,
      },
      tools: {
        urlContext: true,
      },
    });

    const findings = parseFindingsFromResponse(result.text, 'visual-url-context');

    return {
      auditType: 'visual-url-context',
      findings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'visual-url-context',
      findings: [],
      rawOutput: '',
      provider: 'gemini',
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
    };
  }
}

// ============================================================================
// Mode B: Screenshot Analysis (GPT-4o or Gemini)
// ============================================================================

export async function runVisualAuditScreenshot(
  screenshotBase64: string
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('visual-screenshot');
  const registry = getProviderRegistry();

  try {
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt: VISUAL_AUDIT_SCREENSHOT_PROMPT,
        image: screenshotBase64,
        imageMimeType: 'image/jpeg',
        options: {
          model: assignment.model,
          systemInstruction:
            'You are a UX/Visual Design auditor. Analyze the screenshot. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.4,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(
        `Visual Screenshot audit: ${assignment.primary} failed, trying ${assignment.fallback}`
      );
      result = await registry.generateWith(assignment.fallback, {
        prompt: VISUAL_AUDIT_SCREENSHOT_PROMPT,
        image: screenshotBase64,
        imageMimeType: 'image/jpeg',
        options: {
          systemInstruction:
            'You are a UX/Visual Design auditor. Analyze the screenshot. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.4,
        },
      });
    }

    const findings = parseFindingsFromResponse(result.text, 'visual-screenshot');

    return {
      auditType: 'visual-screenshot',
      findings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'visual-screenshot',
      findings: [],
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
    };
  }
}

// ============================================================================
// Combined Visual Audit
// ============================================================================

export interface VisualAuditOptions {
  mode: 'url_context' | 'screenshot' | 'both';
  url: string;
  screenshotBase64?: string;
}

export async function runVisualAudit(
  options: VisualAuditOptions
): Promise<MicroAuditResult[]> {
  const results: MicroAuditResult[] = [];

  if (options.mode === 'url_context' || options.mode === 'both') {
    const urlContextResult = await runVisualAuditUrlContext(options.url);
    results.push(urlContextResult);
  }

  if (
    (options.mode === 'screenshot' || options.mode === 'both') &&
    options.screenshotBase64
  ) {
    const screenshotResult = await runVisualAuditScreenshot(options.screenshotBase64);
    results.push(screenshotResult);
  }

  return results;
}

// ============================================================================
// Screenshot Capture
// ============================================================================

/**
 * Capture a screenshot using WordPress Mshots service
 */
export async function captureScreenshot(
  url: string,
  timeout: number = 15000
): Promise<string | null> {
  try {
    const encodedUrl = encodeURIComponent(url);
    const screenshotUrl = `https://s0.wp.com/mshots/v1/${encodedUrl}?w=1280&h=960`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(screenshotUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Screenshot capture failed: HTTP ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    return null;
  }
}

// ============================================================================
// Response Parser
// ============================================================================

function parseFindingsFromResponse(
  text: string,
  source: 'visual-url-context' | 'visual-screenshot'
): MicroAuditFinding[] {
  try {
    const cleaned = text.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`Visual audit (${source}): No JSON array found in response`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn(`Visual audit (${source}): Parsed result is not an array`);
      return [];
    }

    const prefix = source === 'visual-url-context' ? 'visual-uc' : 'visual-ss';

    return parsed.map((item, index) => ({
      id: `${prefix}-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'design' as const,
      source,
    }));
  } catch (err) {
    console.error(`Visual audit (${source}): Failed to parse findings`, err);
    return [];
  }
}

function normalizePriority(
  priority: string | undefined
): 'critical' | 'high' | 'medium' | 'low' {
  const normalized = (priority || 'medium').toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
    return normalized as 'critical' | 'high' | 'medium' | 'low';
  }
  return 'medium';
}
