import os
import platform
from dotenv import load_dotenv


def main():
    load_dotenv()
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required to run RQ worker.")

    from redis import Redis
    from rq import Queue, SimpleWorker, Worker

    redis_conn = Redis.from_url(redis_url)
    queue = Queue("video-pipeline", connection=redis_conn)
    worker_cls = SimpleWorker if platform.system().lower().startswith("win") else Worker
    worker = worker_cls([queue], connection=redis_conn)
    worker.work()


if __name__ == "__main__":
    main()
