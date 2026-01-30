/**
 * Content Quality Micro-Audit
 *
 * Evaluates content for search intent alignment and E-E-A-T signals.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { PageSnapshot } from '../extractors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import { CONTENT_QUALITY_PROMPT, interpolatePrompt } from './prompts.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runContentQualityAudit(
  snapshot: PageSnapshot,
  contentPreview: string
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('content-quality');
  const registry = getProviderRegistry();

  // Prepare prompt variables
  const variables = {
    url: snapshot.url,
    title: snapshot.title || 'Missing',
    wordCount: snapshot.wordCount,
    contentPreview: contentPreview.substring(0, 2000) || 'Content not available',
    navStructure:
      snapshot.navAnchors.length > 0
        ? snapshot.navAnchors.slice(0, 10).map((a) => a.text).join(' | ')
        : 'Navigation not extracted',
    hasForms: snapshot.hasForms ? 'Yes' : 'No',
    schemaTypes:
      snapshot.schemas.length > 0
        ? snapshot.schemas.map((s) => s.type).join(', ')
        : 'None found',
  };

  const prompt = interpolatePrompt(CONTENT_QUALITY_PROMPT, variables);

  try {
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction:
            'You are a Content Quality Analyst. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.4,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(
        `Content Quality audit: ${assignment.primary} failed, trying ${assignment.fallback}`
      );
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction:
            'You are a Content Quality Analyst. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.4,
        },
      });
    }

    // Parse findings
    const llmFindings = parseFindingsFromResponse(result.text);

    // Add deterministic findings
    const deterministicFindings = getDeterministicContentFindings(snapshot);

    // Merge
    const allFindings = [...deterministicFindings, ...llmFindings];

    return {
      auditType: 'content-quality',
      findings: allFindings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
      prompt: {
        template: CONTENT_QUALITY_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Content Quality Analyst. Respond with valid JSON only.',
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'content-quality',
      findings: getDeterministicContentFindings(snapshot),
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
      prompt: {
        template: CONTENT_QUALITY_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Content Quality Analyst. Respond with valid JSON only.',
      },
    };
  }
}

// ============================================================================
// Response Parser
// ============================================================================

function parseFindingsFromResponse(text: string): MicroAuditFinding[] {
  try {
    const cleaned = text.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('Content Quality audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('Content Quality audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `content-llm-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'content' as const,
      source: 'content-quality' as const,
    }));
  } catch (err) {
    console.error('Content Quality audit: Failed to parse findings', err);
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

// ============================================================================
// Deterministic Pre-Analysis
// ============================================================================

export function getDeterministicContentFindings(
  snapshot: PageSnapshot
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];

  // Thin content
  if (snapshot.isThinContent) {
    findings.push({
      id: 'content-det-1',
      finding: 'Thin content detected',
      evidence: `Word count: ${snapshot.wordCount} (recommended minimum: 300 words)`,
      whyItMatters:
        'Thin content is less likely to rank well and may be seen as low-quality by search engines',
      fix: 'Expand the content with valuable, relevant information that fully addresses user intent',
      priority: snapshot.wordCount < 100 ? 'high' : 'medium',
      category: 'content',
      source: 'content-quality',
    });
  }

  // Very short content
  if (snapshot.wordCount < 100) {
    findings.push({
      id: 'content-det-2',
      finding: 'Extremely low content volume',
      evidence: `Only ${snapshot.wordCount} words on the page`,
      whyItMatters:
        'Pages with very little content rarely provide value to users or rank competitively',
      fix: 'Add substantial, unique content that comprehensively covers the topic',
      priority: 'high',
      category: 'content',
      source: 'content-quality',
    });
  }

  // No internal linking
  if (snapshot.internalLinkCount < 3) {
    findings.push({
      id: 'content-det-3',
      finding: 'Limited internal linking',
      evidence: `Only ${snapshot.internalLinkCount} internal links found`,
      whyItMatters:
        'Internal links help users navigate, distribute page authority, and help search engines discover content',
      fix: 'Add relevant internal links to related pages and important content',
      priority: 'medium',
      category: 'content',
      source: 'content-quality',
    });
  }

  // No headings structure
  if (snapshot.headings.length < 3) {
    findings.push({
      id: 'content-det-4',
      finding: 'Limited content structure',
      evidence: `Only ${snapshot.headings.length} headings on the page`,
      whyItMatters:
        'Well-structured content with headings improves readability and helps search engines understand content hierarchy',
      fix: 'Break up content with meaningful headings (H2, H3) that organize topics logically',
      priority: 'medium',
      category: 'content',
      source: 'content-quality',
    });
  }

  // Missing language attribute
  if (!snapshot.lang) {
    findings.push({
      id: 'content-det-5',
      finding: 'Missing language declaration',
      evidence: 'No lang attribute on <html> element',
      whyItMatters:
        'The lang attribute helps search engines and screen readers understand the page language',
      fix: 'Add lang="en" (or appropriate language code) to the <html> element',
      priority: 'low',
      category: 'content',
      source: 'content-quality',
    });
  }

  return findings;
}

// ============================================================================
// Content Analysis Utilities
// ============================================================================

/**
 * Extract readable content from HTML for preview
 */
export function extractContentPreview(html: string, maxLength: number = 2000): string {
  // Remove scripts and styles
  let content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

  // Extract text from main content areas
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const contentArea = mainMatch?.[1] || articleMatch?.[1] || content;

  // Strip tags and clean up
  const text = contentArea
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Decode entities
  const decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return decoded.substring(0, maxLength);
}
