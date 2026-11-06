import { useEffect, useState } from 'react';
import ProfilePanel from '../components/ProfilePanel';
import { gameSounds } from '../utils/sound.js';
import { AUTHOR, MUSIC_CREDIT } from '../config/gameConfig.js';
import { FEATS, HALL_RULES, emptyProgress } from '../services/progress.js';

export default function Home({ progress = null, onStory, onStart, onOpenShop, onOpenInfo, profile, stats, settings, history, onSaveProfile, onToggleAnimations, onReset }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [featsOpen, setFeatsOpen] = useState(false);
  const prog = progress ?? emptyProgress();
  const doneCount = FEATS.filter((f) => prog.feats[f.id]).length;
  // The menu soundtrack now lives in the shared audio engine (utils/sound.js); this button is its global mute.
  const [soundEnabled, setSoundEnabled] = useState(() => !gameSounds.isMuted());
  useEffect(() => gameSounds.subscribe(() => setSoundEnabled(!gameSounds.isMuted())), []);
  const toggleSound = () => { gameSounds.unlock(); gameSounds.toggleMute(); };

  return (
    <main className="home-screen home-screen-art" aria-label="MONARQUE: Cards of the Fallen main menu">
      {/* The wallpaper contains no menu controls: every button and hover state is real UI. */}
      <nav className="home-hotspots" aria-label="Main menu">
        <div className="home-menu-options">
          <button className="home-menu-button" onClick={onStart}><span>Battle Mode</span><i aria-hidden="true" /></button>
          {onStory && <button className="home-menu-button" onClick={onStory}><span>Story Mode</span><i aria-hidden="true" /></button>}
          <button className="home-menu-button" onClick={onOpenShop}><span>Gallery</span><i aria-hidden="true" /></button>
          <button className="home-menu-button" onClick={onOpenInfo}><span>Rules</span><i aria-hidden="true" /></button>
          <button className="home-menu-button" onClick={() => setSettingsOpen(true)}><span>Settings</span><i aria-hidden="true" /></button>
        </div>
        <div className="home-utility-options">
          <button className="home-utility-button home-achievement-button" onClick={() => setFeatsOpen(true)} aria-label="Feats and unlocks" title="Feats and unlocks">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l5.2 5.2 7.3-.2.2 7.3L42 22l-5.3 5.2.2 7.3-7.3.2L24 40l-5.2-5.3-7.3.2-.2-7.3L6 22l5.3-5.2-.2-7.3 7.3-.2L24 4z"/><path d="M24 13l3.2 6.5 7.2 1-5.2 5.1 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1L24 13z"/><path d="M12 29l-4 12 9-4 7 6 2-9M36 29l4 12-9-4-7 6"/></svg>
          </button>
          <button className="home-utility-button home-profile-button" onClick={() => setProfileOpen(true)} aria-label="Profile and statistics" title="Profile and statistics">
            <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="15" r="8"/><path d="M9 42v-4c0-8 6-13 15-13s15 5 15 13v4"/></svg>
          </button>
          <button className={`home-utility-button home-sound-button ${soundEnabled ? '' : 'is-muted'}`} onClick={toggleSound} aria-label={soundEnabled ? 'Mute menu music' : 'Unmute menu music'} title={soundEnabled ? 'Mute music' : 'Unmute music'} aria-pressed={soundEnabled}>
            <svg viewBox="0 0 48 48" aria-hidden="true">{soundEnabled ? <><path d="M6 19h9l11-9v28l-11-9H6z"/><path d="M32 17c4 4 4 10 0 14M36 11c8 7 8 19 0 26"/></> : <><path d="M6 19h9l11-9v28l-11-9H6z"/><path d="M32 18l10 12M42 18L32 30"/></>}</svg>
          </button>
        </div>
      </nav>

      <p className="game-signature" aria-label={`A game by ${AUTHOR}`}>A game by <b>{AUTHOR}</b> · © 2026 · All rights reserved</p>
      <a className="home-insta" href="https://www.instagram.com/cards_of_fallen?exln=ZmRyYWxkbmw3cnh6" target="_blank" rel="noopener noreferrer" aria-label="Follow Cards of the Fallen on Instagram" title="Follow on Instagram">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r="1.1" className="dot" /></svg>
        <span>@cards_of_fallen</span>
      </a>
      <p className="music-credit">Music: “{MUSIC_CREDIT.title}” by {MUSIC_CREDIT.composer}</p>

      {settingsOpen && (
        <div className="home-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="home-dialog" role="dialog" aria-modal="true" aria-labelledby="home-settings-title">
            <button className="home-dialog-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
            <p className="eyebrow">THE ORDER OF THINGS</p>
            <h2 id="home-settings-title">Settings</h2>
            <p className="home-dialog-copy">Adjust presentation options.</p>
            <div className="home-setting-row"><span><strong>Round animations</strong><small>Show the winning card animation after each round.</small></span><button className={`setting-toggle ${settings.animations ? 'on' : ''}`} onClick={onToggleAnimations} aria-pressed={settings.animations}>{settings.animations ? 'ON' : 'OFF'}</button></div>
            <button className="primary-button home-dialog-done" onClick={() => setSettingsOpen(false)}>Done</button>
          </section>
        </div>
      )}

      {featsOpen && (
        <div className="home-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFeatsOpen(false); }}>
          <section className="home-dialog home-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="home-feats-title">
            <button className="home-dialog-close" onClick={() => setFeatsOpen(false)} aria-label="Close feats">×</button>
            <p className="eyebrow">DEEDS OF THE FALLEN</p><h2 id="home-feats-title">Feats · {doneCount}/{FEATS.length}</h2>
            <p className="home-dialog-copy">Each feat pays coins once. Harder difficulties pay more for every match, and some feats open new halls.</p>
            <div className="feat-list">
              {FEATS.map((f) => { const done = Boolean(prog.feats[f.id]); const [have, need] = f.progress(prog.counters, prog); return (
                <div key={f.id} className={`feat ${done ? 'done' : ''}`}><span><strong>{done ? '✓ ' : ''}{f.name}</strong><small>{f.desc}{!done && need > 1 ? ` (${Math.min(have, need)}/${need})` : ''}</small></span><span className="feat-r">+{f.reward} ●</span></div>
              ); })}
            </div>
            <p className="home-dialog-copy">Halls: {Object.keys(HALL_RULES).filter((id) => HALL_RULES[id].need).length} of 6 are earned by winning. Locked halls show what they need on the Battle setup screen.</p>
            <div className="sm-row"><button className="secondary-button" onClick={() => { setFeatsOpen(false); onOpenInfo?.(); }}>Rules &amp; guide</button><button className="primary-button home-dialog-done" onClick={() => setFeatsOpen(false)}>Done</button></div>
          </section>
        </div>
      )}

      {profileOpen && (
        <div className="home-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section className="home-dialog home-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="home-profile-title">
            <button className="home-dialog-close" onClick={() => setProfileOpen(false)} aria-label="Close profile">×</button>
            <p className="eyebrow">THE RECORD</p><h2 id="home-profile-title">Your Record</h2>
            <ProfilePanel profile={profile} stats={stats} settings={settings} history={history} onSaveProfile={onSaveProfile} onToggleAnimations={onToggleAnimations} onReset={onReset} />
          </section>
        </div>
      )}
    </main>
  );
}
