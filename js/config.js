// js/config.js

// ==========================================
// 1. KONFIGURASI SUPABASE & TELEGRAM
// ==========================================
const SUPABASE_URL = "https://vpmnsuhyflzlhfnkvuko.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbW5zdWh5Zmx6bGhmbmt2dWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDg5MjAsImV4cCI6MjEwNTYyNDkyMH0.ou6N7Wvfaibicuk4io-ptlJp87-MLwkpfRcHRbuVqXA";

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_BOT_TOKEN = "8783483454:AAFIMaNa4Z5-uUMXHOeqHZgkk2S9EK4gC0Y";
const TELEGRAM_CHAT_ID = "1225652735";

function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        })
    }).catch(e => console.error("Gagal kirim Telegram:", e));
}

// ==========================================
// 2. STATE GLOBAL & CACHE LOKAL
// ==========================================
window.HES = {
    currentUser: null,
    userRole: null,
    months: [
        { id: 'm1', title: 'Month 1', weeks: [1, 2, 3, 4] },
        { id: 'm2', title: 'Month 2', weeks: [1, 2, 3, 4] }
    ],
    materials: {},
    students: [
        { email: 'murid@gmail.com', password: '123', name: 'Murid Pertama' }
    ]
};

// Muat cache lokal terlebih dahulu agar halaman terasa instan
(function loadLocalCache() {
    try {
        const cachedMonths = localStorage.getItem('hes_cache_months');
        const cachedMaterials = localStorage.getItem('hes_cache_materials');
        const cachedStudents = localStorage.getItem('hes_cache_students');
        if (cachedMonths) window.HES.months = JSON.parse(cachedMonths);
        if (cachedMaterials) window.HES.materials = JSON.parse(cachedMaterials);
        if (cachedStudents) window.HES.students = JSON.parse(cachedStudents);
    } catch (e) {
        console.warn("Gagal memuat cache lokal:", e);
    }
})();

// ==========================================
// 3. MANAJEMEN SESI & AUTENTIKASI
// ==========================================
function getSession() {
    const savedUser = localStorage.getItem('hes_session_user');
    const savedRole = localStorage.getItem('hes_session_role');
    if (savedUser && savedRole) {
        window.HES.currentUser = JSON.parse(savedUser);
        window.HES.userRole = savedRole;
        return { user: window.HES.currentUser, role: window.HES.userRole };
    }
    return null;
}

function requireAuth(allowedRole = null) {
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    if (allowedRole && session.role !== allowedRole) {
        window.location.href = 'dashboard.html';
        return null;
    }
    return session;
}

function logoutUser() {
    localStorage.removeItem('hes_session_user');
    localStorage.removeItem('hes_session_role');
    window.location.href = 'index.html';
}

// ==========================================
// 4. SINKRONISASI CLOUD SUPABASE
// ==========================================
async function syncFromCloud() {
    updateCloudStatusUI('syncing');
    try {
        const { data, error } = await window.supabaseClient.from('app_data').select('*');
        if (error) throw error;
        if (data) {
            const mData = data.find(d => d.key === 'hes_months');
            const matData = data.find(d => d.key === 'hes_materials');
            const stuData = data.find(d => d.key === 'hes_students');

            if (mData && mData.value) {
                window.HES.months = mData.value;
                localStorage.setItem('hes_cache_months', JSON.stringify(mData.value));
            }
            if (matData && matData.value) {
                window.HES.materials = matData.value;
                localStorage.setItem('hes_cache_materials', JSON.stringify(matData.value));
            }
            if (stuData && stuData.value) {
                window.HES.students = stuData.value;
                localStorage.setItem('hes_cache_students', JSON.stringify(stuData.value));
            }
        }
        updateCloudStatusUI('online');
        return true;
    } catch (e) {
        console.error("Koneksi cloud bermasalah:", e);
        updateCloudStatusUI('offline');
        return false;
    }
}

async function saveToCloud(key, value) {
    updateCloudStatusUI('syncing');
    if (key === 'hes_months') {
        window.HES.months = value;
        localStorage.setItem('hes_cache_months', JSON.stringify(value));
    } else if (key === 'hes_materials') {
        window.HES.materials = value;
        localStorage.setItem('hes_cache_materials', JSON.stringify(value));
    } else if (key === 'hes_students') {
        window.HES.students = value;
        localStorage.setItem('hes_cache_students', JSON.stringify(value));
    }

    const { error } = await window.supabaseClient.from('app_data').upsert([{ key, value }]);
    if (error) {
        updateCloudStatusUI('offline');
        return { error };
    }
    updateCloudStatusUI('online');
    return { error: null };
}

