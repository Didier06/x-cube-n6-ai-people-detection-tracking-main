void connectToMQTT() {
  while (!mqtt_client.connected()) {
    String client_id = "esp32-client-" + String(WiFi.macAddress());
    Serial.printf("Connecting to MQTT Broker as %s...\n", client_id.c_str());
    if (mqtt_client.connect(client_id.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("Connected to MQTT broker");
      mqtt_client.subscribe(mqtt_topicSub);
      Serial.printf("Subscribed to topic: %s\n", mqtt_topicSub);
      mqtt_client.publish(
          mqtt_topicPub, "Hi I'm ESP32 !! "); // Publish message upon connection
    } else {
      Serial.print("Failed to connect to MQTT broker, rc=");
      Serial.print(mqtt_client.state());
      Serial.println(" Retrying in 5 seconds.");
      delay(5000);
    }
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.print("Message received on topic: ");
  Serial.println(topic);
  Serial.print("Message: ");

  // Construire le message reçu comme une String
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
    message += (char)payload[i];
  }
  Serial.println("\n-----------------------");

  // Si le message concerne la webcam, on le transmet à la Nucleo via Serial2
  if (message.indexOf("\"webcam\"") >= 0) {
    Serial.println(">>> Commande webcam détectée, transmission à la Nucleo...");
    Serial2.println(message); // \n déclenche le parsing dans app.c
  }
}
