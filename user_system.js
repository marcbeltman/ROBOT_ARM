/**
 * USER-SYSTEM NODE (High-Speed Edition)
 */
const QUEUE_KEY = 'userQueue';
const PRESENCE_KEY = 'globalPresence';
const TIMEOUT_MS = 10000; // Iets korter voor snellere respons
const CLEANUP_INTERVAL = 1000; // Elke seconde checken!

function getQueue() { return global.get(QUEUE_KEY) || []; }
function getPresence() { return global.get(PRESENCE_KEY) || {}; }

function broadcast() {
    const queue = getQueue();
    const presence = getPresence();
    node.send([null, null, { payload: { queue, presence }, topic: "MasterUpdate" }]);
}

// === A. SNELLE ONDERHOUD (1x per seconde) ===
const interval = setInterval(() => {
    let queue = getQueue();
    let presence = getPresence();
    let userMap = global.get('userMap') || {};
    const now = Date.now();
    let changed = false;
    const oldOwner = queue.length > 0 ? queue[0].uuid : null;

    for (let uuid in presence) {
        if (now - presence[uuid].lastSeen > TIMEOUT_MS) {
            delete presence[uuid];
            delete userMap[uuid];
            queue = queue.filter(u => u.uuid !== uuid);
            changed = true;
        }
    }

    if (changed) {
        global.set('userMap', userMap);
        global.set(QUEUE_KEY, queue);
        global.set(PRESENCE_KEY, presence);
        broadcast();
    }
    
    // Check of Operator is gewijzigd (bijv. door timeout)
    if (queue.length > 0 && queue[0].uuid !== oldOwner) {
        node.send([null, { payload: { type: "sessionActive" }, _session: { id: queue[0].socket } }, null]);
    }
}, CLEANUP_INTERVAL);

node.on('close', () => clearInterval(interval));

// === B. BERICHT AFHANDELING ===
if (typeof msg.payload === "string") {
    try { msg.payload = JSON.parse(msg.payload); } catch (e) { return null; }
}

const payload = msg.payload;
const incomingUUID = payload.sessionID;
if (!incomingUUID) return null;

const now = Date.now();
let queue = getQueue();
let presence = getPresence();
let userMap = global.get('userMap') || {};

// 1. REGISTREER AANWEZIGHEID
const isNewVisitor = !presence[incomingUUID];
presence[incomingUUID] = { lastSeen: now, socket: msg._session.id };
global.set(PRESENCE_KEY, presence);

// Directe update bij nieuwe kijker (snelle UI)
if (isNewVisitor) { broadcast(); }

// 2. CHAT JOIN
if (payload.type === "chatJoin") {
    userMap[incomingUUID] = payload.username || "Gast";
    global.set('userMap', userMap);
    if (queue.findIndex(u => u.uuid === incomingUUID) === -1) {
        queue.push({ uuid: incomingUUID, socket: msg._session.id, lastSeen: now });
    }
    global.set(QUEUE_KEY, queue);
    broadcast(); // Direct sturen!
}

// 3. HEARTBEAT
else if (payload.type === "heartbeat") {
    const idx = queue.findIndex(u => u.uuid === incomingUUID);
    if (idx !== -1) {
        queue[idx].lastSeen = now;
        queue[idx].socket = msg._session.id;
        global.set(QUEUE_KEY, queue);
    }
}

// 4. DISCONNECT / LEAVE
else if (payload.type === "disconnect" || payload.type === "chatLeave") {
    queue = queue.filter(u => u.uuid !== incomingUUID);
    delete presence[incomingUUID];
    delete userMap[incomingUUID];
    global.set('userMap', userMap);
    global.set(QUEUE_KEY, queue);
    global.set(PRESENCE_KEY, presence);
    broadcast(); // Direct sturen!
}

// 5. ROBOT CONTROL
// --- ROBOT CONTROL (Verbeterd voor ACK node) ---
if (payload.type === "robotControl") {
    if (queue.length > 0 && queue[0].uuid === incomingUUID) {
        queue[0].lastSeen = now; // Blijf actief

        // HIER GEBEURT HET: Bereid msg voor voor de ACK node
        msg._originalSession = msg._session; // Bewaar sessie voor later
        delete msg._session;                 // Verwijder originele sessie om loops te voorkomen

        return [msg, null, null]; // Stuur naar Output 1 (Hardware/Ack)
    }
    // Niet de owner? Stuur foutmelding naar Output 2
    return [null, { payload: { type: "error", message: "Geen rechten" }, _session: msg._session }, null];
}

// === C. FEEDBACK NAAR DE GEBRUIKER (Knoppen activeren) ===
const qIdx = queue.findIndex(u => u.uuid === incomingUUID);
let reply = { _session: msg._session };
if (qIdx === 0) reply.payload = { type: "sessionActive", status: "owner" };
else if (qIdx > 0) reply.payload = { type: "queueWait", position: qIdx + 1 };
else reply.payload = { type: "viewerStatus" };

return [null, reply, null];