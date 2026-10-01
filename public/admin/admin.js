let authToken = localStorage.getItem('se_token');
let currentTab = 'dashboard';
let currentFilter = 'ALL';
let activeQuestion = null;

if (authToken) {
  showApp();
} else {
  showLogin();
}

function showLogin() {
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('appSection').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  refreshData();
  startLivePolling();
  updateSoundUI();
  updateBrowserNotifUI();
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => {
      Notification.requestPermission().then(updateBrowserNotifUI);
    }, 1500);
  }
}

function logout() {
  localStorage.removeItem('se_token');
  authToken = null;
  stopLivePolling();
  showLogin();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('usernameInput').value;
  const p = document.getElementById('passwordInput').value;
  const errBox = document.getElementById('loginError');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Kirish xatosi');

    authToken = data.token;
    localStorage.setItem('se_token', authToken);
    document.getElementById('adminNameDisplay').textContent = data.user.name;
    showApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

async function api(path, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = 'Bearer ' + authToken;
  }
  if (options.body && typeof options.body === 'object') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, options);
  if (res.status === 401) {
    logout();
    throw new Error('Sessiya tugadi');
  }
  return res.json();
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('bg-blue-600', 'text-white');
    el.classList.add('text-slate-400');
  });
  document.getElementById('nav-' + tabId)?.classList.add('bg-blue-600', 'text-white');
  document.getElementById('nav-' + tabId)?.classList.remove('text-slate-400');

  document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
  document.getElementById('tab-' + tabId)?.classList.remove('hidden');

  const titles = {
    dashboard: 'Dashboard',
    questions: 'Savollar boshqaruvi',
    payments: 'To‘lovlar nazorati',
    services: 'Xizmat tariflari',
    settings: 'Tizim sozlamalari',
    logs: 'Tizim jurnali',
  };
  document.getElementById('pageTitle').textContent = titles[tabId] || 'Dashboard';
  refreshData();
}

async function refreshData() {
  if (currentTab === 'dashboard') loadDashboard();
  else if (currentTab === 'questions') loadQuestions();
  else if (currentTab === 'payments') loadPayments();
  else if (currentTab === 'services') loadServices();
  else if (currentTab === 'settings') loadSettings();
  else if (currentTab === 'logs') loadLogs();
}

async function loadDashboard() {
  try {
    const stats = await api('/api/dashboard/stats');
    document.getElementById('statTotalUsers').textContent = stats.users.total;
    document.getElementById('statTodayQuestions').textContent = stats.questions.today;
    document.getElementById('statTotalQuestions').textContent = stats.questions.total;
    document.getElementById('statInProgress').textContent = stats.questions.inProgress + stats.questions.paid;
    document.getElementById('statTotalRevenue').textContent = stats.revenue.total.toLocaleString('uz-UZ') + ' so‘m';
    document.getElementById('statTodayRevenue').textContent = stats.revenue.today.toLocaleString('uz-UZ') + ' so‘m';

    document.getElementById('periodTodayRevenue').textContent = stats.revenue.today.toLocaleString('uz-UZ') + ' so‘m';
    document.getElementById('periodWeekRevenue').textContent = stats.revenue.week.toLocaleString('uz-UZ') + ' so‘m';
    document.getElementById('periodMonthRevenue').textContent = stats.revenue.month.toLocaleString('uz-UZ') + ' so‘m';

    document.getElementById('statusPendingCount').textContent = stats.questions.paymentPending;
    document.getElementById('statusPaidCount').textContent = stats.questions.paid + stats.questions.inProgress;
    document.getElementById('statusAnsweredCount').textContent = stats.questions.answered;
    document.getElementById('statusCompletedCount').textContent = stats.questions.completed;

    const pendingBadge = document.getElementById('badgePendingQuestions');
    const pendingTotal = stats.questions.paymentPending + stats.questions.inProgress;
    if (pendingTotal > 0) {
      pendingBadge.textContent = pendingTotal;
      pendingBadge.classList.remove('hidden');
    } else {
      pendingBadge.classList.add('hidden');
    }

    const qData = await api('/api/questions?limit=5');
    const tb = document.getElementById('dashboardRecentTable');
    if (!qData.questions || qData.questions.length === 0) {
      tb.innerHTML = '<tr><td colspan="7" class="px-6 py-6 text-center text-slate-400">Savollar yo‘q</td></tr>';
      return;
    }
    tb.innerHTML = qData.questions.map(q => renderQuestionRow(q)).join('');
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function loadQuestions() {
  try {
    let url = '/api/questions?status=' + currentFilter;
    const search = document.getElementById('questionSearchInput')?.value;
    if (search) url += '&search=' + encodeURIComponent(search);

    const data = await api(url);
    const tb = document.getElementById('questionsTableBody');
    if (!data.questions || data.questions.length === 0) {
      tb.innerHTML = '<tr><td colspan="9" class="px-6 py-8 text-center text-slate-400">Mos keluvchi savollar topilmadi</td></tr>';
      return;
    }
    tb.innerHTML = data.questions.map(q => renderQuestionRow(q)).join('');
  } catch (err) {
    console.error('Failed to load questions:', err);
  }
}

function filterQuestions(status) {
  currentFilter = status;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('bg-blue-600', 'text-white');
    btn.classList.add('bg-white', 'text-slate-700');
  });
  const activeBtn = document.getElementById('filter-' + status);
  activeBtn?.classList.add('bg-blue-600', 'text-white');
  activeBtn?.classList.remove('bg-white', 'text-slate-700');
  loadQuestions();
}

