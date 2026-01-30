/**
 * Technical SEO Micro-Audit
 *
 * Analyzes crawlability, indexability, and technical SEO signals.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { Layer1Result } from '../collectors/index.js';
import type { PageSnapshot } from '../extractors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import {
  TECHNICAL_SEO_PROMPT,
  interpolatePrompt,
  formatHeadersForPrompt,
  formatArrayForPrompt,
} from './prompts.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runTechnicalSeoAudit(
  layer1: Layer1Result,
  snapshot: PageSnapshot
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('technical-seo');
  const registry = getProviderRegistry();

  // Prepare prompt variables
  const variables = {
    robotsTxt: layer1.evidence.robots.content || 'Not found or empty',
    sitemapUrlCount: layer1.crawlData.sitemapUrls.length,
    sitemapSample: layer1.crawlData.sitemapUrls.slice(0, 5).join('\n') || 'No URLs found',
    headers: formatHeadersForPrompt(layer1.evidence.headers.httpsHeaders),
    redirectChain:
      layer1.evidence.headers.redirectChain.length > 0
        ? layer1.evidence.headers.redirectChain.join(' → ')
        : 'No redirects',
    canonical: snapshot.canonical || 'Not set',
    metaRobots: snapshot.metaRobots || 'Not set',
  };

  const template = TECHNICAL_SEO_PROMPT;
  const prompt = interpolatePrompt(template, variables);

  try {
    // Try primary provider, fall back if needed
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction: 'You are a Technical SEO expert. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(`Technical SEO audit: ${assignment.primary} failed, trying ${assignment.fallback}`);
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction: 'You are a Technical SEO expert. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    }

    // Parse findings
    const findings = parseFindingsFromResponse(result.text);

    return {
      auditType: 'technical-seo',
      findings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
      prompt: {
        template: TECHNICAL_SEO_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Technical SEO expert. Respond with valid JSON only.',
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'technical-seo',
      findings: [],
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
      prompt: {
        template: TECHNICAL_SEO_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Technical SEO expert. Respond with valid JSON only.',
      },
    };
  }
}

// ============================================================================
// Response Parser
// ============================================================================

function parseFindingsFromResponse(text: string): MicroAuditFinding[] {
  try {
    // Try to parse as JSON array
    const cleaned = text.trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('Technical SEO audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('Technical SEO audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `tech-seo-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'technical' as const,
      source: 'technical-seo' as const,
    }));
  } catch (err) {
    console.error('Technical SEO audit: Failed to parse findings', err);
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

/**
 * Generate deterministic findings before LLM analysis
 * These are guaranteed findings based on data presence/absence
 */
export function getDeterministicTechnicalFindings(
  layer1: Layer1Result,
  snapshot: PageSnapshot
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];

  // Missing robots.txt
  if (!layer1.evidence.robots.content && layer1.evidence.robots.status === '404') {
    findings.push({
      id: 'tech-det-1',
      finding: 'Missing robots.txt file',
      evidence: `HTTP 404 response from ${layer1.url}/robots.txt`,
      whyItMatters:
        'Search engines may not have clear crawling directives, potentially wasting crawl budget',
      fix: 'Create a robots.txt file with appropriate directives',
      priority: 'medium',
      category: 'technical',
      source: 'technical-seo',
    });
  }

  // Missing sitemap
  if (layer1.crawlData.sitemapUrls.length === 0) {
    findings.push({
      id: 'tech-det-2',
      finding: 'No sitemap detected',
      evidence: 'No sitemap URLs found at /sitemap.xml or referenced in robots.txt',
      whyItMatters:
        'Search engines may miss important pages, reducing indexation coverage',
      fix: 'Create and submit an XML sitemap to Google Search Console',
      priority: 'high',
      category: 'technical',
      source: 'technical-seo',
    });
  }

  // Missing canonical
  if (!snapshot.canonical) {
    findings.push({
      id: 'tech-det-3',
      finding: 'Missing canonical tag',
      evidence: 'No <link rel="canonical"> found in HTML head',
      whyItMatters:
        'Search engines may index duplicate versions of this page, diluting ranking signals',
      fix: 'Add a self-referencing canonical tag to the page',
      priority: 'high',
      category: 'technical',
      source: 'technical-seo',
    });
  }

  // Redirect chain
  if (layer1.evidence.headers.redirectChain.length > 2) {
    findings.push({
      id: 'tech-det-4',
      finding: 'Excessive redirect chain detected',
      evidence: `${layer1.evidence.headers.redirectChain.length} redirects: ${layer1.evidence.headers.redirectChain.join(' → ')}`,
      whyItMatters:
        'Redirect chains slow page loading and may cause search engines to stop following',
      fix: 'Consolidate redirects to a single hop where possible',
      priority: 'medium',
      category: 'technical',
      source: 'technical-seo',
    });
  }

  // Noindex directive
  if (snapshot.metaRobots?.toLowerCase().includes('noindex')) {
    findings.push({
      id: 'tech-det-5',
      finding: 'Page has noindex directive',
      evidence: `Meta robots: "${snapshot.metaRobots}"`,
      whyItMatters: 'This page will not appear in search results',
      fix: 'Remove noindex directive if this page should be indexed',
      priority: 'critical',
      category: 'technical',
      source: 'technical-seo',
    });
  }

  return findings;
}
