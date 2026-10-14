// 英语学习单词视觉图示 (Visual Iconography)
// 纯本地内联 SVG，无外部 CDN 依赖，保证离线与儿童认知记忆。

import { escapeHtml } from "../lib.js";

const PALETTES = Object.freeze({
  red: "#EF4444",
  orange: "#F97316",
  amber: "#F59E0B",
  yellow: "#EAB308",
  green: "#10B981",
  emerald: "#059669",
  teal: "#14B8A6",
  cyan: "#06B6D4",
  blue: "#3B82F6",
  indigo: "#6366F1",
  violet: "#8B5CF6",
  purple: "#A855F7",
  pink: "#EC4899",
  rose: "#F43F5E",
  brown: "#78350F",
  gray: "#6B7280",
  slate: "#475569",
  white: "#F8FAFC",
  black: "#1E293B",
});

// 颜色词汇对应真实色值
const COLOR_HEX = Object.freeze({
  red: "#EF4444",
  yellow: "#EAB308",
  blue: "#3B82F6",
  green: "#10B981",
  orange: "#F97316",
  purple: "#9333EA",
  pink: "#EC4899",
  brown: "#854D0E",
  black: "#1E293B",
  white: "#F1F5F9",
  gray: "#64748B",
  grey: "#64748B",
});

// 数字词汇对应数值
const NUMBER_VALUES = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
});

