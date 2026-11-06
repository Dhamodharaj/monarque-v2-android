import { useState } from 'react';

export default function ProfilePanel({ profile, stats, settings, history, onSaveProfile, onToggleAnimations, onReset }) {
  const [name, setName] = useState(profile.name);
  const [open, setOpen] = useState(false);

  const submitName = (event) => {
    event.preventDefault();
    onSaveProfile(name);
  };

  const confirmReset = () => {
    if (window.confirm('Reset your profile, statistics, settings and match history?')) {
      onReset();
      setName('Player');
    }
  };

  const winRate = stats.matchesPlayed ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0;

  return (
    <section className="profile-panel">
      <button className="profile-toggle" onClick={() => setOpen((value) => !value)}>
        <span><strong>{profile.name}</strong><small>{stats.matchesPlayed} matches • {winRate}% win rate</small></span>
        <span>● {profile.walletCoins ?? 0} coins&nbsp;&nbsp; {open ? 'Hide' : 'Profile & Stats'} {open ? '↑' : '↓'}</span>
      </button>
      {open && (
        <div className="profile-content">
          <form className="profile-form" onSubmit={submitName}>
            <label>Player name<input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} /></label>
            <button className="secondary-button" type="submit">Save Name</button>
          </form>
          <div className="profile-settings">
            <span><strong>Round animations</strong><small>Show the winning card animation after each round.</small></span>
            <button className={`setting-toggle ${settings.animations ? 'on' : ''}`} onClick={onToggleAnimations} aria-pressed={settings.animations}>{settings.animations ? 'ON' : 'OFF'}</button>
          </div>
          <div className="wallet-banner"><div><strong>COIN WALLET</strong><small>Persistent coins earned from completed matches. This wallet is the economy balance for Gallery purchases.</small></div><b>● {profile.walletCoins ?? 0}</b></div>
          <div className="stats-grid">
            <div><strong>{stats.matchesPlayed}</strong><span>Matches</span></div>
            <div><strong>{stats.matchesWon}</strong><span>Wins</span></div>
            <div><strong>{stats.matchesLost}</strong><span>Losses</span></div>
            <div><strong>{winRate}%</strong><span>Win rate</span></div>
            <div><strong>{stats.roundsWon}</strong><span>Rounds won</span></div>
            <div><strong>{stats.cardsBanished}</strong><span>Cards banished</span></div>
            <div><strong>{stats.drawsUsed}</strong><span>Draws used</span></div>
            <div><strong>{stats.coinsEarned}</strong><span>Coins earned</span></div>
          </div>
          {history.length > 0 && (
            <div className="history-section">
              <div className="section-label">Recent matches</div>
              <div className="history-list">
                {history.slice(0, 8).map((match) => (
                  <div className="history-row" key={match.id}>
                    <span>{match.mode === 2 ? 'Duel' : `${match.mode} vessels`}</span>
                    <strong className={match.result === 'WIN' ? 'history-win' : 'history-loss'}>{match.result}</strong>
                    <span>{new Date(match.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="danger-button" onClick={confirmReset}>Reset Local Data</button>
        </div>
      )}
    </section>
  );
}
