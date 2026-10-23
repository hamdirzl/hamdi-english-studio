// js/materi.js

let activeMateriState = { monthId: 'm1', week: 1, day: 1 };
let activeMateriMode = 'vocab';
let activeVocabSubmode = 'list';

let currentVocabItems = [];
let quizState = { index: 0, score: 0, answered: false };
let parsedHandoutCache = { presentation: null, recap: null };

if (!document.getElementById('handout-google-font')) {
    const link = document.createElement('link');
    link.id = 'handout-google-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';
    document.head.appendChild(link);
}

if (!document.getElementById('jspdf-lib')) {
    const script = document.createElement('script');
    script.id = 'jspdf-lib';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    parseMateriQueryParams();
    initLayout('Ruang Belajar');
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

    const newW = Math.floor(sessionIdx / 3) + 1;
    const newD = (sessionIdx % 3) + 1;
    window.location.href = `materi.html?month=m${mNum}&week=${newW}&day=${newD}`;
};

window.switchMateriMode = function(mode) {
    window.stopNaturalEnglishTTS();
    activeMateriMode = mode;
    const cfg = [
        { id: 'vocab',        label: '<i class="fas fa-language mr-1.5"></i> Kosakata & Kuis' },
        { id: 'presentation', label: '<i class="fas fa-book-open mr-1.5"></i> Modul Materi' },
        { id: 'recap',        label: '<i class="fas fa-file-signature mr-1.5"></i> Catatan Recap' }
    ];
    cfg.forEach(c => {
        const btn = document.getElementById(`mode-btn-${c.id}`);
        const panel = document.getElementById(`panel-materi-${c.id}`);
        const active = c.id === mode;
        if (btn) {
            btn.innerHTML = c.label;
            btn.className = `py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition border cursor-pointer ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`;
        }
        if (panel) panel.classList.toggle('hidden', !active);
    });
};

