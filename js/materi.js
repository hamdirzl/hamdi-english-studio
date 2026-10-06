// js/materi.js

let activeMateriState = {
    monthId: 'm1',
    week: 1,
    day: 1
};

let currentVocabItems = [];
let currentCardIndex = 0;
let isCurrentCardFlipped = false;
let isAnimatingSwipe = false;

// Variabel pendeteksi gestur Swipe di layar sentuh (HP)
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth();
    if (!session) return;

    parseMateriQueryParams();
    initLayout('Modul Pembelajaran');
    setupQuickSelectors();
    renderMateriContent();
    setupKeyboardFlashcardShortcuts();

    await syncFromCloud();
    renderAppSidebar();
    setupQuickSelectors();
    renderMateriContent();
});

function parseMateriQueryParams() {
    const params = new URLSearchParams(window.location.search);
    let m = params.get('month');
    let w = parseInt(params.get('week'));
    let d = parseInt(params.get('day'));

    if (!m && window.HES.userRole === 'student' && window.HES.currentUser) {
        const timeline = getStudentCurriculumTimeline(window.HES.currentUser.email);
        if (timeline && timeline.currentPointer) {
            m = timeline.currentPointer.monthId;
            w = timeline.currentPointer.week;
            d = timeline.currentPointer.day;
        }
    }

    activeMateriState = {
        monthId: m || 'm1',
        week: w || 1,
        day: d || 1
    };
}

