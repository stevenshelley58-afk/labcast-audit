/**
 * PDP (Product Detail Page) Micro-Audit
 *
 * Analyzes product pages for conversion optimization and e-commerce SEO.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { PageSnapshot } from '../extractors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import { PDP_AUDIT_PROMPT, interpolatePrompt } from './prompts.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runPdpAudit(
  snapshot: PageSnapshot,
  contentPreview: string
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('pdp');
  const registry = getProviderRegistry();

  // Check for e-commerce schemas
  const hasProductSchema = snapshot.schemas.some((s) => s.type === 'Product');
  const hasReviewSchema = snapshot.schemas.some(
    (s) => s.type === 'Review' || s.type === 'AggregateRating'
  );

  // Prepare prompt variables
  const variables = {
    pdpUrl: snapshot.url,
    title: snapshot.title || 'Missing',
    metaDescription: snapshot.metaDescription || 'Missing',
    schemaTypes:
      snapshot.schemas.length > 0
        ? snapshot.schemas.map((s) => s.type).join(', ')
        : 'None found',
    hasProductSchema: hasProductSchema ? 'Yes' : 'No',
    hasReviewSchema: hasReviewSchema ? 'Yes' : 'No',
    contentPreview: contentPreview.substring(0, 2000) || 'Content not available',
  };

  const prompt = interpolatePrompt(PDP_AUDIT_PROMPT, variables);

  try {
    let result: GenerateResult;

    // PDP audit uses URL context to visit the page
    try {
      result = await registry.generateWith('gemini', {
        prompt,
        options: {
          model: 'gemini-2.0-flash',
          systemInstruction:
            'You are an E-commerce Product Page auditor. Analyze the product page at the provided URL. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
        tools: {
          urlContext: true,
        },
      });
    } catch (primaryError) {
      // Fallback to OpenAI without URL context (uses provided content)
      console.warn('PDP audit: Gemini URL Context failed, trying OpenAI');
      result = await registry.generateWith('openai', {
        prompt,
        options: {
          model: 'gpt-4o',
          systemInstruction:
            'You are an E-commerce Product Page auditor. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    }

    // Parse findings
    const llmFindings = parseFindingsFromResponse(result.text);

    // Add deterministic findings
    const deterministicFindings = getDeterministicPdpFindings(snapshot);

    // Merge
    const allFindings = [...deterministicFindings, ...llmFindings];

    return {
      auditType: 'pdp',
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
      auditType: 'pdp',
      findings: getDeterministicPdpFindings(snapshot),
      rawOutput: '',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
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
      console.warn('PDP audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('PDP audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `pdp-llm-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'conversion' as const,
      source: 'pdp' as const,
    }));
  } catch (err) {
    console.error('PDP audit: Failed to parse findings', err);
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

export function getDeterministicPdpFindings(
  snapshot: PageSnapshot
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];

  // Missing Product schema
  if (!snapshot.schemas.some((s) => s.type === 'Product')) {
    findings.push({
      id: 'pdp-det-1',
      finding: 'Missing Product schema markup',
      evidence: 'No Product schema found in JSON-LD',
      whyItMatters:
        'Product schema enables rich snippets with price, availability, and ratings in search results',
      fix: 'Add Product schema with name, description, image, price, and availability',
      priority: 'high',
      category: 'conversion',
      source: 'pdp',
    });
  }

  // Missing Review/Rating schema
  if (
    !snapshot.schemas.some(
      (s) => s.type === 'Review' || s.type === 'AggregateRating'
    )
  ) {
    findings.push({
      id: 'pdp-det-2',
      finding: 'Missing Review/Rating schema',
      evidence: 'No Review or AggregateRating schema found',
      whyItMatters:
        'Review schema enables star ratings in search results, improving click-through rates',
      fix: 'Add AggregateRating schema if you have customer reviews',
      priority: 'medium',
      category: 'conversion',
      source: 'pdp',
    });
  }

  // Missing BreadcrumbList schema
  if (!snapshot.schemas.some((s) => s.type === 'BreadcrumbList')) {
    findings.push({
      id: 'pdp-det-3',
      finding: 'Missing Breadcrumb schema',
      evidence: 'No BreadcrumbList schema found',
      whyItMatters:
        'Breadcrumb schema helps search engines understand site structure and can show in SERPs',
      fix: 'Add BreadcrumbList schema reflecting the product category hierarchy',
      priority: 'low',
      category: 'seo',
      source: 'pdp',
    });
  }

  // Missing meta description
  if (!snapshot.metaDescription) {
    findings.push({
      id: 'pdp-det-4',
      finding: 'Product page missing meta description',
      evidence: 'No meta description found',
      whyItMatters:
        'Product pages need compelling meta descriptions to drive clicks from search results',
      fix: 'Add a unique meta description highlighting key product benefits and a call-to-action',
      priority: 'high',
      category: 'seo',
      source: 'pdp',
    });
  }

  // Images missing alt text
  const productImages = snapshot.images.filter((i) => i.likelyAboveFold);
  const missingAltImages = productImages.filter((i) => i.missingAlt);
  if (missingAltImages.length > 0) {
    findings.push({
      id: 'pdp-det-5',
      finding: 'Product images missing alt text',
      evidence: `${missingAltImages.length} above-fold image(s) without alt attributes`,
      whyItMatters:
        'Alt text helps images rank in Google Images and improves accessibility',
      fix: 'Add descriptive alt text to product images including product name and key features',
      priority: 'medium',
      category: 'seo',
      source: 'pdp',
    });
  }

  // Thin content warning for product pages
  if (snapshot.wordCount < 150) {
    findings.push({
      id: 'pdp-det-6',
      finding: 'Thin product description',
      evidence: `Only ${snapshot.wordCount} words on the page`,
      whyItMatters:
        'Product pages with minimal content are less likely to rank and convert',
      fix: 'Add detailed product description, features, specifications, and use cases',
      priority: 'high',
      category: 'content',
      source: 'pdp',
    });
  }

  return findings;
}
