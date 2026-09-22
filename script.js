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
document.getElementById('open-sidebar').addEventListener('click', () => {
    sidebar.classList.remove('-translate-x-full');
});
document.getElementById('close-sidebar').addEventListener('click', () => {
    sidebar.classList.add('-translate-x-full');
});
document.getElementById('logout-btn').addEventListener('click', handleLogout);

// ==== LOGIKA LOGIN ====
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (email === 'hamdirizall1@gmail.com' && password === 'admin') {
        userRole = 'admin';
        currentUser = { name: 'Bro Hamdi', email: email };
        loginSuccess();
    } else {
        const student = students.find(s => s.email === email && s.password === password);
        if (student) {
            userRole = 'student';
            currentUser = student;
            loginSuccess();
        } else {
            loginError.classList.remove('hidden');
        }
    }
});

function loginSuccess() {
    loginPage.classList.add('hidden');
    appPage.classList.remove('hidden');
    
    const initial = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('user-avatar').innerText = initial;
    document.getElementById('user-name-display').innerText = `Hi, ${currentUser.name}`;
    document.getElementById('user-role-display').innerText = userRole === 'admin' ? 'Administrator' : 'Student';
    
    renderSidebar();
    renderDashboard();
}

function handleLogout() {
    currentUser = null;
    userRole = null;
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    loginError.classList.add('hidden');
    appPage.classList.add('hidden');
    loginPage.classList.remove('hidden');
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

    months.forEach((month) => {
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
    });

    menuHTML += `</div></div>`;
    sidebarMenu.innerHTML = menuHTML;
}

function toggleMenu(id, el) {
    const target = document.getElementById(id);
    const icon = el.querySelector('.fa-chevron-down, .fa-angle-down');
    if (target.classList.contains('hidden')) {
        target.classList.remove('hidden');
        if(icon) icon.style.transform = 'rotate(180deg)';
    } else {
        target.classList.add('hidden');
        if(icon) icon.style.transform = 'rotate(0deg)';
    }
}

function autoCloseSidebar() {
    if (window.innerWidth < 768) {
        sidebar.classList.add('-translate-x-full');
    }
}

// ==== HALAMAN DASHBOARD & PROGRESS LOGIC ====
function renderDashboard() {
    autoCloseSidebar();
    
    // Kalkulasi Progress Murid
    let latestMonth = "Belum Ada";
    let latestWeek = "-";
    let latestDay = "-";
    let progressText = "Belum ada materi yang tersedia untukmu saat ini.";
    
    if (userRole === 'student') {
        months.forEach(m => {
            m.weeks.forEach(w => {
                [1,2,3].forEach(d => {
                    const keyStudentMat = `${currentUser.email}-${m.id}-w${w}-d${d}-link`;
                    const keyAllMat = `all-${m.id}-w${w}-d${d}-link`;
                    if (materials[keyStudentMat] || materials[keyAllMat]) {
                        latestMonth = m.title;
                        latestWeek = w;
                        latestDay = d;
                        progressText = `Kamu saat ini berada di <b>${m.title} - Week ${w} Day ${d}</b>. Mari lanjutkan pelajaranmu!`;
                    }
                });
            });
        });
    } else {
        progressText = `Gunakan menu Admin CMS untuk mengelola materi murid. Total murid saat ini: <b>${students.length}</b>.`;
    }

    mainContent.innerHTML = `
        <div class="max-w-5xl mx-auto fade-in">
            <!-- Banner -->
            <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                <div class="relative z-10">
                    <h2 class="text-3xl md:text-4xl font-bold mb-3">Welcome Back, ${currentUser.name.split(' ')[0]}! 🚀</h2>
                    <p class="text-indigo-100 text-lg max-w-xl">Konsistensi adalah kunci kesuksesan dalam berbahasa Inggris.</p>
                </div>
            </div>

            <!-- Cards Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Progress Card -->
                <div class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div class="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 mb-5">
                        <i class="fas fa-chart-line text-xl"></i>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 mb-3">Progress Belajarmu</h3>
                    <p class="text-slate-600 font-medium mb-4 leading-relaxed">${progressText}</p>
                    
                    ${userRole === 'student' ? `
                    <div class="flex gap-2">
                        <span class="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold">${latestMonth}</span>
                        <span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold">Week ${latestWeek}</span>
                        <span class="px-3 py-1 bg-sky-50 text-sky-700 rounded-lg text-sm font-semibold">Day ${latestDay}</span>
                    </div>
                    ` : ''}
                </div>

                <!-- Tips Card -->
                <div class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div class="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mb-5">
                        <i class="fas fa-lightbulb text-xl"></i>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 mb-3">Tips dari Bro Hamdi</h3>
                    <p class="text-slate-600 font-medium leading-relaxed mb-4">
                        "Jangan takut salah saat mempraktikkan materi. Kesalahan adalah bukti bahwa kamu sedang belajar dan mencoba."
                    </p>
                    <div class="inline-flex items-center px-4 py-2 bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 border border-slate-100">
                        <i class="fas fa-fire text-orange-500 mr-2"></i> Keep the spirit high!
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==== HALAMAN MATERI & RECAP (FULL WIDTH PDF) ====
function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//);
        if (match && match[1]) {
            return `https://drive.google.com/file/d/${match[1]}/preview`;
        }
    }
    return link;
}

