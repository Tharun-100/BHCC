from __future__ import annotations

import json
import logging
import os
import socket
import ssl
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

class PaytmPosError(RuntimeError):
    pass


def _paytm_checksum_class():
    """Load Paytm's checksum helper without breaking the whole API at import time."""
    try:
        from paytmchecksum import PaytmChecksum
    except ImportError as exc:
        raise PaytmPosError(
            "Automatic Paytm POS cryptography support is unavailable on the backend. "
            "Redeploy the backend with the Paytm checksum dependencies installed."
        ) from exc
    return PaytmChecksum


def _settings() -> dict[str, str]:
    values = {
        "mid": os.getenv("PAYTM_POS_MID", "").strip(),
        "key": os.getenv("PAYTM_POS_MERCHANT_KEY", "").strip(),
        "channel": os.getenv("PAYTM_POS_CHANNEL_ID", "").strip(),
        "tid": os.getenv("PAYTM_POS_TERMINAL_ID", "").strip(),
        "environment": os.getenv("PAYTM_POS_ENV", "production").strip().lower(),
    }
    if os.getenv("PAYTM_POS_ENABLED", "false").strip().lower() not in {"1", "true", "yes"}:
        raise PaytmPosError("Automatic Paytm POS is disabled. Use manual receipt entry.")
    missing = [name for name in ("mid", "key", "channel", "tid") if not values[name]]
    if missing:
        names = {"mid": "PAYTM_POS_MID", "key": "PAYTM_POS_MERCHANT_KEY", "channel": "PAYTM_POS_CHANNEL_ID", "tid": "PAYTM_POS_TERMINAL_ID"}
        raise PaytmPosError("Automatic Paytm POS configuration is incomplete. Missing: " + ", ".join(names[name] for name in missing))
    if values["environment"] not in {"production", "staging"}:
        raise PaytmPosError("PAYTM_POS_ENV must be production or staging.")
    return values


def api_host(environment: str) -> str:
    return "https://securegw-stage.paytm.in" if environment == "staging" else "https://securegw.paytm.in"


def result_info(payload: dict[str, Any]) -> tuple[str, str]:
    body = payload.get("body")
    body = body if isinstance(body, dict) else {}
    info = body.get("resultInfo")
    info = info if isinstance(info, dict) else body
    code = str(info.get("resultCode") or "").upper()
    value = str(info.get("resultStatus") or info.get("status") or "").upper()
    known = {"SUCCESS", "ACCEPTED_SUCCESS", "PENDING", "FAIL", "FAILED", "FAILURE"}
    # Paytm uses both short statuses and full result codes in its ECR responses.
    normalized = code if code in known else {"A": "ACCEPTED_SUCCESS", "S": "SUCCESS", "F": "FAIL", "U": "PENDING"}.get(value, value)
    hints = {
        "0330": "Check the POS merchant key and checksum configuration.",
        "0007": "Ask Paytm to check terminal activation; keep the machine online and awake.",
        "0333": "Resolve the pending request on the terminal before starting another payment.",
        "0002": "Check the terminal ID, channel ID and payment request fields.",
        "9001": "Ask Paytm to verify wireless ECR enablement and the MID/channel/terminal mapping.",
        "0233": "This transaction ID already exists; check its payment status before retrying.",
        "0404": "Paytm could not find this transaction; verify the original transaction ID and date.",
    }
    error_code = str(info.get("resultCodeId") or (code if code.isdigit() else ""))
    message = str(info.get("resultMsg") or "")
    if normalized in {"FAIL", "FAILED", "FAILURE"}:
        if error_code:
            message = f"Paytm POS error {error_code}. {message}"
        if error_code in hints:
            message += " " + hints[error_code]
    return normalized, message.strip()


def connection_error(reason: BaseException) -> str:
    if isinstance(reason, socket.gaierror):
        return "Backend DNS could not resolve the Paytm POS API hostname. Check server DNS."
    if isinstance(reason, ssl.SSLError):
        return "Backend TLS verification failed when connecting to Paytm POS. Check the server clock and trusted certificates."
    if isinstance(reason, TimeoutError):
        return "The Paytm POS request timed out. Check payment status before retrying; the machine may have received it."
    return "The backend server could not connect to Paytm's POS API. Check outbound HTTPS access, firewall and proxy settings."


def _post(path: str, body: dict[str, Any], timestamp: str) -> dict[str, Any]:
    config = _settings()
    PaytmChecksum = _paytm_checksum_class()
    checksum = PaytmChecksum.generateSignature(json.dumps(body, separators=(",", ":")), config["key"])
    payload = {"head": {"requestTimeStamp": timestamp, "channelId": config["channel"], "checksum": checksum, "version": "3.1"}, "body": body}
    host = api_host(config["environment"])
    request = urllib.request.Request(host + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw_response = response.read().decode(errors="replace")
    except urllib.error.HTTPError as exc:
        raw_response = exc.read().decode(errors="replace")
        try:
            result = json.loads(raw_response)
        except json.JSONDecodeError:
            logger.warning("Paytm POS returned non-JSON HTTP response status=%s path=%s", exc.code, path)
            raise PaytmPosError(f"Paytm POS returned HTTP {exc.code}. Check the Paytm configuration or contact Paytm support.") from exc
        if not isinstance(result, dict):
            raise PaytmPosError(f"Paytm POS returned HTTP {exc.code} with an invalid response.") from exc
        return result
    except (urllib.error.URLError, TimeoutError) as exc:
        reason = getattr(exc, "reason", exc)
        logger.warning("Paytm POS network request failed path=%s error_type=%s", path, type(reason).__name__)
        raise PaytmPosError(connection_error(reason)) from exc
    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise PaytmPosError("Paytm POS returned a non-JSON response. Please retry or contact Paytm support.") from exc
    if not isinstance(result, dict):
        raise PaytmPosError("Paytm POS returned an invalid response.")
    return result


def initiate_sale(*, transaction_id: str, amount_rupees: int, reference: str) -> dict[str, Any]:
    config = _settings(); timestamp = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")
    body = {"paytmMid": config["mid"], "paytmTid": config["tid"], "transactionDateTime": timestamp, "merchantTransactionId": transaction_id, "merchantReferenceNo": reference[:32], "transactionAmount": str(amount_rupees * 100), "merchantExtendedInfo": {"PaymentMode": "ALL"}}
    result = _post("/ecr/payment/request", body, timestamp)
    return {"request": {"transactionId": transaction_id, "transactionDateTime": timestamp, "amountPaise": amount_rupees * 100}, "response": result}


def enquire_status(*, transaction_id: str, transaction_datetime: str) -> dict[str, Any]:
    config = _settings(); timestamp = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")
    body = {"paytmMid": config["mid"], "paytmTid": config["tid"], "transactionDateTime": transaction_datetime, "merchantTransactionId": transaction_id}
    return _post("/ecr/V2/payment/status", body, timestamp)
