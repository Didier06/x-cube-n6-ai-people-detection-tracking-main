# Procédure de Téléversement Définitif (Boot from Flash) - NUCLEO-N657X0-Q

Contrairement à la plupart des STM32 classiques, la série STM32N6 **ne possède pas de mémoire flash interne**.
Par défaut, lors du développement, le code est chargé en RAM (Development Mode) et disparaît dès que vous coupez l'alimentation.

Pour conserver votre application de façon permanente, il faut la programmer dans la **Flash Externe** (External Flash) soudée sur la carte Nucleo, puis configurer les cavaliers de la carte pour qu'elle "boot" sur cette mémoire externe au démarrage.

Voici la procédure étape par étape :

## Étape 1 : Préparation de la carte (Development Mode)

Pour pouvoir flasher la carte avec `STM32CubeProgrammer`, elle doit d'abord être en mode "Development".

- Mettez les cavaliers ou interrupteurs de "Boot" dans la position **Development mode** (voir les schémas dans la [documentation officielle](https://github.com/STMicroelectronics/x-cube-n6-ai-people-detection-tracking?tab=readme-ov-file#boot-modes)).
- Connectez votre carte Nucleo via le port USB ST-LINK (CN9) avec un câble USB-C.
- Mettez la carte sous tension.

## Étape 2 : Compilation (Build) de l'application

Dans STM32CubeIDE :

1. Faites un double clic sur `STM32CubeIDE/NUCLEO-N657X0-Q/USB-UVC-Display/.project` (si vous utilisez le mode webcam UVC) pour l'ouvrir.
2. Compilez le projet entier (bouton Marteau / **Build**). Cela générera le fichier binaire `.elf`, `.hex` ou `.bin`.

## Étape 3 : Flasher l'application avec STM32CubeProgrammer

La façon la plus simple est d'utiliser l'interface utilisateur (UI) de **STM32CubeProgrammer** (version v2.18.0 ou plus).

Si vous utilisez des fichiers `.hex` (*Le plus sécurisé*):

1. Ouvrez `STM32CubeProgrammer` et connectez-vous à la carte (Port = SWD).
2. Vérifiez que l'**External Loader** approprié est activé dans le menu des Loaders (pour la Nucleo, cherchez quelque chose ressemblant à `MX66UW1G45G_NUCLEO-N657X0-Q`).
3. Allez dans l'onglet **Erasing & Programming**.
4. Sélectionnez le fichier `.hex` généré par STM32CubeIDE (généralement dans le dossier `Release` ou généré sous `Binary/NUCLEO-N657X0-Q/USB-UVC-Display/`).
5. Cliquez sur **Start Programming**.

**Note Importante : FSBL et Poids de l'IA**
La carte a besoin d'un *First Stage Boot Loader* (FSBL) pour savoir comment démarrer, et des poids du réseau de neurones pour fonctionner. Si la carte est vierge ou formatée, vous devez **impérativement flasher trois fichiers l'un après l'autre** :

1. Le FSBL : `FSBL/ai_fsbl.hex` *(L'adresse est incluse dans le fichier .hex)*.
2. L'intelligence artificielle : `Model/NUCLEO-N657X0-Q/network_data.hex` *(L'adresse est incluse dans le fichier .hex)*.
3. Votre application : le fichier `.hex` généré par STM32CubeIDE (ex: `Binary/NUCLEO-N657X0-Q/USB-UVC-Display/...hex`).

Pour chacun de ces trois fichiers, la procédure est identique : Sélectionnez le fichier, et cliquez sur **Start Programming**. Comme ce sont des fichiers `.hex`, STM32CubeProgrammer sait exactement à quelle adresse en mémoire les écrire, vous n'avez pas besoin de les définir manuellement dans l'UI !

## Étape 4 : Activer le démarrage autonome (Boot from Flash)

Une fois la programmation terminée avec succès :

1. Déconnectez la carte de l'alimentation.
2. Basculez les cavaliers/interrupteurs de Boot dans la position **Boot from flash mode** (voir schéma de la documentation).
3. Rebranchez la carte ou appuyez sur le bouton Reset.
4. L'application démarrera désormais toute seule à partir de la mémoire flash externe !
