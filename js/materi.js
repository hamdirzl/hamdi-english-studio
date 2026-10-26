// js/materi.js

let activeMateriState = { monthId: 'm1', week: 1, day: 1 };
let activeMateriMode = 'vocab';
let activeVocabSubmode = 'list';
let currentVocabItems = [];
let quizState = { index: 0, score: 0, answered: false };
let parsedHandoutCache = { presentation: null, recap: null };

// State Alat Mengajar Floating (Hanya Aktif di PC / Desktop >= 768px)
let handoutZoomLevel = parseInt(localStorage.getItem('hes_handout_zoom')) || 80;
let sideDockMinimized = false;
let annotationState = {
    active: false,
    tool: 'pen',
    color: '#E11D48',
    size: 3
};
let wbState = {
    tool: 'pen',
    color: '#1D4ED8'
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
    activeMateriMode = mode;
    [
        ['vocab',        '<i class="fas fa-language mr-1.5"></i> Kosakata & Kuis'],
        ['presentation', '<i class="fas fa-book-open mr-1.5"></i> Modul Materi'],
        ['recap',        '<i class="fas fa-file-signature mr-1.5"></i> Catatan Recap']
    ].forEach(([id, label]) => {
        const btn = document.getElementById(`mode-btn-${id}`);
        const active = id === mode;
        if (btn) {
            btn.innerHTML = label;
            btn.className = `py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition border cursor-pointer ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`;
        }
        document.getElementById(`panel-materi-${id}`)?.classList.toggle('hidden', !active);
    });

    syncFloatingDockVisibility();

    if (mode === 'presentation' || mode === 'recap') {
        loadScratchpadNoteForActiveTab();
        setTimeout(() => {
            applyPdfPaperScale(mode);
            resizeAnnotationCanvas(mode);
            syncAnnotationStateToActiveTab();
        }, 60);
    }
};

window.switchVocabSubmode = function(sub) {
    window.stopNaturalEnglishTTS();
    const norm = sub === 'deck' ? 'list' : sub;
    activeVocabSubmode = norm;

    const setSubBtn = (id, label, isAct) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = label;
        el.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${isAct ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
    };
    setSubBtn('submode-deck', '<i class="fas fa-list-ul mr-1"></i> Daftar Kata', norm === 'list');
    setSubBtn('submode-quiz', '<i class="fas fa-gamepad mr-1"></i> Kuis Singkat', norm === 'quiz');

    if (norm === 'quiz') { quizState = { index: 0, score: 0, answered: false }; renderVocabQuiz(); }
    else renderVocabList();
};

