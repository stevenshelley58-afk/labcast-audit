import { useState, useCallback } from 'react';
import { AuditStatus, AuditReport, AuditTrace, CrawlerLog, AuditConfig } from '../../types';
import { runAudit, AuditMetadata } from '../services/auditClient';
import { AuditError, isAuditError, getUserFriendlyMessage } from '../lib/errors';

export interface AuditExecutionState {
  status: AuditStatus;
  report: AuditReport | null;
  traces: AuditTrace[];
  logs: CrawlerLog[];
  error: AuditError | null;
  metadata: AuditMetadata | null;
}

export function useAuditExecution() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AuditStatus>(AuditStatus.IDLE);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [traces, setTraces] = useState<AuditTrace[]>([]);
  const [logs, setLogs] = useState<CrawlerLog[]>([]);
  const [error, setError] = useState<AuditError | null>(null);
  const [metadata, setMetadata] = useState<AuditMetadata | null>(null);

  const addLog = useCallback((message: string, code: number = 200) => {
    setLogs(prev => [...prev, {
      url: message,
      status: code,
      time: Date.now()
    }]);
  }, []);

  const executeAudit = useCallback(async (targetUrl: string, config: AuditConfig, pdpUrl?: string) => {
    if (!targetUrl) return;

    setUrl(targetUrl);
    setStatus(AuditStatus.CRAWLING);
    setLogs([]);
    setReport(null);
    setTraces([]);
    setError(null);
    setMetadata(null);

    addLog('Initializing Audit Protocol...', 200);

    try {
      await new Promise(r => setTimeout(r, 600));
      addLog(`Target Acquired: ${targetUrl}`, 200);
      if (pdpUrl) {
        addLog(`PDP Target: ${pdpUrl}`, 200);
      }

      setStatus(AuditStatus.ANALYZING);

      const result = await runAudit(targetUrl, pdpUrl, config, (msg) => {
        addLog(msg, 200);
      });

      if (result.report.overallScore === 0) {
        addLog('AUDIT FAILED: Target unreachable or blocked.', 404);
        setStatus(AuditStatus.ERROR);
        setError(new AuditError('FETCH_FAILED', 'Target unreachable or blocked'));
      } else {
        addLog('Audit Complete. Report Generated.', 200);
        setReport(result.report);
        setTraces(result.traces);
        setMetadata(result.metadata);
        setStatus(AuditStatus.COMPLETE);
      }
    } catch (err) {
      console.error(err);

      if (isAuditError(err)) {
        setError(err);
        addLog(`ERROR: ${getUserFriendlyMessage(err.code)}`, 500);
      } else {
        const auditError = new AuditError('UNKNOWN', 'An unexpected error occurred');
        setError(auditError);
        addLog('CRITICAL ERROR: Connection Terminated.', 500);
      }

      setStatus(AuditStatus.ERROR);
    }
  }, [addLog]);

  const reset = useCallback(() => {
    setUrl('');
    setStatus(AuditStatus.IDLE);
    setReport(null);
    setTraces([]);
    setLogs([]);
    setError(null);
    setMetadata(null);
  }, []);

  const retry = useCallback((config: AuditConfig) => {
    if (url) {
      executeAudit(url, config);
    }
  }, [url, executeAudit]);

  return {
    url,
    status,
    report,
    traces,
    logs,
    error,
    metadata,
    executeAudit,
    reset,
    retry,
  };
}
