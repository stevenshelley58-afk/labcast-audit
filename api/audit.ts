import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

// Types (duplicated from types.ts for serverless isolation)
interface AuditStepConfig {
  id: string;
  title: string;
  model: string;
  systemInstruction: string;
  promptTemplate: string;
}

interface AuditConfig {
  steps: Record<string, AuditStepConfig>;
}

interface UrlRetrievalMetadata {
  url: string;
  status: string;
}

interface AuditTrace {
  id: string;
  stepId: string;
  stepName: string;
  timestamp: number;
  url: string;
  model: string;
  durationMs: number;
  request: {
    systemInstruction: string;
    prompt: string;
    image?: string;
    tools: string[];
  };
  response: {
    rawText: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    urlContextMetadata?: UrlRetrievalMetadata[];
  };
  cost?: number;
}

interface AuditReport {
  overallScore: number;
  url: string;
  summary: string;
  designAnalysis: {
    aestheticScore: number;
    pricePointMatch: string;
    critique: string;
  };
  findings: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    impact: string;
    priority: number;
    fix: string;
    referenceUrl?: string;
    visualLocation?: string;
  }>;
  generatedAt: string;
}

// Pricing calculation
const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'gemini-2.0-flash': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'gemini-2.0-flash-exp': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'gemini-2.0-pro-exp-02-05': { inputPer1k: 0.00025, outputPer1k: 0.001 },
  'gemini-3-pro-preview': { inputPer1k: 0.00025, outputPer1k: 0.001 },
};

function calculateStepCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { inputPer1k: 0.00025, outputPer1k: 0.001 };
  return (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k;
}

