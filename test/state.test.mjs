import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_CONFIG, mergeConfig } from "../core/config.mjs";
import { createGitHub } from "../core/github.mjs";
import { collect, render, sameContent } from "../core/state.mjs";
import { repoWithRemote } from "./helpers.mjs";

const pr = (number, title, extra = {}) => ({
  number, title, user: { login: "jack" }, head: { ref: `feat/${number}` }, draft: false,
  updated_at: "2026-10-09T10:00:00Z", merged_at: null, ...extra,
});

function fakeFetch(routes) {
  return async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) return { ok: false, status: 404, text: async () => path };
    return { ok: true, json: async () => routes[key] };
  };
}

test("collect + render builds state from GitHub, metrics, threads and links", async () => {
  const { work } = repoWithRemote();
  mkdirSync(join(work, ".baton/threads"), { recursive: true });
  writeFileSync(join(work, ".baton/threads/2026-10-01-grid.md"), "# Grid gaps closed\n");
  writeFileSync(join(work, ".baton/threads/2026-10-05-flex.md"), "# Flex wrap support\n");
  writeFileSync(join(work, ".baton/threads/README.md"), "# Threads\n");

  const config = mergeConfig(DEFAULT_CONFIG, {
    metrics: [{ name: "CSS support", command: "echo 61.4%; echo ignored" }],
    links: [{ label: "Goal", path: "docs/goal.md" }],
  });
  const gh = createGitHub({
    repo: "o/r",
    token: "t",
    fetchImpl: fakeFetch({
      "/repos/o/r/pulls?state=open": [pr(7, "Add grid", { draft: true }), pr(8, "Fix flex")],
      "/repos/o/r/pulls?state=closed": [
        pr(5, "Old merge", { merged_at: "2026-10-01T00:00:00Z" }),
        pr(6, "Closed unmerged"),
        pr(4, "Newer merge", { merged_at: "2026-10-08T00:00:00Z" }),
      ],
      "/repos/o/r/issues": [{ number: 12, title: "Support :has()" }, { number: 13, title: "a PR", pull_request: {} }],
      "/repos/o/r": { default_branch: "main" },
    }),
  });

  const data = await collect({ cwd: work, config, gh, repo: "o/r", now: new Date("2026-10-10T00:00:00Z") });
  const md = render(data);

  assert.match(md, /^# Project state: o\/r/);
  assert.match(md, /- \*\*CSS support:\*\* 61\.4%/);
  assert.match(md, /- #7 Add grid \(draft\) · `feat\/7` · @jack/);
  assert.match(md, /- #8 Fix flex/);
  assert.match(md, /## Next up\n\n- #12 Support :has\(\)\n\n/);
  assert.ok(md.indexOf("#4 Newer merge") < md.indexOf("#5 Old merge"), "landed sorted newest first");
  assert.doesNotMatch(md, /Closed unmerged/);
  assert.ok(md.indexOf("Flex wrap support") < md.indexOf("Grid gaps closed"), "threads newest first");
  assert.doesNotMatch(md, /\[Threads\]/);
  assert.match(md, /- \[Goal\]\(docs\/goal\.md\)/);
  assert.doesNotMatch(md, /Claimed issues/, "claims hidden while claiming is off");
});

test("collect fails loudly when GitHub errors", async () => {
  const { work } = repoWithRemote();
  const gh = createGitHub({ repo: "o/r", fetchImpl: fakeFetch({}) });
  await assert.rejects(collect({ cwd: work, config: DEFAULT_CONFIG, gh, repo: "o/r" }), /GitHub 404/);
});

test("sameContent ignores only the generated timestamp", () => {
  const a = "# x\n\n_Generated 2026-10-09T00:00:00Z from `main` by the baton Action._\n\n- a\n";
  const b = a.replace("2026-10-09", "2026-10-10");
  assert.ok(sameContent(a, b));
  assert.ok(!sameContent(a, b + "- b\n"));
  assert.ok(!sameContent(null, b));
});
