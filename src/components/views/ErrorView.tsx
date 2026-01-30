import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { AuditError, getUserFriendlyMessage } from '../../lib/errors';

interface ErrorViewProps {
  url: string;
  error: AuditError | null;
  onRetry: () => void;
  onReset: () => void;
}

export function ErrorView({ url, error, onRetry, onReset }: ErrorViewProps) {
  const errorMessage = error
    ? getUserFriendlyMessage(error.code)
    : `We could not access the website. It may be blocking crawlers, down, or the URL is invalid.`;

  const canRetry = error?.retryable !== false;

  return (
    <div className="max-w-lg mx-auto text-center mt-10 bg-white p-12 rounded-[32px] shadow-2xl shadow-black/10">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 text-red-500 mb-6">
        <AlertCircle size={40} />
      </div>
      <h2 className="text-3xl font-bold text-black mb-4">Audit Failed</h2>
      <p className="text-gray-500 mb-4 leading-relaxed text-lg">
        {errorMessage}
      </p>
      {url && (
        <p className="text-gray-400 mb-8 text-sm font-mono truncate">
          {url}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {canRetry && (
          <button
            onClick={onRetry}
            className="bg-black text-white hover:bg-gray-800 px-8 py-4 rounded-full font-medium transition-colors text-lg flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} />
            Retry
          </button>
        )}
        <button
          onClick={onReset}
          className={`${canRetry ? 'bg-white border border-gray-200 text-black hover:border-black' : 'bg-black text-white hover:bg-gray-800'} px-8 py-4 rounded-full font-medium transition-colors text-lg`}
        >
          {canRetry ? 'Try Different URL' : 'Try Again'}
        </button>
      </div>

      {error?.details && (
        <details className="mt-8 text-left">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            Technical details
          </summary>
          <pre className="mt-2 text-xs text-gray-500 bg-gray-50 p-4 rounded-lg overflow-auto">
            {error.details}
          </pre>
        </details>
      )}
    </div>
  );
}
