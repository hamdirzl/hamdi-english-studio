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
        overview:  '<i class="fas fa-bell mr-1.5"></i> Overview',
        users:     '<i class="fas fa-users-cog mr-1.5"></i> Akun & Jadwal',
        materials: '<i class="fas fa-book mr-1.5"></i> Materi & Kosakata',
        exam:      '<i class="fas fa-file-signature mr-1.5"></i> Ujian & Nilai'
    };
    Object.keys(labels).forEach(t => {
        const btn = $(`adm-tab-${t}`);
        if (btn) {
            btn.innerHTML = labels[t];
            btn.className = `px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition ${t === tabName ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`;
        }
        $(`admin-panel-${t}`)?.classList.toggle('hidden', t !== tabName);
    });
    if (tabName === 'overview') renderAdminOverviewTab();
    if (tabName === 'users') renderAdminUsersTab();
    if (tabName === 'materials') { loadAdminMaterialEditor(); loadAdminVocabPreview(); }
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

    fill('admin-sched-student', sOpts);
    fill('admin-sched-max-month', maxMOpts);
    fill('admin-target-student', `<option value="all">Global (Semua Murid)</option>${sOpts}`);
    ['admin-month', 'admin-vocab-month', 'admin-review-month', 'admin-exam-month'].forEach(id => fill(id, mOpts));
    ['admin-review-student', 'admin-exam-student'].forEach(id => fill(id, sOpts));
    loadStudentScheduleForm();
    loadAdminMaterialEditor();
}

// ============================================================================
// TAB 1: OVERVIEW & ANTREAN PINDAH JADWAL
// ============================================================================
function renderAdminOverviewTab() {
    const box = $('admin-pending-reschedules-list');
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
        if (materials[`profile-${email}`]?.pendingReschedules) delete materials[`profile-${email}`].pendingReschedules[oldD];
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

// ============================================================================
// TAB 2: MANAJEMEN AKUN MURID & JADWAL
// ============================================================================
window.loadStudentScheduleForm = function() {
    const email = $('admin-sched-student')?.value;
    if (!email) return;
    const p = window.HES.materials[`profile-${email}`] || {};
    $('admin-sched-max-month').value = String(p.maxMonth || 1);

    const [s, e] = (p.time || '').includes('-') ? p.time.split('-').map(t => t.trim()) : ['', ''];
    $('admin-sched-start').value = s;
    $('admin-sched-end').value = e;
    document.querySelectorAll('.admin-day-cb').forEach(cb => cb.checked = (p.days || []).includes(cb.value));

    onAdminMonthSelectChange();
    const dates = p.monthEndDates || {};
    $('admin-saved-month-dates-box').innerHTML = window.HES.months.map(m =>
        `<span class="inline-block mr-2 mb-1 px-2.5 py-1 rounded-lg bg-white border text-xs font-bold">${m.title}: ${dates[m.id] || 'Belum diatur'}</span>`
    ).join('');
};

window.onAdminMonthSelectChange = function() {
    const email = $('admin-sched-student')?.value, mNum = $('admin-sched-max-month')?.value || '1';
    const p = window.HES.materials[`profile-${email}`] || {};
    $('admin-sched-date-label').innerText = `Batas Akhir Month ${mNum}`;
    $('admin-sched-date').value = p.monthEndDates?.[`m${mNum}`] || (String(p.maxMonth) === String(mNum) ? p.validUntil || '' : '');
};

window.saveStudentSchedule = async function() {
    const email = $('admin-sched-student').value;
    await safeSaveMaterialsToCloud(materials => {
        const p = materials[`profile-${email}`] || {};
        p.monthEndDates = p.monthEndDates || {};
        const mNum = $('admin-sched-max-month').value || '1', dVal = $('admin-sched-date').value;
        if (dVal) { p.monthEndDates[`m${mNum}`] = dVal; p.validUntil = dVal; }

        p.maxMonth = Math.max(parseInt(mNum), ...Object.keys(p.monthEndDates).map(k => parseInt(k.replace('m', '')) || 1));
        if (p.monthEndDates[`m${p.maxMonth}`]) p.validUntil = p.monthEndDates[`m${p.maxMonth}`];

        const sT = $('admin-sched-start').value, eT = $('admin-sched-end').value;
        if (sT && eT) p.time = `${sT} - ${eT}`;
        p.days = Array.from(document.querySelectorAll('.admin-day-cb:checked')).map(cb => cb.value);
        materials[`profile-${email}`] = p;
    });
    showToast('Jadwal murid berhasil disimpan!', 'success');
    loadStudentScheduleForm();
    renderAdminUsersTab();
};

function renderAdminUsersTab() {
    const tbody = $('admin-students-table-body');
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
    const name = $('new-stu-name').value.trim(), email = $('new-stu-email').value.trim(), password = $('new-stu-pass').value.trim();
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
// TAB 3: BUILDER MODUL MATERI PINTAR & MASTER WORDBANK
// ============================================================================
window.switchAdminMaterialSubtab = function(sub) {
    currentAdminMaterialSubtab = sub;
    if ($('adm-mat-subtab-module')) $('adm-mat-subtab-module').className = `px-4 py-2 rounded-xl text-xs font-extrabold transition ${sub === 'module' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`;
    if ($('adm-mat-subtab-recap')) $('adm-mat-subtab-recap').className = `px-4 py-2 rounded-xl text-xs font-extrabold transition ${sub === 'recap' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`;
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
        let cls = hasMod ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300';
        if (w === activeW && d === activeD) cls = 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-300';
        return `<button type="button" onclick="selectAdminMaterialSession(${w}, ${d})" title="Sesi ${i + 1} (Week ${w} Day ${d}) ${hasMod ? '• Modul Terisi' : '• Kosong'}" class="py-2 px-1 rounded-xl border text-xs font-extrabold transition flex flex-col items-center justify-center cursor-pointer ${cls}"><span>${i + 1}</span><span class="text-[9px] opacity-80">${hasMod ? (hasRec ? '✓+R' : '✓') : '-'}</span></button>`;
    }).join('');
}

