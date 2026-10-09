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
    renderAppSidebar();
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
    const startEl = document.getElementById('admin-sched-start');
    const endEl = document.getElementById('admin-sched-end');

    if (maxMonthEl) {
        let suggestedMonth = parseInt(p.maxMonth || '1');
        
        // Cari bulan aktif terakhir yang terdaftar di database
        let mKey = `m${suggestedMonth}`;
        let currentEndDate = (p.monthEndDates && p.monthEndDates[mKey]) ? p.monthEndDates[mKey] : p.validUntil;
        
        if (currentEndDate && currentEndDate !== 'Belum diatur') {
            let endObj = parseDateStr(currentEndDate);
            if (!isNaN(endObj)) {
                endObj.setHours(23, 59, 59, 999);
                let today = new Date();
                
                // Jika batas bulan sebelumnya sudah lewat (kedaluwarsa), 
                // otomatis arahkan form untuk mengatur bulan berikutnya.
                if (today > endObj && suggestedMonth < window.HES.months.length) {
                    suggestedMonth++;
                }
            }
        }
        
        maxMonthEl.value = String(suggestedMonth);
    }

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

    onAdminMonthSelectChange();
    renderSavedMonthDatesSummary(email);
};

// Saat Admin mengganti dropdown "Batas: Month X", tampilkan tanggal batas khusus untuk Month X tersebut
window.onAdminMonthSelectChange = function() {
    const emailEl = document.getElementById('admin-sched-student');
    const maxMonthEl = document.getElementById('admin-sched-max-month');
    const dateEl = document.getElementById('admin-sched-date');
    const labelEl = document.getElementById('admin-sched-date-label');
    if (!emailEl || !maxMonthEl || !dateEl) return;

    const email = emailEl.value;
    const mNum = maxMonthEl.value || '1';
    const mKey = `m${mNum}`;
    const p = window.HES.materials[`profile-${email}`] || {};
    const monthEndDates = p.monthEndDates || {};

    if (labelEl) {
        labelEl.innerHTML = `<i class="far fa-calendar-check mr-1"></i> Batas Akhir Month ${mNum} (Day 12)`;
    }

    if (monthEndDates[mKey]) {
        dateEl.value = monthEndDates[mKey];
    } else if (String(p.maxMonth || '1') === String(mNum) && p.validUntil && p.validUntil !== 'Belum diatur') {
        dateEl.value = p.validUntil;
    } else {
        dateEl.value = '';
    }
};

function renderSavedMonthDatesSummary(email) {
    const box = document.getElementById('admin-saved-month-dates-box');
    if (!box) return;

    const p = window.HES.materials[`profile-${email}`] || {};
    const monthEndDates = Object.assign({}, p.monthEndDates || {});
    const maxM = String(p.maxMonth || '1');
    if (p.validUntil && p.validUntil !== 'Belum diatur' && !monthEndDates[`m${maxM}`]) {
        monthEndDates[`m${maxM}`] = p.validUntil;
    }

    let today = new Date();
    today.setHours(0, 0, 0, 0);

    let badges = window.HES.months.map(m => {
        const endStr = monthEndDates[m.id];
        if (!endStr) {
            return `<span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-400 font-semibold">${m.title}: Belum diatur</span>`;
        }
        let endObj = parseDateStr(endStr);
        endObj.setHours(23, 59, 59, 999);
        const isDone = today > endObj;
        return `
            <span class="px-2.5 py-1 rounded-lg border font-bold inline-flex items-center gap-1.5 ${isDone ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}">
                <i class="fas ${isDone ? 'fa-check-circle text-emerald-500' : 'fa-clock text-emerald-600'}"></i>
                ${m.title}: s/d ${endStr} ${isDone ? '(Selesai)' : '(Berjalan)'}
            </span>
        `;
    }).join('');

    box.innerHTML = `
        <p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Rekam Tanggal Batas Per-Bulan Murid Ini:</p>
        <div class="flex flex-wrap gap-1.5">${badges}</div>
    `;
}

