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
        badge.innerHTML = `<i class="fas fa-shield-alt text-amber-300 mr-1.5"></i> Administrator Workspace`;
        title.innerText = `Halo, Bro Hamdi!`;
        sub.innerText = `Input tanggal kelas hari ini, cek rekaman tugas murid, dan kelola materi.`;
        act.innerHTML = `
            <div class="flex flex-wrap gap-2">
                <a href="admin.html?tab=overview" class="bg-white text-teal-800 hover:bg-amber-50 px-5 py-3 rounded-2xl text-xs sm:text-sm font-extrabold shadow-sm inline-flex items-center gap-2 transition">
                    <i class="fas fa-calendar-day text-amber-500"></i> Input Tanggal Kelas
                </a>
                <a href="admin.html?tab=tasks" class="bg-white/15 hover:bg-white/25 text-white px-4 py-3 rounded-2xl text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition">
                    <i class="fas fa-microphone-lines"></i> Tugas
                </a>
            </div>`;
        renderAdminDashboard();
    } else {
        const firstName = user.name ? user.name.split(' ')[0] : 'Teman';
        const timeline = getStudentCurriculumTimeline(user.email);
        const stats = getStudentGamificationStats(user.email);
        const cur = timeline.currentPointer;
        const nxt = timeline.nextPointer;

        if (!dashboardMapMonth) dashboardMapMonth = cur?.monthId || nxt?.monthId || 'm1';

        badge.innerHTML = `<i class="fas fa-star text-amber-300 mr-1.5"></i> Level ${stats.level} • ${stats.levelTitle} (${stats.xp} XP)`;
        title.innerText = `Semangat Belajar, ${firstName}!`;

        if (cur && cur.isTodayClass) {
            sub.innerText = `Hari ini ada kelas: ${cur.monthTitle} • Sesi ${cur.sessionNum} (${cur.displayDate})`;
            act.innerHTML = `<a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="bg-white hover:bg-amber-50 text-teal-800 px-6 py-3.5 rounded-2xl text-sm font-extrabold shadow-sm inline-flex items-center justify-center gap-2 transition w-full md:w-auto"><i class="fas fa-play text-amber-500"></i> Buka Materi Hari Ini</a>`;
        } else if (cur) {
            sub.innerText = `Sesi terakhir yang terbuka: ${cur.monthTitle} • Sesi ${cur.sessionNum} (${cur.shortDate})`;
            act.innerHTML = `<a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="bg-white hover:bg-amber-50 text-teal-800 px-6 py-3.5 rounded-2xl text-sm font-extrabold shadow-sm inline-flex items-center justify-center gap-2 transition w-full md:w-auto"><i class="fas fa-book-open text-teal-600"></i> Review Materi Terakhir</a>`;
        } else if (nxt) {
            sub.innerText = `Kelas berikutnya dijadwalkan pada ${nxt.displayDate}. Materi akan terbuka otomatis di hari kelas!`;
            act.innerHTML = `<a href="tugas.html" class="bg-white hover:bg-amber-50 text-teal-800 px-6 py-3.5 rounded-2xl text-sm font-extrabold shadow-sm inline-flex items-center justify-center gap-2 transition w-full md:w-auto"><i class="fas fa-microphone-lines text-amber-500"></i> Cek Tugas Speaking</a>`;
        } else {
            sub.innerText = `Jadwal pertemuan akan muncul otomatis begitu tutor mengatur tanggal kelasmu.`;
            act.innerHTML = `<a href="tugas.html" class="bg-white hover:bg-amber-50 text-teal-800 px-6 py-3.5 rounded-2xl text-sm font-extrabold shadow-sm inline-flex items-center justify-center gap-2 transition w-full md:w-auto"><i class="fas fa-microphone-lines text-amber-500"></i> Lihat Tugas Speaking</a>`;
        }

        renderStudentDashboard(user.email, timeline, stats);
    }
}

