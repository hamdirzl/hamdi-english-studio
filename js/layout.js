// js/layout.js

function initLayout(pageTitle = 'Portal Akademik') {
    const session = getSession();
    if (!session) return;

    renderAppHeader(pageTitle);
    renderAppSidebar();
}

function renderAppHeader(pageTitle) {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    const todayStr = getDisplayDate(new Date());

    headerEl.innerHTML = `
        <div class="flex items-center gap-3">
            <button id="open-sidebar-btn" class="md:hidden text-slate-600 hover:text-slate-900 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition">
                <i class="fas fa-bars text-sm"></i>
            </button>
            <div>
                <h1 class="text-sm md:text-base font-extrabold text-slate-800 tracking-tight">${pageTitle}</h1>
                <p class="text-[11px] font-medium text-slate-400 hidden sm:block">${todayStr}</p>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <div id="cloud-status-indicator" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                <span>Memeriksa Cloud...</span>
            </div>
        </div>
    `;

    const openBtn = document.getElementById('open-sidebar-btn');
    const overlay = document.getElementById('sidebar-overlay');
    if (openBtn) openBtn.addEventListener('click', openMobileSidebar);
    if (overlay) overlay.addEventListener('click', closeMobileSidebar);
}

function renderAppSidebar() {
    const sidebarEl = document.getElementById('app-sidebar');
    if (!sidebarEl) return;

    const user = window.HES.currentUser;
    const role = window.HES.userRole;
    const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
    const urlParams = new URLSearchParams(window.location.search);
    const activeMonthParam = urlParams.get('month');
    const activeWeekParam = urlParams.get('week');
    const activeDayParam = urlParams.get('day');

    // Cek batas maksimal bulan untuk murid
    let maxMonthNum = 1;
    if (role === 'student') {
        let p = window.HES.materials[`profile-${user.email}`];
        if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth);
    }

    // Susun daftar modul bulan
    let modulesHTML = '';
    window.HES.months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = role === 'student' && currentMonthNum > maxMonthNum;
        const isMonthOpen = activeMonthParam === month.id;

        if (isLocked) {
            modulesHTML += `
                <div onclick="showToast('Modul ${month.title} masih terkunci. Silakan hubungi Admin.', 'info')" class="px-3 py-2.5 flex items-center justify-between text-slate-400 font-medium text-xs cursor-not-allowed opacity-70 rounded-xl hover:bg-slate-50">
                    <div class="flex items-center gap-2.5">
                        <i class="fas fa-lock w-4 text-center text-slate-300"></i>
                        <span>${month.title}</span>
                    </div>
                    <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">Terkunci</span>
                </div>
            `;
        } else {
            let weeksHTML = '';
            month.weeks.forEach(week => {
                const isWeekOpen = isMonthOpen && String(activeWeekParam) === String(week);
                let daysHTML = [1, 2, 3].map(day => {
                    const isDayActive = currentPath === 'materi.html' && isWeekOpen && String(activeDayParam) === String(day);
                    return `
                        <a href="materi.html?month=${month.id}&week=${week}&day=${day}" class="px-3 py-2 text-xs font-semibold rounded-lg flex items-center transition-colors ${isDayActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-50'}">
                            <span class="w-1.5 h-1.5 rounded-full ${isDayActive ? 'bg-indigo-600' : 'bg-slate-300'} mr-2.5"></span>
                            Day ${day}
                        </a>
                    `;
                }).join('');

                weeksHTML += `
                    <div>
                        <button type="button" onclick="toggleSidebarSubmenu('w-${month.id}-${week}', this)" class="w-full px-3 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 flex justify-between items-center rounded-lg hover:bg-slate-50 transition">
                            <span>Week ${week}</span>
                            <i class="fas fa-angle-down text-[10px] transition-transform ${isWeekOpen ? 'rotate-180' : ''}"></i>
                        </button>
                        <div id="w-${month.id}-${week}" class="${isWeekOpen ? '' : 'hidden'} pl-2 py-1 space-y-0.5">
                            ${daysHTML}
                        </div>
                    </div>
                `;
            });

            const isExamActive = currentPath === 'exam.html' && isMonthOpen;

            modulesHTML += `
                <div>
                    <button type="button" onclick="toggleSidebarSubmenu('m-${month.id}', this)" class="w-full px-3 py-2.5 flex justify-between items-center rounded-xl hover:bg-slate-50 transition text-slate-700 font-bold text-xs ${isMonthOpen ? 'bg-slate-50/80 text-indigo-600' : ''}">
                        <div class="flex items-center gap-2.5">
                            <i class="far fa-folder-open w-4 text-center text-indigo-500"></i>
                            <span>${month.title}</span>
                        </div>
                        <i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform ${isMonthOpen ? 'rotate-180' : ''}"></i>
                    </button>
                    <div id="m-${month.id}" class="${isMonthOpen ? '' : 'hidden'} pl-4 py-1 space-y-1 border-l-2 border-slate-100 ml-4 my-1">
                        ${weeksHTML}
                        <a href="exam.html?month=${month.id}" class="px-3 py-2 mx-1 mt-1.5 text-xs font-bold rounded-lg flex items-center transition-colors border ${isExamActive ? 'bg-amber-100 text-amber-800 border-amber-300' : 'text-amber-700 bg-amber-50/80 hover:bg-amber-100 border-amber-100'}">
                            <i class="fas fa-star mr-2 text-amber-500"></i> Final Exam
                        </a>
                    </div>
                </div>
            `;
        }
    });

    const navItemClass = (targetFile) => {
        const active = currentPath === targetFile;
        return active
            ? 'w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200 transition-all'
            : 'w-full flex items-center px-3 py-2.5 text-xs font-semibold rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors group';
    };

    const navIconClass = (targetFile) => {
        const active = currentPath === targetFile;
        return active
            ? 'w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center mr-3 text-white'
            : 'w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-3 text-slate-500 group-hover:text-indigo-600 transition-colors';
    };

    sidebarEl.innerHTML = `
        <!-- Brand Header -->
        <div class="p-5 flex justify-between items-center border-b border-slate-100">
            <a href="dashboard.html" class="flex items-center gap-3">
                <div class="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-200">
                    <i class="fas fa-graduation-cap text-white text-sm"></i>
                </div>
                <div>
                    <h2 class="text-sm font-extrabold text-slate-800 tracking-tight leading-none">Hamdi Studio</h2>
                    <p class="text-[10px] uppercase tracking-widest text-indigo-600 font-bold mt-1">Premium Class</p>
                </div>
            </a>
            <button id="close-sidebar-btn" class="md:hidden text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-lg">
                <i class="fas fa-times text-xs"></i>
            </button>
        </div>

        <!-- User Profile Box -->
        <div class="p-3.5 mx-4 mt-4 rounded-2xl bg-slate-50 border border-slate-200/70">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-extrabold text-sm shadow-xs shrink-0">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="flex-1 overflow-hidden">
                    <p class="text-xs font-extrabold text-slate-800 truncate">${user.name}</p>
                    <p class="text-[11px] font-semibold text-indigo-600 truncate">${role === 'admin' ? 'Administrator' : 'Premium Member'}</p>
                </div>
            </div>
        </div>

        <!-- Menu Navigasi -->
        <div class="overflow-y-auto flex-1 p-4 custom-scrollbar">
            <div class="space-y-1">
                <p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 pl-3">Menu Utama</p>
                
                ${role === 'admin' ? `
                <a href="admin.html" class="${navItemClass('admin.html')}">
                    <div class="${navIconClass('admin.html')}"><i class="fas fa-sliders text-xs"></i></div>
                    <span>Administrative CMS</span>
                </a>
                ` : ''}

                <a href="dashboard.html" class="${navItemClass('dashboard.html')}">
                    <div class="${navIconClass('dashboard.html')}"><i class="fas fa-home text-xs"></i></div>
                    <span>Dashboard</span>
                </a>

                <a href="reschedule.html" class="${navItemClass('reschedule.html')}">
                    <div class="${navIconClass('reschedule.html')}"><i class="fas fa-calendar-alt text-xs"></i></div>
                    <span>Reschedule Jadwal</span>
                </a>
            </div>

            <div class="mt-6 mb-4">
                <p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 pl-3">Kurikulum & Modul</p>
                <div class="space-y-1">
                    ${modulesHTML}
                </div>
            </div>
        </div>

        <!-- Tombol Keluar -->
        <div class="p-4 border-t border-slate-100">
            <button onclick="logoutUser()" class="w-full flex items-center justify-center p-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-2xs">
                <i class="fas fa-sign-out-alt mr-2"></i> Keluar dari Portal
            </button>
        </div>
    `;

    const closeBtn = document.getElementById('close-sidebar-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);
}

window.toggleSidebarSubmenu = function(id, btnEl) {
    const target = document.getElementById(id);
    if (!target) return;
    const icon = btnEl.querySelector('.fa-chevron-down, .fa-angle-down');
    if (target.classList.contains('hidden')) {
        target.classList.remove('hidden');
        if (icon) icon.classList.add('rotate-180');
    } else {
        target.classList.add('hidden');
        if (icon) icon.classList.remove('rotate-180');
    }
};

function openMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('-translate-x-full');
    if (overlay) overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
}