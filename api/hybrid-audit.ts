import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeUrl } from './lib/url.js';
import { runLayer1CollectorsWithEvents, type Layer1Result } from './lib/collectors/index.js';
import { runLayer2ExtractionWithEvents, type Layer2Result } from './lib/extractors/index.js';
import { extractContentPreview } from './lib/micro-audits/index.js';
import { runLayer3AuditsWithEvents, type Layer3Result, captureScreenshot } from './lib/micro-audits/index.js';
import { runLayer4SynthesisWithEvents, type Layer4Result } from './lib/synthesis/index.js';
import { getProviderRegistry } from './lib/providers/index.js';
import {
  type HybridAuditConfig,
  type HybridAuditReport,
  type HybridAuditEvent,
  type HybridAuditEventType,
  DEFAULT_HYBRID_CONFIG,
} from './lib/types.js';
import { fetchHtml } from './lib/fetchers.js';

// ============================================================================
// SSE Helper
// ============================================================================

function sendSSE(res: VercelResponse, event: HybridAuditEvent): void {
  const data = JSON.stringify(event);
  res.write(`data: ${data}\n\n`);
}

function createEvent(
  type: HybridAuditEventType,
  extra: Partial<Omit<HybridAuditEvent, 'type' | 'timestamp'>> = {}
): HybridAuditEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
    });
  }

  // Check for required API keys
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({
      error: { code: 'API_ERROR', message: 'Server configuration error', retryable: false },
    });
  }

  // Parse request
  const { url: rawUrl, pdpUrl: rawPdpUrl, config: userConfig } = req.body;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      error: { code: 'INVALID_URL', message: 'URL is required' },
    });
  }

  // Normalize URL
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({
      error: { code: 'INVALID_URL', message: `Invalid URL: ${rawUrl}` },
    });
  }

  // Normalize and validate optional PDP URL
  let pdpUrl: string | null = null;
  if (rawPdpUrl && typeof rawPdpUrl === 'string') {
    pdpUrl = rawPdpUrl.trim();
    if (!/^https?:\/\//i.test(pdpUrl)) {
      pdpUrl = 'https://' + pdpUrl;
    }
    try {
      new URL(pdpUrl);
    } catch {
      return res.status(400).json({
        error: { code: 'INVALID_URL', message: `Invalid PDP URL: ${rawPdpUrl}` },
      });
    }
  }

  // Merge config with defaults
  const config: HybridAuditConfig = {
    ...DEFAULT_HYBRID_CONFIG,
    ...userConfig,
    providers: {
      ...DEFAULT_HYBRID_CONFIG.providers,
      ...userConfig?.providers,
    },
  };

  // Check Accept header for SSE
  const acceptHeader = req.headers.accept || '';
  const useSSE = acceptHeader.includes('text/event-stream');

  if (useSSE) {
    // SSE mode
    return handleSSE(req, res, url, pdpUrl, config);
  } else {
    // JSON mode (synchronous)
    return handleJSON(req, res, url, pdpUrl, config);
  }
}

// ============================================================================
// SSE Handler
// ============================================================================

async function handleSSE(
  req: VercelRequest,
  res: VercelResponse,
  url: string,
  pdpUrl: string | null,
  config: HybridAuditConfig
): Promise<void> {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const startTime = Date.now();
  const layerTimings = { layer1: 0, layer2: 0, layer3: 0, layer4: 0 };

  try {
    sendSSE(res, createEvent('audit:start', { message: `Starting audit for ${url}` }));

    // Initialize provider registry
    getProviderRegistry({
      gemini: { maxConcurrent: config.providers.gemini.maxConcurrent },
      openai: { maxConcurrent: config.providers.openai.maxConcurrent },
    });

    // ====== Layer 1: Collectors ======
    const layer1Start = Date.now();
    const layer1Result = await runLayer1CollectorsWithEvents(
      url,
      {
        psiEnabled: config.psiEnabled,
        securityScope: config.securityScope,
        crawlDepth: config.crawlDepth,
      },
      (event) => sendSSE(res, event as HybridAuditEvent)
    );
    layerTimings.layer1 = Date.now() - layer1Start;

    // ====== Layer 2: Extraction ======
    const layer2Start = Date.now();

    // Fetch PDP HTML if provided
    let pdpHtml: string | undefined;
    if (pdpUrl && config.enablePdp) {
      sendSSE(res, createEvent('layer2:progress', { message: 'Fetching PDP page' }));
      const pdpEvidence = await fetchHtml(pdpUrl, pdpUrl, 50000);
      pdpHtml = pdpEvidence.content;
    }

    const layer2Result = runLayer2ExtractionWithEvents(
      layer1Result,
      pdpHtml,
      pdpUrl || undefined,
      (event) => sendSSE(res, event as HybridAuditEvent)
    );
    layerTimings.layer2 = Date.now() - layer2Start;

    // ====== Layer 3: Micro-Audits ======
    const layer3Start = Date.now();
    const layer3Result = await runLayer3AuditsWithEvents(
      layer1Result,
      layer2Result,
      {
        visualMode: config.visualMode,
        enableCodebasePeek: config.enableCodebasePeek,
        enablePdp: config.enablePdp && !!pdpUrl,
      },
      pdpHtml,
      layer2Result.pdp || undefined,
      (event) => sendSSE(res, event as HybridAuditEvent)
    );
    layerTimings.layer3 = Date.now() - layer3Start;

    // ====== Layer 4: Synthesis ======
    const layer4Start = Date.now();
    const layer4Result = await runLayer4SynthesisWithEvents(
      url,
      layer1Result,
      layer3Result,
      (event) => sendSSE(res, event as HybridAuditEvent)
    );
    layerTimings.layer4 = Date.now() - layer4Start;

    // Build final report
    const report = buildReport(
      url,
      pdpUrl,
      layer1Result,
      layer2Result,
      layer3Result,
      layer4Result,
      layerTimings
    );

    sendSSE(
      res,
      createEvent('audit:complete', {
        message: 'Audit complete',
        data: { report },
      })
    );

    res.end();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Hybrid audit error:', err);

    sendSSE(
      res,
      createEvent('audit:error', {
        message: err.message,
        data: { error: err.message },
      })
    );

    res.end();
  }
}

