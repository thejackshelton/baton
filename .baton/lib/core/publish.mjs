import { commitTree, git, tryGit } from "./git.mjs";
import { sameContent } from "./state.mjs";

export const STATE_FILE = "state.md";

export function readPublished(cwd, { branch, remote = "origin", timeout } = {}) {
  if (tryGit(cwd, ["fetch", "--quiet", remote, `+refs/heads/${branch}:refs/baton/state`], { timeout }) === null) return null;
  return tryGit(cwd, ["show", `refs/baton/state:${STATE_FILE}`]);
}

// Write state.md as the only file on the state branch. Skips the commit when
// only the timestamp would change, and retries if another run pushed first.
export function publish(cwd, content, { branch, remote = "origin", attempts = 3 }) {
  for (let i = 1; i <= attempts; i++) {
    const current = readPublished(cwd, { branch, remote });
    if (sameContent(current, content)) return { pushed: false };

    const parent = current === null ? null : git(cwd, ["rev-parse", "refs/baton/state"]);
    const blob = git(cwd, ["hash-object", "-w", "--stdin"], { input: content });
    const tree = git(cwd, ["mktree"], { input: `100644 blob ${blob}\t${STATE_FILE}\n` });
    const sha = commitTree(cwd, tree, { parent, message: "baton: update state" });
    try {
      git(cwd, ["push", "--quiet", remote, `${sha}:refs/heads/${branch}`]);
      return { pushed: true, sha };
    } catch (err) {
      if (i === attempts) throw err;
    }
  }
}
