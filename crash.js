import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, get, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Firebase Konfiguratsiyasi
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
const AdController = window.Adsgram.init({ blockId: "int-20566" });

const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Telegramdan foydalanuvchi ma'lumotlarini olish
const user = tg.initDataUnsafe?.user || { id: "12345678", first_name: "Mehmon" };
const tgId = user.id.toString();

// UI Elementlar
const multiplierDisplay = document.getElementById('multiplier-display');
const crashMsg = document.getElementById('crash-msg');
const balanceEl = document.getElementById('balance-val');
const joinBtn = document.getElementById('join-btn');
const cashoutBtn = document.getElementById('cashout-btn');
const timerSec = document.getElementById('timer-sec');
const nextRoundTimer = document.getElementById('next-round-timer');
const historyList = document.getElementById('history-list');

document.getElementById('user-name').innerText = user.first_name;
document.getElementById('user-id').innerText = "ID: " + tgId;

let myBalance = 0;
let isJoined = false;
let isWaitingNext = false;
let currentGameState = "idle";
let activeLoop = false;

const userRef = ref(db, 'users/' + tgId);
const gameRef = ref(db, 'live_game');
const queueRef = ref(db, 'admin_queue');
const lockRef = ref(db, 'game_lock');

// Balansni kuzatish
onValue(userRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        myBalance = data.balance || 0;
        balanceEl.innerText = Math.floor(myBalance);
    } else {
        set(userRef, { balance: 0, name: user.first_name });
    }
});

// O'yin holatini kuzatish (UI)
onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    currentGameState = data.status || "idle";
    const m = data.multiplier || 1.00;
    multiplierDisplay.innerText = m.toFixed(2) + "x";

    if (currentGameState === "flying") {
        multiplierDisplay.style.color = "#3b82f6";
        crashMsg.style.display = "none";
        nextRoundTimer.style.display = "none";

        if (isJoined) {
            joinBtn.disabled = true;
            joinBtn.innerText = "O'YINDASIZ";
            cashoutBtn.disabled = false;
            cashoutBtn.innerText = `OLISH (${Math.floor(m)} so'm)`;
        } else if (isWaitingNext) {
            joinBtn.disabled = true;
            joinBtn.innerText = "NAVBTADA...";
        }
    } else if (currentGameState === "crashed") {
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        nextRoundTimer.style.display = "block";
        timerSec.innerText = data.nextIn || 0;
        
        cashoutBtn.disabled = true;

        if (isJoined && data.nextIn === 15) {
            isJoined = false;
            tg.HapticFeedback.notificationOccurred('error');
        }
        
        // Keyingi raundga o'tish
        if (isWaitingNext && data.nextIn <= 1) {
            isJoined = true;
            isWaitingNext = false;
        }

        if (!isJoined && !isWaitingNext) {
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        }
    }
});

// Server Lock (Master) mantiqi
async function claimServer() {
    const now = Date.now();
    await runTransaction(lockRef, (lock) => {
        if (!lock || (now - lock.lastSeen > 8000)) return { holder: tgId, lastSeen: now };
        if (lock.holder === tgId) return { holder: tgId, lastSeen: now };
        return;
    });
}
setInterval(claimServer, 3000);

onValue(lockRef, (snap) => {
    const lock = snap.val();
    if (lock && lock.holder === tgId && !activeLoop) {
        activeLoop = true;
        startServerLogic();
    } else if (lock && lock.holder !== tgId) {
        activeLoop = false;
    }
});

// Admin koeffitsientlari bilan ishlash
async function startServerLogic() {
    while (activeLoop) {
        for (let i = 15; i >= 0; i--) {
            if (!activeLoop) return;
            await update(gameRef, { status: "crashed", multiplier: 1.00, nextIn: i });
            await new Promise(r => setTimeout(r, 1000));
        }

        const queueSnap = await get(queueRef);
        let target = 2.00;
        if (queueSnap.exists()) {
            const keys = Object.keys(queueSnap.val());
            const firstKey = keys[0];
            target = parseFloat(queueSnap.val()[firstKey].value);
            await remove(ref(db, `admin_queue/${firstKey}`));
        }

        let curr = 1.00;
        await update(gameRef, { status: "flying", multiplier: 1.00, nextIn: 0 });

        await new Promise((resolve) => {
            const intv = setInterval(async () => {
                if (!activeLoop) { clearInterval(intv); resolve(); return; }
                curr += 0.04;
                if (curr >= target) {
                    clearInterval(intv);
                    await update(gameRef, { status: "crashed", multiplier: curr, nextIn: 15 });
                    setTimeout(resolve, 3000);
                } else {
                    update(gameRef, { multiplier: curr });
                }
            }, 100);
        });
    }
}

// Reklama va Qo'shilish
joinBtn.onclick = async () => {
    try {
        const res = await AdController.show();
        if (res && res.done) {
            if (currentGameState === "crashed") {
                isJoined = true;
            } else {
                isWaitingNext = true;
            }
            tg.HapticFeedback.notificationOccurred('success');
        }
    } catch (e) { console.error("Ad Error", e); }
};

cashoutBtn.onclick = () => {
    if (isJoined && currentGameState === "flying") {
        const m = parseFloat(multiplierDisplay.innerText);
        const win = Math.floor(m);
        myBalance += win;
        update(userRef, { balance: myBalance });
        push(ref(db, 'history'), { uid: tgId, coeff: m.toFixed(2) + "x", amount: win });
        isJoined = false;
        tg.HapticFeedback.notificationOccurred('success');
    }
};
