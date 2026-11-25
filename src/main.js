import { TURN_DURATION_MS } from './boardData.js';
import { JungleScene } from './scene.js';
import { SoundEngine } from './audio.js';
import { NetworkClient } from './network.js';
import { SnakesLaddersController } from './game.js';

const $ = (id) => document.getElementById(id);

const canvas = $('jungle-canvas');
const homeScreen = $('home-screen');
const gameHud = $('game-hud');
const onlineCountLabel = $('online-count-label');
const homeNameInput = $('home-name-input');
const homeNameClear = $('home-name-clear');

const btnPlayBots = $('btn-play-bots');
const btnCreateRoom = $('btn-create-room');
const btnJoinRoom = $('btn-join-room');
const btnBackHome = $('btn-back-home');
const hudRoomChip = $('hud-room-chip');
const btnCamView = $('btn-cam-view');
const btnRules = $('btn-rules');
const btnMute = $('btn-mute');

const seatsLayer = $('seats-layer');
const feedList = $('feed-list');
const btnRollDice = $('btn-roll-dice');
const rollBtnTitle = $('roll-btn-title');
const rollBtnSub = $('roll-btn-sub');
const turnLockTooltip = $('turn-lock-tooltip');
const emojiFountain = $('emoji-fountain');
const biteScareFx = $('bite-scare-fx');
const biteChompText = $('bite-chomp-text');

const eventBanner = $('event-banner');
const eventBannerTitle = $('event-banner-title');
const eventBannerSub = $('event-banner-sub');

const mpModal = $('mp-modal');
const mpModalTitle = $('mp-modal-title');
const mpModalClose = $('mp-modal-close');
const mpFormView = $('mp-form-view');
const mpLobbyView = $('mp-lobby-view');
const mpFieldLabel = $('mp-field-label');
const mpRoomInput = $('mp-room-input');
const mpErrorMsg = $('mp-error-msg');
const mpSubmitBtn = $('mp-submit-btn');

const lobbyRoomCode = $('lobby-room-code');
const lobbyRoomName = $('lobby-room-name');
const btnCopyCode = $('btn-copy-code');
const lobbySeatsList = $('lobby-seats-list');
const lobbyErrorMsg = $('lobby-error-msg');
const lobbyHostActions = $('lobby-host-actions');
const lobbyGuestWait = $('lobby-guest-wait');
const btnAddBot = $('btn-add-bot');
const btnStartMatch = $('btn-start-match');

const rulesModal = $('rules-modal');
const rulesClose = $('rules-close');

const victoryModal = $('victory-modal');
const victoryTitle = $('victory-title');
const victorySub = $('victory-sub');
const victoryStandings = $('victory-standings');
const btnRematch = $('btn-rematch');
const btnVictoryHome = $('btn-victory-home');

const scene = new JungleScene(canvas);
const sound = new SoundEngine();

let currentState = null;
let currentMySeat = 0;
let currentMode = 'local';
let mpAction = 'create'; // 'create' | 'join'
let bannerTimer = null;
let camIndex = 0;
const CAM_MODES = [
  { key: 'isometric', label: '🎥 Isometric' },
  { key: 'top', label: '🎥 Top-Down' },
  { key: 'cinematic', label: '🎥 Angle' },
];

// Restore saved explorer name
const savedName = localStorage.getItem('sl_jungle_name');
if (savedName) homeNameInput.value = savedName;

function getExplorerName() {
  const val = homeNameInput.value.trim().slice(0, 18) || 'Player';
  localStorage.setItem('sl_jungle_name', val);
  return val;
}

function showEventBanner({ kind = 'info', title, subtitle }) {
  clearTimeout(bannerTimer);
  eventBanner.className = `event-banner ${kind}`;
  eventBannerTitle.textContent = title;
  eventBannerSub.textContent = subtitle;
  bannerTimer = setTimeout(() => {
    eventBanner.classList.add('hidden');
  }, 2400);
}