function renderAdminUsersTab() {
    const tbody = document.getElementById('admin-students-table-body');
    if (!tbody) return;

    let today = new Date();
    today.setHours(0, 0, 0, 0);

    tbody.innerHTML = window.HES.students.map((s, idx) => {
        const p = window.HES.materials[`profile-${s.email}`] || {};
        const schedSummary = (p.days && p.days.length > 0)
            ? `${p.days.join(', ')} (${p.time || '-'})`
            : '<span class="text-slate-400 italic">Belum diatur</span>';

        const monthEndDates = Object.assign({}, p.monthEndDates || {});
        const maxM = String(p.maxMonth || '1');
        if (p.validUntil && p.validUntil !== 'Belum diatur' && !monthEndDates[`m${maxM}`]) {
            monthEndDates[`m${maxM}`] = p.validUntil;
        }

        const monthPills = Object.entries(monthEndDates)
            .sort((a, b) => parseInt(a[0].replace('m', '')) - parseInt(b[0].replace('m', '')))
            .map(([mKey, dStr]) => {
                let dObj = parseDateStr(dStr);
                dObj.setHours(23, 59, 59, 999);
                let done = today > dObj;
                return `<span class="inline-block mr-1.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${done ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}">${mKey.toUpperCase()}: ${dStr} ${done ? '✓' : ''}</span>`;
            }).join('');

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition">
                <td class="p-3.5 text-slate-800 text-xs font-extrabold">${s.name}</td>
                <td class="p-3.5 text-slate-500 text-xs font-medium">${s.email}</td>
                <td class="p-3.5">
                    <p class="text-xs font-bold text-slate-700">${schedSummary} • <span class="text-indigo-600">Batas: Month ${maxM}</span></p>
                    <div class="mt-1">${monthPills || '<span class="text-[10px] text-slate-400">Tanggal bulan belum diatur</span>'}</div>
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
    if (!profile.monthEndDates) profile.monthEndDates = {};

    const selectedMonthNum = document.getElementById('admin-sched-max-month').value || '1';
    const selectedDateVal = document.getElementById('admin-sched-date').value;

    // Simpan tanggal batas khusus untuk Month yang sedang dipilih tanpa menghapus Month sebelumnya
    if (selectedDateVal) {
        profile.monthEndDates[`m${selectedMonthNum}`] = selectedDateVal;
        profile.validUntil = selectedDateVal;
    }

    // Pastikan maxMonth selalu mengambil bulan tertinggi yang pernah dibuka atau yang sedang dipilih
    const highestConfiguredMonth = Object.keys(profile.monthEndDates).reduce((max, key) => {
        const num = parseInt(key.replace('m', '')) || 1;
        return num > max ? num : max;
    }, parseInt(selectedMonthNum));

    profile.maxMonth = Math.max(parseInt(selectedMonthNum), highestConfiguredMonth);

    // Pastikan validUntil global mengacu pada batas bulan tertinggi yang aktif
    if (profile.monthEndDates[`m${profile.maxMonth}`]) {
        profile.validUntil = profile.monthEndDates[`m${profile.maxMonth}`];
    }

    const sT = document.getElementById('admin-sched-start').value;
    const eT = document.getElementById('admin-sched-end').value;
    if (sT && eT) profile.time = `${sT} - ${eT}`;

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
        showToast(`Jadwal & batas Month ${selectedMonthNum} berhasil disimpan!`, 'success');
        renderSavedMonthDatesSummary(email);
        renderAdminUsersTab();
        renderAppSidebar();
    } else {
        showToast('Gagal menyimpan jadwal: ' + error.message, 'error');
    }
};

// ==========================================
// TAB 3: MATERI PDF & KOSAKATA
// ==========================================
// Fungsi untuk menyimpan tautan Google Drive (Modul & Recap)
window.saveMaterialData = async function(e) {
    const targetStudent = document.getElementById('admin-target-student').value;
    const month = document.getElementById('admin-month').value;
    const week = document.getElementById('admin-week').value;
    const day = document.getElementById('admin-day').value;
    
    const link = document.getElementById('admin-link').value.trim();
    const recap = document.getElementById('admin-recap-pdf').value.trim();

    // Validasi input dropdown
    if (!targetStudent || !month || !week || !day) {
        showToast('Harap pilih target murid, bulan, minggu, dan hari!', 'error');
        return;
    }

    // Tentukan prefix key berdasarkan target (all atau email murid spesifik)
    const prefix = targetStudent === 'all' ? 'all' : targetStudent;
    
    const linkKey = `${prefix}-${month}-w${week}-d${day}-link`;
    const recapKey = `${prefix}-${month}-w${week}-d${day}-recap`;

    // Simpan ke state global HES (atau hapus jika dikosongkan)
    if (link) window.HES.materials[linkKey] = link;
    else delete window.HES.materials[linkKey];

    if (recap) window.HES.materials[recapKey] = recap;
    else delete window.HES.materials[recapKey];

    // Animasi tombol loading
    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
    btn.disabled = true;

    // Simpan ke database Supabase
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    
    // Kembalikan tombol ke semula
    btn.innerHTML = origText;
    btn.disabled = false;

    if (!error) {
        showToast(`Tautan materi berhasil disimpan untuk sesi ${month.toUpperCase()} W${week} D${day}!`, 'success');
    } else {
        showToast('Gagal menyimpan tautan materi: ' + error.message, 'error');
    }
};

// Fungsi untuk menyimpan Override Kosakata Harian secara manual
window.saveVocabList = async function(e) {
    const m = document.getElementById('admin-vocab-month').value;
    const w = document.getElementById('admin-vocab-week').value;
    const d = document.getElementById('admin-vocab-day').value;
    const listText = document.getElementById('admin-vocab-list').value.trim();

    const key = `vocab-${m}-w${w}-d${d}`;
    
    // Simpan atau hapus jika kosong
    if (listText) window.HES.materials[key] = listText;
    else delete window.HES.materials[key];

    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
    btn.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    
    btn.innerHTML = origText;
    btn.disabled = false;

    if (!error) {
        loadAdminVocabPreview(); // Refresh preview form
        showToast(`Override kosakata sesi ${m.toUpperCase()} W${w} D${d} berhasil disimpan!`, 'success');
    } else {
        showToast('Gagal menyimpan kosakata manual: ' + error.message, 'error');
    }
};

// Fungsi untuk memanggil dan melihat status hafalan murid (Dengan Auto-Sync)
window.checkVocabStatus = async function(btn) {
    const email = document.getElementById('admin-review-student').value;
    const m = document.getElementById('admin-review-month').value;
    const w = document.getElementById('admin-review-week').value;
    const d = document.getElementById('admin-review-day').value;
    const resultBox = document.getElementById('vocab-review-result');

    if (!email || !m || !w || !d) {
        showToast('Pilih murid dan sesi terlebih dahulu.', 'error');
        return;
    }

    // Tangkap elemen tombol jika dipanggil dari dalam fungsi lain
    const btnEl = btn || document.querySelector('button[onclick="checkVocabStatus(this)"]');
    const origText = btnEl ? btnEl.innerHTML : '';
    
    if (btnEl) {
        btnEl.innerHTML = '<i class="fas fa-sync fa-spin mr-1"></i> Menyinkronkan Server...';
        btnEl.disabled = true;
    }
    resultBox.innerHTML = `<div class="p-4 text-center text-xs font-bold text-indigo-500"><i class="fas fa-cloud-download-alt animate-bounce mr-2"></i> Mengambil data hafalan terbaru...</div>`;

    // TARIK DATA TERBARU DARI SUPABASE
    await syncFromCloud();

    if (btnEl) {
        btnEl.innerHTML = origText;
        btnEl.disabled = false;
    }

    const key = `vocab_status-${email}-${m}-w${w}-d${d}`;
    const statusObj = window.HES.materials[key];

    if (!statusObj || statusObj.status === 'none') {
        resultBox.innerHTML = `
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col items-center fade-in">
                <i class="fas fa-user-clock text-slate-300 text-3xl mb-2"></i>
                <p class="text-xs text-slate-500 font-semibold">Murid belum menyetor hafalan untuk sesi ini.</p>
            </div>`;
        return;
    }

    if (statusObj.status === 'submitted') {
        resultBox.innerHTML = `
            <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl fade-in">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-amber-500 shadow-2xs">
                        <i class="fas fa-bell animate-pulse"></i>
                    </div>
                    <div>
                        <p class="text-xs font-extrabold text-amber-900">Menunggu Verifikasi Anda</p>
                        <p class="text-[11px] font-medium text-amber-700">Murid telah menyelesaikan setoran hafalan.</p>
                    </div>
                </div>
                <label class="block text-[10px] font-bold text-amber-700 uppercase mb-1">Beri Catatan (Opsional):</label>
                <textarea id="admin-vocab-feedback" class="w-full p-2.5 bg-white border border-amber-200 rounded-xl text-xs outline-none focus:border-amber-500 transition mb-3" rows="2" placeholder="Misal: Good Job! / Pronunciation kata X perlu dilatih lagi..."></textarea>
                
                <div class="flex gap-2">
                    <button onclick="updateVocabStatus('${email}', '${m}', ${w}, ${d}, 'approved')" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5">
                        <i class="fas fa-check-circle"></i> Terima & Verifikasi
                    </button>
                    <button onclick="updateVocabStatus('${email}', '${m}', ${w}, ${d}, 'none')" class="px-4 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 py-2.5 rounded-xl text-xs font-bold transition">
                        Tolak / Ulangi
                    </button>
                </div>
            </div>
        `;
    } else if (statusObj.status === 'approved') {
        resultBox.innerHTML = `
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl fade-in">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-emerald-500 shadow-2xs">
                        <i class="fas fa-medal"></i>
                    </div>
                    <div>
                        <p class="text-xs font-extrabold text-emerald-900">Hafalan Terverifikasi</p>
                        <p class="text-[11px] font-medium text-emerald-700">Murid telah mendapatkan tambahan 25 XP.</p>
                    </div>
                </div>
                <div class="bg-white/60 p-2.5 rounded-lg border border-emerald-100 mb-3">
                    <p class="text-[10px] font-bold text-emerald-600 uppercase mb-0.5">Catatan Anda:</p>
                    <p class="text-xs text-emerald-900 font-semibold italic">"${statusObj.feedback || 'Tidak ada catatan'}"</p>
                </div>
                <button onclick="updateVocabStatus('${email}', '${m}', ${w}, ${d}, 'none')" class="text-[10px] font-bold text-red-500 hover:text-red-700 transition flex items-center gap-1">
                    <i class="fas fa-times"></i> Batalkan Verifikasi (Reset)
                </button>
            </div>
        `;
    }
};

// Fungsi untuk mengeksekusi perubahan status hafalan (Terima / Tolak)
window.updateVocabStatus = async function(email, m, w, d, newStatus) {
    const key = `vocab_status-${email}-${m}-w${w}-d${d}`;
    let fb = '';
    
    if (newStatus === 'approved') {
        const fbEl = document.getElementById('admin-vocab-feedback');
        if (fbEl) fb = fbEl.value.trim();
    }

    window.HES.materials[key] = { status: newStatus, feedback: fb };

    document.body.style.cursor = 'wait';
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    document.body.style.cursor = 'default';

    if (!error) {
        showToast(newStatus === 'approved' ? 'Hafalan berhasil diverifikasi!' : 'Status hafalan dikembalikan ke awal.', 'success');
        // Refresh kotak hasil secara otomatis
        checkVocabStatus();
    } else {
        showToast('Gagal mengubah status: ' + error.message, 'error');
    }
};
// ==========================================
// TAB 3: MATERI PDF, MASTER WORDBANK & KOSAKATA
// ==========================================
window.loadMasterWordbankIntoForm = function() {
    const wbTextarea = document.getElementById('admin-master-wordbank');
    const perDaySelect = document.getElementById('admin-words-per-day');
    if (!wbTextarea || !perDaySelect) return;

    const savedCloud = window.HES.materials['master_wordbank'] || '';
    const fallback = window.DEFAULT_WORDBANK_RAW || '';
    wbTextarea.value = savedCloud.trim() !== '' ? savedCloud : fallback;
    perDaySelect.value = String(getWordsPerDaySetting());
    updateMasterWordbankCounter();
};

window.updateMasterWordbankCounter = function() {
    const wbTextarea = document.getElementById('admin-master-wordbank');
    const perDaySelect = document.getElementById('admin-words-per-day');
    const statsBadge = document.getElementById('master-wordbank-stats-badge');
    const capText = document.getElementById('master-wordbank-capacity-text');
    if (!wbTextarea) return;

    const seen = new Set();
    let uniqueCount = 0;
    wbTextarea.value.split('\n').forEach(line => {
        if (!line.includes('=')) return;
        const eng = line.split('=')[0].trim().toLowerCase();
        if (eng && !seen.has(eng)) {
            seen.add(eng);
            uniqueCount++;
        }
    });

    const perDay = parseInt(perDaySelect ? perDaySelect.value : 5) || 5;
    const totalSessions = Math.floor(uniqueCount / perDay);
    const totalMonths = (totalSessions / 12).toFixed(1);

    if (statsBadge) statsBadge.innerText = `${uniqueCount} Kata Unik`;
    if (capText) capText.innerText = `Cukup untuk ${totalSessions} Pertemuan (~${totalMonths} Bulan)`;
};

window.saveMasterWordbank = async function(e) {
    const wbTextarea = document.getElementById('admin-master-wordbank');
    const perDaySelect = document.getElementById('admin-words-per-day');
    if (!wbTextarea) return;

    // Bersihkan duplikat sebelum disimpan ke Cloud
    const seen = new Set();
    const cleanedLines = [];
    wbTextarea.value.split('\n').forEach(line => {
        if (!line.includes('=')) return;
        const parts = line.split('=');
        const eng = parts[0].trim();
        const ind = parts.slice(1).join('=').trim();
        if (!eng || !ind) return;
        const key = eng.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            cleanedLines.push(`${eng} = ${ind}`);
        }
    });

    const cleanedText = cleanedLines.join('\n');
    wbTextarea.value = cleanedText;
    window.HES.materials['master_wordbank'] = cleanedText;
    window.HES.materials['master_wordbank_per_day'] = parseInt(perDaySelect ? perDaySelect.value : 5) || 5;

    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan Database...';
    btn.disabled = true;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    btn.innerHTML = origText;
    btn.disabled = false;

    if (!error) {
        updateMasterWordbankCounter();
        loadAdminVocabPreview();
        showToast(`${cleanedLines.length} kosakata unik berhasil disimpan ke Master Wordbank!`, 'success');
    } else {
        showToast('Gagal menyimpan Master Wordbank: ' + error.message, 'error');
    }
};

