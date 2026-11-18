import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/instrument-serif/400.css';
import './styles/main.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion, hasWebGL, isSmallScreen, readPosterData } from './core/env.js';
import { createScroll } from './core/scroll.js';
import { createPreloader } from './ui/preloader.js';
import { initStory } from './ui/story.js';
import { initExhibition } from './ui/exhibition.js';
import { initHallB } from './ui/hallb.js';
import { initStudio } from './ui/studio.js';
import { initLightbox } from './ui/lightbox.js';
import { initCursor, initTour, initRewind, initEmail, initVHS } from './ui/extras.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const html = document.documentElement;
html.classList.replace('no-js', 'js');

const reduced = prefersReducedMotion();
html.classList.toggle('reduced', reduced);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const posters = readPosterData();
const preloader = createPreloader({ reduced });
const scroll = createScroll({ reduced });

// Never let the preloader trap anyone: whatever happens, lift it by 7s.
const failsafe = wait(7000).then(() => preloader.finish());

// Canvas textures in the 3D scene use the web fonts, so load them first.
const fonts = Promise.race([
  Promise.all([
    document.fonts?.load('800 100px "Archivo Variable"'),
    document.fonts?.load('500 20px "IBM Plex Mono"'),
    document.fonts?.load('400 100px "Instrument Serif"'),
  ]).catch(() => {}),
  wait(2500),
]);

async function bootStage() {
  if (!hasWebGL()) {
    html.classList.add('no-webgl');
    return null;
  }
  try {
    const [{ createStage }, { loadModels }] = await Promise.all([import('./three/stage.js'), import('./three/models.js')]);
    preloader.progress(0.3);
    // The imported car/ship (~1.5 MB). If they fail, the built-in models are used.
    const models = await loadModels((p) => preloader.progress(0.3 + p * 0.4)).catch((err) => {
      console.warn('[galleria] could not load 3D models, using built-in ones:', err);
      return null;
    });
    await fonts;
    const stage = createStage(document.querySelector('.stage__canvas'), { reduced, mobile: isSmallScreen(), models });
    preloader.progress(0.75);
    return stage;
  } catch (err) {
    console.warn('[galleria] 3D stage disabled:', err);
    html.classList.add('no-webgl');
    return null;
  }
}

preloader.progress(0.15);
const stage = await bootStage();
await fonts;

const story = initStory({ stage, scroll, reduced });
initExhibition({ scroll, reduced, posters });
initHallB({ scroll, reduced });
initStudio({ reduced });
const lightbox = initLightbox({ posters, scroll });
initCursor({ reduced });
initTour({ scroll, reduced });
initRewind({ scroll, reduced });
initEmail();
initVHS();

if (stage) {
  gsap.ticker.add(stage.tick);
  stage.warmUp();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => stage.resize(), 120);
  });
  window.addEventListener(
    'pointermove',
    (e) => stage.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1),
    { passive: true }
  );
  if (import.meta.hot) import.meta.hot.dispose(() => stage.dispose());
}

ScrollTrigger.refresh();
story.measure();

// Section anchors on load (#exhibition etc.); deep links to a work open the viewer.
const hash = location.hash;
if (hash && !hash.startsWith('#work/')) {
  const target = document.querySelector(hash);
  if (target) scroll.to(target, { immediate: true });
} else {
  window.scrollTo(0, 0);
}

await Promise.race([preloader.finish(), failsafe]);
story.intro();
lightbox.openFromHash();
