# Agent guide

<!-- baton:start -->
## Baton: shared project state

Several agent projects, possibly on different accounts or tools, work on this repo. Baton keeps them in sync through git.

- At the start of a session, read `.baton/instructions.md` and the latest state (`node .baton/lib/bin/baton.mjs context`). Some tools print this for you at startup.
- Never edit `state.md` or the `baton/state` branch. The baton Action regenerates it on every merge and PR change.
- When the owner sets a lasting rule, add it to `.baton/instructions.md` in the same PR.
- When you finish a piece of work, add a short summary as `.baton/threads/YYYY-MM-DD-<slug>.md` in the PR that finishes it (see `.baton/threads/README.md`).
<!-- baton:end -->
