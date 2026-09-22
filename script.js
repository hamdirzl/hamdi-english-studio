// script.js

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

// ==== HELPER: DETEKSI JADWAL PINTAR ====
function getNextSession(days, validUntil) {
    if (!days || days.length === 0) return { error: 'Belum ada hari kelas yang dipilih.' };
    if (!validUntil || validUntil === 'Belum diatur') return { error: 'Masa aktif belum diatur admin.' };
    
    let now = new Date();
    now.setHours(0,0,0,0);
    let validDate = new Date(validUntil);
    validDate.setHours(23,59,59,999);
    
    let validDateStr = validDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    if (now > validDate) return { expired: true, validDateStr: validDateStr };
    
    let todayDay = now.getDay();
    const map = { 'Minggu':0, 'Senin':1, 'Selasa':2, 'Rabu':3, 'Kamis':4, 'Jumat':5, 'Sabtu':6 };
    const reverseMap = { 0:'Minggu', 1:'Senin', 2:'Selasa', 3:'Rabu', 4:'Kamis', 5:'Jumat', 6:'Sabtu' };
    
    let daysNum = days.map(d => map[d]).sort((a,b) => a-b);
    
    let nextDayNum = daysNum.find(d => d >= todayDay);
    let daysToAdd = 0;
    if (nextDayNum !== undefined) {
        daysToAdd = nextDayNum - todayDay;
    } else {
        daysToAdd = 7 - todayDay + daysNum[0];
    }
    
    let nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysToAdd);
    
    if (nextDate > validDate) return { expired: true, validDateStr: validDateStr };
    
    return {
        dateObj: nextDate,
        dayName: reverseMap[nextDate.getDay()],
        formattedDate: nextDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    };
}

// ==== HELPER: DETEKSI TABRAKAN JAM ====
function checkOverlap(time1, time2) {
    if(!time1 || !time2 || !time1.includes('-') || !time2.includes('-')) return false;
    let [s1, e1] = time1.split('-').map(t => parseInt(t.trim().replace(':','')));
    let [s2, e2] = time2.split('-').map(t => parseInt(t.trim().replace(':','')));
    return (s1 < e2) && (s2 < e1);
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
            
            if (currentUser) {
                renderSidebar();
                if (document.getElementById('main-content').innerHTML.includes('Welcome Back')) { renderDashboard(); }
                if (document.getElementById('main-content').innerHTML.includes('Reschedule Jadwal')) { renderReschedule(); }
                if (document.getElementById('main-content').innerHTML.includes('Manajemen Akun Murid')) { renderAdminCMS(); }
            }
        }
    } catch (e) {
        console.error("Gagal sinkronisasi data online", e);
    }
}
fetchCloudData();

// ==== ELEMEN DOM ====
const loginPage = document.getElementById('login-page');
const appPage = document.getElementById('app-page');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const sidebar = document.getElementById('sidebar');
const sidebarMenu = document.getElementById('sidebar-menu');
const mainContent = document.getElementById('main-content');

// ==== EVENT LISTENERS DASAR ====
document.getElementById('open-sidebar').addEventListener('click', () => { sidebar.classList.remove('-translate-x-full'); });
document.getElementById('close-sidebar').addEventListener('click', () => { sidebar.classList.add('-translate-x-full'); });
document.getElementById('logout-btn').addEventListener('click', handleLogout);

// ==== LOGIKA LOGIN ====
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (email === 'hamdirizall1@gmail.com' && password === 'admin') {
        userRole = 'admin'; currentUser = { name: 'Bro Hamdi', email: email }; loginSuccess();
    } else {
        const student = students.find(s => s.email === email && s.password === password);
        if (student) { userRole = 'student'; currentUser = student; loginSuccess(); } 
        else { loginError.classList.remove('hidden'); }
    }
});

function loginSuccess() {
    loginPage.classList.add('hidden');
    appPage.classList.remove('hidden');
    const initial = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-avatar').innerText = initial;
    document.getElementById('user-name-display').innerText = `Hi, ${currentUser.name}`;
    document.getElementById('user-role-display').innerText = userRole === 'admin' ? 'Administrator' : 'Student';
    renderSidebar(); renderDashboard();
}

function handleLogout() {
    currentUser = null; userRole = null;
    document.getElementById('email').value = ''; document.getElementById('password').value = '';
    loginError.classList.add('hidden'); appPage.classList.add('hidden'); loginPage.classList.remove('hidden');
}