// 具体事物的高识别度矢量图形
const WORD_ICONS = Object.freeze({
  // 水果与食物
  apple: `<circle cx="32" cy="36" r="22" fill="#EF4444"/><path d="M30 14 Q32 20 32 26" stroke="#78350F" stroke-width="4" stroke-linecap="round"/><path d="M32 18 Q42 12 42 18 Q36 24 32 20" fill="#10B981"/><circle cx="26" cy="30" r="3" fill="#FCA5A5" opacity=".6"/>`,
  banana: `<path d="M14 48 Q32 54 48 24 Q52 16 50 14 Q46 16 42 22 Q28 42 16 44 Z" fill="#FACC15" stroke="#CA8A04" stroke-width="2"/><path d="M14 48 L10 52" stroke="#78350F" stroke-width="3" stroke-linecap="round"/>`,
  orange: `<circle cx="32" cy="34" r="22" fill="#F97316"/><path d="M32 12 V18" stroke="#78350F" stroke-width="3" stroke-linecap="round"/><path d="M32 14 Q40 8 40 14 Z" fill="#10B981"/>`,
  milk: `<rect x="20" y="20" width="24" height="34" rx="4" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2"/><path d="M24 14 L40 14 L44 20 L20 20 Z" fill="#CBD5E1"/><text x="32" y="42" font-size="10" font-weight="bold" fill="#3B82F6" text-anchor="middle">MILK</text>`,
  bread: `<ellipse cx="32" cy="34" rx="24" ry="16" fill="#D97706"/><ellipse cx="32" cy="30" rx="20" ry="12" fill="#FCD34D"/>`,
  egg: `<ellipse cx="32" cy="34" rx="18" ry="24" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>`,
  water: `<path d="M32 12 C32 12 16 32 16 42 C16 51 23 56 32 56 C41 56 48 51 48 42 C48 32 32 12 32 12 Z" fill="#38BDF8"/>`,
  rice: `<path d="M14 36 Q32 40 50 36 L44 54 Q32 58 20 54 Z" fill="#0284C7"/><ellipse cx="32" cy="34" rx="18" ry="8" fill="#F8FAFC"/>`,
  cake: `<rect x="16" y="32" width="32" height="22" rx="3" fill="#F472B6"/><path d="M14 32 Q32 36 50 32" stroke="#FDF2F8" stroke-width="4"/><circle cx="32" cy="22" r="4" fill="#EF4444"/><line x1="32" y1="26" x2="32" y2="32" stroke="#E2E8F0" stroke-width="2"/>`,
  tea: `<path d="M18 28 H46 L42 52 H22 Z" fill="#10B981"/><path d="M46 32 Q54 32 54 40 Q54 48 44 48" fill="none" stroke="#059669" stroke-width="3"/><path d="M26 18 Q28 22 26 26 M36 18 Q38 22 36 26" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/>`,

  // 动物
  cat: `<circle cx="32" cy="36" r="18" fill="#FB923C"/><polygon points="18,24 22,10 30,20" fill="#FB923C"/><polygon points="46,24 42,10 34,20" fill="#FB923C"/><circle cx="26" cy="34" r="3" fill="#1E293B"/><circle cx="38" cy="34" r="3" fill="#1E293B"/><circle cx="32" cy="40" r="2" fill="#F43F5E"/><path d="M20 38 H12 M44 38 H52" stroke="#1E293B" stroke-width="2"/>`,
  dog: `<circle cx="32" cy="34" r="18" fill="#B45309"/><ellipse cx="16" cy="30" rx="6" ry="12" fill="#78350F"/><ellipse cx="48" cy="30" rx="6" ry="12" fill="#78350F"/><circle cx="26" cy="32" r="3" fill="#1E293B"/><circle cx="38" cy="32" r="3" fill="#1E293B"/><ellipse cx="32" cy="38" rx="4" ry="3" fill="#1E293B"/>`,
  fish: `<path d="M14 32 Q32 14 48 32 Q32 50 14 32 Z" fill="#06B6D4"/><polygon points="48,32 58,22 58,42" fill="#0891B2"/><circle cx="24" cy="30" r="3" fill="#1E293B"/>`,
  bird: `<circle cx="28" cy="32" r="16" fill="#38BDF8"/><polygon points="40,32 52,36 40,40" fill="#F59E0B"/><circle cx="34" cy="28" r="3" fill="#1E293B"/><path d="M16 36 Q10 42 20 44 Z" fill="#0284C7"/>`,
  duck: `<circle cx="26" cy="26" r="12" fill="#FBBF24"/><ellipse cx="36" cy="40" rx="16" ry="10" fill="#FBBF24"/><path d="M16 26 L8 28 L16 32 Z" fill="#F97316"/><circle cx="24" cy="22" r="2" fill="#1E293B"/>`,
  pig: `<circle cx="32" cy="34" r="20" fill="#F472B6"/><ellipse cx="32" cy="36" rx="8" ry="6" fill="#EC4899"/><circle cx="29" cy="36" r="2" fill="#831843"/><circle cx="35" cy="36" r="2" fill="#831843"/><circle cx="24" cy="26" r="2.5" fill="#1E293B"/><circle cx="40" cy="26" r="2.5" fill="#1E293B"/>`,
  rabbit: `<circle cx="32" cy="38" r="16" fill="#E2E8F0"/><ellipse cx="24" cy="18" rx="5" ry="14" fill="#E2E8F0"/><ellipse cx="24" cy="18" rx="3" ry="10" fill="#F472B6"/><ellipse cx="40" cy="18" rx="5" ry="14" fill="#E2E8F0"/><ellipse cx="40" cy="18" rx="3" ry="10" fill="#F472B6"/><circle cx="26" cy="36" r="2.5" fill="#1E293B"/><circle cx="38" cy="36" r="2.5" fill="#1E293B"/>`,
  bear: `<circle cx="32" cy="36" r="18" fill="#854D0E"/><circle cx="18" cy="20" r="7" fill="#854D0E"/><circle cx="46" cy="20" r="7" fill="#854D0E"/><circle cx="26" cy="34" r="3" fill="#1E293B"/><circle cx="38" cy="34" r="3" fill="#1E293B"/><ellipse cx="32" cy="42" rx="5" ry="4" fill="#FEF3C7"/>`,
  monkey: `<circle cx="32" cy="34" r="16" fill="#92400E"/><circle cx="14" cy="32" r="7" fill="#FDE68A"/><circle cx="50" cy="32" r="7" fill="#FDE68A"/><ellipse cx="32" cy="36" rx="12" ry="10" fill="#FDE68A"/><circle cx="27" cy="32" r="2.5" fill="#1E293B"/><circle cx="37" cy="32" r="2.5" fill="#1E293B"/>`,
  tiger: `<circle cx="32" cy="34" r="18" fill="#F97316"/><polygon points="20,18 24,10 28,18" fill="#EA580C"/><polygon points="44,18 40,10 36,18" fill="#EA580C"/><circle cx="26" cy="32" r="3" fill="#1E293B"/><circle cx="38" cy="32" r="3" fill="#1E293B"/><path d="M30 18 L32 24 L34 18" stroke="#1E293B" stroke-width="2"/>`,

  // 自然与天气
  sun: `<circle cx="32" cy="32" r="14" fill="#FBBF24"/><g stroke="#F59E0B" stroke-width="3" stroke-linecap="round"><line x1="32" y1="8" x2="32" y2="14"/><line x1="32" y1="50" x2="32" y2="56"/><line x1="8" y1="32" x2="14" y2="32"/><line x1="50" y1="32" x2="56" y2="32"/><line x1="15" y1="15" x2="19" y2="19"/><line x1="45" y1="45" x2="49" y2="49"/><line x1="15" y1="49" x2="19" y2="45"/><line x1="45" y1="19" x2="49" y2="15"/></g>`,
  moon: `<path d="M38 12 A 20 20 0 1 0 50 44 A 18 18 0 0 1 38 12 Z" fill="#FDE047"/>`,
  star: `<polygon points="32,8 39,24 56,25 43,36 47,52 32,43 17,52 21,36 8,25 25,24" fill="#FACC15"/>`,
  rain: `<ellipse cx="32" cy="24" rx="20" ry="12" fill="#94A3B8"/><g stroke="#38BDF8" stroke-width="3" stroke-linecap="round"><line x1="22" y1="40" x2="18" y2="52"/><line x1="32" y1="40" x2="28" y2="52"/><line x1="42" y1="40" x2="38" y2="52"/></g>`,
  snow: `<ellipse cx="32" cy="24" rx="20" ry="12" fill="#CBD5E1"/><circle cx="20" cy="44" r="3" fill="#38BDF8"/><circle cx="32" cy="46" r="3" fill="#38BDF8"/><circle cx="44" cy="44" r="3" fill="#38BDF8"/>`,
  wind: `<path d="M12 24 H38 A 6 6 0 1 0 38 12 M8 32 H46 A 6 6 0 1 1 46 44 M16 40 H34 A 4 4 0 1 0 34 32" fill="none" stroke="#60A5FA" stroke-width="3" stroke-linecap="round"/>`,
  cloud: `<ellipse cx="26" cy="34" rx="14" ry="12" fill="#CBD5E1"/><circle cx="38" cy="28" r="14" fill="#E2E8F0"/><ellipse cx="44" cy="36" rx="12" ry="10" fill="#CBD5E1"/>`,
  tree: `<polygon points="32,10 16,30 24,30 14,46 50,46 40,30 48,30" fill="#10B981"/><rect x="28" y="46" width="8" height="12" fill="#78350F"/>`,
  flower: `<circle cx="32" cy="32" r="8" fill="#FACC15"/><circle cx="32" cy="18" r="7" fill="#F43F5E"/><circle cx="32" cy="46" r="7" fill="#F43F5E"/><circle cx="18" cy="32" r="7" fill="#F43F5E"/><circle cx="46" cy="32" r="7" fill="#F43F5E"/>`,

  // 交通工具
  car: `<path d="M14 36 L22 24 H42 L48 36 H52 Q56 36 56 42 V46 H8 V42 Q8 36 12 36 Z" fill="#EF4444"/><rect x="24" y="26" width="16" height="8" rx="2" fill="#BFDBFE"/><circle cx="20" cy="48" r="6" fill="#1E293B"/><circle cx="44" cy="48" r="6" fill="#1E293B"/>`,
  bus: `<rect x="12" y="16" width="40" height="30" rx="4" fill="#FBBF24"/><rect x="16" y="20" width="8" height="8" fill="#BFDBFE"/><rect x="28" y="20" width="8" height="8" fill="#BFDBFE"/><rect x="40" y="20" width="8" height="8" fill="#BFDBFE"/><circle cx="20" cy="48" r="6" fill="#1E293B"/><circle cx="44" cy="48" r="6" fill="#1E293B"/>`,
  bike: `<circle cx="20" cy="42" r="10" fill="none" stroke="#3B82F6" stroke-width="3"/><circle cx="44" cy="42" r="10" fill="none" stroke="#3B82F6" stroke-width="3"/><path d="M20 42 L30 26 L44 42 M30 26 H38 M30 26 L26 42" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/>`,
  plane: `<path d="M32 10 L36 28 L54 36 L52 40 L36 34 L34 50 L40 54 V56 L32 54 L24 56 V54 L30 50 L28 34 L12 40 L10 36 L28 28 Z" fill="#3B82F6"/>`,
  boat: `<path d="M12 38 L18 52 H46 L52 38 Z" fill="#854D0E"/><polygon points="32,14 32,36 18,36" fill="#F8FAFC" stroke="#94A3B8"/><line x1="32" y1="12" x2="32" y2="38" stroke="#1E293B" stroke-width="2"/>`,

  // 身体
  eye: `<path d="M12 32 Q32 16 52 32 Q32 48 12 32 Z" fill="#F8FAFC" stroke="#1E293B" stroke-width="2"/><circle cx="32" cy="32" r="8" fill="#0284C7"/><circle cx="32" cy="32" r="4" fill="#0F172A"/><circle cx="34" cy="30" r="2" fill="#F8FAFC"/>`,
  ear: `<path d="M26 14 Q44 14 44 32 Q44 44 34 50 Q24 52 22 42 Q20 34 26 30 Q32 26 30 22 Q28 18 26 14 Z" fill="#FCD34D" stroke="#D97706" stroke-width="2"/>`,
  nose: `<path d="M30 18 L26 38 H38" fill="none" stroke="#D97706" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  mouth: `<path d="M16 32 Q32 48 48 32 Q32 38 16 32 Z" fill="#EF4444"/>`,
  hand: `<path d="M24 46 V28 Q24 24 28 24 Q32 24 32 28 V24 Q32 20 36 20 Q40 20 40 24 V22 Q40 18 44 18 Q48 18 48 24 V38 Q48 48 38 52 H26 Z" fill="#FCD34D" stroke="#D97706" stroke-width="2"/>`,
  foot: `<ellipse cx="32" cy="40" rx="14" ry="16" fill="#FCD34D"/><ellipse cx="26" cy="20" rx="4" ry="6" fill="#FCD34D"/><circle cx="34" cy="21" r="3" fill="#FCD34D"/><circle cx="40" cy="23" r="2.5" fill="#FCD34D"/>`,

  // 学习与生活
  book: `<path d="M12 18 Q32 24 32 48 Q32 24 52 18 V46 Q32 52 32 52 Q32 52 12 46 Z" fill="#3B82F6"/><path d="M32 24 V52" stroke="#1E293B" stroke-width="2"/>`,
  pen: `<polygon points="20,50 14,54 18,48 42,16 48,22" fill="#10B981"/><polygon points="42,16 46,12 52,18 48,22" fill="#F59E0B"/>`,
  pencil: `<polygon points="20,50 14,54 18,48 42,16 48,22" fill="#FBBF24"/><polygon points="14,54 16,51 17,53" fill="#1E293B"/>`,
  bag: `<rect x="18" y="24" width="28" height="28" rx="4" fill="#6366F1"/><path d="M26 24 V16 Q26 12 32 12 Q38 12 38 16 V24" fill="none" stroke="#4338CA" stroke-width="3"/>`,
  chair: `<path d="M20 16 V48 M44 32 V48 M20 32 H44 M20 22 H44" stroke="#78350F" stroke-width="3" stroke-linecap="round"/>`,
  table: `<path d="M10 26 H54 L48 48 M16 48 L14 26" stroke="#854D0E" stroke-width="3" stroke-linecap="round"/>`,
  bed: `<rect x="12" y="32" width="40" height="16" rx="2" fill="#60A5FA"/><rect x="16" y="24" width="12" height="8" rx="2" fill="#F8FAFC"/><line x1="12" y1="20" x2="12" y2="50" stroke="#1E293B" stroke-width="3"/><line x1="52" y1="28" x2="52" y2="50" stroke="#1E293B" stroke-width="3"/>`,
  door: `<rect x="18" y="12" width="28" height="42" rx="2" fill="#B45309" stroke="#78350F" stroke-width="2"/><circle cx="24" cy="34" r="2.5" fill="#FBBF24"/>`,
  window: `<rect x="16" y="16" width="32" height="32" fill="#BFDBFE" stroke="#3B82F6" stroke-width="3"/><line x1="32" y1="16" x2="32" y2="48" stroke="#3B82F6" stroke-width="2"/><line x1="16" y1="32" x2="48" y2="32" stroke="#3B82F6" stroke-width="2"/>`,
  clock: `<circle cx="32" cy="32" r="22" fill="#F8FAFC" stroke="#1E293B" stroke-width="3"/><line x1="32" y1="32" x2="32" y2="18" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/><line x1="32" y1="32" x2="42" y2="32" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="32" r="3" fill="#1E293B"/>`,
  hat: `<path d="M8 44 Q32 46 56 44 Q46 44 44 26 Q32 20 20 26 Q18 44 8 44 Z" fill="#F59E0B"/>`,
  shoes: `<path d="M12 40 L22 30 H34 L40 40 L52 42 V48 H12 Z" fill="#3B82F6"/>`,

  // 动作与感受
  happy: `<circle cx="32" cy="32" r="22" fill="#FDE047"/><circle cx="24" cy="26" r="3" fill="#1E293B"/><circle cx="40" cy="26" r="3" fill="#1E293B"/><path d="M22 36 Q32 46 42 36" fill="none" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/>`,
  sad: `<circle cx="32" cy="32" r="22" fill="#93C5FD"/><circle cx="24" cy="26" r="3" fill="#1E293B"/><circle cx="40" cy="26" r="3" fill="#1E293B"/><path d="M22 42 Q32 34 42 42" fill="none" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/>`,
  run: `<circle cx="36" cy="16" r="5" fill="#EF4444"/><path d="M34 22 L26 34 L32 38 L24 50 M26 34 L38 32 L46 40" stroke="#EF4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  jump: `<circle cx="32" cy="14" r="5" fill="#10B981"/><path d="M32 20 V32 M32 24 L22 18 M32 24 L42 18 M32 32 L24 44 M32 32 L40 44" stroke="#10B981" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  sleep: `<ellipse cx="32" cy="36" rx="20" ry="12" fill="#818CF8"/><text x="44" y="20" font-size="12" font-weight="bold" fill="#6366F1">z</text><text x="48" y="14" font-size="9" font-weight="bold" fill="#818CF8">z</text>`,
  eat: `<ellipse cx="32" cy="38" rx="20" ry="12" fill="#FBBF24"/><path d="M24 20 V32 M28 20 V32 M20 20 V32" stroke="#78350F" stroke-width="2"/><circle cx="42" cy="24" r="4" fill="#EF4444"/>`,
});

