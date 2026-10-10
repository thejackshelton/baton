import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Claude Code adapter: a SessionStart hook that prints baton context into
// every new session, and a CLAUDE.md that points at AGENTS.md. Nothing in
// core depends on this file.

export const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.baton/lib/bin/baton.mjs" context || true';

export function install(root) {
  const log = [];

  const settingsPath = join(root, ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  if (addHook(settings)) {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    log.push("added SessionStart hook to .claude/settings.json");
  }

  const claudePath = join(root, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, "@AGENTS.md\n");
    log.push("created CLAUDE.md");
  } else if (!readFileSync(claudePath, "utf8").includes("AGENTS.md")) {
    const text = readFileSync(claudePath, "utf8");
    writeFileSync(claudePath, `${text}${text.endsWith("\n") ? "" : "\n"}\n@AGENTS.md\n`);
    log.push("linked AGENTS.md from CLAUDE.md");
  }
  return log;
}

// Adds the baton hook next to any existing SessionStart hooks. Returns false
// if it was already there.
export function addHook(settings) {
  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];
  const present = settings.hooks.SessionStart.some((group) =>
    (group.hooks ?? []).some((h) => h.command?.includes(".baton/lib/bin/baton.mjs")),
  );
  if (present) return false;
  settings.hooks.SessionStart.push({ hooks: [{ type: "command", command: HOOK_COMMAND }] });
  return true;
}
