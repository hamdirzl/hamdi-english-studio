// js/admin.js

let currentAdminTab = 'overview';
let adminExamState = { student: '', month: '', activeTab: 'listening', data: null };
let currentAdminGradingTab = 'reading';
let cachedBrowserVoices = [];
let adminAudioSessionId = 0;
let sharedAdminAudioEl = null;
window._hesAdminUtterance = null;

if (!document.getElementById('hes-no-referrer')) {
    const meta = document.createElement('meta');
    meta.id = 'hes-no-referrer';
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
}

function initBrowserVoices() {
    if (!('speechSynthesis' in window)) return;
    cachedBrowserVoices = window.speechSynthesis.getVoices() || [];
    window.speechSynthesis.onvoiceschanged = () => {
        cachedBrowserVoices = window.speechSynthesis.getVoices() || [];
    };
}
initBrowserVoices();

function ensureAdminVoicesLoaded() {
    return new Promise(resolve => {
        if (!('speechSynthesis' in window)) return resolve([]);
        let list = window.speechSynthesis.getVoices() || [];
        if (list.length) {
            cachedBrowserVoices = list;
            return resolve(list);
        }
        const timer = setTimeout(() => {
            cachedBrowserVoices = window.speechSynthesis.getVoices() || [];
            resolve(cachedBrowserVoices);
        }, 500);
        window.speechSynthesis.onvoiceschanged = () => {
            clearTimeout(timer);
            cachedBrowserVoices = window.speechSynthesis.getVoices() || [];
            resolve(cachedBrowserVoices);
        };
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth('admin')) return;
    currentAdminTab = new URLSearchParams(window.location.search).get('tab') || 'overview';

    initLayout('Panel Admin (CMS)');
    populateAllAdminDropdowns();
    switchAdminTab(currentAdminTab);

    await syncFromCloud();
    renderAppSidebar();
    populateAllAdminDropdowns();
    switchAdminTab(currentAdminTab);
});

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

// ============================================================================
// 100% DUAL-ENGINE AMERICAN ENGLISH (MAN = PRIA US, WOMAN = WANITA US)
// ============================================================================
function splitTextIntoSafeChunks(text, maxLen = 155) {
    const safeText = String(text || '')
        .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\.\s+/gi, '$1__DOT__ ');

    const rawSentences = safeText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [safeText];
    const chunks = [];

    rawSentences.forEach(rawSent => {
        const s = rawSent.replace(/__DOT__/g, '.').trim();
        if (!s) return;
        if (s.length <= maxLen) {
            chunks.push(s);
        } else {
            const parts = s.split(/(?<=[,;:])\s+|\s+(?=(?:and|but|because|so|although|when|while|before|after)\b)/i);
            let current = '';
            parts.forEach(p => {
                if ((current + ' ' + p).trim().length <= maxLen) {
                    current = (current + ' ' + p).trim();
                } else {
                    if (current) chunks.push(current);
                    current = p.trim();
                }
            });
            if (current) chunks.push(current);
        }
    });
    return chunks;
}

function parseDialogueSegments(rawText) {
    // Paksa baris baru setiap kali bertemu kata kunci pembicara (Man:, Woman:, Kevin:, Sarah:, dll.)
    const cleanedRaw = String(rawText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\*+/g, '')
        .replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/gim, '')
        .replace(/\s*[\/|]\s*/g, '\n')
        .replace(/(^|\s+)(?=(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB]|Kevin|Sarah|David|Dina|Nadia|Sinta|Raka|Budi|Andi|Customer|Waiter)\s*:)/gi, '\n');

    const lines = cleanedRaw.split('\n').map(l => l.trim()).filter(Boolean);
    const segments = [];
    let lastGender = 'female';

    lines.forEach(line => {
        let gender = null;
        let cleanLine = line.replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/i, '').trim();

        const prefixMatch = cleanLine.match(/^([A-Za-z\s.]{1,22}?)\s*:\s*(.+)$/);
        if (prefixMatch) {
            const speaker = prefixMatch[1].trim().toLowerCase();
            cleanLine = prefixMatch[2].trim();
            if (/^(man|male|boy|mr|father|dad|waiter|husband|son|brother|uncle|kevin|david|raka|budi|andi|john|tom|alex|speaker a|a)\b/.test(speaker)) {
                gender = 'male';
            } else if (/^(woman|female|girl|mrs|ms|miss|mother|mom|waitress|wife|daughter|sister|aunt|sarah|dina|nadia|sinta|rina|dinda|lisa|anna|speaker b|b)\b/.test(speaker)) {
                gender = 'female';
            } else {
                gender = lastGender === 'male' ? 'female' : 'male';
            }
        } else {
            gender = lastGender === 'male' ? 'female' : 'male';
        }
        lastGender = gender;

        const safeChunks = splitTextIntoSafeChunks(cleanLine, 155);
        safeChunks.forEach(chunk => {
            if (chunk) segments.push({ text: chunk, gender });
        });
    });
    return segments;
}

function getSharedAdminAudio() {
    if (!sharedAdminAudioEl) {
        sharedAdminAudioEl = new Audio();
        sharedAdminAudioEl.referrerPolicy = 'no-referrer';
        sharedAdminAudioEl.preload = 'auto';
    }
    return sharedAdminAudioEl;
}

function pickBestUSVoiceForGender(voices, gender) {
    const allEn = voices.filter(v => /^en/i.test(String(v.lang || '')));
    const usPool = allEn.filter(v => /us/i.test(String(v.lang || '')) || /united states|us/i.test(String(v.name || '')));
    const pool = usPool.length ? usPool : allEn;
    if (!pool.length) return { voice: null, isExplicitMale: false };

    if (gender === 'male') {
        const maleRegex = /\b(guy|christopher|eric|roger|steffan|andrew|brian|davis|tony|jason|jacob|aaron|alex|fred|david|mark|daniel|iom|tpd|iol|male)\b/i;
        const femaleBlock = /\b(female|woman|zira|aria|jenny|michelle|ana|ava|emma|samantha|victoria|sfg|iob|tpf)\b/i;

        // Utamakan localService agar Android patuh pada pitch bariton
        const explicitLocal = pool.find(v => v.localService && maleRegex.test(`${v.name} ${v.voiceURI}`) && !femaleBlock.test(`${v.name} ${v.voiceURI}`));
        if (explicitLocal) return { voice: explicitLocal, isExplicitMale: true };

        const explicitAny = pool.find(v => maleRegex.test(`${v.name} ${v.voiceURI}`) && !femaleBlock.test(`${v.name} ${v.voiceURI}`));
        if (explicitAny) return { voice: explicitAny, isExplicitMale: true };

        // Di Android Chrome jika semua suara bernama "English (United States)", pilih suara local / index ke-2 (bukan index 0 yang cewek)
        const localNonFirst = pool.slice(1).find(v => v.localService) || pool.find(v => v.localService);
        if (localNonFirst) return { voice: localNonFirst, isExplicitMale: false };

        return { voice: pool[1] || pool[0], isExplicitMale: false };
    } else {
        const femaleRegex = /\b(aria|jenny|michelle|ana|ava|emma|samantha|victoria|zira|google us english|sfg|iob|tpf|female)\b/i;
        const maleBlock = /\b(guy|christopher|eric|roger|steffan|aaron|alex|fred|david|mark|iom|tpd|iol|\bmale\b)\b/i;
        const explicitFemale = pool.find(v => femaleRegex.test(`${v.name} ${v.voiceURI}`) && !maleBlock.test(`${v.name} ${v.voiceURI}`));
        return { voice: explicitFemale || pool[0], isExplicitMale: false };
    }
}

