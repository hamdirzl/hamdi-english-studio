// script.js

// ==== KONFIGURASI NOTIFIKASI TELEGRAM ====
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
    if (!p || !p.days || p.days.length === 0) return { error: 'Jadwal belum diatur.' };
    if (!p.validUntil || p.validUntil === 'Belum diatur') return { error: 'Masa aktif belum diatur.' };
    
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
    return { error: 'Tidak ada jadwal aktif terdekat.' };
}

// ==== SINKRONISASI DATA ====
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
                if (document.getElementById('main-content').innerHTML.includes('Selamat Datang')) renderDashboard();
                if (document.getElementById('main-content').innerHTML.includes('Pengajuan Ganti Jadwal')) renderReschedule();
                if (document.getElementById('main-content').innerHTML.includes('Administrasi')) renderAdminCMS();
            }
        }
    } catch (e) {
        console.error("Gagal sinkronisasi", e);
    }
}
fetchCloudData();

// ==== DOM & EVENT LISTENERS ====
const loginPage = document.getElementById('login-page');
const appPage = document.getElementById('app-page');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const sidebar = document.getElementById('sidebar');
const sidebarMenu = document.getElementById('sidebar-menu');
const mainContent = document.getElementById('main-content');

function checkExistingSession() {
    const savedUser = localStorage.getItem('hes_session_user');
    const savedRole = localStorage.getItem('hes_session_role');
    if (savedUser && savedRole) {
        currentUser = JSON.parse(savedUser);
        userRole = savedRole;
        loginSuccess(false);
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
    if (saveSession) {
        localStorage.setItem('hes_session_user', JSON.stringify(currentUser));
        localStorage.setItem('hes_session_role', userRole);
    }
    
    loginPage.classList.add('hidden');
    appPage.classList.remove('hidden');
    const initial = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-avatar').innerText = initial;
    document.getElementById('user-name-display').innerText = currentUser.name;
    document.getElementById('user-role-display').innerText = userRole === 'admin' ? 'Administrator' : 'Student';
    renderSidebar(); renderDashboard();
}

function handleLogout() {
    localStorage.removeItem('hes_session_user');
    localStorage.removeItem('hes_session_role');
    
    currentUser = null; userRole = null;
    document.getElementById('email').value = ''; document.getElementById('password').value = '';
    loginError.classList.add('hidden'); appPage.classList.add('hidden'); loginPage.classList.remove('hidden');
}

// ==== RENDER SIDEBAR ====
function renderSidebar() {
    let menuHTML = '<div class="space-y-1.5">';

    if (userRole === 'admin') {
        menuHTML += `
            <button onclick="renderAdminCMS()" class="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors">
                <i class="fas fa-cog w-6 text-slate-400"></i> Administrasi
            </button>
        `;
    }

    menuHTML += `
        <button onclick="renderDashboard()" class="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors">
            <i class="fas fa-home w-6 text-slate-400"></i> Beranda
        </button>
        <button onclick="renderReschedule()" class="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors">
            <i class="fas fa-calendar-alt w-6 text-slate-400"></i> Reschedule Jadwal
        </button>
    </div>
    <div class="pt-6 pb-2">
        <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 pl-3">Materi Pembelajaran</p>
        <div class="space-y-1">
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
                <div class="px-3 py-2.5 flex justify-between items-center bg-transparent opacity-60 cursor-not-allowed" onclick="alert('Materi ini belum dapat diakses. Selesaikan bulan sebelumnya atau hubungi admin.')">
                    <div class="flex items-center text-slate-500 font-medium text-sm">
                        <i class="fas fa-lock w-6 text-slate-300"></i> ${month.title}
                    </div>
                </div>
            `;
        } else {
            menuHTML += `
                <div>
                    <div class="px-3 py-2.5 flex justify-between items-center cursor-pointer rounded-lg hover:bg-slate-100 transition-colors" onclick="toggleMenu('m-${month.id}', this)">
                        <div class="flex items-center text-slate-700 font-medium text-sm">
                            <i class="far fa-folder w-6 text-blue-500"></i> ${month.title}
                        </div>
                        <i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform"></i>
                    </div>
                    <div id="m-${month.id}" class="hidden pl-6 py-1 space-y-1 border-l border-slate-100 ml-4 my-1">
            `;
            month.weeks.forEach(week => {
                menuHTML += `
                    <div>
                        <div class="px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 cursor-pointer flex justify-between items-center" onclick="toggleMenu('w-${month.id}-${week}', this)">
                            <span>Week ${week}</span>
                            <i class="fas fa-angle-down text-[10px] transition-transform"></i>
                        </div>
                        <div id="w-${month.id}-${week}" class="hidden pl-3 py-1 space-y-1">
                `;
                [1, 2, 3].forEach(day => {
                    menuHTML += `
                        <div class="px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 cursor-pointer flex items-center" onclick="renderMateri('${month.id}', ${week}, ${day}, '${month.title}')">
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span> Day ${day}
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

// ==== DASHBOARD ====
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
                    
                    let statusLabel = isPendingMoveAway ? ' (Pengajuan Pindah)' : (isPendingMoveHere ? ' (Menunggu Validasi)' : '');
                    
                    bookings.push(`<div class="text-sm font-medium text-slate-700 py-1.5 border-b border-slate-50 last:border-0 flex items-center"><span class="w-16 text-xs text-slate-500">${p.time}</span> ${s.name} <span class="text-xs text-amber-500 ml-1">${statusLabel}</span></div>`);
                }
                
                if (i === 0 && p && p.pendingReschedules) {
                    pendingRescheduleCount += Object.keys(p.pendingReschedules).length;
                }
            });
            
            let listHTML = bookings.length === 0 
                ? `<p class="text-sm text-slate-400 italic py-2">Tidak ada jadwal</p>` 
                : bookings.join('');
                
            adminGridHTML += `
                <div class="bg-white p-5 rounded-xl border ${i===0?'border-blue-200 shadow-sm':'border-slate-200'}">
                    <h4 class="font-semibold ${i===0?'text-blue-700':'text-slate-800'} text-sm border-b border-slate-100 pb-3 mb-3">
                        ${i===0?'Hari Ini - ':''}${displayDay}
                    </h4>
                    <div class="space-y-1">${listHTML}</div>
                </div>
            `;
        }

        let alertHTML = '';
        if (pendingRescheduleCount > 0) {
            alertHTML = `
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 flex flex-col md:flex-row items-center justify-between">
                    <div class="flex items-center gap-3 mb-3 md:mb-0">
                        <i class="fas fa-info-circle text-blue-500"></i>
                        <span class="text-blue-800 text-sm font-medium">Terdapat ${pendingRescheduleCount} permintaan perubahan jadwal yang perlu ditinjau.</span>
                    </div>
                    <button onclick="renderAdminCMS()" class="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                        Tinjau Sekarang
                    </button>
                </div>
            `;
        }

        mainContent.innerHTML = `
            <div class="max-w-5xl mx-auto fade-in pb-10">
                <div class="mb-8">
                    <h2 class="text-2xl font-bold text-slate-800 mb-1">Selamat Datang, Bro Hamdi.</h2>
                    <p class="text-slate-500 text-sm">Ringkasan jadwal mengajar untuk 7 hari ke depan.</p>
                </div>
                ${alertHTML}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${adminGridHTML}
                </div>
            </div>
        `;
        return;
    }

    // DASHBOARD MURID
    let latestMonth = "Belum Ada"; let latestWeek = "-"; let latestDay = "-";
    let progressText = "Belum ada materi pembelajaran yang tersedia.";
    
    months.forEach(m => {
        m.weeks.forEach(w => {
            [1,2,3].forEach(d => {
                if (materials[`${currentUser.email}-${m.id}-w${w}-d${d}-link`] || materials[`all-${m.id}-w${w}-d${d}-link`]) {
                    latestMonth = m.title; latestWeek = w; latestDay = d;
                    progressText = `Posisi pembelajaran Anda saat ini: ${m.title} - Week ${w} Day ${d}.`;
                }
            });
        });
    });

    let nextSesh = getStudentNextSessionInfo(currentUser.email);
    let premiumCardContent = '';
    
    if (nextSesh.expired) {
        premiumCardContent = `
            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-4">
                <p class="text-slate-800 font-semibold text-sm mb-1">Masa aktif telah berakhir</p>
                <p class="text-xs text-slate-500 mb-3">Masa aktif langganan Anda berakhir pada ${nextSesh.validDateStr}.</p>
                <button onclick="alert('Silakan hubungi Bro Hamdi via WhatsApp untuk informasi lebih lanjut.')" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-slate-50">
                    Hubungi Admin
                </button>
            </div>
        `;
    } else if (nextSesh.error) {
        premiumCardContent = `
            <div class="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-4 text-sm text-slate-600">
                ${nextSesh.error} Menunggu konfirmasi admin.
            </div>
        `;
    } else {
        premiumCardContent = `
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-4">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Jadwal Mendatang</p>
                <p class="font-bold text-lg text-slate-800">${nextSesh.displayDate}</p>
                <p class="text-sm text-slate-600 font-medium mb-3">Pukul: ${nextSesh.time}</p>
                <p class="text-xs text-slate-400">Aktif s/d: ${nextSesh.validDateStr}</p>
            </div>
        `;
    }

    mainContent.innerHTML = `
        <div class="max-w-4xl mx-auto fade-in pb-10">
            <div class="mb-8 border-b border-slate-200 pb-6">
                <h2 class="text-2xl font-bold text-slate-800 mb-2">Selamat Datang, ${currentUser.name.split(' ')[0]}</h2>
                <p class="text-slate-500 text-sm">Lanjutkan proses belajar bahasa Inggris Anda hari ini.</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Info Jadwal -->
                <div>
                    <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <i class="far fa-calendar text-blue-500"></i> Informasi Kelas
                    </h3>
                    ${premiumCardContent}
                </div>

                <!-- Info Progress -->
                <div>
                    <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2 mb-4">
                        <i class="fas fa-chart-line text-blue-500"></i> Kemajuan Belajar
                    </h3>
                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-sm text-slate-600 mb-4">${progressText}</p>
                        <div class="flex flex-wrap gap-2">
                            <span class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium border border-slate-200">${latestMonth}</span>
                            <span class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium border border-slate-200">Week ${latestWeek}</span>
                            <span class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium border border-slate-200">Day ${latestDay}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==== MATERI & VOCABULARY ====
function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//);
        if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return link;
}

window.submitVocab = async function(btnElement, m, w, d) {
    let key = `vocab_status-${currentUser.email}-${m}-w${w}-d${d}`;
    materials[key] = { status: 'submitted', feedback: '' };
    
    const origText = btnElement.innerHTML;
    btnElement.innerHTML = 'Mengirim data...'; 
    btnElement.disabled = true;
    
    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) {
        alert("Gagal mengirim data: " + error.message);
        btnElement.innerHTML = origText; 
        btnElement.disabled = false;
    } else {
        alert("Tugas hafalan berhasil dikirim. Menunggu tinjauan admin.");
        let monthTitle = months.find(mo=>mo.id===m)?.title || 'Materi';
        sendTelegramNotification(`📢 Pemberitahuan Hafalan\n\nMurid: ${currentUser.name}\nSesi: ${monthTitle} - W${w} D${d}`);
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
                <div class="snap-center shrink-0 w-40 bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
                    <p class="font-bold text-slate-800 text-base">${en}</p>
                    <p class="text-xs font-medium text-slate-500 mt-1">${idText}</p>
                </div>
            `;
        }).join('');

        let actionUI = '';
        if (vocabStatus.status === 'none' || !vocabStatus.status) {
            actionUI = `<button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="mt-4 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition">Tandai Sudah Hafal</button>`;
        } else if (vocabStatus.status === 'submitted') {
            actionUI = `<div class="mt-4 text-sm text-slate-600 bg-slate-100 px-4 py-2.5 inline-block rounded-lg border border-slate-200">Menunggu tinjauan admin...</div>`;
        } else if (vocabStatus.status === 'approved') {
            actionUI = `<div class="mt-4 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                <p class="text-sm font-semibold text-green-800 mb-1">Telah diverifikasi</p>
                <p class="text-xs text-green-700">Catatan: "${vocabStatus.feedback}"</p>
            </div>`;
        }

        vocabHTML = `
            <div class="mb-8">
                <h3 class="text-base font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">Kosakata Harian</h3>
                <div class="bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <div class="flex overflow-x-auto gap-3 pb-2 snap-x custom-scrollbar">
                        ${wordCards}
                    </div>
                    ${userRole === 'student' ? actionUI : '<p class="text-xs text-slate-400 mt-3">Pratinjau antarmuka murid.</p>'}
                </div>
            </div>
        `;
    }

    let pdfViewerHTML = linkDrive 
        ? `<div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative h-[70vh] w-full"><iframe src="${linkDrive}" class="absolute top-0 left-0 w-full h-full" allow="autoplay"></iframe></div>` 
        : `<div class="bg-slate-50 p-8 rounded-xl text-center border border-slate-200"><p class="text-sm text-slate-500">Materi presentasi belum tersedia.</p></div>`;
           
    let recapViewerHTML = recapDrive 
        ? `<div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative h-[70vh] w-full"><iframe src="${recapDrive}" class="absolute top-0 left-0 w-full h-full" allow="autoplay"></iframe></div>` 
        : `<div class="bg-slate-50 p-8 rounded-xl text-center border border-slate-200"><p class="text-sm text-slate-500">Rangkuman belum tersedia.</p></div>`;

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-10">
            <div class="mb-6 flex items-center gap-4">
                <button onclick="renderDashboard()" class="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <i class="fas fa-arrow-left text-sm"></i>
                </button>
                <div>
                    <h2 class="text-xl font-bold text-slate-800">${monthTitle}</h2>
                    <p class="text-slate-500 text-sm mt-0.5">Week ${week} - Day ${day}</p>
                </div>
            </div>
            
            ${vocabHTML}

            <div class="space-y-8">
                <div>
                    <h3 class="text-base font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">Materi Presentasi</h3>
                    ${pdfViewerHTML}
                </div>
                <div>
                    <h3 class="text-base font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">Rangkuman</h3>
                    ${recapViewerHTML}
                </div>
            </div>
        </div>
    `;
}

// ==== RESCHEDULE ====
window.processReschedule = async function(newDateStr) {
    let oldDateStr = document.getElementById('reschedule-old-day').value;
    if (!oldDateStr) { alert('Silakan pilih jadwal awal terlebih dahulu.'); return; }

    let oldDisplay = getDisplayDate(parseDateStr(oldDateStr));
    let newDisplay = getDisplayDate(parseDateStr(newDateStr));

    if (confirm(`Ajukan perubahan jadwal:\nDari: ${oldDisplay}\nKe: ${newDisplay}\n\nLanjutkan?`)) {
        let p = materials[`profile-${currentUser.email}`];
        if(!p.pendingReschedules) p.pendingReschedules = {};
        
        p.pendingReschedules[oldDateStr] = newDateStr;
        
        document.body.style.cursor = 'wait';
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
        document.body.style.cursor = 'default';
        
        if (error) {
            alert("Terjadi kesalahan sistem: " + error.message);
            delete p.pendingReschedules[oldDateStr]; 
        } else {
            alert("Pengajuan berhasil dikirim.");
            sendTelegramNotification(`Permintaan Reschedule\n\nMurid: ${currentUser.name}\nAsal: ${oldDisplay}\nBaru: ${newDisplay}`);
            renderReschedule();
        }
    }
}

window.updateRescheduleGrid = function() {
    let oldDateStr = document.getElementById('reschedule-old-day').value;
    const gridContainer = document.getElementById('reschedule-grid-container');
    if (!oldDateStr) {
        gridContainer.innerHTML = '<p class="text-slate-500 text-sm py-4">Pilih jadwal untuk melihat ketersediaan waktu.</p>';
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
                 gridHTML += `<div class="p-4 rounded-xl border border-slate-300 bg-slate-100 flex flex-col text-center">
                    <div class="font-semibold text-slate-700 text-sm mb-2 border-b border-slate-200 pb-2">${displayDay}</div>
                    <div class="text-xs text-slate-500 py-3">${isPendingOld ? 'Menunggu Konfirmasi' : 'Jadwal Saat Ini'}</div>
                </div>`;
            } else if (isPendingNew) {
                gridHTML += `<div class="p-4 rounded-xl border border-blue-200 bg-blue-50 flex flex-col text-center">
                    <div class="font-semibold text-blue-800 text-sm mb-2 border-b border-blue-200 pb-2">${displayDay}</div>
                    <div class="text-xs text-blue-600 py-3">Menunggu Persetujuan</div>
                </div>`;
            } else {
                 gridHTML += `<div class="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col text-center">
                    <div class="font-semibold text-slate-500 text-sm mb-2 border-b border-slate-200 pb-2">${displayDay}</div>
                    <div class="text-xs text-slate-400 py-3">Telah Terjadwal</div>
                </div>`;
            }
            continue;
        }

        if (isPast) {
            gridHTML += `<div class="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col text-center opacity-60">
                <div class="font-semibold text-slate-400 text-sm mb-2 border-b border-slate-100 pb-2">${displayDay}</div>
                <div class="text-xs text-slate-400 py-3">Tidak Berlaku</div>
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
            gridHTML += `<div class="p-4 rounded-xl border border-slate-200 bg-white flex flex-col">
                    <div class="font-semibold text-slate-700 text-sm mb-2 text-center border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="text-xs text-slate-500 text-center py-2 mb-2">Slot tidak tersedia</div>
                    <button disabled class="w-full mt-auto py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-400">Terkunci</button>
                </div>`;
        } else {
            if (isPendingOld) {
                gridHTML += `<div class="p-4 rounded-xl border border-slate-200 bg-white flex flex-col opacity-60">
                    <div class="font-semibold text-slate-500 text-sm mb-2 text-center border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="text-xs text-slate-400 text-center py-2 mb-2">Menunggu aksi admin</div>
                </div>`;
            } else {
                gridHTML += `<div class="p-4 rounded-xl border border-slate-200 bg-white flex flex-col hover:border-blue-300 transition-colors">
                    <div class="font-semibold text-slate-700 text-sm mb-2 text-center border-b border-slate-100 pb-2">${displayDay}</div>
                    <div class="text-xs text-green-600 text-center py-2 mb-2 font-medium">Tersedia</div>
                    <button onclick="processReschedule('${currStr}')" class="w-full mt-auto py-2 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                        Pilih
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
            <div class="bg-slate-50 border border-slate-200 p-5 rounded-xl mb-6">
                <p class="text-sm text-slate-700">Fitur penyesuaian jadwal ditutup sementara. Masa aktif Anda telah berakhir pada ${nextSeshInfo.validDateStr}. Hubungi admin untuk perpanjangan.</p>
            </div>`;
        isBlocked = true;
    } else if (nextSeshInfo.error) {
        rescheduleHeader = `<div class="bg-slate-50 border border-slate-200 p-5 rounded-xl mb-6 text-sm text-slate-700">Penyesuaian jadwal belum tersedia.</div>`;
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
                limitHit = true; break;
            }
            
            let currStr = formatDateForID(curr);
            if (isOccupied(currentUser.email, currStr)) {
                let isPending = p.pendingReschedules && p.pendingReschedules[currStr];
                upcomingOptions.push(`<option value="${currStr}">Pertemuan ${count}: ${getDisplayDate(curr)} ${isPending?'(Proses)':''}</option>`);
                count++;
            }
        }

        if (limitHit && upcomingOptions.length > 0) upcomingOptions.push(`<option disabled>--- Batas waktu ---</option>`);

        rescheduleHeader = `
            <div class="bg-white border border-slate-200 p-6 rounded-xl mb-6">
                <label class="block text-sm font-semibold text-slate-700 mb-3">Pilih jadwal yang akan diubah:</label>
                <div class="flex flex-col md:flex-row items-start md:items-center gap-3">
                    <select id="reschedule-old-day" onchange="updateRescheduleGrid()" class="border border-slate-300 py-2.5 px-3 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:border-blue-400 w-full md:w-80">
                        ${upcomingOptions.length > 0 ? upcomingOptions.join('') : '<option value="">Tidak ada kelas aktif</option>'}
                    </select>
                    <span class="text-xs text-slate-500">Waktu: ${p.time}</span>
                </div>
            </div>`;
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in pb-10">
            <h2 class="text-2xl font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Pengajuan Ganti Jadwal</h2>
            ${rescheduleHeader}
            ${!isBlocked ? `<div id="reschedule-grid-container" class="grid grid-cols-2 lg:grid-cols-4 gap-4"></div>` : ''}
        </div>
    `;
    
    if (!isBlocked) window.updateRescheduleGrid();
}

// ==== ADMIN CMS ====
window.checkVocabStatus = async function(btnElement) {
    let resDiv = document.getElementById('vocab-review-result');
    let origText = '';
    
    if(btnElement) {
        origText = btnElement.innerHTML;
        btnElement.innerHTML = 'Memeriksa...';
        btnElement.disabled = true;
    } else {
        resDiv.innerHTML = `<div class="text-sm text-slate-500 py-4">Menyinkronkan data...</div>`;
    }

    try {
        const { data } = await window.supabaseClient.from('app_data').select('*');
        if (data) {
            const matData = data.find(d => d.key === 'hes_materials');
            if (matData && matData.value) materials = matData.value;
        }
    } catch(e) {}

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
        resDiv.innerHTML = `<div class="text-sm text-slate-500 py-3">Belum ada penyetoran.</div>`;
    } else if (statusObj.status === 'submitted') {
        resDiv.innerHTML = `
            <div class="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p class="text-sm font-medium text-slate-700 mb-2">Tugas siap ditinjau.</p>
                <input type="text" id="admin-feedback" placeholder="Catatan umpan balik..." class="w-full p-2 border border-slate-300 rounded-md text-sm mb-3">
                <button onclick="approveVocab('${email}', '${m}', '${w}', '${d}')" class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Verifikasi</button>
            </div>
        `;
    } else if (statusObj.status === 'approved') {
        resDiv.innerHTML = `<div class="text-sm text-green-700 py-3">Telah diverifikasi.</div>`;
    }
}

window.approveVocab = async function(email, m, w, d) {
    let feedback = document.getElementById('admin-feedback').value || 'Selesai ditinjau.';
    let key = `vocab_status-${email}-${m}-w${w}-d${d}`;
    materials[key] = { status: 'approved', feedback: feedback };

    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) alert("Error: " + error.message);
    else { alert("Catatan tersimpan."); checkVocabStatus(); }
}

function renderAdminCMS() {
    autoCloseSidebar();
    if (userRole !== 'admin') return;

    const monthOptions = months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMonthOptions = months.map(m => `<option value="${m.id.replace('m','')}">Hingga ${m.title}</option>`).join('');
    const weekOptions = [1,2,3,4].map(w => `<option value="${w}">Week ${w}</option>`).join('');
    const dayOptions = [1,2,3].map(d => `<option value="${d}">Day ${d}</option>`).join('');
    const studentOptions = students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    let pendingReschedulesHTML = '';
    students.forEach(s => {
        let p = materials[`profile-${s.email}`];
        if (p && p.pendingReschedules) {
            for (const [oldD, newD] of Object.entries(p.pendingReschedules)) {
                pendingReschedulesHTML += `
                    <div class="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-lg mb-2 text-sm">
                        <div>
                            <span class="font-medium text-slate-800">${s.name}</span>
                            <span class="text-slate-500 mx-2">|</span>
                            <span class="text-slate-500">${getDisplayDate(parseDateStr(oldD))} &rarr; ${getDisplayDate(parseDateStr(newD))}</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="approveReschedule('${s.email}', '${oldD}', '${newD}')" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200">Terima</button>
                            <button onclick="rejectReschedule('${s.email}', '${oldD}')" class="text-slate-600 hover:bg-slate-100 px-3 py-1 rounded border border-slate-200">Tolak</button>
                        </div>
                    </div>
                `;
            }
        }
    });
    if (!pendingReschedulesHTML) pendingReschedulesHTML = `<p class="text-slate-400 text-sm py-2">Tidak ada pengajuan.</p>`;

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-6 fade-in pb-12">
            <h2 class="text-2xl font-bold text-slate-800 border-b border-slate-200 pb-2">Panel Administrasi</h2>

            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm" id="admin-approval-panel">
                <h3 class="text-base font-semibold text-slate-800 mb-4">Persetujuan Jadwal</h3>
                <div>${pendingReschedulesHTML}</div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Kosakata -->
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-base font-semibold text-slate-800 mb-4">Input Kosakata</h3>
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <select id="admin-vocab-month" class="border border-slate-300 py-1.5 px-2 rounded text-sm">${monthOptions}</select>
                        <select id="admin-vocab-week" class="border border-slate-300 py-1.5 px-2 rounded text-sm">${weekOptions}</select>
                        <select id="admin-vocab-day" class="border border-slate-300 py-1.5 px-2 rounded text-sm">${dayOptions}</select>
                    </div>
                    <textarea id="admin-vocab-list" rows="4" placeholder="Format: Inggris = Indonesia" class="w-full p-3 border border-slate-300 rounded text-sm outline-none resize-none mb-3"></textarea>
                    <button onclick="saveVocabList(event)" class="w-full bg-slate-800 text-white py-2 rounded text-sm font-medium hover:bg-slate-700">Simpan</button>
                </div>

                <!-- Tinjauan -->
                <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-base font-semibold text-slate-800 mb-4">Tinjau Hafalan</h3>
                    <select id="admin-review-student" class="w-full border border-slate-300 py-1.5 px-2 rounded text-sm mb-3">${studentOptions}</select>
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <select id="admin-review-month" class="border border-slate-300 py-1.5 px-2 rounded text-sm">${monthOptions}</select>
                        <select id="admin-review-week" class="border border-slate-300 py-1.5 px-2 rounded text-sm">${weekOptions}</select>
                        <select id="admin-review-day" class="border border-slate-300 py-1.5 px-2 rounded text-sm">${dayOptions}</select>
                    </div>
                    <button onclick="checkVocabStatus(this)" class="w-full bg-white border border-slate-300 text-slate-700 py-2 rounded text-sm font-medium hover:bg-slate-50">Periksa</button>
                    <div id="vocab-review-result" class="mt-4 pt-2 border-t border-slate-100"></div>
                </div>
            </div>

            <!-- Konfigurasi Jadwal -->
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 class="text-base font-semibold text-slate-800 mb-4">Atur Kelas Murid</h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Murid</label>
                        <select id="admin-sched-student" class="w-full border border-slate-300 p-2 rounded text-sm">${studentOptions}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Batas Akses</label>
                        <select id="admin-sched-max-month" class="w-full border border-slate-300 p-2 rounded text-sm">${maxMonthOptions}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Akhir Masa Aktif</label>
                        <input type="date" id="admin-sched-date" class="w-full border border-slate-300 p-2 rounded text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Waktu (Mulai - Selesai)</label>
                        <div class="flex gap-2">
                            <input type="time" id="admin-sched-start" class="w-full border border-slate-300 p-1.5 rounded text-sm">
                            <input type="time" id="admin-sched-end" class="w-full border border-slate-300 p-1.5 rounded text-sm">
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-xs font-semibold text-slate-600 mb-2">Hari Default</label>
                    <div class="flex gap-3 text-sm">
                        <label><input type="checkbox" value="Senin" class="admin-day-cb"> Sen</label>
                        <label><input type="checkbox" value="Selasa" class="admin-day-cb"> Sel</label>
                        <label><input type="checkbox" value="Rabu" class="admin-day-cb"> Rab</label>
                        <label><input type="checkbox" value="Kamis" class="admin-day-cb"> Kam</label>
                        <label><input type="checkbox" value="Jumat" class="admin-day-cb"> Jum</label>
                        <label><input type="checkbox" value="Sabtu" class="admin-day-cb"> Sab</label>
                    </div>
                </div>
                <button onclick="saveStudentSchedule(event)" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">Terapkan Pengaturan</button>
            </div>

            <!-- Konten Tambahan -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Tambah Data -->
                <div class="space-y-6">
                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-sm font-semibold text-slate-800 mb-3">Modul Baru</h3>
                        <button onclick="addNewMonth()" class="w-full bg-slate-100 text-slate-700 py-2 rounded text-sm font-medium hover:bg-slate-200">Tambah Bulan</button>
                    </div>
                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 class="text-sm font-semibold text-slate-800 mb-3">Murid Baru</h3>
                        <input type="text" id="new-stu-name" placeholder="Nama" class="w-full p-2 border border-slate-300 rounded text-sm mb-2">
                        <input type="email" id="new-stu-email" placeholder="Email" class="w-full p-2 border border-slate-300 rounded text-sm mb-2">
                        <input type="text" id="new-stu-pass" placeholder="Password" class="w-full p-2 border border-slate-300 rounded text-sm mb-3">
                        <button onclick="addNewStudent()" class="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700">Daftarkan</button>
                    </div>
                </div>

                <!-- Input File -->
                <div class="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="text-base font-semibold text-slate-800 mb-4">Pusat Materi Dokumen</h3>
                    <select id="admin-target-student" class="w-full border border-slate-300 p-2 rounded text-sm mb-4">
                        <option value="all">Semua Murid (Materi Dasar)</option>
                        ${studentOptions}
                    </select>
                    <div class="grid grid-cols-3 gap-3 mb-4 text-sm">
                        <select id="admin-month" class="border border-slate-300 p-2 rounded">${monthOptions}</select>
                        <select id="admin-week" class="border border-slate-300 p-2 rounded">${weekOptions}</select>
                        <select id="admin-day" class="border border-slate-300 p-2 rounded">${dayOptions}</select>
                    </div>
                    <input type="text" id="admin-link" placeholder="Tautan PDF Materi (Google Drive)" class="w-full p-2 border border-slate-300 rounded text-sm mb-3">
                    <input type="text" id="admin-recap-pdf" placeholder="Tautan PDF Rangkuman" class="w-full p-2 border border-slate-300 rounded text-sm mb-4">
                    <button onclick="saveMaterialData()" class="bg-blue-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-700">Unggah Materi</button>
                </div>
            </div>

            <!-- Akun -->
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 class="text-base font-semibold text-slate-800 mb-4">Daftar Akun</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <th class="p-3 font-medium">Nama</th>
                                <th class="p-3 font-medium">Email</th>
                                <th class="p-3 font-medium">Password</th>
                                <th class="p-3 font-medium">Tindakan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map((s, idx) => `
                                <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                    <td class="p-3 text-slate-800">${s.name}</td>
                                    <td class="p-3 text-slate-600">${s.email}</td>
                                    <td class="p-3">
                                        <div class="flex items-center gap-2">
                                            <input type="password" value="${s.password}" id="pwd-${idx}" class="bg-transparent border-none w-16 outline-none text-slate-500 text-xs" readonly>
                                            <button onclick="togglePassword('pwd-${idx}')" class="text-slate-400"><i class="fas fa-eye text-xs"></i></button>
                                        </div>
                                    </td>
                                    <td class="p-3">
                                        <button onclick="editStudentPassword('${s.email}')" class="text-blue-500 mr-2 text-xs">Ubah Sandi</button>
                                        <button onclick="deleteStudentAccount('${s.email}')" class="text-red-500 text-xs">Hapus</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

window.approveReschedule = async function(email, oldDate, newDate) {
    let p = materials[`profile-${email}`];
    if(!p.reschedules) p.reschedules = {};
    p.reschedules[oldDate] = newDate;
    delete p.pendingReschedules[oldDate];
    
    document.body.style.cursor = 'wait';
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    document.body.style.cursor = 'default';
    
    if (error) alert("Error: " + error.message);
    else { alert("Disetujui."); renderAdminCMS(); }
}

window.rejectReschedule = async function(email, oldDate) {
    if(confirm("Tolak pengajuan jadwal ini?")) {
        let p = materials[`profile-${email}`];
        delete p.pendingReschedules[oldDate]; 
        
        document.body.style.cursor = 'wait';
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
        document.body.style.cursor = 'default';
        
        if (error) alert("Error: " + error.message);
        else { alert("Ditolak."); renderAdminCMS(); }
    }
}

window.saveVocabList = async function(e) {
    const m = document.getElementById('admin-vocab-month').value;
    const w = document.getElementById('admin-vocab-week').value;
    const d = document.getElementById('admin-vocab-day').value;
    const vocabText = document.getElementById('admin-vocab-list').value;

    materials[`vocab-${m}-w${w}-d${d}`] = vocabText;

    const btn = e.currentTarget; const origText = btn.innerHTML;
    btn.innerHTML = 'Menyimpan...'; btn.disabled = true;
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    btn.innerHTML = origText; btn.disabled = false;
    
    if (error) alert("Error: " + error.message);
    else { alert("Data tersimpan."); document.getElementById('admin-vocab-list').value = ''; }
}

window.togglePassword = function(id) {
    const input = document.getElementById(id);
    if(input.type === 'password') input.type = 'text'; else input.type = 'password';
}

window.editStudentPassword = async function(email) {
    const studentIndex = students.findIndex(s => s.email === email);
    if(studentIndex === -1) return;
    const newPassword = prompt(`Password baru untuk ${students[studentIndex].name}:`, students[studentIndex].password);
    if(newPassword !== null && newPassword.trim() !== '') {
        students[studentIndex].password = newPassword.trim();
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);
        if (error) alert("Gagal: " + error.message);
        else { renderAdminCMS(); }
    }
}

window.deleteStudentAccount = async function(email) {
    if(confirm(`Konfirmasi hapus akun: ${email}?`)) {
        const newStudents = students.filter(s => s.email !== email);
        const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: newStudents }]);
        if (error) alert("Gagal: " + error.message);
        else { students = newStudents; renderAdminCMS(); }
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

    let profile = materials[`profile-${email}`] || {};
    profile.validUntil = dateInput || profile.validUntil || 'Belum diatur';
    if (startTime && endTime) { profile.time = `${startTime} - ${endTime}`; } 
    else { profile.time = profile.time || 'Belum diatur'; }
    
    profile.maxMonth = maxMonthInput || profile.maxMonth || 1;
    if(selectedDays.length > 0) profile.days = selectedDays;
    
    materials[`profile-${email}`] = profile;
    
    const btn = e.currentTarget; const origText = btn.innerHTML;
    btn.innerHTML = 'Menyimpan...'; btn.disabled = true;

    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    
    btn.innerHTML = origText; btn.disabled = false;
    
    if (error) alert("Gagal: " + error.message);
    else { alert("Pengaturan jadwal berhasil diterapkan."); }
}

window.addNewMonth = async function() {
    const nextNum = months.length + 1; const newMonth = { id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] }; months.push(newMonth);
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_months', value: months }]);
    if (error) { alert("Gagal: " + error.message); months.pop(); } else { renderSidebar(); renderAdminCMS(); }
};

window.addNewStudent = async function() {
    const name = document.getElementById('new-stu-name').value; const email = document.getElementById('new-stu-email').value; const pass = document.getElementById('new-stu-pass').value;
    if(!name || !email || !pass) { alert("Lengkapi data."); return; }
    students.push({ name: name, email: email, password: pass });
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);
    if (error) { alert("Gagal: " + error.message); students.pop(); } else { alert("Tersimpan."); renderAdminCMS(); }
}

window.saveMaterialData = async function() {
    const targetStudent = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value; const w = document.getElementById('admin-week').value; const d = document.getElementById('admin-day').value;
    const link = document.getElementById('admin-link').value; const recap = document.getElementById('admin-recap-pdf').value;
    
    const keyPrefix = `${targetStudent}-${m}-w${w}-d${d}`;
    if(link) materials[`${keyPrefix}-link`] = link; if(recap) materials[`${keyPrefix}-recap`] = recap;
    
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);
    if (error) { alert("Gagal: " + error.message); } 
    else { alert("Materi tersimpan."); }
};