let searchTimeout;
function handleSearch(val) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadQuestions, 300);
}

function renderQuestionRow(q) {
  const statusLabels = {
    NEW: 'Yangi',
    PAYMENT_PENDING: 'To‘lov kutilmoqda',
    PAID: 'To‘langan',
    IN_PROGRESS: 'Jarayonda',
    ANSWERED: 'Javob tayyor',
    COMPLETED: 'Yakunlangan',
  };
  const userText = q.user?.username ? '@' + q.user.username : (q.user?.firstName || 'Mijoz');
  const date = new Date(q.createdAt).toLocaleDateString('uz-UZ');
  const fileCount = q.files?.length || 0;

  return `
    <tr class="hover:bg-slate-50/80 transition">
      <td class="px-6 py-4 font-mono font-bold text-xs text-blue-600">#${q.questionNumber}</td>
      <td class="px-6 py-4 font-medium text-slate-900">${userText}</td>
      <td class="px-6 py-4 max-w-xs truncate text-slate-700" title="${escapeHtml(q.questionText)}">${escapeHtml(q.questionText)}</td>
      <td class="px-6 py-4 text-xs font-semibold text-slate-600">${q.service?.nameUz || 'Maslahat'}</td>
      <td class="px-6 py-4 font-bold text-slate-900">${q.price.toLocaleString('uz-UZ')} so‘m</td>
      <td class="px-6 py-4">
        <span class="inline-block px-2.5 py-1 rounded-full text-xs font-bold border badge-${q.status}">
          ${statusLabels[q.status] || q.status}
        </span>
      </td>
      <td class="px-6 py-4 text-xs text-slate-500">${fileCount > 0 ? '📎 ' + fileCount + ' ta' : '—'}</td>
      <td class="px-6 py-4 text-xs text-slate-400">${date}</td>
      <td class="px-6 py-4 text-right">
        <button onclick="openQuestionModal(${q.id})" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg transition">
          Ko‘rish / Javob
        </button>
      </td>
    </tr>
  `;
}

