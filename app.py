import os
import json
from datetime import date
from uuid import uuid4

from flask import Flask, jsonify, render_template, request, session
from werkzeug.utils import secure_filename

from db import get_connection, run_query
from psycopg2 import OperationalError

app = Flask(__name__)
app.secret_key = "togather-dev-secret-key"

UPLOAD_FOLDER = os.path.join("static", "uploads")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

CURRENT_USER_ID = "11111111-1111-1111-1111-111111111111"

def allowed_file(filename):
    if not filename:
        return False
    if "." not in filename:
        return False
    return filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# =========================
# Pages
# =========================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/focus")
def focus_page():
    return render_template("focus.html")


@app.route("/session-result/<session_id>")
def session_result_page(session_id):
    return render_template("session_result.html", session_id=session_id)


@app.route("/circles")
def circles_page():
    return render_template("circles.html")


@app.route("/profile")
def profile_page():
    return render_template("profile.html")


# =========================
# Goals
# =========================
@app.route("/api/goals", methods=["GET"])
def get_goals():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, title, description, scheduled_date, status, is_recurring, created_at
        FROM goals
        WHERE user_id = %s
        ORDER BY created_at DESC
    """, (CURRENT_USER_ID,))
    rows = cur.fetchall()

    cur.close()
    conn.close()

    goals = [
        {
            "id": str(row[0]),
            "title": row[1],
            "description": row[2],
            "scheduled_date": row[3].isoformat(),
            "status": row[4],
            "is_recurring": row[5],
            "created_at": row[6].isoformat()
        }
        for row in rows
    ]

    return jsonify(goals)


@app.route("/api/goals", methods=["POST"])
def create_goal():
    data = request.get_json()

    title = data["title"]
    description = data.get("description")
    goal_type = data.get("goal_type", "today")

    if goal_type == "regular":
        is_recurring = data.get("is_recurring", False)
        scheduled_date = date.today()  # пока оставляем так, если позже добавим отдельную дату для обычной цели — поменяем
    else:
        is_recurring = False
        scheduled_date = date.today()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO goals (user_id, title, description, scheduled_date, status, is_recurring)
        VALUES (%s, %s, %s, %s, 'pending', %s)
        RETURNING id
    """, (
        CURRENT_USER_ID,
        title,
        description,
        scheduled_date,
        is_recurring
    ))

    goal_id = cur.fetchone()[0]
    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"id": str(goal_id)}), 201


@app.route("/api/goals/<goal_id>", methods=["PATCH"])
def update_goal(goal_id):
    data = request.get_json()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT scheduled_date
        FROM goals
        WHERE id = %s AND user_id = %s
    """, (goal_id, CURRENT_USER_ID))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return jsonify({"message": "Goal not found"}), 404

    scheduled_date = row[0]
    is_today_goal = scheduled_date == date.today()

    is_recurring = False if is_today_goal else data.get("is_recurring", False)

    cur.execute("""
        UPDATE goals
        SET title = %s,
            description = %s,
            is_recurring = %s,
            updated_at = now()
        WHERE id = %s AND user_id = %s
        RETURNING id
    """, (
        data["title"],
        data.get("description"),
        is_recurring,
        goal_id,
        CURRENT_USER_ID
    ))

    updated = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"message": "Goal updated", "id": str(updated[0])})

@app.route("/api/goals/<goal_id>", methods=["DELETE"])
def delete_goal(goal_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM goals
        WHERE id = %s AND user_id = %s
        RETURNING id
    """, (goal_id, CURRENT_USER_ID))

    deleted = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    if not deleted:
        return jsonify({"message": "Goal not found"}), 404

    return jsonify({"message": "Goal deleted", "id": str(deleted[0])})

