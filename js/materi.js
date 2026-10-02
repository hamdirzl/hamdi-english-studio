// js/materi.js

let activeMateriState = {
    monthId: 'm1',
    week: 1,
    day: 1
};

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
    const m = params.get('month') || 'm1';
    const w = parseInt(params.get('week')) || 1;
    const d = parseInt(params.get('day')) || 1;

    activeMateriState = { monthId: m, week: w, day: d };
}

function setupQuickSelectors() {
    const qMonth = document.getElementById('quick-month');
    const qWeek = document.getElementById('quick-week');
    const qDay = document.getElementById('quick-day');
    if (!qMonth || !qWeek || !qDay) return;

    const role = window.HES.userRole;
    const user = window.HES.currentUser;
    let maxMonthNum = 99;
    if (role === 'student') {
        let p = window.HES.materials[`profile-${user.email}`];
        maxMonthNum = (p && p.maxMonth) ? parseInt(p.maxMonth) : 1;
    }

    // Jika murid mencoba mengakses bulan yang terkunci lewat URL, kembalikan ke m1
    const requestedMonthNum = parseInt(activeMateriState.monthId.replace('m', ''));
    if (role === 'student' && requestedMonthNum > maxMonthNum) {
        activeMateriState.monthId = 'm1';
        showToast('Modul bulan tersebut masih terkunci.', 'info');
    }

    qMonth.innerHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonthNum;
        return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title} ${locked ? '(Terkunci)' : ''}</option>`;
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

    document.getElementById('materi-badge').innerText = monthObj.title;
    document.getElementById('materi-subbadge').innerText = `Week ${week} • Day ${day}`;
    document.getElementById('materi-title').innerText = `${monthObj.title} — Pertemuan Minggu ${week} Hari ${day}`;

    // 1. Render Kosakata Harian (Flashcards)
    const vocabData = window.HES.materials[`vocab-${monthId}-w${week}-d${day}`] || '';
    const vocabStatus = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none', feedback: '' };
    const vocabSection = document.getElementById('vocab-section');
    const vocabCardsContainer = document.getElementById('vocab-cards-container');
    const vocabCountBadge = document.getElementById('vocab-count-badge');
    const vocabActionArea = document.getElementById('vocab-action-area');

    if (vocabData.trim() !== '') {
        const lines = vocabData.split('\n').filter(l => l.includes('='));
        if (lines.length > 0) {
            vocabSection.classList.remove('hidden');
            vocabCountBadge.innerText = `${lines.length} Kosakata`;

            vocabCardsContainer.innerHTML = lines.map((w, index) => {
                const parts = w.split('=');
                const eng = parts[0].trim();
                const ind = parts.slice(1).join('=').trim();
                return `
                    <div class="snap-center shrink-0 w-44 sm:w-48 bg-white p-4 rounded-xl border border-slate-200/90 text-center shadow-2xs hover:border-indigo-300 transition flex flex-col justify-between">
                        <span class="text-[10px] font-bold text-slate-300">#${index + 1}</span>
                        <p class="font-extrabold text-slate-800 text-sm sm:text-base my-2">${eng}</p>
                        <span class="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 py-1 px-2.5 rounded-lg inline-block">${ind}</span>
                    </div>
                `;
            }).join('');

            if (role === 'student') {
                if (!vocabStatus.status || vocabStatus.status === 'none') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium">Sudah menghafal seluruh kosakata di atas?</p>
                        <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-xs transition">
                            <i class="fas fa-check mr-1.5"></i> Tandai Selesai Dihafal
                        </button>
                    `;
                } else if (vocabStatus.status === 'submitted') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium">Setoran hafalan Anda telah tercatat di sistem.</p>
                        <div class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl inline-flex items-center gap-2">
                            <i class="fas fa-clock"></i> Menunggu Verifikasi Admin
                        </div>
                    `;
                } else {
                    vocabActionArea.innerHTML = `
                        <div class="text-xs text-emerald-700 font-semibold">
                            <i class="fas fa-comment-dots mr-1"></i> Catatan Admin: <strong>"${vocabStatus.feedback || 'Good Job!'}"</strong>
                        </div>
                        <div class="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
                            <i class="fas fa-check-circle"></i> Hafalan Terverifikasi
                        </div>
                    `;
                }
            } else {
                vocabActionArea.innerHTML = `<p class="text-xs text-slate-400 italic">Anda melihat daftar kosakata ini dalam mode Administrator.</p>`;
            }
        } else {
            vocabSection.classList.add('hidden');
        }
    } else {
        vocabSection.classList.add('hidden');
    }

    // 2. Render Modul Presentasi & Catatan Rangkuman (PDF)
    const rawLink = window.HES.materials[`${email}-${monthId}-w${week}-d${day}-link`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-link`] || '';
    const rawRecap = window.HES.materials[`${email}-${monthId}-w${week}-d${day}-recap`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-recap`] || '';

    const linkDrive = parseDriveLink(rawLink);
    const recapDrive = parseDriveLink(rawRecap);

    const presBox = document.getElementById('presentation-viewer-box');
    const presExt = document.getElementById('presentation-external-link');
    if (linkDrive) {
        presExt.href = rawLink;
        presExt.classList.remove('hidden');
        presBox.innerHTML = `<iframe src="${linkDrive}" class="w-full h-[55vh] md:h-[72vh] rounded-xl border border-slate-200 bg-slate-50" allow="autoplay"></iframe>`;
    } else {
        presExt.classList.add('hidden');
        presBox.innerHTML = `
            <div class="py-14 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                <i class="far fa-file-pdf text-slate-300 text-3xl mb-2"></i>
                <p class="text-slate-400 text-xs sm:text-sm font-medium">Modul presentasi belum diunggah untuk sesi ini.</p>
            </div>
        `;
    }

    const recapBox = document.getElementById('recap-viewer-box');
    const recapExt = document.getElementById('recap-external-link');
    if (recapDrive) {
        recapExt.href = rawRecap;
        recapExt.classList.remove('hidden');
        recapBox.innerHTML = `<iframe src="${recapDrive}" class="w-full h-[55vh] md:h-[72vh] rounded-xl border border-slate-200 bg-slate-50" allow="autoplay"></iframe>`;
    } else {
        recapExt.classList.add('hidden');
        recapBox.innerHTML = `
            <div class="py-14 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                <i class="fas fa-clipboard-list text-slate-300 text-3xl mb-2"></i>
                <p class="text-slate-400 text-xs sm:text-sm font-medium">Catatan rangkuman belum tersedia untuk sesi ini.</p>
            </div>
        `;
    }
}

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