window.loadAdminVocabPreview = function() {
    loadMasterWordbankIntoForm();

    const mEl = document.getElementById('admin-vocab-month');
    const wEl = document.getElementById('admin-vocab-week');
    const dEl = document.getElementById('admin-vocab-day');
    const listEl = document.getElementById('admin-vocab-list');
    const badgeEl = document.getElementById('admin-vocab-source-badge');
    if (!mEl || !wEl || !dEl || !listEl) return;

    const manualKey = `vocab-${mEl.value}-w${wEl.value}-d${dEl.value}`;
    const manualExisting = window.HES.materials[manualKey] || '';

    if (manualExisting.trim() !== '') {
        listEl.value = manualExisting;
        if (badgeEl) {
            badgeEl.className = "text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200";
            badgeEl.innerText = "Override Manual";
        }
    } else {
        listEl.value = getSessionVocabText(mEl.value, wEl.value, dEl.value);
        if (badgeEl) {
            badgeEl.className = "text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200";
            badgeEl.innerText = "Otomatis Wordbank";
        }
    }
};

window.clearManualVocabOverride = async function(e) {
    const m = document.getElementById('admin-vocab-month').value;
    const w = document.getElementById('admin-vocab-week').value;
    const d = document.getElementById('admin-vocab-day').value;
    delete window.HES.materials[`vocab-${m}-w${w}-d${d}`];

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    if (!error) {
        loadAdminVocabPreview();
        showToast(`Sesi ${m.toUpperCase()} W${w} D${d} dikembalikan ke jatah otomatis Master Wordbank.`, 'info');
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