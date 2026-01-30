/**
 * Finding Merger
 *
 * Deduplicates and merges findings from multiple micro-audits.
 */

import type { MicroAuditFinding } from '../micro-audits/types.js';

// ============================================================================
// Types
// ============================================================================

export interface MergedFinding extends MicroAuditFinding {
  /** Source stages that reported similar findings */
  sources: string[];
  /** Confidence based on evidence quality and source count */
  confidence: 'high' | 'medium' | 'low';
  /** Numeric priority score (1-5) */
  priorityScore: number;
}

export interface MergeResult {
  /** Deduplicated and normalized findings */
  findings: MergedFinding[];
  /** Findings that were merged */
  mergedDuplicates: Array<{ kept: string; merged: string[] }>;
  /** Statistics */
  stats: {
    totalInput: number;
    totalOutput: number;
    mergedCount: number;
  };
}

// ============================================================================
// Similarity Detection
// ============================================================================

/**
 * Calculate similarity between two findings (0-1)
 */
function calculateSimilarity(a: MicroAuditFinding, b: MicroAuditFinding): number {
  let score = 0;

  // Same category is required
  if (a.category !== b.category) {
    return 0;
  }

  // Check finding text similarity
  const aWords = new Set(a.finding.toLowerCase().split(/\s+/));
  const bWords = new Set(b.finding.toLowerCase().split(/\s+/));
  const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
  const union = new Set([...aWords, ...bWords]);
  const jaccardSimilarity = intersection.size / union.size;
  score += jaccardSimilarity * 0.5;

  // Check if they're about the same thing
  const keyPhrases = [
    'title',
    'meta description',
    'h1',
    'heading',
    'canonical',
    'schema',
    'https',
    'performance',
    'lcp',
    'cls',
    'inp',
    'security',
    'robots',
    'sitemap',
    'alt text',
    'images',
  ];

  for (const phrase of keyPhrases) {
    const aHas = a.finding.toLowerCase().includes(phrase);
    const bHas = b.finding.toLowerCase().includes(phrase);
    if (aHas && bHas) {
      score += 0.3;
      break;
    }
  }

  // Same priority adds weight
  if (a.priority === b.priority) {
    score += 0.1;
  }

  // Check evidence overlap
  if (a.evidence && b.evidence) {
    const aEvidence = a.evidence.toLowerCase().substring(0, 100);
    const bEvidence = b.evidence.toLowerCase().substring(0, 100);
    if (aEvidence.includes(bEvidence.substring(0, 30)) || bEvidence.includes(aEvidence.substring(0, 30))) {
      score += 0.1;
    }
  }

  return Math.min(score, 1);
}

// ============================================================================
// Main Merger
// ============================================================================

/**
 * Merge and deduplicate findings from multiple sources
 */
