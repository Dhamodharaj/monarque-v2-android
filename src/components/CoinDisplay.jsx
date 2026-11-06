export default function CoinDisplay({ coins }) {
  return <span className="coin-display"><span className="coin-icon" aria-hidden="true">★</span><span className="coin-value">{Number(coins ?? 0).toLocaleString()}</span></span>;
}