// ============================================================================
// JSON Handler (Synchronous)
// ============================================================================

async function handleJSON(
  req: VercelRequest,
  res: VercelResponse,
  url: string,
  pdpUrl: string | null,
  config: HybridAuditConfig
): Promise<VercelResponse> {
  const startTime = Date.now();
  const layerTimings = { layer1: 0, layer2: 0, layer3: 0, layer4: 0 };

  try {
    // Initialize provider registry
    getProviderRegistry({
      gemini: { maxConcurrent: config.providers.gemini.maxConcurrent },
      openai: { maxConcurrent: config.providers.openai.maxConcurrent },
    });

    // ====== Layer 1: Collectors ======
    const layer1Start = Date.now();
    const { runLayer1Collectors } = await import('./lib/collectors/index.js');
    const layer1Result = await runLayer1Collectors(url, {
      psiEnabled: config.psiEnabled,
      securityScope: config.securityScope,
      crawlDepth: config.crawlDepth,
    });
    layerTimings.layer1 = Date.now() - layer1Start;

    // ====== Layer 2: Extraction ======
    const layer2Start = Date.now();
    const { runLayer2Extraction } = await import('./lib/extractors/index.js');

    // Fetch PDP HTML if provided
    let pdpHtml: string | undefined;
    if (pdpUrl && config.enablePdp) {
      const pdpEvidence = await fetchHtml(pdpUrl, pdpUrl, 50000);
      pdpHtml = pdpEvidence.content;
    }

    const layer2Result = runLayer2Extraction(layer1Result, pdpHtml, pdpUrl || undefined);
    layerTimings.layer2 = Date.now() - layer2Start;

    // ====== Layer 3: Micro-Audits ======
    const layer3Start = Date.now();
    const { runLayer3Audits } = await import('./lib/micro-audits/index.js');
    const layer3Result = await runLayer3Audits(
      layer1Result,
      layer2Result,
      {
        visualMode: config.visualMode,
        enableCodebasePeek: config.enableCodebasePeek,
        enablePdp: config.enablePdp && !!pdpUrl,
      },
      pdpHtml,
      layer2Result.pdp || undefined
    );
    layerTimings.layer3 = Date.now() - layer3Start;

    // ====== Layer 4: Synthesis ======
    const layer4Start = Date.now();
    const { runLayer4Synthesis } = await import('./lib/synthesis/index.js');
    const layer4Result = await runLayer4Synthesis(url, layer1Result, layer3Result);
    layerTimings.layer4 = Date.now() - layer4Start;

    // Build final report
    const report = buildReport(
      url,
      pdpUrl,
      layer1Result,
      layer2Result,
      layer3Result,
      layer4Result,
      layerTimings
    );

    return res.status(200).json({
      report,
      metadata: report.metadata,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Hybrid audit error:', err);

    // Check for rate limiting
    if (err.message.includes('429') || err.message.toLowerCase().includes('rate')) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryable: true },
      });
    }

    return res.status(500).json({
      error: { code: 'API_ERROR', message: err.message, retryable: true },
    });
  }
}

// ============================================================================
// Report Builder
// ============================================================================

function buildReport(
  url: string,
  pdpUrl: string | null,
  layer1: Layer1Result,
  layer2: Layer2Result,
  layer3: Layer3Result,
  layer4: Layer4Result,
  layerTimings: { layer1: number; layer2: number; layer3: number; layer4: number }
): HybridAuditReport {
  // Get unique providers used
  const providersUsed = new Set<string>();
  for (const audit of Object.values(layer3.audits)) {
    if (audit) {
      providersUsed.add(audit.provider);
    }
  }
  providersUsed.add(layer4.synthesis.provider);

  return {
    url,
    pdpUrl: pdpUrl || undefined,
    scores: {
      overall: layer4.scores.overall,
      technical: layer4.scores.technical,
      onPage: layer4.scores.onPage,
      content: layer4.scores.content,
      performance: layer4.scores.performance,
      security: layer4.scores.security,
      visual: layer4.scores.visual,
    },
    summary: layer4.synthesis.executiveSummary,
    findings: layer4.mergedFindings.map((f) => ({
      id: f.id,
      finding: f.finding,
      evidence: f.evidence,
      whyItMatters: f.whyItMatters,
      fix: f.fix,
      priority: f.priority,
      category: f.category,
      source: f.source,
      confidence: f.confidence,
      priorityScore: f.priorityScore,
    })),
    topIssues: layer4.synthesis.topIssues,
    actionItems: layer4.synthesis.nextSteps,
    actionPlan: layer4.actionPlan,
    scoreJustifications: layer4.synthesis.scoreJustifications,
    explicitGaps: layer4.explicitGaps,
    generatedAt: new Date().toISOString(),
    usedSynthesis: !layer4.synthesis.error,
    metadata: {
      totalCost: layer4.totalCost,
      totalDurationMs:
        layerTimings.layer1 +
        layerTimings.layer2 +
        layerTimings.layer3 +
        layerTimings.layer4,
      layerTimings,
      completedAudits: layer3.completedAudits,
      providersUsed: Array.from(providersUsed),
    },
  };
}
