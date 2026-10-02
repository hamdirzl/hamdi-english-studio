// js/auth.js

document.addEventListener('DOMContentLoaded', async () => {
    // Jika sudah memiliki sesi aktif, langsung arahkan ke dashboard
    const existingSession = getSession();
    if (existingSession) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Sinkronisasi daftar murid terbaru dari Supabase di latar belakang
    syncFromCloud();

    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    const togglePwdBtn = document.getElementById('toggle-password');
    const pwdInput = document.getElementById('password');

    // Fitur Lihat / Sembunyikan Kata Sandi
    if (togglePwdBtn && pwdInput) {
        togglePwdBtn.addEventListener('click', () => {
            const isPwd = pwdInput.type === 'password';
            pwdInput.type = isPwd ? 'text' : 'password';
            togglePwdBtn.innerHTML = `<i class="fas ${isPwd ? 'fa-eye-slash text-indigo-600' : 'fa-eye text-slate-400'} text-sm"></i>`;
        });
    }

    // Proses Submit Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.classList.add('hidden');

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();

            const origBtnHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> <span>Memverifikasi Kredensial...</span>`;

            // Pastikan data murid terbaru sudah ditarik dari cloud sebelum verifikasi
            await syncFromCloud();

            if (email === 'hamdirizall1@gmail.com' && password === 'admin') {
                const adminUser = { name: 'Bro Hamdi', email: email };
                localStorage.setItem('hes_session_user', JSON.stringify(adminUser));
                localStorage.setItem('hes_session_role', 'admin');
                window.location.href = 'dashboard.html';
                return;
            }

            const student = window.HES.students.find(
                s => s.email.toLowerCase() === email.toLowerCase() && s.password === password
            );

            if (student) {
                localStorage.setItem('hes_session_user', JSON.stringify(student));
                localStorage.setItem('hes_session_role', 'student');
                window.location.href = 'dashboard.html';
            } else {
                loginError.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = origBtnHTML;
            }
        });
    }
});