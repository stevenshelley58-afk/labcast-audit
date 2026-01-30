import React from 'react';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { HybridAuditProgress } from '../hooks/useHybridAudit';

// ============================================================================
// Props
// ============================================================================

interface HybridLoadingViewProps {
  progress: HybridAuditProgress;
  url: string;
}

// ============================================================================
// Layer Status Component
// ============================================================================

interface LayerStatusProps {
  number: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  details?: React.ReactNode;
}

function LayerStatus({ number, title, description, status, details }: LayerStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'active':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-300" />;
    }
  };

  const getBorderColor = () => {
    switch (status) {
      case 'active':
        return 'border-blue-500';
      case 'complete':
        return 'border-green-500';
      case 'error':
        return 'border-red-500';
      default:
        return 'border-gray-200';
    }
  };

  return (
    <div className={`border-l-4 ${getBorderColor()} pl-4 py-3`}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">{getStatusIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">LAYER {number}</span>
            <span className="text-sm font-semibold text-gray-900">{title}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      {details && status === 'active' && (
        <div className="mt-2 ml-8 text-xs text-gray-600">{details}</div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function HybridLoadingView({ progress, url }: HybridLoadingViewProps) {
  const { stage, message, layer1Progress, layer3Progress } = progress;

  // Determine layer statuses
  const getLayerStatus = (layer: number): LayerStatusProps['status'] => {
    const layerMap: Record<number, HybridAuditProgress['stage'][]> = {
      1: ['layer1'],
      2: ['layer2'],
      3: ['layer3'],
      4: ['layer4'],
    };

    const activeStages = layerMap[layer];
    if (!activeStages) return 'pending';

    if (stage === 'error') {
      return activeStages.includes(stage as HybridAuditProgress['stage']) ? 'error' : 'pending';
    }

    const stageOrder: HybridAuditProgress['stage'][] = [
      'idle',
      'starting',
      'layer1',
      'layer2',
      'layer3',
      'layer4',
      'complete',
    ];

    const currentIndex = stageOrder.indexOf(stage);
    const layerIndex = stageOrder.indexOf(activeStages[0]);

    if (currentIndex > layerIndex) return 'complete';
    if (currentIndex === layerIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-block p-3 bg-white rounded-full shadow-lg">
          <Loader2 className="animate-spin w-6 h-6 text-black" />
        </div>
        <h3 className="text-2xl font-semibold text-black tracking-tight">
          Running Hybrid Audit
        </h3>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Analyzing <span className="font-medium text-gray-700">{url}</span>
        </p>
        <p className="text-sm text-gray-600">{message}</p>
      </div>

      {/* Layer Progress */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <LayerStatus
          number={1}
          title="Data Collection"
          description="Fetching robots.txt, sitemap, headers, HTML, and performance data"
          status={getLayerStatus(1)}
          details={
            layer1Progress.collectors.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {layer1Progress.collectors.map((collector) => {
                  const isComplete = layer1Progress.completed.includes(collector);
                  const isFailed = layer1Progress.failed.includes(collector);
                  return (
                    <span
                      key={collector}
                      className={`px-2 py-0.5 rounded text-xs ${
                        isComplete
                          ? 'bg-green-100 text-green-700'
                          : isFailed
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {collector}
                    </span>
                  );
                })}
              </div>
            )
          }
        />

        <LayerStatus
          number={2}
          title="Page Extraction"
          description="Parsing HTML for SEO signals, headings, schema, and metadata"
          status={getLayerStatus(2)}
        />

        <LayerStatus
          number={3}
          title="Micro-Audits"
          description="Running 7 parallel audits with Gemini and GPT-4o"
          status={getLayerStatus(3)}
          details={
            layer3Progress.audits.length > 0 && (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {layer3Progress.audits.map((audit) => {
                    const isComplete = layer3Progress.completed.includes(audit);
                    const isFailed = layer3Progress.failed.includes(audit);
                    return (
                      <span
                        key={audit}
                        className={`px-2 py-0.5 rounded text-xs ${
                          isComplete
                            ? 'bg-green-100 text-green-700'
                            : isFailed
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {formatAuditName(audit)}
                      </span>
                    );
                  })}
                </div>
                {layer3Progress.findingsCount > 0 && (
                  <p className="text-gray-500 mt-1">
                    {layer3Progress.findingsCount} finding
                    {layer3Progress.findingsCount !== 1 ? 's' : ''} discovered
                  </p>
                )}
              </div>
            )
          }
        />

        <LayerStatus
          number={4}
          title="Synthesis"
          description="Merging findings and generating executive summary"
          status={getLayerStatus(4)}
        />
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="bg-black h-full transition-all duration-500 ease-out"
          style={{
            width: `${getProgressPercent(stage)}%`,
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getProgressPercent(stage: HybridAuditProgress['stage']): number {
  const stages: HybridAuditProgress['stage'][] = [
    'idle',
    'starting',
    'layer1',
    'layer2',
    'layer3',
    'layer4',
    'complete',
  ];

  const index = stages.indexOf(stage);
  if (index === -1) return 0;

  return Math.round((index / (stages.length - 1)) * 100);
}

function formatAuditName(audit: string): string {
  const names: Record<string, string> = {
    'technical-seo': 'Technical',
    performance: 'Performance',
    'on-page-seo': 'On-Page',
    'content-quality': 'Content',
    'authority-trust': 'Trust',
    'visual-url-context': 'Visual',
    'visual-screenshot': 'Screenshot',
    'codebase-peek': 'Code',
    pdp: 'PDP',
  };
  return names[audit] || audit;
}
