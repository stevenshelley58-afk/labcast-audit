import { GoogleGenAI, Type } from "@google/genai";
import { AuditReport, AuditResult, AuditTrace, AuditConfig } from "../types";

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  steps: {
    visual: {
      id: 'visual',
      title: 'Call 1: Visual Audit',
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
    synthesis: {
      id: 'synthesis',
      title: 'Call 5: Synthesis',
      model: 'gemini-3-pro-preview',
      systemInstruction: 'You are the Lead Auditor. Compile the final JSON report based ONLY on the evidence provided.',
      promptTemplate: `You are the Lead Auditor. Compile the final JSON report based ONLY on the evidence provided below.

INPUT DATA:

[CALL 1: VISUAL FINDINGS]
{{visualFindings}}

[CALL 2: SEARCH FINDINGS]
{{searchFindings}}

[CALL 3: CRAWL FINDINGS]
{{crawlFindings}}

[CALL 4: TECHNICAL FINDINGS]
{{technicalFindings}}

---

INSTRUCTIONS:

1. **Finding Consolidation**: 
   - STRICT EVIDENCE RULE: Every finding in the JSON **must** include the specific evidence quoted from the inputs above. If a finding in the input lacks evidence (e.g., tags like [SCREENSHOT], [HTML], [SERP]), DISCARD IT.

2. **Scoring Assessment (0 to 100 Scale)**:
   - **Overall Score**: Assess the overall health of the website on a scale of 0 to 100 based on the severity and volume of technical, SEO, and content issues.
   - **Aesthetic Score**: Assess the design quality on a scale of 0 to 100 based on the Visual Findings.
   - **IMPORTANT**: Your scores must align with your critique. If you mention "accessibility issues", "poor contrast", or "confusing UX", the Aesthetic Score must reflect this (e.g., significantly less than 90). Do not provide a high score if significant issues are present.

3. **Design Analysis**:
   - Infer the "designAnalysis" section strictly from [CALL 1].

GENERATE THE AUDIT REPORT JSON.`
    }
  }
};

// --- Helpers ---

const captureScreenshot = async (url: string): Promise<string | null> => {
  try {
    const encodedUrl = encodeURIComponent(url);
    const screenshotUrl = `https://s0.wp.com/mshots/v1/${encodedUrl}?w=1280&h=960`;
    const response = await fetch(screenshotUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Failed to capture screenshot:", error);
    return null;
  }
};

const safeFetchText = async (url: string): Promise<string> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000); // 3s timeout
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return `HTTP Error ${res.status}`;
    const text = await res.text();
    return text.substring(0, 5000); // Truncate large files
  } catch (err: any) {
    return `Fetch Failed (Likely CORS or Timeout): ${err.message}`;
  }
};

const interpolate = (template: string, variables: Record<string, string>): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
};

// --- Core Gemni Runner ---

const runGeminiStep = async (
  apiKey: string,
  stepId: string,
  stepConfig: { model: string, systemInstruction: string }, // Partial step config
  prompt: string,
  stepTitle: string,
  image?: string,
  tools: any[] = [],
  responseSchema?: any
): Promise<{ text: string; trace: AuditTrace }> => {
  const startTime = Date.now();
  const ai = new GoogleGenAI({ apiKey });

  const parts: any[] = [{ text: prompt }];
  if (image) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
  }

  const config: any = {
    systemInstruction: stepConfig.systemInstruction,
    tools: tools.length > 0 ? tools : undefined,
  };

  if (responseSchema) {
    config.responseMimeType = "application/json";
    config.responseSchema = responseSchema;
  }

  try {
    const response = await ai.models.generateContent({
      model: stepConfig.model,
      contents: { parts },
      config,
    });

    const text = response.text || "";
    const endTime = Date.now();

    return {
      text,
      trace: {
        id: crypto.randomUUID(),
        stepId: stepId,
        stepName: stepTitle,
        timestamp: startTime,
        url: "N/A", // Filled by caller
        model: stepConfig.model,
        durationMs: endTime - startTime,
        request: {
          systemInstruction: stepConfig.systemInstruction,
          prompt,
          image: image ? "[Image Data]" : undefined,
          tools: tools.map(t => Object.keys(t)[0]),
        },
        response: {
          rawText: text,
          usageMetadata: response.usageMetadata,
        },
      },
    };
  } catch (err: any) {
    return {
      text: `Error in ${stepTitle}: ${err.message}`,
      trace: {
        id: crypto.randomUUID(),
        stepId: stepId,
        stepName: stepTitle,
        timestamp: startTime,
        url: "N/A",
        model: stepConfig.model,
        durationMs: Date.now() - startTime,
        request: { systemInstruction: stepConfig.systemInstruction, prompt, image: undefined, tools: [] },
        response: { rawText: err.message },
      },
    };
  }
};

