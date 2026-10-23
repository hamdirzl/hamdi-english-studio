// js/config.js

const SUPABASE_URL = "https://vpmnsuhyflzlhfnkvuko.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbW5zdWh5Zmx6bGhmbmt2dWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDg5MjAsImV4cCI6MjEwNTYyNDkyMH0.ou6N7Wvfaibicuk4io-ptlJp87-MLwkpfRcHRbuVqXA";
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_BOT_TOKEN = "8783483454:AAFIMaNa4Z5-uUMXHOeqHZgkk2S9EK4gC0Y";
const TELEGRAM_CHAT_ID = "1225652735";

// Wajib agar streaming MP3 Cloud Neural Google tidak terkena blokir 403 di HP
if (!document.getElementById('hes-no-referrer')) {
    const meta = document.createElement('meta');
    meta.id = 'hes-no-referrer';
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
}

function sendTelegramNotification(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
    }).catch(e => console.error("Telegram error:", e));
}

// STATE GLOBAL & CACHE LOKAL
window.HES = {
    currentUser: null,
    userRole: null,
    months: [
        { id: 'm1', title: 'Month 1', weeks: [1, 2, 3, 4] },
        { id: 'm2', title: 'Month 2', weeks: [1, 2, 3, 4] }
    ],
    materials: {},
    students: [{ email: 'murid@gmail.com', password: '123', name: 'Murid Pertama' }]
};

try {
    ['months', 'materials', 'students'].forEach(k => {
        const cached = localStorage.getItem(`hes_cache_${k}`);
        if (cached) window.HES[k] = JSON.parse(cached);
    });
} catch (e) {}

// AUTENTIKASI & SESI
function getSession() {
    const u = localStorage.getItem('hes_session_user');
    const r = localStorage.getItem('hes_session_role');
    if (u && r) {
        window.HES.currentUser = JSON.parse(u);
        window.HES.userRole = r;
        return { user: window.HES.currentUser, role: r };
    }
    return null;
}

function requireAuth(allowedRole = null) {
    const s = getSession();
    if (!s) { window.location.href = 'index.html'; return null; }
    if (allowedRole && s.role !== allowedRole) { window.location.href = 'dashboard.html'; return null; }
    return s;
}

function logoutUser() {
    localStorage.removeItem('hes_session_user');
    localStorage.removeItem('hes_session_role');
    window.location.href = 'index.html';
}

// SINKRONISASI CLOUD TERPADU
async function syncFromCloud() {
    updateCloudStatusUI('syncing');
    try {
        const { data, error } = await window.supabaseClient.from('app_data').select('*');
        if (error) throw error;
        const map = { hes_months: 'months', hes_materials: 'materials', hes_students: 'students' };
        (data || []).forEach(row => {
            const prop = map[row.key];
            if (prop && row.value) {
                window.HES[prop] = row.value;
                localStorage.setItem(`hes_cache_${prop}`, JSON.stringify(row.value));
            }
        });
        updateCloudStatusUI('online');
        return true;
    } catch (e) {
        updateCloudStatusUI('offline');
        return false;
    }
}

async function saveToCloud(key, value) {
    updateCloudStatusUI('syncing');
    const prop = key.replace('hes_', '');
    if (window.HES[prop] !== undefined) {
        window.HES[prop] = value;
        localStorage.setItem(`hes_cache_${prop}`, JSON.stringify(value));
    }
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key, value }]);
    updateCloudStatusUI(error ? 'offline' : 'online');
    return { error: error || null };
}

async function safeSaveMaterialsToCloud(mutatorFn) {
    updateCloudStatusUI('syncing');
    try {
        const { data, error } = await window.supabaseClient.from('app_data').select('value').eq('key', 'hes_materials').maybeSingle();
        if (!error && data?.value) {
            window.HES.materials = Object.assign({}, data.value, window.HES.materials);
        }
    } catch (e) {}
    if (typeof mutatorFn === 'function') mutatorFn(window.HES.materials);
    try { localStorage.setItem('hes_cache_materials', JSON.stringify(window.HES.materials)); } catch (e) {}
    const { error } = await window.supabaseClient.from('app_data').upsert([{ key: 'hes_materials', value: window.HES.materials }]);
    updateCloudStatusUI(error ? 'offline' : 'online');
    return { error: error || null };
}