@app.route("/api/goals/<goal_id>/complete", methods=["PATCH"])
def complete_goal(goal_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE goals
        SET status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE id = %s AND user_id = %s
    """, (goal_id, CURRENT_USER_ID))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "Goal completed"})


@app.route("/api/goals/<goal_id>/uncomplete", methods=["PATCH"])
def uncomplete_goal(goal_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE goals
        SET status = 'pending',
            completed_at = NULL,
            updated_at = now()
        WHERE id = %s AND user_id = %s
    """, (goal_id, CURRENT_USER_ID))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "Goal uncompleted"})


# =========================
# Home screen
# =========================
@app.route("/api/home-data", methods=["GET"])
def get_home_data():
    try:
        user_row = run_query("""
            SELECT id, full_name, avatar_url
            FROM users
            WHERE id = %s
        """, (CURRENT_USER_ID,), fetchone=True)

        current_goal_row = run_query("""
            SELECT id, title
            FROM goals
            WHERE user_id = %s
              AND scheduled_date = CURRENT_DATE
              AND status != 'completed'
            ORDER BY created_at DESC
            LIMIT 1
        """, (CURRENT_USER_ID,), fetchone=True)

        if current_goal_row:
            current_goal_id = current_goal_row[0]

            goal_rows = run_query("""
                SELECT id, title, description, scheduled_date, status, is_recurring, created_at
                FROM goals
                WHERE user_id = %s
                  AND id != %s
                ORDER BY created_at DESC
            """, (CURRENT_USER_ID, current_goal_id), fetchall=True)
        else:
            goal_rows = run_query("""
                SELECT id, title, description, scheduled_date, status, is_recurring, created_at
                FROM goals
                WHERE user_id = %s
                ORDER BY created_at DESC
            """, (CURRENT_USER_ID,), fetchall=True)

        friend_rows = run_query("""
            SELECT u.id, u.full_name, u.avatar_url
            FROM users u
            WHERE u.id != %s
            ORDER BY u.full_name
            LIMIT 4
        """, (CURRENT_USER_ID,), fetchall=True)

        home_reactions = session.get("home_reactions", {})

        return jsonify({
            "user": {
                "id": str(user_row[0]),
                "full_name": user_row[1],
                "avatar_url": user_row[2]
            },
            "current_goal": {
                "id": str(current_goal_row[0]),
                "title": current_goal_row[1]
            } if current_goal_row else None,
            "goals": [
                {
                    "id": str(row[0]),
                    "title": row[1],
                    "description": row[2],
                    "scheduled_date": row[3].isoformat(),
                    "status": row[4],
                    "is_recurring": row[5],
                    "created_at": row[6].isoformat()
                }
                for row in goal_rows
            ],
            "friends": [
                {
                    "id": str(row[0]),
                    "full_name": row[1],
                    "avatar_url": row[2],
                    "reaction": home_reactions.get(str(row[0]))
                }
                for row in friend_rows
            ]
        })

    except OperationalError as e:
        print("DB ERROR in /api/home-data:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500

@app.route("/api/home-reactions", methods=["POST"])
def save_home_reaction():
    data = request.get_json()
    friend_id = data.get("friend_id")
    emoji = data.get("emoji")

    if not friend_id or not emoji:
        return jsonify({"message": "friend_id and emoji are required"}), 400

    if "home_reactions" not in session:
        session["home_reactions"] = {}

    reactions = session["home_reactions"]
    reactions[friend_id] = emoji
    session["home_reactions"] = reactions
    session.modified = True

    return jsonify({"message": "Reaction saved"})


# =========================
# Focus page
# =========================
@app.route("/api/focus-page-data", methods=["GET"])
def focus_page_data():
    try:
        goal_rows = run_query("""
            SELECT id, title
            FROM goals
            WHERE user_id = %s
            ORDER BY created_at DESC
        """, (CURRENT_USER_ID,), fetchall=True)

        circle_rows = run_query("""
            SELECT fc.id, fc.name, fc.avatar_url
            FROM focus_circles fc
            JOIN circle_members cm ON cm.circle_id = fc.id
            WHERE cm.user_id = %s
            ORDER BY fc.created_at DESC
        """, (CURRENT_USER_ID,), fetchall=True)

        friend_rows = run_query("""
            SELECT u.id, u.full_name, u.avatar_url
            FROM users u
            WHERE u.id != %s
            ORDER BY u.full_name
            LIMIT 4
        """, (CURRENT_USER_ID,), fetchall=True)

        return jsonify({
            "goals": [
                {"id": str(row[0]), "title": row[1]}
                for row in goal_rows
            ],
            "circles": [
                {"id": str(row[0]), "name": row[1], "avatar_url": row[2]}
                for row in circle_rows
            ],
            "friends": [
                {"id": str(row[0]), "full_name": row[1], "avatar_url": row[2]}
                for row in friend_rows
            ]
        })

    except OperationalError as e:
        print("DB ERROR in /api/focus-page-data:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500


@app.route("/api/focus-sessions", methods=["POST"])
def create_focus_session():
    data = request.get_json()

    selected_circle_id = data.get("circle_id")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO focus_sessions (
            user_id, goal_id, duration_minutes, timer_mode, white_noise_enabled, completed
        )
        VALUES (%s, %s, %s, %s, %s, FALSE)
        RETURNING id
    """, (
        CURRENT_USER_ID,
        data.get("goal_id"),
        data["duration_minutes"],
        data.get("timer_mode", "pomodoro"),
        False
    ))

    session_id = cur.fetchone()[0]
    conn.commit()

    # сохраняем выбранный кружок в session для завершения
    focus_session_circles = session.get("focus_session_circles", {})
    focus_session_circles[str(session_id)] = selected_circle_id
    session["focus_session_circles"] = focus_session_circles
    session.modified = True

    cur.close()
    conn.close()

    return jsonify({
        "id": str(session_id),
        "planned_duration_minutes": data["duration_minutes"]
    }), 201

@app.route("/api/focus-sessions/<session_id>/progress", methods=["PATCH"])
def update_focus_session_progress(session_id):
    data = request.get_json()
    actual_minutes = data.get("actual_minutes", 0)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE focus_sessions
        SET duration_minutes = %s
        WHERE id = %s AND user_id = %s
        RETURNING id
    """, (
        actual_minutes,
        session_id,
        CURRENT_USER_ID
    ))

    updated = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    if not updated:
        return jsonify({"message": "Session not found"}), 404

    return jsonify({"message": "Progress saved"})

@app.route("/api/focus-sessions/<session_id>/complete", methods=["PATCH"])
def complete_focus_session(session_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE focus_sessions
        SET completed = TRUE
        WHERE id = %s AND user_id = %s
        RETURNING id
    """, (session_id, CURRENT_USER_ID))

    updated = cur.fetchone()

    focus_session_circles = session.get("focus_session_circles", {})
    selected_circle_id = focus_session_circles.get(str(session_id))

    if updated and selected_circle_id:
        cur.execute("""
            INSERT INTO events (circle_id, user_id, event_type, reference_id, occurred_at)
            VALUES (%s, %s, 'session_completed', %s, now())
        """, (selected_circle_id, CURRENT_USER_ID, session_id))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "message": "Session completed",
        "redirect_url": f"/session-result/{session_id}"
    })


@app.route("/api/session-result/<session_id>", methods=["GET"])
def session_result(session_id):
    try:
        session_row = run_query("""
            SELECT fs.id, fs.duration_minutes, fs.started_at, g.title
            FROM focus_sessions fs
            LEFT JOIN goals g ON g.id = fs.goal_id
            WHERE fs.id = %s AND fs.user_id = %s
        """, (session_id, CURRENT_USER_ID), fetchone=True)

        support_rows = run_query("""
            SELECT u.full_name, u.avatar_url, r.emoji
            FROM reactions r
            JOIN users u ON u.id = r.from_user_id
            JOIN events e ON e.id = r.event_id
            WHERE e.reference_id = %s
            ORDER BY r.created_at DESC
            LIMIT 3
        """, (session_id,), fetchall=True)

        friend_rows = run_query("""
            SELECT u.full_name, u.avatar_url
            FROM users u
            WHERE u.id != %s
            ORDER BY u.full_name
            LIMIT 4
        """, (CURRENT_USER_ID,), fetchall=True)

        return jsonify({
            "session_id": str(session_row[0]),
            "duration_minutes": session_row[1],
            "goal_title": session_row[3],
            "has_goal": bool(session_row[3]),
            "support": [
                {"full_name": row[0], "avatar_url": row[1], "emoji": row[2]}
                for row in support_rows
            ],
            "friends": [
                {"full_name": row[0], "avatar_url": row[1]}
                for row in friend_rows
            ]
        })

    except OperationalError as e:
        print("DB ERROR in /api/session-result/<session_id>:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500


# =========================
# Circles
# =========================
@app.route("/api/circles", methods=["GET"])
def get_circles():
    try:
        user_row = run_query("""
            SELECT full_name, avatar_url
            FROM users
            WHERE id = %s
        """, (CURRENT_USER_ID,), fetchone=True)

        rows = run_query("""
            SELECT fc.id, fc.name, fc.description, fc.avatar_url
            FROM focus_circles fc
            JOIN circle_members cm ON cm.circle_id = fc.id
            WHERE cm.user_id = %s
            ORDER BY fc.created_at
        """, (CURRENT_USER_ID,), fetchall=True)

        return jsonify({
            "current_user": {
                "full_name": user_row[0],
                "avatar_url": user_row[1]
            },
            "circles": [
                {
                    "id": str(row[0]),
                    "name": row[1],
                    "description": row[2],
                    "avatar_url": row[3]
                }
                for row in rows
            ]
        })

    except OperationalError as e:
        print("DB ERROR in /api/circles:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500


@app.route("/api/circles/<circle_id>/members", methods=["GET"])
def get_circle_members(circle_id):
    try:
        rows = run_query("""
            SELECT u.id, u.full_name, u.avatar_url, cm.role
            FROM circle_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.circle_id = %s
            ORDER BY cm.joined_at
        """, (circle_id,), fetchall=True)

        return jsonify([
            {
                "id": str(row[0]),
                "full_name": row[1],
                "avatar_url": row[2],
                "role": row[3]
            }
            for row in rows
        ])

    except OperationalError as e:
        print("DB ERROR in /api/circles/<circle_id>/members:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500


@app.route("/api/circles/<circle_id>/events", methods=["GET"])
def get_circle_events(circle_id):
    try:
        event_rows = run_query("""
            SELECT e.id, e.user_id, u.full_name, u.avatar_url, e.event_type, e.occurred_at
            FROM events e
            JOIN users u ON u.id = e.user_id
            WHERE e.circle_id = %s
            ORDER BY e.occurred_at DESC
            LIMIT 20
        """, (circle_id,), fetchall=True)

        result = []

        for row in event_rows:
            event_id, event_user_id, full_name, avatar_url, event_type, occurred_at = row

            reaction_rows = run_query("""
                SELECT emoji, COUNT(*)
                FROM reactions
                WHERE event_id = %s
                GROUP BY emoji
            """, (event_id,), fetchall=True)

            my_reaction_row = run_query("""
                SELECT emoji
                FROM reactions
                WHERE event_id = %s AND from_user_id = %s
                LIMIT 1
            """, (event_id, CURRENT_USER_ID), fetchone=True)

            result.append({
                "id": str(event_id),
                "to_user_id": str(event_user_id),
                "full_name": full_name,
                "avatar_url": avatar_url,
                "text": "Завершил(а) фокус-сессию" if event_type == "session_completed" else "Получил(а) достижение",
                "occurred_at": occurred_at.strftime("%H:%M"),
                "reactions": [{"emoji": r[0], "count": r[1]} for r in reaction_rows],
                "my_reaction": my_reaction_row[0] if my_reaction_row else None
            })

        return jsonify(result)

    except OperationalError as e:
        print("DB ERROR in /api/circles/<circle_id>/events:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500

@app.route("/api/circles/events/<event_id>/reaction", methods=["POST"])
def set_circle_event_reaction(event_id):
    data = request.get_json()
    emoji = data.get("emoji")

    if not emoji:
        return jsonify({"message": "Emoji is required"}), 400

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT user_id
        FROM events
        WHERE id = %s
    """, (event_id,))
    event_row = cur.fetchone()

    if not event_row:
        cur.close()
        conn.close()
        return jsonify({"message": "Event not found"}), 404

    to_user_id = event_row[0]

    cur.execute("""
        SELECT id
        FROM reactions
        WHERE event_id = %s AND from_user_id = %s
        LIMIT 1
    """, (event_id, CURRENT_USER_ID))
    existing_row = cur.fetchone()

    if existing_row:
        cur.execute("""
            UPDATE reactions
            SET emoji = %s, created_at = now()
            WHERE id = %s
        """, (emoji, existing_row[0]))
    else:
        cur.execute("""
            INSERT INTO reactions (from_user_id, to_user_id, event_id, emoji)
            VALUES (%s, %s, %s, %s)
        """, (CURRENT_USER_ID, to_user_id, event_id, emoji))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "Reaction saved"})

