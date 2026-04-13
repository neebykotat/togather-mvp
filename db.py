import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode="require",
        connect_timeout=10,
        application_name="togather_flask",
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    conn.autocommit = True
    return conn


def run_query(query, params=None, fetchone=False, fetchall=False):
    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(query, params or ())

        if fetchone:
            return cur.fetchone()
        if fetchall:
            return cur.fetchall()
        return None

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()