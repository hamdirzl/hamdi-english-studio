// js/admin.js

let currentAdminTab = 'overview';
let currentAdminMaterialSubtab = 'module';
let adminExamState = { student: '', month: '', activeTab: 'listening', data: null };
let currentAdminGradingTab = 'reading';

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth('admin')) return;
    currentAdminTab = new URLSearchParams(window.location.search).get('tab') || 'overview';
    initLayout('Panel Admin (CMS)');
    const initUI = () => { populateAllAdminDropdowns(); switchAdminTab(currentAdminTab); };
    initUI();

    await syncFromCloud();
    renderAppSidebar();
    initUI();
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
        overview:  '<i class="fas fa-calendar-day mr-1.5"></i> Jadwal Pertemuan',
        users:     '<i class="fas fa-users-cog mr-1.5"></i> Akun Murid',
        materials: '<i class="fas fa-book-open mr-1.5"></i> Materi & Recap',
        tasks:     '<i class="fas fa-microphone-lines mr-1.5"></i> Tugas Speaking',
        exam:      '<i class="fas fa-file-signature mr-1.5"></i> Ujian & Nilai'
    };
    Object.keys(labels).forEach(t => {
        const btn = $(`adm-tab-${t}`);
        if (btn) {
            btn.innerHTML = labels[t];
            btn.className = `px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${t === tabName ? 'bg-white text-teal-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`;
        }
        $(`admin-panel-${t}`)?.classList.toggle('hidden', t !== tabName);
    });
    if (tabName === 'overview') renderAdminSessionDatesGrid();
    if (tabName === 'users') { loadStudentAccessForm(); renderAdminUsersTab(); }
    if (tabName === 'materials') loadAdminMaterialEditor();
    if (tabName === 'tasks') renderAdminTasksList();
};

function populateAllAdminDropdowns() {
    const mOpts = window.HES.months.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
    const maxMOpts = window.HES.months.map(m => `<option value="${m.id.replace('m', '')}">Batas: ${m.title}</option>`).join('');
    const sOpts = window.HES.students.map(s => `<option value="${s.email}">${s.name} (${s.email})</option>`).join('');

    const fill = (id, html) => {
        const el = $(id);
        if (!el) return;
        const prev = el.value;
        el.innerHTML = html;
        if (prev && Array.from(el.options).some(o => o.value === prev)) el.value = prev;
    };

    fill('admin-session-date-student', sOpts);
    fill('admin-session-date-month', mOpts);
    fill('admin-sched-student', sOpts);
    fill('admin-sched-max-month', maxMOpts);
    fill('admin-target-student', `<option value="all">Global (Semua Murid)</option>${sOpts}`);
    fill('admin-task-target', `<option value="all">Semua Murid</option>${sOpts}`);
    fill('admin-task-month', `<option value="general">Umum / Bebas</option>${mOpts}`);
    fill('admin-task-review-student', `<option value="all">Tampilkan Semua Murid</option>${sOpts}`);
    ['admin-month', 'admin-exam-month'].forEach(id => fill(id, mOpts));
    fill('admin-exam-student', sOpts);

    loadStudentAccessForm();
    loadAdminMaterialEditor();
}

// ============================================================================
// TAB 1: INPUT TANGGAL PERTEMUAN MANUAL (HARI INI / BESOK / PILIH TANGGAL)
// ============================================================================
window.renderAdminSessionDatesGrid = function() {
    const grid = $('admin-session-dates-grid');
    const email = $('admin-session-date-student')?.value;
    const monthId = $('admin-session-date-month')?.value || 'm1';
    if (!grid || !email) {
        if (grid) grid.innerHTML = `<p class="text-xs text-stone-400 col-span-full text-center py-8">Belum ada akun murid terdaftar.</p>`;
        return;
    }

    const todayStr = getTodayStr();
    const tomorrowStr = getOffsetDateStr(1);
    const p = window.HES.materials[`profile-${email}`] || {};
    const sDates = p.sessionDates || {};

    let html = '';
    for (let i = 0; i < 12; i++) {
        const w = Math.floor(i / 3) + 1;
        const d = (i % 3) + 1;
        const key = `${monthId}-w${w}-d${d}`;
        const dateVal = sDates[key] || '';
        const hasMod = Boolean((window.HES.materials[`${email}-${key}-link`] || window.HES.materials[`all-${key}-link`] || '').trim());

        let badge = `<span class="px-2 py-0.5 rounded-md bg-stone-100 text-stone-500 text-[10px] font-extrabold"><i class="fas fa-lock mr-1"></i>Terkunci</span>`;
        let cardCls = 'bg-stone-50/70 border-stone-200';

        if (dateVal === todayStr) {
            badge = `<span class="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-extrabold"><i class="fas fa-star mr-1"></i>Hari Ini (Terbuka)</span>`;
            cardCls = 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-200';
        } else if (dateVal && dateVal < todayStr) {
            badge = `<span class="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-extrabold"><i class="fas fa-check-circle mr-1"></i>Terbuka</span>`;
            cardCls = 'bg-teal-50/40 border-teal-200';
        } else if (dateVal && dateVal > todayStr) {
            badge = `<span class="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-extrabold"><i class="fas fa-clock mr-1"></i>Terjadwal (Terkunci)</span>`;
            cardCls = 'bg-sky-50/35 border-sky-200';
        }

        html += `
            <div class="p-4 rounded-2xl border ${cardCls} space-y-3 transition">
                <div class="flex items-center justify-between gap-2">
                    <div>
                        <p class="text-sm font-extrabold text-stone-800">Pertemuan ${i + 1} <span class="text-xs font-bold text-stone-400">(W${w}•D${d})</span></p>
                        <p class="text-[11px] font-bold ${hasMod ? 'text-teal-700' : 'text-stone-400'}">${hasMod ? '✓ Materi siap' : '• Materi belum diisi'}</p>
                    </div>
                    ${badge}
                </div>

                <input type="date" value="${dateVal}" onchange="setStudentSessionDate('${email}', '${monthId}', ${w}, ${d}, this.value)" class="hes-input !bg-white !py-2 !text-xs">

                <div class="flex items-center gap-1.5">
                    <button type="button" onclick="setStudentSessionDate('${email}', '${monthId}', ${w}, ${d}, '${todayStr}')" class="flex-1 py-1.5 px-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-extrabold transition cursor-pointer">
                        Hari Ini
                    </button>
                    <button type="button" onclick="setStudentSessionDate('${email}', '${monthId}', ${w}, ${d}, '${tomorrowStr}')" class="flex-1 py-1.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-extrabold transition cursor-pointer">
                        Besok
                    </button>
                    ${dateVal ? `
                        <button type="button" onclick="setStudentSessionDate('${email}', '${monthId}', ${w}, ${d}, '')" title="Hapus tanggal & kunci kembali" class="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-extrabold transition cursor-pointer">
                            <i class="fas fa-lock"></i>
                        </button>` : ''}
                </div>
            </div>`;
    }
    grid.innerHTML = html;
};

window.setStudentSessionDate = async function(email, monthId, w, d, dateVal) {
    const key = `${monthId}-w${w}-d${d}`;
    const sNum = ((w - 1) * 3) + d;
    await safeSaveMaterialsToCloud(materials => {
        const p = materials[`profile-${email}`] || {};
        p.sessionDates = p.sessionDates || {};
        if (dateVal) p.sessionDates[key] = dateVal;
        else delete p.sessionDates[key];
        const mNum = parseInt(monthId.replace('m', '')) || 1;
        if (dateVal && (parseInt(p.maxMonth || 1) < mNum)) p.maxMonth = mNum;
        materials[`profile-${email}`] = p;
    });

    renderAdminSessionDatesGrid();
    renderAdminUsersTab();

    if (!dateVal) showToast(`Pertemuan ${sNum} dikunci kembali.`, 'info');
    else if (dateVal === getTodayStr()) showToast(`Pertemuan ${sNum} dibuka untuk Hari Ini!`, 'success');
    else if (dateVal > getTodayStr()) showToast(`Pertemuan ${sNum} dijadwalkan untuk ${getDisplayDate(parseDateStr(dateVal))} (otomatis terbuka di hari-H).`, 'info');
    else showToast(`Tanggal Pertemuan ${sNum} disimpan & terbuka.`, 'success');
};

