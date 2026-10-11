# baton

Shared project state for coding agents, through your repo.

Agent projects don't share across accounts or tools: each has its own
threads, instructions and history. Baton puts the shared part in git instead,
so any agent on any account that opens the repo starts from the same picture:
what the owner wants, what's open, what just landed, and what's next.

First supported harness: **Claude Code**. The core doesn't depend on any
tool, so other harnesses can be added as adapters.

## What it installs

```
.baton/
  instructions.md     lasting rules from the owner (agents add to it, in PRs)
  threads/            one short summary per finished piece of work
  config.json         metrics, doc links, claiming flag
  lib/                vendored runtime, zero dependencies
.github/workflows/baton-state.yml
AGENTS.md             a marked baton block with the rules agents follow
```

Plus, for Claude Code: a `SessionStart` hook in `.claude/settings.json` that
prints the instructions and current state into every new session, and a
`CLAUDE.md` that points at `AGENTS.md`.

**`state.md` never lands on your default branch.** The Action regenerates it
on merges, PR changes, issue changes and every 6 hours, then publishes it as
the only file on a `baton/state` branch. Landing rules and code history are
untouched, and agents can't hand-edit it into a merge conflict. If only the
timestamp would change, nothing is pushed.

## Install

From the root of the repo you want to share:

```sh
npx github:thejackshelton/baton init
```

Then:

1. Write your project instructions in `.baton/instructions.md`.
2. Optionally add metrics and links to `.baton/config.json` (below).
3. Commit, open a PR, merge it.
4. Run the **baton state** workflow once from the Actions tab and check that a
   `baton/state` branch appears.

Re-running `init` updates the runtime, workflow and AGENTS.md block in place.
It never overwrites `instructions.md`, `config.json`, your threads, your other
hooks or settings, or a workflow file of the same name that it didn't write.
If the repo pins Node (`.nvmrc`, `.node-version`, or `package.json`), the
workflow uses that pin.

## Config

```json
{
  "stateBranch": "baton/state",
  "setup": "npm ci",
  "metrics": [{ "name": "CSS support", "command": "node scripts/support.mjs --summary" }],
  "links": [{ "label": "Milestone board", "path": "docs/goals/state.yaml" }],
  "nextLabels": ["next"],
  "recentlyLanded": 10,
  "recentThreads": 5,
  "claiming": { "enabled": false, "staleHours": 48 }
}
```

- `setup` runs in the Action before metrics.
- Each metric shows the first line of its command's stdout.
- `links` point at docs that already track the project, so state links to
  them instead of copying them.
- Open issues with any `nextLabels` label are listed under "Next up".

## Claiming (off by default)

Claiming is only worth turning on when two accounts work the same repo at the
same time. Set `claiming.enabled` to `true` and re-run `init`, which adds
the claim rule to AGENTS.md. Then:

```sh
node .baton/lib/bin/baton.mjs claim 12 --by "jack-laptop" --note "grid gaps"
node .baton/lib/bin/baton.mjs release 12
node .baton/lib/bin/baton.mjs claims
```

A claim is a `baton/claim/<issue>` branch whose tip commit names the holder.
Claiming and releasing each push one commit on top of the current tip, so if
two agents race, the second push is rejected as a non-fast-forward and only
one wins. It needs nothing beyond plain push access: no API token, and no
branch deletes or force-pushes, which some hosted agent environments block
(Claude Code cloud sessions included). State lists current claims and flags
any older than `staleHours`. If an environment can't push the branch at all,
`claim` fails with the push error instead of silently doing nothing.

## What baton doesn't do

No automation of claude.ai or any other agent UI, no shared logins, no tokens
passed between accounts, no private endpoints. It uses git and the public
GitHub REST API, and nothing else.

## Adding a harness

An adapter is `adapters/<name>/index.mjs` exporting `install(root, { config })`,
which returns a list of what it changed. Its job is to get
`node .baton/lib/bin/baton.mjs context` into the tool's session start, and to
make the tool read `AGENTS.md`. Install it with `baton init --adapter <name>`.
Core only loads an adapter by name during `init`, so adding one touches nothing in `core/`.

## Develop

```sh
npm test
```

Tests use real git against temporary bare repos and a fake GitHub API.
