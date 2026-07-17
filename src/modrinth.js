const MODRINTH_API = "https://api.modrinth.com/v2";

const Modrinth = {
  async search({
    query = "",
    loader = "fabric",
    version = "1.21.1",
    index = "downloads",
    offset = 0,
    limit = 20,
    projectType = "mod",
  } = {}) {
    const facets = [[`project_type:${projectType}`], [`versions:${version}`]];
    if (loader && loader !== "vanilla") {
      facets.splice(1, 0, [`categories:${loader}`]);
    }
    const params = new URLSearchParams({
      facets: JSON.stringify(facets),
      index,
      offset: String(offset),
      limit: String(limit),
    });

    if (query.trim()) params.set("query", query.trim());

    const res = await fetch(`${MODRINTH_API}/search?${params}`);
    if (!res.ok) throw new Error(`Modrinth API error (${res.status})`);
    return res.json();
  },

  async getProject(slugOrId) {
    const res = await fetch(`${MODRINTH_API}/project/${slugOrId}`);
    if (!res.ok) throw new Error(`Project not found (${res.status})`);
    return res.json();
  },

  async getCompatibleVersion(projectId, loader, gameVersion) {
    const res = await fetch(`${MODRINTH_API}/project/${projectId}/version`);
    if (!res.ok) throw new Error(`Versions unavailable (${res.status})`);
    const versions = await res.json();

    const loaderKey = String(loader || "fabric").toLowerCase();
    return (
      versions.find(
        (v) =>
          (loaderKey === "vanilla" || v.loaders?.includes(loaderKey)) &&
          v.game_versions?.includes(gameVersion)
      ) ?? null
    );
  },

  formatDownloads(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  },

  formatTagList(items, max = 8) {
    if (!items?.length) return { shown: [], remaining: 0 };
    const list = [...items];
    return {
      shown: list.slice(0, max),
      remaining: Math.max(0, list.length - max),
    };
  },

  projectUrl(slug, type = "mod") {
    const kind = type === "modpack" ? "modpack" : "mod";
    return `https://modrinth.com/${kind}/${slug}`;
  },
};

if (typeof module !== "undefined") module.exports = Modrinth;
