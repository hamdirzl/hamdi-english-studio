// js/exam.js

let studentExamAnswers = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [];

// Load jsPDF library for direct, crystal-clear 1-page A4 PDF generation (Zero cutoff / Zero html2canvas bugs)
if (!document.getElementById('jspdf-lib')) {
    const script = document.createElement('script');
    script.id = 'jspdf-lib';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(script);
}

// Print CSS fallback (1-page strict A4)
if (!document.getElementById('pdf-print-style')) {
    const style = document.createElement('style');
    style.id = 'pdf-print-style';
    style.innerHTML = `
        @media print {
            @page { size: A4 portrait; margin: 8mm; }
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
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 194mm !important;
                margin: 0 auto !important;
                box-shadow: none !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
    `;
    document.head.appendChild(style);
}

// Helper: Format Date in English (e.g., "October 23, 2026")
function formatEnglishDate(dateInput) {
    const d = dateInput instanceof Date && !isNaN(dateInput) ? dateInput : new Date();
    const monthsEn = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthsEn[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Helper: Skill Descriptor in English
function getSkillBandInfo(score) {
    const s = Number(score) || 0;
    if (s >= 90) return { label: 'Outstanding', color: '#10B981', bg: '#ECFDF5', bar: '#10B981' };
    if (s >= 80) return { label: 'Very Good',   color: '#4F46E5', bg: '#EEF2FF', bar: '#4F46E5' };
    if (s >= 70) return { label: 'Satisfactory', color: '#D97706', bg: '#FFFBEB', bar: '#F59E0B' };
    return { label: 'Needs Practice', color: '#E11D48', bg: '#FFF1F2', bar: '#F43F5E' };
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

// Helper for Canvas Rounded Rectangles
function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (strokeStyle) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();
    }
}

// Helper for Canvas Multiline Text Wrapping
function wrapCanvasText(ctx, text, maxWidth) {
    const paragraphs = String(text || '').split('\n');
    const lines = [];
    paragraphs.forEach(para => {
        const words = para.trim().split(/\s+/);
        if (!words[0]) {
            lines.push('');
            return;
        }
        let currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            if (ctx.measureText(testLine).width <= maxWidth) {
                currentLine = testLine;
            } else {
                lines.push(currentLine);
                currentLine = words[i];
            }
        }
        lines.push(currentLine);
    });
    return lines;
}

