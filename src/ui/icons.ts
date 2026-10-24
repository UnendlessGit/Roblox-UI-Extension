import robloxIcons from "./roblox-icons.json";
import {
  createElement,
  House,
  Compass,
  ShoppingBag,
  PersonStanding,
  Search,
  UserRound,
  Settings2,
  Bell,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Menu,
  SlidersHorizontal,
  Box,
  CircleHelp,
  Mail,
  type IconNode,
} from "lucide";
const icons: Record<string, IconNode> = {
  messages: Mail,
  home: House,
  discover: Compass,
  marketplace: ShoppingBag,
  avatar: PersonStanding,
  search: Search,
  user: UserRound,
  settings: Settings2,
  bell: Bell,
  arrow: ArrowUpRight,
  chevron: ChevronRight,
  left: ChevronLeft,
  close: X,
  check: Check,
  menu: Menu,
  filters: SlidersHorizontal,
  box: Box,
  help: CircleHelp,
};
const nativeNames: Record<string, string> = {
  messages: "speech-bubble-align-center",
  verified: "verified-badge",
  friends: "two-people",
  community: "three-people",
  trades: "hand-two-arrows-horizontal",
  finance: "wallet",
  home: "house",
  discover: "circle-play",
  marketplace: "shopping-basket",
  avatar: "person-standing",
  search: "magnifying-glass",
  user: "person",
  settings: "gear",
  bell: "bell",
  menu: "three-bars-horizontal",
  box: "backpack",
};
export function icon(name: string, size = 20, filled = false) {
  const source = (robloxIcons as Record<string, string>)[
    `icon-${filled ? "filled" : "regular"}-${nativeNames[name]}`
  ];
  if (source) {
    const svg = new DOMParser().parseFromString(
      source,
      "image/svg+xml",
    ).documentElement;
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("data-rc-icon-source", "roblox");
    if (name !== "verified")
      for (const path of svg.querySelectorAll("[fill]"))
        path.setAttribute("fill", "currentColor");
    return document.importNode(svg, true);
  }
  return createElement(icons[name] || icons.box, {
    width: size,
    height: size,
    "stroke-width": 1.65,
    "aria-hidden": "true",
  });
}