function updateAdminMaterialStatusBadge() {
    const badge = $('admin-material-status-badge');
    if (!badge) return;
    const val = (currentAdminMaterialSubtab === 'module' ? $('admin-link')?.value : $('admin-recap-pdf')?.value || '').trim();
    badge.className = `text-[11px] font-extrabold px-3 py-1 rounded-lg ${val ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`;
    badge.innerHTML = val ? '<i class="fas fa-check-circle mr-1"></i> Sudah Terisi' : 'Belum Diisi';
}

window.copyGeminiModulePrompt = function(mode = 'single') {
    const m = ($('admin-month')?.value || 'm1').toUpperCase();
    const sNum = ((parseInt($('admin-week')?.value || '1') - 1) * 3) + parseInt($('admin-day')?.value || '1');

    const prompts = {
        single: `Act as a warm, charismatic, and modern private English coach at "Hamdi English Studio".
Create an engaging, relaxed, and natural-flowing English Study Guide for ${m} - Session ${sNum} on the topic: [ISI TOPIK MATERI DI SINI].

IMPORTANT STYLE RULES:
- DO NOT make it stiff, robotic, or overly academic. Write like a friendly mentor chatting directly with the student ("Imagine you're at a coffee shop...", "Here is the secret native speakers use...").
- Vary the flow naturally based on the topic! Mix warm storytelling paragraphs with visual blocks so it feels like a modern magazine workbook, not a boring list of bullet points.
- Put the output inside a single code block using a flexible mix of these section headers (you can reorder them or use custom "## Headings" to fit the topic naturally):

TITLE: [Catchy, Modern Topic Title]
LEVEL: [${m} • Session ${sNum} of 12]
STYLE: [Choose one theme: ocean / indigo / teal / amber]
GOAL: [1 warm sentence about what the student will be able to do naturally after today]

STORY:
[Write 1-2 relaxed, relatable storytelling paragraphs setting a real-life scene or situation where this English topic happens naturally. Include a few **bold** expressions in context.]

## [Custom Engaging Heading Explaining the Core Idea]
[Write 1-2 clear, conversational paragraphs explaining how this works in real life without stiff grammar jargon. Then optionally add 2-3 key highlights:]
- [Key Insight 1]: [Friendly explanation]
- [Key Insight 2]: [Friendly explanation]

PATTERNS:
[+] [Pattern Name] | [Visual building blocks separated by +, e.g., Subject + usually + Verb 1 + Object] | [1 natural example sentence]
[-] [Negative / Alternative Pattern] | [Building blocks separated by +] | [1 natural example sentence]
[?] [Question Pattern] | [Building blocks separated by +] | [1 natural example sentence]

PHRASES:
- [Natural Expression 1] | [Simple English meaning] | [Natural example sentence]
- [Natural Expression 2] | [Simple English meaning] | [Natural example sentence]
- [Natural Expression 3] | [Simple English meaning] | [Natural example sentence]
- [Natural Expression 4] | [Simple English meaning] | [Natural example sentence]

PRO TIP:
[Write a short, memorable "insider tip" or cultural note from a tutor's perspective so the student sounds more natural.]

MISTAKES:
- [Stiff or Wrong Sentence 1] | [Natural English Upgrade 1] | [Friendly 1-sentence reason]
- [Stiff or Wrong Sentence 2] | [Natural English Upgrade 2] | [Friendly 1-sentence reason]

DIALOGUE:
[Optional: 1 short sentence setting the scene of the conversation]
Man: [Natural spoken line 1]
Woman: [Natural spoken line 2]
Man: [Natural spoken line 3]
Woman: [Natural spoken line 4]
Man: [Natural spoken line 5]
Woman: [Natural spoken line 6]

PRACTICE:
1. [Quick Brain Check]: [Interactive fill-in-the-blank or sentence upgrade question] (Answer: [Provide the answer key here so the app turns it into a Click-to-Reveal button])
2. [Fix the Vibe]: [Ask the student to make a stiff sentence sound more natural] (Answer: [Sample natural answer])
3. [Real-Life Speaking Mission]: [A fun, relatable speaking prompt to discuss aloud with the tutor]`,

        bulk: `Act as a creative curriculum designer for "Hamdi English Studio".
Create 12 varied, engaging, and natural-flowing English Study Guides for ${m} (Session 1 to Session 12).
Theme / Level for this month: [ISI TEMA / LEVEL BULAN INI, MISAL: CASUAL DAILY SPEAKING & CONFIDENCE BUILDER].

CRITICAL RULES TO PREVENT BOREDOM:
- DO NOT make all 12 sessions look identical! Vary the structure and vibe across sessions.
- Write in warm, relaxed paragraphs—never just dry bullet points.
- Separate each session with === on a new line.

Use this structure for each session inside a single code block:

SESSION: 1
TITLE: [Engaging Title]
LEVEL: [${m} • Session 1 of 12]
STYLE: [ocean / indigo / teal / amber]
GOAL: [Warm 1-sentence goal]

STORY:
[Relatable real-life story or scenario in 1-2 flowing paragraphs]

## [Engaging Custom Section Title]
[Conversational explanation paragraph]
- [Highlight 1]: [Friendly note]
- [Highlight 2]: [Friendly note]

PATTERNS:
[+] [Name] | [Block 1 + Block 2 + Block 3] | [Natural example]
[?] [Name] | [Block 1 + Block 2 + Block 3] | [Natural example]

PHRASES:
- [Expression 1] | [Simple meaning] | [Example sentence]
- [Expression 2] | [Simple meaning] | [Example sentence]
- [Expression 3] | [Simple meaning] | [Example sentence]
- [Expression 4] | [Simple meaning] | [Example sentence]

MISTAKES:
- [Wrong/Stiff 1] | [Natural 1] | [Short reason]
- [Wrong/Stiff 2] | [Natural 2] | [Short reason]

DIALOGUE:
Man: [Line 1]
Woman: [Line 2]
Man: [Line 3]
Woman: [Line 4]

PRACTICE:
1. [Quick Check]: [Question] (Answer: [Key])
2. [Speaking Mission]: [Fun speaking prompt]
===
SESSION: 2
... (continue up to SESSION: 12)`,

        recap: `Write a warm, personal, and encouraging Class Recap & Coaching Note (in friendly English) for my student after Session ${sNum} (${m}) about: [ISI TOPIK / CATATAN SINGKAT KELAS HARI INI].

Put the result inside a code block using this natural format:

TITLE: Personal Class Recap • Session ${sNum}
LEVEL: ${m} • Coaching Summary
STYLE: emerald
GOAL: Celebrate today's speaking wins and lock in your new expressions.

STORY:
[Write a warm, personal note praising the student's effort and energy in class today, written like a supportive coach.]

PHRASES:
- [Best Expression Practiced 1] | [Meaning] | [Example from today's topic]
- [Best Expression Practiced 2] | [Meaning] | [Example from today's topic]
- [Best Expression Practiced 3] | [Meaning] | [Example from today's topic]

MISTAKES:
- [What was said in class 1] | [Smoother, natural version 1] | [Friendly coaching note]
- [What was said in class 2] | [Smoother, natural version 2] | [Friendly coaching note]

PRO TIP:
[1 encouraging tip on pronunciation or fluency for the week ahead.]

PRACTICE:
1. [Quick Recall]: [1 mini review question from today's lesson] (Answer: [Answer key])
2. [2-Minute Voice Note]: [A light, fun speaking challenge before the next class]`
    };

    navigator.clipboard.writeText(prompts[mode] || prompts.single)
        .then(() => showToast('Prompt Gaya Baru (Mengalir & Interaktif) berhasil disalin!', 'success'))
        .catch(() => showToast('Gagal menyalin otomatis.', 'error'));
};

