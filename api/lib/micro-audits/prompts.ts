/**
 * Micro-Audit Prompt Templates
 *
 * All prompt templates for Layer 3 micro-audits.
 * Structured for consistent output format across providers.
 */

// ============================================================================
// Common Output Format
// ============================================================================

export const FINDING_OUTPUT_FORMAT = `
OUTPUT FORMAT (JSON array):
[
  {
    "finding": "Clear, specific observation",
    "evidence": "Exact quote, value, or reference supporting this finding",
    "whyItMatters": "Impact on SEO/UX/conversion",
    "fix": "Specific, actionable recommendation",
    "priority": "critical|high|medium|low"
  }
]

RULES:
- Every finding MUST have evidence (quote, value, or specific reference)
- Maximum 5-7 findings per audit
- Prioritize actionable findings over informational observations
- Output valid JSON only, no markdown or commentary
`;

// ============================================================================
// Technical SEO Audit
// ============================================================================

export const TECHNICAL_SEO_PROMPT = `You are a Technical SEO Auditor. Analyze the crawlability and indexability signals.

INPUT DATA:

Robots.txt:
{{robotsTxt}}

Sitemap URLs found: {{sitemapUrlCount}}
Sitemap sample:
{{sitemapSample}}

HTTP Headers:
{{headers}}

Redirect Chain:
{{redirectChain}}

Canonical URL: {{canonical}}
Meta Robots: {{metaRobots}}

FOCUS AREAS:
1. Robots.txt configuration (disallow patterns, crawl-delay)
2. Sitemap presence and validity
3. Canonical tag implementation
4. Meta robots directives
5. HTTP to HTTPS redirects
6. Redirect chains (excessive hops)
7. Crawl budget optimization

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Performance Audit
// ============================================================================

export const PERFORMANCE_PROMPT = `You are a Web Performance Specialist. Analyze Core Web Vitals and performance metrics.

INPUT DATA:

Core Web Vitals:
- LCP (Largest Contentful Paint): {{lcp}}
- INP (Interaction to Next Paint): {{inp}}
- CLS (Cumulative Layout Shift): {{cls}}
- TTFB (Time to First Byte): {{ttfb}}
- FCP (First Contentful Paint): {{fcp}}

Performance Score: {{performanceScore}}/100
Data Source: {{dataSource}}

Top Opportunities:
{{opportunities}}

