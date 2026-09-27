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
        if (isOccupied(email, currStr)) return { dateStr: currStr, displayDate: getDisplayDate(curr), time: p.time, validDateStr: isValid ? getDisplayDate(validDate) : 'Belum diatur' };
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
    menuHTML += `<p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2 pl-3">Navigasi Utama</p>`;
    
    if (userRole === 'admin') {
        menuHTML += `<button onclick="renderAdminCMS()" class="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors group"><div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-layer-group text-xs"></i></div>Administrative</button>`;
    }

    menuHTML += `
        <button onclick="renderDashboard()" class="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors group"><div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-home text-xs"></i></div> Dashboard</button>
        <button onclick="renderReschedule()" class="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors group"><div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-calendar-alt text-xs"></i></div> Reschedule</button>
    </div>
    <div class="mt-6 mb-4"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-3">Modul Pembelajaran</p><div class="space-y-1">
    `;

    let maxMonthNum = 1; 
    if (userRole === 'student') { let p = materials[`profile-${currentUser.email}`]; if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth); }

    months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = userRole === 'student' && currentMonthNum > maxMonthNum;

        if (isLocked) {
            menuHTML += `<div class="px-3 py-2.5 flex items-center text-slate-400 font-medium text-sm cursor-not-allowed opacity-60 rounded-xl" onclick="alert('Modul terkunci. Hubungi admin.')"><i class="fas fa-lock w-6 text-slate-300 text-xs"></i> ${month.title}</div>`;
        } else {
            menuHTML += `<div><div class="px-3 py-2.5 flex justify-between items-center cursor-pointer rounded-xl hover:bg-slate-50 transition-colors text-slate-700 font-semibold text-sm" onclick="toggleMenu('m-${month.id}', this)"><div class="flex items-center"><i class="far fa-folder-open w-6 text-indigo-500 text-xs"></i> ${month.title}</div><i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform"></i></div><div id="m-${month.id}" class="hidden pl-5 py-1 space-y-1 border-l-2 border-slate-100 ml-4 my-1">`;
            month.weeks.forEach(week => {
                menuHTML += `<div><div class="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 cursor-pointer flex justify-between items-center rounded-lg hover:bg-slate-50" onclick="toggleMenu('w-${month.id}-${week}', this)"><span>Week ${week}</span> <i class="fas fa-angle-down text-[10px] transition-transform"></i></div><div id="w-${month.id}-${week}" class="hidden pl-2 py-1 space-y-1">`;
                [1, 2, 3].forEach(day => { menuHTML += `<div class="px-3 py-2 text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer flex items-center transition-colors" onclick="renderMateri('${month.id}', ${week}, ${day}, '${month.title}')"><span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span> Day ${day}</div>`; });
                menuHTML += `</div></div>`;
            });
            menuHTML += `<div class="px-3 py-2 mx-2 mb-2 mt-2 text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg cursor-pointer flex items-center transition-colors border border-amber-100" onclick="renderExam('${month.id}', '${month.title}')"><i class="fas fa-star mr-2 text-amber-500"></i> Final Exam</div></div></div>`;
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
                    bookings.push(`<div class="flex items-center gap-2 md:gap-3 p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100"><div class="px-2 py-1 rounded bg-white font-bold text-[10px] md:text-xs shadow-sm border border-slate-200 text-slate-600">${p.time}</div><div class="flex-1 text-xs md:text-sm font-semibold text-slate-800">${s.name}</div>${statusLabel ? `<div class="text-[8px] md:text-[10px] font-bold px-2 py-1 rounded-md ${badgeClass}">${statusLabel}</div>` : ''}</div>`);
                }
                if (i === 0 && p && p.pendingReschedules) { pendingRescheduleCount += Object.keys(p.pendingReschedules).length; }
            });
            adminGridHTML += `<div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm hover-card"><h4 class="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 mb-4 flex items-center justify-between"><span>${displayDay}</span>${i===0 ? '<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 uppercase font-bold tracking-wider">HARI INI</span>' : ''}</h4><div class="space-y-2">${bookings.length === 0 ? `<p class="text-sm text-slate-400 italic text-center py-4">Jadwal Kosong</p>` : bookings.join('')}</div></div>`;
        }

        let alertHTML = '';
        if (pendingRescheduleCount > 0) {
            alertHTML = `<div class="bg-amber-50 border border-amber-200 p-5 md:p-6 rounded-2xl mb-6 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm"><div class="flex items-center gap-4 mb-4 md:mb-0"><div class="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-white rounded-full flex items-center justify-center shadow-sm text-amber-500 text-lg"><i class="fas fa-bell"></i></div><div><h4 class="font-bold text-amber-900 text-base">Tinjauan Jadwal Diperlukan</h4><p class="text-amber-700 text-xs md:text-sm font-medium mt-0.5">Ada ${pendingRescheduleCount} permintaan jadwal baru dari murid.</p></div></div><button onclick="renderAdminCMS('overview')" class="w-full md:w-auto bg-amber-500 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-sm text-sm">Review Sekarang</button></div>`;
        }

        mainContent.innerHTML = `<div class="max-w-6xl mx-auto fade-in pb-10"><div class="bg-indigo-600 rounded-2xl p-6 md:p-10 text-white shadow-md mb-6 relative overflow-hidden"><div class="absolute right-0 top-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div><h2 class="text-2xl md:text-3xl font-bold mb-1 relative z-10">Administrator Workspace</h2><p class="text-indigo-100 text-sm relative z-10">Selamat datang kembali, Bro Hamdi.</p></div>${alertHTML}<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">${adminGridHTML}</div></div>`;
        return;
    }

    let nextSesh = getStudentNextSessionInfo(currentUser.email);
    let premiumCardContent = nextSesh.expired ? `<div class="bg-red-50 border border-red-200 p-5 rounded-2xl mt-4"><p class="text-red-800 font-bold text-sm">Masa Aktif Berakhir</p></div>` : (nextSesh.error ? `<div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-4 text-sm font-medium text-slate-500 text-center">${nextSesh.error}</div>` : `<div class="bg-slate-50 p-5 rounded-2xl border border-slate-100 mt-4 flex items-center justify-between"><div class="flex items-center gap-4"><div class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-indigo-600 text-xl"><i class="far fa-calendar-check"></i></div><div><p class="font-bold text-lg text-slate-800 leading-tight">${nextSesh.displayDate}</p><p class="text-xs md:text-sm font-medium text-slate-500 mt-0.5"><i class="far fa-clock mr-1"></i> ${nextSesh.time}</p></div></div></div><p class="text-[10px] font-semibold text-slate-400 mt-3 uppercase tracking-wider text-center">Berlaku s/d: ${nextSesh.validDateStr}</p>`);

    mainContent.innerHTML = `<div class="max-w-5xl mx-auto fade-in pb-10"><div class="bg-indigo-600 rounded-2xl p-6 md:p-10 text-white shadow-md mb-6 relative overflow-hidden"><div class="absolute right-0 top-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div><h2 class="text-2xl md:text-3xl font-bold mb-1 relative z-10">Welcome, ${currentUser.name.split(' ')[0]}.</h2><p class="text-indigo-100 text-sm relative z-10">Lanjutkan perjalanan belajarmu hari ini.</p></div><div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover-card"><h3 class="text-base font-bold text-slate-800">Informasi Jadwal Kelas</h3>${premiumCardContent}</div></div>`;
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
        let wordCards = vocabData.split('\n').filter(l => l.includes('=')).map(w => `<div class="snap-center shrink-0 w-36 md:w-44 bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm"><p class="font-bold text-slate-800 text-sm md:text-base mb-1">${w.split('=')[0].trim()}</p><p class="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 py-1 px-2 rounded-md inline-block">${w.split('=')[1].trim()}</p></div>`).join('');
        let actionUI = (!vocabStatus.status || vocabStatus.status === 'none') ? `<button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="mt-4 w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all">Tandai Selesai Dihafal</button>` : (vocabStatus.status === 'submitted' ? `<div class="mt-4 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-4 py-2.5 rounded-xl inline-block">Menunggu Verifikasi Admin</div>` : `<div class="mt-4 bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-200 inline-block"><p class="text-xs font-bold text-emerald-700"><i class="fas fa-check-circle mr-1"></i> Terverifikasi</p></div>`);
        vocabHTML = `<div class="mb-6 bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm"><h3 class="text-sm md:text-base font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-spell-check text-indigo-500 mr-2"></i> Daily Vocabulary</h3><div class="flex overflow-x-auto gap-3 pb-4 snap-x bg-slate-50/80 p-3 rounded-xl border border-slate-100 custom-scrollbar">${wordCards}</div><div class="text-center">${userRole === 'student' ? actionUI : ''}</div></div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-12">
            <div class="mb-6 flex items-center gap-3 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 shadow-sm"><button onclick="renderDashboard()" class="w-9 h-9 md:w-10 md:h-10 shrink-0 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition"><i class="fas fa-arrow-left text-slate-500"></i></button><div><h2 class="text-base md:text-lg font-bold text-slate-800">${monthTitle} <span class="text-slate-400 font-medium text-sm">| W${week} D${day}</span></h2></div></div>
            ${vocabHTML}
            <div class="grid grid-cols-1 gap-6">
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm"><h3 class="text-sm font-bold text-slate-800 mb-4"><i class="fas fa-file-pdf text-red-500 mr-2"></i> Modul Presentasi</h3>${linkDrive ? `<iframe src="${linkDrive}" class="w-full h-[50vh] md:h-[70vh] rounded-xl border border-slate-100 bg-slate-50"></iframe>` : `<div class="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200"><p class="text-slate-400 text-sm font-medium">Belum ada dokumen.</p></div>`}</div>
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm"><h3 class="text-sm font-bold text-slate-800 mb-4"><i class="fas fa-clipboard-check text-emerald-500 mr-2"></i> Catatan Rangkuman</h3>${recapDrive ? `<iframe src="${recapDrive}" class="w-full h-[50vh] md:h-[70vh] rounded-xl border border-slate-100 bg-slate-50"></iframe>` : `<div class="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200"><p class="text-slate-400 text-sm font-medium">Belum ada dokumen.</p></div>`}</div>
            </div>
        </div>
    `;
}

