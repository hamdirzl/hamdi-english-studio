// js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth();
    if (!session) return;

    initLayout('Dashboard Utama');
    renderDashboardContent();

    // Sinkronisasi data terbaru dari Supabase lalu perbarui tampilan
    await syncFromCloud();
    renderAppSidebar();
    renderDashboardContent();
});

function renderDashboardContent() {
    const user = window.HES.currentUser;
    const role = window.HES.userRole;

    const heroBadge = document.getElementById('hero-badge');
    const heroTitle = document.getElementById('hero-title');
    const heroSubtitle = document.getElementById('hero-subtitle');
    const heroAction = document.getElementById('hero-action');

    const studentView = document.getElementById('student-dashboard-view');
    const adminView = document.getElementById('admin-dashboard-view');

    if (role === 'admin') {
        studentView.classList.add('hidden');
        adminView.classList.remove('hidden');

        heroBadge.innerHTML = `<i class="fas fa-shield-halved mr-1"></i> Administrator Workspace`;
        heroTitle.innerText = `Selamat datang kembali, Bro Hamdi.`;
        heroSubtitle.innerText = `Pantau jadwal mengajar 7 hari ke depan dan kelola kurikulum portal.`;
        heroAction.innerHTML = `
            <a href="admin.html" class="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3 rounded-2xl text-xs font-extrabold shadow-sm transition">
                <i class="fas fa-sliders"></i> Buka Panel CMS
            </a>
        `;

        renderAdminDashboard();
    } else {
        adminView.classList.add('hidden');
        studentView.classList.remove('hidden');

        const firstName = user.name ? user.name.split(' ')[0] : 'Member';
        heroBadge.innerHTML = `<i class="fas fa-crown mr-1 text-amber-300"></i> Exclusive Member`;
        heroTitle.innerText = `Welcome back, ${firstName}!`;
        heroSubtitle.innerText = `Lanjutkan perjalanan belajar bahasa Inggrismu hari ini.`;
        heroAction.innerHTML = `
            <a href="materi.html?month=m1&week=1&day=1" class="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3 rounded-2xl text-xs font-extrabold shadow-sm transition">
                <i class="fas fa-play text-[10px]"></i> Mulai Belajar
            </a>
        `;

        renderStudentDashboard(user.email);
    }
}

function renderStudentDashboard(email) {
    const nextBox = document.getElementById('student-next-session-box');
    const maxMonthBadge = document.getElementById('student-max-month-badge');

    const profile = window.HES.materials[`profile-${email}`] || {};
    const maxMonth = profile.maxMonth || 1;
    if (maxMonthBadge) maxMonthBadge.innerText = `Month ${maxMonth}`;

    const nextSesh = getStudentNextSessionInfo(email);

    if (nextSesh.expired) {
        nextBox.innerHTML = `
            <div class="bg-red-50 border border-red-200 p-5 rounded-2xl flex items-start gap-4">
                <div class="w-11 h-11 rounded-xl bg-white text-red-500 flex items-center justify-center text-lg shadow-2xs shrink-0">
                    <i class="fas fa-calendar-xmark"></i>
                </div>
                <div>
                    <p class="text-red-800 font-extrabold text-sm">Masa Aktif Keanggotaan Berakhir</p>
                    <p class="text-red-600 text-xs mt-1">Masa aktif Anda telah habis pada <strong>${nextSesh.validDateStr}</strong>. Silakan hubungi Admin untuk perpanjangan kelas.</p>
                </div>
            </div>
        `;
    } else if (nextSesh.error) {
        nextBox.innerHTML = `
            <div class="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200 text-center">
                <i class="fas fa-calendar-day text-slate-300 text-2xl mb-2"></i>
                <p class="text-xs sm:text-sm font-semibold text-slate-500">${nextSesh.error}</p>
            </div>
        `;
    } else {
        const defaultDays = (profile.days && profile.days.length > 0) ? profile.days.join(', ') : '-';
        nextBox.innerHTML = `
            <div class="bg-gradient-to-br from-slate-50 to-indigo-50/40 p-5 rounded-2xl border border-indigo-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 bg-indigo-600 rounded-2xl shadow-md shadow-indigo-200 flex items-center justify-center text-white text-2xl shrink-0">
                        <i class="far fa-calendar-check"></i>
                    </div>
                    <div>
                        <span class="inline-block text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded mb-1">Sesi Berikutnya</span>
                        <p class="font-extrabold text-base sm:text-lg text-slate-800 leading-tight">${nextSesh.displayDate}</p>
                        <p class="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
                            <i class="far fa-clock text-indigo-500 mr-1"></i> Pukul ${nextSesh.time} WIB
                        </p>
                    </div>
                </div>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span><i class="fas fa-repeat text-slate-400 mr-1"></i> Hari Rutin: <strong class="text-slate-700">${defaultDays}</strong></span>
                <span><i class="fas fa-hourglass-half text-slate-400 mr-1"></i> Aktif s/d: <strong class="text-emerald-600">${nextSesh.validDateStr}</strong></span>
            </div>
        `;
    }
}

