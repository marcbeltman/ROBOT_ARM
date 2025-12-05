/*
 * WebSocket connection manager with automatic reconnect and event broadcasting
 * Exports: connectWebSocket(url), sendCommand(obj), addEventListener(event, callback)
 */

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
                console.log('[WebSocket] Received:', obj);  // DEBUG: Log all incoming messages
                if (obj && obj.type) {
                    // Broadcast under the declared type (e.g. 'cameraStandStatus')
                    broadcast(obj.type, obj);
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

    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendCommand({ type: 'heartbeat', timestamp: Date.now() });
            console.log('[WebSocket] Heartbeat sent');
        }
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

