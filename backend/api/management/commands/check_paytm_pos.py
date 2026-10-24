import socket
import ssl
from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError

from api.paytm_pos import PaytmPosError, _paytm_checksum_class, _settings, api_host, connection_error


class Command(BaseCommand):
    help = "Check POS configuration and optional DNS/TLS connectivity without creating a payment."

    def add_arguments(self, parser):
        parser.add_argument("--network", action="store_true", help="Test a TLS connection to the configured Paytm host on port 443.")

    def handle(self, *args, **options):
        try:
            config = _settings()
            checksum = _paytm_checksum_class()
            # Local round-trip only; neither credentials nor signatures are printed.
            body = '{"diagnostic":true}'
            signature = checksum.generateSignature(body, config["key"])
            if not checksum.verifySignature(body, config["key"], signature):
                raise PaytmPosError("Local checksum verification failed.")
        except PaytmPosError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError("Local POS checksum generation failed. Check merchant key format and installed cryptography dependencies.") from exc
        host = urlsplit(api_host(config["environment"])).hostname
        self.stdout.write(f"Configuration and local checksum: OK. Environment: {config['environment']}. Host: {host}")
        if options["network"]:
            try:
                with socket.create_connection((host, 443), timeout=10) as connection:
                    with ssl.create_default_context().wrap_socket(connection, server_hostname=host):
                        pass
            except OSError as exc:
                raise CommandError(connection_error(exc)) from exc
            self.stdout.write("DNS, TCP 443 and TLS: OK. No payment request was sent.")
        self.stdout.write("This does not verify Paytm merchant activation, credentials accepted by Paytm, or terminal connectivity.")
