# .baton

Managed by [baton](https://github.com/thejackshelton/baton). It lets several
coding-agent projects (on different accounts or different tools) work on this
repo from one shared view of the project. Git is the only shared layer: no
shared logins, no tokens passed between accounts.

| Path | What it is | Who writes it |
| --- | --- | --- |
| `instructions.md` | Lasting rules from the owner | Agents, in the same PR as the rule is set |
| `threads/` | Short summaries of finished work | Agents, in the PR that finishes the work |
| `config.json` | Metrics, links, claiming flag | The owner |
| `lib/` | Vendored baton runtime | `baton init` (do not edit) |
| `state.md` on the `baton/state` branch | Open PRs, recently landed, next up, metrics | The baton Action only |

Read the current state:

```sh
node .baton/lib/bin/baton.mjs context
```
