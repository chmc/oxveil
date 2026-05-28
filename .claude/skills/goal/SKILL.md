---
name: goal
description: Manage persistent goals across Claude sessions. Goals survive session restarts and are shown at SessionStart.
trigger: /goal new, /goal list, /goal close, /goal show, /goal switch
---

## Commands

### /goal new [optional-name]
Create a goal for current work. If name omitted, infer from context (plan title, issue #, request).
- Read plan file title if exists: `grep -m1 '^# ' "$PLANS_DIR"/*.md`
- Slugify: lowercase, spaces→hyphens, prefix issue # if found
- Write atomically to `workflow-state/goals/<name>.md`

### /goal list
List all goals with timestamps. For each goal:
- Title from first `# ` line
- Created from YAML frontmatter `created:`
- Modified: file mtime formatted as "Xd ago" / "Xh ago" / "Xmin ago"

### /goal show <name>
Print full contents of `workflow-state/goals/<name>.md`.

### /goal close <name>
Delete `workflow-state/goals/<name>.md`. Remove from `active-goal` if it matches.

### /goal switch
Re-trigger goal selection: list goals via AskUserQuestion, same flow as SessionStart.
After selection, touch gate file:
```bash
touch "$CLAUDE_PROJECT_DIR/.claude/workflow-state/goal-gate-passed"
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
tmp=$(mktemp)
cat > "$tmp" << EOF
---
created: $(date '+%d.%m.%Y %H:%M')
---
# $title
EOF
mv "$tmp" "$GOALS_DIR/$name.md"
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
