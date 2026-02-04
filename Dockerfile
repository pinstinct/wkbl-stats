FROM python:3.12-slim

WORKDIR /app

# Create data directories
RUN mkdir -p data/cache

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway provides PORT env var
EXPOSE ${PORT:-8000}

CMD ["python", "server.py"]