@app.route("/api/circles/<circle_id>/settings", methods=["GET"])
def get_circle_settings(circle_id):
    try:
        circle_row = run_query("""
            SELECT fc.id, fc.name, fc.avatar_url
            FROM focus_circles fc
            WHERE fc.id = %s
        """, (circle_id,), fetchone=True)

        if not circle_row:
            return jsonify({"message": "Circle not found"}), 404

        my_role_row = run_query("""
            SELECT cm.role
            FROM circle_members cm
            WHERE cm.circle_id = %s AND cm.user_id = %s
            LIMIT 1
        """, (circle_id, CURRENT_USER_ID), fetchone=True)

        members_count = run_query("""
            SELECT COUNT(*)
            FROM circle_members
            WHERE circle_id = %s
        """, (circle_id,), fetchone=True)[0]

        in_focus_count = run_query("""
            SELECT COUNT(DISTINCT fs.user_id)
            FROM focus_sessions fs
            JOIN circle_members cm ON cm.user_id = fs.user_id
            WHERE cm.circle_id = %s
              AND fs.started_at >= now() - interval '2 hours'
        """, (circle_id,), fetchone=True)[0]

        member_rows = run_query("""
            SELECT u.id, u.full_name, u.avatar_url, cm.role
            FROM circle_members cm
            JOIN users u ON u.id = cm.user_id
            WHERE cm.circle_id = %s
            ORDER BY
                CASE WHEN cm.role = 'admin' THEN 0 ELSE 1 END,
                cm.joined_at
        """, (circle_id,), fetchall=True)

        my_role = my_role_row[0] if my_role_row else "member"

        return jsonify({
            "current_user_id": CURRENT_USER_ID,
            "circle": {
                "id": str(circle_row[0]),
                "name": circle_row[1],
                "avatar_url": circle_row[2]
            },
            "members_count": members_count,
            "in_focus_count": in_focus_count,
            "my_role": my_role,
            "can_edit": my_role == "admin",
            "invite_link": f"http://127.0.0.1:5000/circles?invite={circle_id}",
            "members": [
                {
                    "id": str(row[0]),
                    "full_name": row[1],
                    "avatar_url": row[2],
                    "role": row[3],
                    "role_label": "Владелец" if row[3] == "admin" else "Участник"
                }
                for row in member_rows
            ]
        })

    except OperationalError as e:
        print("DB ERROR in /api/circles/<circle_id>/settings:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500

@app.route("/api/circles/<circle_id>/settings", methods=["PATCH"])
def update_circle_settings(circle_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT role
        FROM circle_members
        WHERE circle_id = %s AND user_id = %s
        LIMIT 1
    """, (circle_id, CURRENT_USER_ID))
    role_row = cur.fetchone()

    if not role_row or role_row[0] != "admin":
        cur.close()
        conn.close()
        return jsonify({"message": "Forbidden"}), 403

    circle_name = request.form.get("name")
    avatar_file = request.files.get("avatar")

    cur.execute("""
        SELECT avatar_url
        FROM focus_circles
        WHERE id = %s
    """, (circle_id,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return jsonify({"message": "Circle not found"}), 404

    current_avatar_url = row[0]
    new_avatar_url = current_avatar_url

    if avatar_file and avatar_file.filename:
        original_filename = secure_filename(avatar_file.filename)

        if "." not in original_filename:
            cur.close()
            conn.close()
            return jsonify({"message": "Файл должен иметь расширение"}), 400

        if not allowed_file(original_filename):
            cur.close()
            conn.close()
            return jsonify({"message": "Invalid file type"}), 400

        ext = original_filename.rsplit(".", 1)[1].lower()
        unique_filename = f"{uuid4().hex}.{ext}"
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)

        avatar_file.save(save_path)
        new_avatar_url = f"/static/uploads/{unique_filename}"

    updates = []
    params = []

    if circle_name is not None and circle_name.strip():
        updates.append("name = %s")
        params.append(circle_name.strip())

    if new_avatar_url != current_avatar_url:
        updates.append("avatar_url = %s")
        params.append(new_avatar_url)

    if not updates:
        cur.close()
        conn.close()
        return jsonify({"message": "Nothing to update"}), 400

    updates.append("updated_at = now()")

    query = f"""
        UPDATE focus_circles
        SET {", ".join(updates)}
        WHERE id = %s
        RETURNING id, name, avatar_url
    """
    params.append(circle_id)

    cur.execute(query, tuple(params))
    updated = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    return jsonify({
        "message": "Circle updated",
        "circle": {
            "id": str(updated[0]),
            "name": updated[1],
            "avatar_url": updated[2]
        }
    })

@app.route("/api/circles/<circle_id>/members/<member_id>/role", methods=["PATCH"])
def update_circle_member_role(circle_id, member_id):
    data = request.get_json()
    new_role = data.get("role")

    if new_role not in ("admin", "member"):
        return jsonify({"message": "Invalid role"}), 400

    conn = get_connection()
    cur = conn.cursor()

    # проверяем, что текущий пользователь владелец
    cur.execute("""
        SELECT role
        FROM circle_members
        WHERE circle_id = %s AND user_id = %s
        LIMIT 1
    """, (circle_id, CURRENT_USER_ID))
    my_role_row = cur.fetchone()

    if not my_role_row or my_role_row[0] != "admin":
        cur.close()
        conn.close()
        return jsonify({"message": "Forbidden"}), 403

    # нельзя понизить самого себя здесь, чтобы не потерять владельца случайно
    if member_id == CURRENT_USER_ID:
        cur.close()
        conn.close()
        return jsonify({"message": "Нельзя изменить свою роль"}), 400

    cur.execute("""
        UPDATE circle_members
        SET role = %s
        WHERE circle_id = %s AND user_id = %s
        RETURNING user_id
    """, (new_role, circle_id, member_id))

    updated = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    if not updated:
        return jsonify({"message": "Member not found"}), 404

    return jsonify({"message": "Role updated"})
# =========================
# Profile
# =========================
@app.route("/api/profile", methods=["GET"])
def get_profile():
    try:
        user_row = run_query("""
            SELECT id, full_name, email, avatar_url, created_at, privacy_settings
            FROM users
            WHERE id = %s
        """, (CURRENT_USER_ID,), fetchone=True)

        today_minutes = run_query("""
            SELECT COALESCE(SUM(duration_minutes), 0)
            FROM focus_sessions
            WHERE user_id = %s
              AND completed = TRUE
              AND started_at::date = CURRENT_DATE
        """, (CURRENT_USER_ID,), fetchone=True)[0]

        week_minutes = run_query("""
            SELECT COALESCE(SUM(duration_minutes), 0)
            FROM focus_sessions
            WHERE user_id = %s
              AND completed = TRUE
              AND started_at >= now() - interval '7 days'
        """, (CURRENT_USER_ID,), fetchone=True)[0]

        achievement_rows = run_query("""
            SELECT display_name, description, icon_url, earned_at
            FROM achievements
            WHERE user_id = %s
            ORDER BY earned_at DESC
        """, (CURRENT_USER_ID,), fetchall=True)

        history_rows = run_query("""
            SELECT fs.duration_minutes, fs.started_at, g.title
            FROM focus_sessions fs
            LEFT JOIN goals g ON g.id = fs.goal_id
            WHERE fs.user_id = %s
            ORDER BY fs.started_at DESC
        """, (CURRENT_USER_ID,), fetchall=True)

        return jsonify({
            "user": {
                "id": str(user_row[0]),
                "full_name": user_row[1],
                "email": user_row[2],
                "avatar_url": user_row[3],
                "created_at": user_row[4].strftime("%d.%m.%Y"),
                "privacy_settings": user_row[5] or {}
            },
            "today_minutes": today_minutes,
            "week_minutes": week_minutes,
            "achievements": [
                {
                    "display_name": row[0],
                    "description": row[1],
                    "icon_url": row[2],
                    "earned_at": row[3].strftime("%d.%m.%Y")
                }
                for row in achievement_rows
            ],
            "history": [
                {
                    "title": row[2] if row[2] else "Без цели",
                    "duration_minutes": row[0],
                    "started_at": row[1].strftime("%d.%m.%Y %H:%M")
                }
                for row in history_rows
            ]
        })

    except OperationalError as e:
        print("DB ERROR in /api/profile:", repr(e))
        return jsonify({"message": "Database connection error", "details": str(e)}), 500

@app.route("/api/profile/update", methods=["PATCH"])
def update_profile():
    conn = get_connection()
    cur = conn.cursor()

    full_name = request.form.get("full_name")
    avatar_file = request.files.get("avatar")

    privacy_settings_raw = request.form.get("privacy_settings")
    privacy_settings = json.loads(privacy_settings_raw) if privacy_settings_raw else None

    cur.execute("""
        SELECT avatar_url, privacy_settings
        FROM users
        WHERE id = %s
    """, (CURRENT_USER_ID,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return jsonify({"message": "User not found"}), 404

    current_avatar_url = row[0]
    current_privacy_settings = row[1] or {}
    new_avatar_url = current_avatar_url

    if avatar_file and avatar_file.filename:
        original_filename = secure_filename(avatar_file.filename)

        if "." not in original_filename:
            cur.close()
            conn.close()
            return jsonify({"message": "Файл должен иметь расширение (png, jpg, jpeg, gif, webp)"}), 400

        if not allowed_file(original_filename):
            cur.close()
            conn.close()
            return jsonify({"message": "Invalid file type"}), 400

        ext = original_filename.rsplit(".", 1)[1].lower()
        unique_filename = f"{uuid4().hex}.{ext}"
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)

        avatar_file.save(save_path)
        new_avatar_url = f"/static/uploads/{unique_filename}"

    updates = []
    params = []

    if full_name is not None and full_name.strip():
        updates.append("full_name = %s")
        params.append(full_name.strip())

    if new_avatar_url != current_avatar_url:
        updates.append("avatar_url = %s")
        params.append(new_avatar_url)

    if privacy_settings is not None:
        updates.append("privacy_settings = %s::jsonb")
        params.append(json.dumps(privacy_settings))

    if not updates:
        cur.close()
        conn.close()
        return jsonify({"message": "Nothing to update"}), 400

    updates.append("updated_at = now()")

    query = f"""
        UPDATE users
        SET {", ".join(updates)}
        WHERE id = %s
        RETURNING id, full_name, avatar_url, privacy_settings
    """
    params.append(CURRENT_USER_ID)

    cur.execute(query, tuple(params))
    updated = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    return jsonify({
        "message": "Profile updated",
        "user": {
            "id": str(updated[0]),
            "full_name": updated[1],
            "avatar_url": updated[2],
            "privacy_settings": updated[3] or {}
        }
    })

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)