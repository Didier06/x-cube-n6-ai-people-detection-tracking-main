# Procédure de Flashage Autonome (Standalone) pour STM32N657

Ce document résume le processus complet permettant de flasher une application personnalisée (comme `detect_person`) sur la carte NUCLEO-N657X0-Q pour qu'elle puisse **démarrer toute seule (Standalone)** via le Bootloader (FSBL).

## ⚠️ Le problème initial : Pourquoi rien ne démarrait ?

L'architecture du processeur **STM32N6** (basée sur Cortex-M55 avec TrustZone) est très stricte sur la façon dont elle charge une application depuis la mémoire Flash externe vers la RAM interne (AXISRAM).

1. **Le fameux Offset de 0x400 (1024 octets)** : Le script de l'éditeur de liens de STM32CubeIDE (`STM32N657xx_nucleo.ld`) place le point de départ de votre application (la *Vector Table*) à l'adresse mémoire `0x34000400`. Les 1024 premiers octets (`0x34000000` à `0x340003FF`) sont réservés au matériel (Firmware Image Header, configuration des pare-feux SAU, etc.).
2. **Le piège du `.bin` brut** : Contrairement aux fichiers `.hex` qui stockent l'adresse de chaque ligne, un fichier `.bin` est idiot. C'est juste un flux brut. Lors de la compilation, GCC copie donc votre code depuis `0x34000400` mais l'enregistre à partir de l'octet `0` dans le fichier `.bin`. Le "vide" des 1024 octets de départ disparait.
3. **Le crash fatal** : Quand le Bootloader charge ce `.bin` brut, il pose l'application au mauvais endroit (à `0x34000000`). Quand le système essaie de démarrer, il s'attend à trouver le code à `0x34000400` mais il ne trouve que du vide. L'application plante (HardFault) silencieusement.

## 💡 La Solution Officielle : L'option magique `-align`

Le *STM32 Signing Tool CLI* v2.22 possède une option **complètement absente de la documentation classique**, mais spécialement développée pour réparer ce problème de décalage sur le STM32N6. C'est l'option `-align`.

> `--align -align : Align the payload to the 0x400 offset by adding padding bytes at the beginning of the payload. Note: Applicable only with header v2.3 for MCUs (STM32N6).`

Lorsqu'on donne le `.bin` brut généré par l'IDE au *Signing Tool* avec l'option `-align`, l'outil fait tout le sale boulot en silence :

1. Crée un bloc de 1024 octets de zéros parfaits.
2. Décale tout le code généré par CubeIDE exactement au bon endroit en mémoire RAM.
3. Génère l'entête de signature sécurisée SSBL (Version 2.3) par-dessus cet ensemble.
4. Génère un fichier propre prêt à être exécuté par le FSBL !

---

## 🛠️ La Méthode Définitive (Étape par Étape)

Voici le résumé complet à suivre lorsque vous modifiez votre code en C :

### Étape 1 : Compilation

Compilez normalement votre projet dans **STM32CubeIDE**.
Ceci génère le fichier brut sans décalage : `x-cube-n6-ai-people-detection-tracking-uvc-nucleo.bin` dans votre dossier `Release` (ou `Debug`).

### Étape 2 : Lancement automatique du Script `Flash_Nucleo_Tracking.bat`

Placez physiquement la carte en mode **Développement** ou **Boot From Flash** (les deux fonctionnent pour écraser la Flash via ST-Link) et lancez le fichier `.bat`.
Le script va utiliser l'option magique et s'occuper seul des 4 sous-étapes vitales :

1. **Signature et Alignement** :
   Le script invoque le *Signing Tool* pour transformer le `.bin` brut.
   `STM32_SigningTool_CLI -bin "brut.bin" -nk -t ssbl -hv 2.3 -align -o "aligne_signe.bin"`
   *(Le flag `-nk` indique que nous n'utilisons de système de clé de chiffrement lourd).*

2. **Écriture du FSBL** (`ai_fsbl.hex`) à `0x70000000` via STM32CubeProgrammer CLI.
3. **Écriture des poids de l'IA** (`network_data.hex`) dans la zone lointaine de la mémoire externe.
4. **Écriture de l'Application Alignée** (`N6_Aligned_Signed.bin`) à `0x70100000`.

*(Crucial : Ces écritures utilisent toutes la commande `--skipErase` pour éviter que l'écriture de l'application n'efface le Bootloader qui vient juste d'être flashé à la ligne précédente).*

### Étape 3 : Power Cycle et Lancement Libre

1. Une fois le script `.bat` terminé sans aucune ligne "Error" ou "Syntax".
2. Assurez-vous d'avoir basculé l'interrupteur physique de votre carte fermement sur **Boot from Flash** !
3. **Important** : Débranchez le câble USB pendant quelques secondes puis rebranchez-le. (Ce **Power-Cycle** est obligatoire car le débugger JTAG interne de l'USB maintient le processeur bloqué en pause après un flash).
4. Connectez-vous à la console série pour voir que l'application `main.c` se lance entièrement seule.
