import React, { useState } from 'react';
import { DebugOverlay } from './components/DebugOverlay';
import { useAuditExecution } from './src/hooks/useAuditExecution';
import { useAuditConfig } from './src/hooks/useAuditConfig';
import { useDebugMode } from './src/hooks/useDebugMode';
import { useHybridAudit } from './src/hooks/useHybridAudit';
import { IdleView } from './src/components/views/IdleView';
import { LoadingView } from './src/components/views/LoadingView';
import { HybridLoadingView } from './src/components/HybridLoadingView';
import { ResultsView } from './src/components/views/ResultsView';
import { ErrorView } from './src/components/views/ErrorView';
import { AuditStatus } from './types';

function Header() {
  return (
    <header className="flex items-center justify-between py-8">
      <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.reload()}>
        <h1 className="text-xl font-bold tracking-tighter text-black">Audit</h1>
      </div>
      <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-500">
        <a href="#" className="hover:text-black transition-colors">Products</a>
        <a href="#" className="hover:text-black transition-colors">Enterprise</a>
        <a href="#" className="hover:text-black transition-colors">Pricing</a>
      </nav>
      <div className="hidden md:flex gap-4 items-center">
        <a href="#" className="text-sm font-medium text-black hover:opacity-70">Login</a>
        <button className="bg-black text-white text-sm font-medium px-6 py-2.5 rounded-full hover:bg-gray-800 transition-colors">
          Get Started
        </button>
      </div>
    </header>
  );
}

interface FooterProps {
  onDebugClick: () => void;
}

function Footer({ onDebugClick }: FooterProps) {
  return (
    <footer className="w-full py-12 border-t border-gray-200 mt-auto">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <p
          className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600 transition-colors"
          onClick={onDebugClick}
        >
          © 2025 All rights reserved.
        </p>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="#" className="text-xs text-gray-400 hover:text-black">Privacy</a>
          <a href="#" className="text-xs text-gray-400 hover:text-black">Terms</a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [useHybridMode, setUseHybridMode] = useState(true); // Default to hybrid mode
  const audit = useAuditExecution();
  const hybrid = useHybridAudit();
  const { config, setConfig, isSaving } = useAuditConfig();
  const debug = useDebugMode();

  const handleSubmit = (url: string, pdpUrl?: string) => {
    if (useHybridMode) {
      hybrid.startAudit(url, pdpUrl, {
        visualMode: 'url_context',
        psiEnabled: true,
        enableCodebasePeek: true,
        enablePdp: !!pdpUrl,
      });
    } else {
      audit.executeAudit(url, config, pdpUrl);
    }
  };

  const handleReset = () => {
    if (useHybridMode) {
      hybrid.reset();
    } else {
      audit.reset();
    }
  };

  // Determine current state
  const isLoading = useHybridMode
    ? hybrid.isRunning
    : audit.status === AuditStatus.CRAWLING || audit.status === AuditStatus.ANALYZING;

  const isComplete = useHybridMode
    ? hybrid.progress.stage === 'complete' && hybrid.report
    : audit.status === AuditStatus.COMPLETE && audit.report;

  const isError = useHybridMode
    ? hybrid.progress.stage === 'error'
    : audit.status === AuditStatus.ERROR;

  const isIdle = useHybridMode
    ? hybrid.progress.stage === 'idle' && !hybrid.isRunning
    : audit.status === AuditStatus.IDLE;

  // Convert hybrid report to old format for ResultsView compatibility
  const displayReport = useHybridMode && hybrid.report
    ? {
        overallScore: hybrid.report.scores.overall,
        url: hybrid.report.url,
        summary: hybrid.report.summary,
        designAnalysis: {
          aestheticScore: hybrid.report.scores.visual,
          pricePointMatch: 'N/A',
          critique: hybrid.report.scoreJustifications?.overall || '',
        },
        findings: hybrid.report.findings.map((f) => ({
          id: f.id,
          category: f.category as 'seo' | 'technical' | 'design' | 'conversion' | 'content',
          title: f.finding,
          description: f.whyItMatters,
          impact: f.priority === 'critical' || f.priority === 'high' ? 'High' : f.priority === 'medium' ? 'Medium' : 'Low' as 'High' | 'Medium' | 'Low',
          priority: f.priority === 'critical' ? 1 : f.priority === 'high' ? 2 : f.priority === 'medium' ? 3 : 4 as 1 | 2 | 3 | 4 | 5,
          fix: f.fix,
        })),
        generatedAt: hybrid.report.generatedAt,
      }
    : audit.report;

  // Convert hybrid events to trace-like format for debug overlay
  const hybridTraces = useHybridMode && hybrid.events.length > 0
    ? hybrid.events
        .filter((e) => e.type.includes('audit') || e.type.includes('layer'))
        .map((e, i) => ({
          id: `hybrid-${i}`,
          stepId: e.audit || e.type,
          stepName: e.audit || e.type.replace(':', ' ').replace(/-/g, ' '),
          timestamp: new Date(e.timestamp).getTime(),
          url: hybrid.report?.url || '',
          model: 'hybrid',
          durationMs: 0,
          request: {
            systemInstruction: '',
            prompt: e.message || JSON.stringify(e.data || {}, null, 2),
            tools: [],
          },
          response: {
            rawText: e.finding ? JSON.stringify(e.finding, null, 2) : JSON.stringify(e.data || {}, null, 2),
          },
        }))
    : [];

  const displayTraces = useHybridMode ? hybridTraces : audit.traces;
  const displayMetadata = useHybridMode && hybrid.report
    ? {
        totalCost: hybrid.report.metadata.totalCost,
        totalDurationMs: hybrid.report.metadata.totalDurationMs,
        screenshotCaptured: false,
        pdpAnalyzed: !!hybrid.report.pdpUrl,
      }
    : audit.metadata;

  return (
    <div className="min-h-screen text-app-black font-sans flex flex-col bg-[#f5f5f7]">
      {debug.isVisible && (
        <DebugOverlay
          traces={displayTraces}
          config={config}
          onConfigChange={setConfig}
          onClose={debug.hide}
          metadata={displayMetadata}
          isSaving={isSaving}
          hybridMode={useHybridMode}
          hybridReport={hybrid.report}
          hybridEvents={hybrid.events}
          onToggleHybrid={() => setUseHybridMode(!useHybridMode)}
        />
      )}

      <div className="max-w-[1400px] mx-auto w-full px-6 md:px-12 flex-grow flex flex-col">
        <Header />

        <main className="flex-grow flex flex-col justify-center min-h-[60vh]">
          {isIdle && (
            <IdleView onSubmit={handleSubmit} />
          )}

          {isLoading && useHybridMode && (
            <HybridLoadingView progress={hybrid.progress} url={hybrid.report?.url || ''} />
          )}

          {isLoading && !useHybridMode && (
            <LoadingView status={audit.status} url={audit.url} logs={audit.logs} />
          )}

          {isComplete && displayReport && (
            <ResultsView report={displayReport} onNewAudit={handleReset} />
          )}

          {isError && (
            <ErrorView
              url={useHybridMode ? (hybrid.report?.url || '') : audit.url}
              error={useHybridMode ? { code: 'API_ERROR', message: hybrid.error || 'Unknown error', retryable: true } : audit.error}
              onRetry={() => useHybridMode ? hybrid.reset() : audit.retry(config)}
              onReset={handleReset}
            />
          )}
        </main>

        <Footer onDebugClick={debug.promptPassword} />
      </div>
    </div>
  );
}
