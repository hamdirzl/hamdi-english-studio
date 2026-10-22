// js/dashboard.js

let selectedMapMonth = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    initLayout('Beranda');
    renderDashboardContent();

    await syncFromCloud();
    renderAppHeader();
    renderDashboardContent();
});

window.switchDashboardMapMonth = function(mId) {
    selectedMapMonth = mId;
    renderDashboardContent();
};

function renderDashboardContent() {
    const user = window.HES.currentUser;
    const role = window.HES.userRole;

    document.getElementById('student-dashboard-view').classList.toggle('hidden', role === 'admin');
    document.getElementById('admin-dashboard-view').classList.toggle('hidden', role !== 'admin');

    if (role === 'admin') {
        renderAdminDashboard();
    } else {
        const timeline = getStudentCurriculumTimeline(user.email);
        const stats = getStudentGamificationStats(user.email);
        if (!selectedMapMonth) selectedMapMonth = timeline?.currentPointer?.monthId || 'm1';
        renderStudentDashboard(user, timeline, stats);
    }
}

function renderStudentDashboard(user, timeline, stats) {
    const email = user.email;
    const firstName = user.name ? user.name.split(' ')[0] : 'Teman';
    const profile = window.HES.materials[`profile-${email}`] || {};
    const maxMonth = parseInt(profile.maxMonth || 1);
    const nextSesh = getStudentNextSessionInfo(email);
    const cur = timeline?.currentPointer;
    const nxt = timeline?.nextPointer;

    const ticketBox = document.getElementById('student-welcome-ticket');
    const mapBox = document.getElementById('student-journey-map-box');
    const gameBox = document.getElementById('student-gamification-box');

    const curSessionNum = cur ? ((cur.week - 1) * 3) + cur.day : 1;
    const curUrl = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

    // 1. TIKET SAMBUTAN HANGAT & JADWAL AKTIF
    ticketBox.innerHTML = `
        <div class="hes-card !p-0 overflow-hidden border-2 border-emerald-200">
            <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-6 sm:p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-extrabold mb-3">
                        <span>☕ Ruang Belajar ${firstName}</span>
                        <span>•</span>
                        <span>${stats.levelTitle}</span>
                    </div>
                    <h2 class="text-2xl sm:text-3xl font-extrabold">Halo, ${firstName}! Siap latihan hari ini?</h2>
                    <p class="text-emerald-50 text-xs sm:text-sm font-medium mt-1">
                        ${cur ? `Saat ini kamu berada di <strong>${cur.monthTitle} — Pertemuan ke-${curSessionNum}</strong> (${cur.displayDate}).` : 'Yuk pilih materi pertemuan di bawah untuk mulai belajar!'}
                    </p>
                </div>
                <a href="${curUrl}" class="bg-amber-400 hover:bg-amber-300 text-stone-900 font-extrabold text-sm px-6 py-4 rounded-2xl border-b-4 border-amber-600 shadow-md inline-flex items-center justify-center gap-2.5 shrink-0 transition">
                    <i class="fas fa-play"></i> Buka Pertemuan Saat Ini
                </a>
            </div>

            <!-- Bar Info Jadwal Rutin & Sesi Berikutnya -->
            <div class="p-4 sm:px-8 bg-[#FAF8F5] flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-stone-600">
                <div class="flex flex-wrap items-center gap-4">
                    <span>🗓️ Jadwal Rutin: <strong class="text-stone-800">${(profile.days || []).join(', ') || '-'} (${nextSesh.time || '-'} WIB)</strong></span>
                    ${nxt ? `<span>⏭️ Sesi Berikutnya: <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="text-emerald-700 underline font-extrabold">${nxt.shortDate} (W${nxt.week}•D${nxt.day})</a></span>` : ''}
                </div>
                <a href="reschedule.html" class="text-orange-600 hover:underline font-extrabold">
                    <i class="fas fa-calendar-alt mr-1"></i> Ingin Pindah Hari?
                </a>
            </div>
        </div>
    `;

    // 2. PETA PERJALANAN 12 PERTEMUAN (Sangat Mudah Mengulang Materi Lama!)
    const monthPills = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = mNum > maxMonth;
        const active = m.id === selectedMapMonth;
        if (locked) {
            return `<button onclick="showToast('${m.title} masih terkunci 🔒','info')" class="px-4 py-2 rounded-full text-xs font-bold bg-stone-100 text-stone-400">🔒 ${m.title}</button>`;
        }
        return `<button onclick="switchDashboardMapMonth('${m.id}')" class="px-5 py-2 rounded-full text-xs font-extrabold transition ${active ? 'bg-stone-800 text-white shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}">${m.title}</button>`;
    }).join('');

    let sessionCards = '';
    let sNum = 1;
    [1, 2, 3, 4].forEach(w => {
        [1, 2, 3].forEach(d => {
            const dInfo = timeline?.days[`${selectedMapMonth}-w${w}-d${d}`];
            const st = dInfo?.status || 'upcoming';
            const vocabSt = window.HES.materials[`vocab_status-${email}-${selectedMapMonth}-w${w}-d${d}`]?.status;
            const numStr = String(sNum).padStart(2, '0');

            let boxClass = 'bg-[#FAF8F5] border-stone-200 hover:border-amber-400';
            let numBadge = 'bg-stone-200 text-stone-600';
            let statusText = 'Buka Materi';

            if (st === 'completed') {
                boxClass = 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-500';
                numBadge = 'bg-emerald-600 text-white';
                statusText = '🔄 Ulangi Materi';
            } else if (st === 'current') {
                boxClass = 'bg-amber-50 border-amber-400 ring-2 ring-amber-300/60';
                numBadge = 'bg-orange-500 text-white';
                statusText = '🌟 Sesi Saat Ini';
            }

            sessionCards += `
                <a href="materi.html?month=${selectedMapMonth}&week=${w}&day=${d}" class="p-4 rounded-2xl border-2 transition hover:-translate-y-1 flex flex-col justify-between ${boxClass}">
                    <div>
                        <div class="flex items-center justify-between mb-2.5">
                            <span class="w-8 h-8 rounded-xl ${numBadge} font-extrabold text-xs flex items-center justify-center">${numStr}</span>
                            <span class="text-[11px] font-bold text-stone-400">${dInfo?.shortDate || `W${w}•D${d}`}</span>
                        </div>
                        <h4 class="font-extrabold text-sm text-stone-800">Pertemuan ${sNum}</h4>
                        <p class="text-xs font-semibold text-stone-500">Minggu ${w}, Hari ke-${d}</p>
                    </div>
                    <div class="mt-3 pt-2.5 border-t border-stone-200/60 flex items-center justify-between text-xs font-extrabold text-emerald-700">
                        <span>${statusText}</span>
                        <span>${vocabSt === 'approved' || vocabSt === 'submitted' ? '🎯' : '→'}</span>
                    </div>
                </a>
            `;
            sNum++;
        });
    });

    mapBox.innerHTML = `
        <div class="hes-card">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div>
                    <h3 class="text-lg font-extrabold text-stone-800">🗺️ Pilih Pertemuan Kelas (Sesi 1 – 12)</h3>
                    <p class="text-xs font-semibold text-stone-500">Mau mengulang materi minggu lalu atau intip materi besok? Langsung klik kartunya di bawah ini!</p>
                </div>
                <div class="flex flex-wrap gap-2">${monthPills}</div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                ${sessionCards}
            </div>

            <div class="mt-5 pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span class="text-xs font-bold text-stone-500">🏆 Sudah menyelesaikan 12 pertemuan di bulan ini?</span>
                <a href="exam.html?month=${selectedMapMonth}" class="hes-btn-soft">
                    Buka Ujian Akhir & Rapor ${selectedMapMonth.toUpperCase()} <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        </div>
    `;

    // 3. STATISTIK SINGKAT
    gameBox.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="hes-card flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl">✅</div>
                <div>
                    <p class="text-2xl font-extrabold text-stone-800">${stats.totalCompletedSessions} Kelas</p>
                    <p class="text-xs font-bold text-stone-400">Pertemuan Diselesaikan</p>
                </div>
            </div>
            <div class="hes-card flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl">🎯</div>
                <div>
                    <p class="text-2xl font-extrabold text-stone-800">${stats.masteredWordsCount} Kata</p>
                    <p class="text-xs font-bold text-stone-400">Kosakata Dikuasai</p>
                </div>
            </div>
            <div class="hes-card flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center text-xl">🏆</div>
                <div>
                    <p class="text-2xl font-extrabold text-stone-800">${stats.avgExamScore || '-'}</p>
                    <p class="text-xs font-bold text-stone-400">Rata-Rata Nilai Ujian</p>
                </div>
            </div>
        </div>
    `;
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
            <div class="p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-between gap-4">
                <p class="text-xs sm:text-sm font-bold text-amber-900">🔔 Ada <strong>${pendingCount} pengajuan pindah jadwal</strong> menunggu konfirmasi.</p>
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
                items.push(`<div class="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF8F5] border text-xs font-bold"><span class="truncate">${s.name}</span><span class="text-emerald-700">${p.time}</span></div>`);
            }
        });
        html += `
            <div class="hes-card !p-4">
                <h4 class="font-extrabold text-xs sm:text-sm text-stone-800 border-b pb-2 mb-3">${getDisplayDate(curr)}</h4>
                <div class="space-y-2">${items.length ? items.join('') : '<p class="text-xs text-stone-400 italic py-3 text-center">Kosong</p>'}</div>
            </div>`;
    }
    document.getElementById('admin-schedule-grid').innerHTML = html;
}