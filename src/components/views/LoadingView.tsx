import React from 'react';
import { Loader2 } from 'lucide-react';
import { TerminalLog } from '../../../components/TerminalLog';
import { AuditStatus, CrawlerLog } from '../../../types';

interface LoadingViewProps {
  status: AuditStatus;
  url: string;
  logs: CrawlerLog[];
}

export function LoadingView({ status, url, logs }: LoadingViewProps) {
  const isCrawling = status === AuditStatus.CRAWLING;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 animate-fade-in flex flex-col items-center">
      <div className="text-center space-y-4 mb-8">
        <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
          <Loader2 className="animate-spin w-8 h-8 text-black" />
        </div>
        <h3 className="text-3xl font-semibold text-black tracking-tight">
          {isCrawling ? 'Capturing Site Visuals...' : 'Doing very technical coding stuff'}
        </h3>
        <p className="text-gray-500 max-w-lg mx-auto">
          {isCrawling
            ? `Taking high-res snapshot of ${url}`
            : 'Applying 5-step agentic audit framework (Visual, Search, Technical). I really hope my code does not crash again.'}
        </p>
      </div>

      <TerminalLog logs={logs} active={true} />
    </div>
  );
}
