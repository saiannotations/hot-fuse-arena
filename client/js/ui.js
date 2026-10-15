// Hot Fuse Arena — DOM UI: screens, lobby, HUD, chat, result overlay.
const $ = (id) => document.getElementById(id);

export function createUI(handlers) {
  const els = {
    home: $('home'), lobby: $('lobby'), hud: $('hud'), chat: $('chat'),
    result: $('result'), nameInput: $('nameInput'), codeInput: $('codeInput'),
    err: $('err'), roomCode: $('roomCode'), playerList: $('playerList'),
    fuseBar: $('fuseBar'), aliveCount: $('aliveCount'), roundLabel: $('roundLabel'),
    bombWarn: $('bombWarn'), chatLog: $('chatLog'), chatForm: $('chatForm'),
    chatInput: $('chatInput'), resultTitle: $('resultTitle'), resultSub: $('resultSub'),
    flash: $('flash'),
  };

  function showOnly(...visible) {
    for (const el of [els.home, els.lobby, els.result]) {
      el.classList.toggle('hidden', !visible.includes(el));
    }
  }

  function setError(msg) {
    els.err.textContent = msg || '';
  }

  // --- Home ---
  $('createBtn').onclick = () => {
    const name = els.nameInput.value.trim() || 'Player';
    setError('');
    handlers.onCreate(name);
  };
  $('joinBtn').onclick = () => {
    const name = els.nameInput.value.trim() || 'Player';
    const code = els.codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setError('Enter the 4-character room code.');
      return;
    }
    setError('');
    handlers.onJoin(code, name);
  };
  // Remember name between visits.
  try {
    els.nameInput.value = localStorage.getItem('hfa-name') || '';
  } catch { /* ignore */ }
  els.nameInput.addEventListener('change', () => {
    try { localStorage.setItem('hfa-name', els.nameInput.value.trim()); } catch { /* ignore */ }
  });
  const saved = loadSession();
  if (saved) {
    const btn = $('rejoinBtn');
    btn.classList.remove('hidden');
    btn.textContent = `Rejoin room ${saved.room} as ${saved.name}`;
    btn.onclick = () => handlers.onRejoin(saved);
  }

  // --- Lobby ---
  $('copyBtn').onclick = async () => {
    const link = `${location.origin}${location.pathname}#${els.roomCode.textContent}`;
    try {
      await navigator.clipboard.writeText(link);
      $('copyBtn').textContent = 'Copied!';
      setTimeout(() => { $('copyBtn').textContent = 'Copy invite link'; }, 1500);
    } catch {
      prompt('Copy this invite link:', link);
    }
  };
  $('addBotBtn').onclick = () => handlers.onAddBot();
  $('startBtn').onclick = () => handlers.onStart();

  // --- Chat ---
  els.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (text) handlers.onChat(text);
    els.chatInput.value = '';
  });

  // --- Result ---
  $('rematchBtn').onclick = () => handlers.onRematch();
  $('lobbyBtn').onclick = () => {
    showOnly(els.lobby);
    els.result.classList.add('hidden');
    handlers.onBackToLobby();
  };

  function renderLobby(code, players, myId) {
    showOnly(els.lobby);
    els.roomCode.textContent = code;
    els.playerList.innerHTML = '';
    for (const p of players) {
      const li = document.createElement('li');
      li.textContent = `${p.name}${p.isBot ? ' 🤖' : ''}`;
      if (p.id === myId) {
        li.textContent += ' (you)';
        li.classList.add('me');
      }
      els.playerList.appendChild(li);
    }
  }

  function renderHUD(snap, myId) {
    els.hud.classList.remove('hidden');
    els.chat.classList.remove('hidden');
    const pct = Math.max(0, Math.min(100, (snap.fuse / 20) * 100));
    els.fuseBar.style.width = pct + '%';
    els.fuseBar.style.background =
      snap.fuse > 10 ? 'linear-gradient(90deg,#69f0ae,#ffb300)'
      : snap.fuse > 5 ? 'linear-gradient(90deg,#ffb300,#ff9100)'
      : 'linear-gradient(90deg,#ff9100,#ff3d00)';
    const alive = snap.players.filter((p) => p.alive).length;
    els.aliveCount.textContent = `💥 ${alive} alive`;
    els.roundLabel.textContent = `Round ${snap.round}`;
    const me = snap.players.find((p) => p.id === myId);
    els.bombWarn.classList.toggle('hidden', !(me && me.hasBomb && me.alive));
  }

  function addChat(from, text) {
    const div = document.createElement('div');
    if (from === 'system') {
      div.className = 'sys';
      div.textContent = text;
    } else {
      const b = document.createElement('b');
      b.textContent = from + ': ';
      div.appendChild(b);
      div.appendChild(document.createTextNode(text));
    }
    els.chatLog.appendChild(div);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function showResult(winnerName, isMe) {
    els.resultTitle.textContent = isMe ? '👑 You win!' : `👑 ${winnerName} wins!`;
    els.resultSub.textContent = isMe
      ? 'Last one standing. The arena is yours.'
      : 'Better luck next time — hit rematch!';
    showOnly(els.result);
  }

  function hideResult() {
    els.result.classList.add('hidden');
  }

  function flash() {
    els.flash.style.transition = 'none';
    els.flash.style.opacity = '0.85';
    requestAnimationFrame(() => {
      els.flash.style.transition = 'opacity .45s ease-out';
      els.flash.style.opacity = '0';
    });
  }

  function enterGame() {
    showOnly(); // hide all panels; HUD + chat stay visible
    hideResult();
  }

  return {
    showOnly, setError, renderLobby, renderHUD, addChat,
    showResult, hideResult, flash, enterGame, els,
  };
}

export function saveSession(room, playerId, name) {
  try {
    sessionStorage.setItem('hfa', JSON.stringify({ room, playerId, name }));
  } catch { /* ignore */ }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem('hfa');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try { sessionStorage.removeItem('hfa'); } catch { /* ignore */ }
}
