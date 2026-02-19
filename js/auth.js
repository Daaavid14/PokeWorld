/**
 * auth.js — PokéWorld Authentication Module
 *
 * Handles:
 *  - Email/Password Sign Up & Login
 *  - Google OAuth
 *  - Password Reset (forgot password)
 *  - Session management & auth state changes
 *  - Input sanitization & validation
 *  - CSRF protection (via Supabase's built-in token handling)
 *  - Rate limit feedback
 */

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Sanitize user input — strips HTML tags to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration  ms before auto-dismiss (0 = no auto-dismiss)
 */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  // Dismiss any existing toasts immediately so only one is visible at a time
  container.querySelectorAll('.toast').forEach(existing => {
    if (!existing._dismissing) {
      existing._dismissing = true;
      existing.classList.add('fade-out');
      setTimeout(() => existing.remove(), 350);
    }
  });

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icons[type]}</span>
    <span class="toast-msg">${sanitize(message)}</span>
    <button class="toast-close" aria-label="Dismiss notification">×</button>
  `;

  const dismiss = () => {
    if (toast._dismissing) return;
    toast._dismissing = true;
    toast.classList.add('fade-out');
    // Remove after the slide-out animation (0.3s) + small buffer.
    // Using setTimeout instead of animationend so removal is guaranteed
    // even when the browser skips or short-circuits the animation.
    setTimeout(() => toast.remove(), 350);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) setTimeout(dismiss, duration);
}

/**
 * Show/hide field-level error message
 * @param {string} fieldId
 * @param {string} msg  — empty string to clear error
 */
function setFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.textContent = msg;

  const input = el.closest('.form-group')?.querySelector('input');
  if (input) {
    input.classList.toggle('field-invalid', !!msg);
    input.classList.toggle('field-valid',   !msg && input.value.length > 0);
  }
}

/**
 * Show/hide form-level error banner
 */
function setFormError(elementId, msg) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = sanitize(msg);
  el.classList.toggle('show', !!msg);
}

/**
 * Toggle button loading state
 */
function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  text?.classList.toggle('hidden', loading);
  spinner?.classList.toggle('hidden', !loading);
}

/* ============================================================
   VALIDATION
   ============================================================ */

function validateEmail(email) {
  // RFC 5322 simplified regex
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Evaluate password strength
 * @returns {{ score: number, label: string, color: string }}
 */
function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8)                         score++;
  if (password.length >= 12)                        score++;
  if (/[A-Z]/.test(password))                       score++;
  if (/[0-9]/.test(password))                       score++;
  if (/[^A-Za-z0-9]/.test(password))               score++;

  const levels = [
    { label: '',         color: 'transparent', width: '0%'   },
    { label: 'Weak',     color: '#ff3b3b',      width: '20%'  },
    { label: 'Fair',     color: '#ff9800',      width: '45%'  },
    { label: 'Good',     color: '#ffd500',      width: '65%'  },
    { label: 'Strong',   color: '#00e676',      width: '85%'  },
    { label: 'Very Strong', color: '#00e676',   width: '100%' },
  ];

  return { score, ...levels[Math.min(score, 5)] };
}

/** Update password strength UI */
function updatePwStrength(password, fillId, labelId) {
  const fill  = document.getElementById(fillId);
  const label = document.getElementById(labelId);
  if (!fill || !label) return;

  const strength = getPasswordStrength(password);
  fill.style.width           = strength.width;
  fill.style.backgroundColor = strength.color;
  label.textContent          = strength.label;
  label.style.color          = strength.color;
}

/* ============================================================
   AUTH MODAL MANAGEMENT
   ============================================================ */

function openModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  switchTab(tab);

  // Trap focus in modal
  setTimeout(() => {
    const firstInput = modal.querySelector('input, button');
    firstInput?.focus();
  }, 100);
}

function closeModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  clearAllFormErrors();
}

function switchTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const signupForm   = document.getElementById('signupForm');
  const loginTab     = document.getElementById('loginTab');
  const signupTab    = document.getElementById('signupTab');
  const authSuccess  = document.getElementById('authSuccess');

  if (!loginForm || !signupForm) return;

  authSuccess?.classList.add('hidden');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    loginTab?.classList.add('active');
    loginTab?.setAttribute('aria-selected', 'true');
    signupTab?.classList.remove('active');
    signupTab?.setAttribute('aria-selected', 'false');
  } else {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    signupTab?.classList.add('active');
    signupTab?.setAttribute('aria-selected', 'true');
    loginTab?.classList.remove('active');
    loginTab?.setAttribute('aria-selected', 'false');
  }
}

function clearAllFormErrors() {
  ['loginEmailErr', 'loginPasswordErr', 'loginError',
   'signupUsernameErr', 'signupEmailErr', 'signupPasswordErr',
   'signupConfirmErr', 'signupTermsErr', 'signupError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
    if (el) el.classList.remove('show');
  });
  // Remove validation classes
  document.querySelectorAll('.field-invalid, .field-valid').forEach(i => {
    i.classList.remove('field-invalid', 'field-valid');
  });
}

/* ============================================================
   LOGIN
   ============================================================ */

async function handleLogin(event) {
  event.preventDefault();
  clearAllFormErrors();

  const email    = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;

  // Client-side validation
  let valid = true;
  if (!email || !validateEmail(email)) {
    setFieldError('loginEmailErr', 'Please enter a valid email address.');
    valid = false;
  }
  if (!password) {
    setFieldError('loginPasswordErr', 'Password is required.');
    valid = false;
  }
  if (!valid) return;

  setButtonLoading('loginSubmitBtn', true);

  try {
    const { data, error } = await _supabase.auth.signInWithPassword({
      email:    email.toLowerCase(),
      password: password,
    });

    if (error) {
      // Map Supabase error messages to user-friendly text
      const msg = mapAuthError(error);
      setFormError('loginError', msg);
      return;
    }

    showToast(`Welcome back, Trainer! 🎮`, 'success');
    closeModal();
    setTimeout(() => {
      window.location.href = APP_CONFIG.dashboardUrl;
    }, 800);

  } catch (err) {
    console.error('[Login] Unexpected error:', err);
    setFormError('loginError', 'Something went wrong. Please try again.');
  } finally {
    setButtonLoading('loginSubmitBtn', false);
  }
}

/* ============================================================
   SIGN UP
   ============================================================ */

async function handleSignup(event) {
  event.preventDefault();
  clearAllFormErrors();

  const username = document.getElementById('signupUsername')?.value.trim();
  const email    = document.getElementById('signupEmail')?.value.trim();
  const password = document.getElementById('signupPassword')?.value;
  const confirm  = document.getElementById('signupConfirm')?.value;
  const agreed   = document.getElementById('agreeTerms')?.checked;

  // Validate
  let valid = true;

  if (!username || !validateUsername(username)) {
    setFieldError('signupUsernameErr', 'Username must be 3–30 chars: letters, numbers, or underscore only.');
    valid = false;
  }
  if (!email || !validateEmail(email)) {
    setFieldError('signupEmailErr', 'Please enter a valid email address.');
    valid = false;
  }
  if (!password || !validatePassword(password)) {
    setFieldError('signupPasswordErr', 'Password must be at least 8 characters.');
    valid = false;
  }
  if (password !== confirm) {
    setFieldError('signupConfirmErr', 'Passwords do not match.');
    valid = false;
  }
  if (!agreed) {
    setFieldError('signupTermsErr', 'You must agree to the Terms of Service.');
    valid = false;
  }
  if (!valid) return;

  setButtonLoading('signupSubmitBtn', true);

  try {
    const { data, error } = await _supabase.auth.signUp({
      email:    email.toLowerCase(),
      password: password,
      options: {
        data: {
          username:     sanitize(username),
          display_name: sanitize(username),
        },
        emailRedirectTo: `${window.location.origin}${APP_CONFIG.dashboardUrl}`,
      },
    });

    if (error) {
      setFormError('signupError', mapAuthError(error));
      return;
    }

    // Check if email confirmation is required
    if (data.user && !data.session) {
      // Email verification needed
      showAuthSuccess(
        'Check Your Email! 📬',
        `We sent a confirmation link to <strong>${sanitize(email)}</strong>. Click it to activate your PokéWorld account.`
      );
    } else if (data.session) {
      // Auto-confirmed (dev mode / disabled email confirm)
      showToast('Account created! Welcome to PokéWorld! 🎉', 'success');
      closeModal();
      setTimeout(() => {
        window.location.href = APP_CONFIG.dashboardUrl;
      }, 800);
    }

  } catch (err) {
    console.error('[Signup] Unexpected error:', err);
    setFormError('signupError', 'Something went wrong. Please try again.');
  } finally {
    setButtonLoading('signupSubmitBtn', false);
  }
}

/* ============================================================
   GOOGLE OAUTH
   ============================================================ */

async function handleGoogleAuth() {
  try {
    const { error } = await _supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${APP_CONFIG.dashboardUrl}`,
        queryParams: {
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    });

    if (error) {
      showToast(mapAuthError(error), 'error');
    }
  } catch (err) {
    console.error('[Google Auth] Error:', err);
    showToast('Google sign-in failed. Please try again.', 'error');
  }
}