function launchEmojiFountain({ emoji, senderName, colorHex }) {
  sound.playEmojiPop();

  const pill = document.createElement('div');
  pill.className = 'fountain-sender-pill';
  pill.style.borderColor = colorHex || '#ffcf33';
  pill.textContent = `${senderName} sent ${emoji}`;
  emojiFountain.appendChild(pill);
  setTimeout(() => pill.remove(), 2100);

  const count = 16;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'fountain-emoji';
    el.textContent = emoji;
    const left = 10 + Math.random() * 80;
    const size = 32 + Math.random() * 34;
    const dur = 1.9 + Math.random() * 1.1;
    const delay = Math.random() * 0.45;
    const sway = (Math.random() - 0.5) * 140;
    const rot = (Math.random() - 0.5) * 45;
    el.style.left = `${left}vw`;
    el.style.setProperty('--size', `${size}px`);
    el.style.setProperty('--dur', `${dur}s`);
    el.style.setProperty('--sway', `${sway}px`);
    el.style.setProperty('--rot', `${rot}deg`);
    el.style.animationDelay = `${delay}s`;
    emojiFountain.appendChild(el);
    setTimeout(() => el.remove(), (dur + delay + 0.2) * 1000);
  }
}

const network = new NetworkClient({
  onOnlineCount: (count) => {
    onlineCountLabel.textContent = `Online • ${count} ${count === 1 ? 'player' : 'players'}`;
  },
  onRoomState: (state, mySeat, evt) => {
    controller.applyOnlineState(state, mySeat, evt);
  },
  onEmojiBurst: (msg) => {
    launchEmojiFountain(msg);
  },
  onError: (message) => {
    if (!mpModal.classList.contains('hidden')) {
      if (!mpFormView.classList.contains('hidden')) {
        mpErrorMsg.textContent = message;
        mpErrorMsg.classList.remove('hidden');
      } else {
        lobbyErrorMsg.textContent = message;
        lobbyErrorMsg.classList.remove('hidden');
      }
    } else {
      showEventBanner({ kind: 'danger', title: '⚠️ Notice', subtitle: message });
    }
  },
});

let biteFxTimer = null;

function triggerSnakeBiteImpact(snake) {
  clearTimeout(biteFxTimer);
  biteChompText.textContent = `🐍 ${snake?.name ? snake.name.toUpperCase() : 'BITTEN'}!`;

  // Restart CSS animations cleanly
  document.body.classList.remove('bite-shake');
  biteScareFx.classList.add('hidden');
  void biteScareFx.offsetWidth;
  document.body.classList.add('bite-shake');
  biteScareFx.classList.remove('hidden');

  biteFxTimer = setTimeout(() => {
    document.body.classList.remove('bite-shake');
    biteScareFx.classList.add('hidden');
  }, 880);
}

const controller = new SnakesLaddersController({
  scene,
  sound,
  network,
  onStateChange: (state, mySeat, mode) => {
    currentState = state;
    currentMySeat = mySeat;
    currentMode = mode;
    renderUI();
  },
  onEventBanner: showEventBanner,
  onEmojiBurst: launchEmojiFountain,
  onSnakeBiteImpact: triggerSnakeBiteImpact,
});

function enterGameView() {
  document.body.classList.remove('home-active');
  homeScreen.classList.add('hidden');
  gameHud.classList.remove('hidden');
  mpModal.classList.add('hidden');
}

function returnHome() {
  if (currentMode === 'online') {
    network.leaveRoom();
  }
  controller.clearTimers();
  currentState = null;
  document.body.classList.add('home-active');
  homeScreen.classList.remove('hidden');
  gameHud.classList.add('hidden');
  mpModal.classList.add('hidden');
  victoryModal.classList.add('hidden');
  turnLockTooltip.classList.add('hidden');
}

