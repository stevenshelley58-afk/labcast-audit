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
export function getVisualAuditPrompt(
  url: string,
  pageType: "homepage" | "pdp",
  htmlSignals?: {
    title: string | null;
    h1: string | null;
    metaDescription: string | null;
    imageCount: number;
    hasSchema: boolean;
  }
): string {
  const htmlContext = htmlSignals
    ? `
## HTML Signals (for cross-reference):
- Page Title: ${htmlSignals.title || "(missing)"}
- H1: ${htmlSignals.h1 || "(missing)"}
- Meta Description: ${htmlSignals.metaDescription || "(missing)"}
- Image Count: ${htmlSignals.imageCount}
- Structured Data (Schema.org): ${htmlSignals.hasSchema ? "Present" : "Not detected"}
`
    : "";

  const pageTypeContext =
    pageType === "pdp"
      ? "This is a Product Detail Page (PDP). Pay special attention to product presentation, purchase flow, and conversion elements."
      : "This is a Homepage. Focus on first impressions, value proposition clarity, and navigation to key content.";

  return `Perform a comprehensive visual and UX audit of the website screenshots (desktop and mobile) for ${url}.

${pageTypeContext}
${htmlContext}

Provide a detailed analysis (500-1000 words) covering ALL of the following areas:

---

## 1. ABOVE-THE-FOLD ANALYSIS
- Hero section effectiveness (message clarity, visual appeal, relevance)
- Primary navigation visibility and organization
- Main CTA visibility and prominence
- Value proposition clarity (can users understand what this site offers in 3 seconds?)
- Visual clutter assessment

## 2. ECOMMERCE-SPECIFIC CHECKLIST
${
  pageType === "pdp"
    ? `### Add to Cart Button Analysis:
- Visibility: Is the button immediately visible without scrolling?
- Color: Does it use a contrasting, action-oriented color?
- Size: Is it large enough to be easily clickable (minimum 44x44px)?
- Placement: Is it positioned near the price and product title?
- Label clarity: Does the button text clearly indicate the action?

### Price Visibility and Clarity:
- Is the price prominently displayed?
- Are sale prices clearly distinguished from original prices?
- Is currency clearly indicated?
- Are any additional costs (shipping, taxes) visible or mentioned?

### Product Image Quality:
- Image resolution and quality
- Multiple angles/views available?
- Zoom capability present?
- Image-to-whitespace ratio
- Product shown in context/lifestyle shots?

### Trust Signals:
- Customer reviews/ratings visible?
- Security badges (SSL, payment icons)?
- Return policy visibility
- Guarantee indicators
- Brand authenticity markers

### Shipping/Returns Information:
- Shipping cost/timeline visibility
- Free shipping threshold mentioned?
- Return policy accessibility
- Delivery date estimates

### Stock Availability:
- Stock status indicators present?
- Low stock urgency messaging?
- Size/variant availability clear?`
    : `### Homepage Ecommerce Elements:
- Featured products/categories visibility
- Promotional banners effectiveness
- Search functionality prominence
- Category navigation clarity
- Trust signals (reviews, security badges, guarantees)
- Shipping/returns policy visibility`
}

## 3. MOBILE-SPECIFIC ANALYSIS
- Touch target sizes (are interactive elements at least 44x44px?)
- Thumb-zone placement (are primary actions in easy-to-reach areas?)
- Mobile navigation pattern (hamburger menu usability, bottom nav if present)
- Form input usability (appropriate keyboard types, field sizes)
- Pinch-to-zoom necessity (is text readable without zooming?)
- Horizontal scrolling issues
- Mobile-specific CTAs and their accessibility
- Content priority on smaller screens

## 4. CONVERSION FLOW ANALYSIS
- Clarity of the primary conversion path
- Number of steps/friction points visible
- Form field count and complexity (if visible)
- Error prevention design
- Progress indicators (if multi-step)
- Cart/checkout accessibility
- Guest checkout option visibility

## 5. VISUAL HIERARCHY SCORING
Rate each aspect 1-10:
- Heading hierarchy clarity: [score]
- Content scanability: [score]
- Whitespace utilization: [score]
- F-pattern/Z-pattern alignment: [score]
- Focal point effectiveness: [score]
- Overall visual hierarchy score: [average]

## 6. BRAND CONSISTENCY CHECK
- Color palette consistency across elements
- Typography consistency (font families, sizes, weights)
- Icon style consistency
- Imagery style coherence
- Tone alignment between visuals and copy
- Logo placement and prominence

## 7. ACCESSIBILITY BASICS
- Color contrast (text vs background - does it appear WCAG compliant?)
- Text size readability (body text appears 16px+ equivalent?)
- Link distinguishability (underlines, color differentiation)
- Button state visibility (hover, focus, active states apparent?)
- Image alt text indicators (if any visual cues)
- Keyboard focus visibility concerns

---

## OUTPUT FORMAT:

**Critical Issues:**
- [Issue name]: [Detailed description of what's wrong, why it matters for conversions/UX, and specific recommendation to fix it]
(List issues that seriously hurt conversions, usability, or accessibility. Be specific about location and impact.)

**Warnings:**
- [Issue name]: [Detailed description and recommendation]
(List moderate issues worth addressing. Include estimated impact.)

**Minor/Info:**
- [Observation]: [Note and optional suggestion]
(List minor observations, positive elements worth maintaining, or low-priority improvements.)

**Visual Hierarchy Score:** [0-100]
(Based on the scoring in section 5)

**Mobile Readiness Score:** [0-100]
(Based on mobile-specific analysis)

**Ecommerce Optimization Score:** [0-100]
(Based on ecommerce checklist completeness)

**Summary:** [2-3 sentence overall UX and conversion optimization assessment, highlighting the most impactful finding and the biggest quick win opportunity]

**Overall Score:** [0-100, weighted average considering all factors, where 100 is excellent UX with no issues]

---

Be specific, actionable, and data-driven. Reference exact locations in screenshots when possible (e.g., "top-right corner", "below the fold", "mobile header"). Every issue must include what's wrong, why it matters, and how to fix it. Do NOT return JSON.`;
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
 * Synthesizes all audit findings into narrative markdown text.
 *
 * NOTE: Scores are calculated deterministically in code, not by the LLM.
 * The LLM produces ONLY narrative text blocks.
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

  // Count by severity
  const allFindings = [
    ...findings.crawl,
    ...findings.technical,
    ...findings.security,
    ...findings.performance,
    ...findings.serp,
  ];
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const warningCount = allFindings.filter((f) => f.severity === "warning").length;

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

  return `Synthesize these audit findings into narrative text for a client-ready report.

## FINDINGS SUMMARY:
- Total findings: ${allFindings.length}
- Critical issues: ${criticalCount}
- Warnings: ${warningCount}

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

---

## YOUR TASK:

Write narrative markdown text for each section below. DO NOT return JSON.
Scores are calculated by code - focus on writing clear, actionable prose.

---

## Executive Summary

Write 2-3 paragraphs providing:
- Overall assessment of the site's SEO health based on the findings
- Most critical issues requiring immediate attention
- Key opportunities for improvement

---

## Key Strengths

List the site's SEO strengths as bullet points:
- What is working well
- Areas where the site excels
- Positive signals detected

---

## Key Issues

List the main problems as bullet points:
- Critical issues to address first
- Patterns of concern
- High-impact problems

---

## Category Summaries

Write a brief summary paragraph for each category:

### Crawl
[Summary of crawl/indexability findings and recommendations]

### Technical
[Summary of technical SEO findings and recommendations]

### Security
[Summary of security findings and recommendations]

### Performance
[Summary of performance findings and recommendations]

### Visual
[Summary of visual/UX findings and recommendations]

### SERP
[Summary of search appearance findings and recommendations]

---

## Action Items

### Immediate (This Week)
- [List urgent actions as bullet points]

### Short-Term (This Month)
- [List actions for the next 2-4 weeks]

### Long-Term (Next Quarter)
- [List strategic improvements]

---

## IMPORTANT RULES:
- Return ONLY markdown text, no JSON
- Use professional but accessible language
- Be specific and actionable in recommendations
- Do not include scores or grades (these are calculated by code)
- Do not include private flags or exploit-enabling details
- Focus on what matters most for SEO success`;
}
