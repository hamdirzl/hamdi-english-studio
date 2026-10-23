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
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,700&display=swap';
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

    renderSmartHandout('presentation', rawModule, monthObj.title, currentSessionNumber, 'Interactive Study Guide', 'Modul materi utama belum diterbitkan untuk pertemuan ini.');
    renderSmartHandout('recap', rawRecap, monthObj.title, currentSessionNumber, 'Class Recap & Coaching Notes', 'Catatan rangkuman kelas belum tersedia untuk pertemuan ini.');
}

// ============================================================================
// DYNAMIC MAGAZINE & EDITORIAL HANDOUT PARSER
// ============================================================================
function escapeHtmlStr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRichEnglishText(text) {
    return escapeHtmlStr(text)
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-slate-900 bg-amber-100/70 px-1.5 py-0.5 rounded-md">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em class="italic text-slate-800 font-semibold">$1</em>')
        .replace(/"([^"]+)"/g, '<span class="font-bold text-indigo-700">"$1"</span>')
        .replace(/->|→/g, '<i class="fas fa-arrow-right text-indigo-400 mx-1.5 text-xs"></i>');
}

function getSessionThemePalette(sessionNumber, isRecap = false, customStyle = '') {
    if (isRecap) {
        return {
            name: 'emerald',
            barGrad: 'from-emerald-800 via-teal-600 to-cyan-500',
            badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            heroBg: 'bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-white',
            heroBorder: 'border-emerald-500',
            accentText: 'text-emerald-700',
            accentBg: 'bg-emerald-600',
            pdfPrimary: '#047857',
            pdfSecondary: '#0D9488',
            pdfDark: '#064E3B',
            pdfSoft: '#ECFDF5',
            pdfBorder: '#A7F3D0',
            pdfHighlight: '#FEF3C7'
        };
    }

    const palettes = [
        {
            name: 'ocean',
            barGrad: 'from-blue-900 via-blue-600 to-sky-400',
            badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
            heroBg: 'bg-gradient-to-br from-blue-50/90 via-sky-50/40 to-white',
            heroBorder: 'border-blue-600',
            accentText: 'text-blue-700',
            accentBg: 'bg-blue-600',
            pdfPrimary: '#1D4ED8',
            pdfSecondary: '#0284C7',
            pdfDark: '#0F172A',
            pdfSoft: '#EFF6FF',
            pdfBorder: '#BFDBFE',
            pdfHighlight: '#FEF3C7'
        },
        {
            name: 'indigo',
            barGrad: 'from-indigo-900 via-violet-600 to-purple-500',
            badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            heroBg: 'bg-gradient-to-br from-indigo-50/90 via-violet-50/40 to-white',
            heroBorder: 'border-indigo-600',
            accentText: 'text-indigo-700',
            accentBg: 'bg-indigo-600',
            pdfPrimary: '#4338CA',
            pdfSecondary: '#7C3AED',
            pdfDark: '#1E1B4B',
            pdfSoft: '#EEF2FF',
            pdfBorder: '#C7D2FE',
            pdfHighlight: '#FEF3C7'
        },
        {
            name: 'teal',
            barGrad: 'from-teal-900 via-teal-600 to-emerald-400',
            badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',
            heroBg: 'bg-gradient-to-br from-teal-50/90 via-emerald-50/40 to-white',
            heroBorder: 'border-teal-600',
            accentText: 'text-teal-700',
            accentBg: 'bg-teal-600',
            pdfPrimary: '#0F766E',
            pdfSecondary: '#059669',
            pdfDark: '#134E4A',
            pdfSoft: '#F0FDFA',
            pdfBorder: '#99F6E4',
            pdfHighlight: '#FEF3C7'
        },
        {
            name: 'amber',
            barGrad: 'from-amber-700 via-orange-600 to-rose-500',
            badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
            heroBg: 'bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white',
            heroBorder: 'border-amber-500',
            accentText: 'text-amber-800',
            accentBg: 'bg-amber-600',
            pdfPrimary: '#B45309',
            pdfSecondary: '#EA580C',
            pdfDark: '#451A03',
            pdfSoft: '#FFFBEB',
            pdfBorder: '#FDE68A',
            pdfHighlight: '#E0F2FE'
        }
    ];

    const styleLower = String(customStyle || '').toLowerCase();
    if (styleLower.includes('indigo') || styleLower.includes('story')) return palettes[1];
    if (styleLower.includes('teal') || styleLower.includes('roleplay') || styleLower.includes('casual')) return palettes[2];
    if (styleLower.includes('amber') || styleLower.includes('warm')) return palettes[3];
    return palettes[(sessionNumber - 1) % palettes.length];
}

function splitQuestionAndAnswer(rawTask) {
    let text = String(rawTask || '').trim();
    let answer = '';

    const matchParen = text.match(/\((?:Answer|Key|Jawaban|Sample Answer|Hint)\s*:\s*([^)]+)\)\s*$/i);
    const matchBracket = text.match(/\[(?:Answer|Key|Jawaban|Sample Answer|Hint)\s*:\s*([^\]]+)\]\s*$/i);
    const matchPipe = text.split(/\s*\|\s*(?:Answer|Key|Jawaban)\s*:\s*/i);

    if (matchParen) {
        answer = matchParen[1].trim();
        text = text.slice(0, matchParen.index).trim();
    } else if (matchBracket) {
        answer = matchBracket[1].trim();
        text = text.slice(0, matchBracket.index).trim();
    } else if (matchPipe.length > 1) {
        text = matchPipe[0].trim();
        answer = matchPipe.slice(1).join(' ').trim();
    }
    return { questionText: text, answerKey: answer };
}

