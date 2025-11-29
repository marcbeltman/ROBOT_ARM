/**
 * Video frame processing and rendering
 * Subscribes to WebSocket messages and renders JPEG frames to canvas or img
 */

import { addEventListener as onWebSocketEvent } from './websocket.js';

// Frame processing queue/backpressure
const frameQueue = [];
const MAX_QUEUE = 3;
let processing = false;

const canvas = document.getElementById('videoCanvas');
const imgFallback = document.getElementById('videoFrame');
const ctx = canvas ? canvas.getContext('2d') : null;
let lastObjectUrl = null;

/**
 * Initialize video frame handler
 * Call this once on page load to subscribe to WebSocket messages
 */
export function initVideoHandler() {
    console.log('[Video] Initializing video handler');
    
    // Subscribe to WebSocket binary frames (video)
    onWebSocketEvent('binary', (data) => {
        // Only process binary frames (ArrayBuffer)
        if (!(data instanceof ArrayBuffer)) {
            console.debug('[Video] Skipping non-ArrayBuffer binary message');
            return;
        }

        // Backpressure: keep only recent frames
        if (frameQueue.length >= MAX_QUEUE) {
            frameQueue.shift();
        }
        frameQueue.push(data);
        processQueue();
    });

    onWebSocketEvent('open', () => {
        console.log('[Video] WebSocket connected');
    });

    onWebSocketEvent('close', () => {
        console.log('[Video] WebSocket disconnected');
    });

    onWebSocketEvent('error', (err) => {
        console.error('[Video] WebSocket error:', err);
    });
}

/**
 * Process queued frames sequentially
 */
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
            
            // Resize canvas to match frame size
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
            }
            
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close?.();
            
            // Hide placeholder and show canvas
            hideVideoPlaceholder();
            if (canvas) canvas.classList.remove('hidden');
        } else if (imgFallback) {
            // Fallback: use object URL on an <img> element
            if (lastObjectUrl) {
                URL.revokeObjectURL(lastObjectUrl);
            }
            
            lastObjectUrl = URL.createObjectURL(blob);
            imgFallback.src = lastObjectUrl;
            
            // Hide placeholder and show image
            hideVideoPlaceholder();
            imgFallback.classList.remove('hidden');
        }
    } catch (err) {
        console.error('[Video] Frame processing error:', err);
    } finally {
        processing = false;
        
        // Process next frame if queued (let event loop breathe)
        if (frameQueue.length > 0) {
            setTimeout(processQueue, 0);
        }
    }
}

/**
 * Hide the "Camera offline" placeholder
 */
function hideVideoPlaceholder() {
    const placeholder = document.getElementById('cameraPlaceholder');
    if (placeholder) {
        placeholder.classList.add('hidden');
    }
}

/**
 * Show the "Camera offline" placeholder (e.g., on disconnect)
 */
export function showVideoPlaceholder() {
    const placeholder = document.getElementById('cameraPlaceholder');
    if (placeholder) {
        placeholder.classList.remove('hidden');
        placeholder.textContent = 'Camera offline';
    }
    
    // Hide video elements
    if (canvas) canvas.classList.add('hidden');
    if (imgFallback) imgFallback.classList.add('hidden');
}

/**
 * Stop video playback and clean up
 */
export function stopVideo() {
    if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
    }
    frameQueue.length = 0;
    processing = false;
    showVideoPlaceholder();
}
