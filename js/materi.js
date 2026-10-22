// js/materi.js

let activeMateriState = { monthId: 'm1', week: 1, day: 1 };
let activeMateriMode = 'vocab';
let activeVocabSubmode = 'deck';

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
    renderAppHeader();
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
    const { monthId, week, day } = activeMateriState;
    let sIdx = ((week - 1) * 3) + (day - 1) + step;
    let mNum = parseInt(monthId.replace('m', ''));
    const isStu = window.HES.userRole === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${window.HES.currentUser.email}`]?.maxMonth || 1) : window.HES.months.length;

    if (sIdx < 0) {
        if (mNum > 1) { mNum--; sIdx = 11; }
        else return showToast('Ini adalah pertemuan pertama di Month 1.', 'info');
    } else if (sIdx > 11) {
        if (mNum < maxM && mNum < window.HES.months.length) { mNum++; sIdx = 0; }
        else return showToast('Sudah di pertemuan ke-12! Yuk lanjut ke Ujian Akhir 🏆', 'info');
    }
    window.location.href = `materi.html?month=m${mNum}&week=${Math.floor(sIdx / 3) + 1}&day=${(sIdx % 3) + 1}`;
};

window.switchMateriMode = function(mode) {
    activeMateriMode = mode;
    const tabs = [
        { id: 'vocab',        label: '🎴 Kosakata & Kuis' },
        { id: 'presentation', label: '📖 Modul Materi' },
        { id: 'recap',        label: '📝 Catatan Guru' }
    ];
    tabs.forEach(t => {
        const btn = document.getElementById(`mode-btn-${t.id}`);
        const panel = document.getElementById(`panel-materi-${t.id}`);
        const active = t.id === mode;
        if (btn) {
            btn.innerHTML = t.label;
            btn.className = `py-3.5 px-3 rounded-2xl text-xs sm:text-sm font-extrabold transition border-2 border-b-4 ${active ? 'bg-stone-800 text-white border-stone-950 shadow-sm' : 'bg-white text-stone-600 border-stone-200 hover:border-amber-400'}`;
        }
        if (panel) panel.classList.toggle('hidden', !active);
    });
};

window.switchVocabSubmode = function(sub) {
    activeVocabSubmode = sub;
    document.getElementById('submode-deck').className = `px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${sub === 'deck' ? 'bg-emerald-600 text-white shadow-xs' : 'text-stone-600'}`;
    document.getElementById('submode-quiz').className = `px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${sub === 'quiz' ? 'bg-orange-500 text-white shadow-xs' : 'text-stone-600'}`;

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

    if (isStu && parseInt(monthId.replace('m', '')) > maxM) activeMateriState.monthId = 'm1';

    const monthObj = window.HES.months.find(m => m.id === activeMateriState.monthId) || { title: 'Month 1' };
    const timeline = isStu ? getStudentCurriculumTimeline(email) : null;
    const dInfo = timeline?.days[`${monthId}-w${week}-d${day}`];
    const sNum = ((week - 1) * 3) + day;

    document.getElementById('materi-subbadge').innerText = `Minggu ${week} • Hari ke-${day}`;
    document.getElementById('materi-title').innerText = `Pertemuan ${sNum} dari 12`;

    const qM = document.getElementById('quick-month');
    if (qM) {
        qM.innerHTML = window.HES.months.map(m => {
            const locked = isStu && parseInt(m.id.replace('m', '')) > maxM;
            return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${locked ? ' 🔒' : ''}</option>`;
        }).join('');
        qM.value = monthId;
        qM.onchange = () => window.location.href = `materi.html?month=${qM.value}&week=1&day=1`;
    }

    // Render 12 Tombol Angka Pertemuan
    const stonesEl = document.getElementById('session-stepping-stones');
    if (stonesEl) {
        let html = '';
        for (let i = 0; i < 12; i++) {
            const w = Math.floor(i / 3) + 1, d = (i % 3) + 1;
            const info = timeline?.days[`${monthId}-w${w}-d${d}`];
            const isSel = (w === week && d === day);
            let cls = 'bg-[#FAF8F5] text-stone-600 border-stone-200 hover:border-amber-400';
            if (info?.status === 'completed') cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (info?.status === 'current') cls = 'bg-amber-100 text-amber-900 border-amber-400';
            if (isSel) cls = 'bg-orange-500 text-white border-orange-700 scale-105 shadow-xs';

            html += `<a href="materi.html?month=${monthId}&week=${w}&day=${d}" class="py-2 rounded-xl border-2 text-center text-xs font-extrabold transition ${cls}">Sesi ${i + 1}</a>`;
        }
        stonesEl.innerHTML = html;
    }

    const pill = document.getElementById('materi-date-pill');
    if (pill && dInfo?.shortDate) {
        pill.classList.remove('hidden');
        pill.innerHTML = `📅 ${dInfo.shortDate}`;
    } else if (pill) pill.classList.add('hidden');

    // Muat Kosakata
    const vocabData = getSessionVocabText(monthId, week, day);
    const lines = vocabData.split('\n').filter(l => l.includes('='));
    document.getElementById('vocab-count-badge').innerText = `${lines.length} Kata`;

    currentVocabItems = lines.map((w, i) => {
        const [eng, ...rest] = w.split('=');
        return { num: i + 1, eng: eng.trim(), ind: rest.join('=').trim() };
    });
    if (currentCardIndex >= currentVocabItems.length) currentCardIndex = 0;
    isCurrentCardFlipped = false;

    // Render Daftar Kosakata di Kolom Kiri (Agar Mudah Dibaca Langsung!)
    const sheetEl = document.getElementById('vocab-list-sheet');
    if (sheetEl) {
        sheetEl.innerHTML = currentVocabItems.map((item, idx) => {
            const safe = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div onclick="jumpToVocabCard(${idx})" class="p-3 rounded-2xl bg-[#FAF8F5] hover:bg-amber-50/70 border border-stone-200/80 flex items-center justify-between gap-2 cursor-pointer transition">
                    <div class="min-w-0">
                        <p class="text-sm font-extrabold text-stone-800">${item.num}. ${item.eng}</p>
                        <p class="text-xs font-semibold text-emerald-700">${item.ind}</p>
                    </div>
                    <button type="button" onclick="speakVocabWord(event, '${safe}', this)" class="w-9 h-9 rounded-xl bg-white border border-stone-200 text-emerald-600 hover:bg-emerald-600 hover:text-white flex items-center justify-center shrink-0 transition">
                        <i class="fas fa-volume-high text-xs"></i>
                    </button>
                </div>`;
        }).join('');
    }

    switchVocabSubmode(activeVocabSubmode);
    switchMateriMode(activeMateriMode);

    // Status Setor Hafalan
    const st = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none' };
    const actArea = document.getElementById('vocab-action-area');
    if (!isStu) {
        actArea.innerHTML = `<p class="text-xs text-stone-400 font-bold">Mode Pratinjau Admin</p>`;
    } else if (!st.status || st.status === 'none') {
        actArea.innerHTML = `
            <p class="text-xs font-bold text-stone-500">Sudah hafal kosakata pertemuan ini?</p>
            <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="hes-btn-primary w-full sm:w-auto">
                <i class="fas fa-check-circle"></i> Tandai Sudah Hafal (+10 XP)
            </button>`;
    } else if (st.status === 'submitted') {
        actArea.innerHTML = `<span class="text-xs font-extrabold text-amber-800 bg-amber-50 border-2 border-amber-200 px-4 py-2 rounded-xl">⏳ Menunggu Verifikasi Admin (+10 XP)</span>`;
    } else {
        actArea.innerHTML = `<span class="text-xs font-extrabold text-emerald-800 bg-emerald-50 border-2 border-emerald-200 px-4 py-2 rounded-xl">🏅 Hafalan Disetujui (+25 XP) • "${st.feedback || 'Good Job!'}"</span>`;
    }

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
        box.innerHTML = `<iframe src="${previewUrl}" class="w-full h-[60vh] md:h-[72vh] rounded-2xl border-2 border-stone-200 bg-stone-50" allow="autoplay"></iframe>`;
    } else {
        ext.classList.add('hidden');
        box.innerHTML = `<div class="py-14 text-center bg-[#FAF8F5] rounded-2xl border-2 border-dashed border-stone-200 text-xs font-bold text-stone-400">${emptyMsg}</div>`;
    }
}

function renderFlashcardDeck(enterAnim = false) {
    const container = document.getElementById('vocab-cards-container');
    if (!container || !currentVocabItems.length) return;

    const item = currentVocabItems[currentCardIndex];
    const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    container.innerHTML = `
        <div class="max-w-md mx-auto">
            <div class="flex items-center justify-between mb-3 px-1">
                <span class="text-xs font-extrabold text-stone-500">Kartu <strong class="text-emerald-700">${currentCardIndex + 1}</strong> dari ${currentVocabItems.length}</span>
                <button onclick="shuffleVocabCards()" class="text-xs font-extrabold text-orange-600 hover:underline"><i class="fas fa-shuffle mr-1"></i>Acak Urutan</button>
            </div>

            <div class="flashcard-deck-stage mb-6">
                <div id="active-flashcard" onclick="flipActiveVocabCard()" class="flip-card ${isCurrentCardFlipped ? 'is-flipped' : ''} ${enterAnim ? 'swipe-in-card' : ''} perspective-1000 cursor-pointer select-none">
                    <div class="flip-card-inner">
                        <div class="flip-card-front bg-gradient-to-br from-white to-amber-50/60 p-6 sm:p-8 border-2 border-amber-200 shadow-md flex flex-col justify-between">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-extrabold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">Kata #${item.num}</span>
                                <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                                    <i class="fas fa-volume-high"></i>
                                </button>
                            </div>
                            <div class="text-center my-auto">
                                <p class="text-[11px] font-extrabold uppercase tracking-widest text-stone-400 mb-1">Bahasa Inggris</p>
                                <h4 class="text-3xl sm:text-4xl font-extrabold text-stone-800">${item.eng}</h4>
                            </div>
                            <div class="text-center text-xs font-extrabold text-orange-600 border-t border-stone-100 pt-3">
                                👆 Ketuk kartu untuk melihat arti
                            </div>
                        </div>

                        <div class="flip-card-back bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 sm:p-8 shadow-md flex flex-col justify-between">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-extrabold bg-white/20 text-amber-200 px-3 py-1 rounded-full">Arti Indonesia</span>
                                <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center">
                                    <i class="fas fa-volume-high"></i>
                                </button>
                            </div>
                            <div class="text-center my-auto">
                                <p class="text-sm font-bold text-emerald-100 mb-1">${item.eng}</p>
                                <h4 class="text-2xl sm:text-3xl font-extrabold text-white">${item.ind}</h4>
                            </div>
                            <div class="text-center text-xs font-bold text-emerald-100 border-t border-white/15 pt-3">
                                👆 Ketuk untuk membalik kembali
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-center gap-3">
                <button type="button" onclick="prevVocabCard()" class="hes-btn-soft !px-5 !py-3"><i class="fas fa-arrow-left"></i></button>
                <button type="button" onclick="flipActiveVocabCard()" class="hes-btn-soft flex-1 !py-3"><i class="fas fa-rotate"></i> Balik Kartu</button>
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

function renderVocabQuiz() {
    const container = document.getElementById('vocab-cards-container');
    if (!container || !currentVocabItems.length) return;

    if (quizState.index >= currentVocabItems.length) {
        const pct = Math.round((quizState.score / currentVocabItems.length) * 100);
        container.innerHTML = `
            <div class="text-center py-8 px-4 bg-[#FAF8F5] rounded-3xl border-2 border-amber-200 fade-in">
                <div class="text-5xl mb-3">${pct === 100 ? '🏆' : '🎉'}</div>
                <h4 class="text-xl font-extrabold text-stone-800">Kuis Selesai!</h4>
                <p class="text-sm font-bold text-stone-500 mt-1">Skor kamu: <strong class="text-emerald-700">${quizState.score} benar dari ${currentVocabItems.length}</strong> (${pct}%)</p>
                <div class="mt-5 flex justify-center gap-3">
                    <button onclick="switchVocabSubmode('quiz')" class="hes-btn-primary"><i class="fas fa-redo"></i> Main Lagi</button>
                    <button onclick="switchVocabSubmode('deck')" class="hes-btn-soft">Kembali ke Kartu</button>
                </div>
            </div>`;
        return;
    }

    const currentItem = currentVocabItems[quizState.index];
    const pool = currentVocabItems.filter((_, i) => i !== quizState.index).map(x => x.ind);
    const fallbacks = ['Meningkatkan', 'Menyelesaikan', 'Kesempatan', 'Mempertimbangkan'];
    while (pool.length < 3) pool.push(fallbacks[pool.length]);
    pool.sort(() => Math.random() - 0.5);
    const options = [currentItem.ind, ...pool.slice(0, 3)].sort(() => Math.random() - 0.5);

    container.innerHTML = `
        <div class="fade-in">
            <div class="flex justify-between text-xs font-extrabold text-stone-400 mb-2">
                <span>Soal ${quizState.index + 1} / ${currentVocabItems.length}</span>
                <span class="text-emerald-700">Benar: ${quizState.score}</span>
            </div>
            <div class="p-5 rounded-2xl bg-amber-50 border-2 border-amber-200 text-center mb-4">
                <p class="text-[11px] font-extrabold uppercase text-amber-700">Pilih arti yang tepat untuk:</p>
                <h4 class="text-2xl sm:text-3xl font-extrabold text-stone-800 mt-1">${currentItem.eng}</h4>
            </div>
            <div class="grid grid-cols-1 gap-2.5">
                ${options.map(opt => `<button onclick="answerVocabQuiz(this, ${opt === currentItem.ind})" class="w-full p-3.5 rounded-2xl border-2 border-b-4 border-stone-200 bg-white hover:border-amber-400 text-left text-xs sm:text-sm font-extrabold text-stone-700 transition">${opt}</button>`).join('')}
            </div>
        </div>
    `;
}

window.answerVocabQuiz = function(btnEl, isCorrect) {
    if (quizState.answered) return;
    quizState.answered = true;
    if (isCorrect) {
        quizState.score++;
        btnEl.className = "w-full p-3.5 rounded-2xl border-2 border-b-4 border-emerald-700 bg-emerald-600 text-white text-left text-xs sm:text-sm font-extrabold";
        btnEl.innerHTML += ` <span class="float-right">✅ Benar!</span>`;
    } else {
        btnEl.className = "w-full p-3.5 rounded-2xl border-2 border-b-4 border-red-700 bg-red-500 text-white text-left text-xs sm:text-sm font-extrabold animate-shake";
        btnEl.innerHTML += ` <span class="float-right">❌ Kurang Tepat</span>`;
    }
    setTimeout(() => { quizState.index++; quizState.answered = false; renderVocabQuiz(); }, 900);
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
    currentCardIndex = idx; isCurrentCardFlipped = false;
    if (activeVocabSubmode !== 'deck') switchVocabSubmode('deck');
    else renderFlashcardDeck(true);
};

window.shuffleVocabCards = function() {
    currentVocabItems.sort(() => Math.random() - 0.5);
    currentCardIndex = 0; isCurrentCardFlipped = false;
    renderFlashcardDeck(true);
    showToast('Urutan kartu diacak!', 'info');
};

window.speakVocabWord = function(event, word, btnEl) {
    event.stopPropagation();
    if (!('speechSynthesis' in window)) return;
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