function setupQuickSelectors() {
    const qMonth = document.getElementById('quick-month');
    const qWeek = document.getElementById('quick-week');
    const qDay = document.getElementById('quick-day');
    if (!qMonth || !qWeek || !qDay) return;

    const role = window.HES.userRole;
    const user = window.HES.currentUser;
    let maxMonthNum = 99;
    let timeline = null;

    if (role === 'student') {
        let p = window.HES.materials[`profile-${user.email}`];
        maxMonthNum = (p && p.maxMonth) ? parseInt(p.maxMonth) : 1;
        timeline = getStudentCurriculumTimeline(user.email);
    }

    const requestedMonthNum = parseInt(activeMateriState.monthId.replace('m', ''));
    if (role === 'student' && requestedMonthNum > maxMonthNum) {
        activeMateriState.monthId = 'm1';
        showToast('Modul bulan tersebut masih terkunci.', 'info');
    }

    qMonth.innerHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonthNum;
        const mInfo = (timeline && timeline.months[m.id]) ? timeline.months[m.id] : null;
        const flagStr = mInfo && mInfo.status === 'current' ? ' • Aktif' : '';
        return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${flagStr}${locked ? ' 🔒' : ''}</option>`;
    }).join('');

    qWeek.innerHTML = [1, 2, 3, 4].map(w => {
        const wKey = `${activeMateriState.monthId}-w${w}`;
        const wInfo = (timeline && timeline.weeks[wKey]) ? timeline.weeks[wKey] : null;
        const rangeStr = (wInfo && wInfo.rangeText) ? ` (${wInfo.rangeText})` : '';
        return `<option value="${w}">W${w}${rangeStr}</option>`;
    }).join('');

    qDay.innerHTML = [1, 2, 3].map(d => {
        const dKey = `${activeMateriState.monthId}-w${activeMateriState.week}-d${d}`;
        const dInfo = (timeline && timeline.days[dKey]) ? timeline.days[dKey] : null;
        const dateStr = (dInfo && dInfo.shortDate) ? ` (${dInfo.shortDate})` : '';
        return `<option value="${d}">D${d}${dateStr}</option>`;
    }).join('');

    qMonth.value = activeMateriState.monthId;
    qWeek.value = String(activeMateriState.week);
    qDay.value = String(activeMateriState.day);

    const handleQuickChange = () => {
        const newM = qMonth.value;
        const newW = qWeek.value;
        const newD = qDay.value;
        window.location.href = `materi.html?month=${newM}&week=${newW}&day=${newD}`;
    };

    qMonth.onchange = handleQuickChange;
    qWeek.onchange = handleQuickChange;
    qDay.onchange = handleQuickChange;
}

function renderMateriContent() {
    const { monthId, week, day } = activeMateriState;
    const email = window.HES.currentUser.email;
    const role = window.HES.userRole;

    const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
    const timeline = role === 'student' ? getStudentCurriculumTimeline(email) : null;
    const dKey = `${monthId}-w${week}-d${day}`;
    const dInfo = timeline && timeline.days[dKey] ? timeline.days[dKey] : null;
    const wInfo = timeline && timeline.weeks[`${monthId}-w${week}`] ? timeline.weeks[`${monthId}-w${week}`] : null;

    document.getElementById('materi-badge').innerText = monthObj.title;
    document.getElementById('materi-subbadge').innerText = `Week ${week}${wInfo && wInfo.rangeText ? ` (${wInfo.rangeText})` : ''} • Day ${day}`;
    document.getElementById('materi-title').innerText = `${monthObj.title} — Minggu ${week} Hari ${day}`;

    // Pill Tanggal & Status pada Header Materi
    const datePill = document.getElementById('materi-date-pill');
    if (datePill && dInfo && dInfo.shortDate) {
        datePill.classList.remove('hidden');
        if (dInfo.status === 'current') {
            datePill.className = "text-[10px] font-extrabold px-2 py-0.5 rounded border bg-emerald-500 text-white border-emerald-600";
            datePill.innerHTML = `<i class="fas fa-location-dot mr-1"></i>${dInfo.shortDate} • Di Sini`;
        } else if (dInfo.status === 'next') {
            datePill.className = "text-[10px] font-extrabold px-2 py-0.5 rounded border bg-amber-500 text-white border-amber-600";
            datePill.innerHTML = `<i class="fas fa-forward mr-1"></i>${dInfo.shortDate} • Selanjutnya`;
        } else if (dInfo.status === 'completed') {
            datePill.className = "text-[10px] font-bold px-2 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200";
            datePill.innerHTML = `<i class="fas fa-check text-emerald-500 mr-1"></i>${dInfo.shortDate}`;
        } else {
            datePill.className = "text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-600 border-indigo-100";
            datePill.innerHTML = `<i class="far fa-calendar mr-1"></i>${dInfo.shortDate}`;
        }
    } else if (datePill) {
        datePill.classList.add('hidden');
    }

    // Render Bilah Pelacak Kompak
    const trackerBanner = document.getElementById('materi-session-tracker-banner');
    if (trackerBanner && timeline && timeline.currentPointer) {
        const cur = timeline.currentPointer;
        const nxt = timeline.nextPointer;
        const isViewingCurrent = (cur.monthId === monthId && cur.week === week && cur.day === day);
        const isViewingNext = (nxt && nxt.monthId === monthId && nxt.week === week && nxt.day === day);

        trackerBanner.classList.remove('hidden');
        trackerBanner.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${isViewingCurrent ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' : 'bg-emerald-50/90 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200'}">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-7 h-7 rounded-lg ${isViewingCurrent ? 'bg-white/20 text-white' : 'bg-emerald-600 text-white'} flex items-center justify-center text-xs shrink-0">
                            <i class="fas fa-location-dot"></i>
                        </span>
                        <div class="min-w-0">
                            <p class="text-[10px] font-extrabold uppercase tracking-wider ${isViewingCurrent ? 'text-emerald-100' : 'text-emerald-700'} leading-none">
                                ${cur.isTodayClass ? 'Kelas Hari Ini' : 'Posisi Saat Ini'}
                            </p>
                            <p class="text-xs font-extrabold truncate mt-0.5">
                                ${cur.monthTitle} • W${cur.week} D${cur.day} <span class="font-semibold opacity-80">(${cur.shortDate})</span>
                            </p>
                        </div>
                    </div>
                    <span class="shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg ml-2 ${isViewingCurrent ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'}">
                        ${isViewingCurrent ? 'Aktif' : 'Buka'}
                    </span>
                </a>

                ${nxt ? `
                <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${isViewingNext ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-amber-50/90 hover:bg-amber-100/70 text-amber-950 border-amber-200'}">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-7 h-7 rounded-lg ${isViewingNext ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'} flex items-center justify-center text-xs shrink-0">
                            <i class="fas fa-forward"></i>
                        </span>
                        <div class="min-w-0">
                            <p class="text-[10px] font-extrabold uppercase tracking-wider ${isViewingNext ? 'text-amber-100' : 'text-amber-700'} leading-none">
                                Pertemuan Berikutnya
                            </p>
                            <p class="text-xs font-extrabold truncate mt-0.5">
                                ${nxt.monthTitle} • W${nxt.week} D${nxt.day} <span class="font-semibold opacity-80">(${nxt.shortDate})</span>
                            </p>
                        </div>
                    </div>
                    <span class="shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg ml-2 ${isViewingNext ? 'bg-white text-amber-700' : 'bg-amber-500 text-white'}">
                        ${isViewingNext ? 'Dibuka' : 'Intip'}
                    </span>
                </a>
                ` : ''}
            </div>
        `;
    } else if (trackerBanner) {
        trackerBanner.classList.add('hidden');
    }

    // ====================================================
    // 1. RENDER INTERACTIVE SINGLE-CARD DECK (SWIPE & LOOP)
    // ====================================================
    const vocabData = typeof getSessionVocabText === 'function'
        ? getSessionVocabText(monthId, week, day)
        : (window.HES.materials[`vocab-${monthId}-w${week}-d${day}`] || '');

    const vocabStatus = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none', feedback: '' };
    const vocabSection = document.getElementById('vocab-section');
    const vocabCountBadge = document.getElementById('vocab-count-badge');
    const vocabActionArea = document.getElementById('vocab-action-area');

    if (vocabData.trim() !== '') {
        const lines = vocabData.split('\n').filter(l => l.includes('='));
        if (lines.length > 0) {
            vocabSection.classList.remove('hidden');
            vocabCountBadge.innerText = `${lines.length} Kata`;

            currentVocabItems = lines.map((w, idx) => {
                const parts = w.split('=');
                return {
                    num: idx + 1,
                    eng: parts[0].trim(),
                    ind: parts.slice(1).join('=').trim()
                };
            });

            if (currentCardIndex >= currentVocabItems.length) {
                currentCardIndex = 0;
            }
            isCurrentCardFlipped = false;
            renderFlashcardDeck();

            if (role === 'student') {
                if (!vocabStatus.status || vocabStatus.status === 'none') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium text-center sm:text-left">Sudah lancar menebak arti & pengucapan semua kartu di atas?</p>
                        <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition">
                            <i class="fas fa-check mr-1.5"></i> Tandai Selesai Dihafal (+10 XP)
                        </button>
                    `;
                } else if (vocabStatus.status === 'submitted') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium">Setoran hafalan Anda telah tercatat (+10 XP).</p>
                        <div class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                            <i class="fas fa-clock"></i> Menunggu Verifikasi Admin
                        </div>
                    `;
                } else {
                    vocabActionArea.innerHTML = `
                        <div class="text-xs text-emerald-700 font-semibold">
                            <i class="fas fa-comment-dots mr-1"></i> Catatan Admin: <strong>"${vocabStatus.feedback || 'Good Job!'}"</strong>
                        </div>
                        <div class="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                            <i class="fas fa-check-circle"></i> Hafalan Terverifikasi (+25 XP)
                        </div>
                    `;
                }
            } else {
                vocabActionArea.innerHTML = `<p class="text-xs text-slate-400 italic">Mode Pratinjau Administrator — Geser kartu ke kiri/kanan atau gunakan tombol panah.</p>`;
            }
        } else {
            vocabSection.classList.add('hidden');
        }
    } else {
        vocabSection.classList.add('hidden');
    }

    // ====================================================
    // 2. RENDER MODUL PRESENTASI & CATATAN RANGKUMAN (PDF)
    // ====================================================
    const rawLink = window.HES.materials[`${email}-${monthId}-w${week}-d${day}-link`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-link`] || '';
    const rawRecap = window.HES.materials[`${email}-${monthId}-w${week}-d${day}-recap`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-recap`] || '';

    const linkDrive = parseDriveLink(rawLink);
    const recapDrive = parseDriveLink(rawRecap);

    const presBox = document.getElementById('presentation-viewer-box');
    const presExt = document.getElementById('presentation-external-link');
    if (linkDrive) {
        presExt.href = rawLink;
        presExt.classList.remove('hidden');
        presBox.innerHTML = `<iframe src="${linkDrive}" class="w-full h-[50vh] md:h-[72vh] rounded-xl border border-slate-200 bg-slate-50" allow="autoplay"></iframe>`;
    } else {
        presExt.classList.add('hidden');
        presBox.innerHTML = `
            <div class="py-12 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                <i class="far fa-file-pdf text-slate-300 text-2xl mb-2"></i>
                <p class="text-slate-400 text-xs font-medium">Modul presentasi belum diunggah untuk sesi ini.</p>
            </div>
        `;
    }

    const recapBox = document.getElementById('recap-viewer-box');
    const recapExt = document.getElementById('recap-external-link');
    if (recapDrive) {
        recapExt.href = rawRecap;
        recapExt.classList.remove('hidden');
        recapBox.innerHTML = `<iframe src="${recapDrive}" class="w-full h-[50vh] md:h-[72vh] rounded-xl border border-slate-200 bg-slate-50" allow="autoplay"></iframe>`;
    } else {
        recapExt.classList.add('hidden');
        recapBox.innerHTML = `
            <div class="py-12 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                <i class="fas fa-clipboard-list text-slate-300 text-2xl mb-2"></i>
                <p class="text-slate-400 text-xs font-medium">Catatan rangkuman belum tersedia untuk sesi ini.</p>
            </div>
        `;
    }
}

