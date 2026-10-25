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
// TAB 3: BUILDER MODUL MATERI BILINGUAL (BOOK-FLOW) & MASTER WORDBANK
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
        single: `Bertindaklah sebagai penulis buku panduan Bahasa Inggris best-seller sekaligus mentor privat yang hangat di "Hamdi English Studio".
Buatkan materi panduan belajar yang MENDALAM, MENGALIR, dan TIDAK KAKU untuk ${m} - Session ${sNum} dengan topik: [ISI TOPIK MATERI DI SINI].

ATURAN BAHASA & KEDALAMAN MATERI (WAJIB DIIKUTI):
1. BILINGUAL (CAMPUR INDONESIA - INGGRIS YANG NATURAL):
   - Gunakan Bahasa Indonesia yang santai, akrab, dan jernih untuk menjelaskan logika konsep, nuansa rasa bahasa, budaya penutur asli (native speaker), dan alasan mengapa suatu kalimat dipakai.
   - Gunakan Bahasa Inggris natural untuk semua kalimat contoh, ungkapan, rumus, dan percakapan (berikan terjemahan/arti Indonesia di dalam kurung setelah kalimat Inggris).
2. JANGAN MONOTON / JANGAN PAKAI TEMPLATE KAKU:
   - Susun alur bab ("## Judul Bab") dan sub-bab ("### Sub-judul") secara kreatif dan bervariasi menyesuaikan karakter topik ini, layaknya buku panduan belajar bahasa Inggris populer!
   - Jelaskan secara MENDALAM dan DETAIL: kupas tuntas perbedaan nuansa kata, kapan waktu yang pas menggunakannya (situasi formal vs santai), serta jebakan terjemahan harfiah (Bahasa Indonesia ke Inggris) yang sering bikin kalimat terdengar aneh.
   - Kamu bebas memadukan paragraf cerita/penjelasan, kotak catatan (> Catatan: ...), rumus visual, perbandingan kalimat, daftar ekspresi, beberapa simulasi dialog pendek di situasi berbeda, hingga latihan interaktif di tengah maupun di akhir materi.

FORMAT KOMPONEN VISUAL YANG DIDUKUNG SISTEM KAMI (Gunakan & racik secara fleksibel sesuai kebutuhan topik di dalam 1 code block):

TITLE: [Judul Topik yang Menarik & Modern]
LEVEL: [${m} • Session ${sNum} of 12]
STYLE: [Pilih warna tema: ocean / indigo / teal / amber]
GOAL: [1-2 kalimat hangat (Bilingual) tentang apa yang akan dikuasai murid setelah membaca bab ini]

## [Judul Bab 1 yang Kreatif Sesuai Topik, misal: Mengapa Terjemahan Harfiah Sering Terdengar Kaku?]
[Tulis 2-3 paragraf penjelasan mendalam dengan gaya bercerita yang asyik. Gunakan **bold** untuk menyorot kata penting dan "tanda kutip" untuk contoh kalimat Inggris.]
> **Kunci Pemahaman**: [Tulis insight penting, rahasia native speaker, atau jembatan keledai agar murid langsung paham konsep intinya.]

## [Judul Bab 2 Sesuai Topik, misal: Bedah Logika / Skenario Situasi / Anatomi Ungkapan]
[Penjelasan pengantar bab yang detail dan mudah dicerna...]
### [Sub-bab Opsional untuk Memecah Pembahasan Detail]
- **[Poin / Nuansa 1]**: [Penjelasan detail dalam Bahasa Indonesia + contoh kalimat "English sentence" (Arti Indonesia).]
- **[Poin / Nuansa 2]**: [Penjelasan detail dalam Bahasa Indonesia + contoh kalimat "English sentence" (Arti Indonesia).]

(Jika topik membutuhkan rumus/pola kalimat, gunakan blok ini:)
[+] [Nama Pola Positif/Utama] | [Blok 1 + Blok 2 + Blok 3] | [Contoh kalimat Inggris natural (Terjemahan Indonesia)]
[-] [Nama Pola Negatif/Alternatif] | [Blok 1 + Blok 2 + Blok 3] | [Contoh kalimat Inggris natural (Terjemahan Indonesia)]
[?] [Nama Pola Pertanyaan] | [Blok 1 + Blok 2 + Blok 3] | [Contoh kalimat Inggris natural (Terjemahan Indonesia)]

## [Judul Bab 3 Sesuai Topik, misal: Koleksi Ekspresi Natural / Variasi Formal vs Nongkrong]
[Paragraf penjelasan tentang bagaimana membedakan nada bicara...]
- [Ungkapan Inggris 1] | [Penjelasan arti, nuansa, & kapan dipakai (Indonesia)] | [Contoh kalimat Inggris (Terjemahan Indonesia)]
- [Ungkapan Inggris 2] | [Penjelasan arti, nuansa, & kapan dipakai (Indonesia)] | [Contoh kalimat Inggris (Terjemahan Indonesia)]
- [Ungkapan Inggris 3] | [Penjelasan arti, nuansa, & kapan dipakai (Indonesia)] | [Contoh kalimat Inggris (Terjemahan Indonesia)]
- [Ungkapan Inggris 4] | [Penjelasan arti, nuansa, & kapan dipakai (Indonesia)] | [Contoh kalimat Inggris (Terjemahan Indonesia)]
- [Ungkapan Inggris 5] | [Penjelasan arti, nuansa, & kapan dipakai (Indonesia)] | [Contoh kalimat Inggris (Terjemahan Indonesia)]

(Jika ingin membandingkan Terjemahan Kaku vs Natural, atau Formal vs Santai, gunakan format perbandingan ini:)
- [Kaku: Kalimat Inggris kaku/salah] | [Natural: Kalimat Inggris natural (Arti Indonesia)] | [Alasan detail dalam Bahasa Indonesia mengapa versi kanan terdengar lebih natural]
- [Formal: Kalimat Inggris sopan/kantor] | [Santai: Kalimat Inggris kasual (Arti Indonesia)] | [Penjelasan situasi penggunaannya]

## [Judul Bab 4: Simulasi Percakapan Nyata di Lapangan]
[1 kalimat pengantar konteks suasana percakapan dalam Bahasa Indonesia]
Man: [Kalimat Inggris natural 1] ([Terjemahan Indonesia])
Woman: [Kalimat Inggris natural 2] ([Terjemahan Indonesia])
Man: [Kalimat Inggris natural 3] ([Terjemahan Indonesia])
Woman: [Kalimat Inggris natural 4] ([Terjemahan Indonesia])
Man: [Kalimat Inggris natural 5] ([Terjemahan Indonesia])
Woman: [Kalimat Inggris natural 6] ([Terjemahan Indonesia])

## [Judul Bab 5: Tantangan Interaktif & Praktek Mandiri]
1. [Detektif Nuansa / Terjemahan Natural]: [Soal latihan kontekstual] (Answer: [Kunci jawaban Bahasa Inggris + pembahasan singkat dalam Bahasa Indonesia])
2. [Upgrade Kalimat Kaku]: [Minta murid mengubah kalimat kaku/Indonesia ke ekspresi natural hari ini] (Answer: [Contoh jawaban natural + alasannya])
3. [Tantangan Respon Situasi]: [Berikan skenario nyata dan minta murid merespon dengan suara lantang] (Answer: [Contoh respon yang bisa dipakai murid])`,

        bulk: `Bertindaklah sebagai penulis buku kurikulum Bahasa Inggris best-seller untuk "Hamdi English Studio".
Buatkan 12 Bab Materi Panduan Belajar (Session 1 s/d Session 12) untuk ${m} yang BILINGUAL (Penjelasan Bahasa Indonesia mendalam + Contoh/Dialog Bahasa Inggris), DETAIL, dan SANGAT BERVARIASI.
Tema / Level Bulan Ini: [ISI TEMA / LEVEL BULAN INI, MISAL: PERCAKAPAN SEHARI-HARI & PENGUASAAN TENSES NATURAL].

ATURAN UTAMA AGAR 12 SESI TIDAK MONOTON & TIDAK TERASA TEMPLATE:
1. GANTI PENDEKATAN BELAJAR DI SETIAP SESI! Jangan gunakan urutan bab yang sama terus-menerus:
   - Sesi 1, 5, 9 (Gaya Bedah Konsep & Logika Bahasa): Fokus membongkar cara berpikir bahasa Inggris vs Indonesia, dilengkapi rumus visual [+]/[-]/[?], jebakan kesalahan umum, dan dialog aplikasi.
   - Sesi 2, 6, 10 (Gaya Skenario Situasional & Survival): Fokus pada situasi nyata (misal di kafe, kantor, bandara, telepon), tahapan obrolan dari buka suara sampai pamit, perbandingan [Formal: ...] vs [Santai: ...], dan multi-dialog.
   - Sesi 3, 7, 11 (Gaya Storytelling & Bedah Ekspresi Native): Dibuka dengan cerita pendek yang seru, lalu membedah idiom/phrasal verbs yang muncul di cerita tersebut beserta nuansa emosinya.
   - Sesi 4, 8, 12 (Gaya Klinik Kelancaran & Roleplay): Fokus mengubah kalimat "buku teks kaku" menjadi bahasa ngobrol yang luwes ([Kaku: ...] | [Natural: ...]), tips pelafalan/intonasi (> Tips: ...), dan simulasi tanya-jawab.
2. BILINGUAL & DETAIL: Jelaskan konsep dengan Bahasa Indonesia yang hangat dan mendalam. Untuk setiap kalimat dialog atau contoh, sertakan terjemahan Indonesia di dalam kurung (...) di akhir baris agar murid mudah memahami artinya tanpa mengganggu mesin suara Inggris.
3. Pisahkan setiap sesi dengan tanda === di baris baru.

Gunakan struktur fleksibel ini di dalam 1 code block:

SESSION: 1
TITLE: [Judul Menarik Sesi 1]
LEVEL: [${m} • Session 1 of 12]
STYLE: [ocean / indigo / teal / amber]
GOAL: [Target belajar sesi ini dalam Bahasa Indonesia & Inggris]

## [Judul Bab Kreatif 1]
[Paragraf penjelasan mendalam Bilingual...]
> **[Judul Catatan]**: [Tips penting / nuansa budaya]

## [Judul Bab Kreatif 2]
[Kombinasi sub-bab ###, poin penjelasan, rumus [+]/[-]/[?], atau daftar ekspresi: Frasa Inggris | Penjelasan Indo | Contoh Inggris (Arti Indo)]

## [Judul Bab Kreatif 3]
[Perbandingan [Kaku: ...] | [Natural: ...] | [Alasan] ATAU Simulasi Dialog Man:/Woman: dengan terjemahan di dalam kurung (...)]

## [Judul Bab Latihan]
1. [Tipe Soal 1]: [Pertanyaan] (Answer: [Kunci & Pembahasan])
2. [Tipe Soal 2]: [Pertanyaan] (Answer: [Kunci & Pembahasan])
3. [Praktek Speaking]: [Tantangan bicara] (Answer: [Contoh respon])
===
SESSION: 2
... (lanjutkan dengan gaya penyajian yang berbeda hingga SESSION: 12)`,

        recap: `Buatkan Catatan Evaluasi & Rangkuman Kelas (Class Recap) yang hangat, personal, dan mendalam (Bilingual: Bahasa Indonesia santai + Bahasa Inggris) untuk murid saya setelah menyelesaikan Session ${sNum} (${m}) tentang: [ISI TOPIK / CATATAN KELAS HARI INI].

Tulis hasilnya di dalam code block dengan format mengalir berikut:

TITLE: Rangkuman & Evaluasi Kelas • Session ${sNum}
LEVEL: ${m} • Personal Coaching Summary
STYLE: emerald
GOAL: Mengulas kembali poin terbaik dari sesi latihan hari ini dan mengunci koreksi kalimat agar makin luwes.

## Apresiasi & Catatan Perkembangan Hari Ini
[Tulis 1-2 paragraf hangat dalam Bahasa Indonesia yang mengapresiasi keberanian dan perkembangan murid di kelas hari ini, layaknya mentor pribadi yang suportif.]

## Ungkapan & Kosakata Emas yang Kita Praktekkan
- [Ungkapan Inggris 1] | [Arti & catatan kapan menggunakannya] | [Contoh kalimat Inggris (Terjemahan Indonesia)]
- [Ungkapan Inggris 2] | [Arti & catatan kapan menggunakannya] | [Contoh kalimat Inggris (Terjemahan Indonesia)]
- [Ungkapan Inggris 3] | [Arti & catatan kapan menggunakannya] | [Contoh kalimat Inggris (Terjemahan Indonesia)]

## Upgrade Kalimat: Dari Kaku Menjadi Natural
- [Tadi Terucap: Kalimat yang masih kurang pas 1] | [Versi Natural: Kalimat perbaikan 1 (Arti Indonesia)] | [Penjelasan ramah dalam Bahasa Indonesia mengapa versi ini lebih tepat]
- [Tadi Terucap: Kalimat yang masih kurang pas 2] | [Versi Natural: Kalimat perbaikan 2 (Arti Indonesia)] | [Penjelasan ramah dalam Bahasa Indonesia mengapa versi ini lebih tepat]

> **Tips Pelafalan & Kelancaran Minggu Ini**: [1 tips praktis tentang cara baca, intonasi, atau trik menyambung kata (linking sound) untuk dilatih di rumah.]

## Misi Latihan Ringan Sebelum Pertemuan Berikutnya
1. [Cek Ingatan Cepat]: [1 pertanyaan review singkat dari materi hari ini] (Answer: [Kunci jawaban & penjelasan])
2. [Tantangan Voice Note 1 Menit]: [Instruksi santai untuk latihan bicara mandiri]`
    };

    navigator.clipboard.writeText(prompts[mode] || prompts.single)
        .then(() => showToast('Prompt Buku Panduan Bilingual (Detail & Variatif) berhasil disalin!', 'success'))
        .catch(() => showToast('Gagal menyalin otomatis.', 'error'));
};

