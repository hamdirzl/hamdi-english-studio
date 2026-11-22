// js/config.js

const SUPABASE_URL = "https://vpmnsuhyflzlhfnkvuko.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbW5zdWh5Zmx6bGhmbmt2dWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDg5MjAsImV4cCI6MjEwNTYyNDkyMH0.ou6N7Wvfaibicuk4io-ptlJp87-MLwkpfRcHRbuVqXA";
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_BOT_TOKEN = "8783483454:AAFIMaNa4Z5-uUMXHOeqHZgkk2S9EK4gC0Y";
const TELEGRAM_CHAT_ID = "1225652735";

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
        syncing: ['bg-amber-50 text-amber-700 border-amber-200', '<i class="fas fa-sync fa-spin"></i> <span>Sinkronisasi...</span>'],
        online:  ['bg-teal-50 text-teal-700 border-teal-200', '<span class="w-2 h-2 rounded-full bg-teal-500"></span> <span>Tersambung</span>'],
        offline: ['bg-rose-50 text-rose-600 border-rose-200', '<i class="fas fa-wifi"></i> <span>Mode Offline</span>']
    }[status];
    badge.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${cfg[0]}`;
    badge.innerHTML = cfg[1];
}

// ============================================================================
// MESIN SUARA 100% CLOUD NEURAL AMERICAN ENGLISH (en-US)
// ============================================================================
let _ttsSessionId = 0;
let _sharedAudioEl = null;
let _activeTTSBtn = null;

function getSharedTTSAudio() {
    if (!_sharedAudioEl) {
        _sharedAudioEl = new Audio();
        _sharedAudioEl.referrerPolicy = 'no-referrer';
        _sharedAudioEl.preload = 'auto';
    }
    return _sharedAudioEl;
}

function resetActiveTTSButton() {
    if (_activeTTSBtn) {
        try {
            _activeTTSBtn.dataset.playing = '0';
            _activeTTSBtn.classList.remove('speaking-pulse');
            if (_activeTTSBtn.dataset.origHtml !== undefined) _activeTTSBtn.innerHTML = _activeTTSBtn.dataset.origHtml;
        } catch (e) {}
        _activeTTSBtn = null;
    }
    document.querySelectorAll('.speaking-pulse').forEach(el => {
        el.classList.remove('speaking-pulse');
        el.dataset.playing = '0';
        if (el.dataset.origHtml !== undefined) el.innerHTML = el.dataset.origHtml;
    });
}

function setButtonPlayingIconOnly(btnEl) {
    if (!btnEl) return;
    const hasLabelText = btnEl.textContent && btnEl.textContent.trim().length > 0;
    if (!hasLabelText) {
        btnEl.innerHTML = `<i class="fas fa-stop text-xs"></i>`;
    } else {
        const temp = document.createElement('div');
        temp.innerHTML = btnEl.dataset.origHtml || btnEl.innerHTML;
        const icon = temp.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-stop mr-1.5';
            btnEl.innerHTML = temp.innerHTML;
        } else {
            btnEl.innerHTML = `<i class="fas fa-stop"></i>`;
        }
    }
}

function splitIntoChunks(text, maxLen = 165) {
    const safe = String(text || '').replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\.\s+/gi, '$1__DOT__ ');
    const sentences = safe.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [safe];
    const chunks = [];
    sentences.forEach(raw => {
        const s = raw.replace(/__DOT__/g, '.').trim();
        if (!s) return;
        if (s.length <= maxLen) chunks.push(s);
        else {
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
            if (/^(man|male|boy|mr|father|dad|waiter|husband|son|brother|uncle|kevin|david|raka|budi|andi|john|tom|alex|speaker a|a)\b/.test(speaker)) gender = 'male';
            else if (/^(woman|female|girl|mrs|ms|miss|mother|mom|waitress|wife|daughter|sister|aunt|sarah|dina|nadia|sinta|rina|dinda|lisa|anna|speaker b|b)\b/.test(speaker)) gender = 'female';
            else gender = lastGender === 'male' ? 'female' : 'male';
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
        const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=en-US&dt=t&q=${encodeURIComponent(text)}`;
        const audio = getSharedTTSAudio();
        let done = false;
        let safetyTimer = null;

        const applyVoiceProfile = () => {
            const isMale = gender === 'male';
            if ('preservesPitch' in audio) audio.preservesPitch = !isMale;
            if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = !isMale;
            if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = !isMale;
            const rate = isMale ? 0.82 : 1.0;
            audio.defaultPlaybackRate = rate;
            audio.playbackRate = rate;
        };

        const cleanupAndResolve = () => {
            if (done) return;
            done = true;
            if (safetyTimer) clearTimeout(safetyTimer);
            audio.onloadedmetadata = audio.oncanplay = audio.onplay = audio.onended = audio.onerror = null;
            resolve();
        };

        safetyTimer = setTimeout(cleanupAndResolve, 16000);
        audio.onloadedmetadata = audio.oncanplay = audio.onplay = applyVoiceProfile;
        audio.onended = audio.onerror = cleanupAndResolve;
        audio.src = url;
        applyVoiceProfile();

        const playPromise = audio.play();
        if (playPromise !== undefined) playPromise.catch(cleanupAndResolve);
    });
}