THRESHOLDS (Google's recommendations):
- LCP: Good < 2.5s, Needs Improvement < 4s, Poor > 4s
- INP: Good < 200ms, Needs Improvement < 500ms, Poor > 500ms
- CLS: Good < 0.1, Needs Improvement < 0.25, Poor > 0.25
- TTFB: Good < 800ms, Needs Improvement < 1800ms, Poor > 1800ms

FOCUS AREAS:
1. Core Web Vitals assessment
2. Largest performance opportunities
3. Mobile performance implications
4. Server response time analysis
5. Render-blocking resources

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// On-Page SEO Audit
// ============================================================================

export const ON_PAGE_SEO_PROMPT = `You are an On-Page SEO Specialist. Analyze title tags, meta descriptions, headings, and content structure.

INPUT DATA:

Title: {{title}}
Title Length: {{titleLength}} characters

Meta Description: {{metaDescription}}
Meta Description Length: {{metaDescriptionLength}} characters

Heading Structure:
{{headings}}

Word Count: {{wordCount}}
Internal Links: {{internalLinks}}
External Links: {{externalLinks}}

Open Graph:
- Title: {{ogTitle}}
- Description: {{ogDescription}}
- Image: {{ogImage}}

Schema Types Found: {{schemaTypes}}

BEST PRACTICES:
- Title: 50-60 characters, include primary keyword
- Meta Description: 150-160 characters, compelling CTA
- H1: Single, unique, keyword-focused
- Heading Hierarchy: H1 > H2 > H3 (no skips)
- Content: 300+ words minimum for indexable pages

FOCUS AREAS:
1. Title tag optimization
2. Meta description effectiveness
3. Heading structure and hierarchy
4. Content depth and keyword relevance
5. Social sharing metadata (OG/Twitter)
6. Structured data implementation

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Content Quality Audit
// ============================================================================

export const CONTENT_QUALITY_PROMPT = `You are a Content Quality Analyst. Evaluate content for search intent alignment and E-E-A-T signals.

INPUT DATA:

Page URL: {{url}}
Page Title: {{title}}
Word Count: {{wordCount}}

Content Preview:
{{contentPreview}}

Navigation Structure:
{{navStructure}}

Forms Present: {{hasForms}}
Schema Types: {{schemaTypes}}

FOCUS AREAS:
1. Search intent alignment (informational, transactional, navigational)
2. Content depth and comprehensiveness
3. E-E-A-T signals (Experience, Expertise, Authoritativeness, Trust)
4. Content freshness indicators
5. User engagement elements
6. Thin content detection

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Authority & Trust Audit
// ============================================================================

export const AUTHORITY_TRUST_PROMPT = `You are a Trust & Authority Analyst. Evaluate E-E-A-T signals and trust indicators.

INPUT DATA:

Domain: {{domain}}
HTTPS: {{isHttps}}

Security Headers Score: {{securityScore}}/100
Missing Security Headers: {{missingHeaders}}

Schema Types: {{schemaTypes}}

Trust Signals Found:
{{trustSignals}}

External Links: {{externalLinks}}

FOCUS AREAS:
1. HTTPS implementation
2. Security header configuration
3. Trust signals (contact info, about page, privacy policy)
4. Author/organization schema
5. External linking to authoritative sources
6. Brand reputation indicators

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Visual Audit (Mode A - URL Context)
// ============================================================================

export const VISUAL_AUDIT_URL_CONTEXT_PROMPT = `You are a UX/Visual Design Auditor. Analyze the website at {{url}} for design quality and user experience.

Use URL context to visit and analyze the page visually.

CRITICAL: LOADING STATE DETECTION
Before analyzing, check if the page is fully loaded or still showing a loading state:
- If you see spinner icons, "Loading...", "Please wait", skeleton screens, or placeholder content, the page may not be fully rendered
- JavaScript-heavy sites (React, Vue, Next.js, etc.) need time to hydrate and render content
- If the page appears to be in a loading/transitional state, DO NOT report it as broken or non-functional
- Instead, note that the page uses client-side rendering and may require JavaScript to display content
- Focus your analysis on whatever content IS visible, and note any loading indicators as a technical observation, not a flaw

FOCUS AREAS:
1. Above-the-fold content (H1 visibility, primary CTA)
2. Visual hierarchy and scannability
3. Mobile responsiveness indicators
4. Color contrast and accessibility
5. Trust signals (logos, certifications, testimonials)
6. Navigation clarity
7. Call-to-action prominence

EVIDENCE REQUIREMENTS:
- Quote exact on-screen text
- Reference specific page sections
- Note visual element positions
- If page appears to be loading, note this as an observation about client-side rendering, not a design flaw

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Visual Audit (Mode B - Screenshot)
// ============================================================================

export const VISUAL_AUDIT_SCREENSHOT_PROMPT = `You are a UX/Visual Design Auditor. Analyze the attached website screenshot for design quality and user experience.

CRITICAL: LOADING STATE DETECTION
Before analyzing, check if the screenshot shows a fully loaded page or a loading state:
- Look for spinner icons, "Loading...", "Generating Preview...", "Please wait", skeleton screens, or placeholder content
- If the page appears to be in a loading/transitional state, DO NOT report it as broken or non-functional
- JavaScript-heavy sites (React, Vue, Next.js, etc.) may be captured before full rendering
- Note loading indicators as a technical observation about client-side rendering, not a design flaw
- Focus your analysis on whatever content IS visible in the screenshot

FOCUS AREAS:
1. Above-the-fold content
   - Is the H1/main heading visible?
   - Is there a clear primary CTA?
   - What's the first impression?

2. Visual Hierarchy
   - Is the content scannable?
   - Are important elements emphasized?
   - Is there visual clutter?

3. Trust & Credibility
   - Are there trust signals visible?
   - Does the design match the brand's price point?
   - Are there social proof elements?

4. Accessibility Concerns
   - Text contrast visible issues
   - Button/link visibility
   - Font size and readability

5. Mobile Indicators
   - Does the layout suggest responsive design?
   - Are touch targets appropriately sized?

EVIDENCE REQUIREMENTS:
- Quote exact visible text from the screenshot
- Reference specific visual areas (hero, footer, sidebar, etc.)
- Note colors, sizes, and positions when relevant
- If page shows loading state, note this as a client-side rendering observation

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Codebase Peek Audit
// ============================================================================

export const CODEBASE_PEEK_PROMPT = `You are a Frontend Code Quality Auditor. Analyze the HTML source for technical issues.

INPUT DATA:

HTML Source (truncated):
{{htmlSource}}

Detected Issues:
{{detectedIssues}}

FOCUS AREAS:
1. Inline styles/scripts (render-blocking potential)
2. Missing attributes (alt, title, aria labels)
3. Deprecated HTML elements
4. JavaScript framework indicators
5. Third-party script overhead
6. Asset optimization opportunities

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// PDP (Product Detail Page) Audit
// ============================================================================

export const PDP_AUDIT_PROMPT = `You are an E-commerce Product Page Auditor. Analyze the product page for conversion optimization.

INPUT DATA:

Product Page URL: {{pdpUrl}}

Page Snapshot:
- Title: {{title}}
- Meta Description: {{metaDescription}}

Schema Types Found: {{schemaTypes}}
Has Product Schema: {{hasProductSchema}}
Has Review Schema: {{hasReviewSchema}}

Content:
{{contentPreview}}

FOCUS AREAS:
1. Product title and description clarity
2. Price visibility and formatting
3. Add to cart button prominence
4. Product images and alt text
5. Reviews/ratings visibility
6. Trust signals (returns, shipping, security)
7. Schema markup completeness (Product, Offer, Review)
8. Breadcrumb navigation
9. Cross-sell/upsell elements

${FINDING_OUTPUT_FORMAT}`;

// ============================================================================
// Template Interpolation
// ============================================================================

/**
 * Interpolate template variables
 */
export function interpolatePrompt(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return String(value);
  });
}

