# Labcast Audit - FIX_PLAN.md

## Principles

### What Becomes Canonical and Why

1. **Pricing & Cost Calculation**
   - **Canonical:** `api/lib/providers/types.ts:MODEL_PRICING`
   - **Why:** Provider layer is the lowest-level dependency; all cost calculations should import from here
   - **Migration:** Delete `src/lib/pricing.ts` and `api/audit.ts` pricing tables

2. **Config Objects**
   - **Canonical:** `api/lib/types.ts:DEFAULT_HYBRID_CONFIG`
   - **Why:** Most comprehensive, newest, supports nested provider config
   - **Migration:** Legacy `api/audit.ts` should import from shared location, not define inline

3. **Type Definitions**
   - **Canonical:** Root `types.ts` for shared types, `api/lib/types.ts` for server-only types
   - **Why:** Root types.ts is already imported by both frontend and backend
   - **Migration:** Delete duplicate in `api/audit.ts` (lines 5-79)

4. **Parse Utilities**
   - **Canonical:** New file `api/lib/micro-audits/parsers.ts`
   - **Why:** All 8 micro-audits use identical parsing logic
   - **Migration:** Extract common function, delete duplicates

5. **Debug Hash**
   - **Canonical:** `src/hooks/useDebugMode.ts:DEBUG_PASSWORD_HASH`
   - **Why:** This is the actively used value
   - **Migration:** Delete orphaned constant from `src/lib/constants.ts`

---

## 3-Phase Plan

### Phase 1 (P0 Correctness) - CRITICAL FIXES

**Goal:** Eliminate behavior differences that could cause production issues

#### Task P0-1: Consolidate MODEL_PRICING
**Acceptance Criteria:**
- [ ] Only one `MODEL_PRICING` table exists in codebase
- [ ] All cost calculations use the same pricing data
- [ ] `gpt-4o` pricing is available in all audit paths

**Exact Changes:**
1. Keep `api/lib/providers/types.ts:130-144` as canonical
2. In `api/audit.ts`, replace lines 82-87 with import:
   ```typescript
   import { MODEL_PRICING, calculateCost } from './lib/providers/types.js';
   ```
3. In `src/lib/pricing.ts`, replace lines 24-71 with re-export:
   ```typescript
   export { MODEL_PRICING, calculateCost } from '../api/lib/providers/types.js';
   ```
4. Update `api/audit.ts:89-92` to use imported `calculateCost`

**Verification:**
```bash
# Should return no results
grep -n "MODEL_PRICING" api/audit.ts src/lib/pricing.ts

# Should show only import
grep -n "MODEL_PRICING" api/lib/providers/types.ts
```

#### Task P0-2: Delete Duplicate DEFAULT_AUDIT_CONFIG
**Acceptance Criteria:**
- [ ] `api/audit.ts` no longer defines `DEFAULT_AUDIT_CONFIG`
- [ ] Legacy endpoint imports from shared location
- [ ] Both audit paths use identical prompt templates

**Exact Changes:**
1. Delete `api/audit.ts:95-280` (entire DEFAULT_AUDIT_CONFIG)
2. Add import at top of `api/audit.ts`:
   ```typescript
   import { DEFAULT_AUDIT_CONFIG } from '../src/services/defaultConfig.js';
   ```
3. Update `api/audit.ts:578` to use imported config

**Verification:**
```bash
# Should return no results
grep -n "DEFAULT_AUDIT_CONFIG" api/audit.ts | head -5

# Should compile without errors
npm run build
```

#### Task P0-3: Fix Duplicate DEBUG_PASSWORD_HASH
**Acceptance Criteria:**
- [ ] Only one `DEBUG_PASSWORD_HASH` constant exists
- [ ] Debug password authentication works

**Exact Changes:**
1. Delete `src/lib/constants.ts:7` (DEBUG_PASSWORD_HASH line)
2. Update `src/hooks/useDebugMode.ts` to import from constants:
   ```typescript
   import { DEBUG_PASSWORD_HASH } from '../lib/constants.js';
   ```
   - OR - delete the import line if keeping local definition

**Verification:**
```bash
# Should return exactly one result
grep -rn "DEBUG_PASSWORD_HASH" src/

# Manual test: Enter debug mode with password 'audit5858'
```

#### Task P0-4: Fix Config Precedence Drift
**Acceptance Criteria:**
- [ ] Config merging uses consistent deep merge logic
- [ ] Nested provider settings properly override defaults

**Exact Changes:**
1. Create `api/lib/config/merge.ts`:
   ```typescript
   export function deepMerge<T>(target: T, source: Partial<T>): T {
     // Implementation that properly merges nested objects
   }
   ```
2. Update `api/hybrid-audit.ts:100-107` to use `deepMerge()`
3. Update `api/config.ts:27-28` to use same merge logic

