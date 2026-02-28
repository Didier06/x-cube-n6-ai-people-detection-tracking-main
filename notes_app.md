# Notes sur les fonctions de `app.c`

Le fichier `app.c` contient toute la logique "métier" de l'application de détection et de suivi de personnes. Il gère le pipeline complet : récupération des images de la caméra, passage de ces images dans le réseau de neurones (NPU), post-traitement des résultats, suivi (tracking) des objets détectés, et affichage (dessin) des résultats à l'écran ou via USB.

L'application est découpée en **4 tâches (threads)** principales fonctionnant en parallèle grâce à FreeRTOS.

Voici le rôle des fonctions principales :

## Point d'entrée de l'application

* **`app_run()`** : La fonction principale appelée depuis `main.c`. Elle s'occupe de :
  * Initialiser tous les éléments annexes (bouton utilisateur, caméra, écran LCD).
  * Créer les files d'attentes (queues/sémaphores) pour synchroniser les différentes étapes du processus.
  * Créer et lancer les 4 threads principaux vus ci-dessous (`nn_thread`, `pp_thread`, `dp_thread`, `isp_thread`).
  * Gérer les buffers mémoires nécessaires pour faire circuler l'image entre la caméra et les traitements.

## Les 4 Threads (Tâches) Principaux

* **`nn_thread_fct()` (Réseau de Neurones - Inference)** :
  * Attend qu'une nouvelle image arrive de la caméra.
  * Initialise et donne l'image au co-processeur NPU (stai_network).
  * Lance l'inférence pour trouver les personnes et attend le résultat brut du réseau.
  * Passe le résultat brut au thread suivant.
* **`pp_thread_fct()` (Post-Processing & Suivi)** :
  * Récupère le résultat brut du NPU (des matrices de probabilités).
  * Convertit ces données brutes en "boîtes de détection" compréhensibles (avec coordonnées, largeur, hauteur de la personne).
  * *Si activé* : Fait appel à `app_tracking()` pour lier une boîte de la trame A avec une boîte de la trame B et définir qu'il s'agit du même individu (le fameux ID de la personne).
  * Déclenche l'affichage.
* **`dp_thread_fct()` (Display - Affichage graphique)** :
  * Prépare la couche graphique (Foreground Layer) par-dessus l'image de la caméra.
  * Appelle la fonction de dessin principale (`Display_NetworkOutput`) pour dessiner le texte, les métriques et les boîtes.
  * Envoie l'image finale composée au contrôleur d'écran LCD.
* **`isp_thread_fct()` (Image Signal Processor)** :
  * Fonctionne en arrière-plan pour contrôler en temps réel le capteur de la caméra (exposition automatique, balance des blancs, etc.) selon les conditions de lumière.

## Fonctions d'Affichage (Drawing)

* **`Display_init()`** : Configure le contrôleur LCD avec deux calques (un contenant la capture caméra, un autre transparent pour dessiner les interfaces).
* **`Display_NetworkOutput()` & `Display_NetworkOutput_Tracking()`** : Calcule les métriques de performances (FPS, utilisation CPU, temps d'inférence) et prépare le dessin global avec ou sans prise en charge de la fonctionnalité de suivi (tracking).
* **`Display_TrackingBox()` & `Display_Detection()`** : Les fonctions finales qui lisent les coordonnées des boîtes et tracent les vrais pixels rectangulaires de couleur et le numéro ID à l'écran. C'est ici que nous allons brancher le bout de code "ligne de trajectoire".

## Callbacks de la Caméra (Interruptions matérielles)

* **`CMW_CAMERA_PIPE_FrameEventCallback()`** : Appelé automatiquement et de façon urgente par la caméra quand on finit de lire une trame caméra complète pour le fond (Background).
* **`app_ancillary_pipe_frame_event()`** : Appelé automatiquement quand une trame spécifique formatée pour le réseau neuronal est prête, afin de "réveiller" `nn_thread_fct()`.

## Utilitaires Temps Réel

* **`bqueue_init()` / `bqueue_get_free()` / etc.** : Ces fonctions gèrent des "Boucle Queues", des tampons (buffers) circulaires empêchant un thread de réécrire sur une image qui est en train d'être manipulée par un autre (ce qui créerait un glitch visuel).
* **`cpuload_init()` / `cpuload_update()`** : Calcul du taux d'occupation du CPU pour vos métriques.
* **`convert_point()` / `clamp_point()`** : Mettent à l'échelle les positions relatives [0, 1] trouvées par l'Intelligence Artificielle en coordonnées de pixels réelles pour l'écran.
