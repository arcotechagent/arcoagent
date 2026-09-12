# Contributing to Arco

Thanks for taking a look. This repo is small on purpose — a static site and
the script that bakes its art assets — so the bar for contributing is low.

## Reporting an issue

Open a GitHub issue with what you expected, what happened instead, and your
browser/OS if it's a rendering bug. A screenshot helps more than a paragraph.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Since there's no build step, just open `index.html` in a browser (or run
   `npx http-server .`) to see your change.
3. If you touched `scripts/bake-art.mjs` or added a source painting, run
   `npm install && npm run bake-art` and commit the regenerated PNGs under
   `public/art/` along with your change.
4. Keep the palette strict — red (`#c1272d` / `#ef5459` / `#8f1c21`) and ink
   (`#0a0a0e`) only. No third color, no white/cream/gold fills.
5. Open a pull request describing what changed and why.

## Style notes

- Headings use Fraunces, everything else uses Space Mono — keep that split.
- One entrance animation on the hero is enough; avoid adding hover
  animation to every card. Respect `prefers-reduced-motion` in anything new.
- The six feature blocks are a single straight column by design — don't
  reintroduce left/right alternating rows.

## Code of conduct

Be direct, be kind, assume good faith. Disagreements about implementation
are welcome; personal attacks aren't.
