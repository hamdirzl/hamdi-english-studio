// js/admin.js

let currentAdminTab = 'overview';
let currentAdminMaterialSubtab = 'module';
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
    if (tabName === 'materials') {
        loadAdminMaterialEditor();
        loadAdminVocabPreview();
    }
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
    loadAdminMaterialEditor();
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

// ============================================================================
// TAB 3: BUILDER MODUL MATERI PINTAR (8-SECTION WORKBOOK) & WORDBANK
// ============================================================================
window.switchAdminMaterialSubtab = function(sub) {
    currentAdminMaterialSubtab = sub;
    const btnMod = document.getElementById('adm-mat-subtab-module');
    const btnRec = document.getElementById('adm-mat-subtab-recap');
    const boxMod = document.getElementById('admin-editor-module-box');
    const boxRec = document.getElementById('admin-editor-recap-box');

    if (btnMod) btnMod.className = `px-4 py-2 rounded-xl text-xs font-extrabold transition ${sub === 'module' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`;
    if (btnRec) btnRec.className = `px-4 py-2 rounded-xl text-xs font-extrabold transition ${sub === 'recap' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`;
    if (boxMod) boxMod.classList.toggle('hidden', sub !== 'module');
    if (boxRec) boxRec.classList.toggle('hidden', sub !== 'recap');
    updateAdminMaterialStatusBadge();
};

window.selectAdminMaterialSession = function(week, day) {
    const wEl = document.getElementById('admin-week');
    const dEl = document.getElementById('admin-day');
    if (wEl) wEl.value = String(week);
    if (dEl) dEl.value = String(day);
    loadAdminMaterialEditor();
};

window.loadAdminMaterialEditor = function() {
    const pref = document.getElementById('admin-target-student')?.value || 'all';
    const m = document.getElementById('admin-month')?.value || 'm1';
    const w = parseInt(document.getElementById('admin-week')?.value || '1');
    const d = parseInt(document.getElementById('admin-day')?.value || '1');

    const linkEl = document.getElementById('admin-link');
    const recapEl = document.getElementById('admin-recap-pdf');
    if (!linkEl || !recapEl) return;

    const sessionNum = ((w - 1) * 3) + d;
    const indEl = document.getElementById('admin-material-session-indicator');
    if (indEl) indEl.innerText = `Sesi ${sessionNum} dari 12 (${m.toUpperCase()} • W${w}•D${d})`;

    const savedMod = window.HES.materials[`${pref}-${m}-w${w}-d${d}-link`] || '';
    const savedRec = window.HES.materials[`${pref}-${m}-w${w}-d${d}-recap`] || '';

    linkEl.value = savedMod;
    recapEl.value = savedRec;

    renderAdminMonthSessionsBar(pref, m, w, d);
    updateAdminMaterialStatusBadge();
};

function renderAdminMonthSessionsBar(pref, m, activeW, activeD) {
    const bar = document.getElementById('admin-month-sessions-bar');
    if (!bar) return;
    let html = '';
    for (let i = 0; i < 12; i++) {
        const w = Math.floor(i / 3) + 1;
        const d = (i % 3) + 1;
        const hasMod = Boolean((window.HES.materials[`${pref}-${m}-w${w}-d${d}-link`] || '').trim());
        const hasRec = Boolean((window.HES.materials[`${pref}-${m}-w${w}-d${d}-recap`] || '').trim());
        const isCurrent = (w === activeW && d === activeD);

        let cls = 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300';
        if (hasMod) cls = 'bg-emerald-50 text-emerald-700 border-emerald-300';
        if (isCurrent) cls = 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-300';

        html += `
            <button type="button" onclick="selectAdminMaterialSession(${w}, ${d})" title="Sesi ${i + 1} (Week ${w} Day ${d}) ${hasMod ? '• Modul Terisi' : '• Kosong'}" class="py-2 px-1 rounded-xl border text-xs font-extrabold transition flex flex-col items-center justify-center cursor-pointer ${cls}">
                <span>${i + 1}</span>
                <span class="text-[9px] opacity-80">${hasMod ? (hasRec ? '✓+R' : '✓') : '-'}</span>
            </button>`;
    }
    bar.innerHTML = html;
}

function updateAdminMaterialStatusBadge() {
    const badge = document.getElementById('admin-material-status-badge');
    if (!badge) return;
    const val = currentAdminMaterialSubtab === 'module'
        ? (document.getElementById('admin-link')?.value || '').trim()
        : (document.getElementById('admin-recap-pdf')?.value || '').trim();

    if (val) {
        badge.className = 'text-[11px] font-extrabold px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800';
        badge.innerHTML = '<i class="fas fa-check-circle mr-1"></i> Sudah Terisi';
    } else {
        badge.className = 'text-[11px] font-extrabold px-3 py-1 rounded-lg bg-slate-200 text-slate-600';
        badge.innerHTML = 'Belum Diisi';
    }
}