function renderSeats(state) {
  seatsLayer.innerHTML = '';
  const activeSeats = state.seats.filter((s) => s.kind !== 'vacant');

  // Place player's own seat at bottom-left (pos 0) and others clockwise
  const ordered = [];
  for (let offset = 0; offset < 4; offset++) {
    const idx = (currentMySeat + offset) % 4;
    const seat = state.seats[idx];
    if (seat && seat.kind !== 'vacant') {
      ordered.push({ seat, pos: offset });
    }
  }

  for (const { seat, pos } of ordered) {
    const isTurn = state.phase === 'playing' && state.turnIndex === seat.id;
    const card = document.createElement('div');
    card.className = `seat-card ${isTurn ? 'active' : 'inactive'}`;
    card.dataset.pos = String(pos);
    card.dataset.seatId = String(seat.id);
    card.style.setProperty('--seat-color', seat.colorHex);

    const pct = Math.min(100, Math.max(0, seat.position));
    const isMe = seat.id === currentMySeat;
    const tag = isMe ? ' (You)' : seat.kind === 'bot' ? ' 🤖' : '';

    card.innerHTML = `
      <div class="seat-avatar-ring">
        <svg class="seat-timer-svg" viewBox="0 0 46 46">
          <circle class="seat-timer-bg" cx="23" cy="23" r="20"></circle>
          <circle class="seat-timer-fg" data-ring-seat="${seat.id}" cx="23" cy="23" r="20"></circle>
        </svg>
        <div class="seat-avatar-inner">${seat.avatar}</div>
      </div>
      <div class="seat-info">
        <div class="seat-name-row">
          <span class="seat-name">${escapeHtml(seat.name)}${tag}</span>
          <span class="seat-timer-text" data-timer-seat="${seat.id}">${isTurn ? '⏱ 60s' : ''}</span>
        </div>
        <div class="seat-meta">
          <span>Tile ${seat.position}/100</span>
          <span>🪜${seat.laddersClimbed} 🐍${seat.snakesBitten}</span>
        </div>
        <div class="seat-progress-track">
          <div class="seat-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
    seatsLayer.appendChild(card);
  }
}

function renderFeed(state) {
  const logs = (state.recentLogs || []).slice(-3).reverse();
  if (!logs.length) {
    feedList.innerHTML = `<li class="feed-item">Roll the dice to begin the jungle race!</li>`;
    return;
  }
  feedList.innerHTML = logs
    .map(
      (item) =>
        `<li class="feed-item ${item.outcome || ''}" style="border-left-color:${item.colorHex || '#18f084'}">${escapeHtml(
          item.text
        )}</li>`
    )
    .join('');
}

function renderLobby(state) {
  mpModal.classList.remove('hidden');
  mpFormView.classList.add('hidden');
  mpLobbyView.classList.remove('hidden');
  lobbyErrorMsg.classList.add('hidden');

  mpModalTitle.textContent = '🌿 Jungle Room Lobby';
  lobbyRoomCode.textContent = state.code;
  lobbyRoomName.textContent = state.roomName;

  const isHost = currentMySeat === state.hostSeat;
  lobbyHostActions.classList.toggle('hidden', !isHost);
  lobbyGuestWait.classList.toggle('hidden', isHost);

  lobbySeatsList.innerHTML = state.seats
    .map((s) => {
      const status =
        s.kind === 'vacant'
          ? '<span style="color:#7da893">Vacant Seat</span>'
          : s.kind === 'bot'
          ? `<span>🤖 ${escapeHtml(s.name)}</span>`
          : `<span>${s.avatar} ${escapeHtml(s.name)} ${s.id === state.hostSeat ? '👑' : ''}</span>`;

      const actionBtn =
        isHost && s.kind === 'bot'
          ? `<button type="button" class="hud-pill-btn" data-remove-bot="${s.id}" style="height:28px;padding:0 10px;font-size:0.75rem;">Remove</button>`
          : `<span style="font-size:0.75rem;color:#9fd1b8">Seat ${s.id + 1}</span>`;

      return `<div class="lobby-seat-row" style="--seat-color:${s.colorHex}">${status}${actionBtn}</div>`;
    })
    .join('');

  lobbySeatsList.querySelectorAll('[data-remove-bot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      network.removeBot(Number(btn.dataset.removeBot));
    });
  });
}

function renderVictory(state) {
  victoryModal.classList.remove('hidden');
  const winner = state.seats[state.winnerId];
  victoryTitle.textContent = `${winner?.name || 'Player'} Wins!`;
  victorySub.textContent = `Conquered the Enchanted Jungle on Tile 100 👑`;

  const ranked = state.seats
    .filter((s) => s.kind !== 'vacant')
    .sort((a, b) => b.position - a.position);

  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  victoryStandings.innerHTML = ranked
    .map(
      (s, i) => `
      <div class="standing-row" style="--seat-color:${s.colorHex}">
        <div>${medals[i] || ''} ${s.avatar} ${escapeHtml(s.name)}</div>
        <div class="standing-stats">Tile ${s.position} • 🪜${s.laddersClimbed} • 🐍${s.snakesBitten} • 🎲${s.sixes}×6</div>
      </div>`
    )
    .join('');

  const canRematch = currentMode === 'local' || currentMySeat === state.hostSeat;
  btnRematch.classList.toggle('hidden', !canRematch);
}

function renderUI() {
  if (!currentState) return;

  if (currentState.phase === 'lobby') {
    renderLobby(currentState);
    return;
  }

  enterGameView();
  hudRoomChip.textContent =
    currentMode === 'online'
      ? `🌐 Room ${currentState.code}`
      : `🌿 Enchanted Jungle • Bots`;

  renderSeats(currentState);
  renderFeed(currentState);

  const canRoll = controller.canMySeatRoll();
  const activeSeat = currentState.seats[currentState.turnIndex];
  btnRollDice.classList.toggle('locked', !canRoll);
  if (canRoll) {
    rollBtnTitle.textContent =
      currentState.consecutiveSixes > 0 ? 'BONUS ROLL!' : 'ROLL DICE';
    rollBtnSub.textContent = 'Your Turn • Tap or Spacebar';
  } else {
    rollBtnTitle.textContent = currentState.phase === 'finished' ? 'MATCH OVER' : 'WAITING...';
    rollBtnSub.textContent =
      activeSeat && currentState.phase === 'playing'
        ? `${activeSeat.name}'s Turn`
        : 'Enchanted Jungle';
  }

  if (currentState.phase === 'finished') {
    renderVictory(currentState);
  } else {
    victoryModal.classList.add('hidden');
  }
}

