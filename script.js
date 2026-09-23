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
    if (!p || !p.days || p.days.length === 0) return { error: 'Jadwal belajar belum dikonfigurasi admin.' };
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
                if (document.getElementById('main-content').innerHTML.includes('Administrative')) renderAdminCMS();
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
    document.getElementById('user-role-display').innerText = userRole === 'admin' ? 'System Administrator' : 'Premium Member';
    renderSidebar(); renderDashboard();
}

function handleLogout() {
    localStorage.removeItem('hes_session_user'); localStorage.removeItem('hes_session_role');
    currentUser = null; userRole = null; document.getElementById('email').value = ''; document.getElementById('password').value = '';
    loginError.classList.add('hidden'); appPage.classList.add('hidden'); loginPage.classList.remove('hidden');
}

// ==== RENDER SIDEBAR (ELEGAN & TERORGANISIR) ====
function renderSidebar() {
    let menuHTML = '<div class="space-y-1.5">';

    // Menu Navigasi Utama
    menuHTML += `<p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 mt-2 pl-3">Main Menu</p>`;
    
    if (userRole === 'admin') {
        menuHTML += `
            <button onclick="renderAdminCMS()" class="w-full flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all group">
                <div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-layer-group"></i></div>
                Administrative
            </button>
        `;
    }

    menuHTML += `
        <button onclick="renderDashboard()" class="w-full flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all group">
            <div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-th-large"></i></div>
            Dashboard
        </button>
        <button onclick="renderReschedule()" class="w-full flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all group">
            <div class="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors"><i class="fas fa-calendar-alt"></i></div>
            Reschedule
        </button>
    </div>
    <div class="mt-8 mb-4">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-3">Learning Modules</p>
        <div class="space-y-1">
    `;

    let maxMonthNum = 1; 
    if (userRole === 'student') { let p = materials[`profile-${currentUser.email}`]; if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth); }

    months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = userRole === 'student' && currentMonthNum > maxMonthNum;

        if (isLocked) {
            menuHTML += `
                <div class="px-4 py-3 flex items-center text-slate-400 font-medium text-sm cursor-not-allowed opacity-70" onclick="alert('Modul ini terkunci. Hubungi admin untuk akses lebih lanjut.')">
                    <i class="fas fa-lock w-6 text-slate-300"></i> ${month.title}
                </div>
            `;
        } else {
            menuHTML += `
                <div>
                    <div class="px-4 py-3 flex justify-between items-center cursor-pointer rounded-xl hover:bg-slate-50 transition-colors text-slate-700 font-semibold text-sm" onclick="toggleMenu('m-${month.id}', this)">
                        <div class="flex items-center"><i class="far fa-folder-open w-6 text-indigo-500"></i> ${month.title}</div>
                        <i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform"></i>
                    </div>
                    <div id="m-${month.id}" class="hidden pl-6 py-1 space-y-1 border-l-2 border-indigo-50 ml-5 my-1">
            `;
            month.weeks.forEach(week => {
                menuHTML += `
                    <div>
                        <div class="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 cursor-pointer flex justify-between items-center" onclick="toggleMenu('w-${month.id}-${week}', this)">
                            <span>Week ${week}</span> <i class="fas fa-angle-down text-[10px] transition-transform"></i>
                        </div>
                        <div id="w-${month.id}-${week}" class="hidden pl-3 py-1 space-y-1">
                `;
                [1, 2, 3].forEach(day => {
                    menuHTML += `
                        <div class="px-3 py-2 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-lg cursor-pointer flex items-center transition-colors" onclick="renderMateri('${month.id}', ${week}, ${day}, '${month.title}')">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span> Day ${day}
                        </div>
                    `;
                });
                menuHTML += `</div></div>`;
            });
            menuHTML += `</div></div>`;
        }
    });
    menuHTML += `</div></div>`; sidebarMenu.innerHTML = menuHTML;
}

function toggleMenu(id, el) {
    const target = document.getElementById(id); const icon = el.querySelector('.fa-chevron-down, .fa-angle-down');
    if (target.classList.contains('hidden')) { target.classList.remove('hidden'); if(icon) icon.style.transform = 'rotate(180deg)'; } 
    else { target.classList.add('hidden'); if(icon) icon.style.transform = 'rotate(0deg)'; }
}
function autoCloseSidebar() { if (window.innerWidth < 768) { sidebar.classList.add('-translate-x-full'); } }

