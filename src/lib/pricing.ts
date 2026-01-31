// Gemini pricing per 1K tokens (as of Jan 2025)
// https://ai.google.dev/pricing

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export const AVAILABLE_MODELS = [
  // Gemini models (current production)
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  // OpenAI models
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
];

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini 2.5 Flash (current production)
  'gemini-2.5-flash': {
    inputPer1k: 0.000075,
    outputPer1k: 0.0003,
  },
  'gemini-2.5-flash-lite': {
    inputPer1k: 0.000038,
    outputPer1k: 0.00015,
  },
  // Gemini 2.5 Pro
  'gemini-2.5-pro': {
    inputPer1k: 0.00125,
    outputPer1k: 0.005,
  },
  // OpenAI pricing (per 1K tokens)
  'gpt-4o': {
    inputPer1k: 0.0025,
    outputPer1k: 0.01,
  },
  'gpt-4o-mini': {
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
  },
  'gpt-4-turbo': {
    inputPer1k: 0.01,
    outputPer1k: 0.03,
  },
  'gpt-3.5-turbo': {
    inputPer1k: 0.0005,
    outputPer1k: 0.0015,
  },
};

const DEFAULT_PRICING: ModelPricing = {
  inputPer1k: 0.00025,
  outputPer1k: 0.001,
};

export function calculateStepCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const inputCost = (inputTokens / 1000) * pricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
  return inputCost + outputCost;
}

export function calculateTotalCost(
  traces: Array<{
    model: string;
    response: {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };
  }>
): number {
  return traces.reduce((total, trace) => {
    const inputTokens = trace.response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = trace.response.usageMetadata?.candidatesTokenCount || 0;
    return total + calculateStepCost(trace.model, inputTokens, outputTokens);
  }, 0);
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}