/* ============================================================
   FORGOT PASSWORD
   ============================================================ */

async function handleForgotPassword() {
  const email = document.getElementById('loginEmail')?.value.trim();

  if (!email || !validateEmail(email)) {
    setFieldError('loginEmailErr', 'Enter your email address first.');
    return;
  }

  setButtonLoading('loginSubmitBtn', true);

  try {
    const { error } = await _supabase.auth.resetPasswordForEmail(
      email.toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password.html`,
      }
    );

    if (error) {
      showToast(mapAuthError(error), 'error');
      return;
    }

    showAuthSuccess(
      'Reset Link Sent! 🔑',
      `Check your inbox at <strong>${sanitize(email)}</strong> for the password reset link.`
    );

  } catch (err) {
    console.error('[Forgot PW] Error:', err);
    showToast('Failed to send reset email. Try again.', 'error');
  } finally {
    setButtonLoading('loginSubmitBtn', false);
  }
}

/* ============================================================
   AUTH SUCCESS STATE
   ============================================================ */

function showAuthSuccess(title, message) {
  const loginForm   = document.getElementById('loginForm');
  const signupForm  = document.getElementById('signupForm');
  const authSuccess = document.getElementById('authSuccess');
  const titleEl     = document.getElementById('authSuccessTitle');
  const msgEl       = document.getElementById('authSuccessMsg');

  loginForm?.classList.add('hidden');
  signupForm?.classList.add('hidden');
  authSuccess?.classList.remove('hidden');

  if (titleEl) titleEl.textContent = title;
  if (msgEl)   msgEl.innerHTML = message;
}

/* ============================================================
   AUTH ERROR MAPPING
   ============================================================ */

function mapAuthError(error) {
  const msg = error?.message || '';

  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (msg.includes('Email not confirmed'))        return 'Please verify your email before logging in.';
  if (msg.includes('User already registered'))    return 'An account with this email already exists.';
  if (msg.includes('Password should be at least')) return 'Password must be at least 8 characters long.';
  if (msg.includes('rate limit'))                 return 'Too many attempts. Please wait a moment before trying again.';
  if (msg.includes('network'))                    return 'Network error. Check your connection and try again.';

  return msg || 'An unexpected error occurred. Please try again.';
}

/* ============================================================
   LOGOUT
   ============================================================ */

async function handleLogout() {
  try {
    await _supabase.auth.signOut();
    showToast('Logged out. See you next time, Trainer! 👋', 'info', 3000);
    setTimeout(() => {
      window.location.href = APP_CONFIG.homeUrl;
    }, 1000);
  } catch (err) {
    console.error('[Logout] Error:', err);
    window.location.href = APP_CONFIG.homeUrl;
  }
}

/* ============================================================
   AUTH STATE LISTENER (runs on every page)
   ============================================================ */

_supabase.auth.onAuthStateChange((event, session) => {
  const navAuth  = document.getElementById('navAuth');
  const navUser  = document.getElementById('navUser');
  const navUserName = document.getElementById('navUserName');

  if (session) {
    // User is logged in
    navAuth?.classList.add('hidden');
    navUser?.classList.remove('hidden');

    const name = session.user.user_metadata?.display_name
              || session.user.user_metadata?.full_name
              || session.user.email?.split('@')[0]
              || 'Trainer';
    if (navUserName) navUserName.textContent = name;

  } else {
    // Not logged in
    navAuth?.classList.remove('hidden');
    navUser?.classList.add('hidden');

    // If on dashboard, redirect to home
    if (window.location.pathname.includes('dashboard')) {
      window.location.href = APP_CONFIG.homeUrl;
    }
  }
});

/* ============================================================
   EVENT LISTENERS (wired after DOM ready)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ---- Modal open/close ----
  document.getElementById('navLoginBtn')  ?.addEventListener('click', () => openModal('login'));
  document.getElementById('navSignupBtn') ?.addEventListener('click', () => openModal('signup'));
  document.getElementById('heroPlayBtn')  ?.addEventListener('click', () => openModal('signup'));
  document.getElementById('modalClose')   ?.addEventListener('click', closeModal);
  document.getElementById('authSuccessClose')?.addEventListener('click', closeModal);

  // Close modal on overlay click
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('authModal')) closeModal();
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ---- Tab switches ----
  document.getElementById('loginTab')  ?.addEventListener('click', () => switchTab('login'));
  document.getElementById('signupTab') ?.addEventListener('click', () => switchTab('signup'));

  // ---- Forms ----
  document.getElementById('loginForm')  ?.addEventListener('submit', handleLogin);
  document.getElementById('signupForm') ?.addEventListener('submit', handleSignup);

  // ---- Password visibility toggle ----
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁';
    });
  });

  // ---- Password strength (signup) ----
  document.getElementById('signupPassword')?.addEventListener('input', (e) => {
    updatePwStrength(e.target.value, 'pwStrengthFill', 'pwStrengthLabel');
  });

  // ---- Google OAuth buttons ----
  document.getElementById('googleLoginBtn') ?.addEventListener('click', handleGoogleAuth);
  document.getElementById('googleSignupBtn')?.addEventListener('click', handleGoogleAuth);

  // ---- Forgot password ----
  document.getElementById('forgotPwBtn')?.addEventListener('click', handleForgotPassword);

  // ---- Nav dashboard / logout ----
  document.getElementById('navDashBtn')   ?.addEventListener('click', () => {
    window.location.href = APP_CONFIG.dashboardUrl;
  });
  document.getElementById('navLogoutBtn') ?.addEventListener('click', handleLogout);

  // ---- Mobile hamburger ----
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  const navAuth   = document.getElementById('navAuth');
  const navUser   = document.getElementById('navUser');

  hamburger?.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    navLinks?.classList.toggle('open', isOpen);
    navAuth?.classList.toggle('open',  isOpen);
    navUser?.classList.toggle('open',  isOpen);
  });

  // ---- Newsletter form (landing page) ----
  const newsletterForm = document.getElementById('newsletterForm');
  newsletterForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('newsletterEmail');
    const email = emailInput?.value.trim();

    if (!email || !validateEmail(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    const btn = newsletterForm.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining...'; }

    try {
      // Save to Supabase waitlist table (must exist — see supabase/schema.sql)
      const { error } = await _supabase
        .from('waitlist')
        .insert([{ email: email.toLowerCase() }]);

      if (error) {
        if (error.code === '23505') {
          // Unique constraint: already registered
          showToast('You are already on the waitlist! 🎉', 'warning');
        } else {
          throw error;
        }
      } else {
        showToast('You\'re on the waitlist! Check your email. 🚀', 'success');
        if (emailInput) emailInput.value = '';
      }
    } catch (err) {
      console.error('[Newsletter] Error:', err);
      showToast('Failed to join. Please try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Join'; }
    }
  });
});

// Expose utilities for other scripts
window.authUtils = {
  showToast,
  sanitize,
  handleLogout,
  setButtonLoading,
  openModal,
};
