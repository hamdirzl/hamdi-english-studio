// js/materi.js

let activeMateriState = {
    monthId: 'm1',
    week: 1,
    day: 1
};

let currentVocabItems = [];
let allCardsFlipped = false;

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth();
    if (!session) return;

    parseMateriQueryParams();
    initLayout('Modul Pembelajaran');
    setupQuickSelectors();
    renderMateriContent();

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

    // Render Bilah Pelacak Kompak (Compact Dual-Pill Tracker)
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
    // 1. RENDER INTERACTIVE 3D VOCABULARY FLASHCARDS
    // ====================================================
    const vocabData = getSessionVocabText(monthId, week, day);
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

            allCardsFlipped = false;
            renderFlashcardDeck();

            if (role === 'student') {
                if (!vocabStatus.status || vocabStatus.status === 'none') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium text-center sm:text-left">Sudah menghafal dan menguji pengucapan seluruh kosakata di atas?</p>
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
                vocabActionArea.innerHTML = `<p class="text-xs text-slate-400 italic">Mode Pratinjau Administrator — Ketuk kartu untuk mencoba efek 3D Flip & Suara.</p>`;
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

// Render deretan kartu 3D Flip beserta tombol speaker Text-to-Speech
function renderFlashcardDeck() {
    const container = document.getElementById('vocab-cards-container');
    if (!container) return;

    const btnFlipAll = document.getElementById('btn-flip-all');
    if (btnFlipAll) {
        btnFlipAll.innerHTML = allCardsFlipped
            ? `<i class="fas fa-rotate"></i> <span>Tutup Arti</span>`
            : `<i class="fas fa-rotate"></i> <span>Balik Semua</span>`;
    }

    container.innerHTML = currentVocabItems.map((item, idx) => {
        const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <div class="flip-card ${allCardsFlipped ? 'is-flipped' : ''} perspective-1000 snap-center shrink-0 w-44 sm:w-52 h-40 sm:h-44 cursor-pointer select-none" onclick="flipVocabCard(this)">
                <div class="flip-card-inner">
                    
                    <!-- SISI DEPAN: Bahasa Inggris + Tombol Suara -->
                    <div class="flip-card-front bg-white p-3.5 sm:p-4 border border-slate-200/90 hover:border-indigo-300 shadow-xs flex flex-col justify-between">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">#${item.num}</span>
                            <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white flex items-center justify-center transition shadow-2xs" title="Dengarkan Pengucapan">
                                <i class="fas fa-volume-high text-xs"></i>
                            </button>
                        </div>

                        <div class="my-auto text-center px-1">
                            <p class="font-extrabold text-slate-800 text-sm sm:text-base leading-snug break-words">${item.eng}</p>
                        </div>

                        <div class="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 border-t border-slate-100 pt-2">
                            <i class="fas fa-hand-pointer text-[9px] text-indigo-400"></i>
                            <span>Ketuk untuk balik</span>
                        </div>
                    </div>

                    <!-- SISI BELAKANG: Arti Bahasa Indonesia -->
                    <div class="flip-card-back bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 text-white p-3.5 sm:p-4 border border-indigo-500 shadow-md flex flex-col justify-between">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-extrabold uppercase tracking-wider bg-white/20 text-indigo-100 px-2 py-0.5 rounded-md">Arti Kata</span>
                            <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition" title="Dengarkan Pengucapan">
                                <i class="fas fa-volume-high text-xs"></i>
                            </button>
                        </div>

                        <div class="my-auto text-center px-1">
                            <p class="text-[10px] font-semibold text-indigo-200 truncate mb-0.5">${item.eng}</p>
                            <p class="font-extrabold text-white text-sm sm:text-base leading-snug break-words">${item.ind}</p>
                        </div>

                        <div class="flex items-center justify-center gap-1 text-[10px] font-semibold text-indigo-200 border-t border-white/15 pt-2">
                            <i class="fas fa-rotate-left text-[9px]"></i>
                            <span>Ketuk untuk kembali</span>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }).join('');
}

window.flipVocabCard = function(cardEl) {
    if (!cardEl) return;
    cardEl.classList.toggle('is-flipped');
};

window.toggleFlipAllCards = function() {
    allCardsFlipped = !allCardsFlipped;
    const cards = document.querySelectorAll('#vocab-cards-container .flip-card');
    cards.forEach(c => {
        if (allCardsFlipped) c.classList.add('is-flipped');
        else c.classList.remove('is-flipped');
    });

    const btnFlipAll = document.getElementById('btn-flip-all');
    if (btnFlipAll) {
        btnFlipAll.innerHTML = allCardsFlipped
            ? `<i class="fas fa-rotate"></i> <span>Tutup Arti</span>`
            : `<i class="fas fa-rotate"></i> <span>Balik Semua</span>`;
    }
};

window.shuffleVocabCards = function() {
    if (currentVocabItems.length <= 1) return;
    for (let i = currentVocabItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentVocabItems[i], currentVocabItems[j]] = [currentVocabItems[j], currentVocabItems[i]];
    }
    allCardsFlipped = false;
    renderFlashcardDeck();
    showToast('Urutan kartu kosakata berhasil diacak!', 'info');
};

window.speakVocabWord = function(event, word, btnEl) {
    event.stopPropagation(); // Mencegah kartu ikut terbalik saat hanya menekan tombol suara

    if (!('speechSynthesis' in window)) {
        showToast('Browser Anda belum mendukung fitur suara otomatis.', 'error');
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Sedikit lebih lambat agar artikulasi jelas bagi murid

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