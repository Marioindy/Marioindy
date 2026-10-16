#!/usr/bin/env node
// Builds every animated SVG on the profile, in dark (ink) and light (paper).
//
// Style: ÆSHE brand guidelines v1 (ink/paper/canvas/ash, Playfair Display, system
// sans, one orchestrated entrance, ease cubic-bezier(.2,.8,.2,1), reduced motion
// respected) crossed with abstracto.dev's ASCII field: a character field that
// decodes out of noise into the ÆSHE seal.
//
// Zero dependencies. Fonts are subset WOFF2 files embedded as data URIs so the
// SVGs render the same through GitHub's image proxy on any machine.
//
//   node scripts/build.mjs                 # all assets, live calendar (GH_TOKEN or public page)
//   node scripts/build.mjs --only calendar # just the calendar (used by the daily workflow)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "assets");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const USER = args.user ?? process.env.GITHUB_REPOSITORY_OWNER ?? "Marioindy";

// ---------------------------------------------------------------- tokens ----
const BRAND = { ink: "#2B1B1B", paper: "#F7F1EA", canvas: "#E7E4E0", ash: "#726663", oxblood: "#8C2F2F" };
const THEMES = {
  dark: { bg: BRAND.ink, fg: BRAND.paper, sub: "#B9ADA5", line: "#4A3A38", field: BRAND.paper },
  light: { bg: BRAND.paper, fg: BRAND.ink, sub: BRAND.ash, line: "#D9D0C6", field: BRAND.ink },
};
const EASE = "cubic-bezier(.2,.8,.2,1)";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,'Helvetica Neue',Arial,sans-serif";
const SERIF = "'PF','Playfair Display',Georgia,serif";
const MONO = "'JB','JetBrains Mono',ui-monospace,Menlo,Consolas,monospace";

const font = (f) => readFileSync(join(HERE, "fonts", f)).toString("base64");
const FONTS = {
  pf400: font("playfair-400.woff2"),
  pf500: font("playfair-500.woff2"),
  pfi: font("playfair-400-italic.woff2"),
  jb: font("jbmono-400.woff2"),
};
const face = (fam, b64, w = 400, s = "normal") =>
  `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${w};font-style:${s}}`;
