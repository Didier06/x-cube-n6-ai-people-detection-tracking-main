// carte ESP32 Dev Module et appuyer sur boot au moment du téléversement

// avec l'ESP32 si la connexion au wifi ne se fait plus : choisir Outils > Erase
// all Flash before sketch upload.

#include "include/ca_cert.h"
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiMulti.h> // Ajout de la bibliothèque Multi-WiFi

// INCLUSION DU FICHIER SECRET (.gitignore)
#include "secrets.h"

// Instanciation du gestionnaire Multi-WiFi
WiFiMulti wifiMulti;

// MQTT Broker settings
const char *mqtt_broker = SECRET_MQTT_BROKER;
const char *mqtt_topicPub = "FABLAB_21_22/nucleoN657/detect/out/";
const char *mqtt_topicSub = "FABLAB_21_22/nucleoN657/detect/in/";
const char *mqtt_username = SECRET_MQTT_USER;
const char *mqtt_password = SECRET_MQTT_PASS;
const int mqtt_port = SECRET_MQTT_PORT;

// WiFi and MQTT client initialization
WiFiClientSecure esp_client;
PubSubClient mqtt_client(esp_client);

// Définition des broches pour la communication avec la Nucleo STM32
#define RX2_PIN 16
#define TX2_PIN 17 // Optionnel ici car on ne fait que recevoir

void setup() {
  // 1. Démarrage du port USB vers le PC (pour voir ce qu'il se passe sur le
  // moniteur Arduino)
  Serial.begin(115200);
  Serial.println("Démarrage de l'ESP32...");

  // Ajout des différents réseaux possibles au Multi-WiFi
  // (SSID, Mot de passe)
  wifiMulti.addAP(SECRET_WIFI_SSID_1, SECRET_WIFI_PASS_1); // Contes Did
  wifiMulti.addAP(SECRET_WIFI_SSID_2, SECRET_WIFI_PASS_2); // Fablab

  connectToWiFi();

  // Set Root CA certificate
  esp_client.setCACert(ca_cert);

  mqtt_client.setServer(mqtt_broker, mqtt_port);
  mqtt_client.setKeepAlive(60);
  mqtt_client.setCallback(mqttCallback);
  connectToMQTT();
  mqtt_client.publish(mqtt_topicPub,
                      "Hi I'm ESP32 connected to Nucleo N657 !! ");
  // 2. Démarrage du Serial2 pour écouter la STM32 Nucleo
  // Paramètres : Vitesse, Mode, RX Pin, TX Pin
  Serial2.begin(115200, SERIAL_8N1, RX2_PIN, TX2_PIN);
  Serial.println("En attente de la caméra STM32 sur Serial2...");
}

void loop() {

  // S'assurer que le WiFi est toujours connecté (reconnexion automatique de
  // WiFiMulti)
  if (wifiMulti.run() != WL_CONNECTED) {
    Serial.println("Wi-Fi perdu, tentative de reconnexion...");
    delay(1000);
    return; // On ne fait rien d'autre tant que le wifi n'est pas revenu
  }

  if (!mqtt_client.connected()) {
    connectToMQTT();
  }

  // S'il y a des données qui arrivent de la STM32...
  if (Serial2.available()) {
    // On lit la ligne jusqu'au retour à la ligne
    String message = Serial2.readStringUntil('\n');

    // On retire les espaces inutiles ou le caractère '\r'
    message.trim();

    // Vérifie si le message texte contient "{ "person""
    if (message.indexOf("{ \"person\"") >= 0) {
      // On l'affiche sur le moniteur série du PC
      Serial.println("Reçu de la Nucleo : " + message);
      // On convertit le String 'message' au format attendu (const char*) avec
      // c_str()
      mqtt_client.publish(mqtt_topicPub, message.c_str());
    }
  }
}
