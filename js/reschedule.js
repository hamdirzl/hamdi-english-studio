// js/reschedule.js

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth();
    if (!session) return;

    initLayout('Penjadwalan Ulang');
    renderReschedulePage();

    await syncFromCloud();
    renderAppSidebar();
    renderReschedulePage();
});

function renderReschedulePage() {
    const email = window.HES.currentUser.email;
    const p = window.HES.materials[`profile-${email}`];
    const nextSeshInfo = getStudentNextSessionInfo(email);

    const alertBox = document.getElementById('reschedule-alert-box');
    const controlsSection = document.getElementById('reschedule-controls');
    const gridContainer = document.getElementById('reschedule-grid-container');
    const selectEl = document.getElementById('reschedule-old-day');
    const timeBadge = document.getElementById('reschedule-time-badge');

    if (window.HES.userRole === 'admin') {
        alertBox.classList.remove('hidden');
        controlsSection.classList.add('hidden');
        gridContainer.innerHTML = '';
        alertBox.innerHTML = `
            <div class="bg-indigo-50 border border-indigo-200 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-white text-indigo-600 flex items-center justify-center text-xl shadow-2xs shrink-0">
                        <i class="fas fa-user-shield"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-indigo-950 text-sm sm:text-base">Anda Login Sebagai Administrator</h4>
                        <p class="text-xs text-indigo-700 mt-0.5">Untuk menyetujui atau menolak pengajuan jadwal murid, silakan buka halaman Administrative CMS.</p>
                    </div>
                </div>
                <a href="admin.html?tab=overview" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition shrink-0">
                    Buka Validasi Jadwal
                </a>
            </div>
        `;
        return;
    }

    if (nextSeshInfo.expired) {
        alertBox.classList.remove('hidden');
        controlsSection.classList.add('hidden');
        gridContainer.innerHTML = '';
        alertBox.innerHTML = `
            <div class="bg-red-50 border border-red-200 p-5 rounded-2xl">
                <p class="text-xs sm:text-sm font-bold text-red-700"><i class="fas fa-lock mr-2"></i> Fitur penjadwalan ulang dibatasi karena masa aktif keanggotaan Anda telah berakhir.</p>
            </div>
        `;
        return;
    }

    if (nextSeshInfo.error) {
        alertBox.classList.remove('hidden');
        controlsSection.classList.add('hidden');
        gridContainer.innerHTML = '';
        alertBox.innerHTML = `
            <div class="bg-slate-100 border border-slate-200 p-5 rounded-2xl">
                <p class="text-xs sm:text-sm font-semibold text-slate-600"><i class="fas fa-info-circle mr-2 text-indigo-500"></i> ${nextSeshInfo.error}</p>
            </div>
        `;
        return;
    }

    alertBox.classList.add('hidden');
    controlsSection.classList.remove('hidden');
    if (timeBadge) timeBadge.innerHTML = `<i class="far fa-clock mr-1"></i> Jam Kelas: ${p.time}`;

    // Susun maksimal 3 jadwal terdekat yang bisa dipindahkan
    let upcomingOptions = [];
    let d = new Date();
    d.setHours(0, 0, 0, 0);
    let validDate = new Date(p.validUntil);
    let isValid = !isNaN(validDate);
    if (isValid) validDate.setHours(23, 59, 59, 999);
    let count = 1;
    let limitHit = false;

    const previousSelected = selectEl.value;

    for (let i = 0; i < 30 && upcomingOptions.length < 3; i++) {
        let curr = new Date(d);
        curr.setDate(d.getDate() + i);
        if (isValid && curr > validDate) {
            limitHit = true;
            break;
        }
        let currStr = formatDateForID(curr);
        if (isOccupied(email, currStr)) {
            let isPending = p.pendingReschedules && p.pendingReschedules[currStr];
            upcomingOptions.push(`<option value="${currStr}">Sesi ${count}: ${getDisplayDate(curr)} ${isPending ? '(Menunggu Konfirmasi)' : ''}</option>`);
            count++;
        }
    }

    if (limitHit && upcomingOptions.length > 0) {
        upcomingOptions.push(`<option disabled>--- Batas Masa Aktif Berakhir ---</option>`);
    }

    selectEl.innerHTML = upcomingOptions.length > 0
        ? upcomingOptions.join('')
        : '<option value="">Tidak ada kelas tersedia</option>';

    if (previousSelected && Array.from(selectEl.options).some(o => o.value === previousSelected)) {
        selectEl.value = previousSelected;
    }

    selectEl.onchange = updateRescheduleGrid;
    updateRescheduleGrid();
}

