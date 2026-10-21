// js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    initLayout('Beranda Utama');
    renderDashboardContent();

    await syncFromCloud();
    renderAppSidebar();
    renderDashboardContent();
});

function renderDashboardContent() {
    const user = window.HES.currentUser;
    const role = window.HES.userRole;

    const badge = document.getElementById('hero-badge');
    const title = document.getElementById('hero-title');
    const sub = document.getElementById('hero-subtitle');
    const act = document.getElementById('hero-action');

    document.getElementById('student-dashboard-view').classList.toggle('hidden', role === 'admin');
    document.getElementById('admin-dashboard-view').classList.toggle('hidden', role !== 'admin');

    if (role === 'admin') {
        badge.innerHTML = `<i class="fas fa-shield-halved"></i> Mode Administrator`;
        title.innerText = `Halo, Bro Hamdi! 👋`;
        sub.innerText = `Pantau jadwal mengajar minggu ini dan kelola materi kelas dengan mudah.`;
        act.innerHTML = `<a href="admin.html" class="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3.5 rounded-2xl text-sm font-extrabold shadow-sm transition"><i class="fas fa-sliders"></i> Buka Panel Admin</a>`;
        renderAdminDashboard();
    } else {
        const firstName = user.name ? user.name.split(' ')[0] : 'Teman';
        const timeline = getStudentCurriculumTimeline(user.email);
        const stats = getStudentGamificationStats(user.email);
        const cur = timeline?.currentPointer;
        const url = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

        badge.innerHTML = `<i class="fas ${stats.levelIcon} text-amber-300"></i> Level ${stats.level} • ${stats.levelTitle}`;
        title.innerText = `Halo, ${firstName}! Siap belajar hari ini? 👋`;
        sub.innerText = cur
            ? `Sesi kamu saat ini: ${cur.monthTitle} • Minggu ${cur.week} • Hari ke-${cur.day} (${cur.shortDate})`
            : `Yuk lanjutkan latihan bahasa Inggrismu hari ini!`;
        act.innerHTML = `
            <a href="${url}" class="inline-flex items-center justify-center gap-2.5 bg-white text-indigo-700 hover:bg-indigo-50 px-6 py-3.5 rounded-2xl text-sm font-extrabold shadow-md transition w-full md:w-auto">
                <i class="fas fa-play text-emerald-500"></i> Mulai Belajar Sekarang
            </a>
        `;
        renderStudentDashboard(user.email, timeline, stats);
    }
}

