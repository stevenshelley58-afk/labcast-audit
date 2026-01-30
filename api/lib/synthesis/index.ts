/**
 * Synthesis Orchestrator
 *
 * Coordinates Layer 4 final synthesis with GPT-4o primary, Gemini fallback.
 */

import { getProviderRegistry, getAuditProviderAssignment } from '../providers/index.js';
import type { GenerateResult } from '../providers/index.js';
import type { Layer3Result, MicroAuditFinding } from '../micro-audits/types.js';
import type { Layer1Result } from '../collectors/index.js';
import {
  mergeFindings,
  calculateScores,
  generateActionPlan,
  type MergedFinding,
  type AuditScores,
  type ActionPlan,
  type MergeResult,
} from './merger.js';
import {
  SYNTHESIS_PROMPT,
  QUICK_SYNTHESIS_PROMPT,
  formatFindingsForSynthesis,
  interpolateSynthesisPrompt,
} from './prompts.js';

// Re-export types
export * from './merger.js';
export { formatFindingsForSynthesis } from './prompts.js';

// ============================================================================
// Types
// ============================================================================

export interface SynthesisResult {
  /** Executive summary */
  executiveSummary: string;
  /** Top issues with narratives */
  topIssues: Array<{
    title: string;
    narrative: string;
    relatedFindings: string[];
    category: string;
  }>;
  /** Prioritized next steps */
  nextSteps: Array<{
    action: string;
    rationale: string;
    expectedImpact: string;
    effort: string;
    category: string;
  }>;
  /** Score justifications */
  scoreJustifications: {
    technical: string;
    onPage: string;
    content: string;
    performance: string;
    security: string;
    overall: string;
  };
  /** Provider used for synthesis */
  provider: 'openai' | 'gemini';
  /** Model used */
  model: string;
  /** Duration in ms */
  durationMs: number;
  /** Cost */
  cost: number;
  /** Error if failed */
  error?: string;
}

export interface Layer4Result {
  /** Merged findings */
  mergedFindings: MergedFinding[];
  /** Merge statistics */
  mergeStats: MergeResult['stats'];
  /** Calculated scores */
  scores: AuditScores;
  /** Generated action plan */
  actionPlan: ActionPlan;
  /** LLM synthesis result */
  synthesis: SynthesisResult;
  /** Total duration */
  durationMs: number;
  /** Total cost */
  totalCost: number;
  /** Measurement gaps */
  explicitGaps: string[];
}

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Run Layer 4 synthesis
 */
export async function runLayer4Synthesis(
  url: string,
  layer1: Layer1Result,
  layer3: Layer3Result
): Promise<Layer4Result> {
  const startTime = Date.now();

  // Step 1: Merge findings
  const mergeResult = mergeFindings(layer3.allFindings);

  // Step 2: Calculate scores
  const scores = calculateScores(
    mergeResult.findings,
    layer1.pageSpeed?.performanceScore ?? null,
    layer1.securityHeaders.score
  );

  // Step 3: Generate action plan
  const actionPlan = generateActionPlan(mergeResult.findings);

  // Step 4: Collect gaps
  const explicitGaps = [
    ...layer1.explicitGaps,
    ...layer3.errors.map((e) => `${e.audit} audit failed: ${e.error}`),
  ];

  // Step 5: Run LLM synthesis
  const synthesis = await runSynthesisLLM(
    url,
    mergeResult.findings,
    scores,
    explicitGaps
  );

  return {
    mergedFindings: mergeResult.findings,
    mergeStats: mergeResult.stats,
    scores,
    actionPlan,
    synthesis,
    durationMs: Date.now() - startTime,
    totalCost: layer3.totalCost + synthesis.cost,
    explicitGaps,
  };
}

// ============================================================================
// LLM Synthesis
// ============================================================================