window.stopNaturalEnglishTTS = function() {
    _ttsSessionId++;
    resetActiveTTSButton();
    if (_sharedAudioEl) {
        try {
            _sharedAudioEl.onloadedmetadata = _sharedAudioEl.oncanplay = _sharedAudioEl.onplay = _sharedAudioEl.onended = _sharedAudioEl.onerror = null;
            _sharedAudioEl.pause();
            _sharedAudioEl.removeAttribute('src');
        } catch (e) {}
    }
    if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
};

window.playNaturalEnglishTTS = async function(text, btnEl = null, lockWhilePlaying = false) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return showToast('Tulis naskah audio terlebih dahulu.', 'error');

    if (btnEl && btnEl.dataset.playing === '1') {
        if (lockWhilePlaying) return;
        window.stopNaturalEnglishTTS();
        return;
    }

    window.stopNaturalEnglishTTS();
    const session = ++_ttsSessionId;
    const segments = parseDialogueSegments(cleanText);
    if (!segments.length) return;

    if (btnEl) {
        if (btnEl.dataset.origHtml === undefined) btnEl.dataset.origHtml = btnEl.innerHTML;
        btnEl.dataset.playing = '1';
        btnEl.classList.add('speaking-pulse');
        _activeTTSBtn = btnEl;
        if (!lockWhilePlaying) setButtonPlayingIconOnly(btnEl);
        else btnEl.innerHTML = `<i class="fas fa-volume-up mr-1.5"></i> Sedang Memutar...`;
    }

    try {
        for (let i = 0; i < segments.length; i++) {
            if (session !== _ttsSessionId) break;
            await playCloudUSNeuralSegment(segments[i].text, segments[i].gender, session);
            if (session !== _ttsSessionId) break;
            if (i < segments.length - 1) await new Promise(r => setTimeout(r, 180));
        }
    } finally {
        if (session === _ttsSessionId) resetActiveTTSButton();
    }
};

