/**
 * Robot Arm Client - servo control and gripper commands
 * Wires range inputs and buttons to WebSocket servo commands
 */

import { sendCommand, addEventListener as onWebSocketEvent } from './websocket.js?t=1733391500';

// Global state tracking
let isSessionActive = false;  // Track if this session is the active session
let isCameraStandOnline = false;  // Track camera stand online status

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

    // Helper: enable/disable ALL controls based on session state
    function setAllControlsEnabled(enabled) {
        // Robot arm sliders - always follow session state
        const robotSliders = ['baseSpin', 'baseArm', 'midArm', 'gripper'];
        robotSliders.forEach(id => {
            const input = document.getElementById(id);
            const valueBox = document.getElementById(`val${id.charAt(0).toUpperCase() + id.slice(1)}`);
            if (input) {
                input.disabled = !enabled;
                if (!enabled) input.classList.add('disabled'); else input.classList.remove('disabled');
            }
            if (valueBox) {
                valueBox.classList.toggle('disabled', !enabled);
            }
        });

        // Camera sliders - only enabled if session is active AND camera stand is online
        const cameraEnabled = enabled && isCameraStandOnline;
        setCameraControlsEnabled(cameraEnabled);

        console.debug('[Client] All controls', enabled ? 'enabled' : 'disabled',
            `(camera: ${cameraEnabled ? 'enabled' : 'disabled'})`);
    }

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
            statusEl.classList.remove('status-online', 'status-offline', 'status-unknown');
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
                isCameraStandOnline = online;  // Update global state
                placeholder.textContent = online ? 'Camera: online' : 'Camera: offline';

                // Only enable/disable camera controls if session is active
                if (isSessionActive) {
                    setCameraControlsEnabled(online);
                }
            } else {
                // If payload not as expected, show generic status and disable controls
                isCameraStandOnline = false;
                placeholder.textContent = 'Camera: status unknown';
                if (isSessionActive) {
                    setCameraControlsEnabled(false);
                }
            }
        } catch (err) {
            console.error('[Client] Error handling cameraStandStatus:', err);
        }
    });

    // Listen for error messages from the server
    // Expected payload example: { type: 'error', message: 'Session already active.' }
    // Listen for error messages from the server
    // Expected payload example: { type: 'error', message: 'Session already active.' }
    onWebSocketEvent('error', (payload) => {
        try {
            if (payload && payload.message) {
                console.error('[Client] Server error:', payload.message);

                // Handle specific error cases
                if (payload.message === 'Session already active.') {
                    console.warn('[Client] ⚠️ Another session is already active. Please close other tabs or wait for the session to expire.');

                    // Update session state and disable all controls
                    isSessionActive = false;
                    setAllControlsEnabled(false);

                    // Update session status indicator
                    const statusEl = document.getElementById('sessionStatus');
                    if (statusEl) {
                        statusEl.textContent = 'Occupied';
                        statusEl.classList.remove('status-active');
                        statusEl.classList.add('status-occupied');
                    }
                }
            }
        } catch (err) {
            console.error('[Client] Error handling server error message:', err);
        }
    });

    // Listen for session active confirmation from the server
    // Expected payload example: { type: 'sessionActive' }
    onWebSocketEvent('sessionActive', (payload) => {
        try {
            console.log('[Client] ✓ Session is now active');

            // Update session state and enable all controls
            isSessionActive = true;
            setAllControlsEnabled(true);

            // Update session status indicator to Active
            const statusEl = document.getElementById('sessionStatus');
            if (statusEl) {
                statusEl.textContent = 'Active';
                statusEl.classList.remove('status-occupied');
                statusEl.classList.add('status-active');
            }
        } catch (err) {
            console.error('[Client] Error handling sessionActive message:', err);
        }
    });

    // Listen for command acknowledgements from the server
    // Expected payload example: { type: 'ack', message: 'Saved' }
    onWebSocketEvent('ack', (payload) => {
        if (payload && payload.message) {
            console.log(`[Client] ✓ ${payload.message}`);
            flashStatus(`✓ ${payload.message}`);
        } else {
            console.log('[Client] ✓ Command acknowledged');
            flashStatus('✓ Command sent successfully');
        }
    });
}

/**
 * Flash a temporary message in the status display
 */
function flashStatus(text) {
    const statusSpan = document.querySelector('.status span');
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
