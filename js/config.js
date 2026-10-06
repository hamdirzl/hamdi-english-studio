// js/config.js

// ==========================================
// 1. KONFIGURASI SUPABASE & TELEGRAM
// ==========================================
const SUPABASE_URL = "https://vpmnsuhyflzlhfnkvuko.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbW5zdWh5Zmx6bGhmbmt2dWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDg5MjAsImV4cCI6MjEwNTYyNDkyMH0.ou6N7Wvfaibicuk4io-ptlJp87-MLwkpfRcHRbuVqXA";

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TELEGRAM_BOT_TOKEN = "8783483454:AAFIMaNa4Z5-uUMXHOeqHZgkk2S9EK4gC0Y";
const TELEGRAM_CHAT_ID = "1225652735";

function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        })
    }).catch(e => console.error("Gagal kirim Telegram:", e));
}

// ==========================================
// 2. STATE GLOBAL & CACHE LOKAL
// ==========================================
window.HES = {
    currentUser: null,
    userRole: null,
    months: [
        { id: 'm1', title: 'Month 1', weeks: [1, 2, 3, 4] },
        { id: 'm2', title: 'Month 2', weeks: [1, 2, 3, 4] }
    ],
    materials: {},
    students: [
        { email: 'murid@gmail.com', password: '123', name: 'Murid Pertama' }
    ]
};

(function loadLocalCache() {
    try {
        const cachedMonths = localStorage.getItem('hes_cache_months');
        const cachedMaterials = localStorage.getItem('hes_cache_materials');
        const cachedStudents = localStorage.getItem('hes_cache_students');
        if (cachedMonths) window.HES.months = JSON.parse(cachedMonths);
        if (cachedMaterials) window.HES.materials = JSON.parse(cachedMaterials);
        if (cachedStudents) window.HES.students = JSON.parse(cachedStudents);
    } catch (e) {
        console.warn("Gagal memuat cache lokal:", e);
    }
})();

// ==========================================
// 3. MANAJEMEN SESI & AUTENTIKASI
// ==========================================
function getSession() {
    const savedUser = localStorage.getItem('hes_session_user');
    const savedRole = localStorage.getItem('hes_session_role');
    if (savedUser && savedRole) {
        window.HES.currentUser = JSON.parse(savedUser);
        window.HES.userRole = savedRole;
        return { user: window.HES.currentUser, role: window.HES.userRole };
    }
    return null;
}

function requireAuth(allowedRole = null) {
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    if (allowedRole && session.role !== allowedRole) {
        window.location.href = 'dashboard.html';
        return null;
    }
    return session;
}

function logoutUser() {
    localStorage.removeItem('hes_session_user');
    localStorage.removeItem('hes_session_role');
    window.location.href = 'index.html';
}

// ==========================================
// 4. SINKRONISASI CLOUD SUPABASE
// ==========================================
async function syncFromCloud() {
    updateCloudStatusUI('syncing');
    try {
        const { data, error } = await window.supabaseClient.from('app_data').select('*');
        if (error) throw error;
        if (data) {
            const mData = data.find(d => d.key === 'hes_months');
            const matData = data.find(d => d.key === 'hes_materials');
            const stuData = data.find(d => d.key === 'hes_students');

            if (mData && mData.value) {
                window.HES.months = mData.value;
                localStorage.setItem('hes_cache_months', JSON.stringify(mData.value));
            }
            if (matData && matData.value) {
                window.HES.materials = matData.value;
                localStorage.setItem('hes_cache_materials', JSON.stringify(matData.value));
            }
            if (stuData && stuData.value) {
                window.HES.students = stuData.value;
                localStorage.setItem('hes_cache_students', JSON.stringify(stuData.value));
            }
        }
        updateCloudStatusUI('online');
        return true;
    } catch (e) {
        console.error("Koneksi cloud bermasalah:", e);
        updateCloudStatusUI('offline');
        return false;
    }
}

async function saveToCloud(key, value) {
    updateCloudStatusUI('syncing');
    if (key === 'hes_months') {
        window.HES.months = value;
        localStorage.setItem('hes_cache_months', JSON.stringify(value));
    } else if (key === 'hes_materials') {
        window.HES.materials = value;
        localStorage.setItem('hes_cache_materials', JSON.stringify(value));
    } else if (key === 'hes_students') {
        window.HES.students = value;
        localStorage.setItem('hes_cache_students', JSON.stringify(value));
    }

    const { error } = await window.supabaseClient.from('app_data').upsert([{ key, value }]);
    if (error) {
        updateCloudStatusUI('offline');
        return { error };
    }
    updateCloudStatusUI('online');
    return { error: null };
}

