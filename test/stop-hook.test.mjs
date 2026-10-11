import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BIN, repoWithRemote, sh } from "./helpers.mjs";

function setup() {
  const { work } = repoWithRemote();
  sh(work, "node", [BIN, "init"]);
  sh(work, "git", ["add", "-A"]);
  sh(work, "git", ["commit", "--quiet", "-m", "install baton"]);
  sh(work, "git", ["push", "--quiet", "origin", "main"]);
  sh(work, "git", ["checkout", "--quiet", "-b", "feat/grid"]);
  const settings = JSON.parse(readFileSync(join(work, ".claude/settings.json"), "utf8"));
  const command = settings.hooks.Stop.at(-1).hooks[0].command;
  const stop = (input = {}) => execFileSync("sh", ["-c", command], {
    cwd: work, encoding: "utf8", input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: work },
  });
  const commit = (file, text) => {
    mkdirSync(join(work, file, ".."), { recursive: true });
    writeFileSync(join(work, file), text);
    sh(work, "git", ["add", "-A"]);
    sh(work, "git", ["commit", "--quiet", "-m", `add ${file}`]);
  };
  return { work, stop, commit };
}

test("Stop hook asks for a thread summary only once a branch has committed work", () => {
  const { stop, commit } = setup();
  assert.equal(stop(), "", "nothing committed yet");

  commit("src/grid.css", "a{}");
  const out = JSON.parse(stop());
  assert.equal(out.decision, "block");
  assert.match(out.reason, /\.baton\/threads\/YYYY-MM-DD-<slug>\.md/);

  assert.equal(stop({ stop_hook_active: true }), "", "never blocks twice in a row");

  commit(".baton/threads/2026-10-11-grid.md", "# Grid\n");
  assert.equal(stop(), "");
  commit("src/flex.css", "b{}");
  assert.equal(stop(), "", "an existing summary on the branch is enough");
});

test("Stop hook finds the default branch without origin/HEAD, and can be turned off", () => {
  const { work, stop, commit } = setup();
  sh(work, "git", ["remote", "set-head", "origin", "--delete"]);
  commit("src/grid.css", "a{}");
  assert.equal(JSON.parse(stop()).decision, "block");

  const config = JSON.parse(readFileSync(join(work, ".baton/config.json"), "utf8"));
  config.threadReminder = false;
  writeFileSync(join(work, ".baton/config.json"), JSON.stringify(config));
  assert.equal(stop(), "");
});

test("Stop hook stays quiet on the default branch and when git can't tell", () => {
  const { work, stop, commit } = setup();
  sh(work, "git", ["checkout", "--quiet", "main"]);
  commit("src/x.css", "a{}");
  assert.equal(stop(), "");
  sh(work, "git", ["remote", "set-head", "origin", "--delete"]);
  sh(work, "git", ["remote", "set-url", "origin", "/nonexistent"]);
  sh(work, "git", ["checkout", "--quiet", "feat/grid"]);
  commit("src/y.css", "a{}");
  assert.equal(stop(), "");
});
