/**
 * Evidence Storage System
 *
 * Stores all raw signals and model outputs for debugging, re-runs, and improvement.
 * All evidence is retained regardless of whether it makes it into the final report.
 */

import type {
  EvidenceArchive,
  StageAResult,
  StageBResult,
  MergeResult,
  SynthesisResult,
  ParallelAuditReport,
} from './types.js';

// ============================================================================
// In-Memory Storage (per-request)
// ============================================================================

/**
 * Evidence store for a single audit run
 */
export class EvidenceStore {
  private archive: EvidenceArchive;
  private startTime: number;

  constructor(auditId: string, url: string) {
    this.startTime = Date.now();
    this.archive = {
      id: auditId,
      url,
      startedAt: new Date().toISOString(),
      rawSignals: {},
      modelOutputs: {
        gemini: {},
      },
      parseStatus: {
        findingsParsed: 0,
        findingsDropped: 0,
        dropReasons: {},
        parseErrors: [],
      },
      errors: [],
    };
  }

  // -------------------------------------------------------------------------
  // Signal Storage
  // -------------------------------------------------------------------------

  /**
   * Store Stage A evidence (raw signals)
   */
  storeStageAResult(result: StageAResult): void {
    this.archive.rawSignals = result.evidence;

    // Log any gathering errors
    result.errors.forEach(error => {
      this.archive.errors.push({
        phase: `stageA-${error.source}`,
        message: error.message,
        timestamp: error.timestamp,
      });
    });
  }

  /**
   * Store individual signal (for progressive updates)
   */
  storeSignal<T extends keyof StageAResult['evidence']>(
    signalType: T,
    evidence: StageAResult['evidence'][T]
  ): void {
    this.archive.rawSignals[signalType] = evidence;
  }

  // -------------------------------------------------------------------------
  // Model Output Storage
  // -------------------------------------------------------------------------

  /**
   * Store Gemini model output
   */
  storeGeminiOutput(stage: string, output: string, metadata?: Record<string, unknown>): void {
    this.archive.modelOutputs.gemini[stage] = output;

    if (metadata) {
      // Store metadata alongside
      this.archive.modelOutputs.gemini[`${stage}_metadata`] = JSON.stringify(metadata);
    }
  }

  /**
   * Store ChatGPT synthesis output
   */
  storeChatGPTOutput(output: string, durationMs: number): void {
    this.archive.modelOutputs.chatgpt = output;
    this.archive.modelOutputs.chatgpt_metadata = JSON.stringify({ durationMs });
  }

  // -------------------------------------------------------------------------
  // Parse Status Tracking
  // -------------------------------------------------------------------------

  /**
   * Record a finding that was parsed successfully
   */
  recordParsedFinding(): void {
    this.archive.parseStatus.findingsParsed++;
  }

  /**
   * Record a finding that was dropped (with reason)
   */
  recordDroppedFinding(reason: string, findingTitle?: string): void {
    this.archive.parseStatus.findingsDropped++;
    this.archive.parseStatus.dropReasons[reason] =
      (this.archive.parseStatus.dropReasons[reason] || 0) + 1;

    if (findingTitle) {
      this.archive.parseStatus.parseErrors.push(`Dropped "${findingTitle}": ${reason}`);
    }
  }

  /**
   * Record a parse error
   */
  recordParseError(error: string): void {
    this.archive.parseStatus.parseErrors.push(error);
  }

  // -------------------------------------------------------------------------
  // Error Tracking
  // -------------------------------------------------------------------------

