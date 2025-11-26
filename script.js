// robotArmClient.js
// Moderne, schone ES6-module voor jouw ROBOT_ARM project
// Eén enkele WebSocket voor: commando’s + status + live camera (binary)

class RobotArmClient {
  constructor(url = 'wss://node-red.xyz/ws/ArmControlSocket') {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.backoff = 1000;
    this.maxBackoff = 30000;
    this.queue = [];
    this.sliderValues = {};
    this.heartbeatTimeout = null;
    this._lastCamUrl = null;
    this._messageCount = 0;  // Diagnostics: count received messages

    // DOM elements (cache als je ze vaak gebruikt)
    // find the img element we'll use to show camera frames (fallback image element)
    this.camImg = document.getElementById('cameraFallback') || document.getElementById('camera-feed') || null;
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
      console.info('[RobotArmClient] WebSocket verbonden');
      console.info('[RobotArmClient] URL:', this.url);
      console.info('[RobotArmClient] binaryType:', this.ws.binaryType);
      this.isConnected = true;
      this.backoff = 1000;
      this.flushQueue();
      this.updateStatus('idle');
      this.requestState(); // vraag volledige status op
    };

    this.ws.onmessage = (event) => {
      this._messageCount++;
      console.log(`\n========== MESSAGE #${this._messageCount} ==========`);
      console.log('[RobotArmClient] Raw event:', event);
      console.log('[RobotArmClient] event.data:', event.data);
      
      // Detailed type diagnostics
      console.log('[RobotArmClient] Type Analysis:');
      console.log('  - typeof event.data:', typeof event.data);
      console.log('  - isBlob:', event.data instanceof Blob);
      console.log('  - isArrayBuffer:', event.data instanceof ArrayBuffer);
      console.log('  - isView:', ArrayBuffer.isView(event.data));
      console.log('  - isString:', typeof event.data === 'string');
      console.log('  - size/byteLength/length:', event.data.size || event.data.byteLength || event.data.length || 'N/A');
      
      // If it's a string, show it
      if (typeof event.data === 'string') {
        console.log('[RobotArmClient] String content:', event.data.substring(0, 500));
      }
      
      // If it's a Blob, show size
      if (event.data instanceof Blob) {
        console.log('[RobotArmClient] Blob size:', event.data.size, 'bytes, type:', event.data.type);
      }
      
      // If it's binary, try to show first few bytes
      if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
        const bytes = new Uint8Array(event.data instanceof ArrayBuffer ? event.data : event.data.buffer);
        console.log('[RobotArmClient] Binary data first 20 bytes:', Array.from(bytes.slice(0, 20)));
      }
      console.log('==========================================\n');
      
      // 1. Eerst checken: is het een cameraframe? (Blob = binary)
      // Handle Blob frames (common when ws.binaryType='blob')
      if (event.data instanceof Blob) {
        console.log('[RobotArmClient] Received Blob (camera frame), size=', event.data.size);
        const url = URL.createObjectURL(event.data);
        if (this.camImg) {
          try { if (this._lastCamUrl) URL.revokeObjectURL(this._lastCamUrl); } catch(e){}
          this._lastCamUrl = url;
          this.camImg.src = url;
          this.camImg.style.display = 'block';
          this.camImg.style.background = '#ffffff';
          this.camImg.style.border = '2px solid #ddd';
          this.camImg.style.borderRadius = '8px';
          const placeholder = document.getElementById('cameraPlaceholder'); if (placeholder) placeholder.style.display = 'none';
        }
        return;
      }

      // Handle ArrayBuffer frames (ws.binaryType='arraybuffer' or some servers)
      if (event.data instanceof ArrayBuffer) {
        console.log('[RobotArmClient] Received ArrayBuffer (camera frame), byteLength=', event.data.byteLength);
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        if (this.camImg) {
          try { if (this._lastCamUrl) URL.revokeObjectURL(this._lastCamUrl); } catch(e){}
          this._lastCamUrl = url;
          this.camImg.src = url;
          this.camImg.style.display = 'block';
          this.camImg.style.background = '#ffffff';
          this.camImg.style.border = '2px solid #ddd';
          this.camImg.style.borderRadius = '8px';
          const placeholder = document.getElementById('cameraPlaceholder'); if (placeholder) placeholder.style.display = 'none';
        }
        return;
      }

      // Handle typed arrays (e.g. Node Buffer may arrive as a view)
      if (ArrayBuffer.isView(event.data)) {
        const byteLength = event.data.byteLength || (event.data.buffer && event.data.buffer.byteLength) || 0;
        console.log('[RobotArmClient] Received ArrayBuffer view (camera frame), byteLength=', byteLength);
        const blob = new Blob([event.data.buffer || event.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        if (this.camImg) {
          try { if (this._lastCamUrl) URL.revokeObjectURL(this._lastCamUrl); } catch(e){}
          this._lastCamUrl = url;
          this.camImg.src = url;
          this.camImg.style.display = 'block';
          this.camImg.style.background = '#ffffff';
          this.camImg.style.border = '2px solid #ddd';
          this.camImg.style.borderRadius = '8px';
          const placeholder = document.getElementById('cameraPlaceholder'); if (placeholder) placeholder.style.display = 'none';
        }
        return;
      }

      // 2. Anders: JSON bericht (status, update, heartbeat, etc.)
      let msg;
      try {
        // Log textual payload (trimmed to avoid huge logs)
        if (typeof event.data === 'string') {
          console.log('[RobotArmClient] Received text message:', event.data.length > 1000 ? event.data.slice(0,1000) + '... (truncated)' : event.data);
        }
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
    // If Node-RED sends an object with payload as an array of byte values,
    // convert it to a Blob and display as an image frame.
    if (msg && msg.payload && Array.isArray(msg.payload)) {
      try {
        console.log('[RobotArmClient] Detected Node-RED payload array, length=', msg.payload.length);
        const arr = new Uint8Array(msg.payload);
        const blob = new Blob([arr], { type: 'image/jpeg' });
        if (this.camImg) {
          const url = URL.createObjectURL(blob);
          try { if (this._lastCamUrl) URL.revokeObjectURL(this._lastCamUrl); } catch(e){}
          this._lastCamUrl = url;
          this.camImg.src = url;
          this.camImg.style.display = 'block';
          this.camImg.style.background = '#ffffff';
          this.camImg.style.border = '2px solid #ddd';
          this.camImg.style.borderRadius = '8px';
          const placeholder = document.getElementById('cameraPlaceholder'); if (placeholder) placeholder.style.display = 'none';
          console.log('[RobotArmClient] Displaying decoded camera frame from payload array (bytes=', arr.length, ')');
        }
        return;
      } catch (e) {
        console.warn('Failed to decode payload array to image blob', e);
      }
    }

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