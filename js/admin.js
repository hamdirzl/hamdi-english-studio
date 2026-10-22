// js/admin.js

let currentAdminTab = 'overview';
let adminExamState = { student: '', month: '', activeTab: 'listening', data: null };
let currentAdminGradingTab = 'reading';

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

// Safe Atomic Save agar data ujian murid tidak pernah tertimpa oleh cache lama
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

// Natural TTS Engine untuk Tes Audio di Admin
window.playNaturalEnglishTTS = function(text, btnEl = null) {
    if (!('speechSynthesis' in window)) return showToast('Browser tidak mendukung suara otomatis.', 'error');
    window.speechSynthesis.cancel();
    const cleanText = String(text || '').trim();
    if (!cleanText) return showToast('Tulis naskah audio terlebih dahulu.', 'error');

    const voices = window.speechSynthesis.getVoices();
    const pickVoice = (preferFemale = true) => {
        const enVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
        const pool = enVoices.length ? enVoices : voices;
        const naturalKeywords = preferFemale
            ? ['natural', 'aria', 'jenny', 'sonia', 'samantha', 'google us english', 'zira', 'female']
            : ['guy', 'christopher', 'eric', 'ryan', 'daniel', 'google uk english male', 'david', 'male'];
        for (const kw of naturalKeywords) {
            const found = pool.find(v => v.name.toLowerCase().includes(kw));
            if (found) return found;
        }
        return pool[0] || null;
    };

    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
    let idx = 0;
    const origHTML = btnEl ? btnEl.innerHTML : '';
    if (btnEl) btnEl.innerHTML = `<i class="fas fa-Stop"></i> Menghentikan...`;

    const speakNext = () => {
        if (idx >= lines.length) {
            if (btnEl) btnEl.innerHTML = origHTML;
            return;
        }
        let line = lines[idx++];
        let isMale = false;
        if (/^(man|male|boy|mr|speaker a|a)\s*:/i.test(line)) {
            isMale = true;
            line = line.replace(/^(man|male|boy|mr|speaker a|a)\s*:\s*/i, '');
        } else if (/^(woman|female|girl|mrs|ms|speaker b|b)\s*:/i.test(line)) {
            isMale = false;
            line = line.replace(/^(woman|female|girl|mrs|ms|speaker b|b)\s*:\s*/i, '');
        }
        const u = new SpeechSynthesisUtterance(line);
        const v = pickVoice(!isMale);
        if (v) u.voice = v;
        u.lang = v?.lang || 'en-US';
        u.rate = 0.92;
        u.pitch = isMale ? 0.95 : 1.02;
        u.onend = () => setTimeout(speakNext, 260);
        u.onerror = () => { if (btnEl) btnEl.innerHTML = origHTML; };
        window.speechSynthesis.speak(u);
    };

    if (voices.length === 0) {
        window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; speakNext(); };
    } else speakNext();
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

