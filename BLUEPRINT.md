# Galleria — the 100-point blueprint

The brief: 50 points on what Galleria needs to be **usable and safe**, and 50 on how to push it to its **full potential**. The build followed this list. `[x]` means it ships in this repo, and `[ ]` is a next step.

---

## Part A — Usable & safe (50)

### Content you can manage without touching code
- [x] 1. One content file, `content/posters.json`, drives every poster on the page.
- [x] 2. One-command import: `npm run posters` resizes, converts and registers new work.
- [x] 3. EXIF/GPS metadata is stripped from every published image (privacy).
- [x] 4. Images are capped at 2400 px, so full-resolution originals never go online.
- [x] 5. The importer warns when a file is portrait, because the layout is built for landscape.
- [x] 6. Identity (name, email, socials, location) lives in `content/site.json`.
- [x] 7. Every content value is validated and HTML-escaped at build time. URLs must be http(s) and image paths must be site paths or https.
- [x] 8. Ships with on-brand placeholder posters, so the site never looks broken before real work arrives.

### Performance
- [x] 9. Device-pixel-ratio cap (1.75 desktop, 1.5 mobile) keeps GPU fill-rate sane.
- [x] 10. Adaptive quality: if frames average under ~40 fps, it steps down resolution and particle count.
- [x] 11. The WebGL loop stops when the 3D story is scrolled out of view (and browsers pause it in hidden tabs).
- [x] 12. Lean 3D: the imported car and ship are optimised from 67 MB to 1.5 MB total (simplified, quantised, meshopt-compressed). Code-built versions are a fallback if they fail to load.
- [x] 13. Gallery images use `loading="lazy"` and `decoding="async"`.
- [x] 14. Every image has width/height, so there's no layout shift.
- [x] 15. Responsive `srcset`/`sizes` (800/1600/2400) mean phones never download desktop files.
- [x] 16. Self-hosted, subset fonts with `font-display: swap`, so no third-party font requests.
- [x] 17. three.js is code-split into its own chunk. The page paints before the 3D boots.
- [x] 18. GPU resources are disposed on hot reload/teardown, so memory doesn't leak.

### Accessibility
- [x] 19. `prefers-reduced-motion` is respected: no smooth-scroll easing, no shake, no streaks, no autoplay tour, calmer sea.
- [x] 20. Scrolling stays native. Lenis only eases the wheel, and keyboard/space/page keys work as normal.
- [x] 21. Skip link ("Skip to the posters"), visible focus rings, logical tab order.
- [x] 22. The viewer is a native `<dialog>`: Esc closes, focus is trapped, then returned to the poster you opened.
- [x] 23. Meaningful alt text per poster, from the manifest.
- [x] 24. Contrast checked. Orange on ink is 6.2:1, and orange text on bone uses a deeper `#c2380a`.
- [x] 25. The 3D canvas is decorative (`aria-hidden`). The story is told in real headings and text.
- [x] 26. Semantic landmarks (header/nav/main/section/footer) and a clean heading outline.
- [x] 27. Nothing is conveyed only by motion. Telemetry also exists as screen-reader text.
- [x] 28. Touch targets ≥ 44 px, and swipe left/right in the viewer.
- [x] 29. No flashing above 3 Hz. Every blink runs at ≤ 1.6 Hz and the scans are slow sweeps.
- [x] 30. The custom cursor is additive. The native cursor always stays.

### Resilience
- [x] 31. WebGL feature detection with a designed static fallback (no blank hero).
- [x] 32. WebGL context loss/restore is handled.
- [x] 33. Works without JavaScript: the gallery is rendered into the HTML at build time.
- [x] 34. A failed image shows a labelled "Image unavailable" tile instead of a broken icon.
- [x] 35. Debounced resize/orientation handling for the canvas and every scroll trigger.
- [x] 36. Mobile-safe viewport units (`svh`/`dvh`) for iOS toolbars. *(Not yet tested on a physical iPhone.)*
- [x] 37. The preloader can't trap anyone: a JS failsafe lifts it at 7 s, plus a CSS-only one at 9 s.

### Security & privacy
- [x] 38. Strict Content-Security-Policy in production builds. Scripts, styles, fonts and images come from self only, and there are no inline scripts or styles. The one allowance is `'wasm-unsafe-eval'`, so the model decoder can compile WebAssembly; it doesn't allow JavaScript `eval`.
- [x] 39. Zero third-party trackers, CDNs or font services. No visitor data leaves the site.
- [x] 40. External links use `rel="noopener noreferrer"`.
- [x] 41. Security headers (CSP with `frame-ancestors`, nosniff, Referrer-Policy, Permissions-Policy, HSTS) in `public/_headers` (Netlify/Cloudflare) and `vercel.json`.
- [x] 42. The email address isn't a plain `mailto:` in the HTML. It's assembled at runtime.
- [x] 43. The client never uses `innerHTML` with data. All DOM is built with `textContent`/`createElement`.
- [x] 44. Dependencies are locked in `package-lock.json`, and `npm audit` reports 0 vulnerabilities.
- [x] 45. Poster images are non-draggable and the long-press callout is disabled. This only deters copying; it doesn't stop it.

### Findability
- [x] 46. Title, description, canonical, Open Graph and Twitter card tags, plus a generated 1200×630 share image.
- [x] 47. JSON-LD `ImageGallery` with an `ImageObject` per poster, generated from the manifest.
- [x] 48. `robots.txt`, SVG favicon, `theme-color`.
- [x] 49. Headings are real text, not baked into images or canvas.
- [x] 50. README with run/build/deploy steps and how to swap in your posters.

---

## Part B — Full potential (50)

