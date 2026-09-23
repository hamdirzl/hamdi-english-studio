// script.js

// ==== KONFIGURASI NOTIFIKASI TELEGRAM ====
const TELEGRAM_BOT_TOKEN = "8783483454:AAFIMaNa4Z5-uUMXHOeqHZgkk2S9EK4gC0Y"; 
// MASUKKAN ANGKA ID ANDA DI BAWAH INI (Dapatkan dari @userinfobot)
const TELEGRAM_CHAT_ID = "1225652735";

function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "TOKEN_BOT_ANDA_DISINI" || !TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === "CHAT_ID_ANDA_DISINI") {
        console.warn("Telegram Chat ID belum diatur. Notifikasi dibatalkan.");
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    }).catch(e => console.error("Gagal kirim Telegram", e));
}

// ==== STATE & DATA AWAL ====
let currentUser = null;
let userRole = null; 

let months = [
    { id: 'm1', title: 'Month 1', weeks: [1, 2, 3, 4] },
    { id: 'm2', title: 'Month 2', weeks: [1, 2, 3, 4] }
];
let materials = {};
let students = [
    { email: 'murid@gmail.com', password: '123', name: 'Murid Pertama' }
];

// ==== HELPER TANGGAL & WAKTU ====
const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatDateForID(dateObj) {
    return dateObj.getFullYear() + '-' + String(dateObj.getMonth()+1).padStart(2,'0') + '-' + String(dateObj.getDate()).padStart(2,'0');
}

function parseDateStr(str) {
    let parts = str.split('-');
    return new Date(parts[0], parts[1]-1, parts[2]);
}

