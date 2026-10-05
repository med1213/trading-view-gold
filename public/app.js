// Gold TradingView Alert Terminal - Frontend Logic
(() => {
  // State
  let currentPrice = 0;
  let previousPrice = 0;
  let activeAlerts = [];
  let currentFilter = 'all';
  let soundEnabled = true;
  let tvWidgetInstance = null;
  let currentInterval = '15';

  // DOM Elements
  const livePriceEl = document.getElementById('livePrice');
  const liveChangeEl = document.getElementById('liveChange');
  const statHighEl = document.getElementById('statHigh');
  const statLowEl = document.getElementById('statLow');
  const statSpreadEl = document.getElementById('statSpread');
  const statFeedEl = document.getElementById('statFeed');
  const formCurrentPriceEl = document.getElementById('formCurrentPrice');
  const targetPriceInput = document.getElementById('targetPriceInput');
  const alertNoteInput = document.getElementById('alertNoteInput');
  const alertChatIdInput = document.getElementById('alertChatIdInput');
  const createAlertForm = document.getElementById('createAlertForm');
  const alertsListContainer = document.getElementById('alertsListContainer');
  const activeAlertsCountEl = document.getElementById('activeAlertsCount');
  const logsListContainer = document.getElementById('logsListContainer');
  const soundToggleBtn = document.getElementById('soundToggle');
  const btnRefreshPrice = document.getElementById('btnRefreshPrice');

  // Bot Modal Elements
  const botModal = document.getElementById('botModal');
  const btnOpenBotModal = document.getElementById('btnOpenBotModal');
  const btnCloseBotModal = document.getElementById('btnCloseBotModal');
  const botConfigForm = document.getElementById('botConfigForm');
  const botTokenInput = document.getElementById('botTokenInput');
  const botDefaultChatIdInput = document.getElementById('botDefaultChatIdInput');
  const btnTestTelegramAlert = document.getElementById('btnTestTelegramAlert');
  const botDot = document.getElementById('botDot');
  const botBtnText = document.getElementById('botBtnText');
  const modalBotStatusBanner = document.getElementById('modalBotStatusBanner');
  const modalBotStatusText = document.getElementById('modalBotStatusText');
  const toastContainer = document.getElementById('toastContainer');

  // Initialize
  function init() {
    initTradingViewChart('15');
    setupEventListeners();
    fetchPrice();
    fetchAlerts();
    fetchBotStatus();
    fetchLogs();

    // Polling cycles
    setInterval(fetchPrice, 2500);
    setInterval(fetchAlerts, 3000);
    setInterval(fetchLogs, 5000);
    setInterval(fetchBotStatus, 10000);
  }

  // TradingView Embed Widget
  function initTradingViewChart(interval = '15') {
    currentInterval = interval;
    const container = document.getElementById('tradingview_xauusd');
    if (!container) return;
    container.innerHTML = '';

    if (typeof TradingView !== 'undefined') {
      tvWidgetInstance = new TradingView.widget({
        autosize: true,
        symbol: 'OANDA:XAUUSD',
        interval: interval,
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0e131f',
        enable_publishing: false,
        allow_symbol_change: true,
        save_image: false,
        container_id: 'tradingview_xauusd',
        hide_side_toolbar: false,
        studies: [
          'RSI@tv-basicstudies',
          'MASimple@tv-basicstudies',
          'Volume@tv-basicstudies',
        ],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#10b981',
          'mainSeriesProperties.candleStyle.downColor': '#ef4444',
          'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
          'paneProperties.background': '#0e131f',
          'paneProperties.vertGridProperties.color': 'rgba(255, 255, 255, 0.04)',
          'paneProperties.horzGridProperties.color': 'rgba(255, 255, 255, 0.04)',
        },
      });
    } else {
      // Fallback iframe
      container.innerHTML = `
        <iframe 
          src="https://s.tradingview.com/widgetembed/?symbol=OANDA%3AXAUUSD&interval=${interval}&theme=dark&style=1" 
          style="width: 100%; height: 100%; border: none;">
        </iframe>
      `;
    }
  }

  // Fetch Gold Price
  async function fetchPrice() {
    try {
      const res = await fetch('/api/gold/price');
      if (!res.ok) return;
      const data = await res.json();
      updatePriceUI(data);
    } catch (err) {
      console.warn('Error fetching gold price:', err);
    }
  }

  function updatePriceUI(data) {
    if (!data || !data.price) return;
    previousPrice = currentPrice;
    currentPrice = data.price;

    const formattedPrice = data.price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    livePriceEl.textContent = formattedPrice;
    formCurrentPriceEl.textContent = `$${formattedPrice}`;

    // Price flash animation
    if (previousPrice > 0 && currentPrice !== previousPrice) {
      livePriceEl.classList.remove('price-up', 'price-down');
      void livePriceEl.offsetWidth; // trigger reflow
      if (currentPrice > previousPrice) {
        livePriceEl.classList.add('price-up');
      } else {
        livePriceEl.classList.add('price-down');
      }
    }

    // Change badge
    const sign = data.change24h >= 0 ? '+' : '';
    liveChangeEl.textContent = `${sign}${data.change24h.toFixed(2)} (${sign}${data.change24hPercent.toFixed(2)}%)`;
    liveChangeEl.className = `change-badge ${data.change24h >= 0 ? 'positive' : 'negative'}`;

    // Stats
    const statLakBahtEl = document.getElementById('statLakBaht');
    const statLakOzEl = document.getElementById('statLakOz');
    const statLakGramEl = document.getElementById('statLakGram');
    const statHighLowEl = document.getElementById('statHighLow');

    if (data.lak) {
      if (statLakBahtEl) statLakBahtEl.textContent = `₭ ${data.lak.pricePerBaht.toLocaleString()}`;
      if (statLakOzEl) statLakOzEl.textContent = `₭ ${data.lak.pricePerOunce.toLocaleString()}`;
      if (statLakGramEl) statLakGramEl.textContent = `₭ ${data.lak.pricePerGram.toLocaleString()}`;
    }
    if (statHighLowEl) {
      statHighLowEl.textContent = `$${data.high24h.toFixed(1)} / $${data.low24h.toFixed(1)}`;
    }

    // Default target price if empty
    if (!targetPriceInput.value) {
      targetPriceInput.value = (Math.round((currentPrice + 10) * 10) / 10).toFixed(1);
    }

    renderAlertsList();
  }

  // Fetch Alerts
  async function fetchAlerts() {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = await res.json();
      
      // Check for newly triggered alerts to play sound
      const previouslyActiveIds = activeAlerts
        .filter((a) => a.status === 'ACTIVE')
        .map((a) => a.id);

      activeAlerts = data;
      const newlyTriggered = data.filter(
        (a) => a.status === 'TRIGGERED' && previouslyActiveIds.includes(a.id),
      );

      if (newlyTriggered.length > 0) {
        newlyTriggered.forEach((a) => {
          showToast(`🚨 Alert Triggered: Gold ${a.condition} $${a.targetPrice.toFixed(2)}!`, 'error');
          playAlertChime();
        });
        fetchLogs();
      }

      renderAlertsList();
    } catch (err) {
      console.warn('Error fetching alerts:', err);
    }
  }

  // Render Alerts
  function renderAlertsList() {
    let filtered = activeAlerts;
    if (currentFilter !== 'all') {
      filtered = activeAlerts.filter((a) => a.status === currentFilter);
    }

    const activeCount = activeAlerts.filter((a) => a.status === 'ACTIVE').length;
    activeAlertsCountEl.textContent = activeCount;

    if (filtered.length === 0) {
      alertsListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <h3>${currentFilter === 'all' ? 'No Gold Alerts Set' : 'No ' + currentFilter + ' Alerts'}</h3>
          <p>Create an alert above or use <code>/alert</code> on Telegram to receive instant notifications.</p>
        </div>
      `;
      return;
    }

    alertsListContainer.innerHTML = filtered
      .map((a) => {
        const isTriggered = a.status === 'TRIGGERED';
        const isAbove = a.condition === 'ABOVE';
        const diff = a.targetPrice - currentPrice;
        const diffSign = diff >= 0 ? '+' : '-';
        const absDiff = Math.abs(diff).toFixed(2);
        const diffPct = currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(2) : '0.00';

        let statusBadge = `<span class="alert-condition-tag ${isAbove ? 'above' : 'below'}">
          ${isAbove ? '▲ ABOVE' : '▼ BELOW'}
        </span>`;

        if (isTriggered) {
          statusBadge = `<span class="alert-condition-tag" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">
            ✓ TRIGGERED @ $${a.triggeredPrice ? a.triggeredPrice.toFixed(2) : a.targetPrice.toFixed(2)}
          </span>`;
        } else if (a.status === 'DISABLED') {
          statusBadge = `<span class="alert-condition-tag" style="background: rgba(148, 163, 184, 0.2); color: #94a3b8;">
            ⏸ PAUSED
          </span>`;
        }

        return `
          <div class="alert-item-card ${isTriggered ? 'triggered' : ''}">
            <div class="alert-item-top">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${statusBadge}
                <span class="alert-price-target">$${a.targetPrice.toFixed(2)}</span>
              </div>
              <div class="alert-actions-group">
                <button class="btn-small-del" onclick="window.toggleAlert('${a.id}')" title="Toggle Alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                  </svg>
                </button>
                <button class="btn-small-del" onclick="window.deleteAlert('${a.id}')" title="Delete Alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
            <div class="alert-item-body">
              <span class="alert-distance">
                ${isTriggered ? 'Triggered ' + new Date(a.triggeredAt || a.createdAt).toLocaleTimeString() : `${diffSign}$${absDiff} (${diffSign}${diffPct}%)`}
              </span>
              ${a.note ? `<span class="alert-note-badge" title="${a.note}">📝 ${a.note}</span>` : `<span style="font-size: 0.7rem; color: #64748b;">${new Date(a.createdAt).toLocaleTimeString()}</span>`}
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Fetch Trigger Logs
  async function fetchLogs() {
    try {
      const res = await fetch('/api/alerts/logs');
      if (!res.ok) return;
      const logs = await res.json();
      if (!logs || logs.length === 0) {
        logsListContainer.innerHTML = '<div class="empty-log-state">No triggers recorded in this session.</div>';
        return;
      }
      logsListContainer.innerHTML = logs
        .slice(0, 15)
        .map((l) => {
          const timeStr = new Date(l.time).toLocaleTimeString();
          return `
            <div class="log-entry">
              <span class="log-time">${timeStr}</span>
              <span class="log-msg">XAU/USD ${l.alert.condition} $${l.alert.targetPrice}</span>
              <span class="log-price">$${l.price.toFixed(2)}</span>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.warn('Error fetching logs:', err);
    }
  }

  // Fetch Telegram Bot Status
  async function fetchBotStatus() {
    try {
      const res = await fetch('/api/bot/status');
      if (!res.ok) return;
      const status = await res.json();

      if (status.connected && status.username) {
        botDot.className = 'status-dot connected';
        botBtnText.textContent = `@${status.username}`;
        modalBotStatusBanner.innerHTML = `
          <span class="status-dot connected"></span>
          <span>Connected to Telegram as <b>@${status.username}</b></span>
        `;
      } else if (status.configuredToken) {
        botDot.className = 'status-dot disconnected';
        botBtnText.textContent = 'Connecting...';
        modalBotStatusBanner.innerHTML = `
          <span class="status-dot disconnected"></span>
          <span>Token saved (${status.tokenMasked}). Connecting...</span>
        `;
      } else {
        botDot.className = 'status-dot disconnected';
        botBtnText.textContent = 'Configure Bot';
        modalBotStatusBanner.innerHTML = `
          <span class="status-dot disconnected"></span>
          <span>No Telegram Bot Token configured.</span>
        `;
      }

      if (status.defaultChatId && !botDefaultChatIdInput.value) {
        botDefaultChatIdInput.value = status.defaultChatId;
      }
    } catch (err) {
      console.warn('Error fetching bot status:', err);
    }
  }

  // Global Actions for buttons
  window.deleteAlert = async function (id) {
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Alert deleted', 'success');
        fetchAlerts();
      }
    } catch (err) {
      showToast('Failed to delete alert', 'error');
    }
  };

  window.toggleAlert = async function (id) {
    try {
      const res = await fetch(`/api/alerts/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        showToast('Alert toggled', 'success');
        fetchAlerts();
      }
    } catch (err) {
      showToast('Failed to toggle alert', 'error');
    }
  };

  // Event Listeners
  function setupEventListeners() {
    // Timeframe selector
    document.querySelectorAll('.tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tf = btn.getAttribute('data-tf');
        initTradingViewChart(tf);
      });
    });

    // Step offset buttons
    document.querySelectorAll('.btn-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = parseFloat(btn.getAttribute('data-step'));
        const currentTarget = parseFloat(targetPriceInput.value) || currentPrice || 2700;
        const newTarget = Math.round((currentTarget + step) * 10) / 10;
        targetPriceInput.value = newTarget.toFixed(1);

        // Auto-adjust condition radio
        if (newTarget > currentPrice) {
          document.querySelector('input[name="alertCondition"][value="ABOVE"]').checked = true;
        } else {
          document.querySelector('input[name="alertCondition"][value="BELOW"]').checked = true;
        }
      });
    });

    // Create Alert Form
    createAlertForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const condition = document.querySelector('input[name="alertCondition"]:checked').value;
      const targetPrice = parseFloat(targetPriceInput.value);
      const note = alertNoteInput.value;
      const chatId = alertChatIdInput.value;

      if (isNaN(targetPrice) || targetPrice <= 0) {
        showToast('Please enter a valid target price', 'error');
        return;
      }

      try {
        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: 'XAU/USD',
            condition,
            targetPrice,
            note: note || undefined,
            chatId: chatId || undefined,
          }),
        });

        if (res.ok) {
          showToast(`✅ Alert set: Gold ${condition} $${targetPrice.toFixed(2)}`, 'success');
          alertNoteInput.value = '';
          fetchAlerts();
        } else {
          showToast('Failed to create alert', 'error');
        }
      } catch (err) {
        showToast('Error creating alert: ' + err.message, 'error');
      }
    });

    // Tab Filters
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        renderAlertsList();
      });
    });

    // Sound Toggle
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggleBtn.classList.toggle('active', soundEnabled);
      showToast(soundEnabled ? '🔔 Alert chime enabled' : '🔕 Alert chime muted', 'success');
    });

    // Manual Refresh
    btnRefreshPrice.addEventListener('click', () => {
      fetchPrice();
      fetchAlerts();
      showToast('Price feed refreshed', 'success');
    });

    // Modal controls
    btnOpenBotModal.addEventListener('click', () => {
      botModal.classList.add('open');
      fetchBotStatus();
    });

    btnCloseBotModal.addEventListener('click', () => {
      botModal.classList.remove('open');
    });

    botModal.addEventListener('click', (e) => {
      if (e.target === botModal) {
        botModal.classList.remove('open');
      }
    });

    // Save Bot Config
    botConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = botTokenInput.value.trim();
      const chatId = botDefaultChatIdInput.value.trim();

      if (!token) {
        showToast('Please provide a Bot Token', 'error');
        return;
      }

      try {
        const res = await fetch('/api/bot/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, chatId }),
        });

        if (res.ok) {
          showToast('Bot configuration saved!', 'success');
          fetchBotStatus();
        } else {
          showToast('Failed to update bot config', 'error');
        }
      } catch (err) {
        showToast('Error saving configuration', 'error');
      }
    });

    // Test Telegram notification
    btnTestTelegramAlert.addEventListener('click', async () => {
      const chatId = botDefaultChatIdInput.value.trim();
      showToast('Sending test message to Telegram...', 'success');
      try {
        const res = await fetch('/api/bot/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: chatId || undefined }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Test message delivered to Telegram!', 'success');
        } else {
          showToast('⚠️ Test failed: ' + (data.error || 'Check token/chat ID'), 'error');
        }
      } catch (err) {
        showToast('Error sending test notification', 'error');
      }
    });
  }

  // Synthesized Web Audio Chime (No external mp3 assets needed)
  function playAlertChime() {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6
      osc2.frequency.exponentialRampToValueAtTime(2640, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // Toast Notification
  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Start app when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
