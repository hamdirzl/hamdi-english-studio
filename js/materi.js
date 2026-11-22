// js/materi.js

let activeMateriState = { monthId: 'm1', week: 1, day: 1 };
let activeMateriMode = 'presentation';
let parsedHandoutCache = { presentation: null, recap: null };
let isCurrentSessionUnlocked = false;

// State Alat Mengajar Floating (Hanya Aktif di PC / Desktop >= 768px)
let handoutZoomLevel = parseInt(localStorage.getItem('hes_handout_zoom')) || 80;
let sideDockMinimized = false;
let annotationState = { active: false, tool: 'pen', color: '#E11D48', size: 3 };
let notepadState = {
    fontSize: parseInt(localStorage.getItem('hes_notepad_fontsize')) || 20,
    color: localStorage.getItem('hes_notepad_color') || '#0F172A',
    expanded: false
};
let paperResizeObservers = {};

if (!document.getElementById('handout-google-font')) {
    document.head.insertAdjacentHTML('beforeend', `<link id="handout-google-font" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,700&display=swap">`);
}
if (!document.getElementById('jspdf-lib')) {
    const s = document.createElement('script');
    s.id = 'jspdf-lib';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    parseMateriQueryParams();
    initLayout('Ruang Belajar');

    const mainContainer = document.querySelector('main .max-w-4xl');
    if (mainContainer) {
        mainContainer.classList.add('materi-container-width', 'transition-all', 'duration-300');
        const firstCard = mainContainer.querySelector('.hes-card');
        if (firstCard) firstCard.classList.add('materi-top-nav-card');
        const stepBar = document.getElementById('session-stepping-stones')?.parentElement;
        if (stepBar) stepBar.classList.add('materi-stepping-bar');
    }

    initGlobalFloatingTeachingUI();

    window.addEventListener('resize', () => {
        ['presentation', 'recap'].forEach(pref => {
            applyPdfPaperScale(pref);
            resizeAnnotationCanvas(pref);
        });
        syncFloatingDockVisibility();
    });

    renderMateriContent();

    await syncFromCloud();
    renderAppSidebar();
    renderMateriContent();
});

function parseMateriQueryParams() {
    const p = new URLSearchParams(window.location.search);
    let m = p.get('month'), w = parseInt(p.get('week')), d = parseInt(p.get('day'));
    if (!m && window.HES.userRole === 'student') {
        const cur = getStudentCurriculumTimeline(window.HES.currentUser.email)?.currentPointer;
        if (cur) { m = cur.monthId; w = cur.week; d = cur.day; }
    }
    activeMateriState = { monthId: m || 'm1', week: w || 1, day: d || 1 };
}

