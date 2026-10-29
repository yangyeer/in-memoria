/* ------------------------------------------------------------------
   Reveal-on-scroll.

   Runs once on DOMContentLoaded for static markup, and again every
   time the collage rebuilds (it re-creates its .reveal figures after
   image loading and after every resize).
   ------------------------------------------------------------------ */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let io = null;
let counter = 0;

function getObserver() {
    if (io) return io;
    if (!("IntersectionObserver" in window) || reduceMotion) return null;
    io = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add("in");
                io.unobserve(entry.target);
            }
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    return io;
}

function observeReveals(root = document) {
    const observer = getObserver();
    const items = root.querySelectorAll(".reveal:not(.in)");
    for (const el of items) {
        // load-collage.js sets its own per-photo delay; don't clobber it.
        if (!el.style.transitionDelay) {
            el.style.transitionDelay = (counter % 7) * 70 + "ms";
        }
        counter++;
        if (!observer) {
            el.classList.add("in");
            continue;
        }
        observer.observe(el);
    }
}

/* Initial pass — hero, memory panel, footer. */
observeReveals();

/* Collage re-renders dispatch this event from load-collage.js. */
document.addEventListener("collage:ready", () => observeReveals());
