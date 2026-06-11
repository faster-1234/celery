import time
from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


@shared_task
def test_task(message, room_group_name):
    print("TASK STARTED")

    time.sleep(5)

    channel_layer = get_channel_layer()

    async_to_sync(channel_layer.group_send)(
        room_group_name,  # dynamic now, not hardcoded
        {
            "type": "send_message",
            "message": f"Task done! You sent: {message}",
        }
    )

    print("TASK FINISHED")
    return "Task completed successfully"