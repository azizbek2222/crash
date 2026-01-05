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

// Adsgram Init (Blok ID ni o'zingiznikiga almashtiring)
const AdController = window.Adsgram.init({ blockId: "int-20566" });

const tg = window.Telegram.WebApp;
tg.expand();
const user = tg.initDataUnsafe?.user || { id: "Guest", first_name: "Mehmon" };
const tgId = user.id.toString();

document.getElementById('user-name').innerText = user.first_name;
document.getElementById('user-id').innerText = "ID: " + tgId;

const multiplierDisplay = document.getElementById('multiplier-display');
const crashMsg = document.getElementById('crash-msg');
const balanceEl = document.getElementById('balance-val');
const joinBtn = document.getElementById('join-btn');
const cashoutBtn = document.getElementById('cashout-btn');
const historyList = document.getElementById('history-list');

let myBalance = 0;
let isJoined = false; 
let isWaitingForNext = false;
let currentGameState = "idle";
const crashPool = [1.1, 2.5, 1.2, 5.0, 1.8, 15.0, 1.1, 3.2, 1.5, 2.0];

const userRef = ref(db, 'users/' + tgId);
const gameRef = ref(db, 'live_game');
const historyRef = ref(db, 'current_round_history');

onValue(userRef, (snapshot) => {
    myBalance = snapshot.val()?.balance || 0;
    balanceEl.innerText = Math.floor(myBalance);
});

onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    currentGameState = data.status;
    const m = data.multiplier;

    if (currentGameState === "flying") {
        multiplierDisplay.innerText = m.toFixed(2) + "x";
        multiplierDisplay.style.color = "#3b82f6";
        crashMsg.style.display = "none";
        if (isJoined) {
            joinBtn.innerText = "O'yindasiz";
            joinBtn.className = "playing";
            cashoutBtn.disabled = false;
            cashoutBtn.innerText = `Pulni olish (${m.toFixed(0)} s.)`;
        }
    } 
    else if (currentGameState === "crashed") {
        multiplierDisplay.style.color = "#ef4444";
        crashMsg.style.display = "block";
        cashoutBtn.disabled = true;

        if (isJoined) { isJoined = false; tg.HapticFeedback.notificationOccurred('error'); }

        if (isWaitingForNext) {
            isJoined = true;
            isWaitingForNext = false;
            joinBtn.innerText = "O'yindasiz";
            joinBtn.className = "playing";
        } else {
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
            joinBtn.className = "";
            joinBtn.disabled = false;
        }
    }
});

// Reklama ko'rsatish va qo'shilish funksiyasi
async function showAdAndJoin() {
    try {
        joinBtn.disabled = true;
        joinBtn.innerText = "Reklama yuklanmoqda...";
        
        const result = await AdController.show();
        
        // Reklama to'liq ko'rilganda (result.done bo'lsa)
        if (result && result.done) {
            if (currentGameState === "flying") {
                isWaitingForNext = true;
                joinBtn.innerText = "Keyingi raund kutilmoqda...";
                joinBtn.className = "waiting";
            } else {
                isJoined = true;
                joinBtn.innerText = "O'yindasiz";
                joinBtn.className = "playing";
            }
            tg.HapticFeedback.impactOccurred('medium');
        } else {
            // Reklama yopib yuborilsa
            joinBtn.disabled = false;
            joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
            alert("O'yinga kirish uchun reklamani oxirigacha ko'rishingiz kerak!");
        }
    } catch (error) {
        joinBtn.disabled = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        console.error("Reklama xatosi:", error);
    }
}

joinBtn.onclick = showAdAndJoin;

cashoutBtn.onclick = () => {
    if (isJoined && currentGameState === "flying") {
        const m = parseFloat(multiplierDisplay.innerText);
        const win = Math.floor(m);
        myBalance += win;
        update(userRef, { balance: myBalance, name: user.first_name });
        push(historyRef, { uid: tgId, coeff: m.toFixed(2), amount: win });
        isJoined = false;
        joinBtn.innerText = "O'yinga qo'shilish (Reklama)";
        joinBtn.className = "";
        joinBtn.disabled = false;
        cashoutBtn.disabled = true;
        tg.HapticFeedback.notificationOccurred('success');
    }
};

// SERVER LOOP (O'yinni boshqarish)
function startAutoLoop() {
    setInterval(() => {
        if (currentGameState === "idle" || currentGameState === null) {
            (async () => {
                await set(historyRef, null); 
                const target = crashPool[Math.floor(Math.random() * crashPool.length)];
                let currentM = 1.00;
                const flyInterval = setInterval(() => {
                    currentM += 0.01;
                    if (currentM >= target) {
                        clearInterval(flyInterval);
                        update(gameRef, { status: "crashed", multiplier: currentM });
                        setTimeout(() => update(gameRef, { status: "idle" }), 4000);
                    } else {
                        update(gameRef, { status: "flying", multiplier: currentM });
                    }
                }, 70);
            })();
        }
    }, 1000);
}
startAutoLoop();

onValue(historyRef, (snapshot) => {
    const data = snapshot.val();
    historyList.innerHTML = "";
    if (data) {
        Object.values(data).forEach(item => {
            const div = document.createElement('div');
            div.className = "history-item";
            div.innerHTML = `<span class="id-part">ID: ${item.uid}</span> <span class="mult-part">${item.coeff}x</span> <span class="sum-part">${item.amount} so'm</span>`;
            historyList.appendChild(div);
        });
    }
});