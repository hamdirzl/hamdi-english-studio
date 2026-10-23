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

    renderSmartHandout('presentation', rawModule, monthObj.title, currentSessionNumber, 'Study Workbook Handout', 'Modul materi utama belum diterbitkan untuk pertemuan ini.');
    renderSmartHandout('recap', rawRecap, monthObj.title, currentSessionNumber, 'Class Recap & Feedback', 'Catatan rangkuman kelas belum tersedia untuk pertemuan ini.');
}

// ============================================================================
// SMART WORKBOOK PARSER (8-SECTION FRIENDLY & COMPLETE STRUCTURE)
// ============================================================================
function escapeHtmlStr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRichEnglishText(text) {
    return escapeHtmlStr(text)
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-slate-900">$1</strong>')
        .replace(/"([^"]+)"/g, '<span class="font-bold text-blue-700 bg-blue-50/90 px-1.5 py-0.5 rounded-md border border-blue-200/60">"$1"</span>')
        .replace(/->|→/g, '<i class="fas fa-arrow-right text-indigo-500 mx-1 text-[11px]"></i>');
}

function parseSmartHandoutText(rawText, defaultTitle, defaultLevel) {
    const clean = String(rawText || '').replace(/\r\n/g, '\n').trim();
    const data = {
        title: defaultTitle,
        level: defaultLevel,
        goal: 'Master today\'s core English patterns and speak naturally with confidence.',
        warmUp: [],
        concepts: [],
        formulas: [],
        phrases: [],
        examples: [],
        mistakes: [],
        dialogue: [],
        practice: []
    };

    if (!clean) return data;

    let currentSec = 'concept';
    clean.split('\n').forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || /^SESSION\s*:\s*\d+/i.test(line)) return;

        if (/^TITLE\s*:/i.test(line)) {
            data.title = line.replace(/^TITLE\s*:\s*/i, '').trim() || data.title;
            return;
        }
        if (/^(?:LEVEL|SUBTITLE)\s*:/i.test(line)) {
            data.level = line.replace(/^(?:LEVEL|SUBTITLE)\s*:\s*/i, '').trim() || data.level;
            return;
        }
        if (/^(?:GOAL|OBJECTIVE)\s*:/i.test(line)) {
            data.goal = line.replace(/^(?:GOAL|OBJECTIVE)\s*:\s*/i, '').trim() || data.goal;
            return;
        }

        // Section Headers
        if (/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER)\s*:?$/i.test(line)) { currentSec = 'warmup'; return; }
        if (/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY)\s*:?$/i.test(line)) { currentSec = 'concept'; return; }
        if (/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY)\s*:/i.test(line)) {
            currentSec = 'concept';
            const rest = line.replace(/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY)\s*:\s*/i, '').trim();
            if (rest) data.concepts.push({ title: 'Core Idea', body: rest });
            return;
        }
        if (/^(?:FORMULAS?|PATTERNS?|GRAMMAR|KEY\s*POINTS?|RULES?)\s*:?$/i.test(line)) { currentSec = 'formulas'; return; }
        if (/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?)\s*:?$/i.test(line)) { currentSec = 'phrases'; return; }
        if (/^(?:EXAMPLES?|SENTENCES?)\s*:?$/i.test(line)) { currentSec = 'examples'; return; }
        if (/^(?:MISTAKES?|COMMON\s*MISTAKES?|TIPS?|PRO\s*TIPS?|NOTES?)\s*:?$/i.test(line)) { currentSec = 'mistakes'; return; }
        if (/^(?:DIALOGUE|CONVERSATION)\s*:?$/i.test(line)) { currentSec = 'dialogue'; return; }
        if (/^(?:PRACTICE|EXERCISES?|TASKS?|HOMEWORK|MISSION)\s*:?$/i.test(line)) { currentSec = 'practice'; return; }

        const stripped = line.replace(/^[-*•]\s*|\d+[.)]\s*/, '').trim();

        if (currentSec === 'warmup') {
            data.warmUp.push(stripped);
        } else if (currentSec === 'concept') {
            const colonMatch = stripped.match(/^([^:]{2,42}):\s*(.+)$/);
            if (colonMatch) {
                data.concepts.push({ title: colonMatch[1].replace(/^\[|\]$/g, '').trim(), body: colonMatch[2].trim() });
            } else {
                data.concepts.push({ title: '', body: stripped });
            }
        } else if (currentSec === 'formulas') {
            if (line.includes('|')) {
                const parts = line.replace(/^[-*•]\s*/, '').split('|').map(s => s.trim());
                let badge = '[*]', label = parts[0] || 'Pattern', formula = parts[1] || '', example = parts[2] || '';
                const bMatch = label.match(/^(\[[+?*-]\])\s*(.*)$/);
                if (bMatch) { badge = bMatch[1]; label = bMatch[2] || 'Pattern'; }
                data.formulas.push({ badge, label, formula, example });
            } else if (stripped.includes(':')) {
                const [lbl, ...rest] = stripped.split(':');
                const rhs = rest.join(':').trim();
                const arrowParts = rhs.split(/->|→/);
                data.formulas.push({
                    badge: '[*]',
                    label: lbl.trim(),
                    formula: arrowParts[0]?.trim() || rhs,
                    example: arrowParts.slice(1).join(' / ').trim()
                });
            } else {
                data.formulas.push({ badge: '[*]', label: 'Key Rule', formula: stripped, example: '' });
            }
        } else if (currentSec === 'phrases') {
            if (stripped.includes('|')) {
                const parts = stripped.split('|').map(s => s.trim());
                data.phrases.push({ phrase: parts[0] || '', meaning: parts[1] || '', example: parts[2] || '' });
            } else if (stripped.includes('=')) {
                const [p, ...r] = stripped.split('=');
                data.phrases.push({ phrase: p.trim(), meaning: r.join('=').trim(), example: '' });
            } else {
                data.phrases.push({ phrase: stripped, meaning: '', example: '' });
            }
        } else if (currentSec === 'examples') {
            if (stripped.includes('|')) {
                const parts = stripped.split('|').map(s => s.trim());
                if (parts.length >= 3) {
                    data.examples.push({ tag: parts[0].replace(/^\[|\]$/g, ''), sentence: parts[1], note: parts.slice(2).join(' ') });
                } else {
                    data.examples.push({ tag: 'Example', sentence: parts[0], note: parts[1] || '' });
                }
            } else {
                data.examples.push({ tag: `Example #${data.examples.length + 1}`, sentence: stripped, note: '' });
            }
        } else if (currentSec === 'mistakes') {
            if (stripped.includes('|')) {
                const parts = stripped.split('|').map(s => s.trim());
                data.mistakes.push({ wrong: parts[0] || '', right: parts[1] || '', reason: parts[2] || '' });
            } else {
                data.mistakes.push({ wrong: '', right: stripped, reason: '' });
            }
        } else if (currentSec === 'dialogue') {
            data.dialogue.push(line);
        } else if (currentSec === 'practice') {
            const pMatch = stripped.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
            if (pMatch) {
                data.practice.push({ tag: pMatch[1].trim(), task: pMatch[2].trim() });
            } else {
                data.practice.push({ tag: `Task #${data.practice.length + 1}`, task: stripped });
            }
        }
    });

    return data;
}

