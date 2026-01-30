/**
 * Authority & Trust Micro-Audit
 *
 * Evaluates E-E-A-T signals and trust indicators.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { PageSnapshot } from '../extractors/index.js';
import type { SecurityHeadersResult } from '../collectors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import { AUTHORITY_TRUST_PROMPT, interpolatePrompt, formatArrayForPrompt } from './prompts.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runAuthorityTrustAudit(
  snapshot: PageSnapshot,
  securityHeaders: SecurityHeadersResult
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('authority-trust');
  const registry = getProviderRegistry();

  // Extract trust signals from snapshot
  const trustSignals = extractTrustSignals(snapshot);

  // Prepare prompt variables
  const variables = {
    domain: new URL(snapshot.url).hostname,
    isHttps: snapshot.url.startsWith('https://') ? 'Yes' : 'No',
    securityScore: securityHeaders.score,
    missingHeaders:
      securityHeaders.missingHeaders.length > 0
        ? securityHeaders.missingHeaders.join(', ')
        : 'None',
    schemaTypes:
      snapshot.schemas.length > 0
        ? snapshot.schemas.map((s) => s.type).join(', ')
        : 'None found',
    trustSignals: formatArrayForPrompt(trustSignals),
    externalLinks: snapshot.externalLinkCount,
  };

  const prompt = interpolatePrompt(AUTHORITY_TRUST_PROMPT, variables);

  try {
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction:
            'You are a Trust & Authority analyst. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(
        `Authority Trust audit: ${assignment.primary} failed, trying ${assignment.fallback}`
      );
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction:
            'You are a Trust & Authority analyst. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    }

    // Parse findings
    const llmFindings = parseFindingsFromResponse(result.text);

    // Add deterministic findings
    const deterministicFindings = getDeterministicTrustFindings(
      snapshot,
      securityHeaders
    );

    // Merge
    const allFindings = [...deterministicFindings, ...llmFindings];

    return {
      auditType: 'authority-trust',
      findings: allFindings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
      prompt: {
        template: AUTHORITY_TRUST_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Trust & Authority Analyst. Respond with valid JSON only.',
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    return {
      auditType: 'authority-trust',
      findings: getDeterministicTrustFindings(snapshot, securityHeaders),
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
      prompt: {
        template: AUTHORITY_TRUST_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Trust & Authority Analyst. Respond with valid JSON only.',
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
      console.warn('Authority Trust audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('Authority Trust audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `trust-llm-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'security' as const,
      source: 'authority-trust' as const,
    }));
  } catch (err) {
    console.error('Authority Trust audit: Failed to parse findings', err);
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
// Trust Signal Extraction
// ============================================================================

function extractTrustSignals(snapshot: PageSnapshot): string[] {
  const signals: string[] = [];

  // Check for Organization schema
  if (snapshot.schemas.some((s) => s.type === 'Organization')) {
    signals.push('Organization schema present');
  }

  // Check for LocalBusiness schema
  if (snapshot.schemas.some((s) => s.type === 'LocalBusiness')) {
    signals.push('LocalBusiness schema present');
  }

  // Check navigation for common trust pages
  const navTexts = snapshot.navAnchors.map((a) => a.text.toLowerCase());
  const trustPages = ['about', 'contact', 'privacy', 'terms', 'faq', 'support', 'team'];

  for (const page of trustPages) {
    if (navTexts.some((t) => t.includes(page))) {
      signals.push(`"${page}" page linked in navigation`);
    }
  }

  // Check for social proof schemas
  if (snapshot.schemas.some((s) => s.type === 'Review' || s.type === 'AggregateRating')) {
    signals.push('Review/Rating schema present');
  }

  // Check for author schema
  if (snapshot.schemas.some((s) => s.type === 'Person' || s.type === 'Author')) {
    signals.push('Author information schema present');
  }

  // Check for breadcrumbs
  if (snapshot.schemas.some((s) => s.type === 'BreadcrumbList')) {
    signals.push('Breadcrumb schema present');
  }

  return signals;
}

// ============================================================================
// Deterministic Pre-Analysis
// ============================================================================

export function getDeterministicTrustFindings(
  snapshot: PageSnapshot,
  securityHeaders: SecurityHeadersResult
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];

  // HTTPS check
  if (!snapshot.url.startsWith('https://')) {
    findings.push({
      id: 'trust-det-1',
      finding: 'Site not using HTTPS',
      evidence: `URL: ${snapshot.url}`,
      whyItMatters:
        'HTTPS is a ranking factor and browsers mark HTTP sites as "Not Secure"',
      fix: 'Install an SSL certificate and redirect all HTTP traffic to HTTPS',
      priority: 'critical',
      category: 'security',
      source: 'authority-trust',
    });
  }

  // Missing HSTS
  if (!securityHeaders.hsts.present) {
    findings.push({
      id: 'trust-det-2',
      finding: 'Missing Strict-Transport-Security header',
      evidence: 'HSTS header not found in server response',
      whyItMatters:
        'HSTS ensures browsers always use HTTPS, preventing downgrade attacks',
      fix: 'Add Strict-Transport-Security header with max-age of at least 1 year',
      priority: 'medium',
      category: 'security',
      source: 'authority-trust',
    });
  }

  // Poor security score
  if (securityHeaders.score < 50) {
    findings.push({
      id: 'trust-det-3',
      finding: 'Low security headers score',
      evidence: `Security score: ${securityHeaders.score}/100. Missing: ${securityHeaders.missingHeaders.join(', ')}`,
      whyItMatters:
        'Security headers protect against common attacks and signal site trustworthiness',
      fix: `Add missing security headers: ${securityHeaders.recommendations.slice(0, 2).join('; ')}`,
      priority: 'medium',
      category: 'security',
      source: 'authority-trust',
    });
  }

  // Missing Organization schema
  if (
    !snapshot.schemas.some(
      (s) => s.type === 'Organization' || s.type === 'LocalBusiness'
    )
  ) {
    findings.push({
      id: 'trust-det-4',
      finding: 'Missing Organization schema',
      evidence: 'No Organization or LocalBusiness schema found',
      whyItMatters:
        'Organization schema helps establish entity identity and can enable knowledge panel features',
      fix: 'Add Organization schema with name, logo, contact information, and social profiles',
      priority: 'medium',
      category: 'seo',
      source: 'authority-trust',
    });
  }

  // No external links
  if (snapshot.externalLinkCount === 0) {
    findings.push({
      id: 'trust-det-5',
      finding: 'No external links found',
      evidence: 'Page contains 0 external links',
      whyItMatters:
        'Linking to authoritative external sources can enhance credibility and user experience',
      fix: 'Consider adding relevant external links to authoritative sources that support your content',
      priority: 'low',
      category: 'content',
      source: 'authority-trust',
    });
  }

  return findings;
}
