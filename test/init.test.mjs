import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { HOOK_COMMAND } from "../adapters/claude-code/index.mjs";
import { publish } from "../core/publish.mjs";
import { BIN, repoWithRemote, sh } from "./helpers.mjs";

const read = (root, rel) => readFileSync(join(root, rel), "utf8");

test("init installs core + Claude Code adapter and preserves what the repo already has", () => {
  const { work } = repoWithRemote();
  writeFileSync(join(work, "AGENTS.md"), "# Rules\n\nLand via the driver only.\n");
  writeFileSync(join(work, "CLAUDE.md"), "Project notes.\n");
  writeFileSync(join(work, ".nvmrc"), "24.15.0\n");
  mkdirSync(join(work, ".claude"));
  writeFileSync(join(work, ".claude/settings.json"), JSON.stringify({
    permissions: { allow: ["Bash(pnpm test)"] },
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "scripts/cloud-setup.sh" }] }] },
  }));

  sh(work, "node", [BIN, "init"]);

  for (const f of [".baton/README.md", ".baton/instructions.md", ".baton/config.json", ".baton/threads/README.md", ".baton/lib/bin/baton.mjs", ".baton/lib/core/state.mjs"]) {
    assert.ok(existsSync(join(work, f)), f);
  }
  const agents = read(work, "AGENTS.md");
  assert.match(agents, /^# Rules\n\nLand via the driver only\.\n\n<!-- baton:start -->/);
  assert.doesNotMatch(agents, /claim/, "no claim rule while claiming is off");

  assert.equal(read(work, "CLAUDE.md"), "Project notes.\n\n@AGENTS.md\n");

  const settings = JSON.parse(read(work, ".claude/settings.json"));
  assert.deepEqual(settings.permissions, { allow: ["Bash(pnpm test)"] });
  assert.deepEqual(settings.hooks.SessionStart.map((g) => g.hooks[0].command), ["scripts/cloud-setup.sh", HOOK_COMMAND]);

  const workflow = read(work, ".github/workflows/baton-state.yml");
  assert.match(workflow, /node-version-file: \.nvmrc/);
  assert.match(workflow, /baton\.mjs state --publish --setup/);
});

test("re-running init is idempotent and keeps owner edits", () => {
  const { work } = repoWithRemote();
  sh(work, "node", [BIN, "init"]);
  writeFileSync(join(work, ".baton/instructions.md"), "# Mine\n");
  const config = JSON.parse(read(work, ".baton/config.json"));
  config.claiming.enabled = true;
  writeFileSync(join(work, ".baton/config.json"), JSON.stringify(config));
  const before = read(work, ".claude/settings.json");

  sh(work, "node", [BIN, "init"]);
  // The vendored copy can update its own repo too.
  sh(work, "node", [".baton/lib/bin/baton.mjs", "init"]);

  assert.equal(read(work, ".baton/instructions.md"), "# Mine\n");
  assert.equal(read(work, ".claude/settings.json"), before);
  assert.ok(existsSync(join(work, ".baton/lib/core/state.mjs")));
  const agents = read(work, "AGENTS.md");
  assert.equal(agents.match(/baton:start/g).length, 1);
  assert.match(agents, /baton\.mjs claim <number>/, "claim rule appears once claiming is on");
  assert.equal(read(work, "CLAUDE.md"), "@AGENTS.md\n");
});

test("init leaves a hand-written workflow of the same name alone", () => {
  const { work } = repoWithRemote();
  mkdirSync(join(work, ".github/workflows"), { recursive: true });
  writeFileSync(join(work, ".github/workflows/baton-state.yml"), "name: mine\n");
  const out = sh(work, "node", [BIN, "init"]);
  assert.match(out, /skipped .github\/workflows\/baton-state.yml/);
  assert.equal(read(work, ".github/workflows/baton-state.yml"), "name: mine\n");
});

test("the session hook prints instructions and published state, and never fails", () => {
  const { work } = repoWithRemote();
  sh(work, "node", [BIN, "init"]);
  writeFileSync(join(work, ".baton/instructions.md"), "# Rules\n\nAlways run the tree check.\n");

  const settings = JSON.parse(read(work, ".claude/settings.json"));
  const command = settings.hooks.SessionStart.at(-1).hooks[0].command;
  const runHook = (env = {}) => execFileSync("sh", ["-c", command], {
    cwd: work, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: work, ...env },
  });

  let out = runHook();
  assert.match(out, /Always run the tree check\./);
  assert.match(out, /No state published yet on `baton\/state`/);

  publish(work, "# Project state: o/r\n\n- #7 Add grid\n", { branch: "baton/state" });
  out = runHook();
  assert.match(out, /Always run the tree check\.[\s\S]*# Project state: o\/r\n\n- #7 Add grid/);

  // Broken remote and broken config: still exits 0.
  sh(work, "git", ["remote", "set-url", "origin", "/nonexistent"]);
  writeFileSync(join(work, ".baton/config.json"), "{ nope");
  assert.match(runHook(), /config\.json could not be read/);
});