window.playHandoutTextAudio = function(rawSpeech, btnEl) {
    const cleanSpeech = String(rawSpeech || '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/^(?:Correct|Incorrect|Wrong|Right)\s*:\s*/i, '')
        .trim();
    if (!cleanSpeech) return;
    window.playNaturalEnglishTTS(cleanSpeech, btnEl);
};

window.playHandoutExampleAudio = function(prefix, idx, btnEl) {
    const item = parsedHandoutCache[prefix]?.examples?.[idx];
    if (!item) return;
    window.playHandoutTextAudio(item.sentence, btnEl);
};

window.playHandoutPhraseAudio = function(prefix, idx, btnEl) {
    const item = parsedHandoutCache[prefix]?.phrases?.[idx];
    if (!item) return;
    const text = item.example ? `${item.phrase}. ${item.example}` : item.phrase;
    window.playHandoutTextAudio(text, btnEl);
};

window.playHandoutDialogueLine = function(prefix, idx, btnEl) {
    const line = parsedHandoutCache[prefix]?.dialogue?.[idx];
    if (!line) return;
    window.playNaturalEnglishTTS(line, btnEl);
};

window.playHandoutDialogueAudio = function(prefix, btnEl) {
    const lines = parsedHandoutCache[prefix]?.dialogue || [];
    if (!lines.length) return;
    window.playNaturalEnglishTTS(lines.join('\n'), btnEl);
};

window.scrollToHandoutSection = function(elId) {
    const target = document.getElementById(elId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    let stepCounter = 1;
    const nextStepNum = () => String(stepCounter++).padStart(2, '0');

    // Quick Jump Pills
    const navPills = [];
    if (data.warmUp.length) navPills.push({ id: `${prefix}-sec-warmup`, icon: 'fa-mug-hot', label: 'Warm-Up' });
    if (data.concepts.length) navPills.push({ id: `${prefix}-sec-concept`, icon: 'fa-lightbulb', label: 'Concept' });
    if (data.formulas.length) navPills.push({ id: `${prefix}-sec-formulas`, icon: 'fa-Compass-drafting', label: 'Formulas' });
    if (data.phrases.length) navPills.push({ id: `${prefix}-sec-phrases`, icon: 'fa-comment-dots', label: 'Phrases' });
    if (data.examples.length) navPills.push({ id: `${prefix}-sec-examples`, icon: 'fa-volume-high', label: 'Examples' });
    if (data.mistakes.length) navPills.push({ id: `${prefix}-sec-mistakes`, icon: 'fa-check-double', label: 'Common Mistakes' });
    if (data.dialogue.length) navPills.push({ id: `${prefix}-sec-dialogue`, icon: 'fa-comments', label: 'Conversation' });
    if (data.practice.length) navPills.push({ id: `${prefix}-sec-practice`, icon: 'fa-dumbbell', label: 'Practice' });

    box.innerHTML = `
        <!-- Action Bar Atas (Persis Gaya Rapor) -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-blue-600 text-white px-5 py-3.5 rounded-2xl shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center text-base font-black shrink-0">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <p class="text-xs sm:text-sm font-extrabold text-white">${docBadge} &bull; Session ${sessionNumber} of 12</p>
                    <p class="text-[11px] text-blue-100">Interactive English Guide &bull; Ready to download as A4 PDF with Watermark</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button id="btn-dl-${prefix}" onclick="downloadHandoutPDF('${prefix}')" class="bg-white hover:bg-blue-50 text-blue-700 font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer">
                    <i class="fas fa-download"></i> Download PDF (A4)
                </button>
                ${window.HES.userRole === 'admin' ? `
                <a href="admin.html?tab=materials" class="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition" title="Edit Materi di Panel Admin">
                    <i class="fas fa-pen"></i>
                </a>` : ''}
            </div>
        </div>

        <!-- Dokumen Utama Bergaya Rapor & Interactive Workbook -->
        <div id="printable-handout-${prefix}" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="bg-white mx-auto rounded-3xl shadow-md border border-slate-200/90 overflow-hidden text-slate-800 relative">
            <!-- Top Gradient Line -->
            <div class="h-3 w-full bg-gradient-to-r ${isRecap ? 'from-emerald-700 via-teal-600 to-sky-400' : 'from-blue-900 via-blue-600 to-sky-400'}"></div>

            <!-- Background Artwork Ornaments & Watermark -->
            <div class="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-blue-500/[0.07] pointer-events-none"></div>
            <div class="absolute top-12 right-16 w-44 h-44 rounded-full border-[3px] border-blue-500/[0.08] pointer-events-none"></div>
            <div class="absolute -bottom-24 -left-20 w-96 h-96 rounded-full bg-sky-500/[0.07] pointer-events-none"></div>
            <div class="absolute inset-0 flex flex-col items-center justify-around pointer-events-none select-none overflow-hidden opacity-[0.03] -rotate-12">
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-blue-950 whitespace-nowrap">HAMDI ENGLISH STUDIO</span>
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-blue-950 whitespace-nowrap">FRIENDLY LEARNING SPACE</span>
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-blue-950 whitespace-nowrap">HAMDI ENGLISH STUDIO</span>
            </div>

            <div class="relative z-10 p-5 sm:p-9 space-y-8">
                <!-- HEADER BRAND & JUDUL MATERI -->
                <div class="space-y-5">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div class="flex items-start sm:items-center gap-4">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                            <div>
                                <p class="text-[11px] font-extrabold uppercase tracking-widest text-blue-600">Hamdi English Studio &bull; Friendly Learning Space</p>
                                <h1 class="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug">${escapeHtmlStr(data.title)}</h1>
                            </div>
                        </div>
                        <div class="self-start sm:self-center shrink-0">
                            <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-blue-100 text-blue-700">
                                <i class="fas fa-bookmark text-[10px]"></i> ${monthTitle} &bull; Session ${sessionNumber}
                            </span>
                        </div>
                    </div>

                    <!-- KOTAK INFO LEVEL & LEARNING GOAL (PERSIS GAYA RAPOR) -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#EFF6FF] p-5 sm:p-6 rounded-2xl border-l-4 border-l-blue-600">
                        <div class="lg:col-span-8">
                            <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                                <i class="fas fa-bullseye"></i> What You Will Master Today (Learning Goal)
                            </p>
                            <p class="text-sm sm:text-base font-bold text-slate-900 mt-1.5 leading-relaxed">${formatRichEnglishText(data.goal)}</p>
                        </div>
                        <div class="lg:col-span-4 lg:border-l lg:border-blue-200/80 lg:pl-5 flex flex-col justify-center">
                            <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Module & Session Info</p>
                            <p class="text-sm sm:text-base font-extrabold text-blue-700 mt-1">${escapeHtmlStr(data.level)}</p>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">Week ${week} &bull; Day ${day} &bull; Full English Handout</p>
                        </div>
                    </div>

                    <!-- Quick Jump Navigation Bar -->
                    ${navPills.length > 1 ? `
                    <div class="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        <span class="text-[11px] font-extrabold text-slate-400 uppercase shrink-0 mr-1"><i class="fas fa-compass mr-1"></i> Lompat ke:</span>
                        ${navPills.map(np => `
                            <button type="button" onclick="scrollToHandoutSection('${np.id}')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200/80 text-xs font-extrabold whitespace-nowrap transition cursor-pointer">
                                <i class="fas ${np.icon} mr-1 text-blue-500"></i> ${np.label}
                            </button>
                        `).join('')}
                    </div>` : ''}
                </div>

                <!-- ========================================================= -->
                <!-- STEP 1: WARM-UP & ICE BREAKER                             -->
                <!-- ========================================================= -->
                ${data.warmUp.length ? `
                <section id="${prefix}-sec-warmup" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-amber-500 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                        <div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Warm-Up & Ice Breaker</h3>
                            <p class="text-xs font-semibold text-slate-500">Answer these light questions aloud to warm up your English before diving in!</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-2.5 bg-gradient-to-br from-amber-50/90 to-orange-50/50 p-4 sm:p-5 rounded-2xl border border-amber-200/80">
                        ${data.warmUp.map((q, i) => {
                            const safeQ = q.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                            return `
                            <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-amber-200/70 shadow-2xs">
                                <div class="flex items-start gap-3">
                                    <span class="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">Q${i + 1}</span>
                                    <p class="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed">${formatRichEnglishText(q)}</p>
                                </div>
                                <button type="button" onclick="playHandoutTextAudio('${safeQ}', this)" class="w-9 h-9 rounded-xl bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer" title="Listen to Question">
                                    <i class="fas fa-volume-up text-xs"></i>
                                </button>
                            </div>`;
                        }).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 2: CORE CONCEPT & EASY EXPLANATION                   -->
                <!-- ========================================================= -->
                ${data.concepts.length ? `
                <section id="${prefix}-sec-concept" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                        <div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Core Concept & Easy Explanation</h3>
                            <p class="text-xs font-semibold text-slate-500">Understand how and when to use this topic in real everyday situations.</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        ${data.concepts.map((c, idx) => `
                            <div class="p-5 rounded-2xl bg-[#F4F8FD] border border-blue-100 flex flex-col justify-between ${data.concepts.length % 2 === 1 && idx === data.concepts.length - 1 ? 'md:col-span-2' : ''}">
                                <div>
                                    ${c.title ? `
                                    <div class="flex items-center gap-2 mb-2">
                                        <span class="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0"><i class="fas fa-check text-[10px]"></i></span>
                                        <h4 class="text-sm sm:text-base font-extrabold text-blue-950">${escapeHtmlStr(c.title)}</h4>
                                    </div>` : ''}
                                    <p class="text-xs sm:text-sm font-semibold text-slate-700 leading-relaxed">${formatRichEnglishText(c.body)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 3: SENTENCE PATTERNS & FORMULAS                      -->
                <!-- ========================================================= -->
                ${data.formulas.length ? `
                <section id="${prefix}-sec-formulas" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                        <div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Sentence Builders & Easy Formulas</h3>
                            <p class="text-xs font-semibold text-slate-500">Follow these visual building blocks to form positive, negative, and question sentences easily.</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-3">
                        ${data.formulas.map(f => {
                            let theme = { bg: 'bg-indigo-50/60', border: 'border-indigo-200', badgeBg: 'bg-indigo-600', text: 'text-indigo-950', pill: 'bg-indigo-100 text-indigo-800', icon: '★' };
                            if (f.badge === '[+]') theme = { bg: 'bg-emerald-50/60', border: 'border-emerald-200', badgeBg: 'bg-emerald-600', text: 'text-emerald-950', pill: 'bg-emerald-100 text-emerald-800', icon: '+' };
                            else if (f.badge === '[-]') theme = { bg: 'bg-rose-50/60', border: 'border-rose-200', badgeBg: 'bg-rose-600', text: 'text-rose-950', pill: 'bg-rose-100 text-rose-800', icon: '−' };
                            else if (f.badge === '[?]') theme = { bg: 'bg-blue-50/70', border: 'border-blue-200', badgeBg: 'bg-blue-600', text: 'text-blue-950', pill: 'bg-blue-100 text-blue-800', icon: '?' };

                            const safeEx = (f.example || f.formula).replace(/'/g, "\\'").replace(/"/g, '&quot;');
                            return `
                            <div class="p-4 sm:p-5 rounded-2xl ${theme.bg} border ${theme.border} flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div class="space-y-2 flex-1">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span class="w-7 h-7 rounded-lg ${theme.badgeBg} text-white font-black text-sm flex items-center justify-center shrink-0">${theme.icon}</span>
                                        <span class="text-xs sm:text-sm font-extrabold uppercase tracking-wide ${theme.text}">${escapeHtmlStr(f.label)}</span>
                                    </div>
                                    <div class="inline-block px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 font-extrabold text-xs sm:text-sm text-slate-900 shadow-2xs">
                                        ${formatRichEnglishText(f.formula)}
                                    </div>
                                    ${f.example ? `
                                    <p class="text-xs sm:text-sm font-bold text-slate-700 pt-0.5">
                                        <span class="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-md ${theme.pill} mr-1.5">Example</span>
                                        ${formatRichEnglishText(f.example)}
                                    </p>` : ''}
                                </div>
                                ${f.example ? `
                                <button type="button" onclick="playHandoutTextAudio('${safeEx}', this)" class="self-start md:self-center px-3.5 py-2 rounded-xl bg-white hover:bg-blue-600 text-blue-700 hover:text-white border border-slate-200 text-xs font-extrabold transition shrink-0 cursor-pointer shadow-2xs">
                                    <i class="fas fa-volume-up mr-1"></i> Listen
                                </button>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 4: MUST-KNOW PHRASES & NATURAL EXPRESSIONS           -->
                <!-- ========================================================= -->
                ${data.phrases.length ? `
                <section id="${prefix}-sec-phrases" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                        <div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Must-Know Phrases & Vocabulary Chunks</h3>
                            <p class="text-xs font-semibold text-slate-500">Use these natural English phrases to sound more fluent in daily conversation.</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        ${data.phrases.map((ph, idx) => `
                            <div class="p-4 rounded-2xl bg-teal-50/40 border border-teal-200/80 flex flex-col justify-between gap-2.5 hover:border-teal-400 transition">
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <span class="text-sm sm:text-base font-extrabold text-teal-950">${escapeHtmlStr(ph.phrase)}</span>
                                        ${ph.meaning ? `<p class="text-xs font-bold text-teal-700 mt-0.5">= ${escapeHtmlStr(ph.meaning)}</p>` : ''}
                                    </div>
                                    <button type="button" onclick="playHandoutPhraseAudio('${prefix}', ${idx}, this)" class="w-8 h-8 rounded-xl bg-white hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-200 flex items-center justify-center transition shrink-0 cursor-pointer" title="Listen to Phrase">
                                        <i class="fas fa-volume-up text-xs"></i>
                                    </button>
                                </div>
                                ${ph.example ? `
                                <div class="pt-2 border-t border-teal-200/50 text-xs font-semibold text-slate-700 italic">
                                    "${escapeHtmlStr(ph.example)}"
                                </div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 5: REAL-LIFE EXAMPLES WITH AUDIO                     -->
                <!-- ========================================================= -->
                ${data.examples.length ? `
                <section id="${prefix}-sec-examples" class="space-y-3.5 scroll-mt-20">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-3">
                            <span class="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                            <div>
                                <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Practical Everyday Examples</h3>
                                <p class="text-xs font-semibold text-slate-500">Click the speaker icon to hear the American English pronunciation and repeat aloud!</p>
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        ${data.examples.map((ex, idx) => `
                            <div class="p-4 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 transition flex flex-col justify-between gap-3 shadow-2xs">
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/70 text-[11px] font-extrabold uppercase tracking-wide">
                                            ${escapeHtmlStr(ex.tag || `Example #${idx + 1}`)}
                                        </span>
                                        <button type="button" onclick="playHandoutExampleAudio('${prefix}', ${idx}, this)" class="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-extrabold transition shrink-0 cursor-pointer">
                                            <i class="fas fa-volume-up mr-1"></i> Listen
                                        </button>
                                    </div>
                                    <p class="text-sm sm:text-base font-extrabold text-slate-900 leading-relaxed">${formatRichEnglishText(ex.sentence)}</p>
                                </div>
                                ${ex.note ? `
                                <p class="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                    <i class="fas fa-info-circle text-blue-500 mr-1"></i> ${escapeHtmlStr(ex.note)}
                                </p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 6: COMMON MISTAKES (DON'T SAY vs SAY THIS!)          -->
                <!-- ========================================================= -->
                ${data.mistakes.length ? `
                <section id="${prefix}-sec-mistakes" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                        <div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Common Mistakes: Don't Say vs. Say This!</h3>
                            <p class="text-xs font-semibold text-slate-500">Avoid these frequent grammar traps so your English sounds natural and accurate.</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-3">
                        ${data.mistakes.map(m => {
                            if (!m.wrong) {
                                return `
                                <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3">
                                    <i class="fas fa-lightbulb text-amber-500 mt-1"></i>
                                    <p class="text-xs sm:text-sm font-bold text-amber-950">${formatRichEnglishText(m.right)}</p>
                                </div>`;
                            }
                            const safeRight = m.right.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                            return `
                            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    <div class="p-3.5 rounded-xl bg-rose-50/90 border border-rose-200 flex items-start gap-2.5">
                                        <span class="w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-times"></i></span>
                                        <div>
                                            <span class="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">Don't Say (Incorrect)</span>
                                            <p class="text-xs sm:text-sm font-bold text-rose-950 line-through decoration-rose-400 mt-0.5">${escapeHtmlStr(m.wrong)}</p>
                                        </div>
                                    </div>
                                    <div class="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200 flex items-center justify-between gap-2.5">
                                        <div class="flex items-start gap-2.5">
                                            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-check"></i></span>
                                            <div>
                                                <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">Say This! (Natural English)</span>
                                                <p class="text-xs sm:text-sm font-extrabold text-emerald-950 mt-0.5">${escapeHtmlStr(m.right)}</p>
                                            </div>
                                        </div>
                                        <button type="button" onclick="playHandoutTextAudio('${safeRight}', this)" class="w-8 h-8 rounded-lg bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 flex items-center justify-center transition shrink-0 cursor-pointer" title="Listen">
                                            <i class="fas fa-volume-up text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                                ${m.reason ? `
                                <p class="text-xs font-bold text-slate-600 px-1">
                                    <span class="text-indigo-600 font-extrabold"><i class="fas fa-magic mr-1"></i> Why?</span> ${escapeHtmlStr(m.reason)}
                                </p>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 7: REAL-LIFE CONVERSATION (CHAT BUBBLE UI)           -->
                <!-- ========================================================= -->
                ${data.dialogue.length ? `
                <section id="${prefix}-sec-dialogue" class="space-y-3.5 scroll-mt-20">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <span class="w-8 h-8 rounded-xl bg-sky-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                            <div>
                                <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Real-Life Conversation Practice</h3>
                                <p class="text-xs font-semibold text-slate-500">Listen to the full dialogue or click any chat bubble to practice roleplaying!</p>
                            </div>
                        </div>
                        <button type="button" onclick="playHandoutDialogueAudio('${prefix}', this)" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer">
                            <i class="fas fa-play mr-1.5"></i> Play Full Conversation
                        </button>
                    </div>

                    <div class="p-4 sm:p-6 rounded-3xl bg-gradient-to-b from-slate-50 to-blue-50/40 border border-blue-100 space-y-3">
                        ${data.dialogue.map((line, lIdx) => {
                            const match = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
                            if (match) {
                                const spk = match[1].trim();
                                const txt = match[2].trim();
                                const isMale = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|a)\b/i.test(spk);
                                return `
                                <div class="flex items-start gap-3 ${isMale ? '' : 'sm:flex-row-reverse'}">
                                    <div class="w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs ${isMale ? 'bg-blue-600 text-white' : 'bg-rose-500 text-white'}">
                                        ${isMale ? '👨' : '👩'}
                                    </div>
                                    <div class="flex-1 max-w-2xl p-4 rounded-2xl border shadow-2xs ${isMale ? 'bg-white border-blue-200/80 rounded-tl-xs' : 'bg-blue-600 text-white border-blue-600 rounded-tr-xs'}">
                                        <div class="flex items-center justify-between gap-2 mb-1">
                                            <span class="text-[11px] font-extrabold uppercase tracking-wider ${isMale ? 'text-blue-600' : 'text-blue-100'}">${escapeHtmlStr(spk)}</span>
                                            <button type="button" onclick="playHandoutDialogueLine('${prefix}', ${lIdx}, this)" class="text-[11px] font-extrabold px-2 py-0.5 rounded-md transition cursor-pointer ${isMale ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-white/20 text-white hover:bg-white/30'}">
                                                <i class="fas fa-volume-up mr-1"></i> Play Line
                                            </button>
                                        </div>
                                        <p class="text-xs sm:text-sm font-bold leading-relaxed ${isMale ? 'text-slate-800' : 'text-white'}">${escapeHtmlStr(txt)}</p>
                                    </div>
                                </div>`;
                            }
                            return `<p class="text-xs sm:text-sm font-semibold text-slate-700">${escapeHtmlStr(line)}</p>`;
                        }).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- STEP 8: SPEAKING & WRITING PRACTICE                       -->
                <!-- ========================================================= -->
                ${data.practice.length ? `
                <section id="${prefix}-sec-practice" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center justify-center shadow-2xs shrink-0">${nextStepNum()}</span>
                        <div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Your Turn! Speaking & Writing Practice</h3>
                            <p class="text-xs font-semibold text-slate-500">Complete these quick missions with your tutor or practice aloud on your own.</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-3">
                        ${data.practice.map((pr, i) => `
                            <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-violet-50/80 to-indigo-50/50 border border-indigo-200/80 flex items-start gap-3.5">
                                <span class="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
                                <div class="space-y-1 flex-1">
                                    <span class="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                                        ${escapeHtmlStr(pr.tag)}
                                    </span>
                                    <p class="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed">${formatRichEnglishText(pr.task)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>` : ''}

                <!-- ========================================================= -->
                <!-- FOOTER RESMI HAMDI ENGLISH STUDIO (GAYA RAPOR)            -->
                <!-- ========================================================= -->
                <div class="pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center gap-3.5">
                        <div class="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-lg shrink-0">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div>
                            <p class="text-sm font-extrabold text-slate-900">Hamdi English Studio</p>
                            <p class="text-xs font-semibold text-slate-500">Friendly Learning Space &bull; English Course & Private Class</p>
                        </div>
                    </div>
                    <div class="flex flex-col sm:items-end">
                        <span class="inline-block px-3.5 py-1 rounded-full bg-[#F0F7FF] text-blue-700 text-xs font-extrabold border border-blue-200/60">
                            Official Curriculum &bull; ${monthTitle} (Session ${sessionNumber}/12)
                        </span>
                        <p class="text-[11px] font-bold text-slate-400 mt-1">Curated by Hamdi Rizal &bull; Medan, Indonesia</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// GENERATOR PDF A4 BER-WATERMARK & ARTWORK BIRU RAPOR (MULTI-HALAMAN)
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

function drawHandoutGradCapIcon(ctx, cx, cy, scale = 1, color = '#FFFFFF') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    ctx.beginPath();
    ctx.moveTo(0, -24); ctx.lineTo(36, -6); ctx.lineTo(0, 12); ctx.lineTo(-36, -6);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-20, 4); ctx.lineTo(-20, 18);
    ctx.quadraticCurveTo(0, 30, 20, 18);
    ctx.lineTo(20, 4); ctx.lineTo(0, 15);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(28, -2); ctx.lineTo(31, 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(31, 22, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

    // Artwork Gelombang Biru Persis Rapor (exam.js)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W * 0.45, 0);
    ctx.bezierCurveTo(W * 0.65, 190, W * 0.84, 50, W, 260);
    ctx.lineTo(W, 0);
    ctx.closePath();
    const topWave = ctx.createLinearGradient(W * 0.45, 0, W, 260);
    topWave.addColorStop(0, 'rgba(37, 99, 235, 0.07)');
    topWave.addColorStop(1, 'rgba(14, 165, 233, 0.14)');
    ctx.fillStyle = topWave;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, H - 240);
    ctx.bezierCurveTo(W * 0.35, H - 340, W * 0.68, H - 120, W, H - 250);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    const botWave = ctx.createLinearGradient(0, H - 300, W, H);
    botWave.addColorStop(0, 'rgba(37, 99, 235, 0.10)');
    botWave.addColorStop(1, 'rgba(14, 165, 233, 0.12)');
    ctx.fillStyle = botWave;
    ctx.fill();

    // Watermark Diagonal "HAMDI ENGLISH STUDIO"
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(29, 78, 216, 0.038)';
    ctx.font = `800 84px ${fontStack}`;
    ctx.fillText('HAMDI ENGLISH STUDIO', 0, -420);
    ctx.fillText('FRIENDLY LEARNING SPACE', 0, 20);
    ctx.fillText('HAMDI ENGLISH STUDIO', 0, 460);
    ctx.restore();

    // Top Gradient Bar
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    topGrad.addColorStop(0, '#1E3A8A');
    topGrad.addColorStop(0.5, '#2563EB');
    topGrad.addColorStop(1, '#0EA5E9');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 26);

    // Footer Watermark Resmi
    const padX = 105;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, H - 135);
    ctx.lineTo(W - padX, H - 135);
    ctx.stroke();

    drawHandoutRoundedRect(ctx, padX, H - 112, 64, 64, 16, '#DBEAFE');
    drawHandoutGradCapIcon(ctx, padX + 32, H - 81, 0.72, '#1D4ED8');

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = `800 24px ${fontStack}`;
    ctx.fillText('Hamdi English Studio  •  Friendly Learning Space', padX + 82, H - 82);

    ctx.fillStyle = '#64748B';
    ctx.font = `600 20px ${fontStack}`;
    ctx.fillText(`Official Study Workbook  •  ${monthTitle} (Session ${sessionNumber} of 12)  •  Curated by Hamdi Rizal`, padX + 82, H - 52);

    drawHandoutRoundedRect(ctx, W - padX - 150, H - 104, 150, 48, 24, '#EFF6FF', '#BFDBFE', 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1D4ED8';
    ctx.font = `800 21px ${fontStack}`;
    ctx.fillText(`Page ${pageNum}`, W - padX - 75, H - 73);

    return { canvas, ctx };
}

window.downloadHandoutPDF = async function(prefix = 'presentation') {
    const data = parsedHandoutCache[prefix];
    if (!data) return showToast('Materi belum tersedia untuk diunduh.', 'error');

    const btn = document.getElementById(`btn-dl-${prefix}`);
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating PDF...`;
    }

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        const { monthId, week, day } = activeMateriState;
        const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
        const sessionNumber = ((week - 1) * 3) + day;
        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';
        const W = 1654, H = 2339, padX = 105, contentW = W - (padX * 2), maxY = H - 175;

        const pages = [];
        let pageNum = 1;
        let curPage = createDecoratedHandoutPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum);
        pages.push(curPage.canvas);
        let ctx = curPage.ctx;
        let y = 105;

        const ensureSpace = (neededH) => {
            if (y + neededH > maxY) {
                pageNum++;
                curPage = createDecoratedHandoutPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum);
                pages.push(curPage.canvas);
                ctx = curPage.ctx;
                y = 105;
            }
        };

        // Header Brand & Title (Gaya Rapor exam.js)
        const logoGrad = ctx.createLinearGradient(padX, y, padX + 108, y + 108);
        logoGrad.addColorStop(0, '#1D4ED8');
        logoGrad.addColorStop(1, '#2563EB');
        drawHandoutRoundedRect(ctx, padX, y, 108, 108, 26, logoGrad);
        drawHandoutGradCapIcon(ctx, padX + 54, y + 52, 1.25, '#FFFFFF');

        ctx.textAlign = 'left';
        ctx.fillStyle = '#2563EB';
        ctx.font = `800 22px ${fontStack}`;
        ctx.fillText('HAMDI ENGLISH STUDIO  •  STUDY WORKBOOK', padX + 134, y + 34);

        ctx.fillStyle = '#0F172A';
        ctx.font = `800 42px ${fontStack}`;
        const titleLines = wrapHandoutLines(ctx, data.title, contentW - 140);
        titleLines.slice(0, 2).forEach((tl, idx) => {
            ctx.fillText(tl, padX + 134, y + 82 + (idx * 46));
        });
        y += Math.max(132, 85 + (titleLines.slice(0, 2).length * 46));

        // Goal & Level Banner
        ctx.font = `700 25px ${fontStack}`;
        const goalLines = wrapHandoutLines(ctx, data.goal, contentW - 84);
        const goalBoxH = 88 + (goalLines.length * 36);
        drawHandoutRoundedRect(ctx, padX, y, contentW, goalBoxH, 24, '#EFF6FF');
        drawHandoutRoundedRect(ctx, padX, y, 12, goalBoxH, 6, '#2563EB');

        ctx.fillStyle = '#1D4ED8';
        ctx.font = `800 19px ${fontStack}`;
        ctx.fillText(`LEARNING GOAL  •  ${data.level.toUpperCase()}`, padX + 38, y + 40);

        ctx.fillStyle = '#0F172A';
        ctx.font = `700 25px ${fontStack}`;
        goalLines.forEach((gl, i) => ctx.fillText(gl, padX + 38, y + 80 + (i * 36)));
        y += goalBoxH + 38;

        let secIndex = 1;
        const drawSectionHeader = (title, color = '#2563EB') => {
            ensureSpace(95);
            drawHandoutRoundedRect(ctx, padX, y - 30, 44, 44, 12, color);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `800 21px ${fontStack}`;
            ctx.fillText(String(secIndex++).padStart(2, '0'), padX + 22, y - 1);

            ctx.textAlign = 'left';
            ctx.fillStyle = '#0F172A';
            ctx.font = `800 31px ${fontStack}`;
            ctx.fillText(title, padX + 60, y);
            y += 30;
        };

        // 1. Warm-Up
        if (data.warmUp.length) {
            drawSectionHeader('Warm-Up & Ice Breaker', '#D97706');
            data.warmUp.forEach((q, i) => {
                ctx.font = `700 24px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, `Q${i + 1}:  ${q}`, contentW - 72);
                const h = 30 + (lines.length * 34);
                ensureSpace(h + 12);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 16, '#FFFBEB', '#FDE68A', 2);
                ctx.fillStyle = '#92400E';
                lines.forEach((l, idx) => ctx.fillText(l, padX + 32, y + 38 + (idx * 34)));
                y += h + 12;
            });
            y += 22;
        }

        // 2. Concepts
        if (data.concepts.length) {
            drawSectionHeader('Core Concept & Easy Explanation', '#2563EB');
            data.concepts.forEach(c => {
                ctx.font = `600 24px ${fontStack}`;
                const fullText = c.title ? `${c.title}: ${c.body}` : c.body;
                const lines = wrapHandoutLines(ctx, fullText, contentW - 72);
                const h = 34 + (lines.length * 35);
                ensureSpace(h + 14);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 18, '#F4F8FD', '#DBEAFE', 2);
                ctx.fillStyle = '#1E293B';
                lines.forEach((l, idx) => ctx.fillText(l, padX + 34, y + 42 + (idx * 35)));
                y += h + 14;
            });
            y += 22;
        }

        // 3. Formulas
        if (data.formulas.length) {
            drawSectionHeader('Sentence Builders & Formulas', '#4F46E5');
            data.formulas.forEach(f => {
                ctx.font = `700 24px ${fontStack}`;
                const fLines = wrapHandoutLines(ctx, `${f.badge} ${f.label}:  ${f.formula}`, contentW - 72);
                const exLines = f.example ? wrapHandoutLines(ctx, `Example: ${f.example}`, contentW - 72) : [];
                const h = 38 + ((fLines.length + exLines.length) * 34);
                ensureSpace(h + 14);

                const bg = f.badge === '[+]' ? '#ECFDF5' : (f.badge === '[-]' ? '#FFF1F2' : '#EEF2FF');
                const brd = f.badge === '[+]' ? '#A7F3D0' : (f.badge === '[-]' ? '#FECDD3' : '#C7D2FE');
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 18, bg, brd, 2);

                ctx.fillStyle = '#0F172A';
                ctx.font = `800 24px ${fontStack}`;
                fLines.forEach((l, idx) => ctx.fillText(l, padX + 34, y + 40 + (idx * 34)));

                if (exLines.length) {
                    ctx.fillStyle = '#334155';
                    ctx.font = `600 23px ${fontStack}`;
                    exLines.forEach((l, idx) => ctx.fillText(l, padX + 34, y + 40 + ((fLines.length + idx) * 34)));
                }
                y += h + 14;
            });
            y += 22;
        }

        // 4. Phrases
        if (data.phrases.length) {
            drawSectionHeader('Must-Know Phrases & Expressions', '#0D9488');
            data.phrases.forEach(ph => {
                const line1 = ph.meaning ? `${ph.phrase}  =  ${ph.meaning}` : ph.phrase;
                ctx.font = `700 24px ${fontStack}`;
                const l1 = wrapHandoutLines(ctx, line1, contentW - 72);
                const l2 = ph.example ? wrapHandoutLines(ctx, `"${ph.example}"`, contentW - 72) : [];
                const h = 34 + ((l1.length + l2.length) * 33);
                ensureSpace(h + 12);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 16, '#F0FDFA', '#99F6E4', 2);
                ctx.fillStyle = '#134E4A';
                ctx.font = `800 24px ${fontStack}`;
                l1.forEach((l, idx) => ctx.fillText(l, padX + 32, y + 38 + (idx * 33)));
                if (l2.length) {
                    ctx.fillStyle = '#0F766E';
                    ctx.font = `600 22px ${fontStack}`;
                    l2.forEach((l, idx) => ctx.fillText(l, padX + 32, y + 38 + ((l1.length + idx) * 33)));
                }
                y += h + 12;
            });
            y += 22;
        }

        // 5. Examples
        if (data.examples.length) {
            drawSectionHeader('Practical Everyday Examples', '#059669');
            data.examples.forEach(ex => {
                ctx.font = `700 24px ${fontStack}`;
                const mainLines = wrapHandoutLines(ctx, `[${ex.tag}]  ${ex.sentence}`, contentW - 72);
                const noteLines = ex.note ? wrapHandoutLines(ctx, `Note: ${ex.note}`, contentW - 72) : [];
                const h = 34 + ((mainLines.length + noteLines.length) * 33);
                ensureSpace(h + 12);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 16, '#F0FDF4', '#BBF7D0', 2);
                ctx.fillStyle = '#064E3B';
                ctx.font = `700 24px ${fontStack}`;
                mainLines.forEach((l, idx) => ctx.fillText(l, padX + 32, y + 38 + (idx * 33)));
                if (noteLines.length) {
                    ctx.fillStyle = '#047857';
                    ctx.font = `600 21px ${fontStack}`;
                    noteLines.forEach((l, idx) => ctx.fillText(l, padX + 32, y + 38 + ((mainLines.length + idx) * 33)));
                }
                y += h + 12;
            });
            y += 22;
        }

        // 6. Common Mistakes
        if (data.mistakes.length) {
            drawSectionHeader('Common Mistakes (Don\'t Say vs. Say This!)', '#E11D48');
            data.mistakes.forEach(m => {
                ctx.font = `700 23px ${fontStack}`;
                const wLines = m.wrong ? wrapHandoutLines(ctx, `✗ Don't Say: ${m.wrong}`, contentW - 72) : [];
                const rLines = wrapHandoutLines(ctx, `✓ Say This: ${m.right}`, contentW - 72);
                const whyLines = m.reason ? wrapHandoutLines(ctx, `Why: ${m.reason}`, contentW - 72) : [];
                const totalL = wLines.length + rLines.length + whyLines.length;
                const h = 36 + (totalL * 33);
                ensureSpace(h + 14);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 16, '#FFF1F2', '#FECDD3', 2);

                let curLine = 0;
                ctx.fillStyle = '#BE123C';
                ctx.font = `700 23px ${fontStack}`;
                wLines.forEach(l => { ctx.fillText(l, padX + 32, y + 38 + (curLine++ * 33)); });

                ctx.fillStyle = '#047857';
                ctx.font = `800 24px ${fontStack}`;
                rLines.forEach(l => { ctx.fillText(l, padX + 32, y + 38 + (curLine++ * 33)); });

                ctx.fillStyle = '#475569';
                ctx.font = `600 21px ${fontStack}`;
                whyLines.forEach(l => { ctx.fillText(l, padX + 32, y + 38 + (curLine++ * 33)); });
                y += h + 14;
            });
            y += 22;
        }

        // 7. Dialogue
        if (data.dialogue.length) {
            drawSectionHeader('Real-Life Conversation Practice', '#0284C7');
            data.dialogue.forEach(line => {
                ctx.font = `600 24px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, line, contentW - 72);
                const h = 30 + (lines.length * 34);
                ensureSpace(h + 10);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 16, '#F8FAFC', '#CBD5E1', 2);
                ctx.fillStyle = '#0F172A';
                lines.forEach((l, idx) => ctx.fillText(l, padX + 32, y + 38 + (idx * 34)));
                y += h + 10;
            });
            y += 22;
        }

        // 8. Practice
        if (data.practice.length) {
            drawSectionHeader('Speaking & Writing Practice', '#7C3AED');
            data.practice.forEach((pr, idx) => {
                ctx.font = `700 23px ${fontStack}`;
                const lines = wrapHandoutLines(ctx, `${idx + 1}. [${pr.tag}]  ${pr.task}`, contentW - 72);
                const h = 32 + (lines.length * 34);
                ensureSpace(h + 12);
                drawHandoutRoundedRect(ctx, padX, y, contentW, h, 16, '#F5F3FF', '#DDD6FE', 2);
                ctx.fillStyle = '#2E1065';
                lines.forEach((l, i) => ctx.fillText(l, padX + 32, y + 38 + (i * 34)));
                y += h + 12;
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
            showToast('Workbook PDF ber-watermark berhasil diunduh!', 'success');
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