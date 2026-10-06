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

    // Cek batas maksimal bulan & timeline kurikulum untuk murid
    let maxMonthNum = 1;
    let timeline = null;
    if (role === 'student') {
        let p = window.HES.materials[`profile-${user.email}`];
        if (p && p.maxMonth) maxMonthNum = parseInt(p.maxMonth);
        timeline = getStudentCurriculumTimeline(user.email);
    }

    // Widget Mini Live Tracker di Sidebar (Khusus Murid)
    let trackerSummaryHTML = '';
    if (role === 'student' && timeline && timeline.currentPointer) {
        const cur = timeline.currentPointer;
        const nxt = timeline.nextPointer;
        trackerSummaryHTML = `
            <div class="mx-4 mt-3 p-3 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/70 to-amber-50/50 border border-emerald-200/80 shadow-2xs">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 bg-white/90 px-2 py-0.5 rounded-full border border-emerald-200">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                        ${cur.isTodayClass ? 'Kelas Hari Ini' : 'Posisi Belajar'}
                    </span>
                    <span class="text-[10px] font-bold text-emerald-700">${cur.shortDate}</span>
                </div>
                <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="block group">
                    <p class="text-xs font-extrabold text-slate-800 group-hover:text-emerald-700 transition">
                        ${cur.monthTitle} • Week ${cur.week} • Day ${cur.day}
                    </p>
                </a>
                ${nxt ? `
                <div class="mt-2 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[10px]">
                    <span class="font-bold text-amber-700 flex items-center gap-1">
                        <i class="fas fa-forward text-[9px] text-amber-500"></i> Selanjutnya:
                    </span>
                    <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="font-extrabold text-amber-800 hover:underline">
                        W${nxt.week} D${nxt.day} (${nxt.shortDate})
                    </a>
                </div>
                ` : ''}
            </div>
        `;
    }

    // Susun daftar modul bulan beserta tanggal dan warna pelacak
    let modulesHTML = '';
    window.HES.months.forEach((month) => {
        const currentMonthNum = parseInt(month.id.replace('m', ''));
        const isLocked = role === 'student' && currentMonthNum > maxMonthNum;

        const mInfo = (timeline && timeline.months[month.id]) ? timeline.months[month.id] : null;
        const mStatus = mInfo ? mInfo.status : 'upcoming';
        const isMonthOpen = activeMonthParam
            ? (activeMonthParam === month.id)
            : (mStatus === 'current' || mStatus === 'next');

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
            // Styling Month berdasarkan status (Sedang Di Sini vs Selanjutnya)
            let monthBoxClass = 'hover:bg-slate-50 text-slate-700 border border-transparent';
            let monthIconClass = 'far fa-folder-open text-indigo-500';
            let monthPillHTML = '';

            if (mStatus === 'current') {
                monthBoxClass = 'bg-emerald-50/70 hover:bg-emerald-50 text-emerald-950 border border-emerald-200/80 shadow-2xs';
                monthIconClass = 'fas fa-folder-open text-emerald-600';
                monthPillHTML = `<span class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-white shrink-0">Aktif</span>`;
            } else if (mStatus === 'next') {
                monthBoxClass = 'bg-amber-50/70 hover:bg-amber-50 text-amber-950 border border-amber-200/80';
                monthIconClass = 'fas fa-folder text-amber-500';
                monthPillHTML = `<span class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 shrink-0">Berikutnya</span>`;
            } else if (isMonthOpen) {
                monthBoxClass = 'bg-slate-50/90 text-indigo-600 border border-slate-200/70';
            }

            let weeksHTML = '';
            month.weeks.forEach(week => {
                const wKey = `${month.id}-w${week}`;
                const wInfo = (timeline && timeline.weeks[wKey]) ? timeline.weeks[wKey] : null;
                const wStatus = wInfo ? wInfo.status : 'upcoming';

                const isWeekOpen = (activeMonthParam === month.id && String(activeWeekParam) === String(week))
                    || (!activeWeekParam && (wStatus === 'current' || wStatus === 'next'));

                let weekBtnClass = 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50 border border-transparent';
                let weekBadgeHTML = '';

                if (wStatus === 'current') {
                    weekBtnClass = 'bg-emerald-50/90 text-emerald-900 border border-emerald-200 font-extrabold';
                    weekBadgeHTML = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-300">Minggu Ini</span>`;
                } else if (wStatus === 'next') {
                    weekBtnClass = 'bg-amber-50/80 text-amber-900 border border-amber-200 font-extrabold';
                    weekBadgeHTML = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">Selanjutnya</span>`;
                }

                let daysHTML = [1, 2, 3].map(day => {
                    const dKey = `${month.id}-w${week}-d${day}`;
                    const dInfo = (timeline && timeline.days[dKey]) ? timeline.days[dKey] : null;
                    const dStatus = dInfo ? dInfo.status : 'upcoming';
                    const isDayActive = currentPath === 'materi.html'
                        && activeMonthParam === month.id
                        && String(activeWeekParam) === String(week)
                        && String(activeDayParam) === String(day);

                    let dayItemClass = 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50 border border-transparent';
                    let dotHtml = `<span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2 shrink-0"></span>`;
                    let statusTagHtml = '';
                    let dateTextClass = 'text-slate-400';

                    if (dStatus === 'current') {
                        // Warna HIJAU EMERALD untuk pertemuan tempat kita berada sekarang
                        dayItemClass = isDayActive
                            ? 'bg-emerald-600 text-white border border-emerald-700 shadow-sm shadow-emerald-200'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100/80';
                        dotHtml = `<span class="w-2 h-2 rounded-full ${isDayActive ? 'bg-white' : 'bg-emerald-500'} animate-pulse mr-2 shrink-0"></span>`;
                        statusTagHtml = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isDayActive ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}">Sedang Di Sini</span>`;
                        dateTextClass = isDayActive ? 'text-emerald-100' : 'text-emerald-700';
                    } else if (dStatus === 'next') {
                        // Warna KUNING AMBER untuk pertemuan selanjutnya
                        dayItemClass = isDayActive
                            ? 'bg-amber-500 text-white border border-amber-600 shadow-sm shadow-amber-200'
                            : 'bg-amber-50/90 text-amber-900 border border-amber-300 hover:bg-amber-100/80';
                        dotHtml = `<span class="w-2 h-2 rounded-full ${isDayActive ? 'bg-white' : 'bg-amber-500'} mr-2 shrink-0"></span>`;
                        statusTagHtml = `<span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isDayActive ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'}">Selanjutnya</span>`;
                        dateTextClass = isDayActive ? 'text-amber-100' : 'text-amber-700';
                    } else if (dStatus === 'completed') {
                        // Selesai
                        dayItemClass = isDayActive
                            ? 'bg-indigo-600 text-white border border-indigo-700 shadow-xs'
                            : 'bg-slate-50/70 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200/60';
                        dotHtml = `<i class="fas fa-check-circle ${isDayActive ? 'text-white' : 'text-emerald-500'} text-[10px] mr-2 shrink-0"></i>`;
                        dateTextClass = isDayActive ? 'text-indigo-100' : 'text-slate-400';
                    } else if (isDayActive) {
                        dayItemClass = 'bg-indigo-600 text-white border border-indigo-700 shadow-xs';
                        dotHtml = `<span class="w-1.5 h-1.5 rounded-full bg-white mr-2 shrink-0"></span>`;
                        dateTextClass = 'text-indigo-100';
                    }

                    return `
                        <a href="materi.html?month=${month.id}&week=${week}&day=${day}" class="px-2.5 py-2 text-xs font-bold rounded-xl flex items-center justify-between transition-all ${dayItemClass}">
                            <div class="flex items-center min-w-0">
                                ${dotHtml}
                                <div class="truncate">
                                    <div class="flex items-center gap-1.5">
                                        <span>Day ${day}</span>
                                        ${statusTagHtml}
                                    </div>
                                    ${dInfo && dInfo.shortDate ? `<p class="text-[10px] font-semibold ${dateTextClass} leading-tight mt-0.5">${dInfo.shortDate}</p>` : ''}
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-[9px] opacity-50 ml-1 shrink-0"></i>
                        </a>
                    `;
                }).join('');

                weeksHTML += `
                    <div class="space-y-1">
                        <button type="button" onclick="toggleSidebarSubmenu('w-${month.id}-${week}', this)" class="w-full px-2.5 py-2 text-xs font-bold flex justify-between items-center rounded-xl transition ${weekBtnClass}">
                            <div class="text-left">
                                <div class="flex items-center gap-1.5">
                                    <span>Week ${week}</span>
                                    ${weekBadgeHTML}
                                </div>
                                ${wInfo && wInfo.rangeText ? `<p class="text-[10px] font-semibold text-slate-400 mt-0.5"><i class="far fa-calendar-alt mr-1"></i>${wInfo.rangeText}</p>` : ''}
                            </div>
                            <i class="fas fa-angle-down text-[10px] transition-transform ${isWeekOpen ? 'rotate-180' : ''}"></i>
                        </button>
                        <div id="w-${month.id}-${week}" class="${isWeekOpen ? '' : 'hidden'} pl-2 py-1 space-y-1.5">
                            ${daysHTML}
                        </div>
                    </div>
                `;
            });

            const isExamActive = currentPath === 'exam.html' && activeMonthParam === month.id;

            modulesHTML += `
                <div class="space-y-1">
                    <button type="button" onclick="toggleSidebarSubmenu('m-${month.id}', this)" class="w-full px-3 py-2.5 flex justify-between items-center rounded-xl transition font-bold text-xs ${monthBoxClass}">
                        <div class="flex items-center gap-2.5 text-left min-w-0">
                            <i class="${monthIconClass} w-4 text-center shrink-0"></i>
                            <div class="truncate">
                                <div class="flex items-center gap-1.5">
                                    <span>${month.title}</span>
                                    ${monthPillHTML}
                                </div>
                                ${mInfo && mInfo.rangeText ? `<p class="text-[10px] font-semibold text-slate-400 mt-0.5">${mInfo.rangeText}</p>` : ''}
                            </div>
                        </div>
                        <i class="fas fa-chevron-down text-[10px] text-slate-400 transition-transform shrink-0 ml-1 ${isMonthOpen ? 'rotate-180' : ''}"></i>
                    </button>
                    <div id="m-${month.id}" class="${isMonthOpen ? '' : 'hidden'} pl-3 py-1 space-y-1.5 border-l-2 border-slate-200/70 ml-3.5 my-1">
                        ${weeksHTML}
                        <a href="exam.html?month=${month.id}" class="px-3 py-2 mt-1.5 text-xs font-bold rounded-xl flex items-center transition-colors border ${isExamActive ? 'bg-purple-600 text-white border-purple-700 shadow-xs' : 'text-purple-700 bg-purple-50/80 hover:bg-purple-100 border-purple-200'}">
                            <i class="fas fa-star mr-2 ${isExamActive ? 'text-amber-300' : 'text-purple-500'}"></i> Final Exam
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

        ${trackerSummaryHTML}

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
                <div class="flex items-center justify-between mb-2 px-3">
                    <p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Kurikulum & Jadwal</p>
                </div>
                <div class="space-y-1.5">
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