async function runSynthesisLLM(
  url: string,
  findings: MergedFinding[],
  scores: AuditScores,
  gaps: string[]
): Promise<SynthesisResult> {
  const startTime = Date.now();
  const assignment = getAuditProviderAssignment('synthesis');
  const registry = getProviderRegistry();

  // Prepare prompt
  const variables = {
    url,
    technicalScore: scores.technical,
    onPageScore: scores.onPage,
    contentScore: scores.content,
    performanceScore: scores.performance,
    securityScore: scores.security,
    topFindings: formatFindingsForSynthesis(findings, 20),
    dataGaps: gaps.length > 0 ? gaps.join('\n- ') : 'None',
  };

  const prompt = interpolateSynthesisPrompt(SYNTHESIS_PROMPT, variables);

  try {
    let result: GenerateResult;

    // Try primary provider (OpenAI GPT-4o)
    try {
      result = await registry.generateWith(assignment.primary, {
        prompt,
        options: {
          model: assignment.model,
          systemInstruction:
            'You are a Senior SEO Strategist. Synthesize the audit data into a cohesive report. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.4,
          maxTokens: 2000,
        },
      });
    } catch (primaryError) {
      if (!assignment.fallback) throw primaryError;

      console.warn(`Synthesis: ${assignment.primary} failed, trying ${assignment.fallback}`);

      // Fallback to Gemini
      result = await registry.generateWith(assignment.fallback, {
        prompt,
        options: {
          systemInstruction:
            'You are a Senior SEO Strategist. Synthesize the audit data into a cohesive report. Respond with valid JSON only.',
          responseFormat: 'json',
          temperature: 0.4,
          maxTokens: 2000,
        },
      });
    }

    // Parse synthesis result
    const parsed = parseSynthesisResponse(result.text);

    return {
      ...parsed,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startTime,
      cost: result.cost,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    // Return fallback synthesis
    return {
      executiveSummary: generateFallbackSummary(findings, scores),
      topIssues: generateFallbackTopIssues(findings),
      nextSteps: generateFallbackNextSteps(findings),
      scoreJustifications: {
        technical: `Based on ${countByCategory(findings, 'technical')} technical issues found.`,
        onPage: `Based on ${countByCategory(findings, 'seo')} SEO issues found.`,
        content: `Based on ${countByCategory(findings, 'content')} content issues found.`,
        performance: `Score reflects Core Web Vitals assessment.`,
        security: `Based on security headers analysis.`,
        overall: `Weighted average of all category scores.`,
      },
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

function parseSynthesisResponse(text: string): Omit<
  SynthesisResult,
  'provider' | 'model' | 'durationMs' | 'cost' | 'error'
> {
  try {
    const cleaned = text.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      executiveSummary: parsed.executiveSummary || 'Analysis complete.',
      topIssues: (parsed.topIssues || []).map((issue: any) => ({
        title: issue.title || 'Issue',
        narrative: issue.narrative || '',
        relatedFindings: issue.relatedFindings || [],
        category: issue.category || 'technical',
      })),
      nextSteps: (parsed.nextSteps || []).map((step: any) => ({
        action: step.action || 'Review findings',
        rationale: step.rationale || '',
        expectedImpact: step.expectedImpact || 'medium',
        effort: step.effort || 'medium',
        category: step.category || 'technical',
      })),
      scoreJustifications: {
        technical: parsed.scoreJustifications?.technical || '',
        onPage: parsed.scoreJustifications?.onPage || '',
        content: parsed.scoreJustifications?.content || '',
        performance: parsed.scoreJustifications?.performance || '',
        security: parsed.scoreJustifications?.security || '',
        overall: parsed.scoreJustifications?.overall || '',
      },
    };
  } catch (err) {
    console.error('Synthesis: Failed to parse response', err);
    throw err;
  }
}

// ============================================================================
// Fallback Generators
// ============================================================================

function generateFallbackSummary(findings: MergedFinding[], scores: AuditScores): string {
  const criticalCount = findings.filter((f) => f.priority === 'critical').length;
  const highCount = findings.filter((f) => f.priority === 'high').length;

  let summary = `The site scores ${scores.overall}/100 overall. `;

  if (criticalCount > 0) {
    summary += `${criticalCount} critical issue(s) require immediate attention. `;
  } else if (highCount > 0) {
    summary += `${highCount} high-priority issue(s) should be addressed soon. `;
  } else {
    summary += `No critical issues found, but there are opportunities for improvement. `;
  }

  // Find worst category
  const categoryScores = [
    { name: 'Technical', score: scores.technical },
    { name: 'On-Page SEO', score: scores.onPage },
    { name: 'Content', score: scores.content },
    { name: 'Performance', score: scores.performance },
  ];
  const worst = categoryScores.sort((a, b) => a.score - b.score)[0];

  if (worst.score < 70) {
    summary += `${worst.name} (${worst.score}/100) is the weakest area.`;
  }

  return summary;
}

function generateFallbackTopIssues(
  findings: MergedFinding[]
): SynthesisResult['topIssues'] {
  const critical = findings.filter((f) => f.priority === 'critical');
  const high = findings.filter((f) => f.priority === 'high');
  const top = [...critical, ...high].slice(0, 5);

  return top.map((f) => ({
    title: f.finding,
    narrative: f.whyItMatters,
    relatedFindings: [f.id],
    category: f.category,
  }));
}

function generateFallbackNextSteps(
  findings: MergedFinding[]
): SynthesisResult['nextSteps'] {
  const sorted = findings.sort((a, b) => b.priorityScore - a.priorityScore);

  return sorted.slice(0, 7).map((f) => ({
    action: f.fix,
    rationale: f.whyItMatters,
    expectedImpact: f.priority === 'critical' ? 'high' : f.priority === 'high' ? 'high' : 'medium',
    effort: 'medium',
    category: f.category,
  }));
}

function countByCategory(findings: MergedFinding[], category: string): number {
  return findings.filter((f) => f.category === category).length;
}

// ============================================================================
// Event Types for SSE
// ============================================================================

export type Layer4EventType = 'layer4:start' | 'layer4:complete';

export interface Layer4Event {
  type: Layer4EventType;
  message?: string;
  data?: unknown;
  timestamp: string;
}

/**
 * Run Layer 4 synthesis with event callbacks for SSE streaming
 */
export async function runLayer4SynthesisWithEvents(
  url: string,
  layer1: Layer1Result,
  layer3: Layer3Result,
  onEvent: (event: Layer4Event) => void
): Promise<Layer4Result> {
  const emit = (
    type: Layer4EventType,
    extra: Partial<Omit<Layer4Event, 'type' | 'timestamp'>> = {}
  ) => {
    onEvent({
      type,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  };

  emit('layer4:start', { message: 'Starting synthesis' });

  const result = await runLayer4Synthesis(url, layer1, layer3);

  emit('layer4:complete', {
    message: 'Synthesis complete',
    data: {
      overallScore: result.scores.overall,
      findingsCount: result.mergedFindings.length,
      totalCost: result.totalCost,
    },
  });

  return result;
}
