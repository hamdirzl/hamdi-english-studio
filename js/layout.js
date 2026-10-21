// js/layout.js

function initLayout(pageTitle = 'Portal Belajar') {
    if (!getSession()) return;
    renderAppHeader(pageTitle);
    renderAppSidebar();
}

function renderAppHeader(pageTitle) {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    headerEl.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <button id="open-sidebar-btn" class="md:hidden text-slate-600 hover:text-indigo-600 p-2.5 bg-slate-100/80 rounded-xl transition">
                <i class="fas fa-bars"></i>
            </button>
            <div class="truncate">
                <h1 class="text-sm sm:text-base font-extrabold text-slate-800 truncate">${pageTitle}</h1>
                <p class="text-xs font-medium text-slate-400 hidden sm:block">${getDisplayDate(new Date())}</p>
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

function renderAppSidebar() {
    const sidebarEl = document.getElementById('app-sidebar');
    if (!sidebarEl) return;

    const user = window.HES.currentUser;
    const role = window.HES.userRole;
    const path = window.location.pathname.split('/').pop() || 'dashboard.html';

    const timeline = role === 'student' ? getStudentCurriculumTimeline(user.email) : null;
    const stats = role === 'student' ? getStudentGamificationStats(user.email) : null;
    const cur = timeline?.currentPointer;

    const materiHref = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

    const menus = [
        { file: 'dashboard.html', href: 'dashboard.html', icon: 'fa-house', label: 'Beranda Utama' },
        { file: 'materi.html',    href: materiHref,       icon: 'fa-book-open', label: 'Ruang Belajar' },
        { file: 'exam.html',      href: 'exam.html',      icon: 'fa-award', label: 'Ujian & Rapor' },
        { file: 'reschedule.html',href: 'reschedule.html',icon: 'fa-calendar-days', label: 'Atur Jadwal' }
    ];
    if (role === 'admin') {
        menus.unshift({ file: 'admin.html', href: 'admin.html', icon: 'fa-sliders', label: 'Panel Admin (CMS)' });
    }

    const navHTML = menus.map(m => {
        const active = path === m.file;
        return `
            <a href="${m.href}" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}">
                <i class="fas ${m.icon} w-5 text-center ${active ? 'text-white' : 'text-slate-400'}"></i>
                <span>${m.label}</span>
            </a>
        `;
    }).join('');

    sidebarEl.innerHTML = `
        <!-- Brand Header -->
        <div class="p-5 flex justify-between items-center border-b border-slate-100">
            <a href="dashboard.html" class="flex items-center gap-3">
                <div class="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-indigo-200">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <h2 class="text-sm font-extrabold text-slate-800 leading-none">Hamdi Studio</h2>
                    <p class="text-[11px] text-indigo-600 font-bold mt-1">English Learning Portal</p>
                </div>
            </a>
            <button id="close-sidebar-btn" class="md:hidden text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-50">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Kartu Profil Ramah -->
        <div class="p-4 mx-4 mt-4 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/40 border border-slate-200/80">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-extrabold text-slate-800 truncate">${user.name}</p>
                    <p class="text-xs font-bold text-indigo-600 truncate">
                        ${stats ? `Level ${stats.level} •${stats.xp} XP` : 'Administrator'}
                    </p>
                </div>
            </div>
        </div>

        <!-- Menu Utama yang Bersih -->
        <div class="flex-1 overflow-y-auto px-4 py-5 space-y-1.5 custom-scrollbar">
            <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider px-3 mb-2">Menu Navigasi</p>
            ${navHTML}

            ${cur ? `
            <!-- Kartu Pintas Sesi Aktif Murid -->
            <div class="mt-6 pt-5 border-t border-slate-100">
                <p class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-2">Sesi Belajar Kamu</p>
                <a href="${materiHref}" class="block p-4 rounded-2xl bg-emerald-50/90 hover:bg-emerald-100/80 border border-emerald-200 transition">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                            ${cur.isTodayClass ? 'Hari Ini' : 'Sesi Aktif'}
                        </span>
                        <span class="text-xs font-bold text-emerald-800">${cur.shortDate}</span>
                    </div>
                    <p class="text-sm font-extrabold text-slate-800 mt-1.5">${cur.monthTitle} • Minggu ${cur.week}</p>
                    <p class="text-xs font-semibold text-emerald-700 mt-0.5">Pertemuan Hari ke-${cur.day} <i class="fas fa-arrow-right ml-1"></i></p>
                </a>
            </div>
            ` : ''}
        </div>

        <!-- Tombol Keluar -->
        <div class="p-4 border-t border-slate-100">
            <button onclick="logoutUser()" class="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-extrabold text-slate-600 bg-slate-50 hover:bg-red-50 hover:text-red-600 rounded-2xl border border-slate-200/80 transition">
                <i class="fas fa-right-from-bracket"></i> Keluar dari Portal
            </button>
        </div>
    `;

    document.getElementById('close-sidebar-btn')?.addEventListener('click', () => toggleMobileSidebar(false));
}

function toggleMobileSidebar(show) {
    const sb = document.getElementById('app-sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.toggle('-translate-x-full', !show);
    if (ov) ov.classList.toggle('hidden', !show);
}