// SUARA WANITA (WOMAN): Cloud US Female MP3 -> Fallback ke High-Pitch Female SpeechSynthesis
function playFemaleChunkUS(text, sessionId) {
    return new Promise(resolve => {
        if (sessionId !== adminAudioSessionId) return resolve();
        const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=en-US&dt=t&q=${encodeURIComponent(text)}`;
        const audio = getSharedAdminAudio();
        let settled = false;

        const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;
        };

        audio.onended = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };

        audio.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            playSpeechSynthesisByGender(text, 'female', sessionId).then(resolve);
        };

        audio.src = url;
        audio.playbackRate = 1.0;
        const p = audio.play();
        if (p !== undefined) {
            p.catch(() => {
                if (settled) return;
                settled = true;
                cleanup();
                playSpeechSynthesisByGender(text, 'female', sessionId).then(resolve);
            });
        }
    });
}

// SUARA PRIA (MAN): Dedicated US Male SpeechSynthesis dengan Penguncian Pitch Bariton (TIDAK PERNAH PAKAI GOOGLE TRANSLATE CEWEK)
function playSpeechSynthesisByGender(text, gender, sessionId) {
    return new Promise(resolve => {
        if (sessionId !== adminAudioSessionId || !('speechSynthesis' in window)) return resolve();
        const voices = cachedBrowserVoices.length ? cachedBrowserVoices : (window.speechSynthesis.getVoices() || []);
        const { voice, isExplicitMale } = pickBestUSVoiceForGender(voices, gender);

        const u = new SpeechSynthesisUtterance(text);
        window._hesAdminUtterance = u;

        if (voice) {
            u.voice = voice;
            // PENTING UNTUK ANDROID: Gunakan string voice.lang asli (misal en_US) agar suara tidak di-reset!
            u.lang = voice.lang || 'en-US';
        } else {
            u.lang = 'en-US';
        }

        if (gender === 'male') {
            u.pitch = isExplicitMale ? 0.80 : 0.52; // Bariton Pria yang berat dan jelas berbeda dari wanita
            u.rate = 0.94;
        } else {
            u.pitch = 1.22; // Wanita
            u.rate = 0.98;
        }

        const keepAlive = setInterval(() => {
            if (sessionId !== adminAudioSessionId) {
                clearInterval(keepAlive);
                return;
            }
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
            }
        }, 5000);

        u.onend = () => {
            clearInterval(keepAlive);
            window._hesAdminUtterance = null;
            resolve();
        };
        u.onerror = () => {
            clearInterval(keepAlive);
            window._hesAdminUtterance = null;
            resolve();
        };

        window.speechSynthesis.speak(u);
    });
}

window.stopNaturalEnglishTTS = function() {
    adminAudioSessionId++;
    if (sharedAdminAudioEl) {
        try {
            sharedAdminAudioEl.onended = null;
            sharedAdminAudioEl.onerror = null;
            sharedAdminAudioEl.pause();
            sharedAdminAudioEl.removeAttribute('src');
        } catch (e) {}
    }
    if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    window._hesAdminUtterance = null;
};

window.playNaturalEnglishTTS = async function(text, btnEl = null) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return showToast('Tulis naskah audio terlebih dahulu.', 'error');

    if (btnEl && btnEl.dataset.playing === '1') {
        window.stopNaturalEnglishTTS();
        btnEl.dataset.playing = '0';
        btnEl.innerHTML = btnEl.dataset.origHtml || `<i class="fas fa-play mr-1"></i> Tes Suara US`;
        return;
    }

    window.stopNaturalEnglishTTS();
    const currentSession = ++adminAudioSessionId;
    getSharedAdminAudio();
    await ensureAdminVoicesLoaded();

    const segments = parseDialogueSegments(cleanText);
    if (!segments.length) return;

    const origHTML = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.dataset.origHtml = origHTML;
        btnEl.dataset.playing = '1';
    }

    for (let i = 0; i < segments.length; i++) {
        if (currentSession !== adminAudioSessionId) break;
        const seg = segments[i];

        if (btnEl) {
            btnEl.innerHTML = seg.gender === 'male'
                ? `<i class="fas fa-stop mr-1"></i> 👨 Man (US Male)...`
                : `<i class="fas fa-stop mr-1"></i> 👩 Woman (US Female)...`;
        }

        if (seg.gender === 'male') {
            // Pria selalu menggunakan Mesin Suara Pria (SpeechSynthesis Male Baritone)
            await playSpeechSynthesisByGender(seg.text, 'male', currentSession);
        } else {
            // Wanita menggunakan Cloud US Female MP3 (atau Female SpeechSynthesis)
            await playFemaleChunkUS(seg.text, currentSession);
        }

        if (currentSession !== adminAudioSessionId) break;
        await new Promise(r => setTimeout(r, 220));
    }

    if (btnEl && currentSession === adminAudioSessionId) {
        btnEl.dataset.playing = '0';
        btnEl.innerHTML = origHTML;
    }
};

window.refreshAdminCloudData = async function() {
    await syncFromCloud();
    renderAppSidebar();
    populateAllAdminDropdowns();
    switchAdminTab(currentAdminTab);
    showToast('Data terbaru berhasil disinkronkan!', 'info');
};

window.switchAdminTab = function(tabName) {
    currentAdminTab = tabName;
    const labels = {
        overview: '<i class="fas fa-bell mr-1.5"></i> Overview',
        users: '<i class="fas fa-users-cog mr-1.5"></i> Akun & Jadwal',
        materials: '<i class="fas fa-book mr-1.5"></i> Materi & Kosakata',
        exam: '<i class="fas fa-file-signature mr-1.5"></i> Ujian & Nilai'
    };
    ['overview', 'users', 'materials', 'exam'].forEach(t => {
        const btn = document.getElementById(`adm-tab-${t}`);
        const panel = document.getElementById(`admin-panel-${t}`);
        if (btn) {
            btn.innerHTML = labels[t];
            btn.className = `px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition ${t === tabName ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`;
        }
        if (panel) panel.classList.toggle('hidden', t !== tabName);
    });
    if (tabName === 'overview') renderAdminOverviewTab();
    if (tabName === 'users') renderAdminUsersTab();
    if (tabName === 'materials') loadAdminVocabPreview();
};

function populateAllAdminDropdowns() {
    const mOpts = window.HES.months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMOpts = window.HES.months.map(m => `<option value="${m.id.replace('m', '')}">Batas: ${m.title}</option>`).join('');
    const sOpts = window.HES.students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    const fill = (id, html) => {
        const el = document.getElementById(id);
        if (!el) return;
        const prev = el.value;
        el.innerHTML = html;
        if (prev && Array.from(el.options).some(o => o.value === prev)) el.value = prev;
    };

    fill('admin-sched-student', sOpts);
    fill('admin-sched-max-month', maxMOpts);
    fill('admin-target-student', `<option value="all">Global (Semua Murid)</option>${sOpts}`);
    ['admin-month', 'admin-vocab-month', 'admin-review-month', 'admin-exam-month'].forEach(id => fill(id, mOpts));
    ['admin-review-student', 'admin-exam-student'].forEach(id => fill(id, sOpts));
    loadStudentScheduleForm();
}

// TAB 1: OVERVIEW
function renderAdminOverviewTab() {
    const box = document.getElementById('admin-pending-reschedules-list');
    if (!box) return;
    let html = '';
    window.HES.students.forEach(s => {
        const pend = window.HES.materials[`profile-${s.email}`]?.pendingReschedules || {};
        for (const [oldD, newD] of Object.entries(pend)) {
            html += `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-2.5 gap-3">
                    <div>
                        <p class="text-xs font-extrabold text-slate-800">${s.name} <span class="text-slate-400 font-normal">(${s.email})</span></p>
                        <p class="text-xs font-semibold text-indigo-700 mt-1">${getDisplayDate(parseDateStr(oldD))} <i class="fas fa-arrow-right mx-1.5"></i> ${getDisplayDate(parseDateStr(newD))}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="approveReschedule('${s.email}','${oldD}','${newD}')" class="hes-btn-primary !py-2 !px-3.5 !text-xs">Setujui</button>
                        <button onclick="rejectReschedule('${s.email}','${oldD}')" class="hes-btn-soft !bg-red-50 !text-red-600 !py-2 !px-3.5 !text-xs">Tolak</button>
                    </div>
                </div>`;
        }
    });
    box.innerHTML = html || `<p class="text-xs text-slate-400 text-center py-6">Tidak ada pengajuan pindah jadwal saat ini.</p>`;
}

window.approveReschedule = async function(email, oldD, newD) {
    await safeSaveMaterialsToCloud(materials => {
        const p = materials[`profile-${email}`] || {};
        p.reschedules = p.reschedules || {};
        p.reschedules[oldD] = newD;
        if (p.pendingReschedules) delete p.pendingReschedules[oldD];
        materials[`profile-${email}`] = p;
    });
    showToast('Jadwal baru disetujui!', 'success');
    renderAdminOverviewTab();
};

window.rejectReschedule = async function(email, oldD) {
    await safeSaveMaterialsToCloud(materials => {
        if (materials[`profile-${email}`]?.pendingReschedules) {
            delete materials[`profile-${email}`].pendingReschedules[oldD];
        }
    });
    showToast('Pengajuan jadwal ditolak.', 'info');
    renderAdminOverviewTab();
};

window.addNewMonth = async function() {
    const n = window.HES.months.length + 1;
    window.HES.months.push({ id: `m${n}`, title: `Month ${n}`, weeks: [1, 2, 3, 4] });
    await saveToCloud('hes_months', window.HES.months);
    populateAllAdminDropdowns();
    showToast(`Month ${n} berhasil ditambahkan!`, 'success');
};

// TAB 2: AKUN & JADWAL
window.loadStudentScheduleForm = function() {
    const email = document.getElementById('admin-sched-student')?.value;
    if (!email) return;
    const p = window.HES.materials[`profile-${email}`] || {};
    document.getElementById('admin-sched-max-month').value = String(p.maxMonth || 1);

    const [s, e] = (p.time || '').includes('-') ? p.time.split('-').map(t => t.trim()) : ['', ''];
    document.getElementById('admin-sched-start').value = s;
    document.getElementById('admin-sched-end').value = e;
    document.querySelectorAll('.admin-day-cb').forEach(cb => cb.checked = (p.days || []).includes(cb.value));

    onAdminMonthSelectChange();
    const dates = p.monthEndDates || {};
    document.getElementById('admin-saved-month-dates-box').innerHTML = window.HES.months.map(m =>
        `<span class="inline-block mr-2 mb-1 px-2.5 py-1 rounded-lg bg-white border text-xs font-bold">${m.title}: ${dates[m.id] || 'Belum diatur'}</span>`
    ).join('');
};

window.onAdminMonthSelectChange = function() {
    const email = document.getElementById('admin-sched-student')?.value;
    const mNum = document.getElementById('admin-sched-max-month')?.value || '1';
    const p = window.HES.materials[`profile-${email}`] || {};
    document.getElementById('admin-sched-date-label').innerText = `Batas Akhir Month ${mNum}`;
    document.getElementById('admin-sched-date').value = p.monthEndDates?.[`m${mNum}`] || (String(p.maxMonth) === String(mNum) ? p.validUntil || '' : '');
};

window.saveStudentSchedule = async function() {
    const email = document.getElementById('admin-sched-student').value;
    await safeSaveMaterialsToCloud(materials => {
        const p = materials[`profile-${email}`] || {};
        p.monthEndDates = p.monthEndDates || {};
        const mNum = document.getElementById('admin-sched-max-month').value || '1';
        const dVal = document.getElementById('admin-sched-date').value;
        if (dVal) { p.monthEndDates[`m${mNum}`] = dVal; p.validUntil = dVal; }

        p.maxMonth = Math.max(parseInt(mNum), ...Object.keys(p.monthEndDates).map(k => parseInt(k.replace('m', '')) || 1));
        if (p.monthEndDates[`m${p.maxMonth}`]) p.validUntil = p.monthEndDates[`m${p.maxMonth}`];

        const sT = document.getElementById('admin-sched-start').value, eT = document.getElementById('admin-sched-end').value;
        if (sT && eT) p.time = `${sT} - ${eT}`;
        p.days = Array.from(document.querySelectorAll('.admin-day-cb:checked')).map(cb => cb.value);
        materials[`profile-${email}`] = p;
    });
    showToast('Jadwal murid berhasil disimpan!', 'success');
    loadStudentScheduleForm();
    renderAdminUsersTab();
};

function renderAdminUsersTab() {
    const tbody = document.getElementById('admin-students-table-body');
    if (!tbody) return;
    tbody.innerHTML = window.HES.students.map(s => {
        const p = window.HES.materials[`profile-${s.email}`] || {};
        return `
            <tr class="border-b border-slate-100">
                <td class="p-3 font-extrabold text-slate-800">${s.name}</td>
                <td class="p-3 text-slate-500">${s.email}</td>
                <td class="p-3 font-bold">${(p.days || []).join(', ') || '-'} (${p.time || '-'}) • Month ${p.maxMonth || 1}</td>
                <td class="p-3 font-mono">${s.password}</td>
                <td class="p-3 text-right space-x-1">
                    <button onclick="editStudentPassword('${s.email}')" class="hes-btn-soft !py-1.5 !px-2.5"><i class="fas fa-key"></i></button>
                    <button onclick="deleteStudentAccount('${s.email}')" class="hes-btn-soft !bg-red-50 !text-red-600 !py-1.5 !px-2.5"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    }).join('');
}

window.addNewStudent = async function() {
    const name = document.getElementById('new-stu-name').value.trim();
    const email = document.getElementById('new-stu-email').value.trim();
    const password = document.getElementById('new-stu-pass').value.trim();
    if (!name || !email || !password) return showToast('Lengkapi semua kolom!', 'error');
    window.HES.students.push({ name, email, password });
    await saveToCloud('hes_students', window.HES.students);
    populateAllAdminDropdowns();
    renderAdminUsersTab();
    showToast(`Akun ${name} berhasil dibuat!`, 'success');
};

window.editStudentPassword = async function(email) {
    const s = window.HES.students.find(x => x.email === email);
    const np = prompt(`Kata sandi baru untuk ${s.name}:`, s.password);
    if (np?.trim()) { s.password = np.trim(); await saveToCloud('hes_students', window.HES.students); renderAdminUsersTab(); showToast('Sandi diperbarui!', 'success'); }
};

window.deleteStudentAccount = async function(email) {
    if (!confirm(`Hapus akun ${email}?`)) return;
    window.HES.students = window.HES.students.filter(s => s.email !== email);
    await saveToCloud('hes_students', window.HES.students);
    populateAllAdminDropdowns();
    renderAdminUsersTab();
};

// TAB 3: MATERI & WORDBANK
window.saveMaterialData = async function() {
    const pref = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value, w = document.getElementById('admin-week').value, d = document.getElementById('admin-day').value;
    const link = document.getElementById('admin-link').value.trim(), recap = document.getElementById('admin-recap-pdf').value.trim();

    await safeSaveMaterialsToCloud(materials => {
        if (link) materials[`${pref}-${m}-w${w}-d${d}-link`] = link; else delete materials[`${pref}-${m}-w${w}-d${d}-link`];
        if (recap) materials[`${pref}-${m}-w${w}-d${d}-recap`] = recap; else delete materials[`${pref}-${m}-w${w}-d${d}-recap`];
    });
    showToast('Tautan materi berhasil disimpan!', 'success');
};

window.updateMasterWordbankCounter = function() {
    const wb = document.getElementById('admin-master-wordbank');
    if (!wb) return;
    const seen = new Set();
    wb.value.split('\n').forEach(l => { if (l.includes('=')) { const e = l.split('=')[0].trim().toLowerCase(); if (e) seen.add(e); } });
    const perDay = parseInt(document.getElementById('admin-words-per-day')?.value || 5);
    document.getElementById('master-wordbank-stats-badge').innerText = `${seen.size} Kata Unik`;
    document.getElementById('master-wordbank-capacity-text').innerText = `Cukup untuk ${Math.floor(seen.size / perDay)} Pertemuan`;
};

window.saveMasterWordbank = async function() {
    const wb = document.getElementById('admin-master-wordbank');
    const seen = new Set(), clean = [];
    wb.value.split('\n').forEach(l => {
        if (!l.includes('=')) return;
        const [e, ...r] = l.split('=');
        if (e.trim() && r.join('=').trim() && !seen.has(e.trim().toLowerCase())) {
            seen.add(e.trim().toLowerCase());
            clean.push(`${e.trim()} = ${r.join('=').trim()}`);
        }
    });
    wb.value = clean.join('\n');
    await safeSaveMaterialsToCloud(materials => {
        materials['master_wordbank'] = wb.value;
        materials['master_wordbank_per_day'] = parseInt(document.getElementById('admin-words-per-day').value) || 5;
    });
    updateMasterWordbankCounter();
    showToast('Master Wordbank disimpan!', 'success');
};

window.loadAdminVocabPreview = function() {
    const wb = document.getElementById('admin-master-wordbank');
    if (wb) {
        wb.value = (window.HES.materials['master_wordbank'] || '').trim() || window.DEFAULT_WORDBANK_RAW || '';
        document.getElementById('admin-words-per-day').value = String(getWordsPerDaySetting());
        updateMasterWordbankCounter();
    }
    const m = document.getElementById('admin-vocab-month')?.value, w = document.getElementById('admin-vocab-week')?.value, d = document.getElementById('admin-vocab-day')?.value;
    if (!m) return;
    const manual = window.HES.materials[`vocab-${m}-w${w}-d${d}`] || '';
    document.getElementById('admin-vocab-list').value = manual.trim() ? manual : getSessionVocabText(m, w, d);
    document.getElementById('admin-vocab-source-badge').innerText = manual.trim() ? 'Override Manual' : 'Otomatis Wordbank';
};

window.saveVocabList = async function() {
    const m = document.getElementById('admin-vocab-month').value, w = document.getElementById('admin-vocab-week').value, d = document.getElementById('admin-vocab-day').value;
    const val = document.getElementById('admin-vocab-list').value.trim();
    await safeSaveMaterialsToCloud(materials => {
        if (val) materials[`vocab-${m}-w${w}-d${d}`] = val; else delete materials[`vocab-${m}-w${w}-d${d}`];
    });
    loadAdminVocabPreview();
    showToast('Kosakata sesi disimpan!', 'success');
};

window.clearManualVocabOverride = async function() {
    const m = document.getElementById('admin-vocab-month').value, w = document.getElementById('admin-vocab-week').value, d = document.getElementById('admin-vocab-day').value;
    await safeSaveMaterialsToCloud(materials => {
        delete materials[`vocab-${m}-w${w}-d${d}`];
    });
    loadAdminVocabPreview();
    showToast('Dikembalikan ke Wordbank otomatis.', 'info');
};

window.checkVocabStatus = async function() {
    await syncFromCloud();
    const email = document.getElementById('admin-review-student').value;
    const m = document.getElementById('admin-review-month').value, w = document.getElementById('admin-review-week').value, d = document.getElementById('admin-review-day').value;
    const st = window.HES.materials[`vocab_status-${email}-${m}-w${w}-d${d}`];
    const box = document.getElementById('vocab-review-result');

    if (!st || st.status === 'none') {
        box.innerHTML = `<p class="p-4 rounded-xl bg-slate-50 text-xs text-slate-500 text-center font-semibold">Murid belum menyetor hafalan di sesi ini.</p>`;
    } else if (st.status === 'submitted') {
        box.innerHTML = `
            <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                <p class="text-xs font-extrabold text-amber-900">Menunggu Verifikasi Anda</p>
                <input type="text" id="admin-vocab-feedback" placeholder="Catatan (misal: Good Job!)" class="hes-input !bg-white">
                <div class="flex gap-2">
                    <button onclick="updateVocabStatus('${email}','${m}',${w},${d},'approved')" class="hes-btn-primary !bg-emerald-600 flex-1">Terima (+25 XP)</button>
                    <button onclick="updateVocabStatus('${email}','${m}',${w},${d},'none')" class="hes-btn-soft">Reset</button>
                </div>
            </div>`;
    } else {
        box.innerHTML = `<div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex justify-between items-center"><span class="text-xs font-extrabold text-emerald-900">✓ Terverifikasi ("${st.feedback || 'Good Job!'}")</span><button onclick="updateVocabStatus('${email}','${m}',${w},${d},'none')" class="text-xs font-bold text-red-600">Batalkan</button></div>`;
    }
};

window.updateVocabStatus = async function(email, m, w, d, status) {
    const fb = document.getElementById('admin-vocab-feedback')?.value.trim() || '';
    await safeSaveMaterialsToCloud(materials => {
        materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status, feedback: fb };
    });
    checkVocabStatus();
    showToast('Status hafalan diperbarui!', 'success');
};

