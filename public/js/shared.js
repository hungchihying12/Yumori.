export async function requireUser() {
  const r = await fetch("/api/me");
  if (!r.ok) { location.href = "/index.html"; throw new Error("redirect"); }
  return r.json();
}

export function navbar(me) {
  return `
    <nav class="topbar">
      <a href="/home.html">🏠 Home</a>
      <a href="javascript:history.back()">← Back</a>
      <span class="spacer"></span>
      <a href="/profile.html" title="Profile">
        ${me.avatar ? `<img src="${me.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle" />` : "👤"}
        ${me.username}
      </a>
    </nav>`;
}