// ==== DASHBOARD UTAMA (ELEGAN) ====
function renderDashboard() {
    autoCloseSidebar();
    
    if (userRole === 'admin') {
        let adminGridHTML = ''; let todayAdmin = new Date(); todayAdmin.setHours(0,0,0,0);
        let pendingRescheduleCount = 0;
        
        for(let i=0; i<7; i++) {
            let curr = new Date(todayAdmin); curr.setDate(todayAdmin.getDate()+i);
            let currStr = formatDateForID(curr); let displayDay = getDisplayDate(curr);
            
            let bookings = [];
            students.forEach(s => {
                let p = materials[`profile-${s.email}`];
                if (isOccupied(s.email, currStr)) {
                    let isPendingMoveAway = p.pendingReschedules && p.pendingReschedules[currStr] !== undefined;
                    let isPendingMoveHere = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
                    let statusLabel = isPendingMoveAway ? ' (Pengajuan Keluar)' : (isPendingMoveHere ? ' (Validasi Masuk)' : '');
                    let badgeClass = isPendingMoveAway ? 'bg-amber-100 text-amber-700' : (isPendingMoveHere ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700');
                    
                    bookings.push(`
                        <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100">
                            <div class="px-2 py-1 rounded bg-white font-bold text-xs shadow-sm border border-slate-200 text-slate-600">${p.time}</div>
                            <div class="flex-1 text-sm font-semibold text-slate-800">${s.name}</div>
                            ${statusLabel ? `<div class="text-[10px] font-bold px-2 py-1 rounded-md ${badgeClass}">${statusLabel}</div>` : ''}
                        </div>
                    `);
                }
                if (i === 0 && p && p.pendingReschedules) { pendingRescheduleCount += Object.keys(p.pendingReschedules).length; }
            });
            
            adminGridHTML += `
                <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover-card">
                    <h4 class="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                        <span>${displayDay}</span>
                        ${i===0 ? '<span class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-wider">HARI INI</span>' : ''}
                    </h4>
                    <div class="space-y-1">${bookings.length === 0 ? `<p class="text-sm text-slate-400 italic text-center py-4">Jadwal Kosong</p>` : bookings.join('')}</div>
                </div>
            `;
        }

        let alertHTML = '';
        if (pendingRescheduleCount > 0) {
            alertHTML = `
                <div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 rounded-2xl mb-8 flex flex-col md:flex-row items-center justify-between shadow-sm">
                    <div class="flex items-center gap-4 mb-4 md:mb-0">
                        <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-amber-500 text-xl"><i class="fas fa-bell"></i></div>
                        <div>
                            <h4 class="font-bold text-amber-900 text-lg">Tinjauan Jadwal Diperlukan</h4>
                            <p class="text-amber-700 text-sm font-medium">Ada ${pendingRescheduleCount} permintaan jadwal baru dari murid.</p>
                        </div>
                    </div>
                    <button onclick="renderAdminCMS()" class="bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-md shadow-amber-200">Review Sekarang</button>
                </div>
            `;
        }

        mainContent.innerHTML = `
            <div class="max-w-6xl mx-auto fade-in pb-10">
                <!-- Premium Hero Admin -->
                <div class="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-indigo-900/10 mb-8 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3"></div>
                    <div class="relative z-10 flex flex-wrap justify-between items-center gap-6">
                        <div>
                            <p class="text-indigo-200 text-sm font-semibold uppercase tracking-widest mb-1">Administrator Workspace</p>
                            <h2 class="text-3xl font-bold mb-2">Selamat Datang, Bro Hamdi.</h2>
                            <p class="text-indigo-100/80 text-sm max-w-lg">Ringkasan jadwal dan aktivitas studio untuk 7 hari ke depan.</p>
                        </div>
                        <div class="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 text-center">
                            <p class="text-[11px] uppercase tracking-widest font-bold text-indigo-200 mb-1">Total Murid Aktif</p>
                            <p class="text-3xl font-bold">${students.length}</p>
                        </div>
                    </div>
                </div>
                ${alertHTML}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${adminGridHTML}
                </div>
            </div>
        `;
        return;
    }

    // DASHBOARD MURID PREMIUM
    let latestMonth = "Belum Ada"; let latestWeek = "-"; let latestDay = "-";
    let progressText = "Anda belum memulai modul pembelajaran.";
    
    months.forEach(m => {
        m.weeks.forEach(w => {
            [1,2,3].forEach(d => {
                if (materials[`${currentUser.email}-${m.id}-w${w}-d${d}-link`] || materials[`all-${m.id}-w${w}-d${d}-link`]) {
                    latestMonth = m.title; latestWeek = w; latestDay = d;
                    progressText = `Posisi materi aktif Anda: <strong class="text-slate-800">${m.title} - Week ${w} Day ${d}</strong>.`;
                }
            });
        });
    });

    let nextSesh = getStudentNextSessionInfo(currentUser.email);
    let premiumCardContent = '';
    
    if (nextSesh.expired) {
        premiumCardContent = `
            <div class="bg-red-50 border border-red-200 p-6 rounded-2xl mt-6">
                <div class="flex items-center gap-3 mb-2">
                    <i class="fas fa-exclamation-triangle text-red-500 text-lg"></i>
                    <p class="text-red-800 font-bold">Masa Aktif Berakhir</p>
                </div>
                <p class="text-sm text-red-600/80 mb-4">Langganan Anda telah berakhir pada ${nextSesh.validDateStr}.</p>
                <button onclick="alert('Silakan hubungi admin.')" class="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-red-200 hover:bg-red-700 transition">Perpanjang Akses</button>
            </div>
        `;
    } else if (nextSesh.error) {
        premiumCardContent = `<div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 mt-6 text-sm font-medium text-slate-500 text-center"><i class="fas fa-clock text-2xl text-slate-300 mb-3 block"></i>${nextSesh.error}</div>`;
    } else {
        premiumCardContent = `
            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mt-6 flex items-center justify-between group">
                <div>
                    <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Kelas Mendatang</p>
                    <p class="font-bold text-2xl text-slate-800 mb-1">${nextSesh.displayDate}</p>
                    <p class="text-sm font-semibold text-slate-500 flex items-center gap-2"><i class="far fa-clock"></i> Pukul: ${nextSesh.time}</p>
                </div>
                <div class="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xl group-hover:scale-110 transition-transform">
                    <i class="fas fa-calendar-check"></i>
                </div>
            </div>
            <p class="text-xs text-slate-400 mt-4 text-center">Akses aktif s/d: ${nextSesh.validDateStr}</p>
        `;
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-10">
            <!-- Premium Hero Student -->
            <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-indigo-900/10 mb-8 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                <div class="relative z-10">
                    <p class="text-indigo-200 text-sm font-semibold uppercase tracking-widest mb-1 flex items-center gap-2"><i class="fas fa-star text-amber-400 text-xs"></i> Premium Access</p>
                    <h2 class="text-3xl font-bold mb-2">Selamat Datang, ${currentUser.name.split(' ')[0]}.</h2>
                    <p class="text-indigo-100/80 text-sm max-w-lg leading-relaxed">Konsistensi adalah kunci. Mari lanjutkan perjalanan Anda menguasai bahasa Inggris hari ini.</p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <!-- Info Jadwal -->
                <div class="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm hover-card">
                    <h3 class="text-lg font-bold text-slate-800 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><i class="far fa-calendar-alt"></i></div>
                        Informasi Penjadwalan
                    </h3>
                    ${premiumCardContent}
                </div>

                <!-- Info Progress -->
                <div class="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm hover-card flex flex-col">
                    <h3 class="text-lg font-bold text-slate-800 flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><i class="fas fa-chart-line"></i></div>
                        Kemajuan Belajar
                    </h3>
                    <p class="text-sm text-slate-600 mb-6 leading-relaxed">${progressText}</p>
                    
                    <div class="mt-auto">
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Modul Terakhir Diakses:</p>
                        <div class="flex gap-2">
                            <span class="px-4 py-2 bg-slate-50 text-slate-700 rounded-xl text-sm font-bold border border-slate-200">${latestMonth}</span>
                            <span class="px-4 py-2 bg-slate-50 text-slate-700 rounded-xl text-sm font-bold border border-slate-200">W${latestWeek}</span>
                            <span class="px-4 py-2 bg-slate-50 text-slate-700 rounded-xl text-sm font-bold border border-slate-200">D${latestDay}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==== MATERI & VOCABULARY (CARD UI) ====
function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//); if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return link;
}

window.submitVocab = async function(btnElement, m, w, d) {
    let key = `vocab_status-${currentUser.email}-${m}-w${w}-d${d}`;
    materials[key] = { status: 'submitted', feedback: '' };
    
    const origText = btnElement.innerHTML; btnElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Mengirim Data...'; btnElement.disabled = true;
    
    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) { alert("Sistem sibuk: " + error.message); btnElement.innerHTML = origText; btnElement.disabled = false; } 
    else {
        alert("Penyetoran berhasil dicatat. Menunggu verifikasi admin.");
        let monthTitle = months.find(mo=>mo.id===m)?.title || 'Materi';
        sendTelegramNotification(`📢 Penyetoran Hafalan\n\nMurid: ${currentUser.name}\nModul: ${monthTitle} - W${w} D${d}`);
        renderMateri(m, w, d, monthTitle);
    }
}

function renderMateri(monthId, week, day, monthTitle) {
    autoCloseSidebar(); const email = currentUser.email;
    let rawLink = materials[`${email}-${monthId}-w${week}-d${day}-link`] || materials[`all-${monthId}-w${week}-d${day}-link`] || '';
    let rawRecap = materials[`${email}-${monthId}-w${week}-d${day}-recap`] || materials[`all-${monthId}-w${week}-d${day}-recap`] || '';
    let linkDrive = parseDriveLink(rawLink); let recapDrive = parseDriveLink(rawRecap);
    let vocabData = materials[`vocab-${monthId}-w${week}-d${day}`] || '';
    let vocabStatus = materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none', feedback: '' };
    
    let vocabHTML = '';
    if (vocabData) {
        let words = vocabData.split('\n').filter(line => line.trim() !== '' && line.includes('='));
        let wordCards = words.map(w => {
            let parts = w.split('='); let en = parts[0] ? parts[0].trim() : ''; let idText = parts[1] ? parts[1].trim() : '';
            return `
                <div class="snap-center shrink-0 w-44 bg-white p-5 rounded-2xl border border-slate-100 text-center shadow-sm hover:shadow-md transition-shadow">
                    <p class="font-bold text-slate-800 text-lg mb-1">${en}</p>
                    <p class="text-xs font-semibold text-indigo-500 bg-indigo-50 py-1 px-2 rounded-md inline-block">${idText}</p>
                </div>
            `;
        }).join('');

        let actionUI = '';
        if (vocabStatus.status === 'none' || !vocabStatus.status) {
            actionUI = `<button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="mt-6 bg-slate-900 text-white px-8 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200">Tandai Selesai Dihafal</button>`;
        } else if (vocabStatus.status === 'submitted') {
            actionUI = `<div class="mt-6 text-sm font-bold text-amber-600 bg-amber-50 border border-amber-200 px-6 py-3 inline-flex items-center gap-2 rounded-xl"><i class="fas fa-hourglass-half fa-spin"></i> Menunggu Verifikasi Admin</div>`;
        } else if (vocabStatus.status === 'approved') {
            actionUI = `<div class="mt-6 bg-emerald-50 px-6 py-4 rounded-xl border border-emerald-200 inline-block text-left">
                <p class="text-sm font-bold text-emerald-800 mb-1 flex items-center gap-2"><i class="fas fa-check-circle text-emerald-500"></i> Hafalan Terverifikasi</p>
                <p class="text-xs font-medium text-emerald-700">Catatan: "${vocabStatus.feedback}"</p>
            </div>`;
        }

        vocabHTML = `
            <div class="mb-10 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><i class="fas fa-spell-check"></i></div> Daily Vocabulary
                </h3>
                <div class="flex overflow-x-auto gap-4 pb-4 snap-x custom-scrollbar bg-slate-50/50 p-4 rounded-2xl border border-slate-100 inset-shadow">
                    ${wordCards}
                </div>
                <div class="text-center">${userRole === 'student' ? actionUI : '<p class="text-xs text-slate-400 mt-6">Mode Pratinjau Admin</p>'}</div>
            </div>
        `;
    }

    let pdfViewerHTML = linkDrive 
        ? `<div class="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative h-[70vh] w-full shadow-inner"><iframe src="${linkDrive}" class="absolute top-0 left-0 w-full h-full" allow="autoplay"></iframe></div>` 
        : `<div class="bg-slate-50 py-16 rounded-2xl text-center border-2 border-dashed border-slate-200"><div class="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm"><i class="fas fa-file-pdf text-slate-300 text-xl"></i></div><p class="text-sm font-medium text-slate-500">Materi belum diunggah.</p></div>`;
           
    let recapViewerHTML = recapDrive 
        ? `<div class="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative h-[70vh] w-full shadow-inner mt-4"><iframe src="${recapDrive}" class="absolute top-0 left-0 w-full h-full" allow="autoplay"></iframe></div>` 
        : `<div class="bg-slate-50 py-16 rounded-2xl text-center border-2 border-dashed border-slate-200 mt-4"><div class="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm"><i class="fas fa-clipboard-list text-slate-300 text-xl"></i></div><p class="text-sm font-medium text-slate-500">Rangkuman belum diunggah.</p></div>`;

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto fade-in pb-12">
            <div class="mb-8 flex items-center gap-5 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <button onclick="renderDashboard()" class="w-10 h-10 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div>
                    <h2 class="text-xl font-bold text-slate-800">${monthTitle}</h2>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[11px] font-bold tracking-wider uppercase">Week ${week}</span>
                        <span class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[11px] font-bold tracking-wider uppercase">Day ${day}</span>
                    </div>
                </div>
            </div>
            
            ${vocabHTML}

            <div class="grid grid-cols-1 gap-10">
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center"><i class="fas fa-file-pdf"></i></div> Modul Presentasi
                    </h3>
                    ${pdfViewerHTML}
                </div>
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><i class="fas fa-clipboard-check"></i></div> Catatan Rangkuman
                    </h3>
                    ${recapViewerHTML}
                </div>
            </div>
        </div>
    `;
}

// ==== RESCHEDULE (ELEGAN & JELAS) ====
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
    if (!oldDateStr) { gridContainer.innerHTML = '<div class="col-span-full py-10 text-center text-sm font-medium text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Silakan pilih jadwal awal untuk melihat slot tersedia.</div>'; return; }

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
                 gridHTML += `<div class="p-6 rounded-2xl border-2 ${isPendingOld ? 'border-amber-400 bg-amber-50' : 'border-indigo-400 bg-indigo-50'} flex flex-col items-center text-center">
                    <div class="font-bold ${isPendingOld ? 'text-amber-800' : 'text-indigo-800'} text-sm mb-4 border-b border-indigo-200 pb-2 w-full">${displayDay}</div>
                    <i class="fas ${isPendingOld ? 'fa-hourglass-half text-amber-500 fa-spin' : 'fa-calendar-day text-indigo-400'} text-3xl mb-3"></i>
                    <div class="text-xs font-bold ${isPendingOld ? 'text-amber-600' : 'text-indigo-600'}">${isPendingOld ? 'Dalam Proses Validasi' : 'Jadwal Saat Ini'}</div>
                </div>`;
            } else if (isPendingNew) {
                gridHTML += `<div class="p-6 rounded-2xl border-2 border-blue-300 bg-blue-50 flex flex-col items-center text-center">
                    <div class="font-bold text-blue-800 text-sm mb-4 border-b border-blue-200 pb-2 w-full">${displayDay}</div>
                    <i class="fas fa-spinner fa-spin text-blue-400 text-3xl mb-3"></i>
                    <div class="text-xs font-bold text-blue-600">Menunggu Persetujuan</div>
                </div>`;
            } else {
                 gridHTML += `<div class="p-6 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center text-center">
                    <div class="font-bold text-slate-500 text-sm mb-4 border-b border-slate-200 pb-2 w-full">${displayDay}</div>
                    <i class="fas fa-calendar-check text-slate-300 text-3xl mb-3"></i>
                    <div class="text-xs font-semibold text-slate-500">Telah Terjadwal</div>
                </div>`;
            } continue;
        }

        if (isPast) {
            gridHTML += `<div class="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col items-center text-center opacity-60">
                <div class="font-bold text-slate-400 text-sm mb-4 border-b border-slate-100 pb-2 w-full">${displayDay}</div>
                <div class="text-xs font-medium text-slate-400 py-4">Waktu Berlalu</div>
            </div>`; continue;
        }

        let clashingTime = null;
        for (let s of students) { if (s.email === currentUser.email) continue; if (isOccupied(s.email, currStr)) { let otherP = materials[`profile-${s.email}`]; if (checkOverlap(p.time, otherP.time)) { clashingTime = otherP.time; break; } } }

        if (clashingTime) {
            gridHTML += `<div class="p-6 rounded-2xl border border-slate-200 bg-white flex flex-col text-center">
                    <div class="font-bold text-slate-700 text-sm mb-4 border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center mb-4">
                        <i class="fas fa-user-lock text-slate-300 text-2xl mb-2"></i>
                        <span class="text-xs font-semibold text-slate-500">Slot Terisi</span>
                    </div>
                    <button disabled class="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-400">Unavailable</button>
                </div>`;
        } else {
            if (isPendingOld) {
                gridHTML += `<div class="p-6 rounded-2xl border border-slate-200 bg-white flex flex-col text-center opacity-50">
                    <div class="font-bold text-slate-500 text-sm mb-4 border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="text-xs font-medium text-slate-400 py-4">Aksi Terkunci</div>
                </div>`;
            } else {
                gridHTML += `<div class="p-6 rounded-2xl border border-slate-200 bg-white flex flex-col text-center hover-card hover:border-emerald-300">
                    <div class="font-bold text-slate-700 text-sm mb-4 border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center mb-4">
                        <i class="fas fa-check-circle text-emerald-400 text-3xl mb-2"></i>
                        <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-wide">Available</span>
                    </div>
                    <button onclick="processReschedule('${currStr}')" class="w-full py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-md">
                        Pilih Slot
                    </button>
                </div>`;
            }
        }
    } gridContainer.innerHTML = gridHTML;
}

function renderReschedule() {
    autoCloseSidebar();
    let p = materials[`profile-${currentUser.email}`]; let nextSeshInfo = getStudentNextSessionInfo(currentUser.email);
    let isBlocked = false; let rescheduleHeader = '';

    if (nextSeshInfo.expired) {
        rescheduleHeader = `<div class="bg-red-50 border border-red-200 p-6 rounded-2xl mb-8"><p class="text-sm font-semibold text-red-700"><i class="fas fa-lock mr-2"></i> Fitur dibatasi karena masa aktif telah berakhir.</p></div>`; isBlocked = true;
    } else if (nextSeshInfo.error) {
        rescheduleHeader = `<div class="bg-slate-50 border border-slate-200 p-6 rounded-2xl mb-8"><p class="text-sm font-semibold text-slate-600"><i class="fas fa-info-circle mr-2"></i> Penjadwalan belum diaktifkan oleh admin.</p></div>`; isBlocked = true;
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
            <div class="bg-white border border-slate-200 p-8 rounded-3xl mb-8 shadow-sm">
                <h3 class="text-base font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-exchange-alt text-indigo-500"></i> Form Penyesuaian Jadwal</h3>
                <label class="block text-sm font-semibold text-slate-600 mb-2">Pilih jadwal saat ini yang akan dipindahkan:</label>
                <div class="flex flex-col md:flex-row items-center gap-4">
                    <select id="reschedule-old-day" onchange="updateRescheduleGrid()" class="w-full md:w-[400px] border border-slate-300 py-3 px-4 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 cursor-pointer">
                        ${upcomingOptions.length > 0 ? upcomingOptions.join('') : '<option value="">Tidak ada kelas tersedia</option>'}
                    </select>
                    <div class="px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100 text-sm font-bold text-indigo-700 w-full md:w-auto text-center"><i class="far fa-clock mr-1"></i> Jam: ${p.time}</div>
                </div>
            </div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto fade-in pb-12">
            <h2 class="text-2xl font-bold text-slate-800 mb-6">Penjadwalan Ulang Kelas</h2>
            ${rescheduleHeader}
            ${!isBlocked ? `<div id="reschedule-grid-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"></div>` : ''}
        </div>
    `;
    if (!isBlocked) window.updateRescheduleGrid();
}

// ==== ADMIN CMS (TERORGANISIR DENGAN CARD MODERN) ====
window.checkVocabStatus = async function(btnElement) {
    let resDiv = document.getElementById('vocab-review-result'); let origText = '';
    if(btnElement) { origText = btnElement.innerHTML; btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cek Server...'; btnElement.disabled = true; } 
    else { resDiv.innerHTML = `<div class="text-sm font-medium text-slate-400 py-4 text-center">Menyinkronkan data terbaru...</div>`; }
    try { const { data } = await window.supabaseClient.from('app_data').select('*'); if (data) { const matData = data.find(d => d.key === 'hes_materials'); if (matData && matData.value) materials = matData.value; } } catch(e) {}
    if(btnElement) { btnElement.innerHTML = origText; btnElement.disabled = false; }
    
    const email = document.getElementById('admin-review-student').value; const m = document.getElementById('admin-review-month').value; const w = document.getElementById('admin-review-week').value; const d = document.getElementById('admin-review-day').value;
    let statusObj = materials[`vocab_status-${email}-${m}-w${w}-d${d}`];
    
    if (!statusObj || statusObj.status === 'none') { resDiv.innerHTML = `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 text-center">Belum ada tugas disubmit.</div>`; } 
    else if (statusObj.status === 'submitted') {
        resDiv.innerHTML = `
            <div class="bg-amber-50 p-5 rounded-xl border border-amber-200 mt-4">
                <p class="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2"><i class="fas fa-bell text-amber-500"></i> Tugas siap diverifikasi.</p>
                <input type="text" id="admin-feedback" placeholder="Tambahkan catatan positif..." class="w-full p-3 border border-amber-200 rounded-lg text-sm font-medium mb-3 outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                <button onclick="approveVocab('${email}', '${m}', '${w}', '${d}')" class="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 shadow-md">Verifikasi & Approve</button>
            </div>`;
    } else if (statusObj.status === 'approved') {
        resDiv.innerHTML = `<div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-sm font-bold text-emerald-700 text-center mt-4"><i class="fas fa-check-circle mr-2"></i> Telah diverifikasi.</div>`;
    }
}

window.approveVocab = async function(email, m, w, d) {
    let feedback = document.getElementById('admin-feedback').value || 'Pekerjaan yang bagus, pertahankan!';
    let key = `vocab_status-${email}-${m}-w${w}-d${d}`; materials[key] = { status: 'approved', feedback: feedback };
    document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default';
    if (error) alert("Error: " + error.message); else { alert("Verifikasi sukses."); checkVocabStatus(); }
}

function renderAdminCMS() {
    autoCloseSidebar(); if (userRole !== 'admin') return;

    const monthOptions = months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMonthOptions = months.map(m => `<option value="${m.id.replace('m','')}">Batas Akses: ${m.title}</option>`).join('');
    const weekOptions = [1,2,3,4].map(w => `<option value="${w}">Week ${w}</option>`).join('');
    const dayOptions = [1,2,3].map(d => `<option value="${d}">Day ${d}</option>`).join('');
    const studentOptions = students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    let pendingReschedulesHTML = '';
    students.forEach(s => {
        let p = materials[`profile-${s.email}`];
        if (p && p.pendingReschedules) {
            for (const [oldD, newD] of Object.entries(p.pendingReschedules)) {
                pendingReschedulesHTML += `
                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between bg-white border border-slate-200 p-4 rounded-xl mb-3 hover-card">
                        <div class="mb-3 md:mb-0">
                            <span class="font-bold text-slate-800 block md:inline">${s.name}</span>
                            <span class="text-slate-400 hidden md:inline mx-2">|</span>
                            <span class="text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 block md:inline-block mt-2 md:mt-0">
                                ${getDisplayDate(parseDateStr(oldD))} <i class="fas fa-arrow-right text-indigo-400 mx-2"></i> ${getDisplayDate(parseDateStr(newD))}
                            </span>
                        </div>
                        <div class="flex gap-2 w-full md:w-auto">
                            <button onclick="approveReschedule('${s.email}', '${oldD}', '${newD}')" class="flex-1 md:flex-none bg-slate-900 text-white hover:bg-slate-800 px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors"><i class="fas fa-check mr-2"></i>Terima</button>
                            <button onclick="rejectReschedule('${s.email}', '${oldD}')" class="flex-1 md:flex-none bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"><i class="fas fa-times mr-2"></i>Tolak</button>
                        </div>
                    </div>
                `;
            }
        }
    });
    if (!pendingReschedulesHTML) pendingReschedulesHTML = `<div class="bg-slate-50 py-8 rounded-xl border border-dashed border-slate-200 text-center"><p class="text-slate-400 text-sm font-medium">Tidak ada antrean validasi jadwal saat ini.</p></div>`;

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-8 fade-in pb-16">
            <div class="mb-2">
                <h2 class="text-2xl md:text-3xl font-bold text-slate-800 mb-2">Administrative Control</h2>
                <p class="text-slate-500 font-medium text-sm">Pusat kontrol data, penjadwalan, dan modul pembelajaran.</p>
            </div>

            <!-- Group 1: Action Center -->
            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><i class="fas fa-bell"></i></div>
                    Validasi Perubahan Jadwal
                </h3>
                <div>${pendingReschedulesHTML}</div>
            </div>

            <!-- Group 2: Content Management -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Kosakata -->
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><i class="fas fa-book"></i></div>
                        Distribusi Kosakata
                    </h3>
                    <div class="grid grid-cols-3 gap-3 mb-4">
                        <select id="admin-vocab-month" class="border border-slate-200 bg-slate-50 py-2.5 px-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400">${monthOptions}</select>
                        <select id="admin-vocab-week" class="border border-slate-200 bg-slate-50 py-2.5 px-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400">${weekOptions}</select>
                        <select id="admin-vocab-day" class="border border-slate-200 bg-slate-50 py-2.5 px-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400">${dayOptions}</select>
                    </div>
                    <textarea id="admin-vocab-list" rows="5" placeholder="Format: Word = Arti" class="w-full p-4 border border-slate-200 bg-slate-50 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400 resize-none mb-4"></textarea>
                    <button onclick="saveVocabList(event)" class="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-colors">Publikasi Kosakata</button>
                </div>

                <!-- Tinjauan -->
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><i class="fas fa-check-double"></i></div>
                        Verifikasi Hafalan
                    </h3>
                    <select id="admin-review-student" class="w-full border border-slate-200 bg-slate-50 py-3 px-4 rounded-xl text-sm font-medium mb-4 outline-none focus:ring-2 focus:ring-emerald-400">${studentOptions}</select>
                    <div class="grid grid-cols-3 gap-3 mb-5">
                        <select id="admin-review-month" class="border border-slate-200 bg-slate-50 py-2.5 px-3 rounded-xl text-sm font-medium outline-none">${monthOptions}</select>
                        <select id="admin-review-week" class="border border-slate-200 bg-slate-50 py-2.5 px-3 rounded-xl text-sm font-medium outline-none">${weekOptions}</select>
                        <select id="admin-review-day" class="border border-slate-200 bg-slate-50 py-2.5 px-3 rounded-xl text-sm font-medium outline-none">${dayOptions}</select>
                    </div>
                    <button onclick="checkVocabStatus(this)" class="w-full bg-white border border-slate-300 text-slate-700 py-3 rounded-xl text-sm font-bold hover:bg-slate-50 shadow-sm transition-colors"><i class="fas fa-search mr-2"></i> Periksa Status</button>
                    <div id="vocab-review-result" class="mt-4 pt-2 border-t border-slate-100"></div>
                </div>
            </div>

            <!-- Group 3: File & Module Upload -->
            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><i class="fas fa-cloud-upload-alt"></i></div>
                    Manajemen Modul Dokumen (PDF)
                </h3>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6">
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Target Akses</label>
                        <select id="admin-target-student" class="w-full border border-slate-200 bg-slate-50 py-3 px-4 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-400 mb-4">
                            <option value="all">Global (Semua Murid)</option>
                            ${studentOptions}
                        </select>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Sesi</label>
                        <div class="grid grid-cols-3 gap-2">
                            <select id="admin-month" class="border border-slate-200 bg-slate-50 py-2.5 px-2 rounded-lg text-sm">${monthOptions}</select>
                            <select id="admin-week" class="border border-slate-200 bg-slate-50 py-2.5 px-2 rounded-lg text-sm">${weekOptions}</select>
                            <select id="admin-day" class="border border-slate-200 bg-slate-50 py-2.5 px-2 rounded-lg text-sm">${dayOptions}</select>
                        </div>
                    </div>
                    <div class="lg:col-span-2 space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"><i class="fab fa-google-drive text-blue-500 mr-1"></i> URL Presentasi</label>
                            <input type="text" id="admin-link" placeholder="Tautan Google Drive (Viewer)" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"><i class="fab fa-google-drive text-emerald-500 mr-1"></i> URL Rangkuman</label>
                            <input type="text" id="admin-recap-pdf" placeholder="Tautan Google Drive (Viewer)" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400">
                        </div>
                        <button onclick="saveMaterialData()" class="w-full md:w-auto bg-slate-900 text-white px-8 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-colors mt-2">Unggah Dokumen</button>
                    </div>
                </div>
            </div>

            <!-- Group 4: Konfigurasi Siswa & Kelas -->
            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><i class="fas fa-user-cog"></i></div>
                    Konfigurasi Jadwal Master
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Akun Murid</label>
                        <select id="admin-sched-student" class="w-full border border-slate-200 bg-white p-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-purple-400">${studentOptions}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Izin Akses Maksimal</label>
                        <select id="admin-sched-max-month" class="w-full border border-slate-200 bg-white p-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-purple-400">${maxMonthOptions}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Batas Masa Aktif</label>
                        <input type="date" id="admin-sched-date" class="w-full border border-slate-200 bg-white p-2.5 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-purple-400 text-slate-600">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Jam Kelas</label>
                        <div class="flex items-center gap-2">
                            <input type="time" id="admin-sched-start" class="w-full border border-slate-200 bg-white p-2 rounded-lg text-sm text-slate-600">
                            <span class="text-slate-400 font-bold">-</span>
                            <input type="time" id="admin-sched-end" class="w-full border border-slate-200 bg-white p-2 rounded-lg text-sm text-slate-600">
                        </div>
                    </div>
                </div>
                <div class="mb-6">
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Jadwal Kelas Default (Mingguan)</label>
                    <div class="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
                        <label class="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors"><input type="checkbox" value="Senin" class="admin-day-cb w-4 h-4 text-purple-600 rounded"> Sen</label>
                        <label class="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors"><input type="checkbox" value="Selasa" class="admin-day-cb w-4 h-4 text-purple-600 rounded"> Sel</label>
                        <label class="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors"><input type="checkbox" value="Rabu" class="admin-day-cb w-4 h-4 text-purple-600 rounded"> Rab</label>
                        <label class="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors"><input type="checkbox" value="Kamis" class="admin-day-cb w-4 h-4 text-purple-600 rounded"> Kam</label>
                        <label class="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors"><input type="checkbox" value="Jumat" class="admin-day-cb w-4 h-4 text-purple-600 rounded"> Jum</label>
                        <label class="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-purple-300 transition-colors"><input type="checkbox" value="Sabtu" class="admin-day-cb w-4 h-4 text-purple-600 rounded"> Sab</label>
                    </div>
                </div>
                <button onclick="saveStudentSchedule(event)" class="bg-slate-900 text-white px-8 py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-colors"><i class="fas fa-save mr-2"></i> Terapkan Pengaturan</button>
            </div>

            <!-- Group 5: Pendaftaran & Modul Setup -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                    <div class="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-2xl mb-4 shadow-sm"><i class="fas fa-folder-plus"></i></div>
                    <h3 class="text-lg font-bold text-slate-800 mb-2">Buka Modul Bulan Baru</h3>
                    <p class="text-sm font-medium text-slate-500 mb-6">Tambahkan kerangka bulan baru (Month) secara otomatis ke sistem.</p>
                    <button onclick="addNewMonth()" class="w-full max-w-xs bg-indigo-50 text-indigo-700 py-3 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors border border-indigo-200">Generate New Month</button>
                </div>
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3"><i class="fas fa-user-plus text-emerald-500"></i> Pendaftaran Akun</h3>
                    <input type="text" id="new-stu-name" placeholder="Nama Lengkap" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm mb-3 outline-none focus:ring-2 focus:ring-emerald-400">
                    <input type="email" id="new-stu-email" placeholder="Alamat Email" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm mb-3 outline-none focus:ring-2 focus:ring-emerald-400">
                    <input type="text" id="new-stu-pass" placeholder="Password Standar" class="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl text-sm mb-5 outline-none focus:ring-2 focus:ring-emerald-400">
                    <button onclick="addNewStudent()" class="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-colors">Daftarkan Akun</button>
                </div>
            </div>

            <!-- Group 6: Manajemen Database Murid -->
            <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 class="text-lg font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><i class="fas fa-database"></i></div>
                    Database Kredensial
                </h3>
                <div class="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] font-bold border-b border-slate-100">
                                <th class="p-4">Nama Lengkap</th>
                                <th class="p-4">Alamat Email</th>
                                <th class="p-4">Sandi Akses</th>
                                <th class="p-4 text-center">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map((s, idx) => `
                                <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors font-medium">
                                    <td class="p-4 text-slate-800">${s.name}</td>
                                    <td class="p-4 text-slate-500">${s.email}</td>
                                    <td class="p-4">
                                        <div class="flex items-center gap-3 bg-white border border-slate-200 px-3 py-1.5 rounded-lg w-max">
                                            <input type="password" value="${s.password}" id="pwd-${idx}" class="bg-transparent border-none w-16 outline-none text-slate-600 font-mono tracking-widest text-xs" readonly>
                                            <button onclick="togglePassword('pwd-${idx}')" class="text-slate-400 hover:text-indigo-500 transition-colors"><i class="fas fa-eye text-sm"></i></button>
                                        </div>
                                    </td>
                                    <td class="p-4">
                                        <div class="flex gap-2 justify-center">
                                            <button onclick="editStudentPassword('${s.email}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors" title="Ubah Password"><i class="fas fa-key text-xs"></i></button>
                                            <button onclick="deleteStudentAccount('${s.email}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors" title="Hapus Akun"><i class="fas fa-trash-alt text-xs"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${students.length === 0 ? '<p class="text-center text-slate-400 font-medium py-6">Database kosong.</p>' : ''}
                </div>
            </div>
        </div>
    `;
}

// ==== FUNGSI ADMIN DATABASE ====
window.approveReschedule = async function(email, oldDate, newDate) {
    let p = materials[`profile-${email}`]; if(!p.reschedules) p.reschedules = {};
    p.reschedules[oldDate] = newDate; delete p.pendingReschedules[oldDate];
    document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default';
    if (error) alert("Error: " + error.message); else { alert("Perubahan disetujui."); renderAdminCMS(); }
}

window.rejectReschedule = async function(email, oldDate) {
    if(confirm("Tolak pengajuan pemindahan jadwal ini?")) {
        let p = materials[`profile-${email}`]; delete p.pendingReschedules[oldDate]; 
        document.body.style.cursor = 'wait'; const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]); document.body.style.cursor = 'default';
        if (error) alert("Error: " + error.message); else { alert("Permintaan ditolak."); renderAdminCMS(); }
    }
}

window.saveVocabList = async function(e) {
    const m = document.getElementById('admin-vocab-month').value; const w = document.getElementById('admin-vocab-week').value; const d = document.getElementById('admin-vocab-day').value; const vocabText = document.getElementById('admin-vocab-list').value;
    materials[`vocab-${m}-w${w}-d${d}`] = vocabText;
    const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    btn.innerHTML = origText; btn.disabled = false;
    if (error) alert("Error: " + error.message); else { alert("Data berhasil dipublikasi."); document.getElementById('admin-vocab-list').value = ''; }
}

window.togglePassword = function(id) { const input = document.getElementById(id); if(input.type === 'password') input.type = 'text'; else input.type = 'password'; }

window.editStudentPassword = async function(email) {
    const studentIndex = students.findIndex(s => s.email === email); if(studentIndex === -1) return;
    const newPassword = prompt(`Masukkan password baru untuk akses akun ${students[studentIndex].name}:`, students[studentIndex].password);
    if(newPassword !== null && newPassword.trim() !== '') {
        students[studentIndex].password = newPassword.trim();
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);
        if (error) alert("Terjadi kesalahan: " + error.message); else { renderAdminCMS(); }
    }
}

