import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get, update, remove, push, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
tg.expand();

// Foydalanuvchi sozlamalari
const userData = tg.initDataUnsafe?.user;
const userId = userData?.id ? userData.id.toString() : "test_" + Math.floor(Math.random() * 1000);
const userName = userData?.username ? "@" + userData.username : (userData?.first_name || "Mehmon");

// DOM elementlar
const multDisplay = document.getElementById('multiplier');
const timerDisplay = document.getElementById('timer');
const balanceDisplay = document.getElementById('balanceDisplay');
const actionBtn = document.getElementById('actionBtn');
const historyBar = document.getElementById('gameHistory');
const infoText = document.getElementById('infoText');
const playerCountEl = document.getElementById('playerCount');

let userState = "idle"; // idle, joined, playing
let localStatus = "";
let isProcessing = false;
let gameLoop;
let isAiEnabled = false;

// 1. Online tizimi va Foydalanuvchi ma'lumotlari
const userRef = ref(db, `users/${userId}`);
onValue(userRef, (snap) => {
    if (snap.exists()) {
        balanceDisplay.innerText = snap.val().balance.toLocaleString();
    } else {
        set(userRef, { balance: 0, name: userName });
    }
});

const onlineRef = ref(db, `online_players/${userId}`);
set(onlineRef, { name: userName });
onDisconnect(onlineRef).remove();

onValue(ref(db, 'online_players'), (snap) => {
    playerCountEl.innerText = snap.exists() ? Object.keys(snap.val()).length : 0;
});

// AI rejimini kuzatish
onValue(ref(db, 'settings/ai_mode'), (snap) => {
    isAiEnabled = snap.val() || false;
});

// 2. O'YINNING ASOSIY VAQTI (TICKER)
onValue(ref(db, 'current_game'), (snapshot) => {
    const data = snapshot.val();
    
    if (!data) { 
        isProcessing = false;
        multDisplay.innerText = "1.00x";
        multDisplay.classList.remove('crashed');
        timerDisplay.innerText = "KUTING...";
        checkQueue(); // Navbatni tekshirish
        return; 
    }

    localStatus = data.status;
    cancelAnimationFrame(gameLoop);
    
    const tick = () => {
        const now = Date.now();
        if (data.status === 'waiting') {
            const diff = Math.ceil((data.startTime + 10000 - now) / 1000);
            if (diff > 0) {
                multDisplay.innerText = "1.00x";
                timerDisplay.innerText = diff + "s";
                updateUI('waiting');
                gameLoop = requestAnimationFrame(tick);
            } else {
                startFlight(data);
            }
        } 
        else if (data.status === 'flying') {
            timerDisplay.innerText = "";
            const elapsed = (now - data.startTime) / 1000;
            let currentX = Math.pow(Math.E, 0.08 * elapsed);

            if (currentX < data.targetX) {
                multDisplay.innerText = currentX.toFixed(2) + "x";
                if (userState === "joined") userState = "playing";
                updateUI('flying', currentX);
                gameLoop = requestAnimationFrame(tick);
            } else {
                if (!isProcessing) {
                    isProcessing = true;
                    handleCrash(data);
                }
            }
        }
    };
    gameLoop = requestAnimationFrame(tick);
});

// 3. AI va Navbat mantiqi
async function checkQueue() {
    if (isProcessing) return;
    const qSnap = await get(ref(db, 'queue'));
    let nextX, nextId;

    if (qSnap.exists()) {
        const keys = Object.keys(qSnap.val());
        nextId = keys[0];
        nextX = qSnap.val()[nextId].x;
    } else if (isAiEnabled) {
        // AI Algoritmi: Admin zarar ko'rmasligi uchun
        const r = Math.random() * 100;
        if (r < 75) nextX = 1.05 + (Math.random() * 0.45); // 75% ehtimol: 1.05x - 1.50x
        else if (r < 98) nextX = 1.6 + (Math.random() * 2.4); // 23% ehtimol: 1.6x - 4.0x
        else nextX = 10.0 + (Math.random() * 90); // 2% ehtimol: 10x - 100x
        nextId = "ai_" + Date.now();
    } else {
        return;
    }

    await runTransaction(ref(db, 'current_game'), (curr) => {
        if (curr === null) return { status: 'waiting', targetX: parseFloat(nextX), id: nextId, startTime: Date.now() };
    });
}

function startFlight(data) {
    runTransaction(ref(db, 'current_game'), (curr) => {
        if (curr && curr.status === 'waiting') {
            curr.status = 'flying';
            curr.startTime = Date.now();
            return curr;
        }
    });
}

async function handleCrash(data) {
    multDisplay.innerText = data.targetX.toFixed(2) + "x";
    multDisplay.classList.add('crashed');
    infoText.innerText = "CRASHED!";
    userState = "idle";
    
    // Tarixni yangilash
    const histItem = document.createElement('div');
    histItem.className = `hist-item ${data.targetX >= 2 ? 'hist-high' : 'hist-low'}`;
    histItem.innerText = data.targetX.toFixed(2) + "x";
    historyBar.prepend(histItem);

    setTimeout(async () => {
        const updates = {};
        updates['current_game'] = null;
        if (!data.id.startsWith('ai_')) updates[`queue/${data.id}`] = null;
        await update(ref(db), updates);
        infoText.innerText = "";
    }, 3000);
}

// 4. Tugmalar (Action & Withdraw)
actionBtn.onclick = async () => {
    if (localStatus === "waiting" && userState === "idle") {
        const AdController = window.Adsgram.init({ blockId: "int-20566" });
        AdController.show().then(() => {
            userState = "joined";
            updateUI('waiting');
        }).catch(() => { tg.showAlert("Reklama ko'rilmadi!"); });
    } 
    else if (localStatus === "flying" && userState === "playing") {
        const xValue = parseFloat(multDisplay.innerText);
        const win = Math.floor(xValue * 500);
        userState = "idle";
        
        const snap = await get(userRef);
        await update(userRef, { balance: (snap.val().balance || 0) + win });
        infoText.innerText = `+${win} so'm!`;
        updateUI('flying');
    }
};

window.openWithdraw = () => {
    tg.showAlert("Yechib olish uchun balans 50,000 so'm bo'lishi kerak!");
};

function updateUI(status, x = 1) {
    if (status === 'waiting') {
        actionBtn.disabled = (userState === "joined");
        actionBtn.innerText = (userState === "joined") ? "TAYYOR" : "QO'SHILISH";
    } else if (status === 'flying') {
        if (userState === "playing") {
            actionBtn.disabled = false;
            actionBtn.innerText = `NAQD QILISH: ${Math.floor(x * 500)}`;
        } else {
            actionBtn.disabled = true;
            actionBtn.innerText = "KUTING...";
        }
    }
}
