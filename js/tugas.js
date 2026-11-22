// js/tugas.js

let currentTaskFilter = 'all';
let taskRecState = {
    activeTaskId: null,
    recorder: null,
    chunks: [],
    timerInterval: null,
    seconds: 0,
    draftAudios: {}
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    initLayout('Tugas Speaking');
    renderTasksPage();

    await syncFromCloud();
    renderAppSidebar();
    renderTasksPage();
});

window.setTaskFilter = function(flt) {
    currentTaskFilter = flt;
    renderTasksPage();
};

function getSupportedTaskAudioMime() {
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) || '';
}

function formatRecTimer(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function escapeTaskHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTasksPage() {
    const user = window.HES.currentUser;
    const role = window.HES.userRole;
    const listBox = document.getElementById('tasks-list-container');
    const pill = document.getElementById('tasks-summary-pill');
    const filterBar = document.getElementById('tasks-filter-bar');

    if (role === 'admin') {
        filterBar?.classList.add('hidden');
        const allTasks = getAllSpeakingTasks();
        if (pill) pill.innerHTML = `<i class="fas fa-list-check mr-1"></i> ${allTasks.length} Tugas Aktif`;

        listBox.innerHTML = `
            <div class="hes-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-teal-200 bg-teal-50/40">
                <div>
                    <h3 class="text-base font-extrabold text-stone-800"><i class="fas fa-sliders-h text-teal-700 mr-1.5"></i> Mode Administrator</h3>
                    <p class="text-xs font-semibold text-stone-600 mt-1">Buat soal conversation baru, dengarkan rekaman murid, dan berikan nilai/feedback melalui Panel Admin.</p>
                </div>
                <a href="admin.html?tab=tasks" class="hes-btn-primary shrink-0"><i class="fas fa-plus"></i> Kelola Tugas di Panel Admin</a>
            </div>
            ${allTasks.length ? allTasks.map(t => `
                <div class="hes-card space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-extrabold">${(t.monthId || 'Umum').toUpperCase()}</span>
                        <span class="text-xs font-bold text-stone-400">Target: ${t.target === 'all' ? 'Semua Murid' : t.target}</span>
                    </div>
                    <h4 class="text-base font-extrabold text-stone-800">${escapeTaskHtml(t.title)}</h4>
                    <p class="text-xs sm:text-sm font-semibold text-stone-600 whitespace-pre-line">${escapeTaskHtml(t.instruction)}</p>
                </div>`).join('') : `<div class="hes-card text-center py-10 text-sm font-bold text-stone-400">Belum ada tugas conversation yang dibuat.</div>`}`;
        return;
    }

    // Mode Murid
    const myTasks = getTasksForStudent(user.email);
    const doneCount = myTasks.filter(t => getTaskSubmission(user.email, t.id)?.audioData).length;
    const todoCount = myTasks.length - doneCount;

    if (pill) pill.innerHTML = `<i class="fas fa-check-circle mr-1"></i> ${doneCount} / ${myTasks.length} Selesai`;
    filterBar?.classList.remove('hidden');

    [
        ['all',  `Semua (${myTasks.length})`],
        ['todo', `Belum Dikerjakan (${todoCount})`],
        ['done', `Sudah Dikirim (${doneCount})`]
    ].forEach(([id, lbl]) => {
        const btn = document.getElementById(`task-flt-${id}`);
        if (!btn) return;
        const active = currentTaskFilter === id;
        btn.innerText = lbl;
        btn.className = `px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${active ? 'bg-teal-700 text-white shadow-xs' : 'bg-white text-stone-600 border border-stone-200 hover:border-teal-300'}`;
    });

    const filtered = myTasks.filter(t => {
        const hasSub = Boolean(getTaskSubmission(user.email, t.id)?.audioData);
        if (currentTaskFilter === 'todo') return !hasSub;
        if (currentTaskFilter === 'done') return hasSub;
        return true;
    });

    if (!filtered.length) {
        listBox.innerHTML = `
            <div class="hes-card text-center py-14 space-y-2 border-dashed">
                <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto text-xl"><i class="fas fa-microphone-lines"></i></div>
                <p class="text-sm font-extrabold text-stone-600">${myTasks.length ? 'Tidak ada tugas di kategori filter ini.' : 'Belum ada tugas conversation dari tutor saat ini.'}</p>
            </div>`;
        return;
    }

    listBox.innerHTML = filtered.map((t, idx) => {
        const sub = getTaskSubmission(user.email, t.id);
        const draft = taskRecState.draftAudios[t.id] || '';
        const isGraded = sub?.status === 'graded';
        const isSubmitted = Boolean(sub?.audioData);
        const monthTitle = window.HES.months.find(m => m.id === t.monthId)?.title || (t.monthId || 'Practice');

        let statusBadge = `<span class="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-extrabold"><i class="fas fa-circle-dot mr-1"></i> Belum Dikerjakan</span>`;
        if (isGraded) statusBadge = `<span class="px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-[11px] font-extrabold"><i class="fas fa-award mr-1"></i> Dinilai: ${sub.score}/100</span>`;
        else if (isSubmitted) statusBadge = `<span class="px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-[11px] font-extrabold"><i class="fas fa-hourglass-half mr-1"></i> Terkirim • Menunggu Penilaian</span>`;

        const safeSample = escapeTaskHtml(t.sample || '');

        return `
            <div class="hes-card space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="w-7 h-7 rounded-xl bg-teal-700 text-white text-xs font-black flex items-center justify-center">${idx + 1}</span>
                        <span class="px-2.5 py-0.5 rounded-lg bg-stone-100 text-stone-600 text-[11px] font-extrabold">${monthTitle}</span>
                    </div>
                    ${statusBadge}
                </div>

                <div>
                    <h3 class="text-base sm:text-lg font-extrabold text-stone-900">${escapeTaskHtml(t.title)}</h3>
                    <div class="mt-2 p-4 rounded-2xl bg-amber-50/55 border border-amber-200/70">
                        <p class="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 mb-1"><i class="fas fa-comment-dots mr-1"></i> Instruksi Conversation</p>
                        <p class="text-sm font-semibold text-stone-800 leading-relaxed whitespace-pre-line">${escapeTaskHtml(t.instruction)}</p>
                    </div>
                </div>

                ${t.sample ? `
                    <div class="p-4 rounded-2xl bg-teal-50/50 border border-teal-200/70 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div class="space-y-1 flex-1">
                            <p class="text-[11px] font-extrabold uppercase tracking-wider text-teal-700"><i class="fas fa-lightbulb mr-1"></i> Contoh / Panduan Kalimat</p>
                            <p class="text-sm font-bold text-stone-700 leading-relaxed whitespace-pre-line italic">"${safeSample}"</p>
                        </div>
                        <button type="button" onclick="playTaskSampleAudio('${t.id}', this)" class="px-3.5 py-2 rounded-xl bg-white hover:bg-teal-700 text-teal-700 hover:text-white border border-teal-200 text-xs font-extrabold transition shrink-0 cursor-pointer">
                            <i class="fas fa-volume-up mr-1"></i> Dengar Contoh
                        </button>
                    </div>` : ''}

                ${isSubmitted ? `
                    <div class="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-extrabold text-stone-700"><i class="fas fa-headphones text-teal-600 mr-1.5"></i> Rekaman Suaramu yang Terkirim</p>
                            ${sub.submittedAt ? `<span class="text-[11px] font-bold text-stone-400">${getDisplayDate(new Date(sub.submittedAt))}</span>` : ''}
                        </div>
                        <audio controls preload="metadata" src="${sub.audioData}" class="w-full h-10 rounded-xl outline-none"></audio>

                        ${isGraded ? `
                            <div class="p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 space-y-1.5">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-extrabold text-teal-800"><i class="fas fa-user-check mr-1"></i> Feedback dari Tutor</span>
                                    <span class="px-3 py-0.5 rounded-full bg-teal-700 text-white text-xs font-black">Skor: ${sub.score} / 100</span>
                                </div>
                                <p class="text-sm font-bold text-stone-800 leading-relaxed whitespace-pre-line">${escapeTaskHtml(sub.feedback || 'Great job practicing your English speaking!')}</p>
                            </div>` : `
                            <p class="text-xs font-bold text-sky-700"><i class="fas fa-info-circle mr-1"></i> Rekamanmu sudah masuk ke Panel Admin dan menunggu koreksi tutor.</p>`}
                    </div>
                ` : `
                    <div class="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-3.5">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="flex flex-wrap items-center gap-2.5">
                                <button type="button" id="task-rec-start-${t.id}" onclick="startTaskRecording('${t.id}')" class="hes-btn-warm !py-2.5 !px-4 !text-xs">
                                    <i class="fas fa-microphone"></i> ${draft ? 'Rekam Ulang' : 'Mulai Rekam Suara'}
                                </button>
                                <button type="button" id="task-rec-stop-${t.id}" onclick="stopTaskRecording('${t.id}')" class="hidden bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm animate-pulse cursor-pointer">
                                    <i class="fas fa-stop mr-1"></i> Selesai Rekam (<span id="task-rec-timer-${t.id}">00:00</span>)
                                </button>
                            </div>
                            <span id="task-rec-status-${t.id}" class="text-xs font-extrabold ${draft ? 'text-teal-700 bg-teal-100 px-3 py-1 rounded-full' : 'text-stone-400'}">
                                ${draft ? '✓ Rekaman Siap Dikirim' : 'Klik tombol untuk mulai bicara'}
                            </span>
                        </div>

                        <audio id="task-rec-player-${t.id}" controls preload="metadata" src="${draft}" class="${draft ? '' : 'hidden'} w-full h-10 rounded-xl outline-none"></audio>

                        <div id="task-submit-wrap-${t.id}" class="${draft ? '' : 'hidden'} pt-2 border-t border-stone-200/80 flex justify-end">
                            <button type="button" id="task-submit-btn-${t.id}" onclick="submitSpeakingTask('${t.id}')" class="hes-btn-primary !py-2.5 !px-5 !text-xs">
                                <i class="fas fa-paper-plane"></i> Kirim Rekaman ke Tutor (+20 XP)
                            </button>
                        </div>
                    </div>
                `}
            </div>`;
    }).join('');
}

window.playTaskSampleAudio = function(taskId, btnEl) {
    const task = getAllSpeakingTasks().find(t => t.id === taskId);
    if (task?.sample) window.playNaturalEnglishTTS(task.sample, btnEl);
};

window.startTaskRecording = async function(taskId) {
    window.stopNaturalEnglishTTS();
    try {
        if (taskRecState.recorder && taskRecState.recorder.state !== 'inactive') {
            await stopTaskRecording(taskRecState.activeTaskId);
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getSupportedTaskAudioMime();
        const rec = new MediaRecorder(stream, mimeType ? { audioBitsPerSecond: 24000, mimeType } : { audioBitsPerSecond: 24000 });

        taskRecState.activeTaskId = taskId;
        taskRecState.recorder = rec;
        taskRecState.chunks = [];
        taskRecState.seconds = 0;

        rec.ondataavailable = e => { if (e.data?.size > 0) taskRecState.chunks.push(e.data); };
        rec.onstop = () => {
            clearInterval(taskRecState.timerInterval);
            stream.getTracks().forEach(tr => tr.stop());
            const blob = new Blob(taskRecState.chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                taskRecState.draftAudios[taskId] = reader.result;
                const player = document.getElementById(`task-rec-player-${taskId}`);
                if (player) { player.src = reader.result; player.classList.remove('hidden'); }
                const st = document.getElementById(`task-rec-status-${taskId}`);
                if (st) { st.className = 'text-xs font-extrabold text-teal-700 bg-teal-100 px-3 py-1 rounded-full'; st.innerText = '✓ Rekaman Siap Dikirim'; }
                document.getElementById(`task-submit-wrap-${taskId}`)?.classList.remove('hidden');
                showToast('Rekaman selesai! Dengarkan dulu, lalu klik Kirim ke Tutor.', 'success');
            };
            reader.readAsDataURL(blob);
        };

        rec.start(250);
        document.getElementById(`task-rec-start-${taskId}`)?.classList.add('hidden');
        document.getElementById(`task-rec-stop-${taskId}`)?.classList.remove('hidden');
        const st = document.getElementById(`task-rec-status-${taskId}`);
        if (st) { st.className = 'text-xs font-extrabold text-rose-600 animate-pulse'; st.innerText = '● Sedang Merekam...'; }

        taskRecState.timerInterval = setInterval(() => {
            taskRecState.seconds++;
            const tEl = document.getElementById(`task-rec-timer-${taskId}`);
            if (tEl) tEl.innerText = formatRecTimer(taskRecState.seconds);
            if (taskRecState.seconds >= 180) {
                showToast('Batas maksimal rekaman 3 menit tercapai.', 'info');
                stopTaskRecording(taskId);
            }
        }, 1000);
    } catch (err) {
        showToast('Aktifkan izin mikrofon di browser kamu terlebih dahulu ya.', 'error');
    }
};

window.stopTaskRecording = function(taskId) {
    return new Promise(resolve => {
        clearInterval(taskRecState.timerInterval);
        const rec = taskRecState.recorder;
        if (rec && rec.state !== 'inactive') {
            rec.addEventListener('stop', () => resolve(), { once: true });
            rec.stop();
        } else {
            resolve();
        }
        document.getElementById(`task-rec-stop-${taskId}`)?.classList.add('hidden');
        const btn = document.getElementById(`task-rec-start-${taskId}`);
        if (btn) { btn.classList.remove('hidden'); btn.innerHTML = '<i class="fas fa-redo"></i> Rekam Ulang'; }
    });
};

window.submitSpeakingTask = async function(taskId) {
    const audioData = taskRecState.draftAudios[taskId];
    if (!audioData) return showToast('Rekam suaramu terlebih dahulu!', 'error');
    if (!confirm('Kirim rekaman suara ini ke Tutor?')) return;

    const btn = document.getElementById(`task-submit-btn-${taskId}`);
    const orig = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mengirim...'; }

    const email = window.HES.currentUser.email;
    const task = getAllSpeakingTasks().find(t => t.id === taskId);

    const { error } = await safeSaveMaterialsToCloud(materials => {
        materials[`task_sub-${email}-${taskId}`] = {
            audioData,
            status: 'submitted',
            score: null,
            feedback: '',
            submittedAt: new Date().toISOString()
        };
    });

    if (!error) {
        delete taskRecState.draftAudios[taskId];
        showToast('Tugas Speaking berhasil dikirim! +20 XP', 'success');
        sendTelegramNotification(`🎙️ *Tugas Conversation Masuk*\nMurid: ${window.HES.currentUser.name}\nTugas: ${task?.title || taskId}`);
        renderAppSidebar();
        renderTasksPage();
    } else {
        showToast('Gagal mengirim rekaman: ' + error.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
};