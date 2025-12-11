// Get DOM elements
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const moneyDisplay = document.getElementById('money_display');

// Prize values for each color
const prizeValues = {
    '#FF78A3': 100,
    '#47D495': 50,
    '#FFCC8D': 20,
    '#87C9EA': 10,
    '#C088D2': 5,
    '#DDDDDD': 1
};

/**
 * Detects which sector the DRAWN ray is pointing at and returns the prize value.
 * The drawn ray is the mirrored version of the actual ray (due to CSS scaleX(-1) on canvas).
 * @param {number} headingX - The x component of the heading direction (before mirror)
 * @param {number} headingY - The y component of the heading direction
 * @returns {number} The prize value for the detected sector
 */
function detectDrawnRaySectorPrize(headingX, headingY) {
    if (!sectorData) return 0;
    
    const { assignments, weights, totalWeight, totalSectors } = sectorData;
    
    // The canvas has CSS transform: scaleX(-1), so the DRAWN ray direction is mirrored
    // Visual ray direction = (-headingX, headingY)
    const drawnRayX = -headingX;
    const drawnRayY = headingY;
    
    // Calculate the angle of the drawn ray direction
    let rayAngle = Math.atan2(drawnRayY, drawnRayX);
    
    // Normalize ray angle to match sector angles (which start from -PI/2, i.e., top/12 o'clock)
    // Sector angles go from -PI/2 to 3*PI/2
    while (rayAngle < -Math.PI / 2) rayAngle += 2 * Math.PI;
    while (rayAngle >= 3 * Math.PI / 2) rayAngle -= 2 * Math.PI;
    
    let currentAngle = -Math.PI / 2; // Start from top (12 o'clock)
    
    for (let i = 0; i < totalSectors; i++) {
        const span = (weights[i] / totalWeight) * 2 * Math.PI;
        const endAngle = currentAngle + span;
        
        if (rayAngle >= currentAngle && rayAngle < endAngle) {
            const color = assignments[i];
            return prizeValues[color] || 0;
        }
        
        currentAngle = endAngle;
    }
    
    return 0;
}

/**
 * Calculates the visual gaze direction based on Face Mesh landmarks.
 * Simulates PnP by comparing the nose tip position relative to the 
 * center of the head (approximated by the midpoint of the ears/cheeks).
 */
function calculateFaceHeading(landmarks) {
    // MediaPipe Landmark indices
    const NOSE_TIP = 1;
    const LEFT_EAR_TRAGION = 234;
    const RIGHT_EAR_TRAGION = 454;

    const nose = landmarks[NOSE_TIP];
    const leftEar = landmarks[LEFT_EAR_TRAGION];
    const rightEar = landmarks[RIGHT_EAR_TRAGION];

    // Calculate the midpoint between the ears (approximate center of head rotation axis)
    // Note: Z coordinate is depth relative to camera plane
    const midPoint = {
        x: (leftEar.x + rightEar.x) / 2,
        y: (leftEar.y + rightEar.y) / 2,
        z: (leftEar.z + rightEar.z) / 2
    };

    // Calculate vector from Head Center to Nose
    // This vector represents the "forward" direction of the face in 3D space
    let dirX = nose.x - midPoint.x;
    let dirY = nose.y - midPoint.y;
    // let dirZ = nose.z - midPoint.z; // Not needed for 2D ray projection

    // Normalize/Scale the vector for easier visualization
    // Because landmarks are normalized (0-1), these differences are very small.
    // We scale them up significantly to create a visible ray direction.
    const sensitivity = 20.0; // Adjust this to make the ray more or less sensitive to movement

    return {
        x: dirX * sensitivity,
        y: dirY * sensitivity
    };
}