// ====================================================
// MESIN SINGLE FLASHCARD DECK (SWIPE + INFINITE LOOP)
// ====================================================
function renderFlashcardDeck(enterAnim = false) {
    const container = document.getElementById('vocab-cards-container');
    if (!container || currentVocabItems.length === 0) return;

    const total = currentVocabItems.length;
    const item = currentVocabItems[currentCardIndex];
    const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    // Indikator titik (dots) di bagian atas kartu
    const dotsHTML = currentVocabItems.map((_, idx) => {
        const active = idx === currentCardIndex;
        return `<button type="button" onclick="jumpToVocabCard(${idx})" class="h-2 rounded-full transition-all ${active ? 'w-7 bg-indigo-600' : 'w-2 bg-slate-200 hover:bg-slate-300'}" title="Kata #${idx + 1}"></button>`;
    }).join('');

    container.innerHTML = `
        <div class="max-w-lg mx-auto px-1 sm:px-4">
            
            <!-- Baris Indikator Posisi & Dots -->
            <div class="flex items-center justify-between mb-3.5 px-1">
                <span class="text-xs font-extrabold text-slate-500">
                    Kartu <strong class="text-indigo-600">${currentCardIndex + 1}</strong> dari ${total}
                </span>
                <div class="flex items-center gap-1.5">
                    ${dotsHTML}
                </div>
            </div>

            <!-- Panggung Tumpukan Kartu 3D -->
            <div class="flashcard-deck-stage mb-7">
                <div id="active-flashcard"
                     class="flip-card ${isCurrentCardFlipped ? 'is-flipped' : ''} ${enterAnim ? 'swipe-in-card' : ''} perspective-1000 w-full h-64 sm:h-72 md:h-80 cursor-pointer select-none"
                     onclick="flipActiveVocabCard()">
                    <div class="flip-card-inner">
                        
                        <!-- SISI DEPAN: Bahasa Inggris (Desain Modern & Besar) -->
                        <div class="flip-card-front bg-gradient-to-br from-white via-white to-indigo-50/50 p-6 sm:p-8 border-2 border-indigo-100 hover:border-indigo-300 shadow-[0_15px_35px_-10px_rgba(79,70,229,0.12)] flex flex-col justify-between relative overflow-hidden">
                            <div class="absolute -right-10 -top-10 w-36 h-36 bg-indigo-500/5 rounded-full blur-xl pointer-events-none"></div>
                            <div class="absolute -left-10 -bottom-10 w-36 h-36 bg-violet-500/5 rounded-full blur-xl pointer-events-none"></div>

                            <!-- Header Kartu Depan -->
                            <div class="flex items-center justify-between relative z-10">
                                <span class="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                    Vocabulary #${item.num}
                                </span>
                                <button type="button"
                                        onclick="speakVocabWord(event, '${safeWord}', this)"
                                        class="w-10 h-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition shadow-md shadow-indigo-200 active:scale-95"
                                        title="Dengarkan Pengucapan">
                                    <i class="fas fa-volume-high text-sm"></i>
                                </button>
                            </div>

                            <!-- Kata Utama di Tengah (Ukuran Besar) -->
                            <div class="my-auto text-center px-2 relative z-10">
                                <p class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">English Word</p>
                                <h4 class="font-extrabold text-slate-800 text-2xl sm:text-3xl md:text-4xl tracking-tight leading-tight break-words">${item.eng}</h4>
                            </div>

                            <!-- Footer Petunjuk Ketuk & Swipe -->
                            <div class="flex items-center justify-between text-[11px] font-bold text-slate-400 border-t border-slate-100 pt-3.5 relative z-10">
                                <span class="flex items-center gap-1.5 text-indigo-500">
                                    <i class="fas fa-rotate"></i> Ketuk kartu untuk arti
                                </span>
                                <span class="flex items-center gap-1 text-slate-400">
                                    <i class="fas fa-arrows-left-right text-[10px]"></i> Geser kiri/kanan
                                </span>
                            </div>
                        </div>

                        <!-- SISI BELAKANG: Arti Bahasa Indonesia (Gradient Indigo-Violet) -->
                        <div class="flip-card-back bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 text-white p-6 sm:p-8 border-2 border-indigo-500 shadow-[0_18px_40px_-10px_rgba(79,70,229,0.35)] flex flex-col justify-between relative overflow-hidden">
                            <div class="absolute right-0 top-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                            <div class="absolute left-0 bottom-0 -mb-10 -ml-10 w-40 h-40 bg-amber-400/15 rounded-full blur-2xl pointer-events-none"></div>

                            <!-- Header Kartu Belakang -->
                            <div class="flex items-center justify-between relative z-10">
                                <span class="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider bg-white/15 text-amber-300 px-3 py-1 rounded-full border border-white/20 backdrop-blur-xs">
                                    <i class="fas fa-lightbulb text-[10px]"></i> Arti Bahasa Indonesia
                                </span>
                                <button type="button"
                                        onclick="speakVocabWord(event, '${safeWord}', this)"
                                        class="w-10 h-10 rounded-2xl bg-white/15 hover:bg-white/25 text-white border border-white/20 flex items-center justify-center transition active:scale-95"
                                        title="Dengarkan Pengucapan">
                                    <i class="fas fa-volume-high text-sm"></i>
                                </button>
                            </div>

                            <!-- Arti Kata di Tengah (Ukuran Besar) -->
                            <div class="my-auto text-center px-2 relative z-10">
                                <p class="text-xs sm:text-sm font-bold text-indigo-200 mb-1.5">${item.eng}</p>
                                <h4 class="font-extrabold text-white text-xl sm:text-2xl md:text-3xl tracking-tight leading-snug break-words">${item.ind}</h4>
                            </div>

                            <!-- Footer Kartu Belakang -->
                            <div class="flex items-center justify-between text-[11px] font-bold text-indigo-200 border-t border-white/15 pt-3.5 relative z-10">
                                <span class="flex items-center gap-1.5">
                                    <i class="fas fa-rotate-left"></i> Ketuk untuk kembali
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="fas fa-arrows-left-right text-[10px]"></i> Geser lanjut
                                </span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <!-- Baris Tombol Navigasi Bawah (Prev • Flip • Next) -->
            <div class="flex items-center justify-center gap-3 sm:gap-4">
                <button type="button"
                        onclick="prevVocabCard()"
                        class="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 flex items-center justify-center transition shadow-2xs active:scale-95"
                        title="Kata Sebelumnya">
                    <i class="fas fa-arrow-left text-sm"></i>
                </button>

                <button type="button"
                        onclick="flipActiveVocabCard()"
                        class="flex-1 max-w-[200px] h-12 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-extrabold text-xs flex items-center justify-center gap-2 transition active:scale-95">
                    <i class="fas fa-rotate"></i>
                    <span>Balik Kartu</span>
                </button>

                <button type="button"
                        onclick="nextVocabCard()"
                        class="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition shadow-md shadow-indigo-200 active:scale-95"
                        title="Kata Berikutnya (Loop)">
                    <i class="fas fa-arrow-right text-sm"></i>
                </button>
            </div>

        </div>
    `;

    attachCardTouchSwipeEvents();
}