// Default configuration
const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  steps: {
    visual: {
      id: 'visual',
      title: 'Call 1: Visual Audit',
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are a UX/UI Design Auditor. Your findings must be based strictly on the provided image.',
      promptTemplate: `Analyze the attached website screenshot for Design, UX, and Visual Hierarchy.

GLOBAL RULE: No finding is valid unless it includes EVIDENCE.
Evidence must be:
- Exact on-screen text (quoted)
- Specific reference to screen areas (e.g. "hero section", "footer")

OUTPUT FORMAT (Plain Text):
Finding: [Observation]
Evidence: [SCREENSHOT] [Quote or Location]
Why it matters: [UX/Trust Impact]

FOCUS AREAS:
- Above the fold content (H1 visibility, CTA)
- Visual trust signals
- Color palette and aesthetic quality vs price point
- Mobile responsiveness indicators`
    },
    serp: {
      id: 'serp',
      title: 'Call 2: SERP Audit',
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are an SEO Specialist using Google Search.',
      promptTemplate: `Audit the domain: {{url}}

Use Google Search to find:
1. Indexed pages (site:{{hostname}})
2. SERP Title and Meta Description for the homepage
3. Brand reputation / reviews

GLOBAL RULE: No finding is valid unless it includes EVIDENCE.

OUTPUT FORMAT (Plain Text):
Finding: [Observation]
Evidence: [SERP] [Quote the Snippet or Result]
Why it matters: [SEO Impact]`
    },
    crawl: {
      id: 'crawl',
      title: 'Call 3: Crawl Control',
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are a Technical SEO Auditor focusing on Crawlability.',
      promptTemplate: `Analyze the provided Robots.txt and Sitemap content.

Robots.txt:
{{robotsTxt}}

Sitemap URL: {{sitemapUrl}}
Sitemap Content (Snippet):
{{sitemapContent}}

GLOBAL RULE: No finding is valid unless it includes EVIDENCE.

OUTPUT FORMAT (Plain Text):
Finding: [Observation]
Evidence: [ROBOTS] or [SITEMAP] [Quote the specific line or URL]
Why it matters: [Crawl Efficiency]`
    },
    technical: {
      id: 'technical',
      title: 'Call 4: Technical Signals',
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are a Code Quality & On-Page SEO Auditor.',
      promptTemplate: `Analyze the Homepage HTML Snippet.

HTML Content:
{{htmlContent}}

Checks:
1. Canonical tags (self-referencing?)
2. H1 hierarchy
3. Meta Robots tags
4. Schema markup presence

GLOBAL RULE: No finding is valid unless it includes EVIDENCE.

OUTPUT FORMAT (Plain Text):
Finding: [Observation]
Evidence: [HTML] [Quote the actual tag/attribute]
Why it matters: [Technical Health]`
    },
    pdp: {
      id: 'pdp',
      title: 'Call 5: PDP Audit',
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are an E-commerce Product Page Auditor. Analyze the product page at the provided URL using URL context. Use only the provided URL, do not browse additional links.',
      promptTemplate: `Analyze the product page at {{pdpUrl}} for conversion optimization.

GLOBAL RULE: No finding is valid unless it includes EVIDENCE.
Evidence must be:
- Exact on-page text (quoted)
- Specific element descriptions
- Schema markup content

OUTPUT FORMAT (Plain Text):
Finding: [Observation]
Evidence: [PDP] [Quote or element description]
Why it matters: [Conversion Impact]

FOCUS AREAS:
- Product title and description clarity
- Price visibility and formatting
- Add to cart button (prominence, placement)
- Product images presence and alt text
- Reviews/ratings visibility
- Trust signals (returns policy, shipping info, security badges)
- Schema markup (Product, Offer, Review, AggregateRating)
- Breadcrumb navigation
- Cross-sell/upsell elements`
    },
    synthesis: {
      id: 'synthesis',
      title: 'Call 6: Synthesis',
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are a senior ecommerce auditor writing for founders. Compile the final JSON report based ONLY on the evidence provided.',
      promptTemplate: `INPUT DATA:

[CALL 1: VISUAL FINDINGS]
{{visualFindings}}

[CALL 2: SEARCH FINDINGS]
{{searchFindings}}

[CALL 3: CRAWL FINDINGS]
{{crawlFindings}}

[CALL 4: TECHNICAL FINDINGS]
{{technicalFindings}}

[CALL 5: PDP FINDINGS]
{{pdpFindings}}

---

ROLE & STANCE:

You are a senior ecommerce auditor writing for founders.

Assess whether the site can:
- Convert first-time visitors
- Scale organic acquisition
- Support paid traffic efficiently

If not, state this plainly. Assume a rebuild vs patch decision.

---

CORE RULES:

1. NO GENERIC PRAISE
Do not praise aesthetics or "vibe" unless tied to conversion or structure.
Positive statements must include limitations.

2. STRUCTURAL > COSMETIC
Treat issues as system-level constraints.
If findings indicate architectural weakness, say so.

3. REBUILD AWARENESS
Consolidate related findings into root causes.
Frame incremental fixes as insufficient where appropriate.

4. STRICT EVIDENCE
Every finding must reference explicit evidence from inputs.
Discard weak or indirect findings.

5. NO OPTIMISATION THEATRE
No A/B tests, best-practice filler, or low-impact tweaks.
Only recommend actions that materially change outcomes.

---

SCORING:

Overall Score reflects structural, SEO, and technical health.
Aesthetic Score reflects functional clarity, not taste.

Constraints:
- Weak hierarchy, semantics, or indexation: Overall cannot exceed 70
- CTA dominance, contrast, or accessibility issues: Aesthetic cannot exceed 75
- Mobile usability impact: Aesthetic closer to 65

Scores must match critique.

---

DESIGN ANALYSIS:

Use VISUAL FINDINGS only.

Write as diagnosis, not praise.

Explicitly assess:
- Behavior guidance
- Cognitive load
- Product acceleration

If lacking, state directly.

---

FINDINGS RULES:

Each finding must answer at least one:
- Blocks conversion
- Weakens crawl/index certainty
- Increases paid/social reliance
- Indicates poor information architecture

Otherwise discard.

Group findings by root cause.

IMPORTANT: Rank all findings from most important (highest business impact) to least important. The findings array must be sorted by priority descending.

---

LANGUAGE:

Use declarative, cause-effect, business impact language.
Avoid "consider", "best practice", "nice to see".

---

REQUIRED SYNTHESIS:

Explicitly state:
- Structural soundness
- Incremental vs architectural issues
- Rebuild vs optimisation recommendation

No hedging.

---

OUTPUT:

Generate the audit report JSON using the existing schema.`
    }
  }
};

// Helpers
async function captureScreenshot(url: string): Promise<string | null> {
  try {
    const encodedUrl = encodeURIComponent(url);
    const screenshotUrl = `https://s0.wp.com/mshots/v1/${encodedUrl}?w=1280&h=960`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(screenshotUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    return null;
  }
}

async function safeFetchText(url: string, retries = 1): Promise<{ content: string; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { content: '', error: `HTTP ${res.status}` };
      }

      const text = await res.text();
      return { content: text.substring(0, 5000) };
    } catch (err: unknown) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === 'AbortError') {
        return { content: '', error: 'Timeout' };
      }
      return { content: '', error: error.message };
    }
  }
  return { content: '', error: 'Max retries exceeded' };
}

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

