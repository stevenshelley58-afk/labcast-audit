import React from 'react';
import { ResultsDashboard } from '../../../components/ResultsDashboard';
import { AuditReport } from '../../../types';

interface ResultsViewProps {
  report: AuditReport;
  onNewAudit: () => void;
}

export function ResultsView({ report, onNewAudit }: ResultsViewProps) {
  return (
    <div className="animate-fade-in pb-20 pt-10">
      <div className="flex flex-col md:flex-row justify-between items-end mb-12 border-b border-gray-200 pb-8 gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider mb-4">
            Audit Complete
          </div>
          <h2 className="text-5xl font-semibold text-black tracking-tighter mb-2">
            {new URL(report.url).hostname}
          </h2>
          <p className="text-gray-500 text-lg">
            Generated on {new Date(report.generatedAt).toLocaleDateString()} at {new Date(report.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={onNewAudit}
          className="px-8 py-4 rounded-full bg-white border border-gray-200 text-black hover:border-black hover:bg-gray-50 text-base font-medium transition-all shadow-sm"
        >
          New Audit
        </button>
      </div>
      <ResultsDashboard report={report} />
    </div>
  );
}
