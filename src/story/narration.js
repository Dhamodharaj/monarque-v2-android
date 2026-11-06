// The screenplay (docs/STORY_SCREENPLAY.md) as data. Every authored story beat lives here, so the screens only play it back.
// Beat kinds: m = Monarque speaking, p = the player (their contender), n = narration. `{name}` becomes the contender's name.
// Canon notes: the player's power is their OWN. Monarque only ever overfed the Berserker, and that mistake is what undoes him.

export const fill = (text, name) => String(text).replaceAll('{name}', name ?? 'Contender');

// ---- Intro -------------------------------------------------------------------------------------------------------------------
export const INTRO_BLACK = [
  { k: 't', t: 'MONARQUE: CARDS OF THE FALLEN' },
  { k: 'm', t: 'Is that all? After everything, this is what you are?' },
  { k: 'p', t: 'Not… yet… I can still…' },
  { k: 'm', t: 'No. You cannot.' },
  { k: 'n', t: '' }, // stage direction only: the screen closes, then a black screen (no spoken text)
];
export const INTRO_CELL = {
  caption: ['No sun. No sound. No name.', 'Years.', 'Then, a sliver of light.'],
};
export const INTRO_LIGHT = [
  { k: 'n', t: 'Light. After years of dark, far too much of it.' },
  { k: 'm', t: 'Awake at last. Do you even remember your own name?' },
  { k: 'p', t: '{name}. And you should have finished me when you had the chance!' },
  { k: 'm', t: 'You lasted less than a minute against me. I remember it fondly.' },
  { k: 'p', t: 'Release me! I will tear that throne down with my bare hands!' },
  { k: 'm', t: 'Big words from a chained thing. So here is a mercy, and it is the only one you will ever get.' },
  { k: 'm', t: 'A tournament. Thirty-two who dared defy me, every one of them broken and bound. Defeat them, take their strength for your own, and I will free you myself. Then, if you still wish it, I will accept your challenge.' },
  { k: 'm', t: 'Refuse, and the dark keeps you. Forever.' },
];
export const INTRO_CHOICES = [
  { id: 'accept', label: 'Bring it on, I’ll show you hell!' },
  { id: 'refuse', label: 'Go to hell!' },
];

// ---- Tournament progression: Monarque, proud and arrogant, pushes you to grow ----------------------------------------------------------------------------
/** Said before each round (bracket and scouting screens). Contempt first, then the pleased arrogance of a master watching his weapon sharpen. */
export const ROUND_LINES = [
  '',
  'Begin. Show me what a name like yours is worth, insect.',
  'Sixteen worms remain. Entertain me, or be forgotten.',
  'Still standing? Good. I did not raise this stage for the weak. Climb.',
  'Four remain. Cut them down, take what they carry, and grow. I expect more of you.',
  'The last of the thirty-two. Show me what you took from the bound. Do not disappoint me.',
  'Do not mistake a victory over thirty-one for greatness. You have not yet earned my full interest.',
];
/** Said after you win round N (1-4): the level-up screen. He is pleased by your growth, and he never lets you forget who owns the stage. */
export const WIN_LINES = [
  '',
  'One worm of thirty-two. A beginning, nothing more. Do not mistake it for worth.',
  'Hm. Your hands no longer shake. Good. A blade is worthless until it has been sharpened.',
  'You grow. Of course you grow; I built the stage you are climbing. Keep climbing.',
  'Stronger again. I permit it. Now show me more.',
  '',
];

// ---- After the 5th round: the Berserker ----------------------------------------------------------------------------------------
export const BERSERKER_SCENE = (berserkerName) => [
  { k: 'p', t: 'Enough games, Monarque! Face me yourself! I will show you hell!' },
  { k: 'm', t: 'Still so much noise. You have not earned my full attention. Not yet.' },
  { k: 'n', t: 'Monarque lifts one hand. Far below the arena, in the archive of the bound, a single seal begins to crack.' },
  { k: 'n', t: `A warrior broken long ago is dragged back into the light: ${berserkerName}.` },
  { k: 'm', t: 'You may yet be interesting. One last chance. Defeat this one, and your freedom is yours.' },
  { k: 'n', t: `Monarque pours a third of his own raw power into ${berserkerName}. Health, Soul and abilities swell by half again.` },
  { k: 'n', t: `The warrior’s eyes burn open. ${berserkerName} goes berserk.` },
  { k: 'm', t: 'Defeat this beast, and I will gladly accept your challenge. Impress me.' },
  { k: 'p', t: 'Having your head under my boot is not far off.' },
];
/** Played the moment the Berserker falls, before the power is claimed. */
export const BERSERKER_OUTRO = (berserkerName) => [
  { k: 'n', t: `The beast staggers. The power Monarque forced into ${berserkerName} is still burning through it, with nowhere left to go.` },
  { k: 'n', t: `${berserkerName} falls. The seals close over the card, and for once, nobody was meant to take what is left.` },
  { k: 'm', t: 'That was a third of my strength. It should have been more than enough.' },
  { k: 'n', t: 'It was his mistake, and the flame he fed has not gone out. It waits, hot and unspent, for whoever dares to take it.' },
  { k: 'p', t: 'You gave me this, Monarque. I will return it to you.' },
];
export const BERSERKER_FALLS = (berserkerName) => `After a grueling fight, ${berserkerName} falls. The power Monarque forced into them is still burning. Take that exact power for yourself. It was his mistake, and it is yours now.`;
export const BERSERKER_LEVEL = 'You did not borrow this strength. Your own blood and your own choices carried you through the beast. Monarque’s mistake only handed you its weapon.';