// 主题兜底图示
const THEME_FALLBACKS = Object.freeze({
  水果: `<circle cx="32" cy="34" r="18" fill="#F87171"/><path d="M32 14 V18" stroke="#78350F" stroke-width="3"/>`,
  颜色: `<circle cx="32" cy="32" r="18" fill="#A855F7"/><circle cx="24" cy="26" r="4" fill="#EF4444"/><circle cx="40" cy="26" r="4" fill="#3B82F6"/><circle cx="32" cy="40" r="4" fill="#EAB308"/>`,
  动物: `<circle cx="32" cy="34" r="16" fill="#FB923C"/><circle cx="20" cy="22" r="6" fill="#FB923C"/><circle cx="44" cy="22" r="6" fill="#FB923C"/><circle cx="26" cy="32" r="2.5" fill="#1E293B"/><circle cx="38" cy="32" r="2.5" fill="#1E293B"/>`,
  家人: `<circle cx="24" cy="24" r="8" fill="#F472B6"/><circle cx="40" cy="24" r="8" fill="#60A5FA"/><path d="M14 48 Q24 36 34 48" fill="#F472B6"/><path d="M30 48 Q40 36 50 48" fill="#60A5FA"/>`,
  身体: `<circle cx="32" cy="24" r="10" fill="#FCD34D"/><path d="M32 34 V48 M20 38 L44 38" stroke="#D97706" stroke-width="3" stroke-linecap="round"/>`,
  学习: `<rect x="18" y="16" width="28" height="34" rx="3" fill="#3B82F6"/><line x1="24" y1="26" x2="40" y2="26" stroke="#93C5FD" stroke-width="2"/><line x1="24" y1="34" x2="40" y2="34" stroke="#93C5FD" stroke-width="2"/>`,
  自然: `<circle cx="32" cy="26" r="12" fill="#FBBF24"/><path d="M12 48 Q32 36 52 48 Z" fill="#10B981"/>`,
  动作: `<circle cx="32" cy="18" r="6" fill="#F97316"/><path d="M32 24 V38 M22 28 L42 28 M24 50 L32 38 L40 50" stroke="#F97316" stroke-width="3" stroke-linecap="round"/>`,
  数字: `<rect x="16" y="16" width="32" height="32" rx="6" fill="#6366F1"/><text x="32" y="38" font-size="20" font-weight="bold" fill="#F8FAFC" text-anchor="middle">123</text>`,
  家: `<polygon points="32,12 14,28 50,28" fill="#EF4444"/><rect x="18" y="28" width="28" height="24" fill="#FEF3C7"/><rect x="28" y="36" width="8" height="16" fill="#B45309"/>`,
  衣物: `<path d="M22 16 L32 22 L42 16 L50 24 L44 30 L42 28 V48 H22 V28 L20 30 L14 24 Z" fill="#8B5CF6"/>`,
  食物: `<circle cx="32" cy="32" r="18" fill="#F59E0B"/><circle cx="28" cy="28" r="3" fill="#D97706"/><circle cx="36" cy="34" r="3" fill="#D97706"/>`,
  感受: `<circle cx="32" cy="32" r="18" fill="#FBBF24"/><circle cx="26" cy="28" r="2.5" fill="#1E293B"/><circle cx="38" cy="28" r="2.5" fill="#1E293B"/><path d="M24 38 Q32 46 40 38" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round"/>`,
  时间: `<circle cx="32" cy="32" r="18" fill="#F8FAFC" stroke="#0284C7" stroke-width="3"/><line x1="32" y1="32" x2="32" y2="22" stroke="#0284C7" stroke-width="2"/><line x1="32" y1="32" x2="40" y2="32" stroke="#0284C7" stroke-width="2"/>`,
  天气: `<ellipse cx="32" cy="32" rx="18" ry="12" fill="#93C5FD"/><circle cx="38" cy="24" r="10" fill="#FBBF24"/>`,
  交通: `<rect x="16" y="26" width="32" height="16" rx="3" fill="#EF4444"/><circle cx="22" cy="44" r="5" fill="#1E293B"/><circle cx="42" cy="44" r="5" fill="#1E293B"/>`,
  植物: `<circle cx="32" cy="24" r="14" fill="#22C55E"/><rect x="29" y="38" width="6" height="14" fill="#78350F"/>`,
});

