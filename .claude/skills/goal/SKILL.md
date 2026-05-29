---
name: goal
description: Manage persistent goals across Claude sessions. Goals survive session restarts and are shown at SessionStart.
trigger: /goal new, /goal list, /goal close, /goal show, /goal switch
---

## Commands

### /goal new [optional-name]
Create a goal for current work. If name omitted, infer from context (plan title, issue #, request).
- Read plan file title if exists: `grep -m1 '^# ' "$PLANS_DIR"/*.md`
- Slugify title: lowercase, spaces/special→hyphens, max 50 chars
- Filename: `yymmdd-hhmm-<slug>.md` e.g. `260529-1430-fix-auth-bug.md`
- Write atomically to `workflow-state/goals/<filename>`

**Before creating a new file, check for merge opportunity:**
1. Read titles and `## Why` sections of existing goals
2. Merge only if **clearly** the same work: same issue number, same slug keywords, or obviously the same topic
3. When in doubt → create new file (safe default)
4. If merging: append new context to the existing `## Status` section; print "Merged into: `<filename>` — <title>"
5. If creating new: print "Created goal: `<filename>`"
6. Never merge silently — always output which file was written

### /goal list
List all goals newest-first. For each goal:
- Title from first `# ` line
- Created from YAML frontmatter `created:`
- Modified: file mtime formatted as "Xh ago" / "Xd ago"

### /goal show <name>
Print full contents of `workflow-state/goals/<name>.md`. `<name>` is the full filename without `.md`.

### /goal close <name>
Delete `workflow-state/goals/<name>.md`. `<name>` is the full filename without `.md`.

### /goal switch
Re-trigger goal selection: list goals via AskUserQuestion, same flow as SessionStart.
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
<Why this matters>

## Status
<Current state, last attempt, blockers>
```

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
