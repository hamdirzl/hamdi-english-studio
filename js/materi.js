// js/materi.js

let activeMateriState = { monthId: 'm1', week: 1, day: 1 };
let activeMateriMode = 'vocab'; // 'vocab' | 'presentation' | 'recap'
let activeVocabSubmode = 'deck'; // 'deck' | 'quiz'

let currentVocabItems = [], currentCardIndex = 0, isCurrentCardFlipped = false, isAnimatingSwipe = false;
let quizState = { index: 0, score: 0, answered: false };
let touchStartX = 0, touchStartY = 0;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    parseMateriQueryParams();
    initLayout('Ruang Belajar');
    renderMateriContent();

    document.addEventListener('keydown', e => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (activeMateriMode === 'vocab' && activeVocabSubmode === 'deck') {
            if (e.key === 'ArrowRight') nextVocabCard();
            if (e.key === 'ArrowLeft') prevVocabCard();
        }
    });

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

// Navigasi 1-Klik Pertemuan Sebelumnya (-1) atau Selanjutnya (+1)
window.navigateAdjacentSession = function(step) {
    const { monthId, week, day } = activeMateriState;
    let sessionIdx = ((week - 1) * 3) + (day - 1) + step; // 0..11
    let mNum = parseInt(monthId.replace('m', ''));
    const isStu = window.HES.userRole === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${window.HES.currentUser.email}`]?.maxMonth || 1) : window.HES.months.length;

    if (sessionIdx < 0) {
        if (mNum > 1) { mNum--; sessionIdx = 11; }
        else return showToast('Ini adalah pertemuan pertama di Month 1.', 'info');
    } else if (sessionIdx > 11) {
        if (mNum < maxM && mNum < window.HES.months.length) { mNum++; sessionIdx = 0; }
        else return showToast('Kamu sudah di pertemuan terakhir bulan ini! Yuk lanjut ke Final Exam 🏆', 'info');
    }

    const newW = Math.floor(sessionIdx / 3) + 1;
    const newD = (sessionIdx % 3) + 1;
    window.location.href = `materi.html?month=m${mNum}&week=${newW}&day=${newD}`;
};

window.switchMateriMode = function(mode) {
    activeMateriMode = mode;
    const cfg = [
        { id: 'vocab',        label: '🎴 Kosakata & Kuis' },
        { id: 'presentation', label: '📖 Modul Materi' },
        { id: 'recap',        label: '📝 Catatan Recap' }
    ];
    cfg.forEach(c => {
        const btn = document.getElementById(`mode-btn-${c.id}`);
        const panel = document.getElementById(`panel-materi-${c.id}`);
        const active = c.id === mode;
        if (btn) {
            btn.innerHTML = c.label;
            btn.className = `py-3 px-3 rounded-2xl text-xs sm:text-sm font-black transition border-2 border-b-4 ${active ? 'bg-indigo-600 text-white border-indigo-800 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`;
        }
        if (panel) panel.classList.toggle('hidden', !active);
    });
};

window.switchVocabSubmode = function(sub) {
    activeVocabSubmode = sub;
    document.getElementById('submode-deck').className = `px-3 py-1.5 rounded-lg text-xs font-black transition ${sub === 'deck' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'}`;
    document.getElementById('submode-quiz').className = `px-3 py-1.5 rounded-lg text-xs font-black transition ${sub === 'quiz' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'}`;

    if (sub === 'quiz') {
        quizState = { index: 0, score: 0, answered: false };
        renderVocabQuiz();
    } else {
        renderFlashcardDeck();
    }
};

