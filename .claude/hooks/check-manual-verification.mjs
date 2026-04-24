#!/usr/bin/env node
import { readFileSync } from 'fs';

const FORBIDDEN_PATTERNS = [
  /manual(?:ly)?\s+(?:test|verif|check|confirm)/i,
  /test\s+(?:this\s+)?yourself/i,
  /try\s+it\s+(?:yourself|manually)/i,
  /confirm\s+by\s+hand/i,
];

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  // Malformed input — allow
  console.log(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
}

// Skip if disabled via env var
if (process.env.OXVEIL_SKIP_MANUAL_CHECK === '1') {
  console.log(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
}

// Skip enforcement in plan mode — allow discussion of the rule
if (input.permission_mode === 'plan') {
  console.log(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
}

// Read transcript, extract ONLY the last assistant message (avoid sticky false-positive loop)
// Schema: {type: "assistant", message: {content: [{type: "text", text: "..."}]}}
let lastAssistantText = '';
try {
  const lines = readFileSync(input.transcript_path, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant' && entry.message?.content) {
        // Overwrite on each assistant entry — keeps only the last one
        lastAssistantText = '';
        for (const block of entry.message.content) {
          if (block.type === 'text') lastAssistantText += block.text + '\n';
        }
      }
    } catch { /* skip malformed lines */ }
  }
} catch {
  // Can't read transcript — allow
  console.log(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
}

// Check for forbidden patterns in the last response only
for (const pattern of FORBIDDEN_PATTERNS) {
  const match = lastAssistantText.match(pattern);
  if (match) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Blocked: "${match[0]}". Use /visual-verification or automation instead.`
    }));
    process.exit(0);
  }
}

console.log(JSON.stringify({ decision: 'allow' }));