async function openQuestionModal(id) {
  const q = await api('/api/questions/' + id);
  activeQuestion = q;

  document.getElementById('modalQuestionNumber').textContent = 'Savol #' + q.questionNumber;
  document.getElementById('modalUserSubtitle').textContent = 'Foydalanuvchi: ' + (q.user?.username ? '@' + q.user.username : q.user?.firstName || 'Mijoz') + ' (ID: ' + q.user?.telegramId + ')';
  document.getElementById('modalServiceName').textContent = q.service?.nameUz || 'Soliq xizmati';
  document.getElementById('modalPrice').textContent = q.price.toLocaleString('uz-UZ') + ' so‘m';
  document.getElementById('modalCreatedAt').textContent = new Date(q.createdAt).toLocaleDateString('uz-UZ');

  const badge = document.getElementById('modalStatusBadge');
  badge.className = 'inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-bold border badge-' + q.status;
  badge.textContent = q.status;

  document.getElementById('modalQuestionText').textContent = q.questionText;

  const filesSec = document.getElementById('modalFilesSection');
  const filesList = document.getElementById('modalFilesList');
  const hasFiles = q.files && q.files.length > 0;
  const receipts = (q.payments || []).filter(p => p.receiptFileId);

  if (hasFiles || receipts.length > 0) {
    filesSec.classList.remove('hidden');
    let items = [];
    if (hasFiles) {
      items.push(...q.files.map(f => {
        const isPhoto = f.fileType === 'photo' || (f.fileName && /\.(jpe?g|png|webp)$/i.test(f.fileName));
        const icon = isPhoto ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCC4';
        const name = f.fileName || (isPhoto ? 'Rasm / Hujjat' : 'Hujjat');
        return `
          <a href="/api/questions/file/${f.fileId}" target="_blank" rel="noopener noreferrer" 
             class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition shadow-sm group">
            <span>${icon}</span>
            <span class="truncate max-w-[200px]" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <span class="text-blue-500 font-bold group-hover:translate-x-0.5 transition-transform">\u2B07\uFE0F Ochish</span>
          </a>
        `;
      }));
    }
    if (receipts.length > 0) {
      items.push(...receipts.map(p => `
        <a href="/api/payments/${p.id}/receipt" target="_blank" rel="noopener noreferrer" 
           class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 transition shadow-sm group">
          <span>\uD83E\uDDFE</span>
          <span>To\u2018lov cheki (${p.amount.toLocaleString('uz-UZ')} so\u2018m)</span>
          <span class="text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform">\u2B07\uFE0F Ochish</span>
        </a>
      `));
    }
    filesList.innerHTML = items.join('');
  } else {
    filesSec.classList.add('hidden');
  }

  document.getElementById('answerTextInput').value = q.answer?.answerText || q.aiDraftAnswer || '';
  document.getElementById('legalBasisInput').value = q.answer?.legalBasis || q.aiLegalBasis || '';
  document.getElementById('conclusionInput').value = q.answer?.conclusion || '';

  const aiBox = document.getElementById('aiSummaryBox');
  if (q.aiSummary) {
    aiBox.innerHTML = `
      <p class="font-bold text-blue-950 mb-1">Kategoriya: ${q.aiCategory || 'Soliq'}</p>
      <p class="mb-1">${q.aiSummary}</p>
      <p class="text-[11px] text-blue-800"><b>Tegishli normalar:</b> ${q.aiLegalBasis || 'Soliq kodeksi'}</p>
    `;
    aiBox.classList.remove('hidden');
  } else {
    aiBox.classList.add('hidden');
  }

  document.getElementById('questionModal').classList.remove('hidden');
}

function closeQuestionModal() {
  document.getElementById('questionModal').classList.add('hidden');
  activeQuestion = null;
}

async function requestAiDraft() {
  if (!activeQuestion) return;
  const btn = document.getElementById('btnAiDraft');
  btn.textContent = 'Tahlil qilinmoqda...';
  btn.disabled = true;

  try {
    const ai = await api('/api/questions/' + activeQuestion.id + '/ai-draft', { method: 'POST' });
    document.getElementById('answerTextInput').value = ai.draftAnswer || '';
    document.getElementById('legalBasisInput').value = ai.legalBasis || '';
    
    const aiBox = document.getElementById('aiSummaryBox');
    aiBox.innerHTML = `
      <p class="font-bold text-blue-950 mb-1">Kategoriya: ${ai.category}</p>
      <p class="mb-1">${ai.summary}</p>
      <p class="text-[11px] text-blue-800"><b>Tegishli normalar:</b> ${ai.legalBasis}</p>
    `;
    aiBox.classList.remove('hidden');
  } catch (err) {
    alert('AI tahlil xatosi: ' + err.message);
  } finally {
    btn.textContent = 'Qoralama Yaratish';
    btn.disabled = false;
  }
}

async function submitAnswer() {
  if (!activeQuestion) return;
  const text = document.getElementById('answerTextInput').value.trim();
  const legal = document.getElementById('legalBasisInput').value.trim();
  const conc = document.getElementById('conclusionInput').value.trim();

  if (!text) {
    alert('Iltimos, tahlil matnini yozing!');
    return;
  }

  const btn = document.getElementById('btnSendAnswer');
  btn.textContent = 'Yuborilmoqda...';
  btn.disabled = true;

  try {
    await api('/api/questions/' + activeQuestion.id + '/answer', {
      method: 'POST',
      body: { answerText: text, legalBasis: legal, conclusion: conc },
    });

    alert('Javob foydalanuvchiga Telegram orqali yuborildi!');
    closeQuestionModal();
    refreshData();
  } catch (err) {
    alert('Xatolik: ' + err.message);
  } finally {
    btn.textContent = '🚀 Foydalanuvchiga yuborish (Telegram)';
    btn.disabled = false;
  }
}

