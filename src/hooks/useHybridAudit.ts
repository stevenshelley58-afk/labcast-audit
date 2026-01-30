import { useState, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../lib/constants';

// ============================================================================
// Types
// ============================================================================

export interface HybridAuditConfig {
  crawlDepth?: 'surface' | 'shallow' | 'deep';
  visualMode?: 'url_context' | 'rendered' | 'both' | 'none';
  psiEnabled?: boolean;
  securityScope?: 'headers_only' | 'full';
  providers?: {
    gemini?: { maxConcurrent: number };
    openai?: { maxConcurrent: number };
  };
  enableCodebasePeek?: boolean;
  enablePdp?: boolean;
}

export interface HybridAuditFinding {
  id: string;
  finding: string;
  evidence: string;
  whyItMatters: string;
  fix: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  priorityScore: number;
}

export interface HybridAuditScores {
  overall: number;
  technical: number;
  onPage: number;
  content: number;
  performance: number;
  security: number;
  visual: number;
}

export interface HybridAuditReport {
  url: string;
  pdpUrl?: string;
  scores: HybridAuditScores;
  summary: string;
  findings: HybridAuditFinding[];
  topIssues: Array<{
    title: string;
    narrative: string;
    relatedFindings: string[];
    category: string;
  }>;
  actionItems: Array<{
    action: string;
    rationale: string;
    expectedImpact: string;
    effort: string;
    category: string;
  }>;
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  scoreJustifications: Record<string, string>;
  explicitGaps: string[];
  generatedAt: string;
  usedSynthesis: boolean;
  metadata: {
    totalCost: number;
    totalDurationMs: number;
    layerTimings: {
      layer1: number;
      layer2: number;
      layer3: number;
      layer4: number;
    };
    completedAudits: string[];
    providersUsed: string[];
  };
}

export type HybridAuditStage =
  | 'idle'
  | 'starting'
  | 'layer1'
  | 'layer2'
  | 'layer3'
  | 'layer4'
  | 'complete'
  | 'error';

export interface HybridAuditProgress {
  stage: HybridAuditStage;
  message: string;
  layer1Progress: {
    collectors: string[];
    completed: string[];
    failed: string[];
  };
  layer3Progress: {
    audits: string[];
    completed: string[];
    failed: string[];
    findingsCount: number;
  };
}

export interface HybridAuditEvent {
  type: string;
  message?: string;
  data?: unknown;
  timestamp: string;
  audit?: string;
  collector?: string;
  status?: string;
  finding?: HybridAuditFinding;
}

export interface UseHybridAuditResult {
  /** Current progress state */
  progress: HybridAuditProgress;
  /** Final report (when complete) */
  report: HybridAuditReport | null;
  /** Error message */
  error: string | null;
  /** Whether audit is running */
  isRunning: boolean;
  /** Event log */
  events: HybridAuditEvent[];
  /** Start the audit */
  startAudit: (url: string, pdpUrl?: string, config?: HybridAuditConfig) => void;
  /** Cancel the audit */
  cancelAudit: () => void;
  /** Reset state */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialProgress: HybridAuditProgress = {
  stage: 'idle',
  message: '',
  layer1Progress: {
    collectors: [],
    completed: [],
    failed: [],
  },
  layer3Progress: {
    audits: [],
    completed: [],
    failed: [],
    findingsCount: 0,
  },
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useHybridAudit(): UseHybridAuditResult {
  const [progress, setProgress] = useState<HybridAuditProgress>(initialProgress);
  const [report, setReport] = useState<HybridAuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<HybridAuditEvent[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setProgress(initialProgress);
    setReport(null);
    setError(null);
    setIsRunning(false);
    setEvents([]);
  }, []);

  const cancelAudit = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setProgress((prev) => ({
      ...prev,
      stage: 'idle',
      message: 'Audit cancelled',
    }));
  }, []);

  const startAudit = useCallback(
    (url: string, pdpUrl?: string, config?: HybridAuditConfig) => {
      // Reset state
      reset();
      setIsRunning(true);

      // Create abort controller for fallback
      abortControllerRef.current = new AbortController();

      // Try SSE first
      const body = JSON.stringify({ url, pdpUrl, config });

      // Use fetch with POST to initiate SSE (EventSource only supports GET)
      // We'll use a workaround with fetch and ReadableStream
      fetch(API_ENDPOINTS.HYBRID_AUDIT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body,
        signal: abortControllerRef.current.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
          }

          const contentType = response.headers.get('content-type') || '';

          if (contentType.includes('text/event-stream') && response.body) {
            // SSE mode - process stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const event: HybridAuditEvent = JSON.parse(line.slice(6));
                    processEvent(event);
                  } catch (e) {
                    console.warn('Failed to parse SSE event:', line);
                  }
                }
              }
            }
          } else {
            // JSON mode - process response
            const data = await response.json();
            if (data.report) {
              setReport(data.report);
              setProgress((prev) => ({
                ...prev,
                stage: 'complete',
                message: 'Audit complete',
              }));
            }
          }

          setIsRunning(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            return;
          }
          setError(err.message);
          setProgress((prev) => ({
            ...prev,
            stage: 'error',
            message: err.message,
          }));
          setIsRunning(false);
        });
    },
    [reset]
  );

  const processEvent = useCallback((event: HybridAuditEvent) => {
    setEvents((prev) => [...prev, event]);

    switch (event.type) {
      case 'audit:start':
        setProgress((prev) => ({
          ...prev,
          stage: 'starting',
          message: event.message || 'Starting audit...',
        }));
        break;

      case 'layer1:start':
        setProgress((prev) => ({
          ...prev,
          stage: 'layer1',
          message: event.message || 'Collecting data...',
        }));
        break;

      case 'layer1:collector':
        if (event.collector) {
          setProgress((prev) => {
            const newProgress = { ...prev };
            if (event.status === 'started') {
              newProgress.layer1Progress = {
                ...prev.layer1Progress,
                collectors: [...prev.layer1Progress.collectors, event.collector!],
              };
            } else if (event.status === 'completed') {
              newProgress.layer1Progress = {
                ...prev.layer1Progress,
                completed: [...prev.layer1Progress.completed, event.collector!],
              };
            } else if (event.status === 'failed') {
              newProgress.layer1Progress = {
                ...prev.layer1Progress,
                failed: [...prev.layer1Progress.failed, event.collector!],
              };
            }
            return newProgress;
          });
        }
        break;

      case 'layer1:complete':
        setProgress((prev) => ({
          ...prev,
          message: event.message || 'Data collection complete',
        }));
        break;

      case 'layer2:start':
        setProgress((prev) => ({
          ...prev,
          stage: 'layer2',
          message: event.message || 'Extracting page data...',
        }));
        break;

      case 'layer2:complete':
        setProgress((prev) => ({
          ...prev,
          message: event.message || 'Extraction complete',
        }));
        break;

      case 'layer3:start':
        setProgress((prev) => ({
          ...prev,
          stage: 'layer3',
          message: event.message || 'Running audits...',
        }));
        break;

      case 'layer3:audit':
        if (event.audit) {
          setProgress((prev) => {
            const newProgress = { ...prev };
            if (event.status === 'started') {
              newProgress.layer3Progress = {
                ...prev.layer3Progress,
                audits: [...prev.layer3Progress.audits, event.audit!],
              };
              newProgress.message = `Running ${event.audit} audit...`;
            } else if (event.status === 'completed') {
              newProgress.layer3Progress = {
                ...prev.layer3Progress,
                completed: [...prev.layer3Progress.completed, event.audit!],
              };
            } else if (event.status === 'failed') {
              newProgress.layer3Progress = {
                ...prev.layer3Progress,
                failed: [...prev.layer3Progress.failed, event.audit!],
              };
            }
            return newProgress;
          });
        }
        break;

      case 'layer3:finding':
        if (event.finding) {
          setProgress((prev) => ({
            ...prev,
            layer3Progress: {
              ...prev.layer3Progress,
              findingsCount: prev.layer3Progress.findingsCount + 1,
            },
          }));
        }
        break;

      case 'layer3:complete':
        setProgress((prev) => ({
          ...prev,
          message: event.message || 'Audits complete',
        }));
        break;

      case 'layer4:start':
        setProgress((prev) => ({
          ...prev,
          stage: 'layer4',
          message: event.message || 'Synthesizing results...',
        }));
        break;

      case 'layer4:complete':
        setProgress((prev) => ({
          ...prev,
          message: event.message || 'Synthesis complete',
        }));
        break;

      case 'audit:complete':
        if (event.data && typeof event.data === 'object' && 'report' in event.data) {
          setReport((event.data as { report: HybridAuditReport }).report);
        }
        setProgress((prev) => ({
          ...prev,
          stage: 'complete',
          message: 'Audit complete',
        }));
        setIsRunning(false);
        break;

      case 'audit:error':
        setError(event.message || 'An error occurred');
        setProgress((prev) => ({
          ...prev,
          stage: 'error',
          message: event.message || 'An error occurred',
        }));
        setIsRunning(false);
        break;
    }
  }, []);

  return {
    progress,
    report,
    error,
    isRunning,
    events,
    startAudit,
    cancelAudit,
    reset,
  };
}
