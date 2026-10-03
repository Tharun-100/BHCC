from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

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
        raise PaytmPosError("Automatic Paytm POS configuration is incomplete.")
    return values


def _post(path: str, body: dict[str, Any], timestamp: str) -> dict[str, Any]:
    config = _settings()
    PaytmChecksum = _paytm_checksum_class()
    checksum = PaytmChecksum.generateSignature(json.dumps(body, separators=(",", ":")), config["key"])
    payload = {"head": {"requestTimeStamp": timestamp, "channelId": config["channel"], "checksum": checksum, "version": "3.1"}, "body": body}
    host = "https://securegw-stage.paytm.in" if config["environment"] == "staging" else "https://securegw.paytm.in"
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
        raise PaytmPosError(
            "The backend server could not connect to Paytm's POS API. "
            "Check server DNS, outbound HTTPS access, firewall rules, and retry."
        ) from exc
    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise PaytmPosError("Paytm POS returned a non-JSON response. Please retry or contact Paytm support.") from exc
    if not isinstance(result, dict):
        raise PaytmPosError("Paytm POS returned an invalid response.")
    return result


def initiate_sale(*, transaction_id: str, amount_rupees: int, reference: str) -> dict[str, Any]:
    config = _settings(); timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    body = {"paytmMid": config["mid"], "paytmTid": config["tid"], "transactionDateTime": timestamp, "merchantTransactionId": transaction_id, "merchantReferenceNo": reference[:32], "transactionAmount": str(amount_rupees * 100), "merchantExtendedInfo": {"PaymentMode": "ALL"}}
    result = _post("/ecr/payment/request", body, timestamp)
    return {"request": {"transactionId": transaction_id, "transactionDateTime": timestamp, "amountPaise": amount_rupees * 100}, "response": result}


def enquire_status(*, transaction_id: str, transaction_datetime: str) -> dict[str, Any]:
    config = _settings(); timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    body = {"paytmMid": config["mid"], "paytmTid": config["tid"], "transactionDateTime": transaction_datetime, "merchantTransactionId": transaction_id}
    return _post("/ecr/V2/payment/status", body, timestamp)
