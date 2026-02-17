#!/bin/bash
# Generate a self-contained HTML dashboard for the Scaffold pipeline.
# Shows pipeline progress, prompt status, and "what's next" guidance.
#
# Compatible with Bash 3.2+ (macOS default). No associative arrays.
#
# Usage: bash scripts/generate-dashboard.sh [--no-open] [--json-only] [--output FILE] [--help]

set -euo pipefail

# ─── Section 1: Constants and argument parsing ────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."

# Flags
NO_OPEN=false
JSON_ONLY=false
OUTPUT_FILE=""

usage() {
    cat <<'EOF'
Usage: generate-dashboard.sh [OPTIONS]

Generate a visual HTML dashboard of the Scaffold pipeline.

Options:
  --no-open       Generate HTML but don't open in browser
  --json-only     Output JSON payload to stdout (no HTML)
  --output FILE   Write HTML to specified file path
  --help          Show this help message

Examples:
  bash scripts/generate-dashboard.sh                    # Generate and open
  bash scripts/generate-dashboard.sh --no-open          # Generate only
  bash scripts/generate-dashboard.sh --json-only        # JSON to stdout
  bash scripts/generate-dashboard.sh --output out.html  # Custom path
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-open)   NO_OPEN=true; shift ;;
        --json-only) JSON_ONLY=true; shift ;;
        --output)    OUTPUT_FILE="$2"; shift 2 ;;
        --help)      usage; exit 0 ;;
        *)           echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

# Preflight: require jq
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install with: brew install jq" >&2
    exit 1
fi

# ─── Section 2: Parse pipeline data ──────────────────────────────

SKILL_FILE="$REPO_DIR/skills/scaffold-pipeline/SKILL.md"

