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
let processedGameId = ""; // Takrorlanishni oldini olish uchun asosiy kalit

// 1. Balans
onValue(ref(db, `users/${userId}`), (snap) => {
    if (snap.exists()) balanceDisplay.innerText = snap.val().balance.toLocaleString();
});

// 2. Tarix (Faqat oxirgi 10 tasini ko'rsatish)
onValue(ref(db, 'crash_history'), (snap) => {
    if (snap.exists()) {
        historyBar.innerHTML = "";
        const data = snap.val();
        const items = Object.values(data).reverse().slice(0, 10);
        items.forEach(val => {
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
        processedGameId = ""; 
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
                // Faqat ID o'zgargandagina bir marta ishlaydi
                if (processedGameId !== data.id) {
                    processedGameId = data.id;
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
        const queueData = qSnap.val();
        const keys = Object.keys(queueData);
        const nextId = keys[0];
        const nextX = queueData[nextId].x;

        await runTransaction(ref(db, 'current_game'), (curr) => {
            if (curr === null) {
                return { status: 'waiting', targetX: nextX, id: nextId, startTime: Date.now() };
            }
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
    
    // Tarixga yozish - Faqat bir marta
    const historyRef = ref(db, 'crash_history');
    await push(historyRef, data.targetX);
    
    // Navbatdan o'chirish va joriy o'yinni tozalashni bitta blockda qilish
    setTimeout(async () => {
        const updates = {};
        updates['current_game'] = null;
        updates[`queue/${data.id}`] = null;
        await update(ref(db), updates);
    }, 2000);
}

actionBtn.onclick = async () => {
    if (localStatus === "waiting" && userState === "idle") {
        isAdWatching = true;
        try {
            await AdController.show();
            userState = "joined";
            infoText.innerText = "O'yinga kirdingiz!";
            updateUI('waiting');
        } catch (e) {
            tg.showAlert("Reklamani oxirigacha ko'ring!");
        } finally { isAdWatching = false; }
    } 
    else if (localStatus === "flying" && userState === "playing") {
        const xValue = parseFloat(multDisplay.innerText);
        const win = Math.floor(xValue * 1.5);
        userState = "idle";
        
        try {
            const userRef = ref(db, `users/${userId}`);
            const snap = await get(userRef);
            const bal = snap.val().balance || 0;
            await update(userRef, { balance: bal + win });
            await push(ref(db, 'round_winners'), { user: userName, x: xValue.toFixed(2), win: win });
            infoText.innerText = `+${win} so'm yutdingiz!`;
        } catch (err) { console.log(err); }
    }
};

function updateUI(status, x = 1) {
    if (status === 'waiting') {
        actionBtn.disabled = (userState === "joined" || isAdWatching);
        actionBtn.innerText = (userState === "joined") ? "TAYYOR" : "QO'SHILISH";
        actionBtn.className = (userState === "joined") ? "btn-joined" : "btn-join";
    } else if (status === 'flying') {
        if (userState === "playing") {
            actionBtn.disabled = false;
            actionBtn.innerText = `NAQD: ${Math.floor(x * 1.5)}`;
            actionBtn.className = "btn-cashout";
        } else {
            actionBtn.disabled = true;
            actionBtn.innerText = "KUTING...";
        }
    }
}
