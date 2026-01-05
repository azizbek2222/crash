import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get, update, remove, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBt_YoPMKJlEL7RAGwWNx6uPJpoOHaQ2iY",
    authDomain: "game-49172.firebaseapp.com",
    databaseURL: "https://game-49172-default-rtdb.firebaseio.com",
    projectId: "game-49172",
    storageBucket: "game-49172.firebasestorage.app",
    messagingSenderId: "695585468530",
    appId: "1:695585468530:web:e0155f596c4778d1d412eb"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const tg = window.Telegram.WebApp;

const AdController = window.Adsgram.init({ blockId: "int-20566" });

const user = tg.initDataUnsafe?.user || { id: "test_user", first_name: "Mehmon", username: "guest" };
const userId = user.id.toString();
const userName = user.username || user.first_name;

document.getElementById('userDisplay').innerText = "@" + userName;

const multDisplay = document.getElementById('multiplier');
const timerDisplay = document.getElementById('timer');
const balanceDisplay = document.getElementById('balanceDisplay');
const actionBtn = document.getElementById('actionBtn');
const historyBar = document.getElementById('gameHistory');
const liveWins = document.getElementById('liveWins');
const infoText = document.getElementById('infoText');

let currentBalance = 0;
let userState = "idle"; 
let gameLoop;
let localStatus = "";
let lastProcessedGameId = ""; 
let isAdWatching = false;
let isCheckingQueue = false; // Takrorlanishni oldini olish uchun

// 1. Balansni yuklash
onValue(ref(db, `users/${userId}`), (snap) => {
    if (snap.exists()) {
        currentBalance = snap.val().balance;
        balanceDisplay.innerText = currentBalance.toLocaleString();
    }
});

// 2. Tarixni yuklash (Takrorlanishsiz)
onValue(ref(db, 'crash_history'), (snap) => {
    if (snap.exists()) {
        historyBar.innerHTML = "";
        const items = Object.values(snap.val()).reverse().slice(0, 10);
        items.forEach(val => {
            const div = document.createElement('div');
            div.className = `hist-item ${val >= 2 ? 'hist-high' : 'hist-low'}`;
            div.innerText = parseFloat(val).toFixed(2) + "x";
            historyBar.appendChild(div);
        });
    }
});

// 3. O'yin mantiqi
onValue(ref(db, 'current_game'), (snapshot) => {
    const data = snapshot.val();
    if (!data) { 
        if (!isCheckingQueue) checkQueue(); 
        return; 
    }

    localStatus = data.status;
    cancelAnimationFrame(gameLoop);
    
    const updateTick = () => {
        const now = Date.now();
        if (data.status === 'waiting') {
            const diff = Math.ceil((data.startTime + 10000 - now) / 1000);
            if (diff > 0) {
                multDisplay.innerText = "1.00x";
                multDisplay.classList.remove('crashed');
                timerDisplay.innerText = diff;
                updateUI('waiting');
                gameLoop = requestAnimationFrame(updateTick);
            } else {
                if (userState === "joined") userState = "playing";
                startFlight(data);
            }
        } 
        else if (data.status === 'flying') {
            timerDisplay.innerText = "";
            const elapsed = (now - data.startTime) / 1000;
            let currentX = Math.pow(Math.E, 0.08 * elapsed);

            if (currentX < data.targetX) {
                multDisplay.innerText = currentX.toFixed(2) + "x";
                updateUI('flying', currentX);
                gameLoop = requestAnimationFrame(updateTick);
            } else {
                if (lastProcessedGameId !== data.id) {
                    lastProcessedGameId = data.id;
                    handleCrash(data);
                }
            }
        }
    };
    gameLoop = requestAnimationFrame(updateTick);
});

async function checkQueue() {
    isCheckingQueue = true;
    const qSnap = await get(ref(db, 'queue'));
    if (qSnap.exists()) {
        const queueData = qSnap.val();
        const keys = Object.keys(queueData);
        const nextId = keys[0];
        const nextX = queueData[nextId].x;

        await runTransaction(ref(db, 'current_game'), (curr) => {
            if (curr === null) {
                return { 
                    status: 'waiting', 
                    targetX: nextX, 
                    id: nextId, 
                    startTime: Date.now() 
                };
            }
        });
    }
    isCheckingQueue = false;
}

function startFlight(data) {
    runTransaction(ref(db, 'current_game'), (curr) => {
        if (curr && curr.status === 'waiting' && curr.id === data.id) {
            curr.status = 'flying';
            curr.startTime = Date.now();
            return curr;
        }
    });
}

function handleCrash(data) {
    multDisplay.innerText = data.targetX.toFixed(2) + "x";
    multDisplay.classList.add('crashed');
    userState = "idle";
    
    // Tarixga faqat bir marta yozish
    push(ref(db, 'crash_history'), data.targetX);
    
    setTimeout(() => { resetToNext(data); }, 1000);
}

async function resetToNext(data) {
    const updates = {};
    updates['current_game'] = null;
    // O'yin tugagach uni navbatdan olib tashlash (takrorlanmasligi uchun)
    updates[`queue/${data.id}`] = null; 
    
    await update(ref(db), updates);
}

function updateUI(status, x = 1) {
    if (status === 'waiting') {
        actionBtn.innerText = (userState === "joined") ? "KUTILMOQDA..." : "O'yinga qo'shilish";
        actionBtn.className = (userState === "joined") ? "btn-joined" : "btn-join";
        actionBtn.disabled = (userState === "joined");
    } else if (status === 'flying' && userState === "playing") {
        actionBtn.disabled = false;
        actionBtn.innerText = `NAQD PULLASH: ${Math.floor(x * 1.5)} so'm`;
        actionBtn.className = "btn-cashout";
    } else {
        actionBtn.innerText = "Kutilmoqda...";
        actionBtn.disabled = true;
    }
}

// Qolgan onclick mantiqlari o'zgarishsiz qoladi...