// TAB 4: EXAM BUILDER, SMART BULK IMPORT & GRADING
function computeAccurateCategoryScore(cat, examData, examResult) {
    const list = examData?.[cat] || [];
    if (!list.length) return 0;
    let totalPoints = 0;
    const maxPerQuestion = 100 / list.length;

    list.forEach((q, idx) => {
        const key = `${cat}_${idx}`;
        const ans = examResult?.answers?.[key];
        const manualPoint = examResult?.scores?.[key];

        if (q.type === 'mcq') {
            if (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) {
                totalPoints += maxPerQuestion;
            }
        } else {
            if (manualPoint !== undefined && manualPoint !== null && manualPoint !== '') {
                const num = parseFloat(manualPoint) || 0;
                totalPoints += (num <= 10 ? (num / 10) * maxPerQuestion : (num / 100) * maxPerQuestion);
            } else if (ans && String(ans).trim() !== '') {
                if (cat === 'speaking' && String(ans).startsWith('data:audio')) {
                    totalPoints += maxPerQuestion * 0.85;
                } else {
                    const target = String(q.answer || '').trim().toLowerCase();
                    const studentStr = String(ans).trim().toLowerCase();
                    if (target && studentStr === target) {
                        totalPoints += maxPerQuestion;
                    } else if (target) {
                        const keywords = target.split(/[,/|\s]+/).filter(w => w.length > 2);
                        if (keywords.length > 0) {
                            const matched = keywords.filter(kw => studentStr.includes(kw)).length;
                            const ratio = Math.max(0.5, matched / keywords.length);
                            totalPoints += maxPerQuestion * Math.min(1, ratio);
                        } else {
                            totalPoints += maxPerQuestion * 0.8;
                        }
                    } else {
                        totalPoints += maxPerQuestion * 0.85;
                    }
                }
            }
        }
    });
    return Math.min(100, Math.round(totalPoints));
}