function renderStudentDashboard(email, timeline, stats) {
    const nextBox = document.getElementById('student-next-session-box');
    const gameBox = document.getElementById('student-gamification-box');
    const profile = window.HES.materials[`profile-${email}`] || {};
    const maxMonth = profile.maxMonth || 1;
    const nextSesh = getStudentNextSessionInfo(email);
    const cur = timeline?.currentPointer;
    const nxt = timeline?.nextPointer;

    // 1. KARTU JADWAL & SESI AKTIF (Ramah & Bersih)
    if (nextSesh.expired) {
        nextBox.innerHTML = `
            <div class="hes-card !bg-red-50 !border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h3 class="text-base font-extrabold text-red-900">Masa Aktif Kelas Telah Berakhir</h3>
                    <p class="text-xs text-red-700 mt-1">Masa aktif kelasmu berakhir pada <strong>${nextSesh.validDateStr}</strong>. Yuk hubungi Admin untuk perpanjangan!</p>
                </div>
                <a href="https://wa.me/6282298363945" target="_blank" class="hes-btn-primary !bg-red-600 shrink-0"><i class="fab fa-whatsapp"></i> Hubungi Admin</a>
            </div>`;
    } else if (nextSesh.error) {
        nextBox.innerHTML = `<div class="hes-card text-center text-slate-500 text-sm font-semibold py-8">${nextSesh.error}</div>`;
    } else {
        // Cek pengingat masa aktif <= 7 hari atau sesi terakhir
        const activeValid = profile.monthEndDates?.[`m${maxMonth}`] || profile.validUntil;
        const daysLeft = activeValid ? Math.ceil((new Date(activeValid).getTime() - new Date().setHours(0,0,0,0)) / 86400000) : 99;
        const isLastSession = (cur?.monthId === `m${maxMonth}` && cur?.week == 4 && cur?.day == 3);

        const reminderHTML = (isLastSession || (daysLeft >= 0 && daysLeft <= 7)) ? `
            <div class="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="text-xs text-amber-900 font-semibold">
                    <strong class="font-extrabold block text-sm mb-0.5">🔔 Pengingat Masa Aktif Kelas</strong>
                    Kelasmu di Month ${maxMonth} hampir selesai (aktif s/d ${nextSesh.validDateStr}). Jangan lupa perpanjang ke Admin ya!
                </div>
                <a href="https://wa.me/6282298363945" target="_blank" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold shrink-0 transition"><i class="fab fa-whatsapp mr-1"></i> Chat Admin</a>
            </div>` : '';

        nextBox.innerHTML = `
            ${reminderHTML}
            <div class="hes-card">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                        <h3 class="text-base font-extrabold text-slate-800">Jadwal & Materi Kelasmu</h3>
                        <p class="text-xs text-slate-500">Jadwal rutin: <strong>${(profile.days || []).join(', ')} (${nextSesh.time} WIB)</strong></p>
                    </div>
                    <a href="reschedule.html" class="hes-btn-soft"><i class="fas fa-calendar-alt"></i> Pindah Jadwal</a>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${cur ? `
                    <div class="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between">
                        <div>
                            <span class="inline-block px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-extrabold mb-2">
                                ${cur.isTodayClass ? '📍 Kelas Hari Ini' : '📍 Materi Saat Ini'}
                            </span>
                            <h4 class="text-base font-extrabold text-slate-800">${cur.monthTitle} • Minggu ${cur.week} (Hari${cur.day})</h4>
                            <p class="text-xs font-semibold text-slate-600 mt-1"><i class="far fa-calendar mr-1 text-emerald-600"></i> ${cur.displayDate}</p>
                        </div>
                        <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="mt-4 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold text-center transition">
                            Buka Materi & Kosakata <i class="fas fa-arrow-right ml-1"></i>
                        </a>
                    </div>` : ''}

                    ${nxt ? `
                    <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                        <div>
                            <span class="inline-block px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-extrabold mb-2">
                                ⏭️ Pertemuan Berikutnya
                            </span>
                            <h4 class="text-base font-extrabold text-slate-800">${nxt.monthTitle} • Minggu ${nxt.week} (Hari${nxt.day})</h4>
                            <p class="text-xs font-semibold text-slate-600 mt-1"><i class="far fa-calendar mr-1 text-amber-500"></i> ${nxt.displayDate}</p>
                        </div>
                        <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="mt-4 w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold text-center transition">
                            Intip Materi Besok
                        </a>
                    </div>` : ''}
                </div>
            </div>
        `;
    }

    // 2. KARTU PROGRESS & PENCAPAIAN (Simpel & Memotivasi)
    if (gameBox && stats) {
        gameBox.innerHTML = `
            <div class="hes-card">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                        <h3 class="text-base font-extrabold text-slate-800">Perkembangan Belajarmu 🌟</h3>
                        <p class="text-xs text-slate-500">Kumpulkan XP dengan menghafal kosakata dan menyelesaikan sesi kelas!</p>
                    </div>
                    <span class="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-extrabold self-start sm:self-auto">
                        Level ${stats.level}/10 • ${stats.xp} XP
                    </span>
                </div>

                <!-- Progress Bar Bulan Aktif -->
                <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 mb-4">
                    <div class="flex justify-between text-xs font-extrabold text-slate-700 mb-2">
                        <span>Perjalanan ${stats.activeMonthTitle}</span>
                        <span class="text-indigo-600">${stats.activeMonthCompleted} dari 12 Pertemuan (${stats.activeMonthPercent}%)</span>
                    </div>
                    <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500" style="width: ${stats.activeMonthPercent}%"></div>
                    </div>
                </div>

                <!-- 3 Kotak Statistik Simpel -->
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                        <p class="text-lg sm:text-xl font-extrabold text-emerald-700">${stats.totalCompletedSessions}</p>
                        <p class="text-xs font-bold text-slate-500 mt-0.5">Kelas Selesai</p>
                    </div>
                    <div class="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                        <p class="text-lg sm:text-xl font-extrabold text-indigo-700">${stats.masteredWordsCount}</p>
                        <p class="text-xs font-bold text-slate-500 mt-0.5">Kata Dikuasai</p>
                    </div>
                    <div class="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100">
                        <p class="text-lg sm:text-xl font-extrabold text-amber-700">${stats.avgExamScore || '-'}</p>
                        <p class="text-xs font-bold text-slate-500 mt-0.5">Nilai Ujian</p>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderAdminDashboard() {
    let pendingCount = 0;
    window.HES.students.forEach(s => {
        const p = window.HES.materials[`profile-${s.email}`];
        if (p?.pendingReschedules) pendingCount += Object.keys(p.pendingReschedules).length;
    });

    document.getElementById('stat-total-students').innerText = window.HES.students.length;
    document.getElementById('stat-total-months').innerText = window.HES.months.length;
    document.getElementById('stat-pending-reschedules').innerText = pendingCount;

    const alertBox = document.getElementById('admin-reschedule-alert');
    if (pendingCount > 0) {
        alertBox.classList.remove('hidden');
        alertBox.innerHTML = `
            <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
                <p class="text-xs sm:text-sm font-bold text-amber-900"><i class="fas fa-bell text-amber-500 mr-2"></i> Ada <strong>${pendingCount} pengajuan pindah jadwal</strong> yang menunggu konfirmasi Anda.</p>
                <a href="admin.html?tab=overview" class="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold shrink-0">Cek Sekarang</a>
            </div>`;
    } else {
        alertBox.classList.add('hidden');
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let html = '';
    for (let i = 0; i < 7; i++) {
        const curr = new Date(today); curr.setDate(today.getDate() + i);
        const currStr = formatDateForID(curr);
        const items = [];

        window.HES.students.forEach(s => {
            const p = window.HES.materials[`profile-${s.email}`];
            if (isOccupied(s.email, currStr)) {
                items.push(`<div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold"><span class="text-slate-800 truncate">${s.name}</span><span class="text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-200">${p.time}</span></div>`);
            }
        });

        html += `
            <div class="hes-card !p-4">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                    <h4 class="font-extrabold text-xs sm:text-sm text-slate-800">${getDisplayDate(curr)}</h4>
                    ${i === 0 ? '<span class="text-[10px] font-extrabold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">Hari Ini</span>' : ''}
                </div>
                <div class="space-y-2">${items.length ? items.join('') : '<p class="text-xs text-slate-400 italic py-3 text-center">Kosong</p>'}</div>
            </div>`;
    }
    document.getElementById('admin-schedule-grid').innerHTML = html;
}