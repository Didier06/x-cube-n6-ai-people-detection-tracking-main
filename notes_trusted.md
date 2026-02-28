# Guide de démarrage autonome STM32N6 (Boot from Flash)

Ce document explique le comportement particulier de la mémoire de la série STM32N6 (X-CUBE-N6) et la procédure complète pour flasher manuellement une application issue de STM32CubeIDE.

## 1. Comprendre l'architecture de la mémoire STM32N6

La série STM32N6 ne possède **pas de mémoire flash interne**.
Par défaut, dans STM32CubeIDE (configuration `Debug`), le code source est configuré via le *"Linker Script"* pour s'exécuter directement et uniquement dans la **RAM interne** (adresse `0x34000400`).

C'est excellent pour les performances (IA, Caméra), mais si on coupe le courant, la RAM s'efface et l'application disparaît.

Pour que la carte soit autonome ("Boot from flash"), l'application doit être stockée dans la **Flash Externe** (`0x70...`). Cependant, pour des raisons de performance, la carte ne s'exécute pas depuis la Flash Externe : elle copie le contenu de la Flash vers la RAM au démarrage.

## 2. Le rôle du FSBL (First Stage Boot Loader)

Pour faire ce transfert systématique (Flash -> RAM) à chaque démarrage, la carte utilise un petit programme appelé le **FSBL**.

L'organisation de la Flash Externe (`0x70000000`) est très stricte :

1. **`0x70000000`** : Réservé **uniquement** au `FSBL`.
2. **`0x70100000`** : Réservé à l'Application principale (qu'on appelle le `SSBL` - Second Stage Boot Loader).
3. **`0x70800000`** (ou plus loin) : D'autres données lourdes comme le modèle de l'Intelligence Artificielle.

**⚠️ Erreur classique :** Flasher sa propre application à l'adresse `0x70000000` écrase le FSBL. La carte ne peut plus démarrer du tout, même si l'application est bonne.

## 3. La "Signature" et l'Alignement (0x400) obligatoires

Même si vous flashez votre application à la bonne adresse (`0x70100000`), le FSBL refusera de la lire et de la copier en RAM si elle n'a pas la "bonne étiquette" (Header SSBL) et surtout le **bon alignement**.

L'architecture STM32N6 exige que la table des vecteurs de l'application (le code) commence à l'adresse RAM `0x34000400`. Les 1024 premiers octets (0x400) sont exigés par le matériel pour la sécurité (TrustZone).

Le fichier brut (`.bin`) sortant de STM32CubeIDE ne contient pas cet espace vide de 1024 octets. Il faut lui ajouter l'en-tête et l'espacement via **STM32 Signing Tool**.

### Option A : Interface Graphique (Trusted Package Creator)

1. Récupérez le fichier `.bin` brut généré (`.../Release/x-cube-n6-ai-people-detection-tracking-uvc-nucleo.bin`).
2. Ouvrez **STM32 Trusted Package Creator** (installé avec STM32CubeProgrammer).
3. Onglet **Firmware Generation**.
4. **Image Type** : Sélectionnez `SSBL` (Second Stage Boot Loader).
5. **Header Version** : Choisissez `2.3` (Indispensable pour ce projet STM32N6).
6. Laissez la clé vide (`-nk` : no key) pour une image non chiffrée.
7. **⚠️ TRÈS IMPORTANT** : Cochez l'option **Align payload to 0x400 offset** (si disponible dans votre version de l'interface graphique).
8. Chargez votre `.bin` brut et cliquez sur **Generate** pour obtenir `app_aligned_signed.bin`.

### Option B : Ligne de Commande (CLI) - La méthode recommandée

Idéal pour automatiser le processus ou le placer dans le *Post-build steps* de STM32CubeIDE.
C'est la méthode la plus sûre car l'argument `-align` fait tout le travail.

```bat
"C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_SigningTool_CLI.exe" -bin "C:\Doc_local\STMCUBE\x-cube-n6-ai-people-detection-tracking-main\STM32CubeIDE\NUCLEO-N657X0-Q\uvc\Release\x-cube-n6-ai-people-detection-tracking-uvc-nucleo.bin" -nk -t ssbl -hv 2.3 -align -o "C:\Doc_local\STMCUBE\x-cube-n6-ai-people-detection-tracking-main\STM32CubeIDE\NUCLEO-N657X0-Q\uvc\Release\N6_Aligned_Signed.bin"
```

## 4. Flasher la carte (Procédure de Secours Complète)

Si votre carte ne démarre plus ou après un "Full Chip Erase", voici la procédure exacte dans **STM32CubeProgrammer** (Connecté au ST-LINK, Mode : **HOTPLUG** ou **Under Reset**) :

> **IMPORTANT :** Le **MX25UM51245G_STM32N6570-NUCLEO** (External Loader) doit absolument être COCHÉ dans l'onglet des External Loaders de STM32CubeProgrammer avant toute action !

Flashez ensuite ces 3 fichiers un par un dans l'onglet *Erasing & Programming* (en cochant **Skip Erase** pour les étapes 2 et 3) :

| Ordre | Fichier à flasher | Description | Adresse à configurer |
|:---:|---|---|---|
| **1.** | `FSBL/ai_fsbl.hex` | Le démarreur de la carte | `Automatique (0x70000000)` |
| **2.** | `network_data.hex` | Les poids de l'IA (Très lourd) | `Automatique` |
| **3.** | `N6_Aligned_Signed.bin` | VOTRE app fraîchement alignée et signée ! | **`0x70100000`** |

*Une fois terminé, placez les cavaliers en position "Boot from Flash" et appuyez sur Reset : votre STM32N6 autonome avec vision intelligente est prêt !*