function onResults(results) {
    // 1. Prepare Canvas
    // Set canvas to full screen resolution
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    
    // Clear previous frame
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Optional: Draw the video frame onto the canvas (if you want to process pixels)
    // For this app, we rely on the <video> element behind the transparent canvas
    // so we don't need to draw the image here, saving performance.
    
    if (results.multiFaceLandmarks) {
        for (const landmarks of results.multiFaceLandmarks) {
            // 2. Calculate Ray Geometry
            const heading = calculateFaceHeading(landmarks);
            
            // Define Center Point (Start of Ray)
            const centerX = canvasElement.width / 2;
            const centerY = canvasElement.height / 2;

            // Define End Point (End of Ray)
            // We project the heading vector (normalized 0-1 space) to pixel space
            // Multiplier length determines the visual length of the ray
            const rayLength = Math.max(canvasElement.width, canvasElement.height) * 1.5; 
            
            const endX = centerX + (heading.x * rayLength);
            const endY = centerY + (heading.y * rayLength);

            // 3. Draw the Visuals
            
            // A. Draw Ray (Blue Line)
            canvasCtx.beginPath();
            canvasCtx.moveTo(centerX, centerY);
            canvasCtx.lineTo(endX, endY);
            canvasCtx.lineWidth = 6;
            canvasCtx.strokeStyle = '#0062FF'; // Dark Blue
            canvasCtx.lineCap = 'round';
            canvasCtx.stroke();

            // B. Draw Start Point (White Circle)
            canvasCtx.beginPath();
            canvasCtx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
            canvasCtx.fillStyle = '#FFFFFF';
            canvasCtx.fill();
            canvasCtx.strokeStyle = '#00008B';
            canvasCtx.lineWidth = 2;
            canvasCtx.stroke();
            
            // C. Detect which sector the DRAWN ray is pointing at and update money display
            const prize = detectDrawnRaySectorPrize(heading.x, heading.y);
            moneyDisplay.textContent = prize;
            
            // Debug: Draw the nose tip just to see tracking match
            // const nose = landmarks[1];
            // canvasCtx.beginPath();
            // canvasCtx.arc(nose.x * canvasElement.width, nose.y * canvasElement.height, 5, 0, 2*Math.PI);
            // canvasCtx.fillStyle = 'red';
            // canvasCtx.fill();
        }
    }
    canvasCtx.restore();
}

// Initialize Face Mesh
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true, // Better accuracy for eyes/lips
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// Initialize Camera
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await faceMesh.send({image: videoElement});
    },
    width: 640,
    height: 480
});

// Camera Toggle Logic
const openCamBtn = document.getElementById('open_cam_btn');
let isCameraRunning = false;