function renderMateriContent() {
    const { monthId, week, day } = activeMateriState;
    const email = window.HES.currentUser.email;
    const isStu = window.HES.userRole === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${email}`]?.maxMonth || 1) : 99;

    if (isStu && parseInt(monthId.replace('m', '')) > maxM) activeMateriState.monthId = 'm1';

    const monthObj = window.HES.months.find(m => m.id === activeMateriState.monthId) || { title: 'Month 1' };
    const timeline = isStu ? getStudentCurriculumTimeline(email) : null;
    const dInfo = timeline?.days[`${monthId}-w${week}-d${day}`];
    const currentSessionNumber = ((week - 1) * 3) + day;

    document.getElementById('materi-badge').innerText = monthObj.title;
    document.getElementById('materi-subbadge').innerText = `Minggu ${week} • Hari ${day}`;
    document.getElementById('materi-title').innerText = `Pertemuan ${currentSessionNumber} dari 12 (${monthObj.title})`;

    const qM = document.getElementById('quick-month');
    if (qM) {
        qM.innerHTML = window.HES.months.map(m => {
            const locked = isStu && parseInt(m.id.replace('m', '')) > maxM;
            return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${locked ? ' (Terkunci)' : ''}</option>`;
        }).join('');
        qM.value = monthId;
        qM.onchange = () => window.location.href = `materi.html?month=${qM.value}&week=1&day=1`;
    }

    const stonesEl = document.getElementById('session-stepping-stones');
    if (stonesEl) {
        stonesEl.innerHTML = Array.from({ length: 12 }, (_, i) => {
            const w = Math.floor(i / 3) + 1, d = (i % 3) + 1;
            const info = timeline?.days[`${monthId}-w${w}-d${d}`];
            let cls = 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300';
            if (info?.status === 'completed') cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (info?.status === 'current') cls = 'bg-amber-50 text-amber-900 border-amber-300';
            if (w === week && d === day) cls = 'bg-indigo-600 text-white border-indigo-700 shadow-sm';
            return `<a href="materi.html?month=${monthId}&week=${w}&day=${d}" title="Minggu ${w} Hari ${d} ${info?.shortDate ? `(${info.shortDate})` : ''}" class="py-2 rounded-lg border text-center text-xs font-black transition ${cls}">${i + 1}</a>`;
        }).join('');
    }

    const pill = document.getElementById('materi-date-pill');
    if (pill) {
        pill.classList.toggle('hidden', !dInfo?.shortDate);
        if (dInfo?.shortDate) {
            pill.className = `text-xs font-black px-2.5 py-0.5 rounded-lg ${dInfo.status === 'current' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`;
            pill.innerHTML = `<i class="far fa-calendar mr-1"></i>${dInfo.shortDate}`;
        }
    }

    const lines = getSessionVocabText(monthId, week, day).split('\n').filter(l => l.includes('='));
    document.getElementById('vocab-count-badge').innerText = `${lines.length} Kata`;
    currentVocabItems = lines.map((w, i) => {
        const [eng, ...rest] = w.split('=');
        return { num: i + 1, eng: eng.trim(), ind: rest.join('=').trim() };
    });

    switchVocabSubmode(activeVocabSubmode);

    const st = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none' };
    const actArea = document.getElementById('vocab-action-area');
    if (!isStu) {
        actArea.innerHTML = `<p class="text-xs text-slate-400 font-bold">Mode Pratinjau Admin</p>`;
    } else if (!st.status || st.status === 'none') {
        actArea.innerHTML = `<p class="text-xs font-bold text-slate-500">Sudah lancar semua kosakata di sesi ini?</p><button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="hes-btn-primary w-full sm:w-auto cursor-pointer"><i class="fas fa-check-circle"></i> Tandai Sudah Hafal (+10 XP)</button>`;
    } else if (st.status === 'submitted') {
        actArea.innerHTML = `<span class="text-xs font-black text-amber-800 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl"><i class="fas fa-hourglass-half mr-1"></i> Menunggu Verifikasi Admin (+10 XP)</span>`;
    } else {
        actArea.innerHTML = `<span class="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl"><i class="fas fa-medal mr-1"></i> Hafalan Disetujui (+25 XP) • "${st.feedback || 'Good Job!'}"</span>`;
    }

    const getMat = suffix => window.HES.materials[`${email}-${monthId}-w${week}-d${day}-${suffix}`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-${suffix}`];
    renderSmartHandout('presentation', getMat('link'), monthObj.title, currentSessionNumber, 'Interactive Study Guide', 'Modul materi utama belum diterbitkan untuk pertemuan ini.');
    renderSmartHandout('recap', getMat('recap'), monthObj.title, currentSessionNumber, 'Class Recap & Coaching Notes', 'Catatan rangkuman kelas belum tersedia untuk pertemuan ini.');
    switchMateriMode(activeMateriMode);
}

// ============================================================================
// FLOATING DOCK & FLOATING WHITEBOARD (MELAYANG BEBAS DI LAYAR PC/LAPTOP)
// ============================================================================
function getActiveHandoutPrefix() {
    return activeMateriMode === 'recap' ? 'recap' : 'presentation';
}

function makeElementDraggable(el, handleEl) {
    if (!el || !handleEl) return;
    let isDragging = false, startX = 0, startY = 0, initLeft = 0, initTop = 0;

    handleEl.addEventListener('mousedown', e => {
        if (e.target.closest('button, a, input, textarea')) return;
        isDragging = true;
        const rect = el.getBoundingClientRect();
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        startX = e.clientX;
        startY = e.clientY;
        initLeft = rect.left;
        initTop = rect.top;
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const nx = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, initLeft + (e.clientX - startX)));
        const ny = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, initTop + (e.clientY - startY)));
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
        }
    });
}

function initGlobalFloatingTeachingUI() {
    if (document.getElementById('hes-global-floating-dock')) return;

    const isCollapsed = document.body.classList.contains('hes-sidebar-collapsed');

    const uiHTML = `
        <!-- FLOATING BAR MENGAJAR (MELAYANG DI ATAS LAYAR & BISA DIGESER) -->
        <div id="hes-global-floating-dock" class="hes-floating-dock hidden">
            <!-- Sub-Palet Alat Coret-Coret (Melayang di Sebelah Bar) -->
            <div id="hes-floating-annot-pal" class="hidden hes-floating-dock-body bg-slate-900/95 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl border border-slate-700/90 flex flex-col items-center gap-2 fade-in">
                <button type="button" id="flt-annot-pen" onclick="setAnnotationTool('pen')" title="Pena Tulis" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-white text-slate-900 flex items-center justify-center cursor-pointer"><i class="fas fa-pen"></i></button>
                <button type="button" id="flt-annot-highlighter" onclick="setAnnotationTool('highlighter')" title="Stabilo Transparan" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-slate-800 text-slate-300 flex items-center justify-center cursor-pointer"><i class="fas fa-highlighter"></i></button>
                <button type="button" id="flt-annot-eraser" onclick="setAnnotationTool('eraser')" title="Penghapus Coretan" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-slate-800 text-slate-300 flex items-center justify-center cursor-pointer"><i class="fas fa-eraser"></i></button>
                <button type="button" id="flt-annot-pointer" onclick="setAnnotationTool('pointer')" title="Mode Klik Audio (Tanpa Menghapus Coretan)" class="w-9 h-9 rounded-xl text-xs font-extrabold bg-slate-800 text-slate-300 flex items-center justify-center cursor-pointer"><i class="fas fa-mouse-pointer"></i></button>

                <div class="w-6 h-px bg-slate-700 my-0.5"></div>

                ${[['#E11D48', 'Merah'], ['#2563EB', 'Biru'], ['#059669', 'Hijau'], ['#F59E0B', 'Kuning/Oranye'], ['#0F172A', 'Hitam']].map(([col, lbl]) => `
                    <button type="button" data-color="${col}" onclick="setAnnotationTool(annotationState.tool === 'eraser' ? 'pen' : annotationState.tool, '${col}')" title="Warna ${lbl}" style="background:${col};" class="flt-annot-color w-6 h-6 rounded-full border-2 border-white cursor-pointer transition"></button>
                `).join('')}

                <div class="w-6 h-px bg-slate-700 my-0.5"></div>

                <button type="button" onclick="clearAnnotationCanvas()" title="Bersihkan Semua Coretan" class="w-9 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs flex items-center justify-center cursor-pointer"><i class="fas fa-trash-alt"></i></button>
            </div>

            <!-- Bar Utama Melayang -->
            <div class="flex flex-col items-center gap-1.5">
                <button type="button" onclick="toggleSideDockMinimize()" title="Lipat / Buka Floating Bar" class="w-8 h-8 rounded-full bg-slate-900/90 hover:bg-indigo-600 text-white shadow-lg border border-slate-700 flex items-center justify-center transition cursor-pointer">
                    <i id="flt-dock-min-icon" class="fas fa-chevron-right text-[11px]"></i>
                </button>

                <div class="hes-floating-dock-body bg-slate-900/95 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-col items-center gap-2">
                    <!-- Drag Handle (Geser Posisi Bar) -->
                    <div id="hes-dock-drag-handle" title="Tahan & Geser untuk Memindahkan Posisi Bar" class="w-full py-1 flex items-center justify-center text-slate-500 hover:text-slate-300 cursor-move">
                        <i class="fas fa-grip-lines text-xs"></i>
                    </div>

                    <!-- Zoom In / Zoom Out Kertas -->
                    <button type="button" onclick="changeHandoutZoom(10)" title="Perbesar Kertas (Zoom In)" class="w-10 h-9 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white font-black text-xs flex items-center justify-center transition cursor-pointer">
                        <i class="fas fa-search-plus"></i>
                    </button>
                    <button type="button" onclick="changeHandoutZoom(0, handoutZoomLevel === 80 ? 100 : 80)" title="Klik untuk ganti cepat 80% / 100%" class="w-10 py-1 rounded-lg bg-slate-800/80 text-[11px] font-black text-amber-300 hover:text-white text-center cursor-pointer" id="flt-zoom-label">
                        ${handoutZoomLevel}%
                    </button>
                    <button type="button" onclick="changeHandoutZoom(-10)" title="Perkecil Kertas (Zoom Out)" class="w-10 h-9 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white font-black text-xs flex items-center justify-center transition cursor-pointer">
                        <i class="fas fa-search-minus"></i>
                    </button>

                    <div class="w-7 h-px bg-slate-700 my-0.5"></div>

                    <!-- Coret Kertas -->
                    <button type="button" id="flt-btn-annot" onclick="toggleAnnotationToolbar()" title="Coret-Coret Kertas Materi" class="w-10 h-10 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white flex items-center justify-center transition cursor-pointer">
                        <i class="fas fa-highlighter text-sm"></i>
                    </button>

                    <!-- Jendela Melayang Papan Tulis & Catatan -->
                    <button type="button" id="flt-btn-wb" onclick="toggleWhiteboardDrawer()" title="Buka Jendela Catatan & Papan Tulis" class="w-10 h-10 rounded-xl bg-indigo-500/20 hover:bg-indigo-600 text-indigo-300 hover:text-white flex items-center justify-center transition cursor-pointer">
                        <i class="fas fa-chalkboard-teacher text-sm"></i>
                    </button>

                    <!-- Mode Fokus Mengajar -->
                    <button type="button" onclick="toggleFullScreenReading()" title="Mode Fokus Mengajar (Sembunyikan/Tampilkan Sidebar Kiri)" class="hes-focus-mode-btn w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition cursor-pointer">
                        <i class="fas ${isCollapsed ? 'fa-compress-alt' : 'fa-expand-alt'} text-sm"></i>
                    </button>

                    <div class="w-7 h-px bg-slate-700 my-0.5"></div>

                    <!-- Download PDF -->
                    <button id="flt-btn-dl" onclick="downloadHandoutPDF(getActiveHandoutPrefix())" title="Download PDF A4" class="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-sm transition cursor-pointer">
                        <i class="fas fa-file-pdf text-sm"></i>
                    </button>

                    ${window.HES.userRole === 'admin' ? `
                    <a href="admin.html?tab=materials" title="Edit Materi di Panel Admin" class="w-10 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition">
                        <i class="fas fa-pen text-xs"></i>
                    </a>` : ''}
                </div>
            </div>
        </div>

        <!-- JENDELA MELAYANG PAPAN TULIS & CATATAN (FLOATING WINDOW & BISA DIGESER) -->
        <div id="hes-global-floating-wb" class="hes-floating-wb hidden bg-white/98 backdrop-blur-md border-2 border-indigo-200 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between gap-3 overflow-y-auto custom-scrollbar">
            <div id="hes-wb-drag-handle" class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 shrink-0 cursor-move" title="Tahan & Geser untuk Memindahkan Jendela">
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs"><i class="fas fa-chalkboard"></i></span>
                    <div>
                        <h4 class="text-sm font-extrabold text-slate-800">Catatan & Papan Tulis <i class="fas fa-arrows-alt text-[10px] text-slate-400 ml-1"></i></h4>
                        <p class="text-[10px] font-semibold text-slate-400">Jendela melayang (bisa digeser)</p>
                    </div>
                </div>
                <button type="button" onclick="toggleWhiteboardDrawer()" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center cursor-pointer">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="flex flex-col space-y-1.5 flex-1 min-h-[160px]">
                <div class="flex items-center justify-between">
                    <span class="text-[11px] font-extrabold text-indigo-700 uppercase"><i class="fas fa-keyboard mr-1"></i> Ketik Catatan / Contoh Kalimat</span>
                    <button type="button" onclick="document.getElementById('flt-wb-note').value='';saveLiveScratchpadNote('');" class="text-[11px] font-bold text-slate-400 hover:text-red-500 cursor-pointer">Kosongkan</button>
                </div>
                <textarea id="flt-wb-note" oninput="saveLiveScratchpadNote(this.value)" rows="5" class="hes-input !bg-amber-50/40 !border-amber-200/90 font-semibold text-sm leading-relaxed flex-1 resize-none" placeholder="Ketik catatan mengajar, kosakata tambahan, atau koreksi kalimat murid di sini..."></textarea>
            </div>

            <div class="flex flex-col space-y-1.5 shrink-0">
                <div class="flex flex-wrap items-center justify-between gap-1">
                    <span class="text-[11px] font-extrabold text-emerald-700 uppercase"><i class="fas fa-draw-polygon mr-1"></i> Papan Coret-Coret</span>
                    <div class="flex items-center gap-1">
                        <button type="button" id="flt-wb-pen" onclick="setWhiteboardTool('pen', '#1D4ED8')" class="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-indigo-600 text-white cursor-pointer">Biru</button>
                        <button type="button" onclick="setWhiteboardTool('pen', '#E11D48')" class="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200 cursor-pointer">Merah</button>
                        <button type="button" id="flt-wb-highlighter" onclick="setWhiteboardTool('highlighter', '#F59E0B')" class="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer">Stabilo</button>
                        <button type="button" id="flt-wb-eraser" onclick="setWhiteboardTool('eraser')" class="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-slate-100 text-slate-600 cursor-pointer"><i class="fas fa-eraser"></i></button>
                        <button type="button" onclick="clearWhiteboardCanvas()" class="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-red-50 text-red-600 cursor-pointer"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="relative rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 overflow-hidden">
                    <canvas id="flt-wb-canvas" class="w-full h-[200px] block cursor-crosshair touch-none"></canvas>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', uiHTML);
    makeElementDraggable(document.getElementById('hes-global-floating-dock'), document.getElementById('hes-dock-drag-handle'));
    makeElementDraggable(document.getElementById('hes-global-floating-wb'), document.getElementById('hes-wb-drag-handle'));
}

