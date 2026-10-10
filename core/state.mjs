import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BATON_DIR } from "./config.mjs";
import { readClaims } from "./claims.mjs";

const GENERATED_LINE = /^_Generated .*_$/m;

// Gather everything state.md shows. Network and command failures throw, so
// the Action fails loudly instead of publishing a half-empty snapshot.
export async function collect({ cwd, config, gh, repo, now = new Date() }) {
  const info = await gh.repoInfo();
  const defaultBranch = config.defaultBranch || info.default_branch;
  const [open, closed] = await Promise.all([gh.openPulls(), gh.closedPulls()]);
  const landed = closed
    .filter((pr) => pr.merged_at)
    .sort((a, b) => b.merged_at.localeCompare(a.merged_at))
    .slice(0, config.recentlyLanded);

  const nextById = new Map();
  for (const label of config.nextLabels) {
    for (const issue of await gh.labeledIssues(label)) nextById.set(issue.number, issue);
  }

  return {
    repo,
    now: now.toISOString(),
    defaultBranch,
    open: open.map(pullSummary),
    landed: landed.map(pullSummary),
    next: [...nextById.values()].sort((a, b) => a.number - b.number).map((i) => ({ number: i.number, title: i.title })),
    metrics: runMetrics(cwd, config.metrics),
    links: config.links,
    threads: recentThreads(cwd, config.recentThreads),
    claims: config.claiming.enabled ? readClaims(cwd) : null,
    staleHours: config.claiming.staleHours,
  };
}

function pullSummary(pr) {
  return {
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "unknown",
    branch: pr.head?.ref ?? "",
    draft: Boolean(pr.draft),
    updated: pr.updated_at,
    merged: pr.merged_at ?? null,
  };
}

export function runMetrics(cwd, metrics) {
  return metrics.map(({ name, command }) => {
    const out = execSync(command, { cwd, encoding: "utf8", timeout: 5 * 60_000, stdio: ["ignore", "pipe", "inherit"] });
    return { name, value: out.trim().split("\n")[0] ?? "" };
  });
}

export function recentThreads(cwd, limit) {
  const dir = join(cwd, BATON_DIR, "threads");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .reverse()
    .slice(0, limit)
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const title = text.match(/^#\s+(.+)$/m)?.[1] ?? file.replace(/\.md$/, "");
      return { file, title };
    });
}

export function render(data) {
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  const lines = [
    `# Project state: ${data.repo}`,
    "",
    `_Generated ${data.now} from \`${data.defaultBranch}\` by the baton Action. Do not edit; it is regenerated on every merge and PR change._`,
    "",
  ];

  if (data.metrics.length) {
    lines.push("## Metrics", "");
    for (const m of data.metrics) lines.push(`- **${m.name}:** ${m.value}`);
    lines.push("");
  }

  lines.push("## Open PRs", "");
  if (!data.open.length) lines.push("None.");
  for (const pr of data.open) {
    lines.push(`- #${pr.number} ${pr.title}${pr.draft ? " (draft)" : ""} · \`${pr.branch}\` · @${pr.author} · updated ${day(pr.updated)}`);
  }
  lines.push("");

  if (data.claims) {
    lines.push("## Claimed issues", "");
    if (!data.claims.length) lines.push("None.");
    const nowMs = Date.parse(data.now);
    for (const c of data.claims) {
      const ageH = c.at ? (nowMs - Date.parse(c.at)) / 3_600_000 : null;
      const stale = ageH !== null && ageH > data.staleHours ? " **(stale)**" : "";
      lines.push(`- #${c.issue} · ${c.by} · since ${day(c.at)}${stale}${c.note ? ` · ${c.note}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Next up", "");
  if (!data.next.length) lines.push("Nothing labeled.");
  for (const issue of data.next) lines.push(`- #${issue.number} ${issue.title}`);
  lines.push("");

  lines.push("## Recently landed", "");
  if (!data.landed.length) lines.push("None.");
  for (const pr of data.landed) lines.push(`- #${pr.number} ${pr.title} · @${pr.author} · ${day(pr.merged)}`);
  lines.push("");

  if (data.threads.length) {
    lines.push("## Recent threads", "");
    for (const t of data.threads) lines.push(`- [${t.title}](${BATON_DIR}/threads/${t.file})`);
    lines.push("");
  }

  if (data.links.length) {
    lines.push("## Where things are tracked", "");
    for (const l of data.links) lines.push(`- [${l.label}](${l.path})`);
    lines.push("");
  }

  return lines.join("\n");
}

// Two renders differ in substance only if something besides the timestamp changed.
export function sameContent(a, b) {
  if (a == null || b == null) return false;
  return a.replace(GENERATED_LINE, "").trimEnd() === b.replace(GENERATED_LINE, "").trimEnd();
}
