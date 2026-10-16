import {
  ArrowUp,
  Award,
  BadgeCheck,
  BookMarked,
  BookCopy,
  BookOpen,
  BookOpenCheck,
  Brain,
  Calculator,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  CircleHelp,
  CloudCheck,
  Compass,
  Construction,
  createElement,
  Dices,
  Download,
  Eraser,
  ExternalLink,
  Flame,
  Footprints,
  Gift,
  GraduationCap,
  Grid2X2,
  HardHat,
  Heart,
  Home,
  House,
  Languages,
  Lightbulb,
  ListChecks,
  Lock,
  LogOut,
  NotebookPen,
  Palette,
  PartyPopper,
  Pencil,
  PenLine,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Trash2,
  Trees,
  Trophy,
  Unlock,
  UserRound,
  Volume2,
  X,
  Zap,
} from "lucide";
import { TOYBOX_ICONS } from "./toybox-icons.js";

const ICONS = {
  arrowUp: ArrowUp,
  award: Award,
  badge: BadgeCheck,
  book: BookOpen,
  bookCheck: BookOpenCheck,
  bookMarked: BookMarked,
  brain: Brain,
  calculator: Calculator,
  calendar: CalendarDays,
  chart: ChartNoAxesColumnIncreasing,
  check: Check,
  checkCircle: CircleCheck,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  circleX: CircleX,
  alert: CircleAlert,
  help: CircleHelp,
  compass: Compass,
  construction: Construction,
  cloudCheck: CloudCheck,
  dice: Dices,
  download: Download,
  eraser: Eraser,
  externalLink: ExternalLink,
  flame: Flame,
  footprints: Footprints,
  gift: Gift,
  graduation: GraduationCap,
  grid: Grid2X2,
  hardHat: HardHat,
  heart: Heart,
  home: Home,
  house: House,
  languages: Languages,
  library: BookCopy,
  hint: Lightbulb,
  list: ListChecks,
  lock: Lock,
  unlock: Unlock,
  logout: LogOut,
  notebook: NotebookPen,
  palette: Palette,
  party: PartyPopper,
  pencil: Pencil,
  pen: PenLine,
  play: Play,
  plus: Plus,
  printer: Printer,
  refresh: RefreshCw,
  rotate: RotateCcw,
  settings: Settings,
  shield: Shield,
  shieldCheck: ShieldCheck,
  smile: Smile,
  sparkles: Sparkles,
  sprout: Sprout,
  star: Star,
  trash: Trash2,
  trees: Trees,
  trophy: Trophy,
  learner: UserRound,
  volume: Volume2,
  close: X,
  zap: Zap,
};

// 现有调用名 → 触感玩具箱双色图标。未列出的名称先找 lucide，再找玩具箱同名图标。
const TOYBOX_ALIASES = {
  home: "home", house: "home2", graduation: "bag", star: "star", sprout: "sprout", lock: "lock",
  volume: "speaker", checkCircle: "check", check: "tick", rotate: "undo",
  chevronLeft: "left", chevronRight: "right", arrowUp: "up", calendar: "cal", gift: "gift",
  pencil: "pencil", pen: "pencil", notebook: "pencil", calculator: "calc", grid: "grid",
  dice: "beads", brain: "apple", languages: "abc",
  book: "book", bookMarked: "book", bookCheck: "book", library: "shelf", printer: "print",
  cloudCheck: "cloudok", construction: "device", settings: "sliders", shield: "shield", shieldCheck: "shield",
  learner: "user", plus: "plus", flame: "flame", close: "x", trophy: "trophy", play: "play",
  compass: "compass", download: "export", trash: "trash", hint: "bulb", heart: "heart",
  externalLink: "link", refresh: "sync", list: "list", logout: "logout", trees: "tree", party: "party",
};

function toyboxName(name) {
  if (TOYBOX_ALIASES[name]) return TOYBOX_ALIASES[name];
  if (!ICONS[name] && TOYBOX_ICONS[name]) return name;
  return "";
}

export function icon(name, { className = "", label = "", filled = false } = {}) {
  const toybox = toyboxName(name);
  if (toybox) {
    const a11y = label
      ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}" aria-hidden="false"`
      : `aria-hidden="true"`;
    const classes = `ui-icon ic tb-icon ${className}`.trim();
    const fill = filled ? ` fill="currentColor" style="--i2:currentColor"` : "";
    return `<svg class="${classes}" viewBox="0 0 32 32" focusable="false"${fill} ${a11y}>${TOYBOX_ICONS[toybox]}</svg>`;
  }
  const iconNode = ICONS[name];
  if (!iconNode) return "";
  const svg = createElement(iconNode, {
    class: `ui-icon ${className}`.trim(),
    focusable: "false",
    ...(filled ? { fill: "currentColor" } : {}),
    ...(label
      ? { role: "img", "aria-label": label, "aria-hidden": "false" }
      : { "aria-hidden": "true" }),
  });
  return svg.outerHTML;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((placeholder) => {
    const markup = icon(placeholder.dataset.icon, {
      className: placeholder.className,
      label: placeholder.dataset.iconLabel || "",
    });
    if (markup) placeholder.outerHTML = markup;
  });
}
