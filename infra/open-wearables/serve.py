import os
import socket
import uvicorn
from app.main import api


@api.middleware("http")
async def log_aevum_user_create(request, call_next):
    # Keep this narrowly scoped and never read a body: FastAPI's downstream parser must own
    # the request stream. This only records transport metadata without data or credentials.
    if request.method == "POST" and request.url.path == "/api/v1/users":
        print(
            "Aevum user-create request "
            f"content-type={request.headers.get('content-type', '')} "
            f"content-length={request.headers.get('content-length', '')}",
            flush=True,
        )
    return await call_next(request)

with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as listener:
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    listener.bind(("::", int(os.getenv("PORT", "8000"))))
    listener.listen(128)
    uvicorn.run(api, fd=listener.fileno(), access_log=False)
