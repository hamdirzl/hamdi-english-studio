// js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    if (getSession()) { window.location.href = 'dashboard.html'; return; }
    syncFromCloud();

    const pwdInput = document.getElementById('password');
    const toggleBtn = document.getElementById('toggle-password');
    toggleBtn?.addEventListener('click', () => {
        const isPwd = pwdInput.type === 'password';
        pwdInput.type = isPwd ? 'text' : 'password';
        toggleBtn.innerHTML = `<i class="fas ${isPwd ? 'fa-eye-slash text-indigo-600' : 'fa-eye'} text-sm"></i>`;
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = document.getElementById('login-error');
        const btn = document.getElementById('login-submit-btn');
        errBox.classList.add('hidden');

        const email = document.getElementById('email').value.trim();
        const password = pwdInput.value.trim();

        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> <span>Memeriksa...</span>`;

        await syncFromCloud();

        if (email === 'hamdirizall1@gmail.com' && password === 'admin') {
            localStorage.setItem('hes_session_user', JSON.stringify({ name: 'Bro Hamdi', email }));
            localStorage.setItem('hes_session_role', 'admin');
            window.location.href = 'dashboard.html';
            return;
        }

        const student = window.HES.students.find(s => s.email.toLowerCase() === email.toLowerCase() && s.password === password);
        if (student) {
            localStorage.setItem('hes_session_user', JSON.stringify(student));
            localStorage.setItem('hes_session_role', 'student');
            window.location.href = 'dashboard.html';
        } else {
            errBox.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    });
});