function renderMateri(monthId, week, day, monthTitle) {
    autoCloseSidebar();
    
    // Cari data spesifik untuk murid ini dulu, jika tidak ada, cari data "all" (semua murid)
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
            <!-- Header Materi -->
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

            <!-- Tampilan Penuh / Vertikal -->
            <div class="flex flex-col space-y-10">
                <!-- Section Materi Utama -->
                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-slate-800 flex items-center">
                        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-500 mr-3"><i class="fas fa-file-pdf"></i></div> Materi Utama (Presentation Slide)
                    </h3>
                    ${pdfViewerHTML}
                </div>

                <!-- Section Recap PDF -->
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

// ==== HALAMAN RESCHEDULE ====
function renderReschedule() {
    autoCloseSidebar();
    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    let gridHTML = days.map(hari => {
        const isBusy = (hari === 'Kamis' || hari === 'Sabtu');
        if (isBusy) {
            return `
                <div class="p-6 rounded-2xl border border-red-100 bg-gradient-to-b from-white to-red-50/30 text-center opacity-75 relative overflow-hidden group">
                    <div class="absolute top-3 right-3"><i class="fas fa-lock text-red-200"></i></div>
                    <div class="font-bold text-slate-700 text-lg mb-3">${hari}</div>
                    <div class="w-12 h-12 mx-auto bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3">
                        <i class="fas fa-times text-xl"></i>
                    </div>
                    <div class="text-sm font-semibold text-red-600 bg-red-100/50 py-1.5 rounded-lg">Jadwal Penuh</div>
                </div>`;
        } else {
            return `
                <div onclick="alert('Permintaan reschedule untuk hari ${hari} telah dikirim ke Bro Hamdi.')" class="p-6 rounded-2xl border border-green-100 bg-white text-center cursor-pointer hover:shadow-lg hover:border-green-300 hover:-translate-y-1 transition-all relative overflow-hidden group">
                    <div class="font-bold text-slate-800 text-lg mb-3">${hari}</div>
                    <div class="w-12 h-12 mx-auto bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-3 group-hover:bg-green-500 group-hover:text-white transition-colors">
                        <i class="fas fa-check text-xl"></i>
                    </div>
                    <div class="text-sm font-semibold text-green-600 bg-green-50 py-1.5 rounded-lg group-hover:bg-green-100 transition-colors">Tersedia</div>
                </div>`;
        }
    }).join('');

    mainContent.innerHTML = `
        <div class="max-w-4xl mx-auto fade-in">
            <h2 class="text-3xl font-bold text-slate-800 mb-2">Reschedule Jadwal 📅</h2>
            <p class="text-slate-500 font-medium mb-8">Pilih ketersediaan waktu untuk mengganti kelas.</p>
            
            <div class="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl mb-8 flex items-start gap-4">
                <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0 mt-1">
                    <i class="fas fa-info"></i>
                </div>
                <div>
                    <h4 class="font-bold text-slate-800 mb-1">Panduan Reschedule</h4>
                    <p class="text-slate-600 text-sm leading-relaxed">Pilih hari pengganti di minggu yang sama. Kotak bertanda <b class="text-green-600">Centang</b> berarti Bro Hamdi tersedia, sedangkan kotak <b class="text-red-500">Silang</b> berarti jadwal sudah terisi (penuh).</p>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 gap-5">
                ${gridHTML}
            </div>
        </div>
    `;
}

// ==== HALAMAN ADMIN CMS ====
function renderAdminCMS() {
    autoCloseSidebar();
    if (userRole !== 'admin') return;

    const monthOptions = months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const weekOptions = [1,2,3,4].map(w => `<option value="${w}">Week ${w}</option>`).join('');
    const dayOptions = [1,2,3].map(d => `<option value="${d}">Day ${d}</option>`).join('');
    
    // Dropdown murid
    const studentOptions = students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    mainContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-8 fade-in pb-12">
            <div>
                <h2 class="text-3xl font-bold text-slate-800 flex items-center gap-3 mb-2">
                    <div class="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><i class="fas fa-shield-alt"></i></div> Admin Workspace
                </h2>
                <p class="text-slate-500 font-medium ml-14">Kelola konten, data murid, dan personalisasi materi.</p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Panel Kiri: Kelola Bulan & Tambah Murid -->
                <div class="space-y-6 lg:col-span-1">
                    <!-- Panel Tambah Bulan -->
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <div class="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mb-4">
                            <i class="fas fa-folder-plus text-xl"></i>
                        </div>
                        <h3 class="text-lg font-bold text-slate-800 mb-2">Manajemen Bulan</h3>
                        <p class="text-sm text-slate-500 font-medium mb-6 leading-relaxed">Tambahkan bulan baru untuk membuka akses materi lanjutan.</p>
                        <button onclick="addNewMonth()" class="w-full bg-amber-100 text-amber-700 py-3 rounded-xl font-bold hover:bg-amber-200 transition-colors flex justify-center items-center gap-2">
                            <i class="fas fa-plus"></i> Tambah Bulan Baru
                        </button>
                    </div>

                    <!-- Panel Tambah Murid -->
                    <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <div class="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 mb-4">
                            <i class="fas fa-user-plus text-xl"></i>
                        </div>
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

                <!-- Panel Kanan: Input Materi Spesifik Murid -->
                <div class="lg:col-span-2">
                    <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 h-full">
                        <h3 class="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                            <i class="fas fa-edit text-indigo-500"></i> Input Materi & PDF Recap
                        </h3>
                        
                        <!-- Pilihan Murid -->
                        <div class="mb-6 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                            <label class="block text-sm font-bold text-indigo-800 mb-2">Terapkan Materi Ini Untuk:</label>
                            <select id="admin-target-student" class="w-full border border-slate-200 py-3 px-4 rounded-xl bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm">
                                <option value="all">Semua Murid (Materi Default)</option>
                                ${studentOptions}
                            </select>
                            <p class="text-xs text-indigo-500 mt-2 font-medium">Jika memilih murid tertentu, materi ini hanya akan terlihat oleh murid tersebut (Personalized).</p>
                        </div>

                        <!-- Pilihan Waktu -->
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
                        
                        <!-- Input Link PDF -->
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
        </div>
    `;
}

// ==== FUNGSI ADMIN DATABASE ====
window.addNewMonth = async function() {
    const nextNum = months.length + 1;
    const newMonth = { id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] };
    months.push(newMonth);
    
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_months', value: months }]);

    if (error) {
        alert("Gagal menambahkan bulan secara online: " + error.message);
        months.pop();
    } else {
        alert(`Sukses! Month ${nextNum} berhasil ditambahkan secara online.`);
        renderSidebar(); 
        renderAdminCMS();
    }
};

window.addNewStudent = async function() {
    const name = document.getElementById('new-stu-name').value;
    const email = document.getElementById('new-stu-email').value;
    const pass = document.getElementById('new-stu-pass').value;

    if(!name || !email || !pass) {
        alert("Harap lengkapi Nama, Email, dan Password murid.");
        return;
    }

    students.push({ name: name, email: email, password: pass });

    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_students', value: students }]);

    if (error) {
        alert("Gagal menyimpan murid: " + error.message);
        students.pop();
    } else {
        alert(`Akun murid ${name} berhasil dibuat!`);
        renderAdminCMS(); // Re-render agar murid masuk ke dropdown materi
    }
}

window.saveMaterialData = async function() {
    const targetStudent = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value;
    const w = document.getElementById('admin-week').value;
    const d = document.getElementById('admin-day').value;
    const link = document.getElementById('admin-link').value;
    const recap = document.getElementById('admin-recap-pdf').value;
    
    // Format Key dinamis (berdasarkan target murid atau 'all')
    const keyPrefix = `${targetStudent}-${m}-w${w}-d${d}`;
    
    if(link) materials[`${keyPrefix}-link`] = link;
    if(recap) materials[`${keyPrefix}-recap`] = recap;
    
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: materials }]);

    if (error) {
        alert("Gagal menyimpan materi ke server: " + error.message);
    } else {
        const info = targetStudent === 'all' ? "Semua Murid" : targetStudent;
        alert(`Berhasil! Materi & Recap diset untuk: ${info} (Sesi: ${m} W${w} D${d})`);
        document.getElementById('admin-link').value = '';
        document.getElementById('admin-recap-pdf').value = '';
    }
};