openCamBtn.addEventListener('click', () => {
    if (!isCameraRunning) {
        // Start Camera
        camera.start();
        isCameraRunning = true;
        openCamBtn.textContent = "关闭摄像头";
    } else {
        // Stop Camera
        camera.stop(); // Assuming MediaPipe Camera utils supports stop()
        isCameraRunning = false;
        openCamBtn.textContent = "打开摄像头";
        
        // Optional: Clear canvas when camera stops
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
});

// Initialize Dynamic Background using Canvas (html2canvas compatible)
const bgCanvas = document.getElementById('background_canvas');
const bgCtx = bgCanvas.getContext('2d');

// Store sector data for redrawing on resize
let sectorData = null;

function initDynamicBackground() {
    const palette = ['#FF78A3', '#47D495', '#FFCC8D', '#87C9EA', '#C088D2', '#DDDDDD'];
    const totalSectors = 20;
    
    // 1. Prepare colors ensuring each appears at least once
    let assignments = [...palette];
    while (assignments.length < totalSectors) {
        assignments.push(palette[Math.floor(Math.random() * palette.length)]);
    }
    
    // Shuffle colors
    for (let i = assignments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
    }
    
    // 2. Generate random angles (weights)
    const weights = Array.from({length: totalSectors}, () => Math.random() * 0.8 + 0.4); 
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    // Store sector data
    sectorData = { assignments, weights, totalWeight, totalSectors };
    
    // Draw background
    drawBackground();
}

function drawBackground() {
    if (!sectorData) return;
    
    const { assignments, weights, totalWeight, totalSectors } = sectorData;
    const borderWidth = 0.5; // degrees for white border
    
    // Set canvas size to window size
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    
    const centerX = bgCanvas.width / 2;
    const centerY = bgCanvas.height / 2;
    // Radius should be large enough to cover the entire screen
    const radius = Math.sqrt(centerX * centerX + centerY * centerY) + 50;
    
    // Video frame dimensions (must match CSS)
    const videoWidth = 640;
    const videoHeight = 480;
    const videoLeft = centerX - videoWidth / 2;
    const videoRight = centerX + videoWidth / 2;
    const videoTop = centerY - videoHeight / 2;
    const videoBottom = centerY + videoHeight / 2;
    
    // Store sector angles for text placement
    let sectorAngles = [];
    
    let currentAngle = -Math.PI / 2; // Start from top (12 o'clock)
    
    for (let i = 0; i < totalSectors; i++) {
        const span = (weights[i] / totalWeight) * 2 * Math.PI;
        const borderRad = (borderWidth / 360) * 2 * Math.PI;
        const color = assignments[i];
        
        // Store sector info
        sectorAngles.push({
            startAngle: currentAngle,
            endAngle: currentAngle + span,
            midAngle: currentAngle + span / 2,
            color: color
        });
        
        // Draw color sector
        bgCtx.beginPath();
        bgCtx.moveTo(centerX, centerY);
        bgCtx.arc(centerX, centerY, radius, currentAngle, currentAngle + span - borderRad);
        bgCtx.closePath();
        bgCtx.fillStyle = color;
        bgCtx.fill();
        
        // Draw white border
        bgCtx.beginPath();
        bgCtx.moveTo(centerX, centerY);
        bgCtx.arc(centerX, centerY, radius, currentAngle + span - borderRad, currentAngle + span);
        bgCtx.closePath();
        bgCtx.fillStyle = '#FFFFFF';
        bgCtx.fill();
        
        currentAngle += span;
    }
    
    // Draw prize text on colored sectors, positioned at browser window edge
    bgCtx.font = 'bold 28px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    bgCtx.textAlign = 'center';
    bgCtx.textBaseline = 'middle';
    
    sectorAngles.forEach(sector => {
        let prizeText = null;
        let textColor = null;
        
        if (sector.color === '#FF78A3') {
            prizeText = '100 元';
            textColor = '#FF78A3';
        } else if (sector.color === '#47D495') {
            prizeText = '50 元';
            textColor = '#47D495';
        } else if (sector.color === '#FFCC8D') {
            prizeText = '20 元';
            textColor = '#FFCC8D';
        } else if (sector.color === '#87C9EA') {
            prizeText = '10 元';
            textColor = '#87C9EA';
        } else if (sector.color === '#C088D2') {
            prizeText = '5 元';
            textColor = '#C088D2';
        } else if (sector.color === '#DDDDDD') {
            prizeText = '1 元';
            textColor = '#AAAAAA'; // Darker gray for better visibility
        }
        
        if (prizeText) {
            const angle = sector.midAngle;
            
            // Calculate direction vector
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            
            // Find intersection with browser window boundary
            let t = Infinity;
            
            // Check intersection with each edge of the browser window
            if (dirX > 0) {
                // Right edge
                const tRight = (bgCanvas.width - centerX - 60) / dirX; // 60px padding from edge
                if (tRight > 0) t = Math.min(t, tRight);
            } else if (dirX < 0) {
                // Left edge
                const tLeft = (60 - centerX) / dirX; // 60px padding from edge
                if (tLeft > 0) t = Math.min(t, tLeft);
            }
            
            if (dirY > 0) {
                // Bottom edge
                const tBottom = (bgCanvas.height - centerY - 40) / dirY; // 40px padding from edge
                if (tBottom > 0) t = Math.min(t, tBottom);
            } else if (dirY < 0) {
                // Top edge
                const tTop = (40 - centerY) / dirY; // 40px padding from edge
                if (tTop > 0) t = Math.min(t, tTop);
            }
            
            // Position text at browser window edge
            const textX = centerX + dirX * t;
            const textY = centerY + dirY * t;
            
            // Draw text with white outline for visibility
            bgCtx.strokeStyle = '#FFFFFF';
            bgCtx.lineWidth = 4;
            bgCtx.strokeText(prizeText, textX, textY);
            bgCtx.fillStyle = textColor;
            bgCtx.fillText(prizeText, textX, textY);
        }
    });
}

// Redraw on window resize
window.addEventListener('resize', drawBackground);

initDynamicBackground();

// Countdown Logic
const countdownDisplay = document.querySelector('.countdown-display');
const modal = document.getElementById('game_modal');
const modalCloseBtn = document.getElementById('modal_close_btn');
let countdownTimer = null;
let isCountingDown = false;

function startCountdown() {
    if (isCountingDown) return; // Prevent multiple triggers
    isCountingDown = true;
    let timeLeft = 5;

    countdownDisplay.textContent = `00 : 0${timeLeft}`;

    countdownTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
            countdownDisplay.textContent = `00 : 0${timeLeft}`;
        }

        if (timeLeft < 0) {
            clearInterval(countdownTimer);
            isCountingDown = false;
            // Reset display
            countdownDisplay.textContent = "00 : 05";
            // Show Modal
            modal.classList.remove('hidden');
        }
    }, 1000);
}

// Event Listener for Space Key
document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent default scrolling behavior
        startCountdown();
    }
});