function renderMateriContent() {
    const { monthId, week, day } = activeMateriState;
    const email = window.HES.currentUser.email;
    const isStu = window.HES.userRole === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${email}`]?.maxMonth || 1) : 99;

    if (isStu && parseInt(monthId.replace('m', '')) > maxM) {
        activeMateriState.monthId = 'm1';
    }

    const monthObj = window.HES.months.find(m => m.id === activeMateriState.monthId) || { title: 'Month 1' };
    const timeline = isStu ? getStudentCurriculumTimeline(email) : null;
    const dInfo = timeline?.days[`${monthId}-w${week}-d${day}`];
    const currentSessionNumber = ((week - 1) * 3) + day;

    document.getElementById('materi-badge').innerText = monthObj.title;
    document.getElementById('materi-subbadge').innerText = `Minggu ${week} • Hari ${day}`;
    document.getElementById('materi-title').innerText = `Pertemuan ${currentSessionNumber} dari 12 (${monthObj.title})`;

    // Dropdown Bulan & Bar 12 Pertemuan (1-Klik)
    const qM = document.getElementById('quick-month');
    if (qM) {
        qM.innerHTML = window.HES.months.map(m => {
            const locked = isStu && parseInt(m.id.replace('m', '')) > maxM;
            return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${locked ? ' 🔒' : ''}</option>`;
        }).join('');
        qM.value = monthId;
        qM.onchange = () => window.location.href = `materi.html?month=${qM.value}&week=1&day=1`;
    }

    const stonesEl = document.getElementById('session-stepping-stones');
    if (stonesEl) {
        let stonesHTML = '';
        for (let i = 0; i < 12; i++) {
            const w = Math.floor(i / 3) + 1, d = (i % 3) + 1;
            const info = timeline?.days[`${monthId}-w${w}-d${d}`];
            const isSelected = (w === week && d === day);
            let cls = 'bg-slate-100 text-slate-600 border-slate-200 hover:border-indigo-300';
            if (info?.status === 'completed') cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (info?.status === 'current') cls = 'bg-amber-100 text-amber-900 border-amber-300';
            if (isSelected) cls = 'bg-indigo-600 text-white border-indigo-800 scale-105 shadow-xs';

            stonesHTML += `
                <a href="materi.html?month=${monthId}&week=${w}&day=${d}" title="Minggu ${w} Hari ${d} ${info?.shortDate ? `(${info.shortDate})` : ''}" class="py-2 rounded-xl border-2 text-center text-xs font-black transition ${cls}">
                    ${i + 1}
                </a>`;
        }
        stonesEl.innerHTML = stonesHTML;
    }

    const pill = document.getElementById('materi-date-pill');
    if (pill && dInfo?.shortDate) {
        pill.classList.remove('hidden');
        pill.className = `text-xs font-black px-2.5 py-0.5 rounded-lg ${dInfo.status === 'current' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`;
        pill.innerHTML = `<i class="far fa-calendar mr-1"></i>${dInfo.shortDate}`;
    } else if (pill) pill.classList.add('hidden');

    // Muat Data Kosakata
    const vocabData = getSessionVocabText(monthId, week, day);
    const lines = vocabData.split('\n').filter(l => l.includes('='));
    document.getElementById('vocab-count-badge').innerText = `${lines.length} Kata`;

    currentVocabItems = lines.map((w, i) => {
        const [eng, ...rest] = w.split('=');
        return { num: i + 1, eng: eng.trim(), ind: rest.join('=').trim() };
    });
    if (currentCardIndex >= currentVocabItems.length) currentCardIndex = 0;
    isCurrentCardFlipped = false;

    switchVocabSubmode(activeVocabSubmode);
    switchMateriMode(activeMateriMode);

    // Status Setor Hafalan
    const st = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none' };
    const actArea = document.getElementById('vocab-action-area');
    if (!isStu) {
        actArea.innerHTML = `<p class="text-xs text-slate-400 font-bold">Mode Pratinjau Admin</p>`;
    } else if (!st.status || st.status === 'none') {
        actArea.innerHTML = `
            <p class="text-xs font-bold text-slate-500">Sudah lancar semua kosakata di sesi ini?</p>
            <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="hes-btn-primary w-full sm:w-auto">
                <i class="fas fa-check-circle"></i> Tandai Sudah Hafal (+10 XP)
            </button>`;
    } else if (st.status === 'submitted') {
        actArea.innerHTML = `<span class="text-xs font-black text-amber-800 bg-amber-50 border-2 border-amber-200 px-4 py-2 rounded-xl">⏳ Menunggu Verifikasi Admin (+10 XP Tercatat)</span>`;
    } else {
        actArea.innerHTML = `<span class="text-xs font-black text-emerald-800 bg-emerald-50 border-2 border-emerald-200 px-4 py-2 rounded-xl">🏅 Hafalan Disetujui (+25 XP) • "${st.feedback || 'Good Job!'}"</span>`;
    }

    // Render PDF Modul & Recap
    renderPdfViewer('presentation', window.HES.materials[`${email}-${monthId}-w${week}-d${day}-link`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-link`], 'Modul bacaan belum diunggah untuk pertemuan ini.');
    renderPdfViewer('recap', window.HES.materials[`${email}-${monthId}-w${week}-d${day}-recap`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-recap`], 'Catatan rangkuman kelas belum tersedia.');
}

