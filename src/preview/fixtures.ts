import { element, link } from "../core/dom";
import artwork from "./artwork.json";
import sceneArtwork from "./assets/scene.svg?url";
import itemArtwork from "./assets/item.svg?url";
import demoAvatar from "./assets/avatar.svg?url";
export type PreviewPage =
  | "home"
  | "experience"
  | "marketplace"
  | "settings"
  | "profile"
  | "community"
  | "people"
  | "finance"
  | "docs"
  | "forum"
  | "help"
  | "generic";
export const previewUrls: Record<PreviewPage, string> = {
  home: "https://www.roblox.com/home",
  experience: "https://www.roblox.com/games/1/Cinema-preview",
  marketplace: "https://www.roblox.com/catalog",
  settings: "https://www.roblox.com/my/account#!/security",
  profile: "https://www.roblox.com/users/123/profile",
  community: "https://www.roblox.com/communities/1",
  people: "https://www.roblox.com/users/123/friends",
  finance: "https://www.roblox.com/transactions",
  docs: "https://create.roblox.com/docs/studio/setup",
  forum: "https://devforum.roblox.com/latest",
  help: "https://en.help.roblox.com/hc/en-us",
  generic: "https://www.roblox.com/sitemap",
};
export const avatarImage = demoAvatar;
function artworkImage(
  image: string,
  title: string,
  kind: "square" | "wide",
  index: number,
) {
  const art = element("span", "thumbnail-2d-container preview-art");
  const img = element("img");
  img.src = image || sceneArtwork;
  img.alt = title;
  img.loading = index > 5 ? "lazy" : "eager";
  img.width = kind === "square" ? 256 : 384;
  img.height = kind === "square" ? 256 : 216;
  img.onerror = () => {
    img.style.opacity = "0";
  };
  art.style.backgroundImage = `url("${sceneArtwork}")`;
  art.style.backgroundSize = "cover";
  art.style.backgroundPosition = "center";
  art.append(img);
  return art;
}
function gameCard(
  item: { title?: string; image?: string },
  index: number,
  wide = false,
) {
  const li = element("li", `list-item ${wide ? "grid-tile" : ""}`);
  li.setAttribute("data-testid", wide ? "wide-game-tile" : "game-tile");
  const card = element(
    "div",
    `game-card-container ${wide ? "featured-game-container" : ""}`,
  );
  const a = link(
    "",
    `https://www.roblox.com/games/${index + 1}/Preview`,
    "game-card-link",
  );
  const thumb = element(
    "div",
    wide ? "featured-game-icon-container" : "game-card-thumb-container",
  );
  thumb.append(
    artworkImage(
      item.image || "",
      item.title || "",
      wide ? "wide" : "square",
      index,
    ),
  );
  const info = element("div", "info-container");
  info.append(element("div", "game-card-name", item.title));
  const stats = element(
    "div",
    "game-card-info",
    `${[93, 92, 94, 92, 85, 91][index % 6]}%  ·  ${["18.2K", "37.7K", "642", "36", "1.8K", "2.4K"][index % 6]}`,
  );
  info.append(stats);
  a.append(thumb, info);
  card.append(a);
  li.append(card);
  return li;
}
function shelf(title: string, wide = false) {
  const section = element("section", "game-sort-sort");
  const head = element("div", "container-header");
  const heading = element("h2", "", title);
  head.append(
    heading,
    link("See all ›", "https://www.roblox.com/charts", "see-all"),
  );
  const grid = element(
    "ul",
    `game-grid ${wide ? "wide-game-tile-game-grid" : ""}`,
  );
  (wide ? artwork.wide : artwork.square).forEach((item, i) =>
    grid.append(gameCard(item, i, wide)),
  );
  section.append(head, grid);
  return section;
}
export function mountFixture(page: PreviewPage) {
  document.querySelector("#wrap")?.remove();
  document.querySelector('meta[name="user-data"]')?.remove();
  const meta = element("meta");
  meta.name = "user-data";
  meta.dataset.userid = "123";
  meta.dataset.name = "DemoPlayer";
  meta.dataset.displayname = "DemoPlayer";
  document.head.append(meta);
  const wrap = element("div", "wrap");
  wrap.id = "wrap";
  const header = element("div", "navbar-fixed-top");
  header.id = "header";
  header.innerHTML =
    '<div class="container-fluid"><div class="rbx-navbar-header">ROBLOX</div><ul class="rbx-navbar"><li>Charts</li><li>Marketplace</li></ul><div id="right-navigation-header"><div class="preview-native-actions"><span class="preview-balance">◈ <span>0 (sample)</span></span><button type="button" aria-label="Notifications" class="native-icon" title="Notifications"><span aria-hidden="true">♧</span></button><a href="https://www.roblox.com/my/account" aria-label="Account settings" class="native-icon">⚙</a></div></div></div>';
  const side = element("nav");
  side.id = "left-navigation-container";
  side.append(
    link("Home", "/home"),
    link("Profile", "/users/123/profile"),
    link("Avatar", "/my/avatar"),
  );
  const main = element("main");
  main.id = "container-main";
  const content = element("div", "content");
  content.id = "content";
  main.append(content);
  wrap.append(header, side, main);
  document.body.append(wrap);
  if (page === "home") {
    const home = element("div");
    home.id = "HomeContainer";
    const section = element("div", "section");
    const heading = element("div", "container-header");
    heading.append(element("h1", "", "Home"));
    section.append(heading);
    home.append(section);
    const games = element("div", "game-home-page-container");
    games.append(shelf("Continue"));
    const friends = element(
      "section",
      "preview-friends friend-carousel-container",
    );
    friends.append(element("h2", "", "Your people"));
    const people = element("div", "friends-carousel");
    [
      "DemoOne",
      "DemoTwo",
      "DemoThree",
      "DemoFour",
      "DemoFive",
      "DemoSix",
      "DemoSeven",
    ].forEach((name, i) => {
      const a = link("", "https://www.roblox.com/users/friends");
      const avatar = element("div", "preview-friend-avatar", name.slice(0, 1));
      avatar.style.setProperty("--friend-hue", String(210 + i * 23));
      a.append(avatar, element("span", "", name));
      people.append(a);
    });
    friends.append(people);
    games.append(
      friends,
      shelf("Recommended for you", true),
      shelf("Discover something new", true),
    );
    home.append(games);
    content.append(home);
  } else if (page === "marketplace") {
    const top = element("div", "preview-page-heading");
    top.append(
      element("div", "eyebrow", "FIND YOUR SIGNATURE"),
      element("h1", "", "Marketplace"),
    );
    content.append(top);
    const filters = element("div", "preview-filter-bar");
    filters.innerHTML =
      '<input aria-label="Search marketplace" placeholder="Search the marketplace"><select aria-label="Category"><option>All categories</option><option>Accessories</option><option>Clothing</option></select><select aria-label="Price"><option>Any price</option><option>Free</option></select><button type="button" class="btn-control-md">Filters</button>';
    content.append(filters);
    const grid = element("ul", "item-cards");
    [
      "Headless Horseman",
      "inf15",
      "R6 Girl Wings 1.0",
      "Digitigrade Legs R15",
      "R6 Modernized",
      "R6 Robloxian 2.0",
      "Ice Crown",
      "Brown Antlers",
      "Cute Mini Star",
      "Glowing Desert Bandana",
      "Headphones (Blue)",
      "Emissive Hearts",
    ].forEach((name, i) => {
      const li = element("li", "item-card-container");
      const card = element("a", "item-card");
      card.href = "https://www.roblox.com/catalog";
      const art = element(
        "div",
        "item-card-thumb-container preview-market-art",
      );
      art.style.backgroundImage = `url("${itemArtwork}")`;
      art.style.backgroundSize = "cover";
      art.style.backgroundPosition = "center";
      art.setAttribute("role", "img");
      art.setAttribute("aria-label", name);
      card.append(
        art,
        element("div", "item-card-name", name),
        element("div", "preview-creator", "By Roblox"),
        element(
          "div",
          "preview-price",
          `◈ ${i === 0 ? "27,900" : [158, 158, 158, 270, 158, 86][i % 6]}`,
        ),
      );
      li.append(card);
      grid.append(li);
    });
    content.append(grid);
  } else if (page === "experience") {
    const detail = element("div", "game-details-container");
    detail.innerHTML = `<div class="preview-game-hero"><div class="preview-game-art" role="img" aria-label="Fictional experience artwork"></div><div class="preview-game-info"><p class="eyebrow">ADVENTURE · EXPLORATION</p><h1>Sample Adventure</h1><p class="preview-game-byline">By Demo Studio <span>✓</span></p><p class="preview-maturity">Minimal maturity</p><button type="button" class="btn-play-game">▶ &nbsp; Play</button><div class="preview-game-actions"><button type="button">☆ &nbsp; Favorite</button><button type="button">♧ &nbsp; Notify</button><span>93% positive</span></div></div></div><div role="tablist" class="rbx-tabs-horizontal"><button role="tab" aria-selected="true">About</button><button role="tab" aria-selected="false">Store</button><button role="tab" aria-selected="false">Servers</button></div><section class="preview-game-description"><h2>A little adventure. A lot of chaos.</h2><p>Hit the road with friends. Explore, improvise, and see how far your RV takes you.</p><div class="preview-stat-row"><span>24 <small>Playing</small></span><span>1,000 <small>Visits</small></span><span>16 <small>Server size</small></span></div></section>`;
    detail.querySelector<HTMLElement>(
      ".preview-game-art",
    )!.style.backgroundImage = `url("${sceneArtwork}")`;
    const description = detail.querySelector(".preview-game-description")!;
    detail.querySelectorAll<HTMLButtonElement>("[role=tab]").forEach(
      (tab) =>
        (tab.onclick = () => {
          detail
            .querySelectorAll("[role=tab]")
            .forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
          if (tab.textContent === "Servers") {
            description.innerHTML =
              '<h2>Find your next crew.</h2><ul class="rbx-game-server-list"><li class="rbx-game-server-item"><h3>Public server</h3><p>9 of 16 players</p><button type="button" class="btn-control-md">Join</button></li><li class="rbx-game-server-item"><h3>Public server</h3><p>11 of 16 players</p><button type="button" class="btn-control-md">Join</button></li></ul>';
          } else if (tab.textContent === "Store")
            description.innerHTML =
              "<h2>Experience store</h2><p>Available passes appear here.</p>";
          else
            description.innerHTML =
              "<h2>A little adventure. A lot of chaos.</h2><p>Hit the road with friends. Explore, improvise, and see how far your RV takes you.</p>";
        }),
    );
    detail.querySelector(".btn-play-game")!.addEventListener("click", () => {
      detail.querySelector(".preview-maturity")!.textContent =
        "Design preview — game launch stays on Roblox.";
    });
    content.append(detail);
  } else if (page === "settings") {
    content.innerHTML =
      '<div class="preview-page-heading"><p class="eyebrow">YOUR ACCOUNT</p><h1>Settings</h1></div><div class="preview-settings-layout"><nav class="settings-tabs"><a href="#account">Account info</a><a href="#security" class="active">Security</a><a href="#privacy">Privacy & content restrictions</a><a href="#notifications">Notifications</a><a href="#spending">Spending</a><a href="#robux">Robux</a><a href="#subscriptions">Subscriptions</a><a href="#parents">Parental controls</a><a href="#appearance">Browser preferences</a></nav><div><h2>Security</h2><section class="section-content"><h3>Enhanced protection</h3><p class="text-description">Protect your account with passkeys or hardware security keys.</p><button type="button" class="btn-control-md">Manage</button></section><section class="section-content"><h3>Two-step verification</h3><p class="text-description">Add an extra layer of protection to your account. You can enable one option at a time.</p><label class="preview-radio-row"><span>Authenticator app <small>Very secure</small></span><input type="radio" name="verification" checked value="authenticator"></label><label class="preview-radio-row"><span>Hardware security key</span><input type="radio" name="verification" value="hardware"></label></section><section class="section-content"><h3>Where you’re logged in</h3><p class="text-description">Your active sessions and trusted devices.</p><div class="preview-radio-row"><span>Mac · Current session</span><span class="preview-badge">This device</span></div></section></div></div>';
  } else if (page === "profile") {
    content.innerHTML = `<div class="profile-platform-container"><div class="currently-wearing-avatar-with-background"><img src="${avatarImage}" class="preview-profile-avatar" alt="DemoPlayer’s full-body avatar"></div><div class="user-profile-header"><h1>DemoPlayer</h1><p>@DemoPlayer</p><p class="preview-profile-counts">12 Friends &nbsp; · &nbsp; 3 Followers</p></div></div>`;
    content.append(shelf("Currently wearing"), shelf("Creations", true));
  } else if (page === "finance") {
    content.innerHTML =
      '<div class="preview-page-heading"><p class="eyebrow">YOUR ROBUX</p><h1>Transactions</h1></div><div class="section-content"><h2>Your balance</h2><p class="preview-big-number">◈ 0 (sample)</p></div><div class="preview-filter-bar"><select aria-label="Transaction type"><option>Purchases</option><option>Sales of goods</option><option>Summary</option></select></div><table class="table"><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>Jan 02</td><td>Ice Crown</td><td>−10</td></tr><tr><td>Jan 01</td><td>Headphones (Blue)</td><td>−20</td></tr></tbody></table>';
  } else if (page === "people") {
    content.append(element("h1", "", "Your people"));
    const grid = element("div", "friends-list");
    [
      "DemoOne",
      "DemoTwo",
      "DemoThree",
      "DemoFour",
      "DemoFive",
      "DemoSix",
    ].forEach((name) => {
      const card = element("div", "friend-card");
      card.append(
        element("div", "preview-friend-avatar", name.slice(0, 1)),
        element("h3", "", name),
        element("p", "", "Offline"),
        link(
          "View profile",
          "https://www.roblox.com/users/friends",
          "btn-control-md",
        ),
      );
      grid.append(card);
    });
    content.append(grid);
  } else if (page === "community") {
    content.innerHTML =
      '<div class="group-header section-content"><p class="eyebrow">COMMUNITY</p><h1>Demo Creators</h1><p>100 sample members · By Demo Studio ✓</p></div><nav class="rbx-tabs-horizontal"><a href="#home">Home</a><a href="#posts">Posts</a><a href="#store">Store</a><a href="#affiliates">Affiliates</a></nav><section class="section-content"><h2>Announcements</h2><h3>Hello</h3><p>Welcome to the community. Find your next look.</p></section>';
    content.append(shelf("Community experiences", true));
  } else if (page === "docs") {
    content.innerHTML =
      '<div class="preview-doc-layout"><nav><h3>Studio</h3><p>Overview</p><p>Setup</p><p>Interface</p><p>Building experiences</p></nav><article><p class="eyebrow">CREATOR DOCUMENTATION</p><h1>Your next idea starts here.</h1><p>Roblox Studio brings the tools to create, build, and share experiences together.</p><h2>Get started</h2><p>Your code, examples, and navigation stay readable in a quieter environment.</p><pre><code>local world = workspace\nprint("Hello, world.")</code></pre><h2>Keep exploring</h2><p>Use the documentation navigation to find guides, tutorials, and API references.</p></article></div>';
  } else if (page === "forum") {
    content.innerHTML =
      '<header class="d-header"><h1>Developer Forum</h1></header><div class="topic-list"><article class="topic-list-item"><h2>Building something remarkable</h2><p class="cooked">Share your work, ask questions, and learn from the creator community.</p></article><article class="topic-list-item"><h2>Latest announcements</h2><p class="cooked">Updates, discussions, and ideas from Roblox.</p></article></div>';
  } else if (page === "help") {
    content.innerHTML =
      '<header class="header"><h2>Roblox Support</h2></header><article class="article-container"><header class="article-header"><h1 class="article-title">How can we help?</h1></header><div class="article-body"><p>Find answers about your account, avatar, and experiences.</p><h2>Your account</h2><p>Use the help center to browse support topics and account resources.</p></div></article>';
  } else
    content.innerHTML =
      '<h1>Explore Roblox</h1><p>This unfamiliar page keeps its native navigation and receives the shared theme.</p><button type="button" id="native-control">Native action</button><p id="native-result" role="status"></p>';
  return content;
}