window.insertSampleModuleTemplate = function(type = 'module') {
    const m = ($('admin-month')?.value || 'm1').toUpperCase();
    const sNum = ((parseInt($('admin-week')?.value || '1') - 1) * 3) + parseInt($('admin-day')?.value || '1');

    if (type === 'module') {
        $('admin-link').value = `TITLE: Seni "Small Talk" & Menceritakan Keseharian Tanpa Terdengar Kaku
LEVEL: ${m} • Session ${sNum} of 12 • Conversational Fluency
STYLE: ocean
GOAL: Mampu ngobrol santai tentang rutinitas pagi, kesibukan kerja, dan cara melepas lelah dengan ekspresi natural ala penutur asli (native speaker).

## Mengapa Kalimat Kita Sering Terdengar Seperti Robot?
Pernahkah kamu ditanya **"How's your day going?"** lalu secara refleks menjawab **"I wake up at 6 AM, I take a bath, and I go to the office by car"**? Secara aturan *grammar*, kalimat itu tidak salah. Tapi di telinga penutur asli, kalimat seperti itu terdengar seperti laporan absensi sekolah!

Dalam percakapan nyata, orang bule jarang menyebutkan daftar kegiatan menit demi menit. Mereka lebih suka menceritakan **suasana (*vibe*)** dan **kebiasaan unik** mereka menggunakan kata keterangan frekuensi yang luwes seperti **"usually"**, **"pretty much always"**, atau **"hardly ever"**.

> **Kunci Pemahaman**: Jangan hanya menerjemahkan kata per kata dari Bahasa Indonesia ("mandi" = *take a bath*, "naik mobil" = *go by car*). Gunakan **kesatuan frasa (chunks)** yang memang dipakai sehari-hari, seperti **"hop in the shower"** (mandi cepat) atau **"drive to work"** (berangkat kerja naik mobil).

## Bedah Logika: Cara Kerja "Simple Present" untuk Kebiasaan
Saat kita membicarakan rutinitas yang berulang (harian, mingguan, atau karakter diri), kita menggunakan pola **Simple Present**. Rahasia agar terdengar natural ada pada penempatan *kata frekuensi* tepat sebelum kata kerja utamanya:

[+] Menceritakan Kebiasaan Sendiri (I / You / We / They) | Subject + Frequency Word + Verb 1 + Pelengkap | I usually grab a quick coffee before diving into work. (Aku biasanya beli kopi sebentar sebelum mulai fokus kerja.)
[+] Menceritakan Kebiasaan Orang Lain (He / She / It) | He / She + Frequency Word + Verb 1 (-s/es) + Pelengkap | My manager almost always replies to emails within five minutes. (Manajerku hampir selalu membalas email dalam lima menit.)
[-] Mengatakan Hal yang Jarang / Tidak Dilakukan | Subject + don't / doesn't + really + Verb 1 | I don't really check work messages after 8 PM. (Aku nggak terlalu ngecek pesan kerjaan lagi lewat jam 8 malam.)
[?] Bertanya Rutinitas Secara Santai | How often / What time + do / does + Subject + usually + Verb 1? | What time do you usually wrap up work on Fridays? (Biasanya kamu selesai kerja jam berapa kalau hari Jumat?)

### Jebakan "Am / Is / Are" yang Paling Sering Terjadi
Banyak pelajar Indonesia tidak sengaja menambahkan **am / is / are** di depan kata kerja karena merasa kalimatnya belum lengkap. Ingat aturan emas ini: jika sudah ada kata kerja aksi (*wake up, work, eat, agree*), **jangan pernah** menaruh *am/is/are* di depannya!

- [Kaku: I am usually wake up at 6 AM.] | [Natural: I usually wake up around 6 AM. (Aku biasanya bangun sekitar jam 6 pagi.)] | Karena "wake up" sudah kata kerja aksi, kita tidak boleh memakai "am" lagi. Tambahkan kata "around" agar terdengar lebih santai.
- [Kaku: She goes to the office by car every day.] | [Natural: She drives to work every day. (Dia menyetir ke tempat kerja setiap hari.)] | Dalam bahasa Inggris, "naik mobil sendiri" langsung diungkapkan dengan kata kerja "drive", sedangkan kalau naik transportasi umum gunakan "take the train / bus" atau "commute".
- [Formal: I want to stop working now.] | [Santai: Let's call it a day! (Yuk kita sudahi kerjaan hari ini!)] | Di lingkungan kantor internasional, "call it a day" adalah ungkapan favorit untuk mengajak pulang atau menutup rapat dengan ramah.

## 5 Ungkapan Emas untuk Menceritakan Harimu
Coba ganti kosakata buku teks lama dengan 5 ungkapan natural berikut saat mengobrol:

- A slow starter | Orang yang butuh waktu untuk mengumpulkan nyawa/energi di pagi hari | Honestly, I'm a bit of a slow starter in the morning. (Jujur, aku agak lambat panas kalau masih pagi.)
- Grab a quick bite | Makan sesuatu dengan cepat karena sedang buru-buru | Let's grab a quick bite before the meeting starts. (Yuk cari makan sebentar sebelum rapatnya mulai.)
- Swamped with work | Sangat sibuk karena pekerjaan sedang menumpuk | I've been totally swamped with work all week. (Kerjaanku lagi numpuk banget sepanjang minggu ini.)
- Take a breather | Istirahat sejenak untuk menarik napas dan menyegarkan pikiran | You look exhausted—go take a quick breather! (Kamu kelihatan capek banget—sana istirahat sebentar!)
- Wind down | Melepas lelah dan bersantai perlahan setelah seharian beraktivitas | I usually wind down by watching a series before bed. (Aku biasanya bersantai dengan nonton serial sebelum tidur.)

## Simulasi Percakapan: Ngobrol Pagi di Pantry Kantor
Perhatikan bagaimana Kevin dan Sarah memadukan kalimat pendek, kata penghubung santai (*Honestly, Well, Haha*), dan ungkapan yang baru kita pelajari:

Man: Morning, Sarah! You look super energized today. Are you naturally an early bird? (Pagi, Sarah! Kamu kelihatan segar banget hari ini. Memangnya kamu tipe orang yang suka bangun pagi ya?)
Woman: Haha, not at all! Honestly, I'm a slow starter and I hit the snooze button twice every morning. (Haha, nggak sama sekali! Jujur aku tipe yang lambat panas dan selalu menunda alarm dua kali tiap pagi.)
Man: Really? How do you always get to the office so early then? (Masa sih? Terus kok kamu bisa sampai kantor pagi terus?)
Woman: Well, I prep my clothes the night before, and I just grab a quick bite on the way. What about you? (Yah, aku sudah siapkan baju dari malam sebelumnya, terus cuma beli sarapan praktis di jalan. Kalau kamu gimana?)
Man: I'm the opposite. I wake up around 5:30, go for a short jog, and take my time getting ready. (Aku kebalikannya. Aku bangun sekitar jam 5:30, lari pagi sebentar, terus santai-santai siap-siapnya.)
Woman: Wow, I respect that! By the time evening comes, I just want to wind down on the couch. (Wah, salut deh! Kalau sudah malam, aku sih cuma pengen selonjoran santai di sofa.)

## Tantangan Interaktif: Uji Pemahamanmu!
1. [Detektif Grammar]: Manakah kalimat yang paling tepat dan natural? A) "My boss don't likes morning meetings" atau B) "My boss doesn't like morning meetings"? (Answer: B! "My boss doesn't like morning meetings." Karena "My boss" adalah tunggal (He/She), gunakan "doesn't", dan kata kerja setelah "doesn't" wajib kembali ke bentuk dasar "like" tanpa -s.)
2. [Upgrade ke Bahasa Native]: Bagaimana cara mengatakan "Hari ini kerjaanku lagi numpuk banget, jadi aku cuma makan siang cepat" menggunakan ekspresi yang kita pelajari? (Answer: "I'm really swamped with work today, so I'll just grab a quick bite for lunch.")
3. [Praktek Bicara Mandiri]: Coba ceritakan dengan suara lantang selama 30 detik: Apa 2 hal yang selalu kamu lakukan di pagi hari, dan bagaimana caramu melepas lelah (wind down) di malam hari? (Answer: Contoh: "Every morning, I usually drink a glass of warm water and check my schedule. At night, I like to wind down by listening to music or chatting with my family.")`;
    } else {
        $('admin-recap-pdf').value = `TITLE: Rangkuman & Evaluasi Kelas • Session ${sNum}
LEVEL: ${m} • Personal Coaching Summary
STYLE: emerald
GOAL: Mengulas kembali poin terbaik dari sesi latihan hari ini dan mengunci koreksi kalimat agar makin luwes.

## Apresiasi & Catatan Perkembangan Hari Ini
Kerja bagus di sesi kelas hari ini! Kamu sudah jauh lebih rileks saat menjawab pertanyaan spontan tanpa harus menerjemahkan kata demi kata di kepala. Ceritamu tentang rutinitas pagi dan kesibukan harian terdengar sangat mengalir!

## Ungkapan & Kosakata Emas yang Kita Praktekkan
- Grab a quick breakfast | Sarapan cepat & praktis karena buru-buru | I usually grab a quick breakfast before leaving home. (Aku biasanya sarapan cepat sebelum berangkat dari rumah.)
- Stuck in traffic | Terjebak kemacetan di jalan | I was stuck in traffic for thirty minutes this morning. (Aku terjebak macet selama tiga puluh menit tadi pagi.)
- Call it a day | Menyudahi pekerjaan untuk hari ini | Let's finish this report and call it a day! (Yuk selesaikan laporan ini lalu kita pulang/istirahat!)

## Upgrade Kalimat: Dari Kaku Menjadi Natural
- [Tadi Terucap: My friend don't live here anymore.] | [Versi Natural: My friend doesn't live here anymore. (Temanku sudah tidak tinggal di sini lagi.)] | Ingat, karena "My friend" itu satu orang (setara He/She), kita gunakan "doesn't", bukan "don't".
- [Tadi Terucap: I am agree with your opinion.] | [Versi Natural: I completely agree with you. (Aku sangat setuju denganmu.)] | Kata "agree" sudah merupakan kata kerja (verb), jadi tidak perlu tambahan "am" di depannya.

> **Tips Kelancaran Minggu Ini**: Saat kamu butuh waktu 1-2 detik untuk berpikir sebelum menjawab pertanyaan dalam Bahasa Inggris, biasakan membuka kalimat dengan filler natural seperti **"Honestly,"**, **"Well, most of the time..."**, atau **"To be fair,"**—ini membuatmu terdengar jauh lebih fasih!

## Misi Latihan Ringan Sebelum Pertemuan Berikutnya
1. [Cek Ingatan Cepat]: Kalimat mana yang benar? A) "She doesn't drinks coffee" atau B) "She doesn't drink coffee"? (Answer: B! "She doesn't drink coffee" — setelah kata "doesn't", kata kerja kembali ke bentuk murni tanpa huruf -s.)
2. [Tantangan Voice Note]: Kirimkan voice note santai berdurasi 45 detik yang menceritakan bagaimana caramu bersantai (wind down) di akhir pekan!`;
    }
    updateAdminMaterialStatusBadge();
    showToast('Contoh Materi Bilingual (Detail & Mengalir) berhasil dimasukkan! Klik Simpan untuk mencoba.', 'info');
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