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
        btn.innerHTML = isCollapsed
            ? `<i class="fas fa-compress-alt mr-1.5"></i> Tampilkan Sidebar`
            : `<i class="fas fa-expand-alt mr-1.5"></i> Mode Layar Penuh`;
    });
}

function renderAppHeader(pageTitle) {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    const isCollapsed = document.body.classList.contains('hes-sidebar-collapsed');

    headerEl.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <!-- Tombol Buka Sidebar (HP) -->
            <button id="open-sidebar-btn" class="md:hidden text-indigo-600 p-2.5 bg-indigo-50 rounded-xl font-bold cursor-pointer">
                <i class="fas fa-bars"></i>
            </button>
            <!-- Tombol Sembunyikan/Tampilkan Sidebar (Laptop/Desktop) -->
            <button id="desktop-sidebar-toggle-btn" onclick="toggleDesktopSidebar()" title="${isCollapsed ? 'Tampilkan Sidebar' : 'Sembunyikan Sidebar (Mode Lebar)'}" class="hidden md:inline-flex items-center justify-center w-9 h-9 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-xl font-bold transition cursor-pointer">
                <i class="fas ${isCollapsed ? 'fa-indent' : 'fa-outdent'}"></i>
            </button>
            <div class="truncate">
                <h1 class="text-base sm:text-lg font-black text-slate-800 truncate">${pageTitle}</h1>
                <p class="text-xs font-bold text-slate-400 hidden sm:block">${getDisplayDate(new Date())}</p>
            </div>
        </div>
        <div class="flex items-center gap-2.5">
            <div id="cloud-status-indicator" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                <span class="w-2 h-2 rounded-full bg-slate-400"></span>
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

    const materiHref = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

    const menus = [
        { file: 'dashboard.html', href: 'dashboard.html', icon: '<i class="fas fa-home"></i>', label: 'Beranda' },
        { file: 'materi.html',    href: materiHref,       icon: '<i class="fas fa-book-open"></i>', label: 'Ruang Belajar' },
        { file: 'exam.html',      href: `exam.html?month=${sidebarSelectedMonth}`, icon: '<i class="fas fa-award"></i>', label: 'Ujian & Rapor' },
        { file: 'reschedule.html',href: 'reschedule.html',icon: '<i class="fas fa-calendar-alt"></i>', label: 'Pindah Jadwal' }
    ];
    if (role === 'admin') {
        menus.unshift({ file: 'admin.html', href: 'admin.html', icon: '<i class="fas fa-sliders-h"></i>', label: 'Panel Admin' });
    }

    const navHTML = menus.map(m => {
        const active = path === m.file;
        return `
            <a href="${m.href}" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all ${active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}">
                <span class="text-lg w-5 text-center">${m.icon}</span>
                <span>${m.label}</span>
            </a>
        `;
    }).join('');

    const monthTabsHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonth;
        const active = m.id === sidebarSelectedMonth;
        if (locked) {
            return `<button onclick="showToast('${m.title} masih terkunci', 'info')" class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-400"><i class="fas fa-lock mr-1"></i> M${mNum}</button>`;
        }
        return `<button onclick="switchSidebarMonth('${m.id}')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}">${m.title}</button>`;
    }).join('');

    let sessionListHTML = '';
    let sNum = 1;
    [1, 2, 3, 4].forEach(w => {
        [1, 2, 3].forEach(d => {
            const dInfo = timeline?.days[`${sidebarSelectedMonth}-w${w}-d${d}`];
            const st = dInfo?.status || 'upcoming';
            const isViewing = path === 'materi.html' && params.get('month') === sidebarSelectedMonth && params.get('week') == w && params.get('day') == d;

            let badge = '<i class="far fa-circle text-slate-300"></i>';
            let style = 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300';
            
            if (st === 'completed') {
                badge = '<i class="fas fa-check-circle text-emerald-500"></i>';
                style = 'bg-emerald-50/50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100';
            } else if (st === 'current') {
                badge = '<i class="fas fa-play-circle text-amber-500"></i>';
                style = 'bg-amber-50 text-amber-900 border border-amber-300 font-extrabold';
            }
            if (isViewing) {
                style = 'bg-indigo-600 text-white border border-indigo-700 shadow-sm';
                badge = '<i class="fas fa-play-circle text-white"></i>';
            }

            sessionListHTML += `
                <a href="materi.html?month=${sidebarSelectedMonth}&week=${w}&day=${d}" class="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition ${style}">
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
                <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
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

        <div class="p-3.5 mx-3.5 mt-3 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black text-sm shrink-0">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-black text-slate-800 truncate">${user.name}</p>
                    <p class="text-[11px] font-extrabold text-indigo-600">
                        ${stats ? `<i class="fas fa-star text-amber-500 mr-0.5"></i> Level ${stats.level} • ${stats.xp} XP` : 'Administrator'}
                    </p>
                </div>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto px-3.5 py-4 space-y-5 custom-scrollbar">
            <div class="space-y-1">
                ${navHTML}
            </div>

            <div>
                <div class="flex items-center justify-between px-1 mb-2">
                    <p class="text-[11px] font-black text-slate-400 uppercase tracking-wider"><i class="fas fa-map text-slate-300 mr-1"></i> Peta Pertemuan</p>
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
            <button onclick="logoutUser()" class="w-full py-2.5 px-4 text-xs font-extrabold text-slate-500 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-xl transition cursor-pointer">
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