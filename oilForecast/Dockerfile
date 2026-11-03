FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app app
COPY static static
RUN useradd --create-home oil && mkdir /data && chown oil:oil /data
USER oil
ENV OIL_DB_PATH=/data/oil.sqlite3
EXPOSE 8787
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787"]
