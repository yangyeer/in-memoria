/* ------------------------------------------------------------------
   Justified-rows collage builder, manifest-driven.

   Reads images/martin/manifest.json. Falls back to numbered files
   1..MAX_PHOTOS if the manifest is missing or malformed, so the
   page never breaks.
   ------------------------------------------------------------------ */

const COLLAGE      = document.getElementById("collage");
const MAX_PHOTOS   = 21;
const PHOTOS_PATH  = "images/martin";
const FORMAT = "jpg"
const MANIFEST_URL = `${PHOTOS_PATH}/manifest.json`;

const GAP_DESKTOP               = 12;
const GAP_MOBILE                = 5;
const TARGET_ROW_HEIGHT_DESKTOP = 460;
const TARGET_ROW_HEIGHT_MOBILE  = 180;
const MOBILE_MQ = window.matchMedia("(max-width: 768px)");

const LAST_ROW_POLICY = "justify";

function layoutParams() {
    return MOBILE_MQ.matches
        ? { gap: GAP_MOBILE,  targetHeight: TARGET_ROW_HEIGHT_MOBILE  }
        : { gap: GAP_DESKTOP, targetHeight: TARGET_ROW_HEIGHT_DESKTOP };
}

/* ---------- manifest ---------- */
function normaliseEntry(raw, i = 0) {
    if (typeof raw === "string") {
        return { src: raw, caption: "", alt: `Фотография Мартина ${i + 1}` };
    }
    const src = raw.file || raw.src || raw.name;
    if (!src) throw new Error(`manifest[${i}] has no "file"`);
    return {
        src,
        caption: raw.caption ?? "",
        alt:     raw.alt ?? raw.caption ?? `Фотография Мартина ${i + 1}`,
    };
}

async function loadManifest() {
    try {
        const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw  = Array.isArray(data) ? data : data.photos;
        if (!Array.isArray(raw) || !raw.length) throw new Error("no photos array");
        return raw.map(normaliseEntry);
    } catch (err) {
        console.warn("[collage] manifest unavailable, using numbered files:", err);
        return Array.from({ length: MAX_PHOTOS }, (_, i) =>
            normaliseEntry({ file: `${i + 1}.${FORMAT}` }, i),
        );
    }
}

/* ---------- aspect measurement ---------- */
function loadAspect(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload  = () => resolve(img.naturalWidth / img.naturalHeight || 4 / 3);
        img.onerror = () => resolve(null);   // missing → 4:3, paw placeholder shows
        img.src = src;
    });
}

/* ---------- row solving ---------- */
function computeRows(aspects, containerWidth, targetHeight, gap) {
    const rows = [];
    let current = [];
    let currentAspectSum = 0;

    const flush = () => {
        if (!current.length) return;
        const available = containerWidth - gap * (current.length - 1);
        rows.push({ items: current, height: available / currentAspectSum });
        current = [];
        currentAspectSum = 0;
    };

    for (let i = 0; i < aspects.length; i++) {
        const aspect = aspects[i];
        const tentativeAspectSum = currentAspectSum + aspect;
        const tentativeCount     = current.length + 1;
        const available          = containerWidth - gap * (tentativeCount - 1);
        const tentativeHeight    = available / tentativeAspectSum;
        if (current.length && tentativeHeight < targetHeight) flush();
        current.push(i);
        currentAspectSum += aspect;
    }

    if (current.length) {
        if (LAST_ROW_POLICY === "justify") {
            flush();
        } else if (LAST_ROW_POLICY === "start") {
            const available     = containerWidth - gap * (current.length - 1);
            const naturalHeight = available / currentAspectSum;
            rows.push({
                items: current,
                height: Math.min(naturalHeight, targetHeight),
                align: "start",
            });
        }
    }
    return rows;
}

/* ---------- render ---------- */
function render(entries) {
    const width = COLLAGE.clientWidth;
    if (!width) return;

    const { gap, targetHeight } = layoutParams();
    const aspects = entries.map((e) => e.aspect);
    const rows    = computeRows(aspects, width, targetHeight, gap);

    COLLAGE.innerHTML = "";
    COLLAGE.style.position = "relative";

    let top = 0;
    for (const row of rows) {
        const rowHeight = row.height;
        let left = 0;

        for (const idx of row.items) {
            const entry     = entries[idx];
            const itemWidth = entry.aspect * rowHeight;

            const figure = document.createElement("figure");
            figure.className = "photo reveal";
            figure.style.position = "absolute";
            figure.style.left     = `${left}px`;
            figure.style.top      = `${top}px`;
            figure.style.width    = `${itemWidth}px`;
            figure.style.height   = `${rowHeight}px`;
            figure.style.margin   = "0";

            const ph = document.createElement("div");
            ph.className = "ph";
            ph.style.setProperty("--photo", `url("${PHOTOS_PATH}/${entry.src}")`);
            ph.setAttribute("role", "img");
            ph.setAttribute("aria-label", entry.alt);
            figure.appendChild(ph);

            if (entry.caption) {
                const cap = document.createElement("figcaption");
                cap.textContent = entry.caption;
                figure.appendChild(cap);
            }

            COLLAGE.appendChild(figure);
            left += itemWidth + gap;
        }
        top += rowHeight + gap;
    }

    COLLAGE.style.height = `${Math.max(0, top - gap)}px`;
    document.dispatchEvent(new CustomEvent("collage:ready"));
}

/* ---------- build ---------- */
let entriesCache = [];

async function build() {
    const entries = await loadManifest();
    const ready = await Promise.all(
        entries.map(async (entry) => {
            const aspect = await loadAspect(`${PHOTOS_PATH}/${entry.src}`);
            return { ...entry, aspect: aspect ?? 4 / 3 };
        }),
    );
    entriesCache = ready;
    render(ready);
}

/* ---------- reflow ---------- */
let rafId = 0;
function invalidate() {
    if (!entriesCache.length) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => render(entriesCache));
}

if ("ResizeObserver" in window) {
    let lastWidth = 0;
    new ResizeObserver((entries) => {
        const w = entries[0].contentRect.width;
        if (Math.abs(w - lastWidth) < 1) return;
        lastWidth = w;
        invalidate();
    }).observe(COLLAGE);
} else {
    window.addEventListener("resize", invalidate);
}

MOBILE_MQ.addEventListener("change", invalidate);

build();