window.loadAdminExamData = async function() {
    await syncFromCloud();
    adminExamState.student = document.getElementById('admin-exam-student').value;
    adminExamState.month = document.getElementById('admin-exam-month').value;
    const saved = window.HES.materials[`exam-${adminExamState.student}-${adminExamState.month}`];
    adminExamState.data = saved ? JSON.parse(JSON.stringify(saved)) : { listening: [], speaking: [], reading: [], writing: [] };
    ['listening', 'speaking', 'reading', 'writing'].forEach(k => {
        if (!Array.isArray(adminExamState.data[k])) adminExamState.data[k] = [];
    });
    document.getElementById('admin-grading-workspace').classList.add('hidden');
    document.getElementById('admin-exam-workspace').classList.remove('hidden');
    switchExamTab(adminExamState.activeTab || 'listening');
};

window.switchExamTab = function(tab) {
    window.stopNaturalEnglishTTS();
    adminExamState.activeTab = tab;
    ['listening', 'speaking', 'reading', 'writing'].forEach(t => {
        const count = (adminExamState.data?.[t] || []).length;
        const btn = document.getElementById(`tab-${t}`);
        if (btn) {
            btn.innerHTML = `<span class="capitalize">${t}</span> <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] ${count === 10 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">${count}/10</span>`;
            btn.className = `px-4 py-3 text-xs font-extrabold border-b-2 transition ${t === tab ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500'}`;
        }
    });
    renderExamQuestions();
};

