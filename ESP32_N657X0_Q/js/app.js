/**
 * WebProfs.fr - Application Web de Détection & Comptage de Personnes (MQTT)
 * Connecté au serveur MQTT: mqtt.webprofs.fr (Port WS: 9001)
 * Microcontrôleurs: STM32 N6570 Discovery + ESP32
 */

document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // 1. ETAT GLOBAL & CONFIGURATION PAR DEFAUT
  // =========================================================================
  const state = {
    // Parameters MQTT
    config: {
      host: 'mqtt.webprofs.fr',
      port: 9001,
      path: '/mqtt',
      useSSL: false, // Default WebSocket port 9001 is ws:// (switchable in settings)
      user: 'fablab2122',
      pass: '2122',
      topicSub: 'FABLAB_21_22/#',
      maxCapacity: 20
    },

    // Dynamic metrics
    metrics: {
      presence: 0,
      totalIn: 0,
      totalOut: 0,
      netOccupancy: 0,
      lastUpdate: null,
      lastPassageTime: null
    },

    // Application state
    mqttClient: null,
    isConnected: false,
    soundEnabled: true,
    presenceResetTimer: null,
    
    // Event Logs
    events: [],
    history: [],

    // Chart instances
    charts: {
      line: null,
      doughnut: null,
      bar: null
    }
  };

  // =========================================================================
  // 2. INITIALISATION DU DOM ET DES ELEMENTS
  // =========================================================================
  const elements = {
    liveClock: document.getElementById('liveClock'),
    liveDate: document.getElementById('liveDate'),
    mqttStatusBadge: document.getElementById('mqttStatusBadge'),
    mqttStatusText: document.getElementById('mqttStatusText'),
    btnSoundToggle: document.getElementById('btnSoundToggle'),
    soundStatusText: document.getElementById('soundStatusText'),
    btnResetMqttCounters: document.getElementById('btnResetMqttCounters'),
    
    // KPI Cards
    kpiPresence: document.getElementById('kpiPresence'),
    badgePresenceState: document.getElementById('badgePresenceState'),
    kpiPresenceTime: document.getElementById('kpiPresenceTime'),
    kpiIn: document.getElementById('kpiIn'),
    kpiOut: document.getElementById('kpiOut'),
    kpiNet: document.getElementById('kpiNet'),
    kpiNetBadge: document.getElementById('kpiNetBadge'),

    // Banner & Gauge
    lastEventBanner: document.getElementById('lastEventBanner'),
    bannerTitle: document.getElementById('bannerTitle'),
    bannerDetail: document.getElementById('bannerDetail'),
    bannerTimeAgo: document.getElementById('bannerTimeAgo'),
    bannerIconContainer: document.getElementById('bannerIconContainer'),

    gaugeCanvas: document.getElementById('gaugeCanvas'),
    gaugePercentage: document.getElementById('gaugePercentage'),
    gaugeSubtext: document.getElementById('gaugeSubtext'),
    capacityProgressBar: document.getElementById('capacityProgressBar'),
    capacityThresholdText: document.getElementById('capacityThresholdText'),
    lastPassageTime: document.getElementById('lastPassageTime'),

    // Tables
    liveEventsTableBody: document.getElementById('liveEventsTableBody'),
    emptyEventsRow: document.getElementById('emptyEventsRow'),
    eventCounterBadge: document.getElementById('eventCounterBadge'),
    fullHistoryTableBody: document.getElementById('fullHistoryTableBody'),
    historySearchInput: document.getElementById('historySearchInput'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    btnClearChart: document.getElementById('btnClearChart'),

    // Settings Form
    mqttSettingsForm: document.getElementById('mqttSettingsForm'),
    cfgBrokerHost: document.getElementById('cfgBrokerHost'),
    cfgBrokerPort: document.getElementById('cfgBrokerPort'),
    cfgBrokerPath: document.getElementById('cfgBrokerPath'),
    cfgUseSSL: document.getElementById('cfgUseSSL'),
    cfgBrokerUser: document.getElementById('cfgBrokerUser'),
    cfgBrokerPass: document.getElementById('cfgBrokerPass'),
    cfgTopicSub: document.getElementById('cfgTopicSub'),
    cfgMaxCapacity: document.getElementById('cfgMaxCapacity'),
    btnResetConfig: document.getElementById('btnResetConfig')
  };

  // Live Clock Interval
  function updateClock() {
    const now = new Date();
    elements.liveClock.textContent = now.toLocaleTimeString('fr-FR');
    elements.liveDate.textContent = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // =========================================================================
  // 3. SYNTHÉTISEUR SONORE POUR ALERTES (Web Audio API)
  // =========================================================================
  function playBeep(freq = 880, duration = 0.15) {
    if (!state.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Toggle Sound Button
  elements.btnSoundToggle.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    elements.soundStatusText.textContent = state.soundEnabled ? 'ON' : 'OFF';
    elements.btnSoundToggle.classList.toggle('btn-outline-light', state.soundEnabled);
    elements.btnSoundToggle.classList.toggle('btn-secondary', !state.soundEnabled);
    if (state.soundEnabled) playBeep(1000, 0.1);
  });

  // Reset Counters via MQTT to ESP32 / Nucleo STM32
  if (elements.btnResetMqttCounters) {
    elements.btnResetMqttCounters.addEventListener('click', () => {
      if (confirm('Voulez-vous réinitialiser à zéro les compteurs d\'entrées et sorties (IN=0, OUT=0) sur la carte Nucleo STM32 ?')) {
        const topicIn = 'FABLAB_21_22/nucleoN657/detect/in/';
        const resetPayload = JSON.stringify({ cmd: 'reset', reset: 1, in: 0, out: 0 });

        if (state.mqttClient && state.isConnected) {
          state.mqttClient.publish(topicIn, resetPayload, (err) => {
            if (!err) {
              console.log(`[MQTT TX] Published reset command to ${topicIn}: ${resetPayload}`);
            } else {
              console.error('[MQTT TX] Reset publish error:', err);
            }
          });
        }

        // Locally reset site metrics immediately
        state.metrics.totalIn = 0;
        state.metrics.totalOut = 0;
        state.metrics.netOccupancy = 0;
        state.metrics.presence = 0;
        updateKpiDisplay();
      }
    });
  }

  // =========================================================================
  // 4. CONNEXION ET GESTION DU CLIENT MQTT (mqtt.js)
  // =========================================================================
  function connectMQTT() {
    if (state.mqttClient) {
      try { state.mqttClient.end(true); } catch (e) { }
    }

    const { host, port, path, useSSL, user, pass, topicSub } = state.config;
    const protocol = useSSL ? 'wss' : 'ws';
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const url = `${protocol}://${host}:${port}${cleanPath}`;

    updateStatusBadge('connecting', `Connexion à ${host}:${port}...`);

    const options = {
      clientId: 'webprofs_web_' + Math.random().toString(16).substr(2, 8),
      username: user,
      password: pass,
      keepalive: 60,
      clean: true,
      reconnectPeriod: 4000,
      connectTimeout: 8000
    };

    console.log(`[MQTT] Connection attempt to ${url}...`, options);

    try {
      state.mqttClient = mqtt.connect(url, options);

      state.mqttClient.on('connect', () => {
        state.isConnected = true;
        updateStatusBadge('connected', `Connecté (${host}:${port})`);
        console.log('[MQTT] Connected successfully!');

        state.mqttClient.subscribe(topicSub, (err) => {
          if (!err) {
            console.log(`[MQTT] Subscribed to topic: ${topicSub}`);
          } else {
            console.error('[MQTT] Subscription error:', err);
          }
        });
      });

      state.mqttClient.on('message', (topic, payload) => {
        handleMqttMessage(topic, payload.toString());
      });

      state.mqttClient.on('error', (err) => {
        console.error('[MQTT] Connection error:', err);
        updateStatusBadge('disconnected', 'Erreur Broker / Port');
      });

      state.mqttClient.on('offline', () => {
        state.isConnected = false;
        updateStatusBadge('disconnected', 'Déconnecté');
      });

      state.mqttClient.on('reconnect', () => {
        updateStatusBadge('connecting', 'Reconnexion...');
      });

    } catch (e) {
      console.error('[MQTT] Instantiation exception:', e);
      updateStatusBadge('disconnected', 'Erreur SSL/WS');
    }
  }

  function updateStatusBadge(statusClass, text) {
    elements.mqttStatusBadge.className = `status-badge status-${statusClass} shadow-sm`;
    elements.mqttStatusText.textContent = text;
  }

  // =========================================================================
  // 5. PARSING UNIVERSEL DES MESSAGES MQTT (JSON ET TEXTE BRUT)
  // =========================================================================
  function handleMqttMessage(topic, messageStr) {
    console.log(`[MQTT RX] ${topic} -> ${messageStr}`);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR');

    let data = {};
    let isJson = false;

    try {
      data = JSON.parse(messageStr);
      isJson = true;
    } catch (e) {
      console.log('[MQTT] Non-JSON payload received, ignoring text message:', messageStr);
      return;
    }

    if (!isJson) return;

    // --- Extraire le nombre de personnes en caméra (champs multiples supportés) ---
    let presenceVal = undefined;
    if (data.person !== undefined) presenceVal = Number(data.person);
    else if (data.persons !== undefined) presenceVal = Number(data.persons);
    else if (data.people !== undefined) presenceVal = Number(data.people);
    else if (data.count !== undefined) presenceVal = Number(data.count);
    else if (data.nb_personnes !== undefined) presenceVal = Number(data.nb_personnes);
    else if (data.nb_person !== undefined) presenceVal = Number(data.nb_person);
    else if (data.detected !== undefined) presenceVal = Number(data.detected);

    // --- Format 1 : Message de Présence / Comptage périodique ---
    if (presenceVal !== undefined) {
      state.metrics.presence = Math.max(0, presenceVal);
      if (data.in !== undefined) state.metrics.totalIn = Number(data.in);
      if (data.out !== undefined) state.metrics.totalOut = Number(data.out);
      state.metrics.netOccupancy = state.metrics.totalIn - state.metrics.totalOut;
      state.metrics.lastUpdate = timeStr;

      updateKpiDisplay();
      pushRealtimeChartData(timeStr, state.metrics.presence, state.metrics.netOccupancy);
    }

    // --- Format 2 : Événement instantané de franchissement de ligne ---
    if (data.event === "crossing" || data.dir || topic.includes("crossing")) {
      const dir = (data.dir || (messageStr.includes("IN") ? "IN" : "OUT")).toUpperCase();
      const id = data.id || Math.floor(Math.random() * 100);

      if (data.in !== undefined) state.metrics.totalIn = Number(data.in);
      else if (dir === 'IN') state.metrics.totalIn++;

      if (data.out !== undefined) state.metrics.totalOut = Number(data.out);
      else if (dir === 'OUT') state.metrics.totalOut++;

      state.metrics.netOccupancy = state.metrics.totalIn - state.metrics.totalOut;
      state.metrics.lastPassageTime = timeStr;

      // Si un événement/franchissement est détecté, au moins 1 personne est active devant la caméra !
      if (presenceVal !== undefined) {
        state.metrics.presence = presenceVal;
      } else {
        state.metrics.presence = Math.max(1, state.metrics.presence);
        // Conserver la présence active tant que la caméra détecte des événements (fenêtre de 30s)
        if (state.presenceResetTimer) clearTimeout(state.presenceResetTimer);
        state.presenceResetTimer = setTimeout(() => {
          state.metrics.presence = 0;
          updateKpiDisplay();
        }, 30000);
      }

      // Sonore alert
      if (dir === 'IN') playBeep(1046, 0.2); // High C
      else playBeep(659, 0.2); // Low E

      // Record Event
      const eventObj = {
        id: id,
        timestamp: timeStr,
        dateFull: now,
        type: 'Franchissement',
        dir: dir,
        in: state.metrics.totalIn,
        out: state.metrics.totalOut,
        net: state.metrics.netOccupancy
      };

      recordCrossingEvent(eventObj);
      updateKpiDisplay();
      showBannerAlert(eventObj);
    }
  }

  // =========================================================================
  // 6. MISE À JOUR DE L'AFFICHAGE DES KPIS ET JAUGES
  // =========================================================================
  function updateKpiDisplay() {
    const { presence, totalIn, totalOut, netOccupancy, lastUpdate, lastPassageTime } = state.metrics;

    // Presence (Personnes en caméra)
    elements.kpiPresence.textContent = presence;
    elements.kpiPresenceTime.textContent = lastUpdate ? `Mis à jour: ${lastUpdate}` : 'En direct';
    
    if (presence > 0) {
      elements.badgePresenceState.className = 'badge bg-warning-subtle text-warning border border-warning-subtle fw-bold';
      elements.badgePresenceState.innerHTML = `<i class="fa-solid fa-person-walking me-1"></i> ${presence} détection(s) active(s)`;
    } else {
      elements.badgePresenceState.className = 'badge bg-info-subtle text-info border border-info-subtle';
      elements.badgePresenceState.innerHTML = `<i class="fa-solid fa-eye me-1"></i> 0 personne en champ`;
    }

    // In & Out & Net (Calcul exact sans tronquer à 0)
    elements.kpiIn.textContent = totalIn;
    elements.kpiOut.textContent = totalOut;
    elements.kpiNet.textContent = netOccupancy;

    // Formate le badge selon le solde (positif, neutre ou négatif)
    if (netOccupancy === 0) {
      elements.kpiNetBadge.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle';
      elements.kpiNetBadge.textContent = 'Solde Neutre (0)';
    } else if (netOccupancy < 0) {
      elements.kpiNetBadge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle fw-bold';
      elements.kpiNetBadge.textContent = `Solde Négatif (${netOccupancy})`;
    } else if (netOccupancy >= state.config.maxCapacity) {
      elements.kpiNetBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle fw-bold';
      elements.kpiNetBadge.textContent = 'Capacité Max Dépassée!';
    } else {
      elements.kpiNetBadge.className = 'badge bg-purple-subtle text-purple border border-purple-subtle';
      elements.kpiNetBadge.textContent = `Occupation (+${netOccupancy})`;
    }

    // Last passage
    if (lastPassageTime) elements.lastPassageTime.textContent = lastPassageTime;

    // Gauge Update
    updateGauge(netOccupancy, state.config.maxCapacity);
    updateDoughnutChart(totalIn, totalOut);
  }

  // Radial Gauge Drawing
  function updateGauge(val, maxVal) {
    const canvas = elements.gaugeCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 75;

    ctx.clearRect(0, 0, width, height);

    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    const pct = Math.min(1, Math.max(0, val / maxVal));
    const currentAngle = startAngle + pct * (endAngle - startAngle);

    // Background track
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Value Arc gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    if (pct < 0.7) {
      gradient.addColorStop(0, '#10b981');
      gradient.addColorStop(1, '#1168AD');
    } else if (pct < 0.9) {
      gradient.addColorStop(0, '#f59e0b');
      gradient.addColorStop(1, '#ef4444');
    } else {
      gradient.addColorStop(0, '#ef4444');
      gradient.addColorStop(1, '#b91c1c');
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, currentAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Text Overlay updates
    const percentageRounded = Math.round(pct * 100);
    elements.gaugePercentage.textContent = `${percentageRounded}%`;
    elements.gaugeSubtext.textContent = `${val} / ${maxVal} max`;
    elements.capacityProgressBar.style.width = `${percentageRounded}%`;
    elements.capacityThresholdText.textContent = `${maxVal} personnes`;

    if (pct > 0.85) {
      elements.capacityProgressBar.className = 'progress-bar bg-danger progress-bar-striped progress-bar-animated';
    } else if (pct > 0.6) {
      elements.capacityProgressBar.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated';
    } else {
      elements.capacityProgressBar.className = 'progress-bar bg-success progress-bar-striped progress-bar-animated';
    }
  }

  // Banner Alert Popup
  function showBannerAlert(evt) {
    const banner = elements.lastEventBanner;
    const isIn = evt.dir === 'IN';

    banner.className = `alert alert-event-banner shadow-sm d-flex align-items-center justify-content-between mb-4 ${isIn ? '' : 'bg-banner-out'}`;
    elements.bannerTitle.textContent = `Franchissement Ligne ${evt.dir} !`;
    elements.bannerDetail.textContent = `Passage ${isIn ? 'ENTRÉE (Ligne A→B)' : 'SORTIE (Ligne B→A)'} | ID Détection: #${evt.id} | Horodatage: ${evt.timestamp}`;
    elements.bannerIconContainer.innerHTML = isIn ? '<i class="fa-solid fa-right-to-bracket fs-4"></i>' : '<i class="fa-solid fa-right-from-bracket fs-4"></i>';

    banner.classList.remove('d-none');

    if (banner._timer) clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
      banner.classList.add('d-none');
    }, 8000);
  }

  // =========================================================================
  // 7. GESTION DES TABLES D'ÉVÉNEMENTS ET HISTORIQUE
  // =========================================================================
  function recordCrossingEvent(evt) {
    state.events.unshift(evt);
    state.history.unshift(evt);

    if (state.events.length > 20) state.events.pop();

    renderLiveEventsTable();
    renderHistoryTable();
    updateHourlyChart(evt);
  }

  function renderLiveEventsTable() {
    if (state.events.length === 0) {
      elements.emptyEventsRow.style.display = '';
      return;
    }
    elements.emptyEventsRow.style.display = 'none';

    elements.eventCounterBadge.textContent = `${state.history.length} événement(s)`;

    let html = '';
    state.events.forEach((e) => {
      const isIn = e.dir === 'IN';
      const badgeClass = isIn ? 'direction-badge-in' : 'direction-badge-out';
      const icon = isIn ? '<i class="fa-solid fa-arrow-right-to-bracket"></i>' : '<i class="fa-solid fa-arrow-right-from-bracket"></i>';

      html += `
        <tr>
          <td class="fw-bold font-monospace">${e.timestamp}</td>
          <td><span class="badge bg-light text-dark border">Franchissement</span></td>
          <td><span class="${badgeClass}">${icon} ${e.dir}</span></td>
          <td><code>#${e.id}</code></td>
          <td class="text-success fw-bold">${e.in}</td>
          <td class="text-danger fw-bold">${e.out}</td>
        </tr>
      `;
    });

    elements.liveEventsTableBody.innerHTML = html;
  }

  function renderHistoryTable() {
    const filter = elements.historySearchInput.value.toLowerCase().trim();
    const filtered = state.history.filter(e => {
      if (!filter) return true;
      return e.timestamp.toLowerCase().includes(filter) ||
        e.dir.toLowerCase().includes(filter) ||
        String(e.id).includes(filter);
    });

    if (filtered.length === 0) {
      elements.fullHistoryTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="fa-solid fa-inbox fs-2 d-block mb-2 opacity-50"></i>
            Aucun résultat correspondant aux critères de recherche.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    filtered.forEach((e, idx) => {
      const isIn = e.dir === 'IN';
      const badgeClass = isIn ? 'direction-badge-in' : 'direction-badge-out';
      const icon = isIn ? '<i class="fa-solid fa-arrow-right-to-bracket"></i>' : '<i class="fa-solid fa-arrow-right-from-bracket"></i>';

      html += `
        <tr>
          <td class="text-muted small">${state.history.length - idx}</td>
          <td class="fw-bold font-monospace">${e.timestamp}</td>
          <td>Franchissement Ligne</td>
          <td><span class="${badgeClass}">${icon} ${e.dir}</span></td>
          <td><code>#${e.id}</code></td>
          <td class="text-success fw-bold">${e.in}</td>
          <td class="text-danger fw-bold">${e.out}</td>
          <td class="fw-bold text-purple">${e.net}</td>
        </tr>
      `;
    });

    elements.fullHistoryTableBody.innerHTML = html;
  }

  // Filter history search
  elements.historySearchInput.addEventListener('input', renderHistoryTable);

  // Clear history
  elements.btnClearHistory.addEventListener('click', () => {
    if (confirm('Voulez-vous vraiment effacer l\'historique des franchissements ?')) {
      state.history = [];
      state.events = [];
      renderLiveEventsTable();
      renderHistoryTable();
    }
  });

  // Export CSV
  elements.btnExportCsv.addEventListener('click', () => {
    if (state.history.length === 0) {
      alert('Aucune donnée à exporter.');
      return;
    }
    let csv = 'Index;Horodatage;Evenement;Direction;ID_Objet;Total_IN;Total_OUT;Solde_Net\n';
    state.history.forEach((e, i) => {
      csv += `${i + 1};${e.timestamp};Franchissement;${e.dir};${e.id};${e.in};${e.out};${e.net}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `export_franchissements_webprofs_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  });

  // =========================================================================
  // 8. INITIALISATION ET MISE À JOUR DES GRAPHIQUES (Chart.js)
  // =========================================================================
  function initCharts() {
    // 1. Real-time Line Chart
    const ctxLine = document.getElementById('realtimeLineChart').getContext('2d');
    state.charts.line = new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Personnes Détectées (Caméra)',
            data: [],
            borderColor: '#1168AD',
            backgroundColor: 'rgba(17, 104, 173, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 4
          },
          {
            label: 'Solde d\'Occupation (IN - OUT)',
            data: [],
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            borderDash: [5, 5],
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        },
        plugins: {
          legend: { position: 'top' }
        }
      }
    });

    // 2. Ratio Doughnut Chart
    const ctxDoughnut = document.getElementById('ratioDoughnutChart').getContext('2d');
    state.charts.doughnut = new Chart(ctxDoughnut, {
      type: 'doughnut',
      data: {
        labels: ['Entrées (IN)', 'Sorties (OUT)'],
        datasets: [{
          data: [0, 0],
          backgroundColor: ['#10b981', '#ef4444'],
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });

    // 3. Hourly Bar Chart
    const ctxBar = document.getElementById('hourlyBarChart').getContext('2d');
    const hoursLabels = Array.from({ length: 12 }, (_, i) => `${(i + 8).toString().padStart(2, '0')}:00`);

    state.charts.bar = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: hoursLabels,
        datasets: [
          {
            label: 'Entrées (IN)',
            data: Array(12).fill(0),
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Sorties (OUT)',
            data: Array(12).fill(0),
            backgroundColor: '#ef4444',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        },
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  }

  function pushRealtimeChartData(timeLabel, presenceVal, netVal) {
    if (!state.charts.line) return;
    const chart = state.charts.line;
    chart.data.labels.push(timeLabel);
    chart.data.datasets[0].data.push(presenceVal);
    chart.data.datasets[1].data.push(netVal);

    if (chart.data.labels.length > 25) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
      chart.data.datasets[1].data.shift();
    }
    chart.update('none');
  }

  function updateDoughnutChart(inVal, outVal) {
    if (!state.charts.doughnut) return;
    state.charts.doughnut.data.datasets[0].data = [inVal, outVal];
    state.charts.doughnut.update();
  }

  function updateHourlyChart(evt) {
    if (!state.charts.bar) return;
    const currentHourStr = `${new Date().getHours().toString().padStart(2, '0')}:00`;
    const labels = state.charts.bar.data.labels;
    let idx = labels.indexOf(currentHourStr);

    if (idx === -1) idx = labels.length - 1;

    if (evt.dir === 'IN') {
      state.charts.bar.data.datasets[0].data[idx] += 1;
    } else {
      state.charts.bar.data.datasets[1].data[idx] += 1;
    }
    state.charts.bar.update();
  }

  elements.btnClearChart.addEventListener('click', () => {
    if (state.charts.line) {
      state.charts.line.data.labels = [];
      state.charts.line.data.datasets[0].data = [];
      state.charts.line.data.datasets[1].data = [];
      state.charts.line.update();
    }
  });

  // =========================================================================
  // 9. GESTION DU FORMULAIRE DE CONFIGURATION
  // =========================================================================
  elements.mqttSettingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    state.config.host = elements.cfgBrokerHost.value.trim();
    state.config.port = parseInt(elements.cfgBrokerPort.value, 10) || 9001;
    state.config.path = elements.cfgBrokerPath.value.trim();
    state.config.useSSL = elements.cfgUseSSL.checked;
    state.config.user = elements.cfgBrokerUser.value.trim();
    state.config.pass = elements.cfgBrokerPass.value.trim();
    state.config.topicSub = elements.cfgTopicSub.value.trim();
    state.config.maxCapacity = parseInt(elements.cfgMaxCapacity.value, 10) || 20;

    alert('Configuration enregistrée ! Reconnexion au broker MQTT en cours...');
    connectMQTT();
  });

  elements.btnResetConfig.addEventListener('click', () => {
    elements.cfgBrokerHost.value = 'mqtt.webprofs.fr';
    elements.cfgBrokerPort.value = 9001;
    elements.cfgBrokerPath.value = '/mqtt';
    elements.cfgUseSSL.checked = false;
    elements.cfgBrokerUser.value = 'fablab2122';
    elements.cfgBrokerPass.value = '2122';
    elements.cfgTopicSub.value = 'FABLAB_21_22/#';
    elements.cfgMaxCapacity.value = 20;
  });

  function syncConfigFromForm() {
    if (elements.cfgBrokerHost) state.config.host = elements.cfgBrokerHost.value.trim();
    if (elements.cfgBrokerPort) state.config.port = parseInt(elements.cfgBrokerPort.value, 10) || 9001;
    if (elements.cfgBrokerPath) state.config.path = elements.cfgBrokerPath.value.trim();
    if (elements.cfgUseSSL) state.config.useSSL = elements.cfgUseSSL.checked;
    if (elements.cfgBrokerUser) state.config.user = elements.cfgBrokerUser.value.trim();
    if (elements.cfgBrokerPass) state.config.pass = elements.cfgBrokerPass.value.trim();
    if (elements.cfgTopicSub) state.config.topicSub = elements.cfgTopicSub.value.trim();
    if (elements.cfgMaxCapacity) state.config.maxCapacity = parseInt(elements.cfgMaxCapacity.value, 10) || 20;
  }

  // =========================================================================
  // 10. INITIALISATION ET CONNEXION
  // =========================================================================
  initCharts();
  updateKpiDisplay();
  syncConfigFromForm();
  connectMQTT();
});
