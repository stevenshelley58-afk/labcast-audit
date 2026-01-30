// Gemini pricing per 1K tokens (as of Jan 2025)
// https://ai.google.dev/pricing

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini 2.0 Flash
  'gemini-2.0-flash': {
    inputPer1k: 0.0001,
    outputPer1k: 0.0004,
  },
  'gemini-2.0-flash-exp': {
    inputPer1k: 0.0001,
    outputPer1k: 0.0004,
  },
  // Gemini 2.0 Pro
  'gemini-2.0-pro-exp-02-05': {
    inputPer1k: 0.00025,
    outputPer1k: 0.001,
  },
  // Gemini 1.5 Pro
  'gemini-1.5-pro': {
    inputPer1k: 0.00125,
    outputPer1k: 0.005,
  },
  // Gemini 1.5 Flash
  'gemini-1.5-flash': {
    inputPer1k: 0.000075,
    outputPer1k: 0.0003,
  },
  // Legacy / Preview models - use Pro pricing as fallback
  'gemini-3-pro-preview': {
    inputPer1k: 0.00025,
    outputPer1k: 0.001,
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
