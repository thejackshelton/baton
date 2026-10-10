import assert from "node:assert/strict";
import { test } from "node:test";
import { claim, readClaims, release } from "../core/claims.mjs";
import { DEFAULT_CONFIG, mergeConfig } from "../core/config.mjs";
import { render } from "../core/state.mjs";
import { clone, repoWithRemote } from "./helpers.mjs";

test("only one agent can hold a claim, and release frees it", () => {
  const { dir, remote, work } = repoWithRemote();
  const other = clone(remote, dir, "other");

  assert.deepEqual(claim(work, { issue: 12, by: "account-a", note: "grid gaps", now: new Date("2026-10-10T00:00:00Z") }), { ok: true, issue: 12, by: "account-a" });
  const lost = claim(other, { issue: 12, by: "account-b" });
  assert.equal(lost.ok, false);
  assert.equal(lost.holder.by, "account-a");

  assert.deepEqual(readClaims(other), [{ issue: "12", by: "account-a", at: "2026-10-10T00:00:00.000Z", note: "grid gaps" }]);

  release(work, { issue: 12 });
  assert.deepEqual(readClaims(other), []);
  assert.equal(claim(other, { issue: 12, by: "account-b" }).ok, true);
});

test("state shows claims, flagging stale ones", () => {
  const config = mergeConfig(DEFAULT_CONFIG, { claiming: { enabled: true } });
  const md = render({
    repo: "o/r", now: "2026-10-10T00:00:00Z", defaultBranch: "main", open: [], landed: [], next: [],
    metrics: [], links: [], threads: [], staleHours: config.claiming.staleHours,
    claims: [
      { issue: "3", by: "a", at: "2026-10-09T12:00:00Z", note: "" },
      { issue: "4", by: "b", at: "2026-10-01T00:00:00Z", note: "flex" },
    ],
  });
  assert.match(md, /- #3 · a · since 2026-10-09\n/);
  assert.match(md, /- #4 · b · since 2026-10-01 \*\*\(stale\)\*\* · flex/);
});
