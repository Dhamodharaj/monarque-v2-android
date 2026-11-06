export default function CardBack({ small = false }) {
  return <div className={`card-back ${small ? 'small' : ''}`}><div className="card-back-mark">DB</div></div>;
}
