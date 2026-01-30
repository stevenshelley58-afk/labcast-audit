/**
 * On-Page SEO Micro-Audit
 *
 * Analyzes titles, meta descriptions, headings, and content structure.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { PageSnapshot } from '../extractors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import {
  ON_PAGE_SEO_PROMPT,
  interpolatePrompt,
  formatHeadingsForPrompt,
  formatArrayForPrompt,
} from './prompts.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runOnPageSeoAudit(
  snapshot: PageSnapshot
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('on-page-seo');
  const registry = getProviderRegistry();

  // Prepare prompt variables
  const variables = {
    title: snapshot.title || 'Missing',
    titleLength: snapshot.title?.length || 0,
    metaDescription: snapshot.metaDescription || 'Missing',
    metaDescriptionLength: snapshot.metaDescription?.length || 0,
    headings: formatHeadingsForPrompt(snapshot.headings),
    wordCount: snapshot.wordCount,
    internalLinks: snapshot.internalLinkCount,
    externalLinks: snapshot.externalLinkCount,
    ogTitle: snapshot.openGraph.title || 'Not set',
    ogDescription: snapshot.openGraph.description || 'Not set',
    ogImage: snapshot.openGraph.image ? 'Present' : 'Missing',
    schemaTypes:
      snapshot.schemas.length > 0
        ? snapshot.schemas.map((s) => s.type).join(', ')
        : 'None found',
  };

  const prompt = interpolatePrompt(ON_PAGE_SEO_PROMPT, variables);

  try {
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction:
            'You are an On-Page SEO expert. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(
        `On-Page SEO audit: ${assignment.primary} failed, trying ${assignment.fallback}`
      );
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction:
            'You are an On-Page SEO expert. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    }

    // Parse findings
    const llmFindings = parseFindingsFromResponse(result.text);

    // Add deterministic findings
    const deterministicFindings = getDeterministicOnPageFindings(snapshot);

    // Merge (deterministic first)
    const allFindings = [...deterministicFindings, ...llmFindings];

    return {
      auditType: 'on-page-seo',
      findings: allFindings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
      prompt: {
        template: ON_PAGE_SEO_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are an On-Page SEO expert. Respond with valid JSON only.',
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'on-page-seo',
      findings: getDeterministicOnPageFindings(snapshot),
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
      prompt: {
        template: ON_PAGE_SEO_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are an On-Page SEO expert. Respond with valid JSON only.',
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
      console.warn('On-Page SEO audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('On-Page SEO audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `onpage-llm-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'seo' as const,
      source: 'on-page-seo' as const,
    }));
  } catch (err) {
    console.error('On-Page SEO audit: Failed to parse findings', err);
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

export function getDeterministicOnPageFindings(
  snapshot: PageSnapshot
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];

  // Missing title
  if (!snapshot.title) {
    findings.push({
      id: 'onpage-det-1',
      finding: 'Missing page title',
      evidence: 'No <title> tag found in HTML head',
      whyItMatters:
        'Title tags are a primary ranking factor and determine how your page appears in search results',
      fix: 'Add a unique, descriptive title tag (50-60 characters) that includes your target keyword',
      priority: 'critical',
      category: 'seo',
      source: 'on-page-seo',
    });
  } else {
    // Title length issues
    if (snapshot.title.length > 60) {
      findings.push({
        id: 'onpage-det-2',
        finding: 'Title tag is too long',
        evidence: `Title: "${snapshot.title}" (${snapshot.title.length} characters)`,
        whyItMatters:
          'Titles over 60 characters may be truncated in search results, losing important information',
        fix: 'Shorten the title to 50-60 characters while keeping the main keyword near the beginning',
        priority: 'medium',
        category: 'seo',
        source: 'on-page-seo',
      });
    } else if (snapshot.title.length < 30) {
      findings.push({
        id: 'onpage-det-2',
        finding: 'Title tag may be too short',
        evidence: `Title: "${snapshot.title}" (${snapshot.title.length} characters)`,
        whyItMatters:
          'Short titles may not fully describe the page content or include valuable keywords',
        fix: 'Expand the title to include more relevant keywords while staying under 60 characters',
        priority: 'low',
        category: 'seo',
        source: 'on-page-seo',
      });
    }
  }

  // Missing meta description
  if (!snapshot.metaDescription) {
    findings.push({
      id: 'onpage-det-3',
      finding: 'Missing meta description',
      evidence: 'No meta description found in HTML head',
      whyItMatters:
        'Meta descriptions control how your page appears in search results and affect click-through rates',
      fix: 'Add a compelling meta description (150-160 characters) that summarizes the page and includes a call-to-action',
      priority: 'high',
      category: 'seo',
      source: 'on-page-seo',
    });
  } else {
    // Meta description length issues
    if (snapshot.metaDescription.length > 160) {
      findings.push({
        id: 'onpage-det-4',
        finding: 'Meta description is too long',
        evidence: `Meta description is ${snapshot.metaDescription.length} characters (recommended: 150-160)`,
        whyItMatters:
          'Long meta descriptions get truncated in search results, potentially cutting off your call-to-action',
        fix: 'Shorten the meta description to 150-160 characters',
        priority: 'low',
        category: 'seo',
        source: 'on-page-seo',
      });
    } else if (snapshot.metaDescription.length < 70) {
      findings.push({
        id: 'onpage-det-4',
        finding: 'Meta description may be too short',
        evidence: `Meta description: "${snapshot.metaDescription}" (${snapshot.metaDescription.length} characters)`,
        whyItMatters:
          'Short meta descriptions may not fully describe the page or compel users to click',
        fix: 'Expand the meta description to include more compelling information',
        priority: 'low',
        category: 'seo',
        source: 'on-page-seo',
      });
    }
  }

  // H1 issues
  const h1s = snapshot.headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    findings.push({
      id: 'onpage-det-5',
      finding: 'Missing H1 heading',
      evidence: 'No H1 heading found on the page',
      whyItMatters:
        'The H1 is a primary on-page SEO signal that tells search engines what the page is about',
      fix: 'Add a single, descriptive H1 heading that includes your primary keyword',
      priority: 'high',
      category: 'seo',
      source: 'on-page-seo',
    });
  } else if (h1s.length > 1) {
    findings.push({
      id: 'onpage-det-5',
      finding: 'Multiple H1 headings detected',
      evidence: `Found ${h1s.length} H1 headings: "${h1s.map((h) => h.text).join('", "')}"`,
      whyItMatters:
        'Multiple H1s can confuse search engines about the main topic of the page',
      fix: 'Use a single H1 for the main heading, convert others to H2 or lower',
      priority: 'medium',
      category: 'seo',
      source: 'on-page-seo',
    });
  }

  // Missing Open Graph
  if (!snapshot.openGraph.title || !snapshot.openGraph.image) {
    const missing = [];
    if (!snapshot.openGraph.title) missing.push('og:title');
    if (!snapshot.openGraph.description) missing.push('og:description');
    if (!snapshot.openGraph.image) missing.push('og:image');

    findings.push({
      id: 'onpage-det-6',
      finding: 'Incomplete Open Graph metadata',
      evidence: `Missing: ${missing.join(', ')}`,
      whyItMatters:
        'Open Graph tags control how your page appears when shared on social media',
      fix: 'Add complete Open Graph tags including title, description, and image',
      priority: 'medium',
      category: 'seo',
      source: 'on-page-seo',
    });
  }

  // No structured data
  if (snapshot.schemas.length === 0) {
    findings.push({
      id: 'onpage-det-7',
      finding: 'No structured data found',
      evidence: 'No JSON-LD schema markup detected',
      whyItMatters:
        'Structured data helps search engines understand your content and enables rich snippets',
      fix: 'Add relevant schema markup (Organization, WebSite, BreadcrumbList, FAQ, etc.)',
      priority: 'medium',
      category: 'seo',
      source: 'on-page-seo',
    });
  }

  // Missing viewport
  if (!snapshot.viewport) {
    findings.push({
      id: 'onpage-det-8',
      finding: 'Missing viewport meta tag',
      evidence: 'No viewport meta tag found',
      whyItMatters:
        'The viewport tag is essential for mobile responsiveness and is a mobile-first indexing requirement',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
      priority: 'high',
      category: 'technical',
      source: 'on-page-seo',
    });
  }

  // Images missing alt text
  const missingAltCount = snapshot.images.filter((i) => i.missingAlt).length;
  if (missingAltCount > 0) {
    findings.push({
      id: 'onpage-det-9',
      finding: 'Images missing alt text',
      evidence: `${missingAltCount} image(s) without alt attributes`,
      whyItMatters:
        'Alt text improves accessibility and helps search engines understand image content',
      fix: 'Add descriptive alt text to all images that convey content',
      priority: missingAltCount > 3 ? 'high' : 'medium',
      category: 'seo',
      source: 'on-page-seo',
    });
  }

  return findings;
}
