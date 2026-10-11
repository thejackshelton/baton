import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BATON_DIR = ".baton";

export const DEFAULT_CONFIG = {
  // Branch that holds the generated state.md. Kept off the default branch so
  // state updates never touch the code history or trip landing rules.
  stateBranch: "baton/state",
  // Leave null to use the repository's default branch from GitHub.
  defaultBranch: null,
  // Shell command run by the Action before metrics, e.g. "npm ci".
  setup: null,
  // Project-specific numbers: [{ "name": "CSS support", "command": "node scripts/support.mjs" }].
  // The first line of stdout is shown.
  metrics: [],
  // Pointers to docs that already track the project, so state.md links
  // instead of duplicating: [{ "label": "Goal", "path": "docs/goal.md" }].
  links: [],
  // Harness adapters that support it (Claude Code: a Stop hook) remind the
  // agent to write a .baton/threads/ summary before finishing a turn on a
  // branch with committed work and no summary.
  threadReminder: true,
  recentlyLanded: 10,
  recentThreads: 5,
  // Issues with any of these labels are listed under "Next up".
  nextLabels: ["next"],
  claiming: {
    enabled: false,
    // Claims older than this are flagged as stale in state.md.
    staleHours: 48,
  },
};

export function configPath(root) {
  return join(root, BATON_DIR, "config.json");
}

export function loadConfig(root) {
  const path = configPath(root);
  const user = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return mergeConfig(DEFAULT_CONFIG, user);
}

export function mergeConfig(base, over) {
  const out = { ...base };
  for (const [key, value] of Object.entries(over ?? {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = mergeConfig(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
