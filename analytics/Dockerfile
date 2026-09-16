FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --uid 10001 aevum
COPY *.py ./
USER aevum
EXPOSE 8090
CMD ["python", "serve.py"]
