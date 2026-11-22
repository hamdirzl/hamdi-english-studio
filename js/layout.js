// js/layout.js

let sidebarSelectedMonth = null;

function initLayout(pageTitle = 'Ruang Belajar') {
    if (!getSession()) return;
    if (localStorage.getItem('hes_sidebar_collapsed') === '1') {
        document.body.classList.add('hes-sidebar-collapsed');
    }
    renderAppHeader(pageTitle);
    renderAppSidebar();
}

window.toggleDesktopSidebar = function() {
    const isCollapsed = document.body.classList.toggle('hes-sidebar-collapsed');
    localStorage.setItem('hes_sidebar_collapsed', isCollapsed ? '1' : '0');
    updateFocusModeButtonsUI();
};

window.toggleFullScreenReading = function() {
    const isCollapsed = !document.body.classList.contains('hes-sidebar-collapsed');
    document.body.classList.toggle('hes-sidebar-collapsed', isCollapsed);
    localStorage.setItem('hes_sidebar_collapsed', isCollapsed ? '1' : '0');
    updateFocusModeButtonsUI();
};

function updateFocusModeButtonsUI() {
    const isCollapsed = document.body.classList.contains('hes-sidebar-collapsed');
    const headerBtn = document.getElementById('desktop-sidebar-toggle-btn');
    if (headerBtn) {
        headerBtn.innerHTML = `<i class="fas ${isCollapsed ? 'fa-indent' : 'fa-outdent'}"></i>`;
        headerBtn.title = isCollapsed ? 'Tampilkan Sidebar' : 'Sembunyikan Sidebar (Mode Lebar)';
    }
    document.querySelectorAll('.hes-focus-mode-btn').forEach(btn => {
        if (btn.classList.contains('w-10')) {
            btn.innerHTML = `<i class="fas ${isCollapsed ? 'fa-compress-alt' : 'fa-expand-alt'} text-sm"></i>`;
        }
    });
}

