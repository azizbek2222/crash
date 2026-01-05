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

// Foydalanuvchi ma'lumotlari
const userData = tg.initDataUnsafe?.user;
const userId = userData?.id ? userData.id.toString() : "test_" + Math.floor(Math.random() * 1000);
const userName = userData?.username ? "@" + userData.username : (userData?.first_name || "Mehmon");

document.getElementById('userDisplay').innerText = userName;

const multDisplay = document.getElementById('multiplier');
const timerDisplay = document.getElementById('timer');
const balanceDisplay = document.getElementById('balanceDisplay');
const actionBtn = document.getElementById('actionBtn');
const historyBar = document.getElementById('gameHistory');
const infoText = document.getElementById('infoText');
const playerCountEl = document.getElementById('playerCount');

let userState = "idle"; // idle, joined, playing
let gameLoop;
let localStatus = "";
let isAdWatching = false;
let isProcessing = false;
let localHistory = [];

// Online o'yinchilar
const onlineRef = ref(db, `online_players/${userId}`);
set(onlineRef, { name: userName });
onDisconnect(onlineRef).remove();

onValue(ref(db, 'online_players'), (snap) => {
    playerCountEl.innerText = snap.exists() ? Object.keys(snap.val()).length : 0;
});

// Balans (Faqat ko'rsatish, 5000 so'm berish olib tashlandi)
onValue(ref(db, `users/${userId}/balance`), (snap) => {
    balanceDisplay.innerText = snap.exists() ? snap.val().toLocaleString() : "0";
});

// O'yin mantiqi
onValue(ref(db, 'current_game'), (snapshot) => {
    const data = snapshot.val();
    
    if (!data) { 
        isProcessing = false;
        if (userState === "joined" || userState === "playing") userState = "idle";
        multDisplay.innerText = "1.00x";
        multDisplay.classList.remove('crashed');
        timerDisplay.innerText = "SAYLOV...";
        setTimeout(checkQueue, 1500);
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
                timerDisplay.innerText = diff + "s";
                updateUI('waiting');
                gameLoop = requestAnimationFrame(updateTick);
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
                // Agar foydalanuvchi joined bo'lsa, uni o'yinga kiritish
                if (userState === "joined") userState = "playing";
                updateUI('flying', currentX);
                gameLoop = requestAnimationFrame(updateTick);
            } else {
                if (!isProcessing) {
                    isProcessing = true;
                    handleCrash(data);
                }
            }
        }
    };
    gameLoop = requestAnimationFrame(updateTick);
});

async function checkQueue() {
    if (isProcessing) return;
    const qSnap = await get(ref(db, 'queue'));
    if (qSnap.exists()) {
        const keys = Object.keys(qSnap.val());
        const first = qSnap.val()[keys[0]];
        await runTransaction(ref(db, 'current_game'), (curr) => {
            if (curr === null) return { status: 'waiting', targetX: first.x, id: keys[0], startTime: Date.now() };
        });
    }
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

async function handleCrash(data) {
    multDisplay.innerText = data.targetX.toFixed(2) + "x";
    multDisplay.classList.add('crashed');
    infoText.innerText = userState === "playing" ? "Crash!" : "";
    userState = "idle";
    
    updateLocalHistory(data.targetX);
    
    setTimeout(async () => {
        const updates = {};
        updates['current_game'] = null;
        updates[`queue/${data.id}`] = null;
        await update(ref(db), updates);
    }, 2500);
}

function updateLocalHistory(val) {
    localHistory.unshift(val);
    if (localHistory.length > 10) localHistory.pop();
    historyBar.innerHTML = "";
    localHistory.forEach(x => {
        const div = document.createElement('div');
        div.className = `hist-item ${x >= 2 ? 'hist-high' : 'hist-low'}`;
        div.innerText = x.toFixed(2) + "x";
        historyBar.appendChild(div);
    });
}

// ASOSIY TUGMA ISHLASH MANTIQI
actionBtn.onclick = async () => {
    if (localStatus === "waiting" && userState === "idle" && !isAdWatching) {
        isAdWatching = true;
        const AdController = window.Adsgram.init({ blockId: "int-20566" });
        AdController.show().then(() => {
            userState = "joined";
            infoText.innerText = "Siz navbatdasiz!";
            updateUI('waiting');
        }).catch(() => {
            tg.showAlert("Reklamani ko'rmasangiz o'yinga kirmaysiz!");
        }).finally(() => { isAdWatching = false; });
    } 
    else if (localStatus === "flying" && userState === "playing") {
        const xValue = parseFloat(multDisplay.innerText);
        const win = Math.floor(xValue * 500); // 500 so'm tikilgan deb hisoblash
        userState = "idle"; 
        
        const userRef = ref(db, `users/${userId}`);
        const snap = await get(userRef);
        const currentBal = snap.exists() ? (snap.val().balance || 0) : 0;
        
        await update(userRef, { balance: currentBal + win });
        push(ref(db, 'round_winners'), { user: userName, x: xValue.toFixed(2), win: win });
        infoText.innerText = `+${win} so'm!`;
        updateUI('flying');
    }
};

function updateUI(status, x = 1) {
    if (status === 'waiting') {
        actionBtn.disabled = (userState === "joined");
        actionBtn.innerText = (userState === "joined") ? "TAYYOR" : "QO'SHILISH";
    } else if (status === 'flying') {
        if (userState === "playing") {
            actionBtn.disabled = false;
            actionBtn.innerText = `YUTUQ: ${Math.floor(x * 500)}`;
        } else {
            actionBtn.disabled = true;
            actionBtn.innerText = "KUTING...";
        }
    }
}
