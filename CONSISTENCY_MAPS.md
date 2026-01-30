# Labcast Audit - CONSISTENCY_MAPS.md

## A) Env and Config Precedence Map

### Canonical Implementation
**Location:** `api/lib/types.ts:456-467` (DEFAULT_HYBRID_CONFIG)

This is the most comprehensive and recently designed config structure. It uses a nested object pattern with provider-specific settings.

```typescript
export const DEFAULT_HYBRID_CONFIG: HybridAuditConfig = {
  crawlDepth: 'surface',
  visualMode: 'url_context',
  psiEnabled: true,
  securityScope: 'headers_only',
  providers: {
    gemini: { maxConcurrent: 3 },
    openai: { maxConcurrent: 2 },
  },
  enableCodebasePeek: true,
  enablePdp: true,
};
```

### All Duplicates

| File | Lines | Config Name | Drift Description |
|------|-------|-------------|-------------------|
| `api/lib/types.ts` | 399-426 | DEFAULT_PARALLEL_CONFIG | Superset with timeouts and limits |
| `api/lib/types.ts` | 456-467 | DEFAULT_HYBRID_CONFIG | **CANONICAL** - most current |
| `api/lib/micro-audits/types.ts` | 115-120 | DEFAULT_MICRO_AUDIT_CONFIG | Subset for Layer 3 only |
| `api/lib/collectors/index.ts` | 82-92 | DEFAULT_CONFIG (Layer1Config) | Different defaults for collectors |
| `api/lib/collectors/shallow-crawl.ts` | 89-93 | DEFAULT_CONFIG (CrawlConfig) | Crawl-specific defaults |
| `src/services/defaultConfig.ts` | 4-120 | DEFAULT_AUDIT_CONFIG | **LEGACY** - large prompt templates |
| `api/audit.ts` | 95-280 | DEFAULT_AUDIT_CONFIG | **DUPLICATE LEGACY** - same structure, inline prompts |
| `api/lib/providers/gemini.ts` | 23-28 | DEFAULT_CONFIG | Provider-specific |
| `api/lib/providers/openai.ts` | 21-25 | DEFAULT_CONFIG | Provider-specific |

### All Consumers

| File | Lines | Config Used | Notes |
|------|-------|-------------|-------|
| `api/hybrid-audit.ts` | 100-107 | DEFAULT_HYBRID_CONFIG | Merges user config with defaults |
| `api/lib/micro-audits/index.ts` | 49, 248 | DEFAULT_MICRO_AUDIT_CONFIG | Layer 3 audits |
| `api/lib/collectors/index.ts` | 105, 301 | DEFAULT_CONFIG (Layer1Config) | Layer 1 collectors |
| `api/config.ts` | 4, 23, 28 | DEFAULT_AUDIT_CONFIG (from src) | Redis-backed config |
| `api/audit.ts` | 578 | DEFAULT_AUDIT_CONFIG (local) | Legacy audit endpoint |
| `src/hooks/useAuditConfig.ts` | 3, 8, 57 | DEFAULT_AUDIT_CONFIG (from src) | Frontend config hook |

### Drift Differences

1. **DEFAULT_AUDIT_CONFIG** (`api/audit.ts` vs `src/services/defaultConfig.ts`)
   - Same structure but prompt templates may differ
   - `api/audit.ts:119` has inline prompt text that could drift from `src/services/defaultConfig.ts:11`
   - Evidence: Search for "FOCUS AREAS:" in both - slightly different formatting

2. **Provider Concurrency Defaults**
   - `DEFAULT_HYBRID_CONFIG`: gemini=3, openai=2
   - `DEFAULT_PARALLEL_CONFIG`: gemini=6 (maxConcurrentCalls), no openai
   - `gemini.ts` provider: maxConcurrent=3
   - `openai.ts` provider: maxConcurrent=2

3. **Timeout Values**
   - `DEFAULT_PARALLEL_CONFIG`: robots/sitemap/headers/html=5000, urlContext/serp=15000
   - `fetchers.ts`: DEFAULT_TIMEOUT=5000
   - `collectors/index.ts`: timeout=5000
   - `gemini.ts`: timeout=30000
   - `openai.ts`: timeout=60000
   - `screenshot.ts`: SCREENSHOT_TIMEOUT_MS=15000
   - `visual-audit.ts`: default timeout param=15000
   - `pagespeed.ts`: default timeout param=60000

---

## B) DB URL Resolution Map

**Status:** N/A - This codebase uses Redis (Upstash) not traditional database

### Redis Configuration

**Canonical:** `api/config.ts:9-17`

