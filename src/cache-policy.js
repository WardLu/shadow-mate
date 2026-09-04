export const APP_SHELL_CACHE_NAME = "shadow-mate-app-v4";

export function isAppShellCacheName(name) {
  return /^shadow-mate-app-v\d+$/.test(name) || /^shadow-mate-v\d+$/.test(name);
}

export function staleAppShellCacheNames(keys, currentName = APP_SHELL_CACHE_NAME) {
  return keys.filter((key) => isAppShellCacheName(key) && key !== currentName);
}
