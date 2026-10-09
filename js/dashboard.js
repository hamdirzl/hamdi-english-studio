// js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth();
    if (!session) return;

    initLayout('Dashboard Utama');
    renderDashboardContent();

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
            <a href="admin.html" class="inline-flex items-center justify-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3 rounded-2xl text-xs font-extrabold shadow-sm transition w-full sm:w-auto">
                <i class="fas fa-sliders"></i> Buka Panel CMS
            </a>
        `;

        renderAdminDashboard();
    } else {
        adminView.classList.add('hidden');
        studentView.classList.remove('hidden');

        const firstName = user.name ? user.name.split(' ')[0] : 'Member';
        const timeline = getStudentCurriculumTimeline(user.email);
        const stats = getStudentGamificationStats(user.email);
        const cur = timeline && timeline.currentPointer ? timeline.currentPointer : null;
        const targetUrl = cur
            ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}`
            : `materi.html?month=m1&week=1&day=1`;

        heroBadge.innerHTML = `<i class="fas ${stats.levelIcon} mr-1 text-amber-300"></i> Level ${stats.level}/${stats.maxLevel} • ${stats.levelTitle}`;
        heroTitle.innerText = `Welcome back, ${firstName}!`;
        heroSubtitle.innerText = cur
            ? `Posisi belajarmu: ${cur.monthTitle} • Week ${cur.week} • Day ${cur.day} (${cur.shortDate}).`
            : `Lanjutkan perjalanan belajar bahasa Inggrismu hari ini.`;
        heroAction.innerHTML = `
            <a href="${targetUrl}" class="inline-flex items-center justify-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3 rounded-2xl text-xs font-extrabold shadow-sm transition w-full sm:w-auto">
                <i class="fas fa-location-dot text-emerald-600"></i> Buka Pertemuan Saat Ini
            </a>
        `;

        renderStudentDashboard(user.email);
    }
}

