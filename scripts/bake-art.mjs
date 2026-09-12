// One-time offline asset pipeline: download public-domain Renaissance
// paintings from Wikimedia Commons and bake them into the ARCO 2-color
// duotone + halftone treatment as static PNGs in public/art/.
//
// Run once with `npm run bake-art`. Re-run only if you change the crops
// below or want to swap a source painting; the output PNGs are committed
// like any other static asset, no build-time processing happens at runtime.
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const UA =
  "ArcoSiteBuild/1.0 (+https://github.com/arcotechagent/arcoagent; one-time asset fetch for open-source landing page)";

const RED = { r: 0xc1, g: 0x27, b: 0x2d };

// `contrast` tunes each source toward a bold ink/red poster look rather than
// a washed-out pale duotone. sharp's tint() preserves relative luminance, so
// naturally dark oil paintings (creation, school) need a lighter touch, while
// the pale parchment/pastel sources (vitruvian, venus) need much more
// contrast + darkening pushed in first or they stay mostly pale pink.
const SOURCES = {
  creation: {
    url: "https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg",
    credit: "Michelangelo, The Creation of Adam (Sistine Chapel, c.1512)",
    contrast: { linA: 1.9, linB: -95, brightness: 0.72 },
  },
  venus: {
    url: "https://upload.wikimedia.org/wikipedia/commons/1/14/Birth_of_Venus_Botticelli.jpg",
    credit: "Sandro Botticelli, The Birth of Venus (c.1485)",
    contrast: { linA: 2.4, linB: -150, brightness: 0.55 },
  },
  vitruvian: {
    url: "https://upload.wikimedia.org/wikipedia/commons/2/22/Da_Vinci_Vitruve_Luc_Viatour.jpg",
    credit: "Leonardo da Vinci, Vitruvian Man (c.1490)",
    contrast: { linA: 2.4, linB: -150, brightness: 0.55 },
  },
  school: {
    url: "https://upload.wikimedia.org/wikipedia/commons/6/68/Raffael_058.jpg",
    credit: "Raphael, The School of Athens (1509-1511)",
    contrast: { linA: 1.9, linB: -95, brightness: 0.72 },
  },
};

// Each output: which source painting, target aspect ratio, crop focus
// (sharp gravity keyword: north/south/east/west/centre/northeast/...), and
// final pixel width.
const OUTPUTS = [
  // Native App platform cards — square
  { name: "vitruvian-square", source: "vitruvian", ratio: [1, 1], position: "north", width: 900 },
  { name: "venus-square", source: "venus", ratio: [1, 1], position: "centre", width: 900 },
  { name: "school-square", source: "school", ratio: [1, 1], position: "north", width: 900 },

  // Feature preview — 16:9, six slots pulling varied crops for visual variety
  { name: "creation-16x9-a", source: "creation", ratio: [16, 9], position: "centre", width: 1400 },
  { name: "venus-16x9", source: "venus", ratio: [16, 9], position: "centre", width: 1400 },
  { name: "vitruvian-16x9", source: "vitruvian", ratio: [16, 9], position: "centre", width: 1400 },
  { name: "school-16x9", source: "school", ratio: [16, 9], position: "north", width: 1400 },
  {
    name: "creation-16x9-b",
    source: "creation",
    ratio: [16, 9],
    position: "centre",
    width: 1400,
    // tight "spark of creation" detail crop on the hands, in original-pixel
    // coordinates (full source is 3524x1599) — distinct from creation-16x9-a
    extract: { left: 900, top: 300, width: 1500, height: 1000 },
  },
  { name: "vitruvian-16x9-b", source: "vitruvian", ratio: [16, 9], position: "south", width: 1400 },

  // Interlude full-bleed banner — wide
  { name: "school-wide", source: "school", ratio: [21, 9], position: "centre", width: 2000 },

  // Portal visual — 4:5
  { name: "venus-portrait", source: "venus", ratio: [4, 5], position: "centre", width: 1200 },
];

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Renaissance-fresco duotone: push contrast (and darken pale sources) first,
// then sharp's tint() remaps luminance onto a single ink->red hue ramp. Note:
// tint() must run on a still-colour image — calling grayscale() beforehand
// forces a b-w output colourspace that silently cancels the tint.
async function duotoneHalftone(buffer, { ratio, position, width, contrast, extract }) {
  const height = Math.round((width * ratio[1]) / ratio[0]);

  let pipeline = sharp(buffer);
  if (extract) pipeline = pipeline.extract(extract);
  pipeline = pipeline.resize(width, height, { fit: "cover", position });
  if (contrast.brightness) pipeline = pipeline.modulate({ brightness: contrast.brightness });
  pipeline = pipeline.linear(contrast.linA, contrast.linB).tint(RED);

  const duotone = await pipeline.toBuffer();

  // Halftone dot-screen overlay: a small tileable dot pattern multiplied
  // over the duotone image, matching the site's `#grain` SVG pattern.
  const dotSize = 7;
  const dotSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${dotSize}" height="${dotSize}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <circle cx="${dotSize / 2}" cy="${dotSize / 2}" r="1.1" fill="#000000" fill-opacity="0.55"/>
    </svg>
  `);
  const dotTile = await sharp(dotSvg).png().toBuffer();
  const halftone = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([{ input: dotTile, tile: true, blend: "over" }])
    .png()
    .toBuffer();

  const final = await sharp(duotone)
    .composite([{ input: halftone, blend: "multiply" }])
    .png({ quality: 88, compressionLevel: 9 })
    .toBuffer();

  return final;
}

async function main() {
  const outDir = path.resolve("public/art");
  await mkdir(outDir, { recursive: true });

  const cache = new Map();
  for (const [key, src] of Object.entries(SOURCES)) {
    console.log(`Downloading ${key}...`);
    cache.set(key, await fetchBuffer(src.url));
  }

  for (const out of OUTPUTS) {
    const outPath = path.join(outDir, `${out.name}.png`);
    if (existsSync(outPath)) {
      console.log(`Skip ${out.name} (already baked)`);
      continue;
    }
    console.log(`Baking ${out.name}...`);
    const buf = await duotoneHalftone(cache.get(out.source), {
      ...out,
      contrast: SOURCES[out.source].contrast,
    });
    await writeFile(outPath, buf);
  }

  const creditsPath = path.join(outDir, "CREDITS.txt");
  const credits = Object.values(SOURCES)
    .map((s) => `${s.credit} — public domain — ${s.url}`)
    .join("\n");
  await writeFile(creditsPath, credits + "\n");

  console.log("Done. Baked art in public/art/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