window.deleteStudentAccount = async function(email) {
    if(confirm(`PERINGATAN: Akun ${email} akan dihapus secara permanen dari sistem. Lanjutkan?`)) {
        const newStudents = students.filter(s => s.email !== email);
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: newStudents }]);
        if (error) alert("Terjadi kesalahan: " + error.message); else { students = newStudents; renderAdminCMS(); }
    }
}

window.saveStudentSchedule = async function(e) {
    const email = document.getElementById('admin-sched-student').value; const dateInput = document.getElementById('admin-sched-date').value; const startTime = document.getElementById('admin-sched-start').value; const endTime = document.getElementById('admin-sched-end').value; const maxMonthInput = document.getElementById('admin-sched-max-month').value;
    const checkboxes = document.querySelectorAll('.admin-day-cb:checked'); const selectedDays = Array.from(checkboxes).map(cb => cb.value);

    let profile = materials[`profile-${email}`] || {};
    profile.validUntil = dateInput || profile.validUntil || 'Belum diatur';
    if (startTime && endTime) { profile.time = `${startTime} - ${endTime}`; } else { profile.time = profile.time || 'Belum diatur'; }
    profile.maxMonth = maxMonthInput || profile.maxMonth || 1;
    if(selectedDays.length > 0) profile.days = selectedDays;
    
    materials[`profile-${email}`] = profile;
    const btn = e.currentTarget; const origText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sinkronisasi...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    btn.innerHTML = origText; btn.disabled = false;
    if (error) alert("Gagal menyimpan: " + error.message); else { alert("Pengaturan jadwal berhasil disinkronisasi ke server."); }
}

