import { labelFor } from "@core/core/index.ts";
import type { Element } from "@core/core/index.ts";

export function MoveBadges({ element, scaling }: { element: Element; scaling: "attack" | "magic" }) {
  return <span className="move-badges">
    <span className="move-type" data-element={element}>{labelFor("element", element)}</span>
    <span className="move-category"><span aria-hidden="true">{scaling === "magic" ? "✦" : "⚔"}</span> {scaling === "magic" ? "魔法" : "物理"}</span>
  </span>;
}