function updateCloudStatusUI(status) {
    const badge = document.getElementById('cloud-status-indicator');
    if (!badge) return;
    const cfg = {
        syncing: ['bg-amber-50 text-amber-600 border-amber-200', '<i class="fas fa-sync fa-spin"></i> <span>Sinkronisasi...</span>'],
        online:  ['bg-emerald-50 text-emerald-600 border-emerald-200', '<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Tersambung</span>'],
        offline: ['bg-red-50 text-red-600 border-red-200', '<i class="fas fa-wifi"></i> <span>Mode Offline</span>']
    }[status];
    badge.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg[0]}`;
    badge.innerHTML = cfg[1];
}

// ============================================================================
// MESIN SUARA 100% CLOUD NEURAL AMERICAN ENGLISH (en-US) - ANTI ROBOT/INDIA
// ============================================================================
let _ttsSessionId = 0;
let _sharedAudioEl = null;

function getSharedTTSAudio() {
    if (!_sharedAudioEl) {
        _sharedAudioEl = new Audio();
        _sharedAudioEl.referrerPolicy = 'no-referrer';
        _sharedAudioEl.preload = 'auto';
    }
    return _sharedAudioEl;
}

function splitIntoChunks(text, maxLen = 165) {
    const safe = String(text || '').replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\.\s+/gi, '$1__DOT__ ');
    const sentences = safe.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [safe];
    const chunks = [];
    sentences.forEach(raw => {
        const s = raw.replace(/__DOT__/g, '.').trim();
        if (!s) return;
        if (s.length <= maxLen) {
            chunks.push(s);
        } else {
            let cur = '';
            s.split(/(?<=[,;:])\s+|\s+(?=(?:and|but|because|so|when|while|before|after)\b)/i).forEach(p => {
                if ((cur + ' ' + p).trim().length <= maxLen) cur = (cur + ' ' + p).trim();
                else { if (cur) chunks.push(cur); cur = p.trim(); }
            });
            if (cur) chunks.push(cur);
        }
    });
    return chunks;
}

function parseDialogueSegments(rawText) {
    const cleaned = String(rawText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\*+/g, '')
        .replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/gim, '')
        .replace(/\s*[\/|]\s*/g, '\n')
        .replace(/(^|\s+)(?=(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB]|Kevin|Sarah|David|Dina|Nadia|Sinta|Raka|Budi|Andi|Customer|Waiter)\s*:)/gi, '\n');

    const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    const segments = [];
    let lastGender = 'female';

    lines.forEach(line => {
        let gender = 'female';
        let text = line.replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/i, '').trim();
        const match = text.match(/^([A-Za-z\s.]{1,22}?)\s*:\s*(.+)$/);

        if (match) {
            const speaker = match[1].trim().toLowerCase();
            text = match[2].trim();
            if (/^(man|male|boy|mr|father|dad|waiter|husband|son|brother|uncle|kevin|david|raka|budi|andi|john|tom|alex|speaker a|a)\b/.test(speaker)) {
                gender = 'male';
            } else if (/^(woman|female|girl|mrs|ms|miss|mother|mom|waitress|wife|daughter|sister|aunt|sarah|dina|nadia|sinta|rina|dinda|lisa|anna|speaker b|b)\b/.test(speaker)) {
                gender = 'female';
            } else {
                gender = lastGender === 'male' ? 'female' : 'male';
            }
        } else if (lines.length > 1) {
            gender = lastGender === 'male' ? 'female' : 'male';
        }
        lastGender = gender;
        splitIntoChunks(text).forEach(chunk => { if (chunk) segments.push({ text: chunk, gender }); });
    });
    return segments;
}

function playCloudUSNeuralSegment(text, gender, sessionId) {
    return new Promise(resolve => {
        if (sessionId !== _ttsSessionId) return resolve();

        // 100% American English (en-US) Cloud Neural MP3 untuk Pria & Wanita
        const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=en-US&dt=t&q=${encodeURIComponent(text)}`;
        const audio = getSharedTTSAudio();
        let done = false;

        const applyVoiceProfile = () => {
            const isMale = gender === 'male';
            // Kunci pitch shift langsung pada audio player saat stream dimuat di Chrome HP
            if ('preservesPitch' in audio) audio.preservesPitch = !isMale;
            if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = !isMale;
            if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = !isMale;

            // 0.80 menurunkan frekuensi suara US ke bariton Pria, 1.00 tetap di suara Wanita US
            const rate = isMale ? 0.80 : 1.0;
            audio.defaultPlaybackRate = rate;
            audio.playbackRate = rate;
        };

        const cleanupAndResolve = () => {
            if (done) return;
            done = true;
            audio.onloadedmetadata = null;
            audio.oncanplay = null;
            audio.onplay = null;
            audio.onended = null;
            audio.onerror = null;
            resolve();
        };

        audio.onloadedmetadata = applyVoiceProfile;
        audio.oncanplay = applyVoiceProfile;
        audio.onplay = applyVoiceProfile;
        audio.onended = cleanupAndResolve;
        audio.onerror = cleanupAndResolve;

        audio.src = url;
        applyVoiceProfile();

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(cleanupAndResolve);
        }
    });
}