/**
 * Format array for prompt inclusion
 */
export function formatArrayForPrompt(items: string[], maxItems: number = 10): string {
  if (items.length === 0) return 'None';
  const displayItems = items.slice(0, maxItems);
  const result = displayItems.map((item, i) => `${i + 1}. ${item}`).join('\n');
  if (items.length > maxItems) {
    return result + `\n... and ${items.length - maxItems} more`;
  }
  return result;
}

/**
 * Format headers for prompt inclusion
 */
export function formatHeadersForPrompt(headers: Record<string, string>): string {
  const relevantHeaders = [
    'content-type',
    'cache-control',
    'x-robots-tag',
    'link',
    'strict-transport-security',
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
  ];

  const lines: string[] = [];
  for (const header of relevantHeaders) {
    if (headers[header]) {
      lines.push(`${header}: ${headers[header]}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No relevant headers found';
}

/**
 * Format headings for prompt inclusion
 */
export function formatHeadingsForPrompt(
  headings: Array<{ level: number; text: string }>
): string {
  if (headings.length === 0) return 'No headings found';

  return headings
    .slice(0, 15)
    .map((h) => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text.substring(0, 80)}`)
    .join('\n');
}

/**
 * Format opportunities for prompt inclusion
 */
export function formatOpportunitiesForPrompt(
  opportunities: Array<{ title: string; savingsMs?: number; savingsBytes?: number }>
): string {
  if (opportunities.length === 0) return 'No significant opportunities identified';

  return opportunities
    .slice(0, 8)
    .map((o) => {
      let savings = '';
      if (o.savingsMs) savings += `${o.savingsMs}ms`;
      if (o.savingsBytes) {
        if (savings) savings += ', ';
        savings += `${Math.round(o.savingsBytes / 1024)}KB`;
      }
      return `- ${o.title}${savings ? ` (potential savings: ${savings})` : ''}`;
    })
    .join('\n');
}
