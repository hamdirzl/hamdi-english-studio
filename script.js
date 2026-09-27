// script.js

// ==== KONFIGURASI TELEGRAM ====
const TELEGRAM_BOT_TOKEN = "8783483454:AAFIMaNa4Z5-uUMXHOeqHZgkk2S9EK4gC0Y"; 
const TELEGRAM_CHAT_ID = "1225652735";

function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    }).catch(e => console.error("Gagal kirim Telegram", e));
}

// ==== STATE & DATA AWAL ====
let currentUser = null; let userRole = null; 
let months = [ { id: 'm1', title: 'Month 1', weeks: [1, 2, 3, 4] }, { id: 'm2', title: 'Month 2', weeks: [1, 2, 3, 4] } ];
let materials = {};
let students = [ { email: 'murid@gmail.com', password: '123', name: 'Murid Pertama' } ];

// State Khusus Admin
let currentAdminTab = 'overview';
let adminExamState = { student: '', month: '', activeTab: 'listening', data: null };

// ==== HELPER TANGGAL & WAKTU ====
const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatDateForID(dateObj) { return dateObj.getFullYear() + '-' + String(dateObj.getMonth()+1).padStart(2,'0') + '-' + String(dateObj.getDate()).padStart(2,'0'); }
function parseDateStr(str) { let parts = str.split('-'); return new Date(parts[0], parts[1]-1, parts[2]); }
function getDisplayDate(dateObj) { return `${dayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`; }

function isOccupied(email, targetDateStr) {
    let p = materials[`profile-${email}`]; if(!p || !p.time || !p.days) return false;
    let targetDate = parseDateStr(targetDateStr); let dayName = dayNames[targetDate.getDay()];
    let validDate = new Date(p.validUntil);
    if (!isNaN(validDate)) { validDate.setHours(23,59,59,999); if (targetDate > validDate) return false; }
    let isDefault = p.days.includes(dayName);
    let reschedules = p.reschedules || {}; let pendingReschedules = p.pendingReschedules || {};
    let movedAway = reschedules[targetDateStr] !== undefined; let movedHere = Object.values(reschedules).includes(targetDateStr); 
    let pendingMoveAway = pendingReschedules[targetDateStr] !== undefined; let pendingMoveHere = Object.values(pendingReschedules).includes(targetDateStr); 
    return (isDefault && !movedAway) || movedHere || pendingMoveHere;
}

function checkOverlap(time1, time2) {
    if(!time1 || !time2 || !time1.includes('-') || !time2.includes('-')) return false;
    let [s1, e1] = time1.split('-').map(t => parseInt(t.trim().replace(':','')));
    let [s2, e2] = time2.split('-').map(t => parseInt(t.trim().replace(':','')));
    return (s1 < e2) && (s2 < e1);
}

function getStudentNextSessionInfo(email) {
    let p = materials[`profile-${email}`];
    if (!p || !p.days || p.days.length === 0) return { error: 'Jadwal belum dikonfigurasi admin.' };
    if (!p.validUntil || p.validUntil === 'Belum diatur') return { error: 'Masa aktif belum diatur.' };
    
    let today = new Date(); today.setHours(0,0,0,0);
    let validDate = new Date(p.validUntil); let isValid = !isNaN(validDate);
    if (isValid) validDate.setHours(23,59,59,999);
    
    if (isValid && today > validDate) return { expired: true, validDateStr: getDisplayDate(validDate) };
    
    for(let i=0; i<30; i++) {
        let curr = new Date(today); curr.setDate(today.getDate() + i);
        if (isValid && curr > validDate) break; 
        let currStr = formatDateForID(curr);
        if (isOccupied(email, currStr)) {
            return { dateStr: currStr, displayDate: getDisplayDate(curr), time: p.time, validDateStr: isValid ? getDisplayDate(validDate) : 'Belum diatur' };
        }
    }
    return { error: 'Tidak ada jadwal terdekat yang tersedia.' };
}

// ==== SINKRONISASI DATA ====
async function fetchCloudData() {
    try {
        const { data, error } = await window.supabaseClient.from('app_data').select('*');
        if (data) {
            const mData = data.find(d => d.key === 'hes_months'); const matData = data.find(d => d.key === 'hes_materials'); const stuData = data.find(d => d.key === 'hes_students');
            if (mData && mData.value) months = mData.value; if (matData && matData.value) materials = matData.value; if (stuData && stuData.value) students = stuData.value;
            
            if (currentUser) {
                renderSidebar();
                if (document.getElementById('main-content').innerHTML.includes('Dashboard')) renderDashboard();
                if (document.getElementById('main-content').innerHTML.includes('Penjadwalan Ulang')) renderReschedule();
                if (document.getElementById('main-content').innerHTML.includes('Administrative')) renderAdminCMS(currentAdminTab);
            }
        }
    } catch (e) { console.error("Koneksi cloud bermasalah.", e); }
}
fetchCloudData();

// ==== DOM & AUTH ====
const loginPage = document.getElementById('login-page'); const appPage = document.getElementById('app-page');
const loginForm = document.getElementById('login-form'); const loginError = document.getElementById('login-error');
const sidebar = document.getElementById('sidebar'); const sidebarMenu = document.getElementById('sidebar-menu'); const mainContent = document.getElementById('main-content');

function checkExistingSession() {
    const savedUser = localStorage.getItem('hes_session_user'); const savedRole = localStorage.getItem('hes_session_role');
    if (savedUser && savedRole) { currentUser = JSON.parse(savedUser); userRole = savedRole; loginSuccess(false); }
}
checkExistingSession();

document.getElementById('open-sidebar').addEventListener('click', () => { sidebar.classList.remove('-translate-x-full'); });
document.getElementById('close-sidebar').addEventListener('click', () => { sidebar.classList.add('-translate-x-full'); });
document.getElementById('logout-btn').addEventListener('click', handleLogout);

loginForm.addEventListener('submit', (e) => {
    e.preventDefault(); const email = document.getElementById('email').value; const password = document.getElementById('password').value;
    if (email === 'hamdirizall1@gmail.com' && password === 'admin') { userRole = 'admin'; currentUser = { name: 'Bro Hamdi', email: email }; loginSuccess(true); } 
    else {
        const student = students.find(s => s.email === email && s.password === password);
        if (student) { userRole = 'student'; currentUser = student; loginSuccess(true); } else { loginError.classList.remove('hidden'); }
    }
});

function loginSuccess(saveSession = true) {
    if (saveSession) { localStorage.setItem('hes_session_user', JSON.stringify(currentUser)); localStorage.setItem('hes_session_role', userRole); }
    loginPage.classList.add('hidden'); appPage.classList.remove('hidden');
    document.getElementById('user-avatar').innerText = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-name-display').innerText = currentUser.name;
    document.getElementById('user-role-display').innerText = userRole === 'admin' ? 'Administrator' : 'Premium Member';
    renderSidebar(); renderDashboard();
}

function handleLogout() {
    localStorage.removeItem('hes_session_user'); localStorage.removeItem('hes_session_role');
    currentUser = null; userRole = null; document.getElementById('email').value = ''; document.getElementById('password').value = '';
    loginError.classList.add('hidden'); appPage.classList.add('hidden'); loginPage.classList.remove('hidden');
}