function parseSmartHandoutText(rawText, defaultTitle, defaultLevel) {
    const clean = String(rawText || '').replace(/\r\n/g, '\n').trim();
    const data = {
        title: defaultTitle,
        level: defaultLevel,
        goal: '',
        style: '',
        sections: [],
        allAudioDialogues: {},
        allAudioItems: []
    };

    if (!clean) return data;

    let currentSec = null;
    const ensureSection = (type, defaultSecTitle = '', icon = 'fa-sparkles') => {
        if (!currentSec || currentSec.type !== type) {
            currentSec = {
                id: `sec_${data.sections.length + 1}`,
                type,
                title: defaultSecTitle,
                icon,
                paragraphs: [],
                items: []
            };
            data.sections.push(currentSec);
        }
        return currentSec;
    };

    const startNewSection = (type, title, icon) => {
        currentSec = {
            id: `sec_${data.sections.length + 1}`,
            type,
            title,
            icon,
            paragraphs: [],
            items: []
        };
        data.sections.push(currentSec);
        return currentSec;
    };

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
            data.goal = line.replace(/^(?:GOAL|OBJECTIVE)\s*:\s*/i, '').trim();
            return;
        }
        if (/^STYLE\s*:/i.test(line)) {
            data.style = line.replace(/^STYLE\s*:\s*/i, '').trim();
            return;
        }

        if (/^#{1,3}\s+(.+)$/.test(line) || /^SECTION\s*:\s*(.+)$/i.test(line)) {
            const customTitle = line.replace(/^#{1,3}\s+|^SECTION\s*:\s*/i, '').trim();
            const lower = customTitle.toLowerCase();
            if (/warm[\s-]*up|ice[\s-]*breaker|starter/i.test(lower)) startNewSection('warmup', customTitle, 'fa-mug-hot');
            else if (/story|scenario|imagine|context|hook/i.test(lower)) startNewSection('story', customTitle, 'fa-book-open-reader');
            else if (/formula|pattern|structure|grammar\s*map|building\s*block/i.test(lower)) startNewSection('formulas', customTitle, 'fa-shapes');
            else if (/phrase|expression|vocabulary|word|chunk|ways\s*to\s*say/i.test(lower)) startNewSection('phrases', customTitle, 'fa-comment-dots');
            else if (/mistake|avoid|don't\s*say|vs|upgrade|fix/i.test(lower)) startNewSection('mistakes', customTitle, 'fa-scale-balanced');
            else if (/dialogue|conversation|roleplay|chat/i.test(lower)) startNewSection('dialogue', customTitle, 'fa-comments');
            else if (/practice|quiz|challenge|mission|exercise|your\s*turn/i.test(lower)) startNewSection('practice', customTitle, 'fa-gamepad');
            else if (/tip|secret|note|remember|culture/i.test(lower)) startNewSection('callout', customTitle, 'fa-lightbulb');
            else if (/example|in\s*action|real\s*life/i.test(lower)) startNewSection('examples', customTitle, 'fa-bolt');
            else startNewSection('editorial', customTitle, 'fa-compass');
            return;
        }

        if (/^(?:STORY|SCENARIO|HOOK|INTRODUCTION|INTRO)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:STORY|SCENARIO|HOOK|INTRODUCTION|INTRO)\s*:\s*/i, '').trim();
            const sec = startNewSection('story', 'The Story & Real-Life Context', 'fa-book-open-reader');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER)\s*:\s*/i, '').trim();
            const sec = startNewSection('warmup', 'Warm-Up & Ice Breaker', 'fa-mug-hot');
            if (rest) sec.items.push(rest);
            return;
        }
        if (/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY|DEEP\s*DIVE)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY|DEEP\s*DIVE)\s*:\s*/i, '').trim();
            const sec = startNewSection('editorial', 'How It Works in Real Life', 'fa-compass');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:FORMULAS?|PATTERNS?|GRAMMAR|KEY\s*POINTS?|RULES?)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:FORMULAS?|PATTERNS?|GRAMMAR|KEY\s*POINTS?|RULES?)\s*:\s*/i, '').trim();
            const sec = startNewSection('formulas', 'Visual Sentence Patterns', 'fa-shapes');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?|WAYS\s*TO\s*SAY)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?|WAYS\s*TO\s*SAY)\s*:\s*/i, '').trim();
            const sec = startNewSection('phrases', 'Natural Expressions & Phrases', 'fa-comment-dots');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:EXAMPLES?|SENTENCES?|IN\s*ACTION)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:EXAMPLES?|SENTENCES?|IN\s*ACTION)\s*:\s*/i, '').trim();
            const sec = startNewSection('examples', 'Everyday Examples in Context', 'fa-bolt');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:MISTAKES?|COMMON\s*MISTAKES?|COMPARE|UPGRADES?)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:MISTAKES?|COMMON\s*MISTAKES?|COMPARE|UPGRADES?)\s*:\s*/i, '').trim();
            const sec = startNewSection('mistakes', 'Don\'t Say vs. Say This!', 'fa-scale-balanced');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:TIPS?|PRO\s*TIPS?|COACH\s*NOTE|REMEMBER|CULTURE\s*NOTE)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:TIPS?|PRO\s*TIPS?|COACH\s*NOTE|REMEMBER|CULTURE\s*NOTE)\s*:\s*/i, '').trim();
            const sec = startNewSection('callout', 'Tutor\'s Insider Tip', 'fa-lightbulb');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:DIALOGUE|CONVERSATION|ROLEPLAY)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:DIALOGUE|CONVERSATION|ROLEPLAY)\s*:\s*/i, '').trim();
            const sec = startNewSection('dialogue', 'Real-Life Conversation', 'fa-comments');
            if (rest) sec.items.push(rest);
            return;
        }
        if (/^(?:PRACTICE|EXERCISES?|TASKS?|HOMEWORK|MISSION|QUIZ|YOUR\s*TURN)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:PRACTICE|EXERCISES?|TASKS?|HOMEWORK|MISSION|QUIZ|YOUR\s*TURN)\s*:\s*/i, '').trim();
            const sec = startNewSection('practice', 'Your Turn! Interactive Practice', 'fa-gamepad');
            if (rest) sec.paragraphs.push(rest);
            return;
        }

        if (!currentSec) {
            ensureSection('editorial', 'Let\'s Dive In', 'fa-compass');
        }

        const isBullet = /^[-*•]\s+|\d+[.)]\s+|^\[[+?*-]\]/.test(line);
        const stripped = line.replace(/^[-*•]\s*|\d+[.)]\s*/, '').trim();

        switch (currentSec.type) {
            case 'story':
            case 'callout': {
                currentSec.paragraphs.push(stripped);
                break;
            }
            case 'warmup': {
                currentSec.items.push(stripped);
                break;
            }
            case 'editorial': {
                const colonMatch = stripped.match(/^([^:]{2,48}):\s*(.+)$/);
                if (isBullet && colonMatch) {
                    currentSec.items.push({ title: colonMatch[1].replace(/^\[|\]$/g, '').trim(), body: colonMatch[2].trim() });
                } else if (isBullet) {
                    currentSec.items.push({ title: '', body: stripped });
                } else {
                    currentSec.paragraphs.push(line);
                }
                break;
            }
            case 'formulas': {
                if (line.includes('|')) {
                    const parts = line.replace(/^[-*•]\s*/, '').split('|').map(s => s.trim());
                    let badge = '[*]', label = parts[0] || 'Pattern', formula = parts[1] || '', example = parts[2] || '';
                    const bMatch = label.match(/^(\[[+?*-]\])\s*(.*)$/);
                    if (bMatch) { badge = bMatch[1]; label = bMatch[2] || 'Pattern'; }
                    currentSec.items.push({ badge, label, formula, example });
                } else if (isBullet && stripped.includes(':')) {
                    const [lbl, ...rest] = stripped.split(':');
                    const rhs = rest.join(':').trim();
                    const arrowParts = rhs.split(/->|→/);
                    currentSec.items.push({
                        badge: '[*]',
                        label: lbl.trim(),
                        formula: arrowParts[0]?.trim() || rhs,
                        example: arrowParts.slice(1).join(' / ').trim()
                    });
                } else if (!isBullet && !line.startsWith('[')) {
                    currentSec.paragraphs.push(line);
                } else {
                    currentSec.items.push({ badge: '[*]', label: 'Key Pattern', formula: stripped, example: '' });
                }
                break;
            }
            case 'phrases': {
                if (stripped.includes('|')) {
                    const parts = stripped.split('|').map(s => s.trim());
                    currentSec.items.push({ phrase: parts[0] || '', meaning: parts[1] || '', example: parts[2] || '' });
                } else if (stripped.includes('=') || stripped.includes('—') || stripped.includes(' - ')) {
                    const sep = stripped.includes('=') ? '=' : (stripped.includes('—') ? '—' : ' - ');
                    const [p, ...r] = stripped.split(sep);
                    currentSec.items.push({ phrase: p.trim(), meaning: r.join(sep).trim(), example: '' });
                } else if (!isBullet) {
                    currentSec.paragraphs.push(line);
                } else {
                    currentSec.items.push({ phrase: stripped, meaning: '', example: '' });
                }
                break;
            }
            case 'examples': {
                if (stripped.includes('|')) {
                    const parts = stripped.split('|').map(s => s.trim());
                    if (parts.length >= 3) {
                        currentSec.items.push({ tag: parts[0].replace(/^\[|\]$/g, ''), sentence: parts[1], note: parts.slice(2).join(' ') });
                    } else {
                        currentSec.items.push({ tag: 'In Context', sentence: parts[0], note: parts[1] || '' });
                    }
                } else if (!isBullet && stripped.length > 95) {
                    currentSec.paragraphs.push(line);
                } else {
                    currentSec.items.push({ tag: `Example #${currentSec.items.length + 1}`, sentence: stripped, note: '' });
                }
                break;
            }
            case 'mistakes': {
                if (stripped.includes('|')) {
                    const parts = stripped.split('|').map(s => s.trim());
                    currentSec.items.push({ wrong: parts[0] || '', right: parts[1] || '', reason: parts[2] || '' });
                } else if (!isBullet) {
                    currentSec.paragraphs.push(line);
                } else {
                    currentSec.items.push({ wrong: '', right: stripped, reason: '' });
                }
                break;
            }
            case 'dialogue': {
                if (/^[A-Za-z\s.]{1,22}\s*:\s*.+$/.test(line)) {
                    currentSec.items.push(line);
                } else {
                    currentSec.paragraphs.push(stripped);
                }
                break;
            }
            case 'practice': {
                const pMatch = stripped.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
                const rawTask = pMatch ? pMatch[2].trim() : stripped;
                const tag = pMatch ? pMatch[1].trim() : `Challenge #${currentSec.items.length + 1}`;
                const { questionText, answerKey } = splitQuestionAndAnswer(rawTask);
                currentSec.items.push({ tag, task: questionText, answerKey });
                break;
            }
        }
    });

    return data;
}