window.addNewMonth = async function() {
    const n = window.HES.months.length + 1;
    window.HES.months.push({ id: `m${n}`, title: `Month ${n}`, weeks: [1, 2, 3, 4] });
    await saveToCloud('hes_months', window.HES.months);
    populateAllAdminDropdowns();
    showToast(`Month ${n} berhasil ditambahkan!`, 'success');
};

// ============================================================================
// TAB 2: MANAJEMEN AKUN MURID & AKSES BULAN
// ============================================================================
window.loadStudentAccessForm = function() {
    const email = $('admin-sched-student')?.value;
    if (!email) return;
    const p = window.HES.materials[`profile-${email}`] || {};
    if ($('admin-sched-max-month')) $('admin-sched-max-month').value = String(p.maxMonth || 1);
    const [s, e] = (p.time || '').includes('-') ? p.time.split('-').map(t => t.trim()) : ['', ''];
    if ($('admin-sched-start')) $('admin-sched-start').value = s;
    if ($('admin-sched-end')) $('admin-sched-end').value = e;
};

window.saveStudentAccess = async function() {
    const email = $('admin-sched-student').value;
    if (!email) return;
    await safeSaveMaterialsToCloud(materials => {
        const p = materials[`profile-${email}`] || {};
        p.maxMonth = parseInt($('admin-sched-max-month').value) || 1;
        const sT = $('admin-sched-start').value, eT = $('admin-sched-end').value;
        p.time = (sT && eT) ? `${sT} - ${eT}` : '';
        materials[`profile-${email}`] = p;
    });
    showToast('Pengaturan murid berhasil disimpan!', 'success');
    renderAdminUsersTab();
};

