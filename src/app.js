/* ─── 1. 3rd-party ESM bundles ───────────────────────────────────────── */
import Sigma from "sigma";
import Graph from "graphology";
import FA2 from "graphology-layout-forceatlas2";
import { random } from "graphology-layout";
import noverlap from 'graphology-layout-noverlap';

import data from "./data.json";            // the JSON file with the data

const sdbm = str => {
    let arr = str.split("");
    return arr.reduce(
        (hashCode, currentVal) =>
        (hashCode =
            currentVal.charCodeAt(0) +
            (hashCode << 6) +
            (hashCode << 16) -
            hashCode),
        0
    );
};
/* ─── 3. Small helpers (palette, size, gradients) ────────────────────── */
const FAC_COLORS = [
    "#191970", "#006400", "#ff0000",
    "#ffd700", "#00ff00", "#00ffff",
    "#ff00ff", "#ffb6c1",
];
const facColor = new Map();
let idx = 0;
function colorFor(fac) {
    if (!facColor.has(fac))
        facColor.set(fac, FAC_COLORS[idx++ % FAC_COLORS.length]);
    return facColor.get(fac);
}
function radius(count) {
    const n = Number(count);
    return isFinite(n) && n > 0 ? Math.max(8, Math.sqrt(n) * 1.2) : 8;
}

/* ─── 4. Build the Graphology graph ──────────────────────────────────── */
const g = new Graph({ multi: false, type: "undirected" });
const seen = new Set();                       // dedup edges

data.forEach(row => {
    const id = row.study;
    const facs = row.faculty ?? [];
    const size = radius(row.student_count ? row.student_count / 1.5 : 1);
    const color = colorFor(facs[0])

    if (!g.hasNode(id))
        g.addNode(id, { label: id, size, color });
});

data.forEach(row => {
    (row["related studies"] ?? []).forEach(rel => {
        if (!g.hasNode(rel))
            g.addNode(rel, { label: rel, size: 8, color: "#bbbbbb" });
        const key = (sdbm(row["study"]) + sdbm(rel)) + "";
        console.log(key)
        if (!seen.has(key)) {
            g.addEdge(row["study"], rel);
            seen.add(key);
        }
    });
});

/* ─── 5. Run ForceAtlas-2 in a worker, then start Sigma ──────────────── */
random.assign(g, { scale: 1 });
FA2.assign(g, { iterations: 500, settings: { barnesHutOptimize: true, outboundAttractionDistribution: true } });
noverlap.assign(g)

let hovered = null;                        // id of the node under the cursor
let neighbors = new Set();                 // its 1-hop neighbourhood

const renderer = new Sigma(g, document.getElementById("container"), {
    labelRenderedSizeThreshold: 14,
    defaultEdgeType: "line",
    zIndex: "canvas"
});

/* --- node / edge reducers ---------------------------------------------- */
renderer.setSetting("nodeReducer", (node, data) => {
    if (!hovered) return data;              // nothing highlighted yet
    if (node === hovered || neighbors.has(node)) return data;   // keep original

    // fade all others
    return {
        ...data, color: data.color,   // keep colour but
        label: "",                    // hide label
        hidden: false,
        zIndex: 0,
        // Sigma ignores alpha in colour string, so use `invisible` flag:
        // Instead, we set a very small size:
        size: data.size * 0.5,
        color: "#cccccc"
    };
});



renderer.setSetting("edgeReducer", (edge, data) => {
    if (!hovered) return data;
    const { source, target } = g.extremities(edge);
    if (source === hovered || target === hovered) return data;
    return { ...data, hidden: false, color: "#E0E0E0" };
});

renderer.on("enterNode", ({ node }) => {
    hovered = node;
    neighbors = new Set(g.neighbors(node));
    renderer.refresh();                     // re-run the reducers
});

renderer.on("leaveNode", () => {
    hovered = null;
    neighbors.clear();
    renderer.refresh();
});