window.copyGeminiExamPrompt = function() {
    const promptText = `Buatkan saya paket soal ujian bahasa Inggris tentang materi: [ISI TOPIK MATERI DI SINI].
Buat masing-masing 10 soal untuk 4 bagian (Listening, Speaking, Reading, Writing) dalam 4 kotak code block terpisah dengan format persis seperti di bawah ini agar bisa langsung saya copy-paste ke sistem saya. Gunakan pemisah === antar soal.

1. FORMAT KOTAK LISTENING (10 Soal Pilihan Ganda):
AUDIO: Man: [kalimat pria] / Woman: [kalimat wanita]
Q: [Pertanyaan bahasa Inggris]
A: [Pilihan A]
B: [Pilihan B]
C: [Pilihan C]
D: [Pilihan D]
KEY: [Huruf A/B/C/D]
EXP: [Pembahasan singkat bahasa Indonesia]
===

2. FORMAT KOTAK SPEAKING (10 Soal Baca Nyaring / Speaking):
Q: [Instruksi soal]
TARGET: [Kalimat bahasa Inggris yang harus diucapkan murid]
EXP: [Tips pelafalan bahasa Indonesia]
===

3. FORMAT KOTAK READING (10 Soal Pilihan Ganda):
Q: [Teks pendek & pertanyaan bahasa Inggris]
A: [Pilihan A]
B: [Pilihan B]
C: [Pilihan C]
D: [Pilihan D]
KEY: [Huruf A/B/C/D]
EXP: [Pembahasan singkat bahasa Indonesia]
===

4. FORMAT KOTAK WRITING (10 Soal Isian / Essay):
Q: [Instruksi & soal bahasa Inggris]
KEY: [Kunci jawaban bahasa Inggris]
EXP: [Pembahasan singkat bahasa Indonesia]
===`;

    navigator.clipboard.writeText(promptText).then(() => {
        showToast('Prompt Gemini berhasil disalin! Tempelkan ke Gemini untuk membuat soal.', 'success');
    }).catch(() => {
        showToast('Gagal menyalin otomatis.', 'error');
    });
};

window.toggleBulkImportBox = function() {
    const box = document.getElementById('bulk-import-box');
    if (box) box.classList.toggle('hidden');
};

window.processBulkExamImport = async function(replaceExisting = true) {
    const raw = document.getElementById('bulk-import-textarea')?.value.trim();
    if (!raw) return showToast('Tempelkan teks daftar soal terlebih dahulu!', 'error');

    const tab = adminExamState.activeTab;
    let blocks = raw.split(/\n\s*(?:===+|---+)\s*\n/).map(b => b.trim()).filter(Boolean);
    if (blocks.length === 1) {
        blocks = raw.split(/\n{2,}(?=(?:Soal\s*#?\d+|AUDIO\s*:|Q\s*:|1\s*:))/i).map(b => b.trim()).filter(Boolean);
    }

    const parsedQuestions = [];

    blocks.forEach((block, bIdx) => {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l && !/^soal\s*#?\d+/i.test(l));
        if (!lines.length) return;

        let audioLines = [], question = '', optA = '', optB = '', optC = '', optD = '', key = '', exp = '';
        let currentField = '';

        lines.forEach(line => {
            if (/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:/i.test(line)) {
                currentField = 'audio';
                const rest = line.replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/i, '').trim();
                if (rest) audioLines.push(rest);
            } else if (/^(?:Q|QUESTION|PERTANYAAN|SOAL)\s*:/i.test(line)) {
                currentField = 'q';
                question = line.replace(/^(?:Q|QUESTION|PERTANYAAN|SOAL)\s*:\s*/i, '');
            } else if (/^A\s*[.:)]\s*/i.test(line)) {
                currentField = 'a';
                optA = line.replace(/^A\s*[.:)]\s*/i, '');
            } else if (/^B\s*[.:)]\s*/i.test(line)) {
                currentField = 'b';
                optB = line.replace(/^B\s*[.:)]\s*/i, '');
            } else if (/^C\s*[.:)]\s*/i.test(line)) {
                currentField = 'c';
                optC = line.replace(/^C\s*[.:)]\s*/i, '');
            } else if (/^D\s*[.:)]\s*/i.test(line)) {
                currentField = 'd';
                optD = line.replace(/^D\s*[.:)]\s*/i, '');
            } else if (/^(?:KEY|ANSWER|TARGET|KUNCI|JAWABAN)\s*:/i.test(line)) {
                currentField = 'key';
                key = line.replace(/^(?:KEY|ANSWER|TARGET|KUNCI|JAWABAN)\s*:\s*/i, '');
            } else if (/^(?:EXP|EXPLANATION|PEMBAHASAN|TIPS)\s*:/i.test(line)) {
                currentField = 'exp';
                exp = line.replace(/^(?:EXP|EXPLANATION|PEMBAHASAN|TIPS)\s*:\s*/i, '');
            } else if (/^1\s*:\s*/.test(line)) {
                currentField = 'q';
                question = line.replace(/^1\s*:\s*/, '');
            } else if (/^2\s*:\s*/.test(line)) {
                currentField = 'key';
                key = line.replace(/^2\s*:\s*/, '');
            } else if (/^3\s*:\s*/.test(line)) {
                currentField = 'exp';
                exp = line.replace(/^3\s*:\s*/, '');
            } else if (/^4\s*:\s*/.test(line) && tab === 'listening') {
                currentField = 'audio';
                audioLines.push(line.replace(/^4\s*:\s*/, ''));
            } else if (tab === 'listening' && (currentField === 'audio' || /^(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB])\s*:/i.test(line))) {
                audioLines.push(line);
            } else if (currentField === 'q') {
                question += '\n' + line;
            }
        });

        const audioScript = audioLines.join('\n')
            .replace(/\s*[\/|]\s*/g, '\n')
            .replace(/(^|\s+)(?=(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB]|Kevin|Sarah|David|Dina|Nadia|Sinta|Raka|Budi|Andi|Customer|Waiter)\s*:)/gi, '\n')
            .trim();
        if (!question && !audioScript) return;

        const hasMCQOptions = Boolean(optA || optB || optC || optD);
        const qType = (tab === 'speaking' || tab === 'writing') ? 'essay' : (hasMCQOptions ? 'mcq' : 'essay');

        let finalAnswer = key;
        if (qType === 'mcq') {
            const letter = String(key || 'A').trim().toUpperCase().charAt(0);
            finalAnswer = { A: 0, B: 1, C: 2, D: 3 }[letter] ?? 0;
        }

        parsedQuestions.push({
            id: `${Date.now()}_${bIdx}`,
            type: qType,
            question: question || `Question #${bIdx + 1}`,
            audioScript: audioScript,
            mediaUrl: '',
            options: qType === 'mcq' ? [optA, optB, optC, optD] : [],
            answer: finalAnswer,
            explanation: exp
        });
    });

    if (!parsedQuestions.length) {
        return showToast('Format teks belum sesuai. Gunakan format Q:, KEY:, EXP: sesuai contoh.', 'error');
    }

    if (replaceExisting) {
        adminExamState.data[tab] = parsedQuestions;
    } else {
        adminExamState.data[tab] = [...(adminExamState.data[tab] || []), ...parsedQuestions];
    }

    switchExamTab(tab);
    await saveAdminExamData();
    showToast(`${parsedQuestions.length} soal ${tab.toUpperCase()} berhasil diinput & disimpan sekaligus!`, 'success');
};

