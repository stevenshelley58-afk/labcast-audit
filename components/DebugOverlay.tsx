import React, { useState, useEffect } from 'react';
import { AuditTrace, AuditConfig, AuditStepConfig } from '../types';
import { X, Copy, Clock, Database, Image as ImageIcon, Terminal, Cpu, Settings, Save, DollarSign } from 'lucide-react';
import { calculateStepCost, formatCost, AVAILABLE_MODELS } from '../src/lib/pricing';

interface AuditMetadata {
  totalCost: number;
  totalDurationMs: number;
  screenshotCaptured: boolean;
}

interface DebugOverlayProps {
  traces: AuditTrace[] | null;
  config: AuditConfig;
  onConfigChange: (newConfig: AuditConfig) => void;
  onClose: () => void;
  metadata?: AuditMetadata | null;
  isSaving?: boolean;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ traces: propTraces, config, onConfigChange, onClose, metadata, isSaving }) => {
  const allTraces = propTraces || [];
  
  // Default to showing the last trace or the first config step if no traces exist
  const [selectedTraceId, setSelectedTraceId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'prompt' | 'image' | 'response' | 'settings'>('overview');
  
  // Local state for editing to avoid constant re-renders/writes to parent state during typing
  const [editConfig, setEditConfig] = useState<AuditStepConfig | null>(null);

  useEffect(() => {
    if (allTraces.length > 0 && !selectedTraceId) {
        setSelectedTraceId(allTraces[allTraces.length - 1].id); // Default to last one
    }
  }, [allTraces]);

  const selectedTrace = allTraces.find(t => t.id === selectedTraceId);
  
  // If we selected a trace, we can identify which config step it corresponds to
  const selectedStepId = selectedTrace?.stepId || 'synthesis';
  const currentStepConfig = config.steps[selectedStepId];

  // Sync local edit state when selection changes
  useEffect(() => {
      if (currentStepConfig) {
          setEditConfig({...currentStepConfig});
      }
  }, [selectedStepId, config]);

  const handleSaveConfig = () => {
      if (editConfig) {
          onConfigChange({
              ...config,
              steps: {
                  ...config.steps,
                  [editConfig.id]: editConfig
              }
          });
          // Visual feedback could go here
      }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Safe helper if no trace is selected
  const displayTrace: AuditTrace = selectedTrace || {
      model: 'N/A',
      durationMs: 0,
      response: { usageMetadata: undefined, rawText: '{}' },
      request: { systemInstruction: '', prompt: '', tools: [], image: undefined },
      id: 'NO_TRACE',
      stepName: 'No Execution Data',
      stepId: 'unknown',
      timestamp: 0,
      url: 'N/A'
  };

  const totalTokens = displayTrace.response.usageMetadata?.totalTokenCount || 0;
  const inputTokens = displayTrace.response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = displayTrace.response.usageMetadata?.candidatesTokenCount || 0;
  const stepCost = calculateStepCost(displayTrace.model, inputTokens, outputTokens);
  const totalCost = metadata?.totalCost ?? allTraces.reduce((sum, t) => {
    const input = t.response.usageMetadata?.promptTokenCount || 0;
    const output = t.response.usageMetadata?.candidatesTokenCount || 0;
    return sum + calculateStepCost(t.model, input, output);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 text-green-500 font-mono flex flex-col animate-fade-in backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-green-900 bg-black">
        <div className="flex items-center gap-3">
            <Terminal size={20} />
            <h2 className="text-lg font-bold tracking-widest uppercase">Shadow Trace // {displayTrace.stepName}</h2>
        </div>
        <button onClick={onClose} className="hover:text-white transition-colors">
            <X size={24} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar (Steps) */}
        <div className="w-64 border-r border-green-900 bg-black/50 flex flex-col">
            <div className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-green-900/30">
                Execution Chain
            </div>
            {allTraces.map((t, idx) => (
                 <button 
                    key={t.id}
                    onClick={() => setSelectedTraceId(t.id)}
                    className={`px-6 py-4 text-left border-b border-green-900/30 hover:bg-green-900/20 transition-colors flex flex-col gap-1 ${selectedTraceId === t.id ? 'bg-green-900/30 text-white' : 'text-gray-400'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">0{idx + 1} {t.stepName}</span>
                        {selectedTraceId === t.id && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
                    </div>
                    <span className="text-[10px] text-gray-500">{t.durationMs}ms</span>
                </button>
            ))}
            {allTraces.length === 0 && (
                <div className="p-6 text-gray-600 text-xs italic">
                    No run data available. Select a step to configure defaults.
                </div>
            )}
        </div>

        {/* Trace Details Sidebar */}
        <div className="w-56 border-r border-green-900 bg-black/50 flex flex-col">
            <div className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-green-900/30">
                Inspect
            </div>
            <button 
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-4 text-left border-b border-green-900/30 hover:bg-green-900/20 transition-colors flex items-center gap-3 ${activeTab === 'overview' ? 'bg-green-900/30 text-white' : ''}`}
            >
                <Database size={16} />
                Overview
            </button>
            <button 
                onClick={() => setActiveTab('prompt')}
                className={`px-6 py-4 text-left border-b border-green-900/30 hover:bg-green-900/20 transition-colors flex items-center gap-3 ${activeTab === 'prompt' ? 'bg-green-900/30 text-white' : ''}`}
            >
                <Terminal size={16} />
                Trace Payload
            </button>
            <button 
                onClick={() => setActiveTab('image')}
                className={`px-6 py-4 text-left border-b border-green-900/30 hover:bg-green-900/20 transition-colors flex items-center gap-3 ${activeTab === 'image' ? 'bg-green-900/30 text-white' : ''}`}
            >
                <ImageIcon size={16} />
                Visual Input
            </button>
             <button 
                onClick={() => setActiveTab('response')}
                className={`px-6 py-4 text-left border-b border-green-900/30 hover:bg-green-900/20 transition-colors flex items-center gap-3 ${activeTab === 'response' ? 'bg-green-900/30 text-white' : ''}`}
            >
                <Cpu size={16} />
                Raw Output
            </button>

            <div className="mt-auto border-t border-green-900/30">
                 <button 
                    onClick={() => setActiveTab('settings')}
                    className={`w-full px-6 py-4 text-left hover:bg-green-900/20 transition-colors flex items-center gap-3 ${activeTab === 'settings' ? 'bg-green-900/50 text-white' : 'text-green-400'}`}
                >
                    <Settings size={16} />
                    Configuration
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8 bg-black">
            {activeTab === 'overview' && (
                <div className="space-y-8 max-w-4xl">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 border border-green-800 rounded bg-green-900/10">
                            <div className="text-xs text-green-400 uppercase tracking-widest mb-2">Model ID</div>
                            <div className="text-2xl font-bold text-white">{displayTrace.model}</div>
                        </div>
                        <div className="p-6 border border-green-800 rounded bg-green-900/10">
                            <div className="text-xs text-green-400 uppercase tracking-widest mb-2">Execution Time</div>
                            <div className="text-2xl font-bold text-white flex items-center gap-2">
                                <Clock size={20} />
                                {displayTrace.durationMs}ms
                            </div>
                        </div>
                        <div className="p-6 border border-green-800 rounded bg-green-900/10">
                            <div className="text-xs text-green-400 uppercase tracking-widest mb-2">Total Tokens</div>
                            <div className="text-2xl font-bold text-white">{totalTokens.toLocaleString()}</div>
                        </div>
                        <div className="p-6 border border-green-800 rounded bg-green-900/10">
                            <div className="text-xs text-green-400 uppercase tracking-widest mb-2">Step Cost</div>
                            <div className="text-2xl font-bold text-white">{formatCost(stepCost)}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 mt-6">
                        <div className="p-6 border border-green-800 rounded bg-green-900/10">
                            <div className="text-xs text-green-400 uppercase tracking-widest mb-2">Input / Output Tokens</div>
                            <div className="text-xl font-bold text-white">{inputTokens.toLocaleString()} / {outputTokens.toLocaleString()}</div>
                        </div>
                        <div className="p-6 border border-green-800 rounded bg-green-900/10">
                            <div className="text-xs text-green-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <DollarSign size={12} /> Total Audit Cost
                            </div>
                            <div className="text-2xl font-bold text-white">{formatCost(totalCost)}</div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'prompt' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-white font-bold">Resolved System Instruction</h3>
                        <button onClick={() => copyToClipboard(displayTrace.request.systemInstruction || '')} className="text-xs hover:text-white flex items-center gap-1"><Copy size={12}/> Copy</button>
                    </div>
                    <pre className="p-4 bg-gray-900 rounded border border-gray-800 whitespace-pre-wrap text-sm text-gray-300">
                        {displayTrace.request.systemInstruction}
                    </pre>

                    <div className="flex justify-between items-center mt-8">
                        <h3 className="text-white font-bold">Resolved Prompt</h3>
                        <button onClick={() => copyToClipboard(displayTrace.request.prompt)} className="text-xs hover:text-white flex items-center gap-1"><Copy size={12}/> Copy</button>
                    </div>
                    <pre className="p-4 bg-gray-900 rounded border border-gray-800 whitespace-pre-wrap text-sm text-gray-300 h-[500px] overflow-auto">
                        {displayTrace.request.prompt}
                    </pre>
                </div>
            )}

            {activeTab === 'image' && (
                 <div className="flex flex-col items-center justify-center h-full">
                    {displayTrace.request.image ? (
                        <div className="max-w-4xl w-full border border-green-800 p-2 bg-gray-900">
                             <img src={`data:image/jpeg;base64,${displayTrace.request.image === '[Image Data]' ? '' : displayTrace.request.image}`} alt="Visual Input" className="w-full h-auto block" />
                        </div>
                    ) : (
                        <div className="text-gray-500">No visual input for this step.</div>
                    )}
                </div>
            )}

            {activeTab === 'response' && (
                <div className="h-full flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white font-bold">Raw Model Output</h3>
                        <button onClick={() => copyToClipboard(displayTrace.response.rawText)} className="text-xs hover:text-white flex items-center gap-1"><Copy size={12}/> Copy</button>
                    </div>
                    <pre className="flex-1 p-4 bg-gray-900 rounded border border-gray-800 whitespace-pre-wrap text-xs text-green-400 overflow-auto font-mono">
                         {(() => {
                            try {
                                return JSON.stringify(JSON.parse(displayTrace.response.rawText), null, 2);
                            } catch {
                                return displayTrace.response.rawText;
                            }
                        })()}
                    </pre>
                </div>
            )}

            {activeTab === 'settings' && editConfig && (
                <div className="space-y-6 max-w-4xl h-full flex flex-col">
                    <div className="flex items-center justify-between pb-4 border-b border-green-900/30">
                        <div>
                            <h2 className="text-xl font-bold text-white">{editConfig.title} Configuration</h2>
                            <p className="text-xs text-gray-500 mt-1">Changes will be applied to the next audit run.</p>
                        </div>
                        <button
                            onClick={handleSaveConfig}
                            disabled={isSaving}
                            className={`${isSaving ? 'bg-green-800 cursor-wait' : 'bg-green-600 hover:bg-green-500'} text-black px-4 py-2 rounded font-bold flex items-center gap-2 transition-colors`}
                        >
                            <Save size={16} /> {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-green-600 uppercase mb-2">Model ID</label>
                            <select
                                value={editConfig.model}
                                onChange={(e) => setEditConfig({...editConfig, model: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-800 rounded p-3 text-white focus:border-green-500 focus:outline-none transition-colors"
                            >
                                <optgroup label="Gemini">
                                    {AVAILABLE_MODELS.filter(m => m.startsWith('gemini')).map((modelId) => (
                                        <option key={modelId} value={modelId}>{modelId}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="OpenAI">
                                    {AVAILABLE_MODELS.filter(m => m.startsWith('gpt')).map((modelId) => (
                                        <option key={modelId} value={modelId}>{modelId}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                         <div>
                            <label className="block text-xs font-bold text-green-600 uppercase mb-2">System Instruction</label>
                            <textarea 
                                value={editConfig.systemInstruction}
                                onChange={(e) => setEditConfig({...editConfig, systemInstruction: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-800 rounded p-3 text-white focus:border-green-500 focus:outline-none transition-colors h-24 font-mono text-sm"
                            />
                        </div>

                         <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-bold text-green-600 uppercase">Prompt Template</label>
                                <span className="text-[10px] text-gray-500">Supports &#123;&#123;variable&#125;&#125; interpolation</span>
                            </div>
                            <textarea 
                                value={editConfig.promptTemplate}
                                onChange={(e) => setEditConfig({...editConfig, promptTemplate: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-800 rounded p-3 text-white focus:border-green-500 focus:outline-none transition-colors flex-1 min-h-[300px] font-mono text-sm custom-scrollbar"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};