// High-Resolution 1-Page A4 PDF Generator (Never Cut Off, Never 2 Pages)
window.downloadReportPDF = async function() {
    const btn = document.getElementById('btn-download-pdf');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating PDF...`;
    }

    try {
        const monthId = currentExamSession;
        const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
        const email = window.HES.currentUser.email;
        const studentName = window.HES.currentUser.name || 'Student';
        const examResult = window.HES.materials[`exam_result-${email}-${monthId}`] || {};

        const sc = examResult.sectionScores || {};
        const vReading = Number(sc.reading ?? 0);
        const vWriting = Number(sc.writing ?? 0);
        const vSpeaking = Number(sc.speaking ?? 0);
        const vListening = Number(sc.listening ?? 0);

        const avgRaw = (vReading + vWriting + vSpeaking + vListening) / 4;
        const avgDisplay = Number.isInteger(avgRaw) ? String(avgRaw) : avgRaw.toFixed(1);
        const isPassed = avgRaw >= 70;

        let gradeLetter = 'D', gradeLabel = 'Needs Improvement';
        if (avgRaw >= 90) { gradeLetter = 'A'; gradeLabel = 'Distinction'; }
        else if (avgRaw >= 80) { gradeLetter = 'B'; gradeLabel = 'Merit'; }
        else if (avgRaw >= 70) { gradeLetter = 'C'; gradeLabel = 'Pass'; }

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const dateEn = formatEnglishDate(docDate);
        const classLevel = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNote = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'The student has demonstrated commendable dedication and progress throughout this learning module. Keep practicing consistently to further enhance your English fluency and confidence.';
        const docId = `HES-${docDate.getFullYear()}${String(docDate.getMonth() + 1).padStart(2, '0')}-${monthId.toUpperCase()}`;

        // Create High-Res A4 Canvas (1654 x 2339 px = exact 210:297 A4 aspect ratio)
        const W = 1654, H = 2339;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // 1. Background & Outer Luxury Border
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);

        // Outer Frame
        drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 28, '#FFFFFF', '#E2E8F0', 3);
        drawRoundedRect(ctx, 62, 62, W - 124, H - 124, 22, null, '#C7D2FE', 1.5);

        // 2. Executive Top Banner (Royal Navy -> Indigo Gradient)
        const headerGrad = ctx.createLinearGradient(80, 80, W - 80, 360);
        headerGrad.addColorStop(0, '#0F172A');
        headerGrad.addColorStop(0.55, '#1E1B4B');
        headerGrad.addColorStop(1, '#312E81');
        drawRoundedRect(ctx, 84, 84, W - 168, 260, 22, headerGrad);

        // Gold Accent Bar inside Banner
        const goldGrad = ctx.createLinearGradient(84, 334, W - 84, 334);
        goldGrad.addColorStop(0, '#F59E0B');
        goldGrad.addColorStop(0.5, '#FDE68A');
        goldGrad.addColorStop(1, '#D97706');
        ctx.fillStyle = goldGrad;
        ctx.fillRect(84, 334, W - 168, 10);

        // Crest Icon Box
        drawRoundedRect(ctx, 130, 134, 110, 110, 22, 'rgba(255,255,255,0.12)', 'rgba(253,230,138,0.45)', 2);
        ctx.fillStyle = '#FDE68A';
        ctx.font = '900 46px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('HES', 185, 205);

        // Header Titles
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FCD34D';
        ctx.font = '800 22px Nunito, sans-serif';
        ctx.fillText('HAMDI ENGLISH STUDIO  •  OFFICIAL ACADEMIC RECORD', 270, 158);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 54px Nunito, sans-serif';
        ctx.fillText('STUDENT REPORT CARD', 270, 220);

        ctx.fillStyle = '#C7D2FE';
        ctx.font = '600 24px Nunito, sans-serif';
        ctx.fillText(`Document ID: ${docId}   |   Evaluation Period: ${monthObj.title}`, 270, 264);

        // Status Pill on Top Right of Banner
        const statusBg = isPassed ? '#059669' : '#E11D48';
        const statusText = isPassed ? 'STATUS: PASSED' : 'NEEDS IMPROVEMENT';
        drawRoundedRect(ctx, W - 430, 145, 290, 64, 32, statusBg, '#FFFFFF', 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 23px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(statusText, W - 285, 185);

        // 3. Student Information Section (3 Clean Columns: Student Name, Class / Level, Date of Issue)
        const infoY = 390;
        drawRoundedRect(ctx, 84, infoY, W - 168, 175, 20, '#F8FAFC', '#E2E8F0', 2);

        // Dividers
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(680, infoY + 28); ctx.lineTo(680, infoY + 147);
        ctx.moveTo(1160, infoY + 28); ctx.lineTo(1160, infoY + 147);
        ctx.stroke();

        // Col 1: Student Name
        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748B';
        ctx.font = '800 20px Nunito, sans-serif';
        ctx.fillText('STUDENT NAME', 124, infoY + 58);
        ctx.fillStyle = '#0F172A';
        ctx.font = '900 36px Nunito, sans-serif';
        const dispName = studentName.length > 24 ? studentName.substring(0, 24) + '...' : studentName;
        ctx.fillText(dispName, 124, infoY + 115);

        // Col 2: Class / Level
        ctx.fillStyle = '#64748B';
        ctx.font = '800 20px Nunito, sans-serif';
        ctx.fillText('CLASS / LEVEL', 720, infoY + 58);
        ctx.fillStyle = '#4338CA';
        ctx.font = '900 34px Nunito, sans-serif';
        const dispLevel = classLevel.length > 20 ? classLevel.substring(0, 20) + '...' : classLevel;
        ctx.fillText(dispLevel, 720, infoY + 115);

        // Col 3: Date of Issue
        ctx.fillStyle = '#64748B';
        ctx.font = '800 20px Nunito, sans-serif';
        ctx.fillText('DATE OF ISSUE', 1200, infoY + 58);
        ctx.fillStyle = '#0F172A';
        ctx.font = '800 32px Nunito, sans-serif';
        ctx.fillText(dateEn, 1200, infoY + 115);

        // 4. Section Title: Language Proficiency Breakdown
        const secY = 625;
        ctx.fillStyle = '#1E1B4B';
        ctx.font = '900 28px Nunito, sans-serif';
        ctx.fillText('LANGUAGE PROFICIENCY BREAKDOWN', 84, secY);
        ctx.fillStyle = '#4F46E5';
        ctx.fillRect(84, secY + 14, 110, 6);

        // 5. Left: 4 Skill Cards (2x2 Grid) & Right: Final Average Showcase Card
        const gridY = 668;
        const skills = [
            { title: 'READING',   sub: 'Reading Comprehension & Context', score: vReading },
            { title: 'WRITING',   sub: 'Written Expression & Grammar',    score: vWriting },
            { title: 'SPEAKING',  sub: 'Spoken Fluency & Pronunciation',  score: vSpeaking },
            { title: 'LISTENING', sub: 'Auditory Comprehension & Detail', score: vListening }
        ];

        const cardW = 475, cardH = 225, gapX = 28, gapY = 28;
        skills.forEach((sk, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = 84 + col * (cardW + gapX);
            const y = gridY + row * (cardH + gapY);
            const band = getSkillBandInfo(sk.score);

            drawRoundedRect(ctx, x, y, cardW, cardH, 20, '#FFFFFF', '#CBD5E1', 2);

            // Skill Title & Subtitle
            ctx.textAlign = 'left';
            ctx.fillStyle = '#4F46E5';
            ctx.font = '900 22px Nunito, sans-serif';
            ctx.fillText(sk.title, x + 30, y + 48);

            ctx.fillStyle = '#64748B';
            ctx.font = '600 19px Nunito, sans-serif';
            ctx.fillText(sk.sub, x + 30, y + 80);

            // Score Number on Right
            ctx.textAlign = 'right';
            ctx.fillStyle = '#0F172A';
            ctx.font = '900 54px Nunito, sans-serif';
            ctx.fillText(`${sk.score}`, x + cardW - 30, y + 72);

            // Band Badge & "/ 100"
            drawRoundedRect(ctx, x + 30, y + 112, 175, 38, 10, band.bg);
            ctx.textAlign = 'center';
            ctx.fillStyle = band.color;
            ctx.font = '800 18px Nunito, sans-serif';
            ctx.fillText(band.label.toUpperCase(), x + 117, y + 137);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#94A3B8';
            ctx.font = '800 20px Nunito, sans-serif';
            ctx.fillText('Score / 100', x + cardW - 30, y + 137);

            // Progress Bar Track & Fill
            const barX = x + 30, barY = y + 172, barW = cardW - 60, barH = 16;
            drawRoundedRect(ctx, barX, barY, barW, barH, 8, '#F1F5F9');
            const fillW = Math.max(16, Math.min(barW, Math.round((sk.score / 100) * barW)));
            drawRoundedRect(ctx, barX, barY, fillW, barH, 8, band.bar);
        });

        // Right Column: Overall Score & Grade Card
        const sumX = 84 + (cardW * 2) + (gapX * 2);
        const sumW = W - 84 - sumX;
        const sumH = (cardH * 2) + gapY;
        const sumGrad = ctx.createLinearGradient(sumX, gridY, sumX + sumW, gridY + sumH);
        sumGrad.addColorStop(0, '#1E1B4B');
        sumGrad.addColorStop(1, '#312E81');
        drawRoundedRect(ctx, sumX, gridY, sumW, sumH, 24, sumGrad, '#4338CA', 2);

        const sumCenterX = sumX + sumW / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FCD34D';
        ctx.font = '800 21px Nunito, sans-serif';
        ctx.fillText('OVERALL AVERAGE', sumCenterX, gridY + 62);

        // Score Circle Ring
        ctx.beginPath();
        ctx.arc(sumCenterX, gridY + 215, 108, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#F59E0B';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 84px Nunito, sans-serif';
        ctx.fillText(avgDisplay, sumCenterX, gridY + 238);

        ctx.fillStyle = '#C7D2FE';
        ctx.font = '700 20px Nunito, sans-serif';
        ctx.fillText('OUT OF 100', sumCenterX, gridY + 278);

        // Grade Pill inside Overall Card
        drawRoundedRect(ctx, sumX + 55, gridY + 365, sumW - 110, 68, 16, '#F59E0B');
        ctx.fillStyle = '#0F172A';
        ctx.font = '900 28px Nunito, sans-serif';
        ctx.fillText(`GRADE ${gradeLetter}  •  ${gradeLabel.toUpperCase()}`, sumCenterX, gridY + 409);

        // 6. Instructor's Evaluation & Feedback (Tutor's Note)
        const noteY = 1210;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1E1B4B';
        ctx.font = '900 28px Nunito, sans-serif';
        ctx.fillText("INSTRUCTOR'S EVALUATION & FEEDBACK", 84, noteY);
        ctx.fillStyle = '#4F46E5';
        ctx.fillRect(84, noteY + 14, 110, 6);

        const noteBoxY = noteY + 42;
        const noteBoxH = 490;
        drawRoundedRect(ctx, 84, noteBoxY, W - 168, noteBoxH, 22, '#F8FAFC', '#CBD5E1', 2);
        // Left Accent Stripe
        drawRoundedRect(ctx, 84, noteBoxY, 14, noteBoxH, 6, '#4F46E5');

        // Decorative Quote Icon
        ctx.fillStyle = '#E0E7FF';
        ctx.font = '900 120px Georgia, serif';
        ctx.fillText('“', 125, noteBoxY + 115);

        // Dynamic Font Size for Tutor's Note so it ALWAYS fits cleanly inside the box
        let fontSize = 28, lineHeight = 44;
        ctx.font = `600 ${fontSize}px Nunito, sans-serif`;
        let wrappedLines = wrapCanvasText(ctx, tutorNote, W - 280);
        if (wrappedLines.length > 8) {
            fontSize = 24; lineHeight = 36;
            ctx.font = `600 ${fontSize}px Nunito, sans-serif`;
            wrappedLines = wrapCanvasText(ctx, tutorNote, W - 280);
        }
        if (wrappedLines.length > 11) {
            fontSize = 20; lineHeight = 30;
            ctx.font = `600 ${fontSize}px Nunito, sans-serif`;
            wrappedLines = wrapCanvasText(ctx, tutorNote, W - 280);
        }

        ctx.fillStyle = '#1E293B';
        wrappedLines.slice(0, 13).forEach((line, idx) => {
            ctx.fillText(line, 140, noteBoxY + 85 + (idx * lineHeight));
        });

        // 7. Footer: Official Verification Badge (Left) & Signature Block (Right)
        const footY = 1835;
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(84, footY);
        ctx.lineTo(W - 84, footY);
        ctx.stroke();

        // Official Seal Badge on Bottom Left
        const sealX = 195, sealY = footY + 195;
        ctx.beginPath();
        ctx.arc(sealX, sealY, 86, 0, Math.PI * 2);
        ctx.fillStyle = '#FEF3C7';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#D97706';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sealX, sealY, 72, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#B45309';
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#92400E';
        ctx.font = '900 18px Nunito, sans-serif';
        ctx.fillText('VERIFIED', sealX, sealY - 12);
        ctx.font = '900 22px Nunito, sans-serif';
        ctx.fillText('OFFICIAL', sealX, sealY + 14);
        ctx.font = '800 15px Nunito, sans-serif';
        ctx.fillText('HAMDI STUDIO', sealX, sealY + 38);

        // Verification Text next to Seal
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = '900 26px Nunito, sans-serif';
        ctx.fillText('Hamdi English Studio', 315, footY + 165);
        ctx.fillStyle = '#64748B';
        ctx.font = '600 21px Nunito, sans-serif';
        ctx.fillText('Official Academic Proficiency & Evaluation Report', 315, footY + 200);
        ctx.fillText(`Issued in Medan  •  ${dateEn}`, 315, footY + 234);

        // Signature Block on Bottom Right
        const sigCenterX = W - 290;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = '700 22px Nunito, sans-serif';
        ctx.fillText(`Medan, ${dateEn}`, sigCenterX, footY + 75);

        // Try loading signature.png if present
        await new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const maxW = 280, maxH = 130;
                const ratio = Math.min(maxW / img.width, maxH / img.height);
                const w = img.width * ratio, h = img.height * ratio;
                ctx.drawImage(img, sigCenterX - w / 2, footY + 95 + (maxH - h) / 2, w, h);
                resolve();
            };
            img.onerror = () => {
                // Stylized signature fallback if signature.png is missing
                ctx.save();
                ctx.fillStyle = '#1E1B4B';
                ctx.font = 'italic 700 44px Georgia, serif';
                ctx.fillText('Hamdi Rizal', sigCenterX, footY + 178);
                ctx.restore();
                resolve();
            };
            img.src = 'signature.png';
        });

        // Signature Line & Tutor Name
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sigCenterX - 180, footY + 245);
        ctx.lineTo(sigCenterX + 180, footY + 245);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = '900 28px Nunito, sans-serif';
        ctx.fillText('HAMDI RIZAL', sigCenterX, footY + 285);

        ctx.fillStyle = '#4F46E5';
        ctx.font = '800 19px Nunito, sans-serif';
        ctx.fillText('ENGLISH TUTOR & DIRECTOR', sigCenterX, footY + 316);

        // Export Canvas to 1-Page A4 PDF using jsPDF
        const imgData = canvas.toDataURL('image/jpeg', 0.96);
        const cleanName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
        const cleanLevel = classLevel.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Report_Card_${cleanName}_${cleanLevel}.pdf`;

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
            pdf.save(fileName);
            showToast('Report Card PDF downloaded successfully!', 'success');
        } else {
            window.print();
        }
    } catch (err) {
        console.error('PDF generation error:', err);
        window.print();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHTML;
        }
    }
};

