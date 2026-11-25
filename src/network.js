export class NetworkClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws = null;
    this.reconnectTimer = null;
    this.connected = false;
    this.connect();
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.handlers.onConnect?.();
    };

    this.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'online_count') {
        this.handlers.onOnlineCount?.(msg.count);
      } else if (msg.type === 'room_state') {
        this.handlers.onRoomState?.(msg.state, msg.mySeat, msg.event);
      } else if (msg.type === 'emoji_burst') {
        this.handlers.onEmojiBurst?.(msg);
      } else if (msg.type === 'error') {
        this.handlers.onError?.(msg.message);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.handlers.onDisconnect?.();
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 2500);
    };
  }

  send(payload) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  createRoom(name, roomName) {
    return this.send({ type: 'create_room', name, roomName });
  }

  joinRoom(name, codeOrName) {
    return this.send({ type: 'join_room', name, codeOrName });
  }

  addBot() {
    return this.send({ type: 'add_bot' });
  }

  removeBot(seatId) {
    return this.send({ type: 'remove_bot', seatId });
  }

  startGame() {
    return this.send({ type: 'start_game' });
  }

  rollDice() {
    return this.send({ type: 'roll_dice' });
  }

  requestRematch() {
    return this.send({ type: 'request_rematch' });
  }

  sendEmoji(emoji) {
    return this.send({ type: 'send_emoji', emoji });
  }

  leaveRoom() {
    return this.send({ type: 'leave_room' });
  }
}
