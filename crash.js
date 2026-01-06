import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
let activeLoop = false;

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
            cashoutBtn.disabled = false;
            cashoutBtn.innerText = `OLISH (${Math.floor(m)} so'm)`;
        }
    } 
    else if (currentGameState === "crashed") {
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        
        if (data.nextIn !== undefined) {
            nextRoundTimer.style.display = "block";
            timerSec.innerText = data.nextIn;
        }

        cashoutBtn.disabled = true;
        cashoutBtn.innerText = "Pulni olish";

        if (isJoined && data.nextIn === 15) {
            isJoined = false; 
            tg.HapticFeedback.notificationOccurred('error');
        }

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

// 3. SERVER LOCK TIZIMI (KIM BIRINCHI KIRSA SHU SERVER)
async function claimServer() {
    const now = Date.now();
    try {
        await runTransaction(lockRef, (currentLock) => {
            // Agar hech kim server bo'lmasa yoki server 8 soniyadan beri javob bermasa
            if (!currentLock || (now - currentLock.lastSeen > 8000)) {
                return { holder: tgId, lastSeen: now };
            }
            // Agar men o'zim server bo'lsam, vaqtni yangilayman
            if (currentLock.holder === tgId) {
                return { holder: tgId, lastSeen: now };
            }
            // Aks holda tegmaymiz
            return;
        });
    } catch (e) {
        console.error("Lock error", e);
    }
}

// Serverlikni tekshirish
setInterval(claimServer, 3000);

onValue(lockRef, (snap) => {
    const lock = snap.val();
    if (lock && lock.holder === tgId) {
        if (!activeLoop) {
            activeLoop = true;
            startServerLogic();
        }
    } else {
        activeLoop = false;
    }
});

// 4. SERVER MANTIQI (FAQAT MASTER FOYDALANUVCHIDA ISHLAYDI)
async function startServerLogic() {
    while (activeLoop) {
        const snapshot = await get(gameRef);
        const data = snapshot.val() || {};
        
        // Agar o'yin crashed bo'lsa yoki endi boshlanayotgan bo'lsa
        if (data.status === "crashed" || !data.status) {
            let startTimer = data.nextIn || 15;
            for (let i = startTimer; i >= 0; i--) {
                if (!activeLoop) return;
                await update(gameRef, { status: "crashed", multiplier: 1.00, nextIn: i });
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Uchishni boshlash (To'xtagan joyidan davom etishi mumkin)
        let curr = (data.status === "flying") ? (data.multiplier || 1.00) : 1.00;
        const target = parseFloat((Math.random() * 7 + 1.1).toFixed(2));
        
        await update(gameRef, { status: "flying", multiplier: curr, nextIn: 0 });

        await new Promise((resolve) => {
            const intv = setInterval(async () => {
                if (!activeLoop) { 
                    clearInterval(intv); 
                    resolve(); 
                    return; 
                }

                curr += 0.03;
                
                if (curr >= target) {
                    clearInterval(intv);
                    await update(gameRef, { status: "crashed", multiplier: curr, nextIn: 15 });
                    setTimeout(resolve, 3000);
                } else {
                    // Muhim: update ishlatamiz, butun bazani emas
                    update(gameRef, { multiplier: curr });
                }
            }, 100);
        });
    }
}

// 5. TUGMALAR LOGIKASI
joinBtn.onclick = async () => {
    if (isJoined || isWaitingNext) return;
    
    joinBtn.disabled = true;
    joinBtn.innerText = "YUKLANMOQDA...";

    try {
        const res = await AdController.show();
        if (res && res.done) {
            if (currentGameState === "crashed") {
                isJoined = true;
                isWaitingNext = false;
            } else {
                isWaitingNext = true;
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

            isJoined = false;
            cashoutBtn.disabled = true;
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
            tg.HapticFeedback.notificationOccurred('success');
        }
    }
};

// 6. TARIXNI YUKLASH
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
