export function donkeySVG(mood = "idle", size = 140) {
  const tilt =
    mood === "think" ? -6 : mood === "cheer" ? 3 : mood === "sad" ? 4 : 0;
  const eyeRy = mood === "idle" || mood === "think" ? 1.3 : 2.4;
  const browY = mood === "sad" ? 44 : mood === "think" ? 46 : 48;
  const mouth =
    mood === "cheer"
      ? `<path d="M56 69 q4 3 8 0" stroke="#4a3b32" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
      : "";

  const sign =
    mood === "present"
      ? `<g transform="translate(10,84) rotate(-8)">
           <rect width="34" height="20" rx="3" fill="#fffdf7" stroke="#8a6a52" stroke-width="1.4"/>
           <line x1="17" y1="20" x2="17" y2="28" stroke="#8a6a52" stroke-width="1.4"/>
           <text x="17" y="14" font-size="7" font-family="Caveat, cursive" fill="#8a6a52" text-anchor="middle">here!</text>
         </g>`
      : "";

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 120 130" role="img" aria-label="Jumino the donkey"
       style="transform:rotate(${tilt}deg);transition:transform .4s ease">
    <ellipse cx="34" cy="26" rx="8" ry="20" fill="#9fb0c7" transform="rotate(-22 34 26)"/>
    <ellipse cx="86" cy="26" rx="8" ry="20" fill="#9fb0c7" transform="rotate(22 86 26)"/>
    <ellipse cx="60" cy="90" rx="27" ry="20" fill="#b8c6d9"/>
    <circle cx="60" cy="56" r="26" fill="#c8d4e3"/>
    <ellipse cx="60" cy="66" rx="13" ry="9" fill="#efe6d6"/>
    <circle cx="55" cy="65" r="1.6" fill="#4a3b32"/>
    <circle cx="65" cy="65" r="1.6" fill="#4a3b32"/>
    <ellipse cx="49" cy="52" rx="2.5" ry="${eyeRy}" fill="#4a3b32"/>
    <ellipse cx="71" cy="52" rx="2.5" ry="${eyeRy}" fill="#4a3b32"/>
    <path d="M45 ${browY} q4 -2 8 0" stroke="#4a3b32" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M67 ${browY} q4 -2 8 0" stroke="#4a3b32" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    ${mouth}
    <path d="M40 76 L60 92 L80 76 Q60 84 40 76Z" fill="#bfe3d0" stroke="#8a6a52" stroke-width="1"/>
    <circle cx="50" cy="82" r="1.2" fill="#fff"/>
    <circle cx="64" cy="84" r="1.2" fill="#fff"/>
    <circle cx="58" cy="78" r="1.2" fill="#fff"/>
    <g transform="translate(78,86) rotate(8)">
      <rect width="20" height="14" rx="2" fill="#8a6a52" stroke="#5b4535"/>
      <path d="M0 2 L10 8 L20 2" fill="none" stroke="#bfe3d0" stroke-width="1.4"/>
      <circle cx="4" cy="6" r="1" fill="#bfe3d0"/>
      <circle cx="14" cy="10" r="1" fill="#bfe3d0"/>
    </g>
    <rect x="44" y="104" width="7" height="10" rx="3" fill="#9fb0c7"/>
    <rect x="69" y="104" width="7" height="10" rx="3" fill="#9fb0c7"/>
    ${sign}
  </svg>`;
}

export function mountDonkey(el, mood = "idle", size = 140) {
  if (!el) return;
  el.innerHTML = donkeySVG(mood, size);
  el.classList.add("donkey");
}

export function speakInto(el, text, { speed = 18 } = {}) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = text;
    return Promise.resolve();
  }
  el.innerHTML = `<span class="bubble-text"></span><span class="cursor">▍</span>`;
  const span = el.querySelector(".bubble-text");
  return new Promise((resolve) => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      span.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(t);
        el.querySelector(".cursor")?.remove();
        resolve();
      }
    }, speed);
  });
}
