# Welcome Screen CTA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update welcome screen copy from generic "Create a Plan" to the warmer, journey-focused "From Idea to Reality" CTA.

**Architecture:** Copy-only changes in two files — sidebar HTML renderer and README. No logic, CSS, or structural changes.

**Tech Stack:** TypeScript (string literals), Markdown

**Spec:** `docs/superpowers/specs/2026-04-08-welcome-screen-cta-redesign-design.md`

---

### Task 1: Update sidebar welcome screen copy

**Files:**
- Modify: `src/views/sidebarHtml.ts:111-121`

- [ ] **Step 1: Update heading**

Change line 111:
```typescript
// Before:
  <h2 class="state-title">Create a Plan</h2>
// After:
  <h2 class="state-title">From Idea to Reality</h2>
```

- [ ] **Step 2: Update subtitle**

Change line 112:
```typescript
// Before:
  <p class="state-desc">Describe your project and let AI draft the phases.</p>
// After:
  <p class="state-desc">Tell AI what you're thinking. It'll help you refine it, plan it, and build it.</p>
```

- [ ] **Step 3: Update CTA button label**

Change line 114:
```typescript
// Before:
    { label: "Create Plan", command: "createPlan", primary: true },
// After:
    { label: "Let's Go", command: "createPlan", primary: true },
```

- [ ] **Step 4: Update "How it works" steps**

Change lines 119-121:
```typescript
// Before:
      <li>Describe your project to Claude in a chat</li>
      <li>Claude drafts a plan with phases</li>
      <li>Review, configure, and run</li>
// After:
      <li>Tell AI what you're thinking</li>
      <li>Together, shape it into a plan</li>
      <li>Review and let AI build it</li>
```

- [ ] **Step 5: Run lint and tests**

Run: `npm run lint && npm test`
Expected: Both pass clean.

- [ ] **Step 6: Commit**

```bash
git add src/views/sidebarHtml.ts
git commit -m "feat: update welcome screen CTA to 'From Idea to Reality'"
```

### Task 2: Update README onboarding copy

**Files:**
- Modify: `README.md:119`

- [ ] **Step 1: Update walkthrough step 3**

Change line 119:
```markdown
<!-- Before: -->
3. Create or open a plan
<!-- After: -->
3. Bring your idea or open an existing plan
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README onboarding step to match new welcome CTA"
```

### Task 3: Visual verification

- [ ] **Step 1: Run visual verification**

Action: Invoke `/visual-verification` to confirm the sidebar renders correctly with the new copy in the empty state.
