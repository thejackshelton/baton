import { execFileSync } from "node:child_process";

const BOT = {
  GIT_AUTHOR_NAME: "baton",
  GIT_AUTHOR_EMAIL: "baton@users.noreply.github.com",
  GIT_COMMITTER_NAME: "baton",
  GIT_COMMITTER_EMAIL: "baton@users.noreply.github.com",
};

export function git(cwd, args, { input, env, timeout } = {}) {
  return execFileSync("git", args, {
    cwd,
    input,
    timeout,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  }).trimEnd();
}

export function tryGit(cwd, args, opts) {
  try {
    return git(cwd, args, opts);
  } catch {
    return null;
  }
}

// Commit a tree with no working-tree checkout, as the baton bot unless the
// caller supplies its own identity.
export function commitTree(cwd, tree, { parent, message, env }) {
  const args = ["commit-tree", tree, "-m", message];
  if (parent) args.splice(2, 0, "-p", parent);
  return git(cwd, args, { env: { ...BOT, ...env } });
}

export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// Owner/name from GITHUB_REPOSITORY or the origin URL. Works for ssh, https,
// and proxy URLs that end in /owner/name(.git).
export function detectRepo(cwd) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = tryGit(cwd, ["remote", "get-url", "origin"]);
  if (!url) return null;
  const match = url.replace(/\.git$/, "").match(/[:/]([^/:]+)\/([^/]+)$/);
  return match ? `${match[1]}/${match[2]}` : null;
}