function renderPdfViewer(prefix, rawUrl, emptyMsg) {
    const box = document.getElementById(`${prefix}-viewer-box`);
    const ext = document.getElementById(`${prefix}-external-link`);
    const previewUrl = parseDriveLink(rawUrl);
    if (previewUrl) {
        ext.href = rawUrl;
        ext.classList.remove('hidden');
        box.innerHTML = `<iframe src="${previewUrl}" class="w-full h-[58vh] md:h-[72vh] rounded-2xl border-2 border-slate-200 bg-slate-50" allow="autoplay"></iframe>`;
    } else {
        ext.classList.add('hidden');
        box.innerHTML = `<div class="py-14 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-xs font-bold text-slate-400">${emptyMsg}</div>`;
    }
}

// ====================================================
// SUBMODE 1: 3D FLASHCARD DECK
// ====================================================
function renderFlashcardDeck(enterAnim = false) {
    const container = document.getElementById('vocab-cards-container');
    if (!container) return;
    if (!currentVocabItems.length) {
        container.innerHTML = `<p class="text-center py-10 text-xs font-bold text-slate-400">Belum ada kosakata untuk sesi ini.</p>`;
        return;
    }

    const item = currentVocabItems[currentCardIndex];
    const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const dots = currentVocabItems.map((_, i) => `<button onclick="jumpToVocabCard(${i})" class="h-2.5 rounded-full transition-all ${i === currentCardIndex ? 'w-8 bg-indigo-600' : 'w-2.5 bg-slate-200'}"></button>`).join('');

    container.innerHTML = `
        <div class="max-w-lg mx-auto">
            <div class="flex items-center justify-between mb-3 px-1">
                <span class="text-xs font-black text-slate-500">Kartu <strong class="text-indigo-600">${currentCardIndex + 1}</strong> / ${currentVocabItems.length}</span>
                <div class="flex gap-1.5">${dots}</div>
                <button onclick="shuffleVocabCards()" class="text-xs font-black text-indigo-600 hover:underline"><i class="fas fa-shuffle mr-1"></i>Acak</button>
            </div>

            <div class="flashcard-deck-stage mb-6">
                <div id="active-flashcard" onclick="flipActiveVocabCard()" class="flip-card ${isCurrentCardFlipped ? 'is-flipped' : ''} ${enterAnim ? 'swipe-in-card' : ''} perspective-1000 cursor-pointer select-none">
                    <div class="flip-card-inner">
                        <div class="flip-card-front bg-gradient-to-br from-white to-indigo-50/50 p-6 sm:p-8 border-2 border-indigo-200 shadow-lg flex flex-col justify-between">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Kata #${item.num}</span>
                                <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                                    <i class="fas fa-volume-high"></i>
                                </button>
                            </div>
                            <div class="text-center my-auto">
                                <p class="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Bahasa Inggris</p>
                                <h4 class="text-3xl sm:text-4xl font-black text-slate-800">${item.eng}</h4>
                            </div>
                            <div class="text-center text-xs font-extrabold text-indigo-500 border-t border-slate-100 pt-3">
                                👆 Ketuk kartu untuk melihat arti
                            </div>
                        </div>

                        <div class="flip-card-back bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-6 sm:p-8 shadow-lg flex flex-col justify-between">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-black bg-white/20 text-amber-300 px-3 py-1 rounded-full">Arti Indonesia</span>
                                <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-11 h-11 rounded-2xl bg-white/20 text-white flex items-center justify-center">
                                    <i class="fas fa-volume-high"></i>
                                </button>
                            </div>
                            <div class="text-center my-auto">
                                <p class="text-sm font-extrabold text-indigo-200 mb-1">${item.eng}</p>
                                <h4 class="text-2xl sm:text-3xl font-black text-white">${item.ind}</h4>
                            </div>
                            <div class="text-center text-xs font-extrabold text-indigo-200 border-t border-white/15 pt-3">
                                👆 Ketuk untuk kembali
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-center gap-3">
                <button type="button" onclick="prevVocabCard()" class="hes-btn-soft !px-5 !py-3"><i class="fas fa-arrow-left"></i></button>
                <button type="button" onclick="flipActiveVocabCard()" class="hes-btn-soft flex-1 max-w-[200px] !py-3"><i class="fas fa-rotate"></i> Balik Kartu</button>
                <button type="button" onclick="nextVocabCard()" class="hes-btn-primary !px-5 !py-3"><i class="fas fa-arrow-right"></i></button>
            </div>
        </div>
    `;

    const cardEl = document.getElementById('active-flashcard');
    cardEl?.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY; }, { passive: true });
    cardEl?.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].screenX - touchStartX, dy = e.changedTouches[0].screenY - touchStartY;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? nextVocabCard() : prevVocabCard();
    }, { passive: true });
}

