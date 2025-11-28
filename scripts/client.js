/**
 * Robot Arm Client - servo control and gripper commands
 * Wires range inputs and buttons to WebSocket servo commands
 */

import { sendCommand, addEventListener as onWebSocketEvent } from './websocket.js';

/**
 * Initialize robot arm control handlers
 * Connects all sliders to their value displays and WebSocket commands
 */
export function initRobotArmClient() {
    console.log('[Client] Initializing Robot Arm client');
    
    // Define servo mappings: input element id → value display id
    const servoMap = [
        { id: 'baseSpin', val: 'valBaseSpin' },
        { id: 'baseArm', val: 'valBaseArm' },
        { id: 'midArm', val: 'valMidArm' },
        { id: 'gripper', val: 'valGripper' },
        { id: 'cameraPan', val: 'valCameraPan' },
        { id: 'cameraTilt', val: 'valCameraTilt' }
    ];

    // Wire each servo slider to update display and send command
    servoMap.forEach(pair => {
        const inputEl = document.getElementById(pair.id);
        const valueEl = document.getElementById(pair.val);

        if (!inputEl || !valueEl) {
            console.warn(`[Client] Missing element: input=${pair.id}, value=${pair.val}`);
            return;
        }

        // Update display value on drag (real-time)
        function updateDisplay() {
            const value = inputEl.value;
            valueEl.textContent = value;
            console.debug(`[Client] Display updated: ${pair.id} → ${value}`);
        }

        // Send servo command to WebSocket only on release
        function sendServoCommand() {
            const value = inputEl.value;
            sendCommand({
                type: 'servo',
                servo: pair.id,
                value: value
            });
            console.debug(`[Client] Servo command sent: ${pair.id} → ${value}`);
        }

        // Update display during drag (input event)
        inputEl.addEventListener('input', updateDisplay);
        
        // Send command only when slider is released (change event)
        inputEl.addEventListener('change', sendServoCommand);
    });

    // Wire gripper buttons
    const openBtn = document.getElementById('openBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            sendCommand({ type: 'gripper', action: 'open' });
            flashStatus('Open');
            console.debug('[Client] Gripper: open');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            sendCommand({ type: 'gripper', action: 'close' });
            flashStatus('Close');
            console.debug('[Client] Gripper: close');
        });
    }

    console.log('[Client] Robot Arm client initialized');

    // Helper: enable/disable camera pan/tilt controls
    function setCameraControlsEnabled(enabled) {
        const controls = [
            { id: 'cameraPan', val: 'valCameraPan' },
            { id: 'cameraTilt', val: 'valCameraTilt' }
        ];

        const statusEl = document.getElementById('cameraStandStatus');

        controls.forEach(c => {
            const input = document.getElementById(c.id);
            const valueBox = document.getElementById(c.val);
            if (input) {
                input.disabled = !enabled;
                // optional visual cue
                if (!enabled) input.classList.add('disabled'); else input.classList.remove('disabled');
            }
            if (valueBox) {
                valueBox.classList.toggle('disabled', !enabled);
            }
        });
        console.debug('[Client] Camera controls', enabled ? 'enabled' : 'disabled');

        // update persistent status element class if present
        if (statusEl) {
            statusEl.classList.remove('status-online','status-offline','status-unknown');
            statusEl.classList.add(enabled ? 'status-online' : 'status-offline');
            statusEl.textContent = enabled ? 'online' : 'offline';
        }
    }

    // Default: camera stand is considered offline until a status message arrives
    setCameraControlsEnabled(false);

    // Listen for camera stand status messages from the server
    // Expected payload example: { type: 'cameraStandStatus', online: true }
    onWebSocketEvent('cameraStandStatus', (payload) => {
        try {
            const placeholder = document.getElementById('cameraPlaceholder');
            if (!placeholder) return;

            if (payload && typeof payload.online === 'boolean') {
                const online = !!payload.online;
                placeholder.textContent = online ? 'Camera: online' : 'Camera: offline';
                // Enable/disable the camera pan/tilt sliders
                setCameraControlsEnabled(online);
            } else {
                // If payload not as expected, show generic status and disable controls
                placeholder.textContent = 'Camera: status unknown';
                setCameraControlsEnabled(false);
            }
        } catch (err) {
            console.error('[Client] Error handling cameraStandStatus:', err);
        }
    });
}

/**
 * Flash a temporary message in the status display
 */
function flashStatus(text) {
    const statusSpan = document.querySelector('.status span:nth-child(2)');
    if (!statusSpan) {
        console.warn('[Client] Status display element not found');
        return;
    }

    const originalText = statusSpan.textContent;
    statusSpan.textContent = text;
    
    setTimeout(() => {
        statusSpan.textContent = originalText;
    }, 800);
}

/**
 * Utility: send a custom servo command
 */
export function moveServo(servoId, value) {
    sendCommand({
        type: 'servo',
        servo: servoId,
        value: value
    });
}

/**
 * Utility: send gripper command
 */
export function controlGripper(action) {
    if (action !== 'open' && action !== 'close') {
        console.error('[Client] Invalid gripper action:', action);
        return;
    }
    
    sendCommand({
        type: 'gripper',
        action: action
    });
    flashStatus(action.charAt(0).toUpperCase() + action.slice(1));
}
