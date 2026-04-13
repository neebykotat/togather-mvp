let selectedMode = "pomodoro";
let selectedWorkDuration = 25;
let selectedBreakDuration = 5;

let currentSessionId = null;

let currentPhase = "work"; // work | break
let totalSeconds = 25 * 60;
let initialSeconds = 25 * 60;

let timerInterval = null;
let paused = false;
let activeElapsedSeconds = 0; // считаем только работу, перерывы не считаем

const setupScreen = document.getElementById("focusSetupScreen");
const activeScreen = document.getElementById("focusActiveScreen");
const timerEl = document.getElementById("timer");
const activeGoalLabel = document.getElementById("activeGoalLabel");
const activePhaseLabel = document.getElementById("activePhaseLabel");
const pauseBtnIcon = document.getElementById("pauseBtnIcon");
const progressRingFill = document.getElementById("progressRingFill");

const customModeModal = document.getElementById("customModeModal");
const customModeLabel = document.getElementById("customModeLabel");

const ringRadius = 50;
const ringCircumference = 2 * Math.PI * ringRadius;

function renderTimer() {
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    timerEl.textContent = `${m}:${s}`;
}

function renderProgressRing() {
    const progress = initialSeconds > 0 ? totalSeconds / initialSeconds : 0;
    const offset = ringCircumference * (1 - progress);
    progressRingFill.style.strokeDasharray = `${ringCircumference}`;
    progressRingFill.style.strokeDashoffset = `${offset}`;
}

function setPauseButtonState() {
    pauseBtnIcon.textContent = paused ? "▶" : "‖";
}

function renderPhaseLabel() {
    activePhaseLabel.textContent = currentPhase === "work" ? "Работа" : "Перерыв";
}

function setPhase(phase) {
    currentPhase = phase;

    if (phase === "work") {
        totalSeconds = selectedWorkDuration * 60;
        initialSeconds = totalSeconds;
    } else {
        totalSeconds = selectedBreakDuration * 60;
        initialSeconds = totalSeconds;
    }

    renderPhaseLabel();
    renderTimer();
    renderProgressRing();
}

async function loadFocusPageData() {
    const res = await fetch("/api/focus-page-data");
    const data = await res.json();

    const goalSelect = document.getElementById("goalSelect");
    goalSelect.innerHTML = `
        <option value="">Без цели</option>
        ${data.goals.map(goal => `
            <option value="${goal.id}">${goal.title}</option>
        `).join("")}
    `;
    const circleSelect = document.getElementById("circleSelect");
    circleSelect.innerHTML = `
        <option value="">Без кружка</option>
        ${data.circles.map(circle => `
            <option value="${circle.id}">${circle.name}</option>
        `).join("")}
    `;

    const row = document.getElementById("focusFriendsRow");
    row.innerHTML = data.friends.map(friend => `
        <div class="avatar-item">
            <div class="avatar-shell"><img src="${friend.avatar_url}" alt="${friend.full_name}"></div>
            <span class="avatar-status-dot"></span>
        </div>
    `).join("");
}

document.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => {
        const mode = card.dataset.mode;

        if (mode === "custom") {
            customModeModal.classList.remove("hidden");
            return;
        }

        document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");

        selectedMode = mode;
        selectedWorkDuration = Number(card.dataset.work);
        selectedBreakDuration = Number(card.dataset.break);

        setPhase("work");
    });
});

document.getElementById("closeCustomModeModalBtn")?.addEventListener("click", () => {
    customModeModal.classList.add("hidden");
});

document.getElementById("customModeModal")?.addEventListener("click", (e) => {
    if (e.target === customModeModal) {
        customModeModal.classList.add("hidden");
    }
});

document.getElementById("saveCustomModeBtn")?.addEventListener("click", () => {
    const work = Number(document.getElementById("customWorkInput").value);
    const brk = Number(document.getElementById("customBreakInput").value);

    if (!work || !brk) return;

    selectedMode = "custom";
    selectedWorkDuration = work;
    selectedBreakDuration = brk;

    document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("active"));
    document.querySelector(".mode-card--custom")?.classList.add("active");

    customModeLabel.textContent = `${work}/${brk}`;

    setPhase("work");
    customModeModal.classList.add("hidden");
});

document.getElementById("startBtn")?.addEventListener("click", async () => {
    const goalSelect = document.getElementById("goalSelect");
    const circleSelect = document.getElementById("circleSelect");

    const goalValue = goalSelect.value || null;
    const circleValue = circleSelect.value || null;

    const goalTitle = goalValue
        ? goalSelect.options[goalSelect.selectedIndex]?.text
        : "Без цели";

    const payload = {
        goal_id: goalValue,
        circle_id: circleValue,
        duration_minutes: selectedWorkDuration,
        timer_mode: selectedMode
    };

    const res = await fetch("/api/focus-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    currentSessionId = data.id;

    activeGoalLabel.textContent = goalTitle || "Без цели";

    setupScreen.classList.add("hidden");
    activeScreen.classList.remove("hidden");

    paused = false;
    activeElapsedSeconds = 0;

    setPhase("work");
    setPauseButtonState();

    timerInterval = setInterval(() => {
        if (paused) return;

        totalSeconds--;

        if (currentPhase === "work") {
            activeElapsedSeconds++;
        }

        renderTimer();
        renderProgressRing();

        if (totalSeconds <= 0) {
            if (currentPhase === "work") {
                setPhase("break");
            } else {
                setPhase("work");
            }
        }
    }, 1000);
});

document.getElementById("pauseBtn")?.addEventListener("click", () => {
    paused = !paused;
    setPauseButtonState();
});

document.getElementById("stopBtn")?.addEventListener("click", async () => {
    await completeSessionAndRedirect();
});

async function completeSessionAndRedirect() {
    clearInterval(timerInterval);

    const actualMinutes = Math.max(1, Math.round(activeElapsedSeconds / 60));

    await fetch(`/api/focus-sessions/${currentSessionId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_minutes: actualMinutes })
    });

    const res = await fetch(`/api/focus-sessions/${currentSessionId}/complete`, {
        method: "PATCH"
    });
    const data = await res.json();
    window.location.href = data.redirect_url;
}

setPhase("work");
setPauseButtonState();
loadFocusPageData();