// js/admin.js

let currentAdminTab = 'overview';
let adminExamState = {
    student: '',
    month: '',
    activeTab: 'listening',
    data: null
};
let currentAdminGradingTab = 'reading';

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth('admin');
    if (!session) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('tab')) {
        currentAdminTab = params.get('tab');
    }

    initLayout('Administrative CMS');
    populateAllAdminDropdowns();
    switchAdminTab(currentAdminTab);

    await syncFromCloud();
    renderAppSidebar();
    populateAllAdminDropdowns();
    switchAdminTab(currentAdminTab);
});

window.refreshAdminCloudData = async function() {
    await syncFromCloud();
    populateAllAdminDropdowns();
    switchAdminTab(currentAdminTab);
    showToast('Data terbaru berhasil disinkronkan dari server.', 'info');
};

window.switchAdminTab = function(tabName) {
    currentAdminTab = tabName;
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);

    const tabs = ['overview', 'users', 'materials', 'exam'];
    tabs.forEach(t => {
        const btn = document.getElementById(`adm-tab-${t}`);
        const panel = document.getElementById(`admin-panel-${t}`);
        if (btn) {
            if (t === tabName) {
                btn.className = "shrink-0 px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 bg-white text-indigo-600 shadow-sm";
            } else {
                btn.className = "shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50";
            }
        }
        if (panel) {
            if (t === tabName) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
        }
    });

    if (tabName === 'overview') renderAdminOverviewTab();
    if (tabName === 'users') renderAdminUsersTab();
    if (tabName === 'materials') loadAdminVocabPreview();
};

function populateAllAdminDropdowns() {
    const monthOptions = window.HES.months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMonthOptions = window.HES.months.map(m => `<option value="${m.id.replace('m', '')}">Batas: ${m.title}</option>`).join('');
    const studentOptions = window.HES.students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    const setHTML = (id, html) => {
        const el = document.getElementById(id);
        if (el) {
            const prev = el.value;
            el.innerHTML = html;
            if (prev && Array.from(el.options).some(o => o.value === prev)) el.value = prev;
        }
    };

    setHTML('admin-sched-student', studentOptions);
    setHTML('admin-sched-max-month', maxMonthOptions);
    setHTML('admin-anchor-month', monthOptions);
    setHTML('admin-target-student', `<option value="all">Global (Semua Murid)</option>${studentOptions}`);
    setHTML('admin-month', monthOptions);
    setHTML('admin-vocab-month', monthOptions);
    setHTML('admin-review-student', studentOptions);
    setHTML('admin-review-month', monthOptions);
    setHTML('admin-exam-student', studentOptions);
    setHTML('admin-exam-month', monthOptions);

    loadStudentScheduleForm();
}