window.insertSampleModuleTemplate = function(type = 'module') {
    const m = ($('admin-month')?.value || 'm1').toUpperCase();
    const sNum = ((parseInt($('admin-week')?.value || '1') - 1) * 3) + parseInt($('admin-day')?.value || '1');

    if (type === 'module') {
        $('admin-link').value = `TITLE: Small Talk & Talking About Your Daily Rhythm
LEVEL: ${m} • Session ${sNum} of 12 • Conversational English
STYLE: ocean
GOAL: Chat naturally about your morning vibe, work routine, and how you unwind without sounding like a textbook.

WARM UP:
- Are you a morning person who loves sunrise, or do you need two cups of coffee just to function?
- What is one small ritual you never skip before starting your day?

STORY:
Imagine you just bumped into an international colleague at a cozy coffee shop on Monday morning. Instead of saying stiff textbook sentences like **"I wake up at 6:00 AM every day,"** native speakers love sharing the *feeling* and *rhythm* of their day.

They might smile and say, **"Honestly, I'm a bit of a slow starter in the morning, so I always grab a quick coffee before I dive into work."** Notice how relaxed and human that sounds? Today, we are going to upgrade the way you talk about your everyday life.

## The Secret to Natural Routine Talk
When we talk about habits and routines in English, we use the **Simple Present**. The trick is not just memorizing grammar rules, but pairing your action verbs with natural **frequency words** (*usually, pretty much always, hardly ever*) and conversational time phrases.
- The "I / You / We / They" Flow: Keep the verb in its pure, base form. It is super clean and effortless, like "I usually **start** work around nine."
- The "He / She / It" Touch: Whenever you talk about one other person (your boss, your sister, your best friend), just add a gentle **-s / -es** sound to the action verb, like "She **runs** her own design studio."

PATTERNS:
[+] Sharing Your Habit | Subject + Frequency Word + Verb 1 + Rest of Idea | I usually wind down by watching Netflix at night.
[+] Talking About Someone Else | He / She + Verb 1 (-s/es) + Rest of Idea | My brother works remotely from a café almost every day.
[-] Saying What You Don't Do | Subject + don't / doesn't + Verb 1 | I don't really check work emails after 8 PM.
[?] Casual Routine Question | How often + do / does + Subject + Verb 1? | How often do you work out during the week?

PHRASES:
- Grab a quick bite | Eat something fast because you are busy | I usually grab a quick bite before my morning meeting.
- Dive into work | Start working with focus and energy | After my coffee, I'm ready to dive into work.
- Take a breather | Take a short, relaxing break | Let's take a quick breather and get some fresh air.
- Wind down | Relax slowly after a long, busy day | Listening to acoustic music helps me wind down at night.

PRO TIP:
Native speakers rarely say "I do not" in casual conversation. Always blend it into **"I don't"** or **"He doesn't"**—and remember, once you use **doesn't**, the main verb goes right back to normal (say **"She doesn't drink coffee"**, never *"She doesn't drinks"*!).

MISTAKES:
- I am usually wake up at 6 AM. | I usually wake up at 6 AM. | "Wake up" is already an action verb, so you don't need "am" before it.
- My manager don't like long meetings. | My manager doesn't like long meetings. | Since "My manager" is one person (he/she), use "doesn't".
- She goes to office by car. | She drives to the office. | Using "drives" or "commutes" sounds much more natural than "goes by car".

DIALOGUE:
Kevin and Sarah are chatting while waiting for their morning coffee at the office pantry.
Man: Morning, Sarah! You look super energized today. Are you naturally an early bird?
Woman: Haha, not at all! Honestly, I hit the snooze button at least twice every morning.
Man: Really? How do you always get to the office so early then?
Woman: Well, I prep my clothes the night before, and I usually grab a quick breakfast on the way. What about you?
Man: I'm the opposite. I wake up around 5:30 AM, go for a short jog, and then take my time getting ready.
Woman: Wow, I respect that! By the time evening comes, I just want to wind down on the couch.

PRACTICE:
1. [Quick Brain Check]: Complete this natural sentence -> "My best friend _____ (don't / doesn't) _____ (work / works) on Saturdays." (Answer: doesn't work — because after doesn't, the verb returns to base form!)
2. [Upgrade the Vibe]: How would you make "I eat fast because I am busy" sound more natural using today's phrases? (Answer: "I usually grab a quick bite because I'm on a tight schedule.")
3. [Coffee Shop Roleplay]: Tell your tutor what your ideal Sunday looks like from morning to night using at least 2 new expressions from today!`;
    } else {
        $('admin-recap-pdf').value = `TITLE: Personal Class Recap • Session ${sNum}
LEVEL: ${m} • Coaching & Feedback Summary
STYLE: emerald
GOAL: Celebrate today's speaking wins and lock in your natural phrasing upgrades.

STORY:
Awesome energy in class today! You were much more relaxed when answering spontaneous questions, and you didn't pause to translate word-by-word nearly as much as last week. Your storytelling about your morning routine sounded genuinely engaging!

PHRASES:
- Grab a quick breakfast | Eat a fast, simple meal in the morning | I usually grab a quick breakfast before leaving home.
- Stuck in traffic | Unable to move fast on a busy road | I was stuck in traffic for thirty minutes this morning.
- Call it a day | Stop working for the day | Let's finish this report and call it a day!

MISTAKES:
- My friend don't live here anymore. | My friend doesn't live here anymore. | Use "doesn't" whenever you talk about one person (he/she).
- I am agree with your opinion. | I completely agree with you. | "Agree" is already a verb, so we never put "am" in front of it.

PRO TIP:
When you want to sound extra natural in conversation, try starting your answers with casual connectors like **"Honestly,"**, **"To be fair,"**, or **"Well, most of the time..."**—it gives your brain an extra second to think while sounding super fluent!

PRACTICE:
1. [Quick Recall]: Which one is natural? A) "She doesn't likes tea" or B) "She doesn't like tea"? (Answer: B! "She doesn't like tea.")
2. [Home Voice Note]: Send a relaxed 45-second voice note describing how you usually wind down on Friday nights.`;
    }
    updateAdminMaterialStatusBadge();
    showToast('Contoh Materi Mengalir & Interaktif berhasil dimasukkan! Klik Simpan untuk mencoba.', 'info');
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
        return showToast(`${savedCount} Sesi berhasil diisi & disimpan sekaligus untuk ${m.toUpperCase()}!`, 'success');
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

window.updateMasterWordbankCounter = function() {
    const wb = $('admin-master-wordbank');
    if (!wb) return;
    const seen = new Set();
    wb.value.split('\n').forEach(l => { if (l.includes('=')) { const e = l.split('=')[0].trim().toLowerCase(); if (e) seen.add(e); } });
    const perDay = parseInt($('admin-words-per-day')?.value || 5);
    $('master-wordbank-stats-badge').innerText = `${seen.size} Kata Unik`;
    $('master-wordbank-capacity-text').innerText = `Cukup untuk ${Math.floor(seen.size / perDay)} Pertemuan`;
};

window.saveMasterWordbank = async function() {
    const wb = $('admin-master-wordbank'), seen = new Set(), clean = [];
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
        materials['master_wordbank_per_day'] = parseInt($('admin-words-per-day').value) || 5;
    });
    updateMasterWordbankCounter();
    showToast('Master Wordbank disimpan!', 'success');
};

