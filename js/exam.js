// js/exam.js

let studentExamAnswers = {}, studentExamTranscripts = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [], activeRecordingIndex = null, activeRecordingStopPromiseResolve = null, speechRecInstance = null;

// Injeksi Font, Library jsPDF & Print CSS
if (!document.getElementById('report-google-font')) {
    document.head.insertAdjacentHTML('beforeend', `
        <link id="report-google-font" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap">
        <style id="pdf-print-style">
            @media print {
                @page { size: A4 portrait; margin: 8mm; }
                html, body { height: auto !important; overflow: visible !important; background: #FFF !important; }
                body * { visibility: hidden; }
                #app-sidebar, #app-header, #report-action-bar, #exam-tabs-nav, #exam-content-area { display: none !important; }
                #printable-report, #printable-report * { visibility: visible; }
                #printable-report {
                    position: fixed !important; left: 0 !important; top: 0 !important;
                    width: 100% !important; max-width: 194mm !important; margin: 0 auto !important;
                    box-shadow: none !important; page-break-inside: avoid !important; break-inside: avoid !important;
                    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                }
            }
        </style>
    `);
}
if (!document.getElementById('jspdf-lib')) {
    const s = document.createElement('script');
    s.id = 'jspdf-lib';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(s);
}

// ============================================================================
// HELPER DATA & PERHITUNGAN RAPOR TERPUSAT (TANPA DUPLIKASI)
// ============================================================================
function formatEnglishDate(dateInput) {
    const d = dateInput instanceof Date && !isNaN(dateInput) ? dateInput : new Date();
    const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthsEn[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getSkillBandInfo(score) {
    const s = Number(score) || 0;
    if (s >= 90) return { label: 'Excellent',       color: '#1D4ED8', bg: '#DBEAFE', bar: '#2563EB' };
    if (s >= 80) return { label: 'Very Good',       color: '#0369A1', bg: '#E0F2FE', bar: '#0284C7' };
    if (s >= 70) return { label: 'Good',            color: '#0F766E', bg: '#CCFBF1', bar: '#0D9488' };
    return              { label: 'Keep Practicing', color: '#475569', bg: '#E2E8F0', bar: '#64748B' };
}

function getReportMeta(monthId) {
    const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
    const email = window.HES.currentUser.email;
    const studentName = window.HES.currentUser.name || 'Student';
    const examResult = window.HES.materials[`exam_result-${email}-${monthId}`] || {};
    const sc = examResult.sectionScores || {};

    const skills = [
        { title: 'Reading',   sub: 'Comprehension & Context', score: Number(sc.reading ?? 0) },
        { title: 'Writing',   sub: 'Grammar & Expression',    score: Number(sc.writing ?? 0) },
        { title: 'Speaking',  sub: 'Fluency & Pronunciation', score: Number(sc.speaking ?? 0) },
        { title: 'Listening', sub: 'Audio Understanding',     score: Number(sc.listening ?? 0) }
    ];

    const avgRaw = skills.reduce((sum, s) => sum + s.score, 0) / 4;
    const avgDisplay = Number.isInteger(avgRaw) ? String(avgRaw) : avgRaw.toFixed(1);
    const isPassed = avgRaw >= 70;

    let gradeLetter = 'D', gradeWord = 'Needs Practice';
    if (avgRaw >= 90)      { gradeLetter = 'A'; gradeWord = 'Excellent'; }
    else if (avgRaw >= 80) { gradeLetter = 'B'; gradeWord = 'Very Good'; }
    else if (avgRaw >= 70) { gradeLetter = 'C'; gradeWord = 'Good'; }

    return {
        monthObj, email, studentName, examResult, skills, avgRaw, avgDisplay, isPassed, gradeLetter, gradeWord,
        dateEn: formatEnglishDate(examResult.gradedAt ? new Date(examResult.gradedAt) : new Date()),
        classLevel: examResult.classLevel?.trim() || monthObj.title,
        tutorNote: examResult.adminFeedback?.trim() || 'Great effort and steady progress throughout this level. Keep practicing regularly to build even stronger fluency and confidence in English.'
    };
}

// ============================================================================
// INISIALISASI & NAVIGASI HALAMAN UJIAN
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    const p = new URLSearchParams(window.location.search);
    currentExamSession = p.get('month') || 'm1';
    currentStudentExamTab = p.get('tab') || 'reading';

    initLayout('Ujian & Rapor');
    const refreshUI = () => { hydrateLocalExamAnswers(); setupExamMonthSelector(); renderStudentExamPage(); };
    refreshUI();

    await syncFromCloud();
    renderAppSidebar();
    refreshUI();
});

function hydrateLocalExamAnswers() {
    if (window.HES.userRole !== 'student') return;
    const res = window.HES.materials[`exam_result-${window.HES.currentUser?.email}-${currentExamSession}`];
    if (res?.answers) studentExamAnswers = Object.assign({}, res.answers, studentExamAnswers);
    if (res?.transcripts) studentExamTranscripts = Object.assign({}, res.transcripts, studentExamTranscripts);
}

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
    window.stopNaturalEnglishTTS();
    currentStudentExamTab = tab;
    renderStudentExamPage();
};

