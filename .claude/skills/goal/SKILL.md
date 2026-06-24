---
name: goal
description: Manage persistent goals across Claude sessions. Goals survive session restarts and are shown at SessionStart.
trigger: /goal new, /goal list, /goal close, /goal show, /goal switch
---

## System Flow

```
SessionStart                    Goal Selection                  Gate Enforcement
session-start.sh ──────────────▶ AskUserQuestion ──────────────▶ goal-action-gate.sh
├─ Clear stale gate (>4h)       ├─ Pick existing goal           ├─ Blocks tools until gate exists
├─ List active goals            │   └─ gate auto-written        ├─ Gate: workflow-state/goal-gate-passed
└─ Output "STOP"                │       (goal-selected-          └─ Allows: workflow-state, plans, Agent
                                │        postuse.sh hook)
                                └─ Or "Do something else"
                                    └─ planning-checklist.sh at ExitPlanMode:
                                        1. find_matching_goal() — strong matches only
                                           (#N exact, or Jaccard ≥ 0.5 + ≥2 shared tokens)
                                        2. No match → create new goal from plan title
Note: "Other" typed text that doesn't match a goal name → gate not auto-written; manual write required.
```

**Key files:**
- `CLAUDE.md` §FIRST: Goal Selection, §Goal Management — behavioral rules
- `hooks/session-start.sh` — detection + prompt
- `hooks/goal-action-gate.sh` — enforcement (blocks tools until gate)
- `hooks/goal-selected-postuse.sh` — auto-writes gate on AskUserQuestion answer
- `hooks/planning-checklist.sh` — auto-creates goals at ExitPlanMode
- `hooks/completion-bundle.sh` — enforces Status update before task completion
- `hooks/goal-update-warning.sh` — Stop hook warns if Status not updated
- `workflow-state/goals/*.md` — storage
- `workflow-state/goal-gate-passed` — gate marker (`<epoch>:<goal-id>`)

## Commands

### /goal new [optional-name]
Create a goal for current work. If name omitted, infer from context (plan title, issue #, request).
- Read plan file title if exists: `grep -m1 '^# ' "$PLANS_DIR"/*.md`
- Slugify title: lowercase, spaces/special→hyphens, max 50 chars
- Filename: `yymmdd-hhmm-<slug>.md` e.g. `260529-1430-fix-auth-bug.md`
- Write atomically to `workflow-state/goals/<filename>`

**Merge check is REQUIRED before creating any new file** (also enforced by `planning-checklist.sh` at ExitPlanMode):
1. `ls workflow-state/goals/*.md` — if empty, skip to step 5
2. For each existing goal: read `# Title` + `## Why`
3. MERGE if any match:
   - Same `#N` issue reference (check title + Why) — exact match wins immediately
   - Jaccard similarity ≥ 0.5 on tokenized titles with ≥2 shared non-stopword tokens
   - User explicitly said "continue" or "pick up" previous work
4. If multiple match: pick most recently modified
5. If merging: `echo -e "\n### $(date '+%Y-%m-%d %H:%M') - <summary>" >> "$goal_file"` — NEVER heredoc+mv existing files
6. If creating: print "Created goal: `<filename>`"
7. When in doubt → create new file (safe default)

**Jaccard matching details** (mirrors `hooks/planning-checklist-goal-match.sh`):
- Stopwords filtered before scoring: `the a an and or of to for in on is at by with not but issue fix add update remove close investigate investigation new feature bug refactor docs test chore`
- Tokens shorter than 3 chars are also dropped
- Jaccard threshold: intersection × 2 ≥ union (≥ 0.5), minimum 2 shared tokens
- Tie-break: most recently modified goal wins

**Output must show work:** "Checked N goals: `goal-a.md`, `goal-b.md`. No merge — creating new."

### /goal list
List all goals newest-first. For each goal:
- Title from first `# ` line
- Created from YAML frontmatter `created:`
- Modified: file mtime formatted as "Xh ago" / "Xd ago"

### /goal show <name>
Print full contents of `workflow-state/goals/<name>.md`. `<name>` is the full filename without `.md`.

### /goal close <name>
Delete `workflow-state/goals/<name>.md`. `<name>` is the full filename without `.md`.

**Never delete goal files automatically.** Closing a goal is a user operation — only run `/goal close` when explicitly asked.

### /goal switch
Re-trigger goal selection: list goals via AskUserQuestion, same flow as SessionStart.
- ≤3 goals: one option per goal + "Do something else"
- >3 goals: list ALL goals (numbered, one per line) in question text; show 3 newest as options + "Do something else"; user picks older goals via "Other" free-text (match typed name to goals list)
After selection, write gate file with `<epoch>:<goal-id>`:
```bash
echo "$(date +%s):$selected_goal" > "$CLAUDE_PROJECT_DIR/.claude/workflow-state/goal-gate-passed"
```

## Goal File Format

```markdown
---
created: 28.05.2026 14:30
---
# <Title describing the goal>

## Why
<Problem, intended solution, key decisions — enough context for session handoff>

## Status
### YYYY-MM-DD HH:MM - <summary>
<What was done, decisions made, next steps>
```

Subsequent sessions append new `### ` entries — never replace existing ones.

## Writing Goals

When creating a goal file, write atomically:
```bash
GOALS_DIR="$CLAUDE_PROJECT_DIR/.claude/workflow-state/goals"
mkdir -p "$GOALS_DIR"
ts=$(date '+%y%m%d-%H%M')
slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed -E 's/-+/-/g' | cut -c1-50 | sed 's/-$//')
filename="${ts}-${slug}.md"
tmp=$(mktemp)
cat > "$tmp" << EOF
---
created: $(date '+%d.%m.%Y %H:%M')
---
# $title

## Why
<Problem, intended solution, key decisions — enough context for session handoff>

## Status
EOF
mv "$tmp" "$GOALS_DIR/$filename"
```

## Mtime Age Calculation

```bash
if [ "$(uname)" = "Darwin" ]; then
    mod_epoch=$(stat -f '%m' "$goal_file")
else
    mod_epoch=$(stat -c '%Y' "$goal_file")
fi
now=$(date +%s)
age_min=$(( (now - mod_epoch) / 60 ))
if [ "$age_min" -lt 60 ]; then age="${age_min}min ago"
elif [ "$age_min" -lt 1440 ]; then age="$(( age_min / 60 ))h ago"
else age="$(( age_min / 1440 ))d ago"
fi
```