function syncFloatingDockVisibility() {
    const dock = document.getElementById('hes-global-floating-dock');
    const wb = document.getElementById('hes-global-floating-wb');
    if (!dock) return;

    const pref = getActiveHandoutPrefix();
    const hasContent = Boolean(parsedHandoutCache[pref]);
    const shouldShow = window.innerWidth >= 768 && (activeMateriMode === 'presentation' || activeMateriMode === 'recap') && hasContent;

    dock.classList.toggle('hidden', !shouldShow);
    if (!shouldShow && wb) wb.classList.add('hidden');
}

function applyPdfPaperScale(prefix) {
    const sheet = document.getElementById(`printable-handout-${prefix}`);
    const wrap = document.getElementById(`handout-scale-wrap-${prefix}`);
    const lbl = document.getElementById('flt-zoom-label');
    if (!sheet || !wrap) return;

    if (window.innerWidth < 768) {
        sheet.style.transform = 'none';
        wrap.style.width = '100%';
        wrap.style.height = 'auto';
        return;
    }

    const scale = handoutZoomLevel / 100;
    const baseW = sheet.offsetWidth || 880;
    const baseH = sheet.offsetHeight || 1200;

    sheet.style.transform = `scale(${scale})`;
    wrap.style.width = `${Math.round(baseW * scale)}px`;
    wrap.style.height = `${Math.round(baseH * scale)}px`;
    if (lbl) lbl.innerText = `${handoutZoomLevel}%`;
}

window.changeHandoutZoom = function(delta, exactVal = null) {
    handoutZoomLevel = exactVal !== null ? exactVal : Math.min(130, Math.max(55, handoutZoomLevel + delta));
    localStorage.setItem('hes_handout_zoom', String(handoutZoomLevel));
    ['presentation', 'recap'].forEach(pref => applyPdfPaperScale(pref));
};

window.toggleSideDockMinimize = function() {
    sideDockMinimized = !sideDockMinimized;
    const dock = document.getElementById('hes-global-floating-dock');
    const icon = document.getElementById('flt-dock-min-icon');
    if (dock) dock.classList.toggle('dock-minimized', sideDockMinimized);
    if (icon) icon.className = `fas ${sideDockMinimized ? 'fa-chevron-left' : 'fa-chevron-right'} text-[11px]`;
};

function syncAnnotationStateToActiveTab() {
    const pref = getActiveHandoutPrefix();
    const canvas = document.getElementById(`annot-canvas-${pref}`);
    if (canvas) {
        canvas.classList.toggle('drawing-active', annotationState.active && annotationState.tool !== 'pointer');
    }
}

