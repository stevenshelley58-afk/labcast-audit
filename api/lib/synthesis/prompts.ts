/**
 * Synthesis Prompts
 *
 * Prompt templates for Layer 4 final synthesis.
 */

// ============================================================================
// Main Synthesis Prompt
// ============================================================================

export const SYNTHESIS_PROMPT = `INPUT DATA:

URL: {{url}}

CURRENT SCORES:
- Technical: {{technicalScore}}/100
- On-Page SEO: {{onPageScore}}/100
- Content: {{contentScore}}/100
- Performance: {{performanceScore}}/100
- Security: {{securityScore}}/100

FINDINGS (Prioritized):
{{topFindings}}

DATA GAPS:
{{dataGaps}}

---

ROLE & STANCE:

You are a senior ecommerce auditor writing for founders, not designers or marketers.

Your job is to assess whether the site is structurally capable of:
- Converting first-time visitors
- Scaling organic acquisition
- Supporting paid traffic efficiently

If it is not, state this plainly.

Assume the reader is deciding whether to rebuild or patch.

---

CORE RULES (NON-NEGOTIABLE):

1. NO GENERIC PRAISE
Do not praise aesthetics, branding, or "vibe" unless directly tied to conversion or structure.
Statements like "clear CTA", "consistent palette", or "good design" are not allowed unless followed by a limitation or failure mode.

2. STRUCTURAL > COSMETIC
Treat design, SEO, and technical issues as system-level constraints, not isolated fixes.
If findings point to architectural weakness, state that explicitly.

3. REBUILD AWARENESS
If multiple findings share the same root cause (e.g. weak hierarchy, missing semantics, poor crawl certainty), consolidate them into a single structural critique.
Frame incremental fixes as insufficient where appropriate.

4. STRICT EVIDENCE RULE
Every finding must quote or reference specific evidence from the input data.
If evidence is weak, indirect, or missing, discard the finding.

5. NO OPTIMISATION THEATRE
Do not suggest A/B testing, generic best practices, or low-impact tweaks.
Only recommend actions that materially change outcomes.

---

SCORING CONSTRAINTS (0–100 SCALE):

- Sites with weak hierarchy, missing semantic structure, or unclear indexation cannot score above 70 overall.
- If hierarchy, CTA dominance, contrast, or accessibility issues are present, visual/aesthetic scores must be 75 or lower.
- If issues materially affect mobile usability, scores should be closer to 65.
- Scores must align with critique. Do not inflate.

---

FINDINGS GENERATION RULES:

Each finding must materially answer at least one:
- Does this block conversion?
- Does this weaken crawl or index certainty?
- Does this increase reliance on paid or social traffic?
- Does this indicate poor information architecture?

If not, discard the finding.

Findings must be consolidated around root causes, not listed as isolated symptoms.

---

LANGUAGE CONSTRAINTS:

Use:
- Declarative statements
- Cause → effect reasoning
- Business impact framing

Avoid:
- "Best practice"
- "Consider"
- "Nice to see"
- "Good use of"
- "Well-written"

---

REQUIRED SYNTHESIS SIGNALS:

At least once in the summary or analysis, explicitly state:
- Whether the site is structurally sound
- Whether issues are incremental or architectural
- Whether rebuild is the rational path versus optimisation

Do not hedge.

---

OUTPUT FORMAT (JSON):

{
  "executiveSummary": "string (2-3 sentences, state structural assessment plainly)",
  "topIssues": [
    {
      "title": "string",
      "narrative": "string (2-3 sentences explaining business impact)",
      "relatedFindings": ["finding-id-1", "finding-id-2"],
      "category": "technical|seo|content|performance|security"
    }
  ],
  "nextSteps": [
    {
      "action": "string (specific, material action)",
      "rationale": "string (cause → effect reasoning)",
      "expectedImpact": "high|medium|low",
      "effort": "low|medium|high",
      "category": "technical|seo|content|performance|security"
    }
  ],
  "scoreJustifications": {
    "technical": "string",
    "onPage": "string",
    "content": "string",
    "performance": "string",
    "security": "string",
    "overall": "string"
  }
}

Output valid JSON only.`;

// ============================================================================
// Quick Synthesis Prompt (Fallback)
// ============================================================================

export const QUICK_SYNTHESIS_PROMPT = `Synthesize these SEO audit findings into an executive summary.

URL: {{url}}

Findings:
{{findings}}

Output a brief JSON with:
{
  "executiveSummary": "2-3 sentence overview",
  "topPriorities": ["action 1", "action 2", "action 3"]
}`;

// ============================================================================
// Prompt Helpers
// ============================================================================

export function formatFindingsForSynthesis(
  findings: Array<{
    id: string;
    finding: string;
    evidence: string;
    priority: string;
    category: string;
  }>,
  maxFindings: number = 20
): string {
  return findings
    .slice(0, maxFindings)
    .map(
      (f, i) =>
        `${i + 1}. [${f.priority.toUpperCase()}] ${f.finding}
   Category: ${f.category}
   Evidence: ${f.evidence.substring(0, 150)}
   ID: ${f.id}`
    )
    .join('\n\n');
}

export function interpolateSynthesisPrompt(
  template: string,
  variables: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return String(value);
  });
}