# Parse Pipeline Order table from SKILL.md into JSON
PIPELINE_JSON="[]"
if [[ -f "$SKILL_FILE" ]]; then
    PIPELINE_JSON=$(awk '
        /^\| # \| Phase/ { found=1; next }
        found && /^\|---/ { next }
        found && /^$/ { exit }
        found && /^\|/ {
            n = split($0, cols, "|")
            step = cols[2]; gsub(/^[ \t]+|[ \t]+$/, "", step)
            phase = cols[3]; gsub(/^[ \t]+|[ \t]+$/, "", phase)
            cmd = cols[4]; gsub(/^[ \t]+|[ \t]+$/, "", cmd)
            notes = cols[5]; gsub(/^[ \t]+|[ \t]+$/, "", notes)
            # Extract slug from /scaffold:slug format
            gsub(/.*scaffold:/, "", cmd); gsub(/`/, "", cmd); gsub(/ .*/, "", cmd)
            if (step != "" && step != "#") {
                printf "%s|%s|%s|%s\n", step, phase, cmd, notes
            }
        }
    ' "$SKILL_FILE" | jq -R 'split("|") | {step: .[0], phase: .[1], slug: .[2], notes: .[3]}' | jq -s .)
fi

# Parse Completion Detection table from SKILL.md into JSON
DETECTION_JSON="[]"
if [[ -f "$SKILL_FILE" ]]; then
    DETECTION_JSON=$(awk '
        /^\| # \| Step/ { found=1; next }
        found && /^\|---/ { next }
        found && /^$/ { exit }
        found && /^\|/ {
            n = split($0, cols, "|")
            step = cols[2]; gsub(/^[ \t]+|[ \t]+$/, "", step)
            check = cols[4]; gsub(/^[ \t]+|[ \t]+$/, "", check); gsub(/`/, "", check)
            comment = cols[5]; gsub(/^[ \t]+|[ \t]+$/, "", comment); gsub(/`/, "", comment)
            if (step != "" && step != "#") {
                printf "%s|%s|%s\n", step, check, comment
            }
        }
    ' "$SKILL_FILE" | jq -R 'split("|") | {step: .[0], checkFile: .[1], trackingComment: .[2]}' | jq -s .)
fi

# Parse descriptions from FRONTMATTER in extract-commands.sh
DESCRIPTIONS_JSON="{}"
EXTRACT_SCRIPT="$REPO_DIR/scripts/extract-commands.sh"
if [[ -f "$EXTRACT_SCRIPT" ]]; then
    DESCRIPTIONS_JSON=$(grep "^    '" "$EXTRACT_SCRIPT" | sed "s/^    '//; s/'$//" | \
        awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $1); gsub(/^[ \t]+|[ \t]+$/, "", $2); if ($1 != "") printf "%s|%s\n", $1, $2}' | \
        jq -R 'split("|") | {(.[0]): .[1]}' | jq -s 'add // {}')
fi

# Dependencies (hardcoded — stable, small dataset)
DEPS_JSON=$(cat <<'DEPSJSON'
{
    "prd-gap-analysis": ["create-prd"],
    "beads": ["prd-gap-analysis"],
    "tech-stack": ["beads"],
    "claude-code-permissions": ["tech-stack"],
    "coding-standards": ["tech-stack"],
    "tdd": ["tech-stack", "coding-standards"],
    "project-structure": ["coding-standards", "tdd"],
    "dev-env-setup": ["project-structure"],
    "design-system": ["dev-env-setup"],
    "git-workflow": ["dev-env-setup"],
    "multi-model-review": ["git-workflow"],
    "add-playwright": ["dev-env-setup"],
    "add-maestro": ["dev-env-setup"],
    "user-stories": ["prd-gap-analysis"],
    "user-stories-gaps": ["user-stories"],
    "user-stories-multi-model-review": ["user-stories-gaps"],
    "platform-parity-review": ["user-stories-gaps"],
    "claude-md-optimization": ["git-workflow", "user-stories-gaps"],
    "workflow-audit": ["claude-md-optimization"],
    "implementation-plan": ["workflow-audit", "user-stories-gaps", "project-structure"],
    "implementation-plan-review": ["implementation-plan"],
    "multi-model-review-tasks": ["implementation-plan-review"],
    "single-agent-start": ["implementation-plan-review"],
    "multi-agent-start": ["implementation-plan-review", "git-workflow"]
}
DEPSJSON
)

# ─── Section 3: Detect project state ─────────────────────────────

PROJECT_DIR="$PWD"
CONFIG_FILE="$PROJECT_DIR/.scaffold/config.json"
HAS_SCAFFOLD=false
PROFILE=""
CONFIG_JSON='{"completed":[],"skipped":[]}'

if [[ -f "$CONFIG_FILE" ]]; then
    HAS_SCAFFOLD=true
    PROFILE=$(jq -r '.profile // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
    CONFIG_JSON=$(jq '{completed: (.completed // []), skipped: (.skipped // [])}' "$CONFIG_FILE" 2>/dev/null || echo '{"completed":[],"skipped":[]}')
fi

# Build file existence checks: for each pipeline step, check if artifact exists
# and if tracking comment is found
FILE_STATUS_JSON=$(echo "$PIPELINE_JSON" | jq -r '.[].step' | while read -r step; do
    check_file=$(echo "$DETECTION_JSON" | jq -r --arg s "$step" '.[] | select(.step == $s) | .checkFile // ""')
    tracking=$(echo "$DETECTION_JSON" | jq -r --arg s "$step" '.[] | select(.step == $s) | .trackingComment // ""')
    status="pending"

    if [[ -n "$check_file" ]]; then
        resolved="$PROJECT_DIR/$check_file"
        if [[ -e "$resolved" ]]; then
            if [[ -n "$tracking" && "$tracking" != "N/A" ]]; then
                if grep -q "$tracking" "$resolved" 2>/dev/null; then
                    status="completed"
                else
                    status="likely-completed"
                fi
            else
                status="likely-completed"
            fi
        fi
    fi
    printf '%s|%s\n' "$step" "$status"
done | jq -R 'split("|") | {(.[0]): .[1]}' | jq -s 'add // {}')

# ─── Section 4: Beads integration (optional) ─────────────────────

BEADS_TOTAL=0
BEADS_OPEN=0
BEADS_CLOSED=0
HAS_BEADS=false

if command -v bd &>/dev/null; then
    beads_json=$(bd list --json 2>/dev/null || echo "")
    if [[ -n "$beads_json" ]]; then
        HAS_BEADS=true
        BEADS_TOTAL=$(echo "$beads_json" | jq 'length' 2>/dev/null || echo 0)
        BEADS_CLOSED=$(echo "$beads_json" | jq '[.[] | select(.status == "closed")] | length' 2>/dev/null || echo 0)
        BEADS_OPEN=$((BEADS_TOTAL - BEADS_CLOSED))
    fi
fi

# ─── Section 5: Build final JSON payload with jq ─────────────────

PAYLOAD=$(jq -n \
    --argjson pipeline "$PIPELINE_JSON" \
    --argjson detection "$DETECTION_JSON" \
    --argjson descriptions "$DESCRIPTIONS_JSON" \
    --argjson deps "$DEPS_JSON" \
    --argjson config "$CONFIG_JSON" \
    --argjson fileStatus "$FILE_STATUS_JSON" \
    --arg profile "$PROFILE" \
    --argjson hasScaffold "$HAS_SCAFFOLD" \
    --argjson hasBeads "$HAS_BEADS" \
    --argjson beadsTotal "$BEADS_TOTAL" \
    --argjson beadsOpen "$BEADS_OPEN" \
    --argjson beadsClosed "$BEADS_CLOSED" \
    --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg projectDir "$PROJECT_DIR" \
    '
    # Enrich prompts with status, description, deps, optional flag
    def resolveStatus($slug; $step):
        if ($config.completed | index($slug)) then "completed"
        elif ($config.skipped | index($slug)) then "skipped"
        elif ($fileStatus[$step] // "pending") != "pending" then $fileStatus[$step]
        else "pending"
        end;

    # Build enriched prompts array
    ($pipeline | map(. + {
        status: resolveStatus(.slug; .step),
        description: ($descriptions[.slug] // ""),
        deps: ($deps[.slug] // []),
        optional: ((.notes // "") | test("optional")),
        checkFile: (($detection | map(select(.step == .step)) | .[0].checkFile) // "")
    })) as $prompts |

    # Unique phases in order
    ($prompts | [.[].phase] | unique) as $rawPhases |
    ($pipeline | [.[].phase] | reduce .[] as $p ([]; if (. | index($p)) then . else . + [$p] end)) as $orderedPhases |

    # Summary counts
    ($prompts | map(select(.status == "completed")) | length) as $completed |
    ($prompts | map(select(.status == "skipped")) | length) as $skipped |
    ($prompts | map(select(.status == "likely-completed")) | length) as $likely |
    ($prompts | map(select(.status == "pending")) | length) as $pending |
    ($prompts | length) as $total |

    # What is next: first pending prompt with all deps satisfied
    ([$prompts[] | select(.status == "pending") |
        select(
            (.deps | length == 0) or
            (.deps | all(. as $dep | $prompts | map(select(.slug == $dep)) | .[0].status | . == "completed" or . == "likely-completed" or . == "skipped"))
        )] | .[0] // null) as $next |

    {
        prompts: $prompts,
        phases: ($orderedPhases | map({name: .})),
        summary: {
            total: $total,
            completed: $completed,
            skipped: $skipped,
            pending: $pending,
            likelyCompleted: $likely
        },
        next: (if $next then {slug: $next.slug, description: $next.description, step: $next.step} else null end),
        profile: $profile,
        hasScaffold: $hasScaffold,
        beads: {
            available: $hasBeads,
            total: $beadsTotal,
            open: $beadsOpen,
            closed: $beadsClosed
        },
        timestamp: $timestamp,
        projectDir: $projectDir
    }')

# ─── Section 6: Output ───────────────────────────────────────────

if [[ "$JSON_ONLY" == true ]]; then
    echo "$PAYLOAD"
    exit 0
fi

# Determine output path
if [[ -z "$OUTPUT_FILE" ]]; then
    if [[ -d "$PROJECT_DIR/.scaffold" ]]; then
        OUTPUT_FILE="$PROJECT_DIR/.scaffold/dashboard.html"
    else
        OUTPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/scaffold-dashboard-XXXXXX.html")
    fi
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Resolve CSS file path
CSS_FILE="$REPO_DIR/lib/dashboard-theme.css"
if [ ! -f "$CSS_FILE" ]; then
    echo "Error: dashboard theme not found at $CSS_FILE" >&2
    exit 1
fi

# Generate HTML — split around <style> tag to embed external CSS
cat > "$OUTPUT_FILE" <<'HTMLPRE'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scaffold Pipeline Dashboard</title>
<style>
HTMLPRE

cat "$CSS_FILE" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" <<'HTMLPOST'
</style>
</head>
<body>
<div class="wrap">
<script>
const DASHBOARD_DATA =
HTMLPOST

# Inject JSON payload
echo "$PAYLOAD" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" <<'HTMLTAIL'
;

(function() {
    var d = DASHBOARD_DATA;
    function esc(s) {
        var div = document.createElement('div');
        div.textContent = s || '';
        return div.innerHTML;
    }
    function stLbl(s) {
        return {completed:'Completed','likely-completed':'Likely done',skipped:'Skipped',pending:'Pending'}[s] || s;
    }

    var projectName = d.projectDir.split('/').pop();
    var h = '<div class="header"><h1>Scaffold Pipeline</h1>';
    if (d.profile) h += '<span class="badge">' + esc(d.profile) + '</span>';
    h += '</div>';
    h += '<div class="header-meta">' + esc(projectName) + ' &mdash; ' + new Date(d.timestamp).toLocaleString();
    if (!d.hasScaffold) h += ' &mdash; <em>Overview mode (no .scaffold/ detected)</em>';
    h += '</div>';

    var pct = function(n) { return (n / d.summary.total * 100).toFixed(1); };
    h += '<div class="progress-bar">';
    if (d.summary.completed > 0) h += '<div class="seg-done" style="width:' + pct(d.summary.completed) + '%"></div>';
    if (d.summary.likelyCompleted > 0) h += '<div class="seg-likely" style="width:' + pct(d.summary.likelyCompleted) + '%"></div>';
    if (d.summary.skipped > 0) h += '<div class="seg-skip" style="width:' + pct(d.summary.skipped) + '%"></div>';
    h += '</div>';

    h += '<div class="cards">';
    h += '<div class="card"><div class="card-num" style="color:var(--green)">' + d.summary.completed + '</div><div class="card-lbl">Completed</div></div>';
    if (d.summary.likelyCompleted > 0) h += '<div class="card"><div class="card-num" style="color:var(--blue)">' + d.summary.likelyCompleted + '</div><div class="card-lbl">Likely Done</div></div>';
    h += '<div class="card"><div class="card-num" style="color:var(--gray)">' + d.summary.skipped + '</div><div class="card-lbl">Skipped</div></div>';
    h += '<div class="card"><div class="card-num">' + d.summary.pending + '</div><div class="card-lbl">Pending</div></div>';
    h += '<div class="card"><div class="card-num">' + d.summary.total + '</div><div class="card-lbl">Total</div></div>';
    if (d.beads.available) h += '<div class="card"><div class="card-num">' + d.beads.open + '/' + d.beads.total + '</div><div class="card-lbl">Beads Open</div></div>';
    h += '</div>';

    if (d.next) {
        h += '<div class="next-banner"><h2>What\'s Next</h2>';
        h += '<p>' + esc(d.next.description) + '</p>';
        h += '<div class="next-cmd" data-cmd="/scaffold:' + esc(d.next.slug) + '">';
        h += '<code>/scaffold:' + esc(d.next.slug) + '</code>';
        h += ' <button onclick="copyCmd(this)" style="border:none;background:none;cursor:pointer;font-size:0.8rem;color:var(--text-muted)">Copy</button>';
        h += '</div></div>';
    } else if (d.summary.pending === 0 && d.summary.total > 0) {
        h += '<div class="next-banner"><h2>Pipeline Complete</h2><p>All prompts have been executed.</p></div>';
    }

    var ongoing = ['single-agent-start','single-agent-resume','multi-agent-start','multi-agent-resume','new-enhancement','quick-task','prompt-pipeline','update','version','dashboard'];
    var phased = d.prompts.filter(function(p) { return ongoing.indexOf(p.slug) === -1; });

    for (var pi = 0; pi < d.phases.length; pi++) {
        var phaseName = d.phases[pi].name;
        var pp = phased.filter(function(p) { return p.phase === phaseName; });
        if (pp.length === 0) continue;
        var done = pp.filter(function(p) { return p.status === 'completed' || p.status === 'likely-completed' || p.status === 'skipped'; }).length;

        h += '<div class="phase">';
        h += '<div class="phase-hdr" onclick="togglePhase(this)">';
        h += '<span class="arr">&#9660;</span>';
        h += '<h2 style="margin:0">' + esc(phaseName) + '</h2>';
        h += '<span class="phase-cnt">' + done + '/' + pp.length + '</span>';
        h += '</div><div class="plist">';

        for (var qi = 0; qi < pp.length; qi++) {
            var p = pp[qi];
            var blockers = [];
            if (p.status === 'pending') {
                for (var di = 0; di < p.deps.length; di++) {
                    var dep = p.deps[di];
                    for (var xi = 0; xi < d.prompts.length; xi++) {
                        if (d.prompts[xi].slug === dep && d.prompts[xi].status !== 'completed' && d.prompts[xi].status !== 'likely-completed' && d.prompts[xi].status !== 'skipped') {
                            blockers.push(dep);
                        }
                    }
                }
            }

            h += '<div class="pcard">';
            h += '<div class="dot st-' + p.status + '" title="' + stLbl(p.status) + '"></div>';
            h += '<div class="pinfo">';
            h += '<span class="pname">' + esc(p.slug) + '</span>';
            h += ' <span class="pstep">Step ' + esc(p.step) + '</span>';
            if (p.optional) h += ' <span class="badge badge-optional">optional</span>';
            if (p.description) h += '<div class="pdesc">' + esc(p.description) + '</div>';
            if (blockers.length > 0) h += '<div class="pdeps">Blocked by: ' + blockers.map(esc).join(', ') + '</div>';
            h += '</div>';
            h += '<div class="pcmd" onclick="copyCmd(this)" data-cmd="/scaffold:' + esc(p.slug) + '">/scaffold:' + esc(p.slug) + '</div>';
            h += '</div>';
        }
        h += '</div></div>';
    }

    var standalone = [
        {s:'new-enhancement', d:'Add a new feature to an existing project'},
        {s:'quick-task', d:'Create a focused task for a bug fix, refactor, or small improvement'},
        {s:'single-agent-start', d:'Start single-agent execution loop'},
        {s:'single-agent-resume', d:'Resume work after a break'},
        {s:'multi-agent-start', d:'Start multi-agent execution loop in a worktree'},
        {s:'multi-agent-resume', d:'Resume multi-agent work after a break'},
        {s:'prompt-pipeline', d:'Show the full pipeline reference'},
        {s:'dashboard', d:'Open this visual pipeline dashboard'},
        {s:'update', d:'Check for and apply scaffold updates'},
        {s:'version', d:'Show installed and latest scaffold version'}
    ];
    h += '<div class="ongoing"><h2>Standalone Commands</h2><div class="plist">';
    for (var si = 0; si < standalone.length; si++) {
        var sp = standalone[si];
        h += '<div class="pcard">';
        h += '<div class="dot" style="background:var(--accent)"></div>';
        h += '<div class="pinfo"><span class="pname">' + esc(sp.s) + '</span>';
        h += '<div class="pdesc">' + esc(sp.d) + '</div></div>';
        h += '<div class="pcmd" onclick="copyCmd(this)" data-cmd="/scaffold:' + esc(sp.s) + '">/scaffold:' + esc(sp.s) + '</div>';
        h += '</div>';
    }
    h += '</div></div>';

    h += '<div class="footer">Generated by Scaffold</div>';
    document.querySelector('.wrap').innerHTML = h;
})();

function togglePhase(el) {
    el.classList.toggle('closed');
    el.nextElementSibling.classList.toggle('hidden');
}
function copyCmd(el) {
    var cmd = el.getAttribute('data-cmd') || el.parentElement.getAttribute('data-cmd') || '';
    if (!cmd) { var p = el.closest('[data-cmd]'); if (p) cmd = p.getAttribute('data-cmd'); }
    if (navigator.clipboard) {
        navigator.clipboard.writeText(cmd).then(function() {
            el.classList.add('copied');
            setTimeout(function() { el.classList.remove('copied'); }, 1500);
        });
    }
}
</script>
</div>
</body>
</html>
HTMLTAIL

echo "Dashboard written to: $OUTPUT_FILE"

# ─── Section 7: Open in browser ──────────────────────────────────

if [[ "$NO_OPEN" == true ]]; then
    exit 0
fi

if [[ "$(uname)" == "Darwin" ]]; then
    open "$OUTPUT_FILE"
elif command -v xdg-open &>/dev/null; then
    xdg-open "$OUTPUT_FILE"
else
    echo "Open $OUTPUT_FILE in your browser to view the dashboard."
fi