// ============================================================================
// PEMUTAR AUDIO SOAL UJIAN (DENGAN BATAS PUTAR 2X)
// ============================================================================
window.playExamQuestionAudio = async function(cat, idx, field = 'script', countKey = null, btnEl = null) {
    const q = window.HES.materials[`exam-${window.HES.currentUser?.email}-${currentExamSession}`]?.[cat]?.[idx];
    if (!q) return;

    const rawText = field === 'answer' ? (q.answer || '') : (q.audioScript || (!String(q.mediaUrl || '').startsWith('http') ? (q.mediaUrl || '') : ''));
    if (!String(rawText).trim()) return;

    if (countKey) {
        if ((audioPlayCounts[countKey] || 0) >= 2) return showToast('Batas pemutaran audio (2x) untuk soal ini telah habis.', 'error');
        audioPlayCounts[countKey] = (audioPlayCounts[countKey] || 0) + 1;
        const sisaEl = document.getElementById(`audio-sisa-${countKey}`);
        if (sisaEl) sisaEl.innerText = Math.max(0, 2 - audioPlayCounts[countKey]);
    }

    await window.playNaturalEnglishTTS(rawText, btnEl);

    if (countKey && btnEl && (2 - (audioPlayCounts[countKey] || 0)) <= 0) {
        btnEl.disabled = true;
        btnEl.className = 'px-4 py-2.5 rounded-xl bg-slate-200 text-slate-400 text-xs font-extrabold cursor-not-allowed';
        btnEl.innerHTML = '<i class="fas fa-lock mr-1.5"></i> Batas Putar Habis (2x)';
    }
};

window.onAudioEnded = function(el, key) {
    audioPlayCounts[key] = (audioPlayCounts[key] || 0) + 1;
    const sisa = 2 - audioPlayCounts[key];
    const span = document.getElementById(`audio-sisa-${key}`);
    if (span) span.innerText = sisa;
    if (sisa <= 0) {
        el.removeAttribute('controls');
        const warn = document.getElementById(`audio-warn-${key}`);
        if (warn) {
            warn.innerHTML = '<i class="fas fa-times-circle mr-1"></i> Batas pemutaran audio (2x) telah habis.';
            warn.className = 'text-xs font-bold text-red-600 mt-1.5';
        }
    }
};

// ============================================================================
// GENERATOR PDF RAPOR A4 (100% PRESISI CANVAS)
// ============================================================================
function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke = null, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawGraduationCapIcon(ctx, cx, cy, scale = 1, color = '#FFFFFF') {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(36, -6); ctx.lineTo(0, 12); ctx.lineTo(-36, -6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-20, 4); ctx.lineTo(-20, 18); ctx.quadraticCurveTo(0, 30, 20, 18); ctx.lineTo(20, 4); ctx.lineTo(0, 15); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(28, -2); ctx.lineTo(31, 20); ctx.stroke();
    ctx.beginPath(); ctx.arc(31, 22, 3.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function wrapCanvasText(ctx, text, maxWidth) {
    const lines = [];
    String(text || '').split('\n').forEach(para => {
        const words = para.trim().split(/\s+/);
        if (!words[0]) return lines.push('');
        let cur = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = cur + ' ' + words[i];
            if (ctx.measureText(test).width <= maxWidth) cur = test;
            else { lines.push(cur); cur = words[i]; }
        }
        lines.push(cur);
    });
    return lines;
}

function drawBlueBackgroundArtwork(ctx, W, H) {
    ctx.save();
    const fillShape = (drawFn, style) => { ctx.beginPath(); drawFn(); ctx.fillStyle = style; ctx.fill(); };

    const gTop = ctx.createLinearGradient(W * 0.45, 0, W, 280);
    gTop.addColorStop(0, 'rgba(37, 99, 235, 0.08)'); gTop.addColorStop(1, 'rgba(14, 165, 233, 0.16)');
    fillShape(() => { ctx.moveTo(W * 0.42, 0); ctx.bezierCurveTo(W * 0.62, 210, W * 0.82, 60, W, 290); ctx.lineTo(W, 0); ctx.closePath(); }, gTop);
    fillShape(() => { ctx.moveTo(W * 0.62, 0); ctx.bezierCurveTo(W * 0.76, 130, W * 0.90, 90, W, 185); ctx.lineTo(W, 0); ctx.closePath(); }, 'rgba(29, 78, 216, 0.11)');

    const drawGlow = (x, y, r0, r1, c0, c1) => {
        const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
        g.addColorStop(0, c0); g.addColorStop(0.6, c1); g.addColorStop(1, 'rgba(59, 130, 246, 0)');
        fillShape(() => ctx.arc(x, y, r1, 0, Math.PI * 2), g);
    };
    drawGlow(W - 140, 260, 20, 560, 'rgba(59, 130, 246, 0.13)', 'rgba(59, 130, 246, 0.05)');
    drawGlow(180, H - 350, 40, 680, 'rgba(14, 165, 233, 0.13)', 'rgba(37, 99, 235, 0.05)');

    const gBot = ctx.createLinearGradient(0, H - 350, W, H);
    gBot.addColorStop(0, 'rgba(37, 99, 235, 0.12)'); gBot.addColorStop(0.5, 'rgba(59, 130, 246, 0.08)'); gBot.addColorStop(1, 'rgba(14, 165, 233, 0.14)');
    fillShape(() => { ctx.moveTo(0, H - 290); ctx.bezierCurveTo(W * 0.32, H - 410, W * 0.65, H - 140, W, H - 300); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); }, gBot);
    fillShape(() => { ctx.moveTo(0, H - 150); ctx.bezierCurveTo(W * 0.38, H - 40, W * 0.72, H - 240, W, H - 115); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); }, 'rgba(29, 78, 216, 0.11)');

    [[320, 3, 'rgba(37, 99, 235, 0.11)'], [400, 2, 'rgba(14, 165, 233, 0.09)']].forEach(([r, lw, col]) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(W - 90, H * 0.48, r, 0, Math.PI * 2); ctx.stroke();
    });

    ctx.fillStyle = 'rgba(37, 99, 235, 0.16)';
    for (let gx = 95; gx <= 315; gx += 32) {
        for (let gy = H - 360; gy <= H - 190; gy += 32) {
            ctx.beginPath(); ctx.arc(gx, gy, 3.2, 0, Math.PI * 2); ctx.fill();
        }
    }
    drawGraduationCapIcon(ctx, W - 260, H - 560, 4.2, 'rgba(37, 99, 235, 0.055)');
    ctx.restore();
}