export function mergeFindings(findings: MicroAuditFinding[]): MergeResult {
  const totalInput = findings.length;
  const mergedDuplicates: MergeResult['mergedDuplicates'] = [];

  // Group potential duplicates
  const used = new Set<string>();
  const groups: MicroAuditFinding[][] = [];

  for (const finding of findings) {
    if (used.has(finding.id)) continue;

    const group = [finding];
    used.add(finding.id);

    // Find similar findings
    for (const other of findings) {
      if (used.has(other.id)) continue;
      if (finding.source === other.source) continue; // Don't merge from same source

      const similarity = calculateSimilarity(finding, other);
      if (similarity >= 0.6) {
        group.push(other);
        used.add(other.id);
      }
    }

    groups.push(group);
  }

  // Merge each group into a single finding
  const mergedFindings: MergedFinding[] = groups.map((group) => {
    // Keep the finding with best priority
    const sorted = group.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const primary = sorted[0];
    const sources = [...new Set(group.map((f) => f.source))];

    // Track merges
    if (group.length > 1) {
      mergedDuplicates.push({
        kept: primary.id,
        merged: group.slice(1).map((f) => f.id),
      });
    }

    // Calculate confidence
    const confidence = determineConfidence(group);

    // Calculate priority score (1-5)
    const priorityScore = calculatePriorityScore(primary, sources.length);

    return {
      ...primary,
      sources,
      confidence,
      priorityScore,
    };
  });

  // Sort by priority score
  mergedFindings.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    findings: mergedFindings,
    mergedDuplicates,
    stats: {
      totalInput,
      totalOutput: mergedFindings.length,
      mergedCount: mergedDuplicates.length,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function determineConfidence(
  group: MicroAuditFinding[]
): 'high' | 'medium' | 'low' {
  // Multiple sources = higher confidence
  const uniqueSources = new Set(group.map((f) => f.source)).size;

  // Has evidence = higher confidence
  const hasEvidence = group.some((f) => f.evidence && f.evidence.length > 20);

  if (uniqueSources >= 2 && hasEvidence) {
    return 'high';
  }

  if (uniqueSources >= 2 || hasEvidence) {
    return 'medium';
  }

  return 'low';
}

function calculatePriorityScore(
  finding: MicroAuditFinding,
  sourceCount: number
): number {
  const priorityBase = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
  };

  let score = priorityBase[finding.priority];

  // Boost for multiple sources
  if (sourceCount >= 2) {
    score += 0.5;
  }

  // Boost for having good evidence
  if (finding.evidence && finding.evidence.length > 50) {
    score += 0.3;
  }

  return Math.min(score, 5);
}

// ============================================================================
// Score Calculation
// ============================================================================

export interface AuditScores {
  overall: number;
  technical: number;
  onPage: number;
  content: number;
  performance: number;
  security: number;
  visual: number;
}

/**
 * Calculate scores based on findings
 */
export function calculateScores(
  findings: MergedFinding[],
  performanceScore: number | null,
  securityScore: number
): AuditScores {
  // Count findings by category and priority
  const categoryIssues: Record<string, { critical: number; high: number; medium: number; low: number }> = {
    technical: { critical: 0, high: 0, medium: 0, low: 0 },
    seo: { critical: 0, high: 0, medium: 0, low: 0 },
    content: { critical: 0, high: 0, medium: 0, low: 0 },
    design: { critical: 0, high: 0, medium: 0, low: 0 },
    conversion: { critical: 0, high: 0, medium: 0, low: 0 },
    security: { critical: 0, high: 0, medium: 0, low: 0 },
  };

  for (const finding of findings) {
    const cat = categoryIssues[finding.category];
    if (cat) {
      cat[finding.priority]++;
    }
  }

  // Calculate scores (start at 100, deduct for issues)
  const calculateCategoryScore = (issues: typeof categoryIssues['technical']): number => {
    let score = 100;
    score -= issues.critical * 25;
    score -= issues.high * 15;
    score -= issues.medium * 8;
    score -= issues.low * 3;
    return Math.max(0, Math.min(100, score));
  };

  const technical = calculateCategoryScore({
    ...categoryIssues.technical,
    critical: categoryIssues.technical.critical,
    high: categoryIssues.technical.high,
  });

  const onPage = calculateCategoryScore(categoryIssues.seo);
  const content = calculateCategoryScore(categoryIssues.content);
  const visual = calculateCategoryScore({
    ...categoryIssues.design,
    ...categoryIssues.conversion,
    critical: categoryIssues.design.critical + categoryIssues.conversion.critical,
    high: categoryIssues.design.high + categoryIssues.conversion.high,
    medium: categoryIssues.design.medium + categoryIssues.conversion.medium,
    low: categoryIssues.design.low + categoryIssues.conversion.low,
  });

  // Use external scores where available
  const performance = performanceScore ?? calculateCategoryScore(categoryIssues.technical);
  const security = securityScore;

  // Overall is weighted average
  const overall = Math.round(
    technical * 0.2 +
    onPage * 0.25 +
    content * 0.2 +
    performance * 0.15 +
    security * 0.1 +
    visual * 0.1
  );

  return {
    overall,
    technical: Math.round(technical),
    onPage: Math.round(onPage),
    content: Math.round(content),
    performance: Math.round(performance),
    security: Math.round(security),
    visual: Math.round(visual),
  };
}

// ============================================================================
// Action Plan Generation
// ============================================================================

export interface ActionPlan {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
}

/**
 * Generate action plan from findings
 */
export function generateActionPlan(findings: MergedFinding[]): ActionPlan {
  const immediate: string[] = [];
  const shortTerm: string[] = [];
  const longTerm: string[] = [];

  for (const finding of findings) {
    if (!finding.fix) continue;

    if (finding.priority === 'critical') {
      immediate.push(finding.fix);
    } else if (finding.priority === 'high') {
      shortTerm.push(finding.fix);
    } else {
      longTerm.push(finding.fix);
    }
  }

  // Limit each bucket
  return {
    immediate: immediate.slice(0, 5),
    shortTerm: shortTerm.slice(0, 7),
    longTerm: longTerm.slice(0, 5),
  };
}
