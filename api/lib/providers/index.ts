/**
 * Provider Registry & Factory
 *
 * Central hub for managing multi-provider LLM access.
 * Handles provider selection, fallback, and load balancing.
 */

import { GeminiProvider, getGeminiProvider } from './gemini';
import { OpenAIProvider, getOpenAIProvider } from './openai';
import type {
  Provider,
  ProviderName,
  GenerateRequest,
  GenerateResult,
  GeminiConfig,
  OpenAIConfig,
} from './types';

// Re-export types and providers
export * from './types';
export { GeminiProvider, getGeminiProvider, generateWithGemini, generateWithUrlContext, generateWithGoogleSearch, generateFromImage } from './gemini';
export { OpenAIProvider, getOpenAIProvider, generateWithOpenAI, generateFromImageOpenAI, generateJsonWithOpenAI } from './openai';

// ============================================================================
// Provider Registry
// ============================================================================

export interface ProviderRegistryConfig {
  gemini?: Partial<GeminiConfig>;
  openai?: Partial<OpenAIConfig>;
  /** Default provider for requests */
  defaultProvider?: ProviderName;
  /** Enable automatic fallback when primary fails */
  enableFallback?: boolean;
}

export class ProviderRegistry {
  private providers: Map<ProviderName, Provider> = new Map();
  private defaultProvider: ProviderName;
  private enableFallback: boolean;

  constructor(config: ProviderRegistryConfig = {}) {
    this.defaultProvider = config.defaultProvider || 'gemini';
    this.enableFallback = config.enableFallback ?? true;

    // Initialize Gemini provider
    const gemini = getGeminiProvider(config.gemini);
    if (gemini.isAvailable()) {
      this.providers.set('gemini', gemini);
    }

    // Initialize OpenAI provider
    const openai = getOpenAIProvider(config.openai);
    if (openai.isAvailable()) {
      this.providers.set('openai', openai);
    }
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: ProviderName): Provider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if a provider is available
   */
  hasProvider(name: ProviderName): boolean {
    return this.providers.has(name) && this.providers.get(name)!.isAvailable();
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.keys()).filter((name) =>
      this.providers.get(name)!.isAvailable()
    );
  }

  /**
   * Generate content with automatic provider selection and fallback
   */
  async generate(
    request: GenerateRequest,
    preferredProvider?: ProviderName
  ): Promise<GenerateResult> {
    const primary = preferredProvider || this.defaultProvider;
    const providers = this.getProviderOrder(primary);

    if (providers.length === 0) {
      throw new Error('No providers available');
    }

    let lastError: Error | null = null;

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      if (!provider || !provider.isAvailable()) {
        continue;
      }

      try {
        return await provider.generateContent(request);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`Provider ${providerName} failed:`, lastError.message);

        if (!this.enableFallback) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }

  /**
   * Generate with specific provider (no fallback)
   */
  async generateWith(
    providerName: ProviderName,
    request: GenerateRequest
  ): Promise<GenerateResult> {
    const provider = this.providers.get(providerName);
    if (!provider || !provider.isAvailable()) {
      throw new Error(`Provider ${providerName} not available`);
    }
    return provider.generateContent(request);
  }

  /**
   * Get provider order for fallback
   */
  private getProviderOrder(primary: ProviderName): ProviderName[] {
    const order: ProviderName[] = [primary];
    const fallbacks: ProviderName[] = ['gemini', 'openai'].filter(
      (p) => p !== primary
    ) as ProviderName[];
    return [...order, ...fallbacks];
  }

  /**
   * Get concurrency status for all providers
   */
  getConcurrencyStatus(): Record<ProviderName, { active: number; max: number }> {
    const status: Record<string, { active: number; max: number }> = {};
    for (const [name, provider] of this.providers) {
      status[name] = provider.getConcurrencyUsage();
    }
    return status as Record<ProviderName, { active: number; max: number }>;
  }
}

// ============================================================================
// Singleton Registry
// ============================================================================

let defaultRegistry: ProviderRegistry | null = null;

export function getProviderRegistry(config?: ProviderRegistryConfig): ProviderRegistry {
  if (!config && defaultRegistry) {
    return defaultRegistry;
  }

  const registry = new ProviderRegistry(config);

  if (!config) {
    defaultRegistry = registry;
  }

  return registry;
}

// ============================================================================
// Provider Assignment for Micro-Audits
// ============================================================================

export interface AuditProviderAssignment {
  primary: ProviderName;
  fallback: ProviderName | null;
  model: string;
  requiresTools?: ('urlContext' | 'googleSearch')[];
}

/**
 * Get the recommended provider assignment for each micro-audit type.
 * This follows the plan's provider assignment table.
 *
 * @param auditType - The type of audit being performed
 * @param modelOverride - Optional model override from config. If provided, provider is detected from model name.
 */
export function getAuditProviderAssignment(
  auditType: string,
  modelOverride?: string
): AuditProviderAssignment {
  // If model override provided, detect provider from name
  if (modelOverride) {
    const provider: ProviderName = modelOverride.startsWith('gpt') ? 'openai' : 'gemini';
    return {
      primary: provider,
      fallback: provider === 'gemini' ? 'openai' : 'gemini',
      model: modelOverride,
    };
  }
  const assignments: Record<string, AuditProviderAssignment> = {
    'technical-seo': {
      primary: 'gemini',
      fallback: 'openai',
      model: 'gemini-2.0-flash',
    },
    performance: {
      primary: 'openai',
      fallback: 'gemini',
      model: 'gpt-4o',
    },
    'on-page-seo': {
      primary: 'gemini',
      fallback: 'openai',
      model: 'gemini-2.0-flash',
    },
    'content-quality': {
      primary: 'openai',
      fallback: 'gemini',
      model: 'gpt-4o',
    },
    'authority-trust': {
      primary: 'gemini',
      fallback: 'openai',
      model: 'gemini-2.0-flash',
    },
    'visual-url-context': {
      primary: 'gemini',
      fallback: null, // URL Context is Gemini-only
      model: 'gemini-2.0-flash',
      requiresTools: ['urlContext'],
    },
    'visual-screenshot': {
      primary: 'openai',
      fallback: 'gemini',
      model: 'gpt-4o',
    },
    'codebase-peek': {
      primary: 'openai',
      fallback: 'gemini',
      model: 'gpt-4o',
    },
    synthesis: {
      primary: 'openai',
      fallback: 'gemini',
      model: 'gpt-4o',
    },
  };

  return (
    assignments[auditType] || {
      primary: 'gemini',
      fallback: 'openai',
      model: 'gemini-2.0-flash',
    }
  );
}

// ============================================================================
// Parallel Execution Helper
// ============================================================================

export interface ParallelGenerateTask {
  id: string;
  request: GenerateRequest;
  provider?: ProviderName;
}

export interface ParallelGenerateResult {
  id: string;
  result?: GenerateResult;
  error?: Error;
}

/**
 * Execute multiple generation requests in parallel with provider sharding
 */
export async function generateParallel(
  tasks: ParallelGenerateTask[],
  registry?: ProviderRegistry
): Promise<ParallelGenerateResult[]> {
  const reg = registry || getProviderRegistry();

  const promises = tasks.map(async (task) => {
    try {
      const result = await reg.generate(task.request, task.provider);
      return { id: task.id, result };
    } catch (err) {
      return {
        id: task.id,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  });

  return Promise.all(promises);
}
