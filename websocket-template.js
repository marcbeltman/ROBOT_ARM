// robotArmClient.js
// Moderne, schone ES6-module voor jouw ROBOT_ARM project
// Eén enkele WebSocket voor: commando’s + status + live camera (binary)

class RobotArmClient {
  constructor(url = 'wss://beltman/ws/robot-arm') {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.backoff = 1000;
    this.maxBackoff = 30000;
    this.queue = [];
    this.sliderValues = {};
    this.heartbeatTimeout = null;

    // DOM elements (cache als je ze vaak gebruikt)
    this.camImg = document.getElementById('camera-feed');
    this.statusEl = document.getElementById('connection-status') || null;

    this.connect();
    this.startHeartbeat();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'blob'; // <-- cruciaal voor lage latency camera!
    } catch (err) {
      console.error('WebSocket error bij aanmaken:', err);
      this.reconnect();
      return;
    }

    this.ws.onopen = () => {
      console.info('WebSocket verbonden');
      this.isConnected = true;
      this.backoff = 1000;
      this.flushQueue();
      this.updateStatus('idle');
      this.requestState(); // vraag volledige status op
    };

    this.ws.onmessage = (event) => {
      // 1. Eerst checken: is het een cameraframe? (Blob = binary)
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        if (this.camImg) {
          this.camImg.src = url;
          // Cleanup na tonen (belangrijk voor geheugen)
          setTimeout(() => URL.revokeObjectURL(url), 100);
        }
        return;
      }

      // 2. Anders: JSON bericht (status, update, heartbeat, etc.)
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.warn('Ongeldig JSON ontvangen:', event.data);
        return;
      }

      this.handleMessage(msg);
    };

    this.ws.onerror = () => {
      this.isConnected = false;
      this.updateStatus('error', 'Verbinding fout');
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.updateStatus('warning', 'Verbinding verbroken – opnieuw verbinden...');
      this.reconnect();
    };
  }

  handleMessage(msg) {
    if (msg.type === 'update' && msg.servo) {
      this.updateSlider(msg.servo, msg.angle);
    }

    else if (msg.type === 'state' && msg.sliders) {
      Object.entries(msg.sliders).forEach(([name, value]) => {
        this.updateSlider(name, value);
      });
      this.updateStatus('idle');
    }

    else if (msg.type === 'heartbeat_arm') {
      this.updateArmAlive(true);
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = setTimeout(() => this.updateArmAlive(false), 15000);
    }

    else if (msg.type === 'ack') {
      this.updateStatus('success', 'Commando ontvangen');
    }

    else if (msg.type === 'error') {
      this.updateStatus('error', msg.message || 'Server fout');
    }
  }

  updateSlider(name, angle) {
    const num = Number(angle);
    if (Number.isNaN(num)) return;

    this.sliderValues[name] = num;
    const slider = document.getElementById(name);
    const valueEl = document.getElementById(`${name}-value`);

    if (slider) slider.value = num;
    if (valueEl) valueEl.textContent = num;
  }

  updateStatus(type, text = '') {
    if (!this.statusEl) return;
    this.statusEl.className = `status ${type}`;
    this.statusEl.textContent = text || {
      idle: 'Verbonden',
      success: 'Opgeslagen',
      error: 'Fout',
      warning: 'Herconnecten...'
    }[type] || 'Onbekend';
  }

  updateArmAlive(alive) {
    const el = document.getElementById('arm-status');
    if (el) el.className = alive ? 'alive' : 'dead';
  }

  send(command) {
    const payload = typeof command === 'string' ? command : JSON.stringify(command);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.queue.push(payload);
    }
  }

  flushQueue() {
    while (this.queue.length > 0 && this.isConnected) {
      this.ws.send(this.queue.shift());
    }
  }

  requestState() {
    this.send({ type: 'request_state' }); // server moet hierop antwoorden met {type:'state', ...}
  }

  startHeartbeat() {
    setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'heartbeat' });
      }
    }, 10000);
  }

  reconnect() {
    setTimeout(() => {
      this.backoff = Math.min(this.backoff * 1.5, this.maxBackoff);
      this.connect();
    }, this.backoff);
  }

  // Hulpfunctie voor knoppen
  moveServo(name, angle) {
    this.send({ servo: name, angle });
  }
}

// Exporteer voor gebruik in HTML
window.RobotArmClient = RobotArmClient;