function getDisplayDate(dateObj) {
    return `${dayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

// Mengecek apakah seorang murid memiliki jadwal pada tanggal spesifik
function isOccupied(email, targetDateStr) {
    let p = materials[`profile-${email}`];
    if(!p || !p.time || !p.days) return false;
    
    let targetDate = parseDateStr(targetDateStr);
    let dayName = dayNames[targetDate.getDay()];
    
    let validDate = new Date(p.validUntil);
    if (!isNaN(validDate)) {
        validDate.setHours(23,59,59,999);
        if (targetDate > validDate) return false;
    }

    let isDefault = p.days.includes(dayName);
    let reschedules = p.reschedules || {}; 
    let pendingReschedules = p.pendingReschedules || {};
    
    let movedAway = reschedules[targetDateStr] !== undefined; 
    let movedHere = Object.values(reschedules).includes(targetDateStr); 
    let pendingMoveAway = pendingReschedules[targetDateStr] !== undefined; 
    let pendingMoveHere = Object.values(pendingReschedules).includes(targetDateStr); 
    
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
    if (!p || !p.days || p.days.length === 0) return { error: 'Belum ada hari kelas yang dipilih.' };
    if (!p.validUntil || p.validUntil === 'Belum diatur') return { error: 'Masa aktif belum diatur admin.' };
    
    let today = new Date();
    today.setHours(0,0,0,0);
    
    let validDate = new Date(p.validUntil);
    let isValid = !isNaN(validDate);
    if (isValid) validDate.setHours(23,59,59,999);
    
    if (isValid && today > validDate) return { expired: true, validDateStr: getDisplayDate(validDate) };
    
    for(let i=0; i<30; i++) {
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
    return { error: 'Tidak ada jadwal dalam 30 hari ke depan atau langganan telah habis.' };
}

// ==== SINKRONISASI DATA ONLINE DARI SUPABASE ====
async function fetchCloudData() {
    try {
        const { data, error } = await window.supabaseClient.from('app_data').select('*');
        if (data) {
            const mData = data.find(d => d.key === 'hes_months');
            const matData = data.find(d => d.key === 'hes_materials');
            const stuData = data.find(d => d.key === 'hes_students');
            
            if (mData && mData.value) months = mData.value;
            if (matData && matData.value) materials = matData.value;
            if (stuData && stuData.value) students = stuData.value;
            
            // Jika user sedang login (dari LocalStorage), update tampilan dengan data terbaru
            if (currentUser) {
                renderSidebar();
                if (document.getElementById('main-content').innerHTML.includes('Welcome Back')) renderDashboard();
                if (document.getElementById('main-content').innerHTML.includes('Pusat Ganti Jadwal')) renderReschedule();
                if (document.getElementById('main-content').innerHTML.includes('Manajemen Akun Murid')) renderAdminCMS();
            }
        }
    } catch (e) {
        console.error("Gagal sinkronisasi data online", e);
    }
}
fetchCloudData();

// ==== ELEMEN DOM & EVENT LISTENERS ====
const loginPage = document.getElementById('login-page');
const appPage = document.getElementById('app-page');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const sidebar = document.getElementById('sidebar');
const sidebarMenu = document.getElementById('sidebar-menu');
const mainContent = document.getElementById('main-content');

// ==== CEK SESI LOGIN (MENCEGAH LOGOUT SAAT REFRESH) ====
function checkExistingSession() {
    const savedUser = localStorage.getItem('hes_session_user');
    const savedRole = localStorage.getItem('hes_session_role');
    if (savedUser && savedRole) {
        currentUser = JSON.parse(savedUser);
        userRole = savedRole;
        loginSuccess(false); // Parameter false agar tidak perlu resave ke localStorage
    }
}
checkExistingSession();

document.getElementById('open-sidebar').addEventListener('click', () => { sidebar.classList.remove('-translate-x-full'); });
document.getElementById('close-sidebar').addEventListener('click', () => { sidebar.classList.add('-translate-x-full'); });
document.getElementById('logout-btn').addEventListener('click', handleLogout);

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (email === 'hamdirizall1@gmail.com' && password === 'admin') {
        userRole = 'admin'; currentUser = { name: 'Bro Hamdi', email: email }; loginSuccess(true);
    } else {
        const student = students.find(s => s.email === email && s.password === password);
        if (student) { userRole = 'student'; currentUser = student; loginSuccess(true); } 
        else { loginError.classList.remove('hidden'); }
    }
});

function loginSuccess(saveSession = true) {
    // Simpan sesi ke LocalStorage jika ini login manual yang baru
    if (saveSession) {
        localStorage.setItem('hes_session_user', JSON.stringify(currentUser));
        localStorage.setItem('hes_session_role', userRole);
    }
    
    loginPage.classList.add('hidden');
    appPage.classList.remove('hidden');
    const initial = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-avatar').innerText = initial;
    document.getElementById('user-name-display').innerText = `Hi, ${currentUser.name}`;
    document.getElementById('user-role-display').innerText = userRole === 'admin' ? 'Administrator' : 'Student';
    renderSidebar(); renderDashboard();
}

function handleLogout() {
    // Hapus sesi saat logout
    localStorage.removeItem('hes_session_user');
    localStorage.removeItem('hes_session_role');
    
    currentUser = null; userRole = null;
    document.getElementById('email').value = ''; document.getElementById('password').value = '';
    loginError.classList.add('hidden'); appPage.classList.add('hidden'); loginPage.classList.remove('hidden');
}

// ==== RENDER SIDEBAR ====
function renderSidebar() {
    let menuHTML = '<div class="space-y-2">';

    if (userRole === 'admin') {
        menuHTML += `
            <button onclick="renderAdminCMS()" class="w-full flex items-center px-4 py-3.5 text-sm font-semibold rounded-xl text-amber-700 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 hover:border-amber-300 hover:shadow-sm transition-all">
                <div class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mr-3 text-amber-600"><i class="fas fa-cog"></i></div>
                Admin CMS
            </button>
        `;
    }

    menuHTML += `
        <button onclick="renderDashboard()" class="w-full flex items-center px-4 py-3.5 text-sm font-semibold rounded-xl text-slate-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all">
            <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mr-3 text-slate-500"><i class="fas fa-home"></i></div>
            Dashboard Utama
        </button>
        <button onclick="renderReschedule()" class="w-full flex items-center px-4 py-3.5 text-sm font-semibold rounded-xl text-indigo-700 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 hover:border-indigo-300 hover:shadow-sm transition-all">
            <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center mr-3 text-indigo-600"><i class="fas fa-calendar-alt"></i></div>
            Reschedule Jadwal
        </button>
    </div>
    <div class="px-2 py-4 mt-4">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-2">Materi Kelas</p>
        <div class="space-y-1.5">
    `;

    let maxMonthNum = 1; 
    if (userRole === 'student') {
        let p = materials[`profile-${currentUser.email}`];
        if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth);
    }

    months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = userRole === 'student' && currentMonthNum > maxMonthNum;

        if (isLocked) {
            menuHTML += `
                <div class="rounded-xl overflow-hidden border border-slate-100 mb-1 opacity-70">
                    <div class="px-4 py-3.5 flex justify-between items-center bg-slate-50 cursor-not-allowed" onclick="alert('Bulan ini masih terkunci (Tergembok) 🔒\\n\\nSelesaikan bulan sebelumnya atau hubungi Bro Hamdi untuk membuka akses ke ${month.title}.')">
                        <div class="flex items-center gap-3 text-slate-400 font-semibold text-sm">
                            <i class="fas fa-lock text-slate-300"></i> ${month.title}
                        </div>
                    </div>
                </div>
            `;
        } else {
            menuHTML += `
                <div class="rounded-xl overflow-hidden border border-transparent hover:border-slate-200 transition-colors">
                    <div class="px-4 py-3.5 flex justify-between items-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors" onclick="toggleMenu('m-${month.id}', this)">
                        <div class="flex items-center gap-3 text-slate-700 font-semibold text-sm">
                            <i class="fas fa-folder text-indigo-400"></i> ${month.title}
                        </div>
                        <i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform duration-200"></i>
                    </div>
                    <div id="m-${month.id}" class="hidden bg-white border-l-2 border-indigo-100 ml-5 my-1 pl-2 space-y-1">
            `;
            month.weeks.forEach(week => {
                menuHTML += `
                    <div>
                        <div class="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer flex justify-between items-center transition-colors" onclick="toggleMenu('w-${month.id}-${week}', this)">
                            <span>Week ${week}</span>
                            <i class="fas fa-angle-down text-[10px] transition-transform duration-200"></i>
                        </div>
                        <div id="w-${month.id}-${week}" class="hidden pl-4 py-1 space-y-1">
                `;
                [1, 2, 3].forEach(day => {
                    menuHTML += `
                        <div class="px-3 py-2 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-lg cursor-pointer flex items-center transition-colors" onclick="renderMateri('${month.id}', ${week}, ${day}, '${month.title}')">
                            <div class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-3"></div> Day ${day}
                        </div>
                    `;
                });
                menuHTML += `</div></div>`;
            });
            menuHTML += `</div></div>`;
        }
    });
    menuHTML += `</div></div>`;
    sidebarMenu.innerHTML = menuHTML;
}

function toggleMenu(id, el) {
    const target = document.getElementById(id);
    const icon = el.querySelector('.fa-chevron-down, .fa-angle-down');
    if (target.classList.contains('hidden')) {
        target.classList.remove('hidden'); if(icon) icon.style.transform = 'rotate(180deg)';
    } else {
        target.classList.add('hidden'); if(icon) icon.style.transform = 'rotate(0deg)';
    }
}
function autoCloseSidebar() { if (window.innerWidth < 768) { sidebar.classList.add('-translate-x-full'); } }

// ==== HALAMAN DASHBOARD ====
function renderDashboard() {
    autoCloseSidebar();
    
    if (userRole === 'admin') {
        let adminGridHTML = '';
        let todayAdmin = new Date(); todayAdmin.setHours(0,0,0,0);
        let pendingRescheduleCount = 0;
        
        for(let i=0; i<7; i++) {
            let curr = new Date(todayAdmin); curr.setDate(todayAdmin.getDate()+i);
            let currStr = formatDateForID(curr);
            let displayDay = getDisplayDate(curr);
            
            let bookings = [];
            students.forEach(s => {
                let p = materials[`profile-${s.email}`];
                if (isOccupied(s.email, currStr)) {
                    let isPendingMoveAway = p.pendingReschedules && p.pendingReschedules[currStr] !== undefined;
                    let isPendingMoveHere = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
                    
                    let statusLabel = isPendingMoveAway ? ' (Pengajuan Pindah)' : (isPendingMoveHere ? ' (Pending Masuk)' : '');
                    let color = isPendingMoveAway ? 'bg-amber-100 text-amber-700' : (isPendingMoveHere ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700');
                    
                    bookings.push(`<span class="text-xs ${color} px-2 py-1 rounded font-bold">${p.time}</span> <span class="text-sm font-semibold">${s.name} ${statusLabel}</span>`);
                }
                
                // Hitung total pending reschedule khusus untuk notifikasi banner
                if (i === 0 && p && p.pendingReschedules) {
                    pendingRescheduleCount += Object.keys(p.pendingReschedules).length;
                }
            });
            
            let listHTML = bookings.length === 0 
                ? `<p class="text-sm text-slate-400 italic">Tidak ada kelas</p>` 
                : bookings.map(b => `<div class="flex items-center gap-2 bg-slate-50 p-2 border border-slate-100 rounded-lg mb-2">${b}</div>`).join('');
                
            adminGridHTML += `
                <div class="bg-white p-5 rounded-2xl shadow-sm border ${i===0?'border-amber-300 ring-4 ring-amber-50':'border-slate-200'}">
                    <h4 class="font-bold ${i===0?'text-amber-600':'text-slate-800'} border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                        <i class="fas fa-calendar-day ${i===0?'text-amber-500':'text-slate-400'}"></i> ${i===0?'HARI INI - ':''}${displayDay}
                    </h4>
                    ${listHTML}
                </div>
            `;
        }

        // Tampilkan Banner Peringatan jika ada Reschedule yang menunggu
        let alertHTML = '';
        if (pendingRescheduleCount > 0) {
            alertHTML = `
                <div class="bg-amber-50 border-2 border-amber-300 p-5 rounded-2xl mb-8 flex flex-col md:flex-row items-center justify-between shadow-md relative overflow-hidden animate-pulse">
                    <div class="flex items-center gap-4 mb-4 md:mb-0 z-10">
                        <div class="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-xl shrink-0"><i class="fas fa-bell"></i></div>
                        <div>
                            <h4 class="font-bold text-amber-900 text-lg">Ada ${pendingRescheduleCount} Permintaan Reschedule!</h4>
                            <p class="text-amber-700 text-sm font-medium">Murid sedang menunggu persetujuan ganti jadwal dari Anda.</p>
                        </div>
                    </div>
                    <button onclick="renderAdminCMS()" class="w-full md:w-auto bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-amber-200 z-10 flex items-center justify-center gap-2">
                        Lihat & Setujui <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            `;
        }

        mainContent.innerHTML = `
            <div class="max-w-6xl mx-auto fade-in pb-10">
                <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                    <div class="relative z-10 flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <h2 class="text-3xl md:text-4xl font-bold mb-3">Welcome Back, Bro Hamdi! 🚀</h2>
                            <p class="text-indigo-100 text-lg max-w-xl">Ini adalah jadwal mengajar aktual Anda untuk 7 hari ke depan (termasuk hasil Reschedule murid).</p>
                        </div>
                        <div class="bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center">
                            <p class="text-xs uppercase tracking-wider font-semibold text-indigo-100 mb-1">Total Murid Aktif</p>
                            <p class="text-4xl font-bold">${students.length}</p>
                        </div>
                    </div>
                </div>
                
                ${alertHTML}
                
                <h3 class="text-2xl font-bold text-slate-800 mb-4 px-2">📅 Master Jadwal 7 Hari Kedepan</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    ${adminGridHTML}
                </div>
            </div>
        `;
        return;
    }

    // --- LOGIKA UNTUK MURID ---
    let latestMonth = "Belum Ada"; let latestWeek = "-"; let latestDay = "-";
    let progressText = "Belum ada materi yang tersedia untukmu saat ini.";
    
    months.forEach(m => {
        m.weeks.forEach(w => {
            [1,2,3].forEach(d => {
                if (materials[`${currentUser.email}-${m.id}-w${w}-d${d}-link`] || materials[`all-${m.id}-w${w}-d${d}-link`]) {
                    latestMonth = m.title; latestWeek = w; latestDay = d;
                    progressText = `Kamu saat ini berada di <b>${m.title} - Week ${w} Day ${d}</b>. Mari lanjutkan pelajaranmu!`;
                }
            });
        });
    });

    let nextSesh = getStudentNextSessionInfo(currentUser.email);
    let profile = materials[`profile-${currentUser.email}`] || {};
    let premiumCardContent = '';
    
    if (nextSesh.expired) {
        premiumCardContent = `
            <div class="bg-red-500/90 border border-red-400 p-5 rounded-2xl relative z-10 backdrop-blur-sm shadow-inner mt-2">
                <p class="text-white font-bold text-xl mb-1 flex items-center gap-2"><i class="fas fa-exclamation-triangle text-yellow-300"></i> Langganan Habis</p>
                <p class="text-sm text-red-50 mb-4 leading-relaxed">Kamu belum berlangganan untuk kursus bulan berikutnya. Masa aktif belajarmu telah habis pada <b>${nextSesh.validDateStr}</b>.</p>
                <button onclick="alert('Silakan hubungi Bro Hamdi via WhatsApp untuk memperpanjang langganan.')" class="w-full bg-white text-red-600 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-100 transition-colors">
                    Perpanjang Sekarang
                </button>
            </div>
        `;
    } else if (nextSesh.error) {
        premiumCardContent = `
            <div class="bg-black/20 border border-white/10 rounded-2xl p-4 md:p-5 relative z-10 backdrop-blur-sm">
                <p class="text-amber-300 font-semibold"><i class="fas fa-info-circle"></i> ${nextSesh.error} Tunggu Admin mengatur jadwalmu.</p>
            </div>
        `;
    } else {
        premiumCardContent = `
            <div class="bg-black/20 border border-white/10 rounded-2xl p-4 md:p-5 flex items-center gap-4 relative z-10 backdrop-blur-sm">
                <div class="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center shrink-0 border border-amber-500/30">
                    <i class="fas fa-clock text-lg"></i>
                </div>
                <div>
                    <p class="text-xs font-semibold text-amber-400/90 tracking-wider mb-1 uppercase">Kursus Selanjutnya:</p>
                    <p class="font-bold text-lg md:text-xl text-white mb-0.5 tracking-wide">${nextSesh.displayDate}</p>
                    <p class="text-sm text-amber-200 font-semibold mb-2">Jam: ${nextSesh.time}</p>
                    <div class="inline-block px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold uppercase tracking-widest border border-amber-500/30">
                        Aktif s/d: ${nextSesh.validDateStr}
                    </div>
                </div>
            </div>
        `;
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-10">
            <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                <div class="relative z-10">
                    <div class="flex flex-wrap items-center gap-3 mb-3">
                        <h2 class="text-3xl md:text-4xl font-bold">Welcome Back, ${currentUser.name.split(' ')[0]}!</h2>
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-md shadow-amber-200">
                            <i class="fas fa-crown mr-1"></i> 👑 VIP Exclusive
                        </span>
                    </div>
                    <p class="text-indigo-100 text-lg max-w-xl">Konsistensi adalah kunci kesuksesan dalam berbahasa Inggris.</p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- PREMIUM SCHEDULE CARD -->
                <div class="bg-gradient-to-br from-slate-800 to-slate-900 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-700 relative overflow-hidden text-white group hover:shadow-2xl hover:shadow-amber-900/20 transition-all">
                    <div class="absolute top-[-30%] right-[-10%] w-56 h-56 bg-amber-500 rounded-full mix-blend-overlay filter blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-500"></div>
                    <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-amber-400 mb-4 backdrop-blur-md border border-white/10">
                        <i class="fas fa-calendar-check text-xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-1">Jadwal Kelas Terdekat</h3>
                    <p class="text-slate-400 text-sm font-medium mb-4">Pastikan hadir tepat waktu (On Time).</p>
                    ${premiumCardContent}
                </div>

                <!-- Progress Card -->
                <div class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div class="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 mb-5">
                        <i class="fas fa-chart-line text-xl"></i>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 mb-3">Progress Belajarmu</h3>
                    <p class="text-slate-600 font-medium mb-6 leading-relaxed">${progressText}</p>
                    
                    <div class="flex flex-wrap gap-2">
                        <span class="px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-sm font-bold shadow-sm">${latestMonth}</span>
                        <span class="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm font-bold shadow-sm">Week ${latestWeek}</span>
                        <span class="px-3 py-1.5 bg-sky-50 border border-sky-100 text-sky-700 rounded-lg text-sm font-bold shadow-sm">Day ${latestDay}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==== HALAMAN MATERI, RECAP & DAILY VOCABULARY ====
function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//);
        if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return link;
}

// FUNGSI SUBMIT VOCABULARY YANG SUDAH DILENGKAPI EFEK LOADING DAN NOTIFIKASI
window.submitVocab = async function(btnElement, m, w, d) {
    let key = `vocab_status-${currentUser.email}-${m}-w${w}-d${d}`;
    materials[key] = { status: 'submitted', feedback: '' };
    
    // Memberikan Efek Loading Interaktif di Tombol
    const origText = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sedang Mengirim...'; 
    btnElement.disabled = true;
    btnElement.classList.add('opacity-70', 'cursor-not-allowed');
    
    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) {
        alert("Error: " + error.message);
        btnElement.innerHTML = origText; 
        btnElement.disabled = false;
        btnElement.classList.remove('opacity-70', 'cursor-not-allowed');
    } else {
        // Pop-up Notifikasi Sukses Untuk Murid
        alert("🎉 Luar biasa!\n\nHafalanmu telah dikirim ke Bro Hamdi untuk direview. Silakan tunggu feedback di halaman ini nanti.");
        
        let monthTitle = months.find(mo=>mo.id===m)?.title || 'Materi';
        
        // Kirim Notifikasi Telegram ke Admin
        sendTelegramNotification(`📢 *Hafalan Masuk!*\n\nMurid: *${currentUser.name}*\nTelah menyetor hafalan Word Bank untuk:\nSesi: ${monthTitle} - W${w} D${d}.\n\nSegera cek dan berikan apresiasi di Admin CMS!`);
        
        // Render ulang halaman agar status tombol berubah
        renderMateri(m, w, d, monthTitle);
    }
}

function renderMateri(monthId, week, day, monthTitle) {
    autoCloseSidebar();
    const email = currentUser.email;
    let rawLink = materials[`${email}-${monthId}-w${week}-d${day}-link`] || materials[`all-${monthId}-w${week}-d${day}-link`] || '';
    let rawRecap = materials[`${email}-${monthId}-w${week}-d${day}-recap`] || materials[`all-${monthId}-w${week}-d${day}-recap`] || '';

    let linkDrive = parseDriveLink(rawLink);
    let recapDrive = parseDriveLink(rawRecap);

    // FITUR: KARTU GESER (SWIPEABLE) DAILY VOCABULARY
    let vocabData = materials[`vocab-${monthId}-w${week}-d${day}`] || '';
    let vocabStatus = materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none', feedback: '' };
    
    let vocabHTML = '';
    if (vocabData) {
        let words = vocabData.split('\n').filter(line => line.trim() !== '' && line.includes('='));
        let wordCards = words.map(w => {
            let parts = w.split('=');
            let en = parts[0] ? parts[0].trim() : '';
            let idText = parts[1] ? parts[1].trim() : '';
            return `
                <div class="snap-center shrink-0 w-48 md:w-56 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl border border-blue-100 text-center shadow-sm flex flex-col justify-center min-h-[100px]">
                    <p class="font-bold text-indigo-900 text-lg md:text-xl">${en}</p>
                    <p class="text-xs md:text-sm font-semibold text-blue-600 mt-1">${idText}</p>
                </div>
            `;
        }).join('');

        let actionUI = '';
        if (vocabStatus.status === 'none' || !vocabStatus.status) {
            actionUI = `<button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="w-full mt-6 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><i class="fas fa-check-circle"></i> Saya Sudah Hafal Semua!</button>`;
        } else if (vocabStatus.status === 'submitted') {
            actionUI = `<div class="mt-6 text-amber-700 font-bold bg-amber-50 p-4 text-center rounded-xl border border-amber-200 flex items-center justify-center gap-2 shadow-inner"><i class="fas fa-hourglass-half fa-spin"></i> Menunggu Bro Hamdi memverifikasi hafalanmu...</div>`;
        } else if (vocabStatus.status === 'approved') {
            actionUI = `<div class="mt-6 text-green-800 font-bold bg-green-50 p-5 text-center rounded-xl border border-green-200 shadow-inner">
                <div class="flex items-center justify-center gap-2 mb-2"><i class="fas fa-star text-yellow-500 text-xl"></i> <span class="text-lg">Hafalan Diverifikasi!</span> <i class="fas fa-star text-yellow-500 text-xl"></i></div>
                <p class="text-sm font-medium text-green-700 bg-green-100/50 inline-block px-4 py-2 rounded-lg border border-green-200">Pesan Bro Hamdi: "${vocabStatus.feedback}"</p>
            </div>`;
        }

        vocabHTML = `
            <div class="space-y-4 mb-10">
                <h3 class="text-xl font-bold text-slate-800 flex items-center">
                    <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mr-3"><i class="fas fa-spell-check"></i></div> Daily Vocabulary (Word Bank)
                </h3>
                <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative">
                    <div class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 md:hidden animate-pulse pointer-events-none"><i class="fas fa-chevron-right text-2xl"></i></div>
                    <p class="text-slate-500 text-sm font-medium mb-4"><i class="fas fa-info-circle text-blue-400"></i> Geser kartu ke samping untuk melihat semua kata.</p>
                    
                    <div class="flex overflow-x-auto gap-4 pb-4 snap-x custom-scrollbar">
                        ${wordCards}
                    </div>

                    ${userRole === 'student' ? actionUI : '<div class="mt-4 text-slate-500 text-sm text-center italic border-t border-slate-100 pt-4">Tampilan Word Bank. Status hafalan hanya muncul di akun murid.</div>'}
                </div>
            </div>
        `;
    }

    let pdfViewerHTML = linkDrive 
        ? `<div class="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 relative h-[80vh] w-full"><iframe src="${linkDrive}" class="absolute top-0 left-0 w-full h-full" allow="autoplay"></iframe></div>` 
        : `<div class="bg-slate-50 p-12 rounded-2xl text-center border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
             <div class="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4"><i class="fas fa-file-pdf text-2xl text-slate-300"></i></div>
             <p class="text-slate-500 font-medium">Materi presentasi belum diunggah.</p>
           </div>`;
           
    let recapViewerHTML = recapDrive 
        ? `<div class="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 relative h-[80vh] w-full mt-4"><iframe src="${recapDrive}" class="absolute top-0 left-0 w-full h-full" allow="autoplay"></iframe></div>` 
        : `<div class="bg-slate-50 p-12 rounded-2xl text-center border-2 border-dashed border-slate-200 flex flex-col items-center justify-center mt-4">
             <div class="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4"><i class="fas fa-clipboard-list text-2xl text-slate-300"></i></div>
             <p class="text-slate-500 font-medium">PDF Daily Recap belum diunggah.</p>
           </div>`;

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto fade-in pb-10">
            <div class="mb-8 flex items-center gap-4">
                <button onclick="renderDashboard()" class="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div>
                    <h2 class="text-2xl md:text-3xl font-bold text-slate-800">${monthTitle}</h2>
                    <p class="text-slate-500 font-semibold mt-1 flex items-center gap-2">
                        <span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs">Week ${week}</span>
                        <i class="fas fa-circle text-[4px]"></i>
                        <span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">Day ${day}</span>
                    </p>
                </div>
            </div>
            
            ${vocabHTML}

            <div class="flex flex-col space-y-10">
                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-slate-800 flex items-center">
                        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-500 mr-3"><i class="fas fa-file-pdf"></i></div> Materi Utama (Presentation Slide)
                    </h3>
                    ${pdfViewerHTML}
                </div>
                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-slate-800 flex items-center">
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600 mr-3"><i class="fas fa-clipboard-check"></i></div> Daily Recap
                    </h3>
                    ${recapViewerHTML}
                </div>
            </div>
        </div>
    `;
}

// ==== HALAMAN RESCHEDULE SMART ====
window.processReschedule = async function(newDateStr) {
    let oldDateStr = document.getElementById('reschedule-old-day').value;
    if (!oldDateStr) { alert('Silakan pilih jadwal yang ingin diganti terlebih dahulu.'); return; }

    let oldDisplay = getDisplayDate(parseDateStr(oldDateStr));
    let newDisplay = getDisplayDate(parseDateStr(newDateStr));

    if (confirm(`Ajukan pemindahan kelas dari:\n${oldDisplay}\n\nKe Tanggal:\n${newDisplay}?\n\nJadwal ini akan dikirim ke Bro Hamdi untuk disetujui.`)) {
        let p = materials[`profile-${currentUser.email}`];
        if(!p.pendingReschedules) p.pendingReschedules = {};
        
        p.pendingReschedules[oldDateStr] = newDateStr;
        
        document.body.style.cursor = 'wait';
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
        document.body.style.cursor = 'default';
        
        if (error) {
            alert("Gagal memindahkan jadwal: " + error.message);
            delete p.pendingReschedules[oldDateStr]; 
        } else {
            alert(`Berhasil! Pengajuan pindah kelas ke tanggal ${newDateStr} sedang diproses. Menunggu persetujuan tutor.`);
            sendTelegramNotification(`📅 *Pengajuan Reschedule Masuk*\n\nMurid: *${currentUser.name}*\nJadwal Asal: ${oldDisplay}\nJadwal Baru: ${newDisplay}\n\nSilakan cek dan Setujui di menu Admin CMS.`);
            renderReschedule();
        }
    }
}

window.updateRescheduleGrid = function() {
    let oldDateStr = document.getElementById('reschedule-old-day').value;
    const gridContainer = document.getElementById('reschedule-grid-container');
    if (!oldDateStr) {
        gridContainer.innerHTML = '<p class="text-slate-500 col-span-full text-center py-4 font-medium">Pilih jadwal di atas terlebih dahulu untuk melihat slot yang tersedia.</p>';
        return;
    }

    let selectedDate = parseDateStr(oldDateStr);
    let day = selectedDate.getDay();
    let diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
    let startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(diff);

    let gridHTML = '';
    let p = materials[`profile-${currentUser.email}`];
    let isPendingOld = p.pendingReschedules && p.pendingReschedules[oldDateStr] !== undefined;

    for(let i=0; i<7; i++) {
        let curr = new Date(startOfWeek); curr.setDate(startOfWeek.getDate()+i);
        let currStr = formatDateForID(curr);
        let displayDay = getDisplayDate(curr);
        
        let today = new Date(); today.setHours(0,0,0,0);
        let isPast = curr < today;

        if (isOccupied(currentUser.email, currStr)) {
            let isPendingNew = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
            
            if (currStr === oldDateStr) {
                 gridHTML += `<div class="p-5 rounded-2xl border ${isPendingOld ? 'border-amber-400 bg-amber-50' : 'border-indigo-400 bg-indigo-50'} flex flex-col relative opacity-95 shadow-inner">
                    <div class="font-bold ${isPendingOld ? 'text-amber-900 border-amber-200' : 'text-indigo-900 border-indigo-200'} text-sm mb-4 text-center border-b pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center py-4">
                        <i class="fas ${isPendingOld ? 'fa-hourglass-half text-amber-500 fa-spin' : 'fa-calendar-times text-indigo-400'} text-3xl mb-2"></i>
                        <span class="text-sm font-bold ${isPendingOld ? 'text-amber-600' : 'text-indigo-600'} text-center">${isPendingOld ? 'Menunggu Persetujuan Pindah' : 'Jadwal Asal<br>(Yang mau diganti)'}</span>
                    </div>
                </div>`;
            } else if (isPendingNew) {
                gridHTML += `<div class="p-5 rounded-2xl border border-amber-400 bg-amber-50 flex flex-col relative opacity-95 shadow-inner">
                    <div class="font-bold text-amber-900 text-sm mb-4 text-center border-b border-amber-200 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center py-4">
                        <i class="fas fa-hourglass-half text-amber-500 fa-spin text-3xl mb-2"></i>
                        <span class="text-sm font-bold text-amber-600 text-center">Menunggu Persetujuan<br>Masuk ke Slot Ini</span>
                    </div>
                </div>`;
            } else {
                 gridHTML += `<div class="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col relative opacity-75">
                    <div class="font-bold text-slate-500 text-sm mb-4 text-center border-b border-slate-200 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center py-4">
                        <i class="fas fa-calendar-check text-slate-400 text-3xl mb-2"></i>
                        <span class="text-sm font-bold text-slate-500 text-center">Kamu sudah ada kelas lain di hari ini</span>
                    </div>
                </div>`;
            }
            continue;
        }

        if (isPast) {
            gridHTML += `<div class="p-5 rounded-2xl border border-slate-200 bg-slate-100 flex flex-col relative opacity-50">
                <div class="font-bold text-slate-400 text-sm mb-4 text-center border-b border-slate-200 pb-2">${displayDay}</div>
                <div class="flex-1 flex flex-col justify-center items-center py-4">
                    <span class="text-sm font-bold text-slate-400 text-center">Hari sudah lewat</span>
                </div>
            </div>`;
            continue;
        }

        let clashingTime = null;
        for (let s of students) {
            if (s.email === currentUser.email) continue;
            if (isOccupied(s.email, currStr)) {
                let otherP = materials[`profile-${s.email}`];
                if (checkOverlap(p.time, otherP.time)) {
                    clashingTime = otherP.time;
                    break;
                }
            }
        }

        if (clashingTime) {
            gridHTML += `<div class="p-5 rounded-2xl border border-red-200 bg-white flex flex-col relative">
                    <div class="font-bold text-slate-800 text-sm mb-4 text-center border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center gap-2 mb-4 py-2">
                        <div class="text-xs font-bold text-red-600 bg-red-50 py-3 px-3 rounded-lg border border-red-100 text-center">
                            <i class="fas fa-user-lock mb-2 text-xl block text-red-400"></i> Jam <b>${clashingTime}</b><br>Sudah di-booking
                        </div>
                    </div>
                    <button disabled class="w-full mt-auto py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-400 cursor-not-allowed">
                        Terkunci
                    </button>
                </div>`;
        } else {
            if (isPendingOld) {
                // Jika jadwal ini sedang menunggu dipindah, hari lain diblokir
                gridHTML += `<div class="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col relative opacity-50">
                    <div class="font-bold text-slate-400 text-sm mb-4 text-center border-b border-slate-200 pb-2">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center py-4 text-center">
                        <i class="fas fa-lock text-slate-300 text-3xl mb-2"></i>
                        <span class="text-sm font-bold text-slate-400">Aksi Terkunci<br>Tunggu persetujuan admin</span>
                    </div>
                </div>`;
            } else {
                gridHTML += `<div class="p-5 rounded-2xl border border-green-200 bg-white flex flex-col relative hover:shadow-xl transition-all hover:-translate-y-1 hover:border-green-400 group">
                    <div class="font-bold text-slate-800 text-sm mb-4 text-center border-b border-slate-100 pb-2 group-hover:text-green-700 transition-colors">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center py-4 mb-2">
                        <i class="fas fa-check-circle text-green-500 text-4xl mb-3 group-hover:scale-110 transition-transform"></i>
                        <span class="text-sm font-bold text-green-600 bg-green-50 px-4 py-1.5 rounded-full border border-green-100">Slot Tersedia</span>
                    </div>
                    <button onclick="processReschedule('${currStr}')" class="w-full mt-auto py-3 rounded-xl text-sm font-bold transition-all bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-200 group-hover:shadow-lg">
                        Ajukan Pindah Kesini
                    </button>
                </div>`;
            }
        }
    }
    gridContainer.innerHTML = gridHTML;
}

function renderReschedule() {
    autoCloseSidebar();
    
    let p = materials[`profile-${currentUser.email}`];
    let nextSeshInfo = getStudentNextSessionInfo(currentUser.email);
    let isBlocked = false;
    let rescheduleHeader = '';

    if (nextSeshInfo.expired) {
        rescheduleHeader = `
            <div class="bg-red-50 border border-red-200 p-5 rounded-2xl mb-8 shadow-sm flex gap-4">
                <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0"><i class="fas fa-ban"></i></div>
                <div>
                    <h4 class="font-bold text-red-800 mb-1">Akses Reschedule Terkunci</h4>
                    <p class="text-red-700 text-sm leading-relaxed">Masa aktif langganan Anda telah habis pada <b>${nextSeshInfo.validDateStr}</b>. Anda belum berlangganan untuk kursus bulan berikutnya, sehingga tidak dapat memindahkan jadwal. Hubungi Bro Hamdi untuk perpanjangan.</p>
                </div>
            </div>`;
        isBlocked = true;
    } else if (nextSeshInfo.error) {
        rescheduleHeader = `<div class="bg-amber-50 text-amber-700 p-4 rounded-xl mb-6 border border-amber-200 font-medium"><i class="fas fa-info-circle mr-2"></i> Jadwal Anda belum diatur. Tunggu konfirmasi Admin.</div>`;
        isBlocked = true;
    } else {
        let upcomingOptions = [];
        let d = new Date(); d.setHours(0,0,0,0);
        let validDate = new Date(p.validUntil); 
        let isValid = !isNaN(validDate);
        if (isValid) validDate.setHours(23,59,59,999);
        
        let count = 1;
        let limitHit = false;

        for(let i=0; i<30 && upcomingOptions.length<3; i++) {
            let curr = new Date(d); curr.setDate(d.getDate()+i);
            if (isValid && curr > validDate) {
                limitHit = true;
                break;
            }
            
            let currStr = formatDateForID(curr);
            
            if (isOccupied(currentUser.email, currStr)) {
                let isPending = p.pendingReschedules && p.pendingReschedules[currStr];
                upcomingOptions.push(`<option value="${currStr}">Pertemuan ${count}: ${getDisplayDate(curr)} ${isPending?'(Menunggu Persetujuan)':''}</option>`);
                count++;
            }
        }

        if (limitHit && upcomingOptions.length > 0) {
            upcomingOptions.push(`<option disabled>--- Terpotong batas masa aktif ---</option>`);
        }

        rescheduleHeader = `
            <div class="bg-indigo-50/50 border border-indigo-100 p-6 rounded-3xl mb-8 shadow-sm">
                <h4 class="font-bold text-indigo-900 mb-4 flex items-center gap-2 text-lg"><i class="fas fa-exchange-alt text-indigo-600"></i> Form Ganti Jadwal Mingguan</h4>
                
                <label class="block text-sm font-bold text-indigo-800 mb-2">Pilih kelas terdekat yang ingin diganti (Maks 3 pertemuan ke depan):</label>
                <div class="flex flex-col md:flex-row items-start md:items-center gap-4 mb-5">
                    <select id="reschedule-old-day" onchange="updateRescheduleGrid()" class="border border-indigo-200 py-3 px-4 rounded-xl bg-white font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm w-full md:w-96 cursor-pointer">
                        ${upcomingOptions.length > 0 ? upcomingOptions.join('') : '<option value="">Tidak ada kelas terdekat</option>'}
                    </select>
                    <span class="text-sm font-semibold text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-100"><i class="fas fa-clock mr-1 text-indigo-400"></i> Jam Kelas: ${p.time}</span>
                </div>
                
                <div class="bg-white/90 p-4 rounded-xl border border-indigo-100">
                    <h4 class="font-bold text-slate-800 mb-1 text-sm"><i class="fas fa-robot text-blue-500 mr-1"></i> Kalender Terkunci Minggu Ini</h4>
                    <p class="text-slate-600 text-sm leading-relaxed">Pilih jadwal di atas dan klik <b>"Ajukan Pindah Kesini"</b> pada hari yang <b>Tersedia</b>. Jadwal akan dikunci untukmu dan menunggu persetujuan Bro Hamdi.</p>
                </div>
            </div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto fade-in pb-10">
            <h2 class="text-3xl font-bold text-slate-800 mb-6">Pusat Ganti Jadwal 📅</h2>
            ${rescheduleHeader}
            ${!isBlocked ? `<div id="reschedule-grid-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"></div>` : ''}
        </div>
    `;
    
    if (!isBlocked) window.updateRescheduleGrid();
}

// ==== FUNGSI REVIEW HAFALAN DENGAN SINKRONISASI REAL-TIME ====
window.checkVocabStatus = async function(btnElement) {
    let resDiv = document.getElementById('vocab-review-result');
    
    // Efek loading UI
    let origText = '';
    if(btnElement) {
        origText = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengecek Server...';
        btnElement.disabled = true;
    } else {
        resDiv.innerHTML = `<div class="p-4 text-center text-slate-500 font-medium"><i class="fas fa-spinner fa-spin text-indigo-500 text-xl mb-2 block"></i> Memuat data terbaru dari Cloud...</div>`;
    }

    // 🔴 PENTING: Tarik data terbaru dari Supabase agar sinkron dengan HP Murid
    try {
        const { data } = await window.supabaseClient.from('app_data').select('*');
        if (data) {
            const matData = data.find(d => d.key === 'hes_materials');
            if (matData && matData.value) materials = matData.value;
        }
    } catch(e) { console.error("Sync error", e); }

    if(btnElement) {
        btnElement.innerHTML = origText;
        btnElement.disabled = false;
    }

    const email = document.getElementById('admin-review-student').value;
    const m = document.getElementById('admin-review-month').value;
    const w = document.getElementById('admin-review-week').value;
    const d = document.getElementById('admin-review-day').value;
    
    let statusObj = materials[`vocab_status-${email}-${m}-w${w}-d${d}`];
    
    if (!statusObj || statusObj.status === 'none') {
        resDiv.innerHTML = `<div class="p-4 bg-slate-50 text-slate-500 rounded-xl text-center font-medium border border-slate-200"><i class="fas fa-box-open mb-2 text-2xl block text-slate-300"></i>Murid belum setor hafalan untuk sesi ini.</div>`;
    } else if (statusObj.status === 'submitted') {
        resDiv.innerHTML = `
            <div class="p-5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 shadow-inner">
                <p class="font-bold mb-3 flex items-center gap-2"><i class="fas fa-bell text-amber-500 text-lg animate-bounce"></i> Murid sudah siap direview!</p>
                <input type="text" id="admin-feedback" placeholder="Ketik apresiasi (Misal: Great job, pertahankan!)..." class="w-full p-3 rounded-xl border border-amber-200 mb-3 outline-none focus:ring-2 focus:ring-amber-500 bg-white">
                <button onclick="approveVocab('${email}', '${m}', '${w}', '${d}')" class="bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md hover:bg-amber-600 transition-colors w-full sm:w-auto">Approve & Kirim Apresiasi ✅</button>
            </div>
        `;
    } else if (statusObj.status === 'approved') {
        resDiv.innerHTML = `
            <div class="p-5 bg-green-50 text-green-800 rounded-xl text-center border border-green-200 shadow-inner">
                <div class="font-bold text-lg mb-2"><i class="fas fa-check-circle text-green-500"></i> Hafalan Selesai & Telah Anda Approve.</div>
                <div class="text-sm font-medium bg-green-100/50 inline-block px-4 py-2 rounded-lg border border-green-200">Apresiasi Anda: "${statusObj.feedback}"</div>
            </div>`;
    }
}

window.approveVocab = async function(email, m, w, d) {
    let feedback = document.getElementById('admin-feedback').value || 'Well done! Keep up the good work!';
    let key = `vocab_status-${email}-${m}-w${w}-d${d}`;
    materials[key] = { status: 'approved', feedback: feedback };

    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) alert("Error: " + error.message);
    else {
        alert("Apresiasi berhasil dikirim ke murid!");
        checkVocabStatus();
    }
}

// ==== HALAMAN ADMIN CMS ====
function renderAdminCMS() {
    autoCloseSidebar();
    if (userRole !== 'admin') return;

    const monthOptions = months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMonthOptions = months.map(m => `<option value="${m.id.replace('m','')}">Sampai ${m.title}</option>`).join('');
    const weekOptions = [1,2,3,4].map(w => `<option value="${w}">Week ${w}</option>`).join('');
    const dayOptions = [1,2,3].map(d => `<option value="${d}">Day ${d}</option>`).join('');
    const studentOptions = students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    let pendingReschedulesHTML = '';
    students.forEach(s => {
        let p = materials[`profile-${s.email}`];
        if (p && p.pendingReschedules) {
            for (const [oldD, newD] of Object.entries(p.pendingReschedules)) {
                pendingReschedulesHTML += `
                    <div class="flex flex-col sm:flex-row items-center justify-between bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-3 shadow-sm">
                        <div class="mb-3 sm:mb-0 w-full sm:w-auto">
                            <p class="font-bold text-amber-900 mb-1"><i class="fas fa-user text-amber-600 mr-1"></i> ${s.name}</p>
                            <div class="flex items-center gap-2 text-sm font-semibold text-amber-700">
                                <span class="bg-white px-2 py-1 rounded border border-amber-100">${getDisplayDate(parseDateStr(oldD))}</span>
                                <i class="fas fa-arrow-right text-amber-400"></i>
                                <span class="bg-amber-200 text-amber-800 px-2 py-1 rounded">${getDisplayDate(parseDateStr(newD))}</span>
                            </div>
                        </div>
                        <div class="flex gap-2 w-full sm:w-auto">
                            <button onclick="approveReschedule('${s.email}', '${oldD}', '${newD}')" class="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-bold transition shadow-sm"><i class="fas fa-check"></i> Setujui</button>
                            <button onclick="rejectReschedule('${s.email}', '${oldD}')" class="flex-1 sm:flex-none bg-red-100 hover:bg-red-200 text-red-600 px-4 py-2 rounded-xl font-bold transition shadow-sm"><i class="fas fa-times"></i> Tolak</button>
                        </div>
                    </div>
                `;
            }
        }
    });
    if (!pendingReschedulesHTML) pendingReschedulesHTML = `<p class="text-slate-400 text-center py-4 font-medium italic">Tidak ada pengajuan reschedule baru.</p>`;

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-8 fade-in pb-12">
            <div>
                <h2 class="text-3xl font-bold text-slate-800 flex items-center gap-3 mb-2">
                    <div class="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><i class="fas fa-shield-alt"></i></div> Admin Workspace
                </h2>
                <p class="text-slate-500 font-medium ml-14">Kelola konten, data murid, dan penjadwalan kelas.</p>
            </div>

            <!-- PANEL: PERSETUJUAN RESCHEDULE -->
            <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 mb-8" id="admin-approval-panel">
                <h3 class="text-xl font-bold text-slate-800 mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
                    <i class="fas fa-bell text-amber-500"></i> Persetujuan Reschedule Murid
                </h3>
                <div class="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    ${pendingReschedulesHTML}
                </div>
            </div>

            <!-- PANEL: INPUT VOCAB & REVIEW HAFALAN -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <!-- Input Vocab -->
                <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                        <i class="fas fa-book-open text-blue-500"></i> Input Daily Vocabulary
                    </h3>
                    <div class="grid grid-cols-3 gap-4 mb-4">
                        <select id="admin-vocab-month" class="border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 text-slate-700 font-medium">${monthOptions}</select>
                        <select id="admin-vocab-week" class="border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 text-slate-700 font-medium">${weekOptions}</select>
                        <select id="admin-vocab-day" class="border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 text-slate-700 font-medium">${dayOptions}</select>
                    </div>
                    <label class="block text-sm font-bold text-slate-700 mb-2">Word Bank (Inggris = Indonesia)</label>
                    <textarea id="admin-vocab-list" rows="6" placeholder="Apple = Apel\nRun = Lari\nBeautiful = Cantik" class="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium text-slate-700 resize-none"></textarea>
                    <p class="text-xs text-slate-500 mt-2 mb-4"><i class="fas fa-info-circle"></i> Gunakan tanda sama dengan (=) untuk memisahkan kata dan arti. Satu kata per baris.</p>
                    <button onclick="saveVocabList(event)" class="w-full bg-blue-600 text-white px-8 py-3.5 rounded-xl hover:bg-blue-700 font-bold transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                        <i class="fas fa-save"></i> Simpan Word Bank
                    </button>
                </div>

                <!-- Review Hafalan -->
                <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                        <i class="fas fa-check-double text-green-500"></i> Review Hafalan Murid
                    </h3>
                    <div class="mb-4">
                        <label class="block text-sm font-bold text-slate-700 mb-2">Pilih Murid</label>
                        <select id="admin-review-student" class="w-full border border-slate-200 py-2.5 px-4 rounded-xl bg-slate-50 text-slate-700 font-medium">${studentOptions}</select>
                    </div>
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <select id="admin-review-month" class="border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 text-slate-700 font-medium">${monthOptions}</select>
                        <select id="admin-review-week" class="border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 text-slate-700 font-medium">${weekOptions}</select>
                        <select id="admin-review-day" class="border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 text-slate-700 font-medium">${dayOptions}</select>
                    </div>
                    <!-- PENTING: Tombol ini di-passing argumen "this" agar efek loading bekerja! -->
                    <button onclick="checkVocabStatus(this)" class="w-full bg-slate-800 text-white px-8 py-3 rounded-xl hover:bg-slate-900 font-bold transition mb-6 shadow-md flex items-center justify-center gap-2">
                        <i class="fas fa-search"></i> Cek Status Hafalan
                    </button>
                    <div id="vocab-review-result" class="min-h-[120px] border-t border-slate-100 pt-6">
                        <p class="text-center text-slate-400 font-medium italic mt-4">Pilih murid dan sesi, lalu klik Cek Status.</p>
                    </div>
                </div>
            </div>

            <!-- PANEL: INPUT JADWAL & GEMBOK MATERI KELAS -->
            <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 mb-8">
                <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                    <i class="fas fa-calendar-alt text-amber-500"></i> Atur Jadwal Default, Masa Aktif & Akses Bulan
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div class="lg:col-span-1">
                        <label class="block text-sm font-bold text-slate-700 mb-2">Pilih Murid</label>
                        <select id="admin-sched-student" class="w-full border border-slate-200 py-3 px-3 rounded-xl bg-slate-50 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-amber-500">
                            ${studentOptions}
                        </select>
                    </div>
                    <div class="lg:col-span-1">
                        <label class="block text-sm font-bold text-slate-700 mb-2">Batas Akses Materi</label>
                        <select id="admin-sched-max-month" class="w-full border border-slate-200 py-3 px-3 rounded-xl bg-slate-50 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-amber-500">
                            ${maxMonthOptions}
                        </select>
                    </div>
                    <div class="lg:col-span-1">
                        <label class="block text-sm font-bold text-slate-700 mb-2">Masa Aktif Berakhir</label>
                        <input type="date" id="admin-sched-date" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50 text-slate-700">
                    </div>
                    
                    <div class="lg:col-span-1">
                        <label class="block text-sm font-bold text-slate-700 mb-2">Jam Sesi (Mulai - Selesai)</label>
                        <div class="flex items-center gap-2">
                            <input type="time" id="admin-sched-start" class="w-full px-2 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50 text-slate-700 text-sm">
                            <span class="font-bold text-slate-400">-</span>
                            <input type="time" id="admin-sched-end" class="w-full px-2 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50 text-slate-700 text-sm">
                        </div>
                    </div>
                </div>

                <div class="mb-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <label class="block text-sm font-bold text-slate-800 mb-3">Pilih Hari Kelas Rutin (Jadwal Default)</label>
                    <div class="flex flex-wrap gap-4">
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" value="Senin" class="admin-day-cb w-5 h-5 text-amber-600 rounded focus:ring-amber-500"> <span class="font-medium text-slate-700">Senin</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" value="Selasa" class="admin-day-cb w-5 h-5 text-amber-600 rounded focus:ring-amber-500"> <span class="font-medium text-slate-700">Selasa</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" value="Rabu" class="admin-day-cb w-5 h-5 text-amber-600 rounded focus:ring-amber-500"> <span class="font-medium text-slate-700">Rabu</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" value="Kamis" class="admin-day-cb w-5 h-5 text-amber-600 rounded focus:ring-amber-500"> <span class="font-medium text-slate-700">Kamis</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" value="Jumat" class="admin-day-cb w-5 h-5 text-amber-600 rounded focus:ring-amber-500"> <span class="font-medium text-slate-700">Jumat</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" value="Sabtu" class="admin-day-cb w-5 h-5 text-amber-600 rounded focus:ring-amber-500"> <span class="font-medium text-slate-700">Sabtu</span></label>
                    </div>
                </div>
                <div class="flex justify-end">
                    <button onclick="saveStudentSchedule(event)" class="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-8 py-3.5 rounded-xl hover:from-amber-600 hover:to-amber-700 font-bold transition shadow-lg shadow-amber-200/50 flex items-center justify-center gap-2">
                        <i class="fas fa-save"></i> Terapkan Pengaturan
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Panel Kiri -->
                <div class="space-y-6 lg:col-span-1">
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <div class="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mb-4"><i class="fas fa-folder-plus text-xl"></i></div>
                        <h3 class="text-lg font-bold text-slate-800 mb-2">Manajemen Bulan</h3>
                        <p class="text-sm text-slate-500 font-medium mb-6 leading-relaxed">Tambahkan bulan baru untuk membuka akses materi lanjutan.</p>
                        <button onclick="addNewMonth()" class="w-full bg-amber-100 text-amber-700 py-3 rounded-xl font-bold hover:bg-amber-200 transition-colors flex justify-center items-center gap-2">
                            <i class="fas fa-plus"></i> Tambah Bulan Baru
                        </button>
                    </div>

                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <div class="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 mb-4"><i class="fas fa-user-plus text-xl"></i></div>
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Tambah Akun Murid</h3>
                        <div class="space-y-3">
                            <input type="text" id="new-stu-name" placeholder="Nama Lengkap" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none">
                            <input type="email" id="new-stu-email" placeholder="Email Akun" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none">
                            <input type="text" id="new-stu-pass" placeholder="Password (Misal: 123)" class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none">
                            <button onclick="addNewStudent()" class="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors mt-2 shadow-md shadow-green-200">
                                Buat Akun Murid
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Panel Kanan -->
                <div class="lg:col-span-2">
                    <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 h-full">
                        <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                            <i class="fas fa-edit text-indigo-500"></i> Input Materi & PDF Recap
                        </h3>
                        <div class="mb-6 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                            <label class="block text-sm font-bold text-indigo-800 mb-2">Terapkan Materi Ini Untuk:</label>
                            <select id="admin-target-student" class="w-full border border-slate-200 py-3 px-4 rounded-xl bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm">
                                <option value="all">Semua Murid (Materi Default)</option>
                                ${studentOptions}
                            </select>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Bulan</label>
                                <select id="admin-month" class="w-full border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 font-medium text-slate-700 outline-none">${monthOptions}</select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Minggu</label>
                                <select id="admin-week" class="w-full border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 font-medium text-slate-700 outline-none">${weekOptions}</select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Hari</label>
                                <select id="admin-day" class="w-full border border-slate-200 py-2.5 px-3 rounded-xl bg-slate-50 font-medium text-slate-700 outline-none">${dayOptions}</select>
                            </div>
                        </div>
                        <div class="space-y-5">
                            <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><i class="fab fa-google-drive text-blue-500"></i> Link PDF Materi Utama</label>
                                <input type="text" id="admin-link" placeholder="Paste link 'Anyone with link' di sini..." class="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium text-slate-700">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><i class="fab fa-google-drive text-green-500"></i> Link PDF Daily Recap</label>
                                <input type="text" id="admin-recap-pdf" placeholder="Paste link PDF 'Anyone with link' untuk recap..." class="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium text-slate-700">
                            </div>
                            <div class="pt-4">
                                <button onclick="saveMaterialData()" class="w-full bg-indigo-600 text-white px-8 py-3.5 rounded-xl hover:bg-indigo-700 font-bold transition shadow-lg shadow-indigo-200 flex items-center justify-center gap-2">
                                    <i class="fas fa-cloud-upload-alt"></i> Publish ke Database
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PANEL: KELOLA AKUN MURID -->
            <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 mt-8">
                <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                    <i class="fas fa-users-cog text-green-600"></i> Daftar & Manajemen Akun Murid
                </h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr class="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                                <th class="p-4 font-bold rounded-tl-xl">Nama Murid</th>
                                <th class="p-4 font-bold">Email (Username)</th>
                                <th class="p-4 font-bold">Password</th>
                                <th class="p-4 font-bold rounded-tr-xl text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map((s, idx) => `
                                <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                                    <td class="p-4 font-medium text-slate-800">${s.name}</td>
                                    <td class="p-4 text-slate-600">${s.email}</td>
                                    <td class="p-4">
                                        <div class="flex items-center gap-2">
                                            <input type="password" value="${s.password}" id="pwd-${idx}" class="bg-transparent border-none p-0 focus:ring-0 text-slate-600 font-mono w-20 outline-none" readonly>
                                            <button onclick="togglePassword('pwd-${idx}')" class="text-slate-400 hover:text-indigo-600 transition-colors" title="Lihat Password"><i class="fas fa-eye"></i></button>
                                        </div>
                                    </td>
                                    <td class="p-4 text-center">
                                        <div class="flex items-center justify-center gap-2">
                                            <button onclick="editStudentPassword('${s.email}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center" title="Ganti Password"><i class="fas fa-key"></i></button>
                                            <button onclick="deleteStudentAccount('${s.email}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center" title="Hapus Akun"><i class="fas fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${students.length === 0 ? '<p class="text-center text-slate-500 py-6">Belum ada akun murid yang terdaftar.</p>' : ''}
                </div>
            </div>
            
        </div>
    `;
    
    setTimeout(() => {
        if (document.getElementById('admin-approval-panel') && document.getElementById('admin-approval-panel').innerHTML.includes('Setujui')) {
            document.getElementById('admin-approval-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

// ==== FUNGSI ADMIN DATABASE & APPROVAL ====

window.approveReschedule = async function(email, oldDate, newDate) {
    let p = materials[`profile-${email}`];
    if(!p.reschedules) p.reschedules = {};
    
    p.reschedules[oldDate] = newDate;
    delete p.pendingReschedules[oldDate];
    
    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) alert("Error: " + error.message);
    else { alert("Jadwal disetujui!"); renderAdminCMS(); }
}

window.rejectReschedule = async function(email, oldDate) {
    if(confirm("Yakin ingin menolak pengajuan reschedule ini?")) {
        let p = materials[`profile-${email}`];
        delete p.pendingReschedules[oldDate]; 
        
        document.body.style.cursor = 'wait';
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
        document.body.style.cursor = 'default';
        
        if (error) alert("Error: " + error.message);
        else { alert("Pengajuan ditolak."); renderAdminCMS(); }
    }
}

window.saveVocabList = async function(e) {
    const m = document.getElementById('admin-vocab-month').value;
    const w = document.getElementById('admin-vocab-week').value;
    const d = document.getElementById('admin-vocab-day').value;
    const vocabText = document.getElementById('admin-vocab-list').value;

    materials[`vocab-${m}-w${w}-d${d}`] = vocabText;

    const btn = e.currentTarget; const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    btn.innerHTML = origText; btn.disabled = false;
    
    if (error) alert("Error: " + error.message);
    else {
        alert(`Word Bank untuk Sesi ${m} W${w} D${d} berhasil disimpan!`);
        document.getElementById('admin-vocab-list').value = '';
    }
}

window.togglePassword = function(id) {
    const input = document.getElementById(id);
    if(input.type === 'password') input.type = 'text'; else input.type = 'password';
}

window.editStudentPassword = async function(email) {
    const studentIndex = students.findIndex(s => s.email === email);
    if(studentIndex === -1) return;
    const newPassword = prompt(`Masukkan password baru untuk ${students[studentIndex].name}:`, students[studentIndex].password);
    if(newPassword !== null && newPassword.trim() !== '') {
        students[studentIndex].password = newPassword.trim();
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);
        if (error) alert("Gagal mengubah password: " + error.message);
        else { alert(`Password untuk ${students[studentIndex].name} berhasil diubah!`); renderAdminCMS(); }
    }
}

window.deleteStudentAccount = async function(email) {
    if(confirm(`Yakin ingin MENGHAPUS akun dengan email ${email} secara permanen? Akun ini tidak akan bisa login lagi.`)) {
        const newStudents = students.filter(s => s.email !== email);
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: newStudents }]);
        if (error) alert("Gagal menghapus akun: " + error.message);
        else { students = newStudents; alert(`Akun berhasil dihapus!`); renderAdminCMS(); }
    }
}

window.saveStudentSchedule = async function(e) {
    const email = document.getElementById('admin-sched-student').value;
    const dateInput = document.getElementById('admin-sched-date').value;
    const startTime = document.getElementById('admin-sched-start').value;
    const endTime = document.getElementById('admin-sched-end').value;
    const maxMonthInput = document.getElementById('admin-sched-max-month').value;
    
    const checkboxes = document.querySelectorAll('.admin-day-cb:checked');
    const selectedDays = Array.from(checkboxes).map(cb => cb.value);

    if (selectedDays.length > 0 && startTime && endTime) {
        let clashingNames = [];
        
        for (let hari of selectedDays) {
            for (let s of students) {
                if (s.email === email) continue; 
                let p = materials[`profile-${s.email}`];
                if (p && p.days && p.days.includes(hari) && p.time) {
                    if (checkOverlap(`${startTime}-${endTime}`, p.time)) {
                        clashingNames.push(`- ${s.name} (${p.time} di hari ${hari})`);
                    }
                }
            }
        }

        if (clashingNames.length > 0) {
            let confirmMsg = `⚠️ PERINGATAN TABRAKAN JADWAL DEFAULT!\n\nJadwal ini bertabrakan dengan murid lain:\n${[...new Set(clashingNames)].join('\n')}\n\nApakah mereka belajar di sesi/grup yang sama?\nKlik 'OK' untuk tetap menyimpan, atau 'Batal'.`;
            if (!confirm(confirmMsg)) { return; }
        }
    }

    let profile = materials[`profile-${email}`] || {};
    profile.validUntil = dateInput || profile.validUntil || 'Belum diatur';
    if (startTime && endTime) { profile.time = `${startTime} - ${endTime}`; } 
    else { profile.time = profile.time || 'Belum diatur'; }
    
    profile.maxMonth = maxMonthInput || profile.maxMonth || 1;
    if(selectedDays.length > 0) profile.days = selectedDays;
    
    materials[`profile-${email}`] = profile;
    
    const btn = e.currentTarget; const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; btn.disabled = true;

    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    
    btn.innerHTML = origText; btn.disabled = false;
    
    if (error) alert("Gagal menyimpan pengaturan: " + error.message);
    else {
        alert(`Jadwal, Batas Akses Bulan, & Masa Aktif untuk akun ${email} berhasil di-update secara Online!`);
        checkboxes.forEach(cb => cb.checked = false);
        document.getElementById('admin-sched-date').value = ''; 
        document.getElementById('admin-sched-start').value = '';
        document.getElementById('admin-sched-end').value = '';
    }
}

window.addNewMonth = async function() {
    const nextNum = months.length + 1; const newMonth = { id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] }; months.push(newMonth);
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_months', value: months }]);
    if (error) { alert("Gagal menambahkan bulan secara online: " + error.message); months.pop(); } else { alert(`Sukses! Month ${nextNum} ditambahkan.`); renderSidebar(); renderAdminCMS(); }
};

window.addNewStudent = async function() {
    const name = document.getElementById('new-stu-name').value; const email = document.getElementById('new-stu-email').value; const pass = document.getElementById('new-stu-pass').value;
    if(!name || !email || !pass) { alert("Harap lengkapi Nama, Email, dan Password murid."); return; }
    students.push({ name: name, email: email, password: pass });
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);
    if (error) { alert("Gagal menyimpan murid: " + error.message); students.pop(); } else { alert(`Akun murid ${name} berhasil dibuat!`); renderAdminCMS(); }
}

window.saveMaterialData = async function() {
    const targetStudent = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value; const w = document.getElementById('admin-week').value; const d = document.getElementById('admin-day').value;
    const link = document.getElementById('admin-link').value; const recap = document.getElementById('admin-recap-pdf').value;
    
    const keyPrefix = `${targetStudent}-${m}-w${w}-d${d}`;
    if(link) materials[`${keyPrefix}-link`] = link; if(recap) materials[`${keyPrefix}-recap`] = recap;
    
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    if (error) { alert("Gagal menyimpan materi ke server: " + error.message); } 
    else {
        const info = targetStudent === 'all' ? "Semua Murid" : targetStudent;
        alert(`Berhasil! Materi & Recap diset untuk: ${info} (Sesi: ${m} W${w} D${d})`);
        document.getElementById('admin-link').value = ''; document.getElementById('admin-recap-pdf').value = '';
    }
};