/**
 * Performance Micro-Audit
 *
 * Analyzes Core Web Vitals and performance metrics.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { PageSpeedResult, CoreWebVitals } from '../collectors/index.js';
import type { MicroAuditResult, MicroAuditFinding } from './types.js';
import {
  PERFORMANCE_PROMPT,
  interpolatePrompt,
  formatOpportunitiesForPrompt,
} from './prompts.js';
import { getCWVRating, formatCWVValue } from '../collectors/pagespeed.js';

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runPerformanceAudit(
  pageSpeed: PageSpeedResult | null
): Promise<MicroAuditResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('performance');
  const registry = getProviderRegistry();

  // If no PSI data, return early with deterministic findings only
  if (!pageSpeed || pageSpeed.error) {
    return {
      auditType: 'performance',
      findings: pageSpeed?.error
        ? [
            {
              id: 'perf-det-1',
              finding: 'Performance data unavailable',
              evidence: `PageSpeed Insights error: ${pageSpeed.error}`,
              whyItMatters:
                'Cannot assess Core Web Vitals without performance data',
              fix: 'Ensure the page is publicly accessible and try again',
              priority: 'medium',
              category: 'technical',
              source: 'performance',
            },
          ]
        : [],
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error: pageSpeed?.error || 'No PageSpeed data available',
      prompt: {
        template: PERFORMANCE_PROMPT,
        resolved: '',
        variables: {},
        systemInstruction: 'You are a Web Performance Specialist. Respond with valid JSON only.',
      },
    };
  }

  // Prepare prompt variables
  const cwv = pageSpeed.coreWebVitals;
  const variables = {
    lcp: formatCWVValue('lcp', cwv.lcp),
    inp: formatCWVValue('inp', cwv.inp),
    cls: formatCWVValue('cls', cwv.cls),
    ttfb: formatCWVValue('ttfb', cwv.ttfb),
    fcp: formatCWVValue('fcp', cwv.fcp),
    performanceScore: pageSpeed.performanceScore ?? 'N/A',
    dataSource: pageSpeed.dataSource,
    opportunities: formatOpportunitiesForPrompt(pageSpeed.opportunities),
  };

  const prompt = interpolatePrompt(PERFORMANCE_PROMPT, variables);

  try {
    let result: GenerateResult;

    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction:
            'You are a Web Performance expert. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(
        `Performance audit: ${assignment.primary} failed, trying ${assignment.fallback}`
      );
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction:
            'You are a Web Performance expert. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.3,
        },
      });
    }

    // Parse findings
    const llmFindings = parseFindingsFromResponse(result.text);

    // Add deterministic findings
    const deterministicFindings = getDeterministicPerformanceFindings(pageSpeed);

    // Merge and dedupe
    const allFindings = [...deterministicFindings, ...llmFindings];

    return {
      auditType: 'performance',
      findings: allFindings,
      rawOutput: result.text,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
      prompt: {
        template: PERFORMANCE_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Web Performance Specialist. Respond with valid JSON only.',
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    // Return deterministic findings even on error
    return {
      auditType: 'performance',
      findings: getDeterministicPerformanceFindings(pageSpeed),
      rawOutput: '',
      provider: assignment.primary,
      model: assignment.model,
      durationMs: Date.now() - startTime,
      cost: 0,
      error,
      prompt: {
        template: PERFORMANCE_PROMPT,
        resolved: prompt,
        variables,
        systemInstruction: 'You are a Web Performance Specialist. Respond with valid JSON only.',
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
      console.warn('Performance audit: No JSON array found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn('Performance audit: Parsed result is not an array');
      return [];
    }

    return parsed.map((item, index) => ({
      id: `perf-llm-${index + 1}`,
      finding: item.finding || 'Unknown finding',
      evidence: item.evidence || '',
      whyItMatters: item.whyItMatters || '',
      fix: item.fix || '',
      priority: normalizePriority(item.priority),
      category: 'technical' as const,
      source: 'performance' as const,
    }));
  } catch (err) {
    console.error('Performance audit: Failed to parse findings', err);
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

export function getDeterministicPerformanceFindings(
  pageSpeed: PageSpeedResult
): MicroAuditFinding[] {
  const findings: MicroAuditFinding[] = [];
  const cwv = pageSpeed.coreWebVitals;

  // LCP issues
  if (cwv.lcp !== null) {
    const rating = getCWVRating('lcp', cwv.lcp);
    if (rating === 'poor') {
      findings.push({
        id: 'perf-det-lcp',
        finding: 'Largest Contentful Paint (LCP) is poor',
        evidence: `LCP: ${formatCWVValue('lcp', cwv.lcp)} (threshold: < 2.5s good, < 4s needs improvement)`,
        whyItMatters:
          'Poor LCP indicates slow loading of the main content, frustrating users and hurting rankings',
        fix: 'Optimize images, use CDN, reduce server response time, remove render-blocking resources',
        priority: 'critical',
        category: 'technical',
        source: 'performance',
      });
    } else if (rating === 'needs-improvement') {
      findings.push({
        id: 'perf-det-lcp',
        finding: 'Largest Contentful Paint (LCP) needs improvement',
        evidence: `LCP: ${formatCWVValue('lcp', cwv.lcp)} (threshold: < 2.5s good)`,
        whyItMatters:
          'LCP is close to the poor threshold, may affect user experience on slower connections',
        fix: 'Optimize largest content element loading, consider preloading critical resources',
        priority: 'high',
        category: 'technical',
        source: 'performance',
      });
    }
  }

  // INP issues
  if (cwv.inp !== null) {
    const rating = getCWVRating('inp', cwv.inp);
    if (rating === 'poor') {
      findings.push({
        id: 'perf-det-inp',
        finding: 'Interaction to Next Paint (INP) is poor',
        evidence: `INP: ${formatCWVValue('inp', cwv.inp)} (threshold: < 200ms good, < 500ms needs improvement)`,
        whyItMatters:
          'Poor INP means interactions feel sluggish, leading to user frustration',
        fix: 'Reduce JavaScript execution time, break up long tasks, optimize event handlers',
        priority: 'critical',
        category: 'technical',
        source: 'performance',
      });
    }
  }

  // CLS issues
  if (cwv.cls !== null) {
    const rating = getCWVRating('cls', cwv.cls);
    if (rating === 'poor') {
      findings.push({
        id: 'perf-det-cls',
        finding: 'Cumulative Layout Shift (CLS) is poor',
        evidence: `CLS: ${formatCWVValue('cls', cwv.cls)} (threshold: < 0.1 good, < 0.25 needs improvement)`,
        whyItMatters:
          'High CLS causes content to jump unexpectedly, frustrating users and hurting conversions',
        fix: 'Set explicit dimensions on images/videos, avoid inserting content above existing content',
        priority: 'high',
        category: 'technical',
        source: 'performance',
      });
    }
  }

  // TTFB issues
  if (cwv.ttfb !== null) {
    const rating = getCWVRating('ttfb', cwv.ttfb);
    if (rating === 'poor') {
      findings.push({
        id: 'perf-det-ttfb',
        finding: 'Time to First Byte (TTFB) is poor',
        evidence: `TTFB: ${formatCWVValue('ttfb', cwv.ttfb)} (threshold: < 800ms good)`,
        whyItMatters:
          'Slow server response delays everything else, impacting all other metrics',
        fix: 'Optimize server configuration, use caching, consider CDN, reduce database queries',
        priority: 'high',
        category: 'technical',
        source: 'performance',
      });
    }
  }

  // Overall score
  if (pageSpeed.performanceScore !== null && pageSpeed.performanceScore < 50) {
    findings.push({
      id: 'perf-det-score',
      finding: 'Overall performance score is poor',
      evidence: `Lighthouse Performance Score: ${pageSpeed.performanceScore}/100`,
      whyItMatters:
        'Low performance scores correlate with higher bounce rates and lower conversions',
      fix: 'Address individual metric issues and implement performance best practices',
      priority: 'high',
      category: 'technical',
      source: 'performance',
    });
  }

  return findings;
}
