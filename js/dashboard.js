// js/dashboard.js

let dashboardMapMonth = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    initLayout('Beranda Belajar');
    renderDashboardContent();

    await syncFromCloud();
    renderAppSidebar();
    renderDashboardContent();
});

window.switchDashboardMapMonth = function(mId) {
    dashboardMapMonth = mId;
    renderDashboardContent();
};

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
        badge.innerHTML = `✨ Administrator Workspace`;
        title.innerText = `Halo, Bro Hamdi! 👋`;
        sub.innerText = `Pantau jadwal mengajar minggu ini dan kelola materi kelas.`;
        act.innerHTML = `<a href="admin.html" class="bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3.5 rounded-2xl text-sm font-black shadow-md inline-flex items-center gap-2"><i class="fas fa-sliders"></i> Panel Admin</a>`;
        renderAdminDashboard();
    } else {
        const firstName = user.name ? user.name.split(' ')[0] : 'Teman';
        const timeline = getStudentCurriculumTimeline(user.email);
        const stats = getStudentGamificationStats(user.email);
        const cur = timeline?.currentPointer;
        if (!dashboardMapMonth) dashboardMapMonth = cur?.monthId || 'm1';

        const url = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

        badge.innerHTML = `🌟 Level ${stats.level} • ${stats.levelTitle} (${stats.xp} XP)`;
        title.innerText = `Semangat Belajar, ${firstName}! 🚀`;
        sub.innerText = cur
            ? `Materi aktif kamu: ${cur.monthTitle} • Minggu ${cur.week} • Hari ke-${cur.day} (${cur.shortDate})`
            : `Yuk lanjutkan perjalanan bahasa Inggrismu hari ini!`;
        act.innerHTML = `
            <a href="${url}" class="bg-amber-400 hover:bg-amber-300 text-slate-900 border-b-4 border-amber-600 px-6 py-3.5 rounded-2xl text-sm font-black shadow-md inline-flex items-center justify-center gap-2 transition w-full md:w-auto">
                <i class="fas fa-play"></i> Lanjut Belajar Sekarang
            </a>
        `;
        renderStudentDashboard(user.email, timeline, stats);
    }
}