// Smooth 60-second SVG circular countdown updater
setInterval(() => {
  if (!currentState || currentState.phase !== 'playing') return;
  const remaining = Math.max(0, currentState.turnDeadline - Date.now());
  const secs = Math.ceil(remaining / 1000);
  const ratio = Math.max(0, Math.min(1, remaining / TURN_DURATION_MS));
  const circumference = 2 * Math.PI * 20; // ~125.66

  const activeId = currentState.turnIndex;
  const ringEl = document.querySelector(`[data-ring-seat="${activeId}"]`);
  const textEl = document.querySelector(`[data-timer-seat="${activeId}"]`);
  if (ringEl) {
    ringEl.style.strokeDasharray = String(circumference);
    ringEl.style.strokeDashoffset = String(circumference * (1 - ratio));
  }
  if (textEl) {
    textEl.textContent = `⏱ ${secs}s`;
    textEl.style.color = secs <= 10 ? '#ff5c7c' : '#ffcf33';
  }
}, 140);

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */
homeNameClear.addEventListener('click', () => {
  homeNameInput.value = '';
  homeNameInput.focus();
});

btnPlayBots.addEventListener('click', () => {
  sound.ensureContext();
  enterGameView();
  controller.startLocalMatch(getExplorerName());
});

btnCreateRoom.addEventListener('click', () => {
  sound.ensureContext();
  mpAction = 'create';
  mpModalTitle.textContent = '➕ Create Jungle Room';
  mpFieldLabel.textContent = 'Room Name (optional)';
  mpRoomInput.placeholder = 'e.g. Emerald Squad';
  mpRoomInput.value = '';
  mpSubmitBtn.textContent = 'Create Room';
  mpErrorMsg.classList.add('hidden');
  mpFormView.classList.remove('hidden');
  mpLobbyView.classList.add('hidden');
  mpModal.classList.remove('hidden');
  mpRoomInput.focus();
});

