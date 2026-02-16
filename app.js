const form = document.getElementById("salesForm");
const countInput = document.getElementById("count");
const intervalInput = document.getElementById("interval");
const valuesInput = document.getElementById("values");
const soundInput = document.getElementById("soundEnabled");
const permissionBtn = document.getElementById("permissionBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("notificationList");
const clockEl = document.getElementById("clock");

const BRAND_LOGO = "icons/logo_skale-pay_pmK2aA.png";
const SALE_SOUND_URL = "./sonido-shopify.mp3";

const saleAudioTemplate = new Audio(SALE_SOUND_URL);
saleAudioTemplate.preload = "auto";

let timeoutIds = [];
let registration;
let audioCtx;
let saleSoundUnlocked = false;
let externalSoundFailed = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ffc8c8" : "#a7ffd7";
}

function parseValueList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace("R$", "").replace(".", "").replace(",", "."))
    .filter(Boolean)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function ensureAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }

  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }

  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }

  return audioCtx;
}

function playSynthSaleSound() {
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  gain.connect(ctx.destination);

  const oscA = ctx.createOscillator();
  oscA.type = "triangle";
  oscA.frequency.setValueAtTime(880, now);
  oscA.frequency.exponentialRampToValueAtTime(1240, now + 0.2);
  oscA.connect(gain);
  oscA.start(now);
  oscA.stop(now + 0.22);

  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.setValueAtTime(660, now + 0.02);
  oscB.frequency.exponentialRampToValueAtTime(980, now + 0.26);
  oscB.connect(gain);
  oscB.start(now + 0.02);
  oscB.stop(now + 0.28);
}

async function unlockSaleSound() {
  if (saleSoundUnlocked || externalSoundFailed) {
    return;
  }

  try {
    saleAudioTemplate.muted = true;
    saleAudioTemplate.currentTime = 0;
    await saleAudioTemplate.play();
    saleAudioTemplate.pause();
    saleAudioTemplate.currentTime = 0;
    saleAudioTemplate.muted = false;
    saleSoundUnlocked = true;
  } catch {
    saleAudioTemplate.muted = false;
  }
}

function playSaleSound() {
  if (!soundInput?.checked) {
    return;
  }

  if (!externalSoundFailed && saleSoundUnlocked) {
    const audio = saleAudioTemplate.cloneNode();
    audio.currentTime = 0;
    audio.play().catch(() => {
      externalSoundFailed = true;
      playSynthSaleSound();
    });
    return;
  }

  playSynthSaleSound();
}

function addCard(amount) {
  const now = new Date();
  const card = document.createElement("article");
  card.className = "notification-card";
  card.dataset.timestamp = String(now.getTime());
  card.innerHTML = `
    <div class="logo"><img src="${BRAND_LOGO}" alt="Skaley" /></div>
    <div>
      <div class="notification-title">Venda realizada!</div>
      <div class="notification-body">Valor: ${formatCurrency(amount)}</div>
    </div>
    <time class="notification-time" datetime="${now.toISOString()}">agora</time>
  `;

  listEl.prepend(card);
}

function updateTimes() {
  const now = Date.now();
  listEl.querySelectorAll(".notification-card").forEach((card) => {
    const timeEl = card.querySelector(".notification-time");
    const elapsedMin = Math.floor((now - Number(card.dataset.timestamp)) / 60000);

    if (elapsedMin <= 0) {
      timeEl.textContent = "agora";
    } else if (elapsedMin < 60) {
      timeEl.textContent = `ha ${elapsedMin} min`;
    } else {
      const elapsedHours = Math.floor(elapsedMin / 60);
      timeEl.textContent = `ha ${elapsedHours} h`;
    }
  });
}

function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function showSystemNotification(amount) {
  if (Notification.permission !== "granted") {
    return;
  }

  const title = "Venda realizada!";
  const body = `Valor: ${formatCurrency(amount)}`;

  if (registration) {
    await registration.showNotification(title, {
      body,
      icon: BRAND_LOGO,
      badge: BRAND_LOGO,
      tag: `sale-${Date.now()}`,
      renotify: false
    });
    return;
  }

  new Notification(title, { body, icon: BRAND_LOGO });
}

function stopSchedule() {
  timeoutIds.forEach((id) => clearTimeout(id));
  timeoutIds = [];
  setStatus("Disparo interrompido.");
}

async function triggerSale(amount, index, total) {
  addCard(amount);
  playSaleSound();
  updateTimes();
  await showSystemNotification(amount);
  setStatus(`Notificacao ${index}/${total} enviada: ${formatCurrency(amount)}`);
}

function buildAmountPlan(total, values) {
  if (values.length === 0) {
    return Array.from({ length: total }, () => Number((30 + Math.random() * 140).toFixed(2)));
  }

  return Array.from({ length: total }, (_, i) => values[i % values.length]);
}

permissionBtn.addEventListener("click", async () => {
  ensureAudioContext();
  await unlockSaleSound();

  if (!("Notification" in window)) {
    setStatus("Este navegador nao suporta notificacoes.", true);
    return;
  }

  const result = await Notification.requestPermission();
  if (result === "granted") {
    setStatus("Permissao concedida.");
  } else {
    setStatus("Permissao negada. Ative nas configuracoes do navegador.", true);
  }
});

stopBtn.addEventListener("click", stopSchedule);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  ensureAudioContext();
  await unlockSaleSound();

  const total = Number(countInput.value);
  const intervalMs = Number(intervalInput.value) * 1000;
  const values = parseValueList(valuesInput.value);

  if (!Number.isInteger(total) || total <= 0) {
    setStatus("Informe uma quantidade valida.", true);
    return;
  }

  if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
    setStatus("Informe um intervalo valido (minimo 1 segundo).", true);
    return;
  }

  stopSchedule();
  const amountPlan = buildAmountPlan(total, values);

  amountPlan.forEach((amount, idx) => {
    const timeoutId = window.setTimeout(() => {
      void triggerSale(amount, idx + 1, total);
      if (idx + 1 === total) {
        setStatus(`Disparo finalizado com ${total} notificacoes.`);
      }
    }, idx * intervalMs);

    timeoutIds.push(timeoutId);
  });

  setStatus(`Disparo iniciado: ${total} notificacoes em ${intervalMs / 1000}s.`);
});

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try {
      registration = await navigator.serviceWorker.register("sw.js");
    } catch {
      setStatus("Service Worker nao foi registrado.", true);
    }
  }
}

function initTimers() {
  updateClock();
  updateTimes();
  setInterval(updateClock, 1000);
  setInterval(updateTimes, 60_000);
}

void registerSW();
initTimers();