function renderStudentDashboard(email) {
    const gamificationBox = document.getElementById('student-gamification-box');
    const nextBox = document.getElementById('student-next-session-box');
    const maxMonthBadge = document.getElementById('student-max-month-badge');

    const profile = window.HES.materials[`profile-${email}`] || {};
    const maxMonth = profile.maxMonth || 1;
    if (maxMonthBadge) maxMonthBadge.innerText = `Month ${maxMonth}`;

    const nextSesh = getStudentNextSessionInfo(email);
    const timeline = getStudentCurriculumTimeline(email);
    const stats = getStudentGamificationStats(email);

    // ====================================================
    // RENDER FITUR #4: PROGRESS TRACKER & GAMIFIKASI MURID
    // ====================================================
    if (gamificationBox && stats) {
        let sessionDotsHTML = '';
        for (let i = 1; i <= 12; i++) {
            const isDone = i <= stats.activeMonthCompleted;
            const isCurrent = i === stats.activeMonthCompleted + 1;
            let dotClass = 'bg-slate-200';
            if (isDone) dotClass = 'bg-emerald-500';
            else if (isCurrent) dotClass = 'bg-amber-400 animate-pulse';

            sessionDotsHTML += `<div class="h-1.5 flex-1 rounded-full ${dotClass}" title="Sesi ${i}"></div>`;
        }

        gamificationBox.innerHTML = `
            <div class="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 shadow-sm">
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
                    
                    <!-- Kolom Kiri (5 Kolom): Kartu Level & XP (10 Level) -->
                    <div class="lg:col-span-5 bg-gradient-to-br ${stats.levelGradient} p-4 sm:p-5 rounded-2xl text-white shadow-md relative overflow-hidden">
                        <div class="absolute right-0 bottom-0 -mb-6 -mr-6 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
                        <div class="flex items-center justify-between gap-3 mb-3 relative z-10">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-xs border border-white/25 flex items-center justify-center text-lg shrink-0">
                                    <i class="fas ${stats.levelIcon} text-amber-200"></i>
                                </div>
                                <div class="min-w-0">
                                    <span class="text-[10px] font-extrabold uppercase tracking-wider text-white/80 block">English Mastery • Lv. ${stats.level}/${stats.maxLevel}</span>
                                    <h4 class="text-sm sm:text-base font-extrabold leading-tight truncate">${stats.levelTitle}</h4>
                                </div>
                            </div>
                            <div class="text-right shrink-0">
                                <span class="text-base sm:text-lg font-extrabold">${stats.xp}</span>
                                <span class="text-[10px] font-bold uppercase block text-white/80">Total XP</span>
                            </div>
                        </div>

                        <!-- Bar XP Menuju Level Berikutnya -->
                        <div class="relative z-10">
                            <div class="flex justify-between text-[10px] font-bold text-white/90 mb-1">
                                <span>${stats.isMaxLevel ? 'Level Maksimal Tercapai!' : `Menuju Level ${stats.level + 1}`}</span>
                                <span>${stats.isMaxLevel ? 'MAX' : `${stats.xp} /${stats.nextXP} XP`}</span>
                            </div>
                            <div class="w-full h-2 bg-black/20 rounded-full overflow-hidden p-0.5">
                                <div class="h-full bg-white rounded-full transition-all duration-500" style="width: ${stats.xpProgressPercent}%"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Kolom Kanan (7 Kolom): Progress Bulan Aktif & 3 Mini Stat Cards -->
                    <div class="lg:col-span-7 space-y-4">
                        
                        <!-- Progress Bar Kurikulum Bulan Berjalan -->
                        <div class="bg-slate-50/80 p-3.5 sm:p-4 rounded-xl border border-slate-200/70">
                            <div class="flex items-center justify-between mb-1.5">
                                <div class="flex items-center gap-2">
                                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span class="text-xs font-extrabold text-slate-800">Progress ${stats.activeMonthTitle}</span>
                                </div>
                                <span class="text-xs font-extrabold text-emerald-600">${stats.activeMonthPercent}% <span class="text-slate-400 font-semibold text-[11px]">(${stats.activeMonthCompleted}/12 Sesi)</span></span>
                            </div>
                            <div class="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden mb-2">
                                <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500" style="width: ${stats.activeMonthPercent}%"></div>
                            </div>
                            <div class="flex items-center gap-1">
                                ${sessionDotsHTML}
                            </div>
                        </div>

                        <!-- 3 Statistik Pencapaian (Grid 3 Kolom Rapi di HP) -->
                        <div class="grid grid-cols-3 gap-2 sm:gap-3">
                            <div class="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70 text-center">
                                <div class="text-emerald-600 text-xs sm:text-sm mb-0.5"><i class="fas fa-calendar-check"></i></div>
                                <p class="text-sm sm:text-lg font-extrabold text-slate-800 leading-none">${stats.totalCompletedSessions}</p>
                                <p class="text-[10px] font-bold text-slate-500 mt-1 truncate">Sesi Selesai</p>
                            </div>

                            <div class="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/70 text-center">
                                <div class="text-indigo-600 text-xs sm:text-sm mb-0.5"><i class="fas fa-spell-check"></i></div>
                                <p class="text-sm sm:text-lg font-extrabold text-slate-800 leading-none">${stats.masteredWordsCount}</p>
                                <p class="text-[10px] font-bold text-slate-500 mt-1 truncate">Kata Dikuasai</p>
                            </div>

                            <div class="p-3 rounded-xl bg-amber-50/60 border border-amber-200/70 text-center">
                                <div class="text-amber-500 text-xs sm:text-sm mb-0.5"><i class="fas fa-award"></i></div>
                                <p class="text-sm sm:text-lg font-extrabold text-slate-800 leading-none">${stats.avgExamScore > 0 ? stats.avgExamScore : '-'}</p>
                                <p class="text-[10px] font-bold text-slate-500 mt-1 truncate">Rata-Rata Ujian</p>
                            </div>
                        </div>

                    </div>

                </div>
            </div>
        `;
    }

    // ====================================================
    // RENDER JADWAL KELAS TERDEKAT & PELACAK SESI
    // ====================================================
    if (nextSesh.expired) {
        nextBox.innerHTML = `
            <div class="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3.5">
                <div class="w-10 h-10 rounded-xl bg-white text-red-500 flex items-center justify-center text-base shadow-2xs shrink-0">
                    <i class="fas fa-calendar-xmark"></i>
                </div>
                <div>
                    <p class="text-red-800 font-extrabold text-xs sm:text-sm">Masa Aktif Keanggotaan Berakhir</p>
                    <p class="text-red-600 text-xs mt-0.5">Masa aktif Anda telah habis pada <strong>${nextSesh.validDateStr}</strong>. Silakan hubungi Admin untuk perpanjangan kelas.</p>
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
        const cur = timeline ? timeline.currentPointer : null;
        const nxt = timeline ? timeline.nextPointer : null;

        // --- TAMBAHAN LOGIKA PERINGATAN PERTEMUAN TERAKHIR ATAU MASA AKTIF HAMPIR HABIS ---
        let warningHTML = '';
        
        // 1. Cek apakah ini secara urutan adalah pertemuan terakhir (W4 D3) - baik hari ini maupun sesi berikutnya
        const isCurLast = cur && cur.monthId === `m${maxMonth}` && parseInt(cur.week) === 4 && parseInt(cur.day) === 3;
        const isNxtLast = nxt && nxt.monthId === `m${maxMonth}` && parseInt(nxt.week) === 4 && parseInt(nxt.day) === 3;
        
        // 2. Cek apakah tanggal kedaluwarsa (validUntil) tinggal 7 hari lagi atau kurang
        const maxM = String(profile.maxMonth || '1');
        const activeValidUntil = (profile.monthEndDates && profile.monthEndDates[`m${maxM}`]) 
            ? profile.monthEndDates[`m${maxM}`] 
            : profile.validUntil;

        let isDateAlmostExpired = false;
        let daysLeft = 999;
        
        if (activeValidUntil && activeValidUntil !== 'Belum diatur') {
            const validDate = new Date(activeValidUntil);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset jam agar hitungan harinya akurat
            
            // Hitung selisih hari dari sekarang ke tanggal kedaluwarsa
            const diffTime = validDate.getTime() - today.getTime();
            daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (daysLeft >= 0 && daysLeft <= 7) {
                isDateAlmostExpired = true;
            }
        }

        // Jika salah satu kondisi terpenuhi (W4D3 ATAU sisa waktu <= 7 hari)
        if (isCurLast || isNxtLast || isDateAlmostExpired) {
            let reasonText = (isCurLast || isNxtLast) 
                ? `Anda sudah berada di <strong>penghujung pertemuan</strong> pada modul Month ${maxMonth}.` 
                : `Masa aktif Anda akan berakhir dalam <strong>${daysLeft} hari lagi</strong> (${nextSesh.validDateStr}).`;

            warningHTML = `
                <div class="mb-4 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3.5 fade-in">
                    <div class="w-10 h-10 rounded-xl bg-white text-amber-500 flex items-center justify-center text-lg shadow-2xs shrink-0">
                        <i class="fas fa-bell animate-pulse"></i>
                    </div>
                    <div>
                        <p class="text-amber-900 font-extrabold text-xs sm:text-sm">Peringatan Masa Aktif!</p>
                        <p class="text-amber-700 text-xs mt-0.5 mb-2.5">${reasonText} Silakan hubungi Admin untuk memperpanjang kelas Anda.</p>
                        <a href="https://wa.me/6282298363945" target="_blank" class="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition shadow-xs">
                            <i class="fab fa-whatsapp"></i> Hubungi Admin
                        </a>
                    </div>
                </div>
            `;
        }
        // ----------------------------------------------------

        nextBox.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <!-- Kartu 1: Pertemuan Saat Ini (Hijau Emerald) -->
                ${cur ? `
                <div class="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <span class="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-white bg-emerald-600 px-2 py-0.5 rounded-md">
                                <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                                ${cur.isTodayClass ? 'Hari Ini' : 'Di Sini'}
                            </span>
                            <span class="text-[11px] font-extrabold text-emerald-800">${cur.monthTitle} • W${cur.week} D${cur.day}</span>
                        </div>
                        <p class="font-extrabold text-sm text-slate-800">${cur.displayDate}</p>
                        <p class="text-[11px] font-semibold text-slate-500 mt-0.5">
                            <i class="far fa-clock text-emerald-600 mr-1"></i> ${nextSesh.time} WIB
                        </p>
                    </div>
                    <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="mt-3 inline-flex items-center justify-center gap-1.5 w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-xl text-xs font-bold transition">
                        <i class="fas fa-book-open text-[11px]"></i> Buka Materi Ini
                    </a>
                </div>
                ` : ''}

                <!-- Kartu 2: Pertemuan Berikutnya (Kuning Amber) -->
                ${nxt ? `
                <div class="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <span class="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-white bg-amber-500 px-2 py-0.5 rounded-md">
                                <i class="fas fa-forward text-[8px]"></i> Berikutnya
                            </span>
                            <span class="text-[11px] font-extrabold text-amber-800">${nxt.monthTitle} • W${nxt.week} D${nxt.day}</span>
                        </div>
                        <p class="font-extrabold text-sm text-slate-800">${nxt.displayDate}</p>
                        <p class="text-[11px] font-semibold text-slate-500 mt-0.5">
                            <i class="far fa-clock text-amber-500 mr-1"></i> ${nextSesh.time} WIB
                        </p>
                    </div>
                    <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="mt-3 inline-flex items-center justify-center gap-1.5 w-full bg-amber-500 hover:bg-amber-600 text-white py-2 px-3 rounded-xl text-xs font-bold transition">
                        <i class="fas fa-eye text-[11px]"></i> Intip Materi Esok
                    </a>
                </div>
                ` : ''}
            </div>

            <div class="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-500">
                <span><i class="fas fa-repeat text-slate-400 mr-1"></i> Rutin: <strong class="text-slate-700">${defaultDays}</strong></span>
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
            <div class="bg-amber-50 border border-amber-200 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-2xs">
                <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 shrink-0 bg-white rounded-xl flex items-center justify-center shadow-2xs text-amber-500 text-base border border-amber-100">
                        <i class="fas fa-bell"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-amber-900 text-xs sm:text-sm">Tinjauan Jadwal Diperlukan</h4>
                        <p class="text-amber-700 text-xs font-medium mt-0.5">Ada <strong>${pendingRescheduleCount} pengajuan pindah jadwal</strong> yang menunggu persetujuan.</p>
                    </div>
                </div>
                <a href="admin.html?tab=overview" class="w-full sm:w-auto text-center bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold transition shadow-xs text-xs shrink-0">
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
                let statusLabel = isPendingMoveAway ? 'Keluar' : (isPendingMoveHere ? 'Masuk' : '');
                let badgeClass = isPendingMoveAway
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : (isPendingMoveHere ? 'bg-blue-100 text-blue-700 border-blue-200' : '');

                bookings.push(`
                    <div class="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                        <div class="px-2 py-1 rounded-lg bg-white font-bold text-[10px] shadow-2xs border border-slate-200 text-indigo-600 shrink-0">
                            ${p.time}
                        </div>
                        <div class="flex-1 text-xs font-bold text-slate-800 truncate">${s.name}</div>
                        ${statusLabel ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeClass} shrink-0">${statusLabel}</span>` : ''}
                    </div>
                `);
            }
        });

        adminGridHTML += `
            <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm hover-card flex flex-col justify-between">
                <div>
                    <h4 class="font-extrabold text-slate-800 text-xs sm:text-sm border-b border-slate-100 pb-2.5 mb-3 flex items-center justify-between gap-2">
                        <span class="truncate">${displayDay}</span>
                        ${i === 0 ? '<span class="shrink-0 text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 uppercase font-extrabold">Hari Ini</span>' : ''}
                    </h4>
                    <div class="space-y-2">
                        ${bookings.length === 0
                            ? `<div class="py-5 text-center"><p class="text-xs text-slate-400 italic">Tidak ada jadwal kelas</p></div>`
                            : bookings.join('')}
                    </div>
                </div>
            </div>
        `;
    }

    gridContainer.innerHTML = adminGridHTML;
}