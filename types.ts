export enum AuditStatus {
  IDLE = 'IDLE',
  CRAWLING = 'CRAWLING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface AuditFinding {
  id: string;
  category: 'seo' | 'technical' | 'design' | 'conversion' | 'content';
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  priority: 1 | 2 | 3 | 4 | 5;
  fix: string;
  referenceUrl?: string;
  visualLocation?: string;
}

export interface AuditReport {
  overallScore: number;
  url: string;
  summary: string;
  designAnalysis: {
    aestheticScore: number;
    pricePointMatch: string;
    critique: string;
  };
  findings: AuditFinding[];
  generatedAt: string;
}

export interface CrawlerLog {
  url: string;
  status: number;
  time: number;
}

export interface AuditStepConfig {
  id: string;
  title: string;
  model: string;
  systemInstruction: string;
  promptTemplate: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AuditConfig {
  steps: {
    [key: string]: AuditStepConfig;
  }
}

export interface UrlRetrievalMetadata {
  url: string;
  status: string;
}

export interface AuditTrace {
  id: string;
  stepId: string; // Links back to AuditStepConfig.id
  stepName: string;
  timestamp: number;
  url: string;
  model: string;
  durationMs: number;
  cost?: number; // Calculated cost for this step
  request: {
    systemInstruction: string;
    prompt: string;
    promptTemplate?: string; // Raw template before interpolation
    image?: string; // base64 or '[Image Data]' placeholder
    imageSize?: number; // Size in bytes
    tools: string[];
    toolsFull?: unknown[]; // Full tool configuration objects
    temperature?: number;
    maxTokens?: number;
  };
  response: {
    rawText: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      // Token breakdown estimates
      systemTokens?: number;
      promptTokens?: number;
    };
    urlContextMetadata?: UrlRetrievalMetadata[]; // URL context retrieval status
  };
  provider?: 'gemini' | 'openai';
}

export interface AuditResult {
  report: AuditReport;
  traces: AuditTrace[];
}