let profileDataCache = null;
let initialProfileState = null;

function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h} ч ${m} м`;
    return `${m} м`;
}

function applyTheme(theme) {
    const root = document.documentElement;

    if (theme === "dark") {
        root.classList.add("theme-dark");
        localStorage.setItem("togather_theme", "dark");
    } else {
        root.classList.remove("theme-dark");
        localStorage.setItem("togather_theme", "light");
    }
}

function getCurrentProfileState() {
    return {
        full_name: document.getElementById("profileNameInput")?.value.trim() || "",
        avatar_selected: document.getElementById("avatarInput")?.files.length > 0,
        morning_ritual: document.getElementById("morningRitualToggle")?.checked || false,
        evening_ritual: document.getElementById("eveningRitualToggle")?.checked || false,
        show_status: document.getElementById("showStatusToggle")?.checked || false,
        show_goals: document.getElementById("showGoalsToggle")?.checked || false,
        show_achievements: document.getElementById("showAchievementsToggle")?.checked || false,
        dark_theme: document.getElementById("darkThemeToggle")?.checked || false
    };
}

function hasProfileChanges() {
    if (!initialProfileState) return false;

    const current = getCurrentProfileState();

    return (
        current.full_name !== initialProfileState.full_name ||
        current.avatar_selected === true ||
        current.morning_ritual !== initialProfileState.morning_ritual ||
        current.evening_ritual !== initialProfileState.evening_ritual ||
        current.show_status !== initialProfileState.show_status ||
        current.show_goals !== initialProfileState.show_goals ||
        current.show_achievements !== initialProfileState.show_achievements ||
        current.dark_theme !== initialProfileState.dark_theme
    );
}

function updateSaveButtonState() {
    const saveBtn = document.getElementById("saveProfileBtn");
    if (!saveBtn) return;

    const changed = hasProfileChanges();

    saveBtn.disabled = !changed;
    saveBtn.classList.toggle("profile-settings-save-btn--inactive", !changed);
    saveBtn.classList.toggle("profile-settings-save-btn--active", changed);
}

function openAchievementModal(achievement) {
    document.getElementById("achievementModalIcon").src = achievement.icon_url || "";
    document.getElementById("achievementModalTitle").textContent = achievement.display_name;
    document.getElementById("achievementModalDescription").textContent =
        achievement.description || "Описание отсутствует";

    document.getElementById("achievementModal").classList.remove("hidden");
}

function closeAchievementModal() {
    document.getElementById("achievementModal").classList.add("hidden");
}

function openHistoryModal() {
    const modal = document.getElementById("historyModal");
    const modalList = document.getElementById("historyModalList");

    modalList.innerHTML = "";

    if (!profileDataCache?.history?.length) {
        modalList.innerHTML = `<div class="empty-goals">История пуста</div>`;
    } else {
        modalList.innerHTML = profileDataCache.history.map(renderHistoryItem).join("");
    }

    modal.classList.remove("hidden");
}

function closeHistoryModal() {
    document.getElementById("historyModal").classList.add("hidden");
}

function renderHistoryItem(item) {
    return `
        <div class="history-card">
            <div class="history-row-top">
                <span class="history-title">${item.title}</span>
                <span class="history-date">${item.started_at}</span>
            </div>
            <div class="history-meta">Длительность ${item.duration_minutes} мин</div>
        </div>
    `;
}

function fillProfileSettings(user) {
    const avatarPreview = document.getElementById("settingsAvatarPreview");
    const profileName = document.getElementById("settingsProfileName");
    const nameInput = document.getElementById("profileNameInput");

    avatarPreview.src = user.avatar_url;
    profileName.textContent = user.full_name;
    nameInput.value = user.full_name;
}

function fillSettingsToggles(privacySettings = {}) {
    document.getElementById("darkThemeToggle").checked =
        privacySettings.dark_theme ?? false;

    document.getElementById("morningRitualToggle").checked =
        privacySettings.morning_ritual ?? true;

    document.getElementById("eveningRitualToggle").checked =
        privacySettings.evening_ritual ?? true;

    document.getElementById("showStatusToggle").checked =
        privacySettings.show_status ?? true;

    document.getElementById("showGoalsToggle").checked =
        privacySettings.show_goals ?? true;

    document.getElementById("showAchievementsToggle").checked =
        privacySettings.show_achievements ?? true;

    applyTheme(document.getElementById("darkThemeToggle").checked ? "dark" : "light");
}

async function loadProfile() {
    const res = await fetch("/api/profile");
    const data = await res.json();
    profileDataCache = data;

    const profileCard = document.getElementById("profileCard");
    profileCard.innerHTML = `
        <div class="profile-avatar-big">
            <img src="${data.user.avatar_url}" alt="${data.user.full_name}">
        </div>
        <div class="profile-name-main">${data.user.full_name}</div>
        <div class="profile-subtext">В Togather с ${data.user.created_at}</div>
    `;

    fillProfileSettings(data.user);
    fillSettingsToggles(data.user.privacy_settings || {});

    initialProfileState = {
        full_name: data.user.full_name || "",
        avatar_selected: false,
        morning_ritual: (data.user.privacy_settings?.morning_ritual ?? true),
        evening_ritual: (data.user.privacy_settings?.evening_ritual ?? true),
        show_status: (data.user.privacy_settings?.show_status ?? true),
        show_goals: (data.user.privacy_settings?.show_goals ?? true),
        show_achievements: (data.user.privacy_settings?.show_achievements ?? true),
        dark_theme: (data.user.privacy_settings?.dark_theme ?? false),
    };

    updateSaveButtonState();

    document.getElementById("todayMinutes").textContent = formatMinutes(data.today_minutes);
    document.getElementById("weekMinutes").textContent = formatMinutes(data.week_minutes);

    const achievements = document.getElementById("achievementsList");
    achievements.innerHTML = "";

    if (!data.achievements.length) {
        achievements.innerHTML = `<div class="empty-goals">Нет достижений</div>`;
    } else {
        achievements.innerHTML = data.achievements.map((item, index) => `
            <button class="achievement-card-btn" type="button" data-index="${index}">
                <div class="achievement-card-icon-wrap">
                    <img src="${item.icon_url || ""}" alt="${item.display_name}">
                </div>
            </button>
        `).join("");

        achievements.querySelectorAll(".achievement-card-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const achievement = data.achievements[Number(btn.dataset.index)];
                openAchievementModal(achievement);
            });
        });
    }

    const history = document.getElementById("historyList");
    history.innerHTML = "";

    if (!data.history.length) {
        history.innerHTML = `<div class="empty-goals">История пуста</div>`;
    } else {
        history.innerHTML = data.history.slice(0, 3).map(renderHistoryItem).join("");
    }
}

async function saveProfile() {
    const formData = new FormData();

    const nameInput = document.getElementById("profileNameInput");
    const avatarInput = document.getElementById("avatarInput");

    if (nameInput.value.trim()) {
        formData.append("full_name", nameInput.value.trim());
    }

    if (avatarInput.files.length > 0) {
        formData.append("avatar", avatarInput.files[0]);
    }

    const privacySettings = {
        morning_ritual: document.getElementById("morningRitualToggle").checked,
        evening_ritual: document.getElementById("eveningRitualToggle").checked,
        show_status: document.getElementById("showStatusToggle").checked,
        show_goals: document.getElementById("showGoalsToggle").checked,
        show_achievements: document.getElementById("showAchievementsToggle").checked,
        dark_theme: document.getElementById("darkThemeToggle").checked,
    };

    formData.append("privacy_settings", JSON.stringify(privacySettings));

    const res = await fetch("/api/profile/update", {
        method: "PATCH",
        body: formData
    });

    const data = await res.json();

    if (!res.ok) {
        alert(data.message || "Ошибка при сохранении профиля");
        return;
    }

    document.getElementById("nameEditBlock").classList.add("hidden");
    await loadProfile();
    alert("Изменения сохранены");
}

document.getElementById("openSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("profileMainScreen").classList.add("hidden");
    document.getElementById("profileSettingsScreen").classList.remove("hidden");
});

document.getElementById("closeSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("profileSettingsScreen").classList.add("hidden");
    document.getElementById("profileMainScreen").classList.remove("hidden");
});

document.getElementById("openHistoryModalBtn")?.addEventListener("click", openHistoryModal);
document.getElementById("closeHistoryModalBtn")?.addEventListener("click", closeHistoryModal);
document.getElementById("closeAchievementModalBtn")?.addEventListener("click", closeAchievementModal);

document.getElementById("achievementModal")?.addEventListener("click", (e) => {
    if (e.target.id === "achievementModal") {
        closeAchievementModal();
    }
});

document.getElementById("historyModal")?.addEventListener("click", (e) => {
    if (e.target.id === "historyModal") {
        closeHistoryModal();
    }
});

document.getElementById("editNameBtn")?.addEventListener("click", () => {
    document.getElementById("nameEditBlock").classList.toggle("hidden");
    updateSaveButtonState();
});

document.getElementById("avatarButton")?.addEventListener("click", () => {
    document.getElementById("avatarInput").click();
});

document.getElementById("avatarInput")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
        updateSaveButtonState();
        return;
    }

    const preview = document.getElementById("settingsAvatarPreview");
    preview.src = URL.createObjectURL(file);

    updateSaveButtonState();
});

document.getElementById("profileNameInput")?.addEventListener("input", updateSaveButtonState);

[
    "darkThemeToggle",
    "morningRitualToggle",
    "eveningRitualToggle",
    "showStatusToggle",
    "showGoalsToggle",
    "showAchievementsToggle"
].forEach(id => {
    document.getElementById(id)?.addEventListener("change", updateSaveButtonState);
});

document.getElementById("darkThemeToggle")?.addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "dark" : "light");
    updateSaveButtonState();
});

document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);

loadProfile();