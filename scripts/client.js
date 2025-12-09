/**
 * Robot Arm Client - servo control and gripper commands
 * Wires range inputs and buttons to WebSocket servo commands
 */

import { sendCommand, addEventListener as onWebSocketEvent, sessionID } from './websocket.js';

// Global state tracking
let isSessionActive = false;  // Track if this session is the active session
let isCameraStandOnline = false;  // Track camera stand online status

/**
 * Initialize robot arm control handlers
 * Connects all sliders to their value displays and WebSocket commands
 */
export function initRobotArmClient() {
    console.log('[Client] Initializing Robot Arm client');

    // Stuur een POST request naar Node-RED
    const logPayload = { datum: new Date().toISOString(), sessionID: sessionID };
    console.log('[Client] Sending HTTP log:', logPayload);

    fetch("https://node-red.xyz/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logPayload)
    });


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

            // Map internal IDs to protocol names where needed
            const nameMap = {
                'cameraPan': 'pan',
                'cameraTilt': 'tilt'
            };
            const servoName = nameMap[pair.id] || pair.id;

            sendCommand({
                servo: servoName,
                angle: parseInt(value, 10)
            });
            console.debug(`[Client] Servo command sent: ${pair.id} (${servoName}) → ${value}`);
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
            console.debug('[Client] Gripper: open');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            sendCommand({ type: 'gripper', action: 'close' });
            console.debug('[Client] Gripper: close');
        });
    }

    console.log('[Client] Robot Arm client initialized');
    // Start with all controls disabled until we are confirmed owner
    setAllControlsEnabled(false);

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
                // placeholder.textContent = online ? 'Camera: online' : 'Camera: offline';

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
    // Expected payload example: { type: 'sessionActive', status: 'owner', position: 0 }
    onWebSocketEvent('sessionActive', (payload) => {
        try {
            const isOwner = payload && payload.status === 'owner';
            if (!isOwner) {
                console.warn('[Client] Session active message received, but not owner. Disabling controls.');
                isSessionActive = false;
                setAllControlsEnabled(false);
                const statusEl = document.getElementById('sessionStatus');
                if (statusEl) {
                    statusEl.textContent = 'Waiting';
                    statusEl.classList.remove('status-active');
                    statusEl.classList.add('status-occupied');
                }
                return;
            }

            console.log('[Client] ✓ Session is now active (owner)');

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

    // Listen for queue wait messages
    // Expected payload example: { type: 'queueWait', status: 'waiting', position: n, queueLength: m }
    onWebSocketEvent('queueWait', (payload) => {
        try {
            isSessionActive = false;
            setAllControlsEnabled(false);

            const position = typeof payload?.position === 'number' ? payload.position : null;
            const queueLength = typeof payload?.queueLength === 'number' ? payload.queueLength : null;

            const statusEl = document.getElementById('sessionStatus');
            if (statusEl) {
                const posText = position !== null ? `Waiting (pos ${position}${queueLength !== null ? `/${queueLength}` : ''})` : 'Waiting';
                statusEl.textContent = posText;
                statusEl.classList.remove('status-active');
                statusEl.classList.add('status-occupied');
            }

            // Optional visual feedback
            // Command status: keep it concise
            flashStatus('Waiting');
        } catch (err) {
            console.error('[Client] Error handling queueWait message:', err);
        }
    });

    // // Listen for command acknowledgements from the server
    // // Expected payload example: { type: 'ack', message: 'Saved' }
    // onWebSocketEvent('ack', (payload) => {
    //     if (payload && payload.message) {
    //         console.log(`[Client] ✓ ${payload.message}`);
    //         flashStatus(`✓ ${payload.message}`);
    //     } else {
    //         console.log('[Client] ✓ Command acknowledged');
    //         flashStatus('✓ Command sent successfully');
    //     }
    // });

    // Listen for command acknowledgements from the server
    // Expected payload example: { type: 'ack', message: 'Saved' }
    onWebSocketEvent('ack', (payload) => {
        if (payload && payload.message) {
            console.log('[Client] ✓ Command acknowledged');
            flashStatus(`${payload.message}`);
        }
    });

    // Listen for connection count updates
    // Topic: 'connection_count', Payload: { connection_count: 5, ... }
    onWebSocketEvent('connection_count', (msg) => {
        try {
            const countEl = document.getElementById('connectionCount');
            // msg IS the payload now, so we access connection_count directly
            if (countEl && typeof msg.connection_count === 'number') {
                countEl.textContent = msg.connection_count;
            } else if (countEl) {
                countEl.textContent = '-';
            }
        } catch (err) {
            console.error('[Client] Error handling connection_count:', err);
        }
    });

    // Listen for user list updates
    // Payload: { type: 'userListUpdate', totalUsers: 4, users: [...] }
    onWebSocketEvent('userListUpdate', (payload) => {
        try {
            updateUserList(payload);
        } catch (err) {
            console.error('[Client] Error handling userListUpdate:', err);
        }
    });
}

/**
 * Update the user list display in the connections popup
 */
function updateUserList(payload) {
    const container = document.getElementById('userListContainer');
    if (!container) {
        console.warn('[Client] User list container not found');
        return;
    }

    if (!payload || !Array.isArray(payload.users)) {
        container.innerHTML = '<p class="user-list-error">No user data available.</p>';
        return;
    }

    const users = payload.users;
    const totalUsers = payload.totalUsers || users.length;

    if (users.length === 0) {
        container.innerHTML = '<p class="user-list-empty">No active users.</p>';
        return;
    }

    // Create user list HTML
    let html = `<div class="user-list-header">
        <p><strong>Total users:</strong> ${totalUsers}</p>
    </div>
    <div class="user-list">`;

    users.forEach((user) => {
        const userNumber = String(user.position || 0).padStart(2, '0');
        const userName = `user-${userNumber}`;
        const isOwner = user.isOwner ? '<span class="user-owner-badge">Owner</span>' : '';
        const deviceType = user.mobile ? 'Mobile' : 'Desktop';
        const deviceIcon = user.mobile ? '📱' : '💻';
        const location = user.city && user.country ? `${user.city}, ${user.country}` : (user.city || user.country || 'Unknown');
        
        html += `
        <div class="user-item ${user.isOwner ? 'user-owner' : ''}">
            <div class="user-item-header">
                <span class="user-name">${userName}</span>
                ${isOwner}
            </div>
            <div class="user-item-details">
                <div class="user-detail-row">
                    <span class="user-label">Position:</span>
                    <span class="user-value">${user.position || '-'}</span>
                </div>
                <div class="user-detail-row">
                    <span class="user-label">Device:</span>
                    <span class="user-value">${deviceIcon} ${deviceType}</span>
                </div>
                <div class="user-detail-row">
                    <span class="user-label">Location:</span>
                    <span class="user-value">${location}</span>
                </div>
                <div class="user-detail-row">
                    <span class="user-label">Last seen:</span>
                    <span class="user-value">${user.lastSeen || '-'}</span>
                </div>
                ${user.uuid ? `<div class="user-uuid">${user.uuid}</div>` : ''}
            </div>
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;

    console.debug(`[Client] User list updated: ${users.length} users`);
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
    // Map internal IDs to protocol names where needed
    const nameMap = {
        'cameraPan': 'pan',
        'cameraTilt': 'tilt'
    };
    const servoName = nameMap[servoId] || servoId;

    sendCommand({
        servo: servoName,
        angle: parseInt(value, 10)
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
