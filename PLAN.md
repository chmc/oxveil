# Oxveil Provider Settings (Issue #38, Phases 17-18)

## Context

Issue #38 adds provider selection to Oxveil to support both Claude CLI and OpenCode CLI. This is Step 7 of the claudeloop provider abstraction (#31).

**Dependency**: claudeloop already supports `--provider <name>` and `--provider-path <bin>` flags (Phases 1-16 complete, #31 closed).

**Goal**: Oxveil reads provider setting, passes flag to claudeloop. No adapter layer needed in Oxveil — claudeloop handles provider abstraction internally.

## Phase 17: Settings Infrastructure

### 1. Add settings to package.json (after line 372)

```json
"oxveil.provider": {
  "type": "string",
  "enum": ["claude", "opencode"],
  "default": "claude",
  "description": "AI provider to use for pipelines"
},
"oxveil.opencodePath": {
  "type": "string",
  "default": "",
  "description": "Path to OpenCode CLI executable (optional, uses PATH if empty)"
}
```

## Phase 18: ProcessManager Provider Flag

### 2. Update ProcessManagerSettings interface

**File**: `src/core/processManager.ts`

Add to `ProcessManagerSettings`:
```typescript
provider: "claude" | "opencode";
opencodePath: string;
```

### 3. Modify _settingsToArgs()

**File**: `src/core/processManager.ts`

Add after existing flags:
```typescript
if (settings.provider === "opencode") {
  args.push("--provider", "opencode");
  if (settings.opencodePath) {
    args.push("--provider-path", settings.opencodePath);
  }
}
```

### 4. Wire settings in processManagerFactory

**File**: `src/processManagerFactory.ts`

Update `getSettings()` to read new config values:
```typescript
provider: config.get<"claude" | "opencode">("provider", "claude"),
opencodePath: config.get<string>("opencodePath", ""),
```

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add 2 settings |
| `src/core/processManager.ts` | Extend ProcessManagerSettings, modify `_settingsToArgs()` |
| `src/processManagerFactory.ts` | Read new settings |

## Verification

- [ ] `oxveil.provider` setting appears in VS Code settings
- [ ] Default is "claude"
- [ ] Claude provider works unchanged (no `--provider` flag when "claude")
- [ ] `oxveil.provider = "opencode"` → claudeloop receives `--provider opencode`
- [ ] `oxveil.opencodePath` set → claudeloop receives `--provider-path <path>`
- [ ] `npm run lint` passes
- [ ] `npm test` passes

## Test Updates

**File**: `src/test/unit/core/processManager.test.ts`

Add test cases:
- Default provider ("claude") → no `--provider` flag in args
- Provider "opencode" → `--provider opencode` in args
- Provider "opencode" + path → `--provider opencode --provider-path /path/to/bin`

## Out of Scope (Future Phases)

- Plan Chat OpenCode terminal (Phase 19-20, Issue #39)
- Self-Improvement OpenCode terminal (Phase 21-22, Issue #40)
- Provider indicator in UI (Phase 23-24, Issue #41)
- Adapter layer in Oxveil (not needed — claudeloop handles internally)

## Close Issue

Final step: `gh issue close 38 --repo chmc/claudeloop`