// ==== RESCHEDULE (DIPERBAIKI & RESPONSIVE UI) ====

window.processReschedule = async function(newDateStr) {
    let oldDateStr = document.getElementById('reschedule-old-day').value;
    if (!oldDateStr) { alert('Silakan pilih jadwal awal pada dropdown.'); return; }
    let oldDisplay = getDisplayDate(parseDateStr(oldDateStr)); let newDisplay = getDisplayDate(parseDateStr(newDateStr));

    if (confirm(`Konfirmasi Pengajuan Pindah Jadwal:\n\nDari : ${oldDisplay}\nKe    : ${newDisplay}\n\nLanjutkan proses?`)) {
        let p = materials[`profile-${currentUser.email}`]; if(!p.pendingReschedules) p.pendingReschedules = {};
        p.pendingReschedules[oldDateStr] = newDateStr;
        
        document.body.style.cursor = 'wait';
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
        document.body.style.cursor = 'default';
        
        if (error) { alert("Gagal memproses: " + error.message); delete p.pendingReschedules[oldDateStr]; } 
        else {
            alert("Permintaan berhasil dikirim. Menunggu konfirmasi admin.");
            sendTelegramNotification(`📅 Permintaan Reschedule\n\nMurid: ${currentUser.name}\nAsal: ${oldDisplay}\nBaru: ${newDisplay}`);
            renderReschedule();
        }
    }
}

