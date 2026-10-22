// js/exam.js

let studentExamAnswers = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [];

// Load Plus Jakarta Sans font for professional, crisp report card typography
if (!document.getElementById('report-google-font')) {
    const link = document.createElement('link');
    link.id = 'report-google-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';
    document.head.appendChild(link);
}

// Load jsPDF library for direct, crystal-clear 1-page A4 PDF generation
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

// Helper: Skill Descriptor in Blue Theme
function getSkillBandInfo(score) {
    const s = Number(score) || 0;
    if (s >= 90) return { label: 'Excellent',       color: '#1D4ED8', bg: '#DBEAFE', bar: '#2563EB' };
    if (s >= 80) return { label: 'Very Good',       color: '#0369A1', bg: '#E0F2FE', bar: '#0284C7' };
    if (s >= 70) return { label: 'Good',            color: '#0F766E', bg: '#CCFBF1', bar: '#0D9488' };
    return              { label: 'Keep Practicing', color: '#475569', bg: '#E2E8F0', bar: '#64748B' };
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

// Helper: Draw Crisp Graduation Cap Icon on Canvas
function drawGraduationCapIcon(ctx, cx, cy, scale = 1, color = '#FFFFFF') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // Mortarboard diamond top
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(36, -6);
    ctx.lineTo(0, 12);
    ctx.lineTo(-36, -6);
    ctx.closePath();
    ctx.fill();

    // Skullcap base
    ctx.beginPath();
    ctx.moveTo(-20, 4);
    ctx.lineTo(-20, 18);
    ctx.quadraticCurveTo(0, 30, 20, 18);
    ctx.lineTo(20, 4);
    ctx.lineTo(0, 15);
    ctx.closePath();
    ctx.fill();

    // Tassel cord & tip
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(28, -2);
    ctx.lineTo(31, 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(31, 22, 3.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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

// Visible, Aesthetic Blue Background Artwork on the A4 Canvas
function drawBlueBackgroundArtwork(ctx, W, H) {
    ctx.save();

    // 1. Top-Right Layered Flowing Ribbon Waves (Clearly visible soft blue)
    ctx.beginPath();
    ctx.moveTo(W * 0.42, 0);
    ctx.bezierCurveTo(W * 0.62, 210, W * 0.82, 60, W, 290);
    ctx.lineTo(W, 0);
    ctx.closePath();
    const topWaveGrad1 = ctx.createLinearGradient(W * 0.45, 0, W, 280);
    topWaveGrad1.addColorStop(0, 'rgba(37, 99, 235, 0.08)');
    topWaveGrad1.addColorStop(1, 'rgba(14, 165, 233, 0.16)');
    ctx.fillStyle = topWaveGrad1;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(W * 0.62, 0);
    ctx.bezierCurveTo(W * 0.76, 130, W * 0.90, 90, W, 185);
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(29, 78, 216, 0.11)';
    ctx.fill();

    // 2. Soft Ambient Glow Circles
    const glowTopRight = ctx.createRadialGradient(W - 140, 260, 20, W - 140, 260, 560);
    glowTopRight.addColorStop(0, 'rgba(59, 130, 246, 0.13)');
    glowTopRight.addColorStop(0.6, 'rgba(59, 130, 246, 0.05)');
    glowTopRight.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.fillStyle = glowTopRight;
    ctx.beginPath();
    ctx.arc(W - 140, 260, 560, 0, Math.PI * 2);
    ctx.fill();

    const glowBottomLeft = ctx.createRadialGradient(180, H - 350, 40, 180, H - 350, 680);
    glowBottomLeft.addColorStop(0, 'rgba(14, 165, 233, 0.13)');
    glowBottomLeft.addColorStop(0.6, 'rgba(37, 99, 235, 0.05)');
    glowBottomLeft.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = glowBottomLeft;
    ctx.beginPath();
    ctx.arc(180, H - 350, 680, 0, Math.PI * 2);
    ctx.fill();

    // 3. Bottom Layered Wave Artwork
    ctx.beginPath();
    ctx.moveTo(0, H - 290);
    ctx.bezierCurveTo(W * 0.32, H - 410, W * 0.65, H - 140, W, H - 300);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    const botWaveGrad1 = ctx.createLinearGradient(0, H - 350, W, H);
    botWaveGrad1.addColorStop(0, 'rgba(37, 99, 235, 0.12)');
    botWaveGrad1.addColorStop(0.5, 'rgba(59, 130, 246, 0.08)');
    botWaveGrad1.addColorStop(1, 'rgba(14, 165, 233, 0.14)');
    ctx.fillStyle = botWaveGrad1;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, H - 150);
    ctx.bezierCurveTo(W * 0.38, H - 40, W * 0.72, H - 240, W, H - 115);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(29, 78, 216, 0.11)';
    ctx.fill();

    // 4. Decorative Geometric Rings (Middle-Right & Top-Left)
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.11)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W - 90, H * 0.48, 320, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.09)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W - 90, H * 0.48, 400, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Dot Matrix Accent Pattern (Top-Right & Bottom-Left)
    ctx.fillStyle = 'rgba(37, 99, 235, 0.16)';
    for (let gx = 95; gx <= 315; gx += 32) {
        for (let gy = H - 360; gy <= H - 190; gy += 32) {
            ctx.beginPath();
            ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // 6. Subtle Graduation Cap Watermark in Background
    drawGraduationCapIcon(ctx, W - 260, H - 560, 4.2, 'rgba(37, 99, 235, 0.055)');

    ctx.restore();
}

// 1-Page A4 PDF Generator (Compact, Balanced Proportions, Professional Typography, Real signature.png)
window.downloadReportPDF = async function() {
    const btn = document.getElementById('btn-download-pdf');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating PDF...`;
    }

    try {
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

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

        let gradeLetter = 'D', gradeWord = 'Needs Practice';
        if (avgRaw >= 90) { gradeLetter = 'A'; gradeWord = 'Excellent'; }
        else if (avgRaw >= 80) { gradeLetter = 'B'; gradeWord = 'Very Good'; }
        else if (avgRaw >= 70) { gradeLetter = 'C'; gradeWord = 'Good'; }

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const dateEn = formatEnglishDate(docDate);
        const classLevel = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNote = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'Great effort and steady progress throughout this level. Keep practicing regularly to build even stronger fluency and confidence in English.';

        const fontStack = '"Plus Jakarta Sans", "Nunito", sans-serif';

        // Create High-Res A4 Canvas (1654 x 2339 px = exact A4 aspect ratio)
        const W = 1654, H = 2339;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // 1. Base + Visible Blue Background Design
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        drawBlueBackgroundArtwork(ctx, W, H);

        // Top Accent Strip
        const topBarGrad = ctx.createLinearGradient(0, 0, W, 0);
        topBarGrad.addColorStop(0, '#1E3A8A');
        topBarGrad.addColorStop(0.5, '#2563EB');
        topBarGrad.addColorStop(1, '#0EA5E9');
        ctx.fillStyle = topBarGrad;
        ctx.fillRect(0, 0, W, 28);

        const padX = 115;
        const contentW = W - (padX * 2);

        // 2. Header Section (Properly spaced from top edge + Graduation Cap Logo Badge)
        const headerY = 145;

        // Graduation Cap Badge on Left
        const logoGrad = ctx.createLinearGradient(padX, headerY, padX + 118, headerY + 118);
        logoGrad.addColorStop(0, '#1D4ED8');
        logoGrad.addColorStop(1, '#2563EB');
        drawRoundedRect(ctx, padX, headerY, 118, 118, 28, logoGrad);
        drawGraduationCapIcon(ctx, padX + 59, headerY + 57, 1.35, '#FFFFFF');

        // Studio Name & Report Title next to Logo
        ctx.textAlign = 'left';
        ctx.fillStyle = '#2563EB';
        ctx.font = `800 24px ${fontStack}`;
        ctx.fillText('HAMDI ENGLISH STUDIO', padX + 146, headerY + 38);

        ctx.fillStyle = '#0F172A';
        ctx.font = `800 58px ${fontStack}`;
        ctx.fillText('Student Report Card', padX + 146, headerY + 104);

        // Status Pill on Right
        const statusBg = isPassed ? '#DBEAFE' : '#FFE4E6';
        const statusColor = isPassed ? '#1D4ED8' : '#E11D48';
        const statusLabel = isPassed ? 'PASSED' : 'NEEDS IMPROVEMENT';
        const pillW = isPassed ? 230 : 340;
        drawRoundedRect(ctx, W - padX - pillW, headerY + 26, pillW, 68, 34, statusBg);
        ctx.textAlign = 'center';
        ctx.fillStyle = statusColor;
        ctx.font = `800 24px ${fontStack}`;
        ctx.fillText(statusLabel, W - padX - (pillW / 2), headerY + 69);

        // 3. Student Information Banner (Rich, Dense, Proportional)
        const infoY = 320;
        const infoH = 195;
        drawRoundedRect(ctx, padX, infoY, contentW, infoH, 30, '#EFF6FF');
        // Left Blue Accent Pill inside Info Banner
        drawRoundedRect(ctx, padX, infoY, 14, infoH, 7, '#2563EB');

        // Student Name
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3B82F6';
        ctx.font = `800 20px ${fontStack}`;
        ctx.fillText('STUDENT NAME', padX + 52, infoY + 58);
        ctx.fillStyle = '#0F172A';
        ctx.font = `800 38px ${fontStack}`;
        const dispName = studentName.length > 22 ? studentName.substring(0, 22) + '...' : studentName;
        ctx.fillText(dispName, padX + 52, infoY + 114);
        ctx.fillStyle = '#64748B';
        ctx.font = `600 22px ${fontStack}`;
        ctx.fillText(`Evaluation Period: ${monthObj.title}`, padX + 52, infoY + 154);

        // Class / Level
        ctx.fillStyle = '#3B82F6';
        ctx.font = `800 20px ${fontStack}`;
        ctx.fillText('CLASS / LEVEL', padX + 610, infoY + 58);
        ctx.fillStyle = '#1D4ED8';
        ctx.font = `800 38px ${fontStack}`;
        const dispLevel = classLevel.length > 18 ? classLevel.substring(0, 18) + '...' : classLevel;
        ctx.fillText(dispLevel, padX + 610, infoY + 114);
        ctx.fillStyle = '#64748B';
        ctx.font = `600 22px ${fontStack}`;
        ctx.fillText('English Language Program', padX + 610, infoY + 154);

        // Date
        ctx.fillStyle = '#3B82F6';
        ctx.font = `800 20px ${fontStack}`;
        ctx.fillText('RELEASE DATE', padX + 1065, infoY + 58);
        ctx.fillStyle = '#0F172A';
        ctx.font = `800 34px ${fontStack}`;
        ctx.fillText(dateEn, padX + 1065, infoY + 114);
        ctx.fillStyle = '#64748B';
        ctx.font = `600 22px ${fontStack}`;
        ctx.fillText('Medan, Indonesia', padX + 1065, infoY + 154);

        // 4. Language Skills Section (Larger, Denser Cards + Hero Final Score Card)
        const secY = 585;
        drawRoundedRect(ctx, padX, secY - 26, 10, 32, 5, '#2563EB');
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = `800 32px ${fontStack}`;
        ctx.fillText('Language Skills Assessment', padX + 24, secY);

        const gridY = 620;
        const skills = [
            { title: 'Reading',   sub: 'Comprehension & Context', score: vReading },
            { title: 'Writing',   sub: 'Grammar & Expression',    score: vWriting },
            { title: 'Speaking',  sub: 'Fluency & Pronunciation', score: vSpeaking },
            { title: 'Listening', sub: 'Audio Understanding',     score: vListening }
        ];

        const cardW = 460, cardH = 265, gapX = 28, gapY = 28;
        skills.forEach((sk, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = padX + col * (cardW + gapX);
            const y = gridY + row * (cardH + gapY);
            const band = getSkillBandInfo(sk.score);

            // Soft Tinted Card Surface
            drawRoundedRect(ctx, x, y, cardW, cardH, 28, '#F4F8FD');

            // Title & Subtitle
            ctx.textAlign = 'left';
            ctx.fillStyle = '#0F172A';
            ctx.font = `800 34px ${fontStack}`;
            ctx.fillText(sk.title, x + 36, y + 66);

            ctx.fillStyle = '#64748B';
            ctx.font = `600 21px ${fontStack}`;
            ctx.fillText(sk.sub, x + 36, y + 102);

            // Big Score on Right
            ctx.textAlign = 'right';
            ctx.fillStyle = '#1D4ED8';
            ctx.font = `800 66px ${fontStack}`;
            ctx.fillText(`${sk.score}`, x + cardW - 36, y + 88);

            // Band Pill & Score Label
            drawRoundedRect(ctx, x + 36, y + 138, 175, 42, 21, band.bg);
            ctx.textAlign = 'center';
            ctx.fillStyle = band.color;
            ctx.font = `800 19px ${fontStack}`;
            ctx.fillText(band.label, x + 123, y + 166);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#94A3B8';
            ctx.font = `700 20px ${fontStack}`;
            ctx.fillText(`${sk.score} / 100`, x + cardW - 36, y + 166);

            // Thick Modern Progress Bar
            const barX = x + 36, barY = y + 206, barW = cardW - 72, barH = 18;
            drawRoundedRect(ctx, barX, barY, barW, barH, 9, '#DCE7F7');
            const fillW = Math.max(18, Math.min(barW, Math.round((sk.score / 100) * barW)));
            drawRoundedRect(ctx, barX, barY, fillW, barH, 9, band.bar);
        });

        // Right Hero Card: Final Score
        const sumX = padX + (cardW * 2) + (gapX * 2);
        const sumW = W - padX - sumX;
        const sumH = (cardH * 2) + gapY;
        const blueGrad = ctx.createLinearGradient(sumX, gridY, sumX + sumW, gridY + sumH);
        blueGrad.addColorStop(0, '#1E3A8A');
        blueGrad.addColorStop(0.5, '#1D4ED8');
        blueGrad.addColorStop(1, '#2563EB');
        drawRoundedRect(ctx, sumX, gridY, sumW, sumH, 32, blueGrad);

        const sumCenterX = sumX + sumW / 2;

        // Decorative translucent circles inside Final Score card
        ctx.save();
        ctx.beginPath();
        ctx.arc(sumCenterX, gridY + 245, 138, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#BFDBFE';
        ctx.font = `800 23px ${fontStack}`;
        ctx.fillText('FINAL AVERAGE', sumCenterX, gridY + 72);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `800 108px ${fontStack}`;
        ctx.fillText(avgDisplay, sumCenterX, gridY + 272);

        ctx.fillStyle = '#93C5FD';
        ctx.font = `700 22px ${fontStack}`;
        ctx.fillText('OUT OF 100', sumCenterX, gridY + 318);

        // Grade Pill at bottom of Final Score card
        drawRoundedRect(ctx, sumX + 44, gridY + 432, sumW - 88, 76, 38, '#FFFFFF');
        ctx.fillStyle = '#1D4ED8';
        ctx.font = `800 28px ${fontStack}`;
        ctx.fillText(`Grade ${gradeLetter}  •  ${gradeWord}`, sumCenterX, gridY + 480);

        // 5. Tutor's Note Section (Well-Proportioned, Adaptive Typography, Zero Empty Feel)
        const noteTitleY = 1255;
        drawRoundedRect(ctx, padX, noteTitleY - 26, 10, 32, 5, '#2563EB');
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = `800 32px ${fontStack}`;
        ctx.fillText("Tutor's Note & Evaluation", padX + 24, noteTitleY);

        const noteBoxY = 1290;
        const noteBoxH = 440;
        drawRoundedRect(ctx, padX, noteBoxY, contentW, noteBoxH, 30, '#EFF6FF');
        drawRoundedRect(ctx, padX, noteBoxY, 14, noteBoxH, 7, '#2563EB');

        const textMaxW = contentW - 130;
        let fontSize = 33, lineHeight = 52;
        ctx.font = `600 ${fontSize}px ${fontStack}`;
        let wrappedLines = wrapCanvasText(ctx, tutorNote, textMaxW);

        if (wrappedLines.length > 5) {
            fontSize = 29; lineHeight = 44;
            ctx.font = `600 ${fontSize}px ${fontStack}`;
            wrappedLines = wrapCanvasText(ctx, tutorNote, textMaxW);
        }
        if (wrappedLines.length > 8) {
            fontSize = 25; lineHeight = 38;
            ctx.font = `600 ${fontSize}px ${fontStack}`;
            wrappedLines = wrapCanvasText(ctx, tutorNote, textMaxW);
        }

        // Center text vertically inside the Tutor's Note box if it's short, so there's no awkward empty gap
        const visibleLines = wrappedLines.slice(0, 10);
        const totalTextH = visibleLines.length * lineHeight;
        const startTextY = noteBoxY + Math.max(78, Math.round((noteBoxH - totalTextH) / 2) + 28);

        ctx.fillStyle = '#1E293B';
        visibleLines.forEach((line, idx) => {
            ctx.fillText(line, padX + 64, startTextY + (idx * lineHeight));
        });

        // 6. Balanced Footer: Studio Info on Left + Real Signature on Right (Fills bottom harmoniously)
        const footY = 1815;

        // Left Footer: Brand & Course Summary (Prevents bottom-left from looking empty)
        drawRoundedRect(ctx, padX, footY + 95, 76, 76, 20, '#DBEAFE');
        drawGraduationCapIcon(ctx, padX + 38, footY + 131, 0.85, '#1D4ED8');

        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = `800 30px ${fontStack}`;
        ctx.fillText('Hamdi English Studio', padX + 98, footY + 128);

        ctx.fillStyle = '#64748B';
        ctx.font = `600 22px ${fontStack}`;
        ctx.fillText('Friendly Learning Space  •  English Course & Private Class', padX + 98, footY + 164);

        drawRoundedRect(ctx, padX, footY + 198, 560, 56, 28, '#F0F7FF');
        ctx.fillStyle = '#1D4ED8';
        ctx.font = `700 21px ${fontStack}`;
        ctx.fillText(`Completed Level: ${classLevel} (${monthObj.title})`, padX + 28, footY + 234);

        // Right Footer: Date + Real signature.png + Tutor Name
        const sigCenterX = W - padX - 210;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = `700 25px ${fontStack}`;
        ctx.fillText(`Medan, ${dateEn}`, sigCenterX, footY + 45);

        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const maxW = 360, maxH = 175;
                const ratio = Math.min(maxW / img.width, maxH / img.height);
                const w = img.width * ratio, h = img.height * ratio;
                ctx.drawImage(img, sigCenterX - w / 2, footY + 62 + (maxH - h) / 2, w, h);
                resolve();
            };
            img.onerror = () => {
                // Keep clean space if signature.png is not found
                resolve();
            };
            img.src = 'signature.png';
        });

        // Signature Line
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sigCenterX - 190, footY + 252);
        ctx.lineTo(sigCenterX + 190, footY + 252);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = `800 32px ${fontStack}`;
        ctx.fillText('Hamdi Rizal', sigCenterX, footY + 296);

        ctx.fillStyle = '#2563EB';
        ctx.font = `800 21px ${fontStack}`;
        ctx.fillText('English Tutor', sigCenterX, footY + 330);

        // Export Canvas to 1-Page A4 PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.96);
        const cleanName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
        const cleanLevel = classLevel.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Report_Card_${cleanName}_${cleanLevel}.pdf`;

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
            pdf.save(fileName);
            showToast('Report Card PDF downloaded!', 'success');
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
            <div class="hes-card flex flex-col sm:flex-row items-center justify-between gap-4 border border-blue-100">
                <div>
                    <h4 class="font-extrabold text-slate-800 text-base"><i class="fas fa-shield-alt text-blue-600 mr-1.5"></i> Mode Administrator</h4>
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
        btn.className = `py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center ${t === cat ? 'bg-white text-blue-600 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-800'}`;
    });

    // REPORT CARD PREVIEW (Matches the new Blue, Compact, Well-Proportioned PDF)
    if (examResult?.isGraded) {
        const sc = examResult.sectionScores || {};
        const vReading = Number(sc.reading ?? 0);
        const vWriting = Number(sc.writing ?? 0);
        const vSpeaking = Number(sc.speaking ?? 0);
        const vListening = Number(sc.listening ?? 0);

        const avgRaw = (vReading + vWriting + vSpeaking + vListening) / 4;
        const avgDisplay = Number.isInteger(avgRaw) ? String(avgRaw) : avgRaw.toFixed(1);
        const isPassed = avgRaw >= 70;

        let gradeLetter = 'D', gradeWord = 'Needs Practice';
        if (avgRaw >= 90) { gradeLetter = 'A'; gradeWord = 'Excellent'; }
        else if (avgRaw >= 80) { gradeLetter = 'B'; gradeWord = 'Very Good'; }
        else if (avgRaw >= 70) { gradeLetter = 'C'; gradeWord = 'Good'; }

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const dateEn = formatEnglishDate(docDate);
        const classLevelText = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNoteText = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'Great effort and steady progress throughout this level. Keep practicing regularly to build even stronger fluency and confidence in English.';

        const skillCards = [
            { title: 'Reading',   sub: 'Comprehension & Context', score: vReading },
            { title: 'Writing',   sub: 'Grammar & Expression',    score: vWriting },
            { title: 'Speaking',  sub: 'Fluency & Pronunciation', score: vSpeaking },
            { title: 'Listening', sub: 'Audio Understanding',     score: vListening }
        ].map(sk => {
            const b = getSkillBandInfo(sk.score);
            return `
                <div class="p-5 rounded-2xl bg-[#F4F8FD] flex flex-col justify-between">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <h4 class="text-base sm:text-lg font-extrabold text-slate-900">${sk.title}</h4>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">${sk.sub}</p>
                        </div>
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
            <!-- Action Bar -->
            <div id="report-action-bar" class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-blue-600 text-white px-5 py-3.5 rounded-2xl shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center text-sm font-black shrink-0">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <div>
                        <p class="text-xs sm:text-sm font-extrabold text-white">Student Report Card</p>
                        <p class="text-[11px] text-blue-100">Ready to download as a 1-page A4 PDF</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="btn-download-pdf" onclick="downloadReportPDF()" class="bg-white hover:bg-blue-50 text-blue-700 font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer">
                        <i class="fas fa-download"></i> Download PDF
                    </button>
                    <button onclick="window.print()" class="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition cursor-pointer" title="Print Report">
                        <i class="fas fa-print"></i>
                    </button>
                </div>
            </div>

            <!-- CLEAN BLUE REPORT CARD PREVIEW -->
            <div id="printable-report" style="font-family: 'Plus Jakarta Sans', 'Nunito', sans-serif;" class="bg-white mx-auto rounded-3xl shadow-md overflow-hidden text-slate-800 max-w-[840px] relative">
                
                <!-- Top Blue Accent Bar -->
                <div class="h-2.5 w-full bg-gradient-to-r from-blue-900 via-blue-600 to-sky-400"></div>

                <!-- Clearly Visible Soft Blue Background Shapes -->
                <div class="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-blue-500/[0.10] pointer-events-none"></div>
                <div class="absolute top-12 right-16 w-44 h-44 rounded-full border-[3px] border-blue-500/[0.10] pointer-events-none"></div>
                <div class="absolute -bottom-24 -left-20 w-96 h-96 rounded-full bg-sky-500/[0.10] pointer-events-none"></div>

                <div class="relative z-10 p-6 sm:p-10 pt-8 sm:pt-11 space-y-7">

                    <!-- Header with Graduation Cap Logo next to Hamdi English Studio -->
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div class="flex items-center gap-4">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                            <div>
                                <p class="text-xs font-extrabold uppercase tracking-widest text-blue-600">Hamdi English Studio</p>
                                <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">Student Report Card</h1>
                            </div>
                        </div>
                        <div class="self-start sm:self-center">
                            <span class="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${isPassed ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}">
                                ${isPassed ? 'Passed' : 'Needs Improvement'}
                            </span>
                        </div>
                    </div>

                    <!-- Student Info Banner -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-5 bg-[#EFF6FF] p-5 sm:p-6 rounded-2xl border-l-4 border-l-blue-600">
                        <div>
                            <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Student Name</p>
                            <p class="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 truncate">${studentName}</p>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">Evaluation Period: ${monthObj.title}</p>
                        </div>
                        <div>
                            <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Class / Level</p>
                            <p class="text-lg sm:text-xl font-extrabold text-blue-700 mt-1 truncate">${classLevelText}</p>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">English Language Program</p>
                        </div>
                        <div>
                            <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Release Date</p>
                            <p class="text-base sm:text-lg font-extrabold text-slate-900 mt-1">${dateEn}</p>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">Medan, Indonesia</p>
                        </div>
                    </div>

                    <!-- Language Skills & Final Score -->
                    <div>
                        <div class="flex items-center gap-2.5 mb-3.5">
                            <span class="w-1.5 h-5 rounded-full bg-blue-600"></span>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Language Skills Assessment</h3>
                        </div>
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                            <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                ${skillCards}
                            </div>
                            <div class="lg:col-span-4 rounded-2xl bg-gradient-to-b from-blue-900 via-blue-700 to-blue-600 text-white p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <p class="text-xs font-extrabold uppercase tracking-widest text-blue-200">Final Average</p>
                                <div class="w-32 h-32 rounded-full bg-white/10 border-2 border-blue-300/40 flex flex-col items-center justify-center my-3.5">
                                    <span class="text-5xl font-extrabold text-white leading-none">${avgDisplay}</span>
                                    <span class="text-[10px] font-bold text-blue-200 mt-1">OUT OF 100</span>
                                </div>
                                <span class="w-full py-2 px-4 rounded-full bg-white text-blue-700 font-extrabold text-xs sm:text-sm">
                                    Grade ${gradeLetter} &bull; ${gradeWord}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Tutor's Note -->
                    <div>
                        <div class="flex items-center gap-2.5 mb-3">
                            <span class="w-1.5 h-5 rounded-full bg-blue-600"></span>
                            <h3 class="text-base sm:text-lg font-extrabold text-slate-900">Tutor's Note & Evaluation</h3>
                        </div>
                        <div class="rounded-2xl bg-[#EFF6FF] border-l-4 border-l-blue-600 p-6">
                            <p class="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed whitespace-pre-line">${tutorNoteText}</p>
                        </div>
                    </div>

                    <!-- Balanced Footer: Studio Info Left + Real Signature Right -->
                    <div class="pt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                        <div class="space-y-2.5">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-base">
                                    <i class="fas fa-graduation-cap"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-extrabold text-slate-900">Hamdi English Studio</p>
                                    <p class="text-xs font-semibold text-slate-500">Friendly Learning Space &bull; English Course & Private Class</p>
                                </div>
                            </div>
                            <span class="inline-block px-3.5 py-1.5 rounded-full bg-[#F0F7FF] text-blue-700 text-xs font-bold">
                                Completed Level: ${classLevelText} (${monthObj.title})
                            </span>
                        </div>

                        <div class="text-center min-w-[210px]">
                            <p class="text-xs sm:text-sm font-bold text-slate-600 mb-2">Medan, ${dateEn}</p>
                            <img src="signature.png" alt="Signature" class="h-16 mx-auto object-contain my-1" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\'h-16\'></div>');">
                            <div class="border-t border-slate-300 pt-2 mt-1">
                                <p class="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">Hamdi Rizal</p>
                                <p class="text-xs font-bold text-blue-600 mt-0.5">English Tutor</p>
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