function renderColorSwatch(colorName) {
  const hex = COLOR_HEX[colorName.toLowerCase()] || "#3B82F6";
  return `<rect x="12" y="12" width="40" height="40" rx="8" fill="${hex}" stroke="#E2E8F0" stroke-width="2"/><circle cx="32" cy="32" r="10" fill="#FFFFFF" opacity=".4"/>`;
}

function renderNumberDots(count) {
  const num = Math.min(Math.max(count, 1), 20);
  const dots = [];
  const cols = num > 9 ? 4 : num > 4 ? 3 : 2;
  const spacing = 40 / cols;
  for (let i = 0; i < num; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = 16 + col * spacing;
    const cy = 16 + row * spacing;
    dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="#6366F1"/>`);
  }
  return `<rect x="8" y="8" width="48" height="48" rx="8" fill="#EEF2FF"/><text x="32" y="36" font-size="22" font-weight="bold" fill="#4F46E5" text-anchor="middle" opacity=".35">${num}</text>${dots.join("")}`;
}

export function getEnglishVisualSvg(word, theme = "", meaning = "") {
  const normalized = String(word || "").trim().toLowerCase();
  if (COLOR_HEX[normalized]) return renderColorSwatch(normalized);
  if (NUMBER_VALUES[normalized]) return renderNumberDots(NUMBER_VALUES[normalized]);
  if (WORD_ICONS[normalized]) return WORD_ICONS[normalized];
  if (THEME_FALLBACKS[theme]) return THEME_FALLBACKS[theme];
  // 默认徽章
  const letter = (word?.[0] || "A").toUpperCase();
  return `<circle cx="32" cy="32" r="22" fill="#F1F5F9" stroke="#94A3B8" stroke-width="2"/><text x="32" y="40" font-size="24" font-weight="bold" fill="#3B82F6" text-anchor="middle">${letter}</text>`;
}

export function renderEnglishVisual(word, theme = "", meaning = "") {
  const svgContent = getEnglishVisualSvg(word, theme, meaning);
  const alt = `${escapeHtml(word)}${meaning ? `（${escapeHtml(meaning)}）` : ""}`;
  return `<div class="english-visual" data-english-visual="${escapeHtml(word)}" aria-label="${alt}" role="img"><svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true" focusable="false">${svgContent}</svg></div>`;
}
