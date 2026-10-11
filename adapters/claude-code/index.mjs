import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Claude Code adapter: a SessionStart hook that prints baton context into
// every new session, a Stop hook that asks for a thread summary before a
// turn ends on a branch that lacks one, and a CLAUDE.md that points at
// AGENTS.md. Nothing in core depends on this file.

export const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.baton/lib/bin/baton.mjs" context || true';
export const STOP_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.baton/lib/adapters/claude-code/stop.mjs" || true';

export function install(root) {
  const log = [];

  const settingsPath = join(root, ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  const added = [
    addHook(settings, "SessionStart", HOOK_COMMAND, ".baton/lib/bin/baton.mjs") && "SessionStart",
    addHook(settings, "Stop", STOP_COMMAND, ".baton/lib/adapters/claude-code/stop.mjs") && "Stop",
  ].filter(Boolean);
  if (added.length) {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    log.push(`added ${added.join(" and ")} hook to .claude/settings.json`);
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

// Adds a baton hook next to the event's existing hooks. Returns false if a
// hook running `marker` is already there.
export function addHook(settings, event, command, marker) {
  settings.hooks ??= {};
  settings.hooks[event] ??= [];
  const present = settings.hooks[event].some((group) => (group.hooks ?? []).some((h) => h.command?.includes(marker)));
  if (present) return false;
  settings.hooks[event].push({ hooks: [{ type: "command", command }] });
  return true;
}
