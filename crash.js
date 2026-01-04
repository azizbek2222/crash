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

// Adsgram Init
const AdController = window.Adsgram.init({ blockId: "int-20560" });

const user = tg.initDataUnsafe?.user || { id: "test_user", first_name: "Mehmon", username: "guest" };
const userId = user.id.toString();
const userName = user.username || user.first_name;

const urlParams = new URLSearchParams(window.location.search);
const startParam = tg.initDataUnsafe?.start_param || urlParams.get('tgWebAppStartParam');

document.getElementById('userDisplay').innerText = "@" + userName;

const multDisplay = document.getElementById('multiplier');
const timerDisplay = document.getElementById('timer');
const balanceDisplay = document.getElementById('balanceDisplay');
const actionBtn = document.getElementById('actionBtn');
const historyBar = document.getElementById('gameHistory');
const liveWins = document.getElementById('liveWins');
const infoText = document.getElementById('infoText');

let currentBalance = 0;
let userState = "idle"; 
let gameLoop;
let localStatus = "";
let lastCleanedGameId = "";
let isAdWatching = false;

// 1. Balans va Referalni tekshirish
onValue(ref(db, `users/${userId}`), (snap) => {
    if (snap.exists()) {
        const data = snap.val();
        currentBalance = data.balance;
        balanceDisplay.innerText = currentBalance.toLocaleString();
    } else {
        const newUser = { 
            balance: 100, 
            name: userName,
            referralCount: 0,
            totalRefEarnings: 0
        };

        if (startParam && startParam !== userId) {
            newUser.invitedBy = startParam;
            get(ref(db, `users/${startParam}`)).then(refSnap => {
                if (refSnap.exists()) {
                    update(ref(db, `users/${startParam}`), {
                        referralCount: (refSnap.val().referralCount || 0) + 1
                    });
                }
            });
        }
        set(ref(db, `users/${userId}`), newUser); 
    }
});

// 2. Oxirgi 10 ta tarix
onValue(ref(db, 'crash_history'), (snap) => {
    if (snap.exists()) {
        historyBar.innerHTML = "";
        const items = Object.values(snap.val()).reverse().slice(0, 10);
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
    if (!data) { checkQueue(); return; }

    if (data.status === 'waiting' && lastCleanedGameId !== data.id) {
        lastCleanedGameId = data.id;
        remove(ref(db, 'round_winners')); 
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
                if (userState === "joined") userState = "playing";
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
                handleCrash(data);
            }
        }
    };
    gameLoop = requestAnimationFrame(updateTick);
});

onValue(ref(db, 'round_winners'), (snap) => {
    liveWins.innerHTML = "";
    if (snap.exists()) {
        Object.values(snap.val()).reverse().forEach(log => {
            const div = document.createElement('div');
            div.className = "win-entry";
            div.innerHTML = `<span style="color:#4ecca3">@${log.user}</span> <span>${log.x}x</span> <b style="color:#f8b400">+${log.win} so'm</b>`;
            liveWins.appendChild(div);
        });
    }
});

function updateUI(status, x = 1) {
    if (status === 'waiting') {
        actionBtn.innerText = (userState === "joined") ? "REKLAMA KO'RILYAPTI..." : "O'yinga qo'shilish";
        actionBtn.className = (userState === "joined") ? "btn-joined" : "btn-join";
        actionBtn.disabled = false;
        actionBtn.style.opacity = "1";
        if(userState === "idle") infoText.innerText = "";
    } else {
        if (userState === "playing") {
            if (isAdWatching) {
                actionBtn.innerText = "REKLAMA TUGASHINI KUTING";
                actionBtn.disabled = true;
                actionBtn.style.opacity = "0.5";
            } else {
                actionBtn.disabled = false;
                actionBtn.style.opacity = "1";
                actionBtn.innerText = `NAQD PULLASH: ${Math.floor(x)} so'm`;
                actionBtn.className = "btn-cashout";
            }
        } else {
            actionBtn.innerText = "Kutilmoqda...";
            actionBtn.className = "btn-joined";
            actionBtn.disabled = true;
        }
    }
}

