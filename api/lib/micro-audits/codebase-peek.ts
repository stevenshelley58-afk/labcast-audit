/**
 * Codebase Peek Micro-Audit
 *
 * Analyzes HTML source for technical issues.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { PageSnapshot } from '../extractors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import { CODEBASE_PEEK_PROMPT, interpolatePrompt, formatArrayForPrompt } from './prompts.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runCodebasePeekAudit(
  htmlSource: string,
  snapshot: PageSnapshot
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('codebase-peek');
  const registry = getProviderRegistry();

  // Pre-analyze HTML for common issues
  const detectedIssues = analyzeHtmlSource(htmlSource);

  // Prepare prompt variables
  const variables = {
    htmlSource: htmlSource.substring(0, 4000), // Truncate for LLM
    detectedIssues: formatArrayForPrompt(detectedIssues),
  };

  const prompt = interpolatePrompt(CODEBASE_PEEK_PROMPT, variables);

  try {
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction:
            'You are a Frontend Code Quality auditor. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(
        `Codebase Peek audit: ${assignment.primary} failed, trying ${assignment.fallback}`
      );
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction:
            'You are a Frontend Code Quality auditor. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    }

    // Parse findings
    const llmFindings = parseFindingsFromResponse(result.text);

    // Add deterministic findings
    const deterministicFindings = getDeterministicCodeFindings(htmlSource, snapshot);

    // Merge
    const allFindings = [...deterministicFindings, ...llmFindings];

    return {
      auditType: 'codebase-peek',
      findings: allFindings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'codebase-peek',
      findings: getDeterministicCodeFindings(htmlSource, snapshot),
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
// Response Parser
// ============================================================================

function parseFindingsFromResponse(text: string): MicroAuditFinding[] {
  try {
    const cleaned = text.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('Codebase Peek audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('Codebase Peek audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `code-llm-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'technical' as const,
      source: 'codebase-peek' as const,
    }));
  } catch (err) {
    console.error('Codebase Peek audit: Failed to parse findings', err);
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
// HTML Source Analysis
// ============================================================================

function analyzeHtmlSource(html: string): string[] {
  const issues: string[] = [];

  // Count inline styles
  const inlineStyleCount = (html.match(/style=["'][^"']+["']/gi) || []).length;
  if (inlineStyleCount > 10) {
    issues.push(`Excessive inline styles found (${inlineStyleCount} occurrences)`);
  }

  // Count inline scripts
  const inlineScriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  const inlineScripts = inlineScriptMatches.filter(
    (s) => !s.includes('src=') && !s.includes('type="application/ld+json"')
  );
  if (inlineScripts.length > 3) {
    issues.push(`Multiple inline scripts found (${inlineScripts.length})`);
  }

  // Check for deprecated elements
  const deprecatedElements = ['<font', '<center', '<marquee', '<blink'];
  for (const element of deprecatedElements) {
    if (html.toLowerCase().includes(element)) {
      issues.push(`Deprecated element found: ${element}`);
    }
  }

  // Check for render-blocking scripts in head
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const head = headMatch[1];
    const blockingScripts = (
      head.match(/<script[^>]*src=[^>]*>/gi) || []
    ).filter((s) => !s.includes('async') && !s.includes('defer'));
    if (blockingScripts.length > 2) {
      issues.push(`Render-blocking scripts in head (${blockingScripts.length})`);
    }
  }

  // Check for document.write
  if (html.includes('document.write')) {
    issues.push('document.write() detected (blocks parsing)');
  }

  // Check for large inline CSS
  const styleBlocks: string[] = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  const totalInlineCSS = styleBlocks.reduce((sum, block) => sum + block.length, 0);
  if (totalInlineCSS > 10000) {
    issues.push(`Large inline CSS (${Math.round(totalInlineCSS / 1024)}KB)`);
  }

  // Detect common frameworks
  const frameworks: string[] = [];
  if (html.includes('react') || html.includes('__NEXT_DATA__')) {
    frameworks.push('React/Next.js');
  }
  if (html.includes('ng-') || html.includes('angular')) {
    frameworks.push('Angular');
  }
  if (html.includes('vue') || html.includes('data-v-')) {
    frameworks.push('Vue.js');
  }
  if (html.includes('jquery') || html.includes('jQuery')) {
    frameworks.push('jQuery');
  }
  if (frameworks.length > 0) {
    issues.push(`Detected frameworks: ${frameworks.join(', ')}`);
  }

  return issues;
}

// ============================================================================
// Deterministic Pre-Analysis
// ============================================================================

export function getDeterministicCodeFindings(
  html: string,
  snapshot: PageSnapshot
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];

  // Render-blocking resources
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const head = headMatch[1];
    const blockingScripts = (
      head.match(/<script[^>]*src=[^>]*>/gi) || []
    ).filter((s) => !s.includes('async') && !s.includes('defer'));

    if (blockingScripts.length > 2) {
      findings.push({
        id: 'code-det-1',
        finding: 'Render-blocking scripts in document head',
        evidence: `${blockingScripts.length} scripts without async/defer in <head>`,
        whyItMatters:
          'Render-blocking scripts delay page rendering, hurting LCP and user experience',
        fix: 'Add async or defer attributes to scripts, or move them to the end of body',
        priority: 'high',
        category: 'technical',
        source: 'codebase-peek',
      });
    }
  }

  // document.write usage
  if (html.includes('document.write')) {
    findings.push({
      id: 'code-det-2',
      finding: 'document.write() detected',
      evidence: 'document.write found in page source',
      whyItMatters:
        'document.write blocks HTML parsing and can significantly slow down page loading',
      fix: 'Replace document.write with modern DOM manipulation methods',
      priority: 'medium',
      category: 'technical',
      source: 'codebase-peek',
    });
  }

  // Excessive inline styles
  const inlineStyleCount = (html.match(/style=["'][^"']+["']/gi) || []).length;
  if (inlineStyleCount > 20) {
    findings.push({
      id: 'code-det-3',
      finding: 'Excessive inline styles',
      evidence: `${inlineStyleCount} inline style attributes found`,
      whyItMatters:
        'Inline styles increase HTML size and make styling harder to maintain',
      fix: 'Move inline styles to external CSS files or CSS-in-JS solutions',
      priority: 'low',
      category: 'technical',
      source: 'codebase-peek',
    });
  }

  // Missing charset
  if (!snapshot.charset) {
    findings.push({
      id: 'code-det-4',
      finding: 'Missing character encoding declaration',
      evidence: 'No charset meta tag found',
      whyItMatters:
        'Missing charset can cause character encoding issues and security vulnerabilities',
      fix: 'Add <meta charset="utf-8"> as the first element in <head>',
      priority: 'medium',
      category: 'technical',
      source: 'codebase-peek',
    });
  }

  // Large HTML size
  const htmlSize = html.length;
  if (htmlSize > 500000) {
    findings.push({
      id: 'code-det-5',
      finding: 'Large HTML document size',
      evidence: `HTML size: ${Math.round(htmlSize / 1024)}KB`,
      whyItMatters:
        'Large HTML documents take longer to download and parse, affecting performance',
      fix: 'Consider server-side rendering optimizations, lazy loading, or pagination',
      priority: 'medium',
      category: 'technical',
      source: 'codebase-peek',
    });
  }

  return findings;
}
