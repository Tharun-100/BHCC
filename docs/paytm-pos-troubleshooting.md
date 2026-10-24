# Paytm wireless POS troubleshooting

The counter sends a payment request to Django, Django calls Paytm's ECR Sale
API, and Paytm routes it to the configured terminal. The QR appears on the
terminal. An accepted request is not a completed payment.

## Run diagnostics on the deployed backend

In Coolify, open the **backend container terminal**, then run:

```sh
python manage.py check_paytm_pos --network
```

This checks configuration, local checksum generation, DNS, outbound port 443,
and TLS. It does not send a payment, print credentials, or prove Paytm accepts
the merchant credentials or that the terminal is online. Running it on a local
computer does not check the production server's network or configuration.

Required variables: `PAYTM_POS_ENABLED=true`, `PAYTM_POS_ENV=production` (or
`staging`), `PAYTM_POS_MID`, `PAYTM_POS_MERCHANT_KEY`,
`PAYTM_POS_CHANNEL_ID`, and `PAYTM_POS_TERMINAL_ID`. All credentials must belong
to the same environment and the configured terminal. Paytm supplies the channel
ID; do not substitute a guessed value. Restart/redeploy after environment changes.

## Interpret the result

| Result | Next step |
| --- | --- |
| Disabled or missing variable | Set the named variable in the backend environment. |
| Local checksum failure | Check key format and checksum/cryptography installation. This is not remote authentication. |
| DNS failure | Check DNS from the backend container. |
| TLS failure | Check trusted certificates and the server clock; keep TLS verification enabled. |
| Timeout or connection failure | Check backend outbound HTTPS/firewall/proxy. Check transaction status before retrying an uncertain payment. |
| Paytm `0330` | Verify POS merchant key/checksum and environment with Paytm. |
| Paytm `0007` | Verify terminal activation; keep the machine online and awake. |
| Paytm `0333` | Resolve the terminal's pending request before starting another. |
| Paytm `9001` | Ask Paytm to verify wireless ECR enablement and MID/channel/terminal mapping. |
| Accepted but no QR | Check the POS acceptance prompt, terminal internet and enabled payment modes with Paytm. |

The Sale API can return `resultStatus=A` with `resultCode=ACCEPTED_SUCCESS`.
Status enquiry can return `S` / `SUCCESS`, `F` / failure, and `U` / pending.
The integration normalizes these forms. Successful status must include the exact
appointment amount in paise before payment is confirmed.

The deployed error text and corresponding backend log are still required to
identify the clinic's actual failure. Share only sanitized errors, codes and
diagnostic output, never merchant keys or patient information.

References:
- https://www.paytmpayments.com/docs/api/pos-sale-api
- https://www.paytmpayments.com/docs/api/pos-status-enquiry-api
- https://www.paytmpayments.com/docs/pos-wireless-connection-prerequisite
