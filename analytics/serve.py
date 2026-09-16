"""Container entrypoint with a single IPv4/IPv6 listener for Railway."""

import os
import socket

import uvicorn


if __name__ == "__main__":
    with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        listener.bind(("::", int(os.environ.get("PORT", "8090"))))
        listener.listen(128)
        uvicorn.run("main:app", fd=listener.fileno(), access_log=False)