btnJoinRoom.addEventListener('click', () => {
  sound.ensureContext();
  mpAction = 'join';
  mpModalTitle.textContent = '🔑 Join Jungle Room';
  mpFieldLabel.textContent = 'Enter 6-Letter Code or Room Name';
  mpRoomInput.placeholder = 'e.g. X7K9PQ';
  mpRoomInput.value = '';
  mpSubmitBtn.textContent = 'Join Room';
  mpErrorMsg.classList.add('hidden');
  mpFormView.classList.remove('hidden');
  mpLobbyView.classList.add('hidden');
  mpModal.classList.remove('hidden');
  mpRoomInput.focus();
});

mpSubmitBtn.addEventListener('click', () => {
  const name = getExplorerName();
  const val = mpRoomInput.value.trim();
  mpErrorMsg.classList.add('hidden');
  if (mpAction === 'create') {
    network.createRoom(name, val);
  } else {
    if (!val) {
      mpErrorMsg.textContent = 'Please enter a room code or room name.';
      mpErrorMsg.classList.remove('hidden');
      return;
    }
    network.joinRoom(name, val);
  }
});

mpRoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') mpSubmitBtn.click();
});

mpModalClose.addEventListener('click', () => {
  if (currentState && currentState.phase === 'lobby') {
    network.leaveRoom();
    currentState = null;
  }
  mpModal.classList.add('hidden');
});

btnCopyCode.addEventListener('click', () => {
  if (!currentState) return;
  navigator.clipboard?.writeText(currentState.code).catch(() => {});
  btnCopyCode.textContent = '✅ Copied!';
  setTimeout(() => {
    btnCopyCode.textContent = '📋 Copy';
  }, 1500);
});

btnAddBot.addEventListener('click', () => network.addBot());
btnStartMatch.addEventListener('click', () => network.startGame());

btnRollDice.addEventListener('click', () => {
  sound.ensureContext();
  controller.requestRoll();
});

// Cursor-following lock tooltip when hovering over dice on another player's turn
btnRollDice.addEventListener('mousemove', (e) => {
  if (!currentState || currentState.phase !== 'playing') {
    turnLockTooltip.classList.add('hidden');
    return;
  }
  if (!controller.canMySeatRoll()) {
    const active = currentState.seats[currentState.turnIndex];
    turnLockTooltip.textContent = `🔒 Wait! ${active ? active.name : 'Opponent'}'s Turn`;
    turnLockTooltip.style.left = `${e.clientX}px`;
    turnLockTooltip.style.top = `${e.clientY}px`;
    turnLockTooltip.classList.remove('hidden');
  } else {
    turnLockTooltip.classList.add('hidden');
  }
});

btnRollDice.addEventListener('mouseleave', () => {
  turnLockTooltip.classList.add('hidden');
});

// Spacebar to roll dice
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !homeScreen.classList.contains('hidden')) return;
  if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    sound.ensureContext();
    controller.requestRoll();
  }
});

// Emoji reactions
document.querySelectorAll('.emoji-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    sound.ensureContext();
    controller.sendEmoji(btn.dataset.emoji || '🔥');
  });
});

// Camera switcher
btnCamView.addEventListener('click', () => {
  camIndex = (camIndex + 1) % CAM_MODES.length;
  const mode = CAM_MODES[camIndex];
  btnCamView.textContent = mode.label;
  scene.setCameraView(mode.key);
});

// Rules modal
btnRules.addEventListener('click', () => rulesModal.classList.remove('hidden'));
rulesClose.addEventListener('click', () => rulesModal.classList.add('hidden'));
rulesModal.addEventListener('click', (e) => {
  if (e.target === rulesModal) rulesModal.classList.add('hidden');
});

// Sound mute toggle
let muted = false;
btnMute.addEventListener('click', () => {
  muted = !muted;
  sound.setMuted(muted);
  btnMute.textContent = muted ? '🔇' : '🔊';
});

// Back home & Victory actions
btnBackHome.addEventListener('click', returnHome);
btnVictoryHome.addEventListener('click', returnHome);
btnRematch.addEventListener('click', () => {
  victoryModal.classList.add('hidden');
  if (currentMode === 'online') {
    network.requestRematch();
  } else {
    controller.startLocalMatch(getExplorerName());
  }
});
