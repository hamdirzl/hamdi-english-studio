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
    const p = window.HES.materials[`profile-${email}`];
    p.reschedules = p.reschedules || {};
    p.reschedules[oldD] = newD;
    delete p.pendingReschedules[oldD];
    await saveToCloud('hes_materials', window.HES.materials);
    showToast('Jadwal baru disetujui!', 'success');
    renderAdminOverviewTab();
};

window.rejectReschedule = async function(email, oldD) {
    delete window.HES.materials[`profile-${email}`].pendingReschedules[oldD];
    await saveToCloud('hes_materials', window.HES.materials);
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
    const p = window.HES.materials[`profile-${email}`] || {};
    p.monthEndDates = p.monthEndDates || {};

    const mNum = document.getElementById('admin-sched-max-month').value || '1';
    const dVal = document.getElementById('admin-sched-date').value;
    if (dVal) { p.monthEndDates[`m${mNum}`] = dVal; p.validUntil = dVal; }

    p.maxMonth = Math.max(parseInt(mNum), ...Object.keys(p.monthEndDates).map(k => parseInt(k.replace('m', '')) || 1));
    if (p.monthEndDates[`m${p.maxMonth}`]) p.validUntil = p.monthEndDates[`m${p.maxMonth}`];

    const sT = document.getElementById('admin-sched-start').value, eT = document.getElementById('admin-sched-end').value;
    if (sT && eT) p.time = `${sT} - ${eT}`;
    p.days = Array.from(document.querySelectorAll('.admin-day-cb:checked')).map(cb => cb.value);

    window.HES.materials[`profile-${email}`] = p;
    await saveToCloud('hes_materials', window.HES.materials);
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

    if (link) window.HES.materials[`${pref}-${m}-w${w}-d${d}-link`] = link; else delete window.HES.materials[`${pref}-${m}-w${w}-d${d}-link`];
    if (recap) window.HES.materials[`${pref}-${m}-w${w}-d${d}-recap`] = recap; else delete window.HES.materials[`${pref}-${m}-w${w}-d${d}-recap`];

    await saveToCloud('hes_materials', window.HES.materials);
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
    window.HES.materials['master_wordbank'] = wb.value;
    window.HES.materials['master_wordbank_per_day'] = parseInt(document.getElementById('admin-words-per-day').value) || 5;
    await saveToCloud('hes_materials', window.HES.materials);
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
    if (val) window.HES.materials[`vocab-${m}-w${w}-d${d}`] = val; else delete window.HES.materials[`vocab-${m}-w${w}-d${d}`];
    await saveToCloud('hes_materials', window.HES.materials);
    loadAdminVocabPreview();
    showToast('Kosakata sesi disimpan!', 'success');
};

window.clearManualVocabOverride = async function() {
    const m = document.getElementById('admin-vocab-month').value, w = document.getElementById('admin-vocab-week').value, d = document.getElementById('admin-vocab-day').value;
    delete window.HES.materials[`vocab-${m}-w${w}-d${d}`];
    await saveToCloud('hes_materials', window.HES.materials);
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
    window.HES.materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status, feedback: fb };
    await saveToCloud('hes_materials', window.HES.materials);
    checkVocabStatus();
    showToast('Status hafalan diperbarui!', 'success');
};

// TAB 4: EXAM BUILDER & GRADING
window.loadAdminExamData = function() {
    adminExamState.student = document.getElementById('admin-exam-student').value;
    adminExamState.month = document.getElementById('admin-exam-month').value;
    adminExamState.data = window.HES.materials[`exam-${adminExamState.student}-${adminExamState.month}`] || { listening: [], speaking: [], reading: [], writing: [] };
    document.getElementById('admin-grading-workspace').classList.add('hidden');
    document.getElementById('admin-exam-workspace').classList.remove('hidden');
    switchExamTab('listening');
};

window.switchExamTab = function(tab) {
    adminExamState.activeTab = tab;
    ['listening', 'speaking', 'reading', 'writing'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (btn) btn.className = `px-5 py-3 text-xs font-extrabold border-b-2 ${t === tab ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500'}`;
    });
    renderExamQuestions();
};

window.addExamQuestion = function(type) {
    adminExamState.data[adminExamState.activeTab].push({ id: Date.now().toString(), type, question: '', mediaUrl: '', options: type === 'mcq' ? ['', '', '', ''] : [], answer: type === 'mcq' ? 0 : '', explanation: '' });
    renderExamQuestions();
};

window.removeExamQuestion = function(idx) {
    adminExamState.data[adminExamState.activeTab].splice(idx, 1);
    renderExamQuestions();
};

window.updateExamField = function(idx, field, val, optIdx = null) {
    const q = adminExamState.data[adminExamState.activeTab][idx];
    if (optIdx !== null) q.options[optIdx] = val; else q[field] = val;
};

