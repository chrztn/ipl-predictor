import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, update } from "firebase/database";

// ─── PASTE YOUR FIREBASE CONFIG HERE ───────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBkoy-GmCN34UNRDpeu6i7twq9nAK668ik",
  authDomain: "ipl-predictor-994a8.firebaseapp.com",
  projectId: "ipl-predictor-994a8",
  storageBucket: "ipl-predictor-994a8.firebasestorage.app",
  messagingSenderId: "935308129716",
  appId: "1:935308129716:web:8c57b699f7d57451bf2ee1",
  measurementId: "G-FF6YMYCQFB"
};
// ────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const IPL_TEAMS = [
  { code: "MI",   name: "Mumbai Indians",              color: "#004BA0", accent: "#D1AB3E" },
  { code: "CSK",  name: "Chennai Super Kings",         color: "#F9CD05", accent: "#00416A" },
  { code: "RCB",  name: "Royal Challengers Bengaluru", color: "#EC1C24", accent: "#1A1A1A" },
  { code: "KKR",  name: "Kolkata Knight Riders",       color: "#3A225D", accent: "#B3A123" },
  { code: "DC",   name: "Delhi Capitals",              color: "#0078BC", accent: "#EF1C25" },
  { code: "PBKS", name: "Punjab Kings",                color: "#ED1B24", accent: "#A7A9AC" },
  { code: "RR",   name: "Rajasthan Royals",            color: "#254AA5", accent: "#EA1A85" },
  { code: "SRH",  name: "Sunrisers Hyderabad",         color: "#F7A721", accent: "#E95B0C" },
  { code: "GT",   name: "Gujarat Titans",              color: "#1C1C1C", accent: "#1DA462" },
  { code: "LSG",  name: "Lucknow Super Giants",        color: "#A72B2A", accent: "#FBBF24" },
];
const teamMap = Object.fromEntries(IPL_TEAMS.map((t) => [t.code, t]));

