FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY app.py .
COPY static/ static/

RUN mkdir -p data

EXPOSE 24175

ENV TODO_PORT=24175
ENV TODO_SECRET_KEY=""

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:24175", "app:app"]
