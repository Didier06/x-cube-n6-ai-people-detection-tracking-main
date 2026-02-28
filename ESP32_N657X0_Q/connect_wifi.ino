void connectToWiFi() {

  Serial.println("Connexion au Wi-Fi en cours...");
  
  // L'ESP32 va scanner les réseaux et se connecter au plus puissant
  // ou à celui qui est disponible parmi cette liste.
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("Connecté au réseau Wi-Fi !");
  Serial.print("SSID actuel : ");
  Serial.println(WiFi.SSID());
  Serial.print("Adresse IP : ");
  Serial.println(WiFi.localIP());

    // WiFi.begin(ssid, password);
    // Serial.print("Connecting to WiFi");
    // while (WiFi.status() != WL_CONNECTED) {
    //     delay(500);
    //     Serial.print(".");
    // }
    // Serial.println("\nConnected to WiFi");
}