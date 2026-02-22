/**
 * reset-password.js — PokéWorld Password Reset Page
 *
 * Handles:
 *  - Supabase PASSWORD_RECOVERY auth event
 *  - Password strength indicator
 *  - Password visibility toggle
 *  - Form submission and redirect
 */

class ResetPasswordPage {
  constructor() {
    this._bindAuthListener();
    this._bindToggleButtons();
    this._bindStrengthIndicator();
    this._bindFormSubmit();
  }

  /* ---- Auth event ---- */
  _bindAuthListener() {
    _supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('[ResetPassword] Recovery session active.');
      }
    });
  }

  /* ---- Password visibility toggles ---- */
  _bindToggleButtons() {
    document.querySelectorAll('.toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    });
  }

  /* ---- Strength indicator ---- */
  _bindStrengthIndicator() {
    const pwInput = document.getElementById('resetPassword');
    if (!pwInput) return;

    pwInput.addEventListener('input', (e) => {
      const fill  = document.getElementById('pwStrengthFill');
      const label = document.getElementById('pwStrengthLabel');
      this._updateStrength(e.target.value, fill, label);
    });
  }

  _updateStrength(pw, fill, label) {
    let score = 0;
    if (pw.length >= 8)              score++;
    if (pw.length >= 12)             score++;
    if (/[A-Z]/.test(pw))            score++;
    if (/[0-9]/.test(pw))            score++;
    if (/[^A-Za-z0-9]/.test(pw))     score++;

    const colors = ['transparent', '#ff3b3b', '#ff9800', '#ffd500', '#00e676', '#00e676'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const widths = ['0%', '20%', '45%', '65%', '85%', '100%'];
    const idx = Math.min(score, 5);

    if (fill)  { fill.style.width = widths[idx]; fill.style.backgroundColor = colors[idx]; }
    if (label) { label.textContent = labels[idx]; label.style.color = colors[idx]; }
  }

  /* ---- Form submission ---- */
  _bindFormSubmit() {
    document.getElementById('resetForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleSubmit();
    });
  }

  async _handleSubmit() {
    const newPw   = document.getElementById('resetPassword')?.value;
    const confPw  = document.getElementById('resetConfirm')?.value;
    const errEl   = document.getElementById('resetConfirmErr');
    const formErr = document.getElementById('resetError');
    const btn     = document.getElementById('resetSubmitBtn');
    const txt     = btn?.querySelector('.btn-text');
    const spin    = btn?.querySelector('.btn-spinner');

    // Clear previous errors
    if (errEl)   errEl.textContent = '';
    if (formErr) formErr.classList.remove('show');

    if (!newPw || newPw.length < 8) {
      if (errEl) errEl.textContent = 'Password must be at least 8 characters.';
      return;
    }
    if (newPw !== confPw) {
      if (errEl) errEl.textContent = 'Passwords do not match.';
      return;
    }

    // Show loading state
    if (btn)  btn.disabled = true;
    txt?.classList.add('hidden');
    spin?.classList.remove('hidden');

    const { error } = await _supabase.auth.updateUser({ password: newPw });

    if (error) {
      if (formErr) { formErr.textContent = error.message; formErr.classList.add('show'); }
      if (btn)  btn.disabled = false;
      txt?.classList.remove('hidden');
      spin?.classList.add('hidden');
      return;
    }

    // Success
    alert('Password updated! Redirecting to your dashboard...');
    window.location.href = APP_CONFIG.dashboardUrl;
  }
}

// Boot
new ResetPasswordPage();