window.loadAdminVocabPreview = function() {
    const wb = $('admin-master-wordbank');
    if (wb) {
        wb.value = (window.HES.materials['master_wordbank'] || '').trim() || window.DEFAULT_WORDBANK_RAW || '';
        $('admin-words-per-day').value = String(getWordsPerDaySetting());
        updateMasterWordbankCounter();
    }
    const m = $('admin-vocab-month')?.value, w = $('admin-vocab-week')?.value, d = $('admin-vocab-day')?.value;
    if (!m) return;
    const manual = window.HES.materials[`vocab-${m}-w${w}-d${d}`] || '';
    $('admin-vocab-list').value = manual.trim() ? manual : getSessionVocabText(m, w, d);
    $('admin-vocab-source-badge').innerText = manual.trim() ? 'Override Manual' : 'Otomatis Wordbank';
};

window.saveVocabList = async function() {
    const m = $('admin-vocab-month').value, w = $('admin-vocab-week').value, d = $('admin-vocab-day').value, val = $('admin-vocab-list').value.trim();
    await safeSaveMaterialsToCloud(materials => { if (val) materials[`vocab-${m}-w${w}-d${d}`] = val; else delete materials[`vocab-${m}-w${w}-d${d}`]; });
    loadAdminVocabPreview();
    showToast('Kosakata sesi disimpan!', 'success');
};

