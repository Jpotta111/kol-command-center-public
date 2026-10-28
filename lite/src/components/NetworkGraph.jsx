import { useEffect, useRef } from "react";
import * as d3 from "d3";

export const CATEGORY = {
  seed: { color: "#0f6b66", label: "Your starting researchers" },
  shared: { color: "#d9822b", label: "Shared collaborators" },
  other: { color: "#9aa5b1", label: "Other collaborators" },
};

export default function NetworkGraph({ people, edges, selectedId, onSelect }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const selRef = useRef({ node: null, link: null, label: null });

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const width = wrapRef.current.clientWidth;
    const height = wrapRef.current.clientHeight;
    svg.attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");
    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 6])
      .on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    const nodes = people.map((p) => ({ ...p }));
    const topShared = new Set(people.filter((p) => p.category === "shared").slice(0, 20).map((p) => p.id));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ ...e }));

    const radius = (n) =>
      n.isSeed ? 11 : n.category === "shared" ? 5 + Math.min(8, n.seedsConnected.length * 1.6) : 3.5;

    const link = g
      .append("g")
      .attr("stroke", "#c7ced6")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-opacity", 0.55)
      .attr("stroke-width", (d) => Math.min(5, 0.6 + Math.sqrt(d.weight)));

    const node = g
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", radius)
      .attr("fill", (d) => CATEGORY[d.category].color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("cursor", "pointer")
      .on("click", (_, d) => onSelect(d.id));

    node.append("title").text((d) => `${d.display_name}${d.institution ? `, ${d.institution}` : ""}`);

    const label = g
      .append("g")
      .selectAll("text")
      // Label every starting researcher, but only the top 20 shared collaborators to avoid clutter.
      .data(nodes.filter((n) => n.isSeed || topShared.has(n.id)))
      .join("text")
      .text((d) => d.display_name)
      .attr("font-size", (d) => (d.isSeed ? 11 : 9.5))
      .attr("font-weight", (d) => (d.isSeed ? 600 : 400))
      .attr("fill", "#12212b")
      .attr("paint-order", "stroke")
      .attr("stroke", "#f7f8f9")
      .attr("stroke-width", 3)
      .attr("pointer-events", "none")
      .attr("text-anchor", "middle");

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((l) => (l.source.isSeed && l.target.isSeed ? 180 : 95))
          .strength(0.4)
      )
      .force("charge", d3.forceManyBody().strength((d) => (d.isSeed ? -600 : -140)))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d) => radius(d) + 3))
      .on("tick", () => {
        link
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
        label.attr("x", (d) => d.x).attr("y", (d) => d.y - radius(d) - 4);
      })
      .on("end", () => {
        // Fit the finished layout to the available space.
        const xs = nodes.map((n) => n.x);
        const ys = nodes.map((n) => n.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const pad = 60;
        const k = Math.min(2, 0.95 / Math.max((x1 - x0 + pad * 2) / width, (y1 - y0 + pad * 2) / height));
        const t = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(k)
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        svg.transition().duration(600).call(zoom.transform, t);
      });

    node.call(
      d3
        .drag()
        .on("start", (e, d) => {
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    selRef.current = { node, link, label };
    return () => sim.stop();
  }, [people, edges, onSelect]);

  // Highlight the selected person and their direct connections.
  useEffect(() => {
    const { node, link, label } = selRef.current;
    if (!node) return;
    if (!selectedId) {
      node.attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1.5);
      link.attr("stroke-opacity", 0.55).attr("stroke", "#c7ced6");
      label.attr("opacity", 1);
      return;
    }
    const neighbors = new Set([selectedId]);
    link.each((l) => {
      if (l.source.id === selectedId) neighbors.add(l.target.id);
      if (l.target.id === selectedId) neighbors.add(l.source.id);
    });
    node
      .attr("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.15))
      .attr("stroke", (d) => (d.id === selectedId ? "#12212b" : "#fff"))
      .attr("stroke-width", (d) => (d.id === selectedId ? 3 : 1.5));
    link
      .attr("stroke-opacity", (l) => (l.source.id === selectedId || l.target.id === selectedId ? 0.9 : 0.06))
      .attr("stroke", (l) => (l.source.id === selectedId || l.target.id === selectedId ? "#0f6b66" : "#c7ced6"));
    label.attr("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.15));
  }, [selectedId, people, edges]);

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" onClick={(e) => e.target.tagName === "svg" && onSelect(null)} />
      <div className="absolute bottom-3 left-3 bg-white/95 border border-gray-200 rounded-lg px-3 py-2 text-xs space-y-1">
        {Object.values(CATEGORY).map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.color }} />
            {c.label}
          </div>
        ))}
        <p className="text-gray-400 pt-1">Scroll to zoom. Drag to move. Click a dot for details.</p>
      </div>
    </div>
  );
}