// Embed only the faces an asset actually uses: each one costs ~17 KB as base64.
const fontCss = (...want) =>
  want
    .map((w) =>
      ({
        pf400: face("PF", FONTS.pf400),
        pf500: face("PF", FONTS.pf500, 500),
        pfi: face("PF", FONTS.pfi, 400, "italic"),
        jb: face("JB", FONTS.jb),
      })[w],
    )
    .join("");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const write = (name, svg) => {
  writeFileSync(join(OUT, name), svg);
  console.log(`wrote assets/${name} (${(svg.length / 1024).toFixed(1)} KB)`);
};
const REDUCED = `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

// Deterministic noise so rebuilds produce identical files.
const hash = (a, b, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const NOISE = "·.:-=+*";
const RAMP = " .:-=+*#%@";
const SCRAMBLE = ":-=+*#%@";

// ---------------------------------------------------------- seal geometry ---
const sealSvg = readFileSync(join(HERE, "data", "seal.svg"), "utf8");
const SEAL_VB = sealSvg.match(/viewBox="([^"]+)"/)[1];
const SEAL_PATHS = [...sealSvg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const COVER = JSON.parse(readFileSync(join(HERE, "data", "seal-coverage.json"), "utf8"));
// The seal is mirror-symmetric; average each row with its reflection so the
// rasterised glyph field is too.
COVER.grid = COVER.grid.map((row) => row.map((v, c) => (v + row[row.length - 1 - c]) / 2));

// ================================================================= HERO =====
// The field: noise everywhere, decoding row by row into the seal. Left side
// carries the name in Playfair. One entrance, then an ambient shimmer at a
// quarter speed.
function hero(name) {
  const t = THEMES[name];
  const W = 880, H = 420;
  const FS = 10.5, CW = FS * 0.6, CH = FS * 1.12; // JetBrains Mono advance = .6em
  const COLS = Math.ceil(W / CW) + 1, ROWS = Math.ceil(H / CH);
  const markCol = COLS - COVER.cols - 7, markRow = Math.round((ROWS - COVER.rows) / 2) + 2;
  const cover = (r, c) => {
    const rr = r - markRow, cc = c - markCol;
    return rr >= 0 && rr < COVER.rows && cc >= 0 && cc < COVER.cols ? COVER.grid[rr][cc] : 0;
  };

  const rowText = (r, fn) => {
    let s = "";
    for (let c = 0; c < COLS; c++) s += fn(c);
    return s.replace(/\s+$/, "");
  };
  const tline = (r, s, cls, extra = "") =>
    s.trim() ? `<text class="${cls}" x="0" y="${((r + 1) * CH - 2).toFixed(2)}"${extra}>${esc(s)}</text>` : "";

  // three noise frames for the flicker, sparse, never under the name block
  const noise = [0, 1, 2].map((f) =>
    Array.from({ length: ROWS }, (_, r) =>
      tline(r, rowText(r, (c) => (hash(c, r, f + 1) < 0.26 ? NOISE[Math.floor(hash(r, c, f + 9) * NOISE.length)] : " ")), `n n${f}`),
    ).join(""),
  );
  // scramble pass and resolved pass, only where the seal is
  const scramble = [], mark = [];
  for (let r = 0; r < ROWS; r++) {
    const delay = (0.4 + (r - markRow) * 0.02).toFixed(3);
    const sc = rowText(r, (c) => (cover(r, c) > 0.08 ? SCRAMBLE[Math.floor(hash(c, r, 77) * SCRAMBLE.length)] : " "));
    const mk = rowText(r, (c) => {
      const v = cover(r, c);
      return v > 0.08 ? RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.round(v * (RAMP.length - 1))))] : " ";
    });
    scramble.push(tline(r, sc, "sc", ` style="animation-delay:${delay}s"`));
    mark.push(tline(r, mk, "mk", ` style="animation-delay:${(+delay + 0.32).toFixed(3)}s"`));
  }

  const css = `${fontCss("pf400", "pfi", "jb")}
  .f text{font:${FS}px ${MONO};white-space:pre;fill:${t.field}}
  .n{opacity:0}
  .n0{animation:n0 .9s steps(1) both,amb 8s linear 1.4s infinite}
  .n1{animation:n1 .9s steps(1) both}
  .n2{animation:n2 .9s steps(1) both}
  @keyframes n0{0%{opacity:.5}33%{opacity:0}66%{opacity:.3}100%{opacity:.07}}
  @keyframes n1{0%{opacity:0}33%{opacity:.45}66%{opacity:0}100%{opacity:0}}
  @keyframes n2{0%{opacity:0}66%{opacity:.4}100%{opacity:0}}
  @keyframes amb{0%,100%{opacity:.07}50%{opacity:.04}}
  .sc{opacity:0;animation:sc .42s steps(3) both}
  @keyframes sc{0%{opacity:0}30%{opacity:.85}100%{opacity:0}}
  .mk{opacity:0;animation:mk .45s ${EASE} both}
  @keyframes mk{from{opacity:0}to{opacity:.78}}
  .up{opacity:0;animation:up 1.2s ${EASE} both}
  @keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .rule{stroke-dasharray:300;stroke-dashoffset:300;animation:rule 1.2s ${EASE} .35s forwards}
  @keyframes rule{to{stroke-dashoffset:0}}
  .lab{font:500 12px ${SANS};letter-spacing:.72px;fill:${t.sub}}
  .disp{font:400 58px ${SERIF};letter-spacing:-1.5px;fill:${t.fg}}
  .lede{font:400 19px ${SERIF};fill:${t.fg}}
  .it{font-style:italic}
  .body{font:400 14px ${SANS};fill:${t.sub}}
  ${REDUCED}
  @media (prefers-reduced-motion:reduce){.n0{opacity:.07}.mk{opacity:.78}.up{opacity:1}.rule{stroke-dashoffset:0}.sc{display:none}}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Jesiel Carro</title>
