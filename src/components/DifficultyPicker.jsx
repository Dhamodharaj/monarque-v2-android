import { DIFFICULTIES, DIFFICULTY_ORDER } from '../config/difficulty.js';
import './difficulty.css';

/** Easy / Normal / Hard segmented selector shared by Battle setup and Story contender select. */
export default function DifficultyPicker({ value, onChange, className = '' }) {
  const current = DIFFICULTIES[value] ?? DIFFICULTIES.easy;
  return (
    <div className={`dp ${className}`}>
      <div className="dp-row" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTY_ORDER.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`dp-opt dp-${id} ${value === id ? 'on' : ''}`} onClick={() => onChange(id)}>
            {DIFFICULTIES[id].label}
          </button>
        ))}
      </div>
      <p className="dp-blurb">{current.blurb}</p>
    </div>
  );
}
