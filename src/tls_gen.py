"""Makes the HTTPS certificates for Kookaburrow (Settings > System > Certificate): a private certificate authority (CA) and a server
certificate signed by it that names the addresses people browse to. Run by src/tls.js with the bundled Python (it has `cryptography`).
Input on stdin (JSON): { "names": ["host.example", "192.168.1.5"], "days": 825, "ca_cert": "<pem>", "ca_key": "<pem>" }
  ca_cert / ca_key are given to re-issue the server certificate under the existing CA (so machines that already trust the CA keep working);
  when they are left out a new CA is made.
Output on stdout (JSON): { "ca_cert", "ca_key", "server_cert", "server_key" } as PEM text.
"""
import datetime
import ipaddress
import json
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

req = json.load(sys.stdin)
now = datetime.datetime.now(datetime.timezone.utc)
days = int(req.get("days") or 825)


def pem_key(k):
    return k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()


def pem_cert(c):
    return c.public_bytes(serialization.Encoding.PEM).decode()


if req.get("ca_cert") and req.get("ca_key"):
    ca_cert = x509.load_pem_x509_certificate(req["ca_cert"].encode())
    ca_key = serialization.load_pem_private_key(req["ca_key"].encode(), password=None)
else:
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Kookaburrow"), x509.NameAttribute(NameOID.COMMON_NAME, "Kookaburrow Local CA")])
    ca_cert = (
        x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=5)).not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=True, crl_sign=True, content_commitment=False, key_encipherment=False,
                                     data_encipherment=False, key_agreement=False, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )

names = []
for n in ["localhost", "127.0.0.1", "::1"] + list(req.get("names") or []):
    if n not in names:
        names.append(n)
san = []
for n in names:
    try:
        san.append(x509.IPAddress(ipaddress.ip_address(n)))
    except ValueError:
        san.append(x509.DNSName(n))
first_dns = next((n for n in names if not n.replace(".", "").isdigit() and ":" not in n), "Kookaburrow")

server_key = ec.generate_private_key(ec.SECP256R1())
server_cert = (
    x509.CertificateBuilder()
    .subject_name(x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Kookaburrow"), x509.NameAttribute(NameOID.COMMON_NAME, first_dns)]))
    .issuer_name(ca_cert.subject).public_key(server_key.public_key()).serial_number(x509.random_serial_number())
    .not_valid_before(now - datetime.timedelta(minutes=5)).not_valid_after(now + datetime.timedelta(days=days))
    .add_extension(x509.SubjectAlternativeName(san), critical=False)
    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
    .add_extension(x509.KeyUsage(digital_signature=True, key_agreement=True, key_cert_sign=False, crl_sign=False, content_commitment=False,
                                 key_encipherment=False, data_encipherment=False, encipher_only=False, decipher_only=False), critical=True)
    .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
    .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_cert.public_key()), critical=False)
    .sign(ca_key, hashes.SHA256())
)

json.dump({"ca_cert": pem_cert(ca_cert), "ca_key": pem_key(ca_key), "server_cert": pem_cert(server_cert), "server_key": pem_key(server_key)}, sys.stdout)