// ==== RENDER SIDEBAR ====
function renderSidebar() {
    let menuHTML = '<div class="space-y-1.5">';
    menuHTML += `<p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 mt-2 pl-3">Main Menu</p>`;
    
    if (userRole === 'admin') {
        menuHTML += `<button onclick="renderAdminCMS()" class="w-full flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all group"><div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-layer-group"></i></div>Administrative</button>`;
    }

    menuHTML += `
        <button onclick="renderDashboard()" class="w-full flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all group"><div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-th-large"></i></div> Dashboard</button>
        <button onclick="renderReschedule()" class="w-full flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all group"><div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-calendar-alt"></i></div> Reschedule</button>
    </div>
    <div class="mt-8 mb-4"><p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-3">Learning Modules</p><div class="space-y-1">
    `;

    let maxMonthNum = 1; 
    if (userRole === 'student') { let p = materials[`profile-${currentUser.email}`]; if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth); }

    months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = userRole === 'student' && currentMonthNum > maxMonthNum;

        if (isLocked) {
            menuHTML += `<div class="px-4 py-3 flex items-center text-slate-400 font-medium text-sm cursor-not-allowed opacity-70" onclick="alert('Modul terkunci. Hubungi admin.')"><i class="fas fa-lock w-6 text-slate-300"></i> ${month.title}</div>`;
        } else {
            menuHTML += `<div><div class="px-4 py-3 flex justify-between items-center cursor-pointer rounded-xl hover:bg-slate-50 transition-colors text-slate-700 font-semibold text-sm" onclick="toggleMenu('m-${month.id}', this)"><div class="flex items-center"><i class="far fa-folder-open w-6 text-indigo-500"></i> ${month.title}</div><i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform"></i></div><div id="m-${month.id}" class="hidden pl-6 py-1 space-y-1 border-l-2 border-indigo-50 ml-5 my-1">`;
            month.weeks.forEach(week => {
                menuHTML += `<div><div class="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 cursor-pointer flex justify-between items-center" onclick="toggleMenu('w-${month.id}-${week}', this)"><span>Week ${week}</span> <i class="fas fa-angle-down text-[10px] transition-transform"></i></div><div id="w-${month.id}-${week}" class="hidden pl-3 py-1 space-y-1">`;
                [1, 2, 3].forEach(day => { menuHTML += `<div class="px-3 py-2 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-lg cursor-pointer flex items-center transition-colors" onclick="renderMateri('${month.id}', ${week}, ${day}, '${month.title}')"><span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span> Day ${day}</div>`; });
                menuHTML += `</div></div>`;
            });
            menuHTML += `<div class="px-3 py-2 mx-3 mb-2 mt-2 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg cursor-pointer flex items-center transition-colors border border-amber-200" onclick="renderExam('${month.id}', '${month.title}')"><i class="fas fa-star mr-2 text-amber-500"></i> Final Exam</div></div></div>`;
        }
    });
    menuHTML += `</div></div>`; sidebarMenu.innerHTML = menuHTML;
}

function toggleMenu(id, el) { const target = document.getElementById(id); const icon = el.querySelector('.fa-chevron-down, .fa-angle-down'); if (target.classList.contains('hidden')) { target.classList.remove('hidden'); if(icon) icon.style.transform = 'rotate(180deg)'; } else { target.classList.add('hidden'); if(icon) icon.style.transform = 'rotate(0deg)'; } }
function autoCloseSidebar() { if (window.innerWidth < 768) { sidebar.classList.add('-translate-x-full'); } }

