import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BATON_DIR, DEFAULT_CONFIG, loadConfig } from "./config.mjs";
import { upsertBlock } from "./markers.mjs";

export const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(PKG_ROOT, "templates");
const WORKFLOW = ".github/workflows/baton-state.yml";
const MANAGED = "# Managed by baton.";

// Install or update baton in `root`. Safe to re-run: owner-edited files
// (instructions, config, threads) are created only if missing, and managed
// files and marker blocks are refreshed in place.
export async function init(root, { adapters = ["claude-code"] } = {}) {
  const log = [];
  const write = (rel, content, { onlyIfMissing = false } = {}) => {
    const path = join(root, rel);
    if (onlyIfMissing && existsSync(path)) return;
    const before = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (before === content) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    log.push(`${before === null ? "created" : "updated"} ${rel}`);
  };

  write(`${BATON_DIR}/README.md`, template("baton/README.md"));
  write(`${BATON_DIR}/instructions.md`, template("baton/instructions.md"), { onlyIfMissing: true });
  write(`${BATON_DIR}/threads/README.md`, template("baton/threads/README.md"), { onlyIfMissing: true });
  write(`${BATON_DIR}/config.json`, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", { onlyIfMissing: true });

  vendorRuntime(root);
  log.push(`refreshed ${BATON_DIR}/lib`);

  const workflowPath = join(root, WORKFLOW);
  if (existsSync(workflowPath) && !readFileSync(workflowPath, "utf8").startsWith(MANAGED)) {
    log.push(`skipped ${WORKFLOW} (exists and is not managed by baton)`);
  } else {
    write(WORKFLOW, template("github/baton-state.yml").replace("__NODE__", nodeSetting(root)));
  }

  const config = loadConfig(root);
  const agentsPath = join(root, "AGENTS.md");
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "# Agent guide\n";
  write("AGENTS.md", upsertBlock(agents, "baton", agentsBlock(config)));

  for (const name of adapters) {
    const adapter = await import(`../adapters/${name}/index.mjs`).catch(() => {
      throw new Error(`unknown adapter "${name}"`);
    });
    log.push(...adapter.install(root, { config }));
  }
  return log;
}

function template(rel) {
  return readFileSync(join(TEMPLATES, rel), "utf8");
}

// Copy the runtime into .baton/lib so the Action and hooks run from the repo
// itself, with no install step and no dependency on this package's registry.
function vendorRuntime(root) {
  const lib = join(root, BATON_DIR, "lib");
  // Running the vendored copy's own init: it is already in place.
  if (existsSync(lib) && realpathSync(lib) === realpathSync(PKG_ROOT)) return;
  rmSync(lib, { recursive: true, force: true });
  for (const dir of ["bin", "core", "adapters", "templates"]) {
    cpSync(join(PKG_ROOT, dir), join(lib, dir), { recursive: true });
  }
  cpSync(join(PKG_ROOT, "package.json"), join(lib, "package.json"));
}

// Reuse the repo's own Node pin so setup scripts that check it still pass.
export function nodeSetting(root) {
  for (const file of [".nvmrc", ".node-version"]) {
    if (existsSync(join(root, file))) return `node-version-file: ${file}`;
  }
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.volta?.node || pkg.engines?.node) return "node-version-file: package.json";
    } catch {}
  }
  return "node-version: 24";
}

export function agentsBlock(config) {
  const cli = "node .baton/lib/bin/baton.mjs";
  const lines = [
    "## Baton: shared project state",
    "",
    "Several agent projects, possibly on different accounts or tools, work on this repo. Baton keeps them in sync through git.",
    "",
    `- At the start of a session, read \`.baton/instructions.md\` and the latest state (\`${cli} context\`). Some tools print this for you at startup.`,
    `- Never edit \`state.md\` or the \`${config.stateBranch}\` branch. The baton Action regenerates it on every merge and PR change.`,
    "- When the owner sets a lasting rule, add it to `.baton/instructions.md` in the same PR.",
    "- Every branch with committed work carries a short summary as `.baton/threads/YYYY-MM-DD-<slug>.md` (see `.baton/threads/README.md`): what changed, what's left, what the next agent should know. Write it once there's work to describe and keep it current, so someone on another account can pick up mid-task.",
  ];
  if (config.claiming.enabled) {
    lines.push(
      `- Before starting on an issue, claim it: \`${cli} claim <number> --by "<your name or account>"\`. If it is already claimed, pick something else. Release it when the PR lands or you stop: \`${cli} release <number>\`.`,
    );
  }
  return lines.join("\n");
}
