FROM python:3.12-slim

WORKDIR /app

# Create data directories
RUN mkdir -p data/cache

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Use uvicorn with PORT from environment
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