```typescript
function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}
```

### All Consumers

| File | Lines | Purpose |
|------|-------|---------|
| `api/config.ts` | 9-17, 20-48 | Config load/save to Redis |

### Drift

- No drift - single implementation
- **Risk:** Silent fallback to defaults when Redis not configured (warns to console but continues)

---

## C) Schema/Model/Table Naming Map

### Type Definitions

**Canonical Type Files:**

| Domain | Canonical Location | Duplicates |
|--------|-------------------|------------|
| Core Audit Types | `types.ts` (root) | `api/audit.ts:5-79` (duplicated for "serverless isolation") |
| Parallel Audit | `api/lib/types.ts` | None - comprehensive |
| Provider Types | `api/lib/providers/types.ts` | None - comprehensive |
| Micro-Audit Types | `api/lib/micro-audits/types.ts` | None - comprehensive |

### Naming Inconsistencies

| Concept | Names Used | Locations |
|---------|------------|-----------|
| Cost calculation | `calculateCost`, `calculateStepCost` | `api/lib/providers/types.ts:146`, `src/lib/pricing.ts:78`, `api/audit.ts:89` |
| Token counts | `promptTokenCount` vs `promptTokens` | `types.ts:84` vs `api/lib/providers/types.ts:64` |
| URL context metadata | `urlContextMetadata` vs `UrlRetrievalMetadata` | Used consistently but type defined twice |
| Priority levels | `critical/high/medium/low` vs `High/Medium/Low` vs `1/2/3/4/5` | Different enums in different layers |
| Audit step ID | `stepId`, `auditType`, `type` | `AuditTrace.stepId` vs `MicroAuditFinding.source` |
| Provider name | `'gemini'` \| `'openai'` vs `'openai'` \| `'gemini'` | Consistent union type usage |

### Partial Renames

| Old Name | New Name | Status |
|----------|----------|--------|
| `AuditFinding` | `MicroAuditFinding` | Both exist - legacy vs new |
| `AuditReport` | `ParallelAuditReport` | Both exist - legacy vs new |
| `AuditTrace` | Not renamed | Same name, duplicated |
| `stepId` | `source` (in findings) | Different contexts |

---

## D) Hashing and Identity Map

### Canonical Implementation

**Location:** `src/hooks/useDebugMode.ts:4-9`

