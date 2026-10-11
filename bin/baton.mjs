#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { claim, readClaims, release } from "../core/claims.mjs";
import { loadConfig } from "../core/config.mjs";
import { sessionContext } from "../core/context.mjs";
import { detectRepo, tryGit } from "../core/git.mjs";
import { createGitHub } from "../core/github.mjs";
import { init } from "../core/init.mjs";
import { publish } from "../core/publish.mjs";
import { collect, render } from "../core/state.mjs";

const USAGE = `baton: shared project state for coding agents, through your repo

Usage:
  baton init [dir] [--adapter claude-code]   Install or update baton in a repo
  baton state [--publish] [--out file]       Regenerate state.md (the Action runs this)
  baton context                              Print instructions + latest state (session hooks run this)
  baton claim <issue> --by <name> [--note t] Claim an issue (needs claiming.enabled)
  baton release <issue>                      Release a claim
  baton claims                               List current claims`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    adapter: { type: "string", multiple: true },
    publish: { type: "boolean" },
    setup: { type: "boolean" },
    out: { type: "string" },
    repo: { type: "string" },
    by: { type: "string" },
    note: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const [command, arg] = positionals;
const cwd = process.cwd();

async function main() {
  switch (command) {
    case "init": {
      const root = resolve(arg ?? ".");
      const log = await init(root, { adapters: values.adapter ?? ["claude-code"] });
      for (const line of log) console.log(line);
      console.log("\nNext: fill in .baton/instructions.md, commit, and merge. Then run the \"baton state\" workflow once.");
      return;
    }
    case "state": {
      const config = loadConfig(cwd);
      const repo = values.repo ?? detectRepo(cwd);
      if (!repo) throw new Error("could not tell which GitHub repo this is; pass --repo owner/name");
      if (values.setup && config.setup) execSync(config.setup, { cwd, stdio: "inherit" });
      const data = await collect({ cwd, config, repo, gh: createGitHub({ repo }) });
      const content = render(data);
      if (values.out) writeFileSync(values.out, content);
      if (values.publish) {
        const result = publish(cwd, content, { branch: config.stateBranch });
        console.log(result.pushed ? `published ${result.sha} to ${config.stateBranch}` : "state unchanged; nothing published");
      } else if (!values.out) {
        process.stdout.write(content);
      }
      return;
    }
    case "context":
      process.stdout.write(sessionContext(cwd));
      return;
    case "claim": {
      requireClaiming();
      const issue = issueArg();
      const by = values.by ?? tryGit(cwd, ["config", "user.name"]);
      if (!by) throw new Error("pass --by <name> so others know who holds the claim");
      const result = claim(cwd, { issue, by, note: values.note });
      if (!result.ok) {
        console.error(`#${issue} is already claimed by ${result.holder.by} since ${result.holder.at}. Pick something else.`);
        process.exitCode = 1;
        return;
      }
      console.log(`claimed #${issue} as ${by}`);
      return;
    }
    case "release": {
      requireClaiming();
      const issue = issueArg();
      if (!release(cwd, { issue }).ok) {
        console.error(`#${issue} is not claimed.`);
        process.exitCode = 1;
        return;
      }
      console.log(`released #${issue}`);
      return;
    }
    case "claims":
      for (const c of readClaims(cwd)) console.log(`#${c.issue}\t${c.by}\t${c.at}${c.note ? `\t${c.note}` : ""}`);
      return;
    default:
      console.log(USAGE);
      if (command && !values.help) process.exitCode = 1;
  }
}

function requireClaiming() {
  if (!loadConfig(cwd).claiming.enabled) {
    throw new Error('claiming is off. Set "claiming": { "enabled": true } in .baton/config.json and re-run baton init.');
  }
}

function issueArg() {
  if (!/^\d+$/.test(arg ?? "")) throw new Error("expected an issue number");
  return arg;
}

main().catch((err) => {
  console.error(`baton: ${err.message}`);
  process.exitCode = 1;
});
