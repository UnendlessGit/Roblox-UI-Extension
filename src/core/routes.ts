export type PageFamily =
  | "home"
  | "discover"
  | "search"
  | "profile"
  | "experience"
  | "marketplace"
  | "item"
  | "avatar"
  | "collection"
  | "people"
  | "community"
  | "messages"
  | "finance"
  | "settings"
  | "auth"
  | "creator"
  | "docs"
  | "forum"
  | "help"
  | "generic";
export interface Route {
  family: PageFamily;
  site: "player" | "creator" | "forum" | "help" | "other";
  title: string;
  playerNavigation: boolean;
}
export function classifyRoute(url: URL): Route {
  const host = url.hostname.toLowerCase(),
    path = url.pathname.toLowerCase().replace(/\/$/, "") || "/";
  const route = (
    family: PageFamily,
    title: string,
    site: Route["site"] = "player",
  ): Route => ({
    family,
    title,
    site,
    playerNavigation:
      site === "player" && family !== "auth" && family !== "generic",
  });
  if (host === "devforum.roblox.com")
    return route("forum", "Developer Forum", "forum");
  if (host.endsWith(".help.roblox.com") || host === "help.roblox.com")
    return route("help", "Help Center", "help");
  if (host === "create.roblox.com" || host === "creator.roblox.com")
    return path.startsWith("/docs")
      ? route("docs", "Documentation", "creator")
      : route(
          "creator",
          path.includes("/store") ? "Creator Store" : "Creator Hub",
          "creator",
        );
  if (host !== "www.roblox.com" && host !== "roblox.com")
    return route("generic", "Roblox", "other");
  if (/^\/(home)?$/.test(path))
    return route(path === "/" ? "generic" : "home", "Home");
  if (/^\/(charts|discover)(\/|$)/.test(path) || path === "/games")
    return route("discover", "Discover");
  if (/^\/games\/\d+/.test(path)) return route("experience", "Experience");
  if (/^\/users\/(\d+\/)?profile/.test(path))
    return route("profile", "Profile");
  if (/^\/(catalog|bundles|game-pass|badges)\/\d+/.test(path))
    return route("item", "Details");
  if (/^\/(catalog|marketplace)$/.test(path))
    return route("marketplace", "Marketplace");
  if (/^\/(my\/avatar|avatar|my\/character)/.test(path))
    return route("avatar", "Avatar");
  if (/^\/(my\/account|account\/settings|settings)/.test(path))
    return route("settings", "Settings");
  if (/^\/(users\/\d+\/friends|users\/friends|my\/friends|friends)/.test(path))
    return route("people", "Friends");
  if (
    /^\/(users\/(\d+\/)?(inventory|favorites)|my\/(inventory|favorites)|inventory)/.test(
      path,
    )
  )
    return route(
      "collection",
      path.includes("favorites") ? "Favorites" : "Inventory",
    );
  if (/^\/(communities|groups|my\/groups|search\/communities)/.test(path))
    return route("community", "Communities");
  if (/^\/(my\/messages|messages|chat|notifications)/.test(path))
    return route("messages", "Messages");
  if (
    /^\/(trades|trade|transactions|my\/money|upgrades|robux|premium|subscriptions|redeem|giftcards|payments|checkout|plus|sponsorships)/.test(
      path,
    )
  )
    return route(
      "finance",
      /trade/.test(path)
        ? "Trades"
        : /transaction|money/.test(path)
          ? "Transactions"
          : "Robux",
    );
  if (
    /^\/(login|newlogin|signup|account\/signup|login\/forgot|password|recover|authentication)/.test(
      path,
    )
  )
    return route("auth", "Welcome");
  if (/^\/(help-safety|support)(\/|$)/.test(path))
    return route("help", "Help and safety");
  if (/^\/search/.test(path)) return route("search", "Search");
  return route("generic", "Roblox");
}
