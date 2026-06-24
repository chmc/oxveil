#!/bin/sh
# Goal title matching helpers for planning-checklist.sh
# Provides: _tokenize_to_file, get_mtime, find_matching_goal
# Requires: GOALS_DIR set by caller

# Stopwords for goal-title Jaccard matching
STOPWORDS="the a an and or of to for in on is at by with not but issue fix add update remove close investigate investigation new feature bug refactor docs test chore"

# Tokenize a string: lowercase, non-alphanum → newlines, filter stopwords + len<3, sort -u, write to file
_tokenize_to_file() {
    _t_input="$1"
    _t_out="$2"
    printf '%s' "$_t_input" \
        | tr '[:upper:]' '[:lower:]' \
        | tr -cs 'a-z0-9' '\n' \
        | grep -v '^$' \
        | while IFS= read -r _tok; do
            _tlen=$(printf '%s' "$_tok" | wc -c | tr -d ' ')
            [ "$_tlen" -lt 3 ] && continue
            _is_stop=0
            for _sw in $STOPWORDS; do
                [ "$_tok" = "$_sw" ] && _is_stop=1 && break
            done
            [ "$_is_stop" = "0" ] && printf '%s\n' "$_tok"
          done \
        | sort -u > "$_t_out"
}

# get_mtime <file> — print modification time as Unix timestamp
get_mtime() {
    case "$(uname)" in
        Darwin) stat -f %m "$1" 2>/dev/null || printf '0' ;;
        *)      stat -c %Y "$1" 2>/dev/null || printf '0' ;;
    esac
}

# find_matching_goal <plan_title> — print best-matching goal name (no .md) or nothing
find_matching_goal() {
    _fg_title="$1"
    [ -d "$GOALS_DIR" ] || return 0

    # Step a: issue number match
    _fg_issue=$(printf '%s' "$_fg_title" | grep -oE '#[0-9]+' | head -1 | tr -d '#')
    if [ -n "$_fg_issue" ]; then
        for _fg_f in "$GOALS_DIR"/*.md; do
            [ -f "$_fg_f" ] || continue
            _fg_gtitle=$(sed -n 's/^# //p' "$_fg_f" | head -1)
            if printf '%s' "$_fg_gtitle" | grep -qE "#${_fg_issue}([^0-9]|$)"; then
                basename "$_fg_f" .md
                return 0
            fi
        done
    fi

    # Steps b-e: Jaccard similarity
    _fg_tmp_plan=$(mktemp)
    _tokenize_to_file "$_fg_title" "$_fg_tmp_plan"

    _fg_best_name=""
    _fg_best_inter=0
    _fg_best_union=1
    _fg_best_mtime=0

    for _fg_f in "$GOALS_DIR"/*.md; do
        [ -f "$_fg_f" ] || continue
        _fg_gtitle=$(sed -n 's/^# //p' "$_fg_f" | head -1)

        _fg_tmp_goal=$(mktemp)
        _tokenize_to_file "$_fg_gtitle" "$_fg_tmp_goal"

        _fg_inter=$(comm -12 "$_fg_tmp_plan" "$_fg_tmp_goal" | wc -l | tr -d ' ')
        _fg_union=$(cat "$_fg_tmp_plan" "$_fg_tmp_goal" | sort -u | wc -l | tr -d ' ')
        rm -f "$_fg_tmp_goal"

        [ "$_fg_inter" -lt 2 ] && continue
        [ "$_fg_union" -eq 0 ] && continue
        # Jaccard >= 0.5: inter * 2 >= union
        [ "$((_fg_inter * 2))" -lt "$_fg_union" ] && continue

        _fg_mtime=$(get_mtime "$_fg_f")

        # Pick highest Jaccard (cross-multiply); break ties by newest mtime
        _fg_new_better=0
        if [ -z "$_fg_best_name" ]; then
            _fg_new_better=1
        elif [ "$((_fg_inter * _fg_best_union))" -gt "$((_fg_best_inter * _fg_union))" ]; then
            _fg_new_better=1
        elif [ "$((_fg_inter * _fg_best_union))" -eq "$((_fg_best_inter * _fg_union))" ] && [ "$_fg_mtime" -gt "$_fg_best_mtime" ]; then
            _fg_new_better=1
        fi

        if [ "$_fg_new_better" = "1" ]; then
            _fg_best_name=$(basename "$_fg_f" .md)
            _fg_best_inter=$_fg_inter
            _fg_best_union=$_fg_union
            _fg_best_mtime=$_fg_mtime
        fi
    done

    rm -f "$_fg_tmp_plan"
    [ -n "$_fg_best_name" ] && printf '%s\n' "$_fg_best_name"
    return 0
}
