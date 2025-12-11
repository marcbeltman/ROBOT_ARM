/*
 * WebSocket connection manager with automatic reconnect and event broadcasting
 * Exports: connectWebSocket(url), sendCommand(obj), addEventListener(event, callback), sessionID
 */

// 1. Probeer een bestaande ID te vinden in het geheugen van de browser
let existingID = sessionStorage.getItem('mijn_sessie_id');
// 2. Als die er niet is (eerste bezoek), maak dan pas een nieuwe aan
if (!existingID) {
    existingID = crypto.randomUUID();
    // Sla hem op! Deze blijft bestaan zolang de tab open is.
    sessionStorage.setItem('mijn_sessie_id', existingID);
}

export const sessionID = existingID;

let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT = 30000;
const listeners = {};

// Heartbeat configuration
let heartbeatInterval = null;
const HEARTBEAT_INTERVAL = 10000; // 10 seconds

/**
 * Open a WebSocket connection with exponential backoff reconnect on close/error
 */
export function connectWebSocket(url) {
    console.log(`[WebSocket] Connecting to ${url}...`);

    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectDelay = 1000; // reset backoff
        startHeartbeat();
        broadcast('open');
    };

    ws.onmessage = (event) => {
        const data = event.data;

        // Binary frames (video) — broadcast as 'binary'
        if (data instanceof ArrayBuffer) {
            broadcast('binary', data);
            return;
        }

        // Text frames — attempt to parse JSON and broadcast by type
        if (typeof data === 'string') {
            try {
                const obj = JSON.parse(data);
                // Prefer nested payload.type for Node-RED style messages
                if (obj && obj.payload && typeof obj.payload === 'object' && obj.payload.type) {
                    broadcast(obj.payload.type, obj.payload);
                } else if (obj && obj.type) {
                    // Broadcast under the declared type (e.g. 'cameraStandStatus')
                    broadcast(obj.type, obj);
                } else if (obj && obj.topic) {
                    // Support Node-RED style messages where topic acts as the type
                    broadcast(obj.topic, obj);
                } else if (obj && obj.connection_count !== undefined) {
                    // Detect connection count message if sent as raw payload
                    broadcast('connection_count', obj);
                } else {
                    broadcast('json', obj);
                }
                return;
            } catch (err) {
                // Not JSON — fall through to text
            }
        }

        // Fallback: raw text or unknown
        broadcast('text', data);
    };

    ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        broadcast('error', err);
    };

    ws.onclose = (ev) => {
        console.log(`[WebSocket] Closed (reason: ${ev.reason || 'unknown'})`);
        stopHeartbeat();
        broadcast('close', ev);

        // Attempt reconnect with exponential backoff
        setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT);
            console.log(`[WebSocket] Reconnecting in ${reconnectDelay}ms...`);
            connectWebSocket(url);
        }, reconnectDelay);
    };
}

/**
 * Send a JSON command via WebSocket (only if connected)
 */
export function sendCommand(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(obj));
        } catch (err) {
            console.error('[WebSocket] Failed to send command:', err);
        }
    } else {
        console.warn('[WebSocket] Not connected, command queued or lost:', obj);
    }
}

/**
 * Subscribe to WebSocket events: 'open', 'message', 'close', 'error'
 */
export function addEventListener(event, callback) {
    if (!listeners[event]) {
        listeners[event] = [];
    }
    listeners[event].push(callback);
}

/**
 * Unsubscribe from WebSocket events
 */
export function removeEventListener(event, callback) {
    if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
}

/**
 * Internal: broadcast events to all registered listeners
 */
function broadcast(event, data) {
    console.debug(`[WebSocket] Broadcasting '${event}' to ${listeners[event] ? listeners[event].length : 0} listener(s)`);
    if (listeners[event]) {
        listeners[event].forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error(`[WebSocket] Listener error for '${event}':`, err);
            }
        });
    }
}

/**
 * Utility: get current connection state
 */
export function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
}

/**
 * Utility: get WebSocket instance (for advanced use only)
 */
export function getWebSocket() {
    return ws;
}

/**
 * Start sending periodic heartbeat messages
 */
function startHeartbeat() {
    stopHeartbeat(); // Clear any existing interval
    console.log('[WebSocket] Starting heartbeat');

    // Send one immediately on connect so the server sees us right away
    sendHeartbeat();

    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
}

/**
 * Stop sending heartbeat messages
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('[WebSocket] Heartbeat stopped');
    }
}

/**
 * Internal: send a single heartbeat if the socket is open
 */
function sendHeartbeat() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'heartbeat', timestamp: Date.now(), sessionID: sessionID });
        console.log('[WebSocket] Heartbeat sent');
    }
}


// Robuuste afmelding: stuur bij sluiten een disconnect via Beacon (valt terug op WS)
window.addEventListener('beforeunload', function () {
    // 1. STOP DE HARTSLAG DIRECT!
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    // 2. Verstuur Beacon...
    const id = sessionStorage.getItem('mijn_sessie_id');
    if (!id) return;

    const payload = { type: 'disconnect', sessionID: id };
    const data = JSON.stringify(payload);

    // 1. HTTP BEACON (De betrouwbare methode bij sluiten)
    if (navigator.sendBeacon) {
        // BELANGRIJK: Gebruik 'text/plain' om CORS-blokkades te voorkomen
        // Node-RED's JSON-node zet dit automatisch weer om naar een object.
        const blob = new Blob([data], { type: 'text/plain' });

        // BELANGRIJK: Gebruik de volledige URL naar jouw Node-RED instantie
        navigator.sendBeacon('https://node-red.xyz/disconnect', blob);
    }

    // 2. WEBSOCKET (Best effort, voor als de socket toevallig nog open is)
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
    }
});