async function loadPayments() {
  try {
    const list = await api('/api/payments');
    const tb = document.getElementById('paymentsTableBody');
    if (!list || list.length === 0) {
      tb.innerHTML = '<tr><td colspan="9" class="px-6 py-8 text-center text-slate-400">To‘lovlar yo‘q</td></tr>';
      return;
    }

    tb.innerHTML = list.map(p => `
      <tr class="hover:bg-slate-50">
        <td class="px-6 py-4 font-mono font-bold text-xs">#${p.id}</td>
        <td class="px-6 py-4 text-blue-600 font-bold">#${p.question?.questionNumber || p.questionId}</td>
        <td class="px-6 py-4 font-medium">${p.user?.username ? '@' + p.user.username : (p.user?.firstName || 'Mijoz')}</td>
        <td class="px-6 py-4 font-bold text-slate-900">${p.amount.toLocaleString('uz-UZ')} so‘m</td>
        <td class="px-6 py-4 text-xs font-semibold">${p.paymentMethod}</td>
        <td class="px-6 py-4">
          <span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold badge-${p.status}">${p.status}</span>
        </td>
        <td class="px-6 py-4 text-xs font-mono">${p.receiptFileId ? `<a href="/api/payments/${p.id}/receipt" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 font-semibold transition"><span>\uD83E\uDDFE</span><span>Chekni ochish \u2197</span></a>` : '<span class="text-slate-400">\u2014</span>'}</td>
        <td class="px-6 py-4 text-xs text-slate-400">${new Date(p.createdAt).toLocaleDateString('uz-UZ')}</td>
        <td class="px-6 py-4 text-right space-x-2">
          ${p.status === 'PENDING' ? `
            <button onclick="approvePayment(${p.id})" class="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold rounded-lg transition">Tasdiqlash</button>
            <button onclick="rejectPayment(${p.id})" class="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold rounded-lg transition">Rad etish</button>
          ` : '—'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load payments:', err);
  }
}

async function approvePayment(id) {
  if (!confirm('To‘lovni tasdiqlaysizmi?')) return;
  await api('/api/payments/' + id + '/approve', { method: 'POST' });
  loadPayments();
}

async function rejectPayment(id) {
  if (!confirm('To‘lovni rad etasizmi?')) return;
  await api('/api/payments/' + id + '/reject', { method: 'POST' });
  loadPayments();
}

async function loadServices() {
  try {
    const services = await api('/api/services');
    const cont = document.getElementById('servicesContainer');
    cont.innerHTML = services.map(s => `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-blue-600">${s.code}</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-bold ${s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
            ${s.isActive ? 'Faol' : 'Nofaol'}
          </span>
        </div>
        <div>
          <h4 class="font-bold text-slate-900 text-base">${s.nameUz}</h4>
          <p class="text-xs text-slate-500 mt-1">${s.descriptionUz}</p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-400">Narxi:</span>
          <span class="font-bold text-slate-900 text-base">${s.priceText || (s.price.toLocaleString('uz-UZ') + ' so‘m')}</span>
        </div>
        <button onclick="editServicePrice(${s.id}, ${s.price})" class="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition">
          Narxni o‘zgartirish
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load services:', err);
  }
}

async function editServicePrice(id, currentPrice) {
  const newPrice = prompt('Yangi narxni kiriting (so‘m):', currentPrice);
  if (newPrice !== null && !isNaN(parseInt(newPrice, 10))) {
    await api('/api/services/' + id, {
      method: 'PUT',
      body: { price: parseInt(newPrice, 10), priceText: parseInt(newPrice, 10).toLocaleString('uz-UZ') + ' so‘m' },
    });
    loadServices();
  }
}

async function loadSettings() {
  try {
    const settings = await api('/api/settings');
    settings.forEach(s => {
      if (s.key === 'payment_card') document.getElementById('settingCardInput').value = s.value;
      if (s.key === 'payment_card_holder') document.getElementById('settingHolderInput').value = s.value;
      if (s.key === 'rules_uz') document.getElementById('settingRulesUz').value = s.value;
      if (s.key === 'rules_ru') document.getElementById('settingRulesRu').value = s.value;
    });
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettings() {
  const settings = [
    { key: 'payment_card', value: document.getElementById('settingCardInput').value },
    { key: 'payment_card_holder', value: document.getElementById('settingHolderInput').value },
    { key: 'rules_uz', value: document.getElementById('settingRulesUz').value },
    { key: 'rules_ru', value: document.getElementById('settingRulesRu').value },
  ];
  await api('/api/settings', { method: 'PUT', body: { settings } });
  alert('Sozlamalar saqlandi!');
}

async function loadLogs() {
  try {
    const logs = await api('/api/logs');
    const tb = document.getElementById('logsTableBody');
    tb.innerHTML = logs.map(l => `
      <tr class="hover:bg-slate-50">
        <td class="px-6 py-4 font-mono font-bold text-xs">#${l.id}</td>
        <td class="px-6 py-4 font-semibold text-xs text-blue-700 font-mono">${l.eventType}</td>
        <td class="px-6 py-4 text-slate-800 text-xs">${l.description}</td>
        <td class="px-6 py-4 text-xs text-slate-400">${new Date(l.createdAt).toLocaleString('uz-UZ')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ==========================================
// REAL-TIME NOTIFICATIONS & LIVE POLLING
// ==========================================
let soundEnabled = localStorage.getItem('se_sound_enabled') !== 'false';
let livePollingInterval = null;
let lastKnownQuestionId = null;
let lastKnownPaymentId = null;
let isInitialPoll = true;
let unreadNotificationsCount = 0;
const originalDocTitle = document.title || 'Soliq Expert - Admin Panel';

// Web Audio API Context (Lazily initialized on first user click)
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioCtx = new AudioCtx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

window.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: false });

function playNotificationSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // First tone: 659.25Hz (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Second tone: 880Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.75);
  } catch (e) {
    console.debug('Notification sound error:', e);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('se_sound_enabled', soundEnabled ? 'true' : 'false');
  updateSoundUI();
  if (soundEnabled) {
    playNotificationSound();
  }
}

function updateSoundUI() {
  const icon = document.getElementById('soundIcon');
  const label = document.getElementById('soundLabel');
  if (!icon || !label) return;
  if (soundEnabled) {
    icon.textContent = '🔊';
    label.textContent = 'Ovoz: Yoqilgan';
  } else {
    icon.textContent = '🔇';
    label.textContent = 'Ovoz: O‘chirilgan';
  }
}

function enableBrowserNotifications() {
  if (!('Notification' in window)) {
    alert('Brauzeringiz bildirishnomalarni qo‘llab-quvvatlamaydi.');
    return;
  }
  Notification.requestPermission().then(permission => {
    updateBrowserNotifUI();
    if (permission === 'granted') {
      showBrowserNotification('🔔 Bildirishnomalar faol!', 'Yangi savollar va to‘lovlar haqida brauzer xabar beradi.');
    }
  });
}

function updateBrowserNotifUI() {
  const btn = document.getElementById('btnBrowserNotif');
  const label = document.getElementById('browserNotifLabel');
  if (!btn || !label) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    label.textContent = 'Xabarlar: Faol';
    btn.className = 'inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition';
  } else {
    label.textContent = 'Xabarlarni yoqish';
    btn.className = 'inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition';
  }
}

function showBrowserNotification(title, body, onClick) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
      });
      if (onClick) {
        notif.onclick = () => {
          window.focus();
          onClick();
        };
      }
    } catch (e) {
      console.debug('Browser notification error:', e);
    }
  }
}