// ==== DASHBOARD ====
function renderDashboard() {
    autoCloseSidebar();
    if (userRole === 'admin') {
        let adminGridHTML = ''; let todayAdmin = new Date(); todayAdmin.setHours(0,0,0,0);
        let pendingRescheduleCount = 0;
        for(let i=0; i<7; i++) {
            let curr = new Date(todayAdmin); curr.setDate(todayAdmin.getDate()+i); let currStr = formatDateForID(curr); let displayDay = getDisplayDate(curr);
            let bookings = [];
            students.forEach(s => {
                let p = materials[`profile-${s.email}`];
                if (isOccupied(s.email, currStr)) {
                    let isPendingMoveAway = p.pendingReschedules && p.pendingReschedules[currStr] !== undefined; let isPendingMoveHere = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
                    let statusLabel = isPendingMoveAway ? ' (Pengajuan Keluar)' : (isPendingMoveHere ? ' (Validasi Masuk)' : '');
                    let badgeClass = isPendingMoveAway ? 'bg-amber-100 text-amber-700' : (isPendingMoveHere ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700');
                    bookings.push(`<div class="flex items-center gap-2 sm:gap-3 p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100"><div class="px-2 py-1 rounded bg-white font-bold text-[10px] sm:text-xs shadow-sm border border-slate-200 text-slate-600">${p.time}</div><div class="flex-1 text-xs sm:text-sm font-semibold text-slate-800">${s.name}</div>${statusLabel ? `<div class="text-[8px] sm:text-[10px] font-bold px-2 py-1 rounded-md ${badgeClass}">${statusLabel}</div>` : ''}</div>`);
                }
                if (i === 0 && p && p.pendingReschedules) { pendingRescheduleCount += Object.keys(p.pendingReschedules).length; }
            });
            adminGridHTML += `<div class="bg-white p-5 sm:p-6 rounded-2xl border border-slate-100 shadow-sm hover-card"><h4 class="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 mb-4 flex items-center justify-between"><span>${displayDay}</span>${i===0 ? '<span class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-wider">HARI INI</span>' : ''}</h4><div class="space-y-1">${bookings.length === 0 ? `<p class="text-sm text-slate-400 italic text-center py-4">Jadwal Kosong</p>` : bookings.join('')}</div></div>`;
        }

        let alertHTML = '';
        if (pendingRescheduleCount > 0) {
            alertHTML = `<div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-5 md:p-6 rounded-2xl mb-6 md:mb-8 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm"><div class="flex items-center gap-4 mb-4 md:mb-0"><div class="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-white rounded-full flex items-center justify-center shadow-sm text-amber-500 text-lg md:text-xl"><i class="fas fa-bell"></i></div><div><h4 class="font-bold text-amber-900 text-base md:text-lg">Tinjauan Jadwal Diperlukan</h4><p class="text-amber-700 text-xs md:text-sm font-medium">Ada ${pendingRescheduleCount} permintaan jadwal baru dari murid.</p></div></div><button onclick="renderAdminCMS('overview')" class="w-full md:w-auto bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-md">Review Sekarang</button></div>`;
        }

        mainContent.innerHTML = `<div class="max-w-6xl mx-auto fade-in pb-10"><div class="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 rounded-2xl md:rounded-3xl p-6 md:p-10 text-white shadow-xl mb-6 md:mb-8 relative overflow-hidden"><h2 class="text-2xl md:text-3xl font-bold mb-2">Selamat Datang, Bro Hamdi.</h2></div>${alertHTML}<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">${adminGridHTML}</div></div>`;
        return;
    }

    let nextSesh = getStudentNextSessionInfo(currentUser.email);
    let premiumCardContent = nextSesh.expired ? `<div class="bg-red-50 border border-red-200 p-5 rounded-2xl mt-5"><p class="text-red-800 font-bold">Masa Aktif Berakhir</p></div>` : (nextSesh.error ? `<div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-5 text-sm font-medium text-slate-500 text-center">${nextSesh.error}</div>` : `<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mt-5 flex items-center justify-between group"><div><p class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Kelas Mendatang</p><p class="font-bold text-xl md:text-2xl text-slate-800 mb-1">${nextSesh.displayDate}</p><p class="text-xs md:text-sm font-semibold text-slate-500 flex items-center gap-2"><i class="far fa-clock"></i> Pukul: ${nextSesh.time}</p></div></div><p class="text-[10px] md:text-xs text-slate-400 mt-4 text-center">Akses s/d: ${nextSesh.validDateStr}</p>`);

    mainContent.innerHTML = `<div class="max-w-5xl mx-auto fade-in pb-10"><div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl md:rounded-3xl p-6 md:p-10 text-white shadow-xl mb-6 md:mb-8"><h2 class="text-2xl md:text-3xl font-bold mb-2">Selamat Datang, ${currentUser.name.split(' ')[0]}.</h2></div><div class="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm hover-card"><h3 class="text-base md:text-lg font-bold text-slate-800 flex items-center gap-3">Informasi Penjadwalan</h3>${premiumCardContent}</div></div>`;
}

// ==== MATERI & RESCHEDULE ====
function parseDriveLink(link) { if (!link) return ''; if (link.includes('drive.google.com/file/d/')) { const match = link.match(/\/d\/(.+?)\//); if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`; } return link; }

window.submitVocab = async function(btnElement, m, w, d) {
    let key = `vocab_status-${currentUser.email}-${m}-w${w}-d${d}`; materials[key] = { status: 'submitted', feedback: '' };
    const origText = btnElement.innerHTML; btnElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Mengirim...'; btnElement.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    if (error) { alert("Error: " + error.message); btnElement.innerHTML = origText; btnElement.disabled = false; } else { alert("Terkirim."); renderMateri(m, w, d, months.find(mo=>mo.id===m)?.title); }
}

function renderMateri(monthId, week, day, monthTitle) {
    autoCloseSidebar(); const email = currentUser.email;
    let linkDrive = parseDriveLink(materials[`${email}-${monthId}-w${week}-d${day}-link`] || materials[`all-${monthId}-w${week}-d${day}-link`] || '');
    let recapDrive = parseDriveLink(materials[`${email}-${monthId}-w${week}-d${day}-recap`] || materials[`all-${monthId}-w${week}-d${day}-recap`] || '');
    let vocabData = materials[`vocab-${monthId}-w${week}-d${day}`] || ''; let vocabStatus = materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none', feedback: '' };
    
    let vocabHTML = '';
    if (vocabData) {
        let wordCards = vocabData.split('\n').filter(l => l.includes('=')).map(w => `<div class="snap-center shrink-0 w-40 md:w-44 bg-white p-4 md:p-5 rounded-2xl border border-slate-100 text-center shadow-sm"><p class="font-bold text-slate-800 text-base md:text-lg mb-1">${w.split('=')[0].trim()}</p><p class="text-[10px] md:text-xs font-semibold text-indigo-500 bg-indigo-50 py-1 px-2 rounded-md inline-block">${w.split('=')[1].trim()}</p></div>`).join('');
        let actionUI = (!vocabStatus.status || vocabStatus.status === 'none') ? `<button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="mt-5 w-full md:w-auto bg-slate-900 text-white px-8 py-3 rounded-xl text-sm font-bold">Selesai Dihafal</button>` : (vocabStatus.status === 'submitted' ? `<div class="mt-5 text-sm font-bold text-amber-600 bg-amber-50 px-6 py-3 rounded-xl inline-block">Menunggu Verifikasi</div>` : `<div class="mt-5 bg-emerald-50 px-6 py-3 rounded-xl border border-emerald-200 inline-block"><p class="text-sm font-bold text-emerald-800"><i class="fas fa-check-circle"></i> Terverifikasi</p></div>`);
        vocabHTML = `<div class="mb-8 bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm"><h3 class="text-base md:text-lg font-bold text-slate-800 mb-5">Daily Vocabulary</h3><div class="flex overflow-x-auto gap-3 md:gap-4 pb-4 snap-x bg-slate-50/50 p-3 md:p-4 rounded-xl custom-scrollbar">${wordCards}</div><div class="text-center">${userRole === 'student' ? actionUI : ''}</div></div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto fade-in pb-12">
            <div class="mb-6 md:mb-8 flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><button onclick="renderDashboard()" class="w-10 h-10 shrink-0 bg-slate-50 rounded-xl"><i class="fas fa-arrow-left"></i></button><div><h2 class="text-lg md:text-xl font-bold">${monthTitle} (W${week} D${day})</h2></div></div>
            ${vocabHTML}
            <div class="grid grid-cols-1 gap-6 md:gap-10">
                <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm"><h3 class="text-base md:text-lg font-bold mb-5">Modul Presentasi</h3>${linkDrive ? `<iframe src="${linkDrive}" class="w-full h-[50vh] md:h-[70vh] rounded-xl md:rounded-2xl"></iframe>` : `<p class="text-slate-500 text-sm">Belum ada dokumen.</p>`}</div>
                <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm"><h3 class="text-base md:text-lg font-bold mb-5">Catatan Rangkuman</h3>${recapDrive ? `<iframe src="${recapDrive}" class="w-full h-[50vh] md:h-[70vh] rounded-xl md:rounded-2xl"></iframe>` : `<p class="text-slate-500 text-sm">Belum ada dokumen.</p>`}</div>
            </div>
        </div>
    `;
}

window.processReschedule = async function(newDateStr) { /* Logic tetap sama */ }
window.updateRescheduleGrid = function() { /* Logic tetap sama */ }
function renderReschedule() { /* Logic tetap sama */ }

// ==== ADMIN CMS UTAMA (DENGAN TAB & RESPONSIVE) ====
function renderAdminCMS(tab = null) {
    autoCloseSidebar(); if (userRole !== 'admin') return;
    if (tab) currentAdminTab = tab; 

    const monthOptions = months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMonthOptions = months.map(m => `<option value="${m.id.replace('m','')}">Batas: ${m.title}</option>`).join('');
    const weekOptions = [1,2,3,4].map(w => `<option value="${w}">Week ${w}</option>`).join('');
    const dayOptions = [1,2,3].map(d => `<option value="${d}">Day ${d}</option>`).join('');
    const studentOptions = students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    // MENU TABS (Scroll horizontal di mobile)
    let tabsHTML = `
        <div class="flex overflow-x-auto gap-2 md:gap-3 mb-6 md:mb-8 border-b border-slate-200 pb-2 md:pb-4 custom-scrollbar snap-x">
            <button onclick="renderAdminCMS('overview')" class="shrink-0 snap-center px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${currentAdminTab === 'overview' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}">
                <i class="fas fa-home"></i> Overview
            </button>
            <button onclick="renderAdminCMS('users')" class="shrink-0 snap-center px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${currentAdminTab === 'users' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}">
                <i class="fas fa-users"></i> Akun & Jadwal
            </button>
            <button onclick="renderAdminCMS('materials')" class="shrink-0 snap-center px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${currentAdminTab === 'materials' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}">
                <i class="fas fa-book"></i> Materi & Tugas
            </button>
            <button onclick="renderAdminCMS('exam')" class="shrink-0 snap-center px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${currentAdminTab === 'exam' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}">
                <i class="fas fa-file-signature"></i> Ujian Bulanan
            </button>
        </div>
    `;

    let contentHTML = '';

    // === TAB 1: OVERVIEW ===
    if (currentAdminTab === 'overview') {
        let pendingReschedulesHTML = '';
        students.forEach(s => {
            let p = materials[`profile-${s.email}`];
            if (p && p.pendingReschedules) {
                for (const [oldD, newD] of Object.entries(p.pendingReschedules)) {
                    pendingReschedulesHTML += `
                        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-xl mb-3">
                            <div class="mb-3 lg:mb-0 w-full">
                                <span class="font-bold text-slate-800 block md:inline text-sm">${s.name}</span>
                                <span class="text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 block md:inline-block mt-2 md:mt-0 md:ml-3">
                                    ${getDisplayDate(parseDateStr(oldD))} <i class="fas fa-arrow-right text-indigo-400 mx-1 md:mx-2"></i> ${getDisplayDate(parseDateStr(newD))}
                                </span>
                            </div>
                            <div class="flex gap-2 w-full lg:w-auto">
                                <button onclick="approveReschedule('${s.email}', '${oldD}', '${newD}')" class="flex-1 lg:flex-none bg-slate-900 text-white px-4 py-2 rounded-lg text-xs md:text-sm font-bold"><i class="fas fa-check mr-1"></i>Terima</button>
                                <button onclick="rejectReschedule('${s.email}', '${oldD}')" class="flex-1 lg:flex-none bg-white text-slate-600 border border-slate-300 px-4 py-2 rounded-lg text-xs md:text-sm font-bold"><i class="fas fa-times mr-1"></i>Tolak</button>
                            </div>
                        </div>
                    `;
                }
            }
        });
        if (!pendingReschedulesHTML) pendingReschedulesHTML = `<div class="bg-slate-50 py-6 md:py-8 rounded-xl border border-dashed border-slate-200 text-center"><p class="text-slate-400 text-xs md:text-sm font-medium">Tidak ada antrean validasi jadwal saat ini.</p></div>`;

        contentHTML = `
            <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 md:mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 shrink-0 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><i class="fas fa-bell"></i></div> Validasi Jadwal
                </h3>
                <div>${pendingReschedulesHTML}</div>
            </div>

            <div class="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center mt-6 md:mt-8">
                <div class="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl md:text-2xl mb-4 shadow-sm"><i class="fas fa-folder-plus"></i></div>
                <h3 class="text-base md:text-lg font-bold text-slate-800 mb-2">Buka Modul Bulan Baru</h3>
                <p class="text-xs md:text-sm font-medium text-slate-500 mb-5 md:mb-6">Tambahkan kerangka bulan otomatis ke sistem.</p>
                <button onclick="addNewMonth()" class="w-full max-w-xs bg-indigo-50 text-indigo-700 py-3 rounded-xl text-xs md:text-sm font-bold border border-indigo-200">Generate New Month</button>
            </div>
        `;
    } 
    // === TAB 2: AKUN & JADWAL ===
    else if (currentAdminTab === 'users') {
        let studentsRows = students.map((s, idx) => `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50">
                <td class="p-3 md:p-4 text-slate-800 text-xs md:text-sm font-medium whitespace-nowrap">${s.name}</td>
                <td class="p-3 md:p-4 text-slate-500 text-xs md:text-sm whitespace-nowrap">${s.email}</td>
                <td class="p-3 md:p-4">
                    <div class="flex items-center gap-2 bg-white border border-slate-200 px-2 md:px-3 py-1.5 rounded-lg w-max">
                        <input type="password" value="${s.password}" id="pwd-${idx}" class="bg-transparent border-none w-12 md:w-16 outline-none text-slate-600 font-mono text-[10px] md:text-xs" readonly>
                        <button onclick="togglePassword('pwd-${idx}')" class="text-slate-400 hover:text-indigo-500"><i class="fas fa-eye text-xs md:text-sm"></i></button>
                    </div>
                </td>
                <td class="p-3 md:p-4 text-center whitespace-nowrap">
                    <button onclick="editStudentPassword('${s.email}')" class="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-blue-50 text-blue-600 mx-0.5"><i class="fas fa-key text-[10px] md:text-xs"></i></button>
                    <button onclick="deleteStudentAccount('${s.email}')" class="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-red-50 text-red-600 mx-0.5"><i class="fas fa-trash-alt text-[10px] md:text-xs"></i></button>
                </td>
            </tr>
        `).join('');

        contentHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-8">
                <!-- Pendaftaran -->
                <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 flex items-center gap-3"><i class="fas fa-user-plus text-emerald-500"></i> Daftar Akun</h3>
                    <input type="text" id="new-stu-name" placeholder="Nama Lengkap" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm mb-3 outline-none">
                    <input type="email" id="new-stu-email" placeholder="Alamat Email" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm mb-3 outline-none">
                    <input type="text" id="new-stu-pass" placeholder="Password Standar" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm mb-4 md:mb-5 outline-none">
                    <button onclick="addNewStudent()" class="w-full bg-slate-900 text-white py-3 md:py-3.5 rounded-xl text-xs md:text-sm font-bold shadow-md">Daftarkan Akun</button>
                </div>
                
                <!-- Jadwal Master -->
                <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 flex items-center gap-3"><div class="w-8 h-8 shrink-0 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><i class="fas fa-user-cog"></i></div> Jadwal Master</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div><label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">Pilih Murid</label><select id="admin-sched-student" class="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${studentOptions}</select></div>
                        <div><label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">Max Modul</label><select id="admin-sched-max-month" class="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${maxMonthOptions}</select></div>
                        <div><label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">Masa Aktif</label><input type="date" id="admin-sched-date" class="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm"></div>
                        <div><label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">Jam Kelas</label>
                            <div class="flex items-center gap-1">
                                <input type="time" id="admin-sched-start" class="w-full border border-slate-200 bg-slate-50 p-2 rounded-lg text-[10px] md:text-xs"> <span>-</span>
                                <input type="time" id="admin-sched-end" class="w-full border border-slate-200 bg-slate-50 p-2 rounded-lg text-[10px] md:text-xs">
                            </div>
                        </div>
                    </div>
                    <label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-2">Hari Default</label>
                    <div class="flex flex-wrap gap-2 mb-4 md:mb-5">
                        ${['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].map(d => `<label class="flex items-center gap-1.5 bg-slate-50 px-2 md:px-3 py-1 md:py-1.5 rounded-lg border border-slate-200 text-[10px] md:text-xs font-semibold cursor-pointer"><input type="checkbox" value="${d}" class="admin-day-cb w-3 h-3 text-purple-600"> ${d.substring(0,3)}</label>`).join('')}
                    </div>
                    <button onclick="saveStudentSchedule(event)" class="w-full bg-slate-900 text-white py-3 rounded-xl text-xs md:text-sm font-bold shadow-md">Simpan Jadwal</button>
                </div>
            </div>

            <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 flex items-center gap-3"><div class="w-8 h-8 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><i class="fas fa-database"></i></div> Database Murid</h3>
                <div class="overflow-x-auto border border-slate-100 rounded-xl custom-scrollbar">
                    <table class="w-full text-left border-collapse text-sm min-w-[500px]">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                                <th class="p-3 md:p-4">Nama Lengkap</th><th class="p-3 md:p-4">Email</th><th class="p-3 md:p-4">Sandi</th><th class="p-3 md:p-4 text-center">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody>${studentsRows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }
    // === TAB 3: MATERI & TUGAS ===
    else if (currentAdminTab === 'materials') {
        contentHTML = `
            <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm mb-6 md:mb-8">
                <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 flex items-center gap-3"><div class="w-8 h-8 shrink-0 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><i class="fas fa-cloud-upload-alt"></i></div> Upload Dokumen</h3>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
                    <div class="lg:col-span-1 lg:border-r border-slate-100 lg:pr-6">
                        <label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-2">Target Akses</label>
                        <select id="admin-target-student" class="w-full border border-slate-200 bg-slate-50 py-3 px-3 md:px-4 rounded-xl text-xs md:text-sm mb-4"><option value="all">Global (Semua)</option>${studentOptions}</select>
                        <label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-2">Pilih Sesi</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select id="admin-month" class="border border-slate-200 bg-slate-50 py-2.5 px-2 rounded-lg text-xs md:text-sm">${monthOptions}</select>
                            <select id="admin-week" class="border border-slate-200 bg-slate-50 py-2.5 px-2 rounded-lg text-xs md:text-sm">${weekOptions}</select>
                            <select id="admin-day" class="border border-slate-200 bg-slate-50 py-2.5 px-2 rounded-lg text-xs md:text-sm">${dayOptions}</select>
                        </div>
                    </div>
                    <div class="lg:col-span-2 space-y-3 md:space-y-4">
                        <div><label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-1 md:mb-2">URL Presentasi</label><input type="text" id="admin-link" placeholder="Google Drive Link" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-xs md:text-sm"></div>
                        <div><label class="block text-[10px] md:text-xs font-bold text-slate-500 mb-1 md:mb-2">URL Rangkuman</label><input type="text" id="admin-recap-pdf" placeholder="Google Drive Link" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-xs md:text-sm"></div>
                        <button onclick="saveMaterialData()" class="w-full md:w-auto bg-slate-900 text-white px-8 py-3 rounded-xl text-xs md:text-sm font-bold shadow-md mt-2">Simpan Dokumen</button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 flex items-center gap-3"><div class="w-8 h-8 shrink-0 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><i class="fas fa-book"></i></div> Kosakata</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3 mb-3 md:mb-4">
                        <select id="admin-vocab-month" class="border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${monthOptions}</select>
                        <select id="admin-vocab-week" class="border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${weekOptions}</select>
                        <select id="admin-vocab-day" class="border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${dayOptions}</select>
                    </div>
                    <textarea id="admin-vocab-list" rows="4" placeholder="Format: Word = Arti" class="w-full p-3 md:p-4 border border-slate-200 bg-slate-50 rounded-xl text-xs md:text-sm mb-4 outline-none"></textarea>
                    <button onclick="saveVocabList(event)" class="w-full bg-slate-900 text-white py-3 rounded-xl text-xs md:text-sm font-bold shadow-md">Publikasi</button>
                </div>
                
                <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 flex items-center gap-3"><div class="w-8 h-8 shrink-0 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><i class="fas fa-check-double"></i></div> Hafalan</h3>
                    <select id="admin-review-student" class="w-full border border-slate-200 bg-slate-50 py-3 px-3 md:px-4 rounded-xl text-xs md:text-sm mb-3 md:mb-4">${studentOptions}</select>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-5">
                        <select id="admin-review-month" class="border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${monthOptions}</select>
                        <select id="admin-review-week" class="border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${weekOptions}</select>
                        <select id="admin-review-day" class="border border-slate-200 bg-slate-50 p-2.5 rounded-xl text-xs md:text-sm">${dayOptions}</select>
                    </div>
                    <button onclick="checkVocabStatus(this)" class="w-full bg-white border border-slate-300 py-3 rounded-xl text-xs md:text-sm font-bold hover:bg-slate-50 shadow-sm"><i class="fas fa-search mr-2"></i> Periksa</button>
                    <div id="vocab-review-result" class="mt-4"></div>
                </div>
            </div>
        `;
    }
    // === TAB 4: UJIAN BULANAN ===
    else if (currentAdminTab === 'exam') {
        contentHTML = `
            <div class="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-base md:text-lg font-bold text-slate-800 mb-5 md:mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 shrink-0 rounded-lg bg-red-100 text-red-600 flex items-center justify-center"><i class="fas fa-file-signature"></i></div> Form Builder Ujian
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-5 md:mb-6 bg-slate-50 p-4 md:p-5 rounded-xl border border-slate-100">
                    <div>
                        <label class="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Murid</label>
                        <select id="admin-exam-student" class="w-full border border-slate-200 bg-white py-2.5 md:py-3 px-3 md:px-4 rounded-xl text-xs md:text-sm outline-none">${studentOptions}</select>
                    </div>
                    <div>
                        <label class="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Bulan</label>
                        <select id="admin-exam-month" class="w-full border border-slate-200 bg-white py-2.5 md:py-3 px-3 md:px-4 rounded-xl text-xs md:text-sm outline-none">${monthOptions}</select>
                    </div>
                    <div class="sm:col-span-2 mt-1 md:mt-2">
                        <button onclick="loadAdminExamData()" class="w-full bg-slate-800 text-white px-6 py-3 rounded-xl text-xs md:text-sm font-bold shadow-md hover:bg-slate-700 transition">Muat / Buat Soal</button>
                    </div>
                </div>
                
                <!-- Workspace Pembuat Soal -->
                <div id="admin-exam-workspace" class="hidden border border-slate-200 rounded-2xl overflow-hidden">
                    <div class="flex overflow-x-auto border-b border-slate-200 bg-slate-50 custom-scrollbar">
                        <button onclick="switchExamTab('listening')" id="tab-listening" class="shrink-0 px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-b-2 border-transparent text-slate-500">Listening</button>
                        <button onclick="switchExamTab('speaking')" id="tab-speaking" class="shrink-0 px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-b-2 border-transparent text-slate-500">Speaking</button>
                        <button onclick="switchExamTab('reading')" id="tab-reading" class="shrink-0 px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-b-2 border-transparent text-slate-500">Reading</button>
                        <button onclick="switchExamTab('writing')" id="tab-writing" class="shrink-0 px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-b-2 border-transparent text-slate-500">Writing</button>
                    </div>
                    
                    <div class="p-4 md:p-6 bg-slate-50/50">
                        <div id="admin-exam-questions-container" class="space-y-4 md:space-y-6 mb-4 md:mb-6"></div>
                        <div class="flex flex-col sm:flex-row gap-3 md:gap-4">
                            <button onclick="addExamQuestion('mcq')" class="flex-1 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs md:text-sm font-bold shadow-sm"><i class="fas fa-plus-circle text-blue-500 mr-2"></i> Pilihan Ganda</button>
                            <button onclick="addExamQuestion('essay')" class="flex-1 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs md:text-sm font-bold shadow-sm"><i class="fas fa-align-left text-emerald-500 mr-2"></i> Essay</button>
                        </div>
                    </div>
                    
                    <div class="p-4 bg-white border-t border-slate-200">
                        <button onclick="saveAdminExamData(event)" class="w-full bg-slate-900 text-white py-3.5 rounded-xl text-xs md:text-sm font-bold shadow-md">Simpan Seluruh Ujian (4 Kategori)</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Render Master Layout
    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto fade-in pb-16">
            <div class="mb-3 md:mb-5">
                <h2 class="text-xl md:text-3xl font-bold text-slate-800 mb-1 md:mb-2">Administrative Control</h2>
                <p class="text-slate-500 font-medium text-xs md:text-sm mb-4 md:mb-6">Pusat kontrol penjadwalan, akun, dan kurikulum.</p>
            </div>
            ${tabsHTML}
            <div class="fade-in space-y-6 md:space-y-8">${contentHTML}</div>
        </div>
    `;

    if (currentAdminTab === 'exam' && adminExamState.student !== '') {
        document.getElementById('admin-exam-student').value = adminExamState.student;
        document.getElementById('admin-exam-month').value = adminExamState.month;
        if (adminExamState.data) { document.getElementById('admin-exam-workspace').classList.remove('hidden'); switchExamTab(adminExamState.activeTab); }
    }
}

// ==== FUNGSI DATABASE KHUSUS ADMIN (Singkat) ====
window.approveReschedule = async function(email, oldDate, newDate) { let p = materials[`profile-${email}`]; if(!p.reschedules) p.reschedules = {}; p.reschedules[oldDate] = newDate; delete p.pendingReschedules[oldDate]; document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default'; if (error) alert(error.message); else renderAdminCMS(); }
window.rejectReschedule = async function(email, oldDate) { if(confirm("Tolak pengajuan?")) { let p = materials[`profile-${email}`]; delete p.pendingReschedules[oldDate]; document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default'; if (error) alert(error.message); else renderAdminCMS(); } }
window.saveVocabList = async function(e) { const m = document.getElementById('admin-vocab-month').value; const w = document.getElementById('admin-vocab-week').value; const d = document.getElementById('admin-vocab-day').value; materials[`vocab-${m}-w${w}-d${d}`] = document.getElementById('admin-vocab-list').value; const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = 'Memproses...'; btn.disabled = true; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); btn.innerHTML = origText; btn.disabled = false; if (error) alert(error.message); else { alert("Tersimpan."); document.getElementById('admin-vocab-list').value = ''; } }
window.checkVocabStatus = async function(btnElement) { let resDiv = document.getElementById('vocab-review-result'); let origText = ''; if(btnElement) { origText = btnElement.innerHTML; btnElement.innerHTML = 'Cek Server...'; btnElement.disabled = true; } try { const { data } = await window.supabaseClient.from('app_data').select('*'); if (data) { const matData = data.find(d => d.key === 'hes_materials'); if (matData && matData.value) materials = matData.value; } } catch(e) {} if(btnElement) { btnElement.innerHTML = origText; btnElement.disabled = false; } const email = document.getElementById('admin-review-student').value; const m = document.getElementById('admin-review-month').value; const w = document.getElementById('admin-review-week').value; const d = document.getElementById('admin-review-day').value; let statusObj = materials[`vocab_status-${email}-${m}-w${w}-d${d}`]; if (!statusObj || statusObj.status === 'none') { resDiv.innerHTML = `<div class="bg-slate-50 p-4 rounded-xl text-xs text-center">Belum ada tugas.</div>`; } else if (statusObj.status === 'submitted') { resDiv.innerHTML = `<div class="bg-amber-50 p-4 rounded-xl mt-4"><p class="text-xs font-bold text-amber-800 mb-2">Siap verifikasi.</p><input type="text" id="admin-feedback" placeholder="Catatan positif..." class="w-full p-2 rounded-lg text-xs mb-2"><button onclick="approveVocab('${email}', '${m}', '${w}', '${d}')" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold w-full md:w-auto">Verifikasi</button></div>`; } else if (statusObj.status === 'approved') { resDiv.innerHTML = `<div class="bg-emerald-50 p-3 rounded-xl text-xs font-bold text-emerald-700 text-center mt-3">Telah diverifikasi.</div>`; } }
window.approveVocab = async function(email, m, w, d) { let feedback = document.getElementById('admin-feedback').value || 'Good Job!'; materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status: 'approved', feedback: feedback }; document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default'; if (!error) { alert("Sukses"); checkVocabStatus(); } }
window.togglePassword = function(id) { const input = document.getElementById(id); input.type = input.type === 'password' ? 'text' : 'password'; }
window.editStudentPassword = async function(email) { const i = students.findIndex(s => s.email === email); if(i === -1) return; const np = prompt(`Password baru untuk ${students[i].name}:`, students[i].password); if(np && np.trim() !== '') { students[i].password = np.trim(); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]); if (!error) renderAdminCMS(); } }
window.deleteStudentAccount = async function(email) { if(confirm(`Hapus permanen akun ${email}?`)) { students = students.filter(s => s.email !== email); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]); if (!error) renderAdminCMS(); } }
window.saveStudentSchedule = async function(e) { const email = document.getElementById('admin-sched-student').value; let profile = materials[`profile-${email}`] || {}; profile.validUntil = document.getElementById('admin-sched-date').value || profile.validUntil || 'Belum diatur'; const sT = document.getElementById('admin-sched-start').value; const eT = document.getElementById('admin-sched-end').value; if (sT && eT) profile.time = `${sT} - ${eT}`; profile.maxMonth = document.getElementById('admin-sched-max-month').value || profile.maxMonth || 1; const selDays = Array.from(document.querySelectorAll('.admin-day-cb:checked')).map(cb => cb.value); if(selDays.length > 0) profile.days = selDays; materials[`profile-${email}`] = profile; const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = 'Sinkronisasi...'; btn.disabled = true; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); btn.innerHTML = origText; btn.disabled = false; if (!error) alert("Tersimpan."); }
window.addNewMonth = async function() { const nextNum = months.length + 1; months.push({ id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] }); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_months', value: months }]); if (!error) { alert(`Month ${nextNum} sukses.`); renderSidebar(); renderAdminCMS(); } else months.pop(); };
window.addNewStudent = async function() { const name = document.getElementById('new-stu-name').value; const email = document.getElementById('new-stu-email').value; const pass = document.getElementById('new-stu-pass').value; if(!name || !email || !pass) return alert("Lengkapi data"); students.push({ name: name, email: email, password: pass }); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]); if (!error) { alert("Sukses."); renderAdminCMS(); } else students.pop(); }
window.saveMaterialData = async function() { const ts = document.getElementById('admin-target-student').value; const m = document.getElementById('admin-month').value; const w = document.getElementById('admin-week').value; const d = document.getElementById('admin-day').value; const link = document.getElementById('admin-link').value; const recap = document.getElementById('admin-recap-pdf').value; const keyPref = `${ts}-${m}-w${w}-d${d}`; if(link) materials[`${keyPref}-link`] = link; if(recap) materials[`${keyPref}-recap`] = recap; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); if (!error) { alert("Tersimpan."); document.getElementById('admin-link').value = ''; document.getElementById('admin-recap-pdf').value = ''; } };

// ==== EXAM BUILDER (ADMIN) ====
window.loadAdminExamData = function() {
    adminExamState.student = document.getElementById('admin-exam-student').value;
    adminExamState.month = document.getElementById('admin-exam-month').value;
    const key = `exam-${adminExamState.student}-${adminExamState.month}`;
    adminExamState.data = materials[key] || { listening: [], speaking: [], reading: [], writing: [] };
    document.getElementById('admin-exam-workspace').classList.remove('hidden');
    switchExamTab('listening');
}
window.switchExamTab = function(tabName) {
    adminExamState.activeTab = tabName;
    ['listening', 'speaking', 'reading', 'writing'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if(t === tabName) { btn.classList.add('border-blue-500', 'text-blue-600'); btn.classList.remove('border-transparent', 'text-slate-500'); }
        else { btn.classList.remove('border-blue-500', 'text-blue-600'); btn.classList.add('border-transparent', 'text-slate-500'); }
    });
    renderExamQuestions();
}
window.addExamQuestion = function(type) {
    adminExamState.data[adminExamState.activeTab].push({ id: Date.now().toString(), type: type, question: '', options: type === 'mcq' ? ['','','',''] : [], answer: type === 'mcq' ? 0 : '', explanation: '' });
    renderExamQuestions();
}
window.removeExamQuestion = function(index) { if(confirm("Hapus soal ini?")) { adminExamState.data[adminExamState.activeTab].splice(index, 1); renderExamQuestions(); } }
window.updateExamField = function(index, field, value, optIndex = null) {
    let q = adminExamState.data[adminExamState.activeTab][index];
    if (optIndex !== null) q.options[optIndex] = value; else q[field] = value;
}
window.renderExamQuestions = function() {
    const container = document.getElementById('admin-exam-questions-container');
    const questions = adminExamState.data[adminExamState.activeTab];
    if(questions.length === 0) { container.innerHTML = `<div class="text-center py-8 bg-white rounded-xl border border-dashed border-slate-300"><p class="text-slate-400 font-medium text-xs md:text-sm">Belum ada soal untuk sesi ini.</p></div>`; return; }

    container.innerHTML = questions.map((q, idx) => {
        let isMCQ = q.type === 'mcq'; let bodyHTML = '';
        if (isMCQ) {
            let optionsHTML = ['A', 'B', 'C', 'D'].map((lbl, oIdx) => `
                <div class="flex items-center gap-2 md:gap-3 mb-2">
                    <input type="radio" name="correct_${adminExamState.activeTab}_${idx}" value="${oIdx}" ${q.answer == oIdx ? 'checked' : ''} onchange="updateExamField(${idx}, 'answer', ${oIdx})" class="w-4 h-4 text-blue-600 shrink-0">
                    <span class="font-bold text-xs md:text-sm text-slate-500 w-3 md:w-4 shrink-0">${lbl}.</span>
                    <input type="text" value="${q.options[oIdx]}" onchange="updateExamField(${idx}, 'options', this.value, ${oIdx})" placeholder="Opsi ${lbl}" class="flex-1 min-w-0 p-2 md:p-2.5 border border-slate-200 rounded-lg text-xs md:text-sm outline-none bg-white">
                </div>
            `).join('');
            bodyHTML = `<div class="mt-3 md:mt-4 p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-200"><p class="text-[10px] md:text-xs font-bold text-slate-500 mb-2 md:mb-3 uppercase">Opsi Jawaban (Pilih Kunci yang Benar)</p>${optionsHTML}</div>`;
        } else {
            bodyHTML = `<div class="mt-3 md:mt-4 p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-200"><p class="text-[10px] md:text-xs font-bold text-slate-500 mb-2 uppercase">Kunci Jawaban / Penilaian</p><textarea onchange="updateExamField(${idx}, 'answer', this.value)" rows="2" class="w-full p-2.5 md:p-3 border border-slate-200 rounded-lg text-xs md:text-sm outline-none bg-white">${q.answer}</textarea></div>`;
        }
        return `
            <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm relative">
                <div class="absolute top-3 right-3 md:top-4 md:right-4 flex gap-1 md:gap-2"><span class="bg-slate-100 text-slate-500 text-[8px] md:text-[10px] font-bold px-1.5 py-1 rounded uppercase">${isMCQ ? 'Pilihan Ganda' : 'Essay'}</span><button onclick="removeExamQuestion(${idx})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt text-xs md:text-sm"></i></button></div>
                <h4 class="font-bold text-sm md:text-base text-slate-700 mb-2 md:mb-3">Soal ${idx + 1}</h4>
                <textarea onchange="updateExamField(${idx}, 'question', this.value)" rows="3" class="w-full p-2.5 md:p-3 border border-slate-200 rounded-xl text-xs md:text-sm outline-none bg-slate-50" placeholder="Tulis pertanyaan...">${q.question}</textarea>
                ${bodyHTML}
                <div class="mt-3 md:mt-4"><p class="text-[10px] md:text-xs font-bold text-slate-500 mb-2 uppercase"><i class="fas fa-lightbulb text-amber-500 mr-1"></i> Penjelasan</p><textarea onchange="updateExamField(${idx}, 'explanation', this.value)" rows="2" class="w-full p-2.5 md:p-3 border border-slate-200 rounded-xl text-xs md:text-sm outline-none bg-white">${q.explanation}</textarea></div>
            </div>
        `;
    }).join('');
}
window.saveAdminExamData = async function(e) {
    const key = `exam-${adminExamState.student}-${adminExamState.month}`; materials[key] = adminExamState.data;
    const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = 'Menyimpan...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    btn.innerHTML = origText; btn.disabled = false;
    if (error) alert("Error: " + error.message); else alert("Ujian tersimpan!");
}

// ==== PENGERJAAN UJIAN (MURID) ====
let studentExamAnswers = {};
window.renderExam = function(monthId, monthTitle) {
    autoCloseSidebar(); const email = currentUser.email; 
    const examKey = `exam-${email}-${monthId}`; const resultKey = `exam_result-${email}-${monthId}`;
    const examData = materials[examKey]; const examResult = materials[resultKey]; 
    
    if (!examData) {
        mainContent.innerHTML = `<div class="max-w-4xl mx-auto fade-in pb-12"><div class="mb-6 md:mb-8 flex items-center gap-4 md:gap-5 bg-white p-4 rounded-2xl border border-slate-100"><button onclick="renderDashboard()" class="w-10 h-10 shrink-0 bg-slate-50 rounded-xl"><i class="fas fa-arrow-left"></i></button><h2 class="text-lg md:text-xl font-bold">Final Exam: ${monthTitle}</h2></div><div class="bg-slate-50 p-10 md:p-16 rounded-3xl border-2 border-dashed border-slate-200 text-center"><p class="text-slate-500 font-bold text-sm md:text-base">Ujian belum tersedia</p></div></div>`;
        return;
    }

    if (examResult) {
        let resultHTML = '';
        ['listening', 'speaking', 'reading', 'writing'].forEach(cat => {
            if(examData[cat].length === 0) return;
            resultHTML += `<h3 class="text-base md:text-lg font-bold text-slate-800 mt-6 md:mt-8 mb-3 md:mb-4 capitalize border-b pb-2">${cat}</h3>`;
            examData[cat].forEach((q, idx) => {
                let sAns = examResult.answers[`${cat}_${idx}`] !== undefined ? examResult.answers[`${cat}_${idx}`] : '';
                let isMCQ = q.type === 'mcq'; let isCorrect = isMCQ ? (sAns == q.answer) : true;
                let sAnsText = isMCQ && sAns !== '' ? q.options[sAns] : (sAns || 'Tidak dijawab');
                let cAnsText = isMCQ ? q.options[q.answer] : q.answer;

                resultHTML += `
                    <div class="bg-white p-4 md:p-6 rounded-2xl border ${isMCQ ? (isCorrect ? 'border-emerald-200' : 'border-red-200') : 'border-slate-200'} shadow-sm mb-4">
                        <p class="font-bold text-sm md:text-base text-slate-700 mb-3 md:mb-4">${idx + 1}. ${q.question.replace(/\n/g, '<br>')}</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
                            <div class="bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-100"><p class="text-[9px] md:text-[10px] font-bold uppercase text-slate-400 mb-1">Jawaban Anda</p><p class="text-xs md:text-sm font-semibold ${isMCQ ? (isCorrect ? 'text-emerald-600' : 'text-red-600') : 'text-slate-700'}">${sAnsText}</p></div>
                            <div class="bg-blue-50 p-3 md:p-4 rounded-xl border border-blue-100"><p class="text-[9px] md:text-[10px] font-bold uppercase text-blue-400 mb-1">Kunci Jawaban</p><p class="text-xs md:text-sm font-semibold text-blue-800">${cAnsText || 'Menunggu penilaian'}</p></div>
                        </div>
                        ${q.explanation ? `<div class="bg-amber-50 p-3 md:p-4 rounded-xl border border-amber-100"><p class="text-[9px] md:text-[10px] font-bold uppercase text-amber-500 mb-1">Pembahasan</p><p class="text-xs md:text-sm text-amber-900">${q.explanation}</p></div>` : ''}
                    </div>
                `;
            });
        });

        mainContent.innerHTML = `<div class="max-w-5xl mx-auto fade-in pb-12"><div class="mb-6 md:mb-8 bg-white p-5 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm text-center"><h2 class="text-xl md:text-2xl font-bold text-slate-800 mb-2">Hasil Ujian: ${monthTitle}</h2><div class="inline-block bg-emerald-100 text-emerald-800 px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-base md:text-xl mt-2">Skor PG: ${examResult.mcqScore} / 100</div><p class="text-[10px] md:text-xs text-slate-400 mt-3">*Skor essay dinilai manual oleh admin.</p></div>${resultHTML}<button onclick="renderDashboard()" class="mt-5 w-full bg-slate-900 text-white py-3.5 md:py-4 rounded-xl text-sm font-bold shadow-lg">Kembali ke Dashboard</button></div>`;
        return;
    }

    studentExamAnswers = {}; let formHTML = '';
    ['listening', 'speaking', 'reading', 'writing'].forEach(cat => {
        if(examData[cat].length === 0) return;
        formHTML += `<div class="mb-8 md:mb-10"><h3 class="text-lg md:text-xl font-bold text-indigo-900 mb-4 md:mb-6 capitalize flex items-center gap-2 md:gap-3"><span class="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs md:text-sm"><i class="fas fa-layer-group"></i></span> ${cat} Section</h3>`;
        examData[cat].forEach((q, idx) => {
            let isMCQ = q.type === 'mcq'; let inputsHTML = '';
            if (isMCQ) {
                inputsHTML = ['A','B','C','D'].map((lbl, oIdx) => `<label class="flex items-start md:items-center gap-2 md:gap-3 p-2.5 md:p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition mb-2"><input type="radio" name="ans_${cat}_${idx}" value="${oIdx}" onchange="recordAnswer('${cat}', ${idx}, ${oIdx})" class="w-3.5 h-3.5 md:w-4 md:h-4 mt-0.5 md:mt-0 text-indigo-600 shrink-0"><span class="text-xs md:text-sm font-medium text-slate-700 leading-tight">${lbl}. ${q.options[oIdx]}</span></label>`).join('');
            } else { inputsHTML = `<textarea onchange="recordAnswer('${cat}', ${idx}, this.value)" rows="4" class="w-full p-3 md:p-4 border border-slate-200 rounded-xl text-xs md:text-sm outline-none bg-slate-50"></textarea>`; }
            formHTML += `<div class="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm mb-5 md:mb-6"><p class="font-bold text-slate-800 mb-4 text-sm md:text-base">${idx + 1}. ${q.question.replace(/\n/g, '<br>')}</p>${inputsHTML}</div>`;
        });
        formHTML += `</div>`;
    });

    mainContent.innerHTML = `<div class="max-w-4xl mx-auto fade-in pb-20"><div class="mb-6 md:mb-8 flex items-center gap-3 md:gap-5 bg-white p-3 md:p-4 rounded-2xl border border-slate-100 shadow-sm sticky top-0 z-10"><button onclick="renderDashboard()" class="w-9 h-9 md:w-10 md:h-10 shrink-0 bg-slate-50 rounded-xl text-slate-600 hover:bg-slate-100"><i class="fas fa-arrow-left"></i></button><div><h2 class="text-base md:text-xl font-bold text-slate-800">Final Exam: ${monthTitle}</h2><p class="text-[9px] md:text-xs font-bold text-amber-500 uppercase mt-0.5 md:mt-1">Kerjakan dengan jujur</p></div></div>${formHTML}<div class="bg-gradient-to-r from-slate-900 to-indigo-900 p-6 md:p-8 rounded-2xl md:rounded-3xl text-center shadow-lg"><p class="text-xs md:text-sm font-medium text-indigo-100 mb-4 md:mb-6">Pastikan semua soal terjawab.</p><button onclick="submitStudentExam('${monthId}')" class="px-6 md:px-10 py-3.5 md:py-4 bg-emerald-500 text-white rounded-xl text-sm md:text-lg font-bold w-full md:w-auto hover:bg-emerald-600 transition">Submit Ujian</button></div></div>`;
};
window.recordAnswer = function(category, qIndex, value) { studentExamAnswers[`${category}_${qIndex}`] = value; }
window.submitStudentExam = async function(monthId) {
    if(!confirm("Kirim jawaban sekarang? Pastikan sudah terisi.")) return;
    const email = currentUser.email; const examKey = `exam-${email}-${monthId}`; const resultKey = `exam_result-${email}-${monthId}`; const examData = materials[examKey];
    let totalMCQ = 0; let correctMCQ = 0;
    ['listening', 'speaking', 'reading', 'writing'].forEach(cat => {
        examData[cat].forEach((q, idx) => { if(q.type === 'mcq') { totalMCQ++; let sAns = studentExamAnswers[`${cat}_${idx}`]; if(sAns !== undefined && sAns == q.answer) correctMCQ++; } });
    });
    let mcqScore = totalMCQ > 0 ? Math.round((correctMCQ / totalMCQ) * 100) : 0;
    materials[resultKey] = { status: 'submitted', answers: studentExamAnswers, mcqScore: mcqScore, submittedAt: new Date().toISOString() };
    document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default';
    if (error) alert("Error: " + error.message); else { alert("Ujian disubmit!"); sendTelegramNotification(`📝 Ujian Disubmit\n\nMurid: ${currentUser.name}\nSkor PG: ${mcqScore}/100`); renderExam(monthId, months.find(m => m.id === monthId).title); }
}