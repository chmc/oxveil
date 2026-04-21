#!/usr/bin/env node

// --- Configuration (edit these lists to maintain the hook) ---

const HEAD_LINES = 150;
const TAIL_LINES = 50;

// Commands that produce short/no output — skip wrapping
const ALLOWLIST = [
  /^(echo|printf|pwd|which|type|date|whoami)\b/,
  /^(mkdir|cp|mv|rm|chmod|touch|ln)\b/,
  /^ls\b(?!.*\s-\S*R)/,           // ls without -R
  /^git\b/,
  /^node\s+-[ep]\b/,
  /^(npx|npm)\s+--version\b/,
  /^npm\s+version\b/,
  /^(export|source|cd|kill|set|true|false)\b/,
];

// Pipe targets that already bound output
const BOUNDED_PIPES = [
  /\|\s*(head|tail|wc|grep|jq|awk|sed|sort\s*\|\s*head|xargs)\b/,
];

// --- Core logic ---

function readStdin() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(''), 2000);
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timeout); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timeout); resolve(''); });
  });
}

function isAllowlisted(cmd) {
  const trimmed = cmd.trim();
  if (ALLOWLIST.some((re) => re.test(trimmed))) return true;
  if (BOUNDED_PIPES.some((re) => re.test(trimmed))) return true;
  return false;
}

function shouldSkipWrap(cmd) {
  // Heredocs break when wrapped
  if (/<</.test(cmd)) return true;
  // Output redirected to file — no context tokens consumed
  if (/\s>\s|^>|>>/.test(cmd)) return true;
  // Already has 2>&1 piped elsewhere — avoid double-redirect
  if (/2>&1\s*\|/.test(cmd)) return true;
  // Help flags — short output
  if (/\s--help\b|\s-h\b/.test(cmd)) return true;
  return false;
}

function wrapCommand(cmd) {
  const awkScript = [
    `NR<=${HEAD_LINES}{print;next}`,
    `{buf[NR%${TAIL_LINES}]=$0;t=NR}`,
    `END{if(t>${HEAD_LINES}){print "";`,
    `print "--- truncated (showing last ${TAIL_LINES} lines) ---";`,
    `s=t-${TAIL_LINES - 1};for(i=s;i<=t;i++)print buf[i%${TAIL_LINES}]}}`,
  ].join('');
  return `set -o pipefail; { ${cmd}; } 2>&1 | awk '${awkScript}'`;
}

async function main() {
  // Kill switch
  if (process.env.OXVEIL_BASH_HOOK === '0') {
    process.exit(0);
  }

  const raw = await readStdin();
  if (!raw) process.exit(0);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const cmd = input?.tool_input?.command;
  if (!cmd || typeof cmd !== 'string') process.exit(0);

  if (isAllowlisted(cmd)) process.exit(0);
  if (shouldSkipWrap(cmd)) process.exit(0);

  const wrapped = wrapCommand(cmd);
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { command: wrapped },
    },
  };
  process.stdout.write(JSON.stringify(output));
}

main();