function updateDocumentTitle(count) {
  unreadNotificationsCount += count;
  if (unreadNotificationsCount > 0) {
    document.title = `(${unreadNotificationsCount}) 🔔 Yangi savol! - Soliq Expert`;
  }
}

window.addEventListener('focus', () => {
  unreadNotificationsCount = 0;
  document.title = originalDocTitle;
});

function showToast({ title, message, badge, questionId, paymentId, isReceipt }) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'transform transition-all duration-300 ease-out translate-x-full opacity-0 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 flex flex-col space-y-2 pointer-events-auto border-l-4 ' + (isReceipt ? 'border-l-emerald-500' : 'border-l-blue-600');
  
  toast.innerHTML = `
    <div class="flex items-start justify-between">
      <div class="flex items-center space-x-2">
        <span class="text-xl">${isReceipt ? '🧾' : '🔔'}</span>
        <span class="font-bold text-sm text-slate-900">${escapeHtml(title)}</span>
      </div>
      <button onclick="this.closest('.transform').remove()" class="text-slate-400 hover:text-slate-600 text-sm font-bold p-1">✕</button>
    </div>
    <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(message)}</p>
    <div class="flex items-center justify-between pt-1">
      <span class="text-[11px] font-semibold text-slate-400">${badge || 'Hozirgina'}</span>
      ${questionId ? `
        <button onclick="openQuestionModal(${questionId}); this.closest('.transform').remove();" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition">
          Ko‘rish / Javob ↗
        </button>
      ` : ''}
      ${paymentId ? `
        <button onclick="switchTab('payments'); this.closest('.transform').remove();" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition">
          To‘lovni ko‘rish ↗
        </button>
      ` : ''}
    </div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => toast.remove(), 350);
  }, 9000);
}

async function startLivePolling() {
  if (livePollingInterval) clearInterval(livePollingInterval);
  await checkLiveUpdates();
  livePollingInterval = setInterval(checkLiveUpdates, 6000);
}

function stopLivePolling() {
  if (livePollingInterval) {
    clearInterval(livePollingInterval);
    livePollingInterval = null;
  }
}

async function checkLiveUpdates() {
  if (!authToken) return;
  try {
    const [qData, pData, stats] = await Promise.all([
      api('/api/questions?limit=5'),
      api('/api/payments'),
      api('/api/dashboard/stats'),
    ]);

    // Update pending count badge on sidebar
    const pendingBadge = document.getElementById('badgePendingQuestions');
    if (pendingBadge && stats && stats.questions) {
      const pendingTotal = (stats.questions.paymentPending || 0) + (stats.questions.inProgress || 0);
      if (pendingTotal > 0) {
        pendingBadge.textContent = pendingTotal;
        pendingBadge.classList.remove('hidden');
      } else {
        pendingBadge.classList.add('hidden');
      }
    }

    // Check for new questions
    const questions = qData.questions || [];
    if (questions.length > 0) {
      const maxQId = Math.max(...questions.map(q => q.id));

      if (isInitialPoll) {
        lastKnownQuestionId = maxQId;
      } else if (lastKnownQuestionId !== null && maxQId > lastKnownQuestionId) {
        const newQuestions = questions.filter(q => q.id > lastKnownQuestionId);
        newQuestions.reverse().forEach(q => {
          playNotificationSound();
          const userStr = q.user?.username ? '@' + q.user.username : (q.user?.firstName || 'Mijoz');
          const serviceStr = q.service?.nameUz || 'Soliq maslahati';
          const previewText = q.questionText ? q.questionText.slice(0, 100) : 'Yangi savol';

          showToast({
            title: 'Yangi savol kelib tushdi! #' + q.questionNumber,
            message: `${userStr} (${serviceStr}): "${previewText}..."`,
            badge: `${(q.price || 0).toLocaleString('uz-UZ')} so‘m`,
            questionId: q.id,
          });

          showBrowserNotification(
            '🔔 Yangi savol: #' + q.questionNumber,
            `${userStr}: ${previewText}`,
            () => openQuestionModal(q.id)
          );

          updateDocumentTitle(1);
        });

        lastKnownQuestionId = maxQId;

        // Auto-refresh active view
        if (currentTab === 'dashboard') loadDashboard();
        else if (currentTab === 'questions') loadQuestions();
      }
    }

    // Check for new payments
    if (Array.isArray(pData) && pData.length > 0) {
      const maxPId = Math.max(...pData.map(p => p.id));
      if (isInitialPoll) {
        lastKnownPaymentId = maxPId;
      } else if (lastKnownPaymentId !== null && maxPId > lastKnownPaymentId) {
        const newPayments = pData.filter(p => p.id > lastKnownPaymentId);
        newPayments.reverse().forEach(p => {
          playNotificationSound();
          const userStr = p.user?.username ? '@' + p.user.username : (p.user?.firstName || 'Mijoz');
          showToast({
            title: 'Yangi to‘lov cheki keldi!',
            message: `${userStr} ${p.amount.toLocaleString('uz-UZ')} so‘m to‘lov chekini yubordi.`,
            badge: 'To‘lov #' + p.id,
            paymentId: p.id,
            isReceipt: true,
          });

          showBrowserNotification(
            '🧾 Yangi to‘lov cheki!',
            `${userStr}: ${p.amount.toLocaleString('uz-UZ')} so‘m to‘lov cheki kelib tushdi.`,
            () => switchTab('payments')
          );
        });

        lastKnownPaymentId = maxPId;
        if (currentTab === 'payments') loadPayments();
        if (currentTab === 'dashboard') loadDashboard();
      }
    }

    isInitialPoll = false;
  } catch (err) {
    console.debug('[LivePoll] background check skipped:', err.message);
  }
}
