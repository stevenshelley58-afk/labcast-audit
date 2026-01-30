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

    const funnyMessages = [
      'Pretending to understand your website...',
      'Consulting my neural networks (they said "lol idk")...',
      'Running algorithms I definitely wrote myself...',
      'Checking if the code works... fingers crossed...',
      'Asking ChatGPT for help (just kidding... maybe)...',
      'Converting coffee to code analysis...',
      'Hoping the server doesn\'t crash this time...',
      'Making educated guesses look professional...',
      'Googling "how to audit websites" real quick...',
      'Applying machine learning (I think?)...',
      'Staring at pixels really intensely...',
      'Calculating... something... probably...',
      'Using AI responsibly (mostly)...',
      'Trying not to hallucinate findings...',
      'Cross-referencing with my imaginary database...',
      'Spinning up the hamster wheels...',
      'Pretending I know what SEO means...',
      'Analyzing code like I understand it...',
      'Running diagnostics (making it up as I go)...',
      'Deploying neural confidence intervals...',
      'Simulating competence successfully...',
      'Generating insights (or random thoughts)...',
      'Validating data (or just vibing)...',
      'Processing... please don\'t look at my source code...',
      'Almost done! (I have no idea how long this takes)...',
    ];

    try {
      await new Promise(r => setTimeout(r, 600));
      addLog(`Target Acquired: ${targetUrl}`, 200);
      if (pdpUrl) {
        addLog(`PDP Target: ${pdpUrl}`, 200);
      }

      setStatus(AuditStatus.ANALYZING);

      // Start streaming funny messages
      let messageIndex = 0;
      const messageInterval = setInterval(() => {
        if (messageIndex < funnyMessages.length) {
          addLog(funnyMessages[messageIndex], 200);
          messageIndex++;
        }
      }, 800);

      try {
        const result = await runAudit(targetUrl, pdpUrl, config, (msg) => {
          addLog(msg, 200);
        });

        clearInterval(messageInterval);

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
        clearInterval(messageInterval);
        throw err;
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