function renderAdminUsersTab() {
    const tbody = $('admin-students-table-body');
    if (!tbody) return;
    tbody.innerHTML = window.HES.students.map(s => {
        const p = window.HES.materials[`profile-${s.email}`] || {};
        const schedCount = Object.keys(p.sessionDates || {}).length;
        return `
            <tr class="border-b border-stone-100">
                <td class="p-3 font-extrabold text-stone-800">${s.name}</td>
                <td class="p-3 text-stone-500">${s.email}</td>
                <td class="p-3 font-bold">Batas Month ${p.maxMonth || 1} ${p.time ? `• ${p.time}` : ''}</td>
                <td class="p-3 font-extrabold text-teal-700">${schedCount} pertemuan diatur</td>
                <td class="p-3 font-mono">${s.password}</td>
                <td class="p-3 text-right space-x-1">
                    <button onclick="editStudentPassword('${s.email}')" class="hes-btn-soft !py-1.5 !px-2.5"><i class="fas fa-key"></i></button>
                    <button onclick="deleteStudentAccount('${s.email}')" class="hes-btn-soft !bg-rose-50 !text-rose-600 !border-rose-200 !py-1.5 !px-2.5"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    }).join('');
}

window.addNewStudent = async function() {
    const name = $('new-stu-name').value.trim(), email = $('new-stu-email').value.trim(), password = $('new-stu-pass').value.trim();
    if (!name || !email || !password) return showToast('Lengkapi semua kolom!', 'error');
    if (window.HES.students.some(s => s.email.toLowerCase() === email.toLowerCase())) return showToast('Email sudah terdaftar!', 'error');
    window.HES.students.push({ name, email, password });
    await saveToCloud('hes_students', window.HES.students);
    $('new-stu-name').value = ''; $('new-stu-email').value = ''; $('new-stu-pass').value = '';
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
// TAB 3: BUILDER MODUL MATERI & RECAP (TANPA WORDBANK / KOSAKATA)
// ============================================================================
window.switchAdminMaterialSubtab = function(sub) {
    currentAdminMaterialSubtab = sub;
    if ($('adm-mat-subtab-module')) $('adm-mat-subtab-module').className = `px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${sub === 'module' ? 'bg-white text-teal-700 shadow-xs' : 'text-stone-600 hover:text-stone-900'}`;
    if ($('adm-mat-subtab-recap')) $('adm-mat-subtab-recap').className = `px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${sub === 'recap' ? 'bg-white text-emerald-700 shadow-xs' : 'text-stone-600 hover:text-stone-900'}`;
    $('admin-editor-module-box')?.classList.toggle('hidden', sub !== 'module');
    $('admin-editor-recap-box')?.classList.toggle('hidden', sub !== 'recap');
    updateAdminMaterialStatusBadge();
};

window.selectAdminMaterialSession = function(week, day) {
    if ($('admin-week')) $('admin-week').value = String(week);
    if ($('admin-day')) $('admin-day').value = String(day);
    loadAdminMaterialEditor();
};

window.loadAdminMaterialEditor = function() {
    const pref = $('admin-target-student')?.value || 'all', m = $('admin-month')?.value || 'm1';
    const w = parseInt($('admin-week')?.value || '1'), d = parseInt($('admin-day')?.value || '1');
    const linkEl = $('admin-link'), recapEl = $('admin-recap-pdf');
    if (!linkEl || !recapEl) return;

    if ($('admin-material-session-indicator')) $('admin-material-session-indicator').innerText = `Sesi ${((w - 1) * 3) + d} dari 12 (${m.toUpperCase()} • W${w}•D${d})`;
    linkEl.value = window.HES.materials[`${pref}-${m}-w${w}-d${d}-link`] || '';
    recapEl.value = window.HES.materials[`${pref}-${m}-w${w}-d${d}-recap`] || '';

    renderAdminMonthSessionsBar(pref, m, w, d);
    updateAdminMaterialStatusBadge();
};

function renderAdminMonthSessionsBar(pref, m, activeW, activeD) {
    const bar = $('admin-month-sessions-bar');
    if (!bar) return;
    bar.innerHTML = Array.from({ length: 12 }, (_, i) => {
        const w = Math.floor(i / 3) + 1, d = (i % 3) + 1;
        const hasMod = Boolean((window.HES.materials[`${pref}-${m}-w${w}-d${d}-link`] || '').trim());
        const hasRec = Boolean((window.HES.materials[`${pref}-${m}-w${w}-d${d}-recap`] || '').trim());
        let cls = hasMod ? 'bg-teal-50 text-teal-800 border-teal-300' : 'bg-white text-stone-500 border-stone-200 hover:border-teal-300';
        if (w === activeW && d === activeD) cls = 'bg-teal-700 text-white border-teal-800 shadow-xs ring-2 ring-teal-300';
        return `<button type="button" onclick="selectAdminMaterialSession(${w}, ${d})" class="py-2 px-1 rounded-xl border text-xs font-extrabold transition flex flex-col items-center justify-center cursor-pointer ${cls}"><span>${i + 1}</span><span class="text-[9px] opacity-80">${hasMod ? (hasRec ? '✓+R' : '✓') : '-'}</span></button>`;
    }).join('');
}

function updateAdminMaterialStatusBadge() {
    const badge = $('admin-material-status-badge');
    if (!badge) return;
    const val = (currentAdminMaterialSubtab === 'module' ? $('admin-link')?.value : $('admin-recap-pdf')?.value || '').trim();
    badge.className = `text-[11px] font-extrabold px-3 py-1 rounded-lg ${val ? 'bg-teal-100 text-teal-800' : 'bg-stone-200 text-stone-600'}`;
    badge.innerHTML = val ? '<i class="fas fa-check-circle mr-1"></i> Sudah Terisi' : 'Belum Diisi';
}

window.copyGeminiModulePrompt = function(mode = 'single') {
    const m = ($('admin-month')?.value || 'm1').toUpperCase();
    const sNum = ((parseInt($('admin-week')?.value || '1') - 1) * 3) + parseInt($('admin-day')?.value || '1');

    const prompts = {
        single: `Act as an engaging, modern ESL author for "Hamdi English Studio". Create a fun, interactive, example-driven lesson handout for ${m} - Session ${sNum} on the topic: [ISI TOPIK MATERI DI SINI].
Use 100% SIMPLE, EASY-TO-UNDERSTAND ENGLISH (A2–B1). Explain briefly, teach with rich everyday examples, mini-dialogues, Side-by-Side Q&A cues, and free-talk prompts inside 1 code block:

TITLE: [Catchy Lesson Title]
LEVEL: [${m} • Session ${sNum} of 12]
STYLE: [teal / ocean / amber / indigo]
GOAL: [1 encouraging English sentence]

## Let's Hear It in Action!
A: [Natural line 1]
B: [Natural line 2]
A: [Natural line 3]
B: [Natural line 4]

> **Quick Tip**: [1–2 simple sentences explaining the core trick]

## How It Works (Patterns & Examples)
[+] [Pattern Name] | [Simple Formula] | [2 natural examples]
[-] [Negative Pattern] | [Simple Formula] | [2 natural examples]
[?] [Question Pattern] | [Simple Formula] | [2 question examples]

## Side-by-Side Guided Speaking Practice
- Cue 1: [Context] | Tutor: "[Question]" | Student: "[Sample Answer]"
- Cue 2: [Context] | Tutor: "[Question]" | Student: "[Sample Answer]"
- Cue 3: [Context] | Tutor: "[Question]" | Student: "[Sample Answer]"

## Sound Natural, Not Like a Robot!
- [Textbook: Stiff sentence] | [Natural: Friendly native sentence] | [Short simple tip]

## Your Turn! (Live Speaking)
1. [Quick Check]: [Fun question] (Answer: [Answer])
2. [Free Talk]: [Personal question] (Answer: [Sample starter])`,

        bulk: `Act as an engaging ESL curriculum author for "Hamdi English Studio". Create 12 Interactive Lesson Handouts (Session 1 to Session 12) for ${m} in 100% SIMPLE ENGLISH.
Theme: [ISI TEMA BULAN INI]. Separate each session with === on a new line inside 1 code block:

SESSION: 1
TITLE: [Title]
LEVEL: [${m} • Session 1 of 12]
STYLE: [teal / ocean / amber / indigo]
GOAL: [1 simple sentence]

## [Section 1]
[Dialogue A:/B: or short story + > **Quick Tip**: ...]

## [Section 2]
[Visual patterns [+]/[-]/[?] or useful expressions: Phrase | Meaning | Example]

## [Section 3]
[Side-by-Side Cues OR [Textbook: ...] | [Natural: ...] | [Tip]]

## [Section 4]
[3 Speaking Practice Tasks with (Answer: ...)]
===
SESSION: 2
... (up to SESSION: 12)`,

        recap: `Create a warm, encouraging Class Recap in 100% SIMPLE ENGLISH for Session ${sNum} (${m}).
Class notes: [ISI CATATAN KELAS HARI INI].

TITLE: Class Recap & Speaking Highlights • Session ${sNum}
LEVEL: ${m} • Personal Coaching Notes
STYLE: emerald
GOAL: Review our best examples from today's class!

## Great Job Today!
[2 warm sentences praising the student.]

## Favorite Expressions We Practiced
- [Expression 1] | [Simple meaning] | [Example sentence]
- [Expression 2] | [Simple meaning] | [Example sentence]

## Say It Naturally (Upgrades from Today)
- [In Class: Sentence to fix] | [Better & Natural: Corrected sentence] | [Short tip]

> **Fluency Tip**: [1 simple weekly speaking habit]

## Quick Practice
1. [Speaking Challenge]: [30-second speaking prompt] (Answer: [Sample starter])`
    };

    navigator.clipboard.writeText(prompts[mode] || prompts.single)
        .then(() => showToast('Prompt Gemini berhasil disalin!', 'success'))
        .catch(() => showToast('Gagal menyalin otomatis.', 'error'));
};

window.insertSampleModuleTemplate = function(type = 'module') {
    const m = ($('admin-month')?.value || 'm1').toUpperCase();
    const sNum = ((parseInt($('admin-week')?.value || '1') - 1) * 3) + parseInt($('admin-day')?.value || '1');

    if (type === 'module') {
        $('admin-link').value = `TITLE: Talking About Daily Habits & What You Are Doing Right Now
LEVEL: ${m} • Session ${sNum} of 12
STYLE: teal
GOAL: Easily switch between talking about your usual routine ("I usually...") and what is happening right now ("Right now, I'm...").

## Let's Hear It in Action!
Man: Hey Maya! Aren't you usually at the office at this hour?
Woman: I usually work at the office on Mondays, but today I'm working from a coffee shop!
Man: Nice! What are you drinking?
Woman: I usually order an Americano, but right now I'm trying an iced matcha latte.

> **Quick Tip**: Use **I usually + Verb 1** for habits, and **Right now / Today, I'm + Verb-ing** for things happening at this moment!

## Picture the Pattern
[+] Usual Habit | I / You / We / They + usually + Verb 1 | I usually cook dinner at home.
[*] Right Now / Today | Subject + am / is / are + Verb-ing | Today I'm eating out with friends!

## Side-by-Side Guided Practice
- Cue 1: Work Space | Tutor: "Where do you usually work, and where are you working today?" | Student: "I usually work at the office, but today I'm working from home."
- Cue 2: Dinner | Tutor: "Are you ordering food tonight?" | Student: "I usually order food on Fridays, but tonight I'm cooking fried rice!"

## Your Turn!
1. [Free Talk]: Tell me 2 things you usually do on weekends, and 1 thing you are doing this week! (Answer: Sample: "On weekends I usually relax at home, and this week I'm...")`;
    } else {
        $('admin-recap-pdf').value = `TITLE: Class Recap • Session ${sNum}
LEVEL: ${m} • Personal Coaching Notes
STYLE: emerald
GOAL: Review today's speaking highlights and sentence upgrades!

## Great Job Today!
You spoke clearly and confidently during our conversation practice today. Keep up the great energy!

## Say It Naturally
- [In Class: Right now I study English.] | [Better & Natural: Right now, I'm studying English.] | Use "I'm + Verb-ing" for actions happening right now.

> **Fluency Tip**: Try saying 1 quick English sentence aloud each morning about what you're doing!`;
    }
    updateAdminMaterialStatusBadge();
    showToast('Contoh format berhasil dimasukkan!', 'info');
};

window.saveMaterialData = async function(isBulk = false) {
    const pref = $('admin-target-student').value, m = $('admin-month').value;
    const w = parseInt($('admin-week').value), d = parseInt($('admin-day').value);
    const linkRaw = $('admin-link').value.trim(), recapRaw = $('admin-recap-pdf').value.trim();

    if (isBulk) {
        const activeText = currentAdminMaterialSubtab === 'module' ? linkRaw : recapRaw;
        const suffix = currentAdminMaterialSubtab === 'module' ? 'link' : 'recap';
        if (!activeText) return showToast('Tempelkan teks materi bulk terlebih dahulu!', 'error');

        let blocks = activeText.split(/\n\s*(?:===+|---+)\s*\n/).map(b => b.trim()).filter(Boolean);
        if (blocks.length === 1 && /SESSION\s*:\s*\d+/i.test(activeText)) {
            blocks = activeText.split(/(?=^SESSION\s*:\s*\d+)/im).map(b => b.trim()).filter(Boolean);
        }
        if (!blocks.length) return showToast('Teks kosong atau format tidak dikenali.', 'error');

        let savedCount = 0;
        const startIdx = ((w - 1) * 3) + (d - 1);
        await safeSaveMaterialsToCloud(materials => {
            blocks.forEach((block, idx) => {
                let targetIdx = startIdx + idx;
                const sMatch = block.match(/^SESSION\s*:\s*(\d+)/im);
                if (sMatch && parseInt(sMatch[1]) >= 1 && parseInt(sMatch[1]) <= 12) targetIdx = parseInt(sMatch[1]) - 1;
                if (targetIdx >= 0 && targetIdx < 12) {
                    const cleanBlock = block.replace(/^SESSION\s*:\s*\d+\s*\n?/im, '').trim();
                    if (cleanBlock) {
                        materials[`${pref}-${m}-w${Math.floor(targetIdx / 3) + 1}-d${(targetIdx % 3) + 1}-${suffix}`] = cleanBlock;
                        savedCount++;
                    }
                }
            });
        });
        loadAdminMaterialEditor();
        return showToast(`${savedCount} Sesi berhasil disimpan sekaligus untuk ${m.toUpperCase()}!`, 'success');
    }

    await safeSaveMaterialsToCloud(materials => {
        if (linkRaw) materials[`${pref}-${m}-w${w}-d${d}-link`] = linkRaw; else delete materials[`${pref}-${m}-w${w}-d${d}-link`];
        if (recapRaw) materials[`${pref}-${m}-w${w}-d${d}-recap`] = recapRaw; else delete materials[`${pref}-${m}-w${w}-d${d}-recap`];
    });
    loadAdminMaterialEditor();
    showToast(`Materi Sesi (W${w}•D${d}) berhasil disimpan!`, 'success');
};

window.clearCurrentSessionMaterial = async function() {
    const pref = $('admin-target-student').value, m = $('admin-month').value, w = $('admin-week').value, d = $('admin-day').value;
    if (!confirm(`Kosongkan Modul & Recap pada ${m.toUpperCase()} Minggu ${w} Hari ${d}?`)) return;
    await safeSaveMaterialsToCloud(materials => {
        delete materials[`${pref}-${m}-w${w}-d${d}-link`];
        delete materials[`${pref}-${m}-w${w}-d${d}-recap`];
    });
    loadAdminMaterialEditor();
    showToast('Materi sesi ini berhasil dikosongkan.', 'info');
};

// ============================================================================
// TAB 4: TUGAS SPEAKING / CONVERSATION (BUAT SOAL, DENGAR REKAMAN & NILAI)
// ============================================================================
const escAdm = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

window.resetAdminTaskForm = function() {
    $('admin-task-id').value = '';
    $('admin-task-title').value = '';
    $('admin-task-instruction').value = '';
    $('admin-task-sample').value = '';
    $('admin-task-form-title').innerHTML = `<i class="fas fa-microphone-lines text-amber-500 mr-1.5"></i> Buat Tugas Conversation`;
    $('btn-cancel-edit-task')?.classList.add('hidden');
};

window.saveAdminSpeakingTask = async function() {
    const id = $('admin-task-id').value.trim();
    const target = $('admin-task-target').value || 'all';
    const monthId = $('admin-task-month').value || 'general';
    const title = $('admin-task-title').value.trim();
    const instruction = $('admin-task-instruction').value.trim();
    const sample = $('admin-task-sample').value.trim();

    if (!title || !instruction) return showToast('Isi Judul dan Instruksi Conversation terlebih dahulu!', 'error');

    const { error } = await safeSaveMaterialsToCloud(materials => {
        const list = Array.isArray(materials['speaking_tasks']) ? materials['speaking_tasks'] : [];
        if (id) {
            const idx = list.findIndex(t => t.id === id);
            if (idx !== -1) list[idx] = { ...list[idx], target, monthId, title, instruction, sample };
        } else {
            list.unshift({
                id: 'task_' + Date.now().toString(36),
                target, monthId, title, instruction, sample,
                createdAt: new Date().toISOString()
            });
        }
        materials['speaking_tasks'] = list;
    });

    if (!error) {
        resetAdminTaskForm();
        renderAdminTasksList();
        showToast(id ? 'Tugas Conversation diperbarui!' : 'Tugas Conversation berhasil dikirim ke murid!', 'success');
    } else showToast('Gagal menyimpan tugas: ' + error.message, 'error');
};

window.editAdminSpeakingTask = function(taskId) {
    const t = getAllSpeakingTasks().find(x => x.id === taskId);
    if (!t) return;
    $('admin-task-id').value = t.id;
    $('admin-task-target').value = t.target || 'all';
    $('admin-task-month').value = t.monthId || 'general';
    $('admin-task-title').value = t.title || '';
    $('admin-task-instruction').value = t.instruction || '';
    $('admin-task-sample').value = t.sample || '';
    $('admin-task-form-title').innerHTML = `<i class="fas fa-pen text-teal-600 mr-1.5"></i> Edit Tugas Conversation`;
    $('btn-cancel-edit-task')?.classList.remove('hidden');
    $('admin-task-title').focus();
};

window.deleteAdminSpeakingTask = async function(taskId) {
    if (!confirm('Hapus tugas conversation ini?')) return;
    await safeSaveMaterialsToCloud(materials => {
        materials['speaking_tasks'] = (materials['speaking_tasks'] || []).filter(t => t.id !== taskId);
    });
    renderAdminTasksList();
    showToast('Tugas berhasil dihapus.', 'info');
};

window.renderAdminTasksList = function() {
    const box = $('admin-tasks-list-container');
    if (!box) return;
    const tasks = getAllSpeakingTasks();
    const filterStu = $('admin-task-review-student')?.value || 'all';

    if (!tasks.length) {
        box.innerHTML = `<p class="text-xs text-stone-400 text-center py-10 font-bold">Belum ada tugas conversation. Buat tugas pertama di sebelah kiri!</p>`;
        return;
    }

    box.innerHTML = tasks.map(t => {
        const targetStudents = window.HES.students.filter(s => {
            const matchesTask = !t.target || t.target === 'all' || t.target === s.email;
            const matchesFilter = filterStu === 'all' || filterStu === s.email;
            return matchesTask && matchesFilter;
        });

        const subsHTML = targetStudents.map(s => {
            const sub = getTaskSubmission(s.email, t.id);
            const safeId = `${s.email.replace(/[^a-zA-Z0-9]/g, '_')}_${t.id}`;

            if (!sub || !sub.audioData) {
                return `
                    <div class="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/70 text-xs">
                        <span class="font-bold text-stone-600">${escAdm(s.name)}</span>
                        <span class="px-2.5 py-0.5 rounded-md bg-stone-200/80 text-stone-500 text-[10px] font-extrabold">Belum Mengumpulkan</span>
                    </div>`;
            }

            const isGraded = sub.status === 'graded';
            return `
                <div class="p-3.5 rounded-2xl ${isGraded ? 'bg-teal-50/50 border-teal-200' : 'bg-amber-50/60 border-amber-200'} border space-y-2.5 text-xs">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <span class="font-extrabold text-stone-800">${escAdm(s.name)}</span>
                            <span class="text-stone-400 ml-1">(${s.email})</span>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${isGraded ? 'bg-teal-700 text-white' : 'bg-amber-500 text-white'}">
                            ${isGraded ? `✓ Dinilai: ${sub.score}/100` : '● Baru Masuk'}
                        </span>
                    </div>
                    <audio controls preload="metadata" src="${sub.audioData}" class="w-full h-10 rounded-lg"></audio>
                    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div class="sm:col-span-3">
                            <input type="number" min="0" max="100" id="task-score-${safeId}" value="${sub.score ?? 85}" placeholder="Skor" class="hes-input !bg-white !py-1.5 text-center font-black">
                        </div>
                        <div class="sm:col-span-9">
                            <input type="text" id="task-fb-${safeId}" value="${escAdm(sub.feedback || '')}" placeholder="Tulis feedback pronunciation / grammar..." class="hes-input !bg-white !py-1.5 !text-xs">
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <a href="${sub.audioData}" download="tugas_${s.name.replace(/\s+/g, '_')}_${t.id}.webm" class="text-[11px] font-extrabold text-teal-700 hover:underline"><i class="fas fa-download mr-1"></i>Unduh Audio</a>
                        <div class="flex gap-1.5">
                            <button type="button" onclick="resetSpeakingTaskSubmission('${s.email}', '${t.id}')" class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-extrabold cursor-pointer"><i class="fas fa-undo mr-1"></i>Minta Ulang</button>
                            <button type="button" onclick="gradeSpeakingTask('${s.email}', '${t.id}', '${safeId}')" class="px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-extrabold cursor-pointer"><i class="fas fa-check mr-1"></i>Simpan Nilai</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="p-4 rounded-2xl bg-white border border-stone-200 space-y-3">
                <div class="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                    <div>
                        <div class="flex flex-wrap items-center gap-1.5 mb-1">
                            <span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase">${escAdm(t.monthId || 'General')}</span>
                            <span class="text-[11px] font-bold text-stone-400">Target: ${t.target === 'all' ? 'Semua Murid' : escAdm(t.target)}</span>
                        </div>
                        <h4 class="text-sm sm:text-base font-extrabold text-stone-900">${escAdm(t.title)}</h4>
                        <p class="text-xs text-stone-600 mt-1 whitespace-pre-line">${escAdm(t.instruction)}</p>
                    </div>
                    <div class="flex gap-1 shrink-0">
                        <button type="button" onclick="editAdminSpeakingTask('${t.id}')" class="w-8 h-8 rounded-xl bg-stone-100 hover:bg-teal-50 text-stone-600 hover:text-teal-700 flex items-center justify-center text-xs cursor-pointer"><i class="fas fa-pen"></i></button>
                        <button type="button" onclick="deleteAdminSpeakingTask('${t.id}')" class="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs cursor-pointer"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="space-y-2.5">${subsHTML || '<p class="text-xs text-stone-400 italic">Tidak ada murid sesuai filter.</p>'}</div>
            </div>`;
    }).join('');
};

window.gradeSpeakingTask = async function(email, taskId, safeId) {
    const score = Math.max(0, Math.min(100, parseInt($(`task-score-${safeId}`)?.value || '0')));
    const feedback = $(`task-fb-${safeId}`)?.value.trim() || '';

    const { error } = await safeSaveMaterialsToCloud(materials => {
        const key = `task_sub-${email}-${taskId}`;
        if (!materials[key]) return;
        materials[key].score = score;
        materials[key].feedback = feedback;
        materials[key].status = 'graded';
        materials[key].gradedAt = new Date().toISOString();
    });

    if (!error) { renderAdminTasksList(); showToast('Nilai & feedback tugas berhasil disimpan!', 'success'); }
    else showToast('Gagal menyimpan nilai: ' + error.message, 'error');
};

window.resetSpeakingTaskSubmission = async function(email, taskId) {
    if (!confirm(`Hapus rekaman ${email} agar murid bisa merekam ulang tugas ini?`)) return;
    await safeSaveMaterialsToCloud(materials => { delete materials[`task_sub-${email}-${taskId}`]; });
    renderAdminTasksList();
    showToast('Rekaman direset. Murid bisa merekam ulang sekarang.', 'info');
};

// ============================================================================
// TAB 5: BUILDER SOAL UJIAN, RESET PER BAGIAN (+ KUOTA LISTENING) & PENILAIAN
// ============================================================================
window.loadAdminExamData = async function() {
    await syncFromCloud();
    adminExamState.student = $('admin-exam-student').value;
    adminExamState.month = $('admin-exam-month').value;
    const saved = window.HES.materials[`exam-${adminExamState.student}-${adminExamState.month}`];
    adminExamState.data = saved ? JSON.parse(JSON.stringify(saved)) : { listening: [], speaking: [], reading: [], writing: [] };
    ['listening', 'speaking', 'reading', 'writing'].forEach(k => { if (!Array.isArray(adminExamState.data[k])) adminExamState.data[k] = []; });
    $('admin-grading-workspace').classList.add('hidden');
    $('admin-exam-workspace').classList.remove('hidden');
    switchExamTab(adminExamState.activeTab || 'listening');
};

window.switchExamTab = function(tab) {
    window.stopNaturalEnglishTTS();
    adminExamState.activeTab = tab;
    ['listening', 'speaking', 'reading', 'writing'].forEach(t => {
        const count = (adminExamState.data?.[t] || []).length, btn = $(`tab-${t}`);
        if (btn) {
            btn.innerHTML = `<span class="capitalize">${t}</span> <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] ${count === 10 ? 'bg-teal-100 text-teal-800' : 'bg-stone-200 text-stone-600'}">${count}/10</span>`;
            btn.className = `px-4 py-3 text-xs font-extrabold border-b-2 transition cursor-pointer ${t === tab ? 'border-teal-700 text-teal-700 bg-white' : 'border-transparent text-stone-500'}`;
        }
    });
    renderExamQuestions();
};

window.copyGeminiExamPrompt = function() {
    const promptText = `Buatkan paket soal ujian bahasa Inggris tentang materi: [ISI TOPIK MATERI DI SINI].
Buat masing-masing 10 soal untuk 4 bagian (Listening, Speaking, Reading, Writing) dalam 4 kotak code block terpisah. Gunakan pemisah === antar soal.

1. LISTENING (10 Pilihan Ganda):
AUDIO: Man: [kalimat pria] / Woman: [kalimat wanita]
Q: [Pertanyaan bahasa Inggris]
A: [Pilihan A]
B: [Pilihan B]
C: [Pilihan C]
D: [Pilihan D]
KEY: [A/B/C/D]
EXP: [Pembahasan singkat]
===

2. SPEAKING (10 Baca Nyaring / Speaking):
Q: [Instruksi soal]
TARGET: [Kalimat bahasa Inggris target]
EXP: [Tips pelafalan]
===

3. READING (10 Pilihan Ganda):
Q: [Teks pendek & pertanyaan]
A: [Pilihan A]
B: [Pilihan B]
C: [Pilihan C]
D: [Pilihan D]
KEY: [A/B/C/D]
EXP: [Pembahasan singkat]
===

4. WRITING (10 Isian / Essay):
Q: [Instruksi & soal]
KEY: [Kunci jawaban]
EXP: [Pembahasan singkat]
===`;
    navigator.clipboard.writeText(promptText).then(() => showToast('Prompt Gemini Ujian disalin!', 'success'));
};

window.toggleBulkImportBox = () => $('bulk-import-box')?.classList.toggle('hidden');

window.processBulkExamImport = async function(replaceExisting = true) {
    const raw = $('bulk-import-textarea')?.value.trim();
    if (!raw) return showToast('Tempelkan teks daftar soal terlebih dahulu!', 'error');

    const tab = adminExamState.activeTab;
    let blocks = raw.split(/\n\s*(?:===+|---+)\s*\n/).map(b => b.trim()).filter(Boolean);
    if (blocks.length === 1) blocks = raw.split(/\n{2,}(?=(?:Soal\s*#?\d+|AUDIO\s*:|Q\s*:|1\s*:))/i).map(b => b.trim()).filter(Boolean);

    const parsed = [];
    blocks.forEach((block, bIdx) => {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l && !/^soal\s*#?\d+/i.test(l));
        if (!lines.length) return;
        let audioLines = [], f = { q: '', a: '', b: '', c: '', d: '', key: '', exp: '' }, cur = '';
        const rules = [
            [/^(?:Q|QUESTION|PERTANYAAN|SOAL)\s*:\s*/i, 'q'],
            [/^A\s*[.:)]\s*/i, 'a'], [/^B\s*[.:)]\s*/i, 'b'], [/^C\s*[.:)]\s*/i, 'c'], [/^D\s*[.:)]\s*/i, 'd'],
            [/^(?:KEY|ANSWER|TARGET|KUNCI|JAWABAN)\s*:\s*/i, 'key'],
            [/^(?:EXP|EXPLANATION|PEMBAHASAN|TIPS)\s*:\s*/i, 'exp']
        ];

        lines.forEach(line => {
            if (/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:/i.test(line)) {
                cur = 'audio';
                const rest = line.replace(/^(?:AUDIO|SCRIPT|TEKS AUDIO)\s*:\s*/i, '').trim();
                if (rest) audioLines.push(rest);
                return;
            }
            for (const [rgx, key] of rules) {
                if (rgx.test(line)) { cur = key; f[key] = line.replace(rgx, '').trim(); return; }
            }
            if (tab === 'listening' && (cur === 'audio' || /^(?:Man|Woman|Male|Female|Boy|Girl|Speaker\s*[AB])\s*:/i.test(line))) audioLines.push(line);
            else if (cur === 'q') f.q += '\n' + line;
        });

        const audioScript = audioLines.join('\n').replace(/\s*[\/|]\s*/g, '\n').trim();
        if (!f.q && !audioScript) return;
        const qType = (tab === 'speaking' || tab === 'writing') ? 'essay' : ((f.a || f.b || f.c || f.d) ? 'mcq' : 'essay');
        parsed.push({
            id: `${Date.now()}_${bIdx}`, type: qType, question: f.q || `Question #${bIdx + 1}`,
            audioScript, mediaUrl: '', options: qType === 'mcq' ? [f.a, f.b, f.c, f.d] : [],
            answer: qType === 'mcq' ? ({ A: 0, B: 1, C: 2, D: 3 }[String(f.key || 'A').trim().toUpperCase().charAt(0)] ?? 0) : f.key,
            explanation: f.exp
        });
    });

    if (!parsed.length) return showToast('Format teks belum sesuai contoh.', 'error');
    adminExamState.data[tab] = replaceExisting ? parsed : [...(adminExamState.data[tab] || []), ...parsed];
    switchExamTab(tab);
    await saveAdminExamData();
    showToast(`${parsed.length} soal ${tab.toUpperCase()} berhasil diinput!`, 'success');
};

window.addExamQuestion = function(type) {
    const tab = adminExamState.activeTab, defaultType = tab === 'speaking' ? 'essay' : type;
    adminExamState.data[tab].push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        type: defaultType, question: '', audioScript: '', mediaUrl: '',
        options: defaultType === 'mcq' ? ['', '', '', ''] : [],
        answer: defaultType === 'mcq' ? 0 : '', explanation: ''
    });
    switchExamTab(tab);
};

window.removeExamQuestion = idx => { adminExamState.data[adminExamState.activeTab].splice(idx, 1); switchExamTab(adminExamState.activeTab); };

window.updateExamField = function(idx, field, val, optIdx = null) {
    const q = adminExamState.data[adminExamState.activeTab][idx];
    if (!q) return;
    if (optIdx !== null) q.options[optIdx] = val;
    else if (field === 'answer' && q.type === 'mcq') q.answer = parseInt(val) || 0;
    else if (field === 'audioScript') q.audioScript = String(val || '').replace(/\s*[\/|]\s*/g, '\n').trim();
    else q[field] = val;
};

function renderExamQuestions() {
    const box = $('admin-exam-questions-container'), tab = adminExamState.activeTab, list = adminExamState.data[tab] || [];
    const bulkImportUI = `
        <div class="p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-amber-50/60 border border-teal-200 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                    <h4 class="text-xs sm:text-sm font-extrabold text-teal-950 uppercase flex items-center gap-1.5"><i class="fas fa-bolt text-amber-500"></i> Bagian ${tab} • ${list.length} / 10 Soal</h4>
                    <p class="text-xs text-stone-600 mt-0.5">Klik <strong>Input Cepat 10 Soal</strong> untuk menempelkan soal langsung dari Gemini.</p>
                </div>
                <div class="flex flex-wrap gap-2 shrink-0">
                    <button type="button" onclick="copyGeminiExamPrompt()" class="px-3 py-2 rounded-xl bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 text-xs font-extrabold transition cursor-pointer"><i class="fas fa-copy mr-1"></i> Salin Prompt Gemini</button>
                    <button type="button" onclick="toggleBulkImportBox()" class="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"><i class="fas fa-paste mr-1"></i> Input Cepat 10 Soal</button>
                </div>
            </div>
            <div id="bulk-import-box" class="hidden pt-3 border-t border-teal-200/70 space-y-2.5">
                <textarea id="bulk-import-textarea" rows="7" class="hes-input !bg-white font-mono text-xs" placeholder="Tempelkan soal ${tab.toUpperCase()} di sini (pisahkan antar soal dengan ===)..."></textarea>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="processBulkExamImport(true)" class="hes-btn-primary flex-1 !py-2.5 !text-xs"><i class="fas fa-magic"></i> Proses & Ganti Semua</button>
                    <button type="button" onclick="processBulkExamImport(false)" class="hes-btn-soft !bg-white !py-2.5 !text-xs">+ Tambahkan ke Bawah</button>
                </div>
            </div>
        </div>`;

    if (!list.length) {
        box.innerHTML = bulkImportUI + `<p class="text-xs text-stone-400 text-center py-8">Belum ada soal di bagian ${tab.toUpperCase()}.</p>`;
        return;
    }

    box.innerHTML = bulkImportUI + list.map((q, idx) => {
        const scriptVal = q.audioScript || (!String(q.mediaUrl || '').startsWith('http') ? (q.mediaUrl || '') : '');
        const mp3Val = String(q.mediaUrl || '').startsWith('http') ? q.mediaUrl : '';
        return `
        <div class="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2"><span class="px-2.5 py-1 rounded-lg bg-teal-700 text-white text-xs font-extrabold">Soal #${idx + 1}</span><span class="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold">10 Poin</span></div>
                <button type="button" onclick="removeExamQuestion(${idx})" class="text-xs text-rose-500 hover:text-rose-700 font-bold cursor-pointer"><i class="fas fa-trash mr-1"></i>Hapus</button>
            </div>
            ${tab === 'listening' ? `
                <div class="p-3.5 rounded-xl bg-white border border-teal-200 space-y-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-extrabold text-teal-700"><i class="fas fa-headphones-alt mr-1"></i> Naskah Audio Listening (Man / Woman)</label>
                        <button type="button" onclick="playNaturalEnglishTTS(document.getElementById('script_${idx}').value, this)" class="px-3 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold transition cursor-pointer"><i class="fas fa-play mr-1"></i> Tes Suara</button>
                    </div>
                    <textarea id="script_${idx}" oninput="updateExamField(${idx},'audioScript',this.value)" rows="2" placeholder="Man: ...&#10;Woman: ..." class="hes-input !bg-stone-50 text-xs">${scriptVal}</textarea>
                    <input type="text" onchange="updateExamField(${idx},'mediaUrl',this.value)" value="${mp3Val}" placeholder="Opsional: Link file MP3 eksternal" class="hes-input !bg-stone-50 !py-1.5 text-[11px]">
                </div>` : ''}
            <div><label class="block text-[11px] font-bold text-stone-500 uppercase mb-1">Pertanyaan / Instruksi Soal #${idx + 1}</label><textarea oninput="updateExamField(${idx},'question',this.value)" rows="2" class="hes-input !bg-white">${q.question || ''}</textarea></div>
            ${q.type === 'mcq' ? `
                <div class="space-y-2 pt-1">
                    <p class="text-[11px] font-bold text-teal-700 uppercase">Kunci Jawaban Benar (+10 Poin Otomatis):</p>
                    ${['A', 'B', 'C', 'D'].map((l, oIdx) => `<div class="flex items-center gap-2"><input type="radio" name="corr_${tab}_${idx}" ${Number(q.answer) === oIdx ? 'checked' : ''} onchange="updateExamField(${idx},'answer',${oIdx})"><span class="text-xs font-extrabold w-5">${l}.</span><input type="text" value="${q.options?.[oIdx] || ''}" oninput="updateExamField(${idx},'options',this.value,${oIdx})" placeholder="Pilihan ${l}" class="hes-input !bg-white !py-1.5"></div>`).join('')}
                </div>` : `
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="text-[11px] font-bold text-teal-700 uppercase">${tab === 'speaking' ? 'Kalimat Target Pelafalan' : 'Kunci Jawaban / Kriteria'}</label>
                        ${tab === 'speaking' ? `<button type="button" onclick="playNaturalEnglishTTS(document.getElementById('ans_key_${idx}').value, this)" class="text-[11px] font-extrabold text-teal-700 hover:underline cursor-pointer"><i class="fas fa-volume-up mr-1"></i>Tes Pelafalan</button>` : ''}
                    </div>
                    <textarea id="ans_key_${idx}" oninput="updateExamField(${idx},'answer',this.value)" rows="2" class="hes-input !bg-white">${q.answer || ''}</textarea>
                </div>`}
            <input type="text" oninput="updateExamField(${idx},'explanation',this.value)" value="${q.explanation || ''}" placeholder="Pembahasan / catatan evaluasi..." class="hes-input !bg-white">
        </div>`;
    }).join('');
}

window.saveAdminExamData = async function() {
    const { error } = await safeSaveMaterialsToCloud(materials => { materials[`exam-${adminExamState.student}-${adminExamState.month}`] = adminExamState.data; });
    showToast(error ? 'Gagal menyimpan soal: ' + error.message : 'Seluruh soal ujian berhasil disimpan ke Cloud!', error ? 'error' : 'success');
};

window.resetStudentExam = async function() {
    await syncFromCloud();
    const s = $('admin-exam-student').value, m = $('admin-exam-month').value;
    const stuObj = window.HES.students.find(x => x.email === s) || { name: s };
    const res = window.HES.materials[`exam_result-${s}-${m}`];

    let modal = $('hes-reset-exam-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'hes-reset-exam-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4';
        document.body.appendChild(modal);
    }

    const cats = [
        { id: 'reading',   label: 'Reading',   icon: 'fa-book-open',        color: 'sky' },
        { id: 'writing',   label: 'Writing',   icon: 'fa-pen-nib',          color: 'teal' },
        { id: 'speaking',  label: 'Speaking',  icon: 'fa-microphone-lines', color: 'emerald' },
        { id: 'listening', label: 'Listening', icon: 'fa-headphones',       color: 'amber' }
    ];

    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 fade-in">
            <div class="flex items-center justify-between border-b border-stone-100 pb-3">
                <div>
                    <h4 class="text-base font-extrabold text-stone-900"><i class="fas fa-undo text-rose-500 mr-1.5"></i> Pilih Bagian Ujian yang Direset</h4>
                    <p class="text-xs font-bold text-stone-500 mt-0.5">${stuObj.name} &bull; ${m.toUpperCase()}</p>
                </div>
                <button onclick="document.getElementById('hes-reset-exam-modal').classList.add('hidden')" class="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center cursor-pointer"><i class="fas fa-times"></i></button>
            </div>
            <p class="text-xs text-stone-600 leading-relaxed">Reset Listening juga otomatis mereset kuota putar audio (2x) di perangkat murid.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                ${cats.map(c => {
                    const isSub = res?.submittedTabs?.includes(c.id) || Object.keys(res?.answers || {}).some(k => k.startsWith(`${c.id}_`));
                    const sc = res?.sectionScores?.[c.id] ?? '-';
                    return `
                        <button onclick="executeSelectiveExamReset('${s}', '${m}', '${c.id}')" class="p-3.5 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${isSub ? 'bg-white border-stone-200 hover:border-rose-400 hover:bg-rose-50/40' : 'bg-stone-50 border-stone-100 opacity-75'}">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-extrabold text-stone-800"><i class="fas ${c.icon} text-${c.color}-600 mr-1.5"></i> ${c.label}</span>
                                <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${isSub ? 'bg-teal-100 text-teal-800' : 'bg-stone-200 text-stone-500'}">${isSub ? `Skor: ${sc}` : 'Kosong'}</span>
                            </div>
                            <span class="text-[11px] font-bold text-rose-600 mt-2.5 inline-flex items-center gap-1"><i class="fas fa-redo text-[10px]"></i> Reset ${c.label} Saja</span>
                        </button>`;
                }).join('')}
            </div>
            <div class="pt-3 border-t border-stone-100 flex flex-col sm:flex-row gap-2">
                <button onclick="executeSelectiveExamReset('${s}', '${m}', 'all')" class="hes-btn-primary !bg-rose-600 flex-1 !py-2.5 !text-xs"><i class="fas fa-trash-alt"></i> Reset Seluruh Ujian (4 Bagian)</button>
                <button onclick="document.getElementById('hes-reset-exam-modal').classList.add('hidden')" class="hes-btn-soft !bg-stone-100 !text-stone-600 !border-stone-200 !py-2.5 !text-xs">Batal</button>
            </div>
        </div>`;
    modal.classList.remove('hidden');
};

window.executeSelectiveExamReset = async function(email, monthId, targetSection = 'all') {
    const label = targetSection === 'all' ? 'SELURUH 4 BAGIAN ujian' : `bagian ${targetSection.toUpperCase()} saja`;
    if (!confirm(`Yakin ingin mereset ${label} untuk ${email} (${monthId.toUpperCase()})?`)) return;

    const rKey = `exam_result-${email}-${monthId}`;
    const examData = window.HES.materials[`exam-${email}-${monthId}`];

    await safeSaveMaterialsToCloud(materials => {
        if (targetSection === 'all') {
            // Simpan listeningResetEpoch baru agar kuota anti-curang di localStorage murid ikut ter-reset bersih
            materials[rKey] = {
                status: 'partial', answers: {}, scores: {}, sectionScores: {}, transcripts: {},
                submittedTabs: [], audioPlayCounts: {}, isGraded: false, listeningResetEpoch: Date.now()
            };
            return;
        }
        const res = materials[rKey] || { status: 'partial', answers: {}, scores: {}, sectionScores: {}, transcripts: {}, submittedTabs: [], audioPlayCounts: {} };
        ['answers', 'scores', 'transcripts', 'questionNotes', 'audioPlayCounts'].forEach(prop => {
            if (!res[prop]) return;
            Object.keys(res[prop]).forEach(k => { if (k.startsWith(`${targetSection}_`)) delete res[prop][k]; });
        });
        if (targetSection === 'listening') res.listeningResetEpoch = Date.now();
        if (Array.isArray(res.submittedTabs)) res.submittedTabs = res.submittedTabs.filter(t => t !== targetSection);
        res.sectionScores = res.sectionScores || {};
        res.sectionScores[targetSection] = 0;
        res.status = (res.submittedTabs && res.submittedTabs.length >= 4) ? 'submitted' : 'partial';
        ['reading', 'writing', 'speaking', 'listening'].forEach(c => {
            if (c !== targetSection) res.sectionScores[c] = computeExamSectionScore(c, examData, res);
        });
        materials[rKey] = res;
    });

    $('hes-reset-exam-modal')?.classList.add('hidden');
    if (!$('admin-grading-workspace')?.classList.contains('hidden')) renderAdminGradingView(email, monthId);
    showToast(targetSection === 'all' ? 'Seluruh ujian & kuota listening berhasil direset!' : `Bagian ${targetSection.toUpperCase()} berhasil direset!`, 'info');
};

window.loadStudentExamForGrading = async function() {
    const s = $('admin-exam-student').value, m = $('admin-exam-month').value;
    $('admin-exam-workspace').classList.add('hidden');
    const ws = $('admin-grading-workspace');
    ws.classList.remove('hidden');
    ws.innerHTML = `<div class="p-8 text-center text-xs font-bold text-stone-500"><i class="fas fa-sync fa-spin mr-1.5"></i> Mengambil data ujian dari Cloud...</div>`;
    await syncFromCloud();
    renderAdminGradingView(s, m);
};

window.updateQuestionManualPoint = function(email, monthId, cat, idx, val10) {
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (!res) return;
    res.scores = res.scores || {};
    res.scores[`${cat}_${idx}`] = Math.max(0, Math.min(10, parseFloat(val10) || 0));
    res.sectionScores = res.sectionScores || {};
    res.sectionScores[cat] = computeExamSectionScore(cat, window.HES.materials[`exam-${email}-${monthId}`], res);
    if ($(`grade-tab-btn-${cat}`)) $(`grade-tab-btn-${cat}`).innerText = `${cat} (${res.sectionScores[cat]}/100)`;
};

window.updateQuestionNote = function(email, monthId, cat, idx, noteText) {
    const res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (res) { res.questionNotes = res.questionNotes || {}; res.questionNotes[`${cat}_${idx}`] = noteText; }
};

window.renderAdminGradingView = function(email, monthId) {
    const ws = $('admin-grading-workspace'), examData = window.HES.materials[`exam-${email}-${monthId}`], res = window.HES.materials[`exam_result-${email}-${monthId}`];
    if (!examData) { ws.innerHTML = `<p class="text-xs text-stone-400 text-center py-6">Soal ujian belum dibuat untuk murid & bulan ini.</p>`; return; }
    const hasAnyAns = res && (Object.keys(res.answers || {}).length > 0 || (res.submittedTabs?.length > 0));
    if (!hasAnyAns) {
        ws.innerHTML = `<div class="p-6 rounded-2xl bg-stone-50 border border-stone-200 text-center space-y-3"><p class="text-xs font-bold text-stone-500">Murid belum mengumpulkan jawaban ujian pada bulan ini.</p><button onclick="loadStudentExamForGrading()" class="hes-btn-soft !py-2 !px-4 !text-xs"><i class="fas fa-sync-alt mr-1"></i> Muat Ulang</button></div>`;
        return;
    }

    res.answers = res.answers || {}; res.scores = res.scores || {}; res.questionNotes = res.questionNotes || {}; res.sectionScores = res.sectionScores || {};
    const cats = ['reading', 'writing', 'speaking', 'listening'];
    cats.forEach(c => res.sectionScores[c] = computeExamSectionScore(c, examData, res));
    const cat = currentAdminGradingTab, questions = examData[cat] || [], maxPts = questions.length ? Math.round((100 / questions.length) * 10) / 10 : 10;

    ws.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 bg-stone-100 p-2 rounded-2xl">
                <div class="flex flex-wrap gap-1.5">
                    ${cats.map(c => `<button id="grade-tab-btn-${c}" onclick="currentAdminGradingTab='${c}';renderAdminGradingView('${email}','${monthId}')" class="px-4 py-2 rounded-xl text-xs font-extrabold capitalize transition cursor-pointer ${c === cat ? 'bg-teal-700 text-white shadow-sm' : 'bg-white text-stone-600 hover:bg-teal-50'}">${c} (${res.sectionScores[c]}/100) ${res.submittedTabs?.includes(c) ? '✓' : ''}</button>`).join('')}
                </div>
                <button onclick="executeSelectiveExamReset('${email}', '${monthId}', '${cat}')" class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-extrabold transition cursor-pointer">
                    <i class="fas fa-undo mr-1"></i> Reset Bagian ${cat.toUpperCase()} Saja
                </button>
            </div>
            ${!questions.length ? `<p class="text-xs text-stone-400 text-center py-6">Tidak ada soal pada bagian ${cat.toUpperCase()}.</p>` : questions.map((q, idx) => {
                const key = `${cat}_${idx}`, ans = res.answers[key], isMCQ = q.type === 'mcq', transcript = res.transcripts?.[key] || '';
                let pt10 = 0;
                if (isMCQ) pt10 = (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) ? 10 : 0;
                else if (res.scores[key] !== undefined && res.scores[key] !== '') {
                    const rawSc = parseFloat(res.scores[key]) || 0;
                    pt10 = rawSc <= 10 ? rawSc : Math.round((rawSc / 100) * 10 * 10) / 10;
                } else if (ans && String(ans).trim() !== '') { pt10 = 8.5; res.scores[key] = pt10; }

                const disp = isMCQ
                    ? ((ans !== undefined && ans !== '') ? `<strong>${['A','B','C','D'][ans] || ''}.</strong> ${q.options?.[ans] || ''}` : '<span class="text-rose-500 italic">Tidak dijawab</span>')
                    : (String(ans || '').startsWith('data:audio')
                        ? `<div class="space-y-2 mt-1"><audio controls preload="metadata" class="h-10 w-full max-w-md rounded-lg" src="${ans}"></audio><div class="flex flex-wrap items-center gap-3"><a href="${ans}" download="rekaman_${email}_soal_${idx + 1}.webm" class="text-[11px] font-extrabold text-teal-700 hover:underline"><i class="fas fa-download mr-1"></i>Unduh Audio</a>${transcript ? `<span class="text-[11px] text-stone-500 bg-stone-100 px-2.5 py-1 rounded-lg"><strong>Transkrip:</strong> "${transcript}"</span>` : ''}</div></div>`
                        : (ans ? `<p class="whitespace-pre-line font-semibold text-stone-800">${ans}</p>` : '<span class="text-rose-500 italic">Tidak dijawab</span>'));

                return `
                    <div class="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2.5 text-xs">
                        <div class="flex items-center justify-between">
                            <span class="font-extrabold text-stone-800">Soal #${idx + 1}: ${q.question || ''}</span>
                            <span class="px-2.5 py-0.5 rounded-md font-extrabold ${pt10 >= 7 ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'}">Maks ${maxPts} Poin</span>
                        </div>
                        ${q.audioScript ? `<p class="text-[11px] text-teal-800 bg-teal-50 px-3 py-1.5 rounded-lg whitespace-pre-line"><strong>Naskah Audio:</strong>\n${q.audioScript}</p>` : ''}
                        <div class="p-3 rounded-xl bg-white border border-stone-200/80"><strong class="text-stone-500 uppercase text-[10px]">Jawaban / Rekaman Murid:</strong><div class="mt-1">${disp}</div></div>
                        ${isMCQ ? `
                            <div class="flex items-center justify-between pt-1">
                                <span class="text-stone-500">Kunci: <strong>${['A','B','C','D'][q.answer] || 'A'}. ${q.options?.[q.answer] || ''}</strong></span>
                                <span class="font-extrabold ${pt10 === 10 ? 'text-teal-700' : 'text-rose-600'}">${pt10 === 10 ? '✓ Benar (+10 Poin)' : '✗ Salah (0 Poin)'}</span>
                            </div>` : `
                            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 items-center">
                                <div class="sm:col-span-4 flex items-center gap-2">
                                    <label class="font-extrabold text-teal-700 shrink-0">Poin (0–10):</label>
                                    <input type="number" min="0" max="10" step="0.5" value="${pt10}" oninput="updateQuestionManualPoint('${email}','${monthId}','${cat}',${idx},this.value)" class="hes-input !w-24 !py-1.5 !bg-white text-center font-black">
                                    <span class="text-stone-400 font-bold">/ 10</span>
                                </div>
                                <div class="sm:col-span-8"><input type="text" value="${res.questionNotes?.[key] || ''}" oninput="updateQuestionNote('${email}','${monthId}','${cat}',${idx},this.value)" placeholder="Catatan koreksi soal #${idx + 1} (opsional)..." class="hes-input !py-1.5 !bg-white text-xs"></div>
                            </div>`}
                    </div>`;
            }).join('')}
            <div class="p-4 sm:p-5 rounded-2xl bg-teal-50/60 border border-teal-100 space-y-3.5 mt-4">
                <h4 class="text-xs font-extrabold text-teal-900 uppercase tracking-wider flex items-center gap-1.5"><i class="fas fa-file-signature text-teal-700"></i> Pengaturan Rapor (Report Card)</h4>
                <div><label class="block text-xs font-bold text-stone-700 mb-1">Kelas / Level Program</label><input type="text" id="admin-exam-level" value="${res.classLevel || ''}" oninput="window.HES.materials['exam_result-${email}-${monthId}'].classLevel=this.value" placeholder="Contoh: Beginner / Intermediate / Advanced" class="hes-input !bg-white"></div>
                <div><label class="block text-xs font-bold text-stone-700 mb-1">Tutor's Note (Catatan Evaluasi Pengajar)</label><textarea id="admin-exam-feedback" rows="3" oninput="window.HES.materials['exam_result-${email}-${monthId}'].adminFeedback=this.value" placeholder="Tulis catatan evaluasi perkembangan murid..." class="hes-input !bg-white">${res.adminFeedback || ''}</textarea></div>
            </div>
            <button onclick="saveExamGrades('${email}','${monthId}')" class="hes-btn-primary w-full"><i class="fas fa-check-circle"></i> Simpan Nilai & Terbitkan Rapor</button>
        </div>`;
};

window.saveExamGrades = async function(email, monthId) {
    const examData = window.HES.materials[`exam-${email}-${monthId}`], rKey = `exam_result-${email}-${monthId}`, res = window.HES.materials[rKey] || {};
    res.classLevel = $('admin-exam-level')?.value.trim() || res.classLevel || '';
    res.adminFeedback = $('admin-exam-feedback')?.value.trim() || res.adminFeedback || '';
    res.gradedAt = new Date().toISOString();
    res.sectionScores = res.sectionScores || {};
    ['reading', 'writing', 'speaking', 'listening'].forEach(c => res.sectionScores[c] = computeExamSectionScore(c, examData, res));
    res.isGraded = true;

    const { error } = await safeSaveMaterialsToCloud(materials => { materials[rKey] = res; });
    if (!error) { renderAdminGradingView(email, monthId); showToast('Nilai disimpan & Rapor berhasil diterbitkan!', 'success'); }
    else showToast('Gagal menyimpan nilai: ' + error.message, 'error');
};