// video.js
const canvas = document.getElementById("videoCanvas");
const imgFallback = document.getElementById("videoFrame");
const ctx = canvas ? canvas.getContext("2d") : null;

const frameQueue = [];
const MAX_QUEUE = 3;
let processing = false;
let lastObjectUrl = null;

// Luisteren naar frames vanuit websocket.js
window.addEventListener("video-frame", (ev) => {
    const buffer = ev.detail;

    if (frameQueue.length >= MAX_QUEUE) {
        frameQueue.shift();
    }
    frameQueue.push(buffer);

    processQueue();
});

async function processQueue() {
    if (processing || frameQueue.length === 0) return;

    processing = true;
    const buffer = frameQueue.shift();

    try {
        const blob = new Blob([buffer], { type: "image/jpeg" });

        if (typeof createImageBitmap === "function" && ctx) {
            const bitmap = await createImageBitmap(blob);

            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
            }

            ctx.drawImage(bitmap, 0, 0);
            bitmap.close?.();

            const placeholder = document.getElementById("cameraPlaceholder");
            placeholder?.classList.add("hidden");
            canvas.classList.remove("hidden");
        } else if (imgFallback) {
            if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
            lastObjectUrl = URL.createObjectURL(blob);

            imgFallback.src = lastObjectUrl;

            const placeholder = document.getElementById("cameraPlaceholder");
            placeholder?.classList.add("hidden");
            imgFallback.classList.remove("hidden");
        }
    } catch (err) {
        console.error("Video frame error:", err);
    }

    processing = false;

    if (frameQueue.length > 0) {
        setTimeout(processQueue, 0);
    }
}
