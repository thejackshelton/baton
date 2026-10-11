#!/usr/bin/env node
// Claude Code Stop hook: before a session ends its turn, make sure committed
// work on this branch comes with a .baton/threads/ summary, so the next agent
// (on any account) can pick it up. Blocks at most once per stop: when Claude
// Code says a Stop hook already kept the session going, it lets it stop.
import { readFileSync } from "node:fs";
import { stopDecision } from "./stop-decision.mjs";

try {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {}
  const decision = stopDecision(process.env.CLAUDE_PROJECT_DIR || process.cwd(), input);
  if (decision) process.stdout.write(JSON.stringify(decision));
} catch {
  // Never trap a session because of baton.
}