window.copyGeminiModulePrompt = function(mode = 'single') {
    const m = document.getElementById('admin-month')?.value || 'm1';
    const w = document.getElementById('admin-week')?.value || '1';
    const d = document.getElementById('admin-day')?.value || '1';
    const sNum = ((parseInt(w) - 1) * 3) + parseInt(d);

    let promptText = '';
    if (mode === 'single') {
        promptText = `Create a comprehensive, detailed, and super student-friendly English Study Workbook Handout (100% in simple, natural, easy-to-understand English) for ${m.toUpperCase()} - Session ${sNum} on the topic: [ISI TOPIK MATERI DI SINI].

Make sure the explanation is thorough, well-structured, practical for speaking/daily life, and never stiff or overly academic.
Put the result inside a single code block using this EXACT 8-section format (use the exact pipe "|" separators where shown) so my web app can render it into interactive visual cards:

TITLE: [Engaging Topic Title in English]
LEVEL: [${m.toUpperCase()} • Session ${sNum} of 12 • Friendly English Guide]
GOAL: [1-2 clear sentences explaining what the student will master and be able to say after this session]
WARM UP:
- [Friendly ice-breaker question #1 to ask the student at the start of class]
- [Friendly ice-breaker question #2]
- [Friendly ice-breaker question #3]
CONCEPT:
- [Point Title 1]: [Clear, friendly explanation of when and why we use this in real life, with a quick example in quotes]
- [Point Title 2]: [Clear explanation of how it works in simple terms]
- [Point Title 3]: [Important time signals, tone, or context clues to remember]
- [Point Title 4]: [Additional helpful rule or everyday usage note]
FORMULAS:
[+] Positive Form | [Formula, e.g., Subject + Verb 1 (s/es) + Object] | [2 clear example sentences]
[-] Negative Form | [Formula, e.g., Subject + don't / doesn't + Verb 1] | [2 clear example sentences]
[?] Yes/No Question | [Formula, e.g., Do / Does + Subject + Verb 1?] | [2 clear example sentences]
[?] Wh- Question | [Formula, e.g., Wh-Word + do / does + Subject + Verb 1?] | [2 clear example sentences]
[*] Special Pattern | [Special rule or natural speaking shortcut] | [2 clear example sentences]
PHRASES:
- [Natural Phrase / Expression 1] | [Simple English meaning] | [Short example sentence]
- [Natural Phrase / Expression 2] | [Simple English meaning] | [Short example sentence]
- [Natural Phrase / Expression 3] | [Simple English meaning] | [Short example sentence]
- [Natural Phrase / Expression 4] | [Simple English meaning] | [Short example sentence]
- [Natural Phrase / Expression 5] | [Simple English meaning] | [Short example sentence]
- [Natural Phrase / Expression 6] | [Simple English meaning] | [Short example sentence]
EXAMPLES:
- [Daily Life] | [Natural example sentence #1] | [Short note on why this sentence works]
- [At Work/School] | [Natural example sentence #2] | [Short note]
- [Socializing] | [Natural example sentence #3] | [Short note]
- [Habits] | [Natural example sentence #4] | [Short note]
- [Asking Questions] | [Natural example sentence #5] | [Short note]
- [Negative Statement] | [Natural example sentence #6] | [Short note]
- [Real Conversation] | [Natural example sentence #7] | [Short note]
- [Expressing Ideas] | [Natural example sentence #8] | [Short note]
MISTAKES:
- [Common Wrong Sentence 1] | [Correct Natural Sentence 1] | [Simple 1-sentence reason why]
- [Common Wrong Sentence 2] | [Correct Natural Sentence 2] | [Simple 1-sentence reason why]
- [Common Wrong Sentence 3] | [Correct Natural Sentence 3] | [Simple 1-sentence reason why]
- [Common Wrong Sentence 4] | [Correct Natural Sentence 4] | [Simple 1-sentence reason why]
DIALOGUE:
Man: [Natural spoken line 1]
Woman: [Natural spoken line 2]
Man: [Natural spoken line 3]
Woman: [Natural spoken line 4]
Man: [Natural spoken line 5]
Woman: [Natural spoken line 6]
Man: [Natural spoken line 7]
Woman: [Natural spoken line 8]
PRACTICE:
1. [Quick Check - Fill in the Blank]: [Sentence with a blank ___ and options, plus the answer key in parentheses]
2. [Quick Check - Fix the Mistake]: [Give a wrong sentence for the student to fix aloud]
3. [Speaking Prompt #1]: [Practical speaking challenge for the student to answer in 3-4 sentences]
4. [Speaking Roleplay #2]: [Interactive roleplay scenario between the student and tutor]`;
    } else if (mode === 'bulk') {
        promptText = `Create a complete, detailed, and student-friendly curriculum of 12 English Study Handouts for ${m.toUpperCase()} (Session 1 to Session 12) for my course "Hamdi English Studio".
Theme / Level for this month: [ISI TEMA / LEVEL BULAN INI, MISAL: MONTH 1 BEGINNER SPEAKING & ESSENTIAL GRAMMAR].

Make all 12 sessions 100% in English, warm, comprehensive, and very easy to understand.
Separate each session with === on a new line so my system can import all 12 sessions automatically!
Use this EXACT format for every session inside a code block:

SESSION: 1
TITLE: [Engaging Topic Title for Session 1]
LEVEL: [${m.toUpperCase()} • Session 1 of 12]
GOAL: [Clear learning goal in 1-2 sentences]
WARM UP:
- [Ice-breaker question 1]
- [Ice-breaker question 2]
CONCEPT:
- [Core Idea]: [Friendly explanation]
- [How to Use It]: [Friendly explanation]
- [Key Time Words / Clues]: [Friendly explanation]
FORMULAS:
[+] Positive | [Formula] | [Example sentence]
[-] Negative | [Formula] | [Example sentence]
[?] Question | [Formula] | [Example sentence]
[*] Pro Pattern | [Formula] | [Example sentence]
PHRASES:
- [Phrase 1] | [Simple English meaning] | [Example]
- [Phrase 2] | [Simple English meaning] | [Example]
- [Phrase 3] | [Simple English meaning] | [Example]
- [Phrase 4] | [Simple English meaning] | [Example]
EXAMPLES:
- [Daily Life] | [Example sentence 1] | [Short note]
- [Work/Study] | [Example sentence 2] | [Short note]
- [Conversation] | [Example sentence 3] | [Short note]
- [Negative] | [Example sentence 4] | [Short note]
- [Question] | [Example sentence 5] | [Short note]
- [Natural Expression] | [Example sentence 6] | [Short note]
MISTAKES:
- [Wrong sentence 1] | [Correct sentence 1] | [Simple reason]
- [Wrong sentence 2] | [Correct sentence 2] | [Simple reason]
- [Wrong sentence 3] | [Correct sentence 3] | [Simple reason]
DIALOGUE:
Man: [Line 1]
Woman: [Line 2]
Man: [Line 3]
Woman: [Line 4]
Man: [Line 5]
Woman: [Line 6]
PRACTICE:
1. [Quick Quiz]: [Fill-in-the-blank question]
2. [Sentence Builder]: [Prompt to make 3 sentences]
3. [Speaking Mission]: [Speaking question to discuss with tutor]
===
SESSION: 2
... (continue up to SESSION: 12)`;
    } else {
        promptText = `Create a warm, detailed, and encouraging Class Recap & Personal Evaluation Handout (100% in friendly English) for my student after completing Session ${sNum} (${m.toUpperCase()}) on the topic: [ISI TOPIK / CATATAN SINGKAT KELAS HARI INI].

Put the output inside a code block with this exact format:

TITLE: Class Recap & Feedback • Session ${sNum}
LEVEL: ${m.toUpperCase()} • Personal Class Summary
GOAL: Review today's speaking highlights, key grammar/pronunciation upgrades, and home practice.
CONCEPT:
- [Great Job Today!]: [Warm praise and summary of the student's progress in today's session]
- [Main Focus Reviewed]: [Summary of the main grammar/speaking topic we practiced]
FORMULAS:
[*] Key Pattern to Remember | [Formula or structure practiced today] | [Example from class]
[*] Pronunciation Focus | [Word or sound practiced] | [How to pronounce it naturally]
PHRASES:
- [New Expression 1 from Class] | [Simple meaning] | [Example sentence]
- [New Expression 2 from Class] | [Simple meaning] | [Example sentence]
- [New Expression 3 from Class] | [Simple meaning] | [Example sentence]
EXAMPLES:
- [Highlight #1] | [Great sentence practiced in class today] | [Keep using this structure!]
- [Highlight #2] | [Another natural sentence from today] | [Great vocabulary choice!]
- [Highlight #3] | [Polite question practiced today] | [Natural intonation!]
- [Highlight #4] | [Everyday expression] | [Very fluent!]
MISTAKES:
- [Sentence that needed a small fix 1] | [Better & natural version 1] | [Friendly explanation why]
- [Sentence that needed a small fix 2] | [Better & natural version 2] | [Friendly explanation why]
- [Sentence that needed a small fix 3] | [Better & natural version 3] | [Friendly explanation why]
PRACTICE:
1. [3-Minute Audio Drill]: Read the "Better & Natural Version" sentences aloud 3 times using the audio button.
2. [Mini Speaking Mission]: Record a 45-second voice note using at least 2 phrases from today's recap.`;
    }

    navigator.clipboard.writeText(promptText)
        .then(() => showToast('Prompt Lengkap berhasil disalin! Tempelkan ke Gemini.', 'success'))
        .catch(() => showToast('Gagal menyalin otomatis.', 'error'));
};