// ==========================================
// TAB 1: OVERVIEW & VALIDASI RESCHEDULE
// ==========================================
function renderAdminOverviewTab() {
    const container = document.getElementById('admin-pending-reschedules-list');
    if (!container) return;

    let html = '';
    window.HES.students.forEach(s => {
        let p = window.HES.materials[`profile-${s.email}`];
        if (p && p.pendingReschedules) {
            for (const [oldD, newD] of Object.entries(p.pendingReschedules)) {
                html += `
                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between bg-white border border-slate-200 p-4 rounded-xl mb-3 shadow-2xs gap-3">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-extrabold text-slate-800 text-xs sm:text-sm">${s.name}</span>
                                <span class="text-[11px] text-slate-400">(${s.email})</span>
                            </div>
                            <div class="text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 inline-block mt-2">
                                ${getDisplayDate(parseDateStr(oldD))}
                                <i class="fas fa-arrow-right text-indigo-500 mx-2"></i>
                                <strong class="text-indigo-700">${getDisplayDate(parseDateStr(newD))}</strong>
                            </div>
                        </div>
                        <div class="flex gap-2 w-full md:w-auto">
                            <button onclick="approveReschedule('${s.email}', '${oldD}', '${newD}')" class="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs">
                                <i class="fas fa-check mr-1"></i> Setujui
                            </button>
                            <button onclick="rejectReschedule('${s.email}', '${oldD}')" class="flex-1 md:flex-none bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 px-4 py-2 rounded-xl text-xs font-bold transition">
                                <i class="fas fa-times mr-1"></i> Tolak
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    });

    if (!html) {
        html = `
            <div class="bg-white py-10 rounded-xl border border-dashed border-slate-200 text-center">
                <i class="far fa-check-circle text-emerald-400 text-2xl mb-2"></i>
                <p class="text-slate-400 text-xs sm:text-sm font-medium">Tidak ada antrean pengajuan pindah jadwal saat ini.</p>
            </div>
        `;
    }
    container.innerHTML = html;
}

window.approveReschedule = async function(email, oldDate, newDate) {
    let p = window.HES.materials[`profile-${email}`];
    if (!p.reschedules) p.reschedules = {};
    p.reschedules[oldDate] = newDate;
    delete p.pendingReschedules[oldDate];

    document.body.style.cursor = 'wait';
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    document.body.style.cursor = 'default';

    if (error) showToast('Gagal menyetujui jadwal: ' + error.message, 'error');
    else {
        showToast('Perubahan jadwal disetujui!', 'success');
        renderAdminOverviewTab();
    }
};

window.rejectReschedule = async function(email, oldDate) {
    if (!confirm('Tolak pengajuan pindah jadwal ini?')) return;
    let p = window.HES.materials[`profile-${email}`];
    delete p.pendingReschedules[oldDate];

    document.body.style.cursor = 'wait';
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    document.body.style.cursor = 'default';

    if (error) showToast('Gagal menolak jadwal: ' + error.message, 'error');
    else {
        showToast('Pengajuan pindah jadwal ditolak.', 'info');
        renderAdminOverviewTab();
    }
};

window.addNewMonth = async function() {
    const nextNum = window.HES.months.length + 1;
    window.HES.months.push({ id: `m${nextNum}`, title: `Month ${nextNum}`, weeks: [1, 2, 3, 4] });

    const { error } = await saveToCloud('hes_months', window.HES.months);
    if (!error) {
        showToast(`Month ${nextNum} berhasil ditambahkan!`, 'success');
        renderAppSidebar();
        populateAllAdminDropdowns();
    } else {
        window.HES.months.pop();
        showToast('Gagal menambah bulan: ' + error.message, 'error');
    }
};

// ==========================================
// TAB 2: AKUN MURID & JADWAL MASTER
// ==========================================
window.loadStudentScheduleForm = function() {
    const emailEl = document.getElementById('admin-sched-student');
    if (!emailEl || !emailEl.value) return;

    const email = emailEl.value;
    const p = window.HES.materials[`profile-${email}`] || {};

    const maxMonthEl = document.getElementById('admin-sched-max-month');
    const anchorMonthEl = document.getElementById('admin-anchor-month');
    const anchorWeekEl = document.getElementById('admin-anchor-week');
    const anchorDayEl = document.getElementById('admin-anchor-day');
    const startDateEl = document.getElementById('admin-sched-start-date');
    const dateEl = document.getElementById('admin-sched-date');
    const startEl = document.getElementById('admin-sched-start');
    const endEl = document.getElementById('admin-sched-end');

    if (maxMonthEl) maxMonthEl.value = p.maxMonth || '1';
    if (anchorMonthEl) anchorMonthEl.value = p.anchorMonth || 'm1';
    if (anchorWeekEl) anchorWeekEl.value = String(p.anchorWeek || '1');
    if (anchorDayEl) anchorDayEl.value = String(p.anchorDay || '1');
    if (startDateEl) startDateEl.value = (p.startDate && p.startDate !== 'Belum diatur') ? p.startDate : '';
    if (dateEl) dateEl.value = (p.validUntil && p.validUntil !== 'Belum diatur') ? p.validUntil : '';

    if (p.time && p.time.includes('-')) {
        const [s, e] = p.time.split('-').map(t => t.trim());
        if (startEl) startEl.value = s;
        if (endEl) endEl.value = e;
    } else {
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';
    }

    const days = p.days || [];
    document.querySelectorAll('.admin-day-cb').forEach(cb => {
        cb.checked = days.includes(cb.value);
    });
};

function renderAdminUsersTab() {
    const tbody = document.getElementById('admin-students-table-body');
    if (!tbody) return;

    tbody.innerHTML = window.HES.students.map((s, idx) => {
        const p = window.HES.materials[`profile-${s.email}`] || {};
        const schedSummary = (p.days && p.days.length > 0)
            ? `${p.days.join(', ')} (${p.time || '-'})`
            : '<span class="text-slate-400 italic">Belum diatur</span>';

        const anchorLabel = (p.startDate && p.startDate !== 'Belum diatur')
            ? `Patokan: ${(p.anchorMonth || 'm1').toUpperCase()}•W${p.anchorWeek || 1}•D${p.anchorDay || 1} (${p.startDate}) • `
            : '';

        const validSummary = (p.validUntil && p.validUntil !== 'Belum diatur')
            ? `${anchorLabel}Aktif s/d: ${p.validUntil} • Max M${p.maxMonth || 1}`
            : 'Masa aktif belum diatur';

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition">
                <td class="p-3.5 text-slate-800 text-xs font-extrabold">${s.name}</td>
                <td class="p-3.5 text-slate-500 text-xs font-medium">${s.email}</td>
                <td class="p-3.5">
                    <p class="text-xs font-bold text-slate-700">${schedSummary}</p>
                    <p class="text-[10px] font-semibold text-indigo-600 mt-0.5">${validSummary}</p>
                </td>
                <td class="p-3.5">
                    <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg w-max">
                        <input type="password" value="${s.password}" id="pwd-${idx}" class="bg-transparent border-none w-16 outline-none text-slate-700 font-mono text-xs" readonly>
                        <button onclick="togglePassword('pwd-${idx}')" class="text-slate-400 hover:text-indigo-600"><i class="fas fa-eye text-xs"></i></button>
                    </div>
                </td>
                <td class="p-3.5 text-right whitespace-nowrap">
                    <button onclick="editStudentPassword('${s.email}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition inline-flex items-center justify-center mx-0.5" title="Ubah Sandi"><i class="fas fa-key text-xs"></i></button>
                    <button onclick="deleteStudentAccount('${s.email}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition inline-flex items-center justify-center mx-0.5" title="Hapus Akun"><i class="fas fa-trash-alt text-xs"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.togglePassword = function(id) {
    const input = document.getElementById(id);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
};

window.addNewStudent = async function(e) {
    const name = document.getElementById('new-stu-name').value.trim();
    const email = document.getElementById('new-stu-email').value.trim();
    const pass = document.getElementById('new-stu-pass').value.trim();
    if (!name || !email || !pass) {
        showToast('Harap lengkapi nama, email, dan kata sandi!', 'error');
        return;
    }

    if (window.HES.students.some(s => s.email.toLowerCase() === email.toLowerCase())) {
        showToast('Email tersebut sudah terdaftar.', 'error');
        return;
    }

    window.HES.students.push({ name, email, password: pass });
    const { error } = await saveToCloud('hes_students', window.HES.students);
    if (!error) {
        showToast(`Akun ${name} berhasil didaftarkan!`, 'success');
        document.getElementById('new-stu-name').value = '';
        document.getElementById('new-stu-email').value = '';
        document.getElementById('new-stu-pass').value = '';
        populateAllAdminDropdowns();
        renderAdminUsersTab();
    } else {
        window.HES.students.pop();
        showToast('Gagal mendaftarkan akun: ' + error.message, 'error');
    }
};

window.editStudentPassword = async function(email) {
    const i = window.HES.students.findIndex(s => s.email === email);
    if (i === -1) return;
    const np = prompt(`Masukkan kata sandi baru untuk ${window.HES.students[i].name}:`, window.HES.students[i].password);
    if (np && np.trim() !== '') {
        window.HES.students[i].password = np.trim();
        const { error } = await saveToCloud('hes_students', window.HES.students);
        if (!error) {
            showToast('Kata sandi berhasil diperbarui.', 'success');
            renderAdminUsersTab();
        }
    }
};

window.deleteStudentAccount = async function(email) {
    if (confirm(`Hapus permanen akun murid ${email}?`)) {
        window.HES.students = window.HES.students.filter(s => s.email !== email);
        const { error } = await saveToCloud('hes_students', window.HES.students);
        if (!error) {
            showToast('Akun murid telah dihapus.', 'info');
            populateAllAdminDropdowns();
            renderAdminUsersTab();
        }
    }
};

window.saveStudentSchedule = async function(e) {
    const email = document.getElementById('admin-sched-student').value;
    if (!email) return;

    let profile = window.HES.materials[`profile-${email}`] || {};

    profile.anchorMonth = document.getElementById('admin-anchor-month').value || 'm1';
    profile.anchorWeek = parseInt(document.getElementById('admin-anchor-week').value) || 1;
    profile.anchorDay = parseInt(document.getElementById('admin-anchor-day').value) || 1;

    const startDateVal = document.getElementById('admin-sched-start-date').value;
    if (startDateVal) profile.startDate = startDateVal;

    profile.validUntil = document.getElementById('admin-sched-date').value || profile.validUntil || 'Belum diatur';

    const sT = document.getElementById('admin-sched-start').value;
    const eT = document.getElementById('admin-sched-end').value;
    if (sT && eT) profile.time = `${sT} - ${eT}`;

    profile.maxMonth = document.getElementById('admin-sched-max-month').value || profile.maxMonth || 1;
    const selDays = Array.from(document.querySelectorAll('.admin-day-cb:checked')).map(cb => cb.value);
    if (selDays.length > 0) profile.days = selDays;

    window.HES.materials[`profile-${email}`] = profile;

    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
    btn.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    btn.innerHTML = origText;
    btn.disabled = false;

    if (!error) {
        showToast('Konfigurasi jadwal & kalibrasi posisi murid berhasil disimpan!', 'success');
        renderAdminUsersTab();
    } else {
        showToast('Gagal menyimpan jadwal: ' + error.message, 'error');
    }
};

// ==========================================
// TAB 3: MATERI PDF & KOSAKATA
// ==========================================
window.saveMaterialData = async function(e) {
    const ts = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value;
    const w = document.getElementById('admin-week').value;
    const d = document.getElementById('admin-day').value;
    const link = document.getElementById('admin-link').value.trim();
    const recap = document.getElementById('admin-recap-pdf').value.trim();

    if (!link && !recap) {
        showToast('Masukkan minimal satu tautan Google Drive.', 'error');
        return;
    }

    const keyPref = `${ts}-${m}-w${w}-d${d}`;
    if (link) window.HES.materials[`${keyPref}-link`] = link;
    if (recap) window.HES.materials[`${keyPref}-recap`] = recap;

    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
    btn.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    btn.innerHTML = origText;
    btn.disabled = false;

    if (!error) {
        showToast('Tautan modul berhasil disimpan!', 'success');
        document.getElementById('admin-link').value = '';
        document.getElementById('admin-recap-pdf').value = '';
    } else {
        showToast('Gagal menyimpan modul: ' + error.message, 'error');
    }
};

window.loadAdminVocabPreview = function() {
    const mEl = document.getElementById('admin-vocab-month');
    const wEl = document.getElementById('admin-vocab-week');
    const dEl = document.getElementById('admin-vocab-day');
    const listEl = document.getElementById('admin-vocab-list');
    if (!mEl || !wEl || !dEl || !listEl) return;

    const existing = window.HES.materials[`vocab-${mEl.value}-w${wEl.value}-d${dEl.value}`] || '';
    listEl.value = existing;
};

window.saveVocabList = async function(e) {
    const m = document.getElementById('admin-vocab-month').value;
    const w = document.getElementById('admin-vocab-week').value;
    const d = document.getElementById('admin-vocab-day').value;
    const val = document.getElementById('admin-vocab-list').value;

    window.HES.materials[`vocab-${m}-w${w}-d${d}`] = val;

    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Mempublikasikan...';
    btn.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    btn.innerHTML = origText;
    btn.disabled = false;

    if (!error) showToast(`Kosakata ${m.toUpperCase()} W${w} D${d} berhasil dipublikasikan!`, 'success');
    else showToast('Gagal menyimpan kosakata: ' + error.message, 'error');
};

window.checkVocabStatus = async function(btnElement) {
    const resDiv = document.getElementById('vocab-review-result');
    let origText = '';
    if (btnElement) {
        origText = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Memeriksa Server...';
        btnElement.disabled = true;
    }

    await syncFromCloud();

    if (btnElement) {
        btnElement.innerHTML = origText;
        btnElement.disabled = false;
    }

    const email = document.getElementById('admin-review-student').value;
    const m = document.getElementById('admin-review-month').value;
    const w = document.getElementById('admin-review-week').value;
    const d = document.getElementById('admin-review-day').value;

    let statusObj = window.HES.materials[`vocab_status-${email}-${m}-w${w}-d${d}`];
    if (!statusObj || statusObj.status === 'none') {
        resDiv.innerHTML = `<div class="bg-slate-50 p-3.5 rounded-xl text-xs text-center text-slate-500 font-semibold border border-slate-200">Murid belum menyetorkan hafalan untuk sesi ini.</div>`;
    } else if (statusObj.status === 'submitted') {
        resDiv.innerHTML = `
            <div class="bg-amber-50 p-4 rounded-xl border border-amber-200 mt-3">
                <p class="text-xs font-extrabold text-amber-900 mb-2"><i class="fas fa-clock mr-1"></i> Menunggu Verifikasi Anda</p>
                <input type="text" id="admin-feedback" placeholder="Beri catatan apresiasi (opsional)..." class="w-full p-2.5 bg-white border border-amber-200 rounded-lg text-xs mb-2.5 outline-none">
                <button onclick="approveVocab('${email}', '${m}', '${w}', '${d}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-xs font-bold w-full transition">
                    <i class="fas fa-check mr-1"></i> Setujui Setoran Hafalan
                </button>
            </div>
        `;
    } else if (statusObj.status === 'approved') {
        resDiv.innerHTML = `
            <div class="bg-emerald-50 p-3.5 rounded-xl text-xs font-bold text-emerald-700 text-center mt-3 border border-emerald-200">
                <i class="fas fa-check-circle mr-1"></i> Hafalan telah diverifikasi ("${statusObj.feedback || 'Good Job!'}")
            </div>
        `;
    }
};

window.approveVocab = async function(email, m, w, d) {
    let feedback = document.getElementById('admin-feedback').value || 'Good Job!';
    window.HES.materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status: 'approved', feedback };

    document.body.style.cursor = 'wait';
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    document.body.style.cursor = 'default';

    if (!error) {
        showToast('Hafalan kosakata murid telah disetujui!', 'success');
        checkVocabStatus();
    }
};

// ==========================================
// TAB 4: EXAM BUILDER & GRADING
// ==========================================
window.loadAdminExamData = function() {
    adminExamState.student = document.getElementById('admin-exam-student').value;
    adminExamState.month = document.getElementById('admin-exam-month').value;
    const key = `exam-${adminExamState.student}-${adminExamState.month}`;
    adminExamState.data = window.HES.materials[key] || { listening: [], speaking: [], reading: [], writing: [] };

    document.getElementById('admin-grading-workspace').classList.add('hidden');
    document.getElementById('admin-exam-workspace').classList.remove('hidden');
    switchExamTab('listening');
};

window.switchExamTab = function(tabName) {
    adminExamState.activeTab = tabName;
    ['listening', 'speaking', 'reading', 'writing'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (!btn) return;
        if (t === tabName) {
            btn.classList.add('border-indigo-600', 'text-indigo-600', 'bg-white');
            btn.classList.remove('border-transparent', 'text-slate-500');
        } else {
            btn.classList.remove('border-indigo-600', 'text-indigo-600', 'bg-white');
            btn.classList.add('border-transparent', 'text-slate-500');
        }
    });
    renderExamQuestions();
};

window.addExamQuestion = function(type) {
    adminExamState.data[adminExamState.activeTab].push({
        id: Date.now().toString(),
        type: type,
        question: '',
        mediaUrl: '',
        options: type === 'mcq' ? ['', '', '', ''] : [],
        answer: type === 'mcq' ? 0 : '',
        explanation: ''
    });
    renderExamQuestions();
};

window.removeExamQuestion = function(index) {
    if (confirm('Hapus soal nomor ' + (index + 1) + ' ini?')) {
        adminExamState.data[adminExamState.activeTab].splice(index, 1);
        renderExamQuestions();
    }
};

window.updateExamField = function(index, field, value, optIndex = null) {
    let q = adminExamState.data[adminExamState.activeTab][index];
    if (optIndex !== null) q.options[optIndex] = value;
    else q[field] = value;
};

window.renderExamQuestions = function() {
    const container = document.getElementById('admin-exam-questions-container');
    const questions = adminExamState.data[adminExamState.activeTab];
    if (!questions || questions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 bg-white rounded-xl border border-dashed border-slate-300">
                <p class="text-slate-400 font-semibold text-xs">Belum ada soal pada bagian <strong>${adminExamState.activeTab.toUpperCase()}</strong>. Gunakan tombol di bawah untuk menambah soal.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = questions.map((q, idx) => {
        let isMCQ = q.type === 'mcq';
        let bodyHTML = '';
        if (isMCQ) {
            let optionsHTML = ['A', 'B', 'C', 'D'].map((lbl, oIdx) => `
                <div class="flex items-center gap-2.5 mb-2">
                    <input type="radio" name="correct_${adminExamState.activeTab}_${idx}" value="${oIdx}" ${q.answer == oIdx ? 'checked' : ''} onchange="updateExamField(${idx}, 'answer', ${oIdx})" class="w-4 h-4 text-indigo-600 shrink-0" title="Tandai sebagai jawaban benar">
                    <span class="font-extrabold text-xs text-slate-500 w-4 shrink-0">${lbl}.</span>
                    <input type="text" value="${q.options[oIdx]}" onchange="updateExamField(${idx}, 'options', this.value, ${oIdx})" placeholder="Ketik teks opsi ${lbl}" class="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 transition">
                </div>
            `).join('');
            bodyHTML = `<div class="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80"><p class="text-[10px] font-extrabold text-slate-500 mb-2.5 uppercase tracking-wider">Pilihan Opsi & Kunci Jawaban (Pilih Radio Button untuk Kunci)</p>${optionsHTML}</div>`;
        } else {
            bodyHTML = `<div class="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80"><p class="text-[10px] font-extrabold text-slate-500 mb-2 uppercase tracking-wider">Kriteria / Referensi Jawaban Benar</p><textarea onchange="updateExamField(${idx}, 'answer', this.value)" rows="2" class="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 transition" placeholder="Tulis kriteria penilaian atau contoh jawaban...">${q.answer}</textarea></div>`;
        }

        return `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-extrabold text-xs text-slate-800">Soal #${idx + 1}</h4>
                    <div class="flex items-center gap-2">
                        <span class="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">${isMCQ ? 'Pilihan Ganda' : 'Essay / Suara'}</span>
                        <button onclick="removeExamQuestion(${idx})" class="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </div>
                <textarea onchange="updateExamField(${idx}, 'question', this.value)" rows="2" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 transition mb-2.5" placeholder="Ketik naskah pertanyaan di sini...">${q.question}</textarea>
                <div class="relative">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i class="fab fa-google-drive text-blue-500 text-xs"></i></div>
                    <input type="text" onchange="updateExamField(${idx}, 'mediaUrl', this.value)" value="${q.mediaUrl || ''}" class="w-full pl-8 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 transition" placeholder="Opsional: Tautan File Audio MP3 Google Drive (khusus Listening)">
                </div>
                ${bodyHTML}
                <div class="mt-3">
                    <p class="text-[10px] font-extrabold text-slate-500 mb-1.5 uppercase tracking-wider"><i class="fas fa-lightbulb text-amber-500 mr-1"></i> Penjelasan / Pembahasan Soal</p>
                    <textarea onchange="updateExamField(${idx}, 'explanation', this.value)" rows="1" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 transition" placeholder="Opsional: Ditampilkan kepada murid setelah ujian disubmit...">${q.explanation}</textarea>
                </div>
            </div>
        `;
    }).join('');
};

window.saveAdminExamData = async function(e) {
    const key = `exam-${adminExamState.student}-${adminExamState.month}`;
    window.HES.materials[key] = adminExamState.data;

    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
    btn.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    btn.innerHTML = origText;
    btn.disabled = false;

    if (error) showToast('Gagal menyimpan soal ujian: ' + error.message, 'error');
    else showToast('Seluruh soal ujian berhasil disimpan!', 'success');
};

window.resetStudentExam = async function() {
    const studentEmail = document.getElementById('admin-exam-student').value;
    const monthId = document.getElementById('admin-exam-month').value;
    if (!studentEmail || !monthId) return;

    const resultKey = `exam_result-${studentEmail}-${monthId}`;
    if (window.HES.materials[resultKey]) {
        if (confirm(`PERINGATAN: Anda akan MENGHAPUS hasil ujian murid ${studentEmail} pada modul ${monthId.toUpperCase()}.\n\nMurid akan dapat mengerjakan ulang ujian dari awal. Lanjutkan?`)) {
            delete window.HES.materials[resultKey];

            document.body.style.cursor = 'wait';
            const { error } = await saveToCloud('hes_materials', window.HES.materials);
            document.body.style.cursor = 'default';

            if (!error) {
                showToast('Hasil ujian murid berhasil direset.', 'info');
                document.getElementById('admin-grading-workspace').classList.add('hidden');
            } else {
                showToast('Gagal mereset ujian: ' + error.message, 'error');
            }
        }
    } else {
        showToast('Belum ada data ujian yang disubmit oleh murid ini.', 'info');
    }
};

// ==========================================
// LEMBAR PENILAIAN (GRADING WORKSPACE)
// ==========================================
window.preserveCurrentDomScores = function(studentEmail, monthId) {
    const examKey = `exam-${studentEmail}-${monthId}`;
    const resultKey = `exam_result-${studentEmail}-${monthId}`;
    const examData = window.HES.materials[examKey];
    let examResult = window.HES.materials[resultKey];
    if (!examData || !examResult) return;
    if (!examResult.scores) examResult.scores = {};

    ['reading', 'writing', 'speaking', 'listening'].forEach(cat => {
        if (examData[cat]) {
            examData[cat].forEach((q, idx) => {
                if (q.type !== 'mcq') {
                    let input = document.getElementById(`score_${cat}_${idx}`);
                    if (input) {
                        examResult.scores[`${cat}_${idx}`] = parseFloat(input.value) || 0;
                    }
                }
            });
        }
    });

    let fbInput = document.getElementById('admin-exam-feedback');
    if (fbInput) {
        examResult.adminFeedback = fbInput.value;
    }
};

window.switchAdminGradingTab = function(tabName) {
    const studentEmail = document.getElementById('admin-exam-student').value;
    const monthId = document.getElementById('admin-exam-month').value;
    preserveCurrentDomScores(studentEmail, monthId);
    currentAdminGradingTab = tabName;
    renderAdminGradingView(studentEmail, monthId);
};

window.updateManualScoreRealtime = function(cat, idx, val, studentEmail, monthId) {
    const resultKey = `exam_result-${studentEmail}-${monthId}`;
    let examResult = window.HES.materials[resultKey];
    if (!examResult) return;
    if (!examResult.scores) examResult.scores = {};
    examResult.scores[`${cat}_${idx}`] = parseFloat(val) || 0;
};

window.loadStudentExamForGrading = async function() {
    const studentEmail = document.getElementById('admin-exam-student').value;
    const monthId = document.getElementById('admin-exam-month').value;
    const workspace = document.getElementById('admin-grading-workspace');

    document.getElementById('admin-exam-workspace').classList.add('hidden');
    workspace.classList.remove('hidden');
    workspace.innerHTML = `<div class="p-8 text-center text-xs font-bold text-indigo-600"><i class="fas fa-spinner fa-spin mr-2 text-base"></i> Mengambil data jawaban dan rekaman suara terbaru dari server...</div>`;

    await syncFromCloud();

    currentAdminGradingTab = 'reading';
    renderAdminGradingView(studentEmail, monthId);
};

window.renderAdminGradingView = function(studentEmail, monthId) {
    const examKey = `exam-${studentEmail}-${monthId}`;
    const resultKey = `exam_result-${studentEmail}-${monthId}`;
    const examData = window.HES.materials[examKey];
    const examResult = window.HES.materials[resultKey];
    const workspace = document.getElementById('admin-grading-workspace');

    if (!examData) {
        workspace.innerHTML = `<div class="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs font-semibold text-slate-500">Soal ujian belum dibuat untuk murid dan bulan ini.</div>`;
        return;
    }

    if (!examResult || !examResult.answers || Object.keys(examResult.answers).length === 0) {
        workspace.innerHTML = `<div class="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs font-semibold text-slate-500">Belum ada jawaban ujian yang disubmit oleh murid (${studentEmail}).</div>`;
        return;
    }

    if (!examResult.scores) examResult.scores = {};
    if (!examResult.sectionScores) examResult.sectionScores = { reading: 0, writing: 0, speaking: 0, listening: 0 };

    const categories = ['reading', 'writing', 'speaking', 'listening'];
    categories.forEach(c => {
        examResult.sectionScores[c] = calculateCategoryScore(c, examData, examResult);
    });

    const cat = currentAdminGradingTab;
    const questions = examData[cat] || [];

    let mcqCorrect = 0;
    let mcqTotal = 0;
    questions.forEach((q, idx) => {
        if (q.type === 'mcq') {
            mcqTotal++;
            let ans = examResult.answers[`${cat}_${idx}`];
            if (ans !== undefined && ans !== '' && ans == q.answer) mcqCorrect++;
        }
    });

    let tabsNavHTML = categories.map(c => {
        let isSubmittedTab = examResult.submittedTabs && examResult.submittedTabs.includes(c);
        let activeClass = (c === cat)
            ? 'bg-indigo-600 text-white shadow-xs'
            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200';
        return `
            <button onclick="switchAdminGradingTab('${c}')" class="flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold capitalize transition flex items-center justify-center gap-2 ${activeClass}">
                <span>${c}</span>
                <span class="px-1.5 py-0.5 text-[10px] rounded ${c === cat ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-700'}">${examResult.sectionScores[c]}/100</span>
                ${isSubmittedTab ? '<i class="fas fa-check-circle text-emerald-400 text-[10px]" title="Sudah disubmit murid"></i>' : ''}
            </button>
        `;
    }).join('');

    let questionsHTML = '';
    if (questions.length === 0) {
        questionsHTML = `<div class="p-8 bg-white rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">Tidak ada soal pada bagian <strong class="uppercase">${cat}</strong>.</div>`;
    } else {
        questions.forEach((q, idx) => {
            let ans = examResult.answers[`${cat}_${idx}`];
            let isMCQ = q.type === 'mcq';
            let hasAnswered = (ans !== undefined && ans !== '');
            let displayAns = hasAnswered ? ans : '<span class="text-red-400 italic">Tidak dijawab oleh murid</span>';

            if (isMCQ && hasAnswered) {
                const optionLabels = ['A', 'B', 'C', 'D'];
                displayAns = `${optionLabels[ans] || ''}. ${q.options[ans] || ans}`;
            }

            if (!isMCQ && typeof ans === 'string' && ans.startsWith('data:audio')) {
                displayAns = `
                    <div class="mt-2">
                        <p class="text-[10px] text-indigo-600 font-extrabold mb-1"><i class="fas fa-volume-up mr-1"></i> Rekaman Suara Murid:</p>
                        <audio controls class="h-10 w-full max-w-md rounded-lg bg-white border border-slate-200 shadow-2xs" src="${ans}"></audio>
                    </div>
                `;
            }

            let isCorrectMCQ = isMCQ && hasAnswered && (ans == q.answer);
            let savedManualScore = examResult.scores[`${cat}_${idx}`] !== undefined ? examResult.scores[`${cat}_${idx}`] : 0;

            questionsHTML += `
                <div class="mb-4 bg-white p-5 rounded-xl border ${isMCQ ? (isCorrectMCQ ? 'border-emerald-200' : 'border-red-200') : 'border-slate-200'} shadow-2xs">
                    <div class="flex justify-between items-start gap-2 mb-2">
                        <span class="text-xs font-extrabold text-slate-800">Soal #${idx + 1}</span>
                        <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${isMCQ ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}">${isMCQ ? 'Pilihan Ganda' : 'Essay / Audio'}</span>
                    </div>
                    <p class="text-xs text-slate-700 mb-3 leading-relaxed">${q.question.replace(/\n/g, '<br>')}</p>
                    <p class="text-[11px] text-slate-500 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100"><strong>Kunci / Kriteria:</strong> ${isMCQ ? `${['A', 'B', 'C', 'D'][q.answer]}.${q.options[q.answer]}` : (q.answer || '-')}</p>

                    <div class="bg-indigo-50/40 p-3.5 rounded-lg border border-indigo-100 text-xs text-slate-800 mb-3">
                        <strong class="text-[10px] uppercase tracking-wider text-indigo-500 block mb-1">Jawaban Murid:</strong>
                        ${displayAns}
                    </div>

                    ${!isMCQ ? `
                        <div class="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <label class="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wide"><i class="fas fa-pen mr-1"></i> Beri Nilai Soal Ini (0 - 100):</label>
                            <input type="number" min="0" max="100" id="score_${cat}_${idx}" value="${savedManualScore}" oninput="updateManualScoreRealtime('${cat}',${idx}, this.value, '${studentEmail}', '${monthId}')" class="w-full sm:w-36 p-2 border border-emerald-300 bg-emerald-50/50 focus:bg-white rounded-lg text-xs font-extrabold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 transition text-center">
                        </div>
                    ` : `
                        <div class="flex items-center justify-between mt-2">
                            <span class="text-[11px] font-bold ${isCorrectMCQ ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200'} px-2.5 py-1 rounded-lg border">
                                <i class="fas ${isCorrectMCQ ? 'fa-check-circle' : 'fa-times-circle'} mr-1"></i> ${isCorrectMCQ ? 'Benar (+100 Poin Otomatis)' : 'Salah (0 Poin)'}
                            </span>
                        </div>
                    `}
                </div>
            `;
        });
    }

    const currentIndex = categories.indexOf(cat);
    const prevCat = currentIndex > 0 ? categories[currentIndex - 1] : null;
    const nextCat = currentIndex < categories.length - 1 ? categories[currentIndex + 1] : null;

    workspace.innerHTML = `
        <div class="space-y-5">
            <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                        <h4 class="font-extrabold text-indigo-950 text-sm">Lembar Penilaian Ujian: ${studentEmail}</h4>
                        <p class="text-[11px] text-indigo-600">Pilih tab di bawah untuk memeriksa dan memberi nilai setiap bagian.</p>
                    </div>
                    <button onclick="loadStudentExamForGrading()" class="self-start sm:self-auto bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-[11px] font-bold transition shadow-2xs">
                        <i class="fas fa-sync-alt mr-1"></i> Refresh Jawaban
                    </button>
                </div>
                <div class="flex flex-wrap gap-2">${tabsNavHTML}</div>
            </div>

            <div class="bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 mb-4 gap-2">
                    <h4 class="font-extrabold text-sm md:text-base text-slate-800 capitalize flex items-center gap-2">
                        <span class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs"><i class="fas fa-book-open"></i></span>
                        Bagian ${cat}
                    </h4>
                    <div class="flex items-center gap-2">
                        ${mcqTotal > 0 ? `<span class="text-xs font-semibold bg-white px-3 py-1 rounded-lg border border-slate-200 text-slate-600">PG Benar: <strong>${mcqCorrect}/${mcqTotal}</strong></span>` : ''}
                        <span class="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg border border-emerald-200">Skor ${cat.toUpperCase()}: ${examResult.sectionScores[cat]}/100</span>
                    </div>
                </div>

                ${questionsHTML}

                <div class="flex justify-between items-center pt-3 border-t border-slate-200 mt-4">
                    ${prevCat ? `<button onclick="switchAdminGradingTab('${prevCat}')" class="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 capitalize transition"><i class="fas fa-arrow-left mr-1"></i> Ke ${prevCat}</button>` : `<div></div>`}
                    ${nextCat ? `<button onclick="switchAdminGradingTab('${nextCat}')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-bold text-white capitalize transition">Lanjut ke ${nextCat} <i class="fas fa-arrow-right ml-1"></i></button>` : `<span class="text-xs font-bold text-emerald-600"><i class="fas fa-check-circle mr-1"></i> Bagian Terakhir</span>`}
                </div>
            </div>

            <div class="bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm">
                <label class="block text-xs font-extrabold text-indigo-950 mb-2"><i class="fas fa-comment-dots mr-1 text-indigo-600"></i> Catatan Evaluasi Keseluruhan (Feedback Admin):</label>
                <textarea id="admin-exam-feedback" rows="3" placeholder="Ketik apresiasi, kesimpulan perkembangan, atau area yang perlu ditingkatkan murid..." class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs mb-4 outline-none focus:bg-white focus:border-indigo-500">${examResult.adminFeedback || ''}</textarea>

                <button onclick="saveExamGrades('${studentEmail}', '${monthId}')" class="w-full bg-emerald-600 text-white py-3.5 rounded-xl text-xs font-extrabold shadow-sm hover:bg-emerald-700 transition">
                    <i class="fas fa-paper-plane mr-1.5"></i> Simpan Nilai & Terbitkan Final Report ke Murid
                </button>
            </div>
        </div>
    `;
};

window.saveExamGrades = async function(studentEmail, monthId) {
    preserveCurrentDomScores(studentEmail, monthId);

    const examKey = `exam-${studentEmail}-${monthId}`;
    const resultKey = `exam_result-${studentEmail}-${monthId}`;
    const examData = window.HES.materials[examKey];
    let examResult = window.HES.materials[resultKey];

    if (!examResult.sectionScores) examResult.sectionScores = {};

    ['reading', 'writing', 'speaking', 'listening'].forEach(cat => {
        examResult.sectionScores[cat] = calculateCategoryScore(cat, examData, examResult);
    });

    examResult.isGraded = true;
    window.HES.materials[resultKey] = examResult;

    document.body.style.cursor = 'wait';
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    document.body.style.cursor = 'default';

    if (!error) {
        renderAdminGradingView(studentEmail, monthId);
        showToast('Final Report berhasil diterbitkan ke murid!', 'success');
        const sc = examResult.sectionScores;
        sendTelegramNotification(`🎓 *FINAL REPORT DITERBITKAN*\n\nMurid: ${studentEmail}\nBulan: ${monthId.toUpperCase()}\n\n📊 *Rincian Nilai:*\n• Reading: ${sc.reading}/100\n• Writing: ${sc.writing}/100\n• Speaking: ${sc.speaking}/100\n• Listening: ${sc.listening}/100`);
    } else {
        showToast('Gagal menyimpan penilaian: ' + error.message, 'error');
    }
};