  /**
   * Record an error from any phase
   */
  recordError(phase: string, message: string): void {
    this.archive.errors.push({
      phase,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // Final Report
  // -------------------------------------------------------------------------

  /**
   * Store the final report
   */
  storeFinalReport(report: ParallelAuditReport): void {
    this.archive.finalReport = report;
    this.archive.completedAt = new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Get the complete archive
   */
  getArchive(): EvidenceArchive {
    return { ...this.archive };
  }

  /**
   * Get raw signals
   */
  getRawSignals(): StageAResult['evidence'] {
    return this.archive.rawSignals;
  }

  /**
   * Get specific signal
   */
  getSignal<T extends keyof StageAResult['evidence']>(
    signalType: T
  ): StageAResult['evidence'][T] | undefined {
    return this.archive.rawSignals[signalType];
  }

  /**
   * Get Gemini output for a stage
   */
  getGeminiOutput(stage: string): string | undefined {
    return this.archive.modelOutputs.gemini[stage];
  }

  /**
   * Get ChatGPT output
   */
  getChatGPTOutput(): string | undefined {
    return this.archive.modelOutputs.chatgpt;
  }

  /**
   * Get all errors
   */
  getErrors(): EvidenceArchive['errors'] {
    return this.archive.errors;
  }

  /**
   * Get parse status
   */
  getParseStatus(): EvidenceArchive['parseStatus'] {
    return this.archive.parseStatus;
  }

  /**
   * Get timing information
   */
  getDurationMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if archive has errors
   */
  hasErrors(): boolean {
    return this.archive.errors.length > 0;
  }

  /**
   * Get summary for logging/debugging
   */
  getSummary(): Record<string, unknown> {
    return {
      id: this.archive.id,
      url: this.archive.url,
      durationMs: this.getDurationMs(),
      signalsGathered: Object.keys(this.archive.rawSignals).length,
      geminiOutputs: Object.keys(this.archive.modelOutputs.gemini).length,
      hasChatGPT: !!this.archive.modelOutputs.chatgpt,
      findingsParsed: this.archive.parseStatus.findingsParsed,
      findingsDropped: this.archive.parseStatus.findingsDropped,
      errorCount: this.archive.errors.length,
      completed: !!this.archive.completedAt,
    };
  }
}

// ============================================================================
// Global Store Management (for serverless environment)
// ============================================================================

// Simple in-memory store (note: in production, use Redis or similar)
const activeStores = new Map<string, EvidenceStore>();

/**
 * Create a new evidence store
 */
export function createEvidenceStore(auditId: string, url: string): EvidenceStore {
  const store = new EvidenceStore(auditId, url);
  activeStores.set(auditId, store);
  return store;
}

/**
 * Get an existing evidence store
 */
export function getEvidenceStore(auditId: string): EvidenceStore | undefined {
  return activeStores.get(auditId);
}

/**
 * Remove an evidence store (cleanup)
 */
export function removeEvidenceStore(auditId: string): void {
  activeStores.delete(auditId);
}

/**
 * Get all active store summaries (for monitoring)
 */
export function getActiveStoreSummaries(): Array<Record<string, unknown>> {
  return Array.from(activeStores.values()).map(store => store.getSummary());
}

// ============================================================================
// Evidence Extraction Helpers
// ============================================================================

/**
 * Extract quoted evidence from model output
 * Looks for patterns like: Evidence: [TYPE] quote
 */
export function extractEvidenceQuotes(
  output: string,
  evidenceTypes: string[] = ['URL_CONTEXT', 'HTML', 'SERP', 'ROBOTS', 'SITEMAP', 'HEADERS']
): Array<{ type: string; quote: string; context?: string }> {
  const quotes: Array<{ type: string; quote: string; context?: string }> = [];

  for (const type of evidenceTypes) {
    // Match "Evidence: [TYPE] quote" patterns
    const pattern = new RegExp(
      `Evidence:\\s*\\[?${type}\\]?\\s*([^\\n]+)(?:\\n|$)`,
      'gi'
    );

    let match;
    while ((match = pattern.exec(output)) !== null) {
      quotes.push({
        type,
        quote: match[1].trim(),
        context: extractContext(output, match.index),
      });
    }
  }

  return quotes;
}

/**
 * Extract context around a match position
 */
function extractContext(text: string, position: number, contextLines: number = 2): string {
  const lines = text.substring(0, position).split('\n');
  const endLines = text.substring(position).split('\n');

  const before = lines.slice(-contextLines).join('\n');
  const after = endLines.slice(0, contextLines + 1).join('\n');

  return `${before}\n${after}`.trim();
}

/**
 * Validate that a finding has proper evidence
 */
export function validateFindingEvidence(
  findingText: string,
  requiredMarkers: string[] = ['Evidence:', 'Finding:', 'Why it matters:', 'Fix:']
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const marker of requiredMarkers) {
    if (!findingText.toLowerCase().includes(marker.toLowerCase())) {
      missing.push(marker);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