window.updateRescheduleGrid = function() {
    const selectEl = document.getElementById('reschedule-old-day');
    const gridContainer = document.getElementById('reschedule-grid-container');
    if (!selectEl || !gridContainer) return;

    const oldDateStr = selectEl.value;
    if (!oldDateStr) {
        gridContainer.innerHTML = `
            <div class="col-span-full py-12 text-center text-xs sm:text-sm font-medium text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                Silakan pilih jadwal awal pada dropdown di atas untuk melihat ketersediaan slot.
            </div>
        `;
        return;
    }

    const email = window.HES.currentUser.email;
    const p = window.HES.materials[`profile-${email}`];

    let selectedDate = parseDateStr(oldDateStr);
    let day = selectedDate.getDay();
    let diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
    let startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(diff);

    let gridHTML = '';
    let isPendingOld = p.pendingReschedules && p.pendingReschedules[oldDateStr] !== undefined;

    for (let i = 0; i < 7; i++) {
        let curr = new Date(startOfWeek);
        curr.setDate(startOfWeek.getDate() + i);
        let currStr = formatDateForID(curr);
        let displayDay = getDisplayDate(curr);
        let today = new Date();
        today.setHours(0, 0, 0, 0);
        let isPast = curr < today;

        // 1. Jika tanggal tersebut sudah terisi oleh murid ini sendiri
        if (isOccupied(email, currStr)) {
            let isPendingNew = p.pendingReschedules && Object.values(p.pendingReschedules).includes(currStr);
            if (currStr === oldDateStr) {
                gridHTML += `
                    <div class="p-5 rounded-2xl border-2 ${isPendingOld ? 'border-amber-400 bg-amber-50/70' : 'border-indigo-500 bg-indigo-50/60'} flex flex-col items-center text-center shadow-xs">
                        <div class="font-bold ${isPendingOld ? 'text-amber-900' : 'text-indigo-900'} text-xs mb-3 border-b ${isPendingOld ? 'border-amber-200' : 'border-indigo-200'} pb-2.5 w-full">${displayDay}</div>
                        <i class="fas ${isPendingOld ? 'fa-hourglass-half text-amber-500 fa-spin' : 'fa-calendar-day text-indigo-600'} text-2xl my-2"></i>
                        <div class="text-[11px] font-extrabold ${isPendingOld ? 'text-amber-700' : 'text-indigo-700'} mt-1">${isPendingOld ? 'Dalam Proses Validasi' : 'Jadwal Saat Ini'}</div>
                    </div>
                `;
            } else if (isPendingNew) {
                gridHTML += `
                    <div class="p-5 rounded-2xl border-2 border-blue-300 bg-blue-50/70 flex flex-col items-center text-center shadow-xs">
                        <div class="font-bold text-blue-900 text-xs mb-3 border-b border-blue-200 pb-2.5 w-full">${displayDay}</div>
                        <i class="fas fa-spinner fa-spin text-blue-500 text-2xl my-2"></i>
                        <div class="text-[11px] font-extrabold text-blue-700 mt-1">Target Pengajuan</div>
                    </div>
                `;
            } else {
                gridHTML += `
                    <div class="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center text-center">
                        <div class="font-bold text-slate-600 text-xs mb-3 border-b border-slate-200 pb-2.5 w-full">${displayDay}</div>
                        <i class="fas fa-calendar-check text-slate-400 text-2xl my-2"></i>
                        <div class="text-[11px] font-semibold text-slate-500 mt-1">Sesi Rutin Anda</div>
                    </div>
                `;
            }
            continue;
        }

        // 2. Jika tanggal sudah lewat
        if (isPast) {
            gridHTML += `
                <div class="p-5 rounded-2xl border border-slate-200/60 bg-slate-50/50 flex flex-col items-center text-center opacity-55">
                    <div class="font-bold text-slate-400 text-xs mb-3 border-b border-slate-100 pb-2.5 w-full">${displayDay}</div>
                    <i class="fas fa-history text-slate-300 text-xl my-2"></i>
                    <div class="text-[11px] font-medium text-slate-400 mt-1">Waktu Berlalu</div>
                </div>
            `;
            continue;
        }

        // 3. Cek apakah bentrok (overlap) dengan jam murid lain di hari tersebut
        let clashingTime = null;
        for (let s of window.HES.students) {
            if (s.email === email) continue;
            if (isOccupied(s.email, currStr)) {
                let otherP = window.HES.materials[`profile-${s.email}`];
                if (otherP && checkOverlap(p.time, otherP.time)) {
                    clashingTime = otherP.time;
                    break;
                }
            }
        }

        if (clashingTime) {
            gridHTML += `
                <div class="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col text-center shadow-2xs">
                    <div class="font-bold text-slate-700 text-xs mb-3 border-b border-slate-100 pb-2.5">${displayDay}</div>
                    <div class="flex-1 flex flex-col justify-center items-center my-2">
                        <i class="fas fa-user-lock text-slate-300 text-xl mb-1.5"></i>
                        <span class="text-[11px] font-semibold text-slate-400">Slot Terisi</span>
                    </div>
                    <button disabled class="w-full py-2 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-400 cursor-not-allowed mt-2">Tidak Tersedia</button>
                </div>
            `;
        } else {
            if (isPendingOld) {
                gridHTML += `
                    <div class="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col text-center opacity-50">
                        <div class="font-bold text-slate-500 text-xs mb-3 border-b border-slate-100 pb-2.5">${displayDay}</div>
                        <div class="text-[11px] font-medium text-slate-400 py-5">Menunggu Validasi</div>
                    </div>
                `;
            } else {
                gridHTML += `
                    <div class="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col text-center shadow-sm hover-card hover:border-indigo-300 group">
                        <div class="font-bold text-slate-800 text-xs mb-3 border-b border-slate-100 pb-2.5">${displayDay}</div>
                        <div class="flex-1 flex flex-col justify-center items-center my-2">
                            <i class="far fa-check-circle text-emerald-500 text-2xl mb-1.5 group-hover:scale-110 transition-transform"></i>
                            <span class="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-wide">Available</span>
                        </div>
                        <button onclick="processReschedule('${currStr}')" class="w-full py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs mt-2">
                            Pilih Hari Ini
                        </button>
                    </div>
                `;
            }
        }
    }

    gridContainer.innerHTML = gridHTML;
};