function attachCardTouchSwipeEvents() {
    const cardEl = document.getElementById('active-flashcard');
    if (!cardEl) return;

    cardEl.addEventListener('touchstart', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    cardEl.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        const diffX = e.changedTouches[0].screenX - touchStartX;
        const diffY = e.changedTouches[0].screenY - touchStartY;

        // Jika geseran horizontal cukup jauh (> 45px) dan lebih dominan dari geseran vertikal
        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0) {
                // Geser ke kiri -> Kartu Berikutnya
                nextVocabCard();
            } else {
                // Geser ke kanan -> Kartu Sebelumnya
                prevVocabCard();
            }
        }
    }, { passive: true });
}

window.flipActiveVocabCard = function() {
    if (isAnimatingSwipe) return;
    isCurrentCardFlipped = !isCurrentCardFlipped;
    const cardEl = document.getElementById('active-flashcard');
    if (cardEl) {
        if (isCurrentCardFlipped) cardEl.classList.add('is-flipped');
        else cardEl.classList.remove('is-flipped');
    }
};

window.nextVocabCard = function() {
    if (isAnimatingSwipe || currentVocabItems.length === 0) return;
    isAnimatingSwipe = true;

    const cardEl = document.getElementById('active-flashcard');
    if (cardEl) cardEl.classList.add('swipe-out-left');

    setTimeout(() => {
        // Infinite Loop: Jika sudah di kartu terakhir, kembali ke kartu pertama (0)
        currentCardIndex = (currentCardIndex + 1) % currentVocabItems.length;
        isCurrentCardFlipped = false;
        isAnimatingSwipe = false;
        renderFlashcardDeck(true);
    }, 210);
};