window.updateRescheduleGrid = function() {
    let oldDateStr = document.getElementById('reschedule-old-day').value; const gridContainer = document.getElementById('reschedule-grid-container');
    if (!oldDateStr) { gridContainer.innerHTML = '<div class="col-span-full py-10 text-center text-xs md:text-sm font-medium text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Silakan pilih jadwal awal untuk melihat slot tersedia.</div>'; return; }

    let selectedDate = parseDateStr(oldDateStr); let day = selectedDate.getDay(); let diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
    let startOfWeek = new Date(selectedDate); startOfWeek.setDate(diff);
    let gridHTML = ''; let p = materials[`profile-${currentUser.email}`]; let isPendingOld = p.pendingReschedules && p.pendingReschedules[oldDateStr] !== undefined;

    for(let i=0; i<7; i++) {
        let curr = new Date(startOfWeek); curr.setDate(startOfWeek.getDate()+i);
        let currStr = formatDateForID(curr); let displayDay = getDisplayDate(curr);
        let today = new Date(); today.setHours(0,0,0,0); let isPast = curr < today;

        if (isOccupied(currentUser.email, currStr)) {
            let isPendingNew = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
            if (currStr === oldDateStr) {
                 gridHTML += `<div class="p-4 md:p-5 rounded-2xl border-2 ${isPendingOld ? 'border-amber-400 bg-amber-50' : 'border-indigo-400 bg-indigo-50'} flex flex-col items-center text-center shadow-sm">
                    <div class="font-bold ${isPendingOld ? 'text-amber-800' : 'text-indigo-800'} text-[10px] md:text-xs mb-3 border-b border-indigo-200 pb-2 w-full">${displayDay}</div>
                    <i class="fas ${isPendingOld ? 'fa-hourglass-half text-amber-500 fa-spin' : 'fa-calendar-day text-indigo-500'} text-xl md:text-2xl mb-2"></i>
                    <div class="text-[9px] md:text-[10px] font-bold ${isPendingOld ? 'text-amber-600' : 'text-indigo-600'}">${isPendingOld ? 'Dalam Proses Validasi' : 'Jadwal Saat Ini'}</div>
                </div>`;
            } else if (isPendingNew) {
                gridHTML += `<div class="p-4 md:p-5 rounded-2xl border-2 border-blue-300 bg-blue-50 flex flex-col items-center text-center shadow-sm">
                    <div class="font-bold text-blue-800 text-[10px] md:text-xs mb-3 border-b border-blue-200 pb-2 w-full">${displayDay}</div>
                    <i class="fas fa-spinner fa-spin text-blue-400 text-xl md:text-2xl mb-2"></i>
                    <div class="text-[9px] md:text-[10px] font-bold text-blue-600">Menunggu Persetujuan</div>
                </div>`;
            } else {
                 gridHTML += `<div class="p-4 md:p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center text-center shadow-sm">
                    <div class="font-bold text-slate-500 text-[10px] md:text-xs mb-3 border-b border-slate-200 pb-2 w-full">${displayDay}</div>
                    <i class="fas fa-calendar-check text-slate-300 text-xl md:text-2xl mb-2"></i>
                    <div class="text-[9px] md:text-[10px] font-semibold text-slate-500">Telah Terjadwal</div>
                </div>`;
            } continue;
        }

        if (isPast) {
            gridHTML += `<div class="p-4 md:p-5 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col items-center text-center opacity-60">
                <div class="font-bold text-slate-400 text-[10px] md:text-xs mb-3 border-b border-slate-100 pb-2 w-full">${displayDay}</div>
                <div class="text-[9px] md:text-[10px] font-medium text-slate-400 py-3">Waktu Berlalu</div>
            </div>`; continue;
        }

        let clashingTime = null;
        for (let s of students) { if (s.email === currentUser.email) continue; if (isOccupied(s.email, currStr)) { let otherP = materials[`profile-${s.email}`]; if (checkOverlap(p.time, otherP.time)) { clashingTime = otherP.time; break; } } }

        if (clashingTime) {
            gridHTML += `<div class="p-4 md:p-5 rounded-2xl border border-slate-200 bg-white flex flex-col text-center shadow-sm">
                    <div class="font-bold text-slate-700 text-[10px] md:text-xs mb-3 border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center mb-3">
                        <i class="fas fa-user-lock text-slate-300 text-lg md:text-xl mb-1.5"></i>
                        <span class="text-[9px] md:text-[10px] font-semibold text-slate-500">Slot Terisi</span>
                    </div>
                    <button disabled class="w-full py-2 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-400">Unavailable</button>
                </div>`;
        } else {
            if (isPendingOld) {
                gridHTML += `<div class="p-4 md:p-5 rounded-2xl border border-slate-200 bg-white flex flex-col text-center opacity-50 shadow-sm">
                    <div class="font-bold text-slate-500 text-[10px] md:text-xs mb-3 border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="text-[9px] md:text-[10px] font-medium text-slate-400 py-3">Aksi Terkunci</div>
                </div>`;
            } else {
                gridHTML += `<div class="p-4 md:p-5 rounded-2xl border border-slate-200 bg-white flex flex-col text-center shadow-sm hover-card hover:border-indigo-300 group">
                    <div class="font-bold text-slate-700 text-[10px] md:text-xs mb-3 border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center mb-3">
                        <i class="far fa-check-circle text-emerald-400 text-xl md:text-2xl mb-1.5 group-hover:scale-110 transition-transform"></i>
                        <span class="text-[8px] md:text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-wide">Available</span>
                    </div>
                    <button onclick="processReschedule('${currStr}')" class="w-full py-2 rounded-lg text-[10px] md:text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm">
                        Pilih Slot
                    </button>
                </div>`;
            }
        }
    } gridContainer.innerHTML = gridHTML;
}