window.insertSampleModuleTemplate = function(type = 'module') {
    const m = (document.getElementById('admin-month')?.value || 'm1').toUpperCase();
    const w = parseInt(document.getElementById('admin-week')?.value || '1');
    const d = parseInt(document.getElementById('admin-day')?.value || '1');
    const sNum = ((w - 1) * 3) + d;

    if (type === 'module') {
        document.getElementById('admin-link').value = `TITLE: Talking About Daily Routines & Habits (Simple Present)
LEVEL: ${m} • Session ${sNum} of 12 • Friendly English Guide
GOAL: Confidently describe your daily activities, work schedule, and personal habits in natural, everyday English without translating word-by-word in your head.
WARM UP:
- Are you an early bird (morning person) or a night owl (night person)? Why?
- What is the very first thing you do after you wake up every morning?
- How do you usually spend your Sunday afternoons?
CONCEPT:
- What is Simple Present?: We use the Simple Present Tense to talk about things we do regularly (habits, routines, schedules) and facts that are always true. For example: "I drink coffee every morning."
- The Golden 2-Group Rule: Divide subjects into two simple teams! Team 1 (I, You, We, They) uses the base verb (Verb 1). Team 2 (He, She, It, or 1 person's name) adds "-s" or "-es" to the verb.
- Time Signals (Frequency Words): Words like "always" (100%), "usually" (80%), "often" (60%), "sometimes" (40%), and "never" (0%) go right BEFORE the main action verb, such as "I usually wake up at 6 AM."
- Using Do vs. Does: We use "do / don't" for I, You, We, They, and we use "does / doesn't" for He, She, It when making negative sentences or asking questions.
FORMULAS:
[+] Positive (I / You / We / They) | Subject + Verb 1 + Object | I wake up at 6 AM. / They work in a bank.
[+] Positive (He / She / It) | Subject + Verb 1 (+s/es) + Object | She wakes up at 6 AM. / He works in a bank.
[-] Negative Sentence | Subject + don't / doesn't + Verb 1 | I don't drink soda. / He doesn't work on Sundays.
[?] Yes / No Question | Do / Does + Subject + Verb 1? | Do you like spicy food? / Does she live near here?
[?] Wh- Question | Wh-Word + do / does + Subject + Verb 1? | What time do you start work? / Where does he live?
PHRASES:
- Get ready for work | Prepare yourself (shower, dress up) before going to work | It takes me 30 minutes to get ready for work.
- Grab a quick bite | Eat something fast because you are busy | I usually grab a quick bite before my morning meeting.
- Commute to work | Travel from home to your workplace | I commute to work by motorcycle every day.
- Take a short break | Rest for a few minutes between tasks | Let's take a short break and get some fresh air.
- Wind down | Relax slowly after a busy or tiring day | I like to wind down by listening to music at night.
- Hit the sack | Go to sleep / go to bed (informal & natural) | I am exhausted, so I'm going to hit the sack early tonight.
EXAMPLES:
- [Morning Routine] | I usually wake up at 5:30 AM and drink a full glass of warm water. | Uses "I + Verb 1" with frequency word "usually".
- [Work Life] | My sister works as a nurse, so she often starts her shift very early. | Uses "works" and "starts" (+s) because the subject is "My sister" (She).
- [Healthy Habit] | We don't eat fast food on weekdays because we prefer home-cooked meals. | Uses "don't + Verb 1" for negative routine.
- [Evening Routine] | Kevin doesn't watch TV at night; he prefers reading books before bed. | Notice "watch" has NO "-s" after "doesn't"!
- [Asking Habits] | What time do you usually leave your house in the morning? | Natural Wh-question to ask about someone's schedule.
- [Asking Others] | Does your office provide free coffee for the employees? | Uses "Does + Subject + Verb 1" for singular subject.
- [Weekend Life] | On Saturdays, I love hanging out with my close friends at a cozy cafe. | Use "On + plural day (Saturdays)" to mean every Saturday.
- [Daily Schedule] | The train to the city center leaves every thirty minutes. | Public schedules also use the Simple Present tense!
MISTAKES:
- She work in a hospital every day. | She works in a hospital every day. | Always add -s/-es to the verb when the subject is He, She, or It.
- He doesn't likes coffee. | He doesn't like coffee. | After "doesn't" or "does", the main verb MUST return to basic Verb 1 (no -s!).
- Do she live in Medan? | Does she live in Medan? | Use "Does" (not "Do") when asking about He, She, or It.
- I am usually wake up at 6 AM. | I usually wake up at 6 AM. | Never put "am / is / are" together with a basic action verb (Verb 1).
DIALOGUE:
Man: Good morning, Sarah! You always look so fresh and energetic. What time do you usually wake up?
Woman: Morning, Kevin! On weekdays, I usually wake up at 5:15 AM.
Man: Wow, that is super early! What do you do that early in the morning?
Woman: First, I stretch for ten minutes and go for a short walk. Then I take a shower and make a healthy breakfast.
Man: That sounds amazing. Honestly, I always hit the snooze button and rush to the office at 7:30 AM!
Woman: Haha, I used to do that too! Does your commute to the office take a long time?
Man: Yes, it takes about forty minutes by car when the traffic is heavy.
Woman: Try sleeping thirty minutes earlier tonight. Waking up without rushing feels so much better!
PRACTICE:
1. [Quick Check #1]: Fill in the blank -> "My brother _____ (don't / doesn't) _____ (drink / drinks) coffee at night." (Answer: doesn't drink)
2. [Quick Check #2]: Spot & fix the error -> "What time does you usually finishes your work?" (Answer: What time do you usually finish your work?)
3. [Speaking Challenge]: Tell your tutor 5 things you do on a typical weekday from the moment you wake up until you go to bed.
4. [Interview Roleplay]: Ask your tutor 3 questions about their daily routine using "What time do you...", "How often do you...", and "Do you usually..."`;
    } else {
        document.getElementById('admin-recap-pdf').value = `TITLE: Class Recap & Personal Evaluation • Session ${sNum}
LEVEL: ${m} • Session ${sNum} Personal Summary
GOAL: Review today's speaking highlights, sentence upgrades, and pronunciation notes.
CONCEPT:
- Awesome Effort Today!: You spoke with great enthusiasm and built your own sentences much faster today! Your confidence in answering spontaneous questions is improving steadily.
- Key Grammar Focus: Today we practiced using Simple Present Tense for daily routines, paying special attention to adding "-s" for He/She/It and using "don't / doesn't" accurately.
FORMULAS:
[*] He / She / It Rule | He / She + Verb 1 (+s/es) | She works at a bank. / He goes to the gym.
[*] Negative Shortcut | Subject + don't / doesn't + Verb 1 (No -s!) | She doesn't wake up late on Mondays.
PHRASES:
- Grab a quick breakfast | Eat a fast, simple breakfast | I usually grab a quick breakfast before leaving home.
- Stuck in traffic | Unable to move fast on the road | I was stuck in traffic for thirty minutes this morning.
- Call it a day | Stop working for the day | Let's finish this report and call it a day!
EXAMPLES:
- [Your Great Sentence #1] | I usually start working at 8:30 AM and check my emails first. | Very natural flow and clear pronunciation!
- [Your Great Sentence #2] | My mother cooks delicious food for our family every weekend. | Perfect use of "-s" in "cooks"!
- [Question Practiced] | What do you usually do to relax after a busy day? | Great question structure and friendly intonation.
- [Natural Response] | I like watching movies or taking a warm shower to wind down. | Excellent use of the phrasal verb "wind down"!
MISTAKES:
- My friend don't live here anymore. | My friend doesn't live here anymore. | Since "My friend" is 1 person (He/She), we use "doesn't".
- She go to office by motorcycle. | She goes to the office by motorcycle. | Add "-es" (goes) for "She", and add "the" before "office".
- I am agree with your opinion. | I agree with your opinion. | "Agree" is already a verb, so we don't need "am" before it.
PRACTICE:
1. [3-Minute Audio Review]: Click the speaker button on each sentence in the "Examples" section above and repeat aloud 3 times to lock in the rhythm.
2. [Home Speaking Mission]: Before our next class, send a 45-second voice note describing your best friend's daily routine (using He/She + Verb-s!).`;
    }
    updateAdminMaterialStatusBadge();
    showToast('Contoh Modul Lengkap (8 Bagian) berhasil dimasukkan! Klik Simpan untuk melihat hasilnya.', 'info');
};