window.processReschedule = async function(newDateStr) {
    const oldDateStr = document.getElementById('reschedule-old-day').value;
    if (!oldDateStr) {
        showToast('Silakan pilih jadwal awal terlebih dahulu.', 'error');
        return;
    }

    const oldDisplay = getDisplayDate(parseDateStr(oldDateStr));
    const newDisplay = getDisplayDate(parseDateStr(newDateStr));

    if (confirm(`Konfirmasi Pengajuan Pindah Jadwal:\n\nJadwal Asal : ${oldDisplay}\nJadwal Baru : ${newDisplay}\n\nKirim pengajuan ke Admin?`)) {
        const email = window.HES.currentUser.email;
        let p = window.HES.materials[`profile-${email}`];
        if (!p.pendingReschedules) p.pendingReschedules = {};
        p.pendingReschedules[oldDateStr] = newDateStr;

        document.body.style.cursor = 'wait';
        const { error } = await saveToCloud('hes_materials', window.HES.materials);
        document.body.style.cursor = 'default';

        if (error) {
            delete p.pendingReschedules[oldDateStr];
            showToast('Gagal memproses permintaan: ' + error.message, 'error');
        } else {
            showToast('Pengajuan berhasil dikirim! Menunggu konfirmasi Admin.', 'success');
            sendTelegramNotification(`📅 *Permintaan Reschedule*\n\nMurid: ${window.HES.currentUser.name}\nAsal: ${oldDisplay}\nBaru: ${newDisplay}`);
            renderReschedulePage();
        }
    }
};