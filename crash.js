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

const user = tg.initDataUnsafe?.user || { id: "test_user", first_name: "Mehmon" };
const userId = user.id.toString();
const userName = user.username || user.first_name;

const multDisplay = document.getElementById('multiplier');
const timerDisplay = document.getElementById('timer');
const balanceDisplay = document.getElementById('balanceDisplay');
const actionBtn = document.getElementById('actionBtn');
const historyBar = document.getElementById('gameHistory');
const infoText = document.getElementById('infoText');

let userState = "idle"; 
let gameLoop;
let localStatus = "";
let isAdWatching = false;
let isProcessing = false; // ASOSIY QULF

// 1. Balans
onValue(ref(db, `users/${userId}`), (snap) => {
    if (snap.exists()) balanceDisplay.innerText = snap.val().balance.toLocaleString();
});

// 2. Tarixni chiqarishda duplikatsiyaga qarshi
onValue(ref(db, 'crash_history'), (snap) => {
    if (snap.exists()) {
        historyBar.innerHTML = "";
        const data = Object.values(snap.val()).reverse().slice(0, 10);
        data.forEach(val => {
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
        isProcessing = false;
        checkQueue(); 
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
                // AGAR ALLAQACHON ISHLANAYOTGAN BO'LSA TO'XTATISH
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
    userState = "idle";
    
    // 1. Tarixga yozish
    await push(ref(db, 'crash_history'), data.targetX);
    
    // 2. Navbatdan o'chirish va joriy o'yinni tozalash (BITTA AMALDA)
    setTimeout(async () => {
        const updates = {};
        updates['current_game'] = null;
        updates[`queue/${data.id}`] = null;
        await update(ref(db), updates);
        isProcessing = false; // Keyingi o'yin uchun qulfni ochish
    }, 2000);
}

// Tugmalar mantiqi
actionBtn.onclick = async () => {
    if (localStatus === "waiting" && userState === "idle") {
        isAdWatching = true;
        try {
            await AdController.show();
            userState = "joined";
            infoText.innerText = "Qo'shildingiz!";
            updateUI('waiting');
        } catch (e) {
            tg.showAlert("Reklama ko'rilmadi!");
        } finally { isAdWatching = false; }
    } else if (localStatus === "flying" && userState === "playing") {
        const xValue = parseFloat(multDisplay.innerText);
        const win = Math.floor(xValue * 1.5);
        userState = "idle";
        const userRef = ref(db, `users/${userId}`);
        const snap = await get(userRef);
        await update(userRef, { balance: (snap.val().balance || 0) + win });
        push(ref(db, 'round_winners'), { user: userName, x: xValue.toFixed(2), win: win });
        infoText.innerText = `+${win} so'm!`;
    }
};

function updateUI(status, x = 1) {
    if (status === 'waiting') {
        actionBtn.disabled = (userState === "joined" || isAdWatching);
        actionBtn.innerText = (userState === "joined") ? "TAYYOR" : "QO'SHILISH";
    } else if (status === 'flying') {
        if (userState === "playing") {
            actionBtn.disabled = false;
            actionBtn.innerText = `NAQD: ${Math.floor(x * 1.5)}`;
        } else {
            actionBtn.disabled = true;
            actionBtn.innerText = "KUTING...";
        }
    }
}
