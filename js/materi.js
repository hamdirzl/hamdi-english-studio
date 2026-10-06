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

    // Jika murid membuka materi.html tanpa parameter URL, langsung arahkan ke pertemuan tempat ia berada saat ini!
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

    // Jika murid mencoba mengakses bulan yang terkunci lewat URL, kembalikan ke m1
    const requestedMonthNum = parseInt(activeMateriState.monthId.replace('m', ''));
    if (role === 'student' && requestedMonthNum > maxMonthNum) {
        activeMateriState.monthId = 'm1';
        showToast('Modul bulan tersebut masih terkunci.', 'info');
    }

    // Populate dropdown Month lengkap dengan rentang tanggal & penanda posisi
    qMonth.innerHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonthNum;
        const mInfo = (timeline && timeline.months[m.id]) ? timeline.months[m.id] : null;
        const rangeStr = (mInfo && mInfo.rangeText) ? ` (${mInfo.rangeText})` : '';
        const flagStr = mInfo && mInfo.status === 'current' ? ' 📍' : (mInfo && mInfo.status === 'next' ? ' ⏭️' : '');
        return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${rangeStr}${flagStr} ${locked ? '(Terkunci)' : ''}</option>`;
    }).join('');

    // Populate dropdown Week lengkap dengan rentang tanggal
    qWeek.innerHTML = [1, 2, 3, 4].map(w => {
        const wKey = `${activeMateriState.monthId}-w${w}`;
        const wInfo = (timeline && timeline.weeks[wKey]) ? timeline.weeks[wKey] : null;
        const rangeStr = (wInfo && wInfo.rangeText) ? ` (${wInfo.rangeText})` : '';
        const flagStr = wInfo && wInfo.status === 'current' ? ' 📍' : (wInfo && wInfo.status === 'next' ? ' ⏭️' : '');
        return `<option value="${w}">Week ${w}${rangeStr}${flagStr}</option>`;
    }).join('');

    // Populate dropdown Day lengkap dengan hari & tanggal spesifik
    qDay.innerHTML = [1, 2, 3].map(d => {
        const dKey = `${activeMateriState.monthId}-w${activeMateriState.week}-d${d}`;
        const dInfo = (timeline && timeline.days[dKey]) ? timeline.days[dKey] : null;
        const dateStr = (dInfo && dInfo.shortDate) ? ` — ${dInfo.shortDate}` : '';
        const flagStr = dInfo && dInfo.status === 'current'
            ? ' (Sedang Di Sini 📍)'
            : (dInfo && dInfo.status === 'next' ? ' (Selanjutnya ⏭️)' : '');
        return `<option value="${d}">Day ${d}${dateStr}${flagStr}</option>`;
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
    document.getElementById('materi-title').innerText = `${monthObj.title} — Pertemuan Minggu ${week} Hari ${day}`;

    // Pill Tanggal & Status pada Header Materi
    const datePill = document.getElementById('materi-date-pill');
    if (datePill && dInfo && dInfo.fullDate) {
        datePill.classList.remove('hidden');
        if (dInfo.status === 'current') {
            datePill.className = "text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-300";
            datePill.innerHTML = `<i class="fas fa-location-dot mr-1"></i> ${dInfo.fullDate} • Pertemuan Saat Ini`;
        } else if (dInfo.status === 'next') {
            datePill.className = "text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-300";
            datePill.innerHTML = `<i class="fas fa-forward mr-1"></i> ${dInfo.fullDate} • Pertemuan Selanjutnya`;
        } else if (dInfo.status === 'completed') {
            datePill.className = "text-[11px] font-bold px-2.5 py-0.5 rounded-md border bg-slate-100 text-slate-600 border-slate-200";
            datePill.innerHTML = `<i class="fas fa-check-circle text-emerald-500 mr-1"></i> ${dInfo.fullDate} • Selesai`;
        } else {
            datePill.className = "text-[11px] font-bold px-2.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-600 border-indigo-200";
            datePill.innerHTML = `<i class="far fa-calendar mr-1"></i> ${dInfo.fullDate}`;
        }
    } else if (datePill) {
        datePill.classList.add('hidden');
    }

    // Render Banner Pelacak Pertemuan (Live Session Tracker)
    const trackerBanner = document.getElementById('materi-session-tracker-banner');
    if (trackerBanner && timeline && timeline.currentPointer) {
        const cur = timeline.currentPointer;
        const nxt = timeline.nextPointer;
        const isViewingCurrent = (cur.monthId === monthId && cur.week === week && cur.day === day);
        const isViewingNext = (nxt && nxt.monthId === monthId && nxt.week === week && nxt.day === day);

        trackerBanner.classList.remove('hidden');
        trackerBanner.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <!-- Kartu Posisi Saat Ini (Hijau Emerald) -->
                <div class="p-4 rounded-2xl border-2 transition-all ${isViewingCurrent ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-500/15' : 'bg-emerald-50/90 border-emerald-200 text-slate-800'} flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3.5">
                        <div class="w-11 h-11 rounded-xl ${isViewingCurrent ? 'bg-white/20 text-white' : 'bg-emerald-600 text-white'} flex items-center justify-center text-lg shrink-0 shadow-xs">
                            <i class="fas fa-location-dot"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-1.5">
                                <span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${isViewingCurrent ? 'bg-white/20 text-white' : 'bg-emerald-200/80 text-emerald-900'}">
                                    ${cur.isTodayClass ? '🔥 Kelas Hari Ini' : '📍 Kamu Sedang Di Pertemuan Ini'}
                                </span>
                            </div>
                            <p class="font-extrabold text-xs sm:text-sm mt-1 ${isViewingCurrent ? 'text-white' : 'text-emerald-950'}">
                                ${cur.monthTitle} • Week ${cur.week} • Day ${cur.day}
                            </p>
                            <p class="text-[11px] font-semibold ${isViewingCurrent ? 'text-emerald-100' : 'text-emerald-700'}">
                                <i class="far fa-calendar-check mr-1"></i> ${cur.displayDate}
                            </p>
                        </div>
                    </div>
                    ${!isViewingCurrent ? `
                        <a href="materi.html?month=${cur.monthId}&week=${cur.week}&day=${cur.day}" class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-extrabold shadow-xs transition">
                            Buka Sesi Ini
                        </a>
                    ` : `
                        <span class="shrink-0 text-[10px] font-extrabold uppercase bg-white text-emerald-700 px-2.5 py-1 rounded-lg shadow-2xs">Sedang Dibuka</span>
                    `}
                </div>

                <!-- Kartu Pertemuan Selanjutnya (Kuning Amber) -->
                ${nxt ? `
                <div class="p-4 rounded-2xl border-2 transition-all ${isViewingNext ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500 shadow-md shadow-amber-500/15' : 'bg-amber-50/90 border-amber-200 text-slate-800'} flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3.5">
                        <div class="w-11 h-11 rounded-xl ${isViewingNext ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'} flex items-center justify-center text-lg shrink-0 shadow-xs">
                            <i class="fas fa-forward"></i>
                        </div>
                        <div>
                            <span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${isViewingNext ? 'bg-white/20 text-white' : 'bg-amber-200/80 text-amber-900'}">
                                ⏭️️ Pengingat Pertemuan Berikutnya
                            </span>
                            <p class="font-extrabold text-xs sm:text-sm mt-1 ${isViewingNext ? 'text-white' : 'text-amber-950'}">
                                ${nxt.monthTitle} • Week ${nxt.week} • Day ${nxt.day}
                            </p>
                            <p class="text-[11px] font-semibold ${isViewingNext ? 'text-amber-100' : 'text-amber-700'}">
                                <i class="far fa-clock mr-1"></i> ${nxt.displayDate}
                            </p>
                        </div>
                    </div>
                    ${!isViewingNext ? `
                        <a href="materi.html?month=${nxt.monthId}&week=${nxt.week}&day=${nxt.day}" class="shrink-0 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl text-xs font-extrabold shadow-xs transition">
                            Intip Materi
                        </a>
                    ` : `
                        <span class="shrink-0 text-[10px] font-extrabold uppercase bg-white text-amber-700 px-2.5 py-1 rounded-lg shadow-2xs">Sedang Dibuka</span>
                    `}
                </div>
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