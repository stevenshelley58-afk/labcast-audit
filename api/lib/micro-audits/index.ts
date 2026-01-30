/**
 * Micro-Audit Orchestrator
 *
 * Coordinates all Layer 3 micro-audits with provider sharding.
 */

import type { Layer1Result } from '../collectors/index.js';
import type { Layer2Result } from '../extractors/index.js';
import { runTechnicalSeoAudit, getDeterministicTechnicalFindings } from './technical-seo.js';
import { runPerformanceAudit, getDeterministicPerformanceFindings } from './performance.js';
import { runOnPageSeoAudit, getDeterministicOnPageFindings } from './on-page-seo.js';
import { runContentQualityAudit, extractContentPreview } from './content-quality.js';
import { runAuthorityTrustAudit } from './authority-trust.js';
import { runVisualAudit, captureScreenshot } from './visual-audit.js';
import { runCodebasePeekAudit } from './codebase-peek.js';
import { runPdpAudit } from './pdp-audit.js';
import {
  type Layer3Result,
  type MicroAuditResult,
  type MicroAuditFinding,
  type MicroAuditType,
  type MicroAuditConfig,
  type Layer3Event,
  type Layer3EventType,
  DEFAULT_MICRO_AUDIT_CONFIG,
  sortFindingsByPriority,
} from './types.js';

// Re-export types
export * from './types.js';
export { captureScreenshot } from './visual-audit.js';
export { extractContentPreview } from './content-quality.js';

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Run all Layer 3 micro-audits
 */
export async function runLayer3Audits(
  layer1: Layer1Result,
  layer2: Layer2Result,
  config: Partial<MicroAuditConfig> = {},
  pdpHtml?: string,
  pdpSnapshot?: Layer2Result['pdp']
): Promise<Layer3Result> {
  const startTime = Date.now();
  const cfg: MicroAuditConfig = { ...DEFAULT_MICRO_AUDIT_CONFIG, ...config };

  const audits: Partial<Record<MicroAuditType, MicroAuditResult | null>> = {};
  const errors: Layer3Result['errors'] = [];
  const completedAudits: MicroAuditType[] = [];
  const skippedAudits: MicroAuditType[] = [];

  // Extract content preview for content audits
  const contentPreview = extractContentPreview(layer1.evidence.html.content);

  // Prepare audit tasks
  const auditTasks: Array<{
    type: MicroAuditType;
    run: () => Promise<MicroAuditResult>;
    skip?: boolean;
    skipReason?: string;
  }> = [
    {
      type: 'technical-seo',
      run: () => runTechnicalSeoAudit(layer1, layer2.homepage),
    },
    {
      type: 'performance',
      run: () => runPerformanceAudit(layer1.pageSpeed),
    },
    {
      type: 'on-page-seo',
      run: () => runOnPageSeoAudit(layer2.homepage),
    },
    {
      type: 'content-quality',
      run: () => runContentQualityAudit(layer2.homepage, contentPreview),
    },
    {
      type: 'authority-trust',
      run: () => runAuthorityTrustAudit(layer2.homepage, layer1.securityHeaders),
    },
  ];

  // Visual audit (based on mode)
  if (cfg.visualMode !== 'none') {
    if (cfg.visualMode === 'url_context' || cfg.visualMode === 'both') {
      auditTasks.push({
        type: 'visual-url-context',
        run: async () => {
          const results = await runVisualAudit({
            mode: 'url_context',
            url: layer1.url,
          });
          return results[0];
        },
      });
    }

    if (cfg.visualMode === 'rendered' || cfg.visualMode === 'both') {
      auditTasks.push({
        type: 'visual-screenshot',
        run: async () => {
          const screenshot = await captureScreenshot(layer1.url);
          if (!screenshot) {
            return {
              auditType: 'visual-screenshot',
              findings: [],
              rawOutput: '',
              provider: 'openai',
              model: 'gpt-4o',
              durationMs: 0,
              cost: 0,
              error: 'Screenshot capture failed',
            };
          }
          const results = await runVisualAudit({
            mode: 'screenshot',
            url: layer1.url,
            screenshotBase64: screenshot,
          });
          return results[0];
        },
      });
    }
  } else {
    skippedAudits.push('visual-url-context', 'visual-screenshot');
  }

  // Codebase peek
  if (cfg.enableCodebasePeek) {
    auditTasks.push({
      type: 'codebase-peek',
      run: () => runCodebasePeekAudit(layer1.evidence.html.content, layer2.homepage),
    });
  } else {
    skippedAudits.push('codebase-peek');
  }

  // PDP audit
  if (cfg.enablePdp && pdpSnapshot) {
    const pdpContent = pdpHtml ? extractContentPreview(pdpHtml) : '';
    auditTasks.push({
      type: 'pdp',
      run: () => runPdpAudit(pdpSnapshot, pdpContent),
    });
  } else {
    skippedAudits.push('pdp');
  }

  // Run all audits in parallel
  const results = await Promise.all(
    auditTasks
      .filter((task) => !task.skip)
      .map(async (task) => {
        try {
          const result = await task.run();
          return { type: task.type, result };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          errors.push({ audit: task.type, error });
          return {
            type: task.type,
            result: {
              auditType: task.type,
              findings: [],
              rawOutput: '',
              provider: 'gemini' as const,
              model: 'gemini-2.0-flash',
              durationMs: 0,
              cost: 0,
              error,
            },
          };
        }
      })
  );

  // Collect results
  let totalCost = 0;
  const allFindings: MicroAuditFinding[] = [];

  for (const { type, result } of results) {
    audits[type] = result;
    totalCost += result.cost;

    if (result.error) {
      errors.push({ audit: type, error: result.error });
    } else {
      completedAudits.push(type);
    }

    // Collect findings
    allFindings.push(...result.findings);
  }

  // Sort findings by priority
  const sortedFindings = sortFindingsByPriority(allFindings);

  // Limit findings if configured
  const limitedFindings =
    cfg.maxFindingsPerAudit > 0
      ? limitFindingsPerAudit(sortedFindings, cfg.maxFindingsPerAudit)
      : sortedFindings;

  return {
    audits: audits as Record<MicroAuditType, MicroAuditResult | null>,
    allFindings: limitedFindings,
    durationMs: Date.now() - startTime,
    totalCost,
    errors,
    completedAudits,
    skippedAudits,
  };
}

