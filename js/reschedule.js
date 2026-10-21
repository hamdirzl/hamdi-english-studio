// js/reschedule.js

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    initLayout('Atur Jadwal');
    renderReschedulePage();

    await syncFromCloud();
    renderAppSidebar();
    renderReschedulePage();
});

function renderReschedulePage() {
    const email = window.HES.currentUser.email;
    const p = window.HES.materials[`profile-${email}`];
    const info = getStudentNextSessionInfo(email);

    const alertBox = document.getElementById('reschedule-alert-box');
    const controls = document.getElementById('reschedule-controls');
    const grid = document.getElementById('reschedule-grid-container');
    const selectEl = document.getElementById('reschedule-old-day');

    if (window.HES.userRole === 'admin') {
        alertBox.classList.remove('hidden'); controls.classList.add('hidden'); grid.innerHTML = '';
        alertBox.innerHTML = `<div class="hes-card flex items-center justify-between"><div><h4 class="font-extrabold text-slate-800 text-sm">Mode Administrator</h4><p class="text-xs text-slate-500">Setujui atau tolak permintaan pindah jadwal murid di halaman Panel Admin.</p></div><a href="admin.html?tab=overview" class="hes-btn-primary">Buka Panel Admin</a></div>`;
        return;
    }

    if (info.expired || info.error) {
        alertBox.classList.remove('hidden'); controls.classList.add('hidden'); grid.innerHTML = '';
        alertBox.innerHTML = `<div class="hes-card text-center text-xs font-bold text-slate-500 py-8">${info.expired ? 'Masa aktif kelasmu telah berakhir.' : info.error}</div>`;
        return;
    }

    alertBox.classList.add('hidden');
    controls.classList.remove('hidden');
    document.getElementById('reschedule-time-badge').innerHTML = `<i class="far fa-clock"></i> Jam Kelas: ${p.time}`;

    const opts = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const validDate = new Date(p.validUntil);
    if (!isNaN(validDate)) validDate.setHours(23, 59, 59, 999);

    for (let i = 0; i < 30 && opts.length < 3; i++) {
        const curr = new Date(today); curr.setDate(today.getDate() + i);
        if (!isNaN(validDate) && curr > validDate) break;
        const currStr = formatDateForID(curr);
        if (isOccupied(email, currStr)) {
            const pend = p.pendingReschedules?.[currStr];
            opts.push(`<option value="${currStr}">${getDisplayDate(curr)} ${pend ? '(Menunggu Konfirmasi)' : ''}</option>`);
        }
    }

    selectEl.innerHTML = opts.length ? opts.join('') : '<option value="">Tidak ada jadwal tersedia</option>';
    selectEl.onchange = updateRescheduleGrid;
    updateRescheduleGrid();
}

window.updateRescheduleGrid = function() {
    const oldDateStr = document.getElementById('reschedule-old-day')?.value;
    const grid = document.getElementById('reschedule-grid-container');
    if (!oldDateStr || !grid) return;

    const email = window.HES.currentUser.email;
    const p = window.HES.materials[`profile-${email}`];
    const selDate = parseDateStr(oldDateStr);
    const day = selDate.getDay();
    const startOfWeek = new Date(selDate);
    startOfWeek.setDate(selDate.getDate() - day + (day === 0 ? -6 : 1));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isPendingOld = p.pendingReschedules?.[oldDateStr] !== undefined;
    let html = '';

    for (let i = 0; i < 7; i++) {
        const curr = new Date(startOfWeek); curr.setDate(startOfWeek.getDate() + i);
        const currStr = formatDateForID(curr);
        const label = getDisplayDate(curr);

        if (isOccupied(email, currStr)) {
            html += `
                <div class="hes-card !bg-indigo-50/60 !border-indigo-200 text-center flex flex-col justify-between">
                    <p class="text-xs font-extrabold text-indigo-900 border-b border-indigo-100 pb-2">${label}</p>
                    <div class="my-4"><i class="fas fa-calendar-check text-indigo-500 text-2xl mb-1"></i><p class="text-xs font-bold text-indigo-700">${currStr === oldDateStr ? (isPendingOld ? 'Menunggu Konfirmasi' : 'Jadwal Dipilih') : 'Jadwal Rutinmu'}</p></div>
                </div>`;
            continue;
        }

        if (curr < today) {
            html += `<div class="hes-card opacity-50 text-center"><p class="text-xs font-bold text-slate-400 border-b pb-2">${label}</p><p class="text-xs text-slate-400 my-6">Sudah Lewat</p></div>`;
            continue;
        }

        const clash = window.HES.students.some(s => s.email !== email && isOccupied(s.email, currStr) && checkOverlap(p.time, window.HES.materials[`profile-${s.email}`]?.time));

        if (clash || isPendingOld) {
            html += `<div class="hes-card text-center opacity-60"><p class="text-xs font-bold text-slate-600 border-b pb-2">${label}</p><p class="text-xs font-semibold text-slate-400 my-6">${clash ? 'Slot Penuh' : 'Menunggu Validasi'}</p></div>`;
        } else {
            html += `
                <div class="hes-card hover-card text-center flex flex-col justify-between">
                    <p class="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">${label}</p>
                    <div class="my-3">
                        <span class="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-extrabold">✓ Tersedia</span>
                    </div>
                    <button onclick="processReschedule('${currStr}')" class="hes-btn-primary w-full !py-2 !text-xs">Pilih Hari Ini</button>
                </div>`;
        }
    }
    grid.innerHTML = html;
};

window.processReschedule = async function(newDateStr) {
    const oldDateStr = document.getElementById('reschedule-old-day').value;
    const oldDisp = getDisplayDate(parseDateStr(oldDateStr));
    const newDisp = getDisplayDate(parseDateStr(newDateStr));

    if (!confirm(`Pindahkan jadwal dari ${oldDisp} ke ${newDisp}?`)) return;
    const email = window.HES.currentUser.email;
    const p = window.HES.materials[`profile-${email}`];
    p.pendingReschedules = p.pendingReschedules || {};
    p.pendingReschedules[oldDateStr] = newDateStr;

    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    if (!error) {
        showToast('Pengajuan pindah jadwal terkirim ke Admin!', 'success');
        sendTelegramNotification(`📅 *Request Reschedule*\nMurid: ${window.HES.currentUser.name}\nDari: ${oldDisp}\nKe: ${newDisp}`);
        renderReschedulePage();
    } else showToast('Gagal mengirim: ' + error.message, 'error');
};