window.toggleAnnotationToolbar = function() {
    const pal = document.getElementById('hes-floating-annot-pal');
    const btn = document.getElementById('flt-btn-annot');
    if (!pal) return;

    annotationState.active = pal.classList.contains('hidden');
    pal.classList.toggle('hidden', !annotationState.active);

    const pref = getActiveHandoutPrefix();
    resizeAnnotationCanvas(pref);

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
        if (el) {
            el.className = `w-9 h-9 rounded-xl text-xs font-extrabold flex items-center justify-center transition cursor-pointer ${t === tool ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;
        }
    });

    document.querySelectorAll('.flt-annot-color').forEach(btn => {
        btn.classList.toggle('ring-2', btn.dataset.color === annotationState.color);
        btn.classList.toggle('ring-amber-400', btn.dataset.color === annotationState.color);
        btn.classList.toggle('scale-110', btn.dataset.color === annotationState.color);
    });
};

window.clearAnnotationCanvas = function() {
    const pref = getActiveHandoutPrefix();
    const canvas = document.getElementById(`annot-canvas-${pref}`);
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

function resizeAnnotationCanvas(prefix) {
    if (window.innerWidth < 768) return;
    const sheet = document.getElementById(`printable-handout-${prefix}`);
    const canvas = document.getElementById(`annot-canvas-${prefix}`);
    if (!sheet || !canvas) return;

    const w = sheet.offsetWidth || 880;
    const h = sheet.offsetHeight || 1200;
    if (canvas.width === w && canvas.height === h) return;

    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    if (canvas.width > 0 && canvas.height > 0) temp.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = w;
    canvas.height = h;
    if (temp.width > 0 && temp.height > 0) canvas.getContext('2d').drawImage(temp, 0, 0);
}

function bindInteractiveCanvas(canvas, getToolConfig) {
    if (!canvas || canvas.dataset.bound === '1') return;
    canvas.dataset.bound = '1';
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastPos = { x: 0, y: 0 };

    const getPos = e => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: ((clientX - rect.left) / (rect.width || 1)) * canvas.width,
            y: ((clientY - rect.top) / (rect.height || 1)) * canvas.height
        };
    };

    const start = e => {
        const cfg = getToolConfig();
        if (cfg.tool === 'pointer') return;
        if (e.cancelable) e.preventDefault();
        drawing = true;
        lastPos = getPos(e);
    };

    const move = e => {
        if (!drawing) return;
        if (e.cancelable) e.preventDefault();
        const cfg = getToolConfig();
        const pos = getPos(e);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (cfg.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 28;
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (cfg.tool === 'highlighter') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = 24;
            ctx.strokeStyle = cfg.color + '45';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = cfg.color;
        }

        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
        lastPos = pos;
    };

    const stop = () => { drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop);
}

window.toggleWhiteboardDrawer = function() {
    const box = document.getElementById('hes-global-floating-wb');
    const btn = document.getElementById('flt-btn-wb');
    if (!box) return;
    const isOpening = box.classList.contains('hidden');
    box.classList.toggle('hidden', !isOpening);
    if (btn) {
        btn.className = isOpening
            ? 'w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md transition cursor-pointer'
            : 'w-10 h-10 rounded-xl bg-indigo-500/20 hover:bg-indigo-600 text-indigo-300 hover:text-white flex items-center justify-center transition cursor-pointer';
    }
    if (isOpening) {
        loadScratchpadNoteForActiveTab();
        setTimeout(() => initWhiteboardCanvas(), 50);
    }
};

function initWhiteboardCanvas() {
    const canvas = document.getElementById('flt-wb-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width === 0 || canvas.width === 300) {
        canvas.width = Math.max(340, Math.floor(rect.width || 360));
        canvas.height = 200;
    }
    bindInteractiveCanvas(canvas, () => wbState);
}

window.setWhiteboardTool = function(tool, color = null) {
    wbState.tool = tool;
    if (color) wbState.color = color;
    ['pen', 'highlighter', 'eraser'].forEach(t => {
        const el = document.getElementById(`flt-wb-${t}`);
        if (el) el.className = `px-2 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${t === tool ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`;
    });
};

window.clearWhiteboardCanvas = function() {
    const canvas = document.getElementById('flt-wb-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

function loadScratchpadNoteForActiveTab() {
    const noteEl = document.getElementById('flt-wb-note');
    if (!noteEl) return;
    const { monthId, week, day } = activeMateriState;
    const pref = getActiveHandoutPrefix();
    noteEl.value = localStorage.getItem(`hes_note_${pref}_${monthId}_w${week}_d${day}`) || '';
}

window.saveLiveScratchpadNote = function(val) {
    const { monthId, week, day } = activeMateriState;
    const pref = getActiveHandoutPrefix();
    localStorage.setItem(`hes_note_${pref}_${monthId}_w${week}_d${day}`, val);
};

// ============================================================================
// PEMBERSIH TEKS, FILTER SUARA BILINGUAL & TEMA WARNA
// ============================================================================
const sanitizeRawInputString = s => String(s || '').replace(/"font-extrabold[^"]*">/g, '').replace(/"italic text-slate-\d+[^"]*">/g, '').replace(/<[^>]+>/g, '');
const escapeHtmlStr = s => sanitizeRawInputString(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cleanTitleMarkdown = s => escapeHtmlStr(s).replace(/\*+/g, '').replace(/^["']|["']$/g, '').trim();

function splitBilingualLine(str) {
    const clean = String(str || '').trim();
    const match = clean.match(/^(.*?)\s*\(([^()]{3,})\)\s*$/);
    if (match && match[1].trim()) {
        return { eng: match[1].trim(), ind: match[2].trim() };
    }
    return { eng: clean, ind: '' };
}

function extractEnglishForTTS(rawText) {
    let s = sanitizeRawInputString(rawText)
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\*+/g, '')
        .trim();

    const quotes = [...s.matchAll(/"([^"]{2,})"/g)].map(m => m[1].trim());
    if (quotes.length > 0 && s.length > quotes.join(' ').length + 35) {
        return quotes.join('. ');
    }
    if (/\s+(?:—|--|=)\s+/.test(s)) {
        s = s.split(/\s+(?:—|--|=)\s+/)[0].trim();
    }
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
    safe = safe
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-slate-900 bg-amber-100/80 px-1.5 py-0.5 rounded-md">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em class="italic text-slate-800 font-semibold">$1</em>')
        .replace(/\*+/g, '')
        .replace(/@@HES_QUOTE_(\d+)@@/g, (_, idx) => `<span class="font-bold text-indigo-700">&ldquo;${quotes[Number(idx)] || ''}&rdquo;</span>`)
        .replace(/->|→/g, '<i class="fas fa-arrow-right text-indigo-400 mx-1.5 text-xs"></i>');
    return safe;
}

function getSessionThemePalette(sessionNumber, isRecap = false, customStyle = '') {
    if (isRecap) return { name: 'emerald', barGrad: 'from-emerald-700 via-teal-600 to-cyan-500', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', heroBg: 'bg-gradient-to-br from-emerald-50/80 via-teal-50/30 to-white', heroBorder: 'border-emerald-500', accentText: 'text-emerald-700', accentBg: 'bg-emerald-600', pdfPrimary: '#047857', pdfSecondary: '#0D9488', pdfDark: '#064E3B', pdfSoft: '#ECFDF5', pdfBorder: '#A7F3D0', pdfHighlight: '#FEF3C7' };
    const palettes = [
        { name: 'ocean',  barGrad: 'from-blue-800 via-indigo-600 to-sky-500',     badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',     heroBg: 'bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white',   heroBorder: 'border-blue-600',   accentText: 'text-blue-700',   accentBg: 'bg-blue-600',   pdfPrimary: '#1D4ED8', pdfSecondary: '#0284C7', pdfDark: '#0F172A', pdfSoft: '#EFF6FF', pdfBorder: '#BFDBFE', pdfHighlight: '#FEF3C7' },
        { name: 'indigo', barGrad: 'from-indigo-800 via-violet-600 to-purple-500', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200', heroBg: 'bg-gradient-to-br from-indigo-50/80 via-violet-50/30 to-white', heroBorder: 'border-indigo-600', accentText: 'text-indigo-700', accentBg: 'bg-indigo-600', pdfPrimary: '#4338CA', pdfSecondary: '#7C3AED', pdfDark: '#1E1B4B', pdfSoft: '#EEF2FF', pdfBorder: '#C7D2FE', pdfHighlight: '#FEF3C7' },
        { name: 'teal',   barGrad: 'from-teal-800 via-teal-600 to-emerald-500',   badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',     heroBg: 'bg-gradient-to-br from-teal-50/80 via-emerald-50/30 to-white',   heroBorder: 'border-teal-600',   accentText: 'text-teal-700',   accentBg: 'bg-teal-600',   pdfPrimary: '#0F766E', pdfSecondary: '#059669', pdfDark: '#134E4A', pdfSoft: '#F0FDFA', pdfBorder: '#99F6E4', pdfHighlight: '#FEF3C7' },
        { name: 'amber',  barGrad: 'from-amber-700 via-orange-600 to-rose-500',   badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',   heroBg: 'bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-white',   heroBorder: 'border-amber-500',  accentText: 'text-amber-800',  accentBg: 'bg-amber-600',  pdfPrimary: '#B45309', pdfSecondary: '#EA580C', pdfDark: '#451A03', pdfSoft: '#FFFBEB', pdfBorder: '#FDE68A', pdfHighlight: '#E0F2FE' }
    ];
    const st = String(customStyle || '').toLowerCase();
    if (st.includes('indigo') || st.includes('story')) return palettes[1];
    if (st.includes('teal') || st.includes('roleplay') || st.includes('casual')) return palettes[2];
    if (st.includes('amber') || st.includes('warm')) return palettes[3];
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

// ============================================================================
// PARSER BUKU PANDUAN FLEKSIBEL (MENDUKUNG ALUR BEBAS & KOMPATIBEL LAMA)
// ============================================================================
const CLASSIC_HEADER_MAP = [
    [/^(?:STORY|SCENARIO|HOOK|INTRODUCTION|INTRO|CERITA|KONTEKS)\s*:(.*)$/i,                  'story',     'Konteks & Cerita Pembuka'],
    [/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER|PEMANASAN)\s*:(.*)$/i,                                'warmup',    'Pemanasan (Warm-Up)'],
    [/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY|DEEP\s*DIVE|KEY\s*POINTS?|MATERI|PENJELASAN)\s*:(.*)$/i, 'editorial', 'Bedah Konsep & Penjelasan'],
    [/^(?:FORMULAS?|PATTERNS?|GRAMMAR|RULES?|RUMUS|POLA)\s*:(.*)$/i,                          'formulas',  'Pola & Struktur Kalimat'],
    [/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?|WAYS\s*TO\s*SAY|UNGKAPAN|EKSPRESI)\s*:(.*)$/i, 'phrases', 'Ungkapan & Kosakata Penting'],
    [/^(?:EXAMPLES?|SENTENCES?|IN\s*ACTION|CONTOH)\s*:(.*)$/i,                                'examples',  'Contoh Penggunaan'],
    [/^(?:MISTAKES?|COMMON\s*MISTAKES?|COMPARE|UPGRADES?|PERBANDINGAN|KOREKSI)\s*:(.*)$/i,    'mistakes',  'Perbandingan & Koreksi Natural'],
    [/^(?:DIALOGUE|CONVERSATION|ROLEPLAY|PERCAKAPAN|DIALOG)\s*:(.*)$/i,                       'dialogue',  'Percakapan Kontekstual'],
    [/^(?:PRACTICE|EXERCISES?|TASKS?|HOMEWORK|MISSION|QUIZ|YOUR\s*TURN|LATIHAN|TANTANGAN)\s*:(.*)$/i, 'practice', 'Latihan & Tantangan Interaktif']
];

function parseSmartHandoutText(rawText, defaultTitle, defaultLevel) {
    const clean = sanitizeRawInputString(rawText).replace(/\r\n/g, '\n').trim();
    const data = { title: defaultTitle, level: defaultLevel, goal: '', style: '', sections: [], allAudioDialogues: {}, allAudioItems: [] };
    if (!clean) return data;

    let currentSec = null;
    let activeHint = 'editorial';

    const startSec = (hint, title) => {
        activeHint = hint;
        currentSec = {
            id: `sec_${data.sections.length + 1}`,
            hint,
            title: title.replace(/\*+/g, '').trim(),
            blocks: []
        };
        data.sections.push(currentSec);
        return currentSec;
    };

    const pushDialogueLine = (speaker, rawSpeech) => {
        if (!currentSec) startSec('dialogue', 'Percakapan Kontekstual');
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
        if (/^STYLE\s*:/i.test(line)) { data.style = line.replace(/^STYLE\s*:\s*/i, '').trim(); return; }

        if (/^###\s+(.+)$/.test(line)) {
            if (!currentSec) startSec('editorial', 'Pembahasan Materi');
            currentSec.blocks.push({ type: 'subheading', text: line.replace(/^###\s+/, '').replace(/\*+/g, '').trim() });
            return;
        }

        if (/^#{1,2}\s+(.+)$/.test(line) || /^SECTION\s*:\s*(.+)$/i.test(line)) {
            const customTitle = line.replace(/^#{1,2}\s+|^SECTION\s*:\s*/i, '').replace(/\*+/g, '').trim();
            const l = customTitle.toLowerCase();
            let guessedHint = 'editorial';
            if (/warm[\s-]*up|pemanasan|ice[\s-]*breaker/.test(l)) guessedHint = 'warmup';
            else if (/latihan|practice|quiz|tantangan|exercise|mission|uji\s*diri/.test(l)) guessedHint = 'practice';
            else if (/dialog|percakapan|conversation|roleplay/.test(l)) guessedHint = 'dialogue';
            else if (/kesalahan|mistake|jangan\s*bilang|avoid|kaku\s*vs/.test(l)) guessedHint = 'mistakes';
            else if (/rumus|formula|pattern|pola\s*kalimat/.test(l)) guessedHint = 'formulas';
            else if (/ungkapan|ekspresi|phrase|kosakata|idiom|collocation/.test(l)) guessedHint = 'phrases';
            else if (/cerita|story|skenario|konteks/.test(l)) guessedHint = 'story';
            startSec(guessedHint, customTitle);
            return;
        }

        if (/^>\s*(.+)$/.test(line) || /^(?:TIPS?|PRO\s*TIPS?|COACH\s*NOTE|CATATAN|INGAT|NUANSA|CULTURE\s*NOTE|INSIDER\s*TIP)\s*:\s*(.+)$/i.test(line)) {
            if (!currentSec) startSec('editorial', 'Pembahasan Materi');
            let rawCallout = line.replace(/^>\s*/, '');
            let cTitle = 'Catatan Penting & Nuansa';
            const hdrMatch = rawCallout.match(/^(?:TIPS?|PRO\s*TIPS?|COACH\s*NOTE|CATATAN|INGAT|NUANSA|CULTURE\s*NOTE|INSIDER\s*TIP)\s*:\s*(.*)$/i);
            if (hdrMatch) {
                rawCallout = hdrMatch[1].trim();
            } else {
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
                if (rest && !isCustomHeaderTitle) {
                    sec.blocks.push({ type: 'paragraph', text: rest, isStory: hint === 'story' });
                }
                return;
            }
        }

        if (!currentSec) startSec('editorial', 'Panduan Belajar');

        const isBullet = /^[-*•]\s+|\d+[.)]\s+|^\[(?:[+?*-]|X|V|Salah|Benar|Kaku|Natural|Formal|Santai|Casual)\]/i.test(line);
        const isNumbered = /^\d+[.)]\s+/.test(line);
        const stripped = line.replace(/^[-*•]\s*|\d+[.)]\s*/, '').trim();

        const hasAnswerKey = /\((?:Answer|Key|Jawaban|Kunci|Sample Answer|Pembahasan|Hint)\s*:/i.test(line) || /\[(?:Answer|Key|Jawaban|Kunci)\s*:/i.test(line);
        if (hasAnswerKey || (activeHint === 'practice' && (isNumbered || isBullet))) {
            const pMatch = stripped.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
            const { questionText, answerKey } = splitQuestionAndAnswer(pMatch ? pMatch[2].trim() : stripped);
            currentSec.blocks.push({
                type: 'practice',
                tag: pMatch ? pMatch[1].replace(/\*+/g, '').trim() : `Latihan`,
                task: questionText,
                answerKey
            });
            return;
        }

        if (/^\[[+?*-]\]/.test(line) || (activeHint === 'formulas' && line.includes('|'))) {
            const parts = line.replace(/^[-*•]\s*/, '').split('|').map(s => s.trim());
            let badge = '[*]', label = parts[0] || 'Pola Kalimat';
            const bMatch = label.match(/^(\[[+?*-]\])\s*(.*)$/);
            if (bMatch) { badge = bMatch[1]; label = bMatch[2] || 'Pola Kalimat'; }
            currentSec.blocks.push({
                type: 'formula',
                badge,
                label: label.replace(/\*+/g, '').trim(),
                formula: parts[1] || '',
                example: parts[2] || '',
                note: parts[3] || ''
            });
            return;
        }

        const isComparisonLine = /^\[(?:X|Salah|Kaku|Textbook|Formal|Tadi\s*Terucap)\s*:/i.test(stripped) || (activeHint === 'mistakes' && stripped.includes('|'));
        if (isComparisonLine) {
            const parts = stripped.split('|').map(s => s.trim());
            let leftLbl = 'Kurang Tepat / Kaku', rightLbl = 'Lebih Natural (Native)', wrong = parts[0] || '', right = parts[1] || '', reason = parts[2] || '';
            const lMatch = wrong.match(/^\[([^:\]]+)\s*:\s*([^\]]+)\]$/) || wrong.match(/^(Salah|Kaku|Formal|Textbook|Avoid|Tadi\s*Terucap)\s*:\s*(.+)$/i);
            const rMatch = right.match(/^\[([^:\]]+)\s*:\s*([^\]]+)\]$/) || right.match(/^(Benar|Natural|Santai|Casual|Native|Say|Versi\s*Natural)\s*:\s*(.+)$/i);
            if (lMatch) { leftLbl = lMatch[1].trim(); wrong = lMatch[2].trim(); }
            if (rMatch) { rightLbl = rMatch[1].trim(); right = rMatch[2].trim(); }
            currentSec.blocks.push({
                type: 'comparison',
                leftLabel: leftLbl,
                wrong: wrong.replace(/\*+/g, '').trim(),
                rightLabel: rightLbl,
                right: right.replace(/\*+/g, '').trim(),
                reason
            });
            return;
        }

        const dlgMatch = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
        if (dlgMatch && (activeHint === 'dialogue' || /^(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB]|Kevin|Sarah|David|Dina|Nadia|Sinta|Raka|Budi|Andi|Alex|Lisa|Tom|Waiter|Barista|Receptionist|Client|Manager|Boss|You|Kamu|Teman|Tutor|Student|Customer|Officer|Doctor)\b/i.test(dlgMatch[1].trim()))) {
            pushDialogueLine(dlgMatch[1], dlgMatch[2]);
            return;
        }

        if (stripped.includes('|')) {
            const parts = stripped.split('|').map(s => s.trim());
            currentSec.blocks.push({
                type: 'phrase',
                phrase: parts[0].replace(/^\[|\]$|\*+/g, '').trim(),
                meaning: parts[1] || '',
                example: parts[2] || ''
            });
            return;
        }

        if (activeHint === 'warmup' && isBullet) {
            currentSec.blocks.push({ type: 'warmup', text: stripped });
            return;
        }

        if (isBullet) {
            const { title, body } = extractTitleAndBodyFromLine(stripped);
            if (activeHint === 'phrases' && stripped.includes('=')) {
                const [p, ...r] = stripped.split('=');
                currentSec.blocks.push({ type: 'phrase', phrase: p.replace(/\*+/g, '').trim(), meaning: r.join('=').trim(), example: '' });
            } else {
                currentSec.blocks.push({ type: 'insight', title, body });
            }
        } else {
            const { title, body } = extractTitleAndBodyFromLine(line);
            if (title && line.startsWith('**')) {
                currentSec.blocks.push({ type: 'insight', title, body });
            } else {
                currentSec.blocks.push({ type: 'paragraph', text: line, isStory: activeHint === 'story' });
            }
        }
    });

    return data;
}

// ============================================================================
// KONTROL INTERAKTIF HANDOUT & RENDERER WEB
// ============================================================================
window.playHandoutTextAudio = function(rawSpeech, btnEl) {
    const clean = extractEnglishForTTS(rawSpeech);
    if (clean) window.playNaturalEnglishTTS(clean, btnEl);
};
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
    c.querySelectorAll('.dialogue-line-text').forEach(el => {
        el.classList.toggle('blur-xs', next);
        el.classList.toggle('select-none', next);
    });
    if (btnEl) {
        btnEl.innerHTML = next ? `<i class="fas fa-eye mr-1.5"></i> Tampilkan Teks` : `<i class="fas fa-eye-slash mr-1.5"></i> Blur Teks (Latihan Listening)`;
        btnEl.className = next
            ? `px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold transition cursor-pointer shadow-2xs`
            : `px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold transition cursor-pointer`;
    }
};

window.toggleHandoutAnswer = function(btnEl) {
    const box = document.getElementById(btnEl.dataset.target);
    if (!box) return;
    const isHidden = box.classList.toggle('hidden');
    btnEl.innerHTML = !isHidden ? `<i class="fas fa-eye-slash mr-1"></i> Sembunyikan Pembahasan` : `<i class="fas fa-key mr-1"></i> Lihat Kunci & Pembahasan`;
    ['presentation', 'recap'].forEach(pref => applyPdfPaperScale(pref));
};

function renderFormulaPillsHTML(formulaStr) {
    if (!formulaStr) return '';
    if (!formulaStr.includes('+')) return `<div class="text-sm sm:text-base font-semibold text-slate-700 leading-relaxed">${formatRichEnglishText(formulaStr)}</div>`;
    const parts = formulaStr.split('+').map(s => s.trim()).filter(Boolean);
    return `<div class="flex flex-wrap items-center gap-1.5 my-1.5">` + parts.map((p, idx) =>
        `<span class="px-3.5 py-1.5 rounded-xl bg-white border border-indigo-200 font-extrabold text-xs sm:text-sm text-indigo-950 shadow-2xs">${cleanTitleMarkdown(p)}</span>${idx < parts.length - 1 ? `<span class="text-indigo-500 font-black text-sm px-0.5">+</span>` : ''}`
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
                <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto text-lg"><i class="fas ${prefix === 'recap' ? 'fa-clipboard-list' : 'fa-book-open'}"></i></div>
                <p class="text-xs sm:text-sm font-extrabold text-slate-500">${emptyMsg}</p>
                ${window.HES.userRole === 'admin' ? `<a href="admin.html?tab=materials" class="hes-btn-soft !text-xs"><i class="fas fa-plus mr-1"></i> Isi Materi di Panel Admin</a>` : ''}
            </div>`;
        syncFloatingDockVisibility();
        return;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        parsedHandoutCache[prefix] = null;
        box.innerHTML = `
            <div class="hes-card space-y-4">
                <div class="flex items-center justify-between"><h3 class="text-sm font-extrabold text-slate-800">${docBadge}</h3><a href="${trimmed}" target="_blank" class="hes-btn-soft !py-1.5 !px-3 !text-xs"><i class="fas fa-expand"></i> Buka Link</a></div>
                <iframe src="${parseDriveLink(trimmed)}" class="w-full h-[65vh] rounded-xl border border-slate-200 bg-slate-50"></iframe>
            </div>`;
        syncFloatingDockVisibility();
        return;
    }

    const { week, day } = activeMateriState;
    const data = parseSmartHandoutText(trimmed, `${monthTitle} • Session ${sessionNumber}`, `${monthTitle} • Week ${week}, Day ${day}`);
    parsedHandoutCache[prefix] = data;

    const theme = getSessionThemePalette(sessionNumber, prefix === 'recap', data.style);
    const regAudio = txt => { data.allAudioItems.push(txt); return data.allAudioItems.length - 1; };
    const audioBtn = (aIdx, cls) => `<button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan Pelafalan Inggris" class="w-9 h-9 rounded-full ${cls} flex items-center justify-center transition shrink-0 cursor-pointer"><i class="fas fa-volume-up text-xs"></i></button>`;

    const sectionsHTML = data.sections.map((sec, sIdx) => {
        const domId = `${prefix}-${sec.id}`, num = String(sIdx + 1).padStart(2, '0');
        let insightCounter = 0, practiceCounter = 0, warmupCounter = 0;

        const blocksHTML = sec.blocks.map((b, bIdx) => {
            if (b.type === 'subheading') {
                return `<h4 class="text-base sm:text-lg font-extrabold text-indigo-950 pt-3 pb-1 border-b border-indigo-100/80 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-indigo-500"></span>${cleanTitleMarkdown(b.text)}</h4>`;
            }
            if (b.type === 'paragraph') {
                return `<p class="${b.isStory ? 'pl-4 sm:pl-5 border-l-4 border-amber-400 ' : ''}text-slate-700 text-base sm:text-[17px] leading-[1.9] font-medium">${formatRichEnglishText(b.text)}</p>`;
            }
            if (b.type === 'callout') {
                return `
                    <div class="my-3 p-5 rounded-2xl bg-gradient-to-r from-amber-50/90 via-indigo-50/40 to-white border-l-4 border-amber-500 flex items-start gap-3.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shrink-0 mt-0.5"><i class="fas fa-lightbulb"></i></div>
                        <div class="space-y-1 flex-1">
                            <h5 class="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-900">${cleanTitleMarkdown(b.title)}</h5>
                            <p class="text-sm sm:text-base text-slate-700 leading-[1.85] font-medium">${formatRichEnglishText(b.text)}</p>
                        </div>
                    </div>`;
            }
            if (b.type === 'warmup') {
                warmupCounter++;
                const aIdx = regAudio(b.text);
                return `
                    <div class="py-3.5 px-4 rounded-2xl bg-amber-50/60 flex items-center justify-between gap-4">
                        <div class="flex items-start gap-3.5">
                            <span class="w-7 h-7 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">${warmupCounter}</span>
                            <p class="text-base sm:text-[17px] font-semibold text-slate-800 leading-relaxed">${formatRichEnglishText(b.text)}</p>
                        </div>
                        ${audioBtn(aIdx, 'bg-white hover:bg-amber-500 text-amber-700 hover:text-white border border-amber-200')}
                    </div>`;
            }
            if (b.type === 'insight') {
                insightCounter++;
                const hasQuotedEng = /"[^"]{3,}"/.test(b.body);
                const aIdx = hasQuotedEng ? regAudio(b.body) : null;
                return `
                    <div class="py-4 border-b border-slate-100 last:border-none flex items-start justify-between gap-4">
                        <div class="flex items-start gap-3.5 flex-1">
                            <span class="w-7 h-7 rounded-xl ${theme.accentBg} text-white text-xs font-black flex items-center justify-center shrink-0 mt-1 shadow-2xs">${insightCounter}</span>
                            <div class="space-y-1 flex-1">
                                ${b.title ? `<h4 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(b.title)}</h4>` : ''}
                                <p class="text-base sm:text-[16.5px] text-slate-600 leading-[1.85] font-medium">${formatRichEnglishText(b.body)}</p>
                            </div>
                        </div>
                        ${aIdx !== null ? audioBtn(aIdx, 'bg-slate-50 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-slate-200 mt-1') : ''}
                    </div>`;
            }
            if (b.type === 'formula') {
                const bMap = { '[+]': ['bg-emerald-600', 'border-emerald-500 bg-emerald-50/30', '+'], '[-]': ['bg-rose-600', 'border-rose-500 bg-rose-50/30', '−'], '[?]': ['bg-blue-600', 'border-blue-500 bg-blue-50/30', '?'] };
                const [bBg, lBord, sym] = bMap[b.badge] || ['bg-indigo-600', 'border-indigo-500 bg-indigo-50/30', '★'];
                const { eng: exEng, ind: exInd } = splitBilingualLine(b.example);
                const aIdx = exEng ? regAudio(exEng) : null;
                return `
                    <div class="p-5 rounded-r-2xl border-l-4 ${lBord} flex items-start justify-between gap-4">
                        <div class="space-y-2 flex-1">
                            <div class="flex items-center gap-2.5">
                                <span class="w-6 h-6 rounded-lg ${bBg} text-white font-black text-xs flex items-center justify-center shrink-0">${sym}</span>
                                <span class="text-base font-extrabold text-slate-900">${cleanTitleMarkdown(b.label)}</span>
                            </div>
                            ${b.formula ? renderFormulaPillsHTML(b.formula) : ''}
                            ${exEng ? `<p class="text-base font-bold text-indigo-900 leading-[1.75] pt-1">&ldquo;${formatRichEnglishText(exEng)}&rdquo;</p>` : ''}
                            ${exInd || b.note ? `<p class="text-sm font-medium text-slate-600">${formatRichEnglishText(exInd || b.note)}</p>` : ''}
                        </div>
                        ${aIdx !== null ? audioBtn(aIdx, 'bg-white hover:bg-indigo-600 text-indigo-600 hover:text-white border border-slate-200 shadow-2xs') : ''}
                    </div>`;
            }
            if (b.type === 'phrase') {
                const { eng: pEng } = splitBilingualLine(b.phrase);
                const { eng: exEng, ind: exInd } = splitBilingualLine(b.example);
                const aIdx = regAudio(exEng ? `${pEng}. ${exEng}` : pEng);
                return `
                    <div class="py-4 border-b border-slate-100 last:border-none flex items-start justify-between gap-4">
                        <div class="space-y-1.5 flex-1">
                            ${b.phrase ? `<h4 class="text-base sm:text-lg font-extrabold text-teal-900">${cleanTitleMarkdown(b.phrase)}</h4>` : ''}
                            ${b.meaning ? `<p class="text-base font-medium text-slate-600 leading-[1.8]">${formatRichEnglishText(b.meaning)}</p>` : ''}
                            ${exEng ? `<p class="text-sm sm:text-base font-bold text-indigo-700 pt-0.5">&ldquo;${formatRichEnglishText(exEng)}&rdquo; ${exInd ? `<span class="font-medium text-slate-500 text-sm">(${escapeHtmlStr(exInd)})</span>` : ''}</p>` : ''}
                        </div>
                        ${audioBtn(aIdx, 'bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white mt-1')}
                    </div>`;
            }
            if (b.type === 'comparison') {
                const { eng: rEng, ind: rInd } = splitBilingualLine(b.right);
                const aIdx = regAudio(rEng);
                return `
                    <div class="p-4 sm:p-5 rounded-2xl bg-slate-50/80 space-y-2.5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div class="p-3.5 rounded-xl bg-rose-50/80 flex items-start gap-3">
                                <span class="w-6 h-6 rounded-full bg-rose-200 text-rose-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">✕</span>
                                <div>
                                    <span class="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">${cleanTitleMarkdown(b.leftLabel)}</span>
                                    <p class="text-sm sm:text-base font-semibold text-slate-600 line-through decoration-rose-400 mt-0.5">${cleanTitleMarkdown(b.wrong)}</p>
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
                                ${audioBtn(aIdx, 'bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200')}
                            </div>
                        </div>
                        ${b.reason ? `<p class="text-sm font-medium text-slate-600 pl-1"><strong class="text-indigo-600">Penjelasan:</strong> ${formatRichEnglishText(b.reason)}</p>` : ''}
                    </div>`;
            }
            if (b.type === 'dialogue') {
                data.allAudioDialogues[b.id] = b.lines.map(l => l.raw);
                const chatBoxId = `${domId}-${b.id}`;
                return `
                    <div class="my-4 space-y-3">
                        <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200/70">
                            <span class="text-xs font-extrabold text-slate-600"><i class="fas fa-headphones-alt text-indigo-600 mr-1.5"></i> Simulasi Percakapan (Klik balon untuk dengar per kalimat)</span>
                            <div class="flex flex-wrap items-center gap-2">
                                <button type="button" onclick="toggleDialogueBlurMode('${chatBoxId}', this)" class="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold transition cursor-pointer"><i class="fas fa-eye-slash mr-1"></i> Blur Teks</button>
                                <button type="button" onclick="playHandoutSectionDialogue('${prefix}', '${b.id}', this)" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"><i class="fas fa-volume-up mr-1"></i> Putar Dialog</button>
                            </div>
                        </div>
                        <div id="${chatBoxId}" data-blurred="0" class="space-y-3 pt-1">
                            ${b.lines.map((l, lIdx) => {
                                const aIdx = regAudio(l.raw);
                                const isMale = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|boss|manager|leo|a)\b/i.test(l.speaker) || (lIdx % 2 === 0);
                                return `
                                    <div class="flex items-start gap-3">
                                        <div class="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 mt-1 ${isMale ? 'bg-blue-600 text-white' : 'bg-rose-500 text-white'}">${l.speaker.charAt(0).toUpperCase()}</div>
                                        <div onclick="this.querySelector('.dialogue-line-text')?.classList.remove('blur-xs')" class="flex-1 p-4 rounded-2xl ${isMale ? 'bg-slate-100/90' : 'bg-indigo-50/70'} flex items-start justify-between gap-3 cursor-pointer transition">
                                            <div class="space-y-1">
                                                <span class="text-xs font-extrabold uppercase tracking-wider ${isMale ? 'text-blue-700' : 'text-rose-600'}">${cleanTitleMarkdown(l.speaker)}</span>
                                                <p class="dialogue-line-text text-base font-bold text-slate-800 leading-relaxed transition duration-200">${formatRichEnglishText(l.eng)}</p>
                                                ${l.ind ? `<p class="text-xs sm:text-sm font-medium text-slate-500 italic">${escapeHtmlStr(l.ind)}</p>` : ''}
                                            </div>
                                            <button type="button" onclick="event.stopPropagation(); playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan" class="w-8 h-8 rounded-full bg-white hover:bg-indigo-600 text-slate-600 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer shadow-2xs"><i class="fas fa-volume-up text-xs"></i></button>
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
                    <div class="py-4 border-b border-slate-100 last:border-none flex items-start gap-3.5">
                        <span class="w-7 h-7 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-1">${practiceCounter}</span>
                        <div class="space-y-2 flex-1">
                            <span class="inline-block text-[11px] font-extrabold uppercase tracking-wider text-violet-600">${cleanTitleMarkdown(b.tag)}</span>
                            <p class="text-base sm:text-[17px] font-semibold text-slate-800 leading-[1.85]">${formatRichEnglishText(b.task)}</p>
                            ${b.answerKey ? `
                                <div class="pt-1">
                                    <button type="button" data-target="${ansId}" onclick="toggleHandoutAnswer(this)" class="px-3.5 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-extrabold transition cursor-pointer"><i class="fas fa-key mr-1"></i> Lihat Kunci & Pembahasan</button>
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
                    <h3 class="text-lg sm:text-xl font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                </div>
                <div class="space-y-4">
                    ${blocksHTML}
                </div>
            </section>`;
    }).join('');

    box.innerHTML = `
        <!-- KHUSUS HP / MOBILE (md:hidden): HEADER ATAS ORIGINAL -->
        <div class="flex md:hidden flex-wrap items-center justify-between gap-3 mb-4 bg-white border border-slate-200/90 px-4 py-3.5 rounded-2xl shadow-2xs">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl ${theme.accentBg} text-white flex items-center justify-center text-sm font-black shrink-0"><i class="fas fa-book-open"></i></div>
                <div><p class="text-xs font-extrabold text-slate-800">${docBadge} &bull; Session ${sessionNumber}</p><p class="text-[11px] font-semibold text-slate-400">Klik speaker untuk mendengar pelafalan</p></div>
            </div>
            <button onclick="downloadHandoutPDF('${prefix}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
                <i class="fas fa-file-pdf"></i> Download PDF
            </button>
        </div>

        <!-- AREA MATERI (Di PC: Kertas PDF A4 Bisa Di-Zoom; Di HP: Kartu Responsif Original) -->
        <div class="hes-pdf-stage custom-scrollbar">
            <div id="handout-scale-wrap-${prefix}" class="mx-auto relative transition-all duration-150">
                <div id="printable-handout-${prefix}" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="hes-pdf-paper overflow-hidden text-slate-800 relative">
                    <canvas id="annot-canvas-${prefix}" class="hes-annotation-overlay"></canvas>

                    <div class="h-2.5 w-full bg-gradient-to-r ${theme.barGrad}"></div>
                    <div class="relative z-10 p-6 sm:p-10 space-y-9">
                        <div class="space-y-4 border-b border-slate-100 pb-6">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider border ${theme.badgeBg}">${cleanTitleMarkdown(data.level)}</span>
                                    <span class="text-xs font-bold text-slate-400">&bull; Hamdi English Studio</span>
                                </div>
                            </div>
                            <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">${cleanTitleMarkdown(data.title)}</h1>
                            ${data.goal ? `<div class="p-4 sm:p-5 rounded-2xl ${theme.heroBg} border-l-4 ${theme.heroBorder}"><p class="text-xs font-extrabold uppercase tracking-wider ${theme.accentText} mb-1"><i class="fas fa-bullseye mr-1"></i> Target Belajar Hari Ini</p><p class="text-base font-semibold text-slate-800 leading-relaxed">${formatRichEnglishText(data.goal)}</p></div>` : ''}
                        </div>
                        <div class="space-y-10">${sectionsHTML}</div>
                        <div class="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-bold">
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
// GENERATOR PDF A4 EDITORIAL MAGAZINE (MENDUKUNG SEMUA BLOK BUKU BILINGUAL)
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
        if (curW + spaceW + wordW <= safeMaxW || !curLine.length) {
            curLine.push({ ...tk, width: wordW, spaceBefore: spaceW });
            curW += spaceW + wordW;
        } else {
            lines.push(curLine);
            curLine = [{ ...tk, width: wordW, spaceBefore: 0 }];
            curW = wordW;
        }
    });
    if (curLine.length) lines.push(curLine);
    return lines;
}

function drawRichPdfLines(ctx, richLines, startX, startY, lineH, fontSize, fontStack, colors = {}) {
    if (!richLines?.length) return startY;
    const normCol = colors.normal || '#334155', hlTxt = colors.highlightText || '#0F172A', hlBg = colors.highlightBg || '#FEF3C7', qCol = colors.quote || '#1D4ED8';
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
            pdfTxt("TARGET BELAJAR HARI INI", padX + 36, y + 18, `800 19px ${fontStack}`, theme.pdfPrimary);
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
                    const subFont = `800 31px ${fontStack}`;
                    const sLines = wrapPlainLinesStrict(ctx, b.text, contentW, subFont);
                    ensureSpace((sLines.length * 44) + 30);
                    y += 8;
                    y = drawPlainLinesStrict(ctx, sLines, padX, y, 44, contentW, subFont, theme.pdfPrimary) + 18;
                } else if (b.type === 'paragraph') {
                    const tx = b.isStory ? padX + 34 : padX, tw = b.isStory ? contentW - 34 : contentW;
                    const rLines = layoutRichPdfLines(ctx, b.text, tw, BODY_FONT, fontStack), pH = rLines.length * BODY_LH;
                    ensureSpace(pH + 28);
                    if (b.isStory) drawHandoutRoundedRect(ctx, padX, y + 4, 8, pH - 8, 4, '#F59E0B');
                    y = drawRichPdfLines(ctx, rLines, tx, y, BODY_LH, BODY_FONT, fontStack, { normal: '#334155', highlightBg: '#FEF3C7', highlightText: '#0F172A', quote: theme.pdfPrimary }) + 28;
                } else if (b.type === 'callout') {
                    const rLines = layoutRichPdfLines(ctx, b.text, contentW - 76, 28, fontStack);
                    const boxH = 68 + (rLines.length * 44);
                    ensureSpace(boxH + 26);
                    drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 20, '#FFFBEB');
                    drawHandoutRoundedRect(ctx, padX, y, 10, boxH, 5, '#F59E0B');
                    pdfTxt(cleanPlainPdfText(b.title).toUpperCase(), padX + 36, y + 18, `800 20px ${fontStack}`, '#B45309');
                    drawRichPdfLines(ctx, rLines, padX + 36, y + 50, 44, 28, fontStack, { normal: '#1E293B', quote: '#B45309' });
                    y += boxH + 26;
                } else if (b.type === 'warmup') {
                    numCounter++;
                    drawNumberedInsightItem(numCounter, '', b.text, '#D97706');
                } else if (b.type === 'insight') {
                    numCounter++;
                    drawNumberedInsightItem(numCounter, b.title, b.body, theme.pdfPrimary);
                } else if (b.type === 'phrase') {
                    numCounter++;
                    const combined = (b.meaning ? b.meaning : '') + (b.example ? ` — Contoh: "${b.example}"` : '');
                    drawNumberedInsightItem(numCounter, b.phrase, combined, '#0D9488');
                } else if (b.type === 'formula') {
                    const fLines = wrapPlainLinesStrict(ctx, (b.formula || '').replace(/\+/g, '  +  '), contentW - 72, `800 28px ${fontStack}`);
                    const exLines = b.example ? layoutRichPdfLines(ctx, `"${b.example}"`, contentW - 72, 28, fontStack) : [];
                    const boxH = 82 + (fLines.length * 42) + (exLines.length ? (exLines.length * 44) + 12 : 0);
                    ensureSpace(boxH + 24);
                    drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 20, '#EEF2FF');
                    drawHandoutRoundedRect(ctx, padX, y, 10, boxH, 5, '#4338CA');
                    pdfTxt(cleanPlainPdfText(b.label).toUpperCase(), padX + 36, y + 22, `800 22px ${fontStack}`, '#4338CA', 'left', 'top', contentW - 72);
                    let cy = drawPlainLinesStrict(ctx, fLines, padX + 36, y + 58, 42, contentW - 72, `800 28px ${fontStack}`, '#0F172A');
                    if (exLines.length) drawRichPdfLines(ctx, exLines, padX + 36, cy + 10, 44, 28, fontStack, { quote: '#1D4ED8' });
                    y += boxH + 26;
                } else if (b.type === 'comparison') {
                    const halfW = Math.floor((contentW - 28) / 2);
                    const wLines = wrapPlainLinesStrict(ctx, b.wrong, halfW - 48, `600 27px ${fontStack}`);
                    const rLines = wrapPlainLinesStrict(ctx, b.right, halfW - 48, `800 27px ${fontStack}`);
                    const whyLines = b.reason ? layoutRichPdfLines(ctx, `Penjelasan: ${b.reason}`, contentW - 20, 26, fontStack) : [];
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
                        const isLeft = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|leo|a)\b/i.test(l.speaker) || (lIdx % 2 === 0);
                        const fullTxt = l.eng + (l.ind ? ` (${l.ind})` : '');
                        const rLines = layoutRichPdfLines(ctx, fullTxt, bubbleW - 64, 28, fontStack), bH = 68 + (rLines.length * 44);
                        ensureSpace(bH + 20);
                        const bx = isLeft ? padX : (padX + contentW - bubbleW);
                        drawHandoutRoundedRect(ctx, bx, y, bubbleW, bH, 22, isLeft ? '#F1F5F9' : '#EFF6FF');
                        pdfTxt(cleanPlainPdfText(l.speaker).toUpperCase(), bx + 32, y + 18, `800 19px ${fontStack}`, isLeft ? '#1D4ED8' : '#E11D48');
                        drawRichPdfLines(ctx, rLines, bx + 32, y + 48, 44, 28, fontStack, { normal: '#0F172A' });
                        y += bH + 18;
                    });
                    y += 14;
                } else if (b.type === 'practice') {
                    numCounter++;
                    drawNumberedInsightItem(numCounter, b.tag, b.task + (b.answerKey ? ` (Kunci: ${b.answerKey})` : ''), '#7C3AED');
                }
            });
            y += 16;
        });

        if (window.jspdf?.jsPDF) {
            const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pages.forEach((cv, idx) => {
                if (idx > 0) pdf.addPage();
                pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
            });
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

// ============================================================================
// DAFTAR KOSAKATA & KUIS SINGKAT
// ============================================================================
function renderVocabList() {
    const container = document.getElementById('vocab-cards-container');
    if (!container) return;
    if (!currentVocabItems.length) {
        container.innerHTML = `<p class="text-center py-10 text-sm font-bold text-slate-400">Belum ada kosakata untuk sesi ini.</p>`;
        return;
    }
    container.innerHTML = `<div class="max-w-3xl mx-auto fade-in mt-2"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">${currentVocabItems.map(item => {
        const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `<div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all duration-200"><div class="flex flex-col"><span class="text-base font-extrabold text-slate-800">${item.eng}</span><span class="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">${item.ind}</span></div><button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition shrink-0 cursor-pointer"><i class="fas fa-volume-up"></i></button></div>`;
    }).join('')}</div></div>`;
}

function renderVocabQuiz() {
    const container = document.getElementById('vocab-cards-container');
    if (!container || !currentVocabItems.length) return;

    if (quizState.index >= currentVocabItems.length) {
        const pct = Math.round((quizState.score / currentVocabItems.length) * 100);
        container.innerHTML = `<div class="max-w-md mx-auto text-center py-8 px-4 bg-gradient-to-b from-indigo-50/70 to-white rounded-2xl border border-indigo-100 fade-in"><div class="mb-4"><i class="fas fa-trophy text-5xl text-amber-500"></i></div><h4 class="text-xl font-black text-slate-800">Kuis Selesai!</h4><p class="text-sm font-bold text-slate-500 mt-1">Kamu menjawab benar <strong class="text-indigo-600">${quizState.score} dari ${currentVocabItems.length}</strong> kata (${pct}%)</p><div class="mt-6 flex justify-center gap-3"><button onclick="switchVocabSubmode('quiz')" class="hes-btn-primary cursor-pointer"><i class="fas fa-redo"></i> Main Lagi</button><button onclick="switchVocabSubmode('list')" class="hes-btn-soft cursor-pointer">Kembali ke Daftar</button></div></div>`;
        return;
    }

    const cur = currentVocabItems[quizState.index], safeWord = cur.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const pool = currentVocabItems.filter((_, i) => i !== quizState.index).map(x => x.ind);
    ['Meningkatkan', 'Menyelesaikan', 'Kesempatan', 'Mempertimbangkan', 'Lingkungan'].forEach(fb => { if (pool.length < 3) pool.push(fb); });
    const options = [cur.ind, ...pool.sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);

    container.innerHTML = `<div class="max-w-lg mx-auto fade-in"><div class="flex items-center justify-between text-xs font-black text-slate-400 mb-3"><span>Pertanyaan ${quizState.index + 1} / ${currentVocabItems.length}</span><span class="text-emerald-600">Skor: ${quizState.score} Benar</span></div><div class="p-6 rounded-xl bg-indigo-50/70 border border-indigo-100 text-center mb-4"><p class="text-[11px] font-black uppercase text-indigo-500 mb-1">Apa arti dari kata ini?</p><div class="flex items-center justify-center gap-3"><h4 class="text-2xl sm:text-3xl font-black text-slate-800">${cur.eng}</h4><button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center cursor-pointer"><i class="fas fa-volume-up text-xs"></i></button></div></div><div class="grid grid-cols-1 gap-2.5">${options.map(opt => `<button onclick="answerVocabQuiz(this, ${opt === cur.ind})" class="quiz-opt-btn w-full p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 text-left text-xs sm:text-sm font-bold text-slate-700 transition cursor-pointer">${opt}</button>`).join('')}</div></div>`;
}

