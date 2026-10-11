import { commitTree, EMPTY_TREE, git, tryGit } from "./git.mjs";

// A claim is a branch named <prefix><issue> pointing at an empty commit whose
// message says who holds it. Creating a ref that already exists is rejected
// by the remote, so two agents cannot both claim the same issue, and all it
// needs is ordinary git push access.

export const CLAIM_PREFIX = "baton/claim/";

export function claim(cwd, { issue, by, note = "", remote = "origin", now = new Date() }) {
  const ref = `refs/heads/${CLAIM_PREFIX}${issue}`;
  const message = `claim #${issue} by ${by}\n\nclaimed-at: ${now.toISOString()}\n${note ? `note: ${note}\n` : ""}`;
  const sha = commitTree(cwd, EMPTY_TREE, { message });
  try {
    git(cwd, ["push", "--quiet", remote, `${sha}:${ref}`]);
    return { ok: true, issue, by };
  } catch (err) {
    const holder = readClaims(cwd, { remote }).find((c) => c.issue === String(issue));
    if (holder) return { ok: false, issue, holder };
    throw err;
  }
}

export function release(cwd, { issue, remote = "origin" }) {
  git(cwd, ["push", "--quiet", remote, `:refs/heads/${CLAIM_PREFIX}${issue}`]);
}

export function readClaims(cwd, { remote = "origin" } = {}) {
  const fetched = tryGit(cwd, ["fetch", "--quiet", "--prune", remote, `+refs/heads/${CLAIM_PREFIX}*:refs/baton/claims/*`]);
  if (fetched === null) return [];
  const out = tryGit(cwd, ["for-each-ref", "--format=%(refname:strip=3)%00%(contents)%00", "refs/baton/claims/"]);
  if (!out) return [];
  const claims = [];
  const parts = out.split("\0");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const issue = parts[i].replace(/^\n/, "");
    const body = parts[i + 1];
    const by = body.match(/^claim #\S+ by (.+)$/m)?.[1] ?? "unknown";
    const at = body.match(/^claimed-at: (.+)$/m)?.[1] ?? null;
    const note = body.match(/^note: (.+)$/m)?.[1] ?? "";
    claims.push({ issue, by, at, note });
  }
  return claims.sort((a, b) => Number(a.issue) - Number(b.issue));
}