// ============================================================================
// INTERACTIVE HANDOUT CONTROLS
// ============================================================================
window.playHandoutTextAudio = function(rawSpeech, btnEl) {
    const cleanSpeech = String(rawSpeech || '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\([^)]*\)/g, '')
        .replace(/^(?:Correct|Incorrect|Wrong|Right)\s*:\s*/i, '')
        .trim();
    if (!cleanSpeech) return;
    window.playNaturalEnglishTTS(cleanSpeech, btnEl);
};

window.playHandoutRegisteredAudio = function(prefix, audioIdx, btnEl) {
    const text = parsedHandoutCache[prefix]?.allAudioItems?.[audioIdx];
    if (!text) return;
    window.playHandoutTextAudio(text, btnEl);
};

window.playHandoutSectionDialogue = function(prefix, secId, btnEl) {
    const lines = parsedHandoutCache[prefix]?.allAudioDialogues?.[secId] || [];
    if (!lines.length) return;
    window.playNaturalEnglishTTS(lines.join('\n'), btnEl);
};

window.toggleDialogueBlurMode = function(secDomId, btnEl) {
    const container = document.getElementById(secDomId);
    if (!container) return;
    const isBlurred = container.dataset.blurred === '1';
    const nextState = !isBlurred;
    container.dataset.blurred = nextState ? '1' : '0';

    container.querySelectorAll('.dialogue-line-text').forEach(el => {
        if (nextState) el.classList.add('blur-xs', 'select-none');
        else el.classList.remove('blur-xs', 'select-none');
    });

    if (btnEl) {
        btnEl.innerHTML = nextState
            ? `<i class="fas fa-eye mr-1.5"></i> Tampilkan Teks Dialog`
            : `<i class="fas fa-eye-slash mr-1.5"></i> Mode Latihan Listening (Blur Teks)`;
        btnEl.className = nextState
            ? `px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold transition cursor-pointer shadow-2xs`
            : `px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold transition cursor-pointer`;
    }
};

window.toggleHandoutAnswer = function(btnEl) {
    const targetId = btnEl.dataset.target;
    const box = document.getElementById(targetId);
    if (!box) return;
    const isHidden = box.classList.contains('hidden');
    box.classList.toggle('hidden', !isHidden);
    btnEl.innerHTML = isHidden
        ? `<i class="fas fa-eye-slash mr-1"></i> Sembunyikan Kunci`
        : `<i class="fas fa-key mr-1"></i> Lihat Kunci Jawaban`;
};

window.scrollToHandoutSection = function(elId) {
    const target = document.getElementById(elId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderFormulaPillsHTML(formulaStr) {
    if (!formulaStr.includes('+')) {
        return `<span class="inline-block px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 font-extrabold text-xs sm:text-sm text-slate-800 shadow-2xs">${formatRichEnglishText(formulaStr)}</span>`;
    }
    const parts = formulaStr.split('+').map(s => s.trim()).filter(Boolean);
    return `<div class="flex flex-wrap items-center gap-1.5 my-1">` +
        parts.map((p, idx) => `
            <span class="px-3 py-1.5 rounded-xl bg-white border border-indigo-200/90 font-extrabold text-xs sm:text-sm text-indigo-950 shadow-2xs">${formatRichEnglishText(p)}</span>
            ${idx < parts.length - 1 ? `<span class="text-indigo-400 font-black text-sm px-0.5">+</span>` : ''}
        `).join('') +
    `</div>`;
}

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
    const theme = getSessionThemePalette(sessionNumber, isRecap, data.style);

    const registerAudio = (speechText) => {
        const idx = data.allAudioItems.length;
        data.allAudioItems.push(speechText);
        return idx;
    };

    const sectionsHTML = data.sections.map((sec) => {
        const domId = `${prefix}-${sec.id}`;

        if (sec.type === 'story') {
            const fullStoryAudioIdx = registerAudio(sec.paragraphs.join(' '));
            return `
                <section id="${domId}" class="scroll-mt-20">
                    <div class="relative p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-50/70 via-white to-orange-50/40 border border-amber-200/80 shadow-2xs overflow-hidden">
                        <div class="absolute -right-6 -top-6 text-amber-500/10 text-8xl pointer-events-none select-none"><i class="fas fa-quote-right"></i></div>
                        <div class="relative z-10 space-y-4">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-100/90 text-amber-900 text-xs font-extrabold uppercase tracking-wider">
                                    <i class="fas ${sec.icon} text-amber-600"></i> ${escapeHtmlStr(sec.title)}
                                </span>
                                <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${fullStoryAudioIdx}, this)" class="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-200 text-xs font-extrabold transition cursor-pointer shadow-2xs">
                                    <i class="fas fa-volume-up mr-1.5"></i> Dengarkan Cerita
                                </button>
                            </div>
                            <div class="space-y-4 text-slate-700 text-sm sm:text-[16px] leading-[1.85] font-medium">
                                ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                            </div>
                        </div>
                    </div>
                </section>`;
        }

        if (sec.type === 'callout') {
            return `
                <section id="${domId}" class="scroll-mt-20">
                    <div class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white shadow-md relative overflow-hidden">
                        <div class="absolute -right-8 -bottom-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none"></div>
                        <div class="flex flex-col sm:flex-row items-start gap-4 relative z-10">
                            <div class="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300/30 text-amber-300 flex items-center justify-center text-xl shrink-0">
                                <i class="fas fa-lightbulb"></i>
                            </div>
                            <div class="space-y-2.5 flex-1">
                                <h3 class="text-sm sm:text-base font-extrabold uppercase tracking-wider text-amber-300">${escapeHtmlStr(sec.title)}</h3>
                                <div class="space-y-2.5 text-sm sm:text-[15px] text-blue-50 leading-[1.8] font-medium">
                                    ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p).replace(/text-slate-900/g, 'text-amber-950').replace(/text-indigo-700/g, 'text-amber-300')}</p>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>`;
        }

        if (sec.type === 'warmup') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                            <p class="text-xs sm:text-sm font-medium text-slate-500">Coba jawab dengan santai menggunakan kalimatmu sendiri sebelum kita mulai!</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        ${sec.items.map((q, i) => {
                            const aIdx = registerAudio(q);
                            return `
                            <div class="p-5 rounded-2xl bg-amber-50/50 border border-amber-200/80 flex flex-col justify-between gap-4 hover:bg-amber-50 transition">
                                <div class="space-y-2">
                                    <span class="inline-block px-2.5 py-0.5 rounded-lg bg-amber-200/70 text-amber-900 font-extrabold text-[11px]">Ice Breaker #${i + 1}</span>
                                    <p class="text-sm sm:text-[15px] font-bold text-slate-800 leading-relaxed">${formatRichEnglishText(q)}</p>
                                </div>
                                <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" class="self-start px-3 py-1.5 rounded-xl bg-white hover:bg-amber-500 text-amber-800 hover:text-white border border-amber-200 text-xs font-extrabold transition cursor-pointer">
                                    <i class="fas fa-volume-up mr-1"></i> Dengar Pertanyaan
                                </button>
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        if (sec.type === 'editorial') {
            return `
                <section id="${domId}" class="space-y-5 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl ${theme.badgeBg} border flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="p-6 sm:p-8 rounded-3xl bg-slate-50/80 border border-slate-200/80 space-y-4 text-slate-700 text-sm sm:text-[16px] leading-[1.9] font-medium">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    ${sec.items.length ? `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${sec.items.map((item, idx) => `
                            <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-indigo-300 transition ${sec.items.length % 2 === 1 && idx === sec.items.length - 1 ? 'md:col-span-2' : ''}">
                                ${item.title ? `
                                <h4 class="text-sm sm:text-base font-extrabold text-slate-900 mb-2 flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-lg ${theme.accentBg} text-white text-xs font-black flex items-center justify-center shrink-0">${idx + 1}</span>
                                    ${escapeHtmlStr(item.title)}
                                </h4>` : ''}
                                <p class="text-xs sm:text-[15px] text-slate-600 leading-[1.8] font-medium">${formatRichEnglishText(item.body)}</p>
                            </div>
                        `).join('')}
                    </div>` : ''}
                </section>`;
        }

        if (sec.type === 'formulas') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                            <p class="text-xs sm:text-sm font-medium text-slate-500">Pola praktis menyusun kalimat tanpa perlu menghafal rumus yang rumit.</p>
                        </div>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-3 text-slate-700 text-sm sm:text-[15px] leading-[1.85] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 gap-4">
                        ${sec.items.map(f => {
                            let badgeStyle = 'bg-indigo-600 text-white';
                            let cardBg = 'bg-indigo-50/40 border-indigo-200/80';
                            let sym = '★';
                            if (f.badge === '[+]') { badgeStyle = 'bg-emerald-600 text-white'; cardBg = 'bg-emerald-50/40 border-emerald-200/80'; sym = '+'; }
                            else if (f.badge === '[-]') { badgeStyle = 'bg-rose-600 text-white'; cardBg = 'bg-rose-50/40 border-rose-200/80'; sym = '−'; }
                            else if (f.badge === '[?]') { badgeStyle = 'bg-blue-600 text-white'; cardBg = 'bg-blue-50/40 border-blue-200/80'; sym = '?'; }

                            const aIdx = f.example ? registerAudio(f.example) : registerAudio(f.formula);
                            return `
                            <div class="p-5 sm:p-6 rounded-2xl ${cardBg} border flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div class="space-y-2.5 flex-1">
                                    <div class="flex items-center gap-2.5">
                                        <span class="w-7 h-7 rounded-xl ${badgeStyle} font-black text-xs flex items-center justify-center shrink-0">${sym}</span>
                                        <span class="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-800">${escapeHtmlStr(f.label)}</span>
                                    </div>
                                    ${renderFormulaPillsHTML(f.formula)}
                                    ${f.example ? `
                                    <p class="text-xs sm:text-[15px] font-semibold text-slate-700 pt-1 leading-relaxed">
                                        <i class="fas fa-quote-left text-slate-300 mr-1.5"></i>${formatRichEnglishText(f.example)}
                                    </p>` : ''}
                                </div>
                                ${f.example ? `
                                <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" class="self-start md:self-center px-4 py-2 rounded-xl bg-white hover:bg-indigo-600 text-indigo-700 hover:text-white border border-slate-200 text-xs font-extrabold transition shrink-0 cursor-pointer shadow-2xs">
                                    <i class="fas fa-volume-up mr-1.5"></i> Putar Contoh
                                </button>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        if (sec.type === 'phrases') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 border border-teal-200 flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                            <p class="text-xs sm:text-sm font-medium text-slate-500">Klik tombol suara untuk mendengar intonasi naturalnya.</p>
                        </div>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-3 text-slate-700 text-sm sm:text-[15px] leading-[1.85] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${sec.items.map(ph => {
                            const aIdx = registerAudio(ph.example ? `${ph.phrase}. ${ph.example}` : ph.phrase);
                            return `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-teal-400 shadow-2xs transition flex flex-col justify-between gap-3">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="space-y-1">
                                        <h4 class="text-base sm:text-lg font-extrabold text-teal-950">${escapeHtmlStr(ph.phrase)}</h4>
                                        ${ph.meaning ? `<p class="text-xs sm:text-sm font-semibold text-teal-700">${escapeHtmlStr(ph.meaning)}</p>` : ''}
                                    </div>
                                    <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" class="w-9 h-9 rounded-xl bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer" title="Listen">
                                        <i class="fas fa-volume-up text-xs"></i>
                                    </button>
                                </div>
                                ${ph.example ? `
                                <div class="pt-3 border-t border-slate-100 text-xs sm:text-sm font-medium text-slate-600 leading-relaxed">
                                    <span class="font-bold text-slate-400 mr-1">e.g.</span> "${formatRichEnglishText(ph.example)}"
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        if (sec.type === 'examples') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                            <p class="text-xs sm:text-sm font-medium text-slate-500">Perhatikan bagaimana kalimat ini dipakai dalam situasi sehari-hari.</p>
                        </div>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-3 text-slate-700 text-sm sm:text-[15px] leading-[1.85] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${sec.items.map(ex => {
                            const aIdx = registerAudio(ex.sentence);
                            return `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-400 transition flex flex-col justify-between gap-3.5 shadow-2xs">
                                <div class="space-y-2.5">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold uppercase tracking-wide">
                                            ${escapeHtmlStr(ex.tag)}
                                        </span>
                                        <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" class="px-3 py-1 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-extrabold transition shrink-0 cursor-pointer">
                                            <i class="fas fa-volume-up mr-1"></i> Listen
                                        </button>
                                    </div>
                                    <p class="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">${formatRichEnglishText(ex.sentence)}</p>
                                </div>
                                ${ex.note ? `
                                <p class="text-xs font-medium text-slate-500 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100 leading-relaxed">
                                    <i class="fas fa-sparkles text-amber-500 mr-1"></i> ${formatRichEnglishText(ex.note)}
                                </p>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        if (sec.type === 'mistakes') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                            <p class="text-xs sm:text-sm font-medium text-slate-500">Perbandingan kalimat yang sering keliru vs. versi yang lebih natural.</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 gap-4">
                        ${sec.items.map(m => {
                            if (!m.wrong) {
                                return `
                                <div class="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-start gap-3">
                                    <i class="fas fa-lightbulb text-amber-500 mt-1"></i>
                                    <p class="text-sm font-medium text-amber-950 leading-relaxed">${formatRichEnglishText(m.right)}</p>
                                </div>`;
                            }
                            const aIdx = registerAudio(m.right);
                            return `
                            <div class="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div class="p-4 rounded-xl bg-white border border-rose-200 flex items-start gap-3">
                                        <span class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 text-xs font-black flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-times"></i></span>
                                        <div class="space-y-1">
                                            <span class="text-[10px] font-extrabold uppercase tracking-wider text-rose-500 block">Don't Say (Kurang Tepat)</span>
                                            <p class="text-xs sm:text-sm font-semibold text-slate-600 line-through decoration-rose-400 leading-relaxed">${escapeHtmlStr(m.wrong)}</p>
                                        </div>
                                    </div>
                                    <div class="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-3">
                                        <div class="flex items-start gap-3">
                                            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-check"></i></span>
                                            <div class="space-y-1">
                                                <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">Say This! (Lebih Natural)</span>
                                                <p class="text-xs sm:text-sm font-extrabold text-emerald-950 leading-relaxed">${escapeHtmlStr(m.right)}</p>
                                            </div>
                                        </div>
                                        <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" class="w-9 h-9 rounded-xl bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 flex items-center justify-center transition shrink-0 cursor-pointer" title="Listen">
                                            <i class="fas fa-volume-up text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                                ${m.reason ? `
                                <p class="text-xs sm:text-sm font-medium text-slate-600 px-1 pt-0.5 leading-relaxed">
                                    <strong class="text-indigo-600 font-extrabold"><i class="fas fa-info-circle mr-1"></i> Mengapa?</strong> ${formatRichEnglishText(m.reason)}
                                </p>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        if (sec.type === 'dialogue') {
            data.allAudioDialogues[sec.id] = sec.items;
            const chatContainerId = `${domId}-chatbox`;
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center text-base shrink-0">
                                <i class="fas ${sec.icon}"></i>
                            </div>
                            <div>
                                <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                                <p class="text-xs sm:text-sm font-medium text-slate-500">Coba aktifkan <strong>Blur Teks</strong> untuk melatih pendengaranmu sebelum membaca!</p>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" onclick="toggleDialogueBlurMode('${chatContainerId}', this)" class="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold transition cursor-pointer">
                                <i class="fas fa-eye-slash mr-1.5"></i> Mode Latihan Listening (Blur Teks)
                            </button>
                            <button type="button" onclick="playHandoutSectionDialogue('${prefix}', '${sec.id}', this)" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer">
                                <i class="fas fa-play mr-1.5"></i> Putar Percakapan
                            </button>
                        </div>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-600 italic leading-relaxed">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div id="${chatContainerId}" data-blurred="0" class="p-5 sm:p-7 rounded-3xl bg-gradient-to-b from-slate-50 to-blue-50/30 border border-slate-200/90 space-y-4">
                        ${sec.items.map(line => {
                            const match = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
                            const lineAudioIdx = registerAudio(line);
                            if (match) {
                                const spk = match[1].trim();
                                const txt = match[2].trim();
                                const isMale = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|boss|manager|a)\b/i.test(spk);
                                return `
                                <div class="flex items-start gap-3.5 ${isMale ? '' : 'sm:flex-row-reverse'}">
                                    <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-2xs ${isMale ? 'bg-blue-600 text-white' : 'bg-rose-500 text-white'}">
                                        ${isMale ? '👨' : '👩'}
                                    </div>
                                    <div onclick="this.querySelector('.dialogue-line-text')?.classList.remove('blur-xs')" class="flex-1 max-w-2xl p-4 sm:p-5 rounded-2xl border shadow-2xs cursor-pointer transition ${isMale ? 'bg-white border-slate-200/90 rounded-tl-xs' : 'bg-blue-600 text-white border-blue-600 rounded-tr-xs'}">
                                        <div class="flex items-center justify-between gap-2 mb-1.5">
                                            <span class="text-[11px] font-extrabold uppercase tracking-wider ${isMale ? 'text-blue-600' : 'text-blue-100'}">${escapeHtmlStr(spk)}</span>
                                            <button type="button" onclick="event.stopPropagation(); playHandoutRegisteredAudio('${prefix}', ${lineAudioIdx}, this)" class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg transition cursor-pointer ${isMale ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-white/20 text-white hover:bg-white/30'}">
                                                <i class="fas fa-volume-up mr-1"></i> Dengar
                                            </button>
                                        </div>
                                        <p class="dialogue-line-text text-xs sm:text-[15px] font-medium leading-[1.75] transition duration-200 ${isMale ? 'text-slate-800' : 'text-white'}">${escapeHtmlStr(txt)}</p>
                                    </div>
                                </div>`;
                            }
                            return `<p class="text-xs sm:text-sm font-medium text-slate-600">${escapeHtmlStr(line)}</p>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        if (sec.type === 'practice') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-violet-50 text-violet-600 border border-violet-200 flex items-center justify-center text-base shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <div>
                            <h3 class="text-base sm:text-xl font-extrabold text-slate-900">${escapeHtmlStr(sec.title)}</h3>
                            <p class="text-xs sm:text-sm font-medium text-slate-500">Jawab terlebih dahulu, lalu klik tombol kunci jawaban untuk mencocokkan!</p>
                        </div>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-2 text-slate-700 text-sm sm:text-[15px] leading-[1.8] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 gap-4">
                        ${sec.items.map((pr, i) => {
                            const ansId = `${domId}_ans_${i}`;
                            return `
                            <div class="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                                <div class="flex items-start gap-3.5">
                                    <span class="w-7 h-7 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
                                    <div class="space-y-2 flex-1">
                                        <span class="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200/60">
                                            ${escapeHtmlStr(pr.tag)}
                                        </span>
                                        <p class="text-sm sm:text-[15px] font-semibold text-slate-800 leading-[1.8]">${formatRichEnglishText(pr.task)}</p>

                                        ${pr.answerKey ? `
                                        <div class="pt-1">
                                            <button type="button" data-target="${ansId}" onclick="toggleHandoutAnswer(this)" class="px-3.5 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-extrabold transition cursor-pointer">
                                                <i class="fas fa-key mr-1"></i> Lihat Kunci Jawaban
                                            </button>
                                            <div id="${ansId}" class="hidden mt-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm font-bold text-emerald-900">
                                                <i class="fas fa-check-circle text-emerald-600 mr-1.5"></i> ${formatRichEnglishText(pr.answerKey)}
                                            </div>
                                        </div>` : ''}
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        return '';
    }).join('');

    box.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3 mb-5 bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-sm">
            <div class="flex items-center gap-3.5">
                <div class="w-10 h-10 rounded-xl ${theme.accentBg} text-white flex items-center justify-center text-base font-black shrink-0">
                    <i class="fas fa-book-open"></i>
                </div>
                <div>
                    <p class="text-xs sm:text-sm font-extrabold text-white">${docBadge} &bull; Session ${sessionNumber} of 12</p>
                    <p class="text-[11px] text-slate-300">Desain Mengalir & Interaktif &bull; Siap Diunduh ke PDF A4</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button id="btn-dl-${prefix}" onclick="downloadHandoutPDF('${prefix}')" class="bg-white hover:bg-blue-50 text-slate-900 font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer">
                    <i class="fas fa-file-pdf text-rose-600"></i> Download PDF (A4)
                </button>
                ${window.HES.userRole === 'admin' ? `
                <a href="admin.html?tab=materials" class="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition" title="Edit Materi di Panel Admin">
                    <i class="fas fa-pen"></i>
                </a>` : ''}
            </div>
        </div>

        <div id="printable-handout-${prefix}" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="bg-white mx-auto rounded-3xl shadow-md border border-slate-200/90 overflow-hidden text-slate-800 relative">
            <div class="h-3 w-full bg-gradient-to-r ${theme.barGrad}"></div>

            <div class="absolute inset-0 flex flex-col items-center justify-around pointer-events-none select-none overflow-hidden opacity-[0.025] -rotate-12">
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-slate-900 whitespace-nowrap">HAMDI ENGLISH STUDIO</span>
                <span class="text-4xl sm:text-6xl font-black tracking-widest text-slate-900 whitespace-nowrap">FRIENDLY LEARNING SPACE</span>
            </div>

            <div class="relative z-10 p-6 sm:p-11 space-y-10">
                <div class="space-y-6">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div class="space-y-1.5">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${theme.badgeBg}">
                                    ${escapeHtmlStr(data.level)}
                                </span>
                                <span class="text-xs font-bold text-slate-400">&bull; Hamdi English Studio</span>
                            </div>
                            <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">${escapeHtmlStr(data.title)}</h1>
                        </div>
                    </div>

                    ${data.goal ? `
                    <div class="p-5 sm:p-6 rounded-2xl ${theme.heroBg} border-l-4 ${theme.heroBorder}">
                        <p class="text-[11px] font-extrabold uppercase tracking-wider ${theme.accentText} mb-1">
                            <i class="fas fa-compass mr-1"></i> Fokus Belajar Hari Ini
                        </p>
                        <p class="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed">${formatRichEnglishText(data.goal)}</p>
                    </div>` : ''}

                    ${data.sections.length > 2 ? `
                    <div class="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        ${data.sections.map(s => `
                            <button type="button" onclick="scrollToHandoutSection('${prefix}-${s.id}')" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold whitespace-nowrap transition cursor-pointer">
                                <i class="fas ${s.icon} mr-1.5 opacity-70"></i>${escapeHtmlStr(s.title)}
                            </button>
                        `).join('')}
                    </div>` : ''}
                </div>

                <div class="space-y-11">
                    ${sectionsHTML}
                </div>

                <div class="pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center gap-3.5">
                        <div class="w-10 h-10 rounded-xl ${theme.badgeBg} border flex items-center justify-center text-base shrink-0">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div>
                            <p class="text-sm font-extrabold text-slate-900">Hamdi English Studio</p>
                            <p class="text-xs font-semibold text-slate-500">Friendly Learning Space &bull; English Course & Private Class</p>
                        </div>
                    </div>
                    <p class="text-xs font-bold text-slate-400">${monthTitle} &bull; Session ${sessionNumber} of 12</p>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// MESIN CETAK PDF A4 MAGAZINE WORKBOOK (100% ANTI-KELUAR KERTAS & KAYA VISUAL)
// ============================================================================
function drawHandoutRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null, lineWidth = 1) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
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
    ctx.restore();
}

function cleanPlainPdfText(str) {
    return String(str || '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/->/g, '→')
        .replace(/\s+/g, ' ')
        .trim();
}

// Strict line wrapper that guarantees NO line ever exceeds maxW pixels
function wrapPlainLinesStrict(ctx, rawText, maxW, fontStr = null) {
    if (fontStr) ctx.font = fontStr;
    const safeMaxW = Math.max(60, maxW - 12);
    const paragraphs = String(rawText || '').split('\n');
    const lines = [];

    paragraphs.forEach(p => {
        const cleanP = cleanPlainPdfText(p);
        if (!cleanP) return;
        const words = cleanP.split(' ');
        let cur = '';

        words.forEach(word => {
            if (ctx.measureText(word).width > safeMaxW) {
                if (cur) { lines.push(cur); cur = ''; }
                let chunk = '';
                for (const ch of word) {
                    if (ctx.measureText(chunk + ch).width <= safeMaxW) chunk += ch;
                    else { lines.push(chunk); chunk = ch; }
                }
                cur = chunk;
                return;
            }
            const test = cur ? `${cur} ${word}` : word;
            if (ctx.measureText(test).width <= safeMaxW) {
                cur = test;
            } else {
                if (cur) lines.push(cur);
                cur = word;
            }
        });
        if (cur) lines.push(cur);
    });

    return lines.length ? lines : [''];
}

// Draws wrapped lines with top baseline and hardware maxWidth clamp
function drawPlainLinesStrict(ctx, lines, x, startY, lineH, maxW, fontStr = null, color = '#0F172A', strikeThrough = false) {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    if (fontStr) ctx.font = fontStr;
    ctx.fillStyle = color;

    lines.forEach((line, idx) => {
        const ly = startY + (idx * lineH);
        ctx.fillText(line, x, ly, maxW);
        if (strikeThrough && line.trim()) {
            const w = Math.min(maxW, ctx.measureText(line).width);
            ctx.strokeStyle = '#F43F5E';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x, ly + (lineH * 0.35));
            ctx.lineTo(x + w, ly + (lineH * 0.35));
            ctx.stroke();
        }
    });
    ctx.restore();
    return startY + (lines.length * lineH);
}

// Rich Inline Tokenizer for PDF (**bold highlight**, "quoted accent", normal text)
function tokenizeRichPdfParagraph(rawText) {
    const clean = String(rawText || '').replace(/->/g, '→').replace(/\s+/g, ' ').trim();
    const regex = /(\*\*[^*]+\*\*|"[^"]+"|\*[^*]+\*)/g;
    const parts = clean.split(regex).filter(Boolean);
    const tokens = [];

    parts.forEach(part => {
        let style = 'normal';
        let content = part;
        if (part.startsWith('**') && part.endsWith('**')) {
            style = 'highlight';
            content = part.slice(2, -2).trim();
        } else if (part.startsWith('"') && part.endsWith('"')) {
            style = 'quote';
            content = part.trim();
        } else if (part.startsWith('*') && part.endsWith('*')) {
            style = 'italic';
            content = part.slice(1, -1).trim();
        }
        content.split(' ').filter(Boolean).forEach(w => {
            tokens.push({ word: w, style });
        });
    });
    return tokens;
}

function layoutRichPdfLines(ctx, rawText, maxW, fontSize, fontStack) {
    const safeMaxW = Math.max(80, maxW - 16);
    const tokens = tokenizeRichPdfParagraph(rawText);
    const lines = [];
    let currentLine = [];
    let currentW = 0;

    const getTokenFont = (style) => {
        if (style === 'highlight') return `800 ${fontSize}px ${fontStack}`;
        if (style === 'quote') return `italic 700 ${fontSize}px ${fontStack}`;
        if (style === 'italic') return `italic 600 ${fontSize}px ${fontStack}`;
        return `500 ${fontSize}px ${fontStack}`;
    };

    tokens.forEach(tk => {
        ctx.font = getTokenFont(tk.style);
        const spaceW = currentLine.length > 0 ? ctx.measureText(' ').width : 0;
        const wordW = ctx.measureText(tk.word).width + (tk.style === 'highlight' ? 10 : 0);

        if (currentW + spaceW + wordW <= safeMaxW || currentLine.length === 0) {
            currentLine.push({ ...tk, width: wordW, spaceBefore: spaceW });
            currentW += spaceW + wordW;
        } else {
            lines.push(currentLine);
            currentLine = [{ ...tk, width: wordW, spaceBefore: 0 }];
            currentW = wordW;
        }
    });
    if (currentLine.length) lines.push(currentLine);
    return lines.length ? lines : [[]];
}

function drawRichPdfLines(ctx, richLines, startX, startY, lineH, fontSize, fontStack, colors = {}) {
    const normalColor = colors.normal || '#334155';
    const highlightText = colors.highlightText || '#0F172A';
    const highlightBg = colors.highlightBg || '#FEF3C7';
    const quoteColor = colors.quote || '#1D4ED8';

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    richLines.forEach((lineTokens, rowIdx) => {
        let curX = startX;
        const rowY = startY + (rowIdx * lineH);

        lineTokens.forEach(tk => {
            curX += tk.spaceBefore;
            if (tk.style === 'highlight') {
                ctx.font = `800 ${fontSize}px ${fontStack}`;
                const rawW = ctx.measureText(tk.word).width;
                drawHandoutRoundedRect(ctx, curX - 2, rowY - 3, rawW + 12, fontSize + 10, 8, highlightBg);
                ctx.fillStyle = highlightText;
                ctx.fillText(tk.word, curX + 4, rowY);
            } else if (tk.style === 'quote') {
                ctx.font = `italic 700 ${fontSize}px ${fontStack}`;
                ctx.fillStyle = quoteColor;
                ctx.fillText(tk.word, curX, rowY);
            } else if (tk.style === 'italic') {
                ctx.font = `italic 600 ${fontSize}px ${fontStack}`;
                ctx.fillStyle = normalColor;
                ctx.fillText(tk.word, curX, rowY);
            } else {
                ctx.font = `500 ${fontSize}px ${fontStack}`;
                ctx.fillStyle = normalColor;
                ctx.fillText(tk.word, curX, rowY);
            }
            curX += tk.width;
        });
    });

    ctx.restore();
    return startY + (richLines.length * lineH);
}

function createMagazinePDFPage(W, H, fontStack, monthTitle, sessionNumber, pageNum, theme) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Warm Editorial Paper Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Subtle Geometric Corner Art
    ctx.save();
    ctx.fillStyle = theme.pdfSoft;
    ctx.beginPath();
    ctx.arc(W - 60, -40, 260, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(40, H + 40, 240, 0, Math.PI * 2);
    ctx.fill();

    // Subtle Diagonal Watermark
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.022)';
    ctx.font = `800 76px ${fontStack}`;
    ctx.fillText('HAMDI ENGLISH STUDIO', 0, -420);
    ctx.fillText('FRIENDLY LEARNING SPACE', 0, 0);
    ctx.fillText('HAMDI ENGLISH STUDIO', 0, 420);
    ctx.restore();

    // Top Accent Bar
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    topGrad.addColorStop(0, theme.pdfDark);
    topGrad.addColorStop(0.5, theme.pdfPrimary);
    topGrad.addColorStop(1, theme.pdfSecondary);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 22);

    // Running Header on Page 2+
    const padX = 115;
    if (pageNum > 1) {
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94A3B8';
        ctx.font = `700 18px ${fontStack}`;
        ctx.fillText(`HAMDI ENGLISH STUDIO  •  ${monthTitle.toUpperCase()} (SESSION ${sessionNumber})`, padX, 52);

        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padX, 86);
        ctx.lineTo(W - padX, 86);
        ctx.stroke();
        ctx.restore();
    }

    // Editorial Footer
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, H - 125);
    ctx.lineTo(W - padX, H - 125);
    ctx.stroke();

    drawHandoutRoundedRect(ctx, padX, H - 102, 52, 52, 14, theme.pdfSoft);
    drawHandoutGradCapIcon(ctx, padX + 26, H - 77, 0.6, theme.pdfPrimary);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = `800 21px ${fontStack}`;
    ctx.fillText('Hamdi English Studio', padX + 68, H - 98);

    ctx.fillStyle = '#64748B';
    ctx.font = `600 18px ${fontStack}`;
    ctx.fillText(`Friendly Learning Space  •  ${monthTitle} (Session ${sessionNumber} of 12)`, padX + 68, H - 70);

    drawHandoutRoundedRect(ctx, W - padX - 135, H - 98, 135, 44, 22, theme.pdfSoft, theme.pdfBorder, 1.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.pdfPrimary;
    ctx.font = `800 19px ${fontStack}`;
    ctx.fillText(`Page ${pageNum}`, W - padX - 67.5, H - 86);
    ctx.restore();

    return { canvas, ctx };
}

window.downloadHandoutPDF = async function(prefix = 'presentation') {
    const data = parsedHandoutCache[prefix];
    if (!data) return showToast('Materi belum tersedia untuk diunduh.', 'error');

    const btn = document.getElementById(`btn-dl-${prefix}`);
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Mendesain PDF...`;
    }

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        const { monthId, week, day } = activeMateriState;
        const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
        const sessionNumber = ((week - 1) * 3) + day;
        const isRecap = prefix === 'recap';
        const theme = getSessionThemePalette(sessionNumber, isRecap, data.style);

        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';
        const W = 1654, H = 2339, padX = 115, contentW = W - (padX * 2), maxY = H - 170;

        const pages = [];
        let pageNum = 1;
        let curPage = createMagazinePDFPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum, theme);
        pages.push(curPage.canvas);
        let ctx = curPage.ctx;
        let y = 78;

        const startNewPage = () => {
            pageNum++;
            curPage = createMagazinePDFPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum, theme);
            pages.push(curPage.canvas);
            ctx = curPage.ctx;
            y = 115;
        };

        const ensureSpace = (neededH) => {
            if (y + neededH > maxY) startNewPage();
        };

        // ====================================================================
        // MAGAZINE HERO BANNER ON PAGE 1
        // ====================================================================
        const titleFont = `800 44px ${fontStack}`;
        const titleLines = wrapPlainLinesStrict(ctx, data.title, contentW - 120, titleFont);
        const goalRichLines = data.goal ? layoutRichPdfLines(ctx, data.goal, contentW - 140, 24, fontStack) : [];

        const heroTopH = 128 + (titleLines.length * 56);
        const goalBoxH = goalRichLines.length ? (66 + (goalRichLines.length * 40)) : 0;
        const totalHeroH = heroTopH + (goalBoxH ? goalBoxH + 28 : 24);

        // Hero Card Background
        drawHandoutRoundedRect(ctx, padX, y, contentW, totalHeroH, 32, theme.pdfSoft, theme.pdfBorder, 2);

        // Decorative Circle inside Hero Card
        ctx.save();
        ctx.beginPath();
        ctx.arc(padX + contentW - 70, y + 70, 130, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fill();
        ctx.restore();

        // Kicker Pill Badge
        const kickerText = cleanPlainPdfText(`${data.level}  •  WEEK ${week} DAY ${day}`).toUpperCase();
        ctx.font = `800 18px ${fontStack}`;
        const kickerW = Math.min(contentW - 100, ctx.measureText(kickerText).width + 44);
        drawHandoutRoundedRect(ctx, padX + 46, y + 38, kickerW, 40, 20, '#FFFFFF', theme.pdfBorder, 1.5);
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.pdfPrimary;
        ctx.font = `800 18px ${fontStack}`;
        ctx.fillText(kickerText, padX + 68, y + 49, kickerW - 36);
        ctx.restore();

        // Main Title (Strictly Wrapped)
        drawPlainLinesStrict(ctx, titleLines, padX + 46, y + 98, 56, contentW - 92, titleFont, '#0F172A');

        // Floating Goal Sub-Card inside Hero
        if (goalRichLines.length) {
            const gy = y + heroTopH - 6;
            drawHandoutRoundedRect(ctx, padX + 40, gy, contentW - 80, goalBoxH, 22, '#FFFFFF', theme.pdfBorder, 1.5);
            drawHandoutRoundedRect(ctx, padX + 40, gy, 10, goalBoxH, 5, theme.pdfPrimary);

            ctx.save();
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            ctx.fillStyle = theme.pdfPrimary;
            ctx.font = `800 17px ${fontStack}`;
            ctx.fillText('TODAY\'S LEARNING FOCUS', padX + 72, gy + 20);
            ctx.restore();

            drawRichPdfLines(ctx, goalRichLines, padX + 72, gy + 48, 40, 24, fontStack, {
                normal: '#1E293B',
                highlightBg: theme.pdfHighlight,
                quote: theme.pdfPrimary
            });
        }

        y += totalHeroH + 52;

        // ====================================================================
        // MAGAZINE SECTION HEADER HELPER (Strictly Wrapped & Numbered)
        // ====================================================================
        let secCounter = 1;
        const drawMagazineSectionHeader = (title, subtitle = '', accentColor = theme.pdfPrimary) => {
            const headFont = `800 31px ${fontStack}`;
            const headLines = wrapPlainLinesStrict(ctx, title, contentW - 90, headFont);
            const subFont = `500 20px ${fontStack}`;
            const subLines = subtitle ? wrapPlainLinesStrict(ctx, subtitle, contentW - 90, subFont) : [];

            const needed = 30 + (headLines.length * 40) + (subLines.length * 30) + 140;
            ensureSpace(needed);

            const numStr = String(secCounter++).padStart(2, '0');
            drawHandoutRoundedRect(ctx, padX, y, 56, 56, 16, accentColor);
            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `800 23px ${fontStack}`;
            ctx.fillText(numStr, padX + 28, y + 28);
            ctx.restore();

            let curY = drawPlainLinesStrict(ctx, headLines, padX + 76, y + (subLines.length ? 2 : 10), 40, contentW - 80, headFont, '#0F172A');
            if (subLines.length) {
                curY = drawPlainLinesStrict(ctx, subLines, padX + 76, curY + 2, 30, contentW - 80, subFont, '#64748B');
            }
            y = Math.max(y + 62, curY) + 22;
        };

        // Helper for airy rich paragraphs
        const drawEditorialParagraphs = (paragraphs, boxBg = '#F8FAFC', boxBorder = '#E2E8F0', leftStripe = null) => {
            if (!paragraphs || !paragraphs.length) return;
            const innerW = contentW - 96;
            const blocks = paragraphs.map(p => layoutRichPdfLines(ctx, p, innerW, 24, fontStack));
            const totalLines = blocks.reduce((acc, b) => acc + b.length, 0);
            const paraGaps = Math.max(0, blocks.length - 1) * 22;
            const boxH = 56 + (totalLines * 42) + paraGaps;

            ensureSpace(boxH + 26);
            drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 24, boxBg, boxBorder, 2);
            if (leftStripe) {
                drawHandoutRoundedRect(ctx, padX, y, 12, boxH, 6, leftStripe);
            }

            let curY = y + 30;
            blocks.forEach((richLines) => {
                curY = drawRichPdfLines(ctx, richLines, padX + 48, curY, 42, 24, fontStack, {
                    normal: '#334155',
                    highlightBg: '#FEF3C7',
                    highlightText: '#0F172A',
                    quote: theme.pdfPrimary
                });
                curY += 22;
            });
            y += boxH + 28;
        };

        // ====================================================================
        // RENDER EACH SECTION WITH ITS OWN GRAPHIC DESIGN LAYOUT
        // ====================================================================
        data.sections.forEach(sec => {
            // 1. STORY / SCENARIO (Editorial Pull-Quote Magazine Card)
            if (sec.type === 'story') {
                drawMagazineSectionHeader(sec.title, 'Read this real-life scenario to feel how the language flows naturally.', '#D97706');
                drawEditorialParagraphs(sec.paragraphs, '#FFFBEB', '#FDE68A', '#F59E0B');
                y += 16;
            }

            // 2. CALLOUT / PRO TIP (High-Contrast Dark Navy Spotlight Banner!)
            else if (sec.type === 'callout') {
                const innerW = contentW - 140;
                const blocks = sec.paragraphs.map(p => layoutRichPdfLines(ctx, p, innerW, 23, fontStack));
                const totalLines = blocks.reduce((a, b) => a + b.length, 0);
                const boxH = 92 + (totalLines * 40) + (Math.max(0, blocks.length - 1) * 16);

                ensureSpace(boxH + 34);
                drawHandoutRoundedRect(ctx, padX, y, contentW, boxH, 28, '#0F172A', '#1E293B', 2);

                // Gold Icon Badge
                drawHandoutRoundedRect(ctx, padX + 38, y + 34, 56, 56, 16, 'rgba(251, 191, 36, 0.18)', '#FBBF24', 1.5);
                ctx.save();
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#FBBF24';
                ctx.font = `800 22px ${fontStack}`;
                ctx.fillText('TIP', padX + 66, y + 62);

                ctx.textBaseline = 'top';
                ctx.textAlign = 'left';
                ctx.fillStyle = '#FBBF24';
                ctx.font = `800 21px ${fontStack}`;
                ctx.fillText(cleanPlainPdfText(sec.title).toUpperCase(), padX + 114, y + 34, contentW - 150);
                ctx.restore();

                let curY = y + 72;
                blocks.forEach(richLines => {
                    curY = drawRichPdfLines(ctx, richLines, padX + 114, curY, 40, 23, fontStack, {
                        normal: '#F8FAFC',
                        highlightBg: '#FBBF24',
                        highlightText: '#0F172A',
                        quote: '#38BDF8'
                    });
                    curY += 16;
                });
                y += boxH + 36;
            }

            // 3. WARM UP (Horizontal Numbered Question Cards)
            else if (sec.type === 'warmup') {
                drawMagazineSectionHeader(sec.title, 'Warm up your brain by answering these casual questions aloud.', '#D97706');

                sec.items.forEach((q, idx) => {
                    const richLines = layoutRichPdfLines(ctx, q, contentW - 140, 24, fontStack);
                    const h = Math.max(88, 44 + (richLines.length * 40));
                    ensureSpace(h + 18);

                    drawHandoutRoundedRect(ctx, padX, y, contentW, h, 22, '#FFFBEB', '#FDE68A', 2);
                    drawHandoutRoundedRect(ctx, padX + 28, y + 22, 54, 44, 12, '#F59E0B');

                    ctx.save();
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = `800 20px ${fontStack}`;
                    ctx.fillText(`Q${idx + 1}`, padX + 55, y + 44);
                    ctx.restore();

                    drawRichPdfLines(ctx, richLines, padX + 104, y + 24, 40, 24, fontStack, {
                        normal: '#78350F',
                        highlightBg: '#FEF3C7',
                        quote: '#B45309'
                    });
                    y += h + 18;
                });
                y += 22;
            }

            // 4. EDITORIAL / CONCEPT (Flowing Article + 2-Column Bento Grid)
            else if (sec.type === 'editorial') {
                drawMagazineSectionHeader(sec.title, 'Key insights explained in simple, everyday English.', theme.pdfPrimary);
                drawEditorialParagraphs(sec.paragraphs, '#F8FAFC', '#E2E8F0', theme.pdfPrimary);

                if (sec.items.length) {
                    const gapX = 28;
                    const colW = Math.floor((contentW - gapX) / 2);

                    for (let i = 0; i < sec.items.length; i += 2) {
                        const leftIt = sec.items[i];
                        const rightIt = sec.items[i + 1];
                        const isSingleWide = !rightIt;
                        const cardW = isSingleWide ? contentW : colW;

                        const measureBento = (it, w) => {
                            if (!it) return null;
                            const tLines = it.title ? wrapPlainLinesStrict(ctx, it.title, w - 76, `800 24px ${fontStack}`) : [];
                            const bLines = layoutRichPdfLines(ctx, it.body, w - 76, 22, fontStack);
                            const h = 58 + (tLines.length * 36) + (bLines.length * 36);
                            return { tLines, bLines, h };
                        };

                        const mL = measureBento(leftIt, cardW);
                        const mR = measureBento(rightIt, colW);
                        const rowH = Math.max(mL?.h || 0, mR?.h || 0);
                        ensureSpace(rowH + 22);

                        const drawBento = (mObj, xPos, w, num) => {
                            drawHandoutRoundedRect(ctx, xPos, y, w, rowH, 22, '#FFFFFF', '#CBD5E1', 2);
                            drawHandoutRoundedRect(ctx, xPos, y, w, 10, 5, theme.pdfPrimary);

                            let cy = y + 28;
                            if (mObj.tLines.length) {
                                cy = drawPlainLinesStrict(ctx, mObj.tLines, xPos + 36, cy, 36, w - 72, `800 24px ${fontStack}`, theme.pdfPrimary);
                                cy += 8;
                            }
                            drawRichPdfLines(ctx, mObj.bLines, xPos + 36, cy, 36, 22, fontStack, {
                                normal: '#334155',
                                highlightBg: theme.pdfSoft,
                                highlightText: theme.pdfPrimary
                            });
                        };

                        if (mL && mR) {
                            drawBento(mL, padX, colW, i + 1);
                            drawBento(mR, padX + colW + gapX, colW, i + 2);
                        } else if (mL) {
                            drawBento(mL, padX, contentW, i + 1);
                        }
                        y += rowH + 22;
                    }
                }
                y += 20;
            }

            // 5. FORMULAS / PATTERNS (Visual Pill Diagram Blocks!)
            else if (sec.type === 'formulas') {
                drawMagazineSectionHeader(sec.title, 'Visual building blocks to put sentences together naturally.', '#4F46E5');
                drawEditorialParagraphs(sec.paragraphs);

                sec.items.forEach(f => {
                    const parts = f.formula.includes('+')
                        ? f.formula.split('+').map(s => cleanPlainPdfText(s)).filter(Boolean)
                        : [cleanPlainPdfText(f.formula)];

                    // Layout visual formula pills into rows that never exceed contentW - 84
                    const maxRowW = contentW - 88;
                    const pillRows = [];
                    let curRow = [];
                    let curRowW = 0;

                    ctx.font = `800 22px ${fontStack}`;
                    parts.forEach((pText, pIdx) => {
                        const textW = Math.min(maxRowW - 40, ctx.measureText(pText).width);
                        const pillW = textW + 40;
                        const plusW = pIdx < parts.length - 1 ? 42 : 0;

                        if (curRowW + pillW + plusW <= maxRowW || curRow.length === 0) {
                            curRow.push({ text: pText, pillW, hasPlus: pIdx < parts.length - 1 });
                            curRowW += pillW + plusW;
                        } else {
                            pillRows.push(curRow);
                            curRow = [{ text: pText, pillW, hasPlus: pIdx < parts.length - 1 }];
                            curRowW = pillW + plusW;
                        }
                    });
                    if (curRow.length) pillRows.push(curRow);

                    const exLines = f.example ? layoutRichPdfLines(ctx, `"${f.example}"`, contentW - 96, 23, fontStack) : [];
                    const cardH = 74 + (pillRows.length * 60) + (exLines.length ? 22 + (exLines.length * 38) : 12);
                    ensureSpace(cardH + 22);

                    let accent = '#4F46E5', softBg = '#EEF2FF', brd = '#C7D2FE', tagTxt = 'PATTERN';
                    if (f.badge === '[+]') { accent = '#059669'; softBg = '#ECFDF5'; brd = '#A7F3D0'; tagTxt = '+ POSITIVE'; }
                    else if (f.badge === '[-]') { accent = '#E11D48'; softBg = '#FFF1F2'; brd = '#FECDD3'; tagTxt = '− NEGATIVE'; }
                    else if (f.badge === '[?]') { accent = '#2563EB'; softBg = '#EFF6FF'; brd = '#BFDBFE'; tagTxt = '? QUESTION'; }

                    drawHandoutRoundedRect(ctx, padX, y, contentW, cardH, 24, softBg, brd, 2);

                    // Badge + Label
                    ctx.font = `800 17px ${fontStack}`;
                    const badgeW = ctx.measureText(tagTxt).width + 32;
                    drawHandoutRoundedRect(ctx, padX + 38, y + 24, badgeW, 34, 10, accent);
                    ctx.save();
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(tagTxt, padX + 54, y + 32);

                    ctx.fillStyle = '#0F172A';
                    ctx.font = `800 23px ${fontStack}`;
                    ctx.fillText(cleanPlainPdfText(f.label).toUpperCase(), padX + 52 + badgeW, y + 28, contentW - badgeW - 96);
                    ctx.restore();

                    // Draw Pill Rows
                    let py = y + 72;
                    pillRows.forEach(row => {
                        let px = padX + 38;
                        row.forEach(pill => {
                            drawHandoutRoundedRect(ctx, px, py, pill.pillW, 48, 14, '#FFFFFF', accent, 2);
                            ctx.save();
                            ctx.textBaseline = 'top';
                            ctx.textAlign = 'left';
                            ctx.fillStyle = '#0F172A';
                            ctx.font = `800 22px ${fontStack}`;
                            ctx.fillText(pill.text, px + 20, py + 13, pill.pillW - 36);
                            ctx.restore();
                            px += pill.pillW;

                            if (pill.hasPlus) {
                                ctx.save();
                                ctx.textBaseline = 'middle';
                                ctx.textAlign = 'center';
                                ctx.fillStyle = accent;
                                ctx.font = `800 26px ${fontStack}`;
                                ctx.fillText('+', px + 21, py + 24);
                                ctx.restore();
                                px += 42;
                            }
                        });
                        py += 60;
                    });

                    if (exLines.length) {
                        drawRichPdfLines(ctx, exLines, padX + 42, py + 4, 38, 23, fontStack, {
                            normal: '#1E293B',
                            quote: accent
                        });
                    }
                    y += cardH + 22;
                });
                y += 20;
            }

            // 6. PHRASES & EXPRESSIONS (2-Column Flashcard Grid)
            else if (sec.type === 'phrases') {
                drawMagazineSectionHeader(sec.title, 'Natural expressions to sound more fluent in daily conversation.', '#0D9488');
                drawEditorialParagraphs(sec.paragraphs);

                const gapX = 28;
                const colW = Math.floor((contentW - gapX) / 2);

                for (let i = 0; i < sec.items.length; i += 2) {
                    const leftIt = sec.items[i];
                    const rightIt = sec.items[i + 1];
                    const isSingle = !rightIt;
                    const cardW = isSingle ? contentW : colW;

                    const measurePhrase = (it, w) => {
                        if (!it) return null;
                        const pLines = wrapPlainLinesStrict(ctx, it.phrase, w - 68, `800 25px ${fontStack}`);
                        const mLines = it.meaning ? wrapPlainLinesStrict(ctx, `= ${it.meaning}`, w - 68, `600 21px ${fontStack}`) : [];
                        const eLines = it.example ? wrapPlainLinesStrict(ctx, `"${it.example}"`, w - 68, `italic 500 20px ${fontStack}`) : [];
                        const h = 58 + (pLines.length * 36) + (mLines.length * 32) + (eLines.length ? 16 + (eLines.length * 32) : 0);
                        return { pLines, mLines, eLines, h };
                    };

                    const mL = measurePhrase(leftIt, cardW);
                    const mR = measurePhrase(rightIt, colW);
                    const rowH = Math.max(mL?.h || 0, mR?.h || 0);
                    ensureSpace(rowH + 22);

                    const drawPhrase = (mObj, xPos, w) => {
                        drawHandoutRoundedRect(ctx, xPos, y, w, rowH, 22, '#F0FDFA', '#99F6E4', 2);
                        drawHandoutRoundedRect(ctx, xPos, y, 10, rowH, 5, '#0D9488');

                        let cy = y + 26;
                        cy = drawPlainLinesStrict(ctx, mObj.pLines, xPos + 34, cy, 36, w - 64, `800 25px ${fontStack}`, '#134E4A');
                        if (mObj.mLines.length) {
                            cy = drawPlainLinesStrict(ctx, mObj.mLines, xPos + 34, cy + 4, 32, w - 64, `600 21px ${fontStack}`, '#0F766E');
                        }
                        if (mObj.eLines.length) {
                            drawPlainLinesStrict(ctx, mObj.eLines, xPos + 34, cy + 12, 32, w - 64, `italic 500 20px ${fontStack}`, '#334155');
                        }
                    };

                    if (mL && mR) {
                        drawPhrase(mL, padX, colW);
                        drawPhrase(mR, padX + colW + gapX, colW);
                    } else if (mL) {
                        drawPhrase(mL, padX, contentW);
                    }
                    y += rowH + 22;
                }
                y += 20;
            }

            // 7. EXAMPLES (2-Column Context Cards with Pill Tags)
            else if (sec.type === 'examples') {
                drawMagazineSectionHeader(sec.title, 'Real-world sentences showing how to use this topic in context.', '#059669');
                drawEditorialParagraphs(sec.paragraphs);

                const gapX = 28;
                const colW = Math.floor((contentW - gapX) / 2);

                for (let i = 0; i < sec.items.length; i += 2) {
                    const leftIt = sec.items[i];
                    const rightIt = sec.items[i + 1];
                    const isSingle = !rightIt;
                    const cardW = isSingle ? contentW : colW;

                    const measureEx = (it, w) => {
                        if (!it) return null;
                        const sLines = wrapPlainLinesStrict(ctx, it.sentence, w - 68, `700 23px ${fontStack}`);
                        const nLines = it.note ? wrapPlainLinesStrict(ctx, `💡 ${it.note}`, w - 68, `500 19px ${fontStack}`) : [];
                        const h = 82 + (sLines.length * 36) + (nLines.length ? 14 + (nLines.length * 30) : 0);
                        return { tag: cleanPlainPdfText(it.tag || 'EXAMPLE').toUpperCase(), sLines, nLines, h };
                    };

                    const mL = measureEx(leftIt, cardW);
                    const mR = measureEx(rightIt, colW);
                    const rowH = Math.max(mL?.h || 0, mR?.h || 0);
                    ensureSpace(rowH + 22);

                    const drawEx = (mObj, xPos, w) => {
                        drawHandoutRoundedRect(ctx, xPos, y, w, rowH, 22, '#FFFFFF', '#CBD5E1', 2);

                        ctx.font = `800 16px ${fontStack}`;
                        const tagW = Math.min(w - 64, ctx.measureText(mObj.tag).width + 30);
                        drawHandoutRoundedRect(ctx, xPos + 32, y + 24, tagW, 32, 10, '#ECFDF5', '#A7F3D0', 1.5);
                        ctx.save();
                        ctx.textBaseline = 'top';
                        ctx.textAlign = 'left';
                        ctx.fillStyle = '#047857';
                        ctx.fillText(mObj.tag, xPos + 47, y + 32, tagW - 24);
                        ctx.restore();

                        let cy = drawPlainLinesStrict(ctx, mObj.sLines, xPos + 32, y + 68, 36, w - 64, `700 23px ${fontStack}`, '#0F172A');
                        if (mObj.nLines.length) {
                            drawPlainLinesStrict(ctx, mObj.nLines, xPos + 32, cy + 10, 30, w - 64, `500 19px ${fontStack}`, '#64748B');
                        }
                    };

                    if (mL && mR) {
                        drawEx(mL, padX, colW);
                        drawEx(mR, padX + colW + gapX, colW);
                    } else if (mL) {
                        drawEx(mL, padX, contentW);
                    }
                    y += rowH + 22;
                }
                y += 20;
            }

            // 8. MISTAKES (True Side-by-Side Split Comparison Card: ❌ DON'T SAY vs ✅ SAY THIS)
            else if (sec.type === 'mistakes') {
                drawMagazineSectionHeader(sec.title, 'Side-by-side comparison to help you sound natural and avoid common traps.', '#E11D48');

                const halfW = Math.floor((contentW - 68) / 2);
                sec.items.forEach(m => {
                    if (!m.wrong) {
                        drawEditorialParagraphs([m.right], '#FFFBEB', '#FDE68A', '#F59E0B');
                        return;
                    }

                    const wLines = wrapPlainLinesStrict(ctx, m.wrong, halfW - 36, `600 22px ${fontStack}`);
                    const rLines = wrapPlainLinesStrict(ctx, m.right, halfW - 36, `800 23px ${fontStack}`);
                    const whyLines = m.reason ? wrapPlainLinesStrict(ctx, `Why: ${m.reason}`, contentW - 84, `600 20px ${fontStack}`) : [];

                    const splitBoxH = 68 + (Math.max(wLines.length, rLines.length) * 36);
                    const totalCardH = splitBoxH + (whyLines.length ? 30 + (whyLines.length * 32) : 24) + 24;
                    ensureSpace(totalCardH + 20);

                    drawHandoutRoundedRect(ctx, padX, y, contentW, totalCardH, 24, '#F8FAFC', '#CBD5E1', 2);

                    // Left Box: DON'T SAY
                    const leftX = padX + 24;
                    const topY = y + 22;
                    drawHandoutRoundedRect(ctx, leftX, topY, halfW, splitBoxH, 18, '#FFF1F2', '#FECDD3', 2);
                    ctx.save();
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#E11D48';
                    ctx.font = `800 16px ${fontStack}`;
                    ctx.fillText('✕  DON\'T SAY (AVOID)', leftX + 22, topY + 18);
                    ctx.restore();
                    drawPlainLinesStrict(ctx, wLines, leftX + 22, topY + 48, 36, halfW - 44, `600 22px ${fontStack}`, '#881337', true);

                    // Right Box: SAY THIS
                    const rightX = leftX + halfW + 20;
                    drawHandoutRoundedRect(ctx, rightX, topY, halfW, splitBoxH, 18, '#ECFDF5', '#A7F3D0', 2);
                    ctx.save();
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#059669';
                    ctx.font = `800 16px ${fontStack}`;
                    ctx.fillText('✓  SAY THIS (NATURAL)', rightX + 22, topY + 18);
                    ctx.restore();
                    drawPlainLinesStrict(ctx, rLines, rightX + 22, topY + 48, 36, halfW - 44, `800 23px ${fontStack}`, '#064E3B', false);

                    if (whyLines.length) {
                        drawPlainLinesStrict(ctx, whyLines, padX + 36, topY + splitBoxH + 16, 32, contentW - 72, `600 20px ${fontStack}`, '#475569');
                    }
                    y += totalCardH + 20;
                });
                y += 20;
            }

            // 9. DIALOGUE / CONVERSATION (Messenger Chat Bubbles + Avatars)
            else if (sec.type === 'dialogue') {
                drawMagazineSectionHeader(sec.title, 'Read aloud or roleplay this natural conversation.', '#0284C7');
                drawEditorialParagraphs(sec.paragraphs);

                const avatarSize = 54;
                const bubbleW = Math.floor(contentW * 0.78);

                sec.items.forEach((line, lIdx) => {
                    const match = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
                    const spk = match ? match[1].trim() : `Speaker ${(lIdx % 2) + 1}`;
                    const txt = match ? match[2].trim() : line;
                    const isLeft = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|a)\b/i.test(spk) || (lIdx % 2 === 0);

                    const lines = wrapPlainLinesStrict(ctx, txt, bubbleW - 76, `500 23px ${fontStack}`);
                    const h = 68 + (lines.length * 36);
                    ensureSpace(h + 20);

                    const avatarX = isLeft ? padX : (padX + contentW - avatarSize);
                    const bubbleX = isLeft ? (padX + avatarSize + 18) : (padX + contentW - avatarSize - 18 - bubbleW);

                    // Draw Avatar Circle
                    drawHandoutRoundedRect(ctx, avatarX, y + 6, avatarSize, avatarSize, 18, isLeft ? '#2563EB' : '#E11D48');
                    ctx.save();
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = `800 22px ${fontStack}`;
                    ctx.fillText(spk.charAt(0).toUpperCase(), avatarX + (avatarSize / 2), y + 33);
                    ctx.restore();

                    // Draw Speech Bubble
                    drawHandoutRoundedRect(ctx, bubbleX, y, bubbleW, h, 24, isLeft ? '#F8FAFC' : '#EFF6FF', isLeft ? '#CBD5E1' : '#93C5FD', 2);

                    ctx.save();
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = isLeft ? '#2563EB' : '#1D4ED8';
                    ctx.font = `800 17px ${fontStack}`;
                    ctx.fillText(spk.toUpperCase(), bubbleX + 34, y + 18, bubbleW - 68);
                    ctx.restore();

                    drawPlainLinesStrict(ctx, lines, bubbleX + 34, y + 46, 36, bubbleW - 68, `500 23px ${fontStack}`, '#0F172A');
                    y += h + 20;
                });
                y += 20;
            }

            // 10. PRACTICE / WORKSHEET CHALLENGES
            else if (sec.type === 'practice') {
                drawMagazineSectionHeader(sec.title, 'Test your understanding and practice speaking aloud.', '#7C3AED');
                drawEditorialParagraphs(sec.paragraphs);

                sec.items.forEach((pr, idx) => {
                    const qLines = layoutRichPdfLines(ctx, pr.task, contentW - 130, 23, fontStack);
                    const aLines = pr.answerKey ? wrapPlainLinesStrict(ctx, `Answer Key: ${pr.answerKey}`, contentW - 130, `600 19px ${fontStack}`) : [];

                    const h = 76 + (qLines.length * 38) + (aLines.length ? 16 + (aLines.length * 30) : 0);
                    ensureSpace(h + 20);

                    drawHandoutRoundedRect(ctx, padX, y, contentW, h, 22, '#F5F3FF', '#DDD6FE', 2);

                    // Number Circle
                    drawHandoutRoundedRect(ctx, padX + 28, y + 24, 48, 48, 14, '#7C3AED');
                    ctx.save();
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = `800 21px ${fontStack}`;
                    ctx.fillText(String(idx + 1), padX + 52, y + 48);

                    // Tag Pill
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#6D28D9';
                    ctx.font = `800 17px ${fontStack}`;
                    ctx.fillText(cleanPlainPdfText(pr.tag).toUpperCase(), padX + 94, y + 22, contentW - 130);
                    ctx.restore();

                    let cy = drawRichPdfLines(ctx, qLines, padX + 94, y + 50, 38, 23, fontStack, {
                        normal: '#1E1B4B',
                        highlightBg: '#FEF3C7',
                        quote: '#6D28D9'
                    });

                    if (aLines.length) {
                        drawPlainLinesStrict(ctx, aLines, padX + 94, cy + 12, 30, contentW - 130, `600 19px ${fontStack}`, '#059669');
                    }
                    y += h + 20;
                });
            }
        });

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pages.forEach((cv, idx) => {
                if (idx > 0) pdf.addPage();
                pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
            });
            const cleanTitle = data.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
            pdf.save(`HES_${monthObj.title.replace(/\s+/g, '')}_Session${sessionNumber}_${cleanTitle}.pdf`);
            showToast('PDF Magazine Workbook berhasil diunduh!', 'success');
        }
    } catch (e) {
        console.error(e);
        showToast('Gagal membuat PDF.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
};

// ============================================================================
// VOCABULARY LIST & QUIZ
// ============================================================================
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