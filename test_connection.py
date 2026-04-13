from db import get_connection

try:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT 1;")
    result = cur.fetchone()

    print("✅ Подключение успешно:", result)

    cur.close()
    conn.close()

except Exception as e:
    print("❌ Ошибка подключения:", e)