// ============================================================================
// HELPER TANGGAL & JADWAL MANUAL PER PERTEMUAN (+ AUTO-LOCK & BULAN LALU TERBUKA)
// ============================================================================
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const shortDayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const formatDateForID = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDateStr = s => { const p = String(s || '').split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); };
const getDisplayDate = d => `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
const getShortDayDate = d => `${shortDayNames[d.getDay()]}, ${d.getDate()} ${shortMonthNames[d.getMonth()]}`;

function getTodayStr() {
    return formatDateForID(new Date());
}

function getOffsetDateStr(daysOffset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return formatDateForID(d);
}

function getSessionDateStr(email, monthId, week, day) {
    const p = window.HES.materials[`profile-${email}`] || {};
    return p.sessionDates?.[`${monthId}-w${week}-d${day}`] || '';
}

function isPastMonthForStudent(profile, monthId, todayStr = getTodayStr()) {
    const p = profile || {};
    const maxM = parseInt(p.maxMonth || 1);
    const mNum = parseInt(String(monthId).replace('m', '')) || 1;
    if (mNum < maxM) return true;
    const oldEnd = p.monthEndDates?.[monthId];
    if (oldEnd && oldEnd < todayStr) return true;
    return false;
}

// Menentukan apakah materi sesi terbuka untuk murid (Admin selalu terbuka)
function getSessionAccessStatus(email, monthId, week, day, role = window.HES.userRole) {
    const dateStr = getSessionDateStr(email, monthId, week, day);
    const todayStr = getTodayStr();
    const dateObj = dateStr ? parseDateStr(dateStr) : null;
    const displayDate = dateObj && !isNaN(dateObj) ? getDisplayDate(dateObj) : '';
    const shortDate = dateObj && !isNaN(dateObj) ? getShortDayDate(dateObj) : '';

    if (role === 'admin') {
        return { unlocked: true, status: dateStr ? (dateStr === todayStr ? 'current' : (dateStr < todayStr ? 'completed' : 'scheduled')) : 'unscheduled', dateStr, displayDate, shortDate };
    }

    const p = window.HES.materials[`profile-${email}`] || {};
    const maxM = parseInt(p.maxMonth || 1);
    const mNum = parseInt(String(monthId).replace('m', '')) || 1;
    if (mNum > maxM) {
        return { unlocked: false, reason: 'month_locked', status: 'locked', dateStr: '', displayDate: '', shortDate: '' };
    }

    // Bulan yang sudah berlalu otomatis tetap terbuka untuk review murid
    if (isPastMonthForStudent(p, monthId, todayStr)) {
        return {
            unlocked: true,
            reason: 'past_month',
            status: dateStr === todayStr ? 'current' : 'completed',
            dateStr,
            displayDate: displayDate || 'Bulan Selesai',
            shortDate: shortDate || 'Selesai'
        };
    }

    if (!dateStr) {
        return { unlocked: false, reason: 'unscheduled', status: 'unscheduled', dateStr: '', displayDate: '', shortDate: '' };
    }

    if (dateStr > todayStr) {
        return { unlocked: false, reason: 'future', status: 'scheduled', dateStr, displayDate, shortDate };
    }

    if (dateStr === todayStr) {
        return { unlocked: true, reason: 'today', status: 'current', dateStr, displayDate, shortDate };
    }

    return { unlocked: true, reason: 'past', status: 'completed', dateStr, displayDate, shortDate };
}

function getStudentCurriculumTimeline(email) {
    const p = window.HES.materials[`profile-${email}`] || {};
    const sessionDates = p.sessionDates || {};
    const todayStr = getTodayStr();

    const timeline = { days: {}, currentPointer: null, nextPointer: null, isTodayClass: false };
    let todayMatch = null;
    let latestPast = null;
    let latestPastMonthFallback = null;
    let nearestFuture = null;

    window.HES.months.forEach(m => {
        const pastMonth = isPastMonthForStudent(p, m.id, todayStr);
        m.weeks.forEach(w => {
            [1, 2, 3].forEach(d => {
                const key = `${m.id}-w${w}-d${d}`;
                const dateStr = sessionDates[key] || '';
                const dateObj = dateStr ? parseDateStr(dateStr) : null;
                let status = 'unscheduled';

                if (dateStr) {
                    if (dateStr === todayStr) status = 'current';
                    else if (dateStr < todayStr) status = 'completed';
                    else status = 'scheduled';
                } else if (pastMonth) {
                    status = 'completed';
                }

                const ptr = {
                    monthId: m.id, monthTitle: m.title, week: w, day: d,
                    sessionNum: ((w - 1) * 3) + d,
                    dateObj, dateStr,
                    displayDate: (dateObj && !isNaN(dateObj)) ? getDisplayDate(dateObj) : (pastMonth ? 'Bulan Selesai' : ''),
                    shortDate: (dateObj && !isNaN(dateObj)) ? getShortDayDate(dateObj) : (pastMonth ? 'Selesai' : ''),
                    status,
                    unlocked: Boolean((dateStr && dateStr <= todayStr) || pastMonth),
                    isTodayClass: dateStr === todayStr
                };

                timeline.days[key] = ptr;

                if (dateStr === todayStr && !todayMatch) todayMatch = ptr;
                else if (dateStr && dateStr < todayStr) {
                    if (!latestPast || dateStr >= latestPast.dateStr) latestPast = ptr;
                } else if (dateStr && dateStr > todayStr) {
                    if (!nearestFuture || dateStr < nearestFuture.dateStr) nearestFuture = ptr;
                } else if (pastMonth) {
                    latestPastMonthFallback = ptr;
                }
            });
        });
    });

    if (todayMatch) {
        timeline.currentPointer = todayMatch;
        timeline.isTodayClass = true;
        timeline.nextPointer = nearestFuture;
    } else {
        timeline.currentPointer = latestPast || latestPastMonthFallback || null;
        timeline.nextPointer = nearestFuture;
    }

    return timeline;
}

function getStudentNextSessionInfo(email) {
    const p = window.HES.materials[`profile-${email}`] || {};
    const timeline = getStudentCurriculumTimeline(email);
    const active = timeline.isTodayClass ? timeline.currentPointer : timeline.nextPointer;
    if (!active) return { none: true, time: p.time || '' };
    return {
        ...active,
        time: p.time || ''
    };
}

// ============================================================================
// HELPER TUGAS SPEAKING / CONVERSATION
// ============================================================================
function getAllSpeakingTasks() {
    const raw = window.HES.materials['speaking_tasks'];
    return Array.isArray(raw) ? raw : [];
}

function getTasksForStudent(email) {
    return getAllSpeakingTasks().filter(t => !t.target || t.target === 'all' || t.target === email);
}

function getTaskSubmission(email, taskId) {
    return window.HES.materials[`task_sub-${email}-${taskId}`] || null;
}

// ============================================================================
// GAMIFIKASI & LEVEL MURID (BERBASIS SESI SELESAI, TUGAS SPEAKING, & UJIAN)
// ============================================================================
function getStudentGamificationStats(email) {
    const p = window.HES.materials[`profile-${email}`] || {};
    const maxMonthNum = parseInt(p.maxMonth || '1');
    const timeline = getStudentCurriculumTimeline(email);

    let totalCompletedSessions = 0;
    let activeMonthCompleted = 0;
    const activeMonthId = timeline.currentPointer?.monthId || timeline.nextPointer?.monthId || `m${maxMonthNum}`;
    const activeMonthTitle = (window.HES.months.find(m => m.id === activeMonthId)?.title) || `Month ${maxMonthNum}`;

    Object.values(timeline.days).forEach(d => {
        if (d.status === 'completed' || d.status === 'current') {
            totalCompletedSessions++;
            if (d.monthId === activeMonthId) activeMonthCompleted++;
        }
    });

    const myTasks = getTasksForStudent(email);
    let completedTasksCount = 0;
    let pendingTasksCount = 0;
    let taskXP = 0;

    myTasks.forEach(t => {
        const sub = getTaskSubmission(email, t.id);
        if (sub && sub.audioData) {
            completedTasksCount++;
            taskXP += sub.status === 'graded' ? 40 : 20;
        } else {
            pendingTasksCount++;
        }
    });

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

    const xp = (totalCompletedSessions * 30) + taskXP + examBonusXP;
    const tiers = [
        [1, 'Starter Explorer', 0, 250],
        [2, 'Novice Learner', 250, 600],
        [3, 'Rising Communicator', 600, 1100],
        [4, 'Active Speaker', 1100, 1700],
        [5, 'Confident Speaker', 1700, 2400],
        [6, 'Skilled Articulator', 2400, 3200],
        [7, 'Fluent Achiever', 3200, 4100],
        [8, 'Advanced Orator', 4100, 5100],
        [9, 'Master Scholar', 5100, 6500],
        [10, 'Grandmaster Legend', 6500, 8500]
    ];
    let cur = tiers[0];
    tiers.forEach(t => { if (xp >= t[2]) cur = t; });

    return {
        xp, level: cur[0], levelTitle: cur[1],
        totalCompletedSessions, activeMonthId, activeMonthTitle, activeMonthCompleted,
        activeMonthPercent: Math.min(100, Math.round((activeMonthCompleted / 12) * 100)),
        totalTasksCount: myTasks.length,
        completedTasksCount,
        pendingTasksCount,
        examsCompleted,
        avgExamScore: examsCompleted > 0 ? Math.round(totalExamScoreSum / examsCompleted) : 0
    };
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
            if (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) totalPoints += maxPerQ;
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
        success: ['bg-stone-900 text-white border-stone-800', 'fa-check-circle text-teal-400'],
        error:   ['bg-rose-600 text-white border-rose-700', 'fa-exclamation-circle text-white'],
        info:    ['bg-teal-700 text-white border-teal-800', 'fa-info-circle text-amber-300']
    }[type] || ['bg-stone-900 text-white', 'fa-check-circle text-teal-400'];

    const t = document.createElement('div');
    t.className = `pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border text-sm font-bold fade-in ${styles[0]}`;
    t.innerHTML = `<i class="fas ${styles[1]} text-base"></i><span class="flex-1">${message}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}