function renderStudentDashboard(email, timeline, stats) {
    const nextBox = document.getElementById('student-next-session-box');
    const mapBox = document.getElementById('student-journey-map-box');
    const gameBox = document.getElementById('student-gamification-box');
    const profile = window.HES.materials[`profile-${email}`] || {};
    const maxMonth = parseInt(profile.maxMonth || 1);
    const nextSesh = getStudentNextSessionInfo(email);
    const cur = timeline?.currentPointer;
    const nxt = timeline?.nextPointer;

    // 1. KARTU JADWAL KELAS TERDEKAT
    if (nextSesh.expired) {
        nextBox.innerHTML = `
            <div class="hes-card !bg-red-50 !border-red-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h3 class="text-base font-black text-red-900">Masa Aktif Kelas Berakhir (${nextSesh.validDateStr})</h3>
                    <p class="text-xs font-bold text-red-700 mt-1">Yuk perpanjang paket belajarmu agar bisa lanjut ke modul berikutnya!</p>
                </div>
                <a href="https://wa.me/6282298363945" target="_blank" class="hes-btn-primary !bg-red-600 shrink-0"><i class="fab fa-whatsapp"></i> Chat Admin</a>
            </div>`;
    } else if (nextSesh.error) {
        nextBox.innerHTML = `<div class="hes-card text-center text-slate-500 text-sm font-bold py-6">${nextSesh.error}</div>`;
    } else {
        nextBox.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${cur ? `
                <div class="hes-card !bg-emerald-50/80 !border-emerald-200 flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-black">
                                ${cur.isTodayClass ? '🌟 Kelas Hari Ini' : '📍 Sesi Belajar Saat Ini'}
                            </span>
                            <span class="text-xs font-extrabold text-emerald-800">${nextSesh.time} WIB</span>
                        </div>
                        <h3 class="text-lg font-black text-slate-800 mt-1">${cur.monthTitle} • Minggu ${cur.week}, Hari ${cur.day}</h3>
                        <p class="text-xs font-bold text-slate-600 mt-0.5"><i class="far fa-calendar-check text-emerald-600 mr-1"></i> ${cur.displayDate}</p>
                    </div>
                    <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="hes-btn-primary !bg-emerald-600 !border-emerald-800 w-full mt-4">
                        Buka Materi Ini <i class="fas fa-arrow-right"></i>
                    </a>
                </div>` : ''}

                ${nxt ? `
                <div class="hes-card flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="px-3 py-1 rounded-xl bg-amber-100 text-amber-800 text-xs font-black">⏭️ Pertemuan Berikutnya</span>
                            <a href="reschedule.html" class="text-xs font-extrabold text-indigo-600 hover:underline"><i class="fas fa-calendar-alt mr-1"></i>Pindah Jadwal</a>
                        </div>
                        <h3 class="text-lg font-black text-slate-800 mt-1">${nxt.monthTitle} • Minggu ${nxt.week}, Hari ${nxt.day}</h3>
                        <p class="text-xs font-bold text-slate-500 mt-0.5"><i class="far fa-calendar text-amber-500 mr-1"></i> ${nxt.displayDate}</p>
                    </div>
                    <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="hes-btn-soft w-full mt-4">
                        Pelajari Lebih Awal <i class="fas fa-eye"></i>
                    </a>
                </div>` : ''}
            </div>
        `;
    }

    // 2. PETA PERJALANAN BELAJAR 12 PERTEMUAN (Bebas Klik & Ulang Materi Lama!)
    const monthTabs = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = mNum > maxMonth;
        const active = m.id === dashboardMapMonth;
        if (locked) return `<button onclick="showToast('${m.title} masih terkunci 🔒','info')" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-400">🔒 ${m.title}</button>`;
        return `<button onclick="switchDashboardMapMonth('${m.id}')" class="px-4 py-2 rounded-xl text-xs font-black transition ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}">${m.title}</button>`;
    }).join('');

    let cardsHTML = '';
    let sIdx = 1;
    [1, 2, 3, 4].forEach(w => {
        [1, 2, 3].forEach(d => {
            const dInfo = timeline?.days[`${dashboardMapMonth}-w${w}-d${d}`];
            const st = dInfo?.status || 'upcoming';
            const vocabDone = window.HES.materials[`vocab_status-${email}-${dashboardMapMonth}-w${w}-d${d}`]?.status;

            let cardStyle = 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300';
            let statusBadge = `<span class="text-[10px] font-extrabold text-slate-400">Sesi ${sIdx}</span>`;
            let actionLabel = 'Buka Materi';

            if (st === 'completed') {
                cardStyle = 'bg-emerald-50/60 border-emerald-200 text-slate-800 hover:border-emerald-400';
                statusBadge = `<span class="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">✅ Selesai</span>`;
                actionLabel = '🔄 Ulangi Materi';
            } else if (st === 'current') {
                cardStyle = 'bg-amber-50 border-amber-300 text-slate-900 ring-2 ring-amber-300/50';
                statusBadge = `<span class="text-[10px] font-black text-amber-900 bg-amber-300 px-2 py-0.5 rounded-md">🌟 Saat Ini</span>`;
                actionLabel = '▶️ Mulai Belajar';
            }

            cardsHTML += `
                <a href="materi.html?month=${dashboardMapMonth}&week=${w}&day=${d}" class="p-3.5 rounded-2xl border-2 transition hover:-translate-y-1 flex flex-col justify-between ${cardStyle}">
                    <div>
                        <div class="flex items-center justify-between gap-1 mb-1.5">
                            ${statusBadge}
                            ${vocabDone === 'approved' || vocabDone === 'submitted' ? '<span class="text-[10px]" title="Kosakata Dihafal">🎯</span>' : ''}
                        </div>
                        <p class="text-sm font-black">Minggu ${w} • Hari ${d}</p>
                        <p class="text-[11px] font-bold text-slate-400 mt-0.5">${dInfo?.shortDate || `Pertemuan ${sIdx}`}</p>
                    </div>
                    <div class="mt-3 pt-2 border-t border-black/5 text-[11px] font-extrabold text-indigo-600 flex items-center justify-between">
                        <span>${actionLabel}</span>
                        <i class="fas fa-chevron-right text-[10px]"></i>
                    </div>
                </a>
            `;
            sIdx++;
        });
    });

    mapBox.innerHTML = `
        <div class="hes-card">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                    <h3 class="text-base sm:text-lg font-black text-slate-800">🗺️ Peta Perjalanan Belajarmu</h3>
                    <p class="text-xs font-bold text-slate-500">Klik pertemuan mana saja untuk mengulang materi sebelumnya atau mempelajari materi baru!</p>
                </div>
                <div class="flex flex-wrap gap-1.5">${monthTabs}</div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                ${cardsHTML}
            </div>
            <div class="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p class="text-xs font-bold text-slate-500">Sudah menyelesaikan 12 pertemuan di bulan ini?</p>
                <a href="exam.html?month=${dashboardMapMonth}" class="hes-btn-soft !bg-amber-50 !text-amber-800 !border-amber-200">
                    🏆 Kerjakan Final Exam ${dashboardMapMonth.toUpperCase()}
                </a>
            </div>
        </div>
    `;

    // 3. KARTU PENCAPAIAN & LEVEL
    if (gameBox && stats) {
        gameBox.innerHTML = `
            <div class="hes-card">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-black text-slate-800">🏅 Pencapaian Belajarmu</h3>
                    <span class="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">Progress ${stats.activeMonthTitle}: ${stats.activeMonthPercent}%</span>
                </div>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                        <p class="text-xl font-black text-emerald-700">${stats.totalCompletedSessions}</p>
                        <p class="text-xs font-bold text-slate-500">Sesi Selesai</p>
                    </div>
                    <div class="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                        <p class="text-xl font-black text-indigo-700">${stats.masteredWordsCount}</p>
                        <p class="text-xs font-bold text-slate-500">Kata Dikuasai</p>
                    </div>
                    <div class="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                        <p class="text-xl font-black text-amber-700">${stats.avgExamScore || '-'}</p>
                        <p class="text-xs font-bold text-slate-500">Nilai Ujian</p>
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
                <p class="text-xs sm:text-sm font-bold text-amber-900">🔔 Ada <strong>${pendingCount} pengajuan pindah jadwal</strong> menunggu persetujuan.</p>
                <a href="admin.html?tab=overview" class="hes-btn-primary !py-2 !px-4 !text-xs">Cek Sekarang</a>
            </div>`;
    } else alertBox.classList.add('hidden');

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let html = '';
    for (let i = 0; i < 7; i++) {
        const curr = new Date(today); curr.setDate(today.getDate() + i);
        const currStr = formatDateForID(curr);
        const items = [];
        window.HES.students.forEach(s => {
            const p = window.HES.materials[`profile-${s.email}`];
            if (isOccupied(s.email, currStr)) {
                items.push(`<div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border text-xs font-bold"><span class="truncate">${s.name}</span><span class="text-indigo-600">${p.time}</span></div>`);
            }
        });
        html += `
            <div class="hes-card !p-4">
                <h4 class="font-black text-xs sm:text-sm text-slate-800 border-b pb-2 mb-3">${getDisplayDate(curr)}</h4>
                <div class="space-y-2">${items.length ? items.join('') : '<p class="text-xs text-slate-400 italic py-3 text-center">Kosong</p>'}</div>
            </div>`;
    }
    document.getElementById('admin-schedule-grid').innerHTML = html;
}