window.prevVocabCard = function() {
    if (isAnimatingSwipe || currentVocabItems.length === 0) return;
    isAnimatingSwipe = true;

    const cardEl = document.getElementById('active-flashcard');
    if (cardEl) cardEl.classList.add('swipe-out-right');

    setTimeout(() => {
        // Infinite Loop Mundur: Jika di kartu pertama (0), lompat ke kartu terakhir
        currentCardIndex = (currentCardIndex - 1 + currentVocabItems.length) % currentVocabItems.length;
        isCurrentCardFlipped = false;
        isAnimatingSwipe = false;
        renderFlashcardDeck(true);
    }, 210);
};

window.jumpToVocabCard = function(index) {
    if (isAnimatingSwipe || index === currentCardIndex) return;
    currentCardIndex = index;
    isCurrentCardFlipped = false;
    renderFlashcardDeck(true);
};

window.shuffleVocabCards = function() {
    if (currentVocabItems.length <= 1) return;
    for (let i = currentVocabItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentVocabItems[i], currentVocabItems[j]] = [currentVocabItems[j], currentVocabItems[i]];
    }
    currentCardIndex = 0;
    isCurrentCardFlipped = false;
    renderFlashcardDeck(true);
    showToast('Urutan tumpukan kartu diacak! Mulai dari kartu pertama.', 'info');
};

function setupKeyboardFlashcardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        const vocabSection = document.getElementById('vocab-section');
        if (!vocabSection || vocabSection.classList.contains('hidden')) return;

        if (e.key === 'ArrowRight') {
            nextVocabCard();
        } else if (e.key === 'ArrowLeft') {
            prevVocabCard();
        }
    });
}

window.speakVocabWord = function(event, word, btnEl) {
    event.stopPropagation();

    if (!('speechSynthesis' in window)) {
        showToast('Browser Anda belum mendukung fitur suara otomatis.', 'error');
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;

    if (btnEl) {
        btnEl.classList.add('speaking-pulse');
        utterance.onend = () => btnEl.classList.remove('speaking-pulse');
        utterance.onerror = () => btnEl.classList.remove('speaking-pulse');
    }

    window.speechSynthesis.speak(utterance);
};

window.submitVocab = async function(btnElement, m, w, d) {
    const email = window.HES.currentUser.email;
    const key = `vocab_status-${email}-${m}-w${w}-d${d}`;
    window.HES.materials[key] = { status: 'submitted', feedback: '' };

    const origText = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Mengirim...';
    btnElement.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    if (error) {
        showToast('Gagal mengirim status hafalan: ' + error.message, 'error');
        btnElement.innerHTML = origText;
        btnElement.disabled = false;
    } else {
        showToast('Status hafalan berhasil dikirim ke Admin!', 'success');
        renderMateriContent();
    }
};