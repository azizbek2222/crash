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
const AdController = window.Adsgram.init({ blockId: "int-20566" });

const tg = window.Telegram.WebApp;
tg.expand();
const user = tg.initDataUnsafe?.user || { id: "Guest", first_name: "Mehmon" };
const tgId = user.id.toString();

const multiplierDisplay = document.getElementById('multiplier-display');
const crashMsg = document.getElementById('crash-msg');
const balanceEl = document.getElementById('balance-val');
const joinBtn = document.getElementById('join-btn');
const cashoutBtn = document.getElementById('cashout-btn');
const historyList = document.getElementById('history-list');
const nextRoundTimer = document.getElementById('next-round-timer');
const timerSec = document.getElementById('timer-sec');

document.getElementById('user-name').innerText = user.first_name;
document.getElementById('user-id').innerText = "ID: " + tgId;

let myBalance = 0;
let isJoined = false;
let isWaitingForNext = false;
let currentGameState = "idle";
const crashPool = [1.1, 2.5, 1.2, 5.0, 1.8, 1.05, 15.0, 3.2, 1.5, 2.0];

const userRef = ref(db, 'users/' + tgId);
const gameRef = ref(db, 'live_game');
const historyRef = ref(db, 'current_round_history');

// Foydalanuvchi ma'lumotlarini yuklash
onValue(userRef, (snapshot) => {
    myBalance = snapshot.val()?.balance || 0;
    balanceEl.innerText = Math.floor(myBalance);
});

// O'YIN HOLATINI KUZATISH (Client)
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
        
        if (isJoined) {
            joinBtn.innerText = "O'yindasiz";
            joinBtn.className = "playing";
            joinBtn.disabled = true;
            cashoutBtn.disabled = false;
            cashoutBtn.innerText = `Pulni olish (${Math.floor(m)} s.)`;
        }
    } 
    else if (currentGameState === "crashed") {
        multiplierDisplay.innerText = m.toFixed(2) + "x";
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        cashoutBtn.disabled = true;

        if (data.nextIn > 0) {
            nextRoundTimer.style.display = "block";
            timerSec.innerText = data.nextIn;
        } else {
            nextRoundTimer.style.display = "none";
        }

        if (isJoined) {
            isJoined = false;
            tg.HapticFeedback.notificationOccurred('error');
        }

        if (isWaitingForNext) {
            isJoined = true;
            isWaitingForNext = false;
            joinBtn.innerText = "O'yindasiz";
            joinBtn.className = "playing";
        } else if (!isJoined) {
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
            joinBtn.className = "";
            joinBtn.disabled = false;
        }
    }
});

// Qo'shilish (Reklama bilan)
joinBtn.onclick = async () => {
    joinBtn.disabled = true;
    joinBtn.innerText = "Yuklanmoqda...";
    try {
        const result = await AdController.show();
        if (result && result.done) {
            if (currentGameState === "flying") {
                isJoined = true;
                joinBtn.innerText = "O'yindasiz";
                joinBtn.className = "playing";
            } else {
                isWaitingForNext = true;
                joinBtn.innerText = "Navbatga qo'shildi";
                joinBtn.className = "waiting";
            }
            tg.HapticFeedback.impactOccurred('medium');
        } else {
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        }
    } catch (e) {
        joinBtn.disabled = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
    }
};

// Cashout
cashoutBtn.onclick = () => {
    if (isJoined && currentGameState === "flying") {
        const m = parseFloat(multiplierDisplay.innerText);
        const win = Math.floor(m);
        myBalance += win;
        update(userRef, { balance: myBalance });
        push(historyRef, { uid: tgId, coeff: m.toFixed(2), amount: win });
        
        isJoined = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        joinBtn.className = "";
        joinBtn.disabled = false;
        cashoutBtn.disabled = true;
        tg.HapticFeedback.notificationOccurred('success');
    }
};

// O'YIN TSIZKLI (Server Loop)
let loopStarted = false;
function startMasterLoop() {
    if (loopStarted) return;
    loopStarted = true;

    setInterval(async () => {
        // Faqat o'yin bo'sh turganda yangi raund boshlash
        if (currentGameState === "idle" || !currentGameState) {
            // 1. Tozalash
            await set(historyRef, null);

            // 2. 15 soniya orqaga sanash
            for (let i = 15; i >= 0; i--) {
                await update(gameRef, { status: "crashed", multiplier: 1.00, nextIn: i });
                await new Promise(r => setTimeout(r, 1000));
            }

            // 3. Uchishni boshlash
            const target = crashPool[Math.floor(Math.random() * crashPool.length)];
            let currentM = 1.00;
            
            // Holatni "flying"ga o'tkazish
            await update(gameRef, { status: "flying", multiplier: 1.00, nextIn: 0 });

            const flyInterval = setInterval(async () => {
                currentM += 0.01;
                if (currentM >= target) {
                    clearInterval(flyInterval);
                    // Portlash
                    await update(gameRef, { status: "crashed", multiplier: currentM, nextIn: 15 });
                    // 2 soniyadan keyin "idle" holatga qaytish (Loop qaytadan boshlanishi uchun)
                    setTimeout(() => {
                        update(gameRef, { status: "idle" });
                    }, 2000);
                } else {
                    // Faqat multiplierni yangilash
                    update(gameRef, { multiplier: currentM });
                }
            }, 80); // Uchish tezligi
        }
    }, 2000);
}

// Loopni ishga tushirish
startMasterLoop();

// Yutuqlar ro'yxati
onValue(historyRef, (snapshot) => {
    const data = snapshot.val();
    historyList.innerHTML = "";
    if (data) {
        Object.values(data).forEach(item => {
            const div = document.createElement('div');
            div.className = "history-item";
            div.innerHTML = `<span>ID: ${item.uid}</span> <b>${item.coeff}x</b> <span style="color:#10b981">+${item.amount} s.</span>`;
            historyList.appendChild(div);
        });
    }
});
