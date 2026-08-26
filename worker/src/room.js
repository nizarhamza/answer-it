// Durable Object - one instance per 6-digit room code (env.ROOMS.idFromName(code), ANSWER-IT.md
// §13-§17). Uses the WebSocket Hibernation API (state.acceptWebSocket), same as find-it-site's
// room.js, which means this object can be evicted from memory between messages. Nothing here may
// rely on in-memory state surviving a message/alarm boundary - everything the round needs lives in
// state.storage and is re-read at the top of every handler. See bank.js's header for why its
// round-session helpers are plain functions rather than closures, for the same reason.
import {
  scoreAnswer, comparePlayers, allocateCounts, PROFILES, matchOpenAnswer, LEVELS,
} from "./game-core.js";
import { buildPool, poolTotal, initSessionState, drawNextQuestion, drawDouble, recordOutcome } from "./bank.js";
import { CATEGORY_KEYS } from "./sources.js";

const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // §13 - auto-wipe an abandoned room after 2h idle
const GRACE_MS = 300; // §17 - answers up to 300ms after endsAt still land, at the 0.5x floor
const REVEAL_AUTO_MS = 5000; // §13 reveal - "Auto (5s)"
const REVEAL_HOST_TIMEOUT_MS = 60000; // §20 - an AFK host on revealPace:"host" can't hang the room
const JUDGING_TIMEOUT_MS = 90000; // same AFK-host principle applied to the judge panel
const TEAM_NAMES = ["Red", "Blue", "Green", "Amber", "Purple", "Teal"];
const TEAM_COLORS = ["#b91c1c", "#1d4ed8", "#15803d", "#a16207", "#7c3aed", "#0f766e"];
const MAX_N = 30, MIN_N = 5;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
function newPlayer(id, nickname, role = "player") {
  return {
    id, nickname: String(nickname).slice(0, 24) || "Player", role, teamId: null,
    score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0, avgMsSum: 0, avgMs: Infinity, wins: 0,
    byCategory: {}, connected: true, pendingPromote: false,
  };
}
function defaultSettings() {
  return {
    n: 15, categories: ["mix"], style: "mixed", intensity: "adaptive",
    streaks: true, hellInsurance: false, extended: false, teams: 0, revealPace: "auto",
  };
}
function resolveCategories(categories) {
  if (!Array.isArray(categories) || !categories.length || categories.includes("mix")) return [...CATEGORY_KEYS];
  const ok = categories.filter((c) => CATEGORY_KEYS.includes(c));
  return ok.length ? ok : [...CATEGORY_KEYS];
}

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/reserve") && request.method === "POST") return this.handleReserve(request);
    if (url.pathname.endsWith("/socket")) return this.handleSocket(request);
    return new Response("Not found", { status: 404 });
  }

  /* ---------------- storage helpers ---------------- */
  async loadRoom() { return this.state.storage.get("room"); }
  async saveRoom(room) { await this.state.storage.put("room", room); }

  async handleReserve(request) {
    const existing = await this.loadRoom();
    if (existing && existing.status !== "finished") return json({ error: "taken" }, 409);
    const body = await request.json().catch(() => null);
    const { code, hostId, hostName } = body || {};
    if (!code || !hostId || !hostName) return json({ error: "missing fields" }, 400);

    const room = {
      code, status: "lobby", phase: null,
      hostId, judgeOnlyHost: false,
      createdAt: Date.now(),
      settings: defaultSettings(),
      mix: allocateCounts(15, PROFILES.standard),
      qIndex: -1, isDoubleNow: false,
      startAt: null, endsAt: null, revealEndsAt: null, judgingDeadline: null,
      sessionState: null,
      players: { [hostId]: newPlayer(hostId, hostName, "player") },
      teams: {},
      seenQuestionIds: [],
    };
    await this.saveRoom(room);
    await this.state.storage.deleteAlarm();
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return json({ ok: true });
  }

  async handleSocket(request) {
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId");
    const nickname = (url.searchParams.get("nickname") || "Player").slice(0, 24);
    const wantsSpectator = url.searchParams.get("role") === "spectator";
    if (!playerId) return new Response("Missing playerId", { status: 400 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });

    const room = await this.loadRoom();
    if (!room) return new Response("Room not found", { status: 404 });

    const existing = room.players[playerId];
    if (existing) {
      existing.connected = true;
      existing.nickname = nickname || existing.nickname;
    } else {
      // §20 - joining mid-round makes you a spectator, auto-promoted at the next round.
      const role = wantsSpectator || room.status === "playing" ? "spectator" : "player";
      const p = newPlayer(playerId, nickname, role);
      if (role === "spectator" && room.status === "playing") p.pendingPromote = !wantsSpectator;
      if (room.settings.teams > 0 && role === "player") p.teamId = this.smallestTeam(room);
      room.players[playerId] = p;
    }
    await this.saveRoom(room);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [playerId]);

    this.sendTo(server, { type: "state", ...this.publicRoom(room, playerId) });
    if (room.status === "playing" && room.phase === "question" && Date.now() <= (room.endsAt || 0) + GRACE_MS) {
      const q = await this.currentQuestion(room);
      if (q) this.sendTo(server, { ...this.questionPayload(room, q, playerId), type: "question" });
    }
    await this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  smallestTeam(room) {
    const ids = Object.keys(room.teams);
    if (!ids.length) return null;
    const counts = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const p of Object.values(room.players)) if (p.teamId && counts[p.teamId] !== undefined) counts[p.teamId]++;
    return ids.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
  }

  sendTo(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* socket gone */ } }
  wsForPlayer(playerId) {
    return this.state.getWebSockets().filter((ws) => this.state.getTags(ws).includes(playerId));
  }

  /* ---------------- outgoing payload shaping - never leak the answer early (§14 invariant) --- */
  publicRoom(room, forPlayerId) {
    const me = room.players[forPlayerId];
    const isJudge = room.judgeOnlyHost && forPlayerId === room.hostId;
    return {
      code: room.code, status: room.status, phase: room.phase,
      hostId: room.hostId, judgeOnlyHost: room.judgeOnlyHost,
      settings: room.settings, mix: room.mix,
      qIndex: room.qIndex, total: room.settings.n, isDoubleNow: room.isDoubleNow,
      endsAt: room.status === "playing" && room.phase === "question" ? room.endsAt : null,
      players: Object.values(room.players).map((p) => ({
        id: p.id, nickname: p.nickname, role: p.role, teamId: p.teamId,
        score: p.score, streak: p.streak, bestStreak: p.bestStreak, correct: p.correct,
        answered: p.answered, avgMs: p.avgMs, wins: p.wins, connected: p.connected,
      })).sort(comparePlayers),
      teams: room.teams,
      you: me ? { id: me.id, role: me.role, teamId: me.teamId, isJudge } : null,
    };
  }

  async currentQuestion(room) {
    if (room.qIndex < 0) return null;
    const qs = (await this.state.storage.get("questions")) || [];
    return qs[room.qIndex] || null;
  }

  // Named `qType` rather than `type` (ANSWER-IT.md §14's table calls it just "type") because this
  // whole object is spread into a `{ type: "question", ... }` envelope alongside every other
  // message shape (state/reveal/final/...) - reusing `type` for the answer-format field would
  // collide with the envelope's own message-kind discriminator and silently clobber it.
  questionPayload(room, q, forPlayerId) {
    const isJudge = room.judgeOnlyHost && forPlayerId === room.hostId;
    const base = {
      qIndex: room.qIndex, total: room.settings.n, text: q.text, category: q.category,
      level: q.level, qType: q.type, options: q.options, modifiers: q.modifiers,
      startAt: room.startAt, endsAt: room.endsAt, isDouble: q.isDouble,
    };
    if (isJudge) base.correctAnswer = q.displayAnswer || q.correctAnswer;
    return base;
  }

  async broadcastState() {
    const room = await this.loadRoom();
    if (!room) return;
    for (const ws of this.state.getWebSockets()) {
      const [pid] = this.state.getTags(ws);
      this.sendTo(ws, { type: "state", ...this.publicRoom(room, pid) });
    }
  }
  async broadcast(msgFor) {
    // msgFor(playerId) -> message object (or null to skip that socket)
    for (const ws of this.state.getWebSockets()) {
      const [pid] = this.state.getTags(ws);
      const msg = msgFor(pid);
      if (msg) this.sendTo(ws, msg);
    }
  }

  /* ============================================================
     Message handling
     ============================================================ */
  async webSocketMessage(ws, raw) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const [playerId] = this.state.getTags(ws);

    if (data.type === "ping") return this.sendTo(ws, { type: "pong", t: data.t, serverNow: Date.now() });

    const room = await this.loadRoom();
    if (!room) return;
    const isHost = playerId === room.hostId;

    switch (data.type) {
      case "configure": return this.onConfigure(room, playerId, isHost, data);
      case "team": return this.onTeam(room, playerId, data);
      case "role": return this.onRole(room, playerId, data);
      case "start": return this.onStart(room, playerId, isHost);
      case "answer": return this.onAnswer(room, playerId, data);
      case "judge": return this.onJudge(room, playerId, isHost, data);
      case "next": return this.onNext(room, playerId, isHost);
      case "rematch": return this.onRematch(room, playerId, isHost);
      case "kick": return this.onKick(room, playerId, isHost, data);
      case "leave": return this.onLeave(ws, room, playerId);
    }
  }

  async onConfigure(room, playerId, isHost, data) {
    if (!isHost || (room.status !== "lobby" && room.status !== "finished")) return;
    const s = room.settings;
    const n = Math.max(MIN_N, Math.min(MAX_N, Number(data.n) || s.n));
    room.settings = {
      n,
      categories: Array.isArray(data.categories) && data.categories.length ? data.categories.slice(0, 10) : s.categories,
      style: ["choice", "open", "mixed"].includes(data.style) ? data.style : s.style,
      intensity: ["chill", "standard", "brutal", "adaptive"].includes(data.intensity) ? data.intensity : s.intensity,
      streaks: data.streaks !== undefined ? !!data.streaks : s.streaks,
      hellInsurance: data.hellInsurance !== undefined ? !!data.hellInsurance : s.hellInsurance,
      extended: data.extended !== undefined ? !!data.extended : s.extended,
      teams: Number.isInteger(data.teams) ? Math.max(0, Math.min(6, data.teams)) : s.teams,
      revealPace: data.revealPace === "host" ? "host" : "auto",
    };
    if (data.judgeOnlyHost !== undefined) room.judgeOnlyHost = !!data.judgeOnlyHost;
    this.syncTeams(room);
    const profile = room.settings.intensity === "adaptive" ? PROFILES.standard : PROFILES[room.settings.intensity];
    room.mix = allocateCounts(room.settings.n, profile);
    await this.saveRoom(room);
    await this.broadcastState();
  }

  syncTeams(room) {
    const want = room.settings.teams;
    const ids = Object.keys(room.teams);
    if (want === 0) { room.teams = {}; for (const p of Object.values(room.players)) p.teamId = null; return; }
    if (ids.length === want) return;
    const teams = {};
    for (let i = 0; i < want; i++) teams[`t${i}`] = { id: `t${i}`, name: TEAM_NAMES[i], color: TEAM_COLORS[i] };
    room.teams = teams;
    // Re-balance every player round-robin rather than trying to preserve a stale mapping across a team-count change.
    const players = Object.values(room.players).filter((p) => p.role === "player");
    players.forEach((p, i) => { p.teamId = `t${i % want}`; });
  }

  async onTeam(room, playerId, data) {
    if (room.status !== "lobby") return;
    const p = room.players[playerId];
    if (!p || p.role !== "player") return;
    if (!room.teams[data.teamId]) return;
    p.teamId = data.teamId;
    await this.saveRoom(room);
    await this.broadcastState();
  }

  async onRole(room, playerId, data) {
    const p = room.players[playerId];
    if (!p) return;
    if (data.role === "spectator") { p.role = "spectator"; p.teamId = null; }
    else if (data.role === "player" && room.status === "lobby") { p.role = "player"; if (room.settings.teams > 0) p.teamId = this.smallestTeam(room); }
    await this.saveRoom(room);
    await this.broadcastState();
  }

  async onKick(room, playerId, isHost, data) {
    if (!isHost || !data.playerId || data.playerId === playerId) return;
    delete room.players[data.playerId];
    await this.saveRoom(room);
    for (const ws of this.wsForPlayer(data.playerId)) { try { ws.close(4000, "kicked"); } catch {} }
    await this.broadcastState();
  }

  async onLeave(ws, room, playerId) {
    const wasHost = playerId === room.hostId;
    delete room.players[playerId];
    if (wasHost) room.hostId = this.longestPresent(room);
    await this.saveRoom(room);
    await this.broadcastState();
    try { ws.close(1000, "left"); } catch {}
  }

  longestPresent(room) {
    // Object key insertion order = join order (same trick find-it-site's room.js relies on).
    const ids = Object.keys(room.players).filter((id) => room.players[id].connected && room.players[id].role !== "spectator");
    return ids[0] || Object.keys(room.players)[0] || null;
  }

  /* ---------------- starting a round ---------------- */
  async onStart(room, playerId, isHost) {
    if (!isHost || (room.status !== "lobby" && room.status !== "finished")) return;
    if (!room.settings.categories.length) return this.sendTo(this.wsForPlayer(playerId)[0], { type: "error", code: "no-categories", message: "Pick at least one category." });

    if (room.status === "finished") this.resetForNewRound(room);
    room.judgeOnlyHost = !!room.judgeOnlyHost;
    const hostPlayer = room.players[room.hostId];
    if (hostPlayer) hostPlayer.role = room.judgeOnlyHost ? "judge" : "player";

    const categories = resolveCategories(room.settings.categories);
    let pool;
    try {
      pool = await buildPool(categories, room.settings.n, new Set(room.seenQuestionIds));
    } catch {
      return this.sendTo(this.wsForPlayer(playerId)[0], { type: "error", code: "sources-unreachable", message: "Both trivia sources are unreachable right now. Try again in a moment." });
    }
    const available = LEVELS.filter((L) => L !== "hell").reduce((s, L) => s + poolTotal(pool, categories, L), 0);
    if (available < Math.min(6, room.settings.n)) {
      return this.sendTo(this.wsForPlayer(playerId)[0], { type: "error", code: "too-few-questions", message: "Not enough questions came back to build a round. Try again, or widen the categories." });
    }

    await this.state.storage.put("pool", pool);
    room.sessionState = initSessionState();
    room.status = "playing";
    await this.state.storage.put("questions", []);
    await this.state.storage.delete("currentAnswers");

    await this.serveNextQuestion(room, categories);
  }

  resetForNewRound(room) {
    const ranked = Object.values(room.players).filter((p) => p.role !== "spectator").sort(comparePlayers);
    if (ranked[0]) ranked[0].wins = (ranked[0].wins || 0) + 1;
    for (const p of Object.values(room.players)) {
      p.score = 0; p.streak = 0; p.bestStreak = 0; p.correct = 0; p.answered = 0; p.avgMsSum = 0; p.avgMs = Infinity; p.byCategory = {};
      if (p.pendingPromote) { p.role = "player"; p.pendingPromote = false; if (room.settings.teams > 0) p.teamId = this.smallestTeam(room); }
    }
    room.status = "lobby";
    room.qIndex = -1; room.isDoubleNow = false; room.phase = null;
  }

  /* ---------------- the per-question loop ---------------- */
  async serveNextQuestion(room, categoriesArg) {
    const categories = categoriesArg || resolveCategories(room.settings.categories);
    const pool = await this.state.storage.get("pool");
    const state = room.sessionState;
    const wasLastRegular = state.servedLevels.length >= room.settings.n;

    let q, notices = [];
    if (!room.isDoubleNow && wasLastRegular) {
      room.isDoubleNow = true;
      q = drawDouble(pool, room.settings, state);
      if (!q) return this.finishRound(room, "ranOutDouble");
    } else if (room.isDoubleNow) {
      return this.finishRound(room, null);
    } else {
      const drawn = drawNextQuestion(pool, room.settings, state);
      q = drawn.question; notices = drawn.notices;
      if (!q) return this.finishRound(room, "ranOutFresh");
    }

    await this.state.storage.put("pool", pool);
    room.sessionState = state;

    const qs = (await this.state.storage.get("questions")) || [];
    qs.push(q);
    await this.state.storage.put("questions", qs);
    await this.state.storage.delete("currentAnswers");
    room.qIndex = qs.length - 1;
    room.seenQuestionIds = [...room.seenQuestionIds, q.key].slice(-2000);

    const interstitialMs = q.isDouble ? 1800 : q.level === "hell" ? 1600 : 150;
    room.startAt = Date.now() + interstitialMs;
    room.endsAt = room.startAt + q.timeLimit * 1000;
    room.phase = "question";
    await this.saveRoom(room);

    await this.broadcast((pid) => ({ ...this.questionPayload(room, q, pid), type: "question" }));
    if (notices.length) await this.broadcast(() => ({ type: "notice", notices }));
    await this.broadcastState();
    await this.state.storage.setAlarm(room.endsAt + GRACE_MS);
  }

  async onAnswer(room, playerId, data) {
    if (room.status !== "playing" || room.phase !== "question") return;
    if (Number(data.qIndex) !== room.qIndex) return;
    if (Date.now() > room.endsAt + GRACE_MS) return;
    const p = room.players[playerId];
    if (!p || p.role !== "player") return;

    const answers = (await this.state.storage.get("currentAnswers")) || {};
    if (answers[playerId]) return; // one answer per player per question, first wins (§17)
    const q = await this.currentQuestion(room);
    if (!q) return;

    const ms = Math.max(0, Math.min(q.timeLimit * 1000, Date.now() - room.startAt));
    let verdict, submittedText;
    if (q.type === "choice") {
      verdict = Number(data.value) === q.answerIndex ? "correct" : "wrong";
      submittedText = q.options?.[data.value] ?? "";
    } else {
      submittedText = String(data.value ?? "").slice(0, 120);
      verdict = matchOpenAnswer(submittedText, q.correctAnswer, q.accepted || []);
    }
    answers[playerId] = { value: data.value, ms, verdict, submittedText };
    await this.state.storage.put("currentAnswers", answers);

    const activePlayers = Object.values(room.players).filter((pp) => pp.role === "player");
    const allIn = activePlayers.every((pp) => answers[pp.id]);
    await this.broadcast(() => ({ type: "answered", count: Object.keys(answers).length, total: activePlayers.length }));
    if (allIn) return this.lock(room, "all-in");
  }

  async lock(room, reason) {
    if (room.phase !== "question") return;
    room.phase = "locked";
    await this.saveRoom(room);
    await this.broadcast(() => ({ type: "lock", qIndex: room.qIndex, reason }));

    const answers = (await this.state.storage.get("currentAnswers")) || {};
    const disputes = room.judgeOnlyHost
      ? Object.entries(answers).filter(([, a]) => a.verdict === "dispute").map(([pid, a]) => ({ playerId: pid, nickname: room.players[pid]?.nickname || "?", text: a.submittedText }))
      : [];
    if (disputes.length) return this.enterJudging(room, disputes);
    return this.scoreAndReveal(room, {});
  }

  async enterJudging(room, disputes) {
    room.phase = "judging";
    room.judgingDeadline = Date.now() + JUDGING_TIMEOUT_MS;
    await this.saveRoom(room);
    const q = await this.currentQuestion(room);
    const answers = (await this.state.storage.get("currentAnswers")) || {};
    const auto = Object.entries(answers).filter(([, a]) => a.verdict !== "dispute")
      .map(([pid, a]) => ({ playerId: pid, nickname: room.players[pid]?.nickname || "?", text: a.submittedText, verdict: a.verdict }));
    const hostWs = this.wsForPlayer(room.hostId)[0];
    if (hostWs) this.sendTo(hostWs, { type: "judging", qIndex: room.qIndex, correctAnswer: q.displayAnswer || q.correctAnswer, disputes, auto });
    await this.broadcast((pid) => (pid !== room.hostId ? { type: "state", ...this.publicRoom(room, pid) } : null));
    await this.state.storage.setAlarm(room.judgingDeadline);
  }

  async onJudge(room, playerId, isHost, data) {
    if (!isHost || room.phase !== "judging" || Number(data.qIndex) !== room.qIndex) return;
    const answers = (await this.state.storage.get("currentAnswers")) || {};
    for (const [pid, verdict] of Object.entries(data.verdicts || {})) {
      if (answers[pid]) answers[pid].verdict = verdict ? "correct" : "wrong";
    }
    await this.state.storage.put("currentAnswers", answers);
    return this.scoreAndReveal(room, {});
  }

  async scoreAndReveal(room, { disputeAutoResolved: forcedAuto } = {}) {
    const q = await this.currentQuestion(room);
    const answers = (await this.state.storage.get("currentAnswers")) || {};
    let disputeAutoResolved = false;
    for (const a of Object.values(answers)) {
      if (a.verdict === "dispute") { a.verdict = "correct"; disputeAutoResolved = true; } // §10.2/§20 - no judge, err generous
    }

    const results = [];
    const distribution = q.type === "choice" ? new Array(q.options.length).fill(0) : [];
    const openTexts = [];
    let anyCorrect = false, anyAnswered = false;
    const activePlayers = Object.values(room.players).filter((p) => p.role === "player");
    for (const p of activePlayers) {
      const a = answers[p.id];
      const correct = a ? a.verdict === "correct" : false;
      if (a) { anyAnswered = true; if (correct) anyCorrect = true; }
      if (a && q.type === "choice" && typeof a.value === "number") distribution[a.value] = (distribution[a.value] || 0) + 1;
      if (a && q.type === "open") openTexts.push({ nickname: p.nickname, text: a.submittedText, correct });

      const r = scoreAnswer({
        level: q.level, type: q.type, isDouble: !!q.isDouble, responseTimeMs: a ? a.ms : q.timeLimit * 1000,
        streakBefore: room.settings.streaks ? p.streak : 0, correct, hellInsurance: room.settings.hellInsurance,
      });
      p.score += r.points;
      p.streak = room.settings.streaks ? r.streakAfter : 0;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      if (a) { p.answered++; p.avgMsSum += a.ms; p.avgMs = p.avgMsSum / p.answered; } // comparePlayers' §7.6 tie-break needs this kept live, not derived at sort time
      if (correct) p.correct++;
      const bc = (p.byCategory[q.category] ||= { c: 0, n: 0 });
      if (a) { bc.n++; if (correct) bc.c++; }
      results.push({ playerId: p.id, correct, ms: a ? a.ms : null, points: r.points, streak: p.streak, total: p.score, _bonus: correct });
    }

    // §12 team sync bonus - +10% combined when every connected member of a team got it right.
    if (room.settings.teams > 0) {
      for (const teamId of Object.keys(room.teams)) {
        const members = activePlayers.filter((p) => p.teamId === teamId && p.connected);
        if (members.length && members.every((p) => results.find((r) => r.playerId === p.id)?._bonus)) {
          for (const p of members) {
            const r = results.find((rr) => rr.playerId === p.id);
            const bonus = Math.round(r.points * 0.10);
            p.score += bonus; r.points += bonus; r.total = p.score;
          }
        }
      }
    }
    for (const r of results) delete r._bonus;

    const mixShift = recordOutcome(room.settings, room.sessionState, anyAnswered ? (results.filter((r) => r.correct).length / activePlayers.length) >= 0.5 : false);

    room.phase = "reveal";
    room.revealEndsAt = Date.now() + (room.settings.revealPace === "host" ? REVEAL_HOST_TIMEOUT_MS : REVEAL_AUTO_MS);
    await this.saveRoom(room);
    await this.state.storage.delete("currentAnswers");

    const payload = {
      qIndex: room.qIndex, correctAnswer: q.displayAnswer || q.correctAnswer,
      distribution: q.type === "choice" ? distribution : openTexts,
      results, disputeAutoResolved: disputeAutoResolved || !!forcedAuto, nobodyGotIt: anyAnswered && !anyCorrect,
    };
    await this.broadcast(() => ({ type: "reveal", ...payload }));
    if (mixShift) await this.broadcast(() => ({ type: "mixShift", ...mixShift }));
    await this.broadcastState();
    await this.state.storage.setAlarm(room.revealEndsAt);
  }

  async onNext(room, playerId, isHost) {
    if (!isHost || room.phase !== "reveal") return;
    await this.serveNextQuestion(room);
  }

  async onRematch(room, playerId, isHost) {
    if (!isHost || room.status !== "finished") return;
    return this.onStart(room, playerId, isHost);
  }

  async finishRound(room, ranOutKey) {
    room.status = "finished";
    room.phase = null;
    await this.saveRoom(room);
    const podium = Object.values(room.players).filter((p) => p.role !== "spectator").sort(comparePlayers)
      .map((p, i) => ({
        id: p.id, nickname: p.nickname, teamId: p.teamId, score: p.score, correct: p.correct,
        answered: p.answered, bestStreak: p.bestStreak, wins: p.wins, byCategory: p.byCategory, rank: i + 1,
      }));
    const teamScores = room.settings.teams > 0
      ? Object.values(room.teams).map((tm) => ({ ...tm, score: podium.filter((p) => p.teamId === tm.id).reduce((s, p) => s + p.score, 0) })).sort((a, b) => b.score - a.score)
      : null;
    await this.broadcast(() => ({ type: "final", podium, teams: teamScores, ranOut: ranOutKey }));
    await this.broadcastState();
    await this.state.storage.deleteAlarm();
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async webSocketClose(ws) {
    const [playerId] = this.state.getTags(ws);
    const room = await this.loadRoom();
    if (!room || !room.players[playerId]) return;
    // Kept in the room so a refresh/reconnect resumes with the same score/streak (§17). Only an
    // explicit {type:'leave'} removes a player.
    room.players[playerId].connected = false;
    await this.saveRoom(room);
    await this.broadcastState();
  }
  async webSocketError() {}

  /* ---------------- alarm: the single scheduled wake-up for whatever phase is live ---------------- */
  async alarm() {
    const room = await this.loadRoom();
    if (!room) return;
    const now = Date.now();
    if (room.status === "playing" && room.phase === "question" && now >= room.endsAt + GRACE_MS) {
      return this.lock(room, "timeout");
    }
    if (room.status === "playing" && room.phase === "judging" && room.judgingDeadline && now >= room.judgingDeadline) {
      return this.scoreAndReveal(room, { disputeAutoResolved: true });
    }
    if (room.status === "playing" && room.phase === "reveal" && room.revealEndsAt && now >= room.revealEndsAt) {
      return this.serveNextQuestion(room);
    }
    if (room.status === "finished" || room.status === "lobby") {
      // Only reached 2h after handleReserve()/finishRound() explicitly scheduled this exact
      // wake-up (any later activity would have overwritten it with a fresh alarm) - so by
      // construction the room has been idle for the full TTL whenever this fires.
      return this.state.storage.deleteAll();
    }
    // Stale wake (host already acted manually before the timer fired) - nothing to do.
  }
}
