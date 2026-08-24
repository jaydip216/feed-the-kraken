import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="wrap center" style={{ paddingTop: 60 }}>
      <div style={{ fontSize: 48 }}>🐙</div>
      <h1 className="h1">Feed the Kraken</h1>
      <p className="sub">In-room companion · choose this device's role</p>
      <div className="grid" style={{ maxWidth: 360, margin: '28px auto', gridTemplateColumns: '1fr' }}>
        <Link className="btn block" to="/table">🖥️ &nbsp;This is the table (laptop)</Link>
        <Link className="btn block ghost" to="/play">📱 &nbsp;I'm a player (phone)</Link>
        <Link className="btn block ghost" to="/host">⚙️ &nbsp;Host controls</Link>
        <Link className="btn block ghost" to="/guide">📖 &nbsp;How to play</Link>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>All play happens face to face. This app only manages hidden info.</p>
    </div>
  );
}
