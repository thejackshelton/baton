import { commitTree, EMPTY_TREE, git, tryGit } from "./git.mjs";

// A claim is a branch named <prefix><issue> whose tip commit says who holds
// it. Claiming and releasing each push a new commit on top of the current tip,
// so a second agent racing from the same tip is rejected as a non-fast-forward.
// Branches are never deleted or force-pushed, because some hosted agent
// environments only allow plain pushes.

export const CLAIM_PREFIX = "baton/claim/";

export function claim(cwd, { issue, by, note = "", remote = "origin", now = new Date() }) {
  const tip = remoteTip(cwd, issue, remote);
  if (tip?.held) return { ok: false, issue, holder: tip.claim };
  const message = `claim #${issue} by ${by}\n\nclaimed-at: ${now.toISOString()}\n${note ? `note: ${note}\n` : ""}`;
  try {
    push(cwd, issue, remote, message, tip?.sha);
    return { ok: true, issue, by };
  } catch (err) {
    const holder = remoteTip(cwd, issue, remote);
    if (holder?.held) return { ok: false, issue, holder: holder.claim };
    throw err;
  }
}

export function release(cwd, { issue, remote = "origin", now = new Date() }) {
  const tip = remoteTip(cwd, issue, remote);
  if (!tip?.held) return { ok: false, issue };
  push(cwd, issue, remote, `release #${issue}\n\nreleased-at: ${now.toISOString()}\n`, tip.sha);
  return { ok: true, issue };
}

function push(cwd, issue, remote, message, parent) {
  const sha = commitTree(cwd, EMPTY_TREE, { message, parent });
  git(cwd, ["push", "--quiet", remote, `${sha}:refs/heads/${CLAIM_PREFIX}${issue}`]);
}

function remoteTip(cwd, issue, remote) {
  const ref = `refs/heads/${CLAIM_PREFIX}${issue}`;
  if (tryGit(cwd, ["fetch", "--quiet", remote, `+${ref}:refs/baton/claims/${issue}`]) === null) return null;
  const sha = git(cwd, ["rev-parse", `refs/baton/claims/${issue}`]);
  const claim = parseClaim(issue, git(cwd, ["log", "-1", "--format=%B", sha]));
  return { sha, held: claim !== null, claim };
}

function parseClaim(issue, body) {
  const by = body.match(/^claim #\S+ by (.+)$/m)?.[1];
  if (!by) return null;
  const at = body.match(/^claimed-at: (.+)$/m)?.[1] ?? null;
  const note = body.match(/^note: (.+)$/m)?.[1] ?? "";
  return { issue: String(issue), by, at, note };
}

export function readClaims(cwd, { remote = "origin" } = {}) {
  const fetched = tryGit(cwd, ["fetch", "--quiet", "--prune", remote, `+refs/heads/${CLAIM_PREFIX}*:refs/baton/claims/*`]);
  if (fetched === null) return [];
  const out = tryGit(cwd, ["for-each-ref", "--format=%(refname:strip=3)%00%(contents)%00", "refs/baton/claims/"]);
  if (!out) return [];
  const claims = [];
  const parts = out.split("\0");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const claim = parseClaim(parts[i].replace(/^\n/, ""), parts[i + 1]);
    if (claim) claims.push(claim);
  }
  return claims.sort((a, b) => Number(a.issue) - Number(b.issue));
}
