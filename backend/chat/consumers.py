from channels.generic.websocket import WebsocketConsumer
from asgiref.sync import async_to_sync
import json


class ChatConsumer(WebsocketConsumer):

    def connect(self):
        self.room_name = "test_room"

        async_to_sync(self.channel_layer.group_add)(
            self.room_name,
            self.channel_name
        )

        self.accept()

        self.send(text_data=json.dumps({
            "message": "Joined room successfully"
        }))

    def disconnect(self, close_code):
        async_to_sync(self.channel_layer.group_discard)(
            self.room_name,
            self.channel_name
        )
        print("Disconnected")

    def receive(self, text_data):          # ← indented inside class
        data = json.loads(text_data)
        message = data["message"]
        print("MESSAGE RECEIVED:", message)

        async_to_sync(self.channel_layer.group_send)(
            self.room_name,
            {
                "type": "send_message",
                "message": message
            }
        )

    def send_message(self, event):         # ← indented inside class
        print("SENDING TO ROOM:", event)

        self.send(text_data=json.dumps({   # ← indented INSIDE send_message
            "response": event["message"]
        }))