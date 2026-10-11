import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { claim, readClaims, release } from "../core/claims.mjs";
import { DEFAULT_CONFIG, mergeConfig } from "../core/config.mjs";
import { EMPTY_TREE } from "../core/git.mjs";
import { render } from "../core/state.mjs";
import { clone, repoWithRemote, sh } from "./helpers.mjs";

test("only one agent can hold a claim, and release frees it", () => {
  const { dir, remote, work } = repoWithRemote();
  const other = clone(remote, dir, "other");

  assert.deepEqual(claim(work, { issue: 12, by: "account-a", note: "grid gaps", now: new Date("2026-10-10T00:00:00Z") }), { ok: true, issue: 12, by: "account-a" });
  const lost = claim(other, { issue: 12, by: "account-b" });
  assert.equal(lost.ok, false);
  assert.equal(lost.holder.by, "account-a");

  assert.deepEqual(readClaims(other), [{ issue: "12", by: "account-a", at: "2026-10-10T00:00:00.000Z", note: "grid gaps" }]);

  assert.equal(release(work, { issue: 12 }).ok, true);
  assert.equal(release(work, { issue: 12 }).ok, false, "already released");
  assert.deepEqual(readClaims(other), []);
  assert.equal(claim(other, { issue: 12, by: "account-b" }).ok, true);
  assert.equal(readClaims(work)[0].by, "account-b");
});

test("claims never delete or force-push the branch", () => {
  const { remote, work } = repoWithRemote();
  sh(remote, "git", ["config", "receive.denyDeletes", "true"]);
  sh(remote, "git", ["config", "receive.denyNonFastForwards", "true"]);
  claim(work, { issue: 3, by: "a" });
  release(work, { issue: 3 });
  claim(work, { issue: 3, by: "b" });
  assert.equal(readClaims(work)[0].by, "b");
});

test("of two agents claiming from the same tip, only one wins", () => {
  const { remote, work } = repoWithRemote();
  claim(work, { issue: 5, by: "a" });
  release(work, { issue: 5 });
  // "a" has read the released tip and is mid-push when "b"'s claim, built on
  // that same tip, lands on the remote first.
  const hook = join(work, ".git", "hooks", "pre-push");
  writeFileSync(hook, `#!/bin/sh
export GIT_DIR="${remote}" GIT_AUTHOR_NAME=b GIT_AUTHOR_EMAIL=b@x GIT_COMMITTER_NAME=b GIT_COMMITTER_EMAIL=b@x
ref=refs/heads/baton/claim/5
git update-ref $ref $(git commit-tree ${EMPTY_TREE} -p $(git rev-parse $ref) -m "claim #5 by b")
rm "$0"
`);
  chmodSync(hook, 0o755);

  const lost = claim(work, { issue: 5, by: "a" });
  assert.equal(lost.ok, false);
  assert.equal(lost.holder.by, "b");
  assert.deepEqual(readClaims(work).map((c) => c.by), ["b"]);
});
