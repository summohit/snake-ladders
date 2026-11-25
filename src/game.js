import {
  PLAYERS_META,
  LADDER_MAP,
  SNAKE_MAP,
  TURN_DURATION_MS,
} from './boardData.js';

export class SnakesLaddersController {
  constructor({ scene, sound, network, onStateChange, onEventBanner, onEmojiBurst, onSnakeBiteImpact }) {
    this.scene = scene;
    this.sound = sound;
    this.network = network;
    this.onStateChange = onStateChange;
    this.onEventBanner = onEventBanner;
    this.onEmojiBurst = onEmojiBurst;
    this.onSnakeBiteImpact = onSnakeBiteImpact;

    this.mode = 'local'; // 'local' | 'online'
    this.mySeat = 0;
    this.state = null;
    this.lastPlayedSeq = 0;
    this.animating = false;

    this.botTimer = null;
    this.turnTimer = null;
  }

  clearTimers() {
    clearTimeout(this.botTimer);
    clearTimeout(this.turnTimer);
    this.botTimer = null;
    this.turnTimer = null;
  }

  startLocalMatch(playerName = 'Player') {
    this.clearTimers();
    this.mode = 'local';
    this.mySeat = 0;
    this.lastPlayedSeq = 0;
    this.animating = false;

    const cleanName = String(playerName || 'Player').trim().slice(0, 18) || 'Player';
    this.state = {
      code: 'LOCAL',
      roomName: 'Enchanted Jungle',
      hostSeat: 0,
      phase: 'playing',
      turnIndex: 0,
      consecutiveSixes: 0,
      turnDeadline: Date.now() + TURN_DURATION_MS,
      turnBusy: false,
      winnerId: null,
      lastEvent: null,
      recentLogs: [],
      seats: PLAYERS_META.map((m, idx) => ({
        id: idx,
        key: m.key,
        colorHex: m.colorHex,
        avatar: m.avatar,
        kind: idx === 0 ? 'human' : 'bot',
        name: idx === 0 ? cleanName : m.defaultName,
        connected: true,
        position: 0,
        rolls: 0,
        sixes: 0,
        laddersClimbed: 0,
        snakesBitten: 0,
      })),
    };

    this.scene.syncPawns(this.state.seats, this.state.turnIndex);
    this.scheduleLocalTurn();
    this.emitState();
  }

  scheduleLocalTurn() {
    this.clearTimers();
    if (!this.state || this.state.phase !== 'playing') return;

    this.state.turnBusy = false;
    this.state.turnDeadline = Date.now() + TURN_DURATION_MS;
    this.scene.syncPawns(this.state.seats, this.state.turnIndex);
    this.emitState();

    const current = this.state.seats[this.state.turnIndex];
    if (current.kind === 'bot') {
      this.botTimer = setTimeout(() => {
        this.executeLocalRoll(current.id, false);
      }, 950);
    } else {
      this.turnTimer = setTimeout(() => {
        this.executeLocalRoll(current.id, true);
      }, TURN_DURATION_MS + 100);
    }
  }

  canMySeatRoll() {
    if (!this.state || this.state.phase !== 'playing') return false;
    if (this.state.turnBusy || this.animating) return false;
    return this.state.turnIndex === this.mySeat;
  }

  requestRoll() {
    if (!this.canMySeatRoll()) return false;
    if (this.mode === 'online') {
      this.network.rollDice();
      return true;
    }
    this.executeLocalRoll(this.mySeat, false);
    return true;
  }

  sendEmoji(emoji) {
    if (!this.state) return;
    if (this.mode === 'online') {
      this.network.sendEmoji(emoji);
    } else {
      const seat = this.state.seats[this.mySeat];
      if (!seat) return;
      this.sound.playEmojiPop();
      this.onEmojiBurst?.({
        seatId: seat.id,
        senderName: seat.name,
        colorHex: seat.colorHex,
        emoji,
      });
    }
  }

