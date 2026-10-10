import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BATON_DIR, loadConfig } from "./config.mjs";
import { readPublished } from "./publish.mjs";

// Text a session-start hook prints into a new agent session: the owner's
// standing instructions, then the latest published state. Never throws; a
// missing piece becomes a one-line note so the session still starts.
export function sessionContext(cwd, { remote = "origin", timeout = 10_000 } = {}) {
  const parts = ["# Baton: shared project state", ""];
  let config;
  try {
    config = loadConfig(cwd);
  } catch (err) {
    return parts.concat(`.baton/config.json could not be read (${err.message}).`).join("\n");
  }

  const instructionsPath = join(cwd, BATON_DIR, "instructions.md");
  if (existsSync(instructionsPath)) {
    parts.push(readFileSync(instructionsPath, "utf8").trim(), "");
  }

  const state = readPublished(cwd, { branch: config.stateBranch, remote, timeout });
  if (state) {
    parts.push(state.trim());
  } else {
    parts.push(`_No state published yet on \`${config.stateBranch}\`. It appears after the baton Action first runs._`);
  }
  return parts.join("\n") + "\n";
}
