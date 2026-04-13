const goalModal = document.getElementById("goalModal");
const openGoalFormBtn = document.getElementById("openGoalFormBtn");
const closeGoalFormBtn = document.getElementById("closeGoalFormBtn");
const editTodayGoalBtn = document.getElementById("editTodayGoalBtn");

const reactionModal = document.getElementById("reactionModal");
const reactionAvatar = document.getElementById("reactionAvatar");
const reactionName = document.getElementById("reactionName");

const goalModalTitle = document.getElementById("goalModalTitle");
const goalSubmitBtn = document.getElementById("goalSubmitBtn");
const editingGoalIdInput = document.getElementById("editingGoalId");

let homeDataCache = null;
let selectedFriend = null;

function setCurrentDate() {
    const el = document.getElementById("currentDate");
    if (!el) return;

    const now = new Date();
    el.textContent = now.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long"
    });
}

function resetGoalForm() {
    document.getElementById("goalForm").reset();
    editingGoalIdInput.value = "";
    document.getElementById("goalType").value = "today";

    goalModalTitle.textContent = "Новая цель";
    goalSubmitBtn.textContent = "Сохранить";

    const recurringCheckbox = document.getElementById("is_recurring");
    recurringCheckbox.closest(".checkbox-row").style.display = "flex";
    recurringCheckbox.checked = false;
}

function openTodayGoalModal() {
    resetGoalForm();

    document.getElementById("goalType").value = "today";
    goalModalTitle.textContent = "Цель на сегодня";
    goalSubmitBtn.textContent = "Сохранить";

    const recurringCheckbox = document.getElementById("is_recurring");
    recurringCheckbox.checked = false;
    recurringCheckbox.closest(".checkbox-row").style.display = "none";

    goalModal.classList.remove("hidden");
}

function openRegularGoalModal() {
    resetGoalForm();

    document.getElementById("goalType").value = "regular";
    goalModalTitle.textContent = "Новая цель";
    goalSubmitBtn.textContent = "Сохранить";

    const recurringCheckbox = document.getElementById("is_recurring");
    recurringCheckbox.closest(".checkbox-row").style.display = "flex";

    goalModal.classList.remove("hidden");
}

function openEditGoalModal(goal) {
    editingGoalIdInput.value = goal.id;

    const today = new Date().toISOString().split("T")[0];
    const isTodayGoal = goal.scheduled_date === today;

    document.getElementById("goalType").value = isTodayGoal ? "today" : "regular";

    goalModalTitle.textContent = isTodayGoal
        ? "Цель на сегодня"
        : "Редактирование цели";

    goalSubmitBtn.textContent = "Сохранить изменения";

    document.getElementById("title").value = goal.title || "";
    document.getElementById("description").value = goal.description || "";

    const recurringCheckbox = document.getElementById("is_recurring");

    if (isTodayGoal) {
        recurringCheckbox.checked = false;
        recurringCheckbox.closest(".checkbox-row").style.display = "none";
    } else {
        recurringCheckbox.closest(".checkbox-row").style.display = "flex";
        recurringCheckbox.checked = !!goal.is_recurring;
    }

    goalModal.classList.remove("hidden");
}

function closeGoalModal() {
    goalModal.classList.add("hidden");
    resetGoalForm();
}

function openReactionModal(friend) {
    selectedFriend = friend;
    reactionAvatar.src = friend.avatar_url;
    reactionName.textContent = friend.full_name;
    reactionModal.classList.remove("hidden");
}

function closeReactionModal() {
    reactionModal.classList.add("hidden");
    selectedFriend = null;
}

openGoalFormBtn?.addEventListener("click", openRegularGoalModal);
closeGoalFormBtn?.addEventListener("click", closeGoalModal);
editTodayGoalBtn?.addEventListener("click", openTodayGoalModal);

goalModal?.addEventListener("click", (e) => {
    if (e.target === goalModal) {
        closeGoalModal();
    }
});

reactionModal?.addEventListener("click", async (e) => {
    if (
        e.target.classList.contains("reaction-modal-overlay") ||
        e.target.classList.contains("reaction-backdrop")
    ) {
        closeReactionModal();
        return;
    }

    if (e.target.tagName === "BUTTON" && e.target.dataset.emoji && selectedFriend) {
        await fetch("/api/home-reactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                friend_id: selectedFriend.id,
                emoji: e.target.dataset.emoji
            })
        });

        closeReactionModal();
        await loadHomeData();
    }
});