export default function App() {
  const [tab, setTab] = useState("predict");
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);

  // Admin form
  const [newPlayer, setNewPlayer] = useState("");
  const [matchTeam1, setMatchTeam1] = useState("MI");
  const [matchTeam2, setMatchTeam2] = useState("CSK");
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [matchLabel, setMatchLabel] = useState("");

  // Predict form
  const [predictorName, setPredictorName] = useState("");
  const [pickedTeam, setPickedTeam] = useState("");

  // ── Firebase listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [];

    unsubs.push(onValue(ref(db, "players"), (snap) => {
      const data = snap.val();
      setPlayers(data ? Object.values(data) : []);
    }));

    unsubs.push(onValue(ref(db, "matches"), (snap) => {
      const data = snap.val();
      if (!data) { setMatches([]); return; }
      const arr = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      arr.sort((a, b) => new Date(a.date) - new Date(b.date));
      setMatches(arr);
    }));

    unsubs.push(onValue(ref(db, "predictions"), (snap) => {
      setPredictions(snap.val() || {});
    }));

    // once all three have fired at least once, stop loading
    let fired = 0;
    const done = () => { fired++; if (fired >= 3) setLoading(false); };
    onValue(ref(db, "players"),     done, { onlyOnce: true });
    onValue(ref(db, "matches"),     done, { onlyOnce: true });
    onValue(ref(db, "predictions"), done, { onlyOnce: true });

    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────
  const activeMatch = [...matches].reverse().find((m) => !m.result) || null;

  const leaderboard = players
    .map((p) => {
      let wrong = 0, correct = 0, total = 0;
      matches.filter((m) => m.result).forEach((m) => {
        const pred = predictions[m.id]?.[p];
        if (pred) {
          total++;
          if (pred !== m.result) wrong++;
          else correct++;
        }
      });
      return { name: p, points: wrong, correct, total };
    })
    .sort((a, b) => b.points - a.points); // most wrong = top (worst predictor)

  // ── Actions ──────────────────────────────────────────────────────────────
  async function addPlayer() {
    const name = newPlayer.trim();
    if (!name || players.includes(name)) return;
    await push(ref(db, "players"), name);
    setNewPlayer("");
  }

  async function removePlayer(name) {
    // re-fetch and delete by key
    const snap = await new Promise((res) => onValue(ref(db, "players"), res, { onlyOnce: true }));
    const data = snap.val();
    if (!data) return;
    const key = Object.entries(data).find(([, v]) => v === name)?.[0];
    if (key) await set(ref(db, `players/${key}`), null);
  }

  async function addMatch() {
    if (matchTeam1 === matchTeam2) return;
    const newRef = push(ref(db, "matches"));
    await set(newRef, {
      team1: matchTeam1, team2: matchTeam2,
      date: matchDate,
      label: matchLabel.trim() || `Match ${matches.length + 1}`,
      result: null,
    });
    setMatchLabel("");
  }

  async function declareResult(matchId, winner) {
    await update(ref(db, `matches/${matchId}`), { result: winner });
  }

  async function submitPrediction() {
    if (!predictorName || !pickedTeam || !activeMatch) return;
    await set(ref(db, `predictions/${activeMatch.id}/${predictorName}`), pickedTeam);
    alert(`✅ ${predictorName}'s prediction saved!`);
    setPredictorName("");
    setPickedTeam("");
  }

  // ── UI helpers ───────────────────────────────────────────────────────────
  const s = {
    page:    { fontFamily: "'Georgia', serif", minHeight: "100vh", background: "#09090f", color: "#f0ede8" },
    header:  { background: "linear-gradient(135deg,#130a28 0%,#0c1a40 60%,#130a28 100%)", borderBottom: "2px solid #f59e0b", padding: "18px 16px 0" },
    inner:   { maxWidth: 600, margin: "0 auto" },
    card:    { background: "#111827", borderRadius: 16, padding: 20, border: "1px solid #1f2937", marginBottom: 16 },
    label:   { fontSize: 11, color: "#f59e0b", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 },
    sublabel:{ fontSize: 11, color: "#64748b", letterSpacing: 2, marginBottom: 6 },
    input:   { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #374151", background: "#1f2937", color: "#f0ede8", fontSize: 14, boxSizing: "border-box" },
    btn:     { padding: "12px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#0a0a0f", fontWeight: "bold", cursor: "pointer", fontSize: 14 },
    btnGhost:{ padding: "10px 16px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 },
  };

  if (loading) return (
    <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏏</div>
        <div style={{ color: "#f59e0b", fontSize: 16 }}>Loading…</div>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.inner}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 34 }}>🏏</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: "bold", color: "#f59e0b", letterSpacing: 1 }}>IPL PREDICTOR</div>
              <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 3 }}>2025 SEASON • LIVE</div>
            </div>
          </div>
          <div style={{ display: "flex" }}>
            {[["predict","🎯 Predict"],["leaderboard","🏆 Standings"],["admin","⚙️ Admin"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, padding: "10px 4px", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: tab === k ? "bold" : "normal",
                background: tab === k ? "#f59e0b" : "transparent",
                color: tab === k ? "#0a0a0f" : "#94a3b8",
                borderRadius: "8px 8px 0 0", transition: "all 0.2s",
              }}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...s.inner, padding: "20px 16px" }}>

        {/* ══════════════ PREDICT ══════════════ */}
        {tab === "predict" && (
          <div>
            {!activeMatch ? (
              <div style={{ textAlign: "center", padding: 48, color: "#64748b" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🏏</div>
                <div style={{ fontSize: 18, color: "#94a3b8" }}>No active match right now</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Check back when the next match is posted</div>
              </div>
            ) : (
              <>
                {/* Match card */}
                <div style={s.card}>
                  <div style={s.label}>Today's Match</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>{activeMatch.label} • {activeMatch.date}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, margin: "20px 0" }}>
                    {[activeMatch.team1, activeMatch.team2].map((code, i) => (
                      <>
                        {i === 1 && <div style={{ fontSize: 18, color: "#475569" }}>vs</div>}
                        <div key={code} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 30, fontWeight: "bold", color: teamMap[code]?.accent || "#fff" }}>{code}</div>
                          <div style={{ fontSize: 10, color: "#64748b", maxWidth: 90 }}>{teamMap[code]?.name}</div>
                        </div>
                      </>
                    ))}
                  </div>
                </div>

                {/* Prediction form */}
                <div style={s.card}>
                  <div style={s.label}>Cast Your Vote</div>
                  <div style={{ ...s.sublabel, marginBottom: 6 }}>Your name</div>
                  <select value={predictorName} onChange={e => setPredictorName(e.target.value)}
                    style={{ ...s.input, marginBottom: 18 }}>
                    <option value="">-- Select your name --</option>
                    {players.map(p => (
                      <option key={p} value={p} disabled={!!predictions[activeMatch.id]?.[p]}>
                        {p}{predictions[activeMatch.id]?.[p] ? ` ✅ (${predictions[activeMatch.id][p]})` : ""}
                      </option>
                    ))}
                  </select>

                  <div style={{ ...s.sublabel, marginBottom: 10 }}>Who will win?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                    {[activeMatch.team1, activeMatch.team2].map(code => {
                      const t = teamMap[code];
                      const sel = pickedTeam === code;
                      return (
                        <button key={code} onClick={() => setPickedTeam(code)} style={{
                          padding: 18, borderRadius: 14,
                          border: `2px solid ${sel ? t?.accent : "#374151"}`,
                          background: sel ? (t?.color + "44") : "#1f2937",
                          color: sel ? "#fff" : "#94a3b8",
                          fontWeight: "bold", fontSize: 22, cursor: "pointer",
                          transform: sel ? "scale(1.04)" : "scale(1)", transition: "all 0.2s",
                        }}>
                          {code}
                          {sel && <div style={{ fontSize: 10, color: t?.accent, marginTop: 4 }}>✓ My pick</div>}
                        </button>
                      );
                    })}
                  </div>

                  <button onClick={submitPrediction}
                    disabled={!predictorName || !pickedTeam}
                    style={{ ...s.btn, width: "100%", fontSize: 16, padding: 14,
                      opacity: (!predictorName || !pickedTeam) ? 0.4 : 1 }}>
                    Submit Prediction 🎯
                  </button>
                </div>

                {/* Who has voted */}
                <div style={s.card}>
                  <div style={s.label}>Predictions So Far</div>
                  {players.map(p => {
                    const pred = predictions[activeMatch.id]?.[p];
                    return (
                      <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 0", borderBottom: "1px solid #1f2937" }}>
                        <span style={{ color: "#e2e8f0" }}>{p}</span>
                        <span style={{ fontWeight: pred ? "bold" : "normal", color: pred ? "#f59e0b" : "#374151" }}>
                          {pred || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════ LEADERBOARD ══════════════ */}
        {tab === "leaderboard" && (
          <div>
            <div style={s.label}>Standings — Most Wrong Picks on Top</div>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: "center", color: "#64748b", padding: 40 }}>No players yet</div>
            ) : leaderboard.map((p, i) => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 16,
                ...s.card, marginBottom: 10,
                border: i === 0 && p.points > 0 ? "1px solid #ef4444" : "1px solid #1f2937" }}>
                <div style={{ fontSize: 24, width: 36, textAlign: "center" }}>
                  {i === 0 ? "💀" : i === leaderboard.length - 1 ? "🌟" : `#${i + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: "bold" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {p.correct} correct • {p.total} predicted
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: "bold", color: p.points > 0 ? "#f87171" : "#22c55e" }}>
                    {p.points}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>wrong picks</div>
                </div>
              </div>
            ))}

            {/* Match history */}
            <div style={{ marginTop: 28 }}>
              <div style={s.label}>Match History</div>
              {matches.filter(m => m.result).length === 0 ? (
                <div style={{ color: "#475569", fontSize: 13 }}>No completed matches yet</div>
              ) : [...matches].filter(m => m.result).reverse().map(m => (
                <div key={m.id} style={{ ...s.card, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: 14 }}>{m.label}</div>
                      <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{m.team1} vs {m.team2} • {m.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: "bold", color: "#f59e0b" }}>🏆 {m.result}</div>
                    </div>
                  </div>
                  {/* Per-match prediction summary */}
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {players.map(p => {
                      const pred = predictions[m.id]?.[p];
                      if (!pred) return null;
                      const correct = pred === m.result;
                      return (
                        <span key={p} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20,
                          background: correct ? "#14532d" : "#450a0a",
                          color: correct ? "#86efac" : "#fca5a5", border: `1px solid ${correct ? "#166534" : "#7f1d1d"}` }}>
                          {p}: {pred} {correct ? "✓" : "✗"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ ADMIN ══════════════ */}
        {tab === "admin" && (
          <div>
            {/* Players */}
            <div style={s.card}>
              <div style={s.label}>👥 Players</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input value={newPlayer} onChange={e => setNewPlayer(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPlayer()}
                  placeholder="Player name" style={{ ...s.input, flex: 1 }} />
                <button onClick={addPlayer} style={s.btn}>Add</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {players.map(p => (
                  <span key={p} style={{ background: "#1f2937", border: "1px solid #374151",
                    borderRadius: 20, padding: "5px 12px", fontSize: 13,
                    display: "flex", alignItems: "center", gap: 8 }}>
                    {p}
                    <button onClick={() => removePlayer(p)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Add match */}
            <div style={s.card}>
              <div style={s.label}>➕ Add Today's Match</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={s.sublabel}>TEAM 1</div>
                  <select value={matchTeam1} onChange={e => setMatchTeam1(e.target.value)} style={s.input}>
                    {IPL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                  </select>
                </div>
                <div>
                  <div style={s.sublabel}>TEAM 2</div>
                  <select value={matchTeam2} onChange={e => setMatchTeam2(e.target.value)} style={s.input}>
                    {IPL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                  </select>
                </div>
              </div>
              <input value={matchLabel} onChange={e => setMatchLabel(e.target.value)}
                placeholder="Label e.g. Match 14" style={{ ...s.input, marginBottom: 10 }} />
              <input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)}
                style={{ ...s.input, marginBottom: 14 }} />
              <button onClick={addMatch} style={{ ...s.btn, width: "100%", padding: 13 }}>
                Add Match
              </button>
            </div>

            {/* Declare results */}
            <div style={s.card}>
              <div style={s.label}>🏆 Declare Results</div>
              {matches.filter(m => !m.result).length === 0 ? (
                <div style={{ color: "#475569", fontSize: 13 }}>No pending matches</div>
              ) : matches.filter(m => !m.result).map(m => (
                <div key={m.id} style={{ background: "#1f2937", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontWeight: "bold", marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>{m.team1} vs {m.team2} • {m.date}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[m.team1, m.team2].map(code => (
                      <button key={code} onClick={() => declareResult(m.id, code)} style={{
                        padding: "11px", borderRadius: 10,
                        border: `1px solid ${teamMap[code]?.color || "#374151"}`,
                        background: "transparent", color: "#f0ede8",
                        fontWeight: "bold", cursor: "pointer", fontSize: 15,
                      }}>
                        🏆 {code} Won
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
