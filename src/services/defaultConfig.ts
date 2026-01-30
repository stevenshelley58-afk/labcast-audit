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
