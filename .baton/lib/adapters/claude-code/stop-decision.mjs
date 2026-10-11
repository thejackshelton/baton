import { loadConfig } from "../../core/config.mjs";
import { missingThread } from "../../core/threads.mjs";

export function stopDecision(cwd, input) {
  if (input?.stop_hook_active) return null;
  const config = loadConfig(cwd);
  if (!config.threadReminder) return null;
  const missing = missingThread(cwd, { defaultBranch: config.defaultBranch });
  if (!missing) return null;
  return {
    decision: "block",
    reason:
      `This branch has committed work but no thread summary. Before stopping, add .baton/threads/YYYY-MM-DD-<slug>.md ` +
      `(format in .baton/threads/README.md): what changed, what's left, and what the next agent should know. ` +
      `Commit it on this branch. If the work continues later, update the same file then.`,
  };
}