function renderStudentDashboard(email, timeline, stats) {
    const nextBox = document.getElementById('student-next-session-box');
    const mapBox = document.getElementById('student-journey-map-box');
    const gameBox = document.getElementById('student-gamification-box');
    const profile = window.HES.materials[`profile-${email}`] || {};
    const maxMonth = parseInt(profile.maxMonth || 1);
    const cur = timeline.currentPointer;
    const nxt = timeline.nextPointer;

    // 2 Kartu Utama: Status Kelas Terdekat & Tugas Conversation
    let classCardHTML = '';
    if (cur && cur.isTodayClass) {
        classCardHTML = `
            <div class="hes-card !bg-teal-50/70 !border-teal-200 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <span class="px-3 py-1 rounded-xl bg-teal-700 text-white text-xs font-extrabold">
                            <i class="fas fa-star text-amber-300 mr-1"></i> Kelas Hari Ini
                        </span>
                        ${profile.time ? `<span class="text-xs font-extrabold text-teal-800"><i class="far fa-clock mr-1"></i>${profile.time} WIB</span>` : ''}
                    </div>
                    <h3 class="text-lg font-extrabold text-stone-800 mt-1">${cur.monthTitle} • Pertemuan ${cur.sessionNum}</h3>
                    <p class="text-xs font-bold text-stone-600 mt-0.5"><i class="far fa-calendar-check text-teal-600 mr-1"></i> ${cur.displayDate} (Materi Terbuka)</p>
                </div>
                <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="hes-btn-primary w-full mt-4">
                    Mulai Belajar Sekarang <i class="fas fa-arrow-right ml-1"></i>
                </a>
            </div>`;
    } else if (nxt) {
        classCardHTML = `
            <div class="hes-card !bg-amber-50/60 !border-amber-200 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <span class="px-3 py-1 rounded-xl bg-amber-500 text-white text-xs font-extrabold">
                            <i class="fas fa-calendar-alt mr-1"></i> Pertemuan Berikutnya
                        </span>
                        ${profile.time ? `<span class="text-xs font-extrabold text-amber-800"><i class="far fa-clock mr-1"></i>${profile.time} WIB</span>` : ''}
                    </div>
                    <h3 class="text-lg font-extrabold text-stone-800 mt-1">${nxt.monthTitle} • Pertemuan ${nxt.sessionNum}</h3>
                    <p class="text-xs font-bold text-stone-600 mt-0.5"><i class="fas fa-lock text-amber-600 mr-1"></i> Terbuka otomatis pada <strong>${nxt.displayDate}</strong></p>
                </div>
                ${cur
                    ? `<a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="hes-btn-soft w-full mt-4"><i class="fas fa-history"></i> Review Sesi ${cur.sessionNum} Sebelumnya</a>`
                    : `<div class="mt-4 p-2.5 rounded-xl bg-white/80 border border-amber-200 text-center text-xs font-extrabold text-amber-800"><i class="fas fa-hourglass-half mr-1"></i> Menunggu Hari Kelas</div>`}
            </div>`;
    } else if (cur) {
        classCardHTML = `
            <div class="hes-card flex flex-col justify-between">
                <div>
                    <span class="px-3 py-1 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 text-xs font-extrabold">
                        <i class="fas fa-book-open mr-1"></i> Materi Terakhir Terbuka
                    </span>
                    <h3 class="text-lg font-extrabold text-stone-800 mt-2">${cur.monthTitle} • Pertemuan ${cur.sessionNum}</h3>
                    <p class="text-xs font-bold text-stone-500 mt-0.5"><i class="far fa-calendar text-teal-600 mr-1"></i> ${cur.displayDate}</p>
                </div>
                <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="hes-btn-primary w-full mt-4">
                    Buka Materi Ini <i class="fas fa-arrow-right ml-1"></i>
                </a>
            </div>`;
    } else {
        classCardHTML = `
            <div class="hes-card flex flex-col justify-between">
                <div>
                    <span class="px-3 py-1 rounded-xl bg-stone-100 text-stone-600 text-xs font-extrabold"><i class="far fa-calendar mr-1"></i> Jadwal Kelas</span>
                    <h3 class="text-base font-extrabold text-stone-800 mt-2">Belum Ada Tanggal Kelas Aktif</h3>
                    <p class="text-xs font-semibold text-stone-500 mt-1">Setiap materi akan terbuka otomatis tepat pada hari pertemuan yang diatur oleh tutor.</p>
                </div>
                <a href="https://wa.me/6282298363945" target="_blank" class="hes-btn-soft w-full mt-4">
                    <i class="fab fa-whatsapp"></i> Konfirmasi Jadwal via WA
                </a>
            </div>`;
    }

    const taskCardHTML = `
        <div class="hes-card flex flex-col justify-between ${stats.pendingTasksCount > 0 ? '!bg-orange-50/50 !border-orange-200' : ''}">
            <div>
                <div class="flex items-center justify-between mb-2">
                    <span class="px-3 py-1 rounded-xl ${stats.pendingTasksCount > 0 ? 'bg-orange-500 text-white' : 'bg-emerald-100 text-emerald-800'} text-xs font-extrabold">
                        <i class="fas fa-microphone-lines mr-1"></i> Tugas Conversation
                    </span>
                    <span class="text-xs font-extrabold text-stone-500">${stats.completedTasksCount}/${stats.totalTasksCount} Selesai</span>
                </div>
                <h3 class="text-lg font-extrabold text-stone-800 mt-1">
                    ${stats.pendingTasksCount > 0 ? `Ada ${stats.pendingTasksCount} Tugas Menunggu Rekamanmu!` : (stats.totalTasksCount > 0 ? 'Semua Tugas Speaking Sudah Selesai!' : 'Belum Ada Tugas Speaking')}
                </h3>
                <p class="text-xs font-semibold text-stone-500 mt-1">Latih kelancaran berbicara bahasa Inggris dengan merekam suaramu sesuai topik dari tutor.</p>
            </div>
            <a href="tugas.html" class="${stats.pendingTasksCount > 0 ? 'hes-btn-warm' : 'hes-btn-soft'} w-full mt-4">
                <i class="fas fa-microphone"></i> ${stats.pendingTasksCount > 0 ? 'Kerjakan Tugas Sekarang' : 'Buka Halaman Tugas'}
            </a>
        </div>`;

    nextBox.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${classCardHTML}${taskCardHTML}</div>`;

    // Peta Perjalanan 12 Pertemuan (Dengan Status Terkunci / Terbuka)
    const monthTabs = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = mNum > maxMonth;
        const active = m.id === dashboardMapMonth;
        if (locked) return `<button onclick="showToast('${m.title} masih terkunci', 'info')" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-stone-100 text-stone-400 cursor-not-allowed"><i class="fas fa-lock mr-1"></i> ${m.title}</button>`;
        return `<button onclick="switchDashboardMapMonth('${m.id}')" class="px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${active ? 'bg-teal-700 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-teal-50 hover:text-teal-700'}">${m.title}</button>`;
    }).join('');

    let cardsHTML = '';
    let sIdx = 1;
    [1, 2, 3, 4].forEach(w => {
        [1, 2, 3].forEach(d => {
            const access = getSessionAccessStatus(email, dashboardMapMonth, w, d, 'student');

            let cardStyle = 'bg-stone-50/70 border-stone-200/80 text-stone-400';
            let statusBadge = `<span class="text-[10px] font-extrabold text-stone-400 bg-stone-200/70 px-2 py-0.5 rounded-md"><i class="fas fa-lock mr-1"></i>Terkunci</span>`;
            let actionLabel = 'Menunggu Hari Kelas';
            let dateSub = 'Belum dijadwalkan';

            if (access.unlocked && access.status === 'current') {
                cardStyle = 'bg-amber-50 border-amber-300 text-stone-900 ring-2 ring-amber-300/40 hover:-translate-y-1';
                statusBadge = `<span class="text-[10px] font-black text-amber-900 bg-amber-200 px-2 py-0.5 rounded-md"><i class="fas fa-star mr-1"></i>Hari Ini</span>`;
                actionLabel = '<i class="fas fa-play mr-1"></i> Buka Materi';
                dateSub = access.shortDate;
            } else if (access.unlocked && access.status === 'completed') {
                cardStyle = 'bg-teal-50/40 border-teal-200 text-stone-800 hover:border-teal-400 hover:-translate-y-1';
                statusBadge = `<span class="text-[10px] font-black text-teal-800 bg-teal-100 px-2 py-0.5 rounded-md"><i class="fas fa-check-circle mr-1"></i>Terbuka</span>`;
                actionLabel = '<i class="fas fa-redo mr-1"></i> Ulangi Materi';
                dateSub = access.shortDate;
            } else if (access.reason === 'future') {
                cardStyle = 'bg-white border-amber-200/70 text-stone-500';
                statusBadge = `<span class="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md"><i class="fas fa-clock mr-1"></i>Terjadwal</span>`;
                actionLabel = 'Terbuka di Hari-H';
                dateSub = access.shortDate;
            }

            cardsHTML += `
                <a href="materi.html?month=${dashboardMapMonth}&week=${w}&day=${d}" class="p-3.5 rounded-2xl border transition flex flex-col justify-between ${cardStyle}">
                    <div>
                        <div class="flex items-center justify-between gap-1 mb-1.5">
                            ${statusBadge}
                            <span class="text-[10px] font-extrabold opacity-70">#${sIdx}</span>
                        </div>
                        <p class="text-sm font-extrabold">Pertemuan ${sIdx}</p>
                        <p class="text-[11px] font-bold opacity-75 mt-0.5">${dateSub}</p>
                    </div>
                    <div class="mt-3 pt-2 border-t border-stone-200/60 text-[11px] font-extrabold ${access.unlocked ? 'text-teal-700' : 'text-stone-400'} flex items-center justify-between">
                        <span>${actionLabel}</span>
                        <i class="fas ${access.unlocked ? 'fa-chevron-right' : 'fa-lock'} text-[10px]"></i>
                    </div>
                </a>`;
            sIdx++;
        });
    });

    mapBox.innerHTML = `
        <div class="hes-card">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                    <h3 class="text-base sm:text-lg font-extrabold text-stone-800"><i class="fas fa-map text-teal-600 mr-1.5"></i> Peta Perjalanan Belajarmu</h3>
                    <p class="text-xs font-semibold text-stone-500 mt-0.5">Materi tiap pertemuan otomatis terbuka pada tanggal kelasmu. Sesi yang sudah lewat bisa diulang kapan saja!</p>
                </div>
                <div class="flex flex-wrap gap-1.5">${monthTabs}</div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                ${cardsHTML}
            </div>
            <div class="mt-4 pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p class="text-xs font-bold text-stone-500">Sudah menyelesaikan pertemuan di bulan ini?</p>
                <a href="exam.html?month=${dashboardMapMonth}" class="hes-btn-soft">
                    <i class="fas fa-trophy text-amber-500"></i> Kerjakan Final Exam ${dashboardMapMonth.toUpperCase()}
                </a>
            </div>
        </div>`;

    if (gameBox && stats) {
        gameBox.innerHTML = `
            <div class="hes-card">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-extrabold text-stone-800"><i class="fas fa-medal text-amber-500 mr-1.5"></i> Pencapaian Belajarmu</h3>
                    <span class="text-xs font-extrabold text-teal-700 bg-teal-50 px-3 py-1 rounded-xl border border-teal-100">Progress ${stats.activeMonthTitle}: ${stats.activeMonthPercent}%</span>
                </div>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="p-4 rounded-2xl bg-teal-50/70 border border-teal-100">
                        <p class="text-xl font-black text-teal-800">${stats.totalCompletedSessions}</p>
                        <p class="text-xs font-bold text-stone-500">Sesi Selesai</p>
                    </div>
                    <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-100">
                        <p class="text-xl font-black text-amber-700">${stats.completedTasksCount}</p>
                        <p class="text-xs font-bold text-stone-500">Tugas Speaking</p>
                    </div>
                    <div class="p-4 rounded-2xl bg-sky-50/70 border border-sky-100">
                        <p class="text-xl font-black text-sky-700">${stats.avgExamScore || '-'}</p>
                        <p class="text-xs font-bold text-stone-500">Nilai Ujian</p>
                    </div>
                </div>
            </div>`;
    }
}