```typescript
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### All Duplicates

| File | Lines | Hash/ID Logic | Drift Description |
|------|-------|---------------|-------------------|
| `src/lib/constants.ts` | 7 | `DEBUG_PASSWORD_HASH` constant | Different hash value than `useDebugMode.ts` |
| `src/hooks/useDebugMode.ts` | 12 | `DEBUG_PASSWORD_HASH` constant | **CANONICAL VALUE** - matches actual password 'audit5858' |
| `src/hooks/useDebugMode.ts` | 4-9 | `sha256()` function | **CANONICAL IMPLEMENTATION** |
| `api/audit.ts` | 463, 499 | `crypto.randomUUID()` | Trace ID generation |
| `api/lib/micro-audits/types.ts` | 13-29 | `MicroAuditFinding.id` | UUID string, generated by LLM or code |

### ID Generation Patterns

| Purpose | Method | Location | Deterministic? |
|---------|--------|----------|----------------|
| Trace IDs | `crypto.randomUUID()` | `api/audit.ts:463, 499` | No - random UUID |
| Finding IDs | From LLM response | Micro-audit parsers | No - LLM generated |
| Audit IDs | Not explicitly generated | Uses trace IDs | N/A |

### Drift

1. **Debug Password Hash**
   - `src/lib/constants.ts:7`: `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` (sha256('admin'))
   - `src/hooks/useDebugMode.ts:12`: `9863d93c3ccf260aa33e127f3b11baf7d6ee471263de8ea8bb51724f1448577c` (sha256('audit5858'))
   - **Impact:** Hook uses its own hash, constant is orphaned

---

## E) Logging and Telemetry Map

### Current State: No Canonical Logger

**Pattern:** Direct `console.*` usage throughout

### Log Locations by Severity

**console.error (16 occurrences):**
- `api/audit.ts:356, 533, 533, 720, 750` - Screenshot failures, config errors, parse errors
- `api/config.ts:30, 46, 83` - Redis errors
- `api/hybrid-audit.ts:53, 231, 329` - API errors
- `api/lib/providers/index.ts:108` - Provider failures
- `api/lib/micro-audits/*.ts` - Various audit failures
- `src/hooks/useAuditConfig.ts:22, 44` - Config load/save errors
- `src/hooks/useAuditExecution.ts:114` - Audit execution errors

**console.warn (13 occurrences):**
- `api/lib/synthesis/index.ts:193` - Provider fallback
- `api/lib/micro-audits/*.ts` - Parse warnings, fallback warnings
- `api/config.ts:22, 38` - Redis not configured
- `src/hooks/useHybridAudit.ts:260` - SSE parse failure

**console.log (minimal - good):**
- Mostly removed or converted to warn/error

### Field Consistency

| Field | Present In | Absent From | Inconsistent |
|-------|------------|-------------|--------------|
| Timestamp | No console logs | All console logs | N/A |
| Correlation ID | Nowhere | Everywhere | N/A |
| Severity level | Implied by method | Explicit field | N/A |
| Component/namespace | Manual in message | Structured field | All |

### Drift

1. **Error message format:**
   - Some: `'Failed to X: ${error}'`
   - Some: `'X error:', error`
   - Some: `'X failed:', error.message`

2. **Provider fallback logging:**
   - `api/lib/synthesis/index.ts:193`: `` `Synthesis: ${primary} failed...` ``
   - `api/lib/micro-audits/technical-seo.ts:65`: `` `Technical SEO audit: ${primary} failed...` ``
   - Pattern similar but not identical

---

## F) Script/CLI Runtime Contract Map

### Scripts Defined

**Location:** `package.json:6-11`

```json
"scripts": {
  "dev": "vite",
  "dev:api": "vercel dev --listen 3001",
  "build": "vite build",
  "preview": "vite preview"
}
```

### Runtime Contracts

| Script | Entry Point | Env Loading | Initialization Behavior |
|--------|-------------|-------------|------------------------|
| `npm run dev` | Vite dev server | `.env.local` (Vite) | SPA, no server env |
| `npm run dev:api` | Vercel dev server | `.env.local` (Vercel) | Serverless functions loaded |
| `npm run build` | Vite build | `.env` (build time) | Static site generation |

### API Endpoints (Serverless Functions)

| Endpoint | File | Env Vars Used | Init Behavior |
|----------|------|---------------|---------------|
| `/api/audit` | `api/audit.ts` | GEMINI_API_KEY | Checks key, returns 500 if missing |
| `/api/hybrid-audit` | `api/hybrid-audit.ts` | GEMINI_API_KEY | Checks key, returns 500 if missing |
| `/api/config` | `api/config.ts` | UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN | Silently uses defaults if missing |
| `/api/screenshot` | `api/screenshot.ts` | None | No env checks |

### Contract Drift

1. **API Key Validation:**
   - `api/audit.ts`: Checks `GEMINI_API_KEY`, returns 500 with `{ error: { code: 'API_ERROR', ... } }`
   - `api/hybrid-audit.ts`: Same pattern
   - **Drift risk:** If error format changes in one, clients break

2. **Redis Configuration:**
   - `api/config.ts`: Silently falls back to defaults with console.warn
   - **Risk:** Different from API key pattern (no error response)

3. **URL Validation:**
   - `api/audit.ts:548-551`: Adds https:// if missing, then validates
   - `api/hybrid-audit.ts:69-81`: Same logic but also handles pdpUrl
   - `api/lib/url.ts:normalizeUrl()`: Same logic but throws on invalid
   - **Drift:** Error handling differs (throw vs return 400)

4. **Config Merging:**
   - `api/hybrid-audit.ts:100-107`: Deep-ish spread for providers
   - `api/config.ts:27-28`: No merging, returns default if Redis fails
   - **Drift:** Different fallback behaviors

---

## Cross-Cutting Concerns

### Import Patterns

| Pattern | Used By | Notes |
|---------|---------|-------|
| `from './types.js'` | API layer files | Required for Vercel serverless |
| `from '../../types'` | Frontend files | Root types.ts |
| `from '../types'` | Same-directory imports | Relative |

### File Extension Handling

- Serverless files use `.js` extensions for imports (e.g., `from './types.js'`)
- Frontend files use no extension (e.g., `from './types'`)
- **Risk:** If moved between layers, imports break

### Duplicate Code Hotspots

| Function | Occurrences | Lines Each | Total Lines |
|----------|-------------|------------|-------------|
| `parseFindingsFromResponse` | 8 | ~30 | 240 |
| `calculateCost` variants | 3 | ~5 | 15 |
| `DEFAULT_CONFIG` objects | 9 | ~5-10 | ~60 |
| Provider fallback try/catch | 7 | ~15 | 105 |

**Potential savings if deduplicated:** ~400 lines

