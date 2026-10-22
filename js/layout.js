// js/layout.js

let sidebarSelectedMonth = null;

function initLayout(pageTitle = 'Ruang Belajar') {
    if (!getSession()) return;
    renderAppHeader(pageTitle);
    renderAppSidebar();
}

function renderAppHeader(pageTitle) {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    headerEl.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <button id="open-sidebar-btn" class="md:hidden text-indigo-600 p-2.5 bg-indigo-50 rounded-xl font-bold">
                <i class="fas fa-bars"></i>
            </button>
            <div class="truncate">
                <h1 class="text-base sm:text-lg font-black text-slate-800 truncate">${pageTitle}</h1>
                <p class="text-xs font-bold text-slate-400 hidden sm:block">${getDisplayDate(new Date())}</p>
            </div>
        </div>
        <div id="cloud-status-indicator" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
            <span class="w-2 h-2 rounded-full bg-slate-400"></span>
            <span>Memuat...</span>
        </div>
    `;

    document.getElementById('open-sidebar-btn')?.addEventListener('click', () => toggleMobileSidebar(true));
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => toggleMobileSidebar(false));
}

window.switchSidebarMonth = function(mId) {
    sidebarSelectedMonth = mId;
    renderAppSidebar();
};

function renderAppSidebar() {
    const sidebarEl = document.getElementById('app-sidebar');
    if (!sidebarEl) return;

    const user = window.HES.currentUser;
    const role = window.HES.userRole;
    const path = window.location.pathname.split('/').pop() || 'dashboard.html';
    const params = new URLSearchParams(window.location.search);

    const timeline = role === 'student' ? getStudentCurriculumTimeline(user.email) : null;
    const stats = role === 'student' ? getStudentGamificationStats(user.email) : null;
    const cur = timeline?.currentPointer;
    const maxMonth = role === 'student' ? parseInt(window.HES.materials[`profile-${user.email}`]?.maxMonth || 1) : 99;

    if (!sidebarSelectedMonth) {
        sidebarSelectedMonth = params.get('month') || cur?.monthId || 'm1';
    }

    const materiHref = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

    const menus = [
        { file: 'dashboard.html', href: 'dashboard.html', icon: '🏠', label: 'Beranda' },
        { file: 'materi.html',    href: materiHref,       icon: '📖', label: 'Ruang Belajar' },
        { file: 'exam.html',      href: `exam.html?month=${sidebarSelectedMonth}`, icon: '🏆', label: 'Ujian & Rapor' },
        { file: 'reschedule.html',href: 'reschedule.html',icon: '🗓️', label: 'Pindah Jadwal' }
    ];
    if (role === 'admin') {
        menus.unshift({ file: 'admin.html', href: 'admin.html', icon: '⚙️', label: 'Panel Admin' });
    }

    const navHTML = menus.map(m => {
        const active = path === m.file;
        return `
            <a href="${m.href}" class="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold transition-all ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}">
                <span class="text-base">${m.icon}</span>
                <span>${m.label}</span>
            </a>
        `;
    }).join('');

    // Tab Pilih Bulan di Sidebar
    const monthTabsHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonth;
        const active = m.id === sidebarSelectedMonth;
        if (locked) {
            return `<button onclick="showToast('${m.title} masih terkunci 🔒', 'info')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-400">🔒 M${mNum}</button>`;
        }
        return `<button onclick="switchSidebarMonth('${m.id}')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${active ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}">${m.title}</button>`;
    }).join('');

    // Grid 12 Pertemuan 1-Klik (Sangat Mudah Mengulang Materi Lama!)
    let sessionListHTML = '';
    let sNum = 1;
    [1, 2, 3, 4].forEach(w => {
        [1, 2, 3].forEach(d => {
            const dInfo = timeline?.days[`${sidebarSelectedMonth}-w${w}-d${d}`];
            const st = dInfo?.status || 'upcoming';
            const isViewing = path === 'materi.html' && params.get('month') === sidebarSelectedMonth && params.get('week') == w && params.get('day') == d;

            let badge = '⚪';
            let style = 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300';
            if (st === 'completed') {
                badge = '✅';
                style = 'bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100';
            } else if (st === 'current') {
                badge = '🌟';
                style = 'bg-amber-50 text-amber-900 border-amber-300 font-black';
            }
            if (isViewing) {
                style = 'bg-indigo-600 text-white border-indigo-700 shadow-sm';
            }

            sessionListHTML += `
                <a href="materi.html?month=${sidebarSelectedMonth}&week=${w}&day=${d}" class="flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-extrabold transition ${style}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span>${badge}</span>
                        <span class="truncate">Sesi ${sNum} <span class="opacity-75 font-bold">(W${w}•D${d})</span></span>
                    </div>
                    ${dInfo?.shortDate ? `<span class="text-[10px] font-bold opacity-80 shrink-0">${dInfo.shortDate}</span>` : ''}
                </a>
            `;
            sNum++;
        });
    });

    sidebarEl.innerHTML = `
        <div class="p-4 flex justify-between items-center border-b border-slate-100">
            <a href="dashboard.html" class="flex items-center gap-2.5">
                <div class="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <h2 class="text-sm font-black text-slate-800 leading-none">Hamdi Studio</h2>
                    <p class="text-[11px] text-indigo-600 font-extrabold mt-0.5">Friendly Learning Space</p>
                </div>
            </a>
            <button id="close-sidebar-btn" class="md:hidden text-slate-400 p-2 rounded-xl bg-slate-50">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Profil & XP Bar -->
        <div class="p-3.5 mx-3.5 mt-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-black text-slate-800 truncate">${user.name}</p>
                    <p class="text-[11px] font-extrabold text-indigo-600">
                        ${stats ? `⭐ Level ${stats.level} • ${stats.xp} XP` : 'Administrator'}
                    </p>
                </div>
            </div>
        </div>

        <!-- Menu & Peta Pertemuan 1-Klik -->
        <div class="flex-1 overflow-y-auto px-3.5 py-4 space-y-5 custom-scrollbar">
            <div class="space-y-1">
                ${navHTML}
            </div>

            <div>
                <div class="flex items-center justify-between px-1 mb-2">
                    <p class="text-[11px] font-black text-slate-400 uppercase tracking-wider">🗺️ Peta Pertemuan</p>
                    <span class="text-[10px] font-bold text-slate-400">Klik untuk buka</span>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-2.5">
                    ${monthTabsHTML}
                </div>
                <div class="space-y-1.5">
                    ${sessionListHTML}
                </div>
            </div>
        </div>

        <div class="p-3.5 border-t border-slate-100">
            <button onclick="logoutUser()" class="w-full py-2.5 px-4 text-xs font-extrabold text-slate-500 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-xl transition">
                <i class="fas fa-right-from-bracket mr-1"></i> Keluar
            </button>
        </div>
    `;

    document.getElementById('close-sidebar-btn')?.addEventListener('click', () => toggleMobileSidebar(false));
}

function toggleMobileSidebar(show) {
    document.getElementById('app-sidebar')?.classList.toggle('-translate-x-full', !show);
    document.getElementById('sidebar-overlay')?.classList.toggle('hidden', !show);
}