// MULTI-CLICK HIMOYALANGAN ONCLICK
actionBtn.onclick = async () => {
    if (actionBtn.className === "btn-join" && localStatus === "waiting") {
        isAdWatching = true;
        userState = "joined";
        
        try {
            await AdController.show().then(() => {
                isAdWatching = false;
                update(ref(db, `online_players/${userId}`), { name: userName });
                infoText.innerText = "Reklama tugadi! O'yinni kuzating.";
            }).catch((result) => {
                isAdWatching = false;
                userState = "idle";
                tg.showAlert("O'yinga kirish uchun reklamani oxirigacha ko'rishingiz kerak!");
            });
        } catch (e) {
            isAdWatching = false;
            userState = "idle";
            console.error("Adsgram error", e);
        }
    } 
    // Naqd pullash qismi (Xavfsiz)
    else if (userState === "playing" && actionBtn.className === "btn-cashout") {
        // DARHOL HOLATNI O'ZGARTIRAMIZ VA TUGMANI O'CHIRAMIZ
        userState = "idle"; 
        actionBtn.disabled = true;
        actionBtn.style.opacity = "0.5";
        actionBtn.innerText = "ISHLANMOQDA...";

        const xValue = parseFloat(multDisplay.innerText);
        const win = Math.floor(xValue);
        
        try {
            // 1. Balansni yangilash
            await update(ref(db, `users/${userId}`), { 
                balance: currentBalance + win 
            });

            // 2. REFERAL BONUSI (1%)
            const userSnap = await get(ref(db, `users/${userId}`));
            const invitedBy = userSnap.val()?.invitedBy;

            if (invitedBy) {
                const refBonus = Math.floor(win * 0.01);
                if (refBonus > 0) {
                    const refUserRef = ref(db, `users/${invitedBy}`);
                    const refSnap = await get(refUserRef);
                    if (refSnap.exists()) {
                        await update(refUserRef, {
                            balance: refSnap.val().balance + refBonus,
                            totalRefEarnings: (refSnap.val().totalRefEarnings || 0) + refBonus
                        });
                    }
                }
            }

            await push(ref(db, 'round_winners'), { user: userName, x: xValue.toFixed(2), win: win });
            infoText.innerText = `+${win} so'm yutdingiz!`;
        } catch (error) {
            console.error("Xatolik:", error);
        } finally {
            remove(ref(db, `online_players/${userId}`));
        }
    }
};

function handleCrash(data) {
    multDisplay.innerText = data.targetX.toFixed(2) + "x";
    multDisplay.classList.add('crashed');
    userState = "idle";
    isAdWatching = false;
    push(ref(db, 'crash_history'), data.targetX);
    remove(ref(db, `online_players/${userId}`));
    setTimeout(() => { resetToNext(data); }, 500);
}

async function checkQueue() {
    const qSnap = await get(ref(db, 'queue'));
    if (qSnap.exists()) {
        const keys = Object.keys(qSnap.val());
        runTransaction(ref(db, 'current_game'), (curr) => {
            if (curr === null) return { status: 'waiting', targetX: qSnap.val()[keys[0]].x, id: keys[0], startTime: Date.now() };
        });
    }
}

function startFlight(data) {
    runTransaction(ref(db, 'current_game'), (curr) => {
        if (curr && curr.status === 'waiting') {
            curr.status = 'flying';
            curr.startTime = Date.now();
            return curr;
        }
    });
}

async function resetToNext(data) {
    const newKey = push(ref(db, 'queue')).key;
    const updates = {};
    updates[`queue/${data.id}`] = null;
    updates[`queue/${newKey}`] = { x: data.targetX };
    updates['current_game'] = null;
    await update(ref(db), updates);
}

window.openWithdraw = function() {
    window.location.href = 'withdraw.html';
};