function renderAppHeader(pageTitle) {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    const isCollapsed = document.body.classList.contains('hes-sidebar-collapsed');

    headerEl.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <button id="open-sidebar-btn" class="md:hidden text-teal-700 p-2.5 bg-teal-50 rounded-xl font-bold cursor-pointer">
                <i class="fas fa-bars"></i>
            </button>
            <button id="desktop-sidebar-toggle-btn" onclick="toggleDesktopSidebar()" title="${isCollapsed ? 'Tampilkan Sidebar' : 'Sembunyikan Sidebar (Mode Lebar)'}" class="hidden md:inline-flex items-center justify-center w-9 h-9 text-stone-600 hover:text-teal-700 bg-stone-100 hover:bg-teal-50 rounded-xl font-bold transition cursor-pointer">
                <i class="fas ${isCollapsed ? 'fa-indent' : 'fa-outdent'}"></i>
            </button>
            <div class="truncate">
                <h1 class="text-base sm:text-lg font-extrabold text-stone-800 truncate">${pageTitle}</h1>
                <p class="text-xs font-bold text-stone-400 hidden sm:block">${getDisplayDate(new Date())}</p>
            </div>
        </div>
        <div class="flex items-center gap-2.5">
            <div id="cloud-status-indicator" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-stone-100 text-stone-500 border border-stone-200">
                <span class="w-2 h-2 rounded-full bg-stone-400"></span>
                <span>Memuat...</span>
            </div>
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

    const materiHref = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html?month=m1&week=1&day=1';
    const pendingTaskBadge = (role === 'student' && stats?.pendingTasksCount > 0)
        ? `<span class="ml-auto px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">${stats.pendingTasksCount}</span>`
        : '';

    const menus = [
        { file: 'dashboard.html', href: 'dashboard.html', icon: '<i class="fas fa-home"></i>', label: 'Beranda' },
        { file: 'materi.html',    href: materiHref,       icon: '<i class="fas fa-book-open"></i>', label: 'Ruang Belajar' },
        { file: 'tugas.html',     href: 'tugas.html',     icon: '<i class="fas fa-microphone-lines"></i>', label: 'Tugas Speaking', badge: pendingTaskBadge },
        { file: 'exam.html',      href: `exam.html?month=${sidebarSelectedMonth}`, icon: '<i class="fas fa-award"></i>', label: 'Ujian & Rapor' }
    ];
    if (role === 'admin') {
        menus.unshift({ file: 'admin.html', href: 'admin.html', icon: '<i class="fas fa-sliders-h"></i>', label: 'Panel Admin' });
    }

    const navHTML = menus.map(m => {
        const active = path === m.file;
        return `
            <a href="${m.href}" class="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-extrabold transition-all ${active ? 'bg-gradient-to-r from-teal-700 to-teal-600 text-white shadow-md shadow-teal-700/20' : 'text-stone-600 hover:bg-teal-50/70 hover:text-teal-700'}">
                <span class="text-base w-5 text-center">${m.icon}</span>
                <span>${m.label}</span>
                ${m.badge || ''}
            </a>
        `;
    }).join('');

    const monthTabsHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonth;
        const active = m.id === sidebarSelectedMonth;
        if (locked) {
            return `<button onclick="showToast('${m.title} masih terkunci', 'info')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-stone-100 text-stone-400 cursor-not-allowed"><i class="fas fa-lock mr-1"></i> M${mNum}</button>`;
        }
        return `<button onclick="switchSidebarMonth('${m.id}')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${active ? 'bg-teal-700 text-white shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-teal-50 hover:text-teal-700'}">${m.title}</button>`;
    }).join('');

    let sessionListHTML = '';
    let sNum = 1;
    [1, 2, 3, 4].forEach(w => {
        [1, 2, 3].forEach(d => {
            const access = getSessionAccessStatus(user.email, sidebarSelectedMonth, w, d, role);
            const isViewing = path === 'materi.html' && params.get('month') === sidebarSelectedMonth && params.get('week') == w && params.get('day') == d;

            let badge = '<i class="fas fa-lock text-stone-300 text-[11px]"></i>';
            let style = 'bg-stone-50/80 text-stone-400 border border-stone-200/70';

            if (role === 'admin' || access.unlocked) {
                if (access.status === 'completed') {
                    badge = '<i class="fas fa-check-circle text-teal-600"></i>';
                    style = 'bg-teal-50/40 text-teal-950 border border-teal-200/80 hover:bg-teal-50';
                } else if (access.status === 'current') {
                    badge = '<i class="fas fa-star text-amber-500"></i>';
                    style = 'bg-amber-50 text-amber-950 border border-amber-300 font-extrabold';
                } else {
                    badge = '<i class="far fa-circle text-stone-400"></i>';
                    style = 'bg-white text-stone-600 border border-stone-200 hover:border-teal-300';
                }
            } else if (access.reason === 'future') {
                badge = '<i class="fas fa-clock text-amber-500 text-[11px]"></i>';
                style = 'bg-amber-50/35 text-stone-500 border border-amber-200/60';
            }

            if (isViewing) {
                style = 'bg-teal-700 text-white border border-teal-800 shadow-sm';
                badge = '<i class="fas fa-book-open text-amber-300 text-[11px]"></i>';
            }

            const dateLabel = access.shortDate
                ? `<span class="text-[10px] font-bold opacity-85 shrink-0">${access.shortDate}</span>`
                : (role === 'student' ? `<span class="text-[10px] font-bold opacity-60 shrink-0">Terkunci</span>` : '');

            sessionListHTML += `
                <a href="materi.html?month=${sidebarSelectedMonth}&week=${w}&day=${d}" class="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition ${style}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span>${badge}</span>
                        <span class="truncate">Sesi ${sNum} <span class="opacity-70 font-bold">(W${w}•D${d})</span></span>
                    </div>
                    ${dateLabel}
                </a>
            `;
            sNum++;
        });
    });

    sidebarEl.innerHTML = `
        <div class="p-4 flex justify-between items-center border-b border-stone-100">
            <a href="dashboard.html" class="flex items-center gap-2.5">
                <div class="w-10 h-10 bg-gradient-to-br from-teal-700 to-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-md shadow-teal-700/20">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <h2 class="text-sm font-extrabold text-stone-800 leading-none">Hamdi Studio</h2>
                    <p class="text-[11px] text-teal-700 font-extrabold mt-0.5">Friendly Learning Space</p>
                </div>
            </a>
            <button id="close-sidebar-btn" class="md:hidden text-stone-400 p-2 rounded-xl bg-stone-50 cursor-pointer">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <div class="p-3.5 mx-3.5 mt-3 rounded-2xl bg-gradient-to-r from-teal-50/90 to-amber-50/70 border border-teal-100/90">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 bg-gradient-to-br from-teal-700 to-emerald-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-extrabold text-stone-800 truncate">${user.name}</p>
                    <p class="text-[11px] font-extrabold text-teal-700">
                        ${stats ? `<i class="fas fa-star text-amber-500 mr-0.5"></i> Level ${stats.level} • ${stats.xp} XP` : 'Administrator'}
                    </p>
                </div>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto px-3.5 py-4 space-y-5 custom-scrollbar">
            <div class="space-y-1.5">
                ${navHTML}
            </div>

            <div>
                <div class="flex items-center justify-between px-1 mb-2">
                    <p class="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider"><i class="fas fa-map text-stone-300 mr-1"></i> Peta Pertemuan</p>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-2.5">
                    ${monthTabsHTML}
                </div>
                <div class="space-y-1.5">
                    ${sessionListHTML}
                </div>
            </div>
        </div>

        <div class="p-3.5 border-t border-stone-100">
            <button onclick="logoutUser()" class="w-full py-2.5 px-4 text-xs font-extrabold text-stone-500 hover:text-rose-600 bg-stone-100/80 hover:bg-rose-50 rounded-xl transition cursor-pointer">
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