window.stopNaturalEnglishTTS = function() {
    _ttsSessionId++;
    if (_sharedAudioEl) {
        try {
            _sharedAudioEl.onloadedmetadata = null;
            _sharedAudioEl.oncanplay = null;
            _sharedAudioEl.onplay = null;
            _sharedAudioEl.onended = null;
            _sharedAudioEl.onerror = null;
            _sharedAudioEl.pause();
            _sharedAudioEl.removeAttribute('src');
        } catch (e) {}
    }
    if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
};

window.playNaturalEnglishTTS = async function(text, btnEl = null) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return showToast('Tulis naskah audio terlebih dahulu.', 'error');

    if (btnEl && btnEl.dataset.playing === '1') {
        window.stopNaturalEnglishTTS();
        btnEl.dataset.playing = '0';
        btnEl.classList.remove('speaking-pulse');
        btnEl.innerHTML = btnEl.dataset.origHtml || `<i class="fas fa-play mr-1"></i> Putar Audio`;
        return;
    }

    window.stopNaturalEnglishTTS();
    const session = ++_ttsSessionId;
    const segments = parseDialogueSegments(cleanText);
    if (!segments.length) return;

    const origHTML = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.dataset.origHtml = origHTML;
        btnEl.dataset.playing = '1';
        btnEl.classList.add('speaking-pulse');
    }

    for (let i = 0; i < segments.length; i++) {
        if (session !== _ttsSessionId) break;
        const seg = segments[i];
        if (btnEl && segments.length > 1) {
            btnEl.innerHTML = seg.gender === 'male'
                ? `<i class="fas fa-stop mr-1"></i> 👨 Man (US)...`
                : `<i class="fas fa-stop mr-1"></i> 👩 Woman (US)...`;
        }

        await playCloudUSNeuralSegment(seg.text, seg.gender, session);

        if (session !== _ttsSessionId) break;
        if (i < segments.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    if (btnEl && session === _ttsSessionId) {
        btnEl.dataset.playing = '0';
        btnEl.classList.remove('speaking-pulse');
        btnEl.innerHTML = origHTML;
    }
};

// MASTER WORDBANK ENGINE
function getCleanMasterWordbankArray() {
    const raw = (window.HES.materials['master_wordbank'] || '').trim() || window.DEFAULT_WORDBANK_RAW || '';
    if (!raw) return [];
    const seen = new Set(), list = [];
    raw.split('\n').forEach(line => {
        if (!line.includes('=')) return;
        const [eng, ...rest] = line.split('=');
        const e = eng.trim(), i = rest.join('=').trim();
        if (e && i && !seen.has(e.toLowerCase())) {
            seen.add(e.toLowerCase());
            list.push(`${e} = ${i}`);
        }
    });
    let seed = 202609;
    for (let i = list.length - 1; i > 0; i--) {
        seed = (seed * 9301 + 49297) % 233280;
        const j = Math.floor((seed / 233280) * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function getWordsPerDaySetting() {
    return parseInt(window.HES.materials['master_wordbank_per_day']) || 5;
}

function getSessionVocabText(monthId, week, day) {
    const manual = window.HES.materials[`vocab-${monthId}-w${week}-d${day}`];
    if (manual && manual.trim() !== '') return manual;
    const bank = getCleanMasterWordbankArray();
    const perDay = getWordsPerDaySetting();
    let mIdx = window.HES.months.findIndex(m => m.id === monthId);
    if (mIdx === -1) mIdx = (parseInt(String(monthId).replace('m', '')) || 1) - 1;
    const start = ((mIdx * 12) + ((parseInt(week) - 1) * 3) + (parseInt(day) - 1)) * perDay;
    return bank.slice(start, start + perDay).join('\n');
}

// HELPER TANGGAL & JADWAL
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const shortDayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const formatDateForID = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDateStr = s => { const p = s.split('-'); return new Date(p[0], p[1] - 1, p[2]); };
const getDisplayDate = d => `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
const getShortDayDate = d => `${shortDayNames[d.getDay()]}, ${d.getDate()} ${shortMonthNames[d.getMonth()]}`;
const formatDateRangeShort = (s, e) => (!s || !e) ? '' : (s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${shortMonthNames[s.getMonth()]}` : `${s.getDate()} ${shortMonthNames[s.getMonth()]} – ${e.getDate()} ${shortMonthNames[e.getMonth()]}`);

function isOccupied(email, targetDateStr, ignoreValidUntil = false) {
    const p = window.HES.materials[`profile-${email}`];
    if (!p || !p.time || !p.days) return false;
    const targetDate = parseDateStr(targetDateStr);
    if (!ignoreValidUntil && p.validUntil && p.validUntil !== 'Belum diatur') {
        const v = parseDateStr(p.validUntil);
        if (!isNaN(v)) { v.setHours(23, 59, 59, 999); if (targetDate > v) return false; }
    }
    const res = p.reschedules || {}, pend = p.pendingReschedules || {};
    return (p.days.includes(dayNames[targetDate.getDay()]) && !res[targetDateStr]) || Object.values(res).includes(targetDateStr) || Object.values(pend).includes(targetDateStr);
}

function checkOverlap(t1, t2) {
    if (!t1 || !t2 || !t1.includes('-') || !t2.includes('-')) return false;
    const [s1, e1] = t1.split('-').map(t => parseInt(t.trim().replace(':', '')));
    const [s2, e2] = t2.split('-').map(t => parseInt(t.trim().replace(':', '')));
    return (s1 < e2) && (s2 < e1);
}

function collect12Sessions(email, refDateObj, step) {
    let cursor = new Date(refDateObj), result = [], safety = 0;
    cursor.setHours(0, 0, 0, 0);
    if (step > 0) cursor.setDate(cursor.getDate() + 1);
    while (result.length < 12 && safety < 400) {
        if (isOccupied(email, formatDateForID(cursor), true)) {
            step > 0 ? result.push(new Date(cursor)) : result.unshift(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + step);
        safety++;
    }
    return result;
}

function getStudentCurriculumTimeline(email) {
    const p = window.HES.materials[`profile-${email}`];
    if (!p || !p.days || p.days.length === 0) return null;

    const monthEndDates = Object.assign({}, p.monthEndDates || {});
    const maxM = String(p.maxMonth || '1');
    if (p.validUntil && p.validUntil !== 'Belum diatur' && !monthEndDates[`m${maxM}`]) {
        monthEndDates[`m${maxM}`] = p.validUntil;
    }

    const totalMonths = window.HES.months.length;
    const monthSessions = new Array(totalMonths);

    for (let i = 0; i < totalMonths; i++) {
        const mId = window.HES.months[i].id;
        if (monthEndDates[mId]) monthSessions[i] = collect12Sessions(email, parseDateStr(monthEndDates[mId]), -1);
    }
    for (let i = totalMonths - 2; i >= 0; i--) {
        if (!monthSessions[i] && monthSessions[i + 1]?.length) {
            const prevEnd = new Date(monthSessions[i + 1][0]);
            prevEnd.setDate(prevEnd.getDate() - 1);
            monthSessions[i] = collect12Sessions(email, prevEnd, -1);
        }
    }
    if (!monthSessions[0]) {
        const now = new Date(), day = now.getDay();
        monthSessions[0] = collect12Sessions(email, new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + (day === 0 ? -6 : 1) - 1), 1);
    }
    for (let i = 1; i < totalMonths; i++) {
        if (!monthSessions[i] && monthSessions[i - 1]?.length) {
            monthSessions[i] = collect12Sessions(email, monthSessions[i - 1][monthSessions[i - 1].length - 1], 1);
        }
    }

    const sessionDates = [];
    for (let i = 0; i < totalMonths; i++) {
        for (let k = 0; k < 12; k++) sessionDates.push(monthSessions[i]?.[k] || null);
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = formatDateForID(today);
    const firstUp = sessionDates.findIndex(d => d && d >= today);

    let currentIdx = sessionDates.length - 1, nextIdx = -1, isTodayClass = false;
    if (firstUp !== -1) {
        if (formatDateForID(sessionDates[firstUp]) === todayStr) {
            currentIdx = firstUp; nextIdx = firstUp + 1 < sessionDates.length ? firstUp + 1 : -1; isTodayClass = true;
        } else if (firstUp > 0 && Math.floor((firstUp - 1) / 12) === Math.floor(firstUp / 12)) {
            currentIdx = firstUp - 1; nextIdx = firstUp;
        } else {
            currentIdx = firstUp; nextIdx = firstUp + 1 < sessionDates.length ? firstUp + 1 : -1;
        }
    }

    const timeline = { days: {}, weeks: {}, months: {}, currentPointer: null, nextPointer: null, isTodayClass };
    let gIdx = 0;

    window.HES.months.forEach((m, mIdx) => {
        let mDates = [], mCur = false, mNxt = false;
        m.weeks.forEach(w => {
            let wDates = [], wCur = false, wNxt = false;
            [1, 2, 3].forEach(d => {
                const dateObj = sessionDates[gIdx];
                let status = gIdx === currentIdx ? 'current' : (gIdx === nextIdx ? 'next' : (gIdx < currentIdx ? 'completed' : 'upcoming'));
                const ptr = {
                    monthId: m.id, monthTitle: m.title, week: w, day: d, dateObj,
                    dateStr: dateObj ? formatDateForID(dateObj) : '',
                    displayDate: dateObj ? getDisplayDate(dateObj) : '',
                    shortDate: dateObj ? getShortDayDate(dateObj) : '', isTodayClass
                };
                if (status === 'current') { wCur = mCur = true; timeline.currentPointer = ptr; }
                if (status === 'next') { wNxt = mNxt = true; timeline.nextPointer = ptr; }
                if (dateObj) { wDates.push(dateObj); mDates.push(dateObj); }
                timeline.days[`${m.id}-w${w}-d${d}`] = { ...ptr, fullDate: ptr.displayDate, status };
                gIdx++;
            });
            const allWeekDone = ((mIdx * 12) + ((w - 1) * 3) + 2 < currentIdx) || (wDates.length && wDates[wDates.length - 1] < today);
            timeline.weeks[`${m.id}-w${w}`] = { rangeText: wDates.length ? formatDateRangeShort(wDates[0], wDates[wDates.length - 1]) : '', status: wCur ? 'current' : (wNxt ? 'next' : (allWeekDone ? 'completed' : 'upcoming')) };
        });
        const expEnd = monthEndDates[m.id] ? parseDateStr(monthEndDates[m.id]) : null;
        if (expEnd) expEnd.setHours(23, 59, 59, 999);
        const allMonthDone = ((mIdx * 12) + 11 < currentIdx) || (expEnd ? today > expEnd : (mDates.length && mDates[mDates.length - 1] < today));
        timeline.months[m.id] = { rangeText: mDates.length ? formatDateRangeShort(mDates[0], mDates[mDates.length - 1]) : '', endDateStr: monthEndDates[m.id] || '', status: allMonthDone ? 'completed' : (mCur ? 'current' : (mNxt ? 'next' : 'upcoming')) };
    });
    return timeline;
}

// GAMIFIKASI & LEVEL MURID
function getStudentGamificationStats(email) {
    const p = window.HES.materials[`profile-${email}`] || {};
    const maxMonthNum = parseInt(p.maxMonth || '1');
    const timeline = getStudentCurriculumTimeline(email);

    let totalCompletedSessions = 0, activeMonthCompleted = 0;
    const activeMonthId = timeline?.currentPointer?.monthId || `m${maxMonthNum}`;
    const activeMonthTitle = timeline?.currentPointer?.monthTitle || `Month ${maxMonthNum}`;

    Object.values(timeline?.days || {}).forEach(d => {
        if (parseInt(d.monthId.replace('m', '')) <= maxMonthNum && d.status === 'completed') {
            totalCompletedSessions++;
            if (d.monthId === activeMonthId) activeMonthCompleted++;
        }
    });

    let masteredWordsCount = 0, approvedSetsCount = 0, submittedSetsCount = 0;
    window.HES.months.forEach(m => m.weeks.forEach(w => [1, 2, 3].forEach(d => {
        const st = window.HES.materials[`vocab_status-${email}-${m.id}-w${w}-d${d}`]?.status;
        if (st === 'approved' || st === 'submitted') {
            const count = getSessionVocabText(m.id, w, d).split('\n').filter(l => l.includes('=')).length || getWordsPerDaySetting();
            masteredWordsCount += count;
            st === 'approved' ? approvedSetsCount++ : submittedSetsCount++;
        }
    })));

    let examsCompleted = 0, totalExamScoreSum = 0, examBonusXP = 0;
    window.HES.months.forEach(m => {
        const res = window.HES.materials[`exam_result-${email}-${m.id}`];
        if (res?.sectionScores && (res.submittedTabs?.length || res.isGraded)) {
            examsCompleted++;
            const sc = res.sectionScores;
            const avg = Math.round(((sc.reading || 0) + (sc.writing || 0) + (sc.speaking || 0) + (sc.listening || 0)) / 4);
            totalExamScoreSum += avg;
            examBonusXP += 100 + (res.isGraded ? avg : 0);
        }
    });

    const xp = (totalCompletedSessions * 25) + (approvedSetsCount * 25) + (submittedSetsCount * 10) + examBonusXP;
    const tiers = [
        [1, 'Starter Explorer', 0, 250, 'from-indigo-500 to-blue-600', 'fa-seedling'],
        [2, 'Novice Learner', 250, 600, 'from-sky-500 to-indigo-600', 'fa-book-open-reader'],
        [3, 'Rising Communicator', 600, 1100, 'from-teal-500 to-emerald-600', 'fa-feather-pointed'],
        [4, 'Active Speaker', 1100, 1700, 'from-emerald-500 to-green-600', 'fa-comments'],
        [5, 'Confident Speaker', 1700, 2400, 'from-indigo-600 to-violet-600', 'fa-microphone-lines'],
        [6, 'Skilled Articulator', 2400, 3200, 'from-violet-600 to-purple-700', 'fa-bolt'],
        [7, 'Fluent Achiever', 3200, 4100, 'from-fuchsia-600 to-pink-600', 'fa-award'],
        [8, 'Advanced Orator', 4100, 5100, 'from-amber-500 to-orange-600', 'fa-fire'],
        [9, 'Master Scholar', 5100, 6500, 'from-rose-500 to-red-600', 'fa-medal'],
        [10, 'Grandmaster Legend', 6500, 8500, 'from-amber-500 via-rose-500 to-indigo-700', 'fa-crown']
    ];
    let cur = tiers[0];
    tiers.forEach(t => { if (xp >= t[2]) cur = t; });

    return {
        xp, level: cur[0], maxLevel: 10, isMaxLevel: cur[0] === 10,
        levelTitle: cur[1], minXP: cur[2], nextXP: cur[3], levelGradient: cur[4], levelIcon: cur[5],
        xpProgressPercent: cur[0] === 10 ? 100 : Math.min(100, Math.max(5, Math.round(((xp - cur[2]) / (cur[3] - cur[2])) * 100))),
        totalCompletedSessions, activeMonthId, activeMonthTitle, activeMonthCompleted,
        activeMonthPercent: Math.min(100, Math.round((activeMonthCompleted / 12) * 100)),
        masteredWordsCount, approvedSetsCount, submittedSetsCount,
        examsCompleted, avgExamScore: examsCompleted > 0 ? Math.round(totalExamScoreSum / examsCompleted) : 0
    };
}

function getStudentNextSessionInfo(email) {
    const p = window.HES.materials[`profile-${email}`];
    if (!p || !p.days || p.days.length === 0) return { error: 'Jadwal kelas belum diatur oleh Admin.' };
    const maxM = String(p.maxMonth || '1');
    const activeValid = p.monthEndDates?.[`m${maxM}`] || p.validUntil;
    if (!activeValid || activeValid === 'Belum diatur') return { error: 'Masa aktif kelas belum diatur.' };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const validDate = parseDateStr(activeValid);
    const isValid = !isNaN(validDate);
    if (isValid) validDate.setHours(23, 59, 59, 999);
    if (isValid && today > validDate) return { expired: true, validDateStr: getDisplayDate(validDate) };

    for (let i = 0; i < 30; i++) {
        const curr = new Date(today); curr.setDate(today.getDate() + i);
        if (isValid && curr > validDate) break;
        const currStr = formatDateForID(curr);
        if (isOccupied(email, currStr)) {
            return { dateStr: currStr, displayDate: getDisplayDate(curr), time: p.time, validDateStr: getDisplayDate(validDate) };
        }
    }
    return { error: 'Tidak ada jadwal terdekat dalam 30 hari ke depan.' };
}

function parseDriveLink(link) {
    if (!link) return '';
    const m = link.match(/\/d\/(.+?)\//);
    return (link.includes('drive.google.com/file/d/') && m?.[1]) ? `https://drive.google.com/file/d/${m[1]}/preview` : link;
}

function getDriveDirectStreamLink(url) {
    if (!url) return '';
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return m?.[1] ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}

// PERHITUNGAN SKOR UJIAN TERPADU (DIPAKAI OLEH ADMIN & MURID)
function computeExamSectionScore(cat, examData, examResult) {
    const list = examData?.[cat] || [];
    if (!list.length) return 0;
    let totalPoints = 0;
    const maxPerQ = 100 / list.length;

    list.forEach((q, idx) => {
        const key = `${cat}_${idx}`;
        const ans = examResult?.answers?.[key];
        const manualPoint = examResult?.scores?.[key];

        if (q.type === 'mcq') {
            if (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) {
                totalPoints += maxPerQ;
            }
        } else if (manualPoint !== undefined && manualPoint !== null && manualPoint !== '') {
            const num = parseFloat(manualPoint) || 0;
            totalPoints += (num <= 10 ? (num / 10) * maxPerQ : (num / 100) * maxPerQ);
        } else if (ans && String(ans).trim() !== '') {
            if (cat === 'speaking' && String(ans).startsWith('data:audio')) {
                totalPoints += maxPerQ * 0.85;
            } else {
                const target = String(q.answer || '').trim().toLowerCase();
                const studentStr = String(ans).trim().toLowerCase();
                if (target && studentStr === target) totalPoints += maxPerQ;
                else if (target) {
                    const kws = target.split(/[,/|\s]+/).filter(w => w.length > 2);
                    if (kws.length > 0) {
                        const matched = kws.filter(kw => studentStr.includes(kw)).length;
                        totalPoints += maxPerQ * Math.min(1, Math.max(0.5, matched / kws.length));
                    } else totalPoints += maxPerQ * 0.8;
                } else totalPoints += maxPerQ * 0.85;
            }
        }
    });
    return Math.min(100, Math.round(totalPoints));
}

function showToast(message, type = 'success') {
    let box = document.getElementById('toast-container');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-container';
        box.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none';
        document.body.appendChild(box);
    }
    const styles = {
        success: ['bg-slate-900 text-white border-slate-800', 'fa-check-circle text-emerald-400'],
        error:   ['bg-red-600 text-white border-red-700', 'fa-exclamation-circle text-white'],
        info:    ['bg-indigo-600 text-white border-indigo-700', 'fa-info-circle text-indigo-200']
    }[type] || ['bg-slate-900 text-white', 'fa-check-circle text-emerald-400'];

    const t = document.createElement('div');
    t.className = `pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border text-sm font-semibold fade-in ${styles[0]}`;
    t.innerHTML = `<i class="fas ${styles[1]} text-base"></i><span class="flex-1">${message}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 3200); }, 3200);
}