window.addNewMonth = async function() {
    const nextNum = months.length + 1; const newMonth = { id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] }; months.push(newMonth);
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_months', value: months }]);
    if (error) { alert("Sistem error: " + error.message); months.pop(); } else { alert(`Modul Month ${nextNum} berhasil di-generate.`); renderSidebar(); renderAdminCMS(); }
};

window.addNewStudent = async function() {
    const name = document.getElementById('new-stu-name').value; const email = document.getElementById('new-stu-email').value; const pass = document.getElementById('new-stu-pass').value;
    if(!name || !email || !pass) { alert("Lengkapi data yang dibutuhkan."); return; }
    students.push({ name: name, email: email, password: pass });
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);
    if (error) { alert("Sistem error: " + error.message); students.pop(); } else { alert(`Akun ${name} berhasil diaktivasi.`); renderAdminCMS(); }
}

window.saveMaterialData = async function() {
    const targetStudent = document.getElementById('admin-target-student').value; const m = document.getElementById('admin-month').value; const w = document.getElementById('admin-week').value; const d = document.getElementById('admin-day').value;
    const link = document.getElementById('admin-link').value; const recap = document.getElementById('admin-recap-pdf').value;
    const keyPrefix = `${targetStudent}-${m}-w${w}-d${d}`;
    if(link) materials[`${keyPrefix}-link`] = link; if(recap) materials[`${keyPrefix}-recap`] = recap;
    
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    if (error) { alert("Kegagalan unggah: " + error.message); } else { alert("Dokumen berhasil disematkan."); document.getElementById('admin-link').value = ''; document.getElementById('admin-recap-pdf').value = ''; }
};