#!/usr/bin/env python3
"""Simple receiver for Atom tamagotchi debug logs."""

from __future__ import annotations

import argparse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class _Handler(BaseHTTPRequestHandler):
  def do_POST(self) -> None:
    if self.path != "/log":
      self.send_response(404)
      self.end_headers()
      self.wfile.write(b"not found")
      return

    length = int(self.headers.get("Content-Length", "0"))
    body = self.rfile.read(length)
    text = body.decode("utf-8", errors="replace")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] POST /log from {self.client_address[0]}:{self.client_address[1]}")
    print(text.rstrip("\n"))
    print("-" * 50)
    self.send_response(200)
    self.send_header("Content-Type", "text/plain; charset=utf-8")
    self.end_headers()
    self.wfile.write(b"ok")

  def do_GET(self) -> None:
    if self.path != "/" and self.path != "/health":
      self.send_response(404)
      self.end_headers()
      self.wfile.write(b"not found")
      return
    self.send_response(200)
    self.send_header("Content-Type", "text/plain; charset=utf-8")
    self.end_headers()
    self.wfile.write(b"tamagotchi-log-relay")

  def log_message(self, format: str, *args: Any) -> None:
    return


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--host", default="0.0.0.0", help="bind host (default: 0.0.0.0)")
  parser.add_argument("--port", type=int, default=8081, help="bind port (default: 8081)")
  args = parser.parse_args()

  server = ThreadingHTTPServer((args.host, args.port), _Handler)
  print(f"log relay server started: http://{args.host}:{args.port}/")
  print("send device logs to POST /log")
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()
    print("log relay server stopped")


if __name__ == "__main__":
  main()

