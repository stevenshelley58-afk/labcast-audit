/**
 * Extraction Orchestrator
 *
 * Coordinates Layer 2 snapshot extraction from collected HTML.
 */

import { extractPageSnapshot } from './page-snapshot.js';
import type {
  PageSnapshot,
  ExtractionResult,
  MultiPageSnapshot,
} from './types.js';
import type { Layer1Result } from '../collectors/index.js';

// Re-export types
export * from './types.js';
export { extractPageSnapshot } from './page-snapshot.js';

// ============================================================================
// Types
// ============================================================================

export interface Layer2Result {
  /** Homepage snapshot */
  homepage: PageSnapshot;
  /** PDP snapshot (if provided) */
  pdp: PageSnapshot | null;
  /** Summary of extracted data */
  summary: MultiPageSnapshot['summary'];
  /** Extraction warnings */
  warnings: string[];
  /** Extraction errors */
  errors: string[];
  /** Total extraction duration */
  durationMs: number;
}

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Run Layer 2 extraction on collected Layer 1 data
 */
export function runLayer2Extraction(
  layer1: Layer1Result,
  pdpHtml?: string,
  pdpUrl?: string
): Layer2Result {
  const startTime = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];

  // Extract homepage snapshot
  const homepageResult = extractPageSnapshot(
    layer1.evidence.html.content,
    layer1.url
  );

  warnings.push(...homepageResult.warnings.map((w) => `Homepage: ${w}`));
  errors.push(...homepageResult.errors.map((e) => `Homepage: ${e}`));

  // Extract PDP snapshot if provided
  let pdpSnapshot: PageSnapshot | null = null;
  if (pdpHtml && pdpUrl) {
    const pdpResult = extractPageSnapshot(pdpHtml, pdpUrl);
    pdpSnapshot = pdpResult.snapshot;
    warnings.push(...pdpResult.warnings.map((w) => `PDP: ${w}`));
    errors.push(...pdpResult.errors.map((e) => `PDP: ${e}`));
  }

  // Calculate summary statistics
  const allSnapshots = [homepageResult.snapshot];
  if (pdpSnapshot) allSnapshots.push(pdpSnapshot);

  const summary = calculateSummary(allSnapshots);

  return {
    homepage: homepageResult.snapshot,
    pdp: pdpSnapshot,
    summary,
    warnings,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Extract snapshot from raw HTML (convenience function)
 */
export function extractSnapshot(html: string, url: string): ExtractionResult {
  return extractPageSnapshot(html, url);
}

// ============================================================================
// Summary Calculation
// ============================================================================

function calculateSummary(snapshots: PageSnapshot[]): MultiPageSnapshot['summary'] {
  const totalPages = snapshots.length;
  const averageWordCount =
    snapshots.reduce((sum, s) => sum + s.wordCount, 0) / totalPages;
  const totalSchemas = snapshots.reduce((sum, s) => sum + s.schemas.length, 0);
  const missingTitles = snapshots.filter((s) => !s.title).length;
  const missingDescriptions = snapshots.filter((s) => !s.metaDescription).length;
  const missingH1s = snapshots.filter(
    (s) => !s.headings.some((h) => h.level === 1)
  ).length;

  return {
    totalPages,
    averageWordCount: Math.round(averageWordCount),
    totalSchemas,
    missingTitles,
    missingDescriptions,
    missingH1s,
  };
}

// ============================================================================
// Event Types for SSE
// ============================================================================

export type Layer2EventType =
  | 'layer2:start'
  | 'layer2:progress'
  | 'layer2:complete';

export interface Layer2Event {
  type: Layer2EventType;
  page?: string;
  message?: string;
  data?: unknown;
  timestamp: string;
}

/**
 * Run Layer 2 extraction with event callbacks for SSE streaming
 */
export function runLayer2ExtractionWithEvents(
  layer1: Layer1Result,
  pdpHtml: string | undefined,
  pdpUrl: string | undefined,
  onEvent: (event: Layer2Event) => void
): Layer2Result {
  const emit = (
    type: Layer2EventType,
    extra: Partial<Omit<Layer2Event, 'type' | 'timestamp'>> = {}
  ) => {
    onEvent({
      type,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  };

  emit('layer2:start', { message: 'Starting snapshot extraction' });

  emit('layer2:progress', { page: 'homepage', message: 'Extracting homepage snapshot' });
  const result = runLayer2Extraction(layer1, pdpHtml, pdpUrl);

  if (pdpHtml && pdpUrl) {
    emit('layer2:progress', { page: 'pdp', message: 'Extracting PDP snapshot' });
  }

  emit('layer2:complete', {
    message: 'Extraction complete',
    data: {
      summary: result.summary,
      warnings: result.warnings.length,
      errors: result.errors.length,
    },
  });

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a list of SEO issues from a snapshot
 */
export function getSnapshotIssues(snapshot: PageSnapshot): string[] {
  const issues: string[] = [];

  if (!snapshot.title) {
    issues.push('Missing page title');
  } else if (snapshot.title.length > 60) {
    issues.push(`Title too long (${snapshot.title.length} chars, recommend < 60)`);
  } else if (snapshot.title.length < 30) {
    issues.push(`Title may be too short (${snapshot.title.length} chars)`);
  }

  if (!snapshot.metaDescription) {
    issues.push('Missing meta description');
  } else if (snapshot.metaDescription.length > 160) {
    issues.push(
      `Meta description too long (${snapshot.metaDescription.length} chars, recommend < 160)`
    );
  } else if (snapshot.metaDescription.length < 70) {
    issues.push(`Meta description may be too short (${snapshot.metaDescription.length} chars)`);
  }

  const h1Count = snapshot.headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) {
    issues.push('Missing H1 heading');
  } else if (h1Count > 1) {
    issues.push(`Multiple H1 headings (${h1Count} found)`);
  }

  if (!snapshot.canonical) {
    issues.push('Missing canonical tag');
  }

  if (!snapshot.viewport) {
    issues.push('Missing viewport meta tag');
  }

  if (snapshot.schemas.length === 0) {
    issues.push('No structured data (JSON-LD) found');
  }

  if (!snapshot.openGraph.title || !snapshot.openGraph.image) {
    issues.push('Incomplete Open Graph metadata');
  }

  const missingAltCount = snapshot.images.filter((i) => i.missingAlt).length;
  if (missingAltCount > 0) {
    issues.push(`${missingAltCount} image(s) missing alt text`);
  }

  if (snapshot.isThinContent) {
    issues.push(`Thin content detected (${snapshot.wordCount} words)`);
  }

  return issues;
}

/**
 * Get structured data types present in a snapshot
 */
export function getSchemaTypes(snapshot: PageSnapshot): string[] {
  return snapshot.schemas.map((s) => s.type);
}

/**
 * Check if a snapshot has e-commerce schema
 */
export function hasEcommerceSchema(snapshot: PageSnapshot): boolean {
  const ecommerceTypes = ['Product', 'Offer', 'AggregateRating', 'Review', 'BreadcrumbList'];
  return snapshot.schemas.some((s) => ecommerceTypes.includes(s.type));
}
