import { AuditConfig } from '../../types';
import { MODELS } from '../lib/constants';

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  steps: {
    visual: {
      id: 'visual',
      title: 'Call 1: Visual Audit',
      model: MODELS.DEFAULT,
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
      model: MODELS.DEFAULT,
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
      model: MODELS.DEFAULT,
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
      model: MODELS.DEFAULT,
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
      model: MODELS.DEFAULT,
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
      model: MODELS.DEFAULT,
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

[CALL 5: PDP FINDINGS]
{{pdpFindings}}

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
