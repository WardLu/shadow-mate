export const DEFAULT_PRAISE_WORDS = Object.freeze([
  "太棒了！",
  "好厉害！",
  "答对啦！",
  "真聪明！",
  "你真棒！",
  "完全正确！",
]);

function starSvgHtml(size = 28) {
  return `<svg class="star-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="#FFC53C" stroke="#E5A600" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

export function praise(text = "", { durationMs = 1100, container = (typeof document !== "undefined" ? document.body : null), pick = Math.random } = {}) {
  if (!container || typeof document === "undefined") return { element: null, destroy: () => {} };
  const words = DEFAULT_PRAISE_WORDS;
  const content = text && String(text).trim()
    ? String(text).trim()
    : words[Math.floor(pick() * words.length)] || words[0];

  const el = document.createElement("div");
  el.className = "big-praise";
  el.textContent = content;
  container.appendChild(el);

  let timer = null;
  const destroy = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (el.isConnected) {
      el.remove();
    }
  };

  timer = setTimeout(destroy, durationMs);
  return { element: el, destroy };
}

export function flyStars(count = 8, { durationMs = 1100, container = (typeof document !== "undefined" ? document.body : null), pick = Math.random } = {}) {
  if (!container || typeof document === "undefined") return { elements: [], destroy: () => {} };
  const n = Math.max(1, Math.min(16, count));
  const elements = [];
  const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 200;
  const cy = typeof window !== "undefined" ? window.innerHeight * 0.45 : 300;

  for (let i = 0; i < n; i++) {
    const star = document.createElement("div");
    star.className = "fxstar";
    star.style.left = `${cx - 14}px`;
    star.style.top = `${cy - 14}px`;
    const dx = Math.round((pick() * 360 - 180));
    const dy = Math.round((pick() * -180 - 40));
    star.style.setProperty("--dx", `${dx}px`);
    star.style.setProperty("--dy", `${dy}px`);
    star.style.animationDelay = `${(i * 0.04).toFixed(2)}s`;
    star.innerHTML = starSvgHtml(28);
    container.appendChild(star);
    elements.push(star);
  }

  let timer = null;
  const destroy = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    elements.forEach((star) => {
      if (star.isConnected) star.remove();
    });
  };

  timer = setTimeout(destroy, durationMs);
  return { elements, destroy };
}

export function shake(element, { durationMs = 400 } = {}) {
  if (!element || typeof element.classList?.add !== "function") return { destroy: () => {} };
  element.classList.remove("card-shake");
  void element.offsetWidth; // Trigger reflow
  element.classList.add("card-shake");

  let timer = setTimeout(() => {
    element.classList.remove("card-shake");
  }, durationMs);

  return {
    destroy: () => {
      clearTimeout(timer);
      element.classList.remove("card-shake");
    },
  };
}