// ====================================================
// SUBMODE 2: MINI QUIZ TEBAK ARTI (Bikin Murid Betah!)
// ====================================================
function renderVocabQuiz() {
    const container = document.getElementById('vocab-cards-container');
    if (!container || !currentVocabItems.length) return;

    if (quizState.index >= currentVocabItems.length) {
        const pct = Math.round((quizState.score / currentVocabItems.length) * 100);
        container.innerHTML = `
            <div class="max-w-md mx-auto text-center py-8 px-4 bg-gradient-to-b from-indigo-50/70 to-white rounded-3xl border-2 border-indigo-100 fade-in">
                <div class="text-5xl mb-3">${pct === 100 ? '🏆' : '🎉'}</div>
                <h4 class="text-xl font-black text-slate-800">Kuis Selesai!</h4>
                <p class="text-sm font-bold text-slate-500 mt-1">Kamu menjawab benar <strong class="text-indigo-600">${quizState.score} dari ${currentVocabItems.length}</strong> kata (${pct}%)</p>
                <div class="mt-6 flex justify-center gap-3">
                    <button onclick="switchVocabSubmode('quiz')" class="hes-btn-primary"><i class="fas fa-redo"></i> Main Lagi</button>
                    <button onclick="switchVocabSubmode('deck')" class="hes-btn-soft">Kembali ke Kartu</button>
                </div>
            </div>`;
        return;
    }

    const currentItem = currentVocabItems[quizState.index];
    const safeWord = currentItem.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    // Buat 4 pilihan jawaban (1 benar + 3 pengecoh)
    const pool = currentVocabItems.filter((_, i) => i !== quizState.index).map(x => x.ind);
    const fallbacks = ['Meningkatkan', 'Menyelesaikan', 'Kesempatan', 'Mempertimbangkan', 'Lingkungan'];
    while (pool.length < 3) pool.push(fallbacks[pool.length]);
    pool.sort(() => Math.random() - 0.5);

    const options = [currentItem.ind, ...pool.slice(0, 3)].sort(() => Math.random() - 0.5);

    container.innerHTML = `
        <div class="max-w-lg mx-auto fade-in">
            <div class="flex items-center justify-between text-xs font-black text-slate-400 mb-3">
                <span>Pertanyaan ${quizState.index + 1} / ${currentVocabItems.length}</span>
                <span class="text-emerald-600">Skor: ${quizState.score} Benar</span>
            </div>

            <div class="p-6 rounded-3xl bg-indigo-50/70 border-2 border-indigo-100 text-center mb-4">
                <p class="text-[11px] font-black uppercase text-indigo-400 mb-1">Apa arti dari kata ini?</p>
                <div class="flex items-center justify-center gap-3">
                    <h4 class="text-2xl sm:text-3xl font-black text-slate-800">${currentItem.eng}</h4>
                    <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                        <i class="fas fa-volume-high text-xs"></i>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-2.5">
                ${options.map(opt => {
                    const isCorr = opt === currentItem.ind;
                    return `<button onclick="answerVocabQuiz(this, ${isCorr})" class="quiz-opt-btn w-full p-3.5 rounded-2xl border-2 border-b-4 border-slate-200 bg-white hover:border-indigo-300 text-left text-xs sm:text-sm font-extrabold text-slate-700 transition">${opt}</button>`;
                }).join('')}
            </div>
        </div>
    `;
}