function renderExamQuestions() {
    const box = document.getElementById('admin-exam-questions-container');
    const list = adminExamState.data[adminExamState.activeTab] || [];
    if (!list.length) { box.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Belum ada soal di bagian ${adminExamState.activeTab.toUpperCase()}.</p>`; return; }

    box.innerHTML = list.map((q, idx) => `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div class="flex justify-between items-center">
                <span class="text-xs font-extrabold text-slate-700">Soal #${idx + 1} (${q.type.toUpperCase()})</span>
                <button onclick="removeExamQuestion(${idx})" class="text-xs text-red-500 font-bold">Hapus</button>
            </div>
            <textarea onchange="updateExamField(${idx},'question',this.value)" rows="2" placeholder="Pertanyaan..." class="hes-input !bg-white">${q.question}</textarea>
            <input type="text" onchange="updateExamField(${idx},'mediaUrl',this.value)" value="${q.mediaUrl || ''}" placeholder="Opsional: Link MP3 Google Drive (Listening)" class="hes-input !bg-white">
            ${q.type === 'mcq' ? ['A', 'B', 'C', 'D'].map((l, oIdx) => `
                <div class="flex items-center gap-2">
                    <input type="radio" name="corr_${idx}" ${q.answer == oIdx ? 'checked' : ''} onchange="updateExamField(${idx},'answer',${oIdx})">
                    <span class="text-xs font-bold w-4">${l}.</span>
                    <input type="text" value="${q.options[oIdx]}" onchange="updateExamField(${idx},'options',this.value,${oIdx})" class="hes-input !bg-white !py-1.5">
                </div>`).join('') : `<textarea onchange="updateExamField(${idx},'answer',this.value)" rows="2" placeholder="Kriteria jawaban benar..." class="hes-input !bg-white">${q.answer}</textarea>`}
            <input type="text" onchange="updateExamField(${idx},'explanation',this.value)" value="${q.explanation || ''}" placeholder="Penjelasan / pembahasan soal..." class="hes-input !bg-white">
        </div>`).join('');
}

window.saveAdminExamData = async function() {
    window.HES.materials[`exam-${adminExamState.student}-${adminExamState.month}`] = adminExamState.data;
    await saveToCloud('hes_materials', window.HES.materials);
    showToast('Soal ujian berhasil disimpan!', 'success');
};

window.resetStudentExam = async function() {
    const s = document.getElementById('admin-exam-student').value, m = document.getElementById('admin-exam-month').value;
    if (!confirm(`Reset hasil ujian ${s} pada ${m.toUpperCase()}?`)) return;
    delete window.HES.materials[`exam_result-${s}-${m}`];
    await saveToCloud('hes_materials', window.HES.materials);
    document.getElementById('admin-grading-workspace').classList.add('hidden');
    showToast('Hasil ujian murid direset.', 'info');
};

window.loadStudentExamForGrading = async function() {
    const s = document.getElementById('admin-exam-student').value, m = document.getElementById('admin-exam-month').value;
    document.getElementById('admin-exam-workspace').classList.add('hidden');
    const ws = document.getElementById('admin-grading-workspace');
    ws.classList.remove('hidden');
    await syncFromCloud();
    renderAdminGradingView(s, m);
};

window.renderAdminGradingView = function(email, monthId) {
    const ws = document.getElementById('admin-grading-workspace');
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (!examData || !res?.answers) { ws.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Murid belum mengumpulkan jawaban ujian.</p>`; return; }

    res.scores = res.scores || {};
    res.sectionScores = res.sectionScores || {};
    const cats = ['reading', 'writing', 'speaking', 'listening'];
    cats.forEach(c => res.sectionScores[c] = calculateCategoryScore(c, examData, res));

    const cat = currentAdminGradingTab;
    const questions = examData[cat] || [];

    ws.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
                ${cats.map(c => `<button onclick="currentAdminGradingTab='${c}';renderAdminGradingView('${email}','${monthId}')" class="px-4 py-2 rounded-xl text-xs font-extrabold capitalize ${c === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}">${c} (${res.sectionScores[c]}/100)</button>`).join('')}
            </div>
            ${questions.map((q, idx) => {
                const ans = res.answers[`${cat}_${idx}`];
                const isMCQ = q.type === 'mcq';
                let disp = isMCQ && ans !== undefined ? q.options[ans] : (ans || 'Tidak dijawab');
                if (!isMCQ && String(ans).startsWith('data:audio')) disp = `<audio controls class="h-9 w-full max-w-sm mt-1" src="${ans}"></audio>`;
                return `
                    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <p class="font-extrabold text-slate-800">Soal #${idx + 1}:${q.question}</p>
                        <div class="p-3 rounded-xl bg-white border"><strong>Jawaban Murid:</strong><div class="mt-1">${disp}</div></div>${!isMCQ ? `
                            <div class="flex items-center justify-between pt-2">
                                <span class="font-bold text-emerald-700">Nilai Manual (0-100):</span>
                                <input type="number" min="0" max="100" value="${res.scores[`${cat}_${idx}`] || 0}" oninput="window.HES.materials['exam_result-${email}-${monthId}'].scores['${cat}_${idx}']=parseFloat(this.value)||0" class="hes-input !w-28 !bg-white text-center">
                            </div>` : `<p class="font-bold ${ans == q.answer ? 'text-emerald-600' : 'text-red-600'}">${ans == q.answer ? '✓ Benar (+100)' : '✗ Salah (0)'}</p>`}
                    </div>`;
            }).join('')}
            <textarea id="admin-exam-feedback" rows="3" placeholder="Catatan feedback untuk rapor murid..." class="hes-input">${res.adminFeedback || ''}</textarea>
            <button onclick="saveExamGrades('${email}','${monthId}')" class="hes-btn-primary !bg-emerald-600 w-full">Simpan Nilai & Terbitkan Rapor</button>
        </div>`;
};

window.saveExamGrades = async function(email, monthId) {
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    res.adminFeedback = document.getElementById('admin-exam-feedback')?.value || '';
    ['reading', 'writing', 'speaking', 'listening'].forEach(c => res.sectionScores[c] = calculateCategoryScore(c, examData, res));
    res.isGraded = true;
    await saveToCloud('hes_materials', window.HES.materials);
    renderAdminGradingView(email, monthId);
    showToast('Rapor berhasil diterbitkan ke murid!', 'success');
};