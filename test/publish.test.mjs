import assert from "node:assert/strict";
import { test } from "node:test";
import { publish, readPublished } from "../core/publish.mjs";
import { clone, repoWithRemote, sh } from "./helpers.mjs";

const state = (stamp, body) => `# s\n\n_Generated ${stamp} from \`main\` by the baton Action._\n\n${body}\n`;

test("publishes state.md as the only file on the state branch, leaving main alone", () => {
  const { work, remote } = repoWithRemote();
  const mainBefore = sh(work, "git", ["ls-remote", remote, "refs/heads/main"]);

  const first = publish(work, state("t1", "- a"), { branch: "baton/state" });
  assert.equal(first.pushed, true);
  assert.equal(sh(work, "git", ["ls-tree", "--name-only", first.sha]), "state.md");
  assert.equal(readPublished(work, { branch: "baton/state" }), state("t1", "- a").trimEnd());
  assert.equal(sh(work, "git", ["ls-remote", remote, "refs/heads/main"]), mainBefore);
});

test("skips the push when only the timestamp changed, and builds history otherwise", () => {
  const { work } = repoWithRemote();
  const first = publish(work, state("t1", "- a"), { branch: "baton/state" });
  assert.equal(publish(work, state("t2", "- a"), { branch: "baton/state" }).pushed, false);
  const second = publish(work, state("t3", "- b"), { branch: "baton/state" });
  assert.equal(second.pushed, true);
  assert.equal(sh(work, "git", ["rev-parse", `${second.sha}^`]), first.sha);
});

test("a second clone builds on the state branch another runner published", () => {
  const { dir, remote, work } = repoWithRemote();
  const other = clone(remote, dir, "other");
  publish(work, state("t1", "- a"), { branch: "baton/state" });
  const res = publish(other, state("t2", "- b"), { branch: "baton/state" });
  assert.equal(res.pushed, true);
  assert.equal(sh(other, "git", ["rev-list", "--count", res.sha]), "2");
  assert.match(readPublished(work, { branch: "baton/state" }), /- b/);
});
