// Dev-only: capture timed frames of each SVG as it renders inside an <img>, the
// way GitHub shows it. Usage: node scripts/preview.mjs <playwright-core dir> <outdir>
import { createRequire } from "node:module";
import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [pwDir, outDir] = process.argv.slice(2);
const { chromium } = createRequire(import.meta.url)(resolve(pwDir));
const assets = resolve("assets");
const times = (process.env.TIMES ?? "300,800,1400,4000").split(",").map(Number);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--allow-file-access-from-files"] });
for (const f of readdirSync(assets).filter((f) => f.endsWith(".svg") && (!only || only.test(f)))) {
  const page = await browser.newPage({ viewport: { width: 900, height: 440 }, deviceScaleFactor: 1 });
  const html = join(outDir, "frame.html");
  writeFileSync(html, `<html><body style="margin:10px;background:#888"><img id="i" src="file://${join(assets, f)}" width="880"></body></html>`);
  const t0 = Date.now();
  await page.goto(`file://${html}`);
  await page.waitForFunction(() => document.getElementById("i").complete);
  for (const ms of times) {
    const wait = ms - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.locator("#i").screenshot({ path: join(outDir, `${f.replace(".svg", "")}@${ms}.png`) });
  }
  await page.close();
}
await browser.close();
