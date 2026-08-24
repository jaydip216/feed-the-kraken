import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FACTIONS, DIRECTIONS, NAV_ACTIONS, MAP_ACTIONS, CULT_RITUALS,
  MOVEMENT_STEPS, SYMBOLS, TIPS, THE_MAP,
} from '@ftk/shared';
import type { Faction } from '@ftk/shared';
import { HexMap } from './HexMap.js';

const CHAPTERS = ['The goal', 'Your team', 'A round', 'The cards', 'The map', 'Secrets', 'Tips'] as const;
type Chapter = typeof CHAPTERS[number];

export function GuideSurface() {
  const [ch, setCh] = useState<Chapter>('The goal');
  return (
    <div className="wrap anim-in" style={{ maxWidth: 900 }}>
      <div className="topbar">
        <span className="h2" style={{ color: 'var(--gold-2)' }}>📖 How to play</span>
        <Link className="btn ghost" style={{ textDecoration: 'none', padding: '6px 14px' }} to="/">← Back</Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {CHAPTERS.map(c => (
          <button key={c} className={`btn ${ch === c ? '' : 'ghost'}`} style={{ padding: '8px 14px', fontSize: 14 }}
            onClick={() => setCh(c)}>{c}</button>
        ))}
      </div>

      {ch === 'The goal' && <Goal />}
      {ch === 'Your team' && <Teams />}
      {ch === 'A round' && <Round />}
      {ch === 'The cards' && <Cards />}
      {ch === 'The map' && <MapChapter />}
      {ch === 'Secrets' && <Secrets />}
      {ch === 'Tips' && <TipsChapter />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="panel anim-in" style={{ marginBottom: 14 }}>
      <h2 className="h2" style={{ marginBottom: 8 }}>{title}</h2>
      {children}
    </div>
  );
}

function Row({ symbol, title, text }: { symbol: string; title: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #ffffff14' }}>
      <div style={{ fontSize: 26, width: 38, textAlign: 'center', flexShrink: 0 }}>{symbol}</div>
      <div>
        <b>{title}</b>
        <p className="sub" style={{ fontSize: 13, margin: '2px 0 0' }}>{text}</p>
      </div>
    </div>
  );
}

function Goal() {
  return (
    <>
      <Section title="One ship, three secret agendas">
        <p className="quote" style={{ fontSize: 16 }}>
          "I needed a resourceful crew to complete this journey — but some of these folks seem to have other plans with my ship…"
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.7 }}>
          Everyone is secretly a <b>Sailor</b>, a <b>Pirate</b> or the <b>Cult Leader</b>. Each round the crew
          picks a navigation team, that team secretly chooses a direction, and the ship sails one space.
          Steer it to your faction's shore and your whole team wins.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.7 }}>
          This app only holds the secrets. <b>Every discussion, accusation and lie happens out loud, face to face.</b>
          Your phone stays dark most of the game — it lights up only when a decision is yours.
        </p>
      </Section>
      <Section title="How the ship moves">
        <div style={{ display: 'grid', gap: 8 }}>
          {(['north', 'west', 'east'] as const).map(d => (
            <div key={d} className="seat">
              <span style={{ fontSize: 24, color: DIRECTIONS[d].color }}>{DIRECTIONS[d].symbol}</span>
              <b>{DIRECTIONS[d].label}</b>
              <span className="muted" style={{ marginLeft: 'auto' }}>→ {DIRECTIONS[d].dest}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function Teams() {
  return (
    <Section title="The four roles">
      {(Object.keys(FACTIONS) as Faction[]).map(f => (
        <div key={f} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #ffffff14' }}>
          <div style={{ fontSize: 30, width: 44, textAlign: 'center' }}>{FACTIONS[f].symbol}</div>
          <div>
            <b style={{ color: FACTIONS[f].color }}>{FACTIONS[f].title}</b>
            <div style={{ fontSize: 13, color: 'var(--gold-2)' }}>Wins: {FACTIONS[f].win}</div>
            <p className="sub" style={{ fontSize: 13, margin: '4px 0 0' }}>{FACTIONS[f].text}</p>
          </div>
        </div>
      ))}
      <p className="sub" style={{ marginTop: 12 }}>
        At the start, the Pirates secretly learn each other. Sailors and the Cult know no one — they must work it out.
      </p>
    </Section>
  );
}

function Round() {
  const steps = [
    { n: '1', t: 'Appoint the navigation team', d: 'The captain picks a lieutenant and a navigator. They cannot pick themselves or anyone off-duty.' },
    { n: '2', t: 'A question of loyalty', d: 'Every other player secretly commits 0 or more guns. All counts are revealed at once — if the total hits the threshold, the biggest gun holder becomes the new captain and the round restarts.' },
    { n: '3', t: 'The navigation', d: 'In silence: the captain draws two cards and discards one, the lieutenant does the same, the two survivors are shuffled, and the navigator discards one. The last card is revealed to everyone.' },
    { n: '4', t: 'Execute', d: 'Movement steps I, II and III — move the ship, resolve the icon on the new space, then resolve the card’s own action.' },
    { n: '5', t: 'Off-duty', d: 'The navigation team takes a break and cannot be picked next round. The badges return to the captain.' },
  ];
  return (
    <>
      <Section title="Each round, in order">
        {steps.map(s => (
          <div key={s.n} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #ffffff14' }}>
            <span className="num" style={{ width: 28, height: 28 }}>{s.n}</span>
            <div><b>{s.t}</b><p className="sub" style={{ fontSize: 13, margin: '2px 0 0' }}>{s.d}</p></div>
          </div>
        ))}
      </Section>
      <Section title="Movement steps (printed on the board)">
        {MOVEMENT_STEPS.map(m => <Row key={m.symbol} symbol={m.symbol} title={m.title} text={m.text} />)}
      </Section>
      <Section title="Denial of command">
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          🏊 The navigator may refuse to carry out the orders and jump overboard instead. Both cards go to the Deep Sea,
          the navigator leaves the game and must stay silent forever, and the captain immediately names an
          <b> emergency navigator</b> — with no new mutiny.
        </p>
      </Section>
    </>
  );
}

function Cards() {
  return (
    <>
      <Section title="Navigation card actions">
        {(Object.keys(NAV_ACTIONS) as (keyof typeof NAV_ACTIONS)[]).map(k =>
          <Row key={k} symbol={NAV_ACTIONS[k].symbol} title={NAV_ACTIONS[k].title} text={NAV_ACTIONS[k].text} />)}
      </Section>
      <Section title="Map space actions">
        {(Object.keys(MAP_ACTIONS) as (keyof typeof MAP_ACTIONS)[]).map(k =>
          <Row key={k} symbol={MAP_ACTIONS[k].symbol} title={MAP_ACTIONS[k].title} text={MAP_ACTIONS[k].text} />)}
      </Section>
      <Section title="Cult ritual cards">
        {(Object.keys(CULT_RITUALS) as (keyof typeof CULT_RITUALS)[]).map(k =>
          <Row key={k} symbol={CULT_RITUALS[k].symbol} title={CULT_RITUALS[k].title} text={CULT_RITUALS[k].text} />)}
      </Section>
    </>
  );
}

function MapChapter() {
  return (
    <Section title="Reading the board">
      <div style={{ height: 420 }}><HexMap shipSpace={THE_MAP.startId} showNumbers /></div>
      <p className="sub" style={{ marginTop: 10, fontSize: 13 }}>
        Every space shows three arrows and each navigation moves the ship exactly one row north, so a
        voyage is always <b>six navigations</b> long. Yellow ⬆ sails straight on, red ↖ one space to port,
        blue ↗ one to starboard. The far coast holds the destinations: <b>three spaces</b> for Crimson Cove
        (25–27), a <b>single</b> Kraken space (28), and <b>three</b> for Bluewater Bay (29–31). Icons trigger
        when the ship lands on them, and the dashed supply line refills every crew back up to three guns the
        first time the ship crosses it.
      </p>
    </Section>
  );
}

function Secrets() {
  const rows: [string, string, string][] = [
    ['🔍', 'Cabin search', 'The table sees WHO the captain searched. Only the captain sees the faction — and may lie about it freely.'],
    ['🪢', 'Flogging', 'Fully public: everyone learns one faction that player does NOT belong to.'],
    ['🧜', 'Mermaid / 🔭 Telescope', 'The table sees who was chosen. Only that player sees the cards; what they then say may be a lie.'],
    ['🐙', 'Cult ritual', 'The table sees which ritual card was flipped. The Cult Leader’s choice stays secret.'],
    ['🔫', 'Guns', 'Public at all times — except during a mutiny, when every count is hidden until the simultaneous reveal.'],
    ['📜', 'Résumés', 'The face-up cards in front of each captain are permanent public history. They never return to the deck.'],
  ];
  return (
    <>
      <Section title="What is public and what is not">
        {rows.map(r => <Row key={r[1]} symbol={r[0]} title={r[1]} text={r[2]} />)}
      </Section>
      <Section title="Joining the Cult">
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          If a <b>Conversion to Cult</b> ritual picks you, you stop being a Sailor or Pirate and win only with the Cult.
          Because the ritual has you open your eyes and recognise your new master, <b>a converted Cultist is told who the
          Cult Leader is</b>. In an 11-player game the Cultist dealt at setup is <i>not</i> — they and the leader must
          find each other during the game, exactly like the Sailors.
        </p>
        <p className="sub" style={{ fontSize: 13 }}>
          Anyone already examined by a Cabin Search or a Flogging can never be converted.
        </p>
      </Section>
      <Section title="Silence rules are on your honour">
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          {SYMBOLS.silence} During navigation the team must not speak or signal. A player who loses their tongue may not
          say words, and someone fed to the Kraken must never reveal anything. The app shows these states but does not
          enforce them — that part is up to the crew.
        </p>
      </Section>
    </>
  );
}

function TipsChapter() {
  return (
    <Section title="Tips and tricks">
      {TIPS.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #ffffff14' }}>
          <div style={{ fontSize: 22, width: 34, textAlign: 'center' }}>
            {t.faction === 'all' ? '💡' : FACTIONS[t.faction].symbol}
          </div>
          <div>
            <b style={{ fontSize: 13, color: t.faction === 'all' ? 'var(--gold-2)' : FACTIONS[t.faction].color }}>
              {t.faction === 'all' ? 'Everyone' : FACTIONS[t.faction].title}
            </b>
            <p style={{ fontSize: 14, margin: '2px 0 0', lineHeight: 1.6 }}>{t.text}</p>
          </div>
        </div>
      ))}
    </Section>
  );
}
