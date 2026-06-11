from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from .tasks import test_task
import json


class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        # Read room name from the URL
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        await self.send(text_data=json.dumps({
            "message": f"Joined room: {self.room_name}"
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data["message"]
        print(f"MESSAGE RECEIVED in room {self.room_name}: {message}")
        await sync_to_async(test_task.delay)(message, self.room_group_name)

    async def send_message(self, event):
        await self.send(text_data=json.dumps({
            "response": event["message"]
        }))