<desc id="d">A field of text characters flickers, then decodes row by row into the ÆSHE seal on the right. On the left: Jesiel Carro, engineer in Puerto Rico, working across AI systems, software, research and teaching.</desc>
<style>${css}</style>
<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="4"/></clipPath>
<radialGradient id="rg" cx="${((markCol + COVER.cols / 2) * CW / W).toFixed(3)}" cy=".5" r=".55"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="${W}" height="${H}" fill="url(#rg)"/></mask>
<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="${t.bg}" stop-opacity=".96"/><stop offset=".38" stop-color="${t.bg}" stop-opacity=".9"/><stop offset=".62" stop-color="${t.bg}" stop-opacity="0"/></linearGradient></defs>
<g clip-path="url(#c)">
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<g class="f" aria-hidden="true"><g mask="url(#m)">${noise.join("")}</g>${scramble.join("")}${mark.join("")}</g>
<rect width="${W}" height="${H}" fill="url(#fade)"/>
<g transform="translate(48 0)">
  <text class="lab up" x="0" y="96" style="animation-delay:.05s">ENGINEER  ·  PUERTO RICO</text>
  <text class="disp up" x="-3" y="170" style="animation-delay:.12s">Jesiel Carro</text>
  <line class="rule" x1="0" y1="198" x2="300" y2="198" stroke="${t.line}" stroke-width="1"/>
  <text class="lede up" x="0" y="236" style="animation-delay:.3s">Systems that <tspan class="it">keep working</tspan></text>
  <text class="lede up" x="0" y="262" style="animation-delay:.36s">after you stop watching.</text>
  <text class="body up" x="0" y="306" style="animation-delay:.5s">AI systems · software · research · teaching</text>
  <text class="lab up" x="0" y="${H - 44}" style="animation-delay:.62s">MARIOINDY  ·  ABSTRACTO  ·  ÆSHE</text>
