import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// Telegram Ma'lumotlari
const tg = window.Telegram.WebApp;
tg.expand(); // Appni to'liq ekranga yoyish
const user = tg.initDataUnsafe?.user || { id: "Guest", first_name: "Mehmon" };
const tgId = user.id.toString();

document.getElementById('user-name').innerText = user.first_name;
document.getElementById('user-id').innerText = "ID: " + tgId;

const crashPool = [1.1, 1.5, 2.0, 1.2, 5.0, 1.8, 3.5, 1.3, 10.0, 1.4, 1.1, 4.2, 1.5, 7.5];

// Elementlar
const multiplierDisplay = document.getElementById('multiplier-display');
const crashMsg = document.getElementById('crash-msg');
const balanceEl = document.getElementById('balance-val');
const joinBtn = document.getElementById('join-btn');
const cashoutBtn = document.getElementById('cashout-btn');
const timerDisplay = document.getElementById('next-round-timer');
const timerSec = document.getElementById('timer-sec');
const historyList = document.getElementById('history-list');

let myBalance = 0;
let isJoined = false; 
let isWaitingForNext = false;
let currentGameState = "idle";

// 1. Foydalanuvchi balansini Telegram ID orqali olish
const userRef = ref(db, 'users/' + tgId);
onValue(userRef, (snapshot) => {
    const data = snapshot.val();
    myBalance = data?.balance || 0;
    balanceEl.innerText = Math.floor(myBalance);
});

// 2. LIVE O'YIN VA TARIXNI KUZATISH
const gameRef = ref(db, 'live_game');
const historyRef = ref(db, 'history');

onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    currentGameState = data.status;
    const m = data.multiplier;

    if (currentGameState === "flying") {
        multiplierDisplay.innerText = m.toFixed(2) + "x";
        multiplierDisplay.style.color = "#3b82f6";
        crashMsg.style.display = "none";
        timerDisplay.style.display = "none";
        if (isJoined) cashoutBtn.disabled = false;
    } 
    else if (currentGameState === "crashed") {
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        cashoutBtn.disabled = true;
        if (isJoined) { isJoined = false; tg.HapticFeedback.notificationOccurred('error'); }
        
        timerDisplay.style.display = "block";
        timerSec.innerText = data.nextIn || 0;

        if (isWaitingForNext) { isJoined = true; isWaitingForNext = false; joinBtn.disabled = true; } 
        else if (!isJoined) { joinBtn.disabled = false; joinBtn.innerText = "O'yinga qo'shilish"; }
    }
});

// Tarixni yuklash (Oxirgi 5 ta)
onValue(historyRef, (snapshot) => {
    const data = snapshot.val();
    historyList.innerHTML = "";
    if (data) {
        Object.values(data).reverse().slice(0, 5).forEach(item => {
            const div = document.createElement('div');
            div.className = "history-item";
            div.innerHTML = `<span>ID: ${item.uid}</span> <span class="mult">${item.coeff}x</span> <span>+${item.amount} s.</span>`;
            historyList.appendChild(div);
        });
    }
});

// 3. TUGMALAR
joinBtn.onclick = () => {
    isWaitingForNext = true;
    joinBtn.disabled = true;
    joinBtn.innerText = "Navbatda...";
    tg.HapticFeedback.impactOccurred('medium');
};

cashoutBtn.onclick = () => {
    if (isJoined && currentGameState === "flying") {
        const currentMult = parseFloat(multiplierDisplay.innerText);
        const win = Math.floor(currentMult);
        
        myBalance += win;
        update(userRef, { balance: myBalance, name: user.first_name });
        
        // Tarixga qo'shish
        push(historyRef, { uid: tgId, coeff: currentMult.toFixed(2), amount: win });

        isJoined = false;
        cashoutBtn.disabled = true;
        tg.HapticFeedback.notificationOccurred('success');
    }
};

// 4. SERVER LOOP (Master)
function startAutoLoop() {
    setInterval(() => {
        if (currentGameState === "idle" || currentGameState === null) initiateNewRound();
    }, 1000);
}

async function initiateNewRound() {
    for (let i = 5; i > 0; i--) {
        await update(gameRef, { status: "crashed", multiplier: 1.00, nextIn: i });
        await new Promise(r => setTimeout(r, 1000));
    }
    const target = crashPool[Math.floor(Math.random() * crashPool.length)];
    let currentM = 1.00;
    const flyInterval = setInterval(() => {
        currentM += 0.01;
        if (currentM >= target) {
            clearInterval(flyInterval);
            update(gameRef, { status: "crashed", multiplier: currentM, nextIn: 5 });
            setTimeout(() => update(gameRef, { status: "idle" }), 5000);
        } else {
            update(gameRef, { status: "flying", multiplier: currentM });
        }
    }, 60);
}

startAutoLoop();