// TAB 4: EXAM BUILDER & GRADING (Standar 10 Soal x 10 Poin = 100 Poin)
function computeAccurateCategoryScore(cat, examData, examResult) {
    const list = examData?.[cat] || [];
    if (!list.length) return 0;
    let totalPoints = 0;
    const maxPerQuestion = 100 / list.length; // 10 poin jika 10 soal

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
                // Mendukung skala 0-10 maupun 0-100 jika data lama
                totalPoints += (num <= 10 ? (num / 10) * maxPerQuestion : (num / 100) * maxPerQuestion);
            } else if (ans && String(ans).trim() !== '') {
                // Auto-grading jika belum dinilai manual oleh Admin
                if (cat === 'speaking' && String(ans).startsWith('data:audio')) {
                    totalPoints += maxPerQuestion * 0.85; // Default 8.5/10 untuk rekaman yang masuk
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

// Buat 10 Slot Soal Sekaligus (Standar 10 Soal x 10 Poin)
window.generate10ExamSlots = function() {
    const tab = adminExamState.activeTab;
    const currentList = adminExamState.data[tab] || [];
    if (currentList.length >= 10) return showToast(`Bagian ${tab.toUpperCase()} sudah memiliki ${currentList.length} soal.`, 'info');
    const defaultType = (tab === 'listening' || tab === 'reading') ? 'mcq' : 'essay';
    while (adminExamState.data[tab].length < 10) {
        const num = adminExamState.data[tab].length + 1;
        adminExamState.data[tab].push({
            id: `${Date.now()}_${num}`,
            type: defaultType,
            question: tab === 'speaking' ? `Please read aloud or answer clearly (Question #${num}):` : '',
            audioScript: '',
            mediaUrl: '',
            options: defaultType === 'mcq' ? ['', '', '', ''] : [],
            answer: defaultType === 'mcq' ? 0 : '',
            explanation: ''
        });
    }
    switchExamTab(tab);
    showToast(`10 slot soal ${tab.toUpperCase()} siap diisi! (Masing-masing 10 Poin)`, 'success');
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
    else q[field] = val;
};

function renderExamQuestions() {
    const box = document.getElementById('admin-exam-questions-container');
    const tab = adminExamState.activeTab;
    const list = adminExamState.data[tab] || [];

    const headerBanner = `
        <div class="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
                <h4 class="text-xs sm:text-sm font-extrabold text-indigo-950 uppercase">
                    Bagian ${tab} • ${list.length} / 10 Soal (10 Poin / Soal = 100 Poin)
                </h4>
                <p class="text-xs text-slate-600 mt-0.5">
                    ${tab === 'listening'
                        ? '💡 <strong>Audio Otomatis Natural:</strong> Cukup ketik kalimat bahasa Inggris di kolom <em>Naskah Suara</em> (bisa dialog <code>Man: ...</code> / <code>Woman: ...</code>), tanpa perlu upload MP3!'
                        : tab === 'speaking'
                        ? '🎤 <strong>Speaking Otomatis:</strong> Murid wajib merekam suara. Isi kalimat yang harus diucapkan murid dan kriteria pelafalannya.'
                        : '✅ <strong>Penilaian Otomatis:</strong> Pilihan Ganda dinilai 10 poin otomatis. Soal Essay dinilai otomatis & bisa disesuaikan manual.'}
                </p>
            </div>
            ${list.length < 10 ? `
                <button type="button" onclick="generate10ExamSlots()" class="hes-btn-primary !bg-indigo-600 !py-2 !px-3.5 !text-xs shrink-0">
                    <i class="fas fa-magic"></i> Siapkan 10 Slot Soal
                </button>
            ` : `<span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold shrink-0">✓ Pas 10 Soal (100 Poin)</span>`}
        </div>
    `;

    if (!list.length) {
        box.innerHTML = headerBanner + `<p class="text-xs text-slate-400 text-center py-8">Belum ada soal di bagian ${tab.toUpperCase()}. Klik tombol <strong>Siapkan 10 Slot Soal</strong> di atas.</p>`;
        return;
    }

    box.innerHTML = headerBanner + list.map((q, idx) => {
        const scriptVal = q.audioScript || (!String(q.mediaUrl || '').startsWith('http') ? (q.mediaUrl || '') : '');
        const mp3Val = String(q.mediaUrl || '').startsWith('http') ? q.mediaUrl : '';

        return `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">Soal #${idx + 1}</span>
                    <span class="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold">Bobot: 10 Poin</span>
                    <span class="text-xs font-bold text-slate-400">(${q.type === 'mcq' ? 'Pilihan Ganda' : (tab === 'speaking' ? 'Rekaman Suara' : 'Essay / Isian')})</span>
                </div>
                <button type="button" onclick="removeExamQuestion(${idx})" class="text-xs text-red-500 hover:text-red-700 font-bold"><i class="fas fa-trash mr-1"></i>Hapus</button>
            </div>

            ${tab === 'listening' ? `
                <div class="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-extrabold text-indigo-700"><i class="fas fa-volume-up mr-1"></i> Naskah Audio Listening Otomatis (Suara Natural)</label>
                        <button type="button" onclick="playNaturalEnglishTTS(document.getElementById('script_${idx}').value, this)" class="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-extrabold transition">
                            <i class="fas fa-play mr-1"></i> Tes Suara Natural
                        </button>
                    </div>
                    <textarea id="script_${idx}" oninput="updateExamField(${idx},'audioScript',this.value)" rows="2" placeholder="Ketik naskah bahasa Inggris yang akan didengar murid (Contoh: Man: Where is the station? / Woman: It is next to the bank.)" class="hes-input !bg-slate-50 text-xs">${scriptVal}</textarea>
                    <input type="text" onchange="updateExamField(${idx},'mediaUrl',this.value)" value="${mp3Val}" placeholder="Opsional: Kosongkan saja jika memakai suara otomatis di atas (Atau tempel link MP3 Drive)" class="hes-input !bg-slate-50 !py-1.5 text-[11px]">
                </div>
            ` : ''}

            <div>
                <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pertanyaan / Instruksi Soal #${idx + 1}</label>
                <textarea oninput="updateExamField(${idx},'question',this.value)" rows="2" placeholder="${tab === 'speaking' ? 'Contoh: Read the following paragraph aloud with clear pronunciation: ...' : 'Tulis pertanyaan soal di sini...'}" class="hes-input !bg-white">${q.question || ''}</textarea>
            </div>

            ${q.type === 'mcq' ? `
                <div class="space-y-2 pt-1">
                    <p class="text-[11px] font-bold text-emerald-700 uppercase">Pilih Bulatan pada Kunci Jawaban yang Benar (+10 Poin Otomatis):</p>
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
                        <label class="text-[11px] font-bold text-emerald-700 uppercase">${tab === 'speaking' ? 'Kalimat Target / Kunci Pelafalan (Bisa Didengar Murid Setelah Dinilai)' : 'Kunci Jawaban / Kata Kunci Penilaian Otomatis'}</label>
                        ${tab === 'speaking' ? `<button type="button" onclick="playNaturalEnglishTTS(document.getElementById('ans_key_${idx}').value, this)" class="text-[11px] font-extrabold text-indigo-600 hover:underline"><i class="fas fa-volume-up mr-1"></i>Tes Pelafalan</button>` : ''}
                    </div>
                    <textarea id="ans_key_${idx}" oninput="updateExamField(${idx},'answer',this.value)" rows="2" placeholder="${tab === 'speaking' ? 'Tulis kalimat bahasa Inggris yang benar untuk contoh pelafalan bagi murid...' : 'Tulis jawaban benar / kata kunci agar bisa dinilai otomatis...'}" class="hes-input !bg-white">${q.answer || ''}</textarea>
                </div>
            `}

            <input type="text" oninput="updateExamField(${idx},'explanation',this.value)" value="${q.explanation || ''}" placeholder="Pembahasan / catatan evaluasi untuk soal ini (ditampilkan ke murid setelah selesai)..." class="hes-input !bg-white">
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

    // Paksa tarik langsung dari Supabase agar jawaban yang baru disubmit murid pasti masuk
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

                // Hitung poin default (skala 0-10)
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
                        ${q.audioScript ? `<p class="text-[11px] text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg"><strong>Naskah Audio:</strong> ${q.audioScript}</p>` : ''}
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

            <!-- Pengaturan Rapor Manual: Level Kelas & Tutor's Note -->
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