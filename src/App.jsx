import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, update, remove } from "firebase/database";

// ─── PASTE YOUR FIREBASE CONFIG HERE ───────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBkoy-GmCN34UNRDpeu6i7twq9nAK668ik",
  authDomain: "ipl-predictor-994a8.firebaseapp.com",
  databaseURL: "https://ipl-predictor-994a8-default-rtdb.asia-southeast1.firebasedatabase.app",
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
  { code: "CSK",  name: "Chennai Super Kings",         color: "#c9a800", accent: "#00416A" },
  { code: "RCB",  name: "Royal Challengers Bengaluru", color: "#EC1C24", accent: "#ff9999" },
  { code: "KKR",  name: "Kolkata Knight Riders",       color: "#3A225D", accent: "#B3A123" },
  { code: "DC",   name: "Delhi Capitals",              color: "#0078BC", accent: "#6ec6ff" },
  { code: "PBKS", name: "Punjab Kings",                color: "#ED1B24", accent: "#d4d4d4" },
  { code: "RR",   name: "Rajasthan Royals",            color: "#254AA5", accent: "#EA1A85" },
  { code: "SRH",  name: "Sunrisers Hyderabad",         color: "#c47d00", accent: "#ffd166" },
  { code: "GT",   name: "Gujarat Titans",              color: "#1C6B57", accent: "#4ade80" },
  { code: "LSG",  name: "Lucknow Super Giants",        color: "#A72B2A", accent: "#FBBF24" },
];
const teamMap = Object.fromEntries(IPL_TEAMS.map((t) => [t.code, t]));

