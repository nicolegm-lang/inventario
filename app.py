from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, date, timedelta
from functools import wraps
from pathlib import Path
from typing import Any

from flask import (
    Flask,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DATABASE_PATH", BASE_DIR / "lab_inventory.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "cambia-esta-clave-en-produccion")


# -----------------------------
# Base de datos
# -----------------------------
def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception: Exception | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'usuario')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT,
            description TEXT,
            quantity REAL NOT NULL DEFAULT 0,
            unit TEXT NOT NULL DEFAULT 'pieza',
            location TEXT,
            batch TEXT,
            expiration_date TEXT,
            minimum_stock REAL NOT NULL DEFAULT 0,
            provider TEXT,
            status TEXT NOT NULL DEFAULT 'Disponible',
            created_by INTEGER,
            updated_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(created_by) REFERENCES users(id),
            FOREIGN KEY(updated_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            movement_type TEXT NOT NULL CHECK(movement_type IN ('alta', 'entrada', 'salida', 'ajuste', 'edicion', 'baja')),
            quantity REAL,
            previous_quantity REAL,
            new_quantity REAL,
            reason TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(item_id) REFERENCES items(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    user_count = db.execute("SELECT COUNT(*) AS total FROM users").fetchone()["total"]
    if user_count == 0:
        timestamp = now_iso()
        db.execute(
            """
            INSERT INTO users (name, email, password_hash, role, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "Administrador",
                "admin@laboratorio.local",
                generate_password_hash("admin123"),
                "admin",
                1,
                timestamp,
                timestamp,
            ),
        )
        print("Usuario administrador creado:")
        print("  Correo: admin@laboratorio.local")
        print("  Contraseña: admin123")
        print("Cambia esta contraseña después del primer inicio de sesión.")

    db.commit()
    db.close()




def ensure_database_exists() -> None:
    """Inicializa la base de datos si no existe.

    Esto permite que la app funcione tanto ejecutándola con `python app.py`
    como en despliegues de producción con Gunicorn/WSGI.
    """
    if not DB_PATH.exists():
        init_db()


ensure_database_exists()

# -----------------------------
# Seguridad / sesión
# -----------------------------
def current_user() -> sqlite3.Row | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


@app.before_request
def load_logged_in_user() -> None:
    g.user = current_user()


def login_required(view):
    @wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for("login"))
        if not g.user["active"]:
            session.clear()
            flash("Tu cuenta está desactivada. Contacta al administrador.", "error")
            return redirect(url_for("login"))
        return view(**kwargs)

    return wrapped_view


def admin_required(view):
    @wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for("login"))
        if g.user["role"] != "admin":
            flash("No tienes permiso para administrar cuentas.", "error")
            return redirect(url_for("index"))
        return view(**kwargs)

    return wrapped_view


# -----------------------------
# Helpers
# -----------------------------
def parse_float(value: str | None, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except ValueError:
        raise ValueError("Cantidad inválida")


def expiration_badge(expiration_date: str | None) -> str:
    if not expiration_date:
        return ""
    try:
        exp = date.fromisoformat(expiration_date)
    except ValueError:
        return ""
    today = date.today()
    if exp < today:
        return "Caducado"
    if exp <= today + timedelta(days=30):
        return "Por caducar"
    return ""


app.jinja_env.globals["expiration_badge"] = expiration_badge


def register_movement(
    item_id: int,
    user_id: int,
    movement_type: str,
    quantity: float | None,
    previous_quantity: float | None,
    new_quantity: float | None,
    reason: str | None = None,
    notes: str | None = None,
) -> None:
    get_db().execute(
        """
        INSERT INTO movements
        (item_id, user_id, movement_type, quantity, previous_quantity, new_quantity, reason, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (item_id, user_id, movement_type, quantity, previous_quantity, new_quantity, reason, notes, now_iso()),
    )


# -----------------------------
# Autenticación
# -----------------------------
@app.route("/login", methods=("GET", "POST"))
def login():
    if request.method == "POST":
        email = request.form["email"].strip().lower()
        password = request.form["password"]
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

        if user is None or not check_password_hash(user["password_hash"], password):
            flash("Correo o contraseña incorrectos.", "error")
        elif not user["active"]:
            flash("Tu cuenta está desactivada. Contacta al administrador.", "error")
        else:
            session.clear()
            session["user_id"] = user["id"]
            return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# -----------------------------
# Inventario
# -----------------------------
@app.route("/")
@login_required
def index():
    q = request.args.get("q", "").strip()
    db = get_db()

    params: list[Any] = []
    where = ""
    if q:
        where = """
        WHERE name LIKE ? OR category LIKE ? OR location LIKE ? OR batch LIKE ? OR provider LIKE ? OR status LIKE ?
        """
        like = f"%{q}%"
        params = [like, like, like, like, like, like]

    items = db.execute(
        f"""
        SELECT * FROM items
        {where}
        ORDER BY name COLLATE NOCASE ASC
        """,
        params,
    ).fetchall()

    low_stock_count = db.execute(
        "SELECT COUNT(*) AS total FROM items WHERE quantity <= minimum_stock AND status != 'Baja'"
    ).fetchone()["total"]

    return render_template("index.html", items=items, q=q, low_stock_count=low_stock_count)


@app.route("/items/new", methods=("GET", "POST"))
@login_required
def new_item():
    if request.method == "POST":
        try:
            quantity = parse_float(request.form.get("quantity"), 0.0)
            minimum_stock = parse_float(request.form.get("minimum_stock"), 0.0)
        except ValueError as exc:
            flash(str(exc), "error")
            return render_template("item_form.html", item=None)

        timestamp = now_iso()
        db = get_db()
        cursor = db.execute(
            """
            INSERT INTO items
            (name, category, description, quantity, unit, location, batch, expiration_date,
             minimum_stock, provider, status, created_by, updated_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request.form["name"].strip(),
                request.form.get("category", "").strip(),
                request.form.get("description", "").strip(),
                quantity,
                request.form.get("unit", "pieza").strip() or "pieza",
                request.form.get("location", "").strip(),
                request.form.get("batch", "").strip(),
                request.form.get("expiration_date") or None,
                minimum_stock,
                request.form.get("provider", "").strip(),
                request.form.get("status", "Disponible"),
                g.user["id"],
                g.user["id"],
                timestamp,
                timestamp,
            ),
        )
        item_id = cursor.lastrowid
        register_movement(item_id, g.user["id"], "alta", quantity, 0, quantity, "Alta inicial", None)
        db.commit()
        flash("Producto agregado al inventario.", "success")
        return redirect(url_for("item_detail", item_id=item_id))

    return render_template("item_form.html", item=None)


@app.route("/items/<int:item_id>")
@login_required
def item_detail(item_id: int):
    db = get_db()
    item = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if item is None:
        flash("Producto no encontrado.", "error")
        return redirect(url_for("index"))

    movements = db.execute(
        """
        SELECT m.*, u.name AS user_name
        FROM movements m
        JOIN users u ON u.id = m.user_id
        WHERE m.item_id = ?
        ORDER BY m.created_at DESC, m.id DESC
        """,
        (item_id,),
    ).fetchall()
    return render_template("item_detail.html", item=item, movements=movements)


@app.route("/items/<int:item_id>/edit", methods=("GET", "POST"))
@login_required
def edit_item(item_id: int):
    db = get_db()
    item = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if item is None:
        flash("Producto no encontrado.", "error")
        return redirect(url_for("index"))

    if request.method == "POST":
        try:
            minimum_stock = parse_float(request.form.get("minimum_stock"), 0.0)
        except ValueError as exc:
            flash(str(exc), "error")
            return render_template("item_form.html", item=item)

        db.execute(
            """
            UPDATE items SET
                name = ?, category = ?, description = ?, unit = ?, location = ?, batch = ?,
                expiration_date = ?, minimum_stock = ?, provider = ?, status = ?,
                updated_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                request.form["name"].strip(),
                request.form.get("category", "").strip(),
                request.form.get("description", "").strip(),
                request.form.get("unit", "pieza").strip() or "pieza",
                request.form.get("location", "").strip(),
                request.form.get("batch", "").strip(),
                request.form.get("expiration_date") or None,
                minimum_stock,
                request.form.get("provider", "").strip(),
                request.form.get("status", "Disponible"),
                g.user["id"],
                now_iso(),
                item_id,
            ),
        )
        register_movement(item_id, g.user["id"], "edicion", None, item["quantity"], item["quantity"], "Edición de ficha", None)
        db.commit()
        flash("Ficha actualizada.", "success")
        return redirect(url_for("item_detail", item_id=item_id))

    return render_template("item_form.html", item=item)


@app.route("/items/<int:item_id>/movement", methods=("POST",))
@login_required
def add_movement(item_id: int):
    db = get_db()
    item = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if item is None:
        flash("Producto no encontrado.", "error")
        return redirect(url_for("index"))

    movement_type = request.form.get("movement_type")
    reason = request.form.get("reason", "").strip()
    notes = request.form.get("notes", "").strip()

    try:
        quantity = parse_float(request.form.get("quantity"), 0.0)
    except ValueError as exc:
        flash(str(exc), "error")
        return redirect(url_for("item_detail", item_id=item_id))

    previous_quantity = float(item["quantity"])

    if movement_type == "entrada":
        new_quantity = previous_quantity + quantity
    elif movement_type == "salida":
        new_quantity = previous_quantity - quantity
        if new_quantity < 0:
            flash("No se puede registrar una salida mayor a la cantidad disponible.", "error")
            return redirect(url_for("item_detail", item_id=item_id))
    elif movement_type == "ajuste":
        new_quantity = quantity
    elif movement_type == "baja":
        new_quantity = previous_quantity
    else:
        flash("Tipo de movimiento no válido.", "error")
        return redirect(url_for("item_detail", item_id=item_id))

    status = "Baja" if movement_type == "baja" else item["status"]
    db.execute(
        """
        UPDATE items
        SET quantity = ?, status = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        """,
        (new_quantity, status, g.user["id"], now_iso(), item_id),
    )
    register_movement(
        item_id,
        g.user["id"],
        movement_type,
        quantity,
        previous_quantity,
        new_quantity,
        reason,
        notes,
    )
    db.commit()
    flash("Movimiento registrado.", "success")
    return redirect(url_for("item_detail", item_id=item_id))


@app.route("/movements")
@login_required
def movements():
    db = get_db()
    rows = db.execute(
        """
        SELECT m.*, i.name AS item_name, i.unit AS unit, u.name AS user_name
        FROM movements m
        JOIN items i ON i.id = m.item_id
        JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 300
        """
    ).fetchall()
    return render_template("movements.html", movements=rows)


# -----------------------------
# Usuarios
# -----------------------------
@app.route("/users")
@admin_required
def users():
    rows = get_db().execute("SELECT * FROM users ORDER BY name COLLATE NOCASE ASC").fetchall()
    return render_template("users.html", users=rows)


@app.route("/users/new", methods=("GET", "POST"))
@admin_required
def new_user():
    if request.method == "POST":
        name = request.form["name"].strip()
        email = request.form["email"].strip().lower()
        password = request.form["password"]
        role = request.form.get("role", "usuario")

        if role not in ("admin", "usuario"):
            role = "usuario"
        if len(password) < 6:
            flash("La contraseña debe tener al menos 6 caracteres.", "error")
            return render_template("user_form.html")

        try:
            get_db().execute(
                """
                INSERT INTO users (name, email, password_hash, role, active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (name, email, generate_password_hash(password), role, now_iso(), now_iso()),
            )
            get_db().commit()
        except sqlite3.IntegrityError:
            flash("Ya existe una cuenta con ese correo.", "error")
            return render_template("user_form.html")

        flash("Cuenta creada.", "success")
        return redirect(url_for("users"))

    return render_template("user_form.html")


@app.route("/users/<int:user_id>/toggle", methods=("POST",))
@admin_required
def toggle_user(user_id: int):
    if user_id == g.user["id"]:
        flash("No puedes desactivar tu propia cuenta.", "error")
        return redirect(url_for("users"))

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        flash("Usuario no encontrado.", "error")
        return redirect(url_for("users"))

    new_state = 0 if user["active"] else 1
    db.execute("UPDATE users SET active = ?, updated_at = ? WHERE id = ?", (new_state, now_iso(), user_id))
    db.commit()
    flash("Estado de cuenta actualizado.", "success")
    return redirect(url_for("users"))


@app.route("/users/<int:user_id>/role", methods=("POST",))
@admin_required
def change_role(user_id: int):
    role = request.form.get("role")
    if role not in ("admin", "usuario"):
        flash("Rol no válido.", "error")
        return redirect(url_for("users"))

    get_db().execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", (role, now_iso(), user_id))
    get_db().commit()
    flash("Rol actualizado.", "success")
    return redirect(url_for("users"))



@app.route("/profile/password", methods=("GET", "POST"))
@login_required
def change_password():
    if request.method == "POST":
        current_password = request.form["current_password"]
        new_password = request.form["new_password"]
        confirm_password = request.form["confirm_password"]

        if not check_password_hash(g.user["password_hash"], current_password):
            flash("La contraseña actual no es correcta.", "error")
            return render_template("password_form.html")
        if len(new_password) < 6:
            flash("La nueva contraseña debe tener al menos 6 caracteres.", "error")
            return render_template("password_form.html")
        if new_password != confirm_password:
            flash("La confirmación no coincide con la nueva contraseña.", "error")
            return render_template("password_form.html")

        get_db().execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (generate_password_hash(new_password), now_iso(), g.user["id"]),
        )
        get_db().commit()
        flash("Contraseña actualizada.", "success")
        return redirect(url_for("index"))

    return render_template("password_form.html")


# -----------------------------
# API para detectar cambios
# -----------------------------
@app.route("/api/version")
@login_required
def api_version():
    db = get_db()
    item_version = db.execute("SELECT COALESCE(MAX(updated_at), '') AS v FROM items").fetchone()["v"]
    movement_version = db.execute("SELECT COALESCE(MAX(created_at), '') AS v FROM movements").fetchone()["v"]
    return jsonify({"version": max(item_version, movement_version)})


# -----------------------------
# Comando de inicialización
# -----------------------------
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "initdb":
        init_db()
        sys.exit(0)

    if not DB_PATH.exists():
        init_db()

    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
