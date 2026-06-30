#!/usr/bin/env bash
# Tests for the structural fix: preserve_wip leaves main working tree intact;
# setup_worktree applies WIP stash inside the worktree so files-under-test are present.
set -eu

PASS=0; FAIL=0
pass() { printf "PASS: %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

RECIPES="$(cd "$(dirname "$0")/.." && pwd)/skills/visual-verification/references/visual-verification-recipes.md"

# ── Extract recipe functions from recipes.md ──────────────────────────────────
extract_function() {
    local header="$1"
    awk "
        /^### ${header}/{found=1; next}
        found && /^\`\`\`bash/{in_block=1; next}
        in_block && /^\`\`\`/{exit}
        in_block{print}
    " "$RECIPES"
}

# Strip usage lines so eval only defines the function, doesn't call it.
strip_usage() { grep -v '^[[:space:]]*eval\|^[[:space:]]*# Usage'; }

PRESERVE_WIP_SRC=$(extract_function "WIP preservation" | strip_usage)
SETUP_WORKTREE_SRC=$(extract_function "Worktree setup" | strip_usage)

if [[ -z "$PRESERVE_WIP_SRC" ]]; then
    echo "FATAL: could not extract preserve_wip from recipes.md" >&2; exit 1
fi
if [[ -z "$SETUP_WORKTREE_SRC" ]]; then
    echo "FATAL: could not extract setup_worktree from recipes.md" >&2; exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Create a minimal git repo with one initial commit.
# Each test gets its own parent dir (e.g. $TMP/t1/) so that the worktree path
# ../oxveil-verify-* resolves to $TMP/t1/oxveil-verify-* — no collision between tests.
make_repo() {
    local dir="$1"   # e.g. $TMP/t1/repo
    mkdir -p "$dir"
    git -C "$dir" init -q
    git -C "$dir" config user.email "test@test"
    git -C "$dir" config user.name "Test"
    mkdir -p "$dir/.claude/hooks" "$dir/src/views"
    echo "# hook" > "$dir/.claude/hooks/foo.sh"
    echo "// src" > "$dir/src/views/widget.ts"
    echo "tracked" > "$dir/tracked.txt"
    git -C "$dir" add -A
    git -C "$dir" commit -q -m "initial"
}

# Run preserve_wip in repo; captures stdout (STASH_REF=... lines).
run_preserve_wip() {
    local repo="$1"
    (cd "$repo" && eval "$PRESERVE_WIP_SRC" && preserve_wip)
}

# Run setup_worktree in repo with given STASH_REF (no npm steps).
# Prints all output (including stash apply results) to stdout/stderr.
# Returns the absolute worktree path on a line by itself after all other output.
run_setup_worktree() {
    local repo="$1"
    local stash_ref="${2:-}"
    local patched_src
    patched_src=$(printf '%s' "$SETUP_WORKTREE_SRC" | sed '
        /npm install/d
        /npm run build/d
        /Installing dependencies/d
        /Building in worktree/d
        /FAIL: npm/d
    ')
    (cd "$repo" && STASH_REF="$stash_ref" && eval "$patched_src" && setup_worktree) 2>&1 || true
    # Absolute path from git (relative WORKTREE_PATH is invalid outside the subshell)
    git -C "$repo" worktree list --porcelain \
        | awk '/^worktree /{w=$2} END{if(w && w != ENVIRON["PWD"]) print w}' \
        | grep -v "^$repo$" | tail -1 || true
}

# ── T1: dirty tracked .claude/hooks/ file → worktree mirrors main working tree ─
T1_REPO="$TMP/t1/repo"; make_repo "$T1_REPO"
echo "# sentinel-t1" >> "$T1_REPO/.claude/hooks/foo.sh"

env_out=$(run_preserve_wip "$T1_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -z "$STASH_REF" ]]; then
    fail "T1: preserve_wip returned empty STASH_REF for dirty tracked file"
else
    WORKTREE_PATH=$(run_setup_worktree "$T1_REPO" "$STASH_REF" | tail -1)
    if [[ -n "$WORKTREE_PATH" ]] && grep -q "sentinel-t1" "$WORKTREE_PATH/.claude/hooks/foo.sh" 2>/dev/null; then
        pass "T1: dirty .claude/hooks/ file present in worktree"
    else
        fail "T1: sentinel missing from worktree (WORKTREE_PATH='$WORKTREE_PATH')"
    fi
    [[ -n "$WORKTREE_PATH" ]] && git -C "$T1_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# ── T2: dirty src/views/ file → path-agnostic ────────────────────────────────
T2_REPO="$TMP/t2/repo"; make_repo "$T2_REPO"
echo "// sentinel-t2" >> "$T2_REPO/src/views/widget.ts"

env_out=$(run_preserve_wip "$T2_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -z "$STASH_REF" ]]; then
    fail "T2: preserve_wip returned empty STASH_REF"
else
    WORKTREE_PATH=$(run_setup_worktree "$T2_REPO" "$STASH_REF" | tail -1)
    if [[ -n "$WORKTREE_PATH" ]] && grep -q "sentinel-t2" "$WORKTREE_PATH/src/views/widget.ts" 2>/dev/null; then
        pass "T2: dirty src/views/ file present in worktree (path-agnostic)"
    else
        fail "T2: sentinel missing from worktree (WORKTREE_PATH='$WORKTREE_PATH')"
    fi
    [[ -n "$WORKTREE_PATH" ]] && git -C "$T2_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# ── T3: new untracked file → present in worktree ─────────────────────────────
T3_REPO="$TMP/t3/repo"; make_repo "$T3_REPO"
mkdir -p "$T3_REPO/.claude/scripts"
echo "new-untracked" > "$T3_REPO/.claude/scripts/test-foo.sh"

env_out=$(run_preserve_wip "$T3_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -z "$STASH_REF" ]]; then
    fail "T3: preserve_wip returned empty STASH_REF for untracked file"
else
    WORKTREE_PATH=$(run_setup_worktree "$T3_REPO" "$STASH_REF" | tail -1)
    if [[ -n "$WORKTREE_PATH" ]] && [[ -f "$WORKTREE_PATH/.claude/scripts/test-foo.sh" ]]; then
        pass "T3: untracked file present in worktree"
    else
        fail "T3: untracked file missing from worktree (WORKTREE_PATH='$WORKTREE_PATH')"
    fi
    [[ -n "$WORKTREE_PATH" ]] && git -C "$T3_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# ── T4: staged-but-not-committed change → present in worktree ────────────────
T4_REPO="$TMP/t4/repo"; make_repo "$T4_REPO"
echo "staged-sentinel-t4" >> "$T4_REPO/tracked.txt"
git -C "$T4_REPO" add tracked.txt

env_out=$(run_preserve_wip "$T4_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -z "$STASH_REF" ]]; then
    fail "T4: preserve_wip returned empty STASH_REF for staged change"
else
    WORKTREE_PATH=$(run_setup_worktree "$T4_REPO" "$STASH_REF" | tail -1)
    if [[ -n "$WORKTREE_PATH" ]] && grep -q "staged-sentinel-t4" "$WORKTREE_PATH/tracked.txt" 2>/dev/null; then
        pass "T4: staged change present in worktree"
    else
        fail "T4: staged change missing from worktree (WORKTREE_PATH='$WORKTREE_PATH')"
    fi
    [[ -n "$WORKTREE_PATH" ]] && git -C "$T4_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# ── T5: clean working tree → STASH_REF empty, worktree matches HEAD ───────────
T5_REPO="$TMP/t5/repo"; make_repo "$T5_REPO"

env_out=$(run_preserve_wip "$T5_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -n "$STASH_REF" ]]; then
    fail "T5: expected empty STASH_REF for clean tree, got: $STASH_REF"
else
    WORKTREE_PATH=$(run_setup_worktree "$T5_REPO" "" | tail -1)
    if [[ -n "$WORKTREE_PATH" ]]; then
        diff_out=$(diff "$T5_REPO/.claude/hooks/foo.sh" "$WORKTREE_PATH/.claude/hooks/foo.sh" 2>&1 || true)
        if [[ -z "$diff_out" ]]; then
            pass "T5: clean tree — worktree matches HEAD, no stash"
        else
            fail "T5: worktree differs from HEAD: $diff_out"
        fi
        git -C "$T5_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
    else
        fail "T5: no worktree created"
    fi
fi

# ── T6: partial-stage — one staged, one unstaged → both in worktree ──────────
T6_REPO="$TMP/t6/repo"; make_repo "$T6_REPO"
echo "staged-t6" >> "$T6_REPO/tracked.txt"
git -C "$T6_REPO" add tracked.txt
echo "unstaged-t6" >> "$T6_REPO/.claude/hooks/foo.sh"

env_out=$(run_preserve_wip "$T6_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -z "$STASH_REF" ]]; then
    fail "T6: preserve_wip returned empty STASH_REF for partial-stage"
else
    WORKTREE_PATH=$(run_setup_worktree "$T6_REPO" "$STASH_REF" | tail -1)
    staged_ok=false; unstaged_ok=false
    [[ -n "$WORKTREE_PATH" ]] && grep -q "staged-t6" "$WORKTREE_PATH/tracked.txt" 2>/dev/null && staged_ok=true
    [[ -n "$WORKTREE_PATH" ]] && grep -q "unstaged-t6" "$WORKTREE_PATH/.claude/hooks/foo.sh" 2>/dev/null && unstaged_ok=true
    if [[ "$staged_ok" == "true" && "$unstaged_ok" == "true" ]]; then
        pass "T6: both staged and unstaged changes visible in worktree"
    else
        fail "T6: partial-stage — staged=$staged_ok unstaged=$unstaged_ok (WORKTREE_PATH='$WORKTREE_PATH')"
    fi
    [[ -n "$WORKTREE_PATH" ]] && git -C "$T6_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# ── T7: deleted tracked file → still deleted in worktree ─────────────────────
T7_REPO="$TMP/t7/repo"; make_repo "$T7_REPO"
rm "$T7_REPO/tracked.txt"

env_out=$(run_preserve_wip "$T7_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)

if [[ -z "$STASH_REF" ]]; then
    fail "T7: preserve_wip returned empty STASH_REF for deleted file"
else
    WORKTREE_PATH=$(run_setup_worktree "$T7_REPO" "$STASH_REF" | tail -1)
    if [[ -n "$WORKTREE_PATH" ]] && [[ ! -f "$WORKTREE_PATH/tracked.txt" ]]; then
        pass "T7: deleted file absent from worktree"
    else
        fail "T7: deleted file unexpectedly present (or no worktree) (WORKTREE_PATH='$WORKTREE_PATH')"
    fi
    [[ -n "$WORKTREE_PATH" ]] && git -C "$T7_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# ── T8: main working tree unchanged after preserve_wip + setup_worktree ───────
T8_REPO="$TMP/t8/repo"; make_repo "$T8_REPO"
echo "# sentinel-t8" >> "$T8_REPO/.claude/hooks/foo.sh"
BEFORE=$(cat "$T8_REPO/.claude/hooks/foo.sh")

env_out=$(run_preserve_wip "$T8_REPO")
STASH_REF=$(printf '%s' "$env_out" | grep '^STASH_REF=' | cut -d= -f2-)
WORKTREE_PATH=$(run_setup_worktree "$T8_REPO" "$STASH_REF" | tail -1)

AFTER=$(cat "$T8_REPO/.claude/hooks/foo.sh")
git_status=$(git -C "$T8_REPO" status --porcelain)

if [[ "$BEFORE" == "$AFTER" && -n "$git_status" ]]; then
    pass "T8: main working tree unchanged after preserve_wip + setup_worktree"
else
    if [[ "$BEFORE" != "$AFTER" ]]; then
        fail "T8: main working tree was modified (file content changed)"
    else
        fail "T8: git status clean — working tree was reset (lost WIP)"
    fi
fi
[[ -n "$WORKTREE_PATH" ]] && git -C "$T8_REPO" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true

# ── Summary ───────────────────────────────────────────────────────────────────
printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
