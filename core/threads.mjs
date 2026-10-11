import { BATON_DIR } from "./config.mjs";
import { tryGit } from "./git.mjs";

const THREADS = `${BATON_DIR}/threads/`;

// Does the current work branch carry committed work with no thread summary
// yet? Compares HEAD against the default branch; on the default branch itself
// there is nothing to check. Anything it cannot determine
// (no remote, detached state, shallow history) counts as "not missing", so
// callers never block an agent on a guess.
export function missingThread(cwd, { defaultBranch = null, remote = "origin", timeout = 5_000 } = {}) {
  const branch = defaultBranch ?? remoteDefaultBranch(cwd, remote, timeout);
  if (!branch || tryGit(cwd, ["symbolic-ref", "--short", "HEAD"]) === branch) return null;
  const base = tryGit(cwd, ["merge-base", "HEAD", `refs/remotes/${remote}/${branch}`]);
  if (!base) return null;
  const changed = tryGit(cwd, ["diff", "--name-only", base, "HEAD"]);
  if (!changed) return null;
  const files = changed.split("\n");
  const hasThread = files.some((f) => f.startsWith(THREADS) && !f.endsWith("/README.md"));
  const hasWork = files.some((f) => !f.startsWith(`${BATON_DIR}/`));
  return hasWork && !hasThread ? { base: branch } : null;
}

function remoteDefaultBranch(cwd, remote, timeout) {
  const local = tryGit(cwd, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]);
  if (local) return local.slice(remote.length + 1);
  const out = tryGit(cwd, ["ls-remote", "--symref", remote, "HEAD"], { timeout });
  return out?.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m)?.[1] ?? null;
}