window.saveMaterialData = async function(isBulk = false) {
    const pref = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value;
    const w = parseInt(document.getElementById('admin-week').value);
    const d = parseInt(document.getElementById('admin-day').value);
    const linkRaw = document.getElementById('admin-link').value.trim();
    const recapRaw = document.getElementById('admin-recap-pdf').value.trim();

    if (isBulk) {
        const activeText = currentAdminMaterialSubtab === 'module' ? linkRaw : recapRaw;
        const fieldSuffix = currentAdminMaterialSubtab === 'module' ? 'link' : 'recap';
        if (!activeText) return showToast('Tempelkan teks materi bulk terlebih dahulu!', 'error');

        let blocks = activeText.split(/\n\s*(?:===+|---+)\s*\n/).map(b => b.trim()).filter(Boolean);
        if (blocks.length === 1 && /SESSION\s*:\s*\d+/i.test(activeText)) {
            blocks = activeText.split(/(?=^SESSION\s*:\s*\d+)/im).map(b => b.trim()).filter(Boolean);
        }

        if (!blocks.length) return showToast('Teks kosong atau format tidak dikenali.', 'error');

        let savedCount = 0;
        const startSessionIdx = ((w - 1) * 3) + (d - 1);

        await safeSaveMaterialsToCloud(materials => {
            blocks.forEach((block, idx) => {
                let targetIdx = startSessionIdx + idx;
                const sessionMatch = block.match(/^SESSION\s*:\s*(\d+)/im);
                if (sessionMatch) {
                    const parsedNum = parseInt(sessionMatch[1]);
                    if (parsedNum >= 1 && parsedNum <= 12) targetIdx = parsedNum - 1;
                }
                if (targetIdx >= 0 && targetIdx < 12) {
                    const tW = Math.floor(targetIdx / 3) + 1;
                    const tD = (targetIdx % 3) + 1;
                    const cleanBlock = block.replace(/^SESSION\s*:\s*\d+\s*\n?/im, '').trim();
                    if (cleanBlock) {
                        materials[`${pref}-${m}-w${tW}-d${tD}-${fieldSuffix}`] = cleanBlock;
                        savedCount++;
                    }
                }
            });
        });

        loadAdminMaterialEditor();
        showToast(`${savedCount} Sesi berhasil diisi & disimpan sekaligus untuk ${m.toUpperCase()}!`, 'success');
        return;
    }

    await safeSaveMaterialsToCloud(materials => {
        if (linkRaw) materials[`${pref}-${m}-w${w}-d${d}-link`] = linkRaw;
        else delete materials[`${pref}-${m}-w${w}-d${d}-link`];

        if (recapRaw) materials[`${pref}-${m}-w${w}-d${d}-recap`] = recapRaw;
        else delete materials[`${pref}-${m}-w${w}-d${d}-recap`];
    });

    loadAdminMaterialEditor();
    showToast(`Materi Sesi (W${w}•D${d}) berhasil disimpan!`, 'success');
};

