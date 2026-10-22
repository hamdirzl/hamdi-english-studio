// js/exam.js

let studentExamAnswers = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [];

// Muat library html2pdf.js secara otomatis agar tombol Download PDF langsung mengunduh file .pdf 1 halaman
if (!document.getElementById('html2pdf-lib')) {
    const script = document.createElement('script');
    script.id = 'html2pdf-lib';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    document.head.appendChild(script);
}

// CSS Cetak 1 Halaman Padat (Anti Terpotong 2 Halaman)
if (!document.getElementById('pdf-print-style')) {
    const style = document.createElement('style');
    style.id = 'pdf-print-style';
    style.innerHTML = `
        @media print {
            @page { size: A4 portrait; margin: 10mm; }
            html, body {
                height: auto !important;
                overflow: visible !important;
                background: #FFFFFF !important;
            }
            body * { visibility: hidden; }
            #app-sidebar, #app-header, #report-action-bar, #exam-tabs-nav, #exam-content-area {
                display: none !important;
            }
            #printable-report, #printable-report * {
                visibility: visible;
            }
            #printable-report {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 190mm !important;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 auto !important;
                padding: 10mm !important;
                box-shadow: none !important;
                border: 1px solid #CBD5E1 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
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

// Fungsi Download PDF 1 Halaman Langsung
window.downloadReportPDF = async function(studentName, monthTitle) {
    const el = document.getElementById('printable-report');
    const btn = document.getElementById('btn-download-pdf');
    if (!el) return;

    if (typeof html2pdf === 'undefined') {
        window.print();
        return;
    }

    const origText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Menyiapkan PDF...`;
    }

    const cleanName = (studentName || 'Siswa').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanMonth = (monthTitle || 'Report').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Report_Card_${cleanName}_${cleanMonth}.pdf`;

    try {
        const opt = {
            margin:       [8, 8, 8, 8],
            filename:     fileName,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, scrollY: 0, windowWidth: 900 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all'] }
        };
        await html2pdf().set(opt).from(el).save();
        showToast('Report Card PDF berhasil diunduh!', 'success');
    } catch (err) {
        console.error(err);
        window.print();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    }
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
                    <p class="text-xs text-slate-500 mt-1">Kelola soal ujian, tulis Level Kelas, Tutor's Note, dan nilai murid di Panel Admin.</p>
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

    // Rapor Hasil Akhir: Desain 1 Halaman Padat, Modern, & Siap Download PDF
    if (examResult?.isGraded) {
        const sc = examResult.sectionScores || {};
        const vReading = sc.reading ?? 0;
        const vWriting = sc.writing ?? 0;
        const vSpeaking = sc.speaking ?? 0;
        const vListening = sc.listening ?? 0;

        const totalScore = vReading + vWriting + vSpeaking + vListening;
        const avgScoreRaw = totalScore / 4;
        const avgScore = Number.isInteger(avgScoreRaw) ? String(avgScoreRaw) : avgScoreRaw.toFixed(1).replace('.', ',');

        const isPassed = avgScoreRaw >= 70;
        let gradeLetter = 'D', gradeBadgeCls = 'bg-red-50 text-red-600 border-red-200';
        if (avgScoreRaw >= 90) { gradeLetter = 'A'; gradeBadgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200'; }
        else if (avgScoreRaw >= 80) { gradeLetter = 'B'; gradeBadgeCls = 'bg-indigo-50 text-indigo-700 border-indigo-200'; }
        else if (avgScoreRaw >= 70) { gradeLetter = 'C'; gradeBadgeCls = 'bg-amber-50 text-amber-700 border-amber-200'; }

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const classLevelText = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNoteText = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'Telah menyelesaikan evaluasi pembelajaran dengan baik. Teruslah berlatih dan tingkatkan kepercayaan dirimu dalam berbahasa Inggris!';

        const safeName = studentName.replace(/'/g, "\'");
        const safeMonth = monthObj.title.replace(/'/g, "\'");

        reportBox.classList.remove('hidden');
        reportBox.innerHTML = `
            <div id="report-action-bar" class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-indigo-50/80 border border-indigo-100 px-4 py-3 rounded-2xl">
                <div class="flex items-center gap-2.5">
                    <span class="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs">
                        <i class="fas fa-award"></i>
                    </span>
                    <div>
                        <p class="text-xs font-extrabold text-slate-800">Rapor Evaluasi Telah Terbit!</p>
                        <p class="text-[11px] font-semibold text-slate-500">Unduh sebagai PDF (1 Halaman A4 Padat).</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-download-pdf" onclick="downloadReportPDF('${safeName}', '${safeMonth}')" class="hes-btn-primary !bg-indigo-600 hover:!bg-indigo-700 !py-2.5 !px-4 !text-xs">
                        <i class="fas fa-file-download"></i> Download PDF
                    </button>
                    <button onclick="window.print()" class="hes-btn-soft !bg-white !py-2.5 !px-3.5 !text-xs" title="Cetak langsung">
                        <i class="fas fa-print"></i>
                    </button>
                </div>
            </div>

            <!-- KARTU RAPOR 1 HALAMAN PADAT & RAPI -->
            <div id="printable-report" class="bg-white mx-auto rounded-2xl shadow-lg border border-slate-200 text-slate-800 p-6 sm:p-9 max-w-[794px]">
                
                <!-- Header Brand & Judul Report Card -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b-2 border-indigo-900">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-indigo-900 text-white flex items-center justify-center text-xl shadow-sm shrink-0">
                            <i class="fas fa-graduation-cap"></i>
                        </div>
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Hamdi English Studio</p>
                            <h1 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase leading-tight">Student Report Card</h1>
                        </div>
                    </div>
                    <div class="sm:text-right">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${isPassed ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'}">
                            <i class="fas ${isPassed ? 'fa-check-circle' : 'fa-info-circle'}"></i>
                            ${isPassed ? 'PASSED / LULUS' : 'NEEDS IMPROVEMENT'}
                        </span>
                    </div>
                </div>

                <!-- Informasi Utama Siswa (Tanpa Email, Rapi & Padat) -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 bg-slate-50 p-4 rounded-xl border border-slate-200/90">
                    <div>
                        <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Nama Siswa</p>
                        <p class="text-sm sm:text-base font-black text-slate-900 mt-0.5 truncate">${studentName}</p>
                    </div>
                    <div class="sm:border-l sm:border-slate-200 sm:pl-4">
                        <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Kelas / Level</p>
                        <p class="text-sm sm:text-base font-black text-indigo-700 mt-0.5">${classLevelText}</p>
                    </div>
                    <div class="sm:border-l sm:border-slate-200 sm:pl-4">
                        <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Tanggal Rilis</p>
                        <p class="text-xs sm:text-sm font-extrabold text-slate-700 mt-1">${getDisplayDate(docDate)}</p>
                    </div>
                </div>

                <!-- Bagian Skor: 4 Skill + Rata-Rata Akhir (Tanpa Tabel Skala yang Memenuhi Halaman) -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-4 mb-5 items-stretch">
                    
                    <!-- 4 Kartu Nilai Skill -->
                    <div class="md:col-span-8 grid grid-cols-2 gap-2.5">
                        <div class="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                            <div>
                                <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Reading</p>
                                <p class="text-xs font-bold text-slate-500 mt-0.5">Pemahaman Bacaan</p>
                            </div>
                            <span class="text-2xl font-black text-slate-800">${vReading}</span>
                        </div>
                        <div class="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                            <div>
                                <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Writing</p>
                                <p class="text-xs font-bold text-slate-500 mt-0.5">Penulisan & Tata Bahasa</p>
                            </div>
                            <span class="text-2xl font-black text-slate-800">${vWriting}</span>
                        </div>
                        <div class="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                            <div>
                                <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Speaking</p>
                                <p class="text-xs font-bold text-slate-500 mt-0.5">Kelancaran & Pelafalan</p>
                            </div>
                            <span class="text-2xl font-black text-slate-800">${vSpeaking}</span>
                        </div>
                        <div class="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                            <div>
                                <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Listening</p>
                                <p class="text-xs font-bold text-slate-500 mt-0.5">Pemahaman Audio</p>
                            </div>
                            <span class="text-2xl font-black text-slate-800">${vListening}</span>
                        </div>
                    </div>

                    <!-- Kotak Nilai Rata-Rata Akhir & Grade -->
                    <div class="md:col-span-4 rounded-xl bg-gradient-to-br from-indigo-900 to-indigo-800 text-white p-4 flex flex-col items-center justify-center text-center shadow-sm">
                        <p class="text-[10px] font-extrabold uppercase tracking-widest text-indigo-200">Final Average</p>
                        <p class="text-4xl font-black my-1 tracking-tight">${avgScore}</p>
                        <span class="px-3 py-0.5 rounded-md text-xs font-black border ${gradeBadgeCls}">
                            Grade ${gradeLetter}
                        </span>
                    </div>
                </div>

                <!-- Tutor's Note -->
                <div class="mb-6">
                    <div class="flex items-center gap-1.5 mb-2">
                        <i class="fas fa-comment-dots text-indigo-600 text-xs"></i>
                        <h3 class="text-xs font-black uppercase tracking-wider text-indigo-950">Tutor's Note & Evaluation</h3>
                    </div>
                    <div class="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-xs sm:text-sm font-semibold text-slate-700 leading-relaxed whitespace-pre-line">
                        ${tutorNoteText}
                    </div>
                </div>

                <!-- Footer & Tanda Tangan (Padat, Tidak Terlempar ke Halaman 2) -->
                <div class="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div class="text-[11px] text-slate-400 font-semibold space-y-0.5">
                        <p class="font-bold text-slate-600">Hamdi English Studio — Official Evaluation Report</p>
                        <p>Periode Evaluasi: ${monthObj.title} • Dicetak pada ${getDisplayDate(docDate)}</p>
                    </div>
                    <div class="text-center sm:text-right shrink-0">
                        <p class="text-xs font-bold text-slate-600 mb-1">Medan, ${getDisplayDate(docDate)}</p>
                        <img src="signature.png" alt="Tanda Tangan" class="h-14 sm:ml-auto mx-auto object-contain my-1" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\'h-10\'></div>');">
                        <div class="border-t-2 border-slate-800 pt-1 min-w-[160px] inline-block text-center">
                            <p class="text-xs sm:text-sm font-black text-slate-900 uppercase leading-none">Hamdi Rizal</p>
                            <p class="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5">English Tutor</p>
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
