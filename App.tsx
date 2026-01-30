import React from 'react';
import { DebugOverlay } from './components/DebugOverlay';
import { useAuditExecution } from './src/hooks/useAuditExecution';
import { useAuditConfig } from './src/hooks/useAuditConfig';
import { useDebugMode } from './src/hooks/useDebugMode';
import { IdleView } from './src/components/views/IdleView';
import { LoadingView } from './src/components/views/LoadingView';
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
  const audit = useAuditExecution();
  const { config, setConfig } = useAuditConfig();
  const debug = useDebugMode();

  const handleSubmit = (url: string) => {
    audit.executeAudit(url, config);
  };

  const isLoading = audit.status === AuditStatus.CRAWLING || audit.status === AuditStatus.ANALYZING;

  return (
    <div className="min-h-screen text-app-black font-sans flex flex-col bg-[#f5f5f7]">
      {debug.isVisible && (
        <DebugOverlay
          traces={audit.traces}
          config={config}
          onConfigChange={setConfig}
          onClose={debug.hide}
          metadata={audit.metadata}
        />
      )}

      <div className="max-w-[1400px] mx-auto w-full px-6 md:px-12 flex-grow flex flex-col">
        <Header />

        <main className="flex-grow flex flex-col justify-center min-h-[60vh]">
          {audit.status === AuditStatus.IDLE && (
            <IdleView onSubmit={handleSubmit} />
          )}

          {isLoading && (
            <LoadingView status={audit.status} url={audit.url} logs={audit.logs} />
          )}

          {audit.status === AuditStatus.COMPLETE && audit.report && (
            <ResultsView report={audit.report} onNewAudit={audit.reset} />
          )}

          {audit.status === AuditStatus.ERROR && (
            <ErrorView
              url={audit.url}
              error={audit.error}
              onRetry={() => audit.retry(config)}
              onReset={audit.reset}
            />
          )}
        </main>

        <Footer onDebugClick={debug.promptPassword} />
      </div>
    </div>
  );
}
