// js/layout.js

function initLayout(pageTitle = 'Ruang Belajar') {
    if (!getSession()) return;
    renderAppHeader(pageTitle);
    renderAppSidebar();
}

function renderAppSidebar() {
    // Sembunyikan sidebar kiri lama agar tampilan menjadi lega & modern
    const sidebarEl = document.getElementById('app-sidebar');
    if (sidebarEl) sidebarEl.style.display = 'none';
    renderAppHeader();
}

function renderAppHeader() {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    const user = window.HES.currentUser;
    const role = window.HES.userRole;
    const path = window.location.pathname.split('/').pop() || 'dashboard.html';

    const timeline = role === 'student' ? getStudentCurriculumTimeline(user.email) : null;
    const stats = role === 'student' ? getStudentGamificationStats(user.email) : null;
    const cur = timeline?.currentPointer;
    const materiHref = cur ? `materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}` : 'materi.html';

    const menus = [
        { file: 'dashboard.html', href: 'dashboard.html', icon: 'fa-compass',       label: 'Beranda' },
        { file: 'materi.html',    href: materiHref,       icon: 'fa-book-open',     label: 'Belajar' },
        { file: 'exam.html',      href: 'exam.html',      icon: 'fa-trophy',        label: 'Ujian & Rapor' },
        { file: 'reschedule.html',href: 'reschedule.html',icon: 'fa-calendar-days', label: 'Atur Jadwal' }
    ];
    if (role === 'admin') {
        menus.unshift({ file: 'admin.html', href: 'admin.html', icon: 'fa-sliders', label: 'Panel Admin' });
    }

    const desktopNav = menus.map(m => {
        const active = path === m.file;
        return `
            <a href="${m.href}" class="px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold transition flex items-center gap-2 ${active ? 'bg-emerald-600 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100'}">
                <i class="fas ${m.icon} ${active ? 'text-amber-300' : 'text-stone-400'}"></i>
                <span>${m.label}</span>
            </a>
        `;
    }).join('');

    const mobileNav = menus.map(m => {
        const active = path === m.file;
        return `
            <a href="${m.href}" class="flex-1 py-2 flex flex-col items-center justify-center gap-1 text-[11px] font-extrabold ${active ? 'text-emerald-600' : 'text-stone-400'}">
                <i class="fas ${m.icon} text-base"></i>
                <span>${m.label}</span>
            </a>
        `;
    }).join('');

    headerEl.className = "bg-white/95 backdrop-blur-md border-b-2 border-[#EFECE6] px-4 md:px-8 py-3 sticky top-0 z-40";
    headerEl.innerHTML = `
        <div class="max-w-5xl mx-auto w-full flex items-center justify-between gap-4">
            <!-- Brand Logo Hangat -->
            <a href="dashboard.html" class="flex items-center gap-2.5 shrink-0">
                <div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center text-white shadow-sm">
                    <i class="fas fa-mug-hot text-sm"></i>
                </div>
                <div>
                    <h2 class="text-sm sm:text-base font-extrabold text-stone-800 leading-none">Hamdi Studio</h2>
                    <p class="text-[11px] text-emerald-600 font-bold mt-0.5">Cozy English Space</p>
                </div>
            </a>

            <!-- Menu Tengah (Desktop) -->
            <nav class="hidden md:flex items-center gap-1 bg-[#FAF6F0] p-1.5 rounded-full border border-[#E7E5E4]">
                ${desktopNav}
            </nav>

            <!-- Info Level & Tombol Keluar -->
            <div class="flex items-center gap-2.5 shrink-0">
                <div id="cloud-status-indicator" class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-stone-100 text-stone-500"></div>
                ${stats ? `
                <div class="px-3 py-1.5 rounded-full bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-extrabold flex items-center gap-1.5">
                    <span>⭐ Lv.${stats.level}</span>
                    <span class="text-amber-600">•</span>
                    <span>${stats.xp} XP</span>
                </div>` : ''}
                <button onclick="logoutUser()" title="Keluar" class="w-9 h-9 rounded-full bg-stone-100 hover:bg-red-50 text-stone-500 hover:text-red-600 flex items-center justify-center transition">
                    <i class="fas fa-power-off text-xs"></i>
                </button>
            </div>
        </div>

        <!-- Bottom Bar untuk HP -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#EFECE6] px-2 py-1 flex items-center justify-around z-50 shadow-lg">
            ${mobileNav}
        </nav>
    `;
}