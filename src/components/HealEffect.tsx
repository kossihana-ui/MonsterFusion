import '../styles/heal-effect.css';

export function healText(amount: number) {
  return amount > 0 ? `＋${amount}` : 'HP満タン';
}
export function HealEffect({ amount }: { amount: number }) {
  return <div className="heal-effect" role="status" aria-label={amount > 0 ? `HPが${amount}回復` : 'HPは満タンです'}>
    <span className="heal-ring" aria-hidden="true" />
    <span className="heal-spark heal-spark-a" aria-hidden="true">✦</span>
    <span className="heal-spark heal-spark-b" aria-hidden="true">✦</span>
    <strong className="heal-number">{healText(amount)}</strong>
  </div>;
}
