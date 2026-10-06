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
    let m = params.get('month');
    let w = parseInt(params.get('week'));
    let d = parseInt(params.get('day'));

    // Jika murid membuka materi.html tanpa parameter URL, langsung arahkan ke pertemuan tempat ia berada saat ini
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

    // Label singkat dan rapi agar muat di layar HP
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
                <!-- Pill 1: Pertemuan Saat Ini (Hijau Emerald) -->
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

                <!-- Pill 2: Pertemuan Berikutnya (Kuning Amber) -->
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
            vocabCountBadge.innerText = `${lines.length} Kata`;

            vocabCardsContainer.innerHTML = lines.map((w, index) => {
                const parts = w.split('=');
                const eng = parts[0].trim();
                const ind = parts.slice(1).join('=').trim();
                return `
                    <div class="snap-center shrink-0 w-36 sm:w-44 bg-white p-3.5 rounded-xl border border-slate-200/90 text-center shadow-2xs hover:border-indigo-300 transition flex flex-col justify-between">
                        <span class="text-[10px] font-bold text-slate-300">#${index + 1}</span>
                        <p class="font-extrabold text-slate-800 text-xs sm:text-sm my-1.5 break-words">${eng}</p>
                        <span class="text-[10px] sm:text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 py-1 px-2 rounded-lg inline-block truncate">${ind}</span>
                    </div>
                `;
            }).join('');

            if (role === 'student') {
                if (!vocabStatus.status || vocabStatus.status === 'none') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium text-center sm:text-left">Sudah menghafal seluruh kosakata di atas?</p>
                        <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition">
                            <i class="fas fa-check mr-1.5"></i> Tandai Selesai Dihafal
                        </button>
                    `;
                } else if (vocabStatus.status === 'submitted') {
                    vocabActionArea.innerHTML = `
                        <p class="text-xs text-slate-500 font-medium">Setoran hafalan Anda telah tercatat.</p>
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
                            <i class="fas fa-check-circle"></i> Hafalan Terverifikasi
                        </div>
                    `;
                }
            } else {
                vocabActionArea.innerHTML = `<p class="text-xs text-slate-400 italic">Mode Pratinjau Administrator.</p>`;
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