window.clearManualVocabOverride = async function() {
    const m = $('admin-vocab-month').value, w = $('admin-vocab-week').value, d = $('admin-vocab-day').value;
    await safeSaveMaterialsToCloud(materials => { delete materials[`vocab-${m}-w${w}-d${d}`]; });
    loadAdminVocabPreview();
    showToast('Dikembalikan ke Wordbank otomatis.', 'info');
};

window.checkVocabStatus = async function() {
    await syncFromCloud();
    const email = $('admin-review-student').value, m = $('admin-review-month').value, w = $('admin-review-week').value, d = $('admin-review-day').value;
    const st = window.HES.materials[`vocab_status-${email}-${m}-w${w}-d${d}`], box = $('vocab-review-result');

    if (!st || st.status === 'none') {
        box.innerHTML = `<p class="p-4 rounded-xl bg-slate-50 text-xs text-slate-500 text-center font-semibold">Murid belum menyetor hafalan di sesi ini.</p>`;
    } else if (st.status === 'submitted') {
        box.innerHTML = `<div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3"><p class="text-xs font-extrabold text-amber-900">Menunggu Verifikasi Anda</p><input type="text" id="admin-vocab-feedback" placeholder="Catatan (misal: Good Job!)" class="hes-input !bg-white"><div class="flex gap-2"><button onclick="updateVocabStatus('${email}','${m}',${w},${d},'approved')" class="hes-btn-primary !bg-emerald-600 flex-1">Terima (+25 XP)</button><button onclick="updateVocabStatus('${email}','${m}',${w},${d},'none')" class="hes-btn-soft">Reset</button></div></div>`;
    } else {
        box.innerHTML = `<div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex justify-between items-center"><span class="text-xs font-extrabold text-emerald-900">✓ Terverifikasi ("${st.feedback || 'Good Job!'}")</span><button onclick="updateVocabStatus('${email}','${m}',${w},${d},'none')" class="text-xs font-bold text-red-600">Batalkan</button></div>`;
    }
};

