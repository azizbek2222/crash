import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const user = tg.initDataUnsafe?.user || { id: 12345678, first_name: "Mehmon" };
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

const userRef = ref(db, 'users/' + tgId);
const gameRef = ref(db, 'live_game');
const historyRef = ref(db, 'history');
const lockRef = ref(db, 'game_lock');

// 1. Balansni yuklash
onValue(userRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        myBalance = data.balance || 0;
        balanceEl.innerText = Math.floor(myBalance);
    } else {
        set(userRef, { balance: 0, name: user.first_name });
    }
});

// 2. O'yin holatini kuzatish (UI Yangilash)
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
            const joriyYutuq = Math.floor(m);
            cashoutBtn.disabled = false;
            cashoutBtn.innerText = `OLISH (${joriyYutuq} so'm)`;
        } else if (isWaitingNext) {
            joinBtn.disabled = true;
            joinBtn.innerText = "NAVBTADA...";
            cashoutBtn.disabled = true;
        }
    } 
    else if (currentGameState === "crashed") {
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        
        cashoutBtn.disabled = true;
        cashoutBtn.innerText = "Pulni olish";

        if (data.nextIn !== undefined) {
            nextRoundTimer.style.display = "block";
            timerSec.innerText = data.nextIn;
        }

        // Navbatda turganlarni o'yinga kiritish
        if (isWaitingNext) {
            isJoined = true;
            isWaitingNext = false;
        }

        // AGAR foydalanuvchi hozirgina qo'shilgan bo'lsa (isJoined true), 
        // uni faqat samolyot uchishni boshlaganda (flying) o'yindan chiqaramiz.
        // Hozir crashed holatida uni o'yindan chiqarmaymiz, faqat tugmani ko'rsatamiz.
        if (isJoined) {
            joinBtn.disabled = true;
            joinBtn.innerText = "O'YINDASIZ";
        } else if (!isWaitingNext) {
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        }
    }
});

// 3. LOCK TIZIMI
async function claimServer() {
    const now = Date.now();
    await runTransaction(lockRef, (lock) => {
        if (!lock || (now - lock.lastSeen > 8000)) {
            return { holder: tgId, lastSeen: now };
        }
        if (lock.holder === tgId) {
            return { holder: tgId, lastSeen: now };
        }
        return;
    });
}
setInterval(claimServer, 4000);

let activeLoop = false;
onValue(lockRef, (snap) => {
    const lock = snap.val();
    if (lock && lock.holder === tgId && !activeLoop) {
        activeLoop = true;
        startServerLogic();
    } else if (lock && lock.holder !== tgId) {
        activeLoop = false;
    }
});

async function startServerLogic() {
    while (activeLoop) {
        for (let i = 15; i >= 0; i--) {
            if (!activeLoop) return;
            await set(gameRef, { status: "crashed", multiplier: 1.00, nextIn: i });
            await new Promise(r => setTimeout(r, 1000));
        }

        const target = (Math.random() * 10 + 1.1).toFixed(2);
        let curr = 1.00;
        await update(gameRef, { status: "flying", multiplier: 1.00, nextIn: 0 });

        const fly = await new Promise((resolve) => {
            const intv = setInterval(async () => {
                if (!activeLoop) { clearInterval(intv); resolve(); return; }
                curr += 0.02;
                if (curr >= target) {
                    clearInterval(intv);
                    // O'yin tugaganda bazaga crashed holatini yuborish
                    await set(gameRef, { status: "crashed", multiplier: curr, nextIn: 15 });
                    setTimeout(resolve, 3000);
                } else {
                    update(gameRef, { multiplier: curr });
                }
            }, 50);
        });
    }
}

// 4. Tugmalar logicasi
joinBtn.onclick = async () => {
    if (isJoined || isWaitingNext) return;
    
    joinBtn.disabled = true;
    joinBtn.innerText = "YUKLANMOQDA...";

    try {
        const res = await AdController.show();
        if (res && res.done) {
            if (currentGameState === "crashed") {
                isJoined = true; // Raund tugagan bo'lsa darhol qo'shiladi
                isWaitingNext = false;
            } else {
                isWaitingNext = true; // Uchayotgan bo'lsa navbatga turadi
                isJoined = false;
            }
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        }
    } catch (e) {
        joinBtn.disabled = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
    }
};

cashoutBtn.onclick = () => {
    // FAQAT uchayotgan vaqtda pul olish mumkin
    if (isJoined && currentGameState === "flying") {
        const currentM = parseFloat(multiplierDisplay.innerText.replace('x', ''));
        const win = Math.floor(currentM); 

        if (win > 0) {
            myBalance += win;
            update(userRef, { balance: myBalance });
            
            push(historyRef, { 
                uid: tgId, 
                coeff: currentM.toFixed(2) + "x", 
                amount: win 
            });

            isJoined = false; // Pul olindi -> status o'chdi
            cashoutBtn.disabled = true;
            cashoutBtn.innerText = "Pulni olish";
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
            
            document.getElementById('balance-val').innerText = Math.floor(myBalance);
            tg.HapticFeedback.notificationOccurred('success');
        }
    }
};

// 5. Tarix
onValue(historyRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    historyList.innerHTML = "";
    Object.values(data).reverse().slice(0, 5).forEach(item => {
        const div = document.createElement('div');
        div.className = "history-item";
        div.innerHTML = `<span>ID: ${item.uid}</span> <b>${item.coeff}x</b> <span style="color:#10b981">+${item.amount}</span>`;
        historyList.appendChild(div);
    });
});
