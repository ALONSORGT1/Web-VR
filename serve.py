"""Servidor local para Web-VR.

Uso:
    python serve.py            -> http://localhost:8080  (HTTP, valido para WebXR en localhost)
    python serve.py --https    -> https://<tu-ip>:8080   (requiere cert.pem y key.pem, ver README)
    python serve.py --port 9000
"""
import argparse
import http.server
import mimetypes
import socket
import ssl

# En Windows el registro a veces asigna text/plain a .js y los modulos ES fallan.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--https", action="store_true")
    args = parser.parse_args()

    server = http.server.ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    scheme = "http"
    if args.https:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain("cert.pem", "key.pem")
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        scheme = "https"

    print(f"Local:  {scheme}://localhost:{args.port}")
    print(f"Red:    {scheme}://{local_ip()}:{args.port}  (los lentes necesitan HTTPS para esta URL)")
    print("Ctrl+C para detener")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
