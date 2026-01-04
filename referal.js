import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const user = tg.initDataUnsafe?.user || { id: "test_user" };
const userId = user.id.toString();

// Referal linkni yaratish (Bot manzili + start parametri)
const botUsername = "crash_som_bot"; 
const refLink = `https://t.me/${botUsername}/crash?startapp=${userId}`;
document.getElementById('referralLink').value = refLink;

// Statistikani yuklash
onValue(ref(db, `users/${userId}`), (snap) => {
    if (snap.exists()) {
        const data = snap.val();
        document.getElementById('referralCount').innerText = data.referralCount || 0;
        document.getElementById('referralEarnings').innerText = (data.totalRefEarnings || 0).toLocaleString() + " so'm";
    }
});

window.copyLink = function() {
    const copyText = document.getElementById("referralLink");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    tg.showAlert("Havola nusxalandi!");
};