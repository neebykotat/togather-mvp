async function loadSessionResult() {
    const res = await fetch(`/api/session-result/${window.SESSION_ID}`);
    const data = await res.json();

    document.getElementById("resultMinutes").textContent = data.duration_minutes;

    const resultGoalBlock = document.getElementById("resultGoalBlock");
    const resultGoalTitle = document.getElementById("resultGoalTitle");

    if (data.has_goal) {
        resultGoalBlock.classList.remove("hidden");
        resultGoalTitle.textContent = data.goal_title;
    } else {
        resultGoalBlock.classList.add("hidden");
    }

    const supportList = document.getElementById("supportList");
    const supportFallback = [
        { full_name: "Мария", avatar_url: "https://randomuser.me/api/portraits/women/2.jpg", emoji: "👍" },
        { full_name: "Алексей", avatar_url: "https://randomuser.me/api/portraits/men/1.jpg", emoji: "🔥" },
        { full_name: "Анна", avatar_url: "https://randomuser.me/api/portraits/women/3.jpg", emoji: "👏" }
    ];

    const supportData = data.support.length ? data.support : supportFallback;

    supportList.innerHTML = supportData.map(item => `
        <div class="support-row">
            <div class="support-left">
                <div class="avatar-shell small"><img src="${item.avatar_url}" alt="${item.full_name}"></div>
                <span class="avatar-status-dot small-dot"></span>
                <span class="support-name">${item.full_name}</span>
            </div>
            <div class="support-emoji">${item.emoji}</div>
        </div>
    `).join("");

    const supportFriendsRow = document.getElementById("supportFriendsRow");
    supportFriendsRow.innerHTML = data.friends.map(friend => `
        <div class="avatar-item">
            <div class="avatar-shell"><img src="${friend.avatar_url}" alt="${friend.full_name}"></div>
            <span class="avatar-status-dot"></span>
        </div>
    `).join("");
}

loadSessionResult();