**Verification:**
```typescript
// Test case that should pass:
const userConfig = { providers: { gemini: { maxConcurrent: 5 } } };
const result = deepMerge(DEFAULT_HYBRID_CONFIG, userConfig);
// result.providers.gemini.maxConcurrent should be 5
// result.providers.openai.maxConcurrent should still be 2 (default)
```

#### Task P0-5: Extract parseFindingsFromResponse
**Acceptance Criteria:**
- [ ] Single shared parser utility
- [ ] All 8 micro-audit files import and use it
- [ ] No duplicate parser functions remain

**Exact Changes:**
1. Create `api/lib/micro-audits/parsers.ts`:
   ```typescript
   import type { MicroAuditFinding } from './types.js';

   export function parseFindingsFromResponse(
     text: string,
     source: string
   ): MicroAuditFinding[] {
     // Implementation from any existing parser
   }
   ```
2. Delete `parseFindingsFromResponse` from:
   - `technical-seo.ts:120-148`
   - `performance.ts:160-188`
   - `on-page-seo.ts:131-159`
   - `content-quality.ts:125-153`
   - `authority-trust.ts:132-160`
   - `pdp-audit.ts:130-158`
   - `codebase-peek.ts:117-145`
   - `visual-audit.ts:242-276`
3. Add import to each file:
   ```typescript
   import { parseFindingsFromResponse } from './parsers.js';
   ```

**Verification:**
```bash
# Should return no results
grep -rn "function parseFindingsFromResponse" api/lib/micro-audits/

# Should return 9 results (1 definition + 8 imports)
grep -rn "parseFindingsFromResponse" api/lib/micro-audits/ | wc -l
```

---

### Phase 2 (P1 Drift Removal) - CONSOLIDATION

**Goal:** Unify contracts and eliminate duplication

#### Task P1-1: Consolidate calculateCost Functions
**Exact Changes:**
1. Keep `api/lib/providers/types.ts:calculateCost` as canonical
2. Delete `src/lib/pricing.ts:calculateStepCost` (lines 78-87)
3. Update `api/audit.ts` to use imported `calculateCost`
4. Re-export from `src/lib/pricing.ts`:
   ```typescript
   export { calculateCost as calculateStepCost } from '../../api/lib/providers/types.js';
   ```

**Verification:**
```bash
# Verify cost calculation with unknown model returns consistent value
echo "calculateCost('unknown-model', 1000, 1000)" | node
# Should return consistent value regardless of import path
```

#### Task P1-2: Unify Type Definitions
**Exact Changes:**
1. Move shared types from `api/audit.ts:5-79` to root `types.ts`
2. Update imports in `api/audit.ts`:
   ```typescript
   import type { AuditTrace, AuditConfig, AuditReport } from '../types.js';
   ```
3. Delete duplicate type definitions

**Verification:**
```bash
# Should compile without errors
npm run build

# Should have no duplicate type definitions
grep -n "interface AuditTrace" api/audit.ts
# Should return nothing
```

#### Task P1-3: Create Timeout Constants
**Exact Changes:**
1. Create `api/lib/constants/timeouts.ts`:
   ```typescript
   export const DEFAULT_TIMEOUTS = {
     fetch: 5000,
     screenshot: 15000,
     provider: {
       gemini: 30000,
       openai: 60000,
     },
     urlContext: 15000,
   } as const;
   ```
2. Replace all hardcoded timeouts with imports

**Files to Update:**
- `api/lib/fetchers.ts:15`
- `api/lib/collectors/index.ts:86`
- `api/lib/providers/gemini.ts:26`
- `api/lib/providers/openai.ts:24`
- `api/screenshot.ts:3`
- `api/lib/types.ts:401-406`

#### Task P1-4: Unify URL Normalization
**Exact Changes:**
1. Ensure all endpoints use `normalizeUrl()` from `api/lib/url.ts`
2. Update `api/audit.ts:548-551`:
   ```typescript
   import { normalizeUrl } from './lib/url.js';
   // ...
   const normalizedUrl = normalizeUrl(rawUrl);
   ```
3. Update `api/hybrid-audit.ts:69-81` to use same function

#### Task P1-5: Create Logger Utility
**Exact Changes:**
1. Create `api/lib/logger.ts`:
   ```typescript
   export const logger = {
     error: (component: string, message: string, error?: unknown) => {
       console.error(`[${component}] ${message}`, error);
     },
     warn: (component: string, message: string, meta?: unknown) => {
       console.warn(`[${component}] ${message}`, meta);
     },
   };
   ```
2. Replace ad-hoc console calls with logger

**Priority Files:**
- `api/audit.ts` (5 console calls)
- `api/hybrid-audit.ts` (3 console calls)
- `api/config.ts` (4 console calls)
- `api/lib/providers/index.ts` (1 console call)