window.updateVocabStatus = async function(email, m, w, d, status) {
    const fb = $('admin-vocab-feedback')?.value.trim() || '';
    await safeSaveMaterialsToCloud(materials => { materials[`vocab_status-${email}-${m}-w${w}-d${d}`] = { status, feedback: fb }; });
    checkVocabStatus();
    showToast('Status hafalan diperbarui!', 'success');
};

// ============================================================================
// TAB 4: BUILDER SOAL UJIAN, BULK IMPORT & PENILAIAN RAPOR
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
            id: `${Date.now()}_${bIdx}`,
            type: qType,
            question: f.q || `Question #${bIdx + 1}`,
            audioScript,
            mediaUrl: '',
            options: qType === 'mcq' ? [f.a, f.b, f.c, f.d] : [],
            answer: qType === 'mcq' ? ({ A: 0, B: 1, C: 2, D: 3 }[String(f.key || 'A').trim().toUpperCase().charAt(0)] ?? 0) : f.key,
            explanation: f.exp
        });
    });

    if (!parsed.length) return showToast('Format teks belum sesuai contoh.', 'error');
    adminExamState.data[tab] = replaceExisting ? parsed : [...(adminExamState.data[tab] || []), ...parsed];
    switchExamTab(tab);
    await saveAdminExamData();
    showToast(`${parsed.length} soal ${tab.toUpperCase()} berhasil diinput & disimpan!`, 'success');
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
        <div class="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                    <h4 class="text-xs sm:text-sm font-extrabold text-indigo-950 uppercase flex items-center gap-1.5"><i class="fas fa-bolt text-amber-500"></i> Bagian ${tab} • ${list.length} / 10 Soal (Suara Cloud Neural Natural)</h4>
                    <p class="text-xs text-slate-600 mt-0.5">Klik <strong>Input Cepat 10 Soal</strong> untuk menempelkan soal langsung dari Gemini.</p>
                </div>
                <div class="flex flex-wrap gap-2 shrink-0">
                    <button type="button" onclick="copyGeminiExamPrompt()" class="px-3 py-2 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold transition cursor-pointer"><i class="fas fa-copy mr-1"></i> Salin Prompt Gemini</button>
                    <button type="button" onclick="toggleBulkImportBox()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"><i class="fas fa-paste mr-1"></i> Input Cepat 10 Soal</button>
                </div>
            </div>
            <div id="bulk-import-box" class="hidden pt-3 border-t border-indigo-200/70 space-y-2.5">
                <textarea id="bulk-import-textarea" rows="7" class="hes-input !bg-white font-mono text-xs" placeholder="Tempelkan soal ${tab.toUpperCase()} di sini (pisahkan antar soal dengan ===)..."></textarea>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="processBulkExamImport(true)" class="hes-btn-primary !bg-emerald-600 flex-1 !py-2.5 !text-xs cursor-pointer"><i class="fas fa-magic"></i> Proses & Ganti Semua Soal ${tab.toUpperCase()}</button>
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
                <div class="flex items-center gap-2"><span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">Soal #${idx + 1}</span><span class="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold">10 Poin</span></div>
                <button type="button" onclick="removeExamQuestion(${idx})" class="text-xs text-red-500 hover:text-red-700 font-bold"><i class="fas fa-trash mr-1"></i>Hapus</button>
            </div>
            ${tab === 'listening' ? `
                <div class="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-extrabold text-indigo-700"><i class="fas fa-headphones-alt mr-1"></i> Naskah Audio Listening (Man / Woman)</label>
                        <button type="button" onclick="playNaturalEnglishTTS(document.getElementById('script_${idx}').value, this)" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition cursor-pointer"><i class="fas fa-play mr-1"></i> Tes Suara</button>
                    </div>
                    <textarea id="script_${idx}" oninput="updateExamField(${idx},'audioScript',this.value)" rows="2" placeholder="Man: ...&#10;Woman: ..." class="hes-input !bg-slate-50 text-xs">${scriptVal}</textarea>
                    <input type="text" onchange="updateExamField(${idx},'mediaUrl',this.value)" value="${mp3Val}" placeholder="Opsional: Link file MP3 eksternal" class="hes-input !bg-slate-50 !py-1.5 text-[11px]">
                </div>` : ''}
            <div><label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pertanyaan / Instruksi Soal #${idx + 1}</label><textarea oninput="updateExamField(${idx},'question',this.value)" rows="2" class="hes-input !bg-white">${q.question || ''}</textarea></div>
            ${q.type === 'mcq' ? `
                <div class="space-y-2 pt-1">
                    <p class="text-[11px] font-bold text-emerald-700 uppercase">Kunci Jawaban Benar (+10 Poin Otomatis):</p>
                    ${['A', 'B', 'C', 'D'].map((l, oIdx) => `<div class="flex items-center gap-2"><input type="radio" name="corr_${tab}_${idx}" ${Number(q.answer) === oIdx ? 'checked' : ''} onchange="updateExamField(${idx},'answer',${oIdx})"><span class="text-xs font-extrabold w-5">${l}.</span><input type="text" value="${q.options?.[oIdx] || ''}" oninput="updateExamField(${idx},'options',this.value,${oIdx})" placeholder="Pilihan ${l}" class="hes-input !bg-white !py-1.5"></div>`).join('')}
                </div>` : `
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="text-[11px] font-bold text-emerald-700 uppercase">${tab === 'speaking' ? 'Kalimat Target Pelafalan' : 'Kunci Jawaban / Kriteria'}</label>
                        ${tab === 'speaking' ? `<button type="button" onclick="playNaturalEnglishTTS(document.getElementById('ans_key_${idx}').value, this)" class="text-[11px] font-extrabold text-indigo-600 hover:underline cursor-pointer"><i class="fas fa-volume-up mr-1"></i>Tes Pelafalan</button>` : ''}
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
    const s = $('admin-exam-student').value, m = $('admin-exam-month').value;
    if (!confirm(`Reset hasil ujian ${s} pada ${m.toUpperCase()}?`)) return;
    await safeSaveMaterialsToCloud(materials => { delete materials[`exam_result-${s}-${m}`]; });
    $('admin-grading-workspace').classList.add('hidden');
    showToast('Hasil ujian murid berhasil direset.', 'info');
};

window.loadStudentExamForGrading = async function() {
    const s = $('admin-exam-student').value, m = $('admin-exam-month').value;
    $('admin-exam-workspace').classList.add('hidden');
    const ws = $('admin-grading-workspace');
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
    if (!examData) { ws.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Soal ujian belum dibuat untuk murid & bulan ini.</p>`; return; }
    if (!res || (!res.answers && !res.submittedTabs?.length)) {
        ws.innerHTML = `<div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3"><p class="text-xs font-bold text-slate-500">Murid belum mengumpulkan jawaban ujian pada bulan ini.</p><button onclick="loadStudentExamForGrading()" class="hes-btn-soft !py-2 !px-4 !text-xs"><i class="fas fa-sync-alt mr-1"></i> Muat Ulang</button></div>`;
        return;
    }

    res.answers = res.answers || {}; res.scores = res.scores || {}; res.questionNotes = res.questionNotes || {}; res.sectionScores = res.sectionScores || {};
    const cats = ['reading', 'writing', 'speaking', 'listening'];
    cats.forEach(c => res.sectionScores[c] = computeExamSectionScore(c, examData, res));

    const cat = currentAdminGradingTab, questions = examData[cat] || [], maxPts = questions.length ? Math.round((100 / questions.length) * 10) / 10 : 10;

    ws.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 rounded-2xl">
                <div class="flex flex-wrap gap-1.5">
                    ${cats.map(c => `<button id="grade-tab-btn-${c}" onclick="currentAdminGradingTab='${c}';renderAdminGradingView('${email}','${monthId}')" class="px-4 py-2 rounded-xl text-xs font-extrabold capitalize transition ${c === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'}">${c} (${res.sectionScores[c]}/100) ${res.submittedTabs?.includes(c) ? '✓' : ''}</button>`).join('')}
                </div>
                <span class="text-[11px] font-extrabold text-slate-500 px-2">Standar: 10 Poin / Soal</span>
            </div>
            ${!questions.length ? `<p class="text-xs text-slate-400 text-center py-6">Tidak ada soal pada bagian ${cat.toUpperCase()}.</p>` : questions.map((q, idx) => {
                const key = `${cat}_${idx}`, ans = res.answers[key], isMCQ = q.type === 'mcq', transcript = res.transcripts?.[key] || '';
                let pt10 = 0;
                if (isMCQ) pt10 = (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) ? 10 : 0;
                else if (res.scores[key] !== undefined && res.scores[key] !== '') {
                    const rawSc = parseFloat(res.scores[key]) || 0;
                    pt10 = rawSc <= 10 ? rawSc : Math.round((rawSc / 100) * 10 * 10) / 10;
                } else if (ans && String(ans).trim() !== '') { pt10 = 8.5; res.scores[key] = pt10; }

                const disp = isMCQ
                    ? ((ans !== undefined && ans !== '') ? `<strong>${['A','B','C','D'][ans] || ''}.</strong> ${q.options?.[ans] || ''}` : '<span class="text-red-500 italic">Tidak dijawab</span>')
                    : (String(ans || '').startsWith('data:audio')
                        ? `<div class="space-y-2 mt-1"><audio controls preload="metadata" class="h-10 w-full max-w-md rounded-lg" src="${ans}"></audio><div class="flex flex-wrap items-center gap-3"><a href="${ans}" download="rekaman_${email}_soal_${idx + 1}.webm" class="text-[11px] font-extrabold text-indigo-600 hover:underline"><i class="fas fa-download mr-1"></i>Unduh Audio</a>${transcript ? `<span class="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg"><strong>Transkrip:</strong> "${transcript}"</span>` : ''}</div></div>`
                        : (ans ? `<p class="whitespace-pre-line font-semibold text-slate-800">${ans}</p>` : '<span class="text-red-500 italic">Tidak dijawab</span>'));

                return `
                    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                        <div class="flex items-center justify-between">
                            <span class="font-extrabold text-slate-800">Soal #${idx + 1}: ${q.question || ''}</span>
                            <span class="px-2.5 py-0.5 rounded-md font-extrabold ${pt10 >= 7 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">Maks ${maxPts} Poin</span>
                        </div>
                        ${q.audioScript ? `<p class="text-[11px] text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg whitespace-pre-line"><strong>Naskah Audio:</strong>\n${q.audioScript}</p>` : ''}
                        <div class="p-3 rounded-xl bg-white border border-slate-200/80"><strong class="text-slate-500 uppercase text-[10px]">Jawaban / Rekaman Murid:</strong><div class="mt-1">${disp}</div></div>
                        ${isMCQ ? `
                            <div class="flex items-center justify-between pt-1">
                                <span class="text-slate-500">Kunci: <strong>${['A','B','C','D'][q.answer] || 'A'}. ${q.options?.[q.answer] || ''}</strong></span>
                                <span class="font-extrabold ${pt10 === 10 ? 'text-emerald-600' : 'text-red-600'}">${pt10 === 10 ? '✓ Benar (+10 Poin)' : '✗ Salah (0 Poin)'}</span>
                            </div>` : `
                            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 items-center">
                                <div class="sm:col-span-4 flex items-center gap-2">
                                    <label class="font-extrabold text-emerald-700 shrink-0">Poin (0–10):</label>
                                    <input type="number" min="0" max="10" step="0.5" value="${pt10}" oninput="updateQuestionManualPoint('${email}','${monthId}','${cat}',${idx},this.value)" class="hes-input !w-24 !py-1.5 !bg-white text-center font-black">
                                    <span class="text-slate-400 font-bold">/ 10</span>
                                </div>
                                <div class="sm:col-span-8"><input type="text" value="${res.questionNotes?.[key] || ''}" oninput="updateQuestionNote('${email}','${monthId}','${cat}',${idx},this.value)" placeholder="Catatan koreksi soal #${idx + 1} (opsional)..." class="hes-input !py-1.5 !bg-white text-xs"></div>
                            </div>`}
                    </div>`;
            }).join('')}
            <div class="p-4 sm:p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-3.5 mt-4">
                <h4 class="text-xs font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5"><i class="fas fa-file-signature text-indigo-600"></i> Pengaturan Rapor (Report Card)</h4>
                <div><label class="block text-xs font-bold text-slate-700 mb-1">Kelas / Level Program</label><input type="text" id="admin-exam-level" value="${res.classLevel || ''}" oninput="window.HES.materials['exam_result-${email}-${monthId}'].classLevel=this.value" placeholder="Contoh: Beginner / Intermediate / Advanced" class="hes-input !bg-white"></div>
                <div><label class="block text-xs font-bold text-slate-700 mb-1">Tutor's Note (Catatan Evaluasi Pengajar)</label><textarea id="admin-exam-feedback" rows="3" oninput="window.HES.materials['exam_result-${email}-${monthId}'].adminFeedback=this.value" placeholder="Tulis catatan evaluasi perkembangan murid untuk ditampilkan di rapor..." class="hes-input !bg-white">${res.adminFeedback || ''}</textarea></div>
            </div>
            <button onclick="saveExamGrades('${email}','${monthId}')" class="hes-btn-primary !bg-emerald-600 w-full"><i class="fas fa-check-circle"></i> Simpan Nilai & Terbitkan Rapor</button>
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