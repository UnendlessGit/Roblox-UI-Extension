import type { ResourceBridge } from "../core/bridge";
import type { Settings } from "../core/settings";
import { element } from "../core/dom";
/** Fill only statistics that Roblox replaced with friend portraits. Public IDs, no friend API. */
export function createFriendStats(bridge: ResourceBridge) {
  type Stats = { players?: number; up?: number; down?: number };
  const cache = new Map<string, Stats>();
  const requested = new Set<string>();
  const nodes = new Set<HTMLElement>();
  let active = false,
    generation = 0;
  const format = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  function paint() {
    if (!active) return;
    for (const native of document.querySelectorAll<HTMLElement>(
      '.game-card-friend-info,[data-testid="game-tile-stats-friends"]',
    )) {
      const card = native.closest<HTMLElement>(
        "[data-rc-card],.game-card-container",
      );
      const link = card?.querySelector<HTMLAnchorElement>("a.game-card-link");
      if (!link) continue;
      const id = new URL(link.href).searchParams.get("universeId") || link.id;
      if (!/^[1-9]\d{0,19}$/.test(id)) continue;
      if (
        card?.querySelector(
          ".game-card-info:not(.game-card-friend-info):not(.rc-public-stats)",
        )
      )
        continue;
      const stats = cache.get(id);
      let row = link.querySelector<HTMLElement>(".rc-public-stats");
      if (!row) {
        row = element("div", "rc-public-stats game-card-info");
        row.dataset.rcOwned = "";
        row.dataset.universe = id;
        row.setAttribute("aria-live", "off");
        link.append(row);
        nodes.add(row);
      }
      const votes =
        stats?.up !== undefined && stats.down !== undefined
          ? stats.up + stats.down
          : 0;
      const rating = votes ? `${Math.round((stats!.up! / votes) * 100)}%` : "—";
      const players =
        stats?.players !== undefined ? format.format(stats.players) : "—";
      const text = `${rating} · ${players}`;
      if (row.dataset.value === text) continue;
      row.dataset.value = text;
      const likes = element("span", "rc-rating");
      likes.append(
        element("span", "info-label icon-votes-gray"),
        element("span", "info-label vote-percentage-label", rating),
      );
      likes.setAttribute(
        "aria-label",
        rating === "—" ? "Rating unavailable" : `${rating} positive ratings`,
      );
      const playing = element("span", "rc-players");
      playing.append(
        element("span", "info-label icon-playing-counts-gray"),
        element("span", "info-label playing-counts-label", players),
      );
      playing.setAttribute(
        "aria-label",
        stats?.players === undefined
          ? "Player count unavailable"
          : `${stats.players.toLocaleString()} playing`,
      );
      row.replaceChildren(likes, playing);
    }
    for (const n of nodes) if (!n.isConnected) nodes.delete(n);
  }
  function update(settings: Settings) {
    active = !settings.showFriendActivity;
    if (!active) {
      for (const node of nodes) node.remove();
      nodes.clear();
      return;
    }
    paint();
    const ids = Array.from(nodes)
      .map((n) => n.dataset.universe!)
      .filter((id) => !requested.has(id));
    const unique = [...new Set(ids)];
    const version = generation;
    for (let i = 0; i < unique.length; i += 50) {
      const batch = unique.slice(i, i + 50);
      batch.forEach((id) => requested.add(id));
      const query = batch.join(",");
      void Promise.allSettled([
        bridge.get<{ data?: { id: number; playing: number }[] }>(
          `https://games.roblox.com/v1/games?universeIds=${query}`,
        ),
        bridge.get<{
          data?: { id: number; upVotes: number; downVotes: number }[];
        }>(`https://games.roblox.com/v1/games/votes?universeIds=${query}`),
      ]).then(([games, votes]) => {
        if (version !== generation) return;
        if (games.status === "fulfilled")
          for (const game of games.value.data || [])
            if (
              batch.includes(String(game.id)) &&
              Number.isFinite(game.playing) &&
              game.playing >= 0
            )
              cache.set(String(game.id), {
                ...cache.get(String(game.id)),
                players: game.playing,
              });
        if (votes.status === "fulfilled")
          for (const game of votes.value.data || [])
            if (
              batch.includes(String(game.id)) &&
              Number.isFinite(game.upVotes) &&
              Number.isFinite(game.downVotes) &&
              game.upVotes >= 0 &&
              game.downVotes >= 0
            )
              cache.set(String(game.id), {
                ...cache.get(String(game.id)),
                up: game.upVotes,
                down: game.downVotes,
              });
        paint();
      });
    }
  }
  return {
    update,
    destroy() {
      active = false;
      generation++;
      for (const node of nodes) node.remove();
      nodes.clear();
      cache.clear();
      requested.clear();
    },
  };
}