  async executeLocalRoll(seatId, isAuto = false) {
    if (!this.state || this.state.phase !== 'playing' || this.state.turnBusy) return;
    if (this.state.turnIndex !== seatId) return;

    this.clearTimers();
    this.state.turnBusy = true;
    this.emitState();

    const seat = this.state.seats[seatId];
    const roll = Math.floor(Math.random() * 6) + 1;
    seat.rolls += 1;
    if (roll === 6) seat.sixes += 1;

    const from = seat.position;
    let stepTarget = from + roll;
    let finalPos = from;
    let outcome = 'move';
    let ladder = null;
    let snake = null;
    let extraTurn = false;
    let logText = '';

    if (roll === 6 && this.state.consecutiveSixes >= 2) {
      outcome = 'triple_six';
      stepTarget = from;
      finalPos = from;
      this.state.consecutiveSixes = 0;
      extraTurn = false;
      logText = `${seat.name} rolled 3 sixes in a row! Turn forfeited.`;
    } else if (stepTarget > 100) {
      outcome = 'overshoot';
      stepTarget = from;
      finalPos = from;
      extraTurn = roll === 6;
      this.state.consecutiveSixes = roll === 6 ? this.state.consecutiveSixes + 1 : 0;
      logText = `${seat.name} rolled ${roll} (needs exact ${100 - from} to win).`;
    } else {
      finalPos = stepTarget;
      if (LADDER_MAP.has(stepTarget)) {
        ladder = LADDER_MAP.get(stepTarget);
        finalPos = ladder.to;
        outcome = 'ladder';
        seat.laddersClimbed += 1;
        logText = `${seat.name} rolled ${roll} & climbed ladder ${ladder.from} → ${ladder.to}!`;
      } else if (SNAKE_MAP.has(stepTarget)) {
        snake = SNAKE_MAP.get(stepTarget);
        finalPos = snake.to;
        outcome = 'snake';
        seat.snakesBitten += 1;
        logText = `${seat.name} rolled ${roll} & got bitten by ${snake.name} (${snake.from} → ${snake.to})!`;
      } else if (finalPos === 100) {
        outcome = 'win';
        logText = `${seat.name} rolled ${roll} and reached 100! 👑`;
      } else {
        logText = `${seat.name} rolled ${roll} → tile ${finalPos}${isAuto ? ' (auto)' : ''}`;
      }

      if (outcome === 'win') {
        this.state.phase = 'finished';
        this.state.winnerId = seat.id;
        this.state.consecutiveSixes = 0;
        extraTurn = false;
      } else if (roll === 6) {
        extraTurn = true;
        this.state.consecutiveSixes += 1;
      } else {
        extraTurn = false;
        this.state.consecutiveSixes = 0;
      }
    }

    const evt = {
      seq: ++this.lastPlayedSeq,
      type: 'roll_result',
      seatId,
      playerName: seat.name,
      roll,
      from,
      stepTarget,
      finalPos,
      outcome,
      ladder,
      snake,
      extraTurn,
      isAuto,
      consecutiveSixes: this.state.consecutiveSixes,
      logText,
    };

    this.state.lastEvent = evt;
    this.state.recentLogs.push({
      id: evt.seq,
      seatId,
      colorHex: seat.colorHex,
      avatar: seat.avatar,
      text: logText,
      outcome,
    });
    if (this.state.recentLogs.length > 10) this.state.recentLogs.shift();

    await this.playRollEvent(evt);
    seat.position = finalPos;
    this.scene.syncPawns(this.state.seats, this.state.turnIndex);

    if (this.state.phase === 'playing') {
      if (!extraTurn) {
        this.state.turnIndex = (seatId + 1) % 4;
      }
      this.scheduleLocalTurn();
    } else {
      this.state.turnBusy = false;
      this.emitState();
    }
  }

  async applyOnlineState(serverState, mySeat, evt) {
    this.clearTimers();
    this.mode = 'online';
    this.mySeat = mySeat;

    const prevSeats = this.state?.seats;
    this.state = serverState;

    if (evt && evt.type === 'roll_result' && evt.seq !== this.lastPlayedSeq) {
      this.lastPlayedSeq = evt.seq;
      // Keep animated pawn at its pre-roll position while playing animation
      if (prevSeats) {
        const tempSeats = serverState.seats.map((s, idx) =>
          idx === evt.seatId ? { ...s, position: evt.from } : s
        );
        this.scene.syncPawns(tempSeats, serverState.turnIndex);
      }
      this.emitState();
      await this.playRollEvent(evt);
    }

    this.scene.syncPawns(this.state.seats, this.state.turnIndex);
    this.emitState();
  }

  async playRollEvent(evt) {
    this.animating = true;
    this.sound.playDiceRoll();
    await this.scene.animateDiceRoll(evt.roll);

    if (evt.outcome === 'triple_six') {
      this.sound.playTripleSix();
      this.onEventBanner?.({
        kind: 'danger',
        title: '💀 TRIPLE SIX!',
        subtitle: `${evt.playerName} rolled three 6s — turn forfeited!`,
      });
      this.animating = false;
      return;
    }

    if (evt.outcome === 'overshoot') {
      this.onEventBanner?.({
        kind: 'info',
        title: `🎯 EXACT ROLL NEEDED`,
        subtitle: `${evt.playerName} needs ${100 - evt.from} to reach 100`,
      });
      this.animating = false;
      return;
    }

    if (evt.roll === 6 && evt.outcome !== 'win') {
      this.sound.playSixBonus();
      this.onEventBanner?.({
        kind: 'bonus',
        title: '🎲 BONUS SIX!',
        subtitle: `${evt.playerName} gets an extra roll!`,
      });
    }

    // Step-by-step tile hops
    for (let s = evt.from; s < evt.stepTarget; s++) {
      this.sound.playHop(s - evt.from);
      await this.scene.animatePawnSteps(evt.seatId, s, s + 1);
    }

    if (evt.outcome === 'ladder' && evt.ladder) {
      this.sound.playLadderClimb();
      this.onEventBanner?.({
        kind: 'ladder',
        title: `🪜 JUNGLE LADDER!`,
        subtitle: `${evt.playerName} climbs ${evt.ladder.from} → ${evt.ladder.to}!`,
      });
      await this.scene.animateLadderClimb(evt.seatId, evt.ladder);
    } else if (evt.outcome === 'snake' && evt.snake) {
      // 1. Giant 3D snake lunges straight at the screen for a jump-scare bite!
      this.sound.playSnakeJumpScare();
      await this.scene.animateSnakeJumpScare(evt.snake, () => {
        this.onSnakeBiteImpact?.(evt.snake, evt.playerName);
      });

      // 2. Show banner & slide the bitten pawn down the snake's back
      this.sound.playSnakeBite();
      this.onEventBanner?.({
        kind: 'snake',
        title: `🐍 ${evt.snake.name.toUpperCase()} BITE!`,
        subtitle: `${evt.playerName} slides ${evt.snake.from} → ${evt.snake.to}!`,
      });
      await this.scene.animateSnakeSlide(evt.seatId, evt.snake);
    } else if (evt.outcome === 'win') {
      this.sound.playWin();
      this.scene.animateWinCelebration(evt.seatId);
      this.onEventBanner?.({
        kind: 'win',
        title: `👑 JUNGLE CHAMPION!`,
        subtitle: `${evt.playerName} reached Tile 100!`,
      });
    }

    this.animating = false;
  }

  emitState() {
    this.onStateChange?.(this.state, this.mySeat, this.mode);
  }
}