function formatTimestamp(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #07070f; }
  .glow-gold { box-shadow: 0 0 20px rgba(245,158,11,0.15); }
  .glow-red  { box-shadow: 0 0 20px rgba(239,68,68,0.15); }
  .match-card { background: linear-gradient(145deg, #0f172a, #1e1b4b); border: 1px solid rgba(99,102,241,0.3); border-radius: 20px; overflow: hidden; }
  .team-btn:hover { filter: brightness(1.15); }
  .tab-active { background: linear-gradient(135deg,#f59e0b,#d97706) !important; color: #07070f !important; font-weight: 800 !important; }
  select option { background: #1e293b; color: #f0ede8; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #0f172a; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
  .pill { display:inline-flex; align-items:center; gap:6px; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
  .shimmer { background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  .fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`;

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

  // Predict form — per match
  const [predictorName, setPredictorName] = useState("");
  const [pickedTeams, setPickedTeams] = useState({});

  useEffect(() => {
    let fired = 0;
    const tryDone = () => { fired++; if (fired >= 3) setLoading(false); };
    const u1 = onValue(ref(db, "players"), (snap) => {
      const data = snap.val();
      setPlayers(data ? Object.values(data) : []);
      tryDone();
    });
    const u2 = onValue(ref(db, "matches"), (snap) => {
      const data = snap.val();
      if (!data) { setMatches([]); tryDone(); return; }
      const arr = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      arr.sort((a, b) => new Date(a.date) - new Date(b.date));
      setMatches(arr);
      tryDone();
    });
    const u3 = onValue(ref(db, "predictions"), (snap) => {
      setPredictions(snap.val() || {});
      tryDone();
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const activeMatches = matches.filter((m) => !m.result).slice(0, 2);

  const leaderboard = players
    .map((p) => {
      let wrong = 0, correct = 0, total = 0;
      matches.filter((m) => m.result && m.result !== "TIE").forEach((m) => {
        const pred = predictions[m.id]?.[p]?.team;
        if (pred) {
          total++;
          if (pred !== m.result) wrong++;
          else correct++;
        }
      });
      return { name: p, points: wrong, correct, total };
    })
    .sort((a, b) => b.points - a.points);

  async function addPlayer() {
    const name = newPlayer.trim();
    if (!name || players.includes(name)) return;
    await push(ref(db, "players"), name);
    setNewPlayer("");
  }

  async function removePlayer(name) {
    onValue(ref(db, "players"), (snap) => {
      const data = snap.val();
      if (!data) return;
      const key = Object.entries(data).find(([, v]) => v === name)?.[0];
      if (key) set(ref(db, `players/${key}`), null);
    }, { onlyOnce: true });
  }

  async function addMatch() {
    if (matchTeam1 === matchTeam2) return;
    if (activeMatches.length >= 2) { alert("Max 2 live matches at a time. Declare a result first."); return; }
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

  async function deleteMatch(matchId) {
    if (!confirm("Delete this match and all its predictions?")) return;
    await remove(ref(db, `matches/${matchId}`));
    await remove(ref(db, `predictions/${matchId}`));
  }

  async function submitPrediction(matchId) {
    if (!predictorName || !pickedTeams[matchId] || !matchId) return;
    const existing = predictions[matchId]?.[predictorName];
    if (existing) return;
    await set(ref(db, `predictions/${matchId}/${predictorName}`), {
      team: pickedTeams[matchId],
      ts: Date.now(),
    });
    setPickedTeams(prev => { const n = {...prev}; delete n[matchId]; return n; });
    alert(`✅ ${predictorName}'s prediction saved!`);
  }

  const inp = { width:"100%", padding:"11px 14px", borderRadius:12, border:"1px solid #334155", background:"#0f172a", color:"#f0ede8", fontSize:14, fontFamily:"Inter,sans-serif" };
  const btnGold = { borderRadius:12, border:"none", background:"linear-gradient(135deg,#f59e0b,#d97706)", color:"#07070f", fontWeight:"800", cursor:"pointer", fontSize:14, fontFamily:"Inter,sans-serif" };

  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ fontFamily:"Inter,sans-serif", minHeight:"100vh", background:"#07070f", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:56, marginBottom:20 }}>🏏</div>
          <div style={{ color:"#f59e0b", fontSize:18, fontWeight:700, letterSpacing:2 }}>LOADING…</div>
          <div style={{ marginTop:16, width:48, height:3, background:"linear-gradient(90deg,#f59e0b,#d97706)", borderRadius:2, margin:"16px auto 0", animation:"shimmer 1.5s infinite" }}></div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div style={{ fontFamily:"Inter,sans-serif", minHeight:"100vh", background:"#07070f", color:"#f0ede8" }}>

        {/* ── HEADER ── */}
        <div style={{ background:"linear-gradient(180deg,#0d0221 0%,#0a0f2e 100%)", borderBottom:"1px solid rgba(245,158,11,0.3)", padding:"20px 16px 0", position:"sticky", top:0, zIndex:50, backdropFilter:"blur(12px)" }}>
          <div style={{ maxWidth:600, margin:"0 auto" }}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
              <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, boxShadow:"0 0 20px rgba(245,158,11,0.4)" }}>🏏</div>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:"#f0ede8", letterSpacing:0.5 }}>IPL PREDICTOR</div>
                <div style={{ fontSize:11, color:"#f59e0b", letterSpacing:4, fontWeight:600 }}>2026 SEASON • LIVE</div>
              </div>
              {activeMatches.length > 0 && (
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:999, padding:"4px 12px" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#ef4444", animation:"pulse 1s infinite" }}></div>
                  <span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }}>LIVE</span>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:4 }}>
              {[["predict","🎯","Predict"],["leaderboard","🏆","Mandrake Table"],["admin","⚙️","Admin"]].map(([k, icon, lbl]) => (
                <button key={k} onClick={() => setTab(k)} className={tab === k ? "tab-active" : ""} style={{
                  flex:1, padding:"10px 4px", border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:600, fontFamily:"Inter,sans-serif",
                  background:"transparent", color: tab===k ? "#07070f" : "#64748b",
                  borderRadius:"10px 10px 0 0", transition:"all 0.2s",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                }}>
                  <span style={{ fontSize:16 }}>{icon}</span>
                  <span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth:600, margin:"0 auto", padding:"20px 16px 40px" }}>

          {/* ══ PREDICT TAB ══ */}
          {tab === "predict" && (
            <div className="fade-in">
              {activeMatches.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 20px", color:"#334155" }}>
                  <div style={{ fontSize:64, marginBottom:16, filter:"grayscale(0.3)" }}>🏏</div>
                  <div style={{ fontSize:20, color:"#64748b", fontWeight:700 }}>No live matches</div>
                  <div style={{ fontSize:13, marginTop:8, color:"#475569" }}>The admin will post today's match soon</div>
                </div>
              ) : (
                <div>
                  {/* Name selector — shared across matches */}
                  <div style={{ background:"linear-gradient(135deg,#1e1b4b,#0f172a)", border:"1px solid rgba(99,102,241,0.4)", borderRadius:16, padding:16, marginBottom:20 }}>
                    <div style={{ fontSize:11, color:"#818cf8", letterSpacing:3, fontWeight:700, marginBottom:10 }}>WHO ARE YOU?</div>
                    <select value={predictorName} onChange={e => { setPredictorName(e.target.value); setPickedTeams({}); }}
                      style={{ ...inp, background:"#070b1a", border:"1px solid #312e81" }}>
                      <option value="">-- Select your name --</option>
                      {players.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {activeMatches.map((match, mi) => {
                    const myPred = predictions[match.id]?.[predictorName];
                    const picked = pickedTeams[match.id];
                    const alreadyVoted = !!myPred;
                    return (
                      <div key={match.id} className="match-card fade-in" style={{ marginBottom:20 }}>
                        {/* Match header */}
                        <div style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.1))", padding:"14px 18px", borderBottom:"1px solid rgba(99,102,241,0.2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ fontSize:11, color:"#818cf8", fontWeight:700, letterSpacing:2 }}>MATCH {mi+1}</div>
                            <div style={{ fontSize:13, color:"#94a3b8", marginTop:2 }}>{match.label} · {match.date}</div>
                          </div>
                          <div style={{ background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.5)", borderRadius:999, padding:"3px 10px", fontSize:11, color:"#f87171", fontWeight:700 }}>● LIVE</div>
                        </div>

                        {/* Teams */}
                        <div style={{ padding:"20px 18px" }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:20 }}>
                            {[match.team1, match.team2].map((code, i) => (
                              <div key={code} style={{ flex:1, textAlign:"center" }}>
                                {i === 1 && <div></div>}
                                <div style={{ fontSize:32, fontWeight:800, color: teamMap[code]?.accent || "#fff" }}>{code}</div>
                                <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{teamMap[code]?.name}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, position:"relative", marginBottom:20 }}>
                            <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", fontSize:13, color:"#475569", fontWeight:700, background:"#0f172a", padding:"4px 12px", borderRadius:999, border:"1px solid #1e293b", zIndex:1 }}>VS</div>
                            <div style={{ flex:1, height:1, background:"linear-gradient(90deg,transparent,#1e293b)" }}></div>
                            <div style={{ flex:1, height:1, background:"linear-gradient(270deg,transparent,#1e293b)" }}></div>
                          </div>

                          {alreadyVoted ? (
                            <div style={{ textAlign:"center", padding:"16px", background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:14 }}>
                              <div style={{ fontSize:20 }}>✅</div>
                              <div style={{ fontSize:14, color:"#4ade80", fontWeight:700, marginTop:6 }}>You picked <span style={{ color:"#f59e0b" }}>{myPred.team || myPred}</span></div>
                              {myPred.ts && <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>at {formatTimestamp(myPred.ts)}</div>}
                            </div>
                          ) : (
                            <div>
                              {!predictorName && <div style={{ textAlign:"center", color:"#475569", fontSize:13, marginBottom:12 }}>Select your name above to vote</div>}
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                                {[match.team1, match.team2].map(code => {
                                  const t = teamMap[code];
                                  const sel = picked === code;
                                  return (
                                    <button key={code} className="team-btn" onClick={() => setPickedTeams(prev => ({...prev, [match.id]: code}))}
                                      disabled={!predictorName}
                                      style={{ padding:"18px 12px", borderRadius:16, border:`2px solid ${sel ? (t?.accent||"#fff") : "#1e293b"}`,
                                        background: sel ? `linear-gradient(135deg,${t?.color}99,${t?.color}44)` : "#0f172a",
                                        color: sel ? "#fff" : "#64748b", fontWeight:800, fontSize:20, cursor:predictorName?"pointer":"not-allowed",
                                        transition:"all 0.2s", transform:sel?"scale(1.04)":"scale(1)",
                                        boxShadow: sel ? `0 0 20px ${t?.color}66` : "none",
                                      }}>
                                      {code}
                                      {sel && <div style={{ fontSize:10, color:t?.accent, marginTop:5, fontWeight:600 }}>✓ MY PICK</div>}
                                    </button>
                                  );
                                })}
                              </div>
                              <button onClick={() => submitPrediction(match.id)}
                                disabled={!predictorName || !picked}
                                style={{ ...btnGold, width:"100%", padding:"13px", fontSize:15, opacity:(!predictorName||!picked)?0.35:1 }}>
                                Lock In Pick 🔒
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Who voted */}
                        <div style={{ borderTop:"1px solid #1e293b", padding:"14px 18px" }}>
                          <div style={{ fontSize:11, color:"#475569", fontWeight:700, letterSpacing:2, marginBottom:10 }}>PREDICTIONS</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                            {players.map(p => {
                              const pred = predictions[match.id]?.[p];
                              const team = pred?.team || pred;
                              const ts = pred?.ts;
                              return (
                                <div key={p} style={{ background: team?"#0f172a":"#070b1a", border:`1px solid ${team?"#334155":"#1e293b"}`, borderRadius:10, padding:"6px 12px", minWidth:90 }}>
                                  <div style={{ fontSize:12, color:team?"#e2e8f0":"#374151", fontWeight:600 }}>{p}</div>
                                  {team ? (
                                    <>
                                      <div style={{ fontSize:14, color:"#f59e0b", fontWeight:800 }}>{team}</div>
                                      {ts && <div style={{ fontSize:10, color:"#475569" }}>{formatTimestamp(ts)}</div>}
                                    </>
                                  ) : (
                                    <div style={{ fontSize:11, color:"#374151" }}>—</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ MANDRAKE TABLE ══ */}
          {tab === "leaderboard" && (
            <div className="fade-in">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                <div style={{ fontSize:24 }}>🏆</div>
                <div>
                  <div style={{ fontSize:18, fontWeight:800 }}>Mandrake Table</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>Most wrong picks on top</div>
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div style={{ textAlign:"center", color:"#334155", padding:40 }}>No players yet</div>
              ) : leaderboard.map((p, i) => {
                const isWorst = i === 0 && p.points > 0;
                const isBest = i === leaderboard.length - 1;
                return (
                  <div key={p.name} className={isWorst?"glow-red":""} style={{
                    display:"flex", alignItems:"center", gap:14,
                    background: isWorst ? "linear-gradient(135deg,#1a0505,#0f0a0a)" : isBest ? "linear-gradient(135deg,#0a1a0a,#051205)" : "#0f172a",
                    borderRadius:16, padding:"14px 18px", marginBottom:10,
                    border: isWorst?"1px solid rgba(239,68,68,0.5)":isBest?"1px solid rgba(34,197,94,0.4)":"1px solid #1e293b",
                    transition:"all 0.2s",
                  }}>
                    <div style={{ fontSize:26, width:36, textAlign:"center" }}>
                      {isWorst ? "💀" : isBest ? "👑" : `#${i+1}`}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:16, fontWeight:700 }}>{p.name}</div>
                      <div style={{ display:"flex", gap:8, marginTop:4 }}>
                        <span className="pill" style={{ background:"rgba(34,197,94,0.15)", color:"#4ade80", border:"1px solid rgba(34,197,94,0.3)" }}>✓ {p.correct} correct</span>
                        <span className="pill" style={{ background:"rgba(239,68,68,0.15)", color:"#f87171", border:"1px solid rgba(239,68,68,0.3)" }}>✗ {p.points} wrong</span>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:28, fontWeight:800, color: p.points===0?"#4ade80":isWorst?"#f87171":"#f0ede8" }}>{p.points}</div>
                      <div style={{ fontSize:10, color:"#475569" }}>{p.total} voted</div>
                    </div>
                  </div>
                );
              })}

              {/* Match history */}
              <div style={{ marginTop:32 }}>
                <div style={{ fontSize:11, color:"#475569", fontWeight:700, letterSpacing:3, marginBottom:14 }}>MATCH HISTORY</div>
                {matches.filter(m => m.result).length === 0 ? (
                  <div style={{ color:"#334155", fontSize:13 }}>No completed matches yet</div>
                ) : [...matches].filter(m => m.result).reverse().map(m => (
                  <div key={m.id} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:16, marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14 }}>{m.label}</div>
                        <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>{m.team1} vs {m.team2} · {m.date}</div>
                      </div>
                      <div style={{ fontWeight:800, color: m.result==="TIE"?"#818cf8":"#f59e0b", fontSize:14 }}>
                        {m.result==="TIE" ? "🤝 TIE" : `🏆 ${m.result}`}
                      </div>
                    </div>
                    <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6 }}>
                      {players.map(p => {
                        const pred = predictions[m.id]?.[p];
                        const team = pred?.team || pred;
                        if (!team) return null;
                        const correct = m.result !== "TIE" && team === m.result;
                        const tie = m.result === "TIE";
                        return (
                          <span key={p} className="pill" style={{
                            background: tie?"rgba(129,140,248,0.15)":correct?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)",
                            color: tie?"#818cf8":correct?"#4ade80":"#f87171",
                            border: `1px solid ${tie?"rgba(129,140,248,0.3)":correct?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,
                          }}>
                            {p}: {team} {tie?"🤝":correct?"✓":"✗"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ ADMIN TAB ══ */}
          {tab === "admin" && (
            <div className="fade-in">

              {/* Players */}
              <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700, letterSpacing:3, marginBottom:14 }}>👥 PLAYERS</div>
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  <input value={newPlayer} onChange={e => setNewPlayer(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && addPlayer()}
                    placeholder="Add player name" style={{ ...inp, flex:1 }} />
                  <button onClick={addPlayer} style={{ ...btnGold, padding:"11px 18px" }}>Add</button>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {players.map(p => (
                    <span key={p} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:999, padding:"5px 14px", fontSize:13, display:"flex", alignItems:"center", gap:8, fontWeight:500 }}>
                      {p}
                      <button onClick={() => removePlayer(p)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:16, padding:0, lineHeight:1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Add match */}
              <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:20, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700, letterSpacing:3 }}>➕ ADD MATCH</div>
                  <div style={{ fontSize:11, color: activeMatches.length>=2?"#ef4444":"#64748b" }}>
                    {activeMatches.length}/2 live
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:600, letterSpacing:1, marginBottom:6 }}>TEAM 1</div>
                    <select value={matchTeam1} onChange={e => setMatchTeam1(e.target.value)} style={inp}>
                      {IPL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:600, letterSpacing:1, marginBottom:6 }}>TEAM 2</div>
                    <select value={matchTeam2} onChange={e => setMatchTeam2(e.target.value)} style={inp}>
                      {IPL_TEAMS.map(t => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                    </select>
                  </div>
                </div>
                <input value={matchLabel} onChange={e => setMatchLabel(e.target.value)}
                  placeholder="Label e.g. Match 22" style={{ ...inp, marginBottom:10 }} />
                <input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)}
                  style={{ ...inp, marginBottom:14 }} />
                <button onClick={addMatch} disabled={activeMatches.length>=2}
                  style={{ ...btnGold, width:"100%", padding:13, fontSize:15, opacity:activeMatches.length>=2?0.4:1 }}>
                  {activeMatches.length>=2 ? "Max 2 Live Matches Reached" : "Post Match"}
                </button>
              </div>

              {/* Declare results + delete */}
              <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:20 }}>
                <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700, letterSpacing:3, marginBottom:14 }}>🏆 DECLARE RESULTS</div>
                {matches.filter(m => !m.result).length === 0 ? (
                  <div style={{ color:"#334155", fontSize:13 }}>No pending matches</div>
                ) : matches.filter(m => !m.result).map(m => (
                  <div key={m.id} style={{ background:"#1e293b", borderRadius:14, padding:16, marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontWeight:700 }}>{m.label}</div>
                        <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{m.team1} vs {m.team2} · {m.date}</div>
                      </div>
                      <button onClick={() => deleteMatch(m.id)} style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", color:"#f87171", borderRadius:8, padding:"4px 10px", fontSize:12, cursor:"pointer", fontFamily:"Inter,sans-serif" }}>
                        🗑 Delete
                      </button>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      {[m.team1, m.team2].map(code => (
                        <button key={code} onClick={() => declareResult(m.id, code)} style={{
                          padding:"11px 8px", borderRadius:10,
                          border:`1px solid ${teamMap[code]?.color||"#334155"}`,
                          background:"transparent", color:"#f0ede8",
                          fontWeight:700, cursor:"pointer", fontSize:14, fontFamily:"Inter,sans-serif",
                        }}>
                          🏆 {code}
                        </button>
                      ))}
                      <button onClick={() => declareResult(m.id, "TIE")} style={{
                        padding:"11px 8px", borderRadius:10,
                        border:"1px solid rgba(129,140,248,0.5)",
                        background:"rgba(129,140,248,0.1)", color:"#818cf8",
                        fontWeight:700, cursor:"pointer", fontSize:14, fontFamily:"Inter,sans-serif",
                      }}>
                        🤝 Tie
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