window.answerVocabQuiz = function(btnEl, isCorrect) {
    if (quizState.answered) return;
    quizState.answered = true;
    if (isCorrect) {
        quizState.score++;
        btnEl.className = "w-full p-3.5 rounded-xl border border-emerald-600 bg-emerald-500 text-white text-left text-xs sm:text-sm font-black";
        btnEl.innerHTML += ` <span class="float-right"><i class="fas fa-check-circle"></i> Benar!</span>`;
    } else {
        btnEl.className = "w-full p-3.5 rounded-xl border border-red-600 bg-red-500 text-white text-left text-xs sm:text-sm font-black animate-shake";
        btnEl.innerHTML += ` <span class="float-right"><i class="fas fa-times-circle"></i> Kurang Tepat</span>`;
    }
    setTimeout(() => { quizState.index++; quizState.answered = false; renderVocabQuiz(); }, 950);
};

window.speakVocabWord = (event, word, btnEl) => { event?.stopPropagation(); window.playNaturalEnglishTTS(word, btnEl); };

window.submitVocab = async function(btn, m, w, d) {
    const email = window.HES.currentUser.email;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    const { error } = await safeSaveMaterialsToCloud(materials => { materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status: 'submitted', feedback: '' }; });
    if (!error) { showToast('Hafalan tercatat! +10 XP', 'success'); renderMateriContent(); }
    else { showToast('Gagal menyimpan: ' + error.message, 'error'); btn.disabled = false; }
};