window.addExamQuestion = function(type) {
    const tab = adminExamState.activeTab;
    const defaultType = tab === 'speaking' ? 'essay' : type;
    adminExamState.data[tab].push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        type: defaultType,
        question: '',
        audioScript: '',
        mediaUrl: '',
        options: defaultType === 'mcq' ? ['', '', '', ''] : [],
        answer: defaultType === 'mcq' ? 0 : '',
        explanation: ''
    });
    switchExamTab(tab);
};

window.removeExamQuestion = function(idx) {
    adminExamState.data[adminExamState.activeTab].splice(idx, 1);
    switchExamTab(adminExamState.activeTab);
};

window.updateExamField = function(idx, field, val, optIdx = null) {
    const q = adminExamState.data[adminExamState.activeTab][idx];
    if (!q) return;
    if (optIdx !== null) q.options[optIdx] = val;
    else if (field === 'answer' && q.type === 'mcq') q.answer = parseInt(val) || 0;
    else if (field === 'audioScript') {
        q.audioScript = String(val || '')
            .replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/gim, '')
            .replace(/\s*[\/|]\s*/g, '\n')
            .replace(/(^|\s+)(?=(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB]|Kevin|Sarah|David|Dina|Nadia|Sinta|Raka|Budi|Andi|Customer|Waiter)\s*:)/gi, '\n')
            .trim();
    } else q[field] = val;
};

function getFormatPlaceholderForTab(tab) {
    if (tab === 'listening') {
        return `AUDIO: Man: Do you want to watch the new movie tonight? / Woman: I really want to go, but I have to finish my report.\nQ: Why can't the woman go to the cinema tonight?\nA: She doesn't like movies.\nB: She has to finish her report.\nC: She wants to visit her parents.\nD: She already watched it.\nKEY: B\nEXP: Pembahasan singkat...\n===\n(Tempelkan soal ke-2 s/d ke-10 di bawahnya...)`;
    }
    if (tab === 'speaking') {
        return `Q: Read the following sentence aloud clearly: "I like to learn new languages in my free time."\nTARGET: I like to learn new languages in my free time.\nEXP: Perhatikan pelafalan akhiran -s pada languages.\n===\n(Tempelkan soal ke-2 s/d ke-10 di bawahnya...)`;
    }
    if (tab === 'reading') {
        return `Q: Please don't knock on the door at 10 AM tomorrow because the students ___ their speaking test.\nA: will take\nB: will be taking\nC: have taken\nD: took\nKEY: B\nEXP: Kegiatan yang sedang berlangsung di masa depan menggunakan will be + V-ing.\n===\n(Tempelkan soal ke-2 s/d ke-10 di bawahnya...)`;
    }
    return `Q: Complete using Simple Future Tense: "I __________ (send) the meeting link in five minutes."\nKEY: will send\nEXP: Janji spontan menggunakan will + V1.\n===\n(Tempelkan soal ke-2 s/d ke-10 di bawahnya...)`;
}