window.navigateAdjacentSession = function(step) {
    window.stopNaturalEnglishTTS();
    const { monthId, week, day } = activeMateriState;
    let sessionIdx = ((week - 1) * 3) + (day - 1) + step;
    let mNum = parseInt(monthId.replace('m', ''));
    const isStu = window.HES.userRole === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${window.HES.currentUser.email}`]?.maxMonth || 1) : window.HES.months.length;

    if (sessionIdx < 0) {
        if (mNum > 1) { mNum--; sessionIdx = 11; }
        else return showToast('Ini adalah pertemuan pertama di Month 1.', 'info');
    } else if (sessionIdx > 11) {
        if (mNum < maxM && mNum < window.HES.months.length) { mNum++; sessionIdx = 0; }
        else return showToast('Kamu sudah di pertemuan terakhir bulan ini. Lanjut ke Final Exam!', 'info');
    }
    window.location.href = `materi.html?month=m${mNum}&week=${Math.floor(sessionIdx / 3) + 1}&day=${(sessionIdx % 3) + 1}`;
};

window.switchMateriMode = function(mode) {
    window.stopNaturalEnglishTTS();
    activeMateriMode = mode === 'recap' ? 'recap' : 'presentation';
    [
        ['presentation', '<i class="fas fa-book-open mr-1.5"></i> Modul Materi'],
        ['recap',        '<i class="fas fa-file-signature mr-1.5"></i> Catatan Recap']
    ].forEach(([id, label]) => {
        const btn = document.getElementById(`mode-btn-${id}`);
        const active = id === activeMateriMode;
        if (btn) {
            btn.innerHTML = label;
            btn.className = `py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold transition border cursor-pointer ${active ? 'bg-teal-700 text-white border-teal-700 shadow-sm' : 'bg-white text-stone-600 border-stone-200 hover:border-teal-300 hover:text-teal-700'}`;
        }
        document.getElementById(`panel-materi-${id}`)?.classList.toggle('hidden', !active);
    });

    syncFloatingDockVisibility();

    if (isCurrentSessionUnlocked) {
        loadScratchpadNoteForActiveTab();
        setTimeout(() => {
            applyPdfPaperScale(activeMateriMode);
            resizeAnnotationCanvas(activeMateriMode);
            syncAnnotationStateToActiveTab();
        }, 60);
    }
};

function renderMateriContent() {
    const { monthId, week, day } = activeMateriState;
    const email = window.HES.currentUser.email;
    const role = window.HES.userRole;
    const isStu = role === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${email}`]?.maxMonth || 1) : 99;

    if (isStu && parseInt(monthId.replace('m', '')) > maxM) activeMateriState.monthId = 'm1';

    const monthObj = window.HES.months.find(m => m.id === activeMateriState.monthId) || { title: 'Month 1' };
    const currentSessionNumber = ((week - 1) * 3) + day;
    const access = getSessionAccessStatus(email, activeMateriState.monthId, week, day, role);
    isCurrentSessionUnlocked = access.unlocked;

    document.getElementById('materi-badge').innerText = monthObj.title;
    document.getElementById('materi-subbadge').innerText = `Minggu ${week} • Hari ${day}`;
    document.getElementById('materi-title').innerText = `Pertemuan ${currentSessionNumber} dari 12 (${monthObj.title})`;

    const qM = document.getElementById('quick-month');
    if (qM) {
        qM.innerHTML = window.HES.months.map(m => {
            const locked = isStu && parseInt(m.id.replace('m', '')) > maxM;
            return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${locked ? ' (Terkunci)' : ''}</option>`;
        }).join('');
        qM.value = activeMateriState.monthId;
        qM.onchange = () => window.location.href = `materi.html?month=${qM.value}&week=1&day=1`;
    }

    const stonesEl = document.getElementById('session-stepping-stones');
    if (stonesEl) {
        stonesEl.innerHTML = Array.from({ length: 12 }, (_, i) => {
            const w = Math.floor(i / 3) + 1, d = (i % 3) + 1;
            const st = getSessionAccessStatus(email, activeMateriState.monthId, w, d, role);
            let cls = 'bg-stone-50 text-stone-400 border-stone-200';
            let icon = '';
            if (st.unlocked && st.status === 'completed') cls = 'bg-teal-50 text-teal-700 border-teal-200 hover:border-teal-400';
            else if (st.unlocked && st.status === 'current') cls = 'bg-amber-50 text-amber-900 border-amber-300 font-black';
            else if (st.reason === 'future') cls = 'bg-amber-50/40 text-amber-700 border-amber-200/70';
            else if (isStu && !st.unlocked) icon = '<i class="fas fa-lock text-[9px] block opacity-60"></i>';

            if (w === week && d === day) cls = 'bg-teal-700 text-white border-teal-800 shadow-sm';
            const titleHint = st.shortDate ? `Sesi ${i + 1} (${st.shortDate})` : `Sesi ${i + 1} (Belum dijadwalkan)`;
            return `<a href="materi.html?month=${activeMateriState.monthId}&week=${w}&day=${d}" title="${titleHint}" class="py-1.5 rounded-xl border text-center text-xs font-extrabold transition flex flex-col items-center justify-center leading-tight ${cls}"><span>${i + 1}</span>${icon}</a>`;
        }).join('');
    }

    const pill = document.getElementById('materi-date-pill');
    if (pill) {
        pill.classList.remove('hidden');
        if (access.unlocked && access.status === 'current') {
            pill.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-amber-500 text-white';
            pill.innerHTML = `<i class="fas fa-star mr-1"></i> Hari Ini (${access.shortDate})`;
        } else if (access.shortDate && access.unlocked) {
            pill.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200';
            pill.innerHTML = `<i class="far fa-calendar-check mr-1"></i> ${access.shortDate}`;
        } else if (access.reason === 'future') {
            pill.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-800';
            pill.innerHTML = `<i class="fas fa-lock mr-1"></i> Terbuka ${access.shortDate}`;
        } else if (isStu) {
            pill.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-stone-100 text-stone-500';
            pill.innerHTML = `<i class="fas fa-lock mr-1"></i> Terkunci`;
        } else {
            pill.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-stone-100 text-stone-500';
            pill.innerHTML = `<i class="fas fa-eye mr-1"></i> Pratinjau Admin`;
        }
    }

    const lockedBox = document.getElementById('materi-locked-box');
    const unlockedWrap = document.getElementById('materi-unlocked-wrapper');

    // AUTO-LOCK MATERI UNTUK MURID SEBELUM HARI-H
    if (!access.unlocked) {
        parsedHandoutCache.presentation = null;
        parsedHandoutCache.recap = null;
        unlockedWrap?.classList.add('hidden');
        lockedBox?.classList.remove('hidden');

        const timeline = getStudentCurriculumTimeline(email);
        const lastOpen = timeline.currentPointer;

        let titleMsg = `Materi Pertemuan ${currentSessionNumber} Masih Terkunci`;
        let descMsg = `Pertemuan ini belum dijadwalkan. Begitu kita jadwalkan masuk kelas, materi akan otomatis terbuka tepat pada hari-H!`;
        let iconCls = 'fa-lock text-stone-400 bg-stone-100';

        if (access.reason === 'future') {
            titleMsg = `Materi Terbuka Otomatis pada ${access.displayDate}`;
            descMsg = `Pertemuan ${currentSessionNumber} sudah dijadwalkan untuk <strong>${access.displayDate}</strong>. Kamu bisa membuka dan mempelajarinya tepat di hari kelas nanti ya!`;
            iconCls = 'fa-clock text-amber-600 bg-amber-100';
        } else if (access.reason === 'month_locked') {
            titleMsg = `${monthObj.title} Belum Dibuka`;
            descMsg = `Modul bulan ini belum aktif untuk akunmu. Hubungi Bro Hamdi untuk melanjutkan ke modul berikutnya.`;
        }

        lockedBox.innerHTML = `
            <div class="hes-card text-center py-12 px-6 space-y-4">
                <div class="w-16 h-16 rounded-3xl ${iconCls} flex items-center justify-center mx-auto text-2xl">
                    <i class="fas ${access.reason === 'future' ? 'fa-clock' : 'fa-lock'}"></i>
                </div>
                <div class="max-w-md mx-auto space-y-1.5">
                    <h3 class="text-lg sm:text-xl font-extrabold text-stone-800">${titleMsg}</h3>
                    <p class="text-xs sm:text-sm font-semibold text-stone-500 leading-relaxed">${descMsg}</p>
                </div>
                <div class="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    ${lastOpen ? `<a href="materi.html?month=${lastOpen.monthId}&week=${lastOpen.week}&day=${lastOpen.day}" class="hes-btn-primary !text-xs"><i class="fas fa-book-open"></i> Buka Materi Terakhir (Sesi ${lastOpen.sessionNum})</a>` : ''}
                    <a href="tugas.html" class="hes-btn-warm !text-xs"><i class="fas fa-microphone-lines"></i> Latihan di Tugas Speaking</a>
                    <a href="dashboard.html" class="hes-btn-soft !text-xs"><i class="fas fa-home"></i> Ke Beranda</a>
                </div>
            </div>`;
        syncFloatingDockVisibility();
        return;
    }

    // MATERI TERBUKA
    lockedBox?.classList.add('hidden');
    unlockedWrap?.classList.remove('hidden');

    const getMat = suffix => window.HES.materials[`${email}-${activeMateriState.monthId}-w${week}-d${day}-${suffix}`] || window.HES.materials[`all-${activeMateriState.monthId}-w${week}-d${day}-${suffix}`];
    renderSmartHandout('presentation', getMat('link'), monthObj.title, currentSessionNumber, 'Interactive Study Guide', 'Modul materi utama belum diterbitkan untuk pertemuan ini.');
    renderSmartHandout('recap', getMat('recap'), monthObj.title, currentSessionNumber, 'Class Recap & Coaching Notes', 'Catatan rangkuman kelas belum tersedia untuk pertemuan ini.');
    switchMateriMode(activeMateriMode);
}

// ============================================================================
// FLOATING DOCK & FLOATING LIVE NOTEPAD (PC / LAPTOP)
// ============================================================================
function getActiveHandoutPrefix() {
    return activeMateriMode === 'recap' ? 'recap' : 'presentation';
}

function makeElementDraggable(el, handleEl) {
    if (!el || !handleEl) return;
    let isDragging = false, startX = 0, startY = 0, initLeft = 0, initTop = 0;

    handleEl.addEventListener('mousedown', e => {
        if (e.target.closest('button, a, input, textarea, select')) return;
        isDragging = true;
        const rect = el.getBoundingClientRect();
        el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
        el.style.left = `${rect.left}px`; el.style.top = `${rect.top}px`;
        startX = e.clientX; startY = e.clientY; initLeft = rect.left; initTop = rect.top;
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        el.style.left = `${Math.max(6, Math.min(window.innerWidth - 100, initLeft + (e.clientX - startX)))}px`;
        el.style.top = `${Math.max(6, Math.min(window.innerHeight - 60, initTop + (e.clientY - startY)))}px`;
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) { isDragging = false; document.body.style.userSelect = ''; }
    });
}

function makeElementResizable(el, resizeHandleEl) {
    if (!el || !resizeHandleEl) return;
    let isResizing = false, startX = 0, startY = 0, startW = 0, startH = 0;

    resizeHandleEl.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        const rect = el.getBoundingClientRect();
        el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
        el.style.left = `${rect.left}px`; el.style.top = `${rect.top}px`;
        startX = e.clientX; startY = e.clientY; startW = rect.width; startH = rect.height;
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', e => {
        if (!isResizing) return;
        el.style.width = `${Math.round(Math.max(300, Math.min(window.innerWidth - 24, startW + (e.clientX - startX))))}px`;
        el.style.height = `${Math.round(Math.max(220, Math.min(window.innerHeight - 24, startH + (e.clientY - startY))))}px`;
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false; document.body.style.userSelect = '';
            localStorage.setItem('hes_notepad_w', el.style.width);
            localStorage.setItem('hes_notepad_h', el.style.height);
        }
    });
}

function initGlobalFloatingTeachingUI() {
    if (document.getElementById('hes-global-floating-dock')) return;

    const isCollapsed = document.body.classList.contains('hes-sidebar-collapsed');
    const savedW = localStorage.getItem('hes_notepad_w') || '480px';
    const savedH = localStorage.getItem('hes_notepad_h') || '420px';

    const uiHTML = `
        <div id="hes-global-floating-dock" class="hes-floating-dock hidden">
            <div id="hes-floating-annot-pal" class="hidden hes-floating-dock-body bg-stone-900/95 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl border border-stone-700/90 flex flex-col items-center gap-2 fade-in">
                <button type="button" id="flt-annot-pen" onclick="setAnnotationTool('pen')" title="Pena Tulis" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-white text-stone-900 flex items-center justify-center cursor-pointer"><i class="fas fa-pen"></i></button>
                <button type="button" id="flt-annot-highlighter" onclick="setAnnotationTool('highlighter')" title="Stabilo Transparan" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-stone-800 text-stone-300 flex items-center justify-center cursor-pointer"><i class="fas fa-highlighter"></i></button>
                <button type="button" id="flt-annot-eraser" onclick="setAnnotationTool('eraser')" title="Penghapus Coretan" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-stone-800 text-stone-300 flex items-center justify-center cursor-pointer"><i class="fas fa-eraser"></i></button>
                <button type="button" id="flt-annot-pointer" onclick="setAnnotationTool('pointer')" title="Mode Klik Audio" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-stone-800 text-stone-300 flex items-center justify-center cursor-pointer"><i class="fas fa-mouse-pointer"></i></button>
                <div class="w-6 h-px bg-stone-700 my-0.5"></div>
                ${[['#E11D48', 'Merah'], ['#0F766E', 'Teal'], ['#2563EB', 'Biru'], ['#F59E0B', 'Kuning/Oranye'], ['#0F172A', 'Hitam']].map(([col, lbl]) => `
                    <button type="button" data-color="${col}" onclick="setAnnotationTool(annotationState.tool === 'eraser' ? 'pen' : annotationState.tool, '${col}')" title="Warna ${lbl}" style="background:${col};" class="flt-annot-color w-6 h-6 rounded-full border-2 border-white cursor-pointer transition"></button>
                `).join('')}
                <div class="w-6 h-px bg-stone-700 my-0.5"></div>
                <button type="button" onclick="clearAnnotationCanvas()" title="Bersihkan Semua Coretan" class="w-9 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center cursor-pointer"><i class="fas fa-trash-alt"></i></button>
            </div>

            <div class="flex flex-col items-center gap-1.5">
                <button type="button" onclick="toggleSideDockMinimize()" title="Lipat / Buka Floating Bar" class="w-8 h-8 rounded-full bg-stone-900/90 hover:bg-teal-600 text-white shadow-lg border border-stone-700 flex items-center justify-center transition cursor-pointer">
                    <i id="flt-dock-min-icon" class="fas fa-chevron-right text-[11px]"></i>
                </button>

                <div class="hes-floating-dock-body bg-stone-900/95 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl border border-stone-700/80 flex flex-col items-center gap-2">
                    <div id="hes-dock-drag-handle" title="Tahan & Geser untuk Memindahkan Posisi Bar" class="w-full py-1 flex items-center justify-center text-stone-500 hover:text-stone-300 cursor-move">
                        <i class="fas fa-grip-lines text-xs"></i>
                    </div>
                    <button type="button" onclick="changeHandoutZoom(10)" title="Perbesar Kertas" class="w-10 h-9 rounded-xl bg-stone-800 hover:bg-teal-600 text-white font-black text-xs flex items-center justify-center transition cursor-pointer"><i class="fas fa-search-plus"></i></button>
                    <button type="button" onclick="changeHandoutZoom(0, handoutZoomLevel === 80 ? 100 : 80)" title="Ganti cepat 80% / 100%" class="w-10 py-1 rounded-lg bg-stone-800/80 text-[11px] font-black text-amber-300 hover:text-white text-center cursor-pointer" id="flt-zoom-label">${handoutZoomLevel}%</button>
                    <button type="button" onclick="changeHandoutZoom(-10)" title="Perkecil Kertas" class="w-10 h-9 rounded-xl bg-stone-800 hover:bg-teal-600 text-white font-black text-xs flex items-center justify-center transition cursor-pointer"><i class="fas fa-search-minus"></i></button>
                    <div class="w-7 h-px bg-stone-700 my-0.5"></div>
                    <button type="button" id="flt-btn-annot" onclick="toggleAnnotationToolbar()" title="Coret-Coret Kertas Materi" class="w-10 h-10 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white flex items-center justify-center transition cursor-pointer"><i class="fas fa-highlighter text-sm"></i></button>
                    <button type="button" id="flt-btn-wb" onclick="toggleWhiteboardDrawer()" title="Buka Live Notepad" class="w-10 h-10 rounded-xl bg-teal-500/20 hover:bg-teal-600 text-teal-300 hover:text-white flex items-center justify-center transition cursor-pointer"><i class="fas fa-keyboard text-sm"></i></button>
                    <button type="button" onclick="toggleFullScreenReading()" title="Mode Fokus Mengajar" class="hes-focus-mode-btn w-10 h-10 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center transition cursor-pointer"><i class="fas ${isCollapsed ? 'fa-compress-alt' : 'fa-expand-alt'} text-sm"></i></button>
                    <div class="w-7 h-px bg-stone-700 my-0.5"></div>
                    <button id="flt-btn-dl" onclick="downloadHandoutPDF(getActiveHandoutPrefix())" title="Download PDF A4" class="w-10 h-10 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center shadow-sm transition cursor-pointer"><i class="fas fa-file-pdf text-sm"></i></button>
                    ${window.HES.userRole === 'admin' ? `<a href="admin.html?tab=materials" title="Edit Materi" class="w-10 h-9 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center transition"><i class="fas fa-pen text-xs"></i></a>` : ''}
                </div>
            </div>
        </div>

        <div id="hes-global-floating-wb" style="width:${savedW}; height:${savedH};" class="hes-floating-wb hidden bg-white/98 backdrop-blur-md border-2 border-teal-300 rounded-3xl p-3.5 sm:p-4 shadow-2xl flex flex-col justify-between gap-2.5">
            <div id="hes-wb-drag-handle" class="flex items-center justify-between gap-2 border-b border-stone-100 pb-2 shrink-0 cursor-move select-none">
                <div class="flex items-center gap-2">
                    <span class="w-7 h-7 rounded-xl bg-teal-700 text-white flex items-center justify-center text-xs"><i class="fas fa-keyboard"></i></span>
                    <div>
                        <h4 class="text-xs sm:text-sm font-extrabold text-stone-800 leading-tight">Live Teaching Notepad <i class="fas fa-arrows-alt text-[10px] text-teal-500 ml-1"></i></h4>
                        <p class="text-[10px] font-semibold text-stone-400">Geser header • Tarik pojok kanan bawah untuk ubah ukuran</p>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="toggleNotepadQuickSize()" class="w-7 h-7 rounded-xl bg-stone-100 hover:bg-teal-50 text-stone-600 hover:text-teal-700 flex items-center justify-center text-xs cursor-pointer"><i id="flt-notepad-exp-icon" class="fas fa-expand-alt"></i></button>
                    <button type="button" onclick="toggleWhiteboardDrawer()" class="w-7 h-7 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 flex items-center justify-center text-xs cursor-pointer"><i class="fas fa-times"></i></button>
                </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-2.5 py-1.5 rounded-2xl border border-stone-200/80 shrink-0">
                <div class="flex items-center gap-1">
                    <button type="button" onclick="changeNotepadFontSize(-2)" class="px-2.5 py-1 rounded-xl bg-white hover:bg-teal-50 text-stone-700 hover:text-teal-700 border border-stone-200 text-xs font-black transition cursor-pointer">A-</button>
                    <span id="flt-notepad-fontsize-lbl" class="text-[11px] font-black text-teal-700 px-1.5 min-w-[38px] text-center">${notepadState.fontSize}px</span>
                    <button type="button" onclick="changeNotepadFontSize(2)" class="px-2.5 py-1 rounded-xl bg-white hover:bg-teal-50 text-stone-700 hover:text-teal-700 border border-stone-200 text-xs font-black transition cursor-pointer">A+</button>
                </div>
                <div class="flex items-center gap-1.5">
                    ${[['#0F172A', 'Hitam'], ['#0F766E', 'Teal'], ['#2563EB', 'Biru'], ['#E11D48', 'Merah'], ['#D97706', 'Oranye']].map(([col, lbl]) => `
                        <button type="button" data-np-color="${col}" onclick="setNotepadTextColor('${col}')" title="Warna Teks: ${lbl}" style="background:${col};" class="flt-np-color-btn w-5 h-5 rounded-full border-2 border-white shadow-2xs cursor-pointer transition hover:scale-110"></button>
                    `).join('')}
                    <label title="Pilih Warna Bebas" class="w-5 h-5 rounded-full border border-stone-300 bg-gradient-to-tr from-rose-500 via-amber-400 to-teal-600 cursor-pointer flex items-center justify-center overflow-hidden relative">
                        <input type="color" value="${notepadState.color}" oninput="setNotepadTextColor(this.value)" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer">
                    </label>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="copyNotepadText()" title="Salin Isi Catatan" class="px-2 py-1 rounded-xl bg-white hover:bg-teal-50 text-stone-600 hover:text-teal-700 border border-stone-200 text-[11px] font-extrabold cursor-pointer"><i class="fas fa-copy"></i></button>
                    <button type="button" onclick="clearNotepadText()" title="Kosongkan" class="px-2 py-1 rounded-xl bg-white hover:bg-rose-50 text-stone-400 hover:text-rose-600 border border-stone-200 text-[11px] font-extrabold cursor-pointer"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>

            <div class="flex-1 flex flex-col min-h-0 relative">
                <textarea id="flt-wb-note" oninput="saveLiveScratchpadNote(this.value)" style="font-size:${notepadState.fontSize}px; color:${notepadState.color};" class="w-full h-full flex-1 bg-amber-50/35 focus:bg-white border border-stone-200 focus:border-teal-500 rounded-2xl p-3.5 font-bold leading-relaxed outline-none resize-none custom-scrollbar transition-colors" placeholder="Ketik contoh kalimat, catatan live, atau latihan tanya-jawab bersama murid di sini..."></textarea>
                <div id="hes-wb-resize-handle" class="hes-wb-resize-grip"><i class="fas fa-caret-right rotate-45 text-sm"></i></div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', uiHTML);
    makeElementDraggable(document.getElementById('hes-global-floating-dock'), document.getElementById('hes-dock-drag-handle'));
    makeElementDraggable(document.getElementById('hes-global-floating-wb'), document.getElementById('hes-wb-drag-handle'));
    makeElementResizable(document.getElementById('hes-global-floating-wb'), document.getElementById('hes-wb-resize-handle'));
    applyNotepadVisualStyle();
}

function applyNotepadVisualStyle() {
    const noteEl = document.getElementById('flt-wb-note');
    const lblEl = document.getElementById('flt-notepad-fontsize-lbl');
    if (noteEl) { noteEl.style.fontSize = `${notepadState.fontSize}px`; noteEl.style.color = notepadState.color; }
    if (lblEl) lblEl.innerText = `${notepadState.fontSize}px`;
    document.querySelectorAll('.flt-np-color-btn').forEach(btn => {
        const active = btn.dataset.npColor?.toLowerCase() === notepadState.color.toLowerCase();
        btn.classList.toggle('ring-2', active); btn.classList.toggle('ring-teal-500', active); btn.classList.toggle('scale-110', active);
    });
}

window.changeNotepadFontSize = delta => {
    notepadState.fontSize = Math.min(48, Math.max(12, notepadState.fontSize + delta));
    localStorage.setItem('hes_notepad_fontsize', String(notepadState.fontSize));
    applyNotepadVisualStyle();
};

window.setNotepadTextColor = color => {
    if (!color) return;
    notepadState.color = color;
    localStorage.setItem('hes_notepad_color', color);
    applyNotepadVisualStyle();
};

window.toggleNotepadQuickSize = function() {
    const box = document.getElementById('hes-global-floating-wb'), icon = document.getElementById('flt-notepad-exp-icon');
    if (!box) return;
    notepadState.expanded = !notepadState.expanded;
    box.style.width = notepadState.expanded ? `${Math.min(720, window.innerWidth - 48)}px` : '460px';
    box.style.height = notepadState.expanded ? `${Math.min(580, window.innerHeight - 60)}px` : '400px';
    localStorage.setItem('hes_notepad_w', box.style.width);
    localStorage.setItem('hes_notepad_h', box.style.height);
    if (icon) icon.className = `fas ${notepadState.expanded ? 'fa-compress-alt' : 'fa-expand-alt'}`;
};

window.copyNotepadText = function() {
    const noteEl = document.getElementById('flt-wb-note');
    if (!noteEl?.value.trim()) return showToast('Text box masih kosong.', 'info');
    navigator.clipboard.writeText(noteEl.value).then(() => showToast('Catatan berhasil disalin!', 'success'));
};

window.clearNotepadText = function() {
    const noteEl = document.getElementById('flt-wb-note');
    if (!noteEl?.value.trim()) return;
    noteEl.value = ''; saveLiveScratchpadNote(''); noteEl.focus();
};

function syncFloatingDockVisibility() {
    const dock = document.getElementById('hes-global-floating-dock');
    const wb = document.getElementById('hes-global-floating-wb');
    if (!dock) return;
    const pref = getActiveHandoutPrefix();
    const shouldShow = window.innerWidth >= 768 && isCurrentSessionUnlocked && Boolean(parsedHandoutCache[pref]);
    dock.classList.toggle('hidden', !shouldShow);
    if (!shouldShow && wb) wb.classList.add('hidden');
}

function applyPdfPaperScale(prefix) {
    const sheet = document.getElementById(`printable-handout-${prefix}`);
    const wrap = document.getElementById(`handout-scale-wrap-${prefix}`);
    const lbl = document.getElementById('flt-zoom-label');
    if (!sheet || !wrap) return;
    if (window.innerWidth < 768) {
        sheet.style.transform = 'none'; wrap.style.width = '100%'; wrap.style.height = 'auto';
        return;
    }
    const scale = handoutZoomLevel / 100;
    sheet.style.transform = `scale(${scale})`;
    wrap.style.width = `${Math.round((sheet.offsetWidth || 880) * scale)}px`;
    wrap.style.height = `${Math.round((sheet.offsetHeight || 1200) * scale)}px`;
    if (lbl) lbl.innerText = `${handoutZoomLevel}%`;
}

window.changeHandoutZoom = function(delta, exactVal = null) {
    handoutZoomLevel = exactVal !== null ? exactVal : Math.min(130, Math.max(55, handoutZoomLevel + delta));
    localStorage.setItem('hes_handout_zoom', String(handoutZoomLevel));
    ['presentation', 'recap'].forEach(pref => applyPdfPaperScale(pref));
};

window.toggleSideDockMinimize = function() {
    sideDockMinimized = !sideDockMinimized;
    document.getElementById('hes-global-floating-dock')?.classList.toggle('dock-minimized', sideDockMinimized);
    const icon = document.getElementById('flt-dock-min-icon');
    if (icon) icon.className = `fas ${sideDockMinimized ? 'fa-chevron-left' : 'fa-chevron-right'} text-[11px]`;
};

function syncAnnotationStateToActiveTab() {
    const canvas = document.getElementById(`annot-canvas-${getActiveHandoutPrefix()}`);
    if (canvas) canvas.classList.toggle('drawing-active', annotationState.active && annotationState.tool !== 'pointer');
}

window.toggleAnnotationToolbar = function() {
    const pal = document.getElementById('hes-floating-annot-pal'), btn = document.getElementById('flt-btn-annot');
    if (!pal) return;
    annotationState.active = pal.classList.contains('hidden');
    pal.classList.toggle('hidden', !annotationState.active);
    resizeAnnotationCanvas(getActiveHandoutPrefix());
    if (annotationState.active) {
        setAnnotationTool(annotationState.tool === 'pointer' ? 'pen' : annotationState.tool, annotationState.color);
        if (btn) btn.className = 'w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-md transition cursor-pointer';
    } else {
        syncAnnotationStateToActiveTab();
        if (btn) btn.className = 'w-10 h-10 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white flex items-center justify-center transition cursor-pointer';
    }
};

window.setAnnotationTool = function(tool, color = null) {
    annotationState.tool = tool;
    if (color) annotationState.color = color;
    syncAnnotationStateToActiveTab();
    ['pen', 'highlighter', 'eraser', 'pointer'].forEach(t => {
        const el = document.getElementById(`flt-annot-${t}`);
        if (el) el.className = `w-9 h-9 rounded-xl text-xs font-extrabold flex items-center justify-center transition cursor-pointer ${t === tool ? 'bg-white text-stone-900 shadow-sm' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`;
    });
    document.querySelectorAll('.flt-annot-color').forEach(btn => {
        const active = btn.dataset.color === annotationState.color;
        btn.classList.toggle('ring-2', active); btn.classList.toggle('ring-amber-400', active); btn.classList.toggle('scale-110', active);
    });
};

window.clearAnnotationCanvas = function() {
    const canvas = document.getElementById(`annot-canvas-${getActiveHandoutPrefix()}`);
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

function resizeAnnotationCanvas(prefix) {
    if (window.innerWidth < 768) return;
    const sheet = document.getElementById(`printable-handout-${prefix}`), canvas = document.getElementById(`annot-canvas-${prefix}`);
    if (!sheet || !canvas) return;
    const w = sheet.offsetWidth || 880, h = sheet.offsetHeight || 1200;
    if (canvas.width === w && canvas.height === h) return;
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    if (canvas.width > 0 && canvas.height > 0) temp.getContext('2d').drawImage(canvas, 0, 0);
    canvas.width = w; canvas.height = h;
    if (temp.width > 0 && temp.height > 0) canvas.getContext('2d').drawImage(temp, 0, 0);
}

function bindInteractiveCanvas(canvas, getToolConfig) {
    if (!canvas || canvas.dataset.bound === '1') return;
    canvas.dataset.bound = '1';
    const ctx = canvas.getContext('2d');
    let drawing = false, lastPos = { x: 0, y: 0 };

    const getPos = e => {
        const rect = canvas.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: ((cx - rect.left) / (rect.width || 1)) * canvas.width, y: ((cy - rect.top) / (rect.height || 1)) * canvas.height };
    };

    const start = e => {
        if (getToolConfig().tool === 'pointer') return;
        if (e.cancelable) e.preventDefault();
        drawing = true; lastPos = getPos(e);
    };

    const move = e => {
        if (!drawing) return;
        if (e.cancelable) e.preventDefault();
        const cfg = getToolConfig(), pos = getPos(e);
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (cfg.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 28; ctx.strokeStyle = 'rgba(0,0,0,1)'; }
        else if (cfg.tool === 'highlighter') { ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 24; ctx.strokeStyle = cfg.color + '45'; }
        else { ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 3.5; ctx.strokeStyle = cfg.color; }
        ctx.beginPath(); ctx.moveTo(lastPos.x, lastPos.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
        ctx.restore();
        lastPos = pos;
    };

    const stop = () => { drawing = false; };
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', stop);
}

window.toggleWhiteboardDrawer = function() {
    const box = document.getElementById('hes-global-floating-wb'), btn = document.getElementById('flt-btn-wb');
    if (!box) return;
    const isOpening = box.classList.contains('hidden');
    box.classList.toggle('hidden', !isOpening);
    if (btn) btn.className = isOpening
        ? 'w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md transition cursor-pointer'
        : 'w-10 h-10 rounded-xl bg-teal-500/20 hover:bg-teal-600 text-teal-300 hover:text-white flex items-center justify-center transition cursor-pointer';
    if (isOpening) {
        loadScratchpadNoteForActiveTab(); applyNotepadVisualStyle();
        setTimeout(() => document.getElementById('flt-wb-note')?.focus(), 50);
    }
};

function loadScratchpadNoteForActiveTab() {
    const noteEl = document.getElementById('flt-wb-note');
    if (!noteEl) return;
    const { monthId, week, day } = activeMateriState;
    noteEl.value = localStorage.getItem(`hes_note_${getActiveHandoutPrefix()}_${monthId}_w${week}_d${day}`) || '';
}

window.saveLiveScratchpadNote = function(val) {
    const { monthId, week, day } = activeMateriState;
    localStorage.setItem(`hes_note_${getActiveHandoutPrefix()}_${monthId}_w${week}_d${day}`, val);
};

// ============================================================================
// PEMBERSIH TEKS, PARSER SMART HANDOUT & RENDERER
// ============================================================================
const sanitizeRawInputString = s => String(s || '').replace(/"font-extrabold[^"]*">/g, '').replace(/"italic text-slate-\d+[^"]*">/g, '').replace(/<[^>]+>/g, '');
const escapeHtmlStr = s => sanitizeRawInputString(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cleanTitleMarkdown = s => escapeHtmlStr(s).replace(/\*+/g, '').replace(/^["']|["']$/g, '').trim();

function splitBilingualLine(str) {
    const clean = String(str || '').trim();
    const match = clean.match(/^(.*?)\s*\(([^()]{3,})\)\s*$/);
    return (match && match[1].trim()) ? { eng: match[1].trim(), ind: match[2].trim() } : { eng: clean, ind: '' };
}

function extractEnglishForTTS(rawText) {
    let s = sanitizeRawInputString(rawText)
        .replace(/^(?:Tutor|Student|Teacher|Partner|Cue\s*\d*|Situation\s*\d*|Question|Answer)\s*(?:asks|answers|says)?\s*:\s*/gi, '')
        .replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\*+/g, '').trim();
    const quotes = [...s.matchAll(/"([^"]{2,})"/g)].map(m => m[1].trim());
    if (quotes.length > 0 && s.length > quotes.join(' ').length + 25) return quotes.join('. ');
    if (/\s+(?:—|--|=)\s+/.test(s)) s = s.split(/\s+(?:—|--|=)\s+/)[0].trim();
    return s;
}

function formatRichEnglishText(text) {
    if (!text) return '';
    let safe = escapeHtmlStr(text);
    const quotes = [];
    safe = safe.replace(/\*"([^"\n]+)"\*|"(?!font-|italic)([^"\n]+)"/g, (_, qI, qN) => {
        quotes.push((qI || qN || '').replace(/\*+/g, '').trim());
        return `@@HES_QUOTE_${quotes.length - 1}@@`;
    });
    return safe
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-stone-900 bg-amber-100/90 px-1.5 py-0.5 rounded-md">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em class="italic text-stone-800 font-semibold">$1</em>')
        .replace(/\*+/g, '')
        .replace(/@@HES_QUOTE_(\d+)@@/g, (_, idx) => `<span class="font-bold text-teal-800">&ldquo;${quotes[Number(idx)] || ''}&rdquo;</span>`)
        .replace(/->|→/g, '<i class="fas fa-arrow-right text-teal-500 mx-1.5 text-xs"></i>');
}

function getSessionThemePalette(sessionNumber, isRecap = false, customStyle = '') {
    if (isRecap) return { name: 'emerald', barGrad: 'from-emerald-700 via-teal-600 to-cyan-500', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', heroBg: 'bg-gradient-to-br from-emerald-50/80 via-teal-50/30 to-white', heroBorder: 'border-emerald-500', accentText: 'text-emerald-700', accentBg: 'bg-emerald-600', pdfPrimary: '#047857', pdfSecondary: '#0D9488', pdfDark: '#064E3B', pdfSoft: '#ECFDF5', pdfBorder: '#A7F3D0' };
    const palettes = [
        { name: 'teal',   barGrad: 'from-teal-800 via-teal-600 to-emerald-500',   badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',     heroBg: 'bg-gradient-to-br from-teal-50/80 via-emerald-50/30 to-white',   heroBorder: 'border-teal-600',   accentText: 'text-teal-700',   accentBg: 'bg-teal-600',   pdfPrimary: '#0F766E', pdfSecondary: '#059669', pdfDark: '#134E4A', pdfSoft: '#F0FDFA', pdfBorder: '#99F6E4' },
        { name: 'ocean',  barGrad: 'from-blue-800 via-sky-600 to-cyan-500',       badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',        heroBg: 'bg-gradient-to-br from-sky-50/80 via-blue-50/30 to-white',       heroBorder: 'border-sky-600',    accentText: 'text-sky-700',    accentBg: 'bg-sky-600',    pdfPrimary: '#0369A1', pdfSecondary: '#0284C7', pdfDark: '#0C4A6E', pdfSoft: '#F0F9FF', pdfBorder: '#BAE6FD' },
        { name: 'amber',  barGrad: 'from-amber-700 via-orange-600 to-rose-500',   badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',  heroBg: 'bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-white',   heroBorder: 'border-amber-500',  accentText: 'text-amber-800',  accentBg: 'bg-amber-600',  pdfPrimary: '#B45309', pdfSecondary: '#EA580C', pdfDark: '#451A03', pdfSoft: '#FFFBEB', pdfBorder: '#FDE68A' },
        { name: 'indigo', barGrad: 'from-indigo-800 via-violet-600 to-purple-500',badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',heroBg: 'bg-gradient-to-br from-indigo-50/80 via-violet-50/30 to-white', heroBorder: 'border-indigo-600', accentText: 'text-indigo-700', accentBg: 'bg-indigo-600', pdfPrimary: '#4338CA', pdfSecondary: '#7C3AED', pdfDark: '#1E1B4B', pdfSoft: '#EEF2FF', pdfBorder: '#C7D2FE' }
    ];
    const st = String(customStyle || '').toLowerCase();
    if (st.includes('ocean')) return palettes[1];
    if (st.includes('amber') || st.includes('warm')) return palettes[2];
    if (st.includes('indigo') || st.includes('story')) return palettes[3];
    return palettes[(sessionNumber - 1) % palettes.length];
}

function splitQuestionAndAnswer(rawTask) {
    let text = String(rawTask || '').trim(), answer = '';
    const mP = text.match(/\((?:Answer|Key|Jawaban|Kunci|Sample Answer|Pembahasan|Hint)\s*:\s*([^)]+)\)\s*$/i);
    const mB = text.match(/\[(?:Answer|Key|Jawaban|Kunci|Sample Answer|Pembahasan|Hint)\s*:\s*([^\]]+)\]\s*$/i);
    const mPipe = text.split(/\s*\|\s*(?:Answer|Key|Jawaban|Kunci)\s*:\s*/i);
    if (mP) { answer = mP[1].trim(); text = text.slice(0, mP.index).trim(); }
    else if (mB) { answer = mB[1].trim(); text = text.slice(0, mB.index).trim(); }
    else if (mPipe.length > 1) { text = mPipe[0].trim(); answer = mPipe.slice(1).join(' ').trim(); }
    return { questionText: text, answerKey: answer };
}

function extractTitleAndBodyFromLine(str) {
    const clean = String(str || '').trim();
    const boldColon = clean.match(/^\*\*([^*]+)\*\*\s*:\s*(.+)$/);
    if (boldColon) return { title: boldColon[1].trim(), body: boldColon[2].trim() };
    const idx = clean.indexOf(':');
    if (idx > 1 && idx <= 75) return { title: clean.slice(0, idx).replace(/\*+/g, '').trim(), body: clean.slice(idx + 1).trim() };
    return { title: '', body: clean };
}

const CLASSIC_HEADER_MAP = [
    [/^(?:STORY|SCENARIO|HOOK|INTRODUCTION|INTRO|CERITA|KONTEKS)\s*:(.*)$/i,                  'story',     'Opening Scene & Context'],
    [/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER|PEMANASAN)\s*:(.*)$/i,                                'warmup',    'Warm-Up Questions'],
    [/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY|DEEP\s*DIVE|KEY\s*POINTS?|MATERI|PENJELASAN)\s*:(.*)$/i, 'editorial', 'How It Works & Key Examples'],
    [/^(?:FORMULAS?|PATTERNS?|GRAMMAR|RULES?|RUMUS|POLA)\s*:(.*)$/i,                          'formulas',  'Sentence Patterns & Examples'],
    [/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?|WAYS\s*TO\s*SAY|UNGKAPAN|EKSPRESI)\s*:(.*)$/i, 'phrases', 'Useful Expressions & Examples'],
    [/^(?:EXAMPLES?|SENTENCES?|IN\s*ACTION|CONTOH)\s*:(.*)$/i,                                'examples',  'Everyday Examples in Action'],
    [/^(?:MISTAKES?|COMMON\s*MISTAKES?|COMPARE|UPGRADES?|PERBANDINGAN|KOREKSI)\s*:(.*)$/i,    'mistakes',  'Sound Natural! (Sentence Upgrades)'],
    [/^(?:DIALOGUE|CONVERSATION|ROLEPLAY|PERCAKAPAN|DIALOG)\s*:(.*)$/i,                       'dialogue',  'Model Conversation'],
    [/^(?:PRACTICE|EXERCISES?|TASKS?|HOMEWORK|MISSION|QUIZ|YOUR\s*TURN|LATIHAN|TANTANGAN)\s*:(.*)$/i, 'practice', 'Your Turn! (Speaking Practice)']
];

function parseSmartHandoutText(rawText, defaultTitle, defaultLevel) {
    const clean = sanitizeRawInputString(rawText).replace(/\r\n/g, '\n').trim();
    const data = { title: defaultTitle, level: defaultLevel, goal: '', style: '', sections: [], allAudioDialogues: {}, allAudioItems: [] };
    if (!clean) return data;

    let currentSec = null, activeHint = 'editorial';
    const startSec = (hint, title) => {
        activeHint = hint;
        currentSec = { id: `sec_${data.sections.length + 1}`, hint, title: title.replace(/\*+/g, '').trim(), blocks: [] };
        data.sections.push(currentSec);
        return currentSec;
    };

    const pushDialogueLine = (speaker, rawSpeech) => {
        if (!currentSec) startSec('dialogue', 'Model Conversation');
        let lastBlock = currentSec.blocks[currentSec.blocks.length - 1];
        if (!lastBlock || lastBlock.type !== 'dialogue') {
            lastBlock = { type: 'dialogue', id: `dlg_${currentSec.id}_${currentSec.blocks.length}`, lines: [] };
            currentSec.blocks.push(lastBlock);
        }
        const { eng, ind } = splitBilingualLine(rawSpeech);
        lastBlock.lines.push({ speaker: speaker.trim(), eng, ind, raw: `${speaker.trim()}: ${eng}` });
    };

    clean.split('\n').forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || /^SESSION\s*:\s*\d+/i.test(line)) return;

        if (/^(?:TITLE|JUDUL)\s*:/i.test(line)) { data.title = line.replace(/^(?:TITLE|JUDUL)\s*:\s*/i, '').replace(/\*+/g, '').trim() || data.title; return; }
        if (/^(?:LEVEL|SUBTITLE)\s*:/i.test(line)) { data.level = line.replace(/^(?:LEVEL|SUBTITLE)\s*:\s*/i, '').replace(/\*+/g, '').trim() || data.level; return; }
        if (/^(?:GOAL|OBJECTIVE|TARGET)\s*:/i.test(line)) { data.goal = line.replace(/^(?:GOAL|OBJECTIVE|TARGET)\s*:\s*/i, '').replace(/\*+/g, '').trim(); return; }
        if (/^STYLE\s*:/i.test(line)) { data.style = line.replace(/^STYLE\s*:/i, '').trim(); return; }

        if (/^###\s+(.+)$/.test(line)) {
            if (!currentSec) startSec('editorial', 'Key Examples & Practice');
            currentSec.blocks.push({ type: 'subheading', text: line.replace(/^###\s+/, '').replace(/\*+/g, '').trim() });
            return;
        }

        if (/^#{1,2}\s+(.+)$/.test(line) || /^SECTION\s*:\s*(.+)$/i.test(line)) {
            const customTitle = line.replace(/^#{1,2}\s+|^SECTION\s*:\s*/i, '').replace(/\*+/g, '').trim();
            const l = customTitle.toLowerCase();
            let guessedHint = 'editorial';
            if (/warm[\s-]*up|pemanasan|ice[\s-]*breaker/.test(l)) guessedHint = 'warmup';
            else if (/latihan|practice|quiz|tantangan|exercise|mission|your\s*turn|free\s*talk/.test(l)) guessedHint = 'practice';
            else if (/dialog|percakapan|conversation|roleplay|hear\s*it|action/.test(l)) guessedHint = 'dialogue';
            else if (/kesalahan|mistake|sound\s*natural|robot|avoid|upgrade/.test(l)) guessedHint = 'mistakes';
            else if (/rumus|formula|pattern|pola|how\s*it\s*works/.test(l)) guessedHint = 'formulas';
            else if (/ungkapan|ekspresi|phrase|kosakata|idiom|side[\s-]*by[\s-]*side|guided/.test(l)) guessedHint = 'phrases';
            else if (/cerita|story|skenario|konteks/.test(l)) guessedHint = 'story';
            startSec(guessedHint, customTitle);
            return;
        }

        if (/^>\s*(.+)$/.test(line) || /^(?:TIPS?|PRO\s*TIPS?|QUICK\s*TIPS?|COACH\s*NOTE|CATATAN|INGAT|NUANSA|CULTURE\s*NOTE|INSIDER\s*TIP)\s*:\s*(.+)$/i.test(line)) {
            if (!currentSec) startSec('editorial', 'Quick Guide');
            let rawCallout = line.replace(/^>\s*/, ''), cTitle = 'Quick Tip';
            const hdrMatch = rawCallout.match(/^(?:TIPS?|PRO\s*TIPS?|QUICK\s*TIPS?|COACH\s*NOTE|CATATAN|INGAT|NUANSA|CULTURE\s*NOTE|INSIDER\s*TIP)\s*:\s*(.*)$/i);
            if (hdrMatch) rawCallout = hdrMatch[1].trim();
            else {
                const { title, body } = extractTitleAndBodyFromLine(rawCallout);
                if (title && title.length < 45) { cTitle = title.replace(/^[💡🔥📌✨🎯]\s*/, ''); rawCallout = body; }
            }
            if (rawCallout) currentSec.blocks.push({ type: 'callout', title: cTitle, text: rawCallout });
            return;
        }

        for (const [regex, hint, defTitle] of CLASSIC_HEADER_MAP) {
            const m = line.match(regex);
            if (m) {
                const rest = (m[1] || '').trim();
                const isCustomHeaderTitle = rest && rest.length <= 60 && !/[.?!]$/.test(rest) && !rest.includes('|');
                const sec = startSec(hint, isCustomHeaderTitle ? rest : defTitle);
                if (rest && !isCustomHeaderTitle) sec.blocks.push({ type: 'paragraph', text: rest, isStory: hint === 'story' });
                return;
            }
        }

        if (!currentSec) startSec('editorial', 'Lesson Guide');

        const isBullet = /^[-*•]\s+|\d+[.)]\s+|^\[(?:[+?*-]|X|V|Salah|Benar|Kaku|Natural|Formal|Santai|Casual|Textbook|In\s*Class|Better)\]/i.test(line);
        const isNumbered = /^\d+[.)]\s+/.test(line);
        const stripped = line.replace(/^[-*•]\s*|\d+[.)]\s*/, '').trim();

        const hasAnswerKey = /\((?:Answer|Key|Jawaban|Kunci|Sample Answer|Pembahasan|Hint)\s*:/i.test(line) || /\[(?:Answer|Key|Jawaban|Kunci)\s*:/i.test(line);
        if (hasAnswerKey || (activeHint === 'practice' && (isNumbered || isBullet))) {
            const pMatch = stripped.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
            const { questionText, answerKey } = splitQuestionAndAnswer(pMatch ? pMatch[2].trim() : stripped);
            currentSec.blocks.push({ type: 'practice', tag: pMatch ? pMatch[1].replace(/\*+/g, '').trim() : 'Speaking Task', task: questionText, answerKey });
            return;
        }

        if (/^\[[+?*-]\]/.test(line) || (activeHint === 'formulas' && line.includes('|'))) {
            const parts = line.replace(/^[-*•]\s*/, '').split('|').map(s => s.trim());
            let badge = '[*]', label = parts[0] || 'Sentence Pattern';
            const bMatch = label.match(/^(\[[+?*-]\])\s*(.*)$/);
            if (bMatch) { badge = bMatch[1]; label = bMatch[2] || 'Sentence Pattern'; }
            currentSec.blocks.push({ type: 'formula', badge, label: label.replace(/\*+/g, '').trim(), formula: parts[1] || '', example: parts[2] || '', note: parts[3] || '' });
            return;
        }

        const isComparisonLine = /^\[(?:X|Salah|Kaku|Textbook|Formal|Tadi\s*Terucap|In\s*Class|Stiff|Robot)\s*:/i.test(stripped) || (activeHint === 'mistakes' && stripped.includes('|'));
        if (isComparisonLine) {
            const parts = stripped.split('|').map(s => s.trim());
            let leftLbl = 'Stiff / Textbook', rightLbl = 'Natural English', wrong = parts[0] || '', right = parts[1] || '', reason = parts[2] || '';
            const lMatch = wrong.match(/^\[([^:\]]+)\s*:\s*([^\]]+)\]$/) || wrong.match(/^(Salah|Kaku|Formal|Textbook|Avoid|Tadi\s*Terucap|In\s*Class|Stiff)\s*:\s*(.+)$/i);
            const rMatch = right.match(/^\[([^:\]]+)\s*:\s*([^\]]+)\]$/) || right.match(/^(Benar|Natural|Santai|Casual|Native|Say|Versi\s*Natural|Better(?:\s*&\s*Natural)?)\s*:\s*(.+)$/i);
            if (lMatch) { leftLbl = lMatch[1].trim(); wrong = lMatch[2].trim(); }
            if (rMatch) { rightLbl = rMatch[1].trim(); right = rMatch[2].trim(); }
            currentSec.blocks.push({ type: 'comparison', leftLabel: leftLbl, wrong: wrong.replace(/\*+/g, '').trim(), rightLabel: rightLbl, right: right.replace(/\*+/g, '').trim(), reason });
            return;
        }

        const dlgMatch = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
        if (dlgMatch && !stripped.includes('|') && (activeHint === 'dialogue' || /^(?:A|B|Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB]|Person\s*[AB]|Friend\s*[AB]|Partner|Kevin|Sarah|David|Dina|Nadia|Sinta|Raka|Budi|Andi|Alex|Lisa|Tom|Leo|Maya|Emma|Jake|Mia|Sam|Anna|Waiter|Barista|Receptionist|Client|Manager|Boss|You|Kamu|Teman|Tutor|Student|Customer|Officer|Doctor)\b/i.test(dlgMatch[1].trim()))) {
            pushDialogueLine(dlgMatch[1], dlgMatch[2]);
            return;
        }

        if (stripped.includes('|')) {
            const parts = stripped.split('|').map(s => s.trim());
            currentSec.blocks.push({ type: 'phrase', phrase: parts[0].replace(/^\[|\]$|\*+/g, '').trim(), meaning: parts[1]?.replace(/^\[|\]$/g, '').trim() || '', example: parts[2]?.replace(/^\[|\]$/g, '').trim() || '' });
            return;
        }

        if (activeHint === 'warmup' && isBullet) { currentSec.blocks.push({ type: 'warmup', text: stripped }); return; }

        if (isBullet) {
            const { title, body } = extractTitleAndBodyFromLine(stripped);
            if (activeHint === 'phrases' && stripped.includes('=')) {
                const [p, ...r] = stripped.split('=');
                currentSec.blocks.push({ type: 'phrase', phrase: p.replace(/\*+/g, '').trim(), meaning: r.join('=').trim(), example: '' });
            } else currentSec.blocks.push({ type: 'insight', title, body });
        } else {
            const { title, body } = extractTitleAndBodyFromLine(line);
            if (title && line.startsWith('**')) currentSec.blocks.push({ type: 'insight', title, body });
            else currentSec.blocks.push({ type: 'paragraph', text: line, isStory: activeHint === 'story' });
        }
    });

    return data;
}

window.playHandoutTextAudio = (rawSpeech, btnEl) => { const clean = extractEnglishForTTS(rawSpeech); if (clean) window.playNaturalEnglishTTS(clean, btnEl); };
window.playHandoutRegisteredAudio = (prefix, idx, btnEl) => window.playHandoutTextAudio(parsedHandoutCache[prefix]?.allAudioItems?.[idx], btnEl);
window.playHandoutSectionDialogue = (prefix, dlgId, btnEl) => {
    const lines = parsedHandoutCache[prefix]?.allAudioDialogues?.[dlgId] || [];
    if (lines.length) window.playNaturalEnglishTTS(lines.join('\n'), btnEl);
};

window.toggleDialogueBlurMode = function(secDomId, btnEl) {
    const c = document.getElementById(secDomId);
    if (!c) return;
    const next = c.dataset.blurred !== '1';
    c.dataset.blurred = next ? '1' : '0';
    c.querySelectorAll('.dialogue-line-text').forEach(el => { el.classList.toggle('blur-xs', next); el.classList.toggle('select-none', next); });
    if (btnEl) {
        btnEl.innerHTML = next ? `<i class="fas fa-eye mr-1.5"></i> Show Text` : `<i class="fas fa-eye-slash mr-1.5"></i> Blur Text`;
        btnEl.className = next
            ? `px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold transition cursor-pointer`
            : `px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-xs font-extrabold transition cursor-pointer`;
    }
};

window.toggleHandoutAnswer = function(btnEl) {
    const box = document.getElementById(btnEl.dataset.target);
    if (!box) return;
    const isHidden = box.classList.toggle('hidden');
    btnEl.innerHTML = !isHidden ? `<i class="fas fa-eye-slash mr-1"></i> Hide Sample Answer` : `<i class="fas fa-key mr-1"></i> Show Sample Answer`;
    ['presentation', 'recap'].forEach(pref => applyPdfPaperScale(pref));
};

function renderFormulaPillsHTML(formulaStr) {
    if (!formulaStr) return '';
    if (!formulaStr.includes('+')) return `<div class="text-sm sm:text-base font-semibold text-stone-700 leading-relaxed">${formatRichEnglishText(formulaStr)}</div>`;
    const parts = formulaStr.split('+').map(s => s.trim()).filter(Boolean);
    return `<div class="flex flex-wrap items-center gap-1.5 my-1.5">` + parts.map((p, idx) =>
        `<span class="px-3.5 py-1.5 rounded-xl bg-white border border-teal-200 font-extrabold text-xs sm:text-sm text-teal-950 shadow-2xs">${cleanTitleMarkdown(p)}</span>${idx < parts.length - 1 ? `<span class="text-teal-500 font-black text-sm px-0.5">+</span>` : ''}`
    ).join('') + `</div>`;
}

function renderSmartHandout(prefix, rawContent, monthTitle, sessionNumber, docBadge, emptyMsg) {
    const box = document.getElementById(`${prefix}-viewer-box`);
    if (!box) return;
    const trimmed = String(rawContent || '').trim();

    if (!trimmed) {
        parsedHandoutCache[prefix] = null;
        box.innerHTML = `
            <div class="hes-card py-14 text-center space-y-3 border-dashed">
                <div class="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto text-lg"><i class="fas ${prefix === 'recap' ? 'fa-clipboard-list' : 'fa-book-open'}"></i></div>
                <p class="text-xs sm:text-sm font-extrabold text-stone-500">${emptyMsg}</p>
                ${window.HES.userRole === 'admin' ? `<a href="admin.html?tab=materials" class="hes-btn-soft !text-xs"><i class="fas fa-plus mr-1"></i> Isi Materi di Panel Admin</a>` : ''}
            </div>`;
        syncFloatingDockVisibility();
        return;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        parsedHandoutCache[prefix] = null;
        box.innerHTML = `
            <div class="hes-card space-y-4">
                <div class="flex items-center justify-between"><h3 class="text-sm font-extrabold text-stone-800">${docBadge}</h3><a href="${trimmed}" target="_blank" class="hes-btn-soft !py-1.5 !px-3 !text-xs"><i class="fas fa-expand"></i> Buka Link</a></div>
                <iframe src="${parseDriveLink(trimmed)}" class="w-full h-[65vh] rounded-xl border border-stone-200 bg-stone-50"></iframe>
            </div>`;
        syncFloatingDockVisibility();
        return;
    }

    const { week, day } = activeMateriState;
    const data = parseSmartHandoutText(trimmed, `${monthTitle} • Session ${sessionNumber}`, `${monthTitle} • Week ${week}, Day ${day}`);
    parsedHandoutCache[prefix] = data;

    const theme = getSessionThemePalette(sessionNumber, prefix === 'recap', data.style);
    const regAudio = txt => { data.allAudioItems.push(txt); return data.allAudioItems.length - 1; };
    const audioBtn = (aIdx, cls) => `<button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Listen to English Pronunciation" class="w-9 h-9 rounded-full ${cls} flex items-center justify-center transition shrink-0 cursor-pointer"><i class="fas fa-volume-up text-xs"></i></button>`;

    const sectionsHTML = data.sections.map((sec, sIdx) => {
        const domId = `${prefix}-${sec.id}`, num = String(sIdx + 1).padStart(2, '0');
        let insightCounter = 0, practiceCounter = 0, warmupCounter = 0;

        const blocksHTML = sec.blocks.map((b, bIdx) => {
            if (b.type === 'subheading') return `<h4 class="text-base sm:text-lg font-extrabold text-teal-950 pt-3 pb-1 border-b border-teal-100 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-teal-600"></span>${cleanTitleMarkdown(b.text)}</h4>`;
            if (b.type === 'paragraph') return `<p class="${b.isStory ? 'pl-4 sm:pl-5 border-l-4 border-amber-400 ' : ''}text-stone-700 text-base sm:text-[17px] leading-[1.9] font-medium">${formatRichEnglishText(b.text)}</p>`;
            if (b.type === 'callout') {
                return `
                    <div class="my-3 p-5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-teal-50/35 to-white border-l-4 border-amber-500 flex items-start gap-3.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shrink-0 mt-0.5"><i class="fas fa-lightbulb"></i></div>
                        <div class="space-y-1 flex-1">
                            <h5 class="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-900">${cleanTitleMarkdown(b.title)}</h5>
                            <p class="text-sm sm:text-base text-stone-700 leading-[1.85] font-medium">${formatRichEnglishText(b.text)}</p>
                        </div>
                    </div>`;
            }
            if (b.type === 'warmup') {
                warmupCounter++;
                return `
                    <div class="py-3.5 px-4 rounded-2xl bg-amber-50/60 flex items-center justify-between gap-4">
                        <div class="flex items-start gap-3.5">
                            <span class="w-7 h-7 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">${warmupCounter}</span>
                            <p class="text-base sm:text-[17px] font-semibold text-stone-800 leading-relaxed">${formatRichEnglishText(b.text)}</p>
                        </div>
                        ${audioBtn(regAudio(b.text), 'bg-white hover:bg-amber-500 text-amber-700 hover:text-white border border-amber-200')}
                    </div>`;
            }
            if (b.type === 'insight') {
                insightCounter++;
                return `
                    <div class="py-4 border-b border-stone-100 last:border-none flex items-start justify-between gap-4">
                        <div class="flex items-start gap-3.5 flex-1">
                            <span class="w-7 h-7 rounded-xl ${theme.accentBg} text-white text-xs font-black flex items-center justify-center shrink-0 mt-1 shadow-2xs">${insightCounter}</span>
                            <div class="space-y-1 flex-1">
                                ${b.title ? `<h4 class="text-base sm:text-lg font-extrabold text-stone-900">${cleanTitleMarkdown(b.title)}</h4>` : ''}
                                <p class="text-base sm:text-[16.5px] text-stone-700 leading-[1.85] font-medium">${formatRichEnglishText(b.body)}</p>
                            </div>
                        </div>
                        ${audioBtn(regAudio(b.body), 'bg-stone-50 hover:bg-teal-700 text-teal-700 hover:text-white border border-stone-200 mt-1')}
                    </div>`;
            }
            if (b.type === 'formula') {
                const bMap = { '[+]': ['bg-emerald-600', 'border-emerald-500 bg-emerald-50/30', '+'], '[-]': ['bg-rose-600', 'border-rose-500 bg-rose-50/30', '−'], '[?]': ['bg-sky-600', 'border-sky-500 bg-sky-50/30', '?'] };
                const [bBg, lBord, sym] = bMap[b.badge] || ['bg-teal-600', 'border-teal-500 bg-teal-50/30', '★'];
                const { eng: exEng, ind: exInd } = splitBilingualLine(b.example);
                const aIdx = exEng ? regAudio(exEng) : null;
                return `
                    <div class="p-5 rounded-r-2xl border-l-4 ${lBord} flex items-start justify-between gap-4">
                        <div class="space-y-2 flex-1">
                            <div class="flex items-center gap-2.5">
                                <span class="w-6 h-6 rounded-lg ${bBg} text-white font-black text-xs flex items-center justify-center shrink-0">${sym}</span>
                                <span class="text-base font-extrabold text-stone-900">${cleanTitleMarkdown(b.label)}</span>
                            </div>
                            ${b.formula ? renderFormulaPillsHTML(b.formula) : ''}
                            ${exEng ? `<p class="text-base font-bold text-teal-900 leading-[1.75] pt-1">&ldquo;${formatRichEnglishText(exEng)}&rdquo;</p>` : ''}
                            ${exInd || b.note ? `<p class="text-sm font-medium text-stone-600">${formatRichEnglishText(exInd || b.note)}</p>` : ''}
                        </div>
                        ${aIdx !== null ? audioBtn(aIdx, 'bg-white hover:bg-teal-700 text-teal-700 hover:text-white border border-stone-200 shadow-2xs') : ''}
                    </div>`;
            }
            if (b.type === 'phrase') {
                const { eng: pEng } = splitBilingualLine(b.phrase);
                const { eng: exEng, ind: exInd } = splitBilingualLine(b.example);
                const isCueDrill = /^(?:Cue|Situation|Prompt|Drill|Scenario)\b/i.test(b.phrase) || /^(?:Tutor|Question|A)\s*(?:asks)?\s*:/i.test(b.meaning);
                const aIdx = regAudio(isCueDrill ? `${b.meaning}. ${exEng}` : (exEng ? `${pEng}. ${exEng}` : pEng));

                if (isCueDrill) {
                    return `
                        <div class="p-4 sm:p-5 rounded-2xl bg-teal-50/45 border border-teal-100 flex items-start justify-between gap-4">
                            <div class="space-y-2 flex-1">
                                <span class="inline-block px-2.5 py-0.5 rounded-lg bg-teal-100 text-teal-900 text-xs font-extrabold">${cleanTitleMarkdown(b.phrase)}</span>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                                    ${b.meaning ? `<div class="p-3 rounded-xl bg-white border border-stone-200/80 text-sm sm:text-base font-bold text-stone-800">${formatRichEnglishText(b.meaning)}</div>` : ''}
                                    ${exEng ? `<div class="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-sm sm:text-base font-extrabold text-emerald-950">${formatRichEnglishText(exEng)}</div>` : ''}
                                </div>
                            </div>
                            ${audioBtn(aIdx, 'bg-white hover:bg-teal-700 text-teal-700 hover:text-white border border-teal-200 shadow-2xs mt-1')}
                        </div>`;
                }
                return `
                    <div class="py-4 border-b border-stone-100 last:border-none flex items-start justify-between gap-4">
                        <div class="space-y-1.5 flex-1">
                            ${b.phrase ? `<h4 class="text-base sm:text-lg font-extrabold text-teal-900">${cleanTitleMarkdown(b.phrase)}</h4>` : ''}
                            ${b.meaning ? `<p class="text-base font-medium text-stone-600 leading-[1.8]">${formatRichEnglishText(b.meaning)}</p>` : ''}
                            ${exEng ? `<p class="text-sm sm:text-base font-bold text-teal-800 pt-0.5">&ldquo;${formatRichEnglishText(exEng)}&rdquo; ${exInd ? `<span class="font-medium text-stone-500 text-sm">(${escapeHtmlStr(exInd)})</span>` : ''}</p>` : ''}
                        </div>
                        ${audioBtn(aIdx, 'bg-teal-50 hover:bg-teal-700 text-teal-700 hover:text-white mt-1')}
                    </div>`;
            }
            if (b.type === 'comparison') {
                const { eng: rEng, ind: rInd } = splitBilingualLine(b.right);
                return `
                    <div class="p-4 sm:p-5 rounded-2xl bg-stone-50/90 space-y-2.5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div class="p-3.5 rounded-xl bg-rose-50/80 flex items-start gap-3">
                                <span class="w-6 h-6 rounded-full bg-rose-200 text-rose-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">✕</span>
                                <div>
                                    <span class="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">${cleanTitleMarkdown(b.leftLabel)}</span>
                                    <p class="text-sm sm:text-base font-semibold text-stone-600 line-through decoration-rose-400 mt-0.5">${cleanTitleMarkdown(b.wrong)}</p>
                                </div>
                            </div>
                            <div class="p-3.5 rounded-xl bg-emerald-50/90 flex items-center justify-between gap-3">
                                <div class="flex items-start gap-3">
                                    <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">✓</span>
                                    <div>
                                        <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">${cleanTitleMarkdown(b.rightLabel)}</span>
                                        <p class="text-sm sm:text-base font-extrabold text-emerald-950 mt-0.5">${cleanTitleMarkdown(rEng)}</p>
                                        ${rInd ? `<p class="text-xs font-medium text-emerald-800 mt-0.5">${escapeHtmlStr(rInd)}</p>` : ''}
                                    </div>
                                </div>
                                ${audioBtn(regAudio(rEng), 'bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200')}
                            </div>
                        </div>
                        ${b.reason ? `<p class="text-sm font-medium text-stone-600 pl-1"><strong class="text-teal-700">Tip:</strong> ${formatRichEnglishText(b.reason)}</p>` : ''}
                    </div>`;
            }
            if (b.type === 'dialogue') {
                data.allAudioDialogues[b.id] = b.lines.map(l => l.raw);
                const chatBoxId = `${domId}-${b.id}`;
                return `
                    <div class="my-4 space-y-3">
                        <div class="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-4 py-2.5 rounded-2xl border border-stone-200/70">
                            <span class="text-xs font-extrabold text-stone-600"><i class="fas fa-headphones-alt text-teal-600 mr-1.5"></i> Model Conversation (Click any line to listen)</span>
                            <div class="flex flex-wrap items-center gap-2">
                                <button type="button" onclick="toggleDialogueBlurMode('${chatBoxId}', this)" class="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-xs font-extrabold transition cursor-pointer"><i class="fas fa-eye-slash mr-1"></i> Blur Text</button>
                                <button type="button" onclick="playHandoutSectionDialogue('${prefix}', '${b.id}', this)" class="px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"><i class="fas fa-volume-up mr-1"></i> Play Dialogue</button>
                            </div>
                        </div>
                        <div id="${chatBoxId}" data-blurred="0" class="space-y-3 pt-1">
                            ${b.lines.map((l, lIdx) => {
                                const aIdx = regAudio(l.raw);
                                const isMale = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|boss|manager|leo|jake|sam|a)\b/i.test(l.speaker) || (lIdx % 2 === 0);
                                return `
                                    <div class="flex items-start gap-3">
                                        <div class="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 mt-1 ${isMale ? 'bg-teal-700 text-white' : 'bg-amber-500 text-white'}">${l.speaker.charAt(0).toUpperCase()}</div>
                                        <div onclick="this.querySelector('.dialogue-line-text')?.classList.remove('blur-xs')" class="flex-1 p-4 rounded-2xl ${isMale ? 'bg-stone-100/90' : 'bg-teal-50/70'} flex items-start justify-between gap-3 cursor-pointer transition">
                                            <div class="space-y-1">
                                                <span class="text-xs font-extrabold uppercase tracking-wider ${isMale ? 'text-teal-800' : 'text-amber-700'}">${cleanTitleMarkdown(l.speaker)}</span>
                                                <p class="dialogue-line-text text-base font-bold text-stone-800 leading-relaxed transition duration-200">${formatRichEnglishText(l.eng)}</p>
                                                ${l.ind ? `<p class="text-xs sm:text-sm font-medium text-stone-500 italic">${escapeHtmlStr(l.ind)}</p>` : ''}
                                            </div>
                                            <button type="button" onclick="event.stopPropagation(); playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Listen" class="w-8 h-8 rounded-full bg-white hover:bg-teal-700 text-stone-600 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer shadow-2xs"><i class="fas fa-volume-up text-xs"></i></button>
                                        </div>
                                    </div>`;
                            }).join('')}
                        </div>
                    </div>`;
            }
            if (b.type === 'practice') {
                practiceCounter++;
                const ansId = `${domId}_ans_${bIdx}`;
                return `
                    <div class="py-4 border-b border-stone-100 last:border-none flex items-start gap-3.5">
                        <span class="w-7 h-7 rounded-xl bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0 mt-1">${practiceCounter}</span>
                        <div class="space-y-2 flex-1">
                            <span class="inline-block text-[11px] font-extrabold uppercase tracking-wider text-amber-700">${cleanTitleMarkdown(b.tag)}</span>
                            <p class="text-base sm:text-[17px] font-semibold text-stone-800 leading-[1.85]">${formatRichEnglishText(b.task)}</p>
                            ${b.answerKey ? `
                                <div class="pt-1">
                                    <button type="button" data-target="${ansId}" onclick="toggleHandoutAnswer(this)" class="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-extrabold transition cursor-pointer"><i class="fas fa-key mr-1"></i> Show Sample Answer</button>
                                    <div id="${ansId}" class="hidden mt-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-900"><i class="fas fa-check-circle text-emerald-600 mr-1.5"></i> ${formatRichEnglishText(b.answerKey)}</div>
                                </div>` : ''}
                        </div>
                    </div>`;
            }
            return '';
        }).join('');

        return `
            <section id="${domId}" class="space-y-4 scroll-mt-20">
                <div class="flex items-center gap-3">
                    <span class="px-3 py-1 rounded-xl ${theme.badgeBg} font-black text-xs">${num}</span>
                    <h3 class="text-lg sm:text-xl font-extrabold text-stone-900">${cleanTitleMarkdown(sec.title)}</h3>
                </div>
                <div class="space-y-4">${blocksHTML}</div>
            </section>`;
    }).join('');

    box.innerHTML = `
        <div class="flex md:hidden flex-wrap items-center justify-between gap-3 mb-4 bg-white border border-stone-200/90 px-4 py-3.5 rounded-2xl shadow-2xs">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl ${theme.accentBg} text-white flex items-center justify-center text-sm font-black shrink-0"><i class="fas fa-book-open"></i></div>
                <div><p class="text-xs font-extrabold text-stone-800">${docBadge} &bull; Session ${sessionNumber}</p><p class="text-[11px] font-semibold text-stone-400">Ketuk ikon speaker untuk mendengar suara</p></div>
            </div>
            <button onclick="downloadHandoutPDF('${prefix}')" class="bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
                <i class="fas fa-file-pdf"></i> Download PDF
            </button>
        </div>

        <div class="hes-pdf-stage custom-scrollbar">
            <div id="handout-scale-wrap-${prefix}" class="mx-auto relative transition-all duration-150">
                <div id="printable-handout-${prefix}" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="hes-pdf-paper overflow-hidden text-stone-800 relative">
                    <canvas id="annot-canvas-${prefix}" class="hes-annotation-overlay"></canvas>
                    <div class="h-2.5 w-full bg-gradient-to-r ${theme.barGrad}"></div>
                    <div class="relative z-10 p-6 sm:p-10 space-y-9">
                        <div class="space-y-4 border-b border-stone-100 pb-6">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border ${theme.badgeBg}">${cleanTitleMarkdown(data.level)}</span>
                                <span class="text-xs font-bold text-stone-400">&bull; Hamdi English Studio</span>
                            </div>
                            <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight leading-snug">${cleanTitleMarkdown(data.title)}</h1>
                            ${data.goal ? `<div class="p-4 sm:p-5 rounded-2xl ${theme.heroBg} border-l-4 ${theme.heroBorder}"><p class="text-xs font-extrabold uppercase tracking-wider ${theme.accentText} mb-1"><i class="fas fa-bullseye mr-1"></i> Today's Speaking Goal</p><p class="text-base font-semibold text-stone-800 leading-relaxed">${formatRichEnglishText(data.goal)}</p></div>` : ''}
                        </div>
                        <div class="space-y-10">${sectionsHTML}</div>
                        <div class="pt-6 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-400 font-bold">
                            <span>Hamdi English Studio &bull; Friendly Learning Space</span><span>${monthTitle} &bull; Session ${sessionNumber} of 12</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    setTimeout(() => {
        const sheet = document.getElementById(`printable-handout-${prefix}`);
        const annotCanvas = document.getElementById(`annot-canvas-${prefix}`);
        applyPdfPaperScale(prefix);
        if (annotCanvas && window.innerWidth >= 768) {
            resizeAnnotationCanvas(prefix);
            bindInteractiveCanvas(annotCanvas, () => annotationState);
            syncAnnotationStateToActiveTab();
        }
        if (sheet && typeof ResizeObserver !== 'undefined') {
            paperResizeObservers[prefix]?.disconnect();
            paperResizeObservers[prefix] = new ResizeObserver(() => {
                applyPdfPaperScale(prefix);
                resizeAnnotationCanvas(prefix);
            });
            paperResizeObservers[prefix].observe(sheet);
        }
        syncFloatingDockVisibility();
    }, 60);
}

// ============================================================================
// GENERATOR PDF A4 EDITORIAL MAGAZINE
// ============================================================================
function drawHandoutRoundedRect(ctx, x, y, w, h, r, fill, stroke = null, lw = 1) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

const cleanPlainPdfText = s => sanitizeRawInputString(s).replace(/\*+/g, '').replace(/->/g, '→').replace(/\s+/g, ' ').trim();

function wrapPlainLinesStrict(ctx, rawText, maxW, fontStr) {
    ctx.font = fontStr;
    const safeMaxW = Math.max(80, maxW - 10), lines = [];
    String(rawText || '').split('\n').forEach(p => {
        const cleanP = cleanPlainPdfText(p);
        if (!cleanP) return;
        let cur = '';
        cleanP.split(' ').forEach(word => {
            const test = cur ? `${cur} ${word}` : word;
            if (ctx.measureText(test).width <= safeMaxW) cur = test;
            else { if (cur) lines.push(cur); cur = word; }
        });
        if (cur) lines.push(cur);
    });
    return lines;
}

function drawPlainLinesStrict(ctx, lines, x, startY, lineH, maxW, fontStr, color = '#0F172A', strike = false) {
    if (!lines?.length) return startY;
    ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.font = fontStr; ctx.fillStyle = color;
    lines.forEach((line, idx) => {
        const ly = startY + (idx * lineH);
        ctx.fillText(line, x, ly, maxW);
        if (strike && line.trim()) {
            const w = Math.min(maxW, ctx.measureText(line).width);
            ctx.strokeStyle = '#E11D48'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x, ly + lineH * 0.36); ctx.lineTo(x + w, ly + lineH * 0.36); ctx.stroke();
        }
    });
    ctx.restore();
    return startY + (lines.length * lineH);
}

