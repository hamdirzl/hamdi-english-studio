// js/exam.js

let studentExamAnswers = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [];

// Menyuntikkan CSS khusus untuk konversi PDF A4 presisi (Dijamin 1 Halaman)
if (!document.getElementById('pdf-print-style')) {
    const style = document.createElement('style');
    style.id = 'pdf-print-style';
    style.innerHTML = `
        @media print {
            @page { size: A4; margin: 0; }
            body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body * { visibility: hidden; }
            #app-sidebar, #app-header, .hes-btn-primary, .hes-btn-soft { display: none !important; }
            #printable-report, #printable-report * { visibility: visible; }
            #printable-report { 
                position: absolute !important; left: 0 !important; top: 0 !important; 
                width: 210mm !important; height: 297mm !important; 
                margin: 0 !important; padding: 40px 50px !important; 
                box-sizing: border-box !important;
                box-shadow: none !important; border: none !important; 
                overflow: hidden !important;
                page-break-after: avoid; page-break-inside: avoid;
            }
        }
        .a4-container {
            width: 100%; max-width: 210mm; min-height: 297mm;
            padding: 40px 50px; box-sizing: border-box;
            background-color: white; position: relative; overflow: hidden;
            display: flex; flex-direction: column;
        }
    `;
    document.head.appendChild(style);
}

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
        btn.className = `py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center ${t === cat ? 'bg-white text-indigo-600 shadow-sm border border-indigo-200' : 'text-slate-500 hover:text-slate-800'}`;
    });

    // Desain Report Card A4 (Padat, English, 1 Halaman)
    if (examResult?.isGraded) {
        const sc = examResult.sectionScores || {};
        const vReading = sc.reading ?? 0;
        const vWriting = sc.writing ?? 0;
        const vSpeaking = sc.speaking ?? 0;
        const vListening = sc.listening ?? 0;
        
        const totalScore = vReading + vWriting + vSpeaking + vListening;
        const avgScoreRaw = totalScore / 4;
        const avgScore = parseFloat(avgScoreRaw.toFixed(2)).toString().replace('.', ',');
        
        // Logika Status Kelulusan (Bisa disesuaikan minimal skornya)
        const isPassed = avgScoreRaw >= 70; 

        // Memprioritaskan data tanggal penilaian (gradedAt)
        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const formattedDate = docDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const docNumber = `RP/STD/${docDate.getFullYear()}${(docDate.getMonth()+1).toString().padStart(2,'0')}/${monthObj.id.toUpperCase()}/${studentName.substring(0, 3).toUpperCase()}`;
        
        const formattedFeedback = (examResult.adminFeedback || 'Has completed the program well. Keep improving your English skills.')
                                  .split('\n').map(p => p.trim() ? `<p class="mb-2 text-justify">${p}</p>` : '').join('');

        reportBox.classList.remove('hidden');
        reportBox.innerHTML = `
            <div class="flex justify-end mb-4">
                <button onclick="window.print()" class="hes-btn-primary !bg-slate-800 hover:!bg-slate-900 shadow-lg">
                    <i class="fas fa-file-pdf text-red-400"></i> Download PDF
                </button>
            </div>
            
            <div id="printable-report" class="mx-auto shadow-xl border border-slate-200 a4-container">
                
                <!-- Elemen Ornamen Abstrak (Blob Kanan Atas) -->
                <svg class="absolute top-0 right-0 w-80 h-80 text-blue-600 opacity-90 -mt-12 -mr-12 z-0 pointer-events-none" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <path fill="currentColor" d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.5,-40.8C85.9,-26.3,92.5,-11.3,91.8,3.2C91.1,17.7,83.1,31.7,73.5,43.8C63.9,55.9,52.7,66.1,39.6,73.1C26.5,80.1,11.5,83.8,-3.7,89.5C-18.9,95.2,-34.3,102.9,-46.8,96.6C-59.3,90.3,-68.9,70.1,-75.4,51.8C-81.9,33.5,-85.3,17,-86.1,-0.1C-86.9,-17.2,-85.1,-33.5,-77.7,-47.5C-70.3,-61.5,-57.3,-73.2,-43.1,-79.6C-28.9,-86,-13.4,-87.1,1.5,-89.4C16.4,-91.7,32.5,-83.3,45.7,-76.3Z" transform="translate(100 100)" />
                </svg>

                <div class="relative z-10 flex-1 flex flex-col h-full">
                    
                    <!-- Header Dokumen -->
                    <div class="flex justify-between items-start mb-10">
                        <div>
                            <h1 class="text-2xl font-black text-slate-900 flex items-center gap-2">
                                <span class="text-blue-600 text-3xl"><i class="fas fa-graduation-cap"></i></span> Hamdi Studio
                            </h1>
                        </div>
                        <div class="text-right mt-2">
                            <h2 class="text-3xl font-black text-white drop-shadow-md tracking-tight">Report Card</h2>
                            <p class="text-xs font-bold text-white drop-shadow-md mt-1">No: ${docNumber}</p>
                        </div>
                    </div>

                    <!-- Informasi Identitas Siswa -->
                    <div class="mb-8">
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Name</p>
                        <h3 class="text-3xl font-black text-blue-600 mb-5 tracking-tight">${studentName}</h3>
                        
                        <div class="flex gap-14 border-t border-slate-200 pt-4">
                            <div>
                                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Teacher</p>
                                <p class="text-sm font-black text-slate-800">Hamdi Rizal</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Class</p>
                                <p class="text-sm font-black text-slate-800">${monthObj.title}</p>
                            </div>
                            <div>
                                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Sessions</p>
                                <p class="text-sm font-black text-slate-800">12 Sessions</p>
                            </div>
                        </div>
                    </div>

                    <!-- Status Kelulusan Dinamis -->
                    <div class="flex justify-center mb-8">
                        <div class="border-[3px] border-blue-600 rounded-full px-10 py-3 text-xl font-black tracking-widest bg-white z-10 shadow-sm relative">
                            <!-- Garis coretan jika salah satu status aktif -->
                            <div class="absolute left-1/2 top-1/2 w-[120px] h-[3px] ${isPassed ? 'bg-emerald-500 translate-x-[15px]' : 'bg-red-500 -translate-x-[135px]'} -translate-y-1/2 z-20"></div>
                            
                            <span class="${isPassed ? 'text-blue-600' : 'text-slate-300'} relative z-10">PASSED</span> 
                            <span class="text-slate-400 mx-3">/</span> 
                            <span class="${!isPassed ? 'text-red-600' : 'text-slate-300'} relative z-10">FAILED</span>
                        </div>
                    </div>

                    <!-- Kotak Skor (Score Box) -->
                    <div class="border-[3px] border-blue-600 rounded-3xl p-6 mb-8 bg-white z-10 relative shadow-sm">
                        <h4 class="text-center text-lg font-black text-slate-900 mb-6 tracking-wide">Score</h4>
                        
                        <!-- 4 Kemampuan -->
                        <div class="grid grid-cols-4 text-center border-b-2 border-slate-100 pb-5 mb-5">
                            <div>
                                <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reading</p>
                                <p class="text-3xl font-black text-blue-600">${vReading}</p>
                            </div>
                            <div>
                                <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Writing</p>
                                <p class="text-3xl font-black text-blue-600">${vWriting}</p>
                            </div>
                            <div>
                                <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Speaking</p>
                                <p class="text-3xl font-black text-blue-600">${vSpeaking}</p>
                            </div>
                            <div>
                                <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Listening</p>
                                <p class="text-3xl font-black text-blue-600">${vListening}</p>
                            </div>
                        </div>

                        <!-- Total & Rata-rata -->
                        <div class="flex justify-around items-center text-center">
                            <div>
                                <p class="text-sm font-black text-slate-800 mb-1 uppercase tracking-wider">Total</p>
                                <p class="text-5xl font-black text-blue-600">${totalScore}</p>
                            </div>
                            <div>
                                <p class="text-sm font-black text-slate-800 mb-1 uppercase tracking-wider">Average</p>
                                <p class="text-5xl font-black text-blue-600">${avgScore}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Catatan / Feedback Tutor (Mengisi ruang kosong sisa) -->
                    <div class="flex-1 flex flex-col justify-start">
                        <h4 class="text-base font-black text-slate-900 mb-2">Feedback</h4>
                        <div class="text-[13px] font-semibold text-slate-700 leading-relaxed pr-6">
                            ${formattedFeedback}
                        </div>
                    </div>

                    <!-- Tanda Tangan Mengunci di Bawah -->
                    <div class="flex justify-end mt-auto pt-4 relative z-20">
                        <div class="text-center w-52">
                            <p class="text-[11px] font-bold text-slate-500 mb-2">Medan, ${formattedDate}</p>
                            <img src="signature.png" alt="Signature" class="h-16 mx-auto object-contain" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'h-16 flex items-center justify-center italic text-xs text-slate-300\\'>[Signature Placeholder]</div>');">
                            <div class="border-t-[3px] border-slate-900 mt-2 pt-1.5">
                                <p class="text-base font-black text-slate-900">Hamdi Rizal</p>
                                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Tutor</p>
                            </div>
                        </div>
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