// Minimal GitHub REST client. Uses GITHUB_TOKEN or GH_TOKEN when present;
// public repos also work without one, within the anonymous rate limit.

export function createGitHub({ repo, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN, fetchImpl = fetch, apiUrl = process.env.GITHUB_API_URL || "https://api.github.com" }) {
  async function request(path) {
    const headers = { accept: "application/vnd.github+json", "user-agent": "baton" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${apiUrl}${path}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status} for ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  const base = `/repos/${repo}`;
  return {
    repoInfo: () => request(base),
    openPulls: () => request(`${base}/pulls?state=open&sort=updated&direction=desc&per_page=50`),
    closedPulls: () => request(`${base}/pulls?state=closed&sort=updated&direction=desc&per_page=50`),
    labeledIssues: async (label) => {
      const items = await request(`${base}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50`);
      return items.filter((item) => !item.pull_request);
    },
  };
}