function tokenizeRichPdfParagraph(rawText) {
    const clean = sanitizeRawInputString(rawText).replace(/->/g, '→').replace(/\s+/g, ' ').trim();
    const tokens = [];
    clean.split(/(\*\*[^*]+\*\*|\*"[^"]+"\*|"[^"]+"|\*[^*]+\*)/g).filter(Boolean).forEach(part => {
        let style = 'normal', content = part;
        if (part.startsWith('**') && part.endsWith('**')) { style = 'highlight'; content = part.slice(2, -2).replace(/\*+/g, '').trim(); }
        else if ((part.startsWith('*"') && part.endsWith('"*')) || (part.startsWith('"') && part.endsWith('"'))) { style = 'quote'; content = part.replace(/^\*+|\*+$/g, '').trim(); }
        else if (part.startsWith('*') && part.endsWith('*')) { style = 'italic'; content = part.slice(1, -1).replace(/\*+/g, '').trim(); }
        else content = part.replace(/\*+/g, '');
        content.split(' ').filter(Boolean).forEach(word => tokens.push({ word, style }));
    });
    return tokens;
}

function layoutRichPdfLines(ctx, rawText, maxW, fontSize, fontStack) {
    const safeMaxW = Math.max(100, maxW - 14), lines = [];
    let curLine = [], curW = 0;
    const fontFor = st => st === 'highlight' ? `800 ${fontSize}px ${fontStack}` : (st === 'quote' ? `italic 700 ${fontSize}px ${fontStack}` : (st === 'italic' ? `italic 600 ${fontSize}px ${fontStack}` : `500 ${fontSize}px ${fontStack}`));

    tokenizeRichPdfParagraph(rawText).forEach(tk => {
        ctx.font = fontFor(tk.style);
        const spaceW = curLine.length > 0 ? ctx.measureText(' ').width : 0;
        const wordW = ctx.measureText(tk.word).width + (tk.style === 'highlight' ? 12 : 0);
        if (curW + spaceW + wordW <= safeMaxW || !curLine.length) { curLine.push({ ...tk, width: wordW, spaceBefore: spaceW }); curW += spaceW + wordW; }
        else { lines.push(curLine); curLine = [{ ...tk, width: wordW, spaceBefore: 0 }]; curW = wordW; }
    });
    if (curLine.length) lines.push(curLine);
    return lines;
}

