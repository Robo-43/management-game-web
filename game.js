const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statsLine = document.getElementById("statsLine");
const hintLine = document.getElementById("hintLine");
const messageLine = document.getElementById("messageLine");
const overlay = document.getElementById("overlay");

const BASE_MOVE_SPEED = 6;
const TOTAL_TURNS = 8;
const PLAYER_SIZE = 22;
const NPC_SIZE = 26;
const STORAGE_KEY = "management_game_progress_v1";

const state = {
  screen: "menu",
  keys: new Set(),
  cash: 220000,
  morale: 60,
  leadership: 50,
  turn: 0,
  runCoins: 0,
  totalCoins: 0,
  speedLevel: 0,
  bonusLevel: 0,
  movezUnlocked: false,
  awaitingChoice: false,
  event: null,
  player: { x: 640, y: 360 },
  npc: { x: 300, y: 260, dx: 0, dy: 0 },
  menuButtons: [],
  treeNodes: [],
  joystick: {
    active: false,
    pointerId: null,
    baseX: 0,
    baseY: 0,
    knobX: 0,
    knobY: 0,
    radius: 58,
    vectorX: 0,
    vectorY: 0,
  },
};

const events = [
  {
    title: "Konflikt v tymu",
    concept: "Leadership",
    question: "Dva kolegove se hadaji, vykon tymu pada. Co udelas?",
    options: [
      ["A", "Ignorovat to a tlacit jen na vysledky", { cash: 10000, morale: -15, lead: -12 }],
      ["B", "Kratka mediace + jasne role", { cash: -5000, morale: 14, lead: 12 }],
      ["C", "Jednoho okamzite presunout jinam", { cash: 0, morale: -6, lead: -4 }],
    ],
    best: "B",
  },
  {
    title: "Napjate cash flow",
    concept: "Cash Flow",
    question: "Zakaznik zaplati az za 45 dni, mzdy jsou za tyden.",
    options: [
      ["A", "Vyjednat zalohu 30 %", { cash: 45000, morale: 2, lead: 5 }],
      ["B", "Vzít drahy kratkodoby uver", { cash: 30000, morale: 0, lead: -2 }],
      ["C", "Zadrzet nakup materialu", { cash: 15000, morale: -8, lead: -6 }],
    ],
    best: "A",
  },
  {
    title: "Motivace lidi",
    concept: "Leadership",
    question: "Tym je unaveny a vykon klesa treti tyden.",
    options: [
      ["A", "Pridat prescasy a pritlacit na terminy", { cash: 12000, morale: -12, lead: -10 }],
      ["B", "Realisticky sprint + oceneni vysledku", { cash: -8000, morale: 13, lead: 11 }],
      ["C", "Nechat to byt", { cash: 0, morale: -5, lead: -5 }],
    ],
    best: "B",
  },
];

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function fmtCoins(v) {
  return Number(v.toFixed(2)).toString();
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.totalCoins = Math.max(0, Number(data.totalCoins || 0));
    state.speedLevel = clamp(Number(data.speedLevel || 0), 0, 3);
    state.bonusLevel = clamp(Number(data.bonusLevel || 0), 0, 4);
    state.movezUnlocked = !!data.movezUnlocked;
  } catch {
    // ignore
  }
}