window.downloadReportPDF = async function() {
    const btn = document.getElementById('btn-download-pdf');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating PDF...`; }

    try {
        if (document.fonts?.ready) await document.fonts.ready;
        const m = getReportMeta(currentExamSession);
        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';
        const W = 1654, H = 2339, padX = 115, contentW = W - (padX * 2);

        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Helper Teks 1-Baris agar kode ringkas & presisi
        const txt = (str, x, y, size, weight, color, align = 'left') => {
            ctx.textAlign = align;
            ctx.fillStyle = color;
            ctx.font = `${weight} ${size}px ${fontStack}`;
            ctx.fillText(str, x, y);
        };

        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
        drawBlueBackgroundArtwork(ctx, W, H);

        // Top Bar & Header
        const topBarGrad = ctx.createLinearGradient(0, 0, W, 0);
        topBarGrad.addColorStop(0, '#1E3A8A'); topBarGrad.addColorStop(0.5, '#2563EB'); topBarGrad.addColorStop(1, '#0EA5E9');
        ctx.fillStyle = topBarGrad; ctx.fillRect(0, 0, W, 28);

        const headerY = 145;
        const logoGrad = ctx.createLinearGradient(padX, headerY, padX + 118, headerY + 118);
        logoGrad.addColorStop(0, '#1D4ED8'); logoGrad.addColorStop(1, '#2563EB');
        drawRoundedRect(ctx, padX, headerY, 118, 118, 28, logoGrad);
        drawGraduationCapIcon(ctx, padX + 59, headerY + 57, 1.35, '#FFFFFF');

        txt('HAMDI ENGLISH STUDIO', padX + 146, headerY + 38, 24, 800, '#2563EB');
        txt('Student Report Card', padX + 146, headerY + 104, 58, 800, '#0F172A');

        const pillW = m.isPassed ? 230 : 340;
        drawRoundedRect(ctx, W - padX - pillW, headerY + 26, pillW, 68, 34, m.isPassed ? '#DBEAFE' : '#FFE4E6');
        txt(m.isPassed ? 'PASSED' : 'NEEDS IMPROVEMENT', W - padX - (pillW / 2), headerY + 69, 24, 800, m.isPassed ? '#1D4ED8' : '#E11D48', 'center');

        // Info Box (3 Kolom)
        const infoY = 320, infoH = 195;
        drawRoundedRect(ctx, padX, infoY, contentW, infoH, 30, '#EFF6FF');
        drawRoundedRect(ctx, padX, infoY, 14, infoH, 7, '#2563EB');

        const cols = [
            [padX + 52,   'STUDENT NAME',  m.studentName.length > 22 ? m.studentName.slice(0, 22) + '...' : m.studentName, 38, '#0F172A', `Evaluation Period: ${m.monthObj.title}`],
            [padX + 610,  'CLASS / LEVEL', m.classLevel.length > 18 ? m.classLevel.slice(0, 18) + '...' : m.classLevel,     38, '#1D4ED8', 'English Language Program'],
            [padX + 1065, 'RELEASE DATE',  m.dateEn,                                                                       34, '#0F172A', 'Medan, Indonesia']
        ];
        cols.forEach(([x, lbl, val, sz, col, sub]) => {
            txt(lbl, x, infoY + 58, 20, 800, '#3B82F6');
            txt(val, x, infoY + 114, sz, 800, col);
            txt(sub, x, infoY + 154, 22, 600, '#64748B');
        });

        // Language Skills Assessment
        const secY = 585, gridY = 620, cardW = 460, cardH = 265, gap = 28;
        drawRoundedRect(ctx, padX, secY - 26, 10, 32, 5, '#2563EB');
        txt('Language Skills Assessment', padX + 24, secY, 32, 800, '#0F172A');

        m.skills.forEach((sk, idx) => {
            const x = padX + (idx % 2) * (cardW + gap), y = gridY + Math.floor(idx / 2) * (cardH + gap);
            const band = getSkillBandInfo(sk.score);
            drawRoundedRect(ctx, x, y, cardW, cardH, 28, '#F4F8FD');
            txt(sk.title, x + 36, y + 66, 34, 800, '#0F172A');
            txt(sk.sub, x + 36, y + 102, 21, 600, '#64748B');
            txt(`${sk.score}`, x + cardW - 36, y + 88, 66, 800, '#1D4ED8', 'right');

            drawRoundedRect(ctx, x + 36, y + 138, 175, 42, 21, band.bg);
            txt(band.label, x + 123, y + 166, 19, 800, band.color, 'center');
            txt(`${sk.score} / 100`, x + cardW - 36, y + 166, 20, 700, '#94A3B8', 'right');

            const barW = cardW - 72;
            drawRoundedRect(ctx, x + 36, y + 206, barW, 18, 9, '#DCE7F7');
            drawRoundedRect(ctx, x + 36, y + 206, Math.max(18, Math.min(barW, Math.round((sk.score / 100) * barW))), 18, 9, band.bar);
        });

        // Summary Card Kanan
        const sumX = padX + (cardW + gap) * 2, sumW = W - padX - sumX, sumH = cardH * 2 + gap, sumCX = sumX + sumW / 2;
        const blueGrad = ctx.createLinearGradient(sumX, gridY, sumX + sumW, gridY + sumH);
        blueGrad.addColorStop(0, '#1E3A8A'); blueGrad.addColorStop(0.5, '#1D4ED8'); blueGrad.addColorStop(1, '#2563EB');
        drawRoundedRect(ctx, sumX, gridY, sumW, sumH, 32, blueGrad);

        ctx.save();
        ctx.beginPath(); ctx.arc(sumCX, gridY + 245, 138, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)'; ctx.stroke();
        ctx.restore();

        txt('FINAL AVERAGE', sumCX, gridY + 72, 23, 800, '#BFDBFE', 'center');
        txt(m.avgDisplay, sumCX, gridY + 272, 108, 800, '#FFFFFF', 'center');
        txt('OUT OF 100', sumCX, gridY + 318, 22, 700, '#93C5FD', 'center');
        drawRoundedRect(ctx, sumX + 44, gridY + 432, sumW - 88, 76, 38, '#FFFFFF');
        txt(`Grade ${m.gradeLetter}  •  ${m.gradeWord}`, sumCX, gridY + 480, 28, 800, '#1D4ED8', 'center');

        // Tutor's Note
        const noteTitleY = 1255, noteBoxY = 1290, noteBoxH = 440;
        drawRoundedRect(ctx, padX, noteTitleY - 26, 10, 32, 5, '#2563EB');
        txt("Tutor's Note & Evaluation", padX + 24, noteTitleY, 32, 800, '#0F172A');
        drawRoundedRect(ctx, padX, noteBoxY, contentW, noteBoxH, 30, '#EFF6FF');
        drawRoundedRect(ctx, padX, noteBoxY, 14, noteBoxH, 7, '#2563EB');

        let fSize = 33, lHeight = 52, wrapped = [];
        for (const [fs, lh, maxL] of [[33, 52, 5], [29, 44, 8], [25, 38, 99]]) {
            fSize = fs; lHeight = lh;
            ctx.font = `600 ${fSize}px ${fontStack}`;
            wrapped = wrapCanvasText(ctx, m.tutorNote, contentW - 130);
            if (wrapped.length <= maxL) break;
        }
        const visLines = wrapped.slice(0, 10);
        const startY = noteBoxY + Math.max(78, Math.round((noteBoxH - visLines.length * lHeight) / 2) + 28);
        visLines.forEach((line, i) => txt(line, padX + 64, startY + i * lHeight, fSize, 600, '#1E293B'));

        // Footer & Signature
        const footY = 1815, sigCX = W - padX - 210;
        drawRoundedRect(ctx, padX, footY + 95, 76, 76, 20, '#DBEAFE');
        drawGraduationCapIcon(ctx, padX + 38, footY + 131, 0.85, '#1D4ED8');
        txt('Hamdi English Studio', padX + 98, footY + 128, 30, 800, '#0F172A');
        txt('Friendly Learning Space  •  English Course & Private Class', padX + 98, footY + 164, 22, 600, '#64748B');
        drawRoundedRect(ctx, padX, footY + 198, 560, 56, 28, '#F0F7FF');
        txt(`Completed Level: ${m.classLevel} (${m.monthObj.title})`, padX + 28, footY + 234, 21, 700, '#1D4ED8');

        txt(`Medan, ${m.dateEn}`, sigCX, footY + 45, 25, 700, '#475569', 'center');
        await new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const r = Math.min(360 / img.width, 175 / img.height);
                ctx.drawImage(img, sigCX - (img.width * r) / 2, footY + 62 + (175 - img.height * r) / 2, img.width * r, img.height * r);
                res();
            };
            img.onerror = res;
            img.src = 'signature.png';
        });

        ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(sigCX - 190, footY + 252); ctx.lineTo(sigCX + 190, footY + 252); ctx.stroke();
        txt('Hamdi Rizal', sigCX, footY + 296, 32, 800, '#0F172A', 'center');
        txt('English Tutor', sigCX, footY + 330, 21, 800, '#2563EB', 'center');

        if (window.jspdf?.jsPDF) {
            const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, 297);
            pdf.save(`Report_Card_${m.studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${m.classLevel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
            showToast('Report Card PDF downloaded!', 'success');
        } else window.print();
    } catch (err) {
        console.error('PDF generation error:', err);
        window.print();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
};

// ============================================================================
// RENDER HALAMAN UJIAN & RAPOR WEB
// ============================================================================
function renderStudentExamPage() {
    const m = getReportMeta(currentExamSession);
    document.getElementById('exam-header-title').innerText = `Evaluasi Akhir: ${m.monthObj.title}`;
    const reportBox = document.getElementById('exam-final-report-box');
    const tabsNav = document.getElementById('exam-tabs-nav');
    const content = document.getElementById('exam-content-area');

    if (window.HES.userRole === 'admin') {
        reportBox.classList.add('hidden'); tabsNav.classList.add('hidden');
        content.innerHTML = `
            <div class="hes-card flex flex-col sm:flex-row items-center justify-between gap-4 border border-blue-100">
                <div>
                    <h4 class="font-extrabold text-slate-800 text-base"><i class="fas fa-shield-alt text-blue-600 mr-1.5"></i> Mode Administrator</h4>
                    <p class="text-xs text-slate-500 mt-1">Kelola soal ujian, tulis Level Kelas, Tutor's Note, dan nilai murid di Panel Admin.</p>
                </div>
                <a href="admin.html?tab=exam" class="hes-btn-primary shrink-0"><i class="fas fa-sliders-h"></i> Buka Builder Ujian</a>
            </div>`;
        return;
    }

    const examData = window.HES.materials[`exam-${m.email}-${currentExamSession}`];
    const examResult = m.examResult;

    if (!examData) {
        reportBox.classList.add('hidden'); tabsNav.classList.add('hidden');
        content.innerHTML = `<div class="hes-card text-center py-12 text-slate-400 font-bold text-sm border-dashed">Soal ujian untuk ${m.monthObj.title} belum diterbitkan oleh Admin.</div>`;
        return;
    }

    tabsNav.classList.remove('hidden');
    const cat = currentStudentExamTab;
    const icons = { reading: 'fa-book-open', writing: 'fa-pen-nib', speaking: 'fa-microphone-lines', listening: 'fa-headphones' };

    ['reading', 'writing', 'speaking', 'listening'].forEach(t => {
        const btn = document.getElementById(`stu-tab-${t}`);
        const isDone = examResult?.submittedTabs?.includes(t) || examResult?.status === 'submitted';
        btn.innerHTML = `<i class="fas ${icons[t]} mr-1.5"></i> <span class="capitalize">${t}</span> ${isDone ? '<i class="fas fa-check-circle text-emerald-500 ml-1.5"></i>' : ''}`;
        btn.className = `py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center ${t === cat ? 'bg-white text-blue-600 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-800'}`;
    });

    // Tampilkan Rapor jika sudah dinilai
    if (examResult?.isGraded) {
        const skillCards = m.skills.map(sk => {
            const b = getSkillBandInfo(sk.score);
            return `
                <div class="p-5 rounded-2xl bg-[#F4F8FD] flex flex-col justify-between">
                    <div class="flex items-start justify-between gap-2">
                        <div><h4 class="text-base sm:text-lg font-extrabold text-slate-900">${sk.title}</h4><p class="text-xs font-semibold text-slate-500 mt-0.5">${sk.sub}</p></div>
                        <span class="text-3xl font-extrabold text-blue-700 leading-none">${sk.score}</span>
                    </div>
                    <div class="mt-4">
                        <div class="flex items-center justify-between mb-2">
                            <span class="px-3 py-0.5 rounded-full text-[11px] font-extrabold" style="background:${b.bg}; color:${b.color};">${b.label}</span>
                            <span class="text-xs font-bold text-slate-400">${sk.score} / 100</span>
                        </div>
                        <div class="w-full h-2.5 rounded-full bg-blue-100/80 overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-500" style="width:${Math.max(6, Math.min(100, sk.score))}%; background:${b.bar};"></div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        reportBox.classList.remove('hidden');
        reportBox.innerHTML = `
            <div id="report-action-bar" class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-blue-600 text-white px-5 py-3.5 rounded-2xl shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center text-sm font-black shrink-0"><i class="fas fa-graduation-cap"></i></div>
                    <div><p class="text-xs sm:text-sm font-extrabold text-white">Student Report Card</p><p class="text-[11px] text-blue-100">Ready to download as a 1-page A4 PDF</p></div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-download-pdf" onclick="downloadReportPDF()" class="bg-white hover:bg-blue-50 text-blue-700 font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer"><i class="fas fa-download"></i> Download PDF</button>
                    <button onclick="window.print()" class="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition cursor-pointer" title="Print Report"><i class="fas fa-print"></i></button>
                </div>
            </div>

            <div id="printable-report" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="bg-white mx-auto rounded-3xl shadow-md overflow-hidden text-slate-800 max-w-[840px] relative">
                <div class="h-2.5 w-full bg-gradient-to-r from-blue-900 via-blue-600 to-sky-400"></div>
                <div class="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-blue-500/[0.10] pointer-events-none"></div>
                <div class="absolute top-12 right-16 w-44 h-44 rounded-full border-[3px] border-blue-500/[0.10] pointer-events-none"></div>
                <div class="absolute -bottom-24 -left-20 w-96 h-96 rounded-full bg-sky-500/[0.10] pointer-events-none"></div>

                <div class="relative z-10 p-6 sm:p-10 pt-8 sm:pt-11 space-y-7">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div class="flex items-center gap-4">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 text-white flex items-center justify-center text-2xl shadow-sm shrink-0"><i class="fas fa-graduation-cap"></i></div>
                            <div><p class="text-xs font-extrabold uppercase tracking-widest text-blue-600">Hamdi English Studio</p><h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">Student Report Card</h1></div>
                        </div>
                        <span class="self-start sm:self-center inline-flex items-center px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${m.isPassed ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}">${m.isPassed ? 'Passed' : 'Needs Improvement'}</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-5 bg-[#EFF6FF] p-5 sm:p-6 rounded-2xl border-l-4 border-l-blue-600">
                        <div><p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Student Name</p><p class="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 truncate">${m.studentName}</p><p class="text-xs font-semibold text-slate-500 mt-0.5">Evaluation Period: ${m.monthObj.title}</p></div>
                        <div><p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Class / Level</p><p class="text-lg sm:text-xl font-extrabold text-blue-700 mt-1 truncate">${m.classLevel}</p><p class="text-xs font-semibold text-slate-500 mt-0.5">English Language Program</p></div>
                        <div><p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Release Date</p><p class="text-base sm:text-lg font-extrabold text-slate-900 mt-1">${m.dateEn}</p><p class="text-xs font-semibold text-slate-500 mt-0.5">Medan, Indonesia</p></div>
                    </div>

                    <div>
                        <div class="flex items-center gap-2.5 mb-3.5"><span class="w-1.5 h-5 rounded-full bg-blue-600"></span><h3 class="text-base sm:text-lg font-extrabold text-slate-900">Language Skills Assessment</h3></div>
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                            <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">${skillCards}</div>
                            <div class="lg:col-span-4 rounded-2xl bg-gradient-to-b from-blue-900 via-blue-700 to-blue-600 text-white p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <p class="text-xs font-extrabold uppercase tracking-widest text-blue-200">Final Average</p>
                                <div class="w-32 h-32 rounded-full bg-white/10 border-2 border-blue-300/40 flex flex-col items-center justify-center my-3.5">
                                    <span class="text-5xl font-extrabold text-white leading-none">${m.avgDisplay}</span>
                                    <span class="text-[10px] font-bold text-blue-200 mt-1">OUT OF 100</span>
                                </div>
                                <span class="w-full py-2 px-4 rounded-full bg-white text-blue-700 font-extrabold text-xs sm:text-sm">Grade ${m.gradeLetter} &bull; ${m.gradeWord}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="flex items-center gap-2.5 mb-3"><span class="w-1.5 h-5 rounded-full bg-blue-600"></span><h3 class="text-base sm:text-lg font-extrabold text-slate-900">Tutor's Note & Evaluation</h3></div>
                        <div class="rounded-2xl bg-[#EFF6FF] border-l-4 border-l-blue-600 p-6"><p class="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed whitespace-pre-line">${m.tutorNote}</p></div>
                    </div>

                    <div class="pt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                        <div class="space-y-2.5">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-base"><i class="fas fa-graduation-cap"></i></div>
                                <div><p class="text-sm font-extrabold text-slate-900">Hamdi English Studio</p><p class="text-xs font-semibold text-slate-500">Friendly Learning Space &bull; English Course & Private Class</p></div>
                            </div>
                            <span class="inline-block px-3.5 py-1.5 rounded-full bg-[#F0F7FF] text-blue-700 text-xs font-bold">Completed Level: ${m.classLevel} (${m.monthObj.title})</span>
                        </div>
                        <div class="text-center min-w-[210px]">
                            <p class="text-xs sm:text-sm font-bold text-slate-600 mb-2">Medan, ${m.dateEn}</p>
                            <img src="signature.png" alt="Signature" class="h-16 mx-auto object-contain my-1" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\\'h-16\\'></div>');">
                            <div class="border-t border-slate-300 pt-2 mt-1"><p class="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">Hamdi Rizal</p><p class="text-xs font-bold text-blue-600 mt-0.5">English Tutor</p></div>
                        </div>
                    </div>
                </div>
            </div>`;
    } else reportBox.classList.add('hidden');

    const questions = examData[cat] || [];
    if (!questions.length) {
        content.innerHTML = `<div class="hes-card text-center py-10 text-xs font-bold text-slate-400">Tidak ada soal pada bagian ${cat.toUpperCase()}.</div>`;
        return;
    }

    const isSubmitted = examResult?.submittedTabs?.includes(cat) || (examResult?.status === 'submitted' && !examResult?.submittedTabs?.length);
    const maxPts = Math.round((100 / questions.length) * 10) / 10;

    // Tampilan Setelah Dikumpulkan
    if (isSubmitted) {
        const secScore = computeExamSectionScore(cat, examData, examResult);
        content.innerHTML = `
            <div class="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex flex-wrap justify-between items-center gap-2">
                <span><i class="fas fa-check-circle text-emerald-600 mr-1.5"></i> Bagian <strong>${cat.toUpperCase()}</strong> telah dikumpulkan.</span>
                <span class="px-3 py-1 rounded-full bg-white text-emerald-700 font-extrabold border border-emerald-200">Skor Bagian: ${secScore} / 100</span>
            </div>
            <div class="space-y-4">
                ${questions.map((q, idx) => {
                    const key = `${cat}_${idx}`, sAns = examResult.answers?.[key] ?? '', isMCQ = q.type === 'mcq';
                    const isCorrect = isMCQ ? (sAns !== '' && Number(sAns) === Number(q.answer)) : true;
                    const qNote = examResult.questionNotes?.[key] || '';
                    const autoScript = q.audioScript || (!String(q.mediaUrl || '').startsWith('http') ? (q.mediaUrl || '') : '');

                    let earnedPts = isMCQ ? (isCorrect ? maxPts : 0) : (sAns ? 8.5 : 0);
                    if (!isMCQ && examResult.scores?.[key] !== undefined) {
                        const raw = parseFloat(examResult.scores[key]) || 0;
                        earnedPts = raw <= 10 ? raw : Math.round((raw / 100) * 10 * 10) / 10;
                    }

                    const dispAns = isMCQ
                        ? (sAns !== '' ? `<strong>${['A','B','C','D'][sAns] || ''}.</strong> ${q.options?.[sAns] || ''}` : 'Tidak dijawab')
                        : (String(sAns).startsWith('data:audio')
                            ? `<div class="space-y-2 mt-1"><p class="text-[11px] font-bold text-indigo-700"><i class="fas fa-headphones mr-1"></i> Rekaman Suaramu:</p><audio controls preload="metadata" class="w-full h-10 outline-none rounded-lg" src="${sAns}"></audio></div>`
                            : (sAns || 'Tidak dijawab'));

                    return `
                        <div class="hes-card space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-extrabold text-slate-500">Soal #${idx + 1}</span>
                                <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold ${earnedPts >= 7 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">Poin: ${earnedPts} / ${maxPts}</span>
                            </div>
                            <p class="text-sm font-bold text-slate-800">${(q.question || '').replace(/\n/g, '<br>')}</p>
                            ${cat === 'listening' && autoScript ? `
                                <div class="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    <div class="whitespace-pre-line"><strong class="text-blue-800">Naskah Audio Listening:</strong>\n<span class="text-slate-700">${autoScript}</span></div>
                                    <button type="button" onclick="playExamQuestionAudio('${cat}', ${idx}, 'script', null, this)" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-extrabold shrink-0 cursor-pointer"><i class="fas fa-volume-up mr-1"></i> Putar Audio</button>
                                </div>` : ''}
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                                    <strong class="text-slate-500 uppercase text-[10px]">Jawaban / Rekamanmu:</strong>
                                    <div class="mt-1 font-bold ${isMCQ ? (isCorrect ? 'text-emerald-600' : 'text-red-600') : 'text-slate-800'}">${dispAns}</div>
                                </div>
                                <div class="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                                    <div class="flex items-center justify-between">
                                        <strong class="text-indigo-900 uppercase text-[10px]">Kunci / Pelafalan:</strong>
                                        ${cat === 'speaking' && q.answer ? `<button type="button" onclick="playExamQuestionAudio('${cat}', ${idx}, 'answer', null, this)" class="text-[11px] font-extrabold text-indigo-600 hover:underline cursor-pointer"><i class="fas fa-volume-up mr-1"></i>Dengar Cara Baca</button>` : ''}
                                    </div>
                                    <div class="mt-1 font-bold text-indigo-700">${isMCQ ? `${['A','B','C','D'][q.answer] || ''}. ${q.options?.[q.answer] || ''}` : (q.answer || 'Dinilai oleh Tutor')}</div>
                                </div>
                            </div>
                            ${qNote ? `<p class="p-3 rounded-xl bg-rose-50 text-rose-900 text-xs border border-rose-200"><strong><i class="fas fa-user-check text-rose-600 mr-1"></i> Koreksi Tutor:</strong> ${qNote}</p>` : ''}
                            ${q.explanation ? `<p class="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs border border-amber-100"><strong><i class="fas fa-lightbulb text-amber-500 mr-1"></i> Pembahasan:</strong> ${q.explanation}</p>` : ''}
                        </div>`;
                }).join('')}
            </div>`;
        return;
    }

    // Tampilan Saat Mengerjakan Ujian
    content.innerHTML = `
        <div class="space-y-4">
            ${questions.map((q, idx) => {
                const key = `${cat}_${idx}`, saved = studentExamAnswers[key] ?? '', sisa = Math.max(0, 2 - (audioPlayCounts[key] || 0));
                const autoScript = q.audioScript || (!String(q.mediaUrl || '').startsWith('http') ? (q.mediaUrl || '') : '');
                const mp3Url = String(q.mediaUrl || '').startsWith('http') ? q.mediaUrl : '';

                let mediaHTML = '';
                if (cat === 'listening' && autoScript) {
                    mediaHTML = sisa > 0 ? `
                        <div class="my-3 p-4 bg-blue-50/70 rounded-2xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div><p class="text-xs font-extrabold text-blue-950"><i class="fas fa-headphones-alt text-blue-600 mr-1.5"></i> Audio Listening</p><p class="text-[11px] font-bold text-amber-700 mt-0.5">Sisa kesempatan putar: <span id="audio-sisa-${key}">${sisa}</span>x</p></div>
                            <button type="button" onclick="playExamQuestionAudio('${cat}', ${idx}, 'script', '${key}', this)" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-xs transition shrink-0 cursor-pointer"><i class="fas fa-play mr-1.5"></i> Putar Audio Listening</button>
                        </div>` : `<p class="my-3 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-200"><i class="fas fa-lock mr-1"></i> Batas putar audio (2x) telah habis.</p>`;
                } else if (mp3Url) {
                    mediaHTML = sisa > 0 ? `
                        <div class="my-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                            <audio controls class="w-full h-10 outline-none" onplay="if((audioPlayCounts['${key}']||0)>=2){this.pause();this.removeAttribute('controls');}" onended="onAudioEnded(this, '${key}')"><source src="${getDriveDirectStreamLink(mp3Url)}"></audio>
                            <p id="audio-warn-${key}" class="text-xs font-bold text-amber-600 mt-1.5"><i class="fas fa-exclamation-circle mr-1"></i> Sisa kesempatan putar audio: <span id="audio-sisa-${key}">${sisa}</span>x</p>
                        </div>` : `<p class="my-3 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-200"><i class="fas fa-times-circle mr-1"></i> Batas putar audio (2x) telah habis.</p>`;
                }

                let inputHTML = '';
                if (q.type === 'mcq') {
                    inputHTML = ['A', 'B', 'C', 'D'].map((lbl, oIdx) => `
                        <label class="flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/40 hover:border-blue-300 transition mb-2">
                            <input type="radio" name="ans_${key}" value="${oIdx}" ${saved !== '' && Number(saved) === oIdx ? 'checked' : ''} onchange="studentExamAnswers['${key}']=${oIdx}" class="w-4 h-4 text-blue-600">
                            <span class="text-xs sm:text-sm font-semibold text-slate-700"><strong>${lbl}.</strong> ${q.options?.[oIdx] || ''}</span>
                        </label>`).join('');
                } else if (cat === 'speaking') {
                    const hasAud = String(saved).startsWith('data:audio');
                    inputHTML = `
                        <div class="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/80 mt-2 space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-3">
                                <div class="flex flex-wrap items-center gap-2.5">
                                    <button type="button" id="btn-record-${idx}" onclick="startVoiceRecord(${idx})" class="hes-btn-primary !bg-blue-600 hover:!bg-blue-700 !py-2.5 !px-4 !text-xs cursor-pointer"><i class="fas fa-microphone"></i> ${hasAud ? 'Rekam Ulang Suara' : 'Mulai Rekam Suara'}</button>
                                    <button type="button" id="btn-stop-${idx}" onclick="stopVoiceRecord(${idx})" class="hidden bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition animate-pulse cursor-pointer"><i class="fas fa-stop mr-1"></i> Selesai & Simpan Rekaman</button>
                                </div>
                                <span id="rec-status-${idx}" class="text-xs font-extrabold ${hasAud ? 'text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full' : 'text-slate-400'}">${hasAud ? '✓ Rekaman Tersimpan' : 'Belum ada rekaman'}</span>
                            </div>
                            <audio id="audio-playback-${idx}" controls preload="metadata" src="${hasAud ? saved : ''}" class="${hasAud ? '' : 'hidden'} h-10 w-full outline-none rounded-lg"></audio>
                        </div>`;
                } else {
                    inputHTML = `<textarea oninput="studentExamAnswers['${key}']=this.value" rows="3" class="hes-input mt-2" placeholder="Ketik jawabanmu di sini...">${saved}</textarea>`;
                }

                return `
                    <div class="hes-card">
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">Soal #${idx + 1}</span>
                            <span class="text-xs font-extrabold text-slate-400">${maxPts} Poin</span>
                        </div>
                        <p class="font-bold text-slate-800 text-sm mt-3 leading-relaxed">${(q.question || '').replace(/\n/g, '<br>')}</p>
                        ${mediaHTML}
                        <div class="mt-4">${inputHTML}</div>
                    </div>`;
            }).join('')}
        </div>
        <div class="hes-card !bg-blue-600 text-white text-center mt-6 border-none shadow-md">
            <h4 class="font-extrabold text-base mb-1">Selesai Mengerjakan Bagian ${cat.toUpperCase()}?</h4>
            <p class="text-xs text-blue-100 mb-5">Pastikan seluruh ${questions.length} soal sudah terjawab sebelum dikumpulkan.</p>
            <button id="btn-submit-exam-tab" onclick="submitStudentExam('${currentExamSession}', '${cat}')" class="bg-white text-blue-700 hover:bg-blue-50 px-6 py-3 rounded-xl text-sm font-extrabold shadow-sm transition inline-flex items-center gap-2 cursor-pointer"><i class="fas fa-paper-plane"></i> Kumpulkan Bagian ${cat.toUpperCase()}</button>
        </div>`;
}

// ============================================================================
// PEREKAM SUARA SPEAKING & SUBMIT UJIAN KE CLOUD
// ============================================================================
function getSupportedAudioMimeType() {
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) || '';
}

window.startVoiceRecord = async function(qIndex) {
    try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') await stopVoiceRecord(activeRecordingIndex);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getSupportedAudioMimeType();
        mediaRecorder = new MediaRecorder(stream, mimeType ? { audioBitsPerSecond: 24000, mimeType } : { audioBitsPerSecond: 24000 });
        audioChunks = [];
        activeRecordingIndex = qIndex;

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            try {
                speechRecInstance = new SpeechRec();
                speechRecInstance.lang = 'en-US';
                speechRecInstance.continuous = true;
                let spoken = '';
                speechRecInstance.onresult = ev => {
                    for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) spoken += ev.results[i][0].transcript + ' ';
                    if (spoken.trim()) studentExamTranscripts[`speaking_${qIndex}`] = spoken.trim();
                };
                speechRecInstance.start();
            } catch (e) {}
        }

        mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const reader = new FileReader();
            reader.onloadend = () => {
                studentExamAnswers[`speaking_${qIndex}`] = reader.result;
                const pb = document.getElementById(`audio-playback-${qIndex}`);
                if (pb) { pb.src = reader.result; pb.classList.remove('hidden'); }
                const st = document.getElementById(`rec-status-${qIndex}`);
                if (st) { st.className = 'text-xs font-extrabold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full'; st.innerText = '✓ Rekaman Tersimpan'; }
                showToast(`Rekaman Soal #${qIndex + 1} berhasil disimpan!`, 'success');
                activeRecordingStopPromiseResolve?.();
                activeRecordingStopPromiseResolve = null;
            };
            reader.readAsDataURL(new Blob(audioChunks, { type: mediaRecorder.mimeType || mimeType || 'audio/webm' }));
            stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.start(250);
        document.getElementById(`btn-record-${qIndex}`)?.classList.add('hidden');
        document.getElementById(`btn-stop-${qIndex}`)?.classList.remove('hidden');
        const st = document.getElementById(`rec-status-${qIndex}`);
        if (st) { st.className = 'text-xs font-extrabold text-red-600 animate-pulse'; st.innerText = '● Sedang Merekam Suara...'; }
    } catch (e) {
        showToast('Aktifkan izin mikrofon di browser kamu ya.', 'error');
    }
};

window.stopVoiceRecord = function(qIndex) {
    return new Promise(resolve => {
        try { speechRecInstance?.stop(); } catch (e) {}
        speechRecInstance = null;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            activeRecordingStopPromiseResolve = resolve;
            mediaRecorder.stop();
            document.getElementById(`btn-stop-${qIndex}`)?.classList.add('hidden');
            const btn = document.getElementById(`btn-record-${qIndex}`);
            if (btn) { btn.classList.remove('hidden'); btn.innerHTML = '<i class="fas fa-redo mr-1.5"></i> Rekam Ulang Suara'; }
        } else resolve();
    });
};

window.submitStudentExam = async function(monthId, tab) {
    window.stopNaturalEnglishTTS();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        showToast('Menyelesaikan rekaman suara terlebih dahulu...', 'info');
        await stopVoiceRecord(activeRecordingIndex);
    }
    if (!confirm(`Kumpulkan jawaban bagian ${tab.toUpperCase()} sekarang?`)) return;

    const submitBtn = document.getElementById('btn-submit-exam-tab');
    const origBtnHTML = submitBtn?.innerHTML || '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Menyimpan Jawaban ke Cloud...`; }

    try {
        const email = window.HES.currentUser.email;
        const examData = window.HES.materials[`exam-${email}-${monthId}`];
        const rKey = `exam_result-${email}-${monthId}`;

        const { error } = await safeSaveMaterialsToCloud(materials => {
            const res = Object.assign({ status: 'partial', answers: {}, scores: {}, sectionScores: {}, transcripts: {}, submittedTabs: [] }, materials[rKey]);
            (examData?.[tab] || []).forEach((q, idx) => {
                const key = `${tab}_${idx}`, ans = studentExamAnswers[key];
                if (ans !== undefined) res.answers[key] = ans;
                if (studentExamTranscripts[key]) res.transcripts[key] = studentExamTranscripts[key];
                if (q.type === 'mcq') res.scores[key] = (ans !== undefined && ans !== '' && Number(ans) === Number(q.answer)) ? 10 : 0;
                else if (res.scores[key] === undefined && res.answers[key]) res.scores[key] = 8.5;
            });
            ['reading', 'writing', 'speaking', 'listening'].forEach(c => res.sectionScores[c] = computeExamSectionScore(c, examData, res));
            if (!res.submittedTabs.includes(tab)) res.submittedTabs.push(tab);
            if (res.submittedTabs.length >= 4) res.status = 'submitted';
            materials[rKey] = res;
        });

        if (error) throw error;
        showToast(`Bagian ${tab.toUpperCase()} berhasil dikumpulkan!`, 'success');
        sendTelegramNotification(`📝 *Ujian Disubmit (${tab.toUpperCase()})*\nMurid: ${window.HES.currentUser.name}\nSkor Otomatis: ${window.HES.materials[rKey].sectionScores[tab]}/100`);
        renderStudentExamPage();
    } catch (err) {
        showToast('Gagal menyimpan ke Cloud: ' + (err?.message || 'Periksa koneksi internet'), 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origBtnHTML; }
    }
};