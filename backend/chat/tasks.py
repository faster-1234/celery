from celery import shared_task
import time


@shared_task
def test_task():

    print("TASK STARTED")

    time.sleep(5)

    print("TASK FINISHED")

    return "Task completed successfully"