function saveProgress() {
  const payload = {
    totalCoins: Number(state.totalCoins.toFixed(2)),
    speedLevel: state.speedLevel,
    bonusLevel: state.bonusLevel,
    movezUnlocked: state.movezUnlocked,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function speedMultiplier() {
  return [1, 1.25, 1.5, 3][state.speedLevel];
}

function coinReward() {
  return [1, 1.5, 1.67, 1.83, 2][state.bonusLevel];
}

function nextSpeedUpgrade() {
  const list = [
    { price: 3, label: "Rychlost I", value: "1.25x" },
    { price: 5, label: "Rychlost II", value: "1.50x" },
    { price: 10, label: "Rychlost III", value: "3x" },
  ];
  return list[state.speedLevel] || null;
}

function nextBonusUpgrade() {
  if (state.bonusLevel >= 4) return null;
  return { price: 2, label: `Bonus ${state.bonusLevel + 1}` };
}

function resetRun() {
  state.cash = 220000;
  state.morale = 60;
  state.leadership = 50;
  state.turn = 0;
  state.runCoins = 0;
  state.awaitingChoice = false;
  state.event = null;
  state.player.x = canvas.width / 2;
  state.player.y = canvas.height / 2;
  randomizeNpcPos();
}

function randomizeNpcPos() {
  state.npc.x = 80 + Math.random() * (canvas.width - 160);
  state.npc.y = 80 + Math.random() * (canvas.height - 160);
  if (state.movezUnlocked) {
    const vals = [-BASE_MOVE_SPEED, BASE_MOVE_SPEED];
    state.npc.dx = vals[Math.floor(Math.random() * vals.length)];
    state.npc.dy = vals[Math.floor(Math.random() * vals.length)];
  } else {
    state.npc.dx = 0;
    state.npc.dy = 0;
  }
}

function setMenu(message = "Vitej! Vyber si rezim.") {
  state.screen = "menu";
  stopJoystick();
  state.awaitingChoice = false;
  state.event = null;
  closeModal();
  hintLine.textContent = "Klikni na tlacitko nebo M kdykoliv zpet do menu.";
  messageLine.textContent = message;
  updateStats();
}

function setTree() {
  state.screen = "tree";
  stopJoystick();
  closeModal();
  hintLine.textContent = "Klikni na kolecko upgradu nebo Zpet do menu.";
  messageLine.textContent = "Strom vyvoje";
  updateStats();
}

function startGame() {
  state.screen = "game";
  closeModal();
  resetRun();
  hintLine.textContent = "Pohyb: WASD/sipky nebo joystick | Interakce: E | Menu: M";
  messageLine.textContent = "Najdi kolegu a stiskni E.";
  updateStats();
}

function updateStats() {
  if (state.screen === "game") {
    statsLine.textContent = `Kolo ${state.turn}/${TOTAL_TURNS} | Cash ${state.cash.toLocaleString("cs-CZ")} Kc | Moralka ${state.morale}/100 | Leadership ${state.leadership}/100 | Mince run ${fmtCoins(state.runCoins)}`;
  } else {
    statsLine.textContent = `Mince ${fmtCoins(state.totalCoins)} | Rychlost Lv ${state.speedLevel} | Bonus Lv ${state.bonusLevel} | Pohyb Z ${state.movezUnlocked ? "Ano" : "Ne"}`;
  }
}

function openChoiceModal(eventObj) {
  state.awaitingChoice = true;
  state.event = eventObj;
  overlay.classList.remove("hidden");
  overlay.innerHTML = "";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h2>[${eventObj.concept}] ${eventObj.title}</h2><p>${eventObj.question}</p>`;
  const list = document.createElement("div");
  list.className = "btn-list";
  eventObj.options.forEach(([key, label]) => {
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = `${key}) ${label}`;
    btn.onclick = () => resolveChoice(key);
    list.appendChild(btn);
  });
  modal.appendChild(list);
  overlay.appendChild(modal);
}

function closeModal() {
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
}

function resolveChoice(choice) {
  if (!state.event) return;
  const picked = state.event.options.find((o) => o[0] === choice);
  if (!picked) return;
  const [, label, effect] = picked;

  state.cash += effect.cash;
  state.morale = clamp(state.morale + effect.morale, 0, 100);
  state.leadership = clamp(state.leadership + effect.lead, 0, 100);
  state.turn += 1;
  const gain = coinReward();
  state.runCoins += gain;
  state.totalCoins += gain;
  saveProgress();

  state.cash -= 25000;
  messageLine.textContent = `Vybral jsi ${choice}) ${label}. Zisk minci +${fmtCoins(gain)}.`;

  closeModal();
  state.awaitingChoice = false;
  state.event = null;
  randomizeNpcPos();

  if (state.cash < 0 || state.morale <= 15 || state.turn >= TOTAL_TURNS) {
    const endText =
      state.cash < 0
        ? "Konec: zaporne cash flow."
        : state.morale <= 15
          ? "Konec: tym se rozpadl."
          : `Hotovo! Mince run ${fmtCoins(state.runCoins)}. Navrat do menu...`;
    messageLine.textContent = endText;
    setTimeout(() => setMenu("Run dokoncen."), 1800);
  }
  updateStats();
}

function buySpeed() {
  const up = nextSpeedUpgrade();
  if (!up) return (messageLine.textContent = "Rychlost je na max.");
  if (state.totalCoins < up.price) return (messageLine.textContent = "Nedostatek minci.");
  state.totalCoins -= up.price;
  state.speedLevel += 1;
  saveProgress();
  messageLine.textContent = `Koupeno ${up.label}.`;
  updateStats();
}

function buyBonus() {
  const up = nextBonusUpgrade();
  if (!up) return (messageLine.textContent = "Bonus je na max.");
  if (state.totalCoins < up.price) return (messageLine.textContent = "Nedostatek minci.");
  state.totalCoins -= up.price;
  state.bonusLevel += 1;
  saveProgress();
  messageLine.textContent = `Koupeno ${up.label}. Hodnota mince ${fmtCoins(coinReward())}.`;
  updateStats();
}

function buyMovez() {
  if (state.movezUnlocked) return (messageLine.textContent = "Pohyb Z uz odemcen.");
  if (state.totalCoins < 20) return (messageLine.textContent = "Pohyb Z stoji 20 minci.");
  state.totalCoins -= 20;
  state.movezUnlocked = true;
  saveProgress();
  messageLine.textContent = "Pohyb Z odemcen.";
  updateStats();
}

function confirmReset() {
  overlay.classList.remove("hidden");
  overlay.innerHTML = "";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = "<h2>Reset progresu</h2><p>Opravdu resetovat mince i upgrady?</p>";
  const row = document.createElement("div");
  row.className = "btn-list";
  const yes = document.createElement("button");
  yes.className = "btn-danger";
  yes.textContent = "Ano";
  yes.onclick = () => {
    state.totalCoins = 0;
    state.speedLevel = 0;
    state.bonusLevel = 0;
    state.movezUnlocked = false;
    saveProgress();
    closeModal();
    setMenu("Progres resetovan.");
  };
  const no = document.createElement("button");
  no.className = "btn-secondary";
  no.textContent = "Ne";
  no.onclick = closeModal;
  row.appendChild(yes);
  row.appendChild(no);
  modal.appendChild(row);
  overlay.appendChild(modal);
}

function drawButton(x, y, w, h, label, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2 + 10);
  return { x, y, w, h, label };
}

function drawMenu() {
  ctx.fillStyle = "#dff6ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1b4b72";
  ctx.font = "bold 60px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("2D Management Sim", canvas.width / 2, 150);
  ctx.fillStyle = "#2a9d8f";
  ctx.font = "bold 30px Segoe UI";
  ctx.fillText("Ekonomika • Leadership • Cash flow", canvas.width / 2, 210);
  ctx.fillStyle = "#e76f51";
  ctx.fillText(`Mince: ${fmtCoins(state.totalCoins)}`, canvas.width / 2, 260);

  state.menuButtons = [];
  state.menuButtons.push(drawButton(canvas.width / 2 - 180, 300, 360, 80, "Hrat", "#00a8e8"));
  state.menuButtons.push(drawButton(canvas.width / 2 - 180, 410, 360, 80, "Strom vyvoje", "#9b5de5"));
  state.menuButtons.push(drawButton(canvas.width / 2 - 180, 520, 360, 80, "Reset progres", "#e63946"));
}

function drawNode(x, y, r, title, detail, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2c4a66";
  ctx.stroke();
  ctx.fillStyle = "#17324d";
  ctx.font = "bold 28px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(title, x, y - 10);
  ctx.font = "bold 18px Segoe UI";
  ctx.fillText(detail, x, y + 30);
}

function drawTree() {
  ctx.fillStyle = "#f3eeff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4a2a6a";
  ctx.font = "bold 56px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("Strom vyvoje", canvas.width / 2, 110);
  ctx.fillStyle = "#e76f51";
  ctx.font = "bold 26px Segoe UI";
  ctx.fillText(`Mince: ${fmtCoins(state.totalCoins)} | Hodnota mince: ${fmtCoins(coinReward())}`, canvas.width / 2, 160);

  const speed = { x: canvas.width / 2, y: 270, r: 95, key: "speed" };
  const bonus = { x: canvas.width / 2 - 220, y: 500, r: 95, key: "bonus" };
  const movez = { x: canvas.width / 2 + 220, y: 500, r: 95, key: "movez" };
  state.treeNodes = [speed, bonus, movez];

  ctx.strokeStyle = "#b084f5";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(speed.x, speed.y + speed.r);
  ctx.lineTo(bonus.x, bonus.y - bonus.r);
  ctx.moveTo(speed.x, speed.y + speed.r);
  ctx.lineTo(movez.x, movez.y - movez.r);
  ctx.stroke();

  const speedText = nextSpeedUpgrade() ? `Lv ${state.speedLevel}/3` : "MAX";
  const bonusText = nextBonusUpgrade() ? `Lv ${state.bonusLevel}/4` : "MAX";
  const movezText = state.movezUnlocked ? "Odemceno" : "Cena 20";
  drawNode(speed.x, speed.y, speed.r, "Rychlost", speedText, "#6dd3ff");
  drawNode(bonus.x, bonus.y, bonus.r, "Bonus", bonusText, "#6dd3ff");
  drawNode(movez.x, movez.y, movez.r, "Pohyb Z", movezText, "#6dd3ff");

  drawButton(canvas.width / 2 - 140, 635, 280, 64, "Zpet do menu", "#00a8e8");
}

function drawGame() {
  ctx.fillStyle = "#e6faff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c0e8f7";
  for (let x = 0; x < canvas.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#3ddc97";
  ctx.fillRect(state.npc.x - NPC_SIZE / 2, state.npc.y - NPC_SIZE / 2, NPC_SIZE, NPC_SIZE);
  ctx.fillStyle = "#ff6b9a";
  ctx.fillRect(state.player.x - PLAYER_SIZE / 2, state.player.y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);

  drawMobileControls();
}

function drawMobileControls() {
  const baseX = 120;
  const baseY = canvas.height - 120;
  const joy = state.joystick;
  if (!joy.active) {
    joy.baseX = baseX;
    joy.baseY = baseY;
    joy.knobX = baseX;
    joy.knobY = baseY;
  }

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#205f8e";
  ctx.beginPath();
  ctx.arc(joy.baseX, joy.baseY, joy.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#00a8e8";
  ctx.beginPath();
  ctx.arc(joy.knobX, joy.knobY, 24, 0, Math.PI * 2);
  ctx.fill();

  const actionX = canvas.width - 120;
  const actionY = canvas.height - 120;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.arc(actionX, actionY, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("E", actionX, actionY + 9);
  ctx.globalAlpha = 1;
}

function tryInteract() {
  const dx = state.player.x - state.npc.x;
  const dy = state.player.y - state.npc.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 45 && !state.awaitingChoice) {
    openChoiceModal(events[Math.floor(Math.random() * events.length)]);
  } else {
    messageLine.textContent = "Jsi daleko od kolegy.";
  }
}

function update() {
  if (state.screen === "game" && !state.awaitingChoice) {
    const speed = Math.max(1, Math.round(BASE_MOVE_SPEED * speedMultiplier()));
    let dx = 0;
    let dy = 0;
    if (state.keys.has("arrowleft") || state.keys.has("a")) dx -= speed;
    if (state.keys.has("arrowright") || state.keys.has("d")) dx += speed;
    if (state.keys.has("arrowup") || state.keys.has("w")) dy -= speed;
    if (state.keys.has("arrowdown") || state.keys.has("s")) dy += speed;
    dx += state.joystick.vectorX * speed;
    dy += state.joystick.vectorY * speed;
    state.player.x = clamp(state.player.x + dx, 12, canvas.width - 12);
    state.player.y = clamp(state.player.y + dy, 12, canvas.height - 12);

    if (state.movezUnlocked) {
      state.npc.x += state.npc.dx;
      state.npc.y += state.npc.dy;
      if (state.npc.x <= NPC_SIZE || state.npc.x >= canvas.width - NPC_SIZE) state.npc.dx *= -1;
      if (state.npc.y <= NPC_SIZE || state.npc.y >= canvas.height - NPC_SIZE) state.npc.dy *= -1;
      state.npc.x = clamp(state.npc.x, NPC_SIZE, canvas.width - NPC_SIZE);
      state.npc.y = clamp(state.npc.y, NPC_SIZE, canvas.height - NPC_SIZE);
      if (Math.random() < 0.02) {
        const vals = [-BASE_MOVE_SPEED, 0, BASE_MOVE_SPEED];
        state.npc.dx = vals[Math.floor(Math.random() * vals.length)];
        state.npc.dy = vals[Math.floor(Math.random() * vals.length)];
        if (state.npc.dx === 0 && state.npc.dy === 0) state.npc.dx = BASE_MOVE_SPEED;
      }
    }
  }
}

function render() {
  if (state.screen === "menu") drawMenu();
  else if (state.screen === "tree") drawTree();
  else drawGame();
}

function frame() {
  update();
  render();
  requestAnimationFrame(frame);
}

function handleCanvasClick(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;

  if (state.screen === "menu") {
    const [play, tree, reset] = state.menuButtons;
    if (play && x >= play.x && x <= play.x + play.w && y >= play.y && y <= play.y + play.h) startGame();
    if (tree && x >= tree.x && x <= tree.x + tree.w && y >= tree.y && y <= tree.y + tree.h) setTree();
    if (reset && x >= reset.x && x <= reset.x + reset.w && y >= reset.y && y <= reset.y + reset.h) confirmReset();
    return;
  }

  if (state.screen === "tree") {
    // back button
    if (x >= canvas.width / 2 - 140 && x <= canvas.width / 2 + 140 && y >= 635 && y <= 699) {
      setMenu();
      return;
    }
    for (const node of state.treeNodes) {
      if (Math.hypot(x - node.x, y - node.y) <= node.r) {
        if (node.key === "speed") buySpeed();
        if (node.key === "bonus") buyBonus();
        if (node.key === "movez") buyMovez();
      }
    }
  }
}

function toCanvasPosFromTouch(touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((touch.clientX - rect.left) / rect.width) * canvas.width,
    y: ((touch.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function handleTouchStart(ev) {
  if (state.screen !== "game") return;
  for (const touch of ev.changedTouches) {
    const pos = toCanvasPosFromTouch(touch);
    const actionX = canvas.width - 120;
    const actionY = canvas.height - 120;
    if (Math.hypot(pos.x - actionX, pos.y - actionY) <= 52) {
      tryInteract();
      continue;
    }

    if (!state.joystick.active && pos.x < canvas.width * 0.5 && pos.y > canvas.height * 0.45) {
      state.joystick.active = true;
      state.joystick.pointerId = touch.identifier;
      state.joystick.baseX = pos.x;
      state.joystick.baseY = pos.y;
      state.joystick.knobX = pos.x;
      state.joystick.knobY = pos.y;
      state.joystick.vectorX = 0;
      state.joystick.vectorY = 0;
    }
  }
  ev.preventDefault();
}

function handleTouchMove(ev) {
  if (!state.joystick.active || state.screen !== "game") return;
  for (const touch of ev.changedTouches) {
    if (touch.identifier !== state.joystick.pointerId) continue;
    const pos = toCanvasPosFromTouch(touch);
    const dx = pos.x - state.joystick.baseX;
    const dy = pos.y - state.joystick.baseY;
    const dist = Math.hypot(dx, dy);
    const maxR = state.joystick.radius;
    const ratio = dist > maxR ? maxR / dist : 1;
    state.joystick.knobX = state.joystick.baseX + dx * ratio;
    state.joystick.knobY = state.joystick.baseY + dy * ratio;
    state.joystick.vectorX = clamp(dx / maxR, -1, 1);
    state.joystick.vectorY = clamp(dy / maxR, -1, 1);
  }
  ev.preventDefault();
}

function stopJoystick() {
  state.joystick.active = false;
  state.joystick.pointerId = null;
  state.joystick.vectorX = 0;
  state.joystick.vectorY = 0;
}

function handleTouchEnd(ev) {
  for (const touch of ev.changedTouches) {
    if (touch.identifier === state.joystick.pointerId) {
      stopJoystick();
    }
  }
  ev.preventDefault();
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "m") return setMenu();
  if (key === "e" && state.screen === "game") return tryInteract();
  if (["a", "b", "c"].includes(key) && state.awaitingChoice) return resolveChoice(key.toUpperCase());
  state.keys.add(key);
});

window.addEventListener("keyup", (e) => {
  state.keys.delete(e.key.toLowerCase());
});

canvas.addEventListener("click", handleCanvasClick);
canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });

loadProgress();
setMenu();
frame();
