// ==========================================
// AUTO-SUBMIT & AUTO-PROGRESS ENGINE
// ==========================================
let autoSubmitEnabled = true;

// 1. Auto-submit Login form if credentials are present
function checkAutoLogin() {
  const loginSec = document.getElementById('loginSection');
  if (!loginSec || loginSec.classList.contains('hidden')) return;

  const uInput = document.getElementById('usernameInput');
  const pInput = document.getElementById('passwordInput');
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');

  if (uInput && pInput && uInput.value.trim() && pInput.value.trim()) {
    console.log('[AutoSubmit] Login ma''lumotlari mavjud. Avtomatik Submit bosilmoqda...');
    if (submitBtn) {
      submitBtn.classList.add('ring-4', 'ring-blue-400');
      setTimeout(() => {
        document.getElementById('loginForm')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 300);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkAutoLogin, 300);
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(checkAutoLogin, 300);
}

// 2. Auto-submit for Question Answer Modal
let autoSubmitTimer = null;

function triggerAutoSubmitAnswer() {
  if (!autoSubmitEnabled) return;

  const text = document.getElementById('answerTextInput')?.value.trim();
  const btn = document.getElementById('btnSendAnswer');
  if (!text || !btn) return;

  let countdown = 3;
  btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
  btn.innerHTML = '⚡ Avto-Submit (' + countdown + 's)... [To''xtatish]';
  btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
  btn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'animate-pulse');

  if (autoSubmitTimer) clearInterval(autoSubmitTimer);

  autoSubmitTimer = setInterval(() => {
    countdown -= 1;
    if (countdown > 0) {
      btn.innerHTML = '⚡ Avto-Submit (' + countdown + 's)... [To''xtatish]';
    } else {
      clearInterval(autoSubmitTimer);
      autoSubmitTimer = null;
      console.log('[AutoSubmit] Savol javobi avtomatik yuborilmoqda...');
      submitAnswer();
    }
  }, 1000);
}

const originalRequestAiDraft = requestAiDraft;
requestAiDraft = async function() {
  await originalRequestAiDraft();
  const text = document.getElementById('answerTextInput')?.value.trim();
  if (text && autoSubmitEnabled) {
    console.log('[AutoSubmit] AI qoralama tayyorlandi. Avto-Submit ishga tushirildi.');
    triggerAutoSubmitAnswer();
  }
};

function cancelAutoSubmit() {
  if (autoSubmitTimer) {
    clearInterval(autoSubmitTimer);
    autoSubmitTimer = null;
    const btn = document.getElementById('btnSendAnswer');
    if (btn && btn.dataset.originalText) {
      btn.innerHTML = btn.dataset.originalText;
      btn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'animate-pulse');
      btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
    }
    console.log('[AutoSubmit] To''xtatildi.');
  }
}