// --- Main Audit Orchestrator ---

export const generateAuditReport = async (
    rawUrl: string, 
    onLog?: (msg: string) => void,
    config: AuditConfig = DEFAULT_AUDIT_CONFIG
): Promise<AuditResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  // Normalize URL
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Validate URL immediately
  try {
    new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL provided: ${rawUrl}`);
  }

  const traces: AuditTrace[] = [];
  onLog?.("Capturing visual evidence...");
  const base64Image = await captureScreenshot(url);

  // --- PARALLEL EXECUTION BLOCK 1: Data Gathering ---
  onLog?.("Fetching raw signals (Robots, Sitemap, HTML)...");
  
  const robotsUrl = new URL('/robots.txt', url).toString();
  const sitemapUrl = new URL('/sitemap.xml', url).toString(); // Assumption, but common

  const [robotsTxt, sitemapContent, htmlContent] = await Promise.all([
    safeFetchText(robotsUrl),
    safeFetchText(sitemapUrl),
    safeFetchText(url)
  ]);

  // --- PARALLEL EXECUTION BLOCK 2: Analysis Agents ---
  onLog?.("Running 4-Vector Analysis (Visual, SERP, Crawl, Tech)...");

  // 1. Resolve Prompts
  const visualPrompt = config.steps.visual.promptTemplate;
  const serpPrompt = interpolate(config.steps.serp.promptTemplate, {
      url: url,
      hostname: new URL(url).hostname
  });
  const crawlPrompt = interpolate(config.steps.crawl.promptTemplate, {
      robotsTxt: robotsTxt,
      sitemapUrl: sitemapUrl,
      sitemapContent: sitemapContent
  });
  const technicalPrompt = interpolate(config.steps.technical.promptTemplate, {
      htmlContent: htmlContent
  });

  // 2. Execute Parallel Agents
  const [visualStep, serpStep, crawlStep, techStep] = await Promise.all([
    runGeminiStep(apiKey, 'visual', config.steps.visual, visualPrompt, config.steps.visual.title, base64Image || undefined),
    runGeminiStep(apiKey, 'serp', config.steps.serp, serpPrompt, config.steps.serp.title, undefined, [{ googleSearch: {} }]),
    runGeminiStep(apiKey, 'crawl', config.steps.crawl, crawlPrompt, config.steps.crawl.title),
    runGeminiStep(apiKey, 'technical', config.steps.technical, technicalPrompt, config.steps.technical.title)
  ]);

  // 3. Collect Traces
  [visualStep, serpStep, crawlStep, techStep].forEach(step => {
      step.trace.url = url;
      traces.push(step.trace);
  });

  // --- FINAL EXECUTION: Synthesis ---
  onLog?.("Synthesizing Final Report with Evidence Traceability...");

  const synthesisPromptResolved = interpolate(config.steps.synthesis.promptTemplate, {
      visualFindings: visualStep.text,
      searchFindings: serpStep.text,
      crawlFindings: crawlStep.text,
      technicalFindings: techStep.text,
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
        required: ["aestheticScore", "pricePointMatch", "critique"]
      },
      findings: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["seo", "technical", "design", "conversion", "content"] },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            impact: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
            priority: { type: Type.NUMBER },
            fix: { type: Type.STRING },
            referenceUrl: { type: Type.STRING },
            visualLocation: { type: Type.STRING }
          },
          required: ["id", "category", "title", "description", "impact", "priority", "fix"]
        }
      }
    },
    required: ["overallScore", "url", "summary", "designAnalysis", "findings"]
  };

  const synthesisStep = await runGeminiStep(
    apiKey, 
    'synthesis',
    config.steps.synthesis,
    synthesisPromptResolved, 
    config.steps.synthesis.title,
    undefined, 
    [], 
    responseSchema
  );

  synthesisStep.trace.url = url;
  traces.push(synthesisStep.trace);

  let report: AuditReport;
  try {
    report = JSON.parse(synthesisStep.text);
    report.generatedAt = new Date().toISOString();
    report.url = url; // Ensure consistency
  } catch (e) {
    console.error("Failed to parse synthesis JSON", e);
    // Fallback empty report
    report = {
        overallScore: 0,
        url: url, // Ensure consistency
        summary: "Analysis failed during synthesis phase.",
        designAnalysis: { aestheticScore: 0, pricePointMatch: "N/A", critique: "Error parsing report." },
        findings: [],
        generatedAt: new Date().toISOString()
    };
  }

  return { report, traces };
};