### The 3D story
- [x] 51. Particle morph: the car breaks up nose-first into ~18,000 pixels that re-form bow-first as the ship.
- [x] 52. Dissolve shader with a glowing orange scan edge on both solid models.
- [x] 53. Scroll-scrubbed camera choreography: hero 3/4 → low side tracking → chase cam → pull-back → aerial orbit.
- [x] 54. Speed lines, kerbs, track grid and "GALLERIA" hoardings rush past. Their intensity follows speed and your scroll velocity.
- [x] 55. Ocean drawn as animated contour lines (matches the flat print style), with a Kelvin wake and bow wave.
- [x] 56. A striped sunset disc behind the ship, echoing the "SXG/High" circle reference.
- [x] 57. Wheels spin, the car vibrates at speed, the rain light blinks; the ship bobs, rolls and its mast lamp pulses.
- [x] 58. Toon shading with a 4-step ramp, so the 3D reads like the flat references.
- [x] 59. Live telemetry: km/h, gear and RPM, then morph %, coordinates and a boot log, then knots.
- [x] 60. The world changes tone (ink → sea-dark), and the fog opens up as the scale changes.

### Graphic system
- [x] 61. Design tokens: signal orange, ink, bone, sage, graphite, used everywhere.
- [x] 62. Archivo variable (weight + width axes) for both the condensed numerals and the grotesk headlines.
- [x] 63. IBM Plex Mono for every label: the "technical manual" voice.
- [x] 64. Printer's-mark frame around the viewport, with crosshair corners and rotated edge labels (live run %).
- [x] 65. Phase timeline (Velocity / Transit / Scale / Exhibition) doubling as progress bar and navigation.
- [x] 66. Crossing tape bands whose marquee speed reacts to scroll velocity.
- [x] 67. Story chapters styled as the four sticker strips: system label, technical manual, document, boarding pass.
- [x] 68. Ticket-stub notches, barcodes (generated per poster) and boarding-pass layouts in pure CSS/SVG.
- [x] 69. Split-flap "departures board" lettering.
- [x] 70. One "Galleria print" treatment for every poster (palette tone, halftone screen, grain, vignette, set in `content/site.json`), so different designs read as one series. A hover loupe and a viewer toggle show the untouched original.

### The exhibition
- [x] 71. A departures board lists every work. Click a row to fly to it.
- [x] 72. Pinned horizontal "grand reel": each poster near full screen with its ticket stub.
- [x] 73. Velocity skew on the reel, parallax inside each frame, drifting stubs.
- [x] 74. Giant outlined exhibit numerals behind each work.
- [x] 75. Wipe reveal per exhibit as it enters.
- [x] 76. The background changes per exhibit (ink / orange / bone / graphite / sage).
- [x] 77. Contact-sheet finale styled as a film strip with sprocket holes.
- [x] 78. Viewer with click-to-zoom and pointer pan for inspecting print detail.
- [x] 79. Shareable deep links: `#work/<id>` opens that poster directly.
- [x] 80. On phones the reel becomes a vertical stack, with no horizontal scroll-jacking.
- [x] 81. Exhibit counter and progress rail in the reel.

### Delight
- [x] 82. "Play tape": an auto-scrolling tour through the whole story. Any input pauses it.
- [x] 83. "Rewind tape": scrolls back to the top, playing the morph in reverse (ship → pixels → car).
- [x] 84. The whole page is an E-180 tape: a live timecode counts 00:00:00:00 → 03:00:00:00.
- [x] 85. Easter egg: type `vhs` for scanlines, chromatic type and a tracking bar.
- [x] 86. The boarding pass shows today's date. The departures board runs a live clock.
- [x] 87. "Works per year" chart generated from your manifest.

### Tooling
- [x] 88. `scripts/snapshot.mjs` screenshots every chapter (desktop + mobile) and reports console/CSP errors.

### Added since
- [x] Hall B for portrait posters: a pinned slider where each work arrives in vertical strips with glowing edges, letter-by-letter title swaps, a rolling counter, a thumbnail rail and ambient colour. It crossfades with reduced motion, works with ←/→ and the board, and is a plain list without JavaScript.
- [x] "Message from the artist": opposing lines of type behind a framed image and a signature drawn on scroll, generated from your name or `content/signature.svg`.
- [x] Hall B stopper: one wheel gesture moves one poster, and touch/keys settle to the nearest poster.
- [x] Contact sheet in justified rows: every poster at its true shape, nothing cropped.
- [x] Signature in a real signature typeface, inked along traced centre lines.
- [x] The wall: works scattered at different depths on paper, with the one at screen centre in colour, captions and a quote with a small signature, over topographic contour lines.

### Next steps
- [x] 89. Real GLB models (CC BY 4.0, credited in the footer), restyled to the site: toon shading, palette colours, livery repainted with "GALLERIA", spinning wheels split out of the merged mesh. Rebuild with `npm run models`.
- [ ] 90. Output AVIF alongside WebP (~20% smaller).
- [ ] 91. Blur-up LQIP previews embedded per poster.
- [ ] 92. View Transitions API morph from thumbnail to viewer.
- [ ] 93. Opt-in sound design (engine → foghorn), muted by default.
- [ ] 94. Print shop or inquiry flow per poster (Shopify Buy Button / Stripe link).
- [ ] 95. CMS hookup (Decap, Sanity, or a Google Sheet) for non-technical updates.
- [ ] 96. Cookie-free analytics (Plausible / self-hosted Umami), if you want numbers.
- [ ] 97. Auto-generated Open Graph image per poster for social sharing.
- [ ] 98. Lighthouse CI budget (performance ≥ 90, accessibility 100) on every deploy.
- [ ] 99. Light "paper" theme and a second language for the labels.
- [ ] 100. Drag to orbit the car or ship when the scroll is at rest.
