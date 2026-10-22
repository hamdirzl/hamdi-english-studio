// js/exam.js

let studentExamAnswers = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    const p = new URLSearchParams(window.location.search);
    currentExamSession = p.get('month') || 'm1';
    currentStudentExamTab = p.get('tab') || 'reading';

    initLayout('Ujian & Rapor');
    setupExamMonthSelector();
    renderStudentExamPage();

    await syncFromCloud();
    renderAppSidebar();
    setupExamMonthSelector();
    renderStudentExamPage();
});

function setupExamMonthSelector() {
    const sel = document.getElementById('exam-month-selector');
    if (!sel) return;
    const isStu = window.HES.userRole === 'student';
    const maxM = isStu ? parseInt(window.HES.materials[`profile-${window.HES.currentUser.email}`]?.maxMonth || 1) : 99;

    if (isStu && parseInt(currentExamSession.replace('m', '')) > maxM) currentExamSession = 'm1';

    sel.innerHTML = window.HES.months.map(m => {
        const locked = isStu && parseInt(m.id.replace('m', '')) > maxM;
        return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title}${locked ? ' (Terkunci)' : ''}</option>`;
    }).join('');
    sel.value = currentExamSession;
    sel.onchange = () => window.location.href = `exam.html?month=${sel.value}&tab=reading`;
}

window.switchStudentExamTab = function(tab) {
    currentStudentExamTab = tab;
    renderStudentExamPage();
};

function renderStudentExamPage() {
    const monthId = currentExamSession;
    const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
    const email = window.HES.currentUser.email;
    const studentName = window.HES.currentUser.name || 'Siswa';

    document.getElementById('exam-header-title').innerText = `Evaluasi Akhir: ${monthObj.title}`;
    const reportBox = document.getElementById('exam-final-report-box');
    const tabsNav = document.getElementById('exam-tabs-nav');
    const content = document.getElementById('exam-content-area');

    if (window.HES.userRole === 'admin') {
        reportBox.classList.add('hidden'); tabsNav.classList.add('hidden');
        content.innerHTML = `
            <div class="hes-card flex flex-col sm:flex-row items-center justify-between gap-4 border border-indigo-100">
                <div>
                    <h4 class="font-extrabold text-slate-800 text-base"><i class="fas fa-shield-alt text-indigo-500 mr-1.5"></i> Mode Administrator</h4>
                    <p class="text-xs text-slate-500 mt-1">Kelola soal ujian dan nilai jawaban murid melalui Panel Admin.</p>
                </div>
                <a href="admin.html?tab=exam" class="hes-btn-primary shrink-0"><i class="fas fa-sliders-h"></i> Buka Builder Ujian</a>
            </div>`;
        return;
    }

    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    const examResult = window.HES.materials[`exam_result-${email}-${monthId}`];

    if (!examData) {
        reportBox.classList.add('hidden'); tabsNav.classList.add('hidden');
        content.innerHTML = `<div class="hes-card text-center py-12 text-slate-400 font-bold text-sm border-dashed">Soal ujian untuk ${monthObj.title} belum diterbitkan oleh Admin.</div>`;
        return;
    }

    tabsNav.classList.remove('hidden');
    const cat = currentStudentExamTab;
    const icons = { reading: 'fa-book-open', writing: 'fa-pen-nib', speaking: 'fa-microphone-lines', listening: 'fa-headphones' };

    ['reading', 'writing', 'speaking', 'listening'].forEach(t => {
        const btn = document.getElementById(`stu-tab-${t}`);
        const isDone = examResult?.submittedTabs?.includes(t) || examResult?.status === 'submitted';
        btn.innerHTML = `<i class="fas ${icons[t]} mr-1.5"></i> <span class="capitalize">${t}</span> ${isDone ? '<i class="fas fa-check-circle text-emerald-500 ml-1.5"></i>' : ''}`;
        btn.className = `py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center ${t === cat ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`;
    });

    // Rapor Hasil Akhir Profesional
    if (examResult?.isGraded) {
        const sc = examResult.sectionScores || {};
        const avgScore = Math.round(((sc.reading ?? 0) + (sc.writing ?? 0) + (sc.speaking ?? 0) + (sc.listening ?? 0)) / 4);
        let gradeLetter = 'D', gradeColor = 'text-red-600';
        if (avgScore >= 90) { gradeLetter = 'A'; gradeColor = 'text-emerald-600'; }
        else if (avgScore >= 80) { gradeLetter = 'B'; gradeColor = 'text-indigo-600'; }
        else if (avgScore >= 70) { gradeLetter = 'C'; gradeColor = 'text-amber-500'; }

        // Format Penomoran Otomatis: HES/REP/TAHUN/BULAN/NAMA
        const docDate = new Date();
        const docNumber = `HES/REP/${docDate.getFullYear()}/${monthObj.id.toUpperCase()}/${studentName.substring(0, 3).toUpperCase()}${email.length}`;

        reportBox.classList.remove('hidden');
        reportBox.innerHTML = `
            <div class="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                <!-- Elemen Desain Latar -->
                <div class="absolute -right-16 -top-16 text-[150px] text-slate-50 opacity-50 pointer-events-none"><i class="fas fa-award"></i></div>
                
                <div class="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-200 pb-5 mb-5 relative z-10">
                    <div>
                        <h2 class="text-xl font-black text-slate-800 tracking-tight">OFFICIAL EVALUATION REPORT</h2>
                        <p class="text-xs font-bold text-indigo-600 mt-0.5">Hamdi English Studio</p>
                    </div>
                    <div class="mt-3 sm:mt-0 text-left sm:text-right">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document No.</p>
                        <p class="text-xs font-mono font-bold text-slate-700">${docNumber}</p>
                        <span class="inline-block mt-2 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase border border-emerald-200">
                            <i class="fas fa-check-circle mr-1"></i> Verified
                        </span>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div>
                        <table class="w-full text-xs text-left">
                            <tbody>
                                <tr><td class="py-1.5 font-bold text-slate-500 w-28">Nama Lengkap</td><td class="py-1.5 font-black text-slate-800">: ${studentName}</td></tr>
                                <tr><td class="py-1.5 font-bold text-slate-500">Email</td><td class="py-1.5 font-bold text-slate-800">: ${email}</td></tr>
                                <tr><td class="py-1.5 font-bold text-slate-500">Program Modul</td><td class="py-1.5 font-bold text-slate-800">: ${monthObj.title}</td></tr>
                                <tr><td class="py-1.5 font-bold text-slate-500">Tanggal Rapor</td><td class="py-1.5 font-bold text-slate-800">: ${getDisplayDate(docDate)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div class="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                            <span class="text-2xl font-black ${gradeColor}">${gradeLetter}</span>
                        </div>
                        <div>
                            <p class="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Final Average</p>
                            <p class="text-2xl font-black text-slate-800 leading-none mt-1">${avgScore} <span class="text-sm font-bold text-slate-400">/ 100</span></p>
                        </div>
                    </div>
                </div>

                <div class="mt-6 border border-slate-200 rounded-xl overflow-hidden relative z-10">
                    <table class="w-full text-center text-xs">
                        <thead class="bg-slate-50 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                            <tr>
                                <th class="p-3 border-r border-slate-200 w-1/4">Reading</th>
                                <th class="p-3 border-r border-slate-200 w-1/4">Writing</th>
                                <th class="p-3 border-r border-slate-200 w-1/4">Speaking</th>
                                <th class="p-3 w-1/4">Listening</th>
                            </tr>
                        </thead>
                        <tbody class="font-black text-slate-800 text-lg">
                            <tr>
                                <td class="p-3 border-r border-slate-200">${sc.reading ?? 0}</td>
                                <td class="p-3 border-r border-slate-200">${sc.writing ?? 0}</td>
                                <td class="p-3 border-r border-slate-200">${sc.speaking ?? 0}</td>
                                <td class="p-3">${sc.listening ?? 0}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="mt-5 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl relative z-10">
                    <p class="text-[11px] font-extrabold text-indigo-500 uppercase tracking-wider mb-1.5"><i class="fas fa-comment-alt mr-1"></i> Instructor's Note</p>
                    <p class="text-xs sm:text-sm font-bold text-slate-700 italic">"${examResult.adminFeedback || 'Kerja bagus! Terus pertahankan semangat belajarmu.'}"</p>
                </div>

                <!-- Bagian Tanda Tangan Digital -->
                <div class="mt-8 flex justify-end relative z-10">
                    <div class="text-center w-48">
                        <p class="text-xs font-bold text-slate-500">Medan, ${getDisplayDate(docDate)}</p>
                        <!-- Pastikan Anda menyimpan file tanda tangan Anda di folder assets atau root dengan nama signature.png -->
                        <img src="signature.png" alt="Tanda Tangan" class="h-16 mx-auto my-2 object-contain" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'h-16 flex items-center justify-center italic text-xs text-slate-300\\'>[Signature Placeholder]</div>');">
                        <p class="text-sm font-black text-slate-800 border-b-2 border-slate-800 inline-block px-2 pb-0.5 mt-1">Bro Hamdi</p>
                        <p class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-1.5">Lead Instructor</p>
                    </div>
                </div>
            </div>`;
    } else {
        reportBox.classList.add('hidden');
    }

    const questions = examData[cat] || [];
    if (!questions.length) {
        content.innerHTML = `<div class="hes-card text-center py-10 text-xs font-bold text-slate-400">Tidak ada soal pada bagian ${cat.toUpperCase()}.</div>`;
        return;
    }

    const isSubmitted = examResult?.submittedTabs?.includes(cat) || (examResult?.status === 'submitted' && !examResult?.submittedTabs?.length);

    if (isSubmitted) {
        content.innerHTML = `
            <div class="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex justify-between items-center">
                <span><i class="fas fa-check-circle mr-1.5"></i> Bagian ${cat.toUpperCase()} sudah kamu kumpulkan.</span>
                <span class="opacity-70"><i class="fas fa-lock"></i> Terkunci</span>
            </div>
            <div class="space-y-4">
                ${questions.map((q, idx) => {
                    const sAns = examResult.answers?.[`${cat}_${idx}`] ?? '';
                    const isMCQ = q.type === 'mcq';
                    const isCorrect = isMCQ ? (sAns !== '' && sAns == q.answer) : true;
                    let dispAns = isMCQ && sAns !== '' ? q.options[sAns] : (sAns || 'Tidak dijawab');
                    if (!isMCQ && String(sAns).startsWith('data:audio')) dispAns = `<audio controls class="w-full h-9 mt-1 outline-none" src="${sAns}"></audio>`;
                    return `
                        <div class="hes-card">
                            <p class="text-xs font-extrabold text-slate-400 mb-1">Soal #${idx + 1}</p>
                            <p class="text-sm font-bold text-slate-800 mb-3">${q.question.replace(/\n/g, '<br>')}</p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div class="p-3 rounded-lg bg-slate-50 border border-slate-100"><strong>Jawabanmu:</strong><div class="mt-1 font-bold ${isMCQ ? (isCorrect ? 'text-emerald-600' : 'text-red-600') : 'text-slate-700'}">${dispAns}</div></div>
                                <div class="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100"><strong>Kunci / Kriteria:</strong><div class="mt-1 font-bold text-indigo-700">${isMCQ ? q.options[q.answer] : (q.answer || 'Dinilai Admin')}</div></div>
                            </div>
                            ${q.explanation ? `<p class="mt-3 p-3 rounded-lg bg-amber-50 text-amber-900 text-xs border border-amber-100"><strong><i class="fas fa-lightbulb text-amber-500 mr-1"></i> Pembahasan:</strong> ${q.explanation}</p>` : ''}
                        </div>`;
                }).join('')}
            </div>`;
        return;
    }

    content.innerHTML = `
        <div class="space-y-4">
            ${questions.map((q, idx) => {
                const isMCQ = q.type === 'mcq';
                const saved = studentExamAnswers[`${cat}_${idx}`] ?? '';
                const key = `${cat}_${idx}`;
                const sisa = 2 - (audioPlayCounts[key] || 0);

                const mediaHTML = q.mediaUrl ? (sisa > 0 ? `
                    <div class="my-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                        <audio controls class="w-full h-10 outline-none" onplay="if((audioPlayCounts['${key}']||0)>=2){this.pause();this.removeAttribute('controls');}" onended="onAudioEnded(this, '${key}')">
                            <source src="${getDriveDirectStreamLink(q.mediaUrl)}">
                        </audio>
                        <p id="audio-warn-${key}" class="text-xs font-bold text-amber-600 mt-1.5"><i class="fas fa-exclamation-circle mr-1"></i> Sisa kesempatan putar audio: <span id="audio-sisa-${key}">${sisa}</span>x</p>
                    </div>` : `<p class="my-3 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-200"><i class="fas fa-times-circle mr-1"></i> Batas putar audio (2x) telah habis.</p>`) : '';

                let inputHTML = '';
                if (isMCQ) {
                    inputHTML = ['A', 'B', 'C', 'D'].map((lbl, oIdx) => `
                        <label class="flex items-center gap-3 p-3.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-indigo-50/40 hover:border-indigo-300 transition mb-2">
                            <input type="radio" name="ans_${key}" value="${oIdx}" ${saved !== '' && saved == oIdx ? 'checked' : ''} onchange="studentExamAnswers['${key}']=${oIdx}" class="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500">
                            <span class="text-xs sm:text-sm font-semibold text-slate-700"><strong>${lbl}.</strong> ${q.options[oIdx]}</span>
                        </label>`).join('');
                } else if (cat === 'speaking') {
                    const hasAud = String(saved).startsWith('data:audio');
                    inputHTML = `
                        <div class="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 mt-2">
                            <div class="flex flex-wrap items-center gap-3">
                                <button type="button" id="btn-record-${idx}" onclick="startVoiceRecord(${idx})" class="hes-btn-primary !py-2.5 !px-4 !text-xs">
                                    <i class="fas fa-microphone"></i> ${hasAud ? 'Rekam Ulang' : 'Mulai Rekam Suara'}
                                </button>
                                <button type="button" id="btn-stop-${idx}" onclick="stopVoiceRecord(${idx})" class="hidden bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold shadow-sm transition animate-pulse">
                                    <i class="fas fa-stop mr-1"></i> Hentikan Rekaman
                                </button>
                                <audio id="audio-playback-${idx}" controls src="${hasAud ? saved : ''}" class="${hasAud ? '' : 'hidden'} h-9 w-full max-w-xs outline-none"></audio>
                            </div>
                        </div>`;
                } else {
                    inputHTML = `<textarea oninput="studentExamAnswers['${key}']=this.value" rows="4" class="hes-input mt-2" placeholder="Ketik jawabanmu secara detail di sini...">${saved}</textarea>`;
                }

                return `
                    <div class="hes-card">
                        <span class="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">Soal #${idx + 1}</span>
                        <p class="font-bold text-slate-800 text-sm mt-3 leading-relaxed">${q.question.replace(/\n/g, '<br>')}</p>${mediaHTML}
                        <div class="mt-4">${inputHTML}</div>
                    </div>`;
            }).join('')}
        </div>
        <div class="hes-card !bg-indigo-600 text-white text-center mt-6 border-none shadow-md">
            <h4 class="font-extrabold text-base mb-1">Selesai Mengerjakan Bagian ${cat.toUpperCase()}?</h4>
            <p class="text-xs text-indigo-100 mb-5">Periksa kembali jawabanmu sebelum diserahkan untuk dinilai.</p>
            <button onclick="submitStudentExam('${monthId}', '${cat}')" class="bg-white text-indigo-700 hover:bg-indigo-50 px-6 py-3 rounded-xl text-sm font-extrabold shadow-sm transition inline-flex items-center gap-2">
                <i class="fas fa-paper-plane"></i> Kumpulkan Bagian ${cat.toUpperCase()}
            </button>
        </div>`;
}

window.onAudioEnded = function(el, key) {
    audioPlayCounts[key] = (audioPlayCounts[key] || 0) + 1;
    const sisa = 2 - audioPlayCounts[key];
    const span = document.getElementById(`audio-sisa-${key}`);
    if (span) span.innerText = sisa;
    if (sisa <= 0) {
        el.removeAttribute('controls');
        const warn = document.getElementById(`audio-warn-${key}`);
        if (warn) { warn.innerHTML = '<i class="fas fa-times-circle mr-1"></i> Batas pemutaran audio (2x) telah habis.'; warn.className = 'text-xs font-bold text-red-600 mt-1.5'; }
    }
};

window.startVoiceRecord = async function(qIndex) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                studentExamAnswers[`speaking_${qIndex}`] = reader.result;
                showToast('Rekaman suara berhasil disimpan!', 'info');
            };
            const pb = document.getElementById(`audio-playback-${qIndex}`);
            if (pb) { pb.src = URL.createObjectURL(blob); pb.classList.remove('hidden'); }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        document.getElementById(`btn-record-${qIndex}`).classList.add('hidden');
        document.getElementById(`btn-stop-${qIndex}`).classList.remove('hidden');
    } catch (e) {
        showToast('Aktifkan izin mikrofon di browser kamu ya.', 'error');
    }
};

window.stopVoiceRecord = function(qIndex) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById(`btn-stop-${qIndex}`).classList.add('hidden');
        const btn = document.getElementById(`btn-record-${qIndex}`);
        btn.classList.remove('hidden');
        btn.innerHTML = '<i class="fas fa-redo mr-1.5"></i> Rekam Ulang';
    }
};

window.submitStudentExam = async function(monthId, tab) {
    if (!confirm(`Kumpulkan jawaban bagian ${tab.toUpperCase()} sekarang?`)) return;
    await syncFromCloud();
    const email = window.HES.currentUser.email;
    const examData = window.HES.materials[`exam-${email}-${monthId}`];
    const rKey = `exam_result-${email}-${monthId}`;
    const res = window.HES.materials[rKey] || { status: 'partial', answers: {}, scores: {}, sectionScores: {}, submittedTabs: [] };

    res.answers = res.answers || {};
    res.sectionScores = res.sectionScores || {};
    res.submittedTabs = res.submittedTabs || [];

    (examData?.[tab] || []).forEach((_, idx) => {
        const ans = studentExamAnswers[`${tab}_${idx}`];
        if (ans !== undefined) res.answers[`${tab}_${idx}`] = ans;
    });

    ['reading', 'writing', 'speaking', 'listening'].forEach(c => {
        res.sectionScores[c] = calculateCategoryScore(c, examData, res);
    });
    if (!res.submittedTabs.includes(tab)) res.submittedTabs.push(tab);

    window.HES.materials[rKey] = res;
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    if (!error) {
        showToast(`Bagian ${tab.toUpperCase()} berhasil dikumpulkan!`, 'success');
        sendTelegramNotification(`📝 *Ujian Disubmit (${tab.toUpperCase()})*\nMurid: ${window.HES.currentUser.name}\nSkor: ${res.sectionScores[tab]}/100`);
        renderStudentExamPage();
    } else showToast('Gagal menyimpan: ' + error.message, 'error');
};