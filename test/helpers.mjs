import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function sh(cwd, cmd, args) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trimEnd();
}

// A bare "remote" plus a clone of it with one commit on main.
export function repoWithRemote() {
  const dir = mkdtempSync(join(tmpdir(), "baton-test-"));
  const remote = join(dir, "remote.git");
  const work = join(dir, "work");
  sh(dir, "git", ["init", "--quiet", "--bare", "-b", "main", remote]);
  sh(dir, "git", ["clone", "--quiet", remote, work]);
  sh(work, "git", ["config", "user.name", "Tester"]);
  sh(work, "git", ["config", "user.email", "t@example.com"]);
  sh(work, "git", ["commit", "--quiet", "--allow-empty", "-m", "init"]);
  sh(work, "git", ["push", "--quiet", "origin", "main"]);
  return { dir, remote, work };
}

export function clone(remote, dir, name) {
  const path = join(dir, name);
  sh(dir, "git", ["clone", "--quiet", remote, path]);
  sh(path, "git", ["config", "user.name", name]);
  sh(path, "git", ["config", "user.email", `${name}@example.com`]);
  return path;
}

export const BIN = new URL("../bin/baton.mjs", import.meta.url).pathname;
