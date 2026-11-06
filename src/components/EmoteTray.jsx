import { EMOTES } from '../story/emotes.js';

/** The fixed emoji palette, shown when the player taps an opponent's speech bubble. */
export default function EmoteTray({ onPick, className = '' }) {
  return (
    <div className={`emote-tray ${className}`} role="menu" aria-label="React with an emoji">
      {EMOTES.map(({ e, label }) => (
        <button key={e} type="button" role="menuitem" title={label} aria-label={label} onClick={(ev) => { ev.stopPropagation(); onPick(e); }}>{e}</button>
      ))}
    </div>
  );
}
