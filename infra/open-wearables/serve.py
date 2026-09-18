import os
import socket
import uvicorn

with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as listener:
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    listener.bind(("::", int(os.getenv("PORT", "8000"))))
    listener.listen(128)
    uvicorn.run("app.main:api", fd=listener.fileno(), access_log=False)