function renderExamQuestions() {
    const box = document.getElementById('admin-exam-questions-container');
    const tab = adminExamState.activeTab;
    const list = adminExamState.data[tab] || [];

    const bulkImportUI = `
        <div class="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                    <h4 class="text-xs sm:text-sm font-extrabold text-indigo-950 uppercase flex items-center gap-1.5">
                        <i class="fas fa-bolt text-amber-500"></i> Bagian ${tab} • ${list.length} / 10 Soal (Dual Engine: 👨 Man & 👩 Woman US)
                    </h4>
                    <p class="text-xs text-slate-600 mt-0.5">
                        Klik <strong>Input Cepat 10 Soal Sekaligus</strong> untuk menempelkan 10 soal langsung dari Gemini.
                    </p>
                </div>
                <div class="flex flex-wrap gap-2 shrink-0">
                    <button type="button" onclick="copyGeminiExamPrompt()" class="px-3 py-2 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold transition cursor-pointer">
                        <i class="fas fa-copy mr-1"></i> Salin Prompt Gemini
                    </button>
                    <button type="button" onclick="toggleBulkImportBox()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer">
                        <i class="fas fa-paste mr-1"></i> Input Cepat 10 Soal Sekaligus
                    </button>
                </div>
            </div>

            <div id="bulk-import-box" class="hidden pt-3 border-t border-indigo-200/70 space-y-2.5">
                <div class="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                    <span>Tempelkan 10 soal untuk bagian <strong>${tab.toUpperCase()}</strong> di bawah ini (pisahkan antar soal dengan <code>===</code>):</span>
                    <span class="text-slate-500">Mendukung format <code>Q: / KEY: / EXP:</code> maupun <code>1: / 2: / 3:</code></span>
                </div>
                <textarea id="bulk-import-textarea" rows="8" class="hes-input !bg-white font-mono text-xs" placeholder="${getFormatPlaceholderForTab(tab)}"></textarea>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="processBulkExamImport(true)" class="hes-btn-primary !bg-emerald-600 hover:!bg-emerald-700 flex-1 !py-2.5 !text-xs cursor-pointer">
                        <i class="fas fa-magic"></i> Proses & Ganti Semua Soal ${tab.toUpperCase()} Sekaligus
                    </button>
                    <button type="button" onclick="processBulkExamImport(false)" class="hes-btn-soft !bg-white !py-2.5 !text-xs cursor-pointer">
                        + Tambahkan ke Daftar Bawah
                    </button>
                </div>
            </div>
        </div>
    `;

    if (!list.length) {
        box.innerHTML = bulkImportUI + `<p class="text-xs text-slate-400 text-center py-8">Belum ada soal di bagian ${tab.toUpperCase()}. Klik tombol <strong>Input Cepat 10 Soal Sekaligus</strong> di atas untuk menempelkan 10 soal langsung.</p>`;
        return;
    }

    box.innerHTML = bulkImportUI + list.map((q, idx) => {
        const scriptVal = q.audioScript || (!String(q.mediaUrl || '').startsWith('http') ? (q.mediaUrl || '') : '');
        const mp3Val = String(q.mediaUrl || '').startsWith('http') ? q.mediaUrl : '';

        return `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">Soal #${idx + 1}</span>
                    <span class="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold">10 Poin</span>
                    <span class="text-xs font-bold text-slate-400">(${q.type === 'mcq' ? 'Pilihan Ganda' : (tab === 'speaking' ? 'Rekaman Suara' : 'Essay / Isian')})</span>
                </div>
                <button type="button" onclick="removeExamQuestion(${idx})" class="text-xs text-red-500 hover:text-red-700 font-bold"><i class="fas fa-trash mr-1"></i>Hapus</button>
            </div>

            ${tab === 'listening' ? `
                <div class="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-extrabold text-indigo-700"><i class="fas fa-headphones-alt mr-1"></i> Naskah Audio Listening (👨 Man = Pria US, 👩 Woman = Wanita US)</label>
                        <button type="button" onclick="playNaturalEnglishTTS(document.getElementById('script_${idx}').value, this)" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition cursor-pointer">
                            <i class="fas fa-play mr-1"></i> Tes Suara US
                        </button>
                    </div>
                    <textarea id="script_${idx}" oninput="updateExamField(${idx},'audioScript',this.value)" rows="2" placeholder="Man: ...&#10;Woman: ..." class="hes-input !bg-slate-50 text-xs">${scriptVal}</textarea>
                    <input type="text" onchange="updateExamField(${idx},'mediaUrl',this.value)" value="${mp3Val}" placeholder="Opsional: Kosongkan saja jika memakai suara otomatis di atas" class="hes-input !bg-slate-50 !py-1.5 text-[11px]">
                </div>
            ` : ''}

            <div>
                <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pertanyaan / Instruksi Soal #${idx + 1}</label>
                <textarea oninput="updateExamField(${idx},'question',this.value)" rows="2" class="hes-input !bg-white">${q.question || ''}</textarea>
            </div>

            ${q.type === 'mcq' ? `
                <div class="space-y-2 pt-1">
                    <p class="text-[11px] font-bold text-emerald-700 uppercase">Kunci Jawaban Benar (+10 Poin Otomatis):</p>
                    ${['A', 'B', 'C', 'D'].map((l, oIdx) => `
                        <div class="flex items-center gap-2">
                            <input type="radio" name="corr_${tab}_${idx}" ${Number(q.answer) === oIdx ? 'checked' : ''} onchange="updateExamField(${idx},'answer',${oIdx})">
                            <span class="text-xs font-extrabold w-5">${l}.</span>
                            <input type="text" value="${q.options?.[oIdx] || ''}" oninput="updateExamField(${idx},'options',this.value,${oIdx})" placeholder="Pilihan ${l}" class="hes-input !bg-white !py-1.5">
                        </div>`).join('')}
                </div>
            ` : `
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="text-[11px] font-bold text-emerald-700 uppercase">${tab === 'speaking' ? 'Kalimat Target / Kunci Pelafalan US' : 'Kunci Jawaban / Kriteria'}</label>
                        ${tab === 'speaking' ? `<button type="button" onclick="playNaturalEnglishTTS(document.getElementById('ans_key_${idx}').value, this)" class="text-[11px] font-extrabold text-indigo-600 hover:underline cursor-pointer"><i class="fas fa-volume-up mr-1"></i>Tes Pelafalan US</button>` : ''}
                    </div>
                    <textarea id="ans_key_${idx}" oninput="updateExamField(${idx},'answer',this.value)" rows="2" class="hes-input !bg-white">${q.answer || ''}</textarea>
                </div>
            `}

            <input type="text" oninput="updateExamField(${idx},'explanation',this.value)" value="${q.explanation || ''}" placeholder="Pembahasan / catatan evaluasi..." class="hes-input !bg-white">
        </div>`;
    }).join('');
}

window.saveAdminExamData = async function() {
    const key = `exam-${adminExamState.student}-${adminExamState.month}`;
    const { error } = await safeSaveMaterialsToCloud(materials => {
        materials[key] = adminExamState.data;
    });
    if (!error) showToast('Seluruh soal ujian berhasil disimpan ke Cloud!', 'success');
    else showToast('Gagal menyimpan soal: ' + error.message, 'error');
};

window.resetStudentExam = async function() {
    const s = document.getElementById('admin-exam-student').value, m = document.getElementById('admin-exam-month').value;
    if (!confirm(`Reset hasil ujian ${s} pada ${m.toUpperCase()}?`)) return;
    await safeSaveMaterialsToCloud(materials => {
        delete materials[`exam_result-${s}-${m}`];
    });
    document.getElementById('admin-grading-workspace').classList.add('hidden');
    showToast('Hasil ujian murid berhasil direset.', 'info');
};

window.loadStudentExamForGrading = async function() {
    const s = document.getElementById('admin-exam-student').value;
    const m = document.getElementById('admin-exam-month').value;
    document.getElementById('admin-exam-workspace').classList.add('hidden');
    const ws = document.getElementById('admin-grading-workspace');
    ws.classList.remove('hidden');
    ws.innerHTML = `<div class="p-8 text-center text-xs font-bold text-slate-500"><i class="fas fa-sync fa-spin mr-1.5"></i> Mengambil data ujian terbaru dari Cloud...</div>`;

    await syncFromCloud();
    renderAdminGradingView(s, m);
};

window.updateQuestionManualPoint = function(email, monthId, cat, idx, val10) {
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (!res) return;
    res.scores = res.scores || {};
    const num10 = Math.max(0, Math.min(10, parseFloat(val10) || 0));
    res.scores[`${cat}_${idx}`] = num10;
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    res.sectionScores = res.sectionScores || {};
    res.sectionScores[cat] = computeAccurateCategoryScore(cat, examData, res);
    const badgeEl = document.getElementById(`grade-tab-btn-${cat}`);
    if (badgeEl) badgeEl.innerText = `${cat} (${res.sectionScores[cat]}/100)`;
};

window.updateQuestionNote = function(email, monthId, cat, idx, noteText) {
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (!res) return;
    res.questionNotes = res.questionNotes || {};
    res.questionNotes[`${cat}_${idx}`] = noteText;
};