function drawRichPdfLines(ctx, richLines, startX, startY, lineH, fontSize, fontStack, colors = {}) {
    if (!richLines?.length) return startY;
    const normCol = colors.normal || '#334155', hlTxt = colors.highlightText || '#0F172A', hlBg = colors.highlightBg || '#FEF3C7', qCol = colors.quote || '#0F766E';
    ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    richLines.forEach((lineTokens, rowIdx) => {
        let curX = startX, rowY = startY + (rowIdx * lineH);
        lineTokens.forEach(tk => {
            curX += tk.spaceBefore;
            if (tk.style === 'highlight') {
                ctx.font = `800 ${fontSize}px ${fontStack}`;
                drawHandoutRoundedRect(ctx, curX - 2, rowY - 3, ctx.measureText(tk.word).width + 14, fontSize + 10, 8, hlBg);
                ctx.fillStyle = hlTxt; ctx.fillText(tk.word, curX + 5, rowY);
            } else {
                ctx.font = tk.style === 'quote' ? `italic 700 ${fontSize}px ${fontStack}` : (tk.style === 'italic' ? `italic 600 ${fontSize}px ${fontStack}` : `500 ${fontSize}px ${fontStack}`);
                ctx.fillStyle = tk.style === 'quote' ? qCol : normCol;
                ctx.fillText(tk.word, curX, rowY);
            }
            curX += tk.width;
        });
    });
    ctx.restore();
    return startY + (richLines.length * lineH);
}

