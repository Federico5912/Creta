import os
import sys
from pathlib import Path
from datetime import date, timedelta

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def _get_first_service_id(client):
    res = client.get("/api/services")
    assert res.status_code == 200
    data = res.get_json()
    assert "services" in data
    assert len(data["services"]) > 0
    return data["services"][0]["id"]


def _future_date(days=3):
    return (date.today() + timedelta(days=days)).isoformat()


def _find_available_slot(client, service_id, start_days=3, end_days=45):
    """
    Busca un día futuro con al menos un horario disponible
    y devuelve (fecha, hora).
    """
    for days in range(start_days, end_days + 1):
        target_date = _future_date(days)
        res = client.get(
            f"/api/availability?service_id={service_id}&date={target_date}"
        )
        if res.status_code != 200:
            continue

        data = res.get_json()
        slots = data.get("available_slots", [])
        if slots:
            return target_date, slots[0]

    pytest.fail("No se encontró ningún horario disponible para testear.")


def _valid_payload(client, name="Juan Pérez", phone="099123456", email="juan@test.com"):
    service_id = _get_first_service_id(client)
    target_date, target_time = _find_available_slot(client, service_id)

    return {
        "name": name,
        "phone": phone,
        "email": email,
        "service_id": service_id,
        "date": target_date,
        "time": target_time,
        "notes": "Test automático",
    }


def _admin_pin():
    return os.getenv("ADMIN_PIN", "0000")


def test_services(client):
    res = client.get("/api/services")
    assert res.status_code == 200
    data = res.get_json()
    assert "services" in data
    assert isinstance(data["services"], list)
    assert len(data["services"]) > 0


def test_availability_missing_params(client):
    res = client.get("/api/availability")
    assert res.status_code == 400


def test_appointment_invalid_json(client):
    res = client.post("/api/appointment", json={})
    assert res.status_code == 400


def test_appointment_missing_fields(client):
    res = client.post("/api/appointment", json={"name": "Juan"})
    assert res.status_code == 422
    data = res.get_json()
    assert "error" in data


def test_appointment_invalid_phone(client):
    payload = _valid_payload(client)
    payload["phone"] = "abc"

    res = client.post("/api/appointment", json=payload)
    assert res.status_code == 422


def test_create_appointment_success(client):
    payload = _valid_payload(
        client,
        name="Turno Exitoso",
        email="turno_exitoso@test.com",
    )

    res = client.post("/api/appointment", json=payload)
    assert res.status_code == 201
    data = res.get_json()
    assert "message" in data


def test_create_appointment_conflict_same_slot(client):
    payload = _valid_payload(
        client,
        name="Conflicto Test",
        email="conflicto@test.com",
    )

    first = client.post("/api/appointment", json=payload)
    assert first.status_code == 201

    second = client.post("/api/appointment", json=payload)
    assert second.status_code == 409


def test_admin_login_invalid_pin(client):
    res = client.post("/api/admin/login", json={"pin": "9999"})
    assert res.status_code == 401


def test_admin_login_and_stats(client):
    res = client.post("/api/admin/login", json={"pin": _admin_pin()})
    assert res.status_code == 200

    stats = client.get("/api/admin/stats")
    assert stats.status_code == 200
    data = stats.get_json()
    assert "today" in data
    assert "pending_today" in data
    assert "confirmed_today" in data
    assert "pending_all" in data


def test_blocked_day_crud(client):
    login = client.post("/api/admin/login", json={"pin": _admin_pin()})
    assert login.status_code == 200

    target_date = _future_date(60)

    create = client.post(
        "/api/admin/blocked-days",
        json={"date": target_date, "reason": "Feriado test"},
    )
    assert create.status_code == 201
    created = create.get_json()
    assert "blocked_day" in created
    blocked_id = created["blocked_day"]["id"]

    listed = client.get("/api/admin/blocked-days")
    assert listed.status_code == 200
    listed_data = listed.get_json()
    assert "blocked_days" in listed_data
    assert any(d["id"] == blocked_id for d in listed_data["blocked_days"])

    delete = client.delete(f"/api/admin/blocked-days/{blocked_id}")
    assert delete.status_code == 200