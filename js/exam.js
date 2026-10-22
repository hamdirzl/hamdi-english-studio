// js/exam.js

let studentExamAnswers = {}, currentExamSession = 'm1', currentStudentExamTab = 'reading', audioPlayCounts = {};
let mediaRecorder = null, audioChunks = [];

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
    if (s >= 90) return { label: 'Excellent',    color: '#1D4ED8', bg: '#DBEAFE', bar: '#2563EB' };
    if (s >= 80) return { label: 'Very Good',    color: '#0284C7', bg: '#E0F2FE', bar: '#0EA5E9' };
    if (s >= 70) return { label: 'Good',         color: '#0D9488', bg: '#CCFBF1', bar: '#14B8A6' };
    return              { label: 'Keep Practicing', color: '#64748B', bg: '#F1F5F9', bar: '#94A3B8' };
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

// Helper for Canvas Rounded Rectangles (No harsh borders by default)
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

// Subtle Low-Opacity Background Artwork on the A4 Canvas
function drawSubtleBlueBackground(ctx, W, H) {
    ctx.save();

    // Soft top-right ambient circle
    const grad1 = ctx.createRadialGradient(W - 180, 220, 40, W - 180, 220, 620);
    grad1.addColorStop(0, 'rgba(37, 99, 235, 0.055)');
    grad1.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(W - 180, 220, 620, 0, Math.PI * 2);
    ctx.fill();

    // Soft bottom-left ambient circle
    const grad2 = ctx.createRadialGradient(200, H - 300, 40, 200, H - 300, 680);
    grad2.addColorStop(0, 'rgba(14, 165, 233, 0.05)');
    grad2.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(200, H - 300, 680, 0, Math.PI * 2);
    ctx.fill();

    // Gentle abstract wave curves at the bottom
    ctx.beginPath();
    ctx.moveTo(0, H - 240);
    ctx.bezierCurveTo(W * 0.35, H - 340, W * 0.65, H - 120, W, H - 260);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.025)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, H - 140);
    ctx.bezierCurveTo(W * 0.4, H - 40, W * 0.7, H - 240, W, H - 110);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.03)';
    ctx.fill();

    // Very faint decorative rings in the center-right background
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.035)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W - 120, H * 0.52, 340, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W - 120, H * 0.52, 420, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle dot grid pattern in top-left corner
    ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';
    for (let gx = 90; gx <= 290; gx += 28) {
        for (let gy = H - 260; gy <= H - 100; gy += 28) {
            ctx.beginPath();
            ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

// 1-Page A4 PDF Generator (Clean Blue Theme, Borderless Modern Layout, Real signature.png)
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

        let gradeLetter = 'D';
        if (avgRaw >= 90) gradeLetter = 'A';
        else if (avgRaw >= 80) gradeLetter = 'B';
        else if (avgRaw >= 70) gradeLetter = 'C';

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const dateEn = formatEnglishDate(docDate);
        const classLevel = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNote = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'Great effort and steady progress throughout this level. Keep practicing regularly to build even stronger fluency and confidence in English.';

        // Create High-Res A4 Canvas (1654 x 2339 px = exact A4 aspect ratio)
        const W = 1654, H = 2339;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // 1. Pure White Base + Subtle Low-Opacity Blue Background Design
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        drawSubtleBlueBackground(ctx, W, H);

        // Top Blue Accent Bar
        const topBarGrad = ctx.createLinearGradient(0, 0, W, 0);
        topBarGrad.addColorStop(0, '#1E3A8A');
        topBarGrad.addColorStop(0.5, '#2563EB');
        topBarGrad.addColorStop(1, '#38BDF8');
        ctx.fillStyle = topBarGrad;
        ctx.fillRect(0, 0, W, 24);

        const padX = 115;

        // 2. Clean Header (No hyperbolic text, no boxes)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#2563EB';
        ctx.font = '800 24px Nunito, sans-serif';
        ctx.fillText('HAMDI ENGLISH STUDIO', padX, 130);

        ctx.fillStyle = '#0F172A';
        ctx.font = '900 56px Nunito, sans-serif';
        ctx.fillText('Student Report Card', padX, 198);

        // Status Pill on Top Right
        const statusBg = isPassed ? '#DBEAFE' : '#FFE4E6';
        const statusColor = isPassed ? '#1D4ED8' : '#E11D48';
        const statusLabel = isPassed ? 'PASSED' : 'NEEDS IMPROVEMENT';
        const pillW = isPassed ? 210 : 320;
        drawRoundedRect(ctx, W - padX - pillW, 135, pillW, 60, 30, statusBg);
        ctx.textAlign = 'center';
        ctx.fillStyle = statusColor;
        ctx.font = '900 22px Nunito, sans-serif';
        ctx.fillText(statusLabel, W - padX - (pillW / 2), 173);

        // 3. Student Info Strip (Soft Blue Surface, Zero Borders/Lines)
        const infoY = 265;
        drawRoundedRect(ctx, padX, infoY, W - (padX * 2), 165, 28, '#F0F7FF');

        // Student Name
        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748B';
        ctx.font = '700 20px Nunito, sans-serif';
        ctx.fillText('Student Name', padX + 45, infoY + 58);
        ctx.fillStyle = '#0F172A';
        ctx.font = '900 34px Nunito, sans-serif';
        const dispName = studentName.length > 25 ? studentName.substring(0, 25) + '...' : studentName;
        ctx.fillText(dispName, padX + 45, infoY + 112);

        // Class / Level
        ctx.fillStyle = '#64748B';
        ctx.font = '700 20px Nunito, sans-serif';
        ctx.fillText('Class / Level', padX + 610, infoY + 58);
        ctx.fillStyle = '#1D4ED8';
        ctx.font = '900 34px Nunito, sans-serif';
        const dispLevel = classLevel.length > 22 ? classLevel.substring(0, 22) + '...' : classLevel;
        ctx.fillText(dispLevel, padX + 610, infoY + 112);

        // Date
        ctx.fillStyle = '#64748B';
        ctx.font = '700 20px Nunito, sans-serif';
        ctx.fillText('Date', padX + 1090, infoY + 58);
        ctx.fillStyle = '#0F172A';
        ctx.font = '800 30px Nunito, sans-serif';
        ctx.fillText(dateEn, padX + 1090, infoY + 112);

        // 4. Skill Scores Section (Borderless Soft Cards + Blue Average Card)
        const secY = 515;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = '900 30px Nunito, sans-serif';
        ctx.fillText('Language Skills', padX, secY);

        const gridY = 550;
        const skills = [
            { title: 'Reading',   sub: 'Comprehension & Context', score: vReading },
            { title: 'Writing',   sub: 'Structure & Expression',  score: vWriting },
            { title: 'Speaking',  sub: 'Fluency & Pronunciation', score: vSpeaking },
            { title: 'Listening', sub: 'Audio Understanding',     score: vListening }
        ];

        const cardW = 455, cardH = 215, gapX = 28, gapY = 28;
        skills.forEach((sk, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = padX + col * (cardW + gapX);
            const y = gridY + row * (cardH + gapY);
            const band = getSkillBandInfo(sk.score);

            // Soft borderless card
            drawRoundedRect(ctx, x, y, cardW, cardH, 26, '#F8FAFC');

            ctx.textAlign = 'left';
            ctx.fillStyle = '#0F172A';
            ctx.font = '900 28px Nunito, sans-serif';
            ctx.fillText(sk.title, x + 34, y + 56);

            ctx.fillStyle = '#64748B';
            ctx.font = '600 19px Nunito, sans-serif';
            ctx.fillText(sk.sub, x + 34, y + 88);

            // Score on right
            ctx.textAlign = 'right';
            ctx.fillStyle = '#1D4ED8';
            ctx.font = '900 52px Nunito, sans-serif';
            ctx.fillText(`${sk.score}`, x + cardW - 34, y + 74);

            // Band label pill
            drawRoundedRect(ctx, x + 34, y + 114, 155, 34, 17, band.bg);
            ctx.textAlign = 'center';
            ctx.fillStyle = band.color;
            ctx.font = '800 16px Nunito, sans-serif';
            ctx.fillText(band.label, x + 111, y + 137);

            // Smooth Progress Bar
            const barX = x + 34, barY = y + 168, barW = cardW - 68, barH = 14;
            drawRoundedRect(ctx, barX, barY, barW, barH, 7, '#E2E8F0');
            const fillW = Math.max(14, Math.min(barW, Math.round((sk.score / 100) * barW)));
            drawRoundedRect(ctx, barX, barY, fillW, barH, 7, band.bar);
        });

        // Right Card: Final Average (Pure Blue Gradient, No Harsh Borders)
        const sumX = padX + (cardW * 2) + (gapX * 2);
        const sumW = W - padX - sumX;
        const sumH = (cardH * 2) + gapY;
        const blueGrad = ctx.createLinearGradient(sumX, gridY, sumX + sumW, gridY + sumH);
        blueGrad.addColorStop(0, '#1D4ED8');
        blueGrad.addColorStop(1, '#1E40AF');
        drawRoundedRect(ctx, sumX, gridY, sumW, sumH, 30, blueGrad);

        const sumCenterX = sumX + sumW / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#BFDBFE';
        ctx.font = '800 22px Nunito, sans-serif';
        ctx.fillText('FINAL SCORE', sumCenterX, gridY + 75);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 104px Nunito, sans-serif';
        ctx.fillText(avgDisplay, sumCenterX, gridY + 215);

        ctx.fillStyle = '#93C5FD';
        ctx.font = '700 22px Nunito, sans-serif';
        ctx.fillText('out of 100', sumCenterX, gridY + 260);

        // Grade Pill inside Blue Card
        drawRoundedRect(ctx, sumX + 65, gridY + 330, sumW - 130, 68, 34, 'rgba(255, 255, 255, 0.16)');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 30px Nunito, sans-serif';
        ctx.fillText(`Grade ${gradeLetter}`, sumCenterX, gridY + 375);

        // 5. Tutor's Note (Spacious, Clean, No Colliding Quote Mark, Optimal Font Size)
        const noteTitleY = 1090;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = '900 30px Nunito, sans-serif';
        ctx.fillText("Tutor's Note", padX, noteTitleY);

        const noteBoxY = 1125;
        const noteBoxH = 540;
        drawRoundedRect(ctx, padX, noteBoxY, W - (padX * 2), noteBoxH, 28, '#F0F7FF');

        // Soft vertical accent pill inside Tutor's Note
        drawRoundedRect(ctx, padX + 36, noteBoxY + 42, 8, noteBoxH - 84, 4, '#3B82F6');

        // Well-balanced font sizing for Tutor's Note
        const textMaxW = W - (padX * 2) - 120;
        let fontSize = 30, lineHeight = 48;
        ctx.font = `600 ${fontSize}px Nunito, sans-serif`;
        let wrappedLines = wrapCanvasText(ctx, tutorNote, textMaxW);

        if (wrappedLines.length > 8) {
            fontSize = 26; lineHeight = 40;
            ctx.font = `600 ${fontSize}px Nunito, sans-serif`;
            wrappedLines = wrapCanvasText(ctx, tutorNote, textMaxW);
        }
        if (wrappedLines.length > 11) {
            fontSize = 22; lineHeight = 34;
            ctx.font = `600 ${fontSize}px Nunito, sans-serif`;
            wrappedLines = wrapCanvasText(ctx, tutorNote, textMaxW);
        }

        ctx.fillStyle = '#1E293B';
        wrappedLines.slice(0, 12).forEach((line, idx) => {
            ctx.fillText(line, padX + 74, noteBoxY + 82 + (idx * lineHeight));
        });

        // 6. Signature Section (Bottom Right - Uses real signature.png, no fallback name text in image area)
        const footY = 1790;
        const sigCenterX = W - padX - 200;

        ctx.textAlign = 'center';
        ctx.fillStyle = '#64748B';
        ctx.font = '700 24px Nunito, sans-serif';
        ctx.fillText(`Medan, ${dateEn}`, sigCenterX, footY + 40);

        // Load real signature.png
        await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const maxW = 340, maxH = 165;
                const ratio = Math.min(maxW / img.width, maxH / img.height);
                const w = img.width * ratio, h = img.height * ratio;
                ctx.drawImage(img, sigCenterX - w / 2, footY + 65 + (maxH - h) / 2, w, h);
                resolve();
            };
            img.onerror = () => {
                // Leave blank space if signature.png fails to load (never write text over it)
                resolve();
            };
            img.src = 'signature.png';
        });

        // Subtle Signature Baseline
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sigCenterX - 180, footY + 250);
        ctx.lineTo(sigCenterX + 180, footY + 250);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = '900 30px Nunito, sans-serif';
        ctx.fillText('Hamdi Rizal', sigCenterX, footY + 292);

        ctx.fillStyle = '#2563EB';
        ctx.font = '800 20px Nunito, sans-serif';
        ctx.fillText('English Tutor', sigCenterX, footY + 324);

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

    // REPORT CARD PREVIEW (Clean Blue Theme, Borderless Modern Layout, Low-Opacity Background Design)
    if (examResult?.isGraded) {
        const sc = examResult.sectionScores || {};
        const vReading = Number(sc.reading ?? 0);
        const vWriting = Number(sc.writing ?? 0);
        const vSpeaking = Number(sc.speaking ?? 0);
        const vListening = Number(sc.listening ?? 0);

        const avgRaw = (vReading + vWriting + vSpeaking + vListening) / 4;
        const avgDisplay = Number.isInteger(avgRaw) ? String(avgRaw) : avgRaw.toFixed(1);
        const isPassed = avgRaw >= 70;

        let gradeLetter = 'D';
        if (avgRaw >= 90) gradeLetter = 'A';
        else if (avgRaw >= 80) gradeLetter = 'B';
        else if (avgRaw >= 70) gradeLetter = 'C';

        const docDate = examResult.gradedAt ? new Date(examResult.gradedAt) : new Date();
        const dateEn = formatEnglishDate(docDate);
        const classLevelText = (examResult.classLevel && examResult.classLevel.trim() !== '') ? examResult.classLevel.trim() : monthObj.title;
        const tutorNoteText = (examResult.adminFeedback && examResult.adminFeedback.trim() !== '')
            ? examResult.adminFeedback.trim()
            : 'Great effort and steady progress throughout this level. Keep practicing regularly to build even stronger fluency and confidence in English.';

        const skillCards = [
            { title: 'Reading',   sub: 'Comprehension & Context', score: vReading },
            { title: 'Writing',   sub: 'Structure & Expression',  score: vWriting },
            { title: 'Speaking',  sub: 'Fluency & Pronunciation', score: vSpeaking },
            { title: 'Listening', sub: 'Audio Understanding',     score: vListening }
        ].map(sk => {
            const b = getSkillBandInfo(sk.score);
            return `
                <div class="p-4 sm:p-5 rounded-2xl bg-slate-50/90 flex flex-col justify-between">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <h4 class="text-sm sm:text-base font-black text-slate-900">${sk.title}</h4>
                            <p class="text-xs font-semibold text-slate-500 mt-0.5">${sk.sub}</p>
                        </div>
                        <span class="text-2xl sm:text-3xl font-black text-blue-700 leading-none">${sk.score}</span>
                    </div>
                    <div class="mt-4">
                        <div class="mb-2">
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold" style="background:${b.bg}; color:${b.color};">${b.label}</span>
                        </div>
                        <div class="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
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
                        <i class="fas fa-file-alt"></i>
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
            <div id="printable-report" class="bg-white mx-auto rounded-3xl shadow-md overflow-hidden text-slate-800 max-w-[820px] relative">
                
                <!-- Top Blue Accent Bar -->
                <div class="h-2 w-full bg-gradient-to-r from-blue-900 via-blue-600 to-sky-400"></div>

                <!-- Subtle Low-Opacity Background Shapes -->
                <div class="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-blue-500/[0.04] pointer-events-none"></div>
                <div class="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-sky-500/[0.04] pointer-events-none"></div>

                <div class="relative z-10 p-6 sm:p-10 space-y-7">

                    <!-- Header -->
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <p class="text-xs font-extrabold uppercase tracking-widest text-blue-600">Hamdi English Studio</p>
                            <h1 class="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5">Student Report Card</h1>
                        </div>
                        <div class="self-start sm:self-center">
                            <span class="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${isPassed ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}">
                                ${isPassed ? 'Passed' : 'Needs Improvement'}
                            </span>
                        </div>
                    </div>

                    <!-- Student Info (Soft Blue Strip, No Boxy Borders) -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-blue-50/60 p-5 rounded-2xl">
                        <div>
                            <p class="text-xs font-bold text-slate-500">Student Name</p>
                            <p class="text-base sm:text-lg font-black text-slate-900 mt-0.5 truncate">${studentName}</p>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-slate-500">Class / Level</p>
                            <p class="text-base sm:text-lg font-black text-blue-700 mt-0.5 truncate">${classLevelText}</p>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-slate-500">Date</p>
                            <p class="text-sm sm:text-base font-extrabold text-slate-800 mt-1">${dateEn}</p>
                        </div>
                    </div>

                    <!-- Language Skills & Final Score -->
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-slate-900 mb-3">Language Skills</h3>
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                            <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                ${skillCards}
                            </div>
                            <div class="lg:col-span-4 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <p class="text-xs font-extrabold uppercase tracking-widest text-blue-200">Final Score</p>
                                <p class="text-5xl font-black text-white my-2 leading-none">${avgDisplay}</p>
                                <p class="text-xs font-semibold text-blue-200 mb-4">out of 100</p>
                                <span class="px-5 py-1.5 rounded-full bg-white/15 text-white font-black text-sm">
                                    Grade ${gradeLetter}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Tutor's Note (Clean & Spacious, No Overlapping Quote Mark) -->
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-slate-900 mb-2.5">Tutor's Note</h3>
                        <div class="rounded-2xl bg-blue-50/50 p-5 sm:p-6 flex gap-4 items-stretch">
                            <div class="w-1.5 rounded-full bg-blue-500 shrink-0"></div>
                            <p class="text-sm sm:text-base font-semibold text-slate-700 leading-relaxed whitespace-pre-line">${tutorNoteText}</p>
                        </div>
                    </div>

                    <!-- Signature Only (Uses Real signature.png, No Fallback Name Text in Image Spot) -->
                    <div class="pt-4 flex justify-end">
                        <div class="text-center min-w-[200px]">
                            <p class="text-xs sm:text-sm font-bold text-slate-500 mb-2">Medan, ${dateEn}</p>
                            <img src="signature.png" alt="Signature" class="h-16 mx-auto object-contain my-1" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\'h-16\'></div>');">
                            <div class="border-t border-slate-300 pt-2 mt-1">
                                <p class="text-sm sm:text-base font-black text-slate-900 leading-tight">Hamdi Rizal</p>
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
