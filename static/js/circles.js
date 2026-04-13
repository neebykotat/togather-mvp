let currentCircleId = null;
let currentCircleSettings = null;
let initialCircleState = null;
let selectedEvent = null;

function updateCircleSaveButtonState() {
    const btn = document.getElementById("saveCircleSettingsBtn");
    if (!btn || !initialCircleState) return;

    const currentName = document.getElementById("circleNameInput")?.value.trim() || "";
    const avatarSelected = document.getElementById("circleAvatarInput")?.files.length > 0;

    const changed = currentName !== initialCircleState.name || avatarSelected;

    btn.disabled = !changed;
    btn.classList.toggle("profile-settings-save-btn--inactive", !changed);
    btn.classList.toggle("profile-settings-save-btn--active", changed);
}

async function loadCircles() {
    const res = await fetch("/api/circles");
    const data = await res.json();

    document.getElementById("circlesCurrentUserAvatar").src = data.current_user.avatar_url || "";

    const list = document.getElementById("circlesList");
    list.innerHTML = data.circles.map(circle => `
        <button class="circle-card-btn" data-id="${circle.id}" data-name="${circle.name}" data-avatar="${circle.avatar_url || ''}" type="button">
            <span class="circle-card-avatar-wrap">
                <img src="${circle.avatar_url || ''}" alt="${circle.name}">
            </span>
            <span class="circle-card-name">${circle.name}</span>
        </button>
    `).join("");

    list.querySelectorAll(".circle-card-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            currentCircleId = btn.dataset.id;
            document.getElementById("circleNameTitle").textContent = btn.dataset.name;
            document.getElementById("circleTopAvatar").src = btn.dataset.avatar || "";

            document.getElementById("circlesListScreen").classList.add("hidden");
            document.getElementById("circleDetailScreen").classList.remove("hidden");

            await loadCircleEvents(currentCircleId);
        });
    });
}

async function loadCircleEvents(circleId) {
    const res = await fetch(`/api/circles/${circleId}/events`);
    const events = await res.json();

    const list = document.getElementById("eventsList");
    list.innerHTML = events.map((event, index) => `
        <button class="event-card event-card-btn" type="button" data-index="${index}">
            <div class="event-user-row">
                <div class="avatar-shell small"><img src="${event.avatar_url}" alt="${event.full_name}"></div>
                <span class="event-user-name">${event.full_name}</span>
            </div>
            <div class="event-message">${event.text}</div>
            <div class="event-footer">
                <div class="event-reactions">
                    ${event.reactions.map(r => `<span>${r.emoji} ${r.count}</span>`).join("")}
                    ${event.my_reaction ? `<span class="event-my-reaction">${event.my_reaction}</span>` : ""}
                </div>
                <div class="event-time">${event.occurred_at}</div>
            </div>
        </button>
    `).join("");

    list.querySelectorAll(".event-card-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const event = events[Number(btn.dataset.index)];
            selectedEvent = event;

            document.getElementById("circleReactionAvatar").src = event.avatar_url;
            document.getElementById("circleReactionName").textContent = event.full_name;
            document.getElementById("circleReactionModal").classList.remove("hidden");
        });
    });
}

async function loadCircleSettings(circleId) {
    const res = await fetch(`/api/circles/${circleId}/settings`);
    const data = await res.json();
    currentCircleSettings = data;

    document.getElementById("circleSettingsAvatarPreview").src = data.circle.avatar_url || "";
    document.getElementById("circleSettingsName").textContent = data.circle.name;
    document.getElementById("circleNameInput").value = data.circle.name;

    document.getElementById("circleMembersCountText").textContent = `${data.members_count} участников`;
    document.getElementById("circleInFocusText").textContent = `${data.in_focus_count} в фокусе`;

    initialCircleState = {
        name: data.circle.name
    };
    updateCircleSaveButtonState();

    const membersList = document.getElementById("circleMembersSettingsList");
membersList.innerHTML = data.members.map(member => {
    const canChangeRole =
        data.can_edit &&
        member.id !== data.current_user_id &&
        member.role !== "admin";

    return `
        <div class="member-settings-row">
            <div class="member-settings-left">
                <div class="avatar-shell small"><img src="${member.avatar_url}" alt="${member.full_name}"></div>
                <span class="member-settings-name">${member.full_name}</span>
            </div>

            ${
                data.can_edit && member.role !== "admin"
                    ? `
                        <select class="member-role-select" data-member-id="${member.id}">
                            <option value="member" ${member.role === "member" ? "selected" : ""}>Участник</option>
                            <option value="admin" ${member.role === "admin" ? "selected" : ""}>Владелец</option>
                        </select>
                    `
                    : `<div class="member-settings-role">${member.role_label}</div>`
            }
        </div>
    `;
}).join("");
membersList.querySelectorAll(".member-role-select").forEach(select => {
    select.addEventListener("change", async () => {
        const memberId = select.dataset.memberId;
        const role = select.value;

        const res = await fetch(`/api/circles/${circleId}/members/${memberId}/role`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role })
        });

        const result = await res.json();
        if (!res.ok) {
            alert(result.message || "Ошибка смены роли");
            await loadCircleSettings(circleId);
            return;
        }

        await loadCircleSettings(circleId);
    });
});
    const editable = data.can_edit;

    document.getElementById("editCircleNameBtn").disabled = !editable;
    document.getElementById("circleAvatarButton").disabled = !editable;
    document.getElementById("saveCircleSettingsBtn").style.display = editable ? "block" : "none";
    document.getElementById("generateInviteLinkBtn").style.display = editable ? "block" : "none";

    if (!editable) {
        document.getElementById("circleNameEditBlock").classList.add("hidden");
    }
}

