/**
 * Micro-Audit Types
 *
 * Shared types for Layer 3 micro-audits.
 */

import type { ProviderName } from '../providers/index.js';

// ============================================================================
// Finding Types
// ============================================================================

export interface MicroAuditFinding {
  /** Unique finding ID */
  id: string;
  /** Clear, specific observation */
  finding: string;
  /** Evidence supporting this finding */
  evidence: string;
  /** Why this matters (impact) */
  whyItMatters: string;
  /** Actionable fix recommendation */
  fix: string;
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Finding category */
  category: 'seo' | 'technical' | 'design' | 'conversion' | 'content' | 'security';
  /** Source audit type */
  source: MicroAuditType;
}

// ============================================================================
// Audit Types
// ============================================================================

export type MicroAuditType =
  | 'technical-seo'
  | 'performance'
  | 'on-page-seo'
  | 'content-quality'
  | 'authority-trust'
  | 'visual-url-context'
  | 'visual-screenshot'
  | 'codebase-peek'
  | 'pdp';

// ============================================================================
// Audit Result
// ============================================================================

export interface MicroAuditResult {
  /** Audit type */
  auditType: MicroAuditType;
  /** Extracted findings */
  findings: MicroAuditFinding[];
  /** Raw LLM output */
  rawOutput: string;
  /** Provider used */
  provider: ProviderName;
  /** Model used */
  model: string;
  /** Duration in ms */
  durationMs: number;
  /** Cost */
  cost: number;
  /** Error if failed */
  error?: string;
}

// ============================================================================
// Layer 3 Result
// ============================================================================

export interface Layer3Result {
  /** All audit results */
  audits: Record<MicroAuditType, MicroAuditResult | null>;
  /** Combined findings from all audits */
  allFindings: MicroAuditFinding[];
  /** Total duration */
  durationMs: number;
  /** Total cost */
  totalCost: number;
  /** Audit errors */
  errors: Array<{ audit: MicroAuditType; error: string }>;
  /** Which audits completed successfully */
  completedAudits: MicroAuditType[];
  /** Which audits were skipped */
  skippedAudits: MicroAuditType[];
}

// ============================================================================
// Audit Configuration
// ============================================================================

export interface MicroAuditConfig {
  /** Visual mode */
  visualMode: 'url_context' | 'rendered' | 'both' | 'none';
  /** Enable codebase peek */
  enableCodebasePeek: boolean;
  /** Enable PDP audit (requires pdpUrl) */
  enablePdp: boolean;
  /** Max findings per audit */
  maxFindingsPerAudit: number;
  /** Provider overrides */
  providerOverrides?: Partial<Record<MicroAuditType, ProviderName>>;
}

export const DEFAULT_MICRO_AUDIT_CONFIG: MicroAuditConfig = {
  visualMode: 'url_context',
  enableCodebasePeek: true,
  enablePdp: true,
  maxFindingsPerAudit: 7,
};

// ============================================================================
// Event Types for SSE
// ============================================================================

export type Layer3EventType =
  | 'layer3:start'
  | 'layer3:audit'
  | 'layer3:finding'
  | 'layer3:complete';

export interface Layer3Event {
  type: Layer3EventType;
  audit?: MicroAuditType;
  status?: 'started' | 'completed' | 'failed' | 'skipped';
  finding?: MicroAuditFinding;
  message?: string;
  data?: unknown;
  timestamp: string;
}

// ============================================================================
// Priority Utilities
// ============================================================================

export const PRIORITY_WEIGHT: Record<MicroAuditFinding['priority'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function compareFindingPriority(
  a: MicroAuditFinding,
  b: MicroAuditFinding
): number {
  return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
}

export function sortFindingsByPriority(
  findings: MicroAuditFinding[]
): MicroAuditFinding[] {
  return [...findings].sort(compareFindingPriority);
}

// ============================================================================
// Category Utilities
// ============================================================================

export const CATEGORY_LABELS: Record<MicroAuditFinding['category'], string> = {
  seo: 'SEO',
  technical: 'Technical',
  design: 'Design',
  conversion: 'Conversion',
  content: 'Content',
  security: 'Security',
};

export function groupFindingsByCategory(
  findings: MicroAuditFinding[]
): Record<MicroAuditFinding['category'], MicroAuditFinding[]> {
  const grouped: Record<string, MicroAuditFinding[]> = {
    seo: [],
    technical: [],
    design: [],
    conversion: [],
    content: [],
    security: [],
  };

  for (const finding of findings) {
    grouped[finding.category].push(finding);
  }

  return grouped as Record<MicroAuditFinding['category'], MicroAuditFinding[]>;
}

// ============================================================================
// Source Utilities
// ============================================================================

export const AUDIT_LABELS: Record<MicroAuditType, string> = {
  'technical-seo': 'Technical SEO',
  performance: 'Performance',
  'on-page-seo': 'On-Page SEO',
  'content-quality': 'Content Quality',
  'authority-trust': 'Authority & Trust',
  'visual-url-context': 'Visual (URL Context)',
  'visual-screenshot': 'Visual (Screenshot)',
  'codebase-peek': 'Codebase Analysis',
  pdp: 'Product Page',
};

export function groupFindingsBySource(
  findings: MicroAuditFinding[]
): Record<MicroAuditType, MicroAuditFinding[]> {
  const grouped: Partial<Record<MicroAuditType, MicroAuditFinding[]>> = {};

  for (const finding of findings) {
    if (!grouped[finding.source]) {
      grouped[finding.source] = [];
    }
    grouped[finding.source]!.push(finding);
  }

  return grouped as Record<MicroAuditType, MicroAuditFinding[]>;
}