// ---- The turning point: what the tournament was for ------------------------------------------------------------------------------
export const TURNING_POINT = [
  { k: 'n', t: 'Monarque rises from his throne. The scorn is gone from his face. What replaces it is hunger.' },
  { k: 'm', t: 'At last. You have become exactly what I made you to be. A vessel worthy of my power.' },
  { k: 'p', t: 'A vessel?! What the hell are you talking about?!' },
  { k: 'm', t: 'Before existence, there was only AION: a consciousness so vast that it faded beneath its own power. I am the mightiest being born of its Outburst, and even I am not exempt from its law.' },
  { k: 'm', t: 'My Essence is so dense that it eats at my mind. Gods and demons alike shattered the moment I reached into them. None could hold me.' },
  { k: 'm', t: 'A vessel must forge its own capacity, through brutal, compounding strain. So I built a crucible, and I fed you to it.' },
  { k: 'm', t: 'The tournament. The bound. Every bout you won and every power you took was another stone in the vessel I was raising. You were never my prisoner. You were my masterwork.' },
  { k: 'm', t: 'Now your body can hold me. Kneel, and let me take what is mine.' },
];
export const FINAL_TERMS = 'Win any one of three bouts and the seals fail. The Essence gnaws at his mind a little more each time you press him.';
/** Monarque's first words in each bout. Delivered through his speech bubble as the duel opens, not on a separate screen. */
export const BOUT_OPENERS = [
  'Come. Show me the vessel I made. I will take it gladly.',
  'Again? Good. Grow stronger still. I want you at your very best when I take you.',
  'Remarkable. Give me everything you have. It will not be enough, but I wish to see it.',
];
/** Said mid-bout as his health falls (about 70%, 40%, 20%): the Essence gnawing at his mind, and the plan starting to slip. */
export const FADING_LINES = [
  ['Good. Strain. Strain, and grow. This is what the crucible was for.', 'Why does my head… no. Steady. This is still my design.', 'You were meant to kneel! Kneel!'],
  ['The strain is working. I can feel the vessel hold. It will hold me.', 'Quiet. Quiet in my skull. I am not finished.', 'This was not the shape of it. This was never the shape of it!'],
  ['Even now you stand. Perfect. Perfect, so why do my hands shake?', 'I remember… the stage. The stone. I remember building you.', 'I am the crown of the Outburst. I do not break. I do not…'],
];

// ---- The final blow: begins the instant the last bout is won ----------------------------------------------------------------------
export const FINAL_BLOW = [
  { k: 'p', t: 'Pathetic.' },
  { k: 'm', t: 'Impossible… I am the crown of the Outburst! A creation does not defy its maker!' },
  { k: 'p', t: 'You built a cage, Monarque. You forgot who you locked inside it.' },
  { k: 'n', t: 'The berserker power he so carelessly fed, and the strength forged from your own blood and choices, tear through his last defence.' },
  { k: 'n', t: 'You land the final blow.' },
];

// ---- Ending ---------------------------------------------------------------------------------------------------------------------
export const ENDING = [
  { k: 'n', t: 'As Monarque falls, his absolute authority over Essence shatters.' },
  { k: 'n', t: 'Across the universe, the glowing seals on the cards fracture and burst into dust. The dark magic sustaining the prison grid collapses entirely.' },
  { k: 'n', t: 'The eighty bound entities materialize, breathing free air for the first time in eons. The tournament fighters break free of his control and step out of the shadows.' },
  { k: 'n', t: 'Gods return to their divine realms. Demons sink back to their domains. Yokai, spirits and ancient monsters vanish back to their native worlds.' },
  { k: 'n', t: 'The tournament is over. The fallen are free.' },
  { k: 'n', t: 'The champion stands alone amid the ruins of a tyrant’s empire, having done the impossible: slain the king of existence, and proven that no mortal soul was ever meant to be owned.' },
  { k: 'n', t: 'MONARQUE: Cards of the Fallen. A game by dhamo ss.' },
];
export const KEEPSAKE_PROMPT = 'Carry the memory of one power with you into every run to come.';

// All authored lines, for tests (placeholders, length, no stray tokens).
export const ALL_NARRATION = () => [
  ...INTRO_BLACK, ...INTRO_LIGHT, ...BERSERKER_SCENE('X'), ...BERSERKER_OUTRO('X'), ...TURNING_POINT, ...FINAL_BLOW, ...ENDING,
].map((b) => b.t).concat(INTRO_CELL.caption, INTRO_CHOICES.map((c) => c.label), ROUND_LINES, WIN_LINES, BOUT_OPENERS, FADING_LINES.flat(), [FINAL_TERMS, BERSERKER_FALLS('X'), BERSERKER_LEVEL, KEEPSAKE_PROMPT]).filter(Boolean);
