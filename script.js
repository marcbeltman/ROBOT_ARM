// Reconnecting WebSocket with optimized video frame handling
const WS_URL = 'wss://node-red.xyz/ws/ArmControlSocket';
let ws;
let reconnectDelay = 1000; // start 1s
const MAX_RECONNECT = 30000; // cap at 30s

// Frame processing queue/backpressure
const frameQueue = [];
const MAX_QUEUE = 3; // keep a small queue to avoid piling up
let processing = false;

const canvas = document.getElementById('videoCanvas');
const imgFallback = document.getElementById('videoFrame');
const ctx = canvas ? canvas.getContext('2d') : null;
let lastObjectUrl = null;

function connect() {
    ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        console.log('WebSocket verbinding geopend');
        reconnectDelay = 1000; // reset backoff
    };

    ws.onmessage = (event) => {
        // Expecting binary JPEG frames (ArrayBuffer)
        if (!(event.data instanceof ArrayBuffer)) return;

        // Keep only recent frames: if queue grows, drop older frames but keep newest
        if (frameQueue.length >= MAX_QUEUE) {
            frameQueue.shift();
        }
        frameQueue.push(event.data);
        processQueue();
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };

    ws.onclose = (ev) => {
        console.log('WebSocket verbinding gesloten', ev.reason || '');
        // Attempt reconnect with exponential backoff
        setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT);
            connect();
        }, reconnectDelay);
    };
}

async function processQueue() {
    if (processing) return;
    if (frameQueue.length === 0) return;
    processing = true;

    const buffer = frameQueue.shift();
    try {
        const blob = new Blob([buffer], { type: 'image/jpeg' });

        if (typeof createImageBitmap === 'function' && ctx) {
            // Preferred fast path: createImageBitmap -> draw to canvas
            const bitmap = await createImageBitmap(blob);
            // Resize canvas to frame size if needed
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close?.();
            // Hide placeholder and ensure canvas is visible (use classes)
            const placeholder = document.getElementById('cameraPlaceholder');
            if (placeholder) placeholder.classList.add('hidden');
            if (canvas) canvas.classList.remove('hidden');
        } else if (imgFallback) {
            // Fallback: use object URL on an <img> element
            if (lastObjectUrl) {
                URL.revokeObjectURL(lastObjectUrl);
            }
            lastObjectUrl = URL.createObjectURL(blob);
            imgFallback.src = lastObjectUrl;
            // Hide placeholder and ensure image is visible (use classes)
            const placeholder = document.getElementById('cameraPlaceholder');
            if (placeholder) placeholder.classList.add('hidden');
            imgFallback.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Frame processing error:', err);
    } finally {
        processing = false;
        // Process next frame if available
        if (frameQueue.length > 0) {
            // Use setTimeout to let the event loop breathe
            setTimeout(processQueue, 0);
        }
    }
}

// Start connection
connect();

// Expose a simple API to send text commands if needed
function sendCommand(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

window.sendArmCommand = sendCommand;