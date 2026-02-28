# Notes sur les fonctions de `main.c`

Le fichier `main.c` sert de point d'entrée principal pour le microcontrôleur STM32N6. Son rôle principal est d'initialiser le matériel (horloges, mémoire, sécurité, NPU), de configurer le système d'exploitation temps réel (FreeRTOS) et de lancer le thread principal de l'application.

Voici le rôle simplifié de chaque fonction présente dans le fichier :

## Point d'entrée et FreeRTOS

* **`main()`** : C'est le point de départ du programme. Elle initialise la bibliothèque HAL (Hardware Abstraction Layer), appelle les fonctions de configuration matérielle de base (mémoire du NPU, caches, sécurité) puis délègue la suite à FreeRTOS en appelant `main_freertos()`.
* **`main_freertos()`** : S'occupe de créer la tâche/thread principal (`main_thread_fct`) et de démarrer le planificateur (scheduler) de FreeRTOS. À partir de là, le code s'exécute en mode multi-tâches.
* **`main_thread_fct()`** : C'est la première vraie "tâche" qui s'exécute. Elle termine l'initialisation du matériel plus complexe (l'écran LCD, la caméra) et lance finalement la logique principale de votre application (qui se trouve dans `app.c`).

## Configuration Matérielle (Hardware)

* **`SystemClock_Config()`** : Configure le "cœur" temporel du microcontrôleur. Elle règle les oscillateurs et les PLLs pour définir les fréquences d'horloge du processeur et des différents périphériques.
* **`CONSOLE_Config()`** : Initialise le port série (UART) pour que la fonction `printf` puisse afficher du texte dans une console sur votre PC.
* **`Security_Config()`** : Configure les aspects de sécurité globale de la puce (ex: TrustZone), définissant quelles zones mémoires ou périphériques sont sécurisés ou non.
* **`MX_DCMIPP_ClockConfig()`** : Configure spécifiquement l'horloge du périphérique DCMIPP (le processeur de pixels de la caméra stm32).

## Spécifique à l'Intelligence Artificielle (NPU - Neural Processing Unit)

* **`NPURam_enable()`** : Active et configure l'accès à la mémoire RAM dédiée au co-processeur NPU (qui fait tourner le modèle de détection de personnes).
* **`NPUCache_config()`** : Configure les caches mémoires liés au NPU pour accélérer les traitements de l'IA.
* **`npu_cache_enable_clocks_and_reset()` / `npu_cache_disable_clocks_and_reset()`** : Fonctions de très bas niveau pour allumer/éteindre électriquement ou réinitialiser le cache du NPU.

## Interruptions et Débogage

* **`IAC_Config()` & `IAC_IRQHandler()`** : L'IAC (Inter-processor Communication ou Interrupt Controller) gère des signaux d'interruptions spécifiques. Le `Handler` est la fonction appelée automatiquement quand cette interruption se déclenche.
* **`assert_failed()`** : Fonction appelée en cas d'erreur grave dans le code (lorsqu'une vérification `assert(...)` échoue). Elle permet de bloquer le programme et de savoir sur quelle ligne l'erreur a eu lieu.
* **`app_clean_invalidate_dbg()`** : Une fonction purement utilitaire pour le débogage, qui permet de nettoyer et invalider le cache processeur pour garantir que l'on lit les bonnes valeurs en mémoire lors d'une session de debug.
