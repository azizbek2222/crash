import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// 2. Adsgram va Telegram Init
const AdController = window.Adsgram.init({ blockId: "int-20566" });
const tg = window.Telegram.WebApp;
tg.expand();

// Haqiqiy Telegram ID ni olish
const user = tg.initDataUnsafe?.user || { id: "12345678", first_name: "Guest" };
const tgId = user.id.toString();

// DOM elementlar
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

// 3. O'yin sozlamalari (Siz so'ragan x koeffitsientlar hovuzi)
const crashPool = [1.1, 1.5, 2.0, 1.2, 5.0, 1.8, 3.5, 1.3, 10.0, 1.4, 2.8, 4.2, 1.5, 7.5, 1.05, 12.0];
let myBalance = 0;
let isJoined = false;
let isWaitingForNext = false;
let currentGameState = "idle";

const userRef = ref(db, 'users/' + tgId);
const gameRef = ref(db, 'live_game');
const historyRef = ref(db, 'history');

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

// 4. O'yin holati sinxronizatsiyasi
onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    currentGameState = data.status;
    const m = data.multiplier || 1.00;

    if (currentGameState === "flying") {
        multiplierDisplay.innerText = m.toFixed(2) + "x";
        multiplierDisplay.style.color = "#3b82f6";
        crashMsg.style.display = "none";
        nextRoundTimer.style.display = "none";

        if (isWaitingForNext) {
            isJoined = true;
            isWaitingForNext = false;
        }

        if (isJoined) {
            joinBtn.innerText = "O'YINDASIZ";
            joinBtn.className = "playing";
            joinBtn.disabled = true;
            cashoutBtn.disabled = false;
            cashoutBtn.innerText = `OLISH (${Math.floor(m)} s.)`;
        }
    } 
    else if (currentGameState === "crashed") {
        multiplierDisplay.innerText = m.toFixed(2) + "x";
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        cashoutBtn.disabled = true;
        cashoutBtn.innerText = "Pulni olish";

        if (data.nextIn > 0) {
            nextRoundTimer.style.display = "block";
            timerSec.innerText = data.nextIn;
        }

        isJoined = false;
        if (!isWaitingForNext) {
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
            joinBtn.className = "";
        } else {
            joinBtn.innerText = "Navbatdasiz...";
            joinBtn.className = "waiting";
        }
    }
});

// 5. Reklama va O'yinga kirish
joinBtn.onclick = async () => {
    joinBtn.disabled = true;
    joinBtn.innerText = "Reklama yuklanmoqda...";
    
    try {
        const result = await AdController.show();
        if (result && result.done) {
            isWaitingForNext = true;
            joinBtn.innerText = "Navbatdasiz...";
            joinBtn.className = "waiting";
            tg.HapticFeedback.impactOccurred('medium');
        } else {
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        }
    } catch (e) {
        console.error("Adsgram error:", e);
        joinBtn.disabled = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
    }
};

// 6. Cashout (Pul yig'ish)
cashoutBtn.onclick = () => {
    if (isJoined && currentGameState === "flying") {
        const currentM = parseFloat(multiplierDisplay.innerText);
        const win = Math.floor(currentM); 
        
        myBalance += win;
        update(userRef, { balance: myBalance });
        
        // Tarixga qo'shish
        push(historyRef, { uid: tgId, coeff: currentM.toFixed(2), amount: win });

        isJoined = false;
        cashoutBtn.disabled = true;
        joinBtn.disabled = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        joinBtn.className = "";
        tg.HapticFeedback.notificationOccurred('success');
    }
};

// 7. AVTOMATIK MASTER LOOP (Server mantiqi)
function startMasterLoop() {
    setInterval(async () => {
        if (currentGameState === "idle" || !currentGameState) {
            // Raundlar orasidagi 15 soniyalik taymer
            for (let i = 15; i >= 0; i--) {
                await update(gameRef, { status: "crashed", multiplier: 1.00, nextIn: i });
                await new Promise(r => setTimeout(r, 1000));
            }

            // Uchishni boshlash
            const target = crashPool[Math.floor(Math.random() * crashPool.length)];
            let curr = 1.00;
            await update(gameRef, { status: "flying", multiplier: 1.00, nextIn: 0 });

            const flyInterval = setInterval(async () => {
                curr += 0.01;
                if (curr >= target) {
                    clearInterval(flyInterval);
                    await update(gameRef, { status: "crashed", multiplier: curr, nextIn: 15 });
                    setTimeout(() => update(gameRef, { status: "idle" }), 2000);
                } else {
                    update(gameRef, { multiplier: curr });
                }
            }, 70);
        }
    }, 2000);
}

startMasterLoop();

// Tarixni chiqarish
onValue(historyRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    historyList.innerHTML = "";
    Object.values(data).reverse().slice(0, 5).forEach(item => {
        const div = document.createElement('div');
        div.className = "history-item";
        div.innerHTML = `<span>ID: ${item.uid}</span> <b>${item.coeff}x</b> <span style="color:#10b981">+${item.amount} s.</span>`;
        historyList.appendChild(div);
    });
});
