# Project instructions

- Baton's core stays tool-agnostic. Anything specific to one agent harness lives in `adapters/<name>/`.
- No dependencies. Node built-ins and git only.
- Only git and the public GitHub API: no automation of claude.ai or other agent UIs, no shared credentials.
- Every change keeps `npm test` green. Tests use real git against temporary repos.
