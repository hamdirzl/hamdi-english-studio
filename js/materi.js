// js/materi.js

let activeMateriState = { monthId: 'm1', week: 1, day: 1 };
let currentVocabItems = [], currentCardIndex = 0, isCurrentCardFlipped = false, isAnimatingSwipe = false;
let touchStartX = 0, touchStartY = 0;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    parseMateriQueryParams();
    initLayout('Ruang Belajar');
    setupQuickSelectors();
    renderMateriContent();

    document.addEventListener('keydown', e => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight') nextVocabCard();
        if (e.key === 'ArrowLeft') prevVocabCard();
    });

    await syncFromCloud();
    renderAppSidebar();
    setupQuickSelectors();
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

function setupQuickSelectors() {
    const qM = document.getElementById('quick-month'), qW = document.getElementById('quick-week'), qD = document.getElementById('quick-day');
    if (!qM || !qW || !qD) return;

    const isStu = window.HES.userRole === 'student';
    const email = window.HES.currentUser.email;
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${email}`]?.maxMonth || 1) : 99;
    const timeline = isStu ? getStudentCurriculumTimeline(email) : null;

    if (isStu && parseInt(activeMateriState.monthId.replace('m', '')) > maxM) {
        activeMateriState.monthId = 'm1';
        showToast('Modul bulan tersebut masih terkunci.', 'info');
    }

    qM.innerHTML = window.HES.months.map(m => {
        const locked = isStu && parseInt(m.id.replace('m', '')) > maxM;
        return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${locked ? ' 🔒' : ''}</option>`;
    }).join('');

    qW.innerHTML = [1, 2, 3, 4].map(w => {
        const rng = timeline?.weeks[`${activeMateriState.monthId}-w${w}`]?.rangeText;
        return `<option value="${w}">Minggu ${w}${rng ? ` (${rng})` : ''}</option>`;
    }).join('');

    qD.innerHTML = [1, 2, 3].map(d => {
        const dt = timeline?.days[`${activeMateriState.monthId}-w${activeMateriState.week}-d${d}`]?.shortDate;
        return `<option value="${d}">Hari ${d}${dt ? ` (${dt})` : ''}</option>`;
    }).join('');

    qM.value = activeMateriState.monthId;
    qW.value = String(activeMateriState.week);
    qD.value = String(activeMateriState.day);

    const go = () => window.location.href = `materi.html?month=${qM.value}&week=${qW.value}&day=${qD.value}`;
    qM.onchange = qW.onchange = qD.onchange = go;
}

function renderMateriContent() {
    const { monthId, week, day } = activeMateriState;
    const email = window.HES.currentUser.email;
    const isStu = window.HES.userRole === 'student';
    const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
    const timeline = isStu ? getStudentCurriculumTimeline(email) : null;
    const dInfo = timeline?.days[`${monthId}-w${week}-d${day}`];

    document.getElementById('materi-badge').innerText = monthObj.title;
    document.getElementById('materi-subbadge').innerText = `Minggu ${week} • Hari ${day}`;
    document.getElementById('materi-title').innerText = `${monthObj.title} — Minggu ${week}, Pertemuan ${day}`;

    const pill = document.getElementById('materi-date-pill');
    if (pill && dInfo?.shortDate) {
        pill.classList.remove('hidden');
        pill.className = `text-xs font-extrabold px-2.5 py-0.5 rounded-lg ${dInfo.status === 'current' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`;
        pill.innerHTML = `<i class="far fa-calendar mr-1"></i>${dInfo.shortDate}`;
    } else if (pill) pill.classList.add('hidden');

    // Render Flashcards
    const vocabData = getSessionVocabText(monthId, week, day);
    const vocabSection = document.getElementById('vocab-section');
    const lines = vocabData.split('\n').filter(l => l.includes('='));

    if (lines.length > 0) {
        vocabSection.classList.remove('hidden');
        document.getElementById('vocab-count-badge').innerText = `${lines.length} Kata`;
        currentVocabItems = lines.map((w, i) => {
            const [eng, ...rest] = w.split('=');
            return { num: i + 1, eng: eng.trim(), ind: rest.join('=').trim() };
        });
        if (currentCardIndex >= currentVocabItems.length) currentCardIndex = 0;
        isCurrentCardFlipped = false;
        renderFlashcardDeck();

        const st = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none' };
        const actArea = document.getElementById('vocab-action-area');
        if (!isStu) {
            actArea.innerHTML = `<p class="text-xs text-slate-400 italic">Mode Pratinjau Admin — Gunakan tombol panah untuk mengecek kartu.</p>`;
        } else if (!st.status || st.status === 'none') {
            actArea.innerHTML = `
                <p class="text-xs font-semibold text-slate-500">Sudah hafal semua kosakata hari ini?</p>
                <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="hes-btn-primary w-full sm:w-auto">
                    <i class="fas fa-check-circle"></i> Tandai Sudah Hafal (+10 XP)
                </button>`;
        } else if (st.status === 'submitted') {
            actArea.innerHTML = `<span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl"><i class="fas fa-clock mr-1"></i> Menunggu Verifikasi Admin (+10 XP Tercatat)</span>`;
        } else {
            actArea.innerHTML = `<span class="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl"><i class="fas fa-medal mr-1"></i> Hafalan Disetujui (+25 XP) • "${st.feedback || 'Good Job!'}"</span>`;
        }
    } else {
        vocabSection.classList.add('hidden');
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
        box.innerHTML = `<iframe src="${previewUrl}" class="w-full h-[52vh] md:h-[70vh] rounded-2xl border border-slate-200 bg-slate-50" allow="autoplay"></iframe>`;
    } else {
        ext.classList.add('hidden');
        box.innerHTML = `<div class="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs font-semibold text-slate-400">${emptyMsg}</div>`;
    }
}