function renderHeaderUser(user) {
    const greeting = document.getElementById("greetingText");
    const avatar = document.getElementById("headerAvatar");

    if (greeting) {
        greeting.textContent = `Привет, ${user.full_name}!`;
    }

    if (avatar) {
        avatar.src = user.avatar_url || "";
    }
}

function renderTodayGoal(currentGoal) {
    const textEl = document.getElementById("todayGoalText");
    const btnEl = document.getElementById("editTodayGoalBtn");

    if (!textEl || !btnEl) return;

    if (currentGoal) {
        textEl.textContent = currentGoal.title;
        btnEl.textContent = "Изменить";
    } else {
        textEl.textContent = "Ещё не выбрана";
        btnEl.textContent = "Добавить";
    }
}

function renderGoals(goals) {
    const list = document.getElementById("goalsList");
    const card = document.querySelector(".goals-card");

    if (!list || !card) return;

    list.innerHTML = "";

    if (!goals.length) {
        list.innerHTML = `<div class="empty-goals">Пока нет целей</div>`;
        card.classList.add("goals-card--empty");
        return;
    }

    card.classList.remove("goals-card--empty");

    goals.forEach(goal => {
        const row = document.createElement("div");
        row.className = `goal-row ${goal.status === "completed" ? "goal-row--done" : ""}`;

        row.innerHTML = `
            <button class="goal-check-btn" data-id="${goal.id}">
                ${goal.status === "completed" ? "✓" : ""}
            </button>

            <button class="goal-title-button" type="button" data-edit-id="${goal.id}">
                <span class="goal-title-small">${goal.title}</span>
            </button>

            <div class="goal-actions-right">
                ${goal.is_recurring ? `<span class="goal-recurring-indicator">↻</span>` : ``}
                <button class="goal-delete-btn" type="button" data-delete-id="${goal.id}">✕</button>
            </div>
        `;

        list.appendChild(row);
    });

    list.querySelectorAll(".goal-check-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const goalId = btn.dataset.id;
            const goal = goals.find(g => g.id === goalId);

            if (!goal) return;

            if (goal.status === "completed") {
                await fetch(`/api/goals/${goalId}/uncomplete`, { method: "PATCH" });
            } else {
                await fetch(`/api/goals/${goalId}/complete`, { method: "PATCH" });
            }

            await loadHomeData();
        });
    });

    list.querySelectorAll(".goal-title-button").forEach(btn => {
        btn.addEventListener("click", () => {
            const goalId = btn.dataset.editId;
            const goal = goals.find(g => g.id === goalId);
            if (goal) openEditGoalModal(goal);
        });
    });

    list.querySelectorAll(".goal-delete-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const goalId = btn.dataset.deleteId;

            const confirmed = window.confirm("Удалить цель?");
            if (!confirmed) return;

            await fetch(`/api/goals/${goalId}`, {
                method: "DELETE"
            });

            await loadHomeData();
        });
    });
}

function renderFriends(friends) {
    const row = document.getElementById("friendsFocusRow");
    if (!row) return;

    row.innerHTML = friends.map(friend => `
        <button class="avatar-item avatar-item-btn" type="button" data-id="${friend.id}">
            <div class="avatar-shell">
                <img src="${friend.avatar_url}" alt="${friend.full_name}">
            </div>
            ${
                friend.reaction
                    ? `<span class="avatar-reaction-badge">${friend.reaction}</span>`
                    : `<span class="avatar-status-dot"></span>`
            }
        </button>
    `).join("");

    row.querySelectorAll(".avatar-item-btn").forEach((btn, index) => {
        btn.addEventListener("click", () => {
            const friend = friends[index];
            row.querySelectorAll(".avatar-item-btn").forEach(el => el.classList.remove("selected"));
            btn.classList.add("selected");
            openReactionModal(friend);
        });
    });
}

async function loadHomeData() {
    const res = await fetch("/api/home-data");
    const data = await res.json();
    homeDataCache = data;

    renderHeaderUser(data.user);
    renderTodayGoal(data.current_goal);
    renderGoals(data.goals);
    renderFriends(data.friends);
}

document.getElementById("goalForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const editingGoalId = editingGoalIdInput.value;

    const goalType = document.getElementById("goalType").value;

    const payload = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        goal_type: goalType,
        is_recurring: goalType === "regular"
            ? document.getElementById("is_recurring").checked
            : false
    };

    if (editingGoalId) {
        await fetch(`/api/goals/${editingGoalId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } else {
        await fetch("/api/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }

    closeGoalModal();
    await loadHomeData();
});

document.querySelectorAll(".reaction-modal-actions button").forEach(btn => {
    btn.dataset.emoji = btn.textContent;
});

setCurrentDate();
loadHomeData();