---

### Phase 3 (P2 Cleanup) - READABILITY

**Goal:** Style and consistency improvements

#### Task P2-1: Remove Dead Code
- [ ] Delete orphaned `DEBUG_PASSWORD_HASH` from `src/lib/constants.ts`
- [ ] Verify `merger.ts` is used or delete
- [ ] Remove redundant default in `pagespeed.ts:164`

#### Task P2-2: Update Comments
- [ ] Fix comment in `api/audit.ts:4` about "serverless isolation"
- [ ] Update `api/lib/fetchers.ts:5` comment about "single retry"
- [ ] Fix misleading comment in `api/lib/types.ts:5`

#### Task P2-3: Standardize Naming
- [ ] Create priority enum mapping utilities
- [ ] Document when to use each priority format
- [ ] Add JSDoc to all public functions

#### Task P2-4: Add Missing Tests
- [ ] Create test for `parseFindingsFromResponse`
- [ ] Create test for `calculateCost` with edge cases
- [ ] Create test for `deepMerge` config utility

---

## "Do Not Do" List

### Refactors Explicitly Out of Scope

1. **Do NOT rewrite the legacy audit endpoint (`api/audit.ts`) to use the new hybrid pipeline**
   - Risk: Breaking existing clients
   - Instead: Ensure config duplication is eliminated so behavior stays consistent

2. **Do NOT consolidate all DEFAULT_* configs into one mega-config**
   - Risk: Different layers have different needs
   - Instead: Keep layer-specific configs but extract shared values (timeouts, limits)

3. **Do NOT replace console with a complex logging framework (Winston, Pino, etc.)**
   - Risk: Unnecessary dependency for current needs
   - Instead: Simple wrapper that adds component context

4. **Do NOT change the URL normalization regex/logic**
   - Risk: Breaking URL handling edge cases
   - Instead: Just consolidate to use the same function everywhere

5. **Do NOT add new abstraction layers (e.g., "BaseAudit", "BaseProvider")**
   - Risk: Over-engineering
   - Instead: Extract concrete duplicates first, abstract only if pattern emerges

6. **Do NOT change provider SDK versions or APIs**
   - Risk: Breaking provider integrations
   - Instead: Fix the duplication around them

7. **Do NOT move files between directories**
   - Risk: Breaking import paths
   - Instead: Fix imports within current structure

8. **Do NOT add new environment variables**
   - Risk: Configuration sprawl
   - Instead: Use existing vars more consistently

---

## Verification Commands

### Pre-Flight Check
```bash
# Count duplicates before fix
echo "=== MODEL_PRICING occurrences ==="
grep -rn "MODEL_PRICING" --include="*.ts" | grep -v "import" | grep -v "export"

echo "=== parseFindingsFromResponse definitions ==="
grep -rn "function parseFindingsFromResponse" --include="*.ts"

echo "=== DEFAULT_AUDIT_CONFIG definitions ==="
grep -rn "const DEFAULT_AUDIT_CONFIG" --include="*.ts"

echo "=== DEBUG_PASSWORD_HASH definitions ==="
grep -rn "DEBUG_PASSWORD_HASH" --include="*.ts" | grep "const\|="
```

### Post-Fix Verification
```bash
# Build check
npm run build

# Duplicate check
grep -rn "MODEL_PRICING" --include="*.ts" | grep "const\|=" | wc -l
# Should return: 1

grep -rn "function parseFindingsFromResponse" --include="*.ts" | wc -l
# Should return: 1

grep -rn "const DEFAULT_AUDIT_CONFIG" --include="*.ts" | wc -l
# Should return: 1 (in src/services/defaultConfig.ts)

# Runtime check
curl -X POST http://localhost:3001/api/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"example.com"}' \
  -s | head -c 200

# Should return valid JSON without error
```

---

## Rollback Plan

### If Issues Arise

1. **Stop immediately** - do not continue with more changes
2. **Revert the specific file** causing issues using git:
   ```bash
   git checkout -- path/to/file.ts
   ```
3. **Verify revert worked:**
   ```bash
   npm run build
   npm run dev
   ```
4. **Document the issue** in FIX_PLAN.md under "Known Issues"
5. **Replan** the fix with smaller steps

### Critical Files to Backup First
- `api/audit.ts` - Legacy endpoint
- `api/lib/providers/types.ts` - Pricing canonical source
- `src/services/defaultConfig.ts` - Config canonical source

---

## Timeline Estimates (Not Required but Helpful)

| Phase | Tasks | Relative Effort |
|-------|-------|-----------------|
| Phase 1 | 5 tasks | Highest priority |
| Phase 2 | 5 tasks | Medium priority |
| Phase 3 | 4 tasks | Lowest priority |

**Recommended execution:** Complete all Phase 1 tasks before moving to Phase 2.