document.getElementById("backToCirclesBtn")?.addEventListener("click", () => {
    document.getElementById("circleDetailScreen").classList.add("hidden");
    document.getElementById("circlesListScreen").classList.remove("hidden");
});

document.getElementById("openCircleSettingsBtn")?.addEventListener("click", async () => {
    await loadCircleSettings(currentCircleId);
    document.getElementById("circleDetailScreen").classList.add("hidden");
    document.getElementById("circleSettingsScreen").classList.remove("hidden");
});

document.getElementById("closeCircleSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("circleSettingsScreen").classList.add("hidden");
    document.getElementById("circleDetailScreen").classList.remove("hidden");
});

document.getElementById("editCircleNameBtn")?.addEventListener("click", () => {
    if (!currentCircleSettings?.can_edit) return;
    document.getElementById("circleNameEditBlock").classList.toggle("hidden");
    updateCircleSaveButtonState();
});

document.getElementById("circleAvatarButton")?.addEventListener("click", () => {
    if (!currentCircleSettings?.can_edit) return;
    document.getElementById("circleAvatarInput").click();
});

document.getElementById("circleAvatarInput")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
        updateCircleSaveButtonState();
        return;
    }

    document.getElementById("circleSettingsAvatarPreview").src = URL.createObjectURL(file);
    updateCircleSaveButtonState();
});

document.getElementById("circleNameInput")?.addEventListener("input", updateCircleSaveButtonState);

document.getElementById("generateInviteLinkBtn")?.addEventListener("click", async () => {
    if (!currentCircleSettings) return;

    try {
        await navigator.clipboard.writeText(currentCircleSettings.invite_link);
        showCircleToast("Ссылка скопирована");
    } catch {
        showCircleToast("Не удалось скопировать ссылку");
    }
});

function showCircleToast(message) {
    let toast = document.getElementById("circleToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "circleToast";
        toast.className = "circle-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("circle-toast--visible");

    clearTimeout(window.__circleToastTimeout);
    window.__circleToastTimeout = setTimeout(() => {
        toast.classList.remove("circle-toast--visible");
    }, 1800);
}

document.getElementById("saveCircleSettingsBtn")?.addEventListener("click", async () => {
    const formData = new FormData();

    const name = document.getElementById("circleNameInput").value.trim();
    const avatarInput = document.getElementById("circleAvatarInput");

    if (name) {
        formData.append("name", name);
    }
    if (avatarInput.files.length > 0) {
        formData.append("avatar", avatarInput.files[0]);
    }

    const res = await fetch(`/api/circles/${currentCircleId}/settings`, {
        method: "PATCH",
        body: formData
    });

    const data = await res.json();
    if (!res.ok) {
        alert(data.message || "Ошибка сохранения");
        return;
    }

    document.getElementById("circleNameEditBlock").classList.add("hidden");
    await loadCircles();
    await loadCircleSettings(currentCircleId);
    document.getElementById("circleNameTitle").textContent = data.circle.name;
    document.getElementById("circleTopAvatar").src = data.circle.avatar_url || "";
});

document.getElementById("circleReactionModal")?.addEventListener("click", async (e) => {
    if (
        e.target.classList.contains("reaction-modal-overlay") ||
        e.target.classList.contains("reaction-backdrop")
    ) {
        document.getElementById("circleReactionModal").classList.add("hidden");
        return;
    }

    if (e.target.tagName === "BUTTON" && e.target.dataset.emoji && selectedEvent) {
        await fetch(`/api/circles/events/${selectedEvent.id}/reaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emoji: e.target.dataset.emoji })
        });

        document.getElementById("circleReactionModal").classList.add("hidden");
        await loadCircleEvents(currentCircleId);
    }
});

loadCircles();