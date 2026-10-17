import type { Monster } from "../shared/ui";
import { statLabels } from "../shared/ui";
export function Portrait({
  monster,
  large = false,
}: {
  monster: Monster;
  large?: boolean;
}) {
  return (
    <div className={`portrait ${large ? "large" : ""}`}>
      <div className="sprite-glow" />
      <img src={monster.image} alt={monster.name} />
    </div>
  );
}
export function Stats({ monster }: { monster: Monster }) {
  return (
    <dl className="stats">
      {Object.entries(monster.stats).map(([key, value]) => (
        <div key={key}>
          <dt>{statLabels[key as keyof typeof statLabels]}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function MonsterCard({
  monster,
  onSelect,
}: {
  monster: Monster;
  onSelect: () => void;
}) {
  return (
    <button className="monster-card" onClick={onSelect}>
      <div className="card-top">
        <span className="element">{monster.genes.element}属性</span>
        <span className="generation">
          GEN. {String(monster.generation).padStart(2, "0")}
        </span>
      </div>
      <Portrait monster={monster} />
      <div className="card-info">
        <h3>{monster.name}</h3>
        <p>
          {monster.genes.body}系 <span>·</span>{" "}
          {monster.traits[0]?.name ?? "新たな可能性"}
        </p>
        <Stats monster={monster} />
      </div>
      <span className="card-footer">
        個体の詳細を見る <span>↗</span>
      </span>
    </button>
  );
}