window.renderReschedule = function() {
    autoCloseSidebar();
    let p = materials[`profile-${currentUser.email}`]; let nextSeshInfo = getStudentNextSessionInfo(currentUser.email);
    let isBlocked = false; let rescheduleHeader = '';

    if (nextSeshInfo.expired) {
        rescheduleHeader = `<div class="bg-red-50 border border-red-200 p-5 rounded-2xl mb-6"><p class="text-xs md:text-sm font-semibold text-red-700"><i class="fas fa-lock mr-2"></i> Fitur dibatasi karena masa aktif telah berakhir.</p></div>`; isBlocked = true;
    } else if (nextSeshInfo.error) {
        rescheduleHeader = `<div class="bg-slate-50 border border-slate-200 p-5 rounded-2xl mb-6"><p class="text-xs md:text-sm font-semibold text-slate-600"><i class="fas fa-info-circle mr-2"></i> Penjadwalan belum diaktifkan oleh admin.</p></div>`; isBlocked = true;
    } else {
        let upcomingOptions = []; let d = new Date(); d.setHours(0,0,0,0);
        let validDate = new Date(p.validUntil); let isValid = !isNaN(validDate); if (isValid) validDate.setHours(23,59,59,999);
        let count = 1; let limitHit = false;

        for(let i=0; i<30 && upcomingOptions.length<3; i++) {
            let curr = new Date(d); curr.setDate(d.getDate()+i);
            if (isValid && curr > validDate) { limitHit = true; break; }
            let currStr = formatDateForID(curr);
            if (isOccupied(currentUser.email, currStr)) {
                let isPending = p.pendingReschedules && p.pendingReschedules[currStr];
                upcomingOptions.push(`<option value="${currStr}">Kelas ${count}: ${getDisplayDate(curr)} ${isPending?'(Proses)':''}</option>`); count++;
            }
        }
        if (limitHit && upcomingOptions.length > 0) upcomingOptions.push(`<option disabled>--- Batas Maksimal Akses ---</option>`);

        rescheduleHeader = `
            <div class="bg-white border border-slate-200 p-5 md:p-6 rounded-2xl mb-6 md:mb-8 shadow-sm">
                <h3 class="text-sm md:text-base font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-exchange-alt text-indigo-500"></i> Form Penyesuaian Jadwal</h3>
                <label class="block text-xs md:text-sm font-semibold text-slate-600 mb-2">Pilih jadwal saat ini yang akan dipindahkan:</label>
                <div class="flex flex-col md:flex-row items-center gap-3 md:gap-4">
                    <select id="reschedule-old-day" onchange="updateRescheduleGrid()" class="w-full md:w-[400px] border border-slate-200 py-2.5 px-3 md:px-4 rounded-xl text-xs md:text-sm font-medium text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 hover:bg-white transition cursor-pointer">
                        ${upcomingOptions.length > 0 ? upcomingOptions.join('') : '<option value="">Tidak ada kelas tersedia</option>'}
                    </select>
                    <div class="px-4 py-2.5 bg-indigo-50 rounded-xl border border-indigo-100 text-xs md:text-sm font-bold text-indigo-700 w-full md:w-auto text-center shrink-0"><i class="far fa-clock mr-1"></i> Jam: ${p.time}</div>
                </div>
            </div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-12">
            <div class="mb-4 md:mb-6">
                <h2 class="text-xl md:text-2xl font-bold text-slate-800 tracking-tight mb-1">Penjadwalan Ulang</h2>
                <p class="text-xs md:text-sm text-slate-500 font-medium">Atur ulang jadwal kelasmu jika berhalangan hadir.</p>
            </div>
            ${rescheduleHeader}
            ${!isBlocked ? `<div id="reschedule-grid-container" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5"></div>` : ''}
        </div>
    `;
    if (!isBlocked) window.updateRescheduleGrid();
}

// ==== ADMIN CMS UTAMA (DENGAN TAB MODERN & RESPONSIVE) ====
function renderAdminCMS(tab = null) {
    autoCloseSidebar(); if (userRole !== 'admin') return;
    if (tab) currentAdminTab = tab; 

    const monthOptions = months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMonthOptions = months.map(m => `<option value="${m.id.replace('m','')}">Batas: ${m.title}</option>`).join('');
    const weekOptions = [1,2,3,4].map(w => `<option value="${w}">Week ${w}</option>`).join('');
    const dayOptions = [1,2,3].map(d => `<option value="${d}">Day ${d}</option>`).join('');
    const studentOptions = students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    // Segmented Control Tabs style Apple
    let tabsHTML = `
        <div class="flex overflow-x-auto gap-1 mb-6 md:mb-8 bg-slate-200/50 p-1.5 rounded-xl max-w-full md:max-w-fit custom-scrollbar border border-slate-200">
            <button onclick="renderAdminCMS('overview')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentAdminTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}"><i class="fas fa-home"></i> Overview</button>
            <button onclick="renderAdminCMS('users')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentAdminTab === 'users' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}"><i class="fas fa-users"></i> Akun & Jadwal</button>
            <button onclick="renderAdminCMS('materials')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentAdminTab === 'materials' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}"><i class="fas fa-book"></i> Materi</button>
            <button onclick="renderAdminCMS('exam')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentAdminTab === 'exam' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}"><i class="fas fa-file-signature"></i> Ujian</button>
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
                        <div class="flex flex-col md:flex-row items-start md:items-center justify-between bg-white border border-slate-200 p-4 rounded-xl mb-3 shadow-sm">
                            <div class="mb-3 md:mb-0 w-full">
                                <span class="font-bold text-slate-800 text-sm block md:inline">${s.name}</span>
                                <span class="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 block md:inline-block mt-2 md:mt-0 md:ml-2">
                                    ${getDisplayDate(parseDateStr(oldD))} <i class="fas fa-arrow-right text-slate-400 mx-1"></i> ${getDisplayDate(parseDateStr(newD))}
                                </span>
                            </div>
                            <div class="flex gap-2 w-full md:w-auto">
                                <button onclick="approveReschedule('${s.email}', '${oldD}', '${newD}')" class="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"><i class="fas fa-check mr-1"></i> Terima</button>
                                <button onclick="rejectReschedule('${s.email}', '${oldD}')" class="flex-1 md:flex-none bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 px-4 py-2 rounded-lg text-xs font-semibold transition"><i class="fas fa-times mr-1"></i> Tolak</button>
                            </div>
                        </div>
                    `;
                }
            }
        });
        if (!pendingReschedulesHTML) pendingReschedulesHTML = `<div class="bg-slate-50 py-8 rounded-xl border border-dashed border-slate-200 text-center"><p class="text-slate-400 text-sm font-medium">Tidak ada antrean validasi jadwal saat ini.</p></div>`;

        contentHTML = `
            <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 class="text-base font-bold text-slate-800 mb-5 flex items-center gap-2"><i class="fas fa-bell text-amber-500"></i> Validasi Perubahan Jadwal</h3>
                <div class="bg-slate-50/50 p-2 md:p-4 rounded-xl">${pendingReschedulesHTML}</div>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
                <div class="flex items-center gap-4 text-center sm:text-left">
                    <div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shrink-0 mx-auto sm:mx-0"><i class="fas fa-folder-plus"></i></div>
                    <div>
                        <h3 class="text-base font-bold text-slate-800">Modul Bulan Baru</h3>
                        <p class="text-xs text-slate-500 mt-0.5">Generate kerangka folder bulan secara otomatis.</p>
                    </div>
                </div>
                <button onclick="addNewMonth()" class="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-100 text-indigo-600 py-2.5 px-5 rounded-xl text-xs font-bold border border-indigo-100 transition shrink-0">Generate Month</button>
            </div>
        `;
    } 
    // === TAB 2: AKUN & JADWAL ===
    else if (currentAdminTab === 'users') {
        let studentsRows = students.map((s, idx) => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                <td class="p-3 text-slate-800 text-xs font-medium">${s.name}</td>
                <td class="p-3 text-slate-500 text-xs hidden sm:table-cell">${s.email}</td>
                <td class="p-3">
                    <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg w-max">
                        <input type="password" value="${s.password}" id="pwd-${idx}" class="bg-transparent border-none w-12 outline-none text-slate-600 font-mono text-[10px]" readonly>
                        <button onclick="togglePassword('pwd-${idx}')" class="text-slate-400 hover:text-indigo-600"><i class="fas fa-eye text-xs"></i></button>
                    </div>
                </td>
                <td class="p-3 text-right whitespace-nowrap">
                    <button onclick="editStudentPassword('${s.email}')" class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition inline-flex items-center justify-center mx-0.5"><i class="fas fa-key text-[10px]"></i></button>
                    <button onclick="deleteStudentAccount('${s.email}')" class="w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition inline-flex items-center justify-center mx-0.5"><i class="fas fa-trash-alt text-[10px]"></i></button>
                </td>
            </tr>
        `).join('');

        contentHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-user-plus text-emerald-500 mr-2"></i> Pendaftaran Akun</h3>
                    <div class="space-y-3">
                        <input type="text" id="new-stu-name" placeholder="Nama Lengkap" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none transition">
                        <input type="email" id="new-stu-email" placeholder="Alamat Email" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none transition">
                        <input type="text" id="new-stu-pass" placeholder="Password Standar" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white outline-none transition">
                        <button onclick="addNewStudent()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-semibold shadow-sm transition">Daftarkan Akun</button>
                    </div>
                </div>
                
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-user-cog text-purple-500 mr-2"></i> Jadwal Master</h3>
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">Pilih Murid</label><select id="admin-sched-student" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition">${studentOptions}</select></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">Max Modul</label><select id="admin-sched-max-month" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition">${maxMonthOptions}</select></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">Masa Aktif</label><input type="date" id="admin-sched-date" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition text-slate-600"></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">Jam Kelas</label>
                            <div class="flex items-center gap-1">
                                <input type="time" id="admin-sched-start" class="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10px] outline-none">
                                <span class="text-slate-400 font-bold">-</span>
                                <input type="time" id="admin-sched-end" class="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10px] outline-none">
                            </div>
                        </div>
                    </div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-2">Hari Default</label>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].map(d => `<label class="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 text-[10px] font-semibold cursor-pointer hover:border-indigo-300 transition"><input type="checkbox" value="${d}" class="admin-day-cb w-3 h-3 text-indigo-600"> ${d.substring(0,3)}</label>`).join('')}
                    </div>
                    <button onclick="saveStudentSchedule(event)" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-semibold shadow-sm transition">Simpan Konfigurasi</button>
                </div>
            </div>

            <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-database text-slate-500 mr-2"></i> Database Kredensial</h3>
                <div class="overflow-x-auto rounded-xl border border-slate-100">
                    <table class="w-full text-left border-collapse text-sm min-w-[400px]">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                                <th class="p-3">Nama</th><th class="p-3 hidden sm:table-cell">Email</th><th class="p-3">Sandi</th><th class="p-3 text-right">Tindakan</th>
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
            <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
                <h3 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-cloud-upload-alt text-blue-500 mr-2"></i> Modul Presentasi & Rangkuman (PDF)</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div class="md:col-span-1 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-5">
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">Target Akses</label>
                        <select id="admin-target-student" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs mb-3 outline-none focus:ring-1 focus:ring-indigo-500 transition"><option value="all">Global (Semua)</option>${studentOptions}</select>
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">Pilih Sesi</label>
                        <div class="grid grid-cols-3 gap-2">
                            <select id="admin-month" class="bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10px] outline-none focus:ring-1 focus:ring-indigo-500">${monthOptions}</select>
                            <select id="admin-week" class="bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10px] outline-none focus:ring-1 focus:ring-indigo-500">${weekOptions}</select>
                            <select id="admin-day" class="bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10px] outline-none focus:ring-1 focus:ring-indigo-500">${dayOptions}</select>
                        </div>
                    </div>
                    <div class="md:col-span-2 space-y-3">
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1"><i class="fab fa-google-drive text-blue-500 mr-1"></i> Tautan Presentasi</label><input type="text" id="admin-link" placeholder="Paste URL GDrive" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-400 transition"></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1"><i class="fab fa-google-drive text-emerald-500 mr-1"></i> Tautan Rangkuman</label><input type="text" id="admin-recap-pdf" placeholder="Paste URL GDrive" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-400 transition"></div>
                        <button onclick="saveMaterialData()" class="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition mt-1">Simpan Tautan</button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-book text-indigo-500 mr-2"></i> Distribusi Kosakata</h3>
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <select id="admin-vocab-month" class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none">${monthOptions}</select>
                        <select id="admin-vocab-week" class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none">${weekOptions}</select>
                        <select id="admin-vocab-day" class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none">${dayOptions}</select>
                    </div>
                    <textarea id="admin-vocab-list" rows="4" placeholder="Format:\nApple = Apel\nBook = Buku" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs mb-3 outline-none focus:bg-white focus:border-indigo-400 transition"></textarea>
                    <button onclick="saveVocabList(event)" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-semibold shadow-sm transition">Publikasi</button>
                </div>
                
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-check-double text-emerald-500 mr-2"></i> Verifikasi Hafalan</h3>
                    <select id="admin-review-student" class="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs mb-3 outline-none">${studentOptions}</select>
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <select id="admin-review-month" class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none">${monthOptions}</select>
                        <select id="admin-review-week" class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none">${weekOptions}</select>
                        <select id="admin-review-day" class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs outline-none">${dayOptions}</select>
                    </div>
                    <button onclick="checkVocabStatus(this)" class="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition"><i class="fas fa-search mr-1"></i> Periksa Status</button>
                    <div id="vocab-review-result" class="mt-4"></div>
                </div>
            </div>
        `;
    }
    // === TAB 4: UJIAN BULANAN ===
    else if (currentAdminTab === 'exam') {
        contentHTML = `
            <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 class="text-sm md:text-base font-bold text-slate-800 mb-4 flex items-center">
                    <i class="fas fa-file-signature text-amber-500 mr-2"></i> Form Builder Ujian
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Target Murid</label>
                        <select id="admin-exam-student" class="w-full bg-white border border-slate-200 py-2 px-3 rounded-lg text-xs outline-none focus:border-indigo-400 transition">${studentOptions}</select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sesi Bulan</label>
                        <select id="admin-exam-month" class="w-full bg-white border border-slate-200 py-2 px-3 rounded-lg text-xs outline-none focus:border-indigo-400 transition">${monthOptions}</select>
                    </div>
                    <div class="sm:col-span-2 mt-1">
                        <button onclick="loadAdminExamData()" class="w-full bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs font-bold shadow-sm transition">Muat / Buat Soal</button>
                    </div>
                </div>
                
                <!-- Workspace Pembuat Soal -->
                <div id="admin-exam-workspace" class="hidden border border-slate-200 rounded-xl overflow-hidden">
                    <div class="flex overflow-x-auto border-b border-slate-200 bg-slate-50/80 custom-scrollbar">
                        <button onclick="switchExamTab('listening')" id="tab-listening" class="shrink-0 px-4 md:px-5 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 transition">Listening</button>
                        <button onclick="switchExamTab('speaking')" id="tab-speaking" class="shrink-0 px-4 md:px-5 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 transition">Speaking</button>
                        <button onclick="switchExamTab('reading')" id="tab-reading" class="shrink-0 px-4 md:px-5 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 transition">Reading</button>
                        <button onclick="switchExamTab('writing')" id="tab-writing" class="shrink-0 px-4 md:px-5 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 transition">Writing</button>
                    </div>
                    
                    <div class="p-4 md:p-5 bg-slate-50/50">
                        <div id="admin-exam-questions-container" class="space-y-4 mb-5"></div>
                        <div class="flex flex-col sm:flex-row gap-3">
                            <button onclick="addExamQuestion('mcq')" class="flex-1 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-list-ul text-blue-500 mr-1.5"></i> Tambah Pilihan Ganda</button>
                            <button onclick="addExamQuestion('essay')" class="flex-1 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-align-left text-emerald-500 mr-1.5"></i> Tambah Essay</button>
                        </div>
                    </div>
                    
                    <div class="p-3 bg-slate-50 border-t border-slate-200 text-right">
                        <button onclick="saveAdminExamData(event)" class="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg text-xs font-bold shadow-sm transition">Simpan Seluruh Soal</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Render Master Layout
    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-16">
            <div class="mb-4 md:mb-6">
                <h2 class="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Administrative Control</h2>
                <p class="text-slate-500 font-medium text-xs md:text-sm mt-0.5">Pusat kelola data, jadwal, dan kurikulum ujian.</p>
            </div>
            ${tabsHTML}
            <div class="fade-in">${contentHTML}</div>
        </div>
    `;

    if (currentAdminTab === 'exam' && adminExamState.student !== '') {
        document.getElementById('admin-exam-student').value = adminExamState.student;
        document.getElementById('admin-exam-month').value = adminExamState.month;
        if (adminExamState.data) { document.getElementById('admin-exam-workspace').classList.remove('hidden'); switchExamTab(adminExamState.activeTab); }
    }
}

// ==== FUNGSI DATABASE KHUSUS ADMIN ====
window.approveReschedule = async function(email, oldDate, newDate) { let p = materials[`profile-${email}`]; if(!p.reschedules) p.reschedules = {}; p.reschedules[oldDate] = newDate; delete p.pendingReschedules[oldDate]; document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default'; if (error) alert(error.message); else renderAdminCMS(); }
window.rejectReschedule = async function(email, oldDate) { if(confirm("Tolak pengajuan?")) { let p = materials[`profile-${email}`]; delete p.pendingReschedules[oldDate]; document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default'; if (error) alert(error.message); else renderAdminCMS(); } }
window.saveVocabList = async function(e) { const m = document.getElementById('admin-vocab-month').value; const w = document.getElementById('admin-vocab-week').value; const d = document.getElementById('admin-vocab-day').value; materials[`vocab-${m}-w${w}-d${d}`] = document.getElementById('admin-vocab-list').value; const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = 'Proses...'; btn.disabled = true; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); btn.innerHTML = origText; btn.disabled = false; if (!error) { alert("Tersimpan."); document.getElementById('admin-vocab-list').value = ''; } }
window.checkVocabStatus = async function(btnElement) { let resDiv = document.getElementById('vocab-review-result'); let origText = ''; if(btnElement) { origText = btnElement.innerHTML; btnElement.innerHTML = 'Cek Server...'; btnElement.disabled = true; } try { const { data } = await window.supabaseClient.from('app_data').select('*'); if (data) { const matData = data.find(d => d.key === 'hes_materials'); if (matData && matData.value) materials = matData.value; } } catch(e) {} if(btnElement) { btnElement.innerHTML = origText; btnElement.disabled = false; } const email = document.getElementById('admin-review-student').value; const m = document.getElementById('admin-review-month').value; const w = document.getElementById('admin-review-week').value; const d = document.getElementById('admin-review-day').value; let statusObj = materials[`vocab_status-${email}-${m}-w${w}-d${d}`]; if (!statusObj || statusObj.status === 'none') { resDiv.innerHTML = `<div class="bg-slate-50 p-3 rounded-lg text-[10px] text-center text-slate-500 font-medium border border-slate-200">Belum ada tugas disubmit.</div>`; } else if (statusObj.status === 'submitted') { resDiv.innerHTML = `<div class="bg-amber-50 p-3 rounded-xl border border-amber-100 mt-3"><p class="text-[10px] font-bold text-amber-800 mb-2">Siap verifikasi.</p><input type="text" id="admin-feedback" placeholder="Catatan opsional..." class="w-full p-2 bg-white border border-amber-200 rounded-lg text-xs mb-2 outline-none"><button onclick="approveVocab('${email}', '${m}', '${w}', '${d}')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold w-full">Setujui Hafalan</button></div>`; } else if (statusObj.status === 'approved') { resDiv.innerHTML = `<div class="bg-emerald-50 p-2.5 rounded-lg text-xs font-bold text-emerald-700 text-center mt-3 border border-emerald-100"><i class="fas fa-check-circle mr-1"></i> Telah diverifikasi.</div>`; } }
window.approveVocab = async function(email, m, w, d) { let feedback = document.getElementById('admin-feedback').value || 'Good Job!'; materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status: 'approved', feedback: feedback }; document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default'; if (!error) { checkVocabStatus(); } }
window.togglePassword = function(id) { const input = document.getElementById(id); input.type = input.type === 'password' ? 'text' : 'password'; }
window.editStudentPassword = async function(email) { const i = students.findIndex(s => s.email === email); if(i === -1) return; const np = prompt(`Password baru untuk ${students[i].name}:`, students[i].password); if(np && np.trim() !== '') { students[i].password = np.trim(); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]); if (!error) renderAdminCMS(); } }
window.deleteStudentAccount = async function(email) { if(confirm(`Hapus permanen akun ${email}?`)) { students = students.filter(s => s.email !== email); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]); if (!error) renderAdminCMS(); } }
window.saveStudentSchedule = async function(e) { const email = document.getElementById('admin-sched-student').value; let profile = materials[`profile-${email}`] || {}; profile.validUntil = document.getElementById('admin-sched-date').value || profile.validUntil || 'Belum diatur'; const sT = document.getElementById('admin-sched-start').value; const eT = document.getElementById('admin-sched-end').value; if (sT && eT) profile.time = `${sT} - ${eT}`; profile.maxMonth = document.getElementById('admin-sched-max-month').value || profile.maxMonth || 1; const selDays = Array.from(document.querySelectorAll('.admin-day-cb:checked')).map(cb => cb.value); if(selDays.length > 0) profile.days = selDays; materials[`profile-${email}`] = profile; const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = 'Menyimpan...'; btn.disabled = true; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); btn.innerHTML = origText; btn.disabled = false; if (!error) alert("Jadwal tersimpan."); }
window.addNewMonth = async function() { const nextNum = months.length + 1; months.push({ id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] }); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_months', value: months }]); if (!error) { alert(`Month ${nextNum} sukses dibuat.`); renderSidebar(); renderAdminCMS(); } else months.pop(); };
window.addNewStudent = async function() { const name = document.getElementById('new-stu-name').value; const email = document.getElementById('new-stu-email').value; const pass = document.getElementById('new-stu-pass').value; if(!name || !email || !pass) return alert("Lengkapi data!"); students.push({ name: name, email: email, password: pass }); const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]); if (!error) { alert("Akun didaftarkan."); renderAdminCMS(); } else students.pop(); }
window.saveMaterialData = async function() { const ts = document.getElementById('admin-target-student').value; const m = document.getElementById('admin-month').value; const w = document.getElementById('admin-week').value; const d = document.getElementById('admin-day').value; const link = document.getElementById('admin-link').value; const recap = document.getElementById('admin-recap-pdf').value; const keyPref = `${ts}-${m}-w${w}-d${d}`; if(link) materials[`${keyPref}-link`] = link; if(recap) materials[`${keyPref}-recap`] = recap; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); if (!error) { alert("Modul tersimpan."); document.getElementById('admin-link').value = ''; document.getElementById('admin-recap-pdf').value = ''; } };

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
        if(t === tabName) { btn.classList.add('border-indigo-500', 'text-indigo-600'); btn.classList.remove('border-transparent', 'text-slate-500'); }
        else { btn.classList.remove('border-indigo-500', 'text-indigo-600'); btn.classList.add('border-transparent', 'text-slate-500'); }
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
    if(questions.length === 0) { container.innerHTML = `<div class="text-center py-6 bg-white rounded-xl border border-dashed border-slate-300"><p class="text-slate-400 font-medium text-xs">Belum ada soal.</p></div>`; return; }

    container.innerHTML = questions.map((q, idx) => {
        let isMCQ = q.type === 'mcq'; let bodyHTML = '';
        if (isMCQ) {
            let optionsHTML = ['A', 'B', 'C', 'D'].map((lbl, oIdx) => `
                <div class="flex items-center gap-2 mb-2">
                    <input type="radio" name="correct_${adminExamState.activeTab}_${idx}" value="${oIdx}" ${q.answer == oIdx ? 'checked' : ''} onchange="updateExamField(${idx}, 'answer', ${oIdx})" class="w-3.5 h-3.5 text-indigo-600 shrink-0">
                    <span class="font-bold text-xs text-slate-500 w-3 shrink-0">${lbl}.</span>
                    <input type="text" value="${q.options[oIdx]}" onchange="updateExamField(${idx}, 'options', this.value, ${oIdx})" placeholder="Teks opsi" class="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 transition">
                </div>
            `).join('');
            bodyHTML = `<div class="mt-3 p-3 bg-slate-100/50 rounded-xl border border-slate-200"><p class="text-[9px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Opsi & Kunci Jawaban</p>${optionsHTML}</div>`;
        } else {
            bodyHTML = `<div class="mt-3 p-3 bg-slate-100/50 rounded-xl border border-slate-200"><p class="text-[9px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Kriteria Jawaban Essay</p><textarea onchange="updateExamField(${idx}, 'answer', this.value)" rows="2" class="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 transition">${q.answer}</textarea></div>`;
        }
        return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                <div class="absolute top-3 right-3 flex gap-1"><span class="bg-slate-100 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">${isMCQ ? 'PG' : 'Essay'}</span><button onclick="removeExamQuestion(${idx})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash text-xs"></i></button></div>
                <h4 class="font-bold text-xs text-slate-700 mb-2">Soal ${idx + 1}</h4>
                <textarea onchange="updateExamField(${idx}, 'question', this.value)" rows="2" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-indigo-400 transition" placeholder="Ketik pertanyaan...">${q.question}</textarea>
                ${bodyHTML}
                <div class="mt-3"><p class="text-[9px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider"><i class="fas fa-lightbulb text-amber-500 mr-1"></i> Penjelasan Singkat</p><textarea onchange="updateExamField(${idx}, 'explanation', this.value)" rows="1" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-indigo-400 transition" placeholder="Opsional...">${q.explanation}</textarea></div>
            </div>
        `;
    }).join('');
}
window.saveAdminExamData = async function(e) {
    const key = `exam-${adminExamState.student}-${adminExamState.month}`; materials[key] = adminExamState.data;
    const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = 'Menyimpan...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    btn.innerHTML = origText; btn.disabled = false;
    if (error) alert("Gagal: " + error.message); else alert("Ujian berhasil disimpan.");
}

// ==== PENGERJAAN UJIAN (MURID) ====
let studentExamAnswers = {};
let currentExamSession = null;
let currentStudentExamTab = 'listening';

window.renderExam = function(monthId, monthTitle, tab = 'listening') {
    autoCloseSidebar(); 
    const email = currentUser.email; 
    const examKey = `exam-${email}-${monthId}`; 
    const resultKey = `exam_result-${email}-${monthId}`;
    const examData = materials[examKey]; 
    const examResult = materials[resultKey]; 
    
    // Me-reset jawaban sementara HANYA jika murid membuka ujian untuk sesi bulan yang berbeda
    if (currentExamSession !== monthId) {
        studentExamAnswers = {};
        currentExamSession = monthId;
    }
    
    currentStudentExamTab = tab;

    if (!examData) {
        mainContent.innerHTML = `<div class="max-w-4xl mx-auto fade-in pb-12"><div class="mb-6 flex items-center gap-4 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 shadow-sm"><button onclick="renderDashboard()" class="w-9 h-9 md:w-10 md:h-10 shrink-0 bg-slate-50 rounded-xl hover:bg-slate-100 border border-slate-100"><i class="fas fa-arrow-left text-slate-500"></i></button><h2 class="text-base md:text-lg font-bold text-slate-800">Final Exam: ${monthTitle}</h2></div><div class="bg-slate-50 p-10 rounded-2xl border border-dashed border-slate-300 text-center"><p class="text-slate-500 font-medium text-sm">Ujian belum tersedia untuk bulan ini.</p></div></div>`;
        return;
    }

    // TAB MENU HTML (Digunakan di mode Mengerjakan dan mode Hasil Ujian)
    let tabsHTML = `
        <div class="flex overflow-x-auto gap-1 mb-6 bg-slate-200/50 p-1.5 rounded-xl max-w-full md:max-w-fit custom-scrollbar border border-slate-200">
            <button onclick="renderExam('${monthId}', '${monthTitle}', 'listening')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentStudentExamTab === 'listening' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}">Listening</button>
            <button onclick="renderExam('${monthId}', '${monthTitle}', 'speaking')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentStudentExamTab === 'speaking' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}">Speaking</button>
            <button onclick="renderExam('${monthId}', '${monthTitle}', 'reading')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentStudentExamTab === 'reading' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}">Reading</button>
            <button onclick="renderExam('${monthId}', '${monthTitle}', 'writing')" class="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${currentStudentExamTab === 'writing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}">Writing</button>
        </div>
    `;

    // 1. TAMPILAN JIKA UJIAN SUDAH DI-SUBMIT (HASIL)
    if (examResult) {
        let resultHTML = '';
        const cat = currentStudentExamTab; // Tampilkan hasil per tab yang aktif
        
        if(examData[cat].length === 0) {
            resultHTML = `<div class="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center mb-6"><p class="text-slate-400 text-sm font-medium">Tidak ada soal di bagian ini.</p></div>`;
        } else {
            resultHTML += `<h3 class="text-sm md:text-base font-bold text-slate-800 mb-4 capitalize flex items-center gap-2"><span class="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px]"><i class="fas fa-cube"></i></span> ${cat} Section</h3>`;
            
            examData[cat].forEach((q, idx) => {
                let sAns = examResult.answers[`${cat}_${idx}`] !== undefined ? examResult.answers[`${cat}_${idx}`] : '';
                let isMCQ = q.type === 'mcq'; let isCorrect = isMCQ ? (sAns == q.answer) : true;
                let sAnsText = isMCQ && sAns !== '' ? q.options[sAns] : (sAns || 'Tidak dijawab');
                let cAnsText = isMCQ ? q.options[q.answer] : q.answer;

                resultHTML += `
                    <div class="bg-white p-4 md:p-5 rounded-2xl border ${isMCQ ? (isCorrect ? 'border-emerald-200 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)]' : 'border-red-200 shadow-[0_2px_10px_-3px_rgba(239,68,68,0.1)]') : 'border-slate-200 shadow-sm'} mb-4">
                        <p class="font-semibold text-xs md:text-sm text-slate-700 mb-3 leading-relaxed">${idx + 1}. ${q.question.replace(/\n/g, '<br>')}</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100"><p class="text-[9px] font-bold uppercase text-slate-400 mb-1">Jawaban Anda</p><p class="text-xs font-semibold ${isMCQ ? (isCorrect ? 'text-emerald-600' : 'text-red-600') : 'text-slate-700'}">${sAnsText}</p></div>
                            <div class="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100"><p class="text-[9px] font-bold uppercase text-indigo-400 mb-1">Kunci Jawaban</p><p class="text-xs font-semibold text-indigo-700">${cAnsText || 'Diperiksa manual'}</p></div>
                        </div>
                        ${q.explanation ? `<div class="bg-amber-50/80 p-3 rounded-xl border border-amber-100/50 flex gap-2"><i class="fas fa-lightbulb text-amber-500 text-xs mt-0.5"></i><div><p class="text-[9px] font-bold uppercase text-amber-600 mb-0.5">Pembahasan</p><p class="text-xs text-amber-800">${q.explanation}</p></div></div>` : ''}
                    </div>
                `;
            });
        }

        mainContent.innerHTML = `
            <div class="max-w-4xl mx-auto fade-in pb-12">
                <div class="mb-6 bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
                    <h2 class="text-lg md:text-xl font-bold text-slate-800 mb-2">Hasil Evaluasi: ${monthTitle}</h2>
                    <div class="inline-block bg-emerald-50 border border-emerald-200 text-emerald-700 px-5 py-2.5 rounded-xl font-bold text-sm md:text-base mt-2 shadow-sm">Skor Pilihan Ganda: ${examResult.mcqScore} / 100</div>
                    <p class="text-[10px] text-slate-400 mt-3 font-medium">*Jawaban essay akan dinilai dan di-review manual oleh Admin.</p>
                </div>
                ${tabsHTML}
                ${resultHTML}
                <button onclick="renderDashboard()" class="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl text-sm font-semibold shadow-sm transition">Kembali ke Dashboard</button>
            </div>`;
        return;
    }

    // 2. TAMPILAN MENGERJAKAN UJIAN (TABBED)
    let formHTML = '';
    const cat = currentStudentExamTab; // Targetkan tab spesifik
    
    if (examData[cat].length === 0) {
        formHTML = `<div class="bg-white p-10 rounded-2xl border border-dashed border-slate-200 text-center mb-6"><p class="text-slate-400 text-sm font-medium">Tidak ada soal untuk bagian ${cat} ini.</p></div>`;
    } else {
        formHTML += `<div class="mb-8"><h3 class="text-sm md:text-base font-bold text-slate-800 mb-4 capitalize flex items-center gap-2"><div class="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px]"><i class="fas fa-cube"></i></div> ${cat} Section</h3>`;
        examData[cat].forEach((q, idx) => {
            let isMCQ = q.type === 'mcq'; let inputsHTML = '';
            
            // Muat ulang jawaban jika murid kembali ke tab ini
            let savedAns = studentExamAnswers[`${cat}_${idx}`] !== undefined ? studentExamAnswers[`${cat}_${idx}`] : '';
            
            if (isMCQ) {
                inputsHTML = ['A','B','C','D'].map((lbl, oIdx) => `
                    <label class="flex items-start md:items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition mb-2">
                        <input type="radio" name="ans_${cat}_${idx}" value="${oIdx}" ${savedAns == oIdx ? 'checked' : ''} onchange="recordAnswer('${cat}', ${idx}, ${oIdx})" class="w-4 h-4 mt-0.5 md:mt-0 text-indigo-600 shrink-0">
                        <span class="text-xs md:text-sm font-medium text-slate-700 leading-snug">${lbl}. ${q.options[oIdx]}</span>
                    </label>
                `).join('');
            } else { 
                inputsHTML = `<textarea onchange="recordAnswer('${cat}', ${idx}, this.value)" rows="3" class="w-full p-3 border border-slate-200 rounded-xl text-xs md:text-sm outline-none bg-slate-50 focus:bg-white focus:border-indigo-400 transition" placeholder="Ketik jawaban Anda...">${savedAns}</textarea>`; 
            }
            formHTML += `<div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm mb-4 md:mb-5"><p class="font-semibold text-slate-800 mb-4 text-xs md:text-sm leading-relaxed">${idx + 1}. ${q.question.replace(/\n/g, '<br>')}</p>${inputsHTML}</div>`;
        });
        formHTML += `</div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-3xl mx-auto fade-in pb-20">
            <div class="mb-6 flex items-center gap-3 md:gap-4 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-2 z-10">
                <button onclick="renderDashboard()" class="w-9 h-9 shrink-0 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:bg-slate-100"><i class="fas fa-arrow-left text-xs md:text-sm"></i></button>
                <div>
                    <h2 class="text-sm md:text-base font-bold text-slate-800">Ujian: ${monthTitle}</h2>
                    <p class="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase tracking-wider mt-0.5">Harap kerjakan dengan jujur</p>
                </div>
            </div>
            
            ${tabsHTML}
            ${formHTML}
            
            <div class="bg-indigo-600 p-6 md:p-8 rounded-2xl text-center shadow-md relative overflow-hidden mt-8">
                <div class="absolute right-0 top-0 -mt-10 -mr-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <p class="text-xs md:text-sm font-medium text-indigo-100 mb-5 relative z-10">Pastikan semua soal di setiap tab/kategori telah Anda cek dan jawab sebelum melakukan submit final.</p>
                <button onclick="submitStudentExam('${monthId}')" class="px-6 md:px-8 py-3 bg-white text-indigo-600 rounded-xl text-xs md:text-sm font-bold w-full md:w-auto hover:bg-slate-50 shadow-sm transition relative z-10">Submit Ujian Sekarang</button>
            </div>
        </div>
    `;
};