function createEditorialPDFPage(W, H, fontStack, monthTitle, sessionNumber, pageNum, theme) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), padX = 120;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.fillStyle = theme.pdfSoft; ctx.beginPath(); ctx.arc(W - 40, -40, 220, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    topGrad.addColorStop(0, theme.pdfDark); topGrad.addColorStop(0.5, theme.pdfPrimary); topGrad.addColorStop(1, theme.pdfSecondary);
    ctx.fillStyle = topGrad; ctx.fillRect(0, 0, W, 24);
    ctx.save(); ctx.textBaseline = 'top';
    if (pageNum > 1) {
        ctx.textAlign = 'left'; ctx.fillStyle = '#94A3B8'; ctx.font = `700 20px ${fontStack}`;
        ctx.fillText(`HAMDI ENGLISH STUDIO  •  ${monthTitle.toUpperCase()} (SESSION ${sessionNumber})`, padX, 52);
        ctx.strokeStyle = '#F1F5F9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padX, 88); ctx.lineTo(W - padX, 88); ctx.stroke();
    }
    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padX, H - 115); ctx.lineTo(W - padX, H - 115); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#64748B'; ctx.font = `700 20px ${fontStack}`;
    ctx.fillText(`Hamdi English Studio  •  Friendly Learning Space`, padX, H - 82);
    ctx.textAlign = 'right'; ctx.fillStyle = theme.pdfPrimary; ctx.font = `800 21px ${fontStack}`;
    ctx.fillText(`Page ${pageNum}`, W - padX, H - 82);
    ctx.restore();
    return { canvas, ctx };
}

