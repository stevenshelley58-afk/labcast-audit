/**
 * SEO Audit System - LLM Prompts
 *
 * All prompts for the 3 LLM calls used in the audit system:
 * 1. Visual Audit Prompt (Gemini)
 * 2. SERP Audit Prompt (Gemini 2.5 Flash)
 * 3. Synthesis Prompt (GPT 5.2)
 */

import type { AuditFindings, CoverageLimitations } from "../audit.types.js";

/**
 * Visual Audit Prompt for Gemini vision model
 * Analyzes website screenshots for UX and design issues
 * Returns structured markdown that maps to synthesis JSON format
 */
export function getVisualAuditPrompt(url: string): string {
  return `Analyze the website screenshots (desktop and mobile) for ${url}.

Evaluate: visual hierarchy, CTA placement, trust signals, UX friction, and mobile usability.

Output in this exact format (~200 words total):

**Critical Issues:**
- [Issue name]: [Brief description and recommendation]
(List issues that seriously hurt conversions or usability. Leave blank if none.)

**Warnings:**
- [Issue name]: [Brief description and recommendation]
(List moderate issues worth fixing. Leave blank if none.)

**Minor/Info:**
- [Observation]: [Brief note]
(List minor observations or positive notes. Leave blank if none.)

**Summary:** [1-2 sentence overall UX assessment]

**Score:** [0-100, where 100 is excellent UX with no issues]

Be specific and actionable. Every issue must include what's wrong and how to fix it. Do NOT return JSON.`;
}

/**
 * SERP Audit Prompt for Gemini 2.5 Flash
 * Analyzes search engine results and page metadata
 */
export function getSerpAuditPrompt(
  query: string,
  serpResults: Array<{ position: number; title: string; url: string; snippet: string }>,
  pageTitles: Array<{ url: string; title: string; description: string | null }>
): string {
  const serpData = serpResults
    .map((r) => `- Position ${r.position}: "${r.title}" - ${r.url}\n  Snippet: ${r.snippet}`)
    .join("\n");

  const pageData = pageTitles
    .map((p) => `- ${p.url}\n  Title: ${p.title}\n  Description: ${p.description || "(missing)"}`)
    .join("\n");

  return `Analyze these SERP results and page metadata for the query "${query}":

## SERP Results:
${serpData || "No SERP data available"}

## Sample Page Titles and Descriptions:
${pageData || "No page metadata available"}

Provide analysis on:
1. Snippet quality assessment - Are titles and descriptions compelling? Proper length?
2. Intent mismatch detection - Does the content match what users are searching for?
3. Missing page types - What content types could better serve this query?
4. Quick wins for better CTR - Specific improvements to increase click-through rate

Return ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "type": "snippet_quality" | "intent_mismatch" | "missing_page_type" | "ctr_opportunity",
      "impact": "high" | "medium" | "low",
      "description": "Detailed description of the finding",
      "action": "Specific action to take to improve"
    }
  ]
}`;
}

/**
 * Synthesis Prompt for GPT 5.2
 * Synthesizes all audit findings into a comprehensive report
 *
 * @param findings - Structured findings from deterministic audits
 * @param coverage - Coverage limitations
 * @param visualAnalysisText - Raw markdown from visual audit LLM (optional)
 */
export function getSynthesisPrompt(
  findings: AuditFindings,
  coverage: CoverageLimitations,
  visualAnalysisText?: string | null
): string {
  // Count findings by category for context
  const crawlCount = findings.crawl.length;
  const technicalCount = findings.technical.length;
  const securityCount = findings.security.length;
  const performanceCount = findings.performance.length;
  const serpCount = findings.serp.length;

  // Format findings for the prompt (without private flags)
  const formatFindings = (categoryFindings: typeof findings.crawl) => {
    return categoryFindings
      .map((f) => `- [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`)
      .join("\n") || "No findings in this category";
  };

  // Visual analysis section - use raw text if available, otherwise note it's missing
  const visualSection = visualAnalysisText
    ? visualAnalysisText
    : "No visual analysis available (screenshots may not have been captured)";

  return `Synthesize these audit findings into a comprehensive, client-ready report.

## DETERMINISTIC FINDINGS (from automated checks):

### Crawl Issues (${crawlCount}):
${formatFindings(findings.crawl)}

### Technical SEO Issues (${technicalCount}):
${formatFindings(findings.technical)}

### Security Issues (${securityCount}):
${formatFindings(findings.security)}

### Performance Issues (${performanceCount}):
${formatFindings(findings.performance)}

## LLM-GENERATED ANALYSIS:

### Visual/UX Analysis:
${visualSection}

### SERP/Search Analysis (${serpCount}):
${formatFindings(findings.serp)}

## COVERAGE AND LIMITATIONS:
- Pages sampled: ${coverage.pagesSampled} / ${coverage.pagesTotal}
- DNS resolved: ${coverage.dnsResolved}
- TLS verified: ${coverage.tlsVerified}
- Lighthouse run: ${coverage.lighthouseRun}
- Screenshots captured: ${coverage.screenshotsCaptured}
- SERP checked: ${coverage.serpChecked}
- Fetch errors: ${coverage.fetchErrors.length}
- Blocked by robots: ${coverage.blockedByRobots.length}

## YOUR TASK:

Generate a comprehensive audit report with the following sections:

1. **Executive Summary** (2-3 paragraphs)
   - Overall assessment of the site's SEO health
   - Most critical issues requiring immediate attention
   - Key strengths to leverage

2. **Top 3-5 Priorities** (numbered list)
   - Highest impact fixes with effort estimates
   - Expected outcomes from addressing each

3. **Findings by Category**
   - Group findings logically
   - Provide context for why each matters
   - Include severity indicators

4. **Prioritized Action Plan**
   - Immediate (this week)
   - Short-term (this month)
   - Long-term (next quarter)

5. **Limitations and Unknowns**
   - What couldn't be checked
   - Data quality caveats
   - Areas needing manual review

## IMPORTANT RULES:
- STRICT: Do not include private flags or exploit-enabling details
- Focus on actionable recommendations
- Use professional but accessible language
- Be specific about impact and effort
- Include estimated traffic impact where relevant

Return ONLY valid JSON in this exact format:
{
  "executiveSummary": {
    "score": number (0-100),
    "grade": "A" | "B" | "C" | "D" | "F",
    "headline": "One-line summary",
    "overview": "2-3 paragraph detailed summary",
    "keyStrengths": ["string"],
    "keyIssues": ["string"],
    "urgency": "immediate" | "high" | "medium" | "low"
  },
  "priorities": [
    {
      "rank": number,
      "title": "string",
      "description": "string",
      "impact": "high" | "medium" | "low",
      "effort": "high" | "medium" | "low"
    }
  ],
  "findingsByCategory": [
    {
      "name": "string",
      "score": number (0-100),
      "findings": [{"type": "string", "severity": "string", "message": "string"}],
      "summary": "string"
    }
  ],
  "actionPlan": {
    "immediate": ["string"],
    "shortTerm": ["string"],
    "longTerm": ["string"]
  },
  "limitations": ["string"]
}`;
}
