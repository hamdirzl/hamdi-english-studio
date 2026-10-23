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

    // Pasang class agar area materi otomatis melebar saat sidebar disembunyikan di laptop
    const mainContainer = document.querySelector('main .max-w-4xl');
    if (mainContainer) mainContainer.classList.add('materi-container-width', 'transition-all', 'duration-300');

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
// PEMBERSIH TEKS & FORMATTER ANTI-BOCOR (MENGATASI ** DAN KODE BOCOR)
// ============================================================================
function sanitizeRawInputString(str) {
    return String(str || '')
        // Bersihkan bila ada teks yang tidak sengaja ter-copy dari layar yang bocor sebelumnya
        .replace(/"font-extrabold[^"]*">/g, '')
        .replace(/"italic text-slate-\d+[^"]*">/g, '')
        .replace(/<[^>]+>/g, '');
}

function escapeHtmlStr(str) {
    return sanitizeRawInputString(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function cleanTitleMarkdown(str) {
    return escapeHtmlStr(str)
        .replace(/\*+/g, '')
        .replace(/^["']|["']$/g, '')
        .trim();
}

function formatRichEnglishText(text) {
    if (!text) return '';
    let safe = escapeHtmlStr(text);

    // 1. Amankan teks dalam tanda kutip "..." menggunakan token terlebih dahulu
    //    agar TIDAK PERNAH menabrak atribut class="..." milik tag HTML!
    const quoteTokens = [];
    safe = safe.replace(/\*"([^"\n]+)"\*|"(?!font-|italic)([^"\n]+)"/g, (_, qItalic, qNormal) => {
        const content = (qItalic || qNormal || '').replace(/\*+/g, '').trim();
        quoteTokens.push(content);
        return `@@HES_QUOTE_${quoteTokens.length - 1}@@`;
    });

    // 2. Ubah **teks tebal** menjadi highlight yang lembut & ramah mata
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-slate-900 bg-amber-100/80 px-1.5 py-0.5 rounded-md">$1</strong>');

    // 3. Ubah *teks miring* menjadi italic bersih
    safe = safe.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-800 font-semibold">$1</em>');

    // 4. Hapus sisa bintang liar (jika ada ** atau * yang tidak berpasangan dari AI)
    safe = safe.replace(/\*+/g, '');

    // 5. Kembalikan token tanda kutip menjadi tampilan kutipan berwarna indigo
    safe = safe.replace(/@@HES_QUOTE_(\d+)@@/g, (_, idx) => {
        return `<span class="font-bold text-indigo-700">&ldquo;${quoteTokens[Number(idx)] || ''}&rdquo;</span>`;
    });

    // 6. Ubah tanda panah menjadi ikon panah
    safe = safe.replace(/->|→/g, '<i class="fas fa-arrow-right text-indigo-400 mx-1.5 text-xs"></i>');

    return safe;
}

function getSessionThemePalette(sessionNumber, isRecap = false, customStyle = '') {
    if (isRecap) {
        return {
            name: 'emerald',
            barGrad: 'from-emerald-700 via-teal-600 to-cyan-500',
            badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            heroBg: 'bg-gradient-to-br from-emerald-50/80 via-teal-50/30 to-white',
            heroBorder: 'border-emerald-500',
            accentText: 'text-emerald-700',
            accentBg: 'bg-emerald-600',
            pdfPrimary: '#047857',
            pdfSecondary: '#0D9488',
            pdfDark: '#064E3B',
            pdfSoft: '#ECFDF5',
            pdfBorder: '#A7F3D0'
        };
    }

    const palettes = [
        {
            name: 'ocean',
            barGrad: 'from-blue-800 via-indigo-600 to-sky-500',
            badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
            heroBg: 'bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white',
            heroBorder: 'border-blue-600',
            accentText: 'text-blue-700',
            accentBg: 'bg-blue-600',
            pdfPrimary: '#1D4ED8',
            pdfSecondary: '#0284C7',
            pdfDark: '#0F172A',
            pdfSoft: '#EFF6FF',
            pdfBorder: '#BFDBFE'
        },
        {
            name: 'indigo',
            barGrad: 'from-indigo-800 via-violet-600 to-purple-500',
            badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            heroBg: 'bg-gradient-to-br from-indigo-50/80 via-violet-50/30 to-white',
            heroBorder: 'border-indigo-600',
            accentText: 'text-indigo-700',
            accentBg: 'bg-indigo-600',
            pdfPrimary: '#4338CA',
            pdfSecondary: '#7C3AED',
            pdfDark: '#1E1B4B',
            pdfSoft: '#EEF2FF',
            pdfBorder: '#C7D2FE'
        },
        {
            name: 'teal',
            barGrad: 'from-teal-800 via-teal-600 to-emerald-500',
            badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',
            heroBg: 'bg-gradient-to-br from-teal-50/80 via-emerald-50/30 to-white',
            heroBorder: 'border-teal-600',
            accentText: 'text-teal-700',
            accentBg: 'bg-teal-600',
            pdfPrimary: '#0F766E',
            pdfSecondary: '#059669',
            pdfDark: '#134E4A',
            pdfSoft: '#F0FDFA',
            pdfBorder: '#99F6E4'
        },
        {
            name: 'amber',
            barGrad: 'from-amber-700 via-orange-600 to-rose-500',
            badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
            heroBg: 'bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-white',
            heroBorder: 'border-amber-500',
            accentText: 'text-amber-800',
            accentBg: 'bg-amber-600',
            pdfPrimary: '#B45309',
            pdfSecondary: '#EA580C',
            pdfDark: '#451A03',
            pdfSoft: '#FFFBEB',
            pdfBorder: '#FDE68A'
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

// Helper cerdas memisahkan "**Judul**: Isi Penjelasan"
function extractTitleAndBodyFromLine(str) {
    const clean = String(str || '').trim();
    const boldColon = clean.match(/^\*\*([^*]+)\*\*\s*:\s*(.+)$/);
    if (boldColon) {
        return { title: boldColon[1].trim(), body: boldColon[2].trim() };
    }
    const colonIdx = clean.indexOf(':');
    if (colonIdx > 1 && colonIdx <= 68) {
        return {
            title: clean.slice(0, colonIdx).replace(/\*+/g, '').trim(),
            body: clean.slice(colonIdx + 1).trim()
        };
    }
    return { title: '', body: clean };
}

function parseSmartHandoutText(rawText, defaultTitle, defaultLevel) {
    const clean = sanitizeRawInputString(rawText).replace(/\r\n/g, '\n').trim();
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
    const startNewSection = (type, title, icon) => {
        currentSec = {
            id: `sec_${data.sections.length + 1}`,
            type,
            title: title.replace(/\*+/g, '').trim(),
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
            data.title = line.replace(/^TITLE\s*:\s*/i, '').replace(/\*+/g, '').trim() || data.title;
            return;
        }
        if (/^(?:LEVEL|SUBTITLE)\s*:/i.test(line)) {
            data.level = line.replace(/^(?:LEVEL|SUBTITLE)\s*:\s*/i, '').replace(/\*+/g, '').trim() || data.level;
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
            const customTitle = line.replace(/^#{1,3}\s+|^SECTION\s*:\s*/i, '').replace(/\*+/g, '').trim();
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
            const sec = startNewSection('story', 'Story & Real-Life Context', 'fa-book-open-reader');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:WARM[\s-]*UP|ICE[\s-]*BREAKER)\s*:\s*/i, '').trim();
            const sec = startNewSection('warmup', 'Warm-Up Questions', 'fa-mug-hot');
            if (rest) sec.items.push(rest);
            return;
        }
        if (/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY|DEEP\s*DIVE|KEY\s*POINTS?)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:CONCEPT|OVERVIEW|EXPLANATION|SUMMARY|DEEP\s*DIVE|KEY\s*POINTS?)\s*:\s*/i, '').trim();
            const sec = startNewSection('editorial', 'Key Concepts & Insights', 'fa-compass');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:FORMULAS?|PATTERNS?|GRAMMAR|RULES?)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:FORMULAS?|PATTERNS?|GRAMMAR|RULES?)\s*:\s*/i, '').trim();
            const sec = startNewSection('formulas', 'Sentence Patterns', 'fa-shapes');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?|WAYS\s*TO\s*SAY)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:PHRASES?|EXPRESSIONS?|VOCABULARY|CHUNKS?|WAYS\s*TO\s*SAY)\s*:\s*/i, '').trim();
            const sec = startNewSection('phrases', 'Natural Expressions', 'fa-comment-dots');
            if (rest) sec.paragraphs.push(rest);
            return;
        }
        if (/^(?:EXAMPLES?|SENTENCES?|IN\s*ACTION)\s*:(.*)$/i.test(line)) {
            const rest = line.replace(/^(?:EXAMPLES?|SENTENCES?|IN\s*ACTION)\s*:\s*/i, '').trim();
            const sec = startNewSection('examples', 'Examples in Context', 'fa-bolt');
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
            const sec = startNewSection('callout', 'Tutor\'s Pro Tip', 'fa-lightbulb');
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
            const sec = startNewSection('practice', 'Interactive Practice', 'fa-gamepad');
            if (rest) sec.paragraphs.push(rest);
            return;
        }

        if (!currentSec) {
            startNewSection('editorial', 'Study Guide', 'fa-compass');
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
                if (isBullet) {
                    const { title, body } = extractTitleAndBodyFromLine(stripped);
                    currentSec.items.push({ title, body });
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
                    currentSec.items.push({ badge, label: label.replace(/\*+/g, '').trim(), formula, example, isNote: false });
                } else if (isBullet) {
                    const { title, body } = extractTitleAndBodyFromLine(stripped);
                    const hasPlusFormula = body.includes('+') && body.length < 95;
                    currentSec.items.push({
                        badge: '[*]',
                        label: title || 'Key Concept',
                        formula: hasPlusFormula ? body : '',
                        example: hasPlusFormula ? '' : body,
                        isNote: !hasPlusFormula
                    });
                } else {
                    currentSec.paragraphs.push(line);
                }
                break;
            }
            case 'phrases': {
                if (stripped.includes('|')) {
                    const parts = stripped.split('|').map(s => s.trim());
                    currentSec.items.push({
                        phrase: parts[0].replace(/\*+/g, '').trim(),
                        meaning: parts[1] || '',
                        example: parts[2] || ''
                    });
                } else if (isBullet) {
                    const { title, body } = extractTitleAndBodyFromLine(stripped);
                    if (title) {
                        currentSec.items.push({ phrase: title, meaning: body, example: '' });
                    } else if (stripped.includes('=')) {
                        const [p, ...r] = stripped.split('=');
                        currentSec.items.push({ phrase: p.replace(/\*+/g, '').trim(), meaning: r.join('=').trim(), example: '' });
                    } else {
                        currentSec.items.push({ phrase: '', meaning: stripped, example: '' });
                    }
                } else {
                    currentSec.paragraphs.push(line);
                }
                break;
            }
            case 'examples': {
                if (stripped.includes('|')) {
                    const parts = stripped.split('|').map(s => s.trim());
                    if (parts.length >= 3) {
                        currentSec.items.push({ tag: parts[0].replace(/^\[|\]$|\*+/g, ''), sentence: parts[1], note: parts.slice(2).join(' ') });
                    } else {
                        currentSec.items.push({ tag: 'Example', sentence: parts[0], note: parts[1] || '' });
                    }
                } else if (isBullet) {
                    const { title, body } = extractTitleAndBodyFromLine(stripped);
                    currentSec.items.push({
                        tag: title || `Example #${currentSec.items.length + 1}`,
                        sentence: body,
                        note: ''
                    });
                } else {
                    currentSec.paragraphs.push(line);
                }
                break;
            }
            case 'mistakes': {
                if (stripped.includes('|')) {
                    const parts = stripped.split('|').map(s => s.trim());
                    currentSec.items.push({
                        wrong: parts[0].replace(/\*+/g, '').trim(),
                        right: parts[1].replace(/\*+/g, '').trim(),
                        reason: parts[2] || ''
                    });
                } else if (!isBullet) {
                    currentSec.paragraphs.push(line);
                } else {
                    currentSec.items.push({ wrong: '', right: stripped, reason: '' });
                }
                break;
            }
            case 'dialogue': {
                if (/^[A-Za-z\s.]{1,22}\s*:\s*.+$/.test(line)) {
                    currentSec.items.push(line.replace(/\*+/g, ''));
                } else {
                    currentSec.paragraphs.push(stripped);
                }
                break;
            }
            case 'practice': {
                const pMatch = stripped.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
                const rawTask = pMatch ? pMatch[2].trim() : stripped;
                const tag = pMatch ? pMatch[1].replace(/\*+/g, '').trim() : `Task #${currentSec.items.length + 1}`;
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
    const cleanSpeech = sanitizeRawInputString(rawSpeech)
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\*+/g, '')
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
            ? `<i class="fas fa-eye mr-1.5"></i> Tampilkan Teks`
            : `<i class="fas fa-eye-slash mr-1.5"></i> Blur Teks (Latihan Listening)`;
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
    if (!formulaStr) return '';
    if (!formulaStr.includes('+')) {
        return `<div class="p-3.5 rounded-xl bg-white border border-slate-200/90 text-sm sm:text-[15px] font-semibold text-slate-700 leading-relaxed">${formatRichEnglishText(formulaStr)}</div>`;
    }
    const parts = formulaStr.split('+').map(s => s.trim()).filter(Boolean);
    return `<div class="flex flex-wrap items-center gap-1.5 my-1">` +
        parts.map((p, idx) => `
            <span class="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 font-extrabold text-xs sm:text-sm text-indigo-950 shadow-2xs">${cleanTitleMarkdown(p)}</span>
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
    const isCollapsed = document.body.classList.contains('hes-sidebar-collapsed');

    const registerAudio = (speechText) => {
        const idx = data.allAudioItems.length;
        data.allAudioItems.push(speechText);
        return idx;
    };

    const sectionsHTML = data.sections.map((sec) => {
        const domId = `${prefix}-${sec.id}`;

        // 1. STORY & CONTEXT
        if (sec.type === 'story') {
            const fullStoryAudioIdx = registerAudio(sec.paragraphs.join(' '));
            return `
                <section id="${domId}" class="scroll-mt-20">
                    <div class="p-5 sm:p-7 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-4">
                        <div class="flex items-center justify-between gap-2">
                            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-100 text-amber-900 text-xs font-extrabold">
                                <i class="fas ${sec.icon} text-amber-600"></i> ${cleanTitleMarkdown(sec.title)}
                            </span>
                            <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${fullStoryAudioIdx}, this)" title="Dengarkan Cerita" class="w-9 h-9 rounded-full bg-white hover:bg-amber-500 text-amber-700 hover:text-white border border-amber-200 flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs">
                                <i class="fas fa-volume-up text-xs"></i>
                            </button>
                        </div>
                        <div class="space-y-3.5 text-slate-700 text-sm sm:text-[15px] leading-[1.85] font-medium">
                            ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                        </div>
                    </div>
                </section>`;
        }

        // 2. TUTOR PRO TIP / CALLOUT (Desain Ramah & Bersih)
        if (sec.type === 'callout') {
            return `
                <section id="${domId}" class="scroll-mt-20">
                    <div class="p-5 sm:p-6 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex items-start gap-4">
                        <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-base shrink-0 mt-0.5">
                            <i class="fas fa-lightbulb"></i>
                        </div>
                        <div class="space-y-2 flex-1">
                            <h3 class="text-sm sm:text-base font-extrabold text-indigo-950">${cleanTitleMarkdown(sec.title)}</h3>
                            <div class="space-y-2.5 text-sm sm:text-[15px] text-slate-700 leading-[1.8] font-medium">
                                ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                            </div>
                        </div>
                    </div>
                </section>`;
        }

        // 3. WARM UP
        if (sec.type === 'warmup') {
            return `
                <section id="${domId}" class="space-y-3.5 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>
                    <div class="grid grid-cols-1 gap-3">
                        ${sec.items.map((q, i) => {
                            const aIdx = registerAudio(q);
                            return `
                            <div class="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-300 flex items-center justify-between gap-4 transition">
                                <div class="flex items-start gap-3">
                                    <span class="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
                                    <p class="text-sm sm:text-[15px] font-semibold text-slate-800 leading-relaxed">${formatRichEnglishText(q)}</p>
                                </div>
                                <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan" class="w-9 h-9 rounded-full bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0">
                                    <i class="fas fa-volume-up text-xs"></i>
                                </button>
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        // 4. EDITORIAL / KEY CONCEPTS
        if (sec.type === 'editorial') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl ${theme.badgeBg} border flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="p-5 sm:p-6 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-3.5 text-slate-700 text-sm sm:text-[15px] leading-[1.85] font-medium">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    ${sec.items.length ? `
                    <div class="grid grid-cols-1 gap-3.5">
                        ${sec.items.map((item, idx) => `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 transition space-y-1.5">
                                ${item.title ? `
                                <h4 class="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-lg ${theme.accentBg} text-white text-xs font-black flex items-center justify-center shrink-0">${idx + 1}</span>
                                    <span>${cleanTitleMarkdown(item.title)}</span>
                                </h4>` : ''}
                                <p class="text-sm sm:text-[15px] text-slate-600 leading-[1.8] font-medium ${item.title ? 'pl-8' : ''}">${formatRichEnglishText(item.body)}</p>
                            </div>
                        `).join('')}
                    </div>` : ''}
                </section>`;
        }

        // 5. FORMULAS / SENTENCE PATTERNS
        if (sec.type === 'formulas') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-3 text-slate-700 text-sm sm:text-[15px] leading-[1.8] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 gap-3.5">
                        ${sec.items.map(f => {
                            let badgeStyle = 'bg-indigo-600 text-white';
                            let cardBg = 'bg-slate-50/90 border-slate-200/90';
                            let sym = '★';
                            if (f.badge === '[+]') { badgeStyle = 'bg-emerald-600 text-white'; cardBg = 'bg-emerald-50/40 border-emerald-200/80'; sym = '+'; }
                            else if (f.badge === '[-]') { badgeStyle = 'bg-rose-600 text-white'; cardBg = 'bg-rose-50/40 border-rose-200/80'; sym = '−'; }
                            else if (f.badge === '[?]') { badgeStyle = 'bg-blue-600 text-white'; cardBg = 'bg-blue-50/40 border-blue-200/80'; sym = '?'; }

                            const speechText = f.example && !f.isNote ? f.example : '';
                            const aIdx = speechText ? registerAudio(speechText) : null;

                            return `
                            <div class="p-5 rounded-2xl ${cardBg} border flex items-start justify-between gap-4">
                                <div class="space-y-2 flex-1">
                                    <div class="flex items-center gap-2.5">
                                        <span class="w-6 h-6 rounded-lg ${badgeStyle} font-black text-xs flex items-center justify-center shrink-0">${sym}</span>
                                        <span class="text-sm sm:text-[15px] font-extrabold text-slate-900">${cleanTitleMarkdown(f.label)}</span>
                                    </div>
                                    ${f.formula ? renderFormulaPillsHTML(f.formula) : ''}
                                    ${f.example ? `
                                    <p class="text-sm sm:text-[15px] font-medium text-slate-700 leading-[1.8] ${f.formula ? 'pt-1' : 'pl-8'}">
                                        ${formatRichEnglishText(f.example)}
                                    </p>` : ''}
                                </div>
                                ${aIdx !== null ? `
                                <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan Contoh" class="w-9 h-9 rounded-full bg-white hover:bg-indigo-600 text-indigo-600 hover:text-white border border-slate-200 flex items-center justify-center transition shrink-0 cursor-pointer shadow-2xs">
                                    <i class="fas fa-volume-up text-xs"></i>
                                </button>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        // 6. PHRASES & NATURAL EXPRESSIONS
        if (sec.type === 'phrases') {
            // Gunakan 1 kolom jika ada penjelasan panjang (>90 karakter) supaya tidak sempit seperti di screenshot
            const hasLongExplanation = sec.items.some(ph => (ph.meaning || '').length > 90 || (ph.phrase || '').length > 45);
            const gridCols = hasLongExplanation ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-200 flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-3 text-slate-700 text-sm sm:text-[15px] leading-[1.8] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid ${gridCols} gap-3.5">
                        ${sec.items.map(ph => {
                            const audioSource = ph.example ? `${ph.phrase}. ${ph.example}` : (ph.phrase || ph.meaning);
                            const aIdx = registerAudio(audioSource);
                            return `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-teal-400 transition flex flex-col justify-between gap-3">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="space-y-1.5 flex-1">
                                        ${ph.phrase ? `<h4 class="text-base font-extrabold text-slate-900">${cleanTitleMarkdown(ph.phrase)}</h4>` : ''}
                                        ${ph.meaning ? `<p class="text-sm sm:text-[15px] font-medium text-slate-600 leading-[1.75]">${formatRichEnglishText(ph.meaning)}</p>` : ''}
                                    </div>
                                    <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan" class="w-9 h-9 rounded-full bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer">
                                        <i class="fas fa-volume-up text-xs"></i>
                                    </button>
                                </div>
                                ${ph.example ? `
                                <div class="pt-2.5 border-t border-slate-100 text-xs sm:text-sm font-medium text-slate-600 leading-relaxed">
                                    <span class="font-bold text-teal-600 mr-1">Contoh:</span> ${formatRichEnglishText(ph.example)}
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        // 7. EXAMPLES
        if (sec.type === 'examples') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-3 text-slate-700 text-sm sm:text-[15px] leading-[1.8] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 gap-3.5">
                        ${sec.items.map(ex => {
                            const aIdx = registerAudio(ex.sentence);
                            return `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-300 transition flex items-start justify-between gap-4">
                                <div class="space-y-1.5 flex-1">
                                    <span class="inline-block px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-extrabold">
                                        ${cleanTitleMarkdown(ex.tag)}
                                    </span>
                                    <p class="text-sm sm:text-[15px] font-semibold text-slate-800 leading-[1.8]">${formatRichEnglishText(ex.sentence)}</p>
                                    ${ex.note ? `<p class="text-xs sm:text-sm text-slate-500 pt-1"><i class="fas fa-info-circle text-indigo-400 mr-1"></i>${formatRichEnglishText(ex.note)}</p>` : ''}
                                </div>
                                <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan" class="w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer">
                                    <i class="fas fa-volume-up text-xs"></i>
                                </button>
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        // 8. MISTAKES (Don't Say vs Say This)
        if (sec.type === 'mistakes') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>

                    <div class="grid grid-cols-1 gap-3.5">
                        ${sec.items.map(m => {
                            if (!m.wrong) {
                                return `
                                <div class="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-start gap-3">
                                    <i class="fas fa-lightbulb text-amber-500 mt-1"></i>
                                    <p class="text-sm sm:text-[15px] font-medium text-slate-800 leading-relaxed">${formatRichEnglishText(m.right)}</p>
                                </div>`;
                            }
                            const aIdx = registerAudio(m.right);
                            return `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-3">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div class="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200/80 flex items-start gap-3">
                                        <span class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 text-xs font-black flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-times"></i></span>
                                        <div>
                                            <span class="text-[10px] font-extrabold uppercase tracking-wider text-rose-500 block">Kurang Tepat</span>
                                            <p class="text-xs sm:text-sm font-semibold text-slate-600 line-through decoration-rose-400 mt-0.5">${cleanTitleMarkdown(m.wrong)}</p>
                                        </div>
                                    </div>
                                    <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/90 flex items-center justify-between gap-3">
                                        <div class="flex items-start gap-3">
                                            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-check"></i></span>
                                            <div>
                                                <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">Lebih Natural</span>
                                                <p class="text-xs sm:text-sm font-extrabold text-emerald-950 mt-0.5">${cleanTitleMarkdown(m.right)}</p>
                                            </div>
                                        </div>
                                        <button type="button" onclick="playHandoutRegisteredAudio('${prefix}', ${aIdx}, this)" title="Dengarkan" class="w-9 h-9 rounded-full bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 flex items-center justify-center transition shrink-0 cursor-pointer">
                                            <i class="fas fa-volume-up text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                                ${m.reason ? `
                                <p class="text-xs sm:text-sm font-medium text-slate-600 pl-1">
                                    <strong class="text-indigo-600 font-bold"><i class="fas fa-info-circle mr-1"></i> Catatan:</strong> ${formatRichEnglishText(m.reason)}
                                </p>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        // 9. DIALOGUE / CONVERSATION
        if (sec.type === 'dialogue') {
            data.allAudioDialogues[sec.id] = sec.items;
            const chatContainerId = `${domId}-chatbox`;
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-2.5">
                            <div class="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center text-sm shrink-0">
                                <i class="fas ${sec.icon}"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" onclick="toggleDialogueBlurMode('${chatContainerId}', this)" class="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold transition cursor-pointer">
                                <i class="fas fa-eye-slash mr-1.5"></i> Blur Teks (Latihan Listening)
                            </button>
                            <button type="button" onclick="playHandoutSectionDialogue('${prefix}', '${sec.id}', this)" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer">
                                <i class="fas fa-volume-up mr-1.5"></i> Putar Dialog
                            </button>
                        </div>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-xs sm:text-sm text-slate-600 italic">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div id="${chatContainerId}" data-blurred="0" class="p-4 sm:p-6 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-3.5">
                        ${sec.items.map(line => {
                            const match = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
                            const lineAudioIdx = registerAudio(line);
                            if (match) {
                                const spk = match[1].trim();
                                const txt = match[2].trim();
                                const isMale = /^(man|male|boy|kevin|david|budi|andi|raka|john|alex|tom|waiter|father|dad|boss|manager|a)\b/i.test(spk);
                                return `
                                <div class="flex items-start gap-3">
                                    <div class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${isMale ? 'bg-blue-600 text-white' : 'bg-rose-500 text-white'}">
                                        <i class="fas ${isMale ? 'fa-user-tie' : 'fa-user'}"></i>
                                    </div>
                                    <div onclick="this.querySelector('.dialogue-line-text')?.classList.remove('blur-xs')" class="flex-1 p-4 rounded-2xl bg-white border border-slate-200/90 flex items-start justify-between gap-3 cursor-pointer hover:border-indigo-200 transition">
                                        <div class="space-y-1">
                                            <span class="text-[11px] font-extrabold uppercase tracking-wider ${isMale ? 'text-blue-600' : 'text-rose-600'}">${cleanTitleMarkdown(spk)}</span>
                                            <p class="dialogue-line-text text-sm sm:text-[15px] font-medium text-slate-800 leading-relaxed transition duration-200">${formatRichEnglishText(txt)}</p>
                                        </div>
                                        <button type="button" onclick="event.stopPropagation(); playHandoutRegisteredAudio('${prefix}', ${lineAudioIdx}, this)" title="Dengarkan Kalimat" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer">
                                            <i class="fas fa-volume-up text-xs"></i>
                                        </button>
                                    </div>
                                </div>`;
                            }
                            return `<p class="text-xs sm:text-sm font-medium text-slate-600">${formatRichEnglishText(line)}</p>`;
                        }).join('')}
                    </div>
                </section>`;
        }

        // 10. PRACTICE / CHALLENGES
        if (sec.type === 'practice') {
            return `
                <section id="${domId}" class="space-y-4 scroll-mt-20">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 border border-violet-200 flex items-center justify-center text-sm shrink-0">
                            <i class="fas ${sec.icon}"></i>
                        </div>
                        <h3 class="text-base sm:text-lg font-extrabold text-slate-900">${cleanTitleMarkdown(sec.title)}</h3>
                    </div>

                    ${sec.paragraphs.length ? `
                    <div class="space-y-2 text-slate-700 text-sm sm:text-[15px] leading-[1.8] font-medium px-1">
                        ${sec.paragraphs.map(p => `<p>${formatRichEnglishText(p)}</p>`).join('')}
                    </div>` : ''}

                    <div class="grid grid-cols-1 gap-3.5">
                        ${sec.items.map((pr, i) => {
                            const ansId = `${domId}_ans_${i}`;
                            return `
                            <div class="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-2.5">
                                <div class="flex items-start gap-3">
                                    <span class="w-6 h-6 rounded-lg bg-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
                                    <div class="space-y-2 flex-1">
                                        <span class="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-violet-50 text-violet-700">
                                            ${cleanTitleMarkdown(pr.tag)}
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
        <!-- Action Bar Atas (Download PDF & Mode Layar Penuh Laptop) -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white border border-slate-200/90 px-4 sm:px-5 py-3.5 rounded-2xl shadow-2xs">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl ${theme.accentBg} text-white flex items-center justify-center text-sm font-black shrink-0">
                    <i class="fas fa-book-open"></i>
                </div>
                <div>
                    <p class="text-xs sm:text-sm font-extrabold text-slate-800">${docBadge} &bull; Session ${sessionNumber}</p>
                    <p class="text-[11px] font-semibold text-slate-400">Klik ikon speaker untuk mendengar pelafalan</p>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" onclick="toggleFullScreenReading()" class="hes-focus-mode-btn hidden md:inline-flex items-center px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-extrabold text-xs transition cursor-pointer">
                    <i class="fas ${isCollapsed ? 'fa-compress-alt' : 'fa-expand-alt'} mr-1.5"></i> ${isCollapsed ? 'Tampilkan Sidebar' : 'Mode Layar Penuh'}
                </button>
                <button id="btn-dl-${prefix}" onclick="downloadHandoutPDF('${prefix}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
                    <i class="fas fa-file-pdf"></i> Download PDF
                </button>
                ${window.HES.userRole === 'admin' ? `
                <a href="admin.html?tab=materials" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-xl transition" title="Edit Materi">
                    <i class="fas fa-pen"></i>
                </a>` : ''}
            </div>
        </div>

        <!-- Kontainer Materi Utama -->
        <div id="printable-handout-${prefix}" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="bg-white mx-auto rounded-3xl shadow-xs border border-slate-200/90 overflow-hidden text-slate-800 relative">
            <div class="h-2.5 w-full bg-gradient-to-r ${theme.barGrad}"></div>

            <div class="relative z-10 p-5 sm:p-9 space-y-8">
                <!-- Header Judul & Goal -->
                <div class="space-y-4 border-b border-slate-100 pb-6">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${theme.badgeBg}">
                            ${cleanTitleMarkdown(data.level)}
                        </span>
                        <span class="text-xs font-bold text-slate-400">&bull; Hamdi English Studio</span>
                    </div>
                    <h1 class="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">${cleanTitleMarkdown(data.title)}</h1>

                    ${data.goal ? `
                    <div class="p-4 sm:p-5 rounded-2xl ${theme.heroBg} border-l-4 ${theme.heroBorder}">
                        <p class="text-[11px] font-extrabold uppercase tracking-wider ${theme.accentText} mb-1">
                            <i class="fas fa-bullseye mr-1"></i> Target Belajar Hari Ini
                        </p>
                        <p class="text-sm sm:text-[15px] font-semibold text-slate-800 leading-relaxed">${formatRichEnglishText(data.goal)}</p>
                    </div>` : ''}
                </div>

                <!-- Isi Materi -->
                <div class="space-y-9">
                    ${sectionsHTML}
                </div>

                <!-- Footer -->
                <div class="pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-bold">
                    <span>Hamdi English Studio &bull; Friendly Learning Space</span>
                    <span>${monthTitle} &bull; Session ${sessionNumber} of 12</span>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// GENERATOR PDF A4 BERSIH & RAPI (1 KOLOM SEKUENSIAL - ANTI MENUMPUK)
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

function cleanPlainPdfText(str) {
    return sanitizeRawInputString(str)
        .replace(/\*+/g, '')
        .replace(/->/g, '→')
        .replace(/\s+/g, ' ')
        .trim();
}

function wrapPlainLinesStrict(ctx, rawText, maxW, fontStr) {
    ctx.font = fontStr;
    const safeMaxW = Math.max(80, maxW - 10);
    const paragraphs = String(rawText || '').split('\n');
    const lines = [];

    paragraphs.forEach(p => {
        const cleanP = cleanPlainPdfText(p);
        if (!cleanP) return;
        const words = cleanP.split(' ');
        let cur = '';

        words.forEach(word => {
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

    return lines.length ? lines : [];
}

function drawPlainLinesStrict(ctx, lines, x, startY, lineH, maxW, fontStr, color = '#0F172A') {
    if (!lines || !lines.length) return startY;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = fontStr;
    ctx.fillStyle = color;
    lines.forEach((line, idx) => {
        ctx.fillText(line, x, startY + (idx * lineH), maxW);
    });
    ctx.restore();
    return startY + (lines.length * lineH);
}

function createCleanPDFPage(W, H, fontStack, monthTitle, sessionNumber, pageNum, theme) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Top Accent Bar
    ctx.fillStyle = theme.pdfPrimary;
    ctx.fillRect(0, 0, W, 20);

    const padX = 110;
    if (pageNum > 1) {
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94A3B8';
        ctx.font = `700 18px ${fontStack}`;
        ctx.fillText(`HAMDI ENGLISH STUDIO  •  ${monthTitle.toUpperCase()} (SESSION ${sessionNumber})`, padX, 48);
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padX, 80);
        ctx.lineTo(W - padX, 80);
        ctx.stroke();
        ctx.restore();
    }

    // Footer
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, H - 110);
    ctx.lineTo(W - padX, H - 110);
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = `700 18px ${fontStack}`;
    ctx.fillText(`Hamdi English Studio  •  Friendly Learning Space (${monthTitle} - Session ${sessionNumber})`, padX, H - 82);

    ctx.textAlign = 'right';
    ctx.fillStyle = theme.pdfPrimary;
    ctx.font = `800 18px ${fontStack}`;
    ctx.fillText(`Page ${pageNum}`, W - padX, H - 82);
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
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Menyiapkan PDF...`;
    }

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        const { monthId, week, day } = activeMateriState;
        const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
        const sessionNumber = ((week - 1) * 3) + day;
        const isRecap = prefix === 'recap';
        const theme = getSessionThemePalette(sessionNumber, isRecap, data.style);

        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';
        const W = 1654, H = 2339, padX = 110, contentW = W - (padX * 2), maxY = H - 145;

        const pages = [];
        let pageNum = 1;
        let curPage = createCleanPDFPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum, theme);
        pages.push(curPage.canvas);
        let ctx = curPage.ctx;
        let y = 75;

        const startNewPage = () => {
            pageNum++;
            curPage = createCleanPDFPage(W, H, fontStack, monthObj.title, sessionNumber, pageNum, theme);
            pages.push(curPage.canvas);
            ctx = curPage.ctx;
            y = 110;
        };

        const ensureSpace = (neededH) => {
            if (y + neededH > maxY) startNewPage();
        };

        // Helper menggambar 1 Kartu Penuh (100% Anti-Menumpuk karena diukur per baris sebelum digambar)
        const drawStructuredCard = (titleText, bodyText, subNoteText = '', bg = '#F8FAFC', border = '#E2E8F0', titleColor = '#0F172A') => {
            const innerW = contentW - 72;
            const titleFont = `800 24px ${fontStack}`;
            const bodyFont = `500 22px ${fontStack}`;
            const subFont = `600 20px ${fontStack}`;

            const tLines = titleText ? wrapPlainLinesStrict(ctx, titleText, innerW, titleFont) : [];
            const bLines = bodyText ? wrapPlainLinesStrict(ctx, bodyText, innerW, bodyFont) : [];
            const sLines = subNoteText ? wrapPlainLinesStrict(ctx, subNoteText, innerW, subFont) : [];

            const cardH = 44
                + (tLines.length ? (tLines.length * 34) + 10 : 0)
                + (bLines.length ? (bLines.length * 34) : 0)
                + (sLines.length ? (sLines.length * 30) + 14 : 0);

            ensureSpace(cardH + 18);
            drawHandoutRoundedRect(ctx, padX, y, contentW, cardH, 20, bg, border, 2);

            let cy = y + 22;
            if (tLines.length) {
                cy = drawPlainLinesStrict(ctx, tLines, padX + 36, cy, 34, innerW, titleFont, titleColor);
                cy += 10;
            }
            if (bLines.length) {
                cy = drawPlainLinesStrict(ctx, bLines, padX + 36, cy, 34, innerW, bodyFont, '#334155');
            }
            if (sLines.length) {
                cy += 12;
                drawPlainLinesStrict(ctx, sLines, padX + 36, cy, 30, innerW, subFont, theme.pdfPrimary);
            }
            y += cardH + 18;
        };

        // HEADER UTAMA HALAMAN 1
        const titleFont = `800 40px ${fontStack}`;
        const goalFont = `600 23px ${fontStack}`;
        const titleLines = wrapPlainLinesStrict(ctx, data.title, contentW - 80, titleFont);
        const goalLines = data.goal ? wrapPlainLinesStrict(ctx, `Target: ${data.goal}`, contentW - 80, goalFont) : [];

        const headerH = 95 + (titleLines.length * 50) + (goalLines.length ? (goalLines.length * 36) + 24 : 0);
        drawHandoutRoundedRect(ctx, padX, y, contentW, headerH, 26, theme.pdfSoft, theme.pdfBorder, 2);

        ctx.save();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.pdfPrimary;
        ctx.font = `800 18px ${fontStack}`;
        ctx.fillText(cleanPlainPdfText(`${data.level}  •  HAMDI ENGLISH STUDIO`).toUpperCase(), padX + 40, y + 28, contentW - 80);
        ctx.restore();

        let hy = drawPlainLinesStrict(ctx, titleLines, padX + 40, y + 64, 50, contentW - 80, titleFont, '#0F172A');
        if (goalLines.length) {
            drawPlainLinesStrict(ctx, goalLines, padX + 40, hy + 16, 36, contentW - 80, goalFont, theme.pdfPrimary);
        }
        y += headerH + 38;

        // RENDER SETIAP SEKSI SECARA BERURUTAN
        data.sections.forEach((sec, sIdx) => {
            const secFont = `800 28px ${fontStack}`;
            const secLines = wrapPlainLinesStrict(ctx, `${sIdx + 1}. ${sec.title}`, contentW - 20, secFont);
            ensureSpace((secLines.length * 38) + 120);

            y = drawPlainLinesStrict(ctx, secLines, padX, y, 38, contentW, secFont, theme.pdfPrimary);
            y += 14;

            if (sec.paragraphs && sec.paragraphs.length) {
                drawStructuredCard('', sec.paragraphs.join('\n'), '', '#F8FAFC', '#E2E8F0');
            }

            if (sec.type === 'warmup') {
                sec.items.forEach((q, idx) => {
                    drawStructuredCard(`Question #${idx + 1}`, q, '', '#FFFBEB', '#FDE68A', '#B45309');
                });
            } else if (sec.type === 'editorial') {
                sec.items.forEach((it, idx) => {
                    drawStructuredCard(it.title ? `${idx + 1}. ${it.title}` : '', it.body, '', '#FFFFFF', '#CBD5E1', theme.pdfPrimary);
                });
            } else if (sec.type === 'formulas') {
                sec.items.forEach(f => {
                    const body = f.formula ? `${f.formula}${f.example ? '\n' + f.example : ''}` : f.example;
                    drawStructuredCard(f.label, body, '', '#EEF2FF', '#C7D2FE', '#4338CA');
                });
            } else if (sec.type === 'phrases') {
                sec.items.forEach(ph => {
                    const ex = ph.example ? `Example: "${ph.example}"` : '';
                    drawStructuredCard(ph.phrase, ph.meaning, ex, '#F0FDFA', '#99F6E4', '#0F766E');
                });
            } else if (sec.type === 'examples') {
                sec.items.forEach(ex => {
                    drawStructuredCard(ex.tag, ex.sentence, ex.note, '#FFFFFF', '#CBD5E1', '#047857');
                });
            } else if (sec.type === 'mistakes') {
                sec.items.forEach(m => {
                    if (!m.wrong) {
                        drawStructuredCard('Tip', m.right, '', '#FFFBEB', '#FDE68A', '#B45309');
                    } else {
                        drawStructuredCard(
                            `Don't Say: "${m.wrong}"`,
                            `Say This: "${m.right}"`,
                            m.reason ? `Note: ${m.reason}` : '',
                            '#FFF1F2', '#FECDD3', '#BE123C'
                        );
                    }
                });
            } else if (sec.type === 'dialogue') {
                sec.items.forEach(line => {
                    const match = line.match(/^([A-Za-z\s.]{1,22})\s*:\s*(.+)$/);
                    if (match) {
                        drawStructuredCard(match[1].trim(), match[2].trim(), '', '#F8FAFC', '#CBD5E1', '#1D4ED8');
                    } else {
                        drawStructuredCard('', line, '', '#F8FAFC', '#CBD5E1');
                    }
                });
            } else if (sec.type === 'practice') {
                sec.items.forEach((pr, idx) => {
                    drawStructuredCard(
                        `${idx + 1}. ${pr.tag}`,
                        pr.task,
                        pr.answerKey ? `Answer Key: ${pr.answerKey}` : '',
                        '#F5F3FF', '#DDD6FE', '#6D28D9'
                    );
                });
            }

            y += 18;
        });

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pages.forEach((cv, idx) => {
                if (idx > 0) pdf.addPage();
                pdf.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
            });
            const cleanTitle = cleanPlainPdfText(data.title).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
            pdf.save(`HES_${monthObj.title.replace(/\s+/g, '')}_Session${sessionNumber}_${cleanTitle}.pdf`);
            showToast('PDF Materi berhasil diunduh!', 'success');
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
                    <button type="button" onclick="speakVocabWord(event, '${safeWord}', this)" class="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center cursor-pointer">
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