window.downloadHandoutPDF = async function(prefix = 'presentation') {
    const data = parsedHandoutCache[prefix];
    if (!data) return showToast('Materi belum tersedia untuk diunduh.', 'error');
    const btn = document.getElementById('flt-btn-dl'), origHTML = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-circle-notch fa-spin text-xs"></i>`; }

    try {
        if (document.fonts?.ready) await document.fonts.ready;
        const { monthId, week, day } = activeMateriState;
        const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
        const sessionNumber = ((week - 1) * 3) + day;
        const theme = getSessionThemePalette(sessionNumber, prefix === 'recap', data.style);
        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';
        const W = 1654, H = 2339, padX = 120, contentW = W - (padX * 2), maxY = H - 155, BODY_FONT = 30, BODY_LH = 49;

        const pages = [];
        let pageNum = 1, curPage = createEditorialPDFPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum, theme);
        pages.push(curPage.canvas);
        let ctx = curPage.ctx, y = 85;

        const ensureSpace = neededH => {
            if (y + neededH > maxY) {
                pageNum++;
                curPage = createEditorialPDFPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum, theme);
                pages.push(curPage.canvas);
                ctx = curPage.ctx; y = 120;
            }
        };
        const pdfTxt = (str, x, ty, font, col, align = 'left', base = 'top', maxW = undefined) => {
            ctx.save(); ctx.textBaseline = base; ctx.textAlign = align; ctx.fillStyle = col; ctx.font = font;
            maxW ? ctx.fillText(str, x, ty, maxW) : ctx.fillText(str, x, ty);
            ctx.restore();
        };

        const badgeText = cleanPlainPdfText(`${data.level}  •  SESSION ${sessionNumber}`).toUpperCase();
        ctx.font = `800 20px ${fontStack}`;
        const badgeW = Math.min(contentW, ctx.measureText(badgeText).width + 44);
        drawHandoutRoundedRect(ctx, padX, y, badgeW, 44, 22, theme.pdfSoft, theme.pdfBorder, 2);
        pdfTxt(badgeText, padX + 22, y + 12, `800 20px ${fontStack}`, theme.pdfPrimary, 'left', 'top', badgeW - 44);
        y += 64;

        const titleFont = `800 50px ${fontStack}`;
        y = drawPlainLinesStrict(ctx, wrapPlainLinesStrict(ctx, data.title, contentW, titleFont), padX, y, 64, contentW, titleFont, '#0F172A') + 24;

        if (data.goal) {
            const goalRich = layoutRichPdfLines(ctx, data.goal, contentW - 76, 28, fontStack);
            const goalH = 62 + (goalRich.length * 44);
            drawHandoutRoundedRect(ctx, padX, y, contentW, goalH, 22, theme.pdfSoft);
            drawHandoutRoundedRect(ctx, padX, y, 10, goalH, 5, theme.pdfPrimary);
            pdfTxt("TODAY'S SPEAKING GOAL", padX + 36, y + 18, `800 19px ${fontStack}`, theme.pdfPrimary);
            drawRichPdfLines(ctx, goalRich, padX + 36, y + 48, 44, 28, fontStack, { normal: '#1E293B', quote: theme.pdfPrimary });
            y += goalH + 36;
        }

        ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
        y += 42;

        const drawSectionHeading = (secNum, title, accentColor = theme.pdfPrimary) => {
            const hFont = `800 36px ${fontStack}`, hLines = wrapPlainLinesStrict(ctx, title, contentW - 84, hFont);
            ensureSpace((hLines.length * 46) + 140);
            drawHandoutRoundedRect(ctx, padX, y, 60, 48, 14, accentColor);
            pdfTxt(String(secNum).padStart(2, '0'), padX + 30, y + 24, `800 23px ${fontStack}`, '#FFFFFF', 'center', 'middle');
            y = drawPlainLinesStrict(ctx, hLines, padX + 80, y + 4, 46, contentW - 80, hFont, '#0F172A') + 26;
        };

        const drawNumberedInsightItem = (num, title, body, accentColor = theme.pdfPrimary) => {
            const itemX = padX + 68, itemW = contentW - 68, tFont = `800 31px ${fontStack}`;
            const tLines = title ? wrapPlainLinesStrict(ctx, title, itemW, tFont) : [];
            const bLines = body ? layoutRichPdfLines(ctx, body, itemW, 29, fontStack) : [];
            ensureSpace((tLines.length * 42) + (bLines.length * 47) + 48);
            drawHandoutRoundedRect(ctx, padX, y + 2, 48, 48, 24, theme.pdfSoft, theme.pdfBorder, 2);
            pdfTxt(String(num), padX + 24, y + 26, `800 22px ${fontStack}`, accentColor, 'center', 'middle');
            let cy = y;
            if (tLines.length) cy = drawPlainLinesStrict(ctx, tLines, itemX, cy, 42, itemW, tFont, '#0F172A') + 8;
            if (bLines.length) cy = drawRichPdfLines(ctx, bLines, itemX, cy, 47, 29, fontStack, { normal: '#334155', highlightBg: '#FEF3C7', quote: accentColor });
            y = cy + 24;
            ctx.strokeStyle = '#F1F5F9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(itemX, y); ctx.lineTo(W - padX, y); ctx.stroke();
            y += 24;
        };

        data.sections.forEach((sec, sIdx) => {
            drawSectionHeading(sIdx + 1, sec.title, theme.pdfPrimary);
            let numCounter = 0;
            sec.blocks.forEach(b => {
                if (b.type === 'subheading') {
                    const subFont = `800 31px ${fontStack}`, sLines = wrapPlainLinesStrict(ctx, b.text, contentW, subFont);
                    ensureSpace((sLines.length * 44) + 30); y += 8;
                    y = drawPlainLinesStrict(ctx, sLines, padX, y, 44, contentW, subFont, theme.pdfPrimary) + 18;
                } else if (b.type === 'paragraph') {
                    const tx = b.isStory ? padX + 34 : padX, tw = b.isStory ? contentW - 34 : contentW;
                    const rLines = layoutRichPdfLines(ctx, b.text, tw, BODY_FONT, fontStack), pH = rLines.length * BODY_LH;
                    ensureSpace(pH + 28);
                    if (b.isStory) drawHandoutRoundedRect(ctx, padX, y + 4, 8, pH - 8, 4, '#F59E0B');
                    y = drawRichPdfLines(ctx, rLines, tx, y, BODY_LH, BODY_FONT, fontStack, { normal: '#334155', highlightBg: '#FEF3C7', quote: theme.pdfPrimary }) + 28;
                } else if (b.type === 'callout') {
                    const rLines = layoutRichPdfLines(ctx, b.text, contentW - 76, 28, fontStack), boxH = 68 + (rLines.length * 44);
                    ensureSpace(boxH + 26);
                    drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 20, '#FFFBEB');
                    drawHandoutRoundedRect(ctx, padX, y, 10, boxH, 5, '#F59E0B');
                    pdfTxt(cleanPlainPdfText(b.title).toUpperCase(), padX + 36, y + 18, `800 20px ${fontStack}`, '#B45309');
                    drawRichPdfLines(ctx, rLines, padX + 36, y + 50, 44, 28, fontStack, { normal: '#1E293B', quote: '#B45309' });
                    y += boxH + 26;
                } else if (b.type === 'warmup') { numCounter++; drawNumberedInsightItem(numCounter, '', b.text, '#D97706'); }
                else if (b.type === 'insight') { numCounter++; drawNumberedInsightItem(numCounter, b.title, b.body, theme.pdfPrimary); }
                else if (b.type === 'phrase') { numCounter++; drawNumberedInsightItem(numCounter, b.phrase, (b.meaning || '') + (b.example ? ` — "${b.example}"` : ''), '#0D9488'); }
                else if (b.type === 'formula') {
                    const fLines = wrapPlainLinesStrict(ctx, (b.formula || '').replace(/\+/g, '  +  '), contentW - 72, `800 28px ${fontStack}`);
                    const exLines = b.example ? layoutRichPdfLines(ctx, `"${b.example}"`, contentW - 72, 28, fontStack) : [];
                    const boxH = 82 + (fLines.length * 42) + (exLines.length ? (exLines.length * 44) + 12 : 0);
                    ensureSpace(boxH + 24);
                    drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 20, '#F0FDFA');
                    drawHandoutRoundedRect(ctx, padX, y, 10, boxH, 5, '#0F766E');
                    pdfTxt(cleanPlainPdfText(b.label).toUpperCase(), padX + 36, y + 22, `800 22px ${fontStack}`, '#0F766E', 'left', 'top', contentW - 72);
                    const cy = drawPlainLinesStrict(ctx, fLines, padX + 36, y + 58, 42, contentW - 72, `800 28px ${fontStack}`, '#0F172A');
                    if (exLines.length) drawRichPdfLines(ctx, exLines, padX + 36, cy + 10, 44, 28, fontStack, { quote: '#0F766E' });
                    y += boxH + 26;
                } else if (b.type === 'comparison') {
                    const halfW = Math.floor((contentW - 28) / 2);
                    const wLines = wrapPlainLinesStrict(ctx, b.wrong, halfW - 48, `600 27px ${fontStack}`);
                    const rLines = wrapPlainLinesStrict(ctx, b.right, halfW - 48, `800 27px ${fontStack}`);
                    const whyLines = b.reason ? layoutRichPdfLines(ctx, `Tip: ${b.reason}`, contentW - 20, 26, fontStack) : [];
                    const colH = 74 + (Math.max(wLines.length, rLines.length) * 40);
                    ensureSpace(colH + (whyLines.length ? (whyLines.length * 40) + 18 : 0) + 28);
                    drawHandoutRoundedRect(ctx, padX, y, halfW, colH, 18, '#FFF1F2');
                    pdfTxt(`✕  ${cleanPlainPdfText(b.leftLabel).toUpperCase()}`, padX + 24, y + 20, `800 18px ${fontStack}`, '#E11D48');
                    drawPlainLinesStrict(ctx, wLines, padX + 24, y + 52, 40, halfW - 48, `600 27px ${fontStack}`, '#881337', true);
                    const rightX = padX + halfW + 28;
                    drawHandoutRoundedRect(ctx, rightX, y, halfW, colH, 18, '#ECFDF5');
                    pdfTxt(`✓  ${cleanPlainPdfText(b.rightLabel).toUpperCase()}`, rightX + 24, y + 20, `800 18px ${fontStack}`, '#059669');
                    drawPlainLinesStrict(ctx, rLines, rightX + 24, y + 52, 40, halfW - 48, `800 27px ${fontStack}`, '#064E3B', false);
                    y += colH + 14;
                    if (whyLines.length) y = drawRichPdfLines(ctx, whyLines, padX + 8, y, 40, 26, fontStack, { normal: '#475569' });
                    y += 26;
                } else if (b.type === 'dialogue') {
                    const bubbleW = Math.floor(contentW * 0.84);
                    b.lines.forEach((l, lIdx) => {
                        const isLeft = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|leo|jake|sam|a)\b/i.test(l.speaker) || (lIdx % 2 === 0);
                        const rLines = layoutRichPdfLines(ctx, l.eng + (l.ind ? ` (${l.ind})` : ''), bubbleW - 64, 28, fontStack), bH = 68 + (rLines.length * 44);
                        ensureSpace(bH + 20);
                        const bx = isLeft ? padX : (padX + contentW - bubbleW);
                        drawHandoutRoundedRect(ctx, bx, y, bubbleW, bH, 22, isLeft ? '#F5F5F4' : '#F0FDFA');
                        pdfTxt(cleanPlainPdfText(l.speaker).toUpperCase(), bx + 32, y + 18, `800 19px ${fontStack}`, isLeft ? '#0F766E' : '#D97706');
                        drawRichPdfLines(ctx, rLines, bx + 32, y + 48, 44, 28, fontStack, { normal: '#0F172A' });
                        y += bH + 18;
                    });
                    y += 14;
                } else if (b.type === 'practice') {
                    numCounter++;
                    drawNumberedInsightItem(numCounter, b.tag, b.task + (b.answerKey ? ` (Sample Answer: ${b.answerKey})` : ''), '#D97706');
                }
            });
            y += 16;
        });

        if (window.jspdf?.jsPDF) {
            const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pages.forEach((cv, idx) => { if (idx > 0) pdf.addPage(); pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297); });
            pdf.save(`HES_${monthObj.title.replace(/\s+/g, '')}_Session${sessionNumber}_${cleanPlainPdfText(data.title).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32)}.pdf`);
            showToast('PDF Materi berhasil diunduh!', 'success');
        }
    } catch (e) {
        console.error(e);
        showToast('Gagal membuat PDF.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
};