function renderFlashcardDeck(enterAnim = false) {
    const container = document.getElementById('vocab-cards-container');
    if (!container || !currentVocabItems.length) return;

    const item = currentVocabItems[currentCardIndex];
    const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const dots = currentVocabItems.map((_, i) => `<button onclick="jumpToVocabCard(${i})" class="h-2 rounded-full transition-all ${i === currentCardIndex ? 'w-7 bg-indigo-600' : 'w-2 bg-slate-200'}"></button>`).join('');

    container.innerHTML = `
        <div class="max-w-lg mx-auto">
            <div class="flex items-center justify-between mb-3 px-1">
                <span class="text-xs font-extrabold text-slate-500">Kata <strong class="text-indigo-600">${currentCardIndex + 1}</strong> dari ${currentVocabItems.length}</span>
                <div class="flex gap-1.5">${dots}</div>
            </div>

            <div class="flashcard-deck-stage mb-6">
                <div id="active-flashcard" onclick="flipActiveVocabCard()" class="flip-card ${isCurrentCardFlipped ? 'is-flipped' : ''} ${enterAnim ? 'swipe-in-card' : ''} perspective-1000 cursor-pointer select-none">
                    <div class="flip-card-inner">
                        <!-- Sisi Depan (Inggris) -->
                        <div class="flip-card-front bg-gradient-to-br from-white to-indigo-50/40 p-6 sm:p-8 border-2 border-indigo-100 shadow-lg flex flex-col justify-between">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Kata #${item.num}</span>
                                <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                                    <i class="fas fa-volume-high text-sm"></i>
                                </button>
                            </div>
                            <div class="text-center my-auto">
                                <p class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Bahasa Inggris</p>
                                <h4 class="text-3xl sm:text-4xl font-extrabold text-slate-800">${item.eng}</h4>
                            </div>
                            <div class="text-center text-xs font-bold text-indigo-500 border-t border-slate-100 pt-3">
                                <i class="fas fa-rotate mr-1"></i> Ketuk kartu untuk melihat arti
                            </div>
                        </div>

                        <!-- Sisi Belakang (Indonesia) -->
                        <div class="flip-card-back bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-6 sm:p-8 shadow-lg flex flex-col justify-between">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-extrabold bg-white/15 text-amber-300 px-3 py-1 rounded-full">Arti Bahasa Indonesia</span>
                                <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center">
                                    <i class="fas fa-volume-high text-sm"></i>
                                </button>
                            </div>
                            <div class="text-center my-auto">
                                <p class="text-sm font-bold text-indigo-200 mb-1">${item.eng}</p>
                                <h4 class="text-2xl sm:text-3xl font-extrabold text-white">${item.ind}</h4>
                            </div>
                            <div class="text-center text-xs font-bold text-indigo-200 border-t border-white/15 pt-3">
                                <i class="fas fa-rotate-left mr-1"></i> Ketuk untuk membalik kembali
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-center gap-3">
                <button type="button" onclick="prevVocabCard()" class="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-indigo-50 text-slate-700 font-bold"><i class="fas fa-arrow-left"></i></button>
                <button type="button" onclick="flipActiveVocabCard()" class="flex-1 max-w-[200px] h-12 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs"><i class="fas fa-rotate mr-1.5"></i> Balik Kartu</button>
                <button type="button" onclick="nextVocabCard()" class="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md"><i class="fas fa-arrow-right"></i></button>
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
    showToast('Urutan kartu kosakata berhasil diacak!', 'info');
};

window.speakVocabWord = function(event, word, btnEl) {
    event.stopPropagation();
    if (!('speechSynthesis' in window)) return showToast('Browser belum mendukung suara otomatis.', 'error');
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
    if (!error) { showToast('Hafalan tercatat! +10 XP', 'success'); renderMateriContent(); }
    else { showToast('Gagal menyimpan: ' + error.message, 'error'); btn.disabled = false; }
};