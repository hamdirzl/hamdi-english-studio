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
        <div class="flex items-center gap-2.5 min-w-0">
            <button id="open-sidebar-btn" class="md:hidden text-slate-600 hover:text-slate-900 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition shrink-0">
                <i class="fas fa-bars text-sm"></i>
            </button>
            <div class="truncate">
                <h1 class="text-xs sm:text-sm md:text-base font-extrabold text-slate-800 tracking-tight truncate">${pageTitle}</h1>
                <p class="text-[11px] font-medium text-slate-400 hidden sm:block">${todayStr}</p>
            </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
            <div id="cloud-status-indicator" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Memeriksa...</span>
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

    // Jika Admin sedang berada di halaman admin.html, gunakan murid yang sedang dipilih untuk pratinjau tanggal di sidebar
    let targetEmailForTimeline = user.email;
    let maxMonthNum = 99;

    if (role === 'student') {
        let p = window.HES.materials[`profile-${user.email}`];
        if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth);
    } else if (role === 'admin') {
        const adminStuSelect = document.getElementById('admin-sched-student');
        if (adminStuSelect && adminStuSelect.value) {
            targetEmailForTimeline = adminStuSelect.value;
        } else if (window.HES.students.length > 0) {
            targetEmailForTimeline = window.HES.students[0].email;
        }
    }

    const timeline = getStudentCurriculumTimeline(targetEmailForTimeline);

    // Widget Mini Live Tracker di Sidebar
    let trackerSummaryHTML = '';
    if (timeline && timeline.currentPointer) {
        const cur = timeline.currentPointer;
        const nxt = timeline.nextPointer;
        trackerSummaryHTML = `
            <div class="mx-4 mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white shadow-2xs hover:bg-emerald-600 transition">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0"></span>
                        <span class="text-[11px] font-extrabold truncate">Di Sini: M${cur.monthId.replace('m', '')}•W${cur.week}•D${cur.day}</span>
                    </div>
                    <span class="text-[10px] font-bold bg-black/15 px-1.5 py-0.5 rounded shrink-0 ml-1">${cur.shortDate}</span>
                </a>
                ${nxt ? `
                <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100/70 transition">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <i class="fas fa-forward text-[9px] text-amber-500 shrink-0"></i>
                        <span class="text-[10px] font-bold truncate">Esok: M${nxt.monthId.replace('m', '')}•W${nxt.week}•D${nxt.day}</span>
                    </div>
                    <span class="text-[10px] font-extrabold text-amber-700 shrink-0 ml-1">${nxt.shortDate}</span>
                </a>
                ` : ''}
            </div>
        `;
    }

    // Susun daftar modul bulan (1 baris rapi per item)
    let modulesHTML = '';
    window.HES.months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = role === 'student' && currentMonthNum > maxMonthNum;

        const mInfo = (timeline && timeline.months[month.id]) ? timeline.months[month.id] : null;
        const mStatus = mInfo ? mInfo.status : 'upcoming';
        const isMonthOpen = activeMonthParam
            ? (activeMonthParam === month.id)
            : (mStatus === 'current');

        if (isLocked) {
            modulesHTML += `
                <div onclick="showToast('Modul ${month.title} masih terkunci. Silakan hubungi Admin.', 'info')" class="px-3 py-2 flex items-center justify-between text-slate-400 font-medium text-xs cursor-not-allowed opacity-70 rounded-xl hover:bg-slate-50">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-lock w-4 text-center text-slate-300 text-[11px]"></i>
                        <span>${month.title}</span>
                    </div>
                    <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">Terkunci</span>
                </div>
            `;
        } else {
            let monthBoxClass = 'hover:bg-slate-50 text-slate-700';
            let monthIconClass = 'far fa-folder-open text-indigo-500';
            let monthBadgeHTML = '';

            if (mStatus === 'current') {
                monthBoxClass = 'bg-emerald-50/80 text-emerald-900 border border-emerald-200/80';
                monthIconClass = 'fas fa-folder-open text-emerald-600';
                monthBadgeHTML = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white shrink-0">Aktif</span>`;
            } else if (mStatus === 'completed') {
                monthBoxClass = 'bg-slate-50/90 text-slate-500 border border-slate-200/60 hover:bg-slate-100';
                monthIconClass = 'fas fa-check-circle text-emerald-500';
                monthBadgeHTML = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Selesai</span>`;
            } else if (mStatus === 'next') {
                monthBoxClass = 'bg-amber-50/60 text-amber-900 border border-amber-200/60';
                monthIconClass = 'fas fa-folder text-amber-500';
                monthBadgeHTML = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white shrink-0">Esok</span>`;
            } else if (isMonthOpen) {
                monthBoxClass = 'bg-slate-50 text-indigo-600';
            }

            let weeksHTML = '';
            month.weeks.forEach(week => {
                const wKey = `${month.id}-w${week}`;
                const wInfo = (timeline && timeline.weeks[wKey]) ? timeline.weeks[wKey] : null;
                const wStatus = wInfo ? wInfo.status : 'upcoming';

                const isWeekOpen = (activeMonthParam === month.id && String(activeWeekParam) === String(week))
                    || (!activeWeekParam && wStatus === 'current');

                let weekBtnClass = 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50';
                let weekStatusPill = '';

                if (wStatus === 'current') {
                    weekBtnClass = 'bg-emerald-50/90 text-emerald-800 font-extrabold border border-emerald-200/70';
                    weekStatusPill = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>`;
                } else if (wStatus === 'completed') {
                    weekBtnClass = 'text-slate-500 hover:bg-slate-50';
                    weekStatusPill = `<i class="fas fa-check text-emerald-500 text-[9px] shrink-0"></i>`;
                } else if (wStatus === 'next') {
                    weekBtnClass = 'bg-amber-50/70 text-amber-800 font-bold border border-amber-200/60';
                    weekStatusPill = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>`;
                }

                let daysHTML = [1, 2, 3].map(day => {
                    const dKey = `${month.id}-w${week}-d${day}`;
                    const dInfo = (timeline && timeline.days[dKey]) ? timeline.days[dKey] : null;
                    const dStatus = dInfo ? dInfo.status : 'upcoming';
                    const isDayActive = currentPath === 'materi.html'
                        && activeMonthParam === month.id
                        && String(activeWeekParam) === String(week)
                        && String(activeDayParam) === String(day);

                    let dayItemClass = 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50';
                    let leftIndicator = `<span class="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span>`;
                    let rightBadge = dInfo && dInfo.shortDate
                        ? `<span class="text-[10px] font-medium text-slate-400 shrink-0">${dInfo.shortDate}</span>`
                        : '';

                    if (dStatus === 'current') {
                        dayItemClass = isDayActive
                            ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 hover:bg-emerald-100/70 font-extrabold';
                        leftIndicator = `<span class="w-2 h-2 rounded-full ${isDayActive ? 'bg-white' : 'bg-emerald-500'} animate-pulse shrink-0"></span>`;
                        rightBadge = `
                            <div class="flex items-center gap-1 shrink-0">
                                ${dInfo && dInfo.shortDate ? `<span class="text-[10px] font-bold ${isDayActive ? 'text-emerald-100' : 'text-emerald-700'}">${dInfo.shortDate}</span>` : ''}
                                <span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isDayActive ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'}">Di Sini</span>
                            </div>
                        `;
                    } else if (dStatus === 'next') {
                        dayItemClass = isDayActive
                            ? 'bg-amber-500 text-white shadow-xs font-extrabold'
                            : 'bg-amber-50/80 text-amber-900 border border-amber-200/90 hover:bg-amber-100/70 font-bold';
                        leftIndicator = `<span class="w-2 h-2 rounded-full ${isDayActive ? 'bg-white' : 'bg-amber-500'} shrink-0"></span>`;
                        rightBadge = `
                            <div class="flex items-center gap-1 shrink-0">
                                ${dInfo && dInfo.shortDate ? `<span class="text-[10px] font-bold ${isDayActive ? 'text-amber-100' : 'text-amber-700'}">${dInfo.shortDate}</span>` : ''}
                                <span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isDayActive ? 'bg-white text-amber-700' : 'bg-amber-500 text-white'}">Esok</span>
                            </div>
                        `;
                    } else if (dStatus === 'completed') {
                        dayItemClass = isDayActive
                            ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-50';
                        leftIndicator = `<i class="fas fa-check ${isDayActive ? 'text-white' : 'text-emerald-500'} text-[9px] shrink-0"></i>`;
                        rightBadge = dInfo && dInfo.shortDate
                            ? `<span class="text-[10px] font-medium ${isDayActive ? 'text-indigo-100' : 'text-slate-400'} shrink-0">${dInfo.shortDate}</span>`
                            : '';
                    } else if (isDayActive) {
                        dayItemClass = 'bg-indigo-600 text-white font-bold shadow-2xs';
                        leftIndicator = `<span class="w-1.5 h-1.5 rounded-full bg-white shrink-0"></span>`;
                        rightBadge = dInfo && dInfo.shortDate
                            ? `<span class="text-[10px] font-medium text-indigo-100 shrink-0">${dInfo.shortDate}</span>`
                            : '';
                    }

                    return `
                        <a href="materi.html?month=${month.id}&week=${week}&day=${day}" class="px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between gap-2 transition-all ${dayItemClass}">
                            <div class="flex items-center gap-2 min-w-0">
                                ${leftIndicator}
                                <span class="truncate">Day ${day}</span>
                            </div>
                            ${rightBadge}
                        </a>
                    `;
                }).join('');

                weeksHTML += `
                    <div>
                        <button type="button" onclick="toggleSidebarSubmenu('w-${month.id}-${week}', this)" class="w-full px-2.5 py-1.5 text-xs font-bold flex justify-between items-center rounded-lg transition ${weekBtnClass}">
                            <div class="flex items-center gap-1.5 min-w-0">
                                ${weekStatusPill}
                                <span class="truncate">Week ${week}</span>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                ${wInfo && wInfo.rangeText ? `<span class="text-[10px] font-semibold opacity-75">${wInfo.rangeText}</span>` : ''}
                                <i class="fas fa-angle-down text-[10px] transition-transform ${isWeekOpen ? 'rotate-180' : ''}"></i>
                            </div>
                        </button>
                        <div id="w-${month.id}-${week}" class="${isWeekOpen ? '' : 'hidden'} pl-2 pt-1 pb-1 space-y-1">
                            ${daysHTML}
                        </div>
                    </div>
                `;
            });

            const isExamActive = currentPath === 'exam.html' && activeMonthParam === month.id;

            modulesHTML += `
                <div>
                    <button type="button" onclick="toggleSidebarSubmenu('m-${month.id}', this)" class="w-full px-3 py-2 flex justify-between items-center rounded-xl transition font-bold text-xs ${monthBoxClass}">
                        <div class="flex items-center gap-2 min-w-0">
                            <i class="${monthIconClass} w-4 text-center shrink-0"></i>
                            <span class="truncate">${month.title}</span>
                            ${monthBadgeHTML}
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            ${mInfo && mInfo.rangeText ? `<span class="text-[10px] font-semibold opacity-75">${mInfo.rangeText}</span>` : ''}
                            <i class="fas fa-chevron-down text-[10px] opacity-60 transition-transform ${isMonthOpen ? 'rotate-180' : ''}"></i>
                        </div>
                    </button>
                    <div id="m-${month.id}" class="${isMonthOpen ? '' : 'hidden'} pl-2.5 py-1 space-y-1 border-l-2 border-slate-100 ml-3.5 my-1">
                        ${weeksHTML}
                        <a href="exam.html?month=${month.id}" class="px-2.5 py-1.5 mt-1 text-xs font-bold rounded-lg flex items-center transition-colors border ${isExamActive ? 'bg-amber-500 text-white border-amber-600' : 'text-amber-700 bg-amber-50/70 hover:bg-amber-100 border-amber-200/80'}">
                            <i class="fas fa-star mr-2 ${isExamActive ? 'text-white' : 'text-amber-500'} text-[11px]"></i> Final Exam
                        </a>
                    </div>
                </div>
            `;
        }
    });

    const navItemClass = (targetFile) => {
        const active = currentPath === targetFile;
        return active
            ? 'w-full flex items-center px-3 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200 transition-all'
            : 'w-full flex items-center px-3 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors group';
    };

    const navIconClass = (targetFile) => {
        const active = currentPath === targetFile;
        return active
            ? 'w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center mr-2.5 text-white shrink-0'
            : 'w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mr-2.5 text-slate-500 group-hover:text-indigo-600 transition-colors shrink-0';
    };

    sidebarEl.innerHTML = `
        <!-- Brand Header -->
        <div class="p-4 sm:p-5 flex justify-between items-center border-b border-slate-100">
            <a href="dashboard.html" class="flex items-center gap-2.5">
                <div class="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-200">
                    <i class="fas fa-graduation-cap text-white text-xs sm:text-sm"></i>
                </div>
                <div>
                    <h2 class="text-xs sm:text-sm font-extrabold text-slate-800 tracking-tight leading-none">Hamdi Studio</h2>
                    <p class="text-[9px] sm:text-[10px] uppercase tracking-widest text-indigo-600 font-bold mt-1">Premium Class</p>
                </div>
            </a>
            <button id="close-sidebar-btn" class="md:hidden text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-lg">
                <i class="fas fa-times text-xs"></i>
            </button>
        </div>

        <!-- User Profile Box -->
        <div class="p-3 mx-4 mt-3 rounded-xl bg-slate-50 border border-slate-200/70">
            <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-extrabold text-xs shadow-2xs shrink-0">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="flex-1 overflow-hidden">
                    <p class="text-xs font-extrabold text-slate-800 truncate">${user.name}</p>
                    <p class="text-[10px] font-semibold text-indigo-600 truncate">${role === 'admin' ? 'Administrator' : 'Premium Member'}</p>
                </div>
            </div>
        </div>

        ${trackerSummaryHTML}

        <!-- Menu Navigasi -->
        <div class="overflow-y-auto flex-1 p-3.5 sm:p-4 custom-scrollbar">
            <div class="space-y-1">
                <p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 pl-2">Menu Utama</p>
                
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

            <div class="mt-5 mb-3">
                <div class="flex items-center justify-between mb-1.5 px-2">
                    <p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Kurikulum & Jadwal</p>
                    <div class="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Di Sini</span>
                        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Esok</span>
                    </div>
                </div>
                <div class="space-y-1">
                    ${modulesHTML}
                </div>
            </div>
        </div>

        <!-- Tombol Keluar -->
        <div class="p-3.5 border-t border-slate-100">
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