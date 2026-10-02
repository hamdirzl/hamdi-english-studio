// js/exam.js

let studentExamAnswers = {};
let currentExamSession = null;
let currentStudentExamTab = 'reading';
let audioPlayCounts = {};
let mediaRecorder = null;
let audioChunks = [];

document.addEventListener('DOMContentLoaded', async () => {
    const session = requireAuth();
    if (!session) return;

    parseExamQueryParams();
    initLayout('Evaluasi & Ujian Akhir');
    setupExamMonthSelector();
    renderStudentExamPage();

    await syncFromCloud();
    renderAppSidebar();
    setupExamMonthSelector();
    renderStudentExamPage();
});

function parseExamQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('month') || 'm1';
    const tab = params.get('tab') || 'reading';

    if (currentExamSession !== m) {
        studentExamAnswers = {};
        audioPlayCounts = {};
        currentExamSession = m;
    }
    currentStudentExamTab = tab;
}

function setupExamMonthSelector() {
    const selector = document.getElementById('exam-month-selector');
    if (!selector) return;

    const role = window.HES.userRole;
    const user = window.HES.currentUser;
    let maxMonthNum = 99;
    if (role === 'student') {
        let p = window.HES.materials[`profile-${user.email}`];
        maxMonthNum = (p && p.maxMonth) ? parseInt(p.maxMonth) : 1;
    }

    const reqMonthNum = parseInt(currentExamSession.replace('m', ''));
    if (role === 'student' && reqMonthNum > maxMonthNum) {
        currentExamSession = 'm1';
        showToast('Ujian bulan tersebut masih terkunci.', 'info');
    }

    selector.innerHTML = window.HES.months.map(m => {
        const mNum = parseInt(m.id.replace('m', ''));
        const locked = role === 'student' && mNum > maxMonthNum;
        return `<option value="${m.id}" ${locked ? 'disabled' : ''}>${m.title} ${locked ? '(Terkunci)' : ''}</option>`;
    }).join('');

    selector.value = currentExamSession;
    selector.onchange = () => {
        window.location.href = `exam.html?month=${selector.value}&tab=reading`;
    };
}

window.switchStudentExamTab = function(tabName) {
    currentStudentExamTab = tabName;
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);
    renderStudentExamPage();
};