</g>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" fill="none" stroke="${t.line}"/>
</svg>
`;
}

// ============================================================ CALENDAR =====
async function loadCalendar() {
  if (args.fixture) return JSON.parse(readFileSync(args.fixture, "utf8"));
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const LV = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  if (token) {
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-build" },
        body: JSON.stringify({
          query: `query($l:String!){user(login:$l){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionLevel}}}}}}`,
          variables: { l: USER },
        }),
      });
      const cal = (await res.json())?.data?.user?.contributionsCollection?.contributionCalendar;
      if (cal)
        return {
          total: cal.totalContributions,
          days: cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date, weekday: d.weekday, level: LV[d.contributionLevel] ?? 0 }))),
        };
    } catch (e) {
      console.warn(`graphql failed (${e.message}), using public page`);
    }
  }
  const html = await (await fetch(`https://github.com/users/${USER}/contributions`, { headers: { "User-Agent": "profile-build" } })).text();
  const days = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-level="(\d)"/g)].map((m) => ({
    date: m[1],
    weekday: new Date(`${m[1]}T00:00:00Z`).getUTCDay(),
    level: +m[2],
  }));
  if (!days.length) throw new Error("no contribution data");
  days.sort((a, b) => a.date.localeCompare(b.date));
  const m = html.match(/([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i);
  return { total: m ? +m[1].replace(/,/g, "") : null, days };
}

function calendar(name, data) {
  const t = THEMES[name];
  const W = 880, H = 284, PX = 48, GX = 86, GY = 122;
  const first = new Date(`${data.days[0].date}T00:00:00Z`);
  const cells = data.days.map((d) => {
    const n = Math.round((new Date(`${d.date}T00:00:00Z`) - first) / 86400000) + data.days[0].weekday;
    return { ...d, col: Math.floor(n / 7), row: d.weekday };
  });
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const step = (W - PX - GX) / cols, size = step * 0.76;
  const x = (c) => GX + c * step, y = (r) => GY + r * step;
  const gridEnd = x(cols - 1) + size;
  const LEVEL_OP = [0.13, 0.34, 0.56, 0.78, 1];

  const months = [];
  let last = -1;
  for (const c of cells.filter((c) => c.row === 0)) {
    const d = new Date(`${c.date}T00:00:00Z`);
    if (d.getUTCMonth() !== last && c.col < cols - 2) {
      months.push({ col: c.col, label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase() });
      last = d.getUTCMonth();
    }
  }

  // Entrance: columns rise in a diagonal wave (once). Ambient: a hairline scan
  // crosses the year every 14 s and each active day answers with a short flash.
  const LOOP = 14, SWEEP = 6; // seconds; sweep is the part of the loop spent crossing
  const colDelay = (c) => (0.2 + c * 0.01).toFixed(3);
  const scanAt = (c) => (1.6 + (c / cols) * SWEEP).toFixed(3);
  const rects = cells
    .map((c) => {
      const lit = c.level > 0 ? ` lit l${c.level}` : "";
      const anim = `animation-delay:${(+colDelay(c.col) + c.row * 0.02).toFixed(3)}s${c.level ? `,${scanAt(c.col)}s` : ""}`;
      return `<rect class="cell${lit}" x="${x(c.col).toFixed(2)}" y="${y(c.row).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" rx="1.5" style="${anim};opacity:${LEVEL_OP[c.level]}"/>`;
    })
    .join("");
  const flash = LEVEL_OP.slice(1)
    .map(
      (op, i) =>
        `.l${i + 1}{animation:rise .6s ${EASE} both,f${i + 1} ${LOOP}s linear infinite}@keyframes f${i + 1}{0%,100%{opacity:${op}}1.2%{opacity:1}6%{opacity:${op}}}`,
    )
    .join("");
  const lastDate = data.days.at(-1).date;
  const active = cells.filter((c) => c.level > 0).length;

  const css = `${fontCss("pf400", "pfi")}
  .cell{fill:${t.fg};animation:rise .6s ${EASE} both}
  @keyframes rise{from{opacity:0;transform:translateY(6px)}}
  ${flash}
  .up{animation:up 1.2s ${EASE} both}
  @keyframes up{from{opacity:0;transform:translateY(10px)}}
  .lab{font:500 12px ${SANS};letter-spacing:.72px;fill:${t.sub}}
  .h{font:400 26px ${SERIF};letter-spacing:-.4px;fill:${t.fg};font-variant-numeric:lining-nums}
  .it{font-style:italic}
  .m{font:500 10px ${SANS};letter-spacing:.6px;fill:${t.sub}}
  .body{font:400 13px ${SANS};fill:${t.sub}}
  ${REDUCED}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Contribution calendar for ${esc(USER)}</title>
<desc id="d">The last twelve months of ${esc(USER)}'s public GitHub contributions. The grid rises in a wave, then the active days flash in a slow pass across the year. ${active} active days. Snapshot ${lastDate}.</desc>
<style>${css}</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" fill="${t.bg}" stroke="${t.line}"/>
<text class="lab up" x="${PX}" y="40">THE GRID  ·  TWELVE MONTHS</text>
<text class="h up" x="${PX}" y="74" style="animation-delay:.1s">${data.total == null ? "" : `${data.total.toLocaleString("en-US")} contributions, `}<tspan class="it">one commit at a time</tspan></text>
${months.map((m) => `<text class="m" x="${x(m.col).toFixed(1)}" y="${GY - 8}">${m.label}</text>`).join("")}
${rects}
${["MON", "WED", "FRI"].map((d, i) => `<text class="m" x="${PX}" y="${(y(1 + i * 2) + size - 1).toFixed(1)}">${d}</text>`).join("")}
<text class="body" x="${PX}" y="${H - 22}">Redrawn daily from the public calendar  ·  snapshot ${lastDate}</text>
<g transform="translate(${(gridEnd - 5 * 14 - 38).toFixed(1)} ${H - 33})"><text class="m" x="-8" y="10" text-anchor="end">LESS</text>${LEVEL_OP.map((o, i) => `<rect x="${i * 14}" y="0" width="10" height="10" rx="1.5" fill="${t.fg}" opacity="${o}"/>`).join("")}<text class="m" x="${5 * 14 + 4}" y="10">MORE</text></g>
</svg>
`;
}

// =============================================================== WORK =====
// Abstracto-style capability cards: index, ASCII glyph typed in row by row,
// Playfair title, one functional sentence in sans, a caps label.
const ICONS = {
  fleet: [
    "      ┌───┐      ",
    "      │ Æ │      ",
    "  ┌───┴─┬─┴───┐  ",
    "  │     │     │  ",
    "  ◆     ◆     ◆  ",
  ],
  mcp: [
    "  ┌─────┐        ",
    "  │ MCP ├───▶ ◆  ",
    "  └──┬──┘        ",
    "     └──────▶ ◆  ",
    "                 ",
  ],
  map: [
    "  ╭───────────╮  ",
    " ╭╯ ◆───◆───◆ ╰╮ ",
    " ╰──╮   │   ╭──╯ ",
    "    ╰───◆───╯    ",
    "                 ",
  ],
  portfolio: [
    "  ┌───────────┐  ",
    "  │ ○ ○ ○     │  ",
    "  ├───────────┤  ",
    "  │ ▁▂▃▅▇ ░░░ │  ",
    "  └───────────┘  ",
  ],
  meal: [
    "     ~  ~  ~     ",
    "  ─────────────  ",
    "  ╲           ╱  ",
    "   ╲         ╱   ",
    "    ╰───────╯    ",
  ],
  dnd: [
    "  ┌───┬───┬───┐  ",
    "  │░░░│ ◆ │░░░│  ",
    "  ├───┼───┼───┤  ",
    "  │░░░│░░░│░░░│  ",
    "  └───┴───┴───┘  ",
  ],
};
const WORK = [
  { id: "fleet", n: "01", title: "ÆSHE Fleet", line: ["A fleet of named agents that coordinate", "my work, research and teaching."], label: "PRIVATE  ·  PYTHON  ·  AGENTS" },
  { id: "map", n: "02", title: "Puerto Rico Cargo Map", line: ["Interactive logistics and cargo map", "of Puerto Rico, built mobile-first."], label: "PRIVATE  ·  REACT  ·  MAPS" },
  { id: "portfolio", n: "03", title: "Portfolio Website", line: ["Interactive portfolio: blog, project", "showcase, contact form, chatbot."], label: "PUBLIC  ·  NEXT.JS  ·  GSAP  ·  CONVEX" },
  { id: "dnd", n: "04", title: "Shadowkeep", line: ["Real-time campaign manager: sheets,", "shared maps with fog of war, dice."], label: "PUBLIC  ·  NEXT.JS  ·  CONVEX  ·  EXPO" },
];

function workCard(name, w, i) {
  const t = THEMES[name];
  const W = 432, H = 250;
  const icon = ICONS[w.id];
  const base = 0.15 + (i % 2) * 0.12;
  const css = `${fontCss("pf400", "pf500", "jb")}
  .ic{font:13px ${MONO};white-space:pre;fill:${t.fg};opacity:0;animation:type .35s steps(4) both}
  @keyframes type{0%{opacity:0;clip-path:inset(0 100% 0 0)}100%{opacity:.9;clip-path:inset(0 0 0 0)}}
  .up{opacity:0;animation:up 1.1s ${EASE} both}
  @keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .pulse{animation:pulse 3.2s ${EASE} ${(base + 2).toFixed(2)}s infinite}
  @keyframes pulse{0%,100%{opacity:.9}50%{opacity:.35}}
  .rule{stroke-dasharray:${W};stroke-dashoffset:${W};animation:rule 1.2s ${EASE} ${base}s forwards}
  @keyframes rule{to{stroke-dashoffset:0}}
  .n{font:400 13px ${SERIF};fill:${t.sub};font-variant-numeric:lining-nums}
  .ti{font:500 25px ${SERIF};letter-spacing:-.4px;fill:${t.fg}}
  .b{font:400 13.5px ${SANS};fill:${t.sub}}
  .lab{font:500 10px ${SANS};letter-spacing:.6px;fill:${t.sub}}
  ${REDUCED}
  @media (prefers-reduced-motion:reduce){.ic{opacity:.9}.up{opacity:1}.rule{stroke-dashoffset:0}}`;
  const iconRows = icon
    .map(
      (row, r) =>
        `<text class="ic${r === 1 ? " pulse" : ""}" xml:space="preserve" x="0" y="${r * 17}" style="animation-delay:${(base + 0.15 + r * 0.09).toFixed(2)}s${r === 1 ? `,${(base + 2).toFixed(2)}s` : ""}">${esc(row)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${esc(w.title)}</title>
<desc id="d">${esc(w.line.join(" "))} ${esc(w.label.replace(/\s+·\s+/g, ", ").toLowerCase())}.</desc>
<style>${css}</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" fill="${t.bg}" stroke="${t.line}"/>
<text class="n up" x="28" y="40" style="animation-delay:${base}s">${w.n}</text>
<g transform="translate(${W - 28 - 17 * 7.8} 34)" aria-hidden="true">${iconRows}</g>
<text class="ti up" x="28" y="146" style="animation-delay:${(base + 0.35).toFixed(2)}s">${esc(w.title)}</text>
<line class="rule" x1="28" y1="162" x2="${W - 28}" y2="162" stroke="${t.line}"/>
<text class="b up" x="28" y="188" style="animation-delay:${(base + 0.5).toFixed(2)}s">${esc(w.line[0])}</text>
<text class="b up" x="28" y="207" style="animation-delay:${(base + 0.55).toFixed(2)}s">${esc(w.line[1])}</text>
<text class="lab up" x="28" y="${H - 18}" style="animation-delay:${(base + 0.7).toFixed(2)}s">${esc(w.label)}</text>
</svg>
`;
}

// ============================================================== INDEX =====
// "For the record", abstracto.dev's index table in ÆSHE type.
const RECORD = [
  ["DISCIPLINE", "Electrical and computer engineering"],
  ["FOCUS", "AI systems, agents, real-time web apps"],
  ["LANGUAGES", "TypeScript, JavaScript, Python"],
  ["WEB", "React, Next.js, GSAP, Tailwind CSS"],
  ["DATA AND EDGE", "Convex, Cloudflare Workers, D1"],
  ["ROOMS", "Classrooms through labs"],
];
function index(name) {
  const t = THEMES[name];
  const W = 880, ROW = 44, TOP = 96, H = TOP + RECORD.length * ROW + 30;
  const css = `${fontCss("pf400", "pfi")}
  .up{opacity:0;animation:up 1s ${EASE} both}
  @keyframes up{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
  .rule{stroke-dasharray:${W};stroke-dashoffset:${W};animation:rule 1.2s ${EASE} forwards}
  @keyframes rule{to{stroke-dashoffset:0}}
  .lab{font:500 12px ${SANS};letter-spacing:.72px;fill:${t.sub}}
  .h{font:400 26px ${SERIF};letter-spacing:-.4px;fill:${t.fg}}
  .it{font-style:italic}
  .v{font:400 19px ${SERIF};fill:${t.fg};font-variant-numeric:lining-nums}
  ${REDUCED}
  @media (prefers-reduced-motion:reduce){.up{opacity:1}.rule{stroke-dashoffset:0}}`;
  const rows = RECORD.map(([k, v], i) => {
    const yy = TOP + i * ROW, d = (0.2 + i * 0.09).toFixed(2);
    return `<line class="rule" x1="48" y1="${yy}" x2="${W - 48}" y2="${yy}" stroke="${t.line}" style="animation-delay:${d}s"/>
<text class="lab up" x="48" y="${yy + 28}" style="animation-delay:${d}s">${k}</text>
<text class="v up" x="300" y="${yy + 29}" style="animation-delay:${(+d + 0.06).toFixed(2)}s">${esc(v)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">For the record</title>
<desc id="d">${esc(RECORD.map(([k, v]) => `${k.toLowerCase()}: ${v}`).join("; "))}.</desc>
<style>${css}</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" fill="${t.bg}" stroke="${t.line}"/>
<text class="lab up" x="48" y="40">INDEX</text>
<text class="h up" x="48" y="72" style="animation-delay:.08s">For the <tspan class="it">record</tspan></text>
${rows}
<line class="rule" x1="48" y1="${TOP + RECORD.length * ROW}" x2="${W - 48}" y2="${TOP + RECORD.length * ROW}" stroke="${t.line}" style="animation-delay:.8s"/>
</svg>
`;
}

// ============================================================== RIBBON =====
// The seal pattern as a narrow ribbon: upright and inverted seals drifting at
// ambient speed. No copy on it, under 120 px tall, per the guidelines.
function ribbon(name) {
  const t = THEMES[name];
  const W = 880, H = 64;
  const [, , sw, sh] = SEAL_VB.split(" ").map(Number);
  const s = (H - 22) / sh; // seal height inside the band
  const tile = sw * s + 20;
  const n = Math.ceil(W / tile) + 2 + ((Math.ceil(W / tile) + 2) % 2); // even, so the loop is seamless
  const seal = `<g id="p" transform="scale(${s.toFixed(4)})">${SEAL_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  const uses = Array.from({ length: n * 2 }, (_, i) =>
    i % 2
      ? `<use href="#p" transform="translate(${(i * tile + sw * s).toFixed(1)} ${(H - 11).toFixed(1)}) rotate(180)"/>`
      : `<use href="#p" transform="translate(${(i * tile).toFixed(1)} 11)"/>`,
  ).join("");
  const css = `.drift{animation:drift ${(n * 6).toFixed(0)}s linear infinite}
  @keyframes drift{to{transform:translateX(-${(n * tile).toFixed(1)}px)}}
  .in{animation:in 1.2s ${EASE} both}@keyframes in{from{opacity:0}}
  ${REDUCED}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Divider: the ÆSHE seal, upright and inverted, repeating">
<style>${css}</style>
<defs>${seal}<linearGradient id="e" x1="0" x2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset=".12" stop-color="${t.bg}" stop-opacity="0"/><stop offset=".88" stop-color="${t.bg}" stop-opacity="0"/><stop offset="1" stop-color="${t.bg}"/></linearGradient>
<clipPath id="c"><rect width="${W}" height="${H}" rx="4"/></clipPath></defs>
<g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="${t.bg}"/>
<g class="in" fill="${t.fg}" opacity=".9"><g class="drift">${uses}</g></g>
<rect width="${W}" height="${H}" fill="url(#e)"/></g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="4" fill="none" stroke="${t.line}"/>
</svg>
`;
}

// ================================================================ MAIN =====
mkdirSync(OUT, { recursive: true });
const only = args.only;
const data = await loadCalendar();
for (const name of ["dark", "light"]) {
  write(`calendar-${name}.svg`, calendar(name, data));
  if (only === "calendar") continue;
  write(`hero-${name}.svg`, hero(name));
  WORK.forEach((w, i) => write(`work-${w.id}-${name}.svg`, workCard(name, w, i)));
  write(`index-${name}.svg`, index(name));
  write(`ribbon-${name}.svg`, ribbon(name));
}