// Event Listener for Modal Close Button
modalCloseBtn.addEventListener('click', () => {
    // Get the image from modal
    const modalBody = modal.querySelector('.modal-body');
    const img = modalBody.querySelector('img');
    
    if (img && img.src) {
        // Generate filename with datetime
        const now = new Date();
        const datetime = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        const filename = `PartyGame_${datetime}.png`;
        
        // Create download link and trigger download
        const downloadLink = document.createElement('a');
        downloadLink.href = img.src;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
    
    // Close modal
    modal.classList.add('hidden');
});

/**
 * Captures the full screen including the video element.
 * Uses html2canvas with a workaround for the webcam video stream.
 * Then composites the screenshot with a decorative frame.
 */
function captureScreen(callback) {
    const originalVideo = document.getElementById('input_video');
    const videoFrame = document.querySelector('.video-frame');
    
    // 1. Create a temporary canvas with the mirrored video frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalVideo.videoWidth;
    tempCanvas.height = originalVideo.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    
    // Draw with horizontal flip baked in (to match what user sees)
    ctx.translate(tempCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(originalVideo, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // Apply same positioning styles as video (but NO transform)
    tempCanvas.style.display = 'block';
    tempCanvas.style.position = 'absolute';
    tempCanvas.style.top = '0';
    tempCanvas.style.left = '0';
    tempCanvas.style.width = '100%';
    tempCanvas.style.height = '100%';
    tempCanvas.style.objectFit = 'cover';
    tempCanvas.id = 'temp_video_canvas';
    
    // 2. Temporarily hide video and show the canvas in the REAL DOM
    originalVideo.style.display = 'none';
    videoFrame.appendChild(tempCanvas);
    
    // 3. Take screenshot
    html2canvas(document.body, {
        ignoreElements: (element) => element.id === 'game_modal',
        backgroundColor: null
    }).then(screenshotCanvas => {
        // 4. Restore: show video, remove temp canvas
        originalVideo.style.display = 'block';
        tempCanvas.remove();
        
        // 5. Load the frame image and composite
        const frameImg = new Image();
        frameImg.onload = () => {
            // Create final canvas with frame dimensions
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = frameImg.width;
            finalCanvas.height = frameImg.height;
            const finalCtx = finalCanvas.getContext('2d');
            
            // Calculate how to fit and center the screenshot within the frame
            const frameW = frameImg.width;
            const frameH = frameImg.height;
            const shotW = screenshotCanvas.width;
            const shotH = screenshotCanvas.height;
            
            // Scale screenshot to fit frame while maintaining aspect ratio
            const scaleX = frameW / shotW;
            const scaleY = frameH / shotH;
            const scale = Math.max(scaleX, scaleY); // Use max to cover the frame area
            
            const scaledW = shotW * scale;
            const scaledH = shotH * scale;
            
            // Center the screenshot
            const offsetX = (frameW - scaledW) / 2;
            const offsetY = (frameH - scaledH) / 2;
            
            // Draw screenshot first (bottom layer)
            finalCtx.drawImage(screenshotCanvas, offsetX, offsetY, scaledW, scaledH);
            
            // Draw frame on top
            finalCtx.drawImage(frameImg, 0, 0, frameW, frameH);
            
            const dataURL = finalCanvas.toDataURL('image/png');
            callback(dataURL);
        };
        frameImg.onerror = () => {
            // If frame fails to load, just use the screenshot
            console.error("Failed to load frame image");
            const dataURL = screenshotCanvas.toDataURL('image/png');
            callback(dataURL);
        };
        frameImg.src = 'win_frame.png';
        
    }).catch(err => {
        // Restore on error too
        originalVideo.style.display = 'block';
        tempCanvas.remove();
        console.error("Screenshot failed:", err);
    });
}

function startCountdown() {
    if (isCountingDown) return; // Prevent multiple triggers
    isCountingDown = true;
    let timeLeft = 5;

    countdownDisplay.textContent = `00 : 0${timeLeft}`;

    countdownTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
            countdownDisplay.textContent = `00 : 0${timeLeft}`;
        }

        if (timeLeft < 0) {
            clearInterval(countdownTimer);
            isCountingDown = false;
            
            // 1. Reset display immediately or keep 00:00? 
            // User said: "倒计时器结束后，”00:00“会变成”00:05“" 
            // AND "展示就是刚才的截屏" (Show the screenshot just taken).
            // Taking screenshot of 00:00 seems appropriate for "just finished".
            
            // Show modal immediately with loading text
            const modalBody = modal.querySelector('.modal-body');
            modalBody.innerHTML = '加载中...';
            modal.classList.remove('hidden');

            // 2. Capture Screenshot
            // Note: Since we show modal, we must ensure 'ignoreElements' works (it does).
            // We capture the state where timer shows 00:00 (if we haven't reset it yet).
            
            // Wait a brief moment to ensure DOM renders "00:00" before capturing?
            // setInterval usually runs somewhat in sync with render loop, but requestAnimationFrame is better.
            // We'll just call it.
            
            // 截图前将"已触及"改为"恭喜获得"
            const moneyPanel = document.querySelector('.money-panel');
            const originalText = moneyPanel.innerHTML;
            const moneyValue = document.getElementById('money_display').textContent;
            moneyPanel.innerHTML = `恭喜获得 <span id="money_display">${moneyValue}</span> 元`;
            
            captureScreen((dataURL) => {
                // 截图后恢复原文字
                moneyPanel.innerHTML = originalText;
                
                // 3. Update Modal with Screenshot
                // Create an image element
                const img = document.createElement('img');
                img.src = dataURL;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '80vh';
                img.style.borderRadius = '8px';
                img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                
                modalBody.innerHTML = ''; // Clear "Loading..."
                modalBody.appendChild(img);
                
                // 4. Reset Countdown Display
                countdownDisplay.textContent = "00 : 05";
            });
        }
    }, 1000);
}