function renderStudentExamPage() {
    const monthId = currentExamSession;
    const monthObj = window.HES.months.find(m => m.id === monthId) || { title: 'Month 1' };
    const email = window.HES.currentUser.email;
    const studentName = window.HES.currentUser.name || 'Student';

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

    // REPORT CARD PREVIEW (100% English, Luxury Executive Certificate Aesthetic)
    if (examResult?.isGraded) {
        const sc = examResult.sectionScores || {};
        const vReading = Number(sc.reading ?? 0);
        const vWriting = Number(sc.writing ?? 0);
        const vSpeaking = Number(sc.speaking ?? 0);
        const vListening = Number(sc.listening ?? 0);

        const avgRaw = (vReading + vWriting + vSpeaking + vListening) / 4;
        const avgDisplay = Number.isInteger(avgRaw) ? String(avgRaw) : avgRaw.toFixed(1);
        const isPassed = avgRaw >= 70;

        let gradeLetter = 'D', gradeLabel = 'Needs Improvement';
        if (avgRaw >= 90) { gradeLetter = 'A'; gradeLabel = 'Distinction'; }
        else if (avgRaw >= 80) { gradeLetter = 'B'; gradeLabel = 'Merit'; }
        else if (avgRaw >= 70) { gradeLetter = 'C'; gradeLabel = 'Pass'; }

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const dateEn = formatEnglishDate(docDate);
        const classLevelText = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNoteText = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'The student has demonstrated commendable dedication and progress throughout this learning module. Keep practicing consistently to further enhance your English fluency and confidence.';
        const docId = `HES-${docDate.getFullYear()}${String(docDate.getMonth() + 1).padStart(2, '0')}-${monthId.toUpperCase()}`;

        const skillCards = [
            { title: 'READING',   sub: 'Reading Comprehension & Context', icon: 'fa-book-open',        score: vReading },
            { title: 'WRITING',   sub: 'Written Expression & Grammar',    icon: 'fa-pen-nib',          score: vWriting },
            { title: 'SPEAKING',  sub: 'Spoken Fluency & Pronunciation',  icon: 'fa-microphone-lines', score: vSpeaking },
            { title: 'LISTENING', sub: 'Auditory Comprehension & Detail', icon: 'fa-headphones',       score: vListening }
        ].map(sk => {
            const b = getSkillBandInfo(sk.score);
            return `
                <div class="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <span class="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-indigo-600">
                                <i class="fas ${sk.icon}"></i> ${sk.title}
                            </span>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">${sk.sub}</p>
                        </div>
                        <span class="text-3xl font-black text-slate-900 leading-none">${sk.score}</span>
                    </div>
                    <div class="mt-3.5">
                        <div class="flex items-center justify-between text-[10px] font-extrabold mb-1.5">
                            <span class="px-2 py-0.5 rounded-md" style="background:${b.bg}; color:${b.color};">${b.label.toUpperCase()}</span>
                            <span class="text-slate-400">Score / 100</span>
                        </div>
                        <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-500" style="width:${Math.max(6, Math.min(100, sk.score))}%; background:${b.bar};"></div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        reportBox.classList.remove('hidden');
        reportBox.innerHTML = `
            <!-- Action Bar -->
            <div id="report-action-bar" class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-md">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center text-sm font-black shrink-0">
                        <i class="fas fa-award"></i>
                    </div>
                    <div>
                        <p class="text-xs sm:text-sm font-extrabold text-white">Official Student Report Card Ready</p>
                        <p class="text-[11px] text-slate-300">High-resolution 1-Page A4 PDF (English Edition)</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-download-pdf" onclick="downloadReportPDF()" class="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer">
                        <i class="fas fa-file-pdf"></i> Download PDF (1 Page)
                    </button>
                    <button onclick="window.print()" class="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition cursor-pointer" title="Print Report">
                        <i class="fas fa-print"></i>
                    </button>
                </div>
            </div>

            <!-- LUXURY REPORT CARD PREVIEW -->
            <div id="printable-report" class="bg-white mx-auto rounded-3xl shadow-xl border-2 border-slate-200/90 overflow-hidden text-slate-800 max-w-[820px]">
                
                <!-- Executive Top Banner -->
                <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 text-white p-6 sm:p-8 relative overflow-hidden">
                    <div class="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-amber-400/10 blur-2xl pointer-events-none"></div>
                    <div class="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div class="flex items-center gap-4">
                            <div class="w-14 h-14 rounded-2xl bg-white/10 border border-amber-300/40 flex items-center justify-center text-amber-300 text-2xl font-black shrink-0 shadow-inner">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                            <div>
                                <p class="text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">Hamdi English Studio • Official Academic Record</p>
                                <h1 class="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase mt-0.5">Student Report Card</h1>
                                <p class="text-xs font-semibold text-indigo-200 mt-0.5">Document ID: ${docId} &nbsp;|&nbsp; Evaluation Period: ${monthObj.title}</p>
                            </div>
                        </div>
                        <div class="self-start sm:self-center shrink-0">
                            <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${isPassed ? 'bg-emerald-500 text-white border-emerald-300' : 'bg-rose-600 text-white border-rose-300'} shadow-sm">
                                <i class="fas ${isPassed ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                                ${isPassed ? 'Status: Passed' : 'Needs Improvement'}
                            </span>
                        </div>
                    </div>
                </div>
                <!-- Gold Accent Divider -->
                <div class="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600"></div>

                <!-- Report Body -->
                <div class="p-6 sm:p-8 space-y-6">

                    <!-- Student Metadata Bar (3 Clean Columns: Student Name, Class/Level, Date of Issue) -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                        <div>
                            <p class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Student Name</p>
                            <p class="text-base sm:text-lg font-black text-slate-900 mt-0.5 truncate">${studentName}</p>
                        </div>
                        <div class="sm:border-l sm:border-slate-200 sm:pl-5">
                            <p class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Class / Level</p>
                            <p class="text-base sm:text-lg font-black text-indigo-700 mt-0.5 truncate">${classLevelText}</p>
                        </div>
                        <div class="sm:border-l sm:border-slate-200 sm:pl-5">
                            <p class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Date of Issue</p>
                            <p class="text-sm sm:text-base font-extrabold text-slate-800 mt-1">${dateEn}</p>
                        </div>
                    </div>

                    <!-- Language Proficiency Breakdown -->
                    <div>
                        <div class="flex items-center gap-2 mb-3">
                            <span class="w-2 h-5 rounded-full bg-indigo-600"></span>
                            <h3 class="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">Language Proficiency Breakdown</h3>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                            <!-- 4 Skill Cards -->
                            <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                ${skillCards}
                            </div>

                            <!-- Overall Average Card -->
                            <div class="lg:col-span-4 rounded-2xl bg-gradient-to-b from-slate-900 via-indigo-950 to-indigo-900 text-white p-5 flex flex-col items-center justify-center text-center border border-indigo-800 shadow-md">
                                <p class="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-300">Overall Average</p>
                                <div class="w-28 h-28 rounded-full border-4 border-amber-400 bg-white/5 flex flex-col items-center justify-center my-3 shadow-inner">
                                    <span class="text-4xl font-black text-white leading-none">${avgDisplay}</span>
                                    <span class="text-[10px] font-bold text-indigo-200 mt-1">OUT OF 100</span>
                                </div>
                                <div class="w-full py-2 px-3 rounded-xl bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider">
                                    Grade ${gradeLetter} &bull; ${gradeLabel}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Instructor's Evaluation & Feedback -->
                    <div>
                        <div class="flex items-center gap-2 mb-2.5">
                            <span class="w-2 h-5 rounded-full bg-indigo-600"></span>
                            <h3 class="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">Instructor's Evaluation & Feedback</h3>
                        </div>
                        <div class="relative rounded-2xl bg-slate-50 border border-slate-200 p-5 pl-6 border-l-4 border-l-indigo-600">
                            <p class="text-xs sm:text-sm font-semibold text-slate-700 leading-relaxed whitespace-pre-line">${tutorNoteText}</p>
                        </div>
                    </div>

                    <!-- Footer: Official Seal & Signature -->
                    <div class="pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                        <div class="flex items-center gap-3.5">
                            <div class="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-500 flex flex-col items-center justify-center text-center shrink-0 shadow-xs">
                                <span class="text-[8px] font-black uppercase tracking-tighter text-amber-800">Verified</span>
                                <span class="text-[10px] font-black uppercase text-amber-900 leading-none my-0.5">Official</span>
                                <span class="text-[7px] font-bold uppercase text-amber-700">HES Record</span>
                            </div>
                            <div class="text-xs text-slate-500 space-y-0.5">
                                <p class="font-black text-slate-800 text-sm">Hamdi English Studio</p>
                                <p class="font-semibold">Official Academic Proficiency & Evaluation Report</p>
                                <p class="text-[11px] text-slate-400">Issued in Medan &bull; ${dateEn}</p>
                            </div>
                        </div>

                        <div class="text-center sm:text-right shrink-0">
                            <p class="text-xs font-bold text-slate-600 mb-1">Medan, ${dateEn}</p>
                            <img src="signature.png" alt="Signature" class="h-14 sm:ml-auto mx-auto object-contain my-1" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\'py-2 font-serif italic text-xl font-bold text-indigo-950\'>Hamdi Rizal</div>');">
                            <div class="border-t-2 border-slate-900 pt-1.5 min-w-[180px] inline-block text-center">
                                <p class="text-xs sm:text-sm font-black text-slate-900 uppercase leading-none">Hamdi Rizal</p>
                                <p class="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mt-1">English Tutor & Director</p>
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