window.clearCurrentSessionMaterial = async function() {
    const pref = document.getElementById('admin-target-student').value;
    const m = document.getElementById('admin-month').value;
    const w = document.getElementById('admin-week').value;
    const d = document.getElementById('admin-day').value;

    if (!confirm(`Kosongkan Modul & Recap pada ${m.toUpperCase()} Minggu ${w} Hari ${d}?`)) return;
    await safeSaveMaterialsToCloud(materials => {
        delete materials[`${pref}-${m}-w${w}-d${d}-link`];
        delete materials[`${pref}-${m}-w${w}-d${d}-recap`];
    });
    loadAdminMaterialEditor();
    showToast('Materi sesi ini berhasil dikosongkan.', 'info');
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

    navigator.clipboard.writeText(promptText)
        .then(() => showToast('Prompt Gemini berhasil disalin!', 'success'))
        .catch(() => showToast('Gagal menyalin otomatis.', 'error'));
};

window.toggleBulkImportBox = function() {
    document.getElementById('bulk-import-box')?.classList.toggle('hidden');
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

        let audioLines = [], question = '', optA = '', optB = '', optC = '', optD = '', key = '', exp = '', currentField = '';
        lines.forEach(line => {
            if (/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:/i.test(line)) {
                currentField = 'audio';
                const rest = line.replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/i, '').trim();
                if (rest) audioLines.push(rest);
            } else if (/^(?:Q|QUESTION|PERTANYAAN|SOAL)\s*:/i.test(line)) {
                currentField = 'q'; question = line.replace(/^(?:Q|QUESTION|PERTANYAAN|SOAL)\s*:\s*/i, '');
            } else if (/^A\s*[.:)]\s*/i.test(line)) {
                currentField = 'a'; optA = line.replace(/^A\s*[.:)]\s*/i, '');
            } else if (/^B\s*[.:)]\s*/i.test(line)) {
                currentField = 'b'; optB = line.replace(/^B\s*[.:)]\s*/i, '');
            } else if (/^C\s*[.:)]\s*/i.test(line)) {
                currentField = 'c'; optC = line.replace(/^C\s*[.:)]\s*/i, '');
            } else if (/^D\s*[.:)]\s*/i.test(line)) {
                currentField = 'd'; optD = line.replace(/^D\s*[.:)]\s*/i, '');
            } else if (/^(?:KEY|ANSWER|TARGET|KUNCI|JAWABAN)\s*:/i.test(line)) {
                currentField = 'key'; key = line.replace(/^(?:KEY|ANSWER|TARGET|KUNCI|JAWABAN)\s*:\s*/i, '');
            } else if (/^(?:EXP|EXPLANATION|PEMBAHASAN|TIPS)\s*:/i.test(line)) {
                currentField = 'exp'; exp = line.replace(/^(?:EXP|EXPLANATION|PEMBAHASAN|TIPS)\s*:\s*/i, '');
            } else if (tab === 'listening' && (currentField === 'audio' || /^(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB])\s*:/i.test(line))) {
                audioLines.push(line);
            } else if (currentField === 'q') {
                question += '\n' + line;
            }
        });

        const audioScript = audioLines.join('\n').replace(/\s*[\/|]\s*/g, '\n').trim();
        if (!question && !audioScript) return;

        const hasMCQ = Boolean(optA || optB || optC || optD);
        const qType = (tab === 'speaking' || tab === 'writing') ? 'essay' : (hasMCQ ? 'mcq' : 'essay');
        const finalAnswer = qType === 'mcq' ? ({ A: 0, B: 1, C: 2, D: 3 }[String(key || 'A').trim().toUpperCase().charAt(0)] ?? 0) : key;

        parsedQuestions.push({
            id: `${Date.now()}_${bIdx}`,
            type: qType,
            question: question || `Question #${bIdx + 1}`,
            audioScript,
            mediaUrl: '',
            options: qType === 'mcq' ? [optA, optB, optC, optD] : [],
            answer: finalAnswer,
            explanation: exp
        });
    });

    if (!parsedQuestions.length) return showToast('Format teks belum sesuai contoh.', 'error');
    adminExamState.data[tab] = replaceExisting ? parsedQuestions : [...(adminExamState.data[tab] || []), ...parsedQuestions];

    switchExamTab(tab);
    await saveAdminExamData();
    showToast(`${parsedQuestions.length} soal ${tab.toUpperCase()} berhasil diinput & disimpan!`, 'success');
};