window.answerVocabQuiz = function(btnEl, isCorrect) {
    if (quizState.answered) return;
    quizState.answered = true;

    if (isCorrect) {
        quizState.score++;
        btnEl.className = "w-full p-3.5 rounded-2xl border-2 border-b-4 border-emerald-600 bg-emerald-500 text-white text-left text-xs sm:text-sm font-black";
        btnEl.innerHTML += ` <span class="float-right">✅ Benar!</span>`;
    } else {
        btnEl.className = "w-full p-3.5 rounded-2xl border-2 border-b-4 border-red-600 bg-red-500 text-white text-left text-xs sm:text-sm font-black animate-shake";
        btnEl.innerHTML += ` <span class="float-right">❌ Kurang Tepat</span>`;
    }

    setTimeout(() => {
        quizState.index++;
        quizState.answered = false;
        renderVocabQuiz();
    }, 950);
};

window.flipActiveVocabCard = function() {
    if (isAnimatingSwipe) return;
    isCurrentCardFlipped = !isCurrentCardFlipped;
    document.getElementById('active-flashcard')?.classList.toggle('is-flipped', isCurrentCardFlipped);
};

window.nextVocabCard = function() {
    if (isAnimatingSwipe || !currentVocabItems.length) return;
    isAnimatingSwipe = true;
    document.getElementById('active-flashcard')?.classList.add('swipe-out-left');
    setTimeout(() => {
        currentCardIndex = (currentCardIndex + 1) % currentVocabItems.length;
        isCurrentCardFlipped = isAnimatingSwipe = false;
        renderFlashcardDeck(true);
    }, 210);
};

window.prevVocabCard = function() {
    if (isAnimatingSwipe || !currentVocabItems.length) return;
    isAnimatingSwipe = true;
    document.getElementById('active-flashcard')?.classList.add('swipe-out-right');
    setTimeout(() => {
        currentCardIndex = (currentCardIndex - 1 + currentVocabItems.length) % currentVocabItems.length;
        isCurrentCardFlipped = isAnimatingSwipe = false;
        renderFlashcardDeck(true);
    }, 210);
};

window.jumpToVocabCard = function(idx) {
    if (!isAnimatingSwipe && idx !== currentCardIndex) {
        currentCardIndex = idx; isCurrentCardFlipped = false; renderFlashcardDeck(true);
    }
};

window.shuffleVocabCards = function() {
    currentVocabItems.sort(() => Math.random() - 0.5);
    currentCardIndex = 0; isCurrentCardFlipped = false;
    renderFlashcardDeck(true);
    showToast('Urutan kartu diacak!', 'info');
};

window.speakVocabWord = function(event, word, btnEl) {
    event.stopPropagation();
    if (!('speechSynthesis' in window)) return showToast('Browser belum mendukung fitur suara.', 'error');
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US'; u.rate = 0.9;
    btnEl?.classList.add('speaking-pulse');
    u.onend = u.onerror = () => btnEl?.classList.remove('speaking-pulse');
    window.speechSynthesis.speak(u);
};

window.submitVocab = async function(btn, m, w, d) {
    const email = window.HES.currentUser.email;
    window.HES.materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status: 'submitted', feedback: '' };
    btn.disabled = true; btn.innerHTML = 'Menyimpan...';
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    if (!error) { showToast('Hafalan tercatat! +10 XP 🎉', 'success'); renderMateriContent(); }
    else { showToast('Gagal menyimpan: ' + error.message, 'error'); btn.disabled = false; }
};