window.switchVocabSubmode = function(sub) {
    window.stopNaturalEnglishTTS();
    const normalized = sub === 'deck' ? 'list' : sub;
    activeVocabSubmode = normalized;

    const btnList = document.getElementById('submode-deck');
    const btnQuiz = document.getElementById('submode-quiz');
    if (btnList) {
        btnList.innerHTML = '<i class="fas fa-list-ul mr-1"></i> Daftar Kata';
        btnList.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${normalized === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
    }
    if (btnQuiz) {
        btnQuiz.innerHTML = '<i class="fas fa-gamepad mr-1"></i> Kuis Singkat';
        btnQuiz.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${normalized === 'quiz' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
    }

    if (normalized === 'quiz') {
        quizState = { index: 0, score: 0, answered: false };
        renderVocabQuiz();
    } else {
        renderVocabList();
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
        let stonesHTML = '';
        for (let i = 0; i < 12; i++) {
            const w = Math.floor(i / 3) + 1, d = (i % 3) + 1;
            const info = timeline?.days[`${monthId}-w${w}-d${d}`];
            const isSelected = (w === week && d === day);
            let cls = 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300';
            if (info?.status === 'completed') cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (info?.status === 'current') cls = 'bg-amber-50 text-amber-900 border-amber-300';
            if (isSelected) cls = 'bg-indigo-600 text-white border-indigo-700 shadow-sm';

            stonesHTML += `<a href="materi.html?month=${monthId}&week=${w}&day=${d}" title="Minggu ${w} Hari ${d} ${info?.shortDate ? `(${info.shortDate})` : ''}" class="py-2 rounded-lg border text-center text-xs font-black transition ${cls}">${i + 1}</a>`;
        }
        stonesEl.innerHTML = stonesHTML;
    }

    const pill = document.getElementById('materi-date-pill');
    if (pill && dInfo?.shortDate) {
        pill.classList.remove('hidden');
        pill.className = `text-xs font-black px-2.5 py-0.5 rounded-lg ${dInfo.status === 'current' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`;
        pill.innerHTML = `<i class="far fa-calendar mr-1"></i>${dInfo.shortDate}`;
    } else if (pill) pill.classList.add('hidden');

    const vocabData = getSessionVocabText(monthId, week, day);
    const lines = vocabData.split('\n').filter(l => l.includes('='));
    document.getElementById('vocab-count-badge').innerText = `${lines.length} Kata`;

    currentVocabItems = lines.map((w, i) => {
        const [eng, ...rest] = w.split('=');
        return { num: i + 1, eng: eng.trim(), ind: rest.join('=').trim() };
    });

    switchVocabSubmode(activeVocabSubmode);
    switchMateriMode(activeMateriMode);

    const st = window.HES.materials[`vocab_status-${email}-${monthId}-w${week}-d${day}`] || { status: 'none' };
    const actArea = document.getElementById('vocab-action-area');
    if (!isStu) {
        actArea.innerHTML = `<p class="text-xs text-slate-400 font-bold">Mode Pratinjau Admin</p>`;
    } else if (!st.status || st.status === 'none') {
        actArea.innerHTML = `
            <p class="text-xs font-bold text-slate-500">Sudah lancar semua kosakata di sesi ini?</p>
            <button onclick="submitVocab(this, '${monthId}', ${week}, ${day})" class="hes-btn-primary w-full sm:w-auto cursor-pointer">
                <i class="fas fa-check-circle"></i> Tandai Sudah Hafal (+10 XP)
            </button>`;
    } else if (st.status === 'submitted') {
        actArea.innerHTML = `<span class="text-xs font-black text-amber-800 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl"><i class="fas fa-hourglass-half mr-1"></i> Menunggu Verifikasi Admin (+10 XP)</span>`;
    } else {
        actArea.innerHTML = `<span class="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl"><i class="fas fa-medal mr-1"></i> Hafalan Disetujui (+25 XP) • "${st.feedback || 'Good Job!'}"</span>`;
    }

    const rawModule = window.HES.materials[`${email}-${monthId}-w${week}-d${day}-link`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-link`];
    const rawRecap = window.HES.materials[`${email}-${monthId}-w${week}-d${day}-recap`] || window.HES.materials[`all-${monthId}-w${week}-d${day}-recap`];

    renderSmartHandout('presentation', rawModule, monthObj.title, currentSessionNumber, 'Study Module Handout', 'Modul materi utama belum diterbitkan untuk pertemuan ini.');
    renderSmartHandout('recap', rawRecap, monthObj.title, currentSessionNumber, 'Class Recap & Feedback', 'Catatan rangkuman kelas belum tersedia untuk pertemuan ini.');
}

// ============================================================================
// SMART HANDOUT PARSER & REPORT-CARD STYLE RENDERER (DENGAN WATERMARK & AUDIO)
// ============================================================================
function parseSmartHandoutText(rawText, defaultTitle, defaultLevel) {
    const clean = String(rawText || '').replace(/\r\n/g, '\n').trim();
    const data = {
        title: defaultTitle,
        level: defaultLevel,
        goal: 'Build natural English confidence through clear concepts and practical examples.',
        overview: [],
        keyPoints: [],
        examples: [],
        dialogue: [],
        tips: [],
        practice: []
    };

    if (!clean) return data;

    let currentSec = 'overview';
    clean.split('\n').forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || /^SESSION\s*:\s*\d+/i.test(line)) return;

        if (/^TITLE\s*:/i.test(line)) {
            data.title = line.replace(/^TITLE\s*:\s*/i, '').trim() || data.title;
        } else if (/^LEVEL\s*:/i.test(line)) {
            data.level = line.replace(/^LEVEL\s*:\s*/i, '').trim() || data.level;
        } else if (/^(?:GOAL|OBJECTIVE)\s*:/i.test(line)) {
            data.goal = line.replace(/^(?:GOAL|OBJECTIVE)\s*:\s*/i, '').trim() || data.goal;
        } else if (/^(?:OVERVIEW|EXPLANATION|CONCEPT|SUMMARY)\s*:?$/i.test(line)) {
            currentSec = 'overview';
        } else if (/^(?:OVERVIEW|EXPLANATION|CONCEPT|SUMMARY)\s*:/i.test(line)) {
            currentSec = 'overview';
            const rest = line.replace(/^(?:OVERVIEW|EXPLANATION|CONCEPT|SUMMARY)\s*:\s*/i, '').trim();
            if (rest) data.overview.push(rest);
        } else if (/^(?:KEY\s*POINTS?|KEY\s*CONCEPTS?|GRAMMAR|RULES?|PATTERNS?|FORMULA)\s*:?$/i.test(line)) {
            currentSec = 'keypoints';
        } else if (/^(?:EXAMPLES?|SENTENCES?)\s*:?$/i.test(line)) {
            currentSec = 'examples';
        } else if (/^(?:DIALOGUE|CONVERSATION)\s*:?$/i.test(line)) {
            currentSec = 'dialogue';
        } else if (/^(?:TIPS?|PRO\s*TIPS?|COMMON\s*MISTAKES?|NOTES?)\s*:?$/i.test(line)) {
            currentSec = 'tips';
        } else if (/^(?:PRACTICE|EXERCISES?|TASKS?|HOMEWORK)\s*:?$/i.test(line)) {
            currentSec = 'practice';
        } else {
            const cleanBullet = line.replace(/^[-*•]\s*|\d+[.)]\s*/, '').trim();
            if (currentSec === 'overview') data.overview.push(line);
            else if (currentSec === 'keypoints') data.keyPoints.push(cleanBullet);
            else if (currentSec === 'examples') data.examples.push(cleanBullet);
            else if (currentSec === 'dialogue') data.dialogue.push(line);
            else if (currentSec === 'tips') data.tips.push(cleanBullet);
            else if (currentSec === 'practice') data.practice.push(cleanBullet);
        }
    });

    if (!data.overview.length && !data.keyPoints.length && !data.examples.length && !data.dialogue.length) {
        data.overview = clean.split('\n').filter(Boolean);
    }
    return data;
}

window.playHandoutExampleAudio = function(prefix, idx, btnEl) {
    const item = parsedHandoutCache[prefix]?.examples?.[idx];
    if (!item) return;
    const cleanSpeech = item.replace(/\([^)]*\)/g, '').replace(/^(?:Correct|Incorrect|Wrong|Right)\s*:\s*/i, '').trim();
    window.playNaturalEnglishTTS(cleanSpeech, btnEl);
};

window.playHandoutDialogueAudio = function(prefix, btnEl) {
    const lines = parsedHandoutCache[prefix]?.dialogue || [];
    if (!lines.length) return;
    window.playNaturalEnglishTTS(lines.join('\n'), btnEl);
};

function renderSmartHandout(prefix, rawContent, monthTitle, sessionNumber, docBadge, emptyMsg) {
    const box = document.getElementById(`${prefix}-viewer-box`);
    if (!box) return;

    const trimmed = String(rawContent || '').trim();
    if (!trimmed) {
        parsedHandoutCache[prefix] = null;
        box.innerHTML = `
            <div class="hes-card py-14 text-center space-y-3 border-dashed">
                <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto text-lg">
                    <i class="fas ${prefix === 'recap' ? 'fa-clipboard-list' : 'fa-book-open'}"></i>
                </div>
                <p class="text-xs sm:text-sm font-extrabold text-slate-500">${emptyMsg}</p>
                ${window.HES.userRole === 'admin' ? `<a href="admin.html?tab=materials" class="hes-btn-soft !text-xs"><i class="fas fa-plus mr-1"></i> Isi Materi di Panel Admin</a>` : ''}
            </div>`;
        return;
    }

    // Jika data lama masih berupa link Google Drive, tetap dukung pratinjau sembari menyarankan format baru
    if (/^https?:\/\//i.test(trimmed)) {
        const previewUrl = parseDriveLink(trimmed);
        box.innerHTML = `
            <div class="hes-card space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-extrabold text-slate-800">${docBadge}</h3>
                    <a href="${trimmed}" target="_blank" class="hes-btn-soft !py-1.5 !px-3 !text-xs"><i class="fas fa-expand"></i> Buka Link</a>
                </div>
                <iframe src="${previewUrl}" class="w-full h-[65vh] rounded-xl border border-slate-200 bg-slate-50"></iframe>
            </div>`;
        return;
    }

    const { week, day } = activeMateriState;
    const defaultTitle = `${monthTitle} • Session ${sessionNumber}`;
    const defaultLevel = `${monthTitle} • Week ${week}, Day ${day}`;
    const data = parseSmartHandoutText(trimmed, defaultTitle, defaultLevel);
    parsedHandoutCache[prefix] = data;

    const isRecap = prefix === 'recap';
    const accentGrad = isRecap ? 'from-emerald-800 via-teal-600 to-sky-500' : 'from-blue-900 via-blue-600 to-sky-400';

    box.innerHTML = `
        <!-- Top Action Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-gradient-to-r ${isRecap ? 'from-teal-700 to-emerald-600' : 'from-blue-700 to-indigo-600'} text-white px-5 py-3.5 rounded-2xl shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center text-sm font-black shrink-0">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <p class="text-xs sm:text-sm font-extrabold text-white">${docBadge} &bull; Session ${sessionNumber}</p>
                    <p class="text-[11px] text-blue-100">Official Hamdi English Studio Handout (With Watermark)</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button id="btn-dl-${prefix}" onclick="downloadHandoutPDF('${prefix}')" class="bg-white hover:bg-blue-50 text-blue-700 font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer">
                    <i class="fas fa-download"></i> Download PDF
                </button>
                ${window.HES.userRole === 'admin' ? `
                <a href="admin.html?tab=materials" class="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition" title="Edit di Panel Admin">
                    <i class="fas fa-pen"></i>
                </a>` : ''}
            </div>
        </div>

        <!-- Kartu Modul Bergaya Rapor Eksklusif -->
        <div id="printable-handout-${prefix}" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="bg-white mx-auto rounded-3xl shadow-md border border-slate-200/80 overflow-hidden text-slate-800 relative">
            <div class="h-2.5 w-full bg-gradient-to-r ${accentGrad}"></div>

            <!-- Ornamen & Watermark Latar Belakang -->
            <div class="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-blue-500/[0.06] pointer-events-none"></div>
            <div class="absolute -bottom-24 -left-20 w-96 h-96 rounded-full bg-sky-500/[0.06] pointer-events-none"></div>
            <div class="absolute inset-0 flex flex-col items-center justify-around pointer-events-none select-none overflow-hidden opacity-[0.035] -rotate-12">
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-blue-950 whitespace-nowrap">HAMDI ENGLISH STUDIO</span>
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-blue-950 whitespace-nowrap">FRIENDLY LEARNING SPACE</span>
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-blue-950 whitespace-nowrap">HAMDI ENGLISH STUDIO</span>
            </div>

            <div class="relative z-10 p-6 sm:p-10 space-y-7">
                <!-- Header Brand & Judul Materi -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                    <div class="flex items-start sm:items-center gap-4">
                        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-600 text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div>
                            <p class="text-[11px] font-extrabold uppercase tracking-widest text-blue-600">Hamdi English Studio &bull; Official Study Guide</p>
                            <h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">${data.title}</h1>
                        </div>
                    </div>
                    <div class="self-start sm:self-center shrink-0">
                        <span class="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                            ${monthTitle} &bull; Session ${sessionNumber}/12
                        </span>
                    </div>
                </div>

                <!-- Banner Learning Goal & Info -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-4 bg-[#EFF6FF] p-5 rounded-2xl border-l-4 border-l-blue-600">
                    <div class="md:col-span-8">
                        <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-600"><i class="fas fa-bullseye mr-1"></i> Learning Objective (Goal)</p>
                        <p class="text-sm sm:text-base font-bold text-slate-800 mt-1 leading-relaxed">${data.goal}</p>
                    </div>
                    <div class="md:col-span-4 md:border-l md:border-blue-200/80 md:pl-4 flex flex-col justify-center">
                        <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">Level & Module</p>
                        <p class="text-sm font-extrabold text-blue-900 mt-0.5">${data.level}</p>
                        <p class="text-xs font-semibold text-slate-500 mt-0.5">Week ${week} &bull; Day ${day}</p>
                    </div>
                </div>

                <!-- 1. Overview / Core Explanation -->
                ${data.overview.length ? `
                <div class="space-y-2.5">
                    <div class="flex items-center gap-2.5">
                        <span class="w-1.5 h-5 rounded-full bg-blue-600"></span>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Concept & Core Explanation</h3>
                    </div>
                    <div class="p-5 sm:p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 space-y-3 text-sm sm:text-base font-medium text-slate-700 leading-relaxed">
                        ${data.overview.map(p => `<p>${p}</p>`).join('')}
                    </div>
                </div>` : ''}

                <!-- 2. Key Points / Patterns -->
                ${data.keyPoints.length ? `
                <div class="space-y-3">
                    <div class="flex items-center gap-2.5">
                        <span class="w-1.5 h-5 rounded-full bg-indigo-600"></span>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Key Rules & Patterns to Remember</h3>
                    </div>
                    <div class="grid grid-cols-1 gap-2.5">
                        ${data.keyPoints.map((pt, i) => `
                            <div class="p-4 rounded-2xl bg-[#F4F8FD] border border-blue-100 flex items-start gap-3.5">
                                <span class="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
                                <p class="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed">${pt}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>` : ''}

                <!-- 3. Practical Examples (With Audio TTS!) -->
                ${data.examples.length ? `
                <div class="space-y-3">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2.5">
                            <span class="w-1.5 h-5 rounded-full bg-emerald-600"></span>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Practical Everyday Examples</h3>
                        </div>
                        <span class="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg"><i class="fas fa-volume-up mr-1"></i> Klik ikon speaker untuk mendengar pelafalan</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        ${data.examples.map((ex, idx) => `
                            <div class="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 transition flex items-center justify-between gap-3 shadow-2xs">
                                <p class="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed">${ex}</p>
                                <button type="button" onclick="playHandoutExampleAudio('${prefix}', ${idx}, this)" class="w-9 h-9 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer" title="Dengarkan Pelafalan">
                                    <i class="fas fa-volume-up text-xs"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>` : ''}

                <!-- 4. Natural Conversation / Dialogue -->
                ${data.dialogue.length ? `
                <div class="space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2.5">
                            <span class="w-1.5 h-5 rounded-full bg-sky-500"></span>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Real-Life Conversation Practice</h3>
                        </div>
                        <button type="button" onclick="playHandoutDialogueAudio('${prefix}', this)" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer">
                            <i class="fas fa-play mr-1.5"></i> Putar Dialog (Man & Woman)
                        </button>
                    </div>
                    <div class="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/50 border border-blue-100 space-y-2.5">
                        ${data.dialogue.map(line => {
                            const match = line.match(/^([A-Za-z\s.]{1,20})\s*:\s*(.+)$/);
                            if (match) {
                                const spk = match[1].trim();
                                const txt = match[2].trim();
                                const isMale = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|waiter|a)\b/i.test(spk);
                                return `
                                    <div class="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200/70">
                                        <span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold shrink-0 ${isMale ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}">${spk}</span>
                                        <p class="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed">${txt}</p>
                                    </div>`;
                            }
                            return `<p class="text-xs sm:text-sm font-semibold text-slate-700">${line}</p>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                <!-- 5. Pro Tips & Quick Practice -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${data.tips.length ? `
                    <div class="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2.5">
                        <h4 class="text-xs sm:text-sm font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                            <i class="fas fa-lightbulb text-amber-500"></i> Pro Tips & Common Mistakes
                        </h4>
                        <ul class="space-y-2 text-xs sm:text-sm font-semibold text-amber-950/90">
                            ${data.tips.map(t => `<li class="flex items-start gap-2"><span class="text-amber-600 font-black">&bull;</span><span>${t}</span></li>`).join('')}
                        </ul>
                    </div>` : ''}

                    ${data.practice.length ? `
                    <div class="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2.5">
                        <h4 class="text-xs sm:text-sm font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                            <i class="fas fa-microphone-lines text-emerald-600"></i> Speaking & Writing Mission
                        </h4>
                        <ol class="space-y-2 text-xs sm:text-sm font-semibold text-emerald-950/90">
                            ${data.practice.map((p, i) => `<li class="flex items-start gap-2"><span class="font-black text-emerald-700">${i + 1}.</span><span>${p}</span></li>`).join('')}
                        </ol>
                    </div>` : ''}
                </div>

                <!-- Footer Resmi Ber-Watermark -->
                <div class="pt-5 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-base">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div>
                            <p class="text-sm font-extrabold text-slate-900">Hamdi English Studio</p>
                            <p class="text-xs font-semibold text-slate-500">Friendly Learning Space &bull; Official Course Handout</p>
                        </div>
                    </div>
                    <div class="text-left sm:text-right">
                        <p class="text-xs font-extrabold text-blue-700">Curated by Hamdi Rizal</p>
                        <p class="text-[11px] font-semibold text-slate-400">${monthTitle} &bull; Session ${sessionNumber} of 12</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// GENERATOR PDF A4 BER-WATERMARK (MULTI-HALAMAN OTOMATIS & ANTI TERPOTONG)
// ============================================================================
function drawHandoutRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) { ctx.lineWidth = lineWidth; ctx.strokeStyle = strokeStyle; ctx.stroke(); }
}

function wrapHandoutLines(ctx, text, maxW) {
    const paragraphs = String(text || '').split('\n');
    const lines = [];
    paragraphs.forEach(p => {
        const words = p.trim().split(/\s+/);
        if (!words[0]) return;
        let cur = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = cur + ' ' + words[i];
            if (ctx.measureText(test).width <= maxW) cur = test;
            else { lines.push(cur); cur = words[i]; }
        }
        lines.push(cur);
    });
    return lines;
}

function createDecoratedHandoutPage(W, H, fontStack, monthTitle, sessionNumber, pageNum) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Top Gradient Bar
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    topGrad.addColorStop(0, '#1E3A8A');
    topGrad.addColorStop(0.5, '#2563EB');
    topGrad.addColorStop(1, '#0EA5E9');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 26);

    // Soft Ornaments
    ctx.save();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
    ctx.beginPath(); ctx.arc(W - 120, 220, 340, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(140, H - 240, 380, 0, Math.PI * 2); ctx.fill();

    // Diagonal Watermark "HAMDI ENGLISH STUDIO"
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30, 58, 138, 0.042)';
    ctx.font = `800 86px ${fontStack}`;
    ctx.fillText('HAMDI ENGLISH STUDIO', 0, -380);
    ctx.fillText('FRIENDLY LEARNING SPACE', 0, 40);
    ctx.fillText('HAMDI ENGLISH STUDIO', 0, 460);
    ctx.restore();

    // Official Footer Watermark
    const padX = 110;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, H - 130);
    ctx.lineTo(W - padX, H - 130);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#1D4ED8';
    ctx.font = `800 24px ${fontStack}`;
    ctx.fillText('HAMDI ENGLISH STUDIO  •  Friendly Learning Space', padX, H - 82);

    ctx.fillStyle = '#64748B';
    ctx.font = `600 20px ${fontStack}`;
    ctx.fillText(`Official Study Handout  •  ${monthTitle} (Session ${sessionNumber} of 12)  •  Curated by Hamdi Rizal`, padX, H - 48);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = `800 22px ${fontStack}`;
    ctx.fillText(`Page ${pageNum}`, W - padX, H - 65);

    return { canvas, ctx };
}

window.downloadHandoutPDF = async function(prefix = 'presentation') {
    const data = parsedHandoutCache[prefix];
    if (!data) return showToast('Materi belum tersedia untuk diunduh.', 'error');

    const btn = document.getElementById(`btn-dl-${prefix}`);
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Menyiapkan PDF...`;
    }

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        const { monthId, week, day } = activeMateriState;
        const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
        const sessionNumber = ((week - 1) * 3) + day;
        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';
        const W = 1654, H = 2339, padX = 110, contentW = W - (padX * 2), maxY = H - 180;

        const pages = [];
        let pageNum = 1;
        let curPage = createDecoratedHandoutPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum);
        pages.push(curPage.canvas);
        let ctx = curPage.ctx;
        let y = 110;

        const ensureSpace = (neededH) => {
            if (y + neededH > maxY) {
                pageNum++;
                curPage = createDecoratedHandoutPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum);
                pages.push(curPage.canvas);
                ctx = curPage.ctx;
                y = 110;
            }
        };

        // Header on Page 1
        drawHandoutRoundedRect(ctx, padX, y, 96, 96, 24, '#1D4ED8');
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `800 44px ${fontStack}`;
        ctx.fillText('HES', padX + 48, y + 63);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#2563EB';
        ctx.font = `800 22px ${fontStack}`;
        ctx.fillText('HAMDI ENGLISH STUDIO  •  OFFICIAL STUDY HANDOUT', padX + 122, y + 34);

        ctx.fillStyle = '#0F172A';
        ctx.font = `800 44px ${fontStack}`;
        const titleLines = wrapHandoutLines(ctx, data.title, contentW - 130);
        titleLines.slice(0, 2).forEach((tl, idx) => {
            ctx.fillText(tl, padX + 122, y + 84 + (idx * 48));
        });
        y += Math.max(125, 85 + (titleLines.slice(0, 2).length * 46));

        // Goal Box
        ctx.font = `700 25px ${fontStack}`;
        const goalLines = wrapHandoutLines(ctx, data.goal, contentW - 80);
        const goalBoxH = 85 + (goalLines.length * 36);
        drawHandoutRoundedRect(ctx, padX, y, contentW, goalBoxH, 24, '#EFF6FF');
        drawHandoutRoundedRect(ctx, padX, y, 12, goalBoxH, 6, '#2563EB');

        ctx.fillStyle = '#1D4ED8';
        ctx.font = `800 19px ${fontStack}`;
        ctx.fillText(`LEARNING OBJECTIVE  •  ${data.level.toUpperCase()}`, padX + 38, y + 40);

        ctx.fillStyle = '#1E293B';
        ctx.font = `700 25px ${fontStack}`;
        goalLines.forEach((gl, i) => ctx.fillText(gl, padX + 38, y + 80 + (i * 36)));
        y += goalBoxH + 42;

        const drawSectionHeader = (title, color = '#2563EB') => {
            ensureSpace(90);
            drawHandoutRoundedRect(ctx, padX, y - 24, 10, 32, 5, color);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#0F172A';
            ctx.font = `800 30px ${fontStack}`;
            ctx.fillText(title, padX + 24, y);
            y += 28;
        };

        // 1. Overview
        if (data.overview.length) {
            drawSectionHeader('Concept & Core Explanation', '#2563EB');
            ctx.font = `600 25px ${fontStack}`;
            const allOvLines = [];
            data.overview.forEach(p => {
                wrapHandoutLines(ctx, p, contentW - 72).forEach(l => allOvLines.push(l));
                allOvLines.push('');
            });
            if (allOvLines[allOvLines.length - 1] === '') allOvLines.pop();

            const boxH = 52 + (allOvLines.length * 38);
            ensureSpace(boxH + 30);
            drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 22, '#F8FAFC', '#E2E8F0', 2);
            ctx.fillStyle = '#334155';
            ctx.font = `600 25px ${fontStack}`;
            allOvLines.forEach((l, i) => ctx.fillText(l, padX + 36, y + 46 + (i * 38)));
            y += boxH + 40;
        }

        // 2. Key Points
        if (data.keyPoints.length) {
            drawSectionHeader('Key Rules & Patterns', '#4F46E5');
            data.keyPoints.forEach((pt, idx) => {
                ctx.font = `700 24px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, pt, contentW - 110);
                const itemH = 38 + (lines.length * 35);
                ensureSpace(itemH + 16);
                drawHandoutRoundedRect(ctx, padX, y, contentW, itemH, 18, '#F4F8FD', '#DBEAFE', 2);
                drawHandoutRoundedRect(ctx, padX + 24, y + 18, 40, 40, 10, '#2563EB');
                ctx.textAlign = 'center';
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `800 21px ${fontStack}`;
                ctx.fillText(String(idx + 1), padX + 44, y + 45);

                ctx.textAlign = 'left';
                ctx.fillStyle = '#1E293B';
                ctx.font = `700 24px ${fontStack}`;
                lines.forEach((l, i) => ctx.fillText(l, padX + 82, y + 45 + (i * 35)));
                y += itemH + 14;
            });
            y += 24;
        }

        // 3. Examples
        if (data.examples.length) {
            drawSectionHeader('Practical Everyday Examples', '#059669');
            data.examples.forEach(ex => {
                ctx.font = `700 24px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, `•  ${ex}`, contentW - 72);
                const itemH = 32 + (lines.length * 34);
                ensureSpace(itemH + 12);
                drawHandoutRoundedRect(ctx, padX, y, contentW, itemH, 16, '#F0FDF4', '#BBF7D0', 2);
                ctx.fillStyle = '#065F46';
                lines.forEach((l, i) => ctx.fillText(l, padX + 32, y + 40 + (i * 34)));
                y += itemH + 12;
            });
            y += 24;
        }

        // 4. Dialogue
        if (data.dialogue.length) {
            drawSectionHeader('Real-Life Conversation Practice', '#0284C7');
            data.dialogue.forEach(line => {
                ctx.font = `600 24px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, line, contentW - 72);
                const itemH = 30 + (lines.length * 34);
                ensureSpace(itemH + 10);
                drawHandoutRoundedRect(ctx, padX, y, contentW, itemH, 16, '#F8FAFC', '#E2E8F0', 2);
                ctx.fillStyle = '#0F172A';
                lines.forEach((l, i) => ctx.fillText(l, padX + 32, y + 38 + (i * 34)));
                y += itemH + 10;
            });
            y += 24;
        }

        // 5. Tips & Practice
        if (data.tips.length) {
            drawSectionHeader('Pro Tips & Common Mistakes', '#D97706');
            data.tips.forEach(tip => {
                ctx.font = `600 23px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, `★  ${tip}`, contentW - 72);
                const itemH = 30 + (lines.length * 34);
                ensureSpace(itemH + 10);
                drawHandoutRoundedRect(ctx, padX, y, contentW, itemH, 16, '#FFFBEB', '#FDE68A', 2);
                ctx.fillStyle = '#92400E';
                lines.forEach((l, i) => ctx.fillText(l, padX + 32, y + 38 + (i * 34)));
                y += itemH + 10;
            });
            y += 24;
        }

        if (data.practice.length) {
            drawSectionHeader('Speaking & Writing Practice', '#4F46E5');
            data.practice.forEach((pr, idx) => {
                ctx.font = `700 23px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, `${idx + 1}.  ${pr}`, contentW - 72);
                const itemH = 30 + (lines.length * 34);
                ensureSpace(itemH + 10);
                drawHandoutRoundedRect(ctx, padX, y, contentW, itemH, 16, '#EEF2FF', '#C7D2FE', 2);
                ctx.fillStyle = '#312E81';
                lines.forEach((l, i) => ctx.fillText(l, padX + 32, y + 38 + (i * 34)));
                y += itemH + 10;
            });
        }

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pages.forEach((cv, idx) => {
                if (idx > 0) pdf.addPage();
                pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
            });
            const cleanTitle = data.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
            pdf.save(`HES_${monthObj.title.replace(/\s+/g, '')}_Session${sessionNumber}_${cleanTitle}.pdf`);
            showToast('Modul PDF ber-watermark berhasil diunduh!', 'success');
        }
    } catch (e) {
        console.error(e);
        showToast('Gagal membuat PDF.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
};

function renderVocabList() {
    const container = document.getElementById('vocab-cards-container');
    if (!container) return;
    if (!currentVocabItems.length) {
        container.innerHTML = `<p class="text-center py-10 text-sm font-bold text-slate-400">Belum ada kosakata untuk sesi ini.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="max-w-3xl mx-auto fade-in mt-2">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
                ${currentVocabItems.map(item => {
                    const safeWord = item.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    return `
                        <div class="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all duration-200">
                            <div class="flex flex-col">
                                <span class="text-base font-extrabold text-slate-800">${item.eng}</span>
                                <span class="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">${item.ind}</span>
                            </div>
                            <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition shrink-0 cursor-pointer">
                                <i class="fas fa-volume-up"></i>
                            </button>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderVocabQuiz() {
    const container = document.getElementById('vocab-cards-container');
    if (!container || !currentVocabItems.length) return;

    if (quizState.index >= currentVocabItems.length) {
        const pct = Math.round((quizState.score / currentVocabItems.length) * 100);
        container.innerHTML = `
            <div class="max-w-md mx-auto text-center py-8 px-4 bg-gradient-to-b from-indigo-50/70 to-white rounded-2xl border border-indigo-100 fade-in">
                <div class="mb-4"><i class="fas fa-trophy text-5xl text-amber-500"></i></div>
                <h4 class="text-xl font-black text-slate-800">Kuis Selesai!</h4>
                <p class="text-sm font-bold text-slate-500 mt-1">Kamu menjawab benar <strong class="text-indigo-600">${quizState.score} dari ${currentVocabItems.length}</strong> kata (${pct}%)</p>
                <div class="mt-6 flex justify-center gap-3">
                    <button onclick="switchVocabSubmode('quiz')" class="hes-btn-primary cursor-pointer"><i class="fas fa-redo"></i> Main Lagi</button>
                    <button onclick="switchVocabSubmode('list')" class="hes-btn-soft cursor-pointer">Kembali ke Daftar</button>
                </div>
            </div>`;
        return;
    }

    const currentItem = currentVocabItems[quizState.index];
    const safeWord = currentItem.eng.replace(/'/g, "\\'").replace(/"/g, '&quot;');

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

            <div class="p-6 rounded-xl bg-indigo-50/70 border border-indigo-100 text-center mb-4">
                <p class="text-[11px] font-black uppercase text-indigo-500 mb-1">Apa arti dari kata ini?</p>
                <div class="flex items-center justify-center gap-3">
                    <h4 class="text-2xl sm:text-3xl font-black text-slate-800">${currentItem.eng}</h4>
                    <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center cursor-pointer">
                        <i class="fas fa-volume-up text-xs"></i>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-2.5">
                ${options.map(opt => {
                    const isCorr = opt === currentItem.ind;
                    return `<button onclick="answerVocabQuiz(this, ${isCorr})" class="quiz-opt-btn w-full p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 text-left text-xs sm:text-sm font-bold text-slate-700 transition cursor-pointer">${opt}</button>`;
                }).join('')}
            </div>
        </div>`;
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

    setTimeout(() => {
        quizState.index++;
        quizState.answered = false;
        renderVocabQuiz();
    }, 950);
};

window.speakVocabWord = function(event, word, btnEl) {
    event?.stopPropagation();
    window.playNaturalEnglishTTS(word, btnEl);
};

window.submitVocab = async function(btn, m, w, d) {
    const email = window.HES.currentUser.email;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    const { error } = await safeSaveMaterialsToCloud(materials => {
        materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status: 'submitted', feedback: '' };
    });
    if (!error) { showToast('Hafalan tercatat! +10 XP', 'success'); renderMateriContent(); }
    else { showToast('Gagal menyimpan: ' + error.message, 'error'); btn.disabled = false; }
};