// ============================================================================
// With Events (for SSE)
// ============================================================================

/**
 * Run Layer 3 audits with event callbacks for SSE streaming
 */
export async function runLayer3AuditsWithEvents(
  layer1: Layer1Result,
  layer2: Layer2Result,
  config: Partial<MicroAuditConfig>,
  pdpHtml: string | undefined,
  pdpSnapshot: Layer2Result['pdp'] | undefined,
  onEvent: (event: Layer3Event) => void
): Promise<Layer3Result> {
  const emit = (
    type: Layer3EventType,
    extra: Partial<Omit<Layer3Event, 'type' | 'timestamp'>> = {}
  ) => {
    onEvent({
      type,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  };

  emit('layer3:start', { message: 'Starting micro-audits' });

  const cfg: MicroAuditConfig = { ...DEFAULT_MICRO_AUDIT_CONFIG, ...config };
  const startTime = Date.now();

  const audits: Partial<Record<MicroAuditType, MicroAuditResult | null>> = {};
  const errors: Layer3Result['errors'] = [];
  const completedAudits: MicroAuditType[] = [];
  const skippedAudits: MicroAuditType[] = [];

  const contentPreview = extractContentPreview(layer1.evidence.html.content);

  // Define all audit runners with event emission
  const runAuditWithEvents = async (
    type: MicroAuditType,
    runner: () => Promise<MicroAuditResult>
  ): Promise<{ type: MicroAuditType; result: MicroAuditResult }> => {
    emit('layer3:audit', { audit: type, status: 'started' });

    try {
      const result = await runner();

      if (result.error) {
        emit('layer3:audit', {
          audit: type,
          status: 'failed',
          message: result.error,
        });
      } else {
        emit('layer3:audit', { audit: type, status: 'completed' });

        // Emit individual findings
        for (const finding of result.findings) {
          emit('layer3:finding', { audit: type, finding });
        }
      }

      return { type, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit('layer3:audit', { audit: type, status: 'failed', message: error });

      return {
        type,
        result: {
          auditType: type,
          findings: [],
          rawOutput: '',
          provider: 'gemini' as const,
          model: 'gemini-2.0-flash',
          durationMs: 0,
          cost: 0,
          error,
        },
      };
    }
  };

  // Prepare and run audits
  const auditPromises: Promise<{ type: MicroAuditType; result: MicroAuditResult }>[] = [
    runAuditWithEvents('technical-seo', () =>
      runTechnicalSeoAudit(layer1, layer2.homepage)
    ),
    runAuditWithEvents('performance', () => runPerformanceAudit(layer1.pageSpeed)),
    runAuditWithEvents('on-page-seo', () => runOnPageSeoAudit(layer2.homepage)),
    runAuditWithEvents('content-quality', () =>
      runContentQualityAudit(layer2.homepage, contentPreview)
    ),
    runAuditWithEvents('authority-trust', () =>
      runAuthorityTrustAudit(layer2.homepage, layer1.securityHeaders)
    ),
  ];

  // Visual audits
  if (cfg.visualMode === 'url_context' || cfg.visualMode === 'both') {
    auditPromises.push(
      runAuditWithEvents('visual-url-context', async () => {
        const results = await runVisualAudit({ mode: 'url_context', url: layer1.url });
        return results[0];
      })
    );
  }

  if (cfg.visualMode === 'rendered' || cfg.visualMode === 'both') {
    auditPromises.push(
      runAuditWithEvents('visual-screenshot', async () => {
        const screenshot = await captureScreenshot(layer1.url);
        if (!screenshot) {
          return {
            auditType: 'visual-screenshot' as const,
            findings: [],
            rawOutput: '',
            provider: 'openai' as const,
            model: 'gpt-4o',
            durationMs: 0,
            cost: 0,
            error: 'Screenshot capture failed',
          };
        }
        const results = await runVisualAudit({
          mode: 'screenshot',
          url: layer1.url,
          screenshotBase64: screenshot,
        });
        return results[0];
      })
    );
  }

  // Codebase peek
  if (cfg.enableCodebasePeek) {
    auditPromises.push(
      runAuditWithEvents('codebase-peek', () =>
        runCodebasePeekAudit(layer1.evidence.html.content, layer2.homepage)
      )
    );
  }

  // PDP audit
  if (cfg.enablePdp && pdpSnapshot) {
    const pdpContent = pdpHtml ? extractContentPreview(pdpHtml) : '';
    auditPromises.push(
      runAuditWithEvents('pdp', () => runPdpAudit(pdpSnapshot, pdpContent))
    );
  }

  // Run all audits
  const results = await Promise.all(auditPromises);

  // Process results
  let totalCost = 0;
  const allFindings: MicroAuditFinding[] = [];

  for (const { type, result } of results) {
    audits[type] = result;
    totalCost += result.cost;

    if (result.error) {
      errors.push({ audit: type, error: result.error });
    } else {
      completedAudits.push(type);
    }

    allFindings.push(...result.findings);
  }

  const sortedFindings = sortFindingsByPriority(allFindings);
  const limitedFindings =
    cfg.maxFindingsPerAudit > 0
      ? limitFindingsPerAudit(sortedFindings, cfg.maxFindingsPerAudit)
      : sortedFindings;

  emit('layer3:complete', {
    message: 'Micro-audits complete',
    data: {
      completedAudits: completedAudits.length,
      totalFindings: limitedFindings.length,
      totalCost,
    },
  });

  return {
    audits: audits as Record<MicroAuditType, MicroAuditResult | null>,
    allFindings: limitedFindings,
    durationMs: Date.now() - startTime,
    totalCost,
    errors,
    completedAudits,
    skippedAudits,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function limitFindingsPerAudit(
  findings: MicroAuditFinding[],
  maxPerAudit: number
): MicroAuditFinding[] {
  const bySource: Record<string, MicroAuditFinding[]> = {};

  for (const finding of findings) {
    if (!bySource[finding.source]) {
      bySource[finding.source] = [];
    }
    if (bySource[finding.source].length < maxPerAudit) {
      bySource[finding.source].push(finding);
    }
  }

  return Object.values(bySource).flat();
}