function updateCloudStatusUI(status) {
    const badge = document.getElementById('cloud-status-indicator');
    if (!badge) return;
    if (status === 'syncing') {
        badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200";
        badge.innerHTML = `<i class="fas fa-sync fa-spin text-[10px]"></i> <span>Menyinkronkan...</span>`;
    } else if (status === 'online') {
        badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200";
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span>Cloud Terhubung</span>`;
    } else {
        badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200";
        badge.innerHTML = `<i class="fas fa-exclamation-triangle text-[10px]"></i> <span>Mode Offline</span>`;
    }
}

// ==========================================
// 5. HELPER TANGGAL, JADWAL & TIMELINE TRACKER
// ==========================================
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const shortDayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDateForID(dateObj) {
    return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
}

function parseDateStr(str) {
    let parts = str.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getDisplayDate(dateObj) {
    return `${dayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function getShortDayDate(dateObj) {
    return `${shortDayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${shortMonthNames[dateObj.getMonth()]}`;
}

function formatDateRangeShort(startObj, endObj) {
    if (!startObj || !endObj) return '';
    if (startObj.getMonth() === endObj.getMonth()) {
        return `${startObj.getDate()}–${endObj.getDate()} ${shortMonthNames[startObj.getMonth()]}`;
    }
    return `${startObj.getDate()} ${shortMonthNames[startObj.getMonth()]} – ${endObj.getDate()} ${shortMonthNames[endObj.getMonth()]}`;
}

function isOccupied(email, targetDateStr, ignoreValidUntil = false) {
    let p = window.HES.materials[`profile-${email}`];
    if (!p || !p.time || !p.days) return false;
    let targetDate = parseDateStr(targetDateStr);
    let dayName = dayNames[targetDate.getDay()];
    if (!ignoreValidUntil && p.validUntil && p.validUntil !== 'Belum diatur') {
        let validDate = parseDateStr(p.validUntil);
        if (!isNaN(validDate)) {
            validDate.setHours(23, 59, 59, 999);
            if (targetDate > validDate) return false;
        }
    }
    let isDefault = p.days.includes(dayName);
    let reschedules = p.reschedules || {};
    let pendingReschedules = p.pendingReschedules || {};
    let movedAway = reschedules[targetDateStr] !== undefined;
    let movedHere = Object.values(reschedules).includes(targetDateStr);
    let pendingMoveHere = Object.values(pendingReschedules).includes(targetDateStr);
    return (isDefault && !movedAway) || movedHere || pendingMoveHere;
}

function checkOverlap(time1, time2) {
    if (!time1 || !time2 || !time1.includes('-') || !time2.includes('-')) return false;
    let [s1, e1] = time1.split('-').map(t => parseInt(t.trim().replace(':', '')));
    let [s2, e2] = time2.split('-').map(t => parseInt(t.trim().replace(':', '')));
    return (s1 < e2) && (s2 < e1);
}

function get12SessionsEndingOn(email, endDateStr) {
    let endObj = parseDateStr(endDateStr);
    endObj.setHours(0, 0, 0, 0);
    let result = [];
    let cursor = new Date(endObj);
    let safety = 0;
    while (result.length < 12 && safety < 400) {
        let dStr = formatDateForID(cursor);
        if (isOccupied(email, dStr, true)) {
            result.unshift(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() - 1);
        safety++;
    }
    return result;
}

function get12SessionsStartingAfter(email, afterDateObj) {
    let cursor = new Date(afterDateObj);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() + 1);
    let result = [];
    let safety = 0;
    while (result.length < 12 && safety < 400) {
        let dStr = formatDateForID(cursor);
        if (isOccupied(email, dStr, true)) {
            result.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
        safety++;
    }
    return result;
}

function getStudentCurriculumTimeline(email) {
    let p = window.HES.materials[`profile-${email}`];
    if (!p || !p.days || p.days.length === 0) return null;

    let monthEndDates = Object.assign({}, p.monthEndDates || {});
    const maxM = String(p.maxMonth || '1');

    if (p.validUntil && p.validUntil !== 'Belum diatur' && !monthEndDates[`m${maxM}`]) {
        monthEndDates[`m${maxM}`] = p.validUntil;
    }

    const totalMonths = window.HES.months.length;
    let monthSessions = new Array(totalMonths);

    for (let i = 0; i < totalMonths; i++) {
        let mId = window.HES.months[i].id;
        if (monthEndDates[mId]) {
            monthSessions[i] = get12SessionsEndingOn(email, monthEndDates[mId]);
        }
    }

    for (let i = totalMonths - 2; i >= 0; i--) {
        if (!monthSessions[i] && monthSessions[i + 1] && monthSessions[i + 1].length > 0) {
            let prevEnd = new Date(monthSessions[i + 1][0]);
            prevEnd.setDate(prevEnd.getDate() - 1);
            monthSessions[i] = get12SessionsEndingOn(email, formatDateForID(prevEnd));
        }
    }

    if (!monthSessions[0]) {
        let now = new Date();
        let day = now.getDay();
        let diff = now.getDate() - day + (day === 0 ? -6 : 1) - 1;
        let startBefore = new Date(now.getFullYear(), now.getMonth(), diff);
        monthSessions[0] = get12SessionsStartingAfter(email, startBefore);
    }

    for (let i = 1; i < totalMonths; i++) {
        if (!monthSessions[i] && monthSessions[i - 1] && monthSessions[i - 1].length > 0) {
            let lastDatePrevMonth = monthSessions[i - 1][monthSessions[i - 1].length - 1];
            monthSessions[i] = get12SessionsStartingAfter(email, lastDatePrevMonth);
        }
    }

    let sessionDates = [];
    for (let i = 0; i < totalMonths; i++) {
        let arr = monthSessions[i] || [];
        for (let k = 0; k < 12; k++) {
            sessionDates.push(arr[k] || null);
        }
    }

    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let todayStr = formatDateForID(today);

    let firstUpcomingIdx = sessionDates.findIndex(d => d && d >= today);
    let currentIdx = -1;
    let nextIdx = -1;
    let isTodayClass = false;

    if (firstUpcomingIdx === -1) {
        currentIdx = sessionDates.length - 1;
        nextIdx = -1;
    } else {
        let firstDateStr = formatDateForID(sessionDates[firstUpcomingIdx]);
        if (firstDateStr === todayStr) {
            currentIdx = firstUpcomingIdx;
            nextIdx = (firstUpcomingIdx + 1 < sessionDates.length) ? firstUpcomingIdx + 1 : -1;
            isTodayClass = true;
        } else {
            if (firstUpcomingIdx > 0) {
                const prevMonthIdx = Math.floor((firstUpcomingIdx - 1) / 12);
                const upcomingMonthIdx = Math.floor(firstUpcomingIdx / 12);

                if (prevMonthIdx < upcomingMonthIdx) {
                    currentIdx = firstUpcomingIdx;
                    nextIdx = (firstUpcomingIdx + 1 < sessionDates.length) ? firstUpcomingIdx + 1 : -1;
                } else {
                    currentIdx = firstUpcomingIdx - 1;
                    nextIdx = firstUpcomingIdx;
                }
            } else {
                currentIdx = 0;
                nextIdx = (sessionDates.length > 1) ? 1 : -1;
            }
        }
    }

    const timeline = {
        days: {},
        weeks: {},
        months: {},
        currentPointer: null,
        nextPointer: null,
        isTodayClass: isTodayClass
    };

    let globalIdx = 0;
    window.HES.months.forEach((m, mIdx) => {
        let mDates = [];
        let mHasCurrent = false;
        let mHasNext = false;

        m.weeks.forEach(w => {
            let wDates = [];
            let wHasCurrent = false;
            let wHasNext = false;

            [1, 2, 3].forEach(d => {
                let dateObj = sessionDates[globalIdx];
                let status = 'upcoming';

                if (globalIdx === currentIdx) {
                    status = 'current';
                    wHasCurrent = true;
                    mHasCurrent = true;
                    timeline.currentPointer = {
                        monthId: m.id,
                        monthTitle: m.title,
                        week: w,
                        day: d,
                        dateObj: dateObj,
                        dateStr: dateObj ? formatDateForID(dateObj) : '',
                        displayDate: dateObj ? getDisplayDate(dateObj) : '',
                        shortDate: dateObj ? getShortDayDate(dateObj) : '',
                        isTodayClass: isTodayClass
                    };
                } else if (globalIdx === nextIdx) {
                    status = 'next';
                    wHasNext = true;
                    mHasNext = true;
                    timeline.nextPointer = {
                        monthId: m.id,
                        monthTitle: m.title,
                        week: w,
                        day: d,
                        dateObj: dateObj,
                        dateStr: dateObj ? formatDateForID(dateObj) : '',
                        displayDate: dateObj ? getDisplayDate(dateObj) : '',
                        shortDate: dateObj ? getShortDayDate(dateObj) : ''
                    };
                } else if (globalIdx < currentIdx) {
                    status = 'completed';
                }

                if (dateObj) {
                    wDates.push(dateObj);
                    mDates.push(dateObj);
                }

                timeline.days[`${m.id}-w${w}-d${d}`] = {
                    monthId: m.id,
                    week: w,
                    day: d,
                    dateObj: dateObj,
                    dateStr: dateObj ? formatDateForID(dateObj) : '',
                    shortDate: dateObj ? getShortDayDate(dateObj) : '',
                    fullDate: dateObj ? getDisplayDate(dateObj) : '',
                    status: status
                };

                globalIdx++;
            });

            const lastIdxOfWeek = (mIdx * 12) + ((w - 1) * 3) + 2;
            const isWeekPastByDate = wDates.length > 0 && wDates[wDates.length - 1] < today;
            const allWeekDone = (lastIdxOfWeek < currentIdx) || isWeekPastByDate;

            let wStatus = wHasCurrent ? 'current' : (wHasNext ? 'next' : (allWeekDone ? 'completed' : 'upcoming'));
            timeline.weeks[`${m.id}-w${w}`] = {
                rangeText: wDates.length ? formatDateRangeShort(wDates[0], wDates[wDates.length - 1]) : '',
                status: wStatus
            };
        });

        const lastIdxOfMonth = (mIdx * 12) + 11;
        let explicitEndObj = monthEndDates[m.id] ? parseDateStr(monthEndDates[m.id]) : null;
        if (explicitEndObj) explicitEndObj.setHours(23, 59, 59, 999);
        const isMonthExpiredByEndDate = explicitEndObj ? (today > explicitEndObj) : (mDates.length > 0 && mDates[mDates.length - 1] < today);
        const allMonthDone = (lastIdxOfMonth < currentIdx) || isMonthExpiredByEndDate;

        let mStatus = allMonthDone ? 'completed' : (mHasCurrent ? 'current' : (mHasNext ? 'next' : 'upcoming'));
        timeline.months[m.id] = {
            rangeText: mDates.length ? formatDateRangeShort(mDates[0], mDates[mDates.length - 1]) : '',
            endDateStr: monthEndDates[m.id] || '',
            status: mStatus
        };
    });

    return timeline;
}

/**
 * FITUR #4: Kalkulasi Progress Tracker & Gamifikasi Murid (10 Level & Progres Lebih Terukur)
 */
function getStudentGamificationStats(email) {
    const p = window.HES.materials[`profile-${email}`] || {};
    const maxMonthNum = parseInt(p.maxMonth || '1');
    const timeline = getStudentCurriculumTimeline(email);

    // 1. Hitung total sesi selesai & progress bulan aktif saat ini
    let totalCompletedSessions = 0;
    let activeMonthId = `m${maxMonthNum}`;
    let activeMonthTitle = `Month ${maxMonthNum}`;
    let activeMonthCompleted = 0;

    if (timeline && timeline.currentPointer) {
        activeMonthId = timeline.currentPointer.monthId;
        activeMonthTitle = timeline.currentPointer.monthTitle;
    }

    if (timeline && timeline.days) {
        Object.values(timeline.days).forEach(d => {
            const mNum = parseInt(d.monthId.replace('m', ''));
            if (mNum <= maxMonthNum) {
                if (d.status === 'completed') {
                    totalCompletedSessions++;
                }
                if (d.monthId === activeMonthId && d.status === 'completed') {
                    activeMonthCompleted++;
                }
            }
        });
    }

    const activeMonthPercent = Math.min(100, Math.round((activeMonthCompleted / 12) * 100));

    // 2. Hitung Statistik Kosakata (Dikuasai & Disetorkan)
    let masteredWordsCount = 0;
    let approvedSetsCount = 0;
    let submittedSetsCount = 0;

    window.HES.months.forEach(m => {
        m.weeks.forEach(w => {
            [1, 2, 3].forEach(d => {
                const statusObj = window.HES.materials[`vocab_status-${email}-${m.id}-w${w}-d${d}`];
                if (statusObj && (statusObj.status === 'approved' || statusObj.status === 'submitted')) {
                    const rawVocab = window.HES.materials[`vocab-${m.id}-w${w}-d${d}`] || '';
                    const wordLines = rawVocab.split('\n').filter(l => l.includes('=')).length;
                    const countToAdd = wordLines > 0 ? wordLines : 5;
                    masteredWordsCount += countToAdd;

                    if (statusObj.status === 'approved') approvedSetsCount++;
                    else submittedSetsCount++;
                }
            });
        });
    });

    // 3. Hitung Statistik Ujian Bulanan & Bonus Skor
    let examsCompleted = 0;
    let totalExamScoreSum = 0;
    let examBonusXP = 0;

    window.HES.months.forEach(m => {
        const res = window.HES.materials[`exam_result-${email}-${m.id}`];
        if (res && res.sectionScores) {
            const sc = res.sectionScores;
            const hasSubmittedAny = (res.submittedTabs && res.submittedTabs.length > 0) || res.isGraded;
            if (hasSubmittedAny) {
                examsCompleted++;
                const avg = Math.round(((sc.reading || 0) + (sc.writing || 0) + (sc.speaking || 0) + (sc.listening || 0)) / 4);
                totalExamScoreSum += avg;
                // Poin dasar 100 XP per ujian + bonus nilai rata-rata jika sudah dinilai Admin
                examBonusXP += 100 + (res.isGraded ? avg : 0);
            }
        }
    });

    const avgExamScore = examsCompleted > 0 ? Math.round(totalExamScoreSum / examsCompleted) : 0;

    // 4. Kalkulasi XP Baru (Lebih Lambat & Proporsional):
    // +25 XP per sesi kelas selesai (300 XP/bulan)
    // +25 XP per setoran vocab approved, +10 XP jika baru submitted (300 XP/bulan)
    // +100 s/d 200 XP per ujian bulanan
    const xp = (totalCompletedSessions * 25) + (approvedSetsCount * 25) + (submittedSetsCount * 10) + examBonusXP;

    // 10 Tingkatan Level (Dari Starter Explorer hingga Grandmaster Legend)
    const levels = [
        { level: 1,  title: 'Starter Explorer',        minXP: 0,    nextXP: 250,  badgeColor: 'from-slate-600 to-slate-800',     icon: 'fa-seedling' },
        { level: 2,  title: 'Novice Learner',          minXP: 250,  nextXP: 600,  badgeColor: 'from-sky-500 to-blue-600',        icon: 'fa-book-open-reader' },
        { level: 3,  title: 'Rising Communicator',     minXP: 600,  nextXP: 1100, badgeColor: 'from-teal-500 to-emerald-600',    icon: 'fa-feather-pointed' },
        { level: 4,  title: 'Active Conversationalist',minXP: 1100, nextXP: 1700, badgeColor: 'from-emerald-600 to-green-700',   icon: 'fa-comments' },
        { level: 5,  title: 'Confident Speaker',       minXP: 1700, nextXP: 2400, badgeColor: 'from-indigo-500 to-blue-700',     icon: 'fa-microphone-lines' },
        { level: 6,  title: 'Skilled Articulator',     minXP: 2400, nextXP: 3200, badgeColor: 'from-violet-600 to-indigo-700',   icon: 'fa-bolt' },
        { level: 7,  title: 'Fluent Achiever',         minXP: 3200, nextXP: 4100, badgeColor: 'from-purple-600 to-fuchsia-700',  icon: 'fa-award' },
        { level: 8,  title: 'Advanced Orator',         minXP: 4100, nextXP: 5100, badgeColor: 'from-amber-500 to-orange-600',    icon: 'fa-fire' },
        { level: 9,  title: 'Master Scholar',          minXP: 5100, nextXP: 6500, badgeColor: 'from-rose-500 to-red-700',        icon: 'fa-medal' },
        { level: 10, title: 'Grandmaster Legend',      minXP: 6500, nextXP: 8500, badgeColor: 'from-amber-500 via-rose-500 to-indigo-700', icon: 'fa-crown' }
    ];

    let currentLvlObj = levels[0];
    for (let i = 0; i < levels.length; i++) {
        if (xp >= levels[i].minXP) {
            currentLvlObj = levels[i];
        }
    }

    const isMaxLevel = currentLvlObj.level === 10;
    const xpInCurrentTier = xp - currentLvlObj.minXP;
    const xpNeededForTier = currentLvlObj.nextXP - currentLvlObj.minXP;
    const xpProgressPercent = isMaxLevel
        ? 100
        : Math.min(100, Math.max(4, Math.round((xpInCurrentTier / xpNeededForTier) * 100)));

    return {
        xp,
        level: currentLvlObj.level,
        maxLevel: 10,
        isMaxLevel,
        levelTitle: currentLvlObj.title,
        levelIcon: currentLvlObj.icon,
        levelGradient: currentLvlObj.badgeColor,
        nextXP: currentLvlObj.nextXP,
        xpProgressPercent,
        totalCompletedSessions,
        activeMonthId,
        activeMonthTitle,
        activeMonthCompleted,
        activeMonthPercent,
        masteredWordsCount,
        approvedSetsCount,
        submittedSetsCount,
        examsCompleted,
        avgExamScore
    };
}

function getStudentNextSessionInfo(email) {
    let p = window.HES.materials[`profile-${email}`];
    if (!p || !p.days || p.days.length === 0) return { error: 'Jadwal belum dikonfigurasi oleh admin.' };

    const maxM = String(p.maxMonth || '1');
    const activeValidUntil = (p.monthEndDates && p.monthEndDates[`m${maxM}`])
        ? p.monthEndDates[`m${maxM}`]
        : p.validUntil;

    if (!activeValidUntil || activeValidUntil === 'Belum diatur') {
        return { error: 'Masa aktif keanggotaan belum diatur.' };
    }

    let today = new Date();
    today.setHours(0, 0, 0, 0);
    let validDate = parseDateStr(activeValidUntil);
    let isValid = !isNaN(validDate);
    if (isValid) validDate.setHours(23, 59, 59, 999);
    if (isValid && today > validDate) return { expired: true, validDateStr: getDisplayDate(validDate) };

    for (let i = 0; i < 30; i++) {
        let curr = new Date(today);
        curr.setDate(today.getDate() + i);
        if (isValid && curr > validDate) break;
        let currStr = formatDateForID(curr);
        if (isOccupied(email, currStr)) {
            return {
                dateStr: currStr,
                displayDate: getDisplayDate(curr),
                time: p.time,
                validDateStr: isValid ? getDisplayDate(validDate) : 'Belum diatur'
            };
        }
    }
    return { error: 'Tidak ada jadwal terdekat yang tersedia dalam 30 hari ke depan.' };
}

function parseDriveLink(link) {
    if (!link) return '';
    if (link.includes('drive.google.com/file/d/')) {
        const match = link.match(/\/d\/(.+?)\//);
        if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return link;
}

function getDriveDirectStreamLink(url) {
    if (!url) return '';
    let id = '';
    const parts = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (parts && parts[1]) {
        id = parts[1];
    } else {
        try {
            const urlParams = new URLSearchParams(url.split('?')[1]);
            if (urlParams.has('id')) id = urlParams.get('id');
        } catch (e) {}
    }
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    return url;
}

function calculateCategoryScore(cat, examData, examResult) {
    if (!examData || !examData[cat] || examData[cat].length === 0) return 0;
    let totalScore = 0;
    let totalQuestions = examData[cat].length;
    examData[cat].forEach((q, idx) => {
        let ans = examResult.answers ? examResult.answers[`${cat}_${idx}`] : undefined;
        if (q.type === 'mcq') {
            if (ans !== undefined && ans !== '' && ans == q.answer) {
                totalScore += 100;
            }
        } else {
            let manual = (examResult.scores && examResult.scores[`${cat}_${idx}`] !== undefined)
                ? parseFloat(examResult.scores[`${cat}_${idx}`])
                : 0;
            totalScore += (isNaN(manual) ? 0 : manual);
        }
    });
    return Math.round(totalScore / totalQuestions);
}

// ==========================================
// 6. TOAST NOTIFICATION MODERN
// ==========================================
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-slate-900 text-white border-slate-800',
        error: 'bg-red-600 text-white border-red-700',
        info: 'bg-indigo-600 text-white border-indigo-700'
    };
    const icons = {
        success: 'fa-check-circle text-emerald-400',
        error: 'fa-exclamation-circle text-white',
        info: 'fa-info-circle text-indigo-200'
    };

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold fade-in ${colors[type] || colors.success}`;
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.success} text-base shrink-0"></i>
        <span class="flex-1 leading-snug">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}