async function runGeminiStep(
  ai: GoogleGenAI,
  stepId: string,
  stepConfig: AuditStepConfig,
  prompt: string,
  image?: string,
  tools: unknown[] = [],
  responseSchema?: unknown,
  useUrlContext: boolean = false
): Promise<{ text: string; trace: AuditTrace }> {
  const startTime = Date.now();

  const parts: unknown[] = [{ text: prompt }];
  if (image) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
  }

  // Build tools array, optionally adding URL context
  const allTools: unknown[] = [...tools];
  if (useUrlContext) {
    allTools.push({ urlContext: {} });
  }

  const config: Record<string, unknown> = {
    systemInstruction: stepConfig.systemInstruction,
    tools: allTools.length > 0 ? allTools : undefined,
  };

  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }

  try {
    const response = await ai.models.generateContent({
      model: stepConfig.model,
      contents: { parts },
      config,
    });

    const text = response.text || '';
    const endTime = Date.now();
    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    // Extract URL context metadata if available
    const urlContextMetadata: UrlRetrievalMetadata[] = [];
    const candidates = response.candidates;
    if (candidates && candidates[0]?.urlContextMetadata?.urlMetadata) {
      for (const meta of candidates[0].urlContextMetadata.urlMetadata) {
        urlContextMetadata.push({
          url: meta.retrievedUrl || 'unknown',
          status: meta.urlRetrievalStatus || 'unknown',
        });
      }
    }

    return {
      text,
      trace: {
        id: crypto.randomUUID(),
        stepId,
        stepName: stepConfig.title,
        timestamp: startTime,
        url: 'N/A',
        model: stepConfig.model,
        durationMs: endTime - startTime,
        request: {
          systemInstruction: stepConfig.systemInstruction,
          prompt,
          image: image ? '[Image Data]' : undefined,
          tools: allTools.map((t: unknown) => Object.keys(t as object)[0]),
        },
        response: {
          rawText: text,
          usageMetadata: response.usageMetadata,
          urlContextMetadata: urlContextMetadata.length > 0 ? urlContextMetadata : undefined,
        },
        cost: calculateStepCost(stepConfig.model, inputTokens, outputTokens),
      },
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      text: `Error in ${stepConfig.title}: ${error.message}`,
      trace: {
        id: crypto.randomUUID(),
        stepId,
        stepName: stepConfig.title,
        timestamp: startTime,
        url: 'N/A',
        model: stepConfig.model,
        durationMs: Date.now() - startTime,
        request: {
          systemInstruction: stepConfig.systemInstruction,
          prompt,
          image: undefined,
          tools: [],
        },
        response: { rawText: error.message },
        cost: 0,
      },
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({
      error: { code: 'API_ERROR', message: 'Server configuration error', retryable: false },
    });
  }

  const { url: rawUrl, pdpUrl: rawPdpUrl, config: userConfig } = req.body;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({
      error: { code: 'INVALID_URL', message: 'URL is required' },
    });
  }

  // Normalize URL
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({
      error: { code: 'INVALID_URL', message: `Invalid URL: ${rawUrl}` },
    });
  }

  // Normalize and validate optional PDP URL
  let pdpUrl: string | null = null;
  if (rawPdpUrl && typeof rawPdpUrl === 'string') {
    pdpUrl = rawPdpUrl.trim();
    if (!/^https?:\/\//i.test(pdpUrl)) {
      pdpUrl = 'https://' + pdpUrl;
    }
    try {
      new URL(pdpUrl);
    } catch {
      return res.status(400).json({
        error: { code: 'INVALID_URL', message: `Invalid PDP URL: ${rawPdpUrl}` },
      });
    }
  }

  const config: AuditConfig = userConfig || DEFAULT_AUDIT_CONFIG;
  const ai = new GoogleGenAI({ apiKey });
  const traces: AuditTrace[] = [];

  try {
    // Capture screenshot
    const base64Image = await captureScreenshot(url);

    // Parallel data gathering
    const robotsUrl = new URL('/robots.txt', url).toString();
    const sitemapUrl = new URL('/sitemap.xml', url).toString();

    const [robotsResult, sitemapResult, htmlResult] = await Promise.all([
      safeFetchText(robotsUrl),
      safeFetchText(sitemapUrl),
      safeFetchText(url),
    ]);

    const robotsTxt = robotsResult.error
      ? `Fetch failed: ${robotsResult.error}`
      : robotsResult.content;
    const sitemapContent = sitemapResult.error
      ? `Fetch failed: ${sitemapResult.error}`
      : sitemapResult.content;
    const htmlContent = htmlResult.error
      ? `Fetch failed: ${htmlResult.error}`
      : htmlResult.content;

    // Prepare prompts
    const visualPrompt = config.steps.visual.promptTemplate;
    const serpPrompt = interpolate(config.steps.serp.promptTemplate, {
      url,
      hostname: new URL(url).hostname,
    });
    const crawlPrompt = interpolate(config.steps.crawl.promptTemplate, {
      robotsTxt,
      sitemapUrl,
      sitemapContent,
    });
    const technicalPrompt = interpolate(config.steps.technical.promptTemplate, {
      htmlContent,
    });

    // Parallel analysis (Calls 1-4)
    const [visualStep, serpStep, crawlStep, techStep] = await Promise.all([
      runGeminiStep(ai, 'visual', config.steps.visual, visualPrompt, base64Image || undefined),
      runGeminiStep(ai, 'serp', config.steps.serp, serpPrompt, undefined, [{ googleSearch: {} }]),
      runGeminiStep(ai, 'crawl', config.steps.crawl, crawlPrompt),
      runGeminiStep(ai, 'technical', config.steps.technical, technicalPrompt),
    ]);

    // Collect traces for Calls 1-4
    [visualStep, serpStep, crawlStep, techStep].forEach(step => {
      step.trace.url = url;
      traces.push(step.trace);
    });

    // PDP Analysis (Call 5) - only if pdpUrl provided, uses URL Context
    let pdpStep: { text: string; trace: AuditTrace } | null = null;
    if (pdpUrl && config.steps.pdp) {
      const pdpPrompt = interpolate(config.steps.pdp.promptTemplate, { pdpUrl });
      pdpStep = await runGeminiStep(
        ai,
        'pdp',
        config.steps.pdp,
        pdpPrompt,
        undefined,
        [],
        undefined,
        true  // useUrlContext = true
      );
      pdpStep.trace.url = pdpUrl;
      traces.push(pdpStep.trace);
    }

    // Synthesis (Call 6)
    const synthesisPromptResolved = interpolate(config.steps.synthesis.promptTemplate, {
      visualFindings: visualStep.text,
      searchFindings: serpStep.text,
      crawlFindings: crawlStep.text,
      technicalFindings: techStep.text,
      pdpFindings: pdpStep?.text || 'No PDP URL provided - PDP analysis skipped.',
    });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        overallScore: { type: Type.NUMBER },
        url: { type: Type.STRING },
        summary: { type: Type.STRING },
        designAnalysis: {
          type: Type.OBJECT,
          properties: {
            aestheticScore: { type: Type.NUMBER },
            pricePointMatch: { type: Type.STRING },
            critique: { type: Type.STRING },
          },
          required: ['aestheticScore', 'pricePointMatch', 'critique'],
        },
        findings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['seo', 'technical', 'design', 'conversion', 'content'] },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              impact: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
              priority: { type: Type.NUMBER },
              fix: { type: Type.STRING },
              referenceUrl: { type: Type.STRING },
              visualLocation: { type: Type.STRING },
            },
            required: ['id', 'category', 'title', 'description', 'impact', 'priority', 'fix'],
          },
        },
      },
      required: ['overallScore', 'url', 'summary', 'designAnalysis', 'findings'],
    };

    const synthesisStep = await runGeminiStep(
      ai,
      'synthesis',
      config.steps.synthesis,
      synthesisPromptResolved,
      undefined,
      [],
      responseSchema
    );

    synthesisStep.trace.url = url;
    traces.push(synthesisStep.trace);

    // Parse report
    let report: AuditReport;
    try {
      report = JSON.parse(synthesisStep.text);
      report.generatedAt = new Date().toISOString();
      report.url = url;
    } catch {
      console.error('Failed to parse synthesis JSON');
      report = {
        overallScore: 0,
        url,
        summary: 'Analysis failed during synthesis phase.',
        designAnalysis: {
          aestheticScore: 0,
          pricePointMatch: 'N/A',
          critique: 'Error parsing report.',
        },
        findings: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // Calculate total cost
    const totalCost = traces.reduce((sum, t) => sum + (t.cost || 0), 0);

    return res.status(200).json({
      report,
      traces,
      metadata: {
        totalCost,
        totalDurationMs: traces.reduce((sum, t) => sum + t.durationMs, 0),
        screenshotCaptured: !!base64Image,
        pdpAnalyzed: !!pdpStep,
      },
    });
  } catch (error: unknown) {
    console.error('Audit error:', error);

    const err = error instanceof Error ? error : new Error(String(error));

    // Check for rate limiting
    if (err.message.includes('429') || err.message.toLowerCase().includes('rate')) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryable: true },
      });
    }

    return res.status(500).json({
      error: { code: 'API_ERROR', message: err.message, retryable: true },
      traces, // Return partial traces for debugging
    });
  }
}