window.addExamQuestion = function(type) {
    const tab = adminExamState.activeTab;
    const defaultType = tab === 'speaking' ? 'essay' : type;
    adminExamState.data[tab].push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        type: defaultType, question: '', audioScript: '', mediaUrl: '',
        options: defaultType === 'mcq' ? ['', '', '', ''] : [],
        answer: defaultType === 'mcq' ? 0 : '', explanation: ''
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
    else if (field === 'audioScript') q.audioScript = String(val || '').replace(/\s*[\/|]\s*/g, '\n').trim();
    else q[field] = val;
};

function renderExamQuestions() {
    const box = document.getElementById('admin-exam-questions-container');
    const tab = adminExamState.activeTab;
    const list = adminExamState.data[tab] || [];

    const bulkImportUI = `
        <div class="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                    <h4 class="text-xs sm:text-sm font-extrabold text-indigo-950 uppercase flex items-center gap-1.5">
                        <i class="fas fa-bolt text-amber-500"></i> Bagian ${tab} • ${list.length} / 10 Soal (Suara Cloud Neural Natural)
                    </h4>
                    <p class="text-xs text-slate-600 mt-0.5">Klik <strong>Input Cepat 10 Soal</strong> untuk menempelkan soal langsung dari Gemini.</p>
                </div>
                <div class="flex flex-wrap gap-2 shrink-0">
                    <button type="button" onclick="copyGeminiExamPrompt()" class="px-3 py-2 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold transition cursor-pointer">
                        <i class="fas fa-copy mr-1"></i> Salin Prompt Gemini
                    </button>
                    <button type="button" onclick="toggleBulkImportBox()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer">
                        <i class="fas fa-paste mr-1"></i> Input Cepat 10 Soal
                    </button>
                </div>
            </div>
            <div id="bulk-import-box" class="hidden pt-3 border-t border-indigo-200/70 space-y-2.5">
                <textarea id="bulk-import-textarea" rows="7" class="hes-input !bg-white font-mono text-xs" placeholder="Tempelkan soal ${tab.toUpperCase()} di sini (pisahkan antar soal dengan ===)..."></textarea>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="processBulkExamImport(true)" class="hes-btn-primary !bg-emerald-600 flex-1 !py-2.5 !text-xs cursor-pointer">
                        <i class="fas fa-magic"></i> Proses & Ganti Semua Soal ${tab.toUpperCase()}
                    </button>
                    <button type="button" onclick="processBulkExamImport(false)" class="hes-btn-soft !bg-white !py-2.5 !text-xs cursor-pointer">+ Tambahkan ke Bawah</button>
                </div>
            </div>
        </div>`;

    if (!list.length) {
        box.innerHTML = bulkImportUI + `<p class="text-xs text-slate-400 text-center py-8">Belum ada soal di bagian ${tab.toUpperCase()}.</p>`;
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
                </div>
                <button type="button" onclick="removeExamQuestion(${idx})" class="text-xs text-red-500 hover:text-red-700 font-bold"><i class="fas fa-trash mr-1"></i>Hapus</button>
            </div>

            ${tab === 'listening' ? `
                <div class="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-extrabold text-indigo-700"><i class="fas fa-headphones-alt mr-1"></i> Naskah Audio Listening (Man / Woman)</label>
                        <button type="button" onclick="playNaturalEnglishTTS(document.getElementById('script_${idx}').value, this)" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition cursor-pointer">
                            <i class="fas fa-play mr-1"></i> Tes Suara
                        </button>
                    </div>
                    <textarea id="script_${idx}" oninput="updateExamField(${idx},'audioScript',this.value)" rows="2" placeholder="Man: ...&#10;Woman: ..." class="hes-input !bg-slate-50 text-xs">${scriptVal}</textarea>
                    <input type="text" onchange="updateExamField(${idx},'mediaUrl',this.value)" value="${mp3Val}" placeholder="Opsional: Link file MP3 eksternal" class="hes-input !bg-slate-50 !py-1.5 text-[11px]">
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
                        <label class="text-[11px] font-bold text-emerald-700 uppercase">${tab === 'speaking' ? 'Kalimat Target Pelafalan' : 'Kunci Jawaban / Kriteria'}</label>
                        ${tab === 'speaking' ? `<button type="button" onclick="playNaturalEnglishTTS(document.getElementById('ans_key_${idx}').value, this)" class="text-[11px] font-extrabold text-indigo-600 hover:underline cursor-pointer"><i class="fas fa-volume-up mr-1"></i>Tes Pelafalan</button>` : ''}
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
    const { error } = await safeSaveMaterialsToCloud(materials => { materials[key] = adminExamState.data; });
    if (!error) showToast('Seluruh soal ujian berhasil disimpan ke Cloud!', 'success');
    else showToast('Gagal menyimpan soal: ' + error.message, 'error');
};

window.resetStudentExam = async function() {
    const s = document.getElementById('admin-exam-student').value, m = document.getElementById('admin-exam-month').value;
    if (!confirm(`Reset hasil ujian ${s} pada ${m.toUpperCase()}?`)) return;
    await safeSaveMaterialsToCloud(materials => { delete materials[`exam_result-${s}-${m}`]; });
    document.getElementById('admin-grading-workspace').classList.add('hidden');
    showToast('Hasil ujian murid berhasil direset.', 'info');
};

window.loadStudentExamForGrading = async function() {
    const s = document.getElementById('admin-exam-student').value, m = document.getElementById('admin-exam-month').value;
    document.getElementById('admin-exam-workspace').classList.add('hidden');
    const ws = document.getElementById('admin-grading-workspace');
    ws.classList.remove('hidden');
    ws.innerHTML = `<div class="p-8 text-center text-xs font-bold text-slate-500"><i class="fas fa-sync fa-spin mr-1.5"></i> Mengambil data ujian dari Cloud...</div>`;
    await syncFromCloud();
    renderAdminGradingView(s, m);
};

window.updateQuestionManualPoint = function(email, monthId, cat, idx, val10) {
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (!res) return;
    res.scores = res.scores || {};
    res.scores[`${cat}_${idx}`] = Math.max(0, Math.min(10, parseFloat(val10) || 0));
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    res.sectionScores = res.sectionScores || {};
    res.sectionScores[cat] = computeExamSectionScore(cat, examData, res);
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
                <button onclick="loadStudentExamForGrading()" class="hes-btn-soft !py-2 !px-4 !text-xs"><i class="fas fa-sync-alt mr-1"></i> Muat Ulang</button>
            </div>`;
        return;
    }

    res.answers = res.answers || {};
    res.scores = res.scores || {};
    res.questionNotes = res.questionNotes || {};
    res.sectionScores = res.sectionScores || {};

    const cats = ['reading', 'writing', 'speaking', 'listening'];
    cats.forEach(c => { res.sectionScores[c] = computeExamSectionScore(c, examData, res); });

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
                                <a href="${ans}" download="rekaman_${email}_soal_${idx + 1}.webm" class="text-[11px] font-extrabold text-indigo-600 hover:underline"><i class="fas fa-download mr-1"></i>Unduh Audio</a>
                                ${transcript ? `<span class="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg"><strong>Transkrip:</strong> "${transcript}"</span>` : ''}
                            </div>
                        </div>`;
                } else {
                    disp = ans ? `<p class="whitespace-pre-line font-semibold text-slate-800">${ans}</p>` : '<span class="text-red-500 italic">Tidak dijawab</span>';
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
                                <span class="text-slate-500">Kunci: <strong>${['A','B','C','D'][q.answer] || 'A'}. ${q.options?.[q.answer] || ''}</strong></span>
                                <span class="font-extrabold ${currentPoint10 === 10 ? 'text-emerald-600' : 'text-red-600'}">${currentPoint10 === 10 ? '✓ Benar (+10 Poin)' : '✗ Salah (0 Poin)'}</span>
                            </div>
                        ` : `
                            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 items-center">
                                <div class="sm:col-span-4 flex items-center gap-2">
                                    <label class="font-extrabold text-emerald-700 shrink-0">Poin (0–10):</label>
                                    <input type="number" min="0" max="10" step="0.5" value="${currentPoint10}" oninput="updateQuestionManualPoint('${email}','${monthId}','${cat}',${idx},this.value)" class="hes-input !w-24 !py-1.5 !bg-white text-center font-black">
                                    <span class="text-slate-400 font-bold">/ 10</span>
                                </div>
                                <div class="sm:col-span-8">
                                    <input type="text" value="${res.questionNotes?.[key] || ''}" oninput="updateQuestionNote('${email}','${monthId}','${cat}',${idx},this.value)" placeholder="Catatan koreksi soal #${idx + 1} (opsional)..." class="hes-input !py-1.5 !bg-white text-xs">
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
                    <label class="block text-xs font-bold text-slate-700 mb-1">Kelas / Level Program</label>
                    <input type="text" id="admin-exam-level" value="${res.classLevel || ''}" oninput="window.HES.materials['exam_result-${email}-${monthId}'].classLevel=this.value" placeholder="Contoh: Beginner / Intermediate / Advanced" class="hes-input !bg-white">
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
        res.sectionScores[c] = computeExamSectionScore(c, examData, res);
    });
    res.isGraded = true;

    const { error } = await safeSaveMaterialsToCloud(materials => { materials[rKey] = res; });
    if (!error) {
        renderAdminGradingView(email, monthId);
        showToast('Nilai disimpan & Rapor berhasil diterbitkan!', 'success');
    } else {
        showToast('Gagal menyimpan nilai: ' + error.message, 'error');
    }
};