function renderAdminDashboard() {
    const tasks = getAllSpeakingTasks();
    let pendingTaskSubmissions = 0;

    window.HES.students.forEach(s => {
        tasks.forEach(t => {
            if (!t.target || t.target === 'all' || t.target === s.email) {
                const sub = getTaskSubmission(s.email, t.id);
                if (sub && sub.status === 'submitted') pendingTaskSubmissions++;
            }
        });
    });

    document.getElementById('stat-total-students').innerText = window.HES.students.length;
    document.getElementById('stat-total-months').innerText = window.HES.months.length;
    document.getElementById('stat-pending-tasks').innerText = pendingTaskSubmissions;

    const alertBox = document.getElementById('admin-task-alert');
    if (pendingTaskSubmissions > 0) {
        alertBox.classList.remove('hidden');
        alertBox.innerHTML = `
            <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4">
                <p class="text-xs sm:text-sm font-extrabold text-amber-900"><i class="fas fa-microphone-lines text-amber-600 mr-1.5"></i> Ada <strong>${pendingTaskSubmissions} rekaman tugas conversation</strong> baru menunggu penilaianmu.</p>
                <a href="admin.html?tab=tasks" class="hes-btn-warm !py-2 !px-4 !text-xs">Nilai Sekarang</a>
            </div>`;
    } else {
        alertBox.classList.add('hidden');
    }

    // Jadwal 7 Hari Ke Depan berdasarkan tanggal pertemuan manual yang diinput admin
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let html = '';
    for (let i = 0; i < 7; i++) {
        const curr = new Date(today); curr.setDate(today.getDate() + i);
        const currStr = formatDateForID(curr);
        const items = [];

        window.HES.students.forEach(s => {
            const p = window.HES.materials[`profile-${s.email}`] || {};
            const sDates = p.sessionDates || {};
            Object.entries(sDates).forEach(([key, val]) => {
                if (val === currStr) {
                    const mMatch = key.match(/^(m\d+)-w(\d+)-d(\d+)$/);
                    const sNum = mMatch ? ((parseInt(mMatch[2]) - 1) * 3) + parseInt(mMatch[3]) : '';
                    const lbl = mMatch ? `${mMatch[1].toUpperCase()} • Sesi ${sNum}` : key;
                    items.push(`
                        <div class="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/50 border border-teal-100 text-xs font-bold gap-2">
                            <div class="min-w-0">
                                <p class="font-extrabold text-stone-800 truncate">${s.name}</p>
                                <p class="text-[10px] font-bold text-teal-700">${lbl}</p>
                            </div>
                            <span class="text-stone-500 shrink-0">${p.time || 'Terjadwal'}</span>
                        </div>`);
                }
            });
        });

        const isToday = i === 0;
        html += `
            <div class="hes-card !p-4 ${isToday ? '!border-teal-400 !bg-teal-50/20' : ''}">
                <div class="flex items-center justify-between border-b border-stone-100 pb-2 mb-3">
                    <h4 class="font-extrabold text-xs sm:text-sm text-stone-800">${getDisplayDate(curr)}</h4>
                    ${isToday ? '<span class="px-2 py-0.5 rounded-md bg-teal-700 text-white text-[10px] font-extrabold">Hari Ini</span>' : ''}
                </div>
                <div class="space-y-2">${items.length ? items.join('') : '<p class="text-xs text-stone-400 italic py-3 text-center">Belum ada kelas diinput</p>'}</div>
            </div>`;
    }
    document.getElementById('admin-schedule-grid').innerHTML = html;
}