window.recordAnswer = function(category, qIndex, value) { 
    studentExamAnswers[`${category}_${qIndex}`] = value; 
}

window.submitStudentExam = async function(monthId) {
    if(!confirm("Anda yakin ingin mengirim jawaban sekarang? Pastikan Anda sudah mengecek seluruh tab (Listening, Speaking, Reading, Writing).")) return;
    
    const email = currentUser.email; 
    const examKey = `exam-${email}-${monthId}`; 
    const resultKey = `exam_result-${email}-${monthId}`; 
    const examData = materials[examKey];
    
    let totalMCQ = 0; let correctMCQ = 0;
    ['listening', 'speaking', 'reading', 'writing'].forEach(cat => {
        examData[cat].forEach((q, idx) => { 
            if(q.type === 'mcq') { 
                totalMCQ++; 
                let sAns = studentExamAnswers[`${cat}_${idx}`]; 
                if(sAns !== undefined && sAns == q.answer) correctMCQ++; 
            } 
        });
    });
    
    let mcqScore = totalMCQ > 0 ? Math.round((correctMCQ / totalMCQ) * 100) : 0;
    materials[resultKey] = { status: 'submitted', answers: studentExamAnswers, mcqScore: mcqScore, submittedAt: new Date().toISOString() };
    
    document.body.style.cursor = 'wait'; 
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); 
    document.body.style.cursor = 'default';
    
    if (error) alert("Error: " + error.message); 
    else { 
        sendTelegramNotification(`📝 Ujian Disubmit\nMurid: ${currentUser.name}\nSkor PG: ${mcqScore}/100`); 
        renderExam(monthId, months.find(m => m.id === monthId).title, currentStudentExamTab); 
    }
}