// ==== RENDER SIDEBAR (DENGAN SISTEM GEMBOK) ====
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
        const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        let globalBookings = { 'Senin': [], 'Selasa': [], 'Rabu': [], 'Kamis': [], 'Jumat': [], 'Sabtu': [] };
        
        students.forEach(s => {
            let p = materials[`profile-${s.email}`];
            if (p && p.days && p.time) {
                p.days.forEach(d => {
                    if (globalBookings[d]) globalBookings[d].push(`<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold">${p.time}</span> <span class="text-sm font-semibold">${s.name}</span>`);
                });
            }
        });

        let masterScheduleHTML = days.map(hari => {
            let bookings = globalBookings[hari];
            let listHTML = bookings.length === 0 
                ? `<p class="text-sm text-slate-400 italic">Kosong</p>` 
                : bookings.map(b => `<div class="flex items-center gap-2 bg-slate-50 p-2 border border-slate-100 rounded-lg mb-2">${b}</div>`).join('');
            return `
                <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <h4 class="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2"><i class="fas fa-calendar-day text-amber-500"></i> ${hari}</h4>
                    ${listHTML}
                </div>
            `;
        }).join('');

        mainContent.innerHTML = `
            <div class="max-w-6xl mx-auto fade-in pb-10">
                <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                    <div class="relative z-10 flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <h2 class="text-3xl md:text-4xl font-bold mb-3">Welcome Back, Bro Hamdi! 🚀</h2>
                            <p class="text-indigo-100 text-lg max-w-xl">Ini adalah ringkasan jadwal mengajar Anda minggu ini.</p>
                        </div>
                        <div class="bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center">
                            <p class="text-xs uppercase tracking-wider font-semibold text-indigo-100 mb-1">Total Murid Aktif</p>
                            <p class="text-4xl font-bold">${students.length}</p>
                        </div>
                    </div>
                </div>
                
                <h3 class="text-2xl font-bold text-slate-800 mb-4 px-2">📅 Master Jadwal Mengajar</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    ${masterScheduleHTML}
                </div>
            </div>
        `;
        return;
    }

    // --- LOGIKA UNTUK MURID (DENGAN DETEKSI KADALUARSA) ---
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

    let profile = materials[`profile-${currentUser.email}`] || { days: [], time: 'Belum diatur', validUntil: 'Belum diatur' };
    let nextSesh = getNextSession(profile.days, profile.validUntil);
    
    let premiumCardContent = '';
    if (nextSesh.expired) {
        premiumCardContent = `
            <div class="bg-red-500/90 border border-red-400 p-5 rounded-2xl relative z-10 backdrop-blur-sm shadow-inner mt-2">
                <p class="text-white font-bold text-xl mb-1 flex items-center gap-2"><i class="fas fa-exclamation-triangle text-yellow-300"></i> Akses Terbatas</p>
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
                    <p class="font-bold text-lg md:text-xl text-white mb-0.5 tracking-wide">${nextSesh.dayName}, ${nextSesh.formattedDate}</p>
                    <p class="text-sm text-amber-200 font-semibold mb-2">Jam: ${profile.time}</p>
                    <div class="inline-block px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold uppercase tracking-widest border border-amber-500/30">
                        Aktif s/d: ${new Date(profile.validUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
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

// ==== HALAMAN MATERI & RECAP ====
function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//);
        if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return link;
}

function renderMateri(monthId, week, day, monthTitle) {
    autoCloseSidebar();
    const email = currentUser.email;
    let rawLink = materials[`${email}-${monthId}-w${week}-d${day}-link`] || materials[`all-${monthId}-w${week}-d${day}-link`] || '';
    let rawRecap = materials[`${email}-${monthId}-w${week}-d${day}-recap`] || materials[`all-${monthId}-w${week}-d${day}-recap`] || '';

    let linkDrive = parseDriveLink(rawLink);
    let recapDrive = parseDriveLink(rawRecap);

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

// ==== HALAMAN RESCHEDULE (INTERAKTIF & ANTI TABRAK) ====
window.processReschedule = async function(newDay) {
    let oldDay = document.getElementById('reschedule-old-day').value;
    if (!oldDay) { alert('Silakan pilih jadwal yang ingin diganti terlebih dahulu.'); return; }

    if (confirm(`Yakin memindahkan kelas ${oldDay} ke hari ${newDay}? Jadwal ini akan langsung diperbarui.`)) {
        let profile = materials[`profile-${currentUser.email}`];
        profile.days = profile.days.filter(d => d !== oldDay);
        profile.days.push(newDay);
        
        document.body.style.cursor = 'wait';
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
        document.body.style.cursor = 'default';
        
        if (error) {
            alert("Gagal memindahkan jadwal: " + error.message);
            // Rollback in memory
            profile.days = profile.days.filter(d => d !== newDay);
            profile.days.push(oldDay);
        } else {
            alert(`Berhasil! Jadwal kelasmu telah dipindahkan ke hari ${newDay}. Jangan lupa hubungi admin untuk konfirmasi akhir.`);
            renderReschedule();
        }
    }
}

function renderReschedule() {
    autoCloseSidebar();
    
    let profile = materials[`profile-${currentUser.email}`] || { days: [], time: 'Belum diatur', validUntil: 'Belum diatur' };
    let nextSesh = getNextSession(profile.days, profile.validUntil);

    let isBlocked = false;
    let rescheduleHeader = '';

    if (nextSesh.expired) {
        rescheduleHeader = `
            <div class="bg-red-50 border border-red-200 p-5 rounded-2xl mb-8 shadow-sm">
                <div class="flex gap-4">
                    <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0"><i class="fas fa-ban"></i></div>
                    <div>
                        <h4 class="font-bold text-red-800 mb-1">Akses Reschedule Terkunci</h4>
                        <p class="text-red-700 text-sm leading-relaxed">Masa aktif langganan Anda telah habis pada <b>${nextSesh.validDateStr}</b>. Anda belum berlangganan untuk bulan berikutnya, sehingga tidak dapat memindahkan jadwal. Hubungi Bro Hamdi untuk perpanjangan.</p>
                    </div>
                </div>
            </div>`;
        isBlocked = true;
    } else if (nextSesh.error) {
        rescheduleHeader = `<div class="bg-amber-50 text-amber-700 p-4 rounded-xl mb-6 border border-amber-200 font-medium"><i class="fas fa-info-circle mr-2"></i> Jadwal Anda belum diatur. Tunggu konfirmasi Admin.</div>`;
        isBlocked = true;
    } else {
        let options = profile.days.map(d => `<option value="${d}">${d}</option>`).join('');
        rescheduleHeader = `
            <div class="bg-indigo-50/50 border border-indigo-100 p-6 rounded-3xl mb-8 shadow-sm">
                <h4 class="font-bold text-indigo-900 mb-4 flex items-center gap-2 text-lg"><i class="fas fa-exchange-alt text-indigo-600"></i> Form Ganti Jadwal (Reschedule)</h4>
                
                <label class="block text-sm font-bold text-indigo-800 mb-2">Jadwal mana yang ingin kamu ganti?</label>
                <div class="flex flex-col md:flex-row items-start md:items-center gap-4 mb-5">
                    <select id="reschedule-old-day" class="border border-indigo-200 py-3 px-4 rounded-xl bg-white font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm w-full md:w-64 cursor-pointer">
                        ${options}
                    </select>
                    <span class="text-sm font-semibold text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-100"><i class="fas fa-clock mr-1 text-indigo-400"></i> Jam Kelas: ${profile.time}</span>
                </div>
                
                <div class="bg-white/90 p-4 rounded-xl border border-indigo-100">
                    <h4 class="font-bold text-slate-800 mb-1 text-sm"><i class="fas fa-robot text-blue-500 mr-1"></i> Sistem Anti-Tabrakan Pintar</h4>
                    <p class="text-slate-600 text-sm leading-relaxed">Sistem akan mengecek jam belajarmu <b>(${profile.time})</b>. Jika ada murid lain yang memiliki jadwal di jam yang sama pada suatu hari, hari tersebut otomatis <b>Terkunci</b>. Klik "Pindah ke Hari Ini" pada hari yang <b>Tersedia</b> untuk langsung mengubah jadwal database!</p>
                </div>
            </div>`;
    }

    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    let gridHTML = '';
    
    if (!isBlocked) {
        gridHTML = days.map(hari => {
            // 1. Apakah hari ini adalah jadwal dia saat ini?
            if (profile.days.includes(hari)) {
                return `
                    <div class="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 flex flex-col relative opacity-75">
                        <div class="font-bold text-indigo-800 text-lg mb-4 text-center border-b border-indigo-100 pb-2">${hari}</div>
                        <div class="flex-1 flex flex-col justify-center items-center py-4">
                            <i class="fas fa-calendar-check text-indigo-400 text-3xl mb-2"></i>
                            <span class="text-sm font-bold text-indigo-600 text-center">Jadwalmu Saat Ini</span>
                        </div>
                    </div>`;
            }

            // 2. Cek Tabrakan dengan murid lain di jam yang sama
            let clashingStudent = null;
            for (let s of students) {
                if (s.email === currentUser.email) continue;
                let p = materials[`profile-${s.email}`];
                if (p && p.days && p.days.includes(hari) && p.time) {
                    if (checkOverlap(profile.time, p.time)) {
                        clashingStudent = p.time;
                        break;
                    }
                }
            }

            if (clashingStudent) {
                return `
                    <div class="p-5 rounded-2xl border border-red-200 bg-white flex flex-col relative">
                        <div class="font-bold text-slate-800 text-lg mb-4 text-center border-b border-slate-100 pb-2">${hari}</div>
                        <div class="flex-1 flex flex-col justify-center gap-2 mb-4 py-2">
                            <div class="text-xs font-bold text-red-600 bg-red-50 py-3 px-3 rounded-lg border border-red-100 text-center">
                                <i class="fas fa-user-lock mb-2 text-xl block text-red-400"></i> Jam <b>${clashingStudent}</b><br>Sudah di-booking
                            </div>
                        </div>
                        <button disabled class="w-full mt-auto py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-400 cursor-not-allowed">
                            Terkunci
                        </button>
                    </div>`;
            }

            // 3. Slot Tersedia
            return `
                <div class="p-5 rounded-2xl border border-green-200 bg-white flex flex-col relative hover:shadow-xl transition-all hover:-translate-y-1 hover:border-green-400 group">
                    <div class="font-bold text-slate-800 text-lg mb-4 text-center border-b border-slate-100 pb-2 group-hover:text-green-700 transition-colors">${hari}</div>
                    <div class="flex-1 flex flex-col justify-center items-center py-4 mb-2">
                        <i class="fas fa-check-circle text-green-500 text-4xl mb-3 group-hover:scale-110 transition-transform"></i>
                        <span class="text-sm font-bold text-green-600 bg-green-50 px-4 py-1.5 rounded-full border border-green-100">Slot Tersedia</span>
                    </div>
                    <button onclick="processReschedule('${hari}')" class="w-full mt-auto py-3 rounded-xl text-sm font-bold transition-all bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-200 group-hover:shadow-lg">
                        Pindah ke Hari Ini
                    </button>
                </div>`;
        }).join('');
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-10">
            <h2 class="text-3xl font-bold text-slate-800 mb-6">Pusat Ganti Jadwal 📅</h2>
            ${rescheduleHeader}
            ${!isBlocked ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">${gridHTML}</div>` : ''}
        </div>
    `;
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

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-8 fade-in pb-12">
            <div>
                <h2 class="text-3xl font-bold text-slate-800 flex items-center gap-3 mb-2">
                    <div class="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><i class="fas fa-shield-alt"></i></div> Admin Workspace
                </h2>
                <p class="text-slate-500 font-medium ml-14">Kelola konten, data murid, dan penjadwalan kelas.</p>
            </div>

            <!-- PANEL: INPUT JADWAL & GEMBOK MATERI KELAS -->
            <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 mb-8">
                <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                    <i class="fas fa-calendar-alt text-amber-500"></i> Atur Jadwal (Anti-Tabrak), Masa Aktif & Akses Bulan
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
                    <label class="block text-sm font-bold text-slate-800 mb-3">Pilih Hari Kelas Rutin</label>
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
                        <i class="fas fa-save"></i> Terapkan Pengaturan ke Murid
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
}

// ==== FUNGSI ADMIN DATABASE ====

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
        let clashMessage = '';
        const s1 = parseInt(startTime.replace(':', ''));
        const e1 = parseInt(endTime.replace(':', ''));

        for (let s of students) {
            if (s.email === email) continue; 
            
            let p = materials[`profile-${s.email}`];
            if (p && p.days && p.time && p.time.includes(' - ')) {
                let [otherStart, otherEnd] = p.time.split(' - ');
                let s2 = parseInt(otherStart.replace(':', ''));
                let e2 = parseInt(otherEnd.replace(':', ''));

                let isOverlapping = (s1 < e2) && (s2 < e1);
                
                if (isOverlapping) {
                    let intersectingDays = selectedDays.filter(d => p.days.includes(d));
                    if (intersectingDays.length > 0) {
                        clashMessage = `⚠️ GAGAL!\n\nJadwal bertabrakan dengan murid "${s.name}".\n\nMurid tersebut sudah mem-booking jam ${p.time} di hari ${intersectingDays.join(', ')}.`;
                        break;
                    }
                }
            }
        }

        if (clashMessage) {
            alert(clashMessage);
            return; 
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