function renderStudentExamPage() {
    const monthId = currentExamSession;
    const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
    const email = window.HES.currentUser.email;

    document.getElementById('exam-header-title').innerText = `Final Exam: ${monthObj.title}`;

    const reportBox = document.getElementById('exam-final-report-box');
    const tabsNav = document.getElementById('exam-tabs-nav');
    const contentArea = document.getElementById('exam-content-area');

    if (window.HES.userRole === 'admin') {
        reportBox.classList.add('hidden');
        tabsNav.classList.add('hidden');
        contentArea.innerHTML = `
            <div class="bg-indigo-50 border border-indigo-200 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-white text-indigo-600 flex items-center justify-center text-xl shadow-2xs shrink-0">
                        <i class="fas fa-file-signature"></i>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-indigo-950 text-sm sm:text-base">Mode Administrator</h4>
                        <p class="text-xs text-indigo-700 mt-0.5">Untuk membuat soal ujian, mereset ujian, atau menilai jawaban murid, silakan buka menu Builder & Penilaian Ujian di CMS.</p>
                    </div>
                </div>
                <a href="admin.html?tab=exam" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition shrink-0">
                    Buka Exam Builder
                </a>
            </div>
        `;
        return;
    }

    const examKey = `exam-${email}-${monthId}`;
    const resultKey = `exam_result-${email}-${monthId}`;
    const examData = window.HES.materials[examKey];
    const examResult = window.HES.materials[resultKey];

    if (!examData) {
        reportBox.classList.add('hidden');
        tabsNav.classList.add('hidden');
        contentArea.innerHTML = `
            <div class="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center">
                <i class="fas fa-folder-open text-slate-300 text-3xl mb-3"></i>
                <p class="text-slate-600 font-bold text-sm">Soal Ujian Belum Tersedia</p>
                <p class="text-slate-400 text-xs mt-1">Admin belum menerbitkan soal ujian untuk ${monthObj.title}.</p>
            </div>
        `;
        return;
    }

    tabsNav.classList.remove('hidden');
    const cat = currentStudentExamTab;

    // Update tampilan tombol tab aktif
    ['reading', 'writing', 'speaking', 'listening'].forEach(t => {
        const btn = document.getElementById(`stu-tab-${t}`);
        if (!btn) return;
        const isDone = examResult && (
            (examResult.submittedTabs && examResult.submittedTabs.includes(t)) ||
            (examResult.status === 'submitted' && (!examResult.submittedTabs || examResult.submittedTabs.length === 0))
        );
        const checkBadge = isDone ? `<i class="fas fa-check-circle text-emerald-500 text-[11px]"></i>` : '';
        const icons = {
            reading: 'fa-book-open',
            writing: 'fa-pen-nib',
            speaking: 'fa-microphone-lines',
            listening: 'fa-headphones'
        };
        const label = t.charAt(0).toUpperCase() + t.slice(1);

        btn.innerHTML = `<i class="fas ${icons[t]}"></i> <span>${label}</span> ${checkBadge}`;
        if (t === cat) {
            btn.className = "flex-1 min-w-[115px] py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm";
        } else {
            btn.className = "flex-1 min-w-[115px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50";
        }
    });

    // 1. Tampilkan Rapor Nilai Akhir jika sudah dinilai oleh Admin
    if (examResult && examResult.isGraded) {
        const sScores = examResult.sectionScores || { reading: 0, writing: 0, speaking: 0, listening: 0 };
        reportBox.classList.remove('hidden');
        reportBox.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-6 md:p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
                <div class="absolute right-0 top-0 -mt-10 -mr-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                <div class="flex items-center justify-between mb-5 relative z-10">
                    <h3 class="font-extrabold text-base md:text-xl flex items-center gap-2">
                        <i class="fas fa-award text-amber-300 text-xl"></i>
                        Final Report Evaluation
                    </h3>
                    <span class="px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] font-extrabold uppercase tracking-wider">Terverifikasi Admin</span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 relative z-10">
                    <div class="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-xs text-center">
                        <p class="text-[10px] uppercase tracking-wider text-indigo-100 mb-1 font-bold">Reading</p>
                        <p class="text-2xl font-extrabold text-white">${sScores.reading ?? 0}</p>
                    </div>
                    <div class="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-xs text-center">
                        <p class="text-[10px] uppercase tracking-wider text-indigo-100 mb-1 font-bold">Writing</p>
                        <p class="text-2xl font-extrabold text-white">${sScores.writing ?? 0}</p>
                    </div>
                    <div class="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-xs text-center">
                        <p class="text-[10px] uppercase tracking-wider text-indigo-100 mb-1 font-bold">Speaking</p>
                        <p class="text-2xl font-extrabold text-white">${sScores.speaking ?? 0}</p>
                    </div>
                    <div class="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-xs text-center">
                        <p class="text-[10px] uppercase tracking-wider text-indigo-100 mb-1 font-bold">Listening</p>
                        <p class="text-2xl font-extrabold text-white">${sScores.listening ?? 0}</p>
                    </div>
                </div>

                <div class="bg-white/10 p-4 md:p-5 rounded-2xl border border-white/20 backdrop-blur-xs relative z-10">
                    <p class="text-[10px] uppercase tracking-wider text-amber-300 mb-1.5 font-extrabold"><i class="fas fa-quote-left mr-1"></i> Catatan Evaluasi Admin</p>
                    <p class="text-xs sm:text-sm italic text-indigo-50 leading-relaxed">"${examResult.adminFeedback || 'Kerja bagus! Terus pertahankan semangat belajarmu.'}"</p>
                </div>
            </div>
        `;
    } else {
        reportBox.classList.add('hidden');
    }

    // 2. Cek apakah tab ini sudah disubmit
    const isTabSubmitted = examResult && (
        (examResult.submittedTabs && examResult.submittedTabs.includes(cat)) ||
        (examResult.status === 'submitted' && (!examResult.submittedTabs || examResult.submittedTabs.length === 0))
    );

    const questions = examData[cat] || [];
    if (questions.length === 0) {
        contentArea.innerHTML = `
            <div class="bg-white p-10 rounded-2xl border border-dashed border-slate-200 text-center">
                <p class="text-slate-400 text-xs sm:text-sm font-semibold">Tidak ada soal untuk bagian <strong class="uppercase">${cat}</strong> ini.</p>
            </div>
        `;
        return;
    }

    if (isTabSubmitted) {
        let html = `
            <div class="mb-5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3.5 rounded-2xl font-bold text-xs sm:text-sm shadow-2xs flex items-center justify-between">
                <span><i class="fas fa-check-circle mr-2 text-emerald-600"></i> Bagian <strong>${cat.toUpperCase()}</strong> telah disubmit.</span>
                <span class="text-[11px] bg-white px-2.5 py-1 rounded-lg border border-emerald-200">Mode Pembahasan</span>
            </div>
        `;

        questions.forEach((q, idx) => {
            let sAns = (examResult.answers && examResult.answers[`${cat}_${idx}`] !== undefined) ? examResult.answers[`${cat}_${idx}`] : '';
            let isMCQ = q.type === 'mcq';
            let isCorrect = isMCQ ? (sAns !== '' && sAns == q.answer) : true;
            let sAnsText = isMCQ && sAns !== '' ? q.options[sAns] : (sAns || 'Tidak dijawab');
            let cAnsText = isMCQ ? q.options[q.answer] : q.answer;

            if (!isMCQ && typeof sAns === 'string' && sAns.startsWith('data:audio')) {
                sAnsText = `<audio controls class="w-full h-9 mt-2"><source src="${sAns}"></audio>`;
            }

            let mediaHTML = q.mediaUrl
                ? `<audio controls class="w-full h-9 mt-3 mb-2 rounded-lg"><source src="${getDriveDirectStreamLink(q.mediaUrl)}"></audio>`
                : '';

            html += `
                <div class="bg-white p-5 rounded-2xl border ${isMCQ ? (isCorrect ? 'border-emerald-200' : 'border-red-200') : 'border-slate-200'} shadow-sm mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-extrabold text-slate-400 uppercase">Soal #${idx + 1}</span>
                        ${isMCQ ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded ${isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">${isCorrect ? 'Benar' : 'Kurang Tepat'}</span>` : ''}
                    </div>
                    <p class="font-bold text-xs sm:text-sm text-slate-800 mb-3 leading-relaxed">${q.question.replace(/\n/g, '<br>')}</p>
                    ${mediaHTML}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 mt-3">
                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                            <p class="text-[10px] font-extrabold uppercase text-slate-400 mb-1">Jawaban Anda</p>
                            <div class="text-xs font-bold ${isMCQ ? (isCorrect ? 'text-emerald-600' : 'text-red-600') : 'text-slate-700'}">${sAnsText}</div>
                        </div>
                        <div class="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100">
                            <p class="text-[10px] font-extrabold uppercase text-indigo-400 mb-1">Kunci / Kriteria Jawaban</p>
                            <p class="text-xs font-bold text-indigo-700">${cAnsText || 'Dinilai manual oleh Admin'}</p>
                        </div>
                    </div>
                    ${q.explanation ? `
                        <div class="bg-amber-50/80 p-3.5 rounded-xl border border-amber-100 flex gap-2.5 mt-2">
                            <i class="fas fa-lightbulb text-amber-500 text-sm mt-0.5"></i>
                            <div>
                                <p class="text-[10px] font-extrabold uppercase text-amber-700 mb-0.5">Pembahasan</p>
                                <p class="text-xs text-amber-900">${q.explanation}</p>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        contentArea.innerHTML = html;
    } else {
        // Mode Pengerjaan Soal
        let html = `<div class="space-y-4">`;

        questions.forEach((q, idx) => {
            let isMCQ = q.type === 'mcq';
            let savedAns = studentExamAnswers[`${cat}_${idx}`] !== undefined ? studentExamAnswers[`${cat}_${idx}`] : '';

            // Audio Player dengan batas 2x putar
            let mediaHTML = '';
            if (q.mediaUrl) {
                let key = `${cat}_${idx}`;
                let playCount = audioPlayCounts[key] || 0;
                let sisa = 2 - playCount;
                if (sisa > 0) {
                    mediaHTML = `
                        <div class="mt-3 mb-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                            <audio id="audio-${key}" controls class="w-full h-10 rounded-lg" onplay="checkAudioPlay(this, '${key}')" onended="incrementAudioPlay(this, '${key}')">
                                <source src="${getDriveDirectStreamLink(q.mediaUrl)}">
                            </audio>
                            <p id="audio-warn-${key}" class="text-[11px] font-bold text-amber-600 mt-2 flex items-center gap-1.5">
                                <i class="fas fa-info-circle"></i> Sisa kesempatan putar audio: <span id="audio-sisa-${key}">${sisa}</span> kali
                            </p>
                        </div>
                    `;
                } else {
                    mediaHTML = `
                        <div class="mt-3 mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-center">
                            <p class="text-xs font-bold text-red-600"><i class="fas fa-ban mr-1"></i> Batas pemutaran audio (2x) telah habis.</p>
                        </div>
                    `;
                }
            }

            let inputsHTML = '';
            if (isMCQ) {
                inputsHTML = ['A', 'B', 'C', 'D'].map((lbl, oIdx) => `
                    <label class="flex items-start sm:items-center gap-3 p-3.5 border border-slate-200 rounded-xl cursor-pointer hover:bg-indigo-50/40 hover:border-indigo-300 transition mb-2">
                        <input type="radio" name="ans_${cat}_${idx}" value="${oIdx}" ${savedAns !== '' && savedAns == oIdx ? 'checked' : ''} onchange="recordAnswer('${cat}', ${idx}, ${oIdx})" class="w-4 h-4 mt-0.5 sm:mt-0 text-indigo-600 shrink-0">
                        <span class="text-xs sm:text-sm font-semibold text-slate-700 leading-snug"><strong>${lbl}.</strong> ${q.options[oIdx]}</span>
                    </label>
                `).join('');
            } else {
                if (cat === 'speaking') {
                    let hasAudio = typeof savedAns === 'string' && savedAns.startsWith('data:audio');
                    inputsHTML = `
                        <div class="bg-indigo-50/60 border border-indigo-100 p-4 rounded-2xl mt-2">
                            <p class="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider mb-2.5"><i class="fas fa-microphone-lines mr-1"></i> Live Voice Recorder</p>
                            <div class="flex flex-wrap items-center gap-3">
                                <button type="button" id="btn-record-${idx}" onclick="startVoiceRecord(${idx})" class="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs hover:bg-indigo-700 transition">
                                    <i class="fas fa-microphone mr-1.5"></i> ${hasAudio ? 'Rekam Ulang Suara' : 'Mulai Rekam Suara'}
                                </button>
                                <button type="button" id="btn-stop-${idx}" onclick="stopVoiceRecord(${idx})" class="hidden bg-red-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs hover:bg-red-600 transition animate-pulse">
                                    <i class="fas fa-stop mr-1.5"></i> Hentikan Rekaman
                                </button>
                                <audio id="audio-playback-${idx}" controls src="${hasAudio ? savedAns : ''}" class="${hasAudio ? '' : 'hidden'} h-9 w-full max-w-xs"></audio>
                            </div>
                            <p class="text-[11px] text-slate-500 mt-2.5 font-medium">Tekan <strong>Mulai Rekam</strong>, berbicaralah dengan jelas, lalu tekan <strong>Hentikan Rekaman</strong>. Rekaman otomatis tersimpan.</p>
                        </div>
                    `;
                } else {
                    inputsHTML = `
                        <textarea oninput="recordAnswer('${cat}', ${idx}, this.value)" onchange="recordAnswer('${cat}', ${idx}, this.value)" rows="4" class="w-full p-3.5 border border-slate-200 rounded-xl text-xs sm:text-sm outline-none bg-slate-50 focus:bg-white focus:border-indigo-500 transition" placeholder="Ketik jawaban lengkap Anda di sini...">${savedAns}</textarea>
                    `;
                }
            }

            html += `
                <div class="bg-white p-5 md:p-6 rounded-2xl border border-slate-200/90 shadow-sm">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[11px] font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">Soal #${idx + 1}</span>
                        <span class="text-[10px] font-bold text-slate-400 uppercase">${isMCQ ? 'Pilihan Ganda' : (cat === 'speaking' ? 'Rekaman Suara' : 'Essay Tertulis')}</span>
                    </div>
                    <p class="font-bold text-slate-800 text-xs sm:text-sm leading-relaxed mt-2">${q.question.replace(/\n/g, '<br>')}</p>
                    ${mediaHTML}
                    <div class="mt-4">${inputsHTML}</div>
                </div>
            `;
        });

        html += `
            </div>
            <div class="bg-gradient-to-r from-indigo-600 to-violet-700 p-6 md:p-8 rounded-3xl text-center shadow-md relative overflow-hidden mt-8">
                <div class="absolute right-0 top-0 -mt-10 -mr-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                <h4 class="text-white font-extrabold text-base mb-1 relative z-10">Selesai Mengerjakan Bagian ${cat.toUpperCase()}?</h4>
                <p class="text-xs text-indigo-100 mb-5 relative z-10">Pastikan seluruh jawaban pada tab ini telah terisi. Bagian yang sudah disubmit tidak dapat diubah kembali.</p>
                <button onclick="submitStudentExam('${monthId}', '${cat}')" class="px-8 py-3.5 bg-white text-indigo-700 rounded-xl text-xs sm:text-sm font-extrabold w-full sm:w-auto hover:bg-indigo-50 shadow-sm transition relative z-10">
                    <i class="fas fa-paper-plane mr-1.5"></i> Submit Bagian ${cat.toUpperCase()}
                </button>
            </div>
        `;

        contentArea.innerHTML = html;
    }
}

window.recordAnswer = function(category, qIndex, value) {
    studentExamAnswers[`${category}_${qIndex}`] = value;
};

window.checkAudioPlay = function(audioEl, key) {
    if ((audioPlayCounts[key] || 0) >= 2) {
        audioEl.pause();
        audioEl.removeAttribute('controls');
    }
};

window.incrementAudioPlay = function(audioEl, key) {
    if (!audioPlayCounts[key]) audioPlayCounts[key] = 0;
    audioPlayCounts[key]++;
    let sisa = 2 - audioPlayCounts[key];

    let warnEl = document.getElementById(`audio-sisa-${key}`);
    if (warnEl) warnEl.innerText = sisa;

    if (sisa <= 0) {
        audioEl.removeAttribute('controls');
        let container = document.getElementById(`audio-warn-${key}`);
        if (container) {
            container.innerHTML = `<i class="fas fa-ban"></i> Batas pemutaran audio (2x) telah habis.`;
            container.className = "text-[11px] font-bold text-red-600 mt-2";
        }
    }
};

window.startVoiceRecord = async function(qIndex) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);

            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = function() {
                const base64data = reader.result;
                recordAnswer('speaking', qIndex, base64data);
                showToast('Rekaman suara berhasil disimpan ke lembar jawaban.', 'info');
            };

            const playback = document.getElementById(`audio-playback-${qIndex}`);
            if (playback) {
                playback.src = audioUrl;
                playback.classList.remove('hidden');
            }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        document.getElementById(`btn-record-${qIndex}`).classList.add('hidden');
        document.getElementById(`btn-stop-${qIndex}`).classList.remove('hidden');
    } catch (err) {
        showToast('Gagal mengakses mikrofon. Pastikan izin mikrofon aktif di browser Anda.', 'error');
    }
};

window.stopVoiceRecord = function(qIndex) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById(`btn-stop-${qIndex}`).classList.add('hidden');
        const recordBtn = document.getElementById(`btn-record-${qIndex}`);
        recordBtn.classList.remove('hidden');
        recordBtn.innerHTML = '<i class="fas fa-redo mr-1.5"></i> Rekam Ulang Suara';
    }
};

window.submitStudentExam = async function(monthId, tab) {
    if (!confirm(`Kirim jawaban untuk bagian ${tab.toUpperCase()} sekarang?\n\nBagian ini tidak dapat diubah lagi setelah disubmit.`)) return;

    document.body.style.cursor = 'wait';
    await syncFromCloud();

    const email = window.HES.currentUser.email;
    const examKey = `exam-${email}-${monthId}`;
    const resultKey = `exam_result-${email}-${monthId}`;
    const examData = window.HES.materials[examKey];

    let currentResult = window.HES.materials[resultKey] || {
        status: 'partial',
        answers: {},
        scores: {},
        sectionScores: { reading: 0, writing: 0, speaking: 0, listening: 0 },
        submittedTabs: []
    };

    if (!currentResult.answers) currentResult.answers = {};
    if (!currentResult.scores) currentResult.scores = {};
    if (!currentResult.sectionScores) currentResult.sectionScores = { reading: 0, writing: 0, speaking: 0, listening: 0 };
    if (!currentResult.submittedTabs) currentResult.submittedTabs = [];

    if (examData && examData[tab]) {
        examData[tab].forEach((q, idx) => {
            let ans = studentExamAnswers[`${tab}_${idx}`];
            if (ans !== undefined) {
                currentResult.answers[`${tab}_${idx}`] = ans;
            }
        });
    }

    ['reading', 'writing', 'speaking', 'listening'].forEach(c => {
        currentResult.sectionScores[c] = calculateCategoryScore(c, examData, currentResult);
    });

    currentResult.submittedAt = new Date().toISOString();
    if (!currentResult.submittedTabs.includes(tab)) {
        currentResult.submittedTabs.push(tab);
    }

    window.HES.materials[resultKey] = currentResult;
    const { error } = await saveToCloud('hes_materials', window.HES.materials);
    document.body.style.cursor = 'default';

    if (error) {
        showToast('Gagal menyimpan jawaban: ' + error.message, 'error');
    } else {
        showToast(`Bagian ${tab.toUpperCase()} berhasil disubmit!`, 'success');
        sendTelegramNotification(`📝 *Ujian Disubmit (Bagian ${tab.toUpperCase()})*\nMurid: ${window.HES.currentUser.name}\nSkor Sementara ${tab.toUpperCase()}: ${currentResult.sectionScores[tab]}/100`);
        renderStudentExamPage();
    }
};