function updateCloudStatusUI(status) {
    const badge = document.getElementById('cloud-status-indicator');
    if (!badge) return;
    if (status === 'syncing') {
        badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200";
        badge.innerHTML = `<i class="fas fa-sync fa-spin text-[10px]"></i> <span>Menyinkronkan...</span>`;
    } else if (status === 'online') {
        badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200";
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Cloud Terhubung</span>`;
    } else {
        badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200";
        badge.innerHTML = `<i class="fas fa-exclamation-triangle text-[10px]"></i> <span>Mode Offline</span>`;
    }
}

// ==========================================
// 5. HELPER TANGGAL, JADWAL & GOOGLE DRIVE
// ==========================================
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatDateForID(dateObj) {
    return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
}

function parseDateStr(str) {
    let parts = str.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getDisplayDate(dateObj) {
    return `${dayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function isOccupied(email, targetDateStr) {
    let p = window.HES.materials[`profile-${email}`];
    if (!p || !p.time || !p.days) return false;
    let targetDate = parseDateStr(targetDateStr);
    let dayName = dayNames[targetDate.getDay()];
    let validDate = new Date(p.validUntil);
    if (!isNaN(validDate)) {
        validDate.setHours(23, 59, 59, 999);
        if (targetDate > validDate) return false;
    }
    let isDefault = p.days.includes(dayName);
    let reschedules = p.reschedules || {};
    let pendingReschedules = p.pendingReschedules || {};
    let movedAway = reschedules[targetDateStr] !== undefined;
    let movedHere = Object.values(reschedules).includes(targetDateStr);
    let pendingMoveHere = Object.values(pendingReschedules).includes(targetDateStr);
    return (isDefault && !movedAway) || movedHere || pendingMoveHere;
}

function checkOverlap(time1, time2) {
    if (!time1 || !time2 || !time1.includes('-') || !time2.includes('-')) return false;
    let [s1, e1] = time1.split('-').map(t => parseInt(t.trim().replace(':', '')));
    let [s2, e2] = time2.split('-').map(t => parseInt(t.trim().replace(':', '')));
    return (s1 < e2) && (s2 < e1);
}

function getStudentNextSessionInfo(email) {
    let p = window.HES.materials[`profile-${email}`];
    if (!p || !p.days || p.days.length === 0) return { error: 'Jadwal belum dikonfigurasi oleh admin.' };
    if (!p.validUntil || p.validUntil === 'Belum diatur') return { error: 'Masa aktif keanggotaan belum diatur.' };

    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let validDate = new Date(p.validUntil);
    let isValid = !isNaN(validDate);
    if (isValid) validDate.setHours(23, 59, 59, 999);
    if (isValid && today > validDate) return { expired: true, validDateStr: getDisplayDate(validDate) };

    for (let i = 0; i < 30; i++) {
        let curr = new Date(today);
        curr.setDate(today.getDate() + i);
        if (isValid && curr > validDate) break;
        let currStr = formatDateForID(curr);
        if (isOccupied(email, currStr)) {
            return {
                dateStr: currStr,
                displayDate: getDisplayDate(curr),
                time: p.time,
                validDateStr: isValid ? getDisplayDate(validDate) : 'Belum diatur'
            };
        }
    }
    return { error: 'Tidak ada jadwal terdekat yang tersedia dalam 30 hari ke depan.' };
}

function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//);
        if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return link;
}

function getDriveDirectStreamLink(url) {
    if (!url) return '';
    let id = '';
    const parts = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (parts && parts[1]) {
        id = parts[1];
    } else {
        try {
            const urlParams = new URLSearchParams(url.split('?')[1]);
            if (urlParams.has('id')) id = urlParams.get('id');
        } catch (e) {}
    }
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    return url;
}

function calculateCategoryScore(cat, examData, examResult) {
    if (!examData || !examData[cat] || examData[cat].length === 0) return 0;
    let totalScore = 0;
    let totalQuestions = examData[cat].length;
    examData[cat].forEach((q, idx) => {
        let ans = examResult.answers ? examResult.answers[`${cat}_${idx}`] : undefined;
        if (q.type === 'mcq') {
            if (ans !== undefined && ans !== '' && ans == q.answer) {
                totalScore += 100;
            }
        } else {
            let manual = (examResult.scores && examResult.scores[`${cat}_${idx}`] !== undefined)
                ? parseFloat(examResult.scores[`${cat}_${idx}`])
                : 0;
            totalScore += (isNaN(manual) ? 0 : manual);
        }
    });
    return Math.round(totalScore / totalQuestions);
}

// ==========================================
// 6. TOAST NOTIFICATION MODERN
// ==========================================
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-slate-900 text-white border-slate-800',
        error: 'bg-red-600 text-white border-red-700',
        info: 'bg-indigo-600 text-white border-indigo-700'
    };
    const icons = {
        success: 'fa-check-circle text-emerald-400',
        error: 'fa-exclamation-circle text-white',
        info: 'fa-info-circle text-indigo-200'
    };

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold fade-in ${colors[type] || colors.success}`;
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.success} text-base shrink-0"></i>
        <span class="flex-1 leading-snug">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}