window.renderAdminGradingView = function(email, monthId) {
    const ws = document.getElementById('admin-grading-workspace');
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];

    if (!examData) {
        ws.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Soal ujian belum dibuat untuk murid & bulan ini.</p>`;
        return;
    }
    if (!res || (!res.answers && !res.submittedTabs?.length)) {
        ws.innerHTML = `
            <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                <p class="text-xs font-bold text-slate-500">Murid belum mengumpulkan jawaban ujian pada bulan ini.</p>
                <button onclick="loadStudentExamForGrading()" class="hes-btn-soft !py-2 !px-4 !text-xs"><i class="fas fa-sync-alt mr-1"></i> Muat Ulang Data Cloud</button>
            </div>`;
        return;
    }

    res.answers = res.answers || {};
    res.scores = res.scores || {};
    res.questionNotes = res.questionNotes || {};
    res.sectionScores = res.sectionScores || {};

    const cats = ['reading', 'writing', 'speaking', 'listening'];
    cats.forEach(c => {
        res.sectionScores[c] = computeAccurateCategoryScore(c, examData, res);
    });

    const cat = currentAdminGradingTab;
    const questions = examData[cat] || [];
    const maxPts = questions.length ? Math.round((100 / questions.length) * 10) / 10 : 10;

    ws.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 rounded-2xl">
                <div class="flex flex-wrap gap-1.5">
                    ${cats.map(c => {
                        const isSub = res.submittedTabs?.includes(c);
                        return `<button id="grade-tab-btn-${c}" onclick="currentAdminGradingTab='${c}';renderAdminGradingView('${email}','${monthId}')" class="px-4 py-2 rounded-xl text-xs font-extrabold capitalize transition ${c === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'}">${c} (${res.sectionScores[c]}/100) ${isSub ? '✓' : ''}</button>`;
                    }).join('')}
                </div>
                <span class="text-[11px] font-extrabold text-slate-500 px-2">Standar: 10 Poin / Soal</span>
            </div>

            ${!questions.length ? `<p class="text-xs text-slate-400 text-center py-6">Tidak ada soal pada bagian ${cat.toUpperCase()}.</p>` : questions.map((q, idx) => {
                const key = `${cat}_${idx}`;
                const ans = res.answers[key];
                const isMCQ = q.type === 'mcq';
                const transcript = res.transcripts?.[key] || '';

                let currentPoint10 = 0;
                if (isMCQ) {
                    currentPoint10 = (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) ? 10 : 0;
                } else if (res.scores[key] !== undefined && res.scores[key] !== '') {
                    const rawSc = parseFloat(res.scores[key]) || 0;
                    currentPoint10 = rawSc <= 10 ? rawSc : Math.round((rawSc / 100) * 10 * 10) / 10;
                } else if (ans && String(ans).trim() !== '') {
                    currentPoint10 = 8.5;
                    res.scores[key] = currentPoint10;
                }

                let disp = '';
                if (isMCQ) {
                    disp = (ans !== undefined && ans !== '') ? `<strong>${['A','B','C','D'][ans] || ''}.</strong> ${q.options?.[ans] || ''}` : '<span class="text-red-500 italic">Tidak dijawab</span>';
                } else if (String(ans || '').startsWith('data:audio')) {
                    disp = `
                        <div class="space-y-2 mt-1">
                            <audio controls preload="metadata" class="h-10 w-full max-w-md rounded-lg" src="${ans}"></audio>
                            <div class="flex flex-wrap items-center gap-3">
                                <a href="${ans}" download="rekaman_${email}_soal_${idx + 1}.webm" class="text-[11px] font-extrabold text-indigo-600 hover:underline"><i class="fas fa-download mr-1"></i>Unduh Audio Rekaman</a>
                                ${transcript ? `<span class="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg"><strong>Transkrip Otomatis:</strong> "${transcript}"</span>` : ''}
                            </div>
                        </div>`;
                } else {
                    disp = ans ? `<p class="whitespace-pre-line font-semibold text-slate-800">${ans}</p>` : '<span class="text-red-500 italic">Tidak mengumpulkan rekaman / jawaban</span>';
                }

                return `
                    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                        <div class="flex items-center justify-between">
                            <span class="font-extrabold text-slate-800">Soal #${idx + 1}: ${q.question || ''}</span>
                            <span class="px-2.5 py-0.5 rounded-md font-extrabold ${currentPoint10 >= 7 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">Maks ${maxPts} Poin</span>
                        </div>
                        ${q.audioScript ? `<p class="text-[11px] text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg whitespace-pre-line"><strong>Naskah Audio:</strong>\n${q.audioScript}</p>` : ''}
                        <div class="p-3 rounded-xl bg-white border border-slate-200/80">
                            <strong class="text-slate-500 uppercase text-[10px]">Jawaban / Rekaman Murid:</strong>
                            <div class="mt-1">${disp}</div>
                        </div>
                        ${isMCQ ? `
                            <div class="flex items-center justify-between pt-1">
                                <span class="text-slate-500">Kunci Jawaban: <strong>${['A','B','C','D'][q.answer] || 'A'}. ${q.options?.[q.answer] || ''}</strong></span>
                                <span class="font-extrabold ${currentPoint10 === 10 ? 'text-emerald-600' : 'text-red-600'}">${currentPoint10 === 10 ? '✓ Benar (+10 / 10 Poin Otomatis)' : '✗ Salah (0 / 10 Poin)'}</span>
                            </div>
                        ` : `
                            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 items-center">
                                <div class="sm:col-span-4 flex items-center gap-2">
                                    <label class="font-extrabold text-emerald-700 shrink-0">Poin (0–10):</label>
                                    <input type="number" min="0" max="10" step="0.5" value="${currentPoint10}" oninput="updateQuestionManualPoint('${email}','${monthId}','${cat}',${idx},this.value)" class="hes-input !w-24 !py-1.5 !bg-white text-center font-black">
                                    <span class="text-slate-400 font-bold">/ 10</span>
                                </div>
                                <div class="sm:col-span-8">
                                    <input type="text" value="${res.questionNotes?.[key] || ''}" oninput="updateQuestionNote('${email}','${monthId}','${cat}',${idx},this.value)" placeholder="Catatan koreksi untuk murid di soal #${idx + 1} (opsional)..." class="hes-input !py-1.5 !bg-white text-xs">
                                </div>
                            </div>
                        `}
                    </div>`;
            }).join('')}

            <div class="p-4 sm:p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-3.5 mt-4">
                <h4 class="text-xs font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <i class="fas fa-file-signature text-indigo-600"></i> Pengaturan Rapor (Report Card)
                </h4>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Kelas / Level Program (Ditulis Manual)</label>
                    <input type="text" id="admin-exam-level" value="${res.classLevel || ''}" oninput="window.HES.materials['exam_result-${email}-${monthId}'].classLevel=this.value" placeholder="Contoh: Beginner / Intermediate / Advanced / Conversation" class="hes-input !bg-white">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Tutor's Note (Catatan Evaluasi Pengajar)</label>
                    <textarea id="admin-exam-feedback" rows="3" oninput="window.HES.materials['exam_result-${email}-${monthId}'].adminFeedback=this.value" placeholder="Tulis catatan evaluasi perkembangan murid untuk ditampilkan di rapor..." class="hes-input !bg-white">${res.adminFeedback || ''}</textarea>
                </div>
            </div>

            <button onclick="saveExamGrades('${email}','${monthId}')" class="hes-btn-primary !bg-emerald-600 w-full">
                <i class="fas fa-check-circle"></i> Simpan Nilai & Terbitkan Rapor
            </button>
        </div>`;
};

window.saveExamGrades = async function(email, monthId) {
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    const rKey = `exam_result-${email}-${monthId}`;
    const res = window.HES.materials[rKey] || {};

    res.classLevel = document.getElementById('admin-exam-level')?.value.trim() || res.classLevel || '';
    res.adminFeedback = document.getElementById('admin-exam-feedback')?.value.trim() || res.adminFeedback || '';
    res.gradedAt = new Date().toISOString();
    res.sectionScores = res.sectionScores || {};
    ['reading', 'writing', 'speaking', 'listening'].forEach(c => {
        res.sectionScores[c] = computeAccurateCategoryScore(c, examData, res);
    });
    res.isGraded = true;

    const { error } = await safeSaveMaterialsToCloud(materials => {
        materials[rKey] = res;
    });
    if (!error) {
        renderAdminGradingView(email, monthId);
        showToast('Nilai disimpan & Rapor berhasil diterbitkan ke murid!', 'success');
    } else {
        showToast('Gagal menyimpan nilai: ' + error.message, 'error');
    }
};