function renderAdminDashboard() {
    const statStudents = document.getElementById('stat-total-students');
    const statMonths = document.getElementById('stat-total-months');
    const statPending = document.getElementById('stat-pending-reschedules');
    const alertContainer = document.getElementById('admin-reschedule-alert');
    const gridContainer = document.getElementById('admin-schedule-grid');

    let pendingRescheduleCount = 0;
    window.HES.students.forEach(s => {
        let p = window.HES.materials[`profile-${s.email}`];
        if (p && p.pendingReschedules) {
            pendingRescheduleCount += Object.keys(p.pendingReschedules).length;
        }
    });

    if (statStudents) statStudents.innerText = window.HES.students.length;
    if (statMonths) statMonths.innerText = window.HES.months.length;
    if (statPending) statPending.innerText = pendingRescheduleCount;

    if (pendingRescheduleCount > 0) {
        alertContainer.classList.remove('hidden');
        alertContainer.innerHTML = `
            <div class="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div class="flex items-center gap-4">
                    <div class="w-11 h-11 shrink-0 bg-white rounded-xl flex items-center justify-center shadow-2xs text-amber-500 text-lg border border-amber-100">
                        <i class="fas fa-bell"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-amber-900 text-sm sm:text-base">Tinjauan Jadwal Diperlukan</h4>
                        <p class="text-amber-700 text-xs font-medium mt-0.5">Terdapat <strong>${pendingRescheduleCount} pengajuan pindah jadwal</strong> dari murid yang menunggu persetujuan Anda.</p>
                    </div>
                </div>
                <a href="admin.html?tab=overview" class="w-full sm:w-auto text-center bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-xs text-xs shrink-0">
                    Review Sekarang
                </a>
            </div>
        `;
    } else {
        alertContainer.classList.add('hidden');
    }

    let adminGridHTML = '';
    let todayAdmin = new Date();
    todayAdmin.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
        let curr = new Date(todayAdmin);
        curr.setDate(todayAdmin.getDate() + i);
        let currStr = formatDateForID(curr);
        let displayDay = getDisplayDate(curr);
        let bookings = [];

        window.HES.students.forEach(s => {
            let p = window.HES.materials[`profile-${s.email}`];
            if (isOccupied(s.email, currStr)) {
                let isPendingMoveAway = p.pendingReschedules && p.pendingReschedules[currStr] !== undefined;
                let isPendingMoveHere = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
                let statusLabel = isPendingMoveAway ? 'Pengajuan Keluar' : (isPendingMoveHere ? 'Validasi Masuk' : '');
                let badgeClass = isPendingMoveAway
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : (isPendingMoveHere ? 'bg-blue-100 text-blue-700 border-blue-200' : '');

                bookings.push(`
                    <div class="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div class="px-2.5 py-1 rounded-lg bg-white font-bold text-[11px] shadow-2xs border border-slate-200 text-indigo-600 shrink-0">
                            ${p.time}
                        </div>
                        <div class="flex-1 text-xs font-bold text-slate-800 truncate">${s.name}</div>
                        ${statusLabel ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded border ${badgeClass} shrink-0">${statusLabel}</span>` : ''}
                    </div>
                `);
            }
        });

        adminGridHTML += `
            <div class="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover-card flex flex-col justify-between">
                <div>
                    <h4 class="font-extrabold text-slate-800 text-xs sm:text-sm border-b border-slate-100 pb-3 mb-3.5 flex items-center justify-between">
                        <span>${displayDay}</span>
                        ${i === 0 ? '<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md border border-indigo-100 uppercase font-extrabold tracking-wider">Hari Ini</span>' : ''}
                    </h4>
                    <div class="space-y-2">
                        ${bookings.length === 0
                            ? `<div class="py-6 text-center"><p class="text-xs text-slate-400 italic">Tidak ada jadwal kelas</p></div>`
                            : bookings.join('')}
                    </div>
                </div>
            </div>
        `;
    }

    gridContainer.innerHTML = adminGridHTML;
}