<!-- source: C:\Users\Devesh\Downloads\Catia\Catia\FR-Dassault-Systems_part_design.pdf | converted: 2026-09-29 -->

Part Design
Plan du site
Préface
Nouveautés
Mise en route
Tâches
de base
Tâches
avancées
Description
de l'atelier
Personnalisation
Glossaire
Index
© Dassault Systèmes 1994-2001. Tous droits réservés.

Plan du site
Préface
A propos du produit
Informations supplémentaires
Nouveautés
Mise en route
Atelier Part Design
Création d'une extrusion
Dépouille d'une face
Création d'un congé sur une arête
Modification de l'extrusion
Duplication de la pièce par symétrie
Esquisse d'un cercle à partir d'une face
Création d'une poche
Création d'une coque dans la pièce
Tâches de base
Ouverture d'un nouveau document CATPart
Composants issus d'une esquisse
Extrusion
Sous-éléments d'une esquisse
Extrusion Jusqu'au suivant
Extrusion Jusqu'au dernier
Extrusion Jusqu'au plan
Extrusion Jusqu'à la surface
Extrusion non perpendiculaire à l'esquisse
Extrusion dépouille et congés
Poche
Poche dépouille et congés
Révolution
Gorge
Trou
Positionnement de trous
Trou taraudé
Nervure
Rainure
Raidisseur
Surface guidée
Retrait de matière guidée

Composants d'habillage
Congé sur arête
Congé variable
Congé variable avec spine
Congé face-face
Congé tritangent
Chanfrein
Dépouille de base
Dépouille avec élément de joint
Dépouille à partir de lignes de reflet
Dépouille à angle variable
Dépouille à deux côtés
Coque
Epaisseur
Taraudage
Composants issus d'une surface
Division
Surface épaisse
Remplissage
Surface de couture
Composants de transformation
Translation
Rotation
Symétrie
Miroir
Répétition rectangulaire
Répétition circulaire
Répétition personnalisée
Décomposition de répétitions
Facteur d'échelle
Eléments de référence
Modification de composants
Modification de pièces, de corps et de composants
Réordonner des composants
Parents
Parcours de la pièce et définiiton des objets séparément
Mise à jour de pièces
Suppression de composants
Contraintes

Contraintes 3D
Définition de contraintes dans la boîte de dialogue
Modification de contraintes
Cotes moyennes
Remplacement d'éléments
Remplacement d'une surface
Remplacement d'un corps
Nouveau support d'esquisse
Déplacement d'esquisses
Propriétés
Propriétés d'une pièce
Propriétés d'un corps
Propriétés d'un composant
Annotations
Annotations texte
Tâches avancées
Association de corps
Insertion d'un corps
Assemblage de corps
Intersection de corps
Ajout de corps
Retrait de corps
Relimitation de corps
Retrait de volume
Outils
Analyse de dépouille
Analyse de courbure
Analyse de filetage/taraudage
Multi-Documents
Copie optimisée
Création de copies optimisées
Instanciation de copies optimisées
Sauvegarde de copies optimisées dans un catalogue
Réutilisation d'une conception
Couper, copier et coller

Atelier Part Design
Barre de menus Part Design
Composants issus d'une esquisse
Composants d'habillage
Composants issus d'une surface
Composants de transformation
Eléments de référence
Opérations booléennes
Barre d'outils Esquisse
Mesure
Contraintes
Analyse
Annotations
Personnalisation
Glossaire
Index

Préface
L'application CATIA Version 5 Part Design permet de concevoir des pièces mécaniques en
3D (depuis la réalisation d'une esquisse dans un contexte d'assemblage jusqu'à la
conception détaillée interactive) avec une interface utilisateur souple et intuitive. CATIA
Version 5 Part Design permet de respecter les conditions de conception de pièces, quel
que soit le niveau de complexité, du plus simple au plus avancé.
Cette nouvelle application, qui combine la fonction de conception issue d'un composant avec
la souplesse d'une approche booléenne, offre un environnement conceptuel très intuitif et
productif avec de multiples méthodologies de conception telles que la post-conception et le
paramétrage 3D local.
Etant un produit évolutif, CATIA Version 5 Part Design peut être utilisé associé à d'autres
compagnons actuels ou futurs de la prochaine génération CATIA telle que CATIA Version 5
Assembly Design et CATIA Version 5 Generative Drafting. La gamme d'applications la plus
vaste de l'industrie est également accessible grâce à l'interopérabilité avec les solutions
CATIA version 4 pour permettre la gestion de l'intégralité du processus de développement
du produit, depuis le concept initial jusqu'à l'utilisation du produit.
Le Guide de l'utilisateur Part Design a été conçu pour indiquer la procédure à suivre pour
créer une pièce. Il existe plusieurs façons de créer une pièce et ce manuel a pour but
d'illustrer les différentes étapes du processus de création que vous pouvez rencontrez.
A propos du produit
Informations supplémentaires

A propos du produit
Ce manuel est destiné à l'utilisateur devant se familiariser rapidement avec CATIA-Part
Design Version 5.7. L'utilisateur doit connaître certains concepts élémentaires de CATIA
Version 5 tels que les fenêtres de document, les barres d'outils standard et d'affichage.
Pour tirer le maximum d'informations de ce guide, nous vous suggérons de commencer à
lire et à suivre étape par étape la section Mise en route. Cette section vous montre comment
créer une pièce de base sans aucun élément de départ.
Les sections suivantes traitent de l'utilisation des données CATPart, de la création et de la
modification de différents types de composants dont vous aurez besoin pour construire des
pièces. Ce guide présente également les autres fonctions de Part Design qui permettent de
créer des pièces complexes. Vous pouvez, si vous le désirez, jeter un oeil sur les sections
décrivant l'atelier Part Design qui se trouvent à la fin du guide.

Pour en savoir plus
Avant de lire ce manuel, nous vous recommandons de lire les guides de l'utilisateur CATIA-
Infrastructure User's guide Version 5 et CATIA-Dynamic Sketcher User's Guide Version 5.
La lecture des guides de l'utilisateur CATIA- Assembly Design User's Guide Version 5
CATIA Wireframe and Surface User's Guide Version 5 et Generative Drafting User's Guide
Version 5 peut également vous être utile.
Voir aussi Conventions utilisées dans ce guide.

Nouveautés
Outils
Nouveau : Commande d'affichage et d'analyse des taraudages et des filetages
Nouveau : Commande de publication des éléments
Avancé : Commande Parents Enfants vous permettant de modifier des composants
Avancé : Analyse de dépouille
Avancé : Analyse de courbure
Nouveau : Commande permettant le déplacement d'esquisses d'un corps à l'autre
Composants issus d'une esquisse
Avancé : Les composants issus d'une esquisse peuvent désormais être obtenus à partir des
sous-éléments d'une esquisse
Avancé : Extrusion (Esquisse) Extrusion (inverser le côté)
Avancé : Poche (plusieurs profils) Poche (Esquisse) Poche (inverser le côté)
Avancé : Révolution (plusieurs profils) Révolution (Esquisse) Révolution (inverser le côté)

Avancé : Gorge (plusieurs profils) Gorge (Esquisse) Gorge (inverser le côté)
Avancé : Nervure (plusieurs profils) Nervure (Esquisse)
Avancé : Rainure (plusieurs profils) Rainure (Esquisse)
Composants d'habillage
Avancé : Taraudage
Avancé : Congé sur arête (avec plans, faces ou surfaces de limitation), Congé sur arête
(conservation d'arête) Congé sur arête (découpe de rubans)
Avancé : Congé variable (avec plans, faces ou surfaces de limitation), Congé variable
(conservation d'arête) Congé variable (découpe de rubans)
Avancé : Congé face-face (avec plans, faces ou surfaces de relimitation)
Avancé : Congé tritangent (avec plans, faces ou surfaces de relimitation)
Avancé : Vous pouvez utiliser le mode Cone ou Equerre pour dépouiller des pièces
Avancé : Aperçu de faces dépouillées
Nouveau : Commande de Dépouille de faces selon différentes val eurs d'angles
Avancé : Dépouille à deux côtés
Composants de transformation

Avancé : Les répétitions rectangulaire, circulaire ou personnalisée vous permettent de
dupliquer la géométrie de solides courants
Opérations booléennes
Avancé : Vous pouvez maintenant travailler sur des ensembles de corps
Personnalisation
Nouveau : Personnalisation du repère local

Mise en route
Avant d'aborder les instructions détaillées sur l'utilisation de Part Design CATIA Version 5,
la mise en route suivante a pour but de vous faire connaître les possibilités de ce produit. Il
vous fournit des scénarios étape par étape dans lesquels vous trouverez les fonctionnalités
les plus importantes.
Les principales tâches décrites dans cette section sont :
Ouverture de l'atelier Part Design
Création d'une extrusion
Dépouille d'une a face
Création d'un congé sur une arête
Modification de l'extrusion
Duplication de la pièce par symétrie
Esquisse d'un cercle à partir d'une a face
Création d'une poche
Création d'une coque dans la pièce
La réalisation de toutes les tâches prend environ dix minutes.
La pièce finale a l'aspect suivant :
A présent, passons à l'esquisse du profil !

Ouverture du document Description de l'atelier
Cette première tâche montre comment accéder à l'atelier Part Design.
1.
Sélectionnez Fichier -> Nouveau (ou cliquez sur l'icône Nouveau ).
La boîte de dialogue Nouveau apparaît, vous permettant de choisir le type de document que vous souhaitez.
2. Sélectionnez Pièce dans le champ Types et cliquez sur OK.
Le document Description de l'atelier est chargé et un document CATPart s'ouvre.
Les commandes de création et de modification de composants sont disponibles dans la barre d'outils de
l'atelier. A présent, passons à la tâche suivante Création d'une extrusion.

Création d'une extrusion
Dans cette tâche, vous apprendrez à créer une extrusion, c'est-à-dire à extruder un
profil esquissé dans l'atelier d'esquisse Sketcher. Pour en savoir plus, reportez-vous
à CATIA-Dynamic Sketcher User's Guide Version 5.
Ouvrez le document GettingStarted1.CATPart pour ouvrir le profil requis.
Ce dernier a été créé sur le plan xy. Il se présente comme suit :
1. Sélectionnez le profil s'il n'est pas déjà sélectionné et cliquez sur l'icône
Extrusion .
La boîte de dialogue Définition de l'extrusion s'affiche. Les options par défaut
vous permettent de créer une extrusion de base.

2. Si vous préférez créer une extrusion plus grande, entrez 60 mm dans le champ
Longueur.
L'application donne un aperçu de l'extrusion à créer.
3. Cliquez sur OK.
L'extrusion est créée. L'extrusion se fait dans un sens perpendiculaire au plan
d'esquisse. CATIA affiche cette création dans l'arbre des spécifications :
CATIA vous permet de contrôler l'affichage de certains composants de la pièce.
Pour en savoir plus sur les composants que vous pouvez afficher ou masquer,
reportez-vous à la sectionPersonnalisation de l'arborescence et de la
géométrie.
Pour en savoir plus sur les extrusions, reportez-vous aux sections Extrusions,
Extrusions "Jusqu'au suivant", Extrusions "Jusqu'au dernier", Extrusions
"Jusqu'au plan", Extrusions "Jusqu'à la surface", et Extrusions non
perpendiculaires au plan d'esquisse.

Dépouille d'une face
Dans cette tâche, vous apprendrez à dépouiller une face.
1.
Cliquez sur l'icône Angle de dépouille .
La boîte de dialogue Définition de la dépouille apparaît. L'application affiche la
direction d'extraction par défaut sur la pièce.
2. Sélectionnez la face à dépouiller comme indiqué par la flèche.
CATIA détecte toutes les faces à dépouiller. La face sélectionnée apparaît en rouge
foncé et les autres faces en rouge clair.
3. Cliquez dans le champ Sélection de la zone Elément neutre et sélectionnez la face
supérieure.
L'élément neutre apparaît maintenant en bleu, la courbe neutre en rose.
4.
Entrez 9 degrés dans le champ Angle.

5. Cliquez sur OK. La pièce est dépouillée :
Pour en savoir plus sur les dépouilles, veuillez vous reporter aux sections Dépouille
de base et Dépouille avec élément de joint.

Création d'un congé sur une arête
Dans cette tâche, vous apprendrez à utiliser une des commandes conçues pour créer un
congé sur arête.
1.
Cliquez sur l'icône Congé sur arête .
La boîte de dialogue Définition du congé apparaît. Elle contient les valeurs par défaut.
2.
Sélectionnez l'arête à raccorder, autrement dit à arrondir.
Cliquer sur Aperçu vous permet de visualiser l'aspect du congé par défaut.
3. Entrez 7 mm comme nouvelle valeur de rayon et cliquez sur OK.
Voici votre pièce :

Pour en savoir plus sur les congés, reportez-vous aux sections Congé sur arête, Congé
face-face, Congé tritangent, Congé variable.

Modification de l'extrusion
En fait, vous voulez que l'extrusion soit plus épaisse. Dans cette tâche, vous
apprendrez à modifier l'extrusion puis à colorer la pièce.
1. Double-cliquez sur Pad.1.
Vous pouvez effectuer cette opération dans l'arbre des spécifications si vous le
souhaitez.
2. Dans la boîte de dialogue Définition d'une extrusion qui s'affiche, entrez la valeur
90 mm pour définir la nouvelle longueur.
3. Cliquez sur OK.
La pièce est modifiée en conséquence.
4. Sélectionnez maintenant Corps principal.

5. Sélectionnez Edition -> Propriétés et cliquez sur l'onglet Graphic pour modifier la
couleur de votre pièce.
6. Cliquez sur la couleur de votre choix puis cliquez sur OK.
Pour en savoir plus sur la modification des propriétés graphiques, veuillez vous
reporter à CATIA Infrastructure User's Guide Version 5.
Voici à quoi ressemble maintenant la pièce :

Duplication de la pièce par symétrie
Vous allez maintenant copier la pièce par symétrie. Dans cette tâche, vous verrez
combien cette opération est aisée.
1. Sélectionnez la face de référence dont vous devez copier la pièce. Sélectionnez la
face comme indiqué :
2.
Cliquez sur l'icône Symétrie .
Le nom de cette face s'affiche dans le champ Elément miroir.
3. Cliquez sur OK.
On applique une symétrie à la pièce et l'arbre des spécifications indique cette
opération.

Pour en savoir plus sur la symétrie miroir, reportez-vous à Miroir.

Esquisse d'un cercle à partir d'une face
Dans cette tâche, vous apprendrez à :
tracer un cercle sur une face existante
utiliser ce cercle pour créer une poche
1. Sélectionnez la face supérieure pour définir le plan de travail.
2.
Cliquez sur l'icône Esquisse pour accéder à l'atelier d'esquisse.
3.
Une fois dans cet atelier, cliquez sur l'icône Cercle pour créer un cercle de
base.
4. Cliquez sur le centre du cercle au milieu de la face puis faites glisser le curseur
pour dessiner le cercle.
5. Cliquez une fois que vous êtes satisfait de la taille du cercle.

6. Cliquez sur l'icône Quitter esquisse pour retourner dans l'environnement 3D.
Voici votre pièce :
Pour en savoir plus, reportez-vous à CATIA-Dynamic Sketcher User's Guide
Version 5.

Création d'une poche
Dans cette tâche, vous apprendrez à créer une poche à l'aide d'un profil que vous
venez de créer.
1. Sélectionnez le cercle que vous venez de dessiner s'il n'est pas déjà sélectionné.
2.
Cliquez sur l'icône Poche .
La boîte de dialogue Définition d'une poche s'affiche et CATIA donne un aperçu
d'une poche avec des paramètres par défaut.
3. Configurez l'option Jusqu'au dernier pour définir la limite de votre poche.
L'application limitera la poche à la dernière face possible, à savoir l'extrusion
inférieure.
4. Cliquez sur OK.
Voici votre poche :

Pour en savoir plus sur les poches, reportez-vous à la section Poche.

Création d'une coque dans la pièce
Pour finir le scénario, vous apprendrez à créer une coque sur la pièce.
1. Sélectionnez la face inférieure de la pièce.
2.
Cliquez sur l'icône Coque .
La boîte de dialogue Définition de la coque s'affiche.
3. Entrez 5 mm comme valeur d'épaisseur interne.
4. Cliquez sur OK pour créer une coque dans la pièce.
Vous avez défini une valeur positive, ce qui signifie que l'application va entrer une
épaisseur de pièce mince.

Pour en savoir plus sur les coques, reportez-vous à la section Coque.
Vous avez terminé le scénario. Examinons maintenant l'application d'un peu plus
près.

Tâches de base
Les tâches de base que vous allez réaliser dans la description de l'atelier sont
principalement la création de composants et la création de surfaces utilisées pour créer
votre pièce. Pour créer des composants, vous commencez parfois par esquisser des profils
ou vous utilisez des composants existants.
Cette section explique et illustre les techniques de création de divers composants et
surfaces. Le tableau ci-dessous énumère les informations que vous pouvez trouver.
Ouverture d'un a nouveau document CATPart
Composants issus d'une esquisse
Composants d'habillage
Composants issus d'une surface
Composants de transformation
Eléments de référence
Modification de composants
Contraintes
Remplacement d'éléments
Propriétés
Annotations

Ouverture d'un nouveau document CATPart
Cette tâche montre comment créer un nouveau document CATPart.
1.
Sélectionnez la commande Fichier -> Nouveau (ou cliquez sur l'icône Nouveau ).
La boîte de dialogue Nouveau apparaît, vous permettant de choisir le type de document que vous souhaitez.
2. Sélectionnez Pièce dans le champ Types et cliquez sur OK.
La Description de l'atelier est chargée et un document CATPart s'ouvre.
Le document Description de l'atelier se compose de :
l'arbre des spécifications
la géométrie
des barres d'outils spécifiques : eles se réfèrent au document Description de l'atelier
des commandes contextuelles disponibles dans l'arbre des spécifications et dans la géométrie.
Souvenez-vous que vous pouvez accéder à ces commandes à partir de la barre de menus.

Vous remarquerez que CATIA fournit trois plans comme point de départ à votre conception. En fait, pour
concevoir une pièce sans élément de départ, vous devez tout d'abord concevoir une esquisse. L'esquisse de
contours est effectuée dans l'atelier Sketcher, qui est totalement intégré à l'application Part Design. Pour
l'ouvrir, cliquez sur l'icône Sketcher et sélectionnez le plan de travail de votre choix.
L'atelier Sketcher fournit alors de nombreux outils vous permettant de réaliser des esquisses des profils dont
vous avez besoin. Pour en savoir plus, reportez-vous à CATIA-Dynamic Sketcher User's Guide Version 5.

Composants issus d'une esquisse
Les composants sont des entités que vous combinez pour composer votre pièce. Les
composants présentés ici sont obtenus en appliquant des commandes sur des profils créés
initialement dans l'atelier Sketcher (voir CATIA-Dynamic Sketcher User's Guide Version 5)
ou dans l'atelier Generative Shape Design (voir CATIA Generative Shape Design User's
Guide Version 5) .
Certaines opérations concernent l'ajout de matières, d'autres le retrait de matières. Dans
cette section, vous apprendrez à créer les composants suivants :
Créer une extrusion: Cliquez sur cette icône, sélectionnez le profil à extruder et
entrez les paramètres nécessaires dans la boîte de dialogue.
Utiliser les sous-éléments d'une esquisse : Cliquez avec le bouton droit de la souris
sur le champ Sélection de la boîte de dialogue Extrusion ou Poche et sélectionnez la
commande de menu contextuel Définition du profil pour afficher la boîte de dialogue
Définition du profil.
Créer une extrusion "Jusqu'au suivant": Cliquez sur cette icône, sélectionnez le profil
à extruder, définissez l'option Type sur "Jusqu'au suivant" et entrez les paramètres
nécessaires dans la boîte de dialogue.
Créer une extrusion "Jusqu'au dernier": Cliquez sur cette icône, sélectionnez le profil
à extruder, définissez l'option Type sur "Jusqu'au dernier" et entrez les paramètres
nécessaires dans la boîte de dialogue.
Créer une extrusion "Jusqu'au plan": Cliquez sur cette icône, sélectionnez le profil à
extruder, entrez les paramètres dont vous avez besoin, définissez l'option Type sur
"Jusqu'au plan" dans la boîte de dialogue et sélectionnez le plan requis.
Créer une extrusion "Jusqu'à la surface": Cliquez sur cette icône, sélectionnez le
profil à extruder, entrez les paramètres nécessaires, définissez l'option Type sur
"Jusqu'à la surface" dans la boîte de dialogue et sélectionnez la surface requise.
Créer une extrusion non perpendiculaire au plan d'esquisse: Cliquez sur cette icône,
sélectionnez le profil à extruder, ouvrez la boîte de dialogue, entrez les paramètres
requis, définissez une nouvele référence pour la direction de l'extrusion.
Créer une extrusion dépouille et congés: Cliquez sur cette icône, sélectionnez le
profil à extruder et entrez les paramètres nécessaires dans la boîte de dialogue.

Créer une poche: Cliquez sur cette icône, sélectionnez le profil et entrez les
paramètres dont vous avez besoin dans la boîte de dialogue.
Créer une poche dépouille et congés: Cliquez sur cette icône, sélectionnez le profil à
extruder et entrez les paramètres requis dans la boîte de dialogue.
Créer une révolution: Cliquez sur cette icône, sélectionnez le profil que vous
souhaitez faire pivoter autour de l'axe et entrez les valeurs d'angle.
Créer une gorge: Cliquez sur cette icône, sélectionnez le profil que vous souhaitez
faire pivoter autour de l'axe et entrez les valeurs d'angle.
Créer un trou: Cliquez sur cette icône, sélectionnez la face sur laquelle le trou sera
créé et entrez les paramètres requis dans la boîte de dialogue.
Créer un trou taraudé: Cliquez sur cette icône, sélectionnez la face sur laquelle le
trou sera créé, définissez la forme du trou, cochez la case Taraudé, cliquez sur
Spécifications et entrez les valeurs requises dans la boîte de dialogue Taraudage.
Créer une nervure: Cliquez sur cette icône, sélectionnez le contour qui doit balayer
la courbe guide, sélectionnez cette courbe et définissez l'option de position dans la
boîte de dialogue.
Créer une rainure: Cliquez sur cette icône, sélectionnez le contour qui doit balayer la
courbe guide, sélectionnez cette courbe et définissez l'option de position dans la
boîte de dialogue.
Créer un raidisseur: Cliquez sur cette icône, sélectionnez le profil à extruder et
indiquez si cette extrusion doit être opérée dans deux ou trois directions.
Créer un lissage: Cliquez sur cette icône, sélectionnez les courbes section, les
courbes guide et, si nécessaire, la spine de votre choix.
Retirer une surface guidée: Cliquez sur cette icône, sélectionnez les courbes
section, les courbes guide, les points de fermeture et, le cas échéant, la spine de
votre choix.

Extrusion
La création d'une extrusion signifie extruder un profil dans une ou deux directions.
CATIA vous permet de choisir les limites de la création ainsi que la direction
d'extrusion.
Dans cette tâche, vous apprendrez à créer une extrusion de base à l'aide d'un profil
fermé, des options Dimension et Domaine de symétrie.
Ouvrez le document Pad1.CATPart.
1. Sélectionnez le profil à extruder.
Vous pouvez utiliser des profils esquissés dans l'atelier Sketcher ou des éléments
de géométrie plane créés dans l'atelier Generative Shape Design (sauf pour les
droites).
Vous pouvez aussi sélectionner divers éléments formant une esquisse. Pour en
savoir plus, reportez-vous à la section Utilisation des sous-éléments d'une
esquisse.
Si vous exécutez la commande Extrusion sans avoir préalablement défini un profil,
cliquez sur l'icône pour accéder à l'atelier Sketcher et tracez le profil requis.
Par défaut, CATIA extrude de façon perpendiculaire au plan utilisé pour créer le
profil. Pour savoir comment changer la direction d'extrusion, reportez-vous à la
section Extrusion non perpendiculaire au plan d'esquisse .
Si vous extrudez un élément géométrique créé dans l'atelier Generative Shape
Design, vous devez sélectionner un élément permettant de définir la direction car
il n'existe pas de direction par défaut.
2.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition d'une extrusion s'affiche et CATIA donne un
aperçu de l'extrusion à réaliser.

Si le profil que vous avez sélectionné ne vous convient pas, vous pouvez cliquer
dans le champ Sélection et choisir une autre esquisse.
Vous remarquerez que, par défaut, CATIA spécifie la longueur de votre extrusion.
Vous pouvez également utiliser les options suivantes :
Jusqu'au suivant
Jusqu'au dernier
Jusqu'au plan
Jusqu'à la surface
3. Entrez 40 dans le champ Longueur ou sélectionnez LIM1 et faites-le glisser jusqu'à
40 pour incrémenter la valeur de longueur.

Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez alors
modifier le profil. Après avoir effectué vos modifications, quittez l'atelier
d'esquisse. La boîte de dialogue Extrusion s'affiche à nouveau pour vous
permettre de terminer votre conception.
Le nouveau bouton Inverser le côté n'est utilisable qu'avec les profils ouverts.
Cette option vous permet de choisir le côté du profil à extruder.
4. Cliquez sur l'option Extension symétrique pour extruder également le profil dans le
sens opposé en utilisant la même valeur de longueur.
Si vous souhaitez définir une autre longueur pour cette direction, ne cliquez pas
sur le bouton Extension symétrique. Cliquez simplement sur le bouton Plus et
définissez la seconde limite.
5. Cliquez sur Aperçu pour visualiser le résultat.

6. Cliquez sur OK.
L'extrusion est créée. L'arbre des spécifications fait état de cette création.
A propos des extrusions
CATIA vous permet de créer des extrusions à partir de profils ouverts sous réserve
que la géométrie existante peut relimiter les extrusions. L'extrusion ci-dessous a été
créée à partir d'un profil ouvert dont les deux extrémités sont étirées dans les faces
verticales internes de l'hexagone. L'option utilisée Limite 1 est "Jusqu'au suivant". La
face interne inférieure de l'hexagone arrête alors l'extrusion. Inversement, l'option
"Jusqu'au suivant" ne pourrait pas être utilisée pour Limit2.
Aperçu Résultat

Les extrusions peuvent également être créées à partir d'esquisses comprenant
plusieurs profils. Ces profils ne doivent pas avoir d'intersection.
Dans l'exemple suivant, l'esquisse à extruder est définie par un carré et un
cercle. Si vous appliquez la commande Extrusion à cette esquisse, vous
obtenez une cavité:
Aperçu Résultat

Utilisation des sous-éléments d'une esquisse
Dans cette tâche, vous apprendrez à sélectionner des éléments appartenant à la même esquisse pour créer des extrusions.
La procédure décrite ici est également valable pour la création de poches et, depuis CATIA V5R7, pour la création de
révolutions, de gorges, de raidisseurs, de nervures et de rainures.
Tracez trois rectangles dans une session de l'atelier d'esquisse.
1.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition de l'extrusion s'affiche.
2. Cliquez sur le champ Sélection dans la boîte de dialogue.
3. A l'aide du bouton droit de la souris, sélectionnez la commande contextuelle Définition du profil.
La boîte de dialogue Définition du profil s'affiche.
2. Vous pouvez indiquer si vous souhaitez travailler sur toute la géométrie, c'est-à-dire la totalité de l'esquisse, ou
seulement sur des sous-éléments. Dans ce scénario, sélectionnez Sous-éléments.
3. Sélectionnez une arête.
Le nom de l'esquisse et celui de l'arête apparaissent dans la boîte de dialogue. L'application affiche également un aperçu
de l'extrusion à réaliser.
4. Cliquez sur Ajoute pour ajouter un élément.
5. Sélectionnez une arête appartenant à un autre profil.
L'application affiche également un aperçu de cette extrusion.
6. Répétez les étapes 4 et 5 en utilisant une arête appartenant au troisième profil.
7. Sélectionnez edge2 dans le champ Eléments initiaux et cliquez sur Enlève pour supprimer le profil associé de la
sélection.

8. Cliquez sur OK pour valider la sélection.
La boîte de dialogue Définition de l'extrusion s'affiche à nouveau. Il vous suffit alors d'entrer les paramètres de votre choix
pour extruder les deux profils.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
Si vous travaillez sur des profile complexes donnant lieu à des ambiguïtés, l'application vous permet de déterminer les
droites que vous souhaitez utiliser comme illustré ci-après :
CATIA détecte une ambiguïté symbolisée par un point rougeL'utilisateur a défini la droite qui lui est nécessaire pour
: l'utilisateur peut déterminer trois droites différentes à partir terminer la sélection.
de ce point.

Extrusions "Jusqu'au suivant"
Dans cette tâche, vous apprendrez à créer une extrusion à l'aide de l'option "Jusqu'au
suivant" . Ce mode de création permet à l'application de détecter le composant
existant à utiliser pour limiter la longueur de l'extrusion.
Ouvrez le document Pad2.CATPart .
1. Sélectionnez le contour à extruder, c'est-à-dire le cercle.
2.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition d'une extrusion apparaît et CATIA affiche l'aperçu
d'une extrusion avec une dimension par défaut.
3. Cliquez sur la flèche dans la zone géométrique pour inverser la direction de
l'extrusion (ou cliquez sur le bouton Inverser la direction).
4. Dans la zone Type, définissez l'option Type sur "Jusqu'au suivant".

Cette option permet d'utiliser une face
existante pour limiter l'extrusion.
CATIA affiche un aperçu de l'extrusion
à créer. Le corps qui existe déjà va
limiter l'extrusion.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.

5. Cliquez sur OK.
L'extrusion est créée. L'arbre des
spécifications reflète cette création.
Par défaut, l'application extrude de façon perpendiculaire au plan utilisé pour créer
le profil. Pour changer la direction, reportez-vous à la section Extrusion non
perpendiculaire au plan d'esquisse .

Extrusions "Jusqu'au dernier"
Dans cette tâche, vous apprendrez à créer des extrusions à l'aide de l'option "Jusqu'au
dernier".
Ouvrez le document Pad3.CATPart.
1. Sélectionnez le contour à extruder, c'est-à-dire le cercle.
2.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition de l'extrusion apparaît et CATIA affiche l'aperçu
d'une extrusion d'une dimension de 10 mm définie par défaut.
3. Cliquez sur la flèche dans la zone géométrique pour inverser la direction de
l'extrusion (ou cliquez sur le bouton Inverser la direction).
4. Dans la zone Type, définissez l'option Type sur "Jusqu'au dernier".

La dernière face rencontrée
par l'extrusion limitera
l'extrusion.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
5. Cliquez sur OK.
L'extrusion est créée. L'arbre des spécifications reflète cette création.

Par défaut, CATIA extrude de façon perpendiculaire au plan utilisé pour créer le
profil. Pour changer la direction, reportez-vous à la section Extrusion non
perpendiculaire au plan d'esquisse .

Extrusions "Jusqu'au plan"
Cette tâche indique comment créer des extrusions à l'aide de l'option "Jusqu'au plan".
Ouvrez le document Pad4.CATPart.
1. Sélectionnez le profil à extruder.
2.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition de l'extrusion apparaît et CATIA affiche l'aperçu
d'une extrusion d'une dimension de 10 mm définie par défaut.
3. Dans la zone Type, définissez l'option Type sur "Jusqu'au plan".
Une option Offset est désormais disponible.

Sélectionnez Plan.1. CATIA
4.
donne un aperçu de l'extrusion à
créer. Le plan va limiter
l'extrusion.
Entrez -20 comme valeur de décalage. Cette valeur de décalage correspond à la
5.
distance entre le plan et la face supérieure de l'extrusion à créer.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
6. Cliquez sur OK.
L'extrusion est créée. L'arbre des
spécifications reflète cette
création.

Par défaut, CATIA extrude de façon perpendiculaire au plan utilisé pour créer le
contour. Pour changer la direction, reportez-vous à la section Extrusion non
perpendiculaire au plan d'esquisse .

Extrusions "Jusqu'à la surface"
Dans cette tâche, vous apprendrez à créer des extrusions à l'aide de l'option "Jusqu'à
la surface".
Ouvrez le document Pad5.CATPart.
1. Sélectionnez le profil à extruder.
2.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition d'une extrusion apparaît et CATIA affiche l'aperçu
d'une extrusion avec une dimension par défaut.
Dans la zone Type, définissez l'option Type sur "Jusqu'à la surface".
3.
Une option Offset apparaît désormais dans la boîte de dialogue.
4. Sélectionnez la face circulaire verticale. Cette face appartient au même corps que
l'extrusion existante.

L'option "Jusqu'à la surface" vous permet de sélectionner une face appartenant au
même corps que l'esquisse ou une face appartenant au corps de pièce Part Body.
La face va limiter l'extrusion.
5. Entrez -30 comme valeur d'offset. Cette valeur de décalage correspond à la
distance entre le plan et la face supérieure de l'extrusion à créer.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
6. Cliquez sur OK.
L'extrusion est créée. L'arbre des spécifications reflète cette création.
Par défaut, l'application extrude de façon perpendiculaire au plan utilisé pour créer
le profil. Pour changer la direction, reportez-vous à la section Extrusion non
perpendiculaire au plan d'esquisse .

Extrusion non perpendiculaire au plan
d'esquisse
Dans cette tâche, vous apprendrez à créer une extrusion selon une direction non
perpendiculaire au plan utilisé pour créer le profil.
Ouvrez le document Pad6.CATPart.
1. Sélectionnez le profil à extruder.
2.
Cliquez sur l'icône Extrusion .
La boîte de dialogue Définition d'une extrusion s'affiche et CATIA donne un aperçu
de l'extrusion à réaliser.
3.
Définissez l'option Jusqu'au plan puis sélectionnez le plan yz. Pour en savoir plus
sur ce type de création, reportez-vous à la section Extrusions Jusqu'au plan.
4. Cliquez sur le bouton Agrandir pour afficher la totalité de la boîte de dialogue.
Désactivez l'option Perpendiculaire au contour et sélectionnez la droite pour
5.
l'utiliser comme référence.

CATIA donne un aperçu de l'extrusion avec
la nouvelle direction de création.
6.
Cliquez sur OK pour confirmer la création.
L'extrusion est créée. L'arbre des spécifications reflète cette création.

Extrusion dépouille et congés
Dans cette tâche, vous apprendrez à créer une extrusion tout en dépouillant ses faces
et en créant des congés sur ses arêtes.
Il est conseillé d'utiliser cette nouvelle commande pour accélérer votre conception.
Ouvrez le document Hole1.CATPart et esquissez un profil similaire à celui ci-dessous.
1. Quittez l'atelier d'esquisse et sélectionnez le profil à extruder.
2.
Cliquez sur l'icône Extrusion dépouille et congés .
La boîte de dialogue Définition d'une extrusion s'affiche et CATIA donne un aperçu
de l'extrusion à réaliser.

3. Entrez 30 comme valeur de longueur.
4. Il est obligatoire de sélectionner une seconde limite. Sélectionnez la face
supérieure de Pad1 comme seconde limite.
Notez que les plans peuvent également définir une seconde limite.
5. Passons à la définition de la dépouille. Entrez 7 comme valeur de l'angle de
dépouille.
L'application de dépouilles sur des faces est facultative. Si vous ne souhaitez pas
utiliser cette fonctionnalité, désactivez l'option Angle.

6. Cochez l'option Seconde limite pour définir l'élément neutre. Ainsi,la face
supérieure de Pad1 est également utilisée comme élément neutre.
7. Entrez une valeur de rayon pour chaque type d'arête afin de définir les trois
congés.
Rayon latéral : définit les congés sur les arêtes verticales
Rayon de première limite : définit les congés à coins ronds
Rayon de seconde limite : définit les congés sur les arêtes de la seconde
limite.
La création de congés sur arêtes est également facultative. Si vous ne souhaitez
pas utiliser cette fonctionnalité, désactivez les options.
Cliquer sur Aperçu affiche l'aperçu de l'extrusion, de la dépouille et des congés et
les fait figurer dans l'arbre des spécifications. Si vous avez désactivé les options
correspondantes, la dépouille ou les congés apparaissent alors désactivés dans
l'arborescence, c'est-à-dire entre parenthèses rouges.
8. Cliquez sur OK pour créer ces éléments.
Vous remarquez alors dans l'arbre des spécifications que vous avez créé :
une extrusion
une dépouille
trois congés
Ainsi, si vous souhaitez apporter des modifications, vous devez double-cliquer sur
l'élément approprié.
Voici votre nouvelle pièce :

Poche
La création d'une poche comporte deux étapes : l'extrusion d'un profil et la suppression de la
matière résultant de cette opération. CATIA vous permet de choisir les limites de la création ainsi
que la direction d'extrusion. Les limites que vous pouvez utiliser sont identiques à celles
disponibles pour la création des extrusions. Pour savoir les utiliser, consultez les sections
Poches Jusqu'au suivant, Extrusions Jusqu'au dernier, Extrusions Jusqu'au Plan, Extrusions
Jusqu'à la surface.
Dans cette première tâche, vous apprendrez à créer une poche, c'est-à-dire une cavité, dans
une pièce existante, puis à modifier cette poche pour supprimer la matière autour du profil initial.
Ouvrez le document Pocket1.CATPart.
1. Sélectionnez le profil.
Vous pouvez utiliser des profils esquissés dans l'atelier Sketcher ou des éléments de
géométrie plane créés dans l'atelier Generative Shape Design (sauf pour les droites).
Vous pouvez maintenant créer des poches à partir d'esquisses comprenant plusieurs profils
fermés. Ces profils ne doivent pas avoir d'intersection.
Vous pouvez également sélectionner divers éléments formant une esquisse. Pour en savoir
plus, reportez-vous à la section Utilisation des sous-éléments d'une esquisse.
2.
Cliquez sur l'icône Poche .
La boîte de dialogue Définition d'une poche s'affiche et CATIA donne un aperçu de la poche.
Si vous exécutez la commande Poche sans avoir préalablement défini un profil, cliquez sur
l'icône pour accéder à l'atelier Sketcher et tracez le profil requis.

Vous pouvez définir une profondeur spécifique pour votre poche ainsi qu'une des options
suivantes :
jusqu'au suivant
jusqu'au dernier
jusqu'au plan
jusqu'à la surface
Si vous souhaitez utiliser l'option Jusqu'au plan ou Jusqu'à la surface, vous pouvez définir un
décalage entre le plan limite (ou la surface) et le fond de la poche. Pour en savoir plus,
reportez-vous à la section Extrusions jusqu'à la surface.
3. Pour définir une profondeur spécifique, configurez le paramètre Type sur Dimension puis
entrez la valeur 30 mm. Vous pouvez également sélectionner LIM1 puis le faire glisser vers
30.
Si le profil que vous avez sélectionné ne vous convient pas, vous pouvez cliquer dans le
champ Sélection et choisir une autre esquisse.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez alors éditer le
profil pour modifier votre poche. Après avoir effectué vos modifications, quittez l'atelier
d'esquisse. La boîte de dialogue Poche s'affiche à nouveau pour vous permettre d'achever
votre conception.

Par défaut, CATIA extrude de façon perpendiculaire au plan utilisé pour créer le contour.
Pour indiquer une autre direction, cliquez sur le bouton Agrandir pour afficher la totalité de la
boîte de dialogue Définition de la poche, désactivez l'optionPerpendiculaire au contour et
sélectionnez une nouvelle direction de création.
Si vous extrudez un élément géométrique créé dans l'atelier Generative Shape Design, vous
devez sélectionner une direction.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
4. Cliquez sur OK pour créer la poche.
L'arbre des spécifications reflète cette création.
Voici votre poche :
5. Double-cliquez sur Poche.1 pour la modifier. Maintenant que l'application vous permet de
choisir la portion de matière à conserver, vous allez supprimer toute la matière autour du
profil initial.
L'option Inverser le côté vous permet de supprimer soit la matière définie à l'intérieur du
profil, ce qui correspond au comportement par défaut de l'application, soit la matière située
autour du profil.
6. Cliquez sur le bouton Inverser le côté ou cliquez sur la flèche comme indiqué ici :
7. La flèche indique désormais la direction opposée.
8. Cliquez sur OK pour confirmer l'opération. L'application a supprimé la matière autour du
profil.

Remarques à propos des poches
CATIA vous permet de créer des poches à partir de profils ouverts à condition que la géométrie
existante soit capable de délimiter les poches.
Si vous insérez un nouveau corps dans lequel vous créez un premier élément poche, CATIA
crée de la matière :
Les poches peuvent également être créées à partir d'esquisses comprenant différents profils.
Ces profils ne doivent pas s'entrecroiser.
Dans l'exemple suivant, l'esquisse d'origine contient huit profils. Si vous appliquez la
commande Poche à cette esquisse, vous créez huit poches :

Le mode de création "Jusqu'au suivant" se comporte différemment selon la version du produit
que vous utilisez. Si vous utilisez CATIA Version 5.2, la limite "Jusqu'au suivant" est la première
face détectée par l'application lors de l'extrusion du profil. Voici un exemple de ce que vous
pouvez obtenir :
Aperçu Résultat
Depuis CATIA Version 5.3, la limite "Jusqu'au suivant" est la première face détectée par l'application
lors de l'extrusion du profil. Cette face doit arrêter l'extrusion dans sa totalité, et pas seulement une
partie, et le trou traverse la matière, comme indiqué dans le schéma ci-dessous :

Aperçu Résultat
Lorsque vous utilisez l'option "Jusqu'à la surface", gardez présent à l'esprit que si la surface
sélectionnée ne bloque l'extrusion que partiellement, l'application continue d'extruder le profil
tant que celui-ci n'a pas rencontré de surface arrêtant complètement l'opération.

Poche dépouille et congés
Dans cette tâche, vous apprendrez à créer une poche tout en appliquant une dépouille
sur ses faces et des congés sur arêtes.
Il est conseillé d'utiliser cette nouvelle commande pour accélérer votre conception.
Ouvrez le document Pocket1.CATPart.
1. Sélectionnez le profil à extruder.
2.
Cliquez sur l'icône Poche dépouille et congés .
La boîte de dialogue Définition d'une poche dépouille et congés s'affiche et CATIA
donne un aperçu de la poche à créer.

3. Entrez 22 comme valeur de profondeur de la poche.
4. Il est obligatoire de sélectionner une seconde limite. Sélectionnez la face
supérieure de Pad1 comme seconde limite.
Les spécifications permettant de créer la poche sont désormais définies.
5. Passons à la définition de la dépouille. Entrez 7 comme valeur de l'angle de
dépouille.
L'application de dépouilles sur des faces est facultative. Si vous ne souhaitez pas
utiliser cette fonctionnalité, désactivez l'option Angle.
6. Cochez l'option Seconde limite pour définir l'élément neutre. Ainsi, la face
supérieure de l'extrusion est également utilisée comme élément neutre.

7. Entrez 4 comme valeur de rayon pour définir les trois congés.
Rayon latéral : définit les congés sur les arêtes verticales
Rayon de première limite : définit les congés à coins ronds
Rayon de seconde limite : définit les congés sur les arêtes de la seconde
limite.
La création de congés sur arêtes est également facultative. Si vous ne souhaitez
pas utiliser cette fonctionnalité, désactivez les options.
Cliquer sur Aperçu affiche l'aperçu de la poche, de la dépouille et des congés et
les fait figurer dans l'arbre des spécifications. Si vous avez désactivé les options
correspondantes, la dépouille ou les congés apparaissent alors désactivés dans
l'arborescence, c'est-à-dire entre parenthèses rouges.
8. Cliquez sur OK pour créer ces éléments.
Vous remarquez alors dans l'arbre des spécifications que vous avez créé :
une poche
une dépouille
trois congés
Ainsi, si vous souhaitez apporter des modifications, vous devez double-cliquer sur
l'élément approprié.
Voici votre nouvelle pièce :

Révolution
Cette tâche illustre la technique de création d'une révolution à l'aide d'un profil ouvert.
L'esquisse doit comprendre un profil ouvert ou fermé et un axe autour duquel le
composant tournera.
Vous pouvez utiliser une géométrie filaire comme profil et des axes créés à l'aide de la
fonction Repère local.
Ouvrez le document Shaft1.CATPart .
1. Sélectionnez le profil ouvert. Pour notre scénario, le profil et l'axe doivent appartenir
à la même esquisse.
Vous pouvez maintenant créer des révolutions à partir d'esquisses comprenant
plusieurs profils fermés. Ces profils ne doivent pas se couper et doivent être situés
du même côté par rapport à l'axe.
Vous pouvez en outre indiquer si vous souhaitez travailler sur toute l'esquisse, ou
seulement sur des sous-éléments. Pour en savoir plus, reportez-vous à la section
Utilisation des sous-éléments d'une esquisse.
2.
Cliquez sur l'icône Révolution .
La boîte de dialogue Définition d'une révolution s'affiche. Un message vous informe
que l'application ne trouve pas de matière pour relimiter la révolution à créer. Vous
devez donc modifier un ou plusieurs paramètres par défaut.
3. Cliquez sur OK pour fermer le message et revenir à la boîte de dialogue Définition
d'une révolution.

CATIA affiche le nom de l'esquisse sélectionnée dans le champ Sélection de la
zone Profil. Pour notre scénario, le profil et l'axe doivent appartenir à la même
esquisse. Par conséquent, vous ne devez pas sélectionner l'axe.
Si nécessaire, vous pouvez modifier l'esquisse en cliquant dans le champ et en
sélectionnant une autre esquisse dans la géométrie ou dans l'arbre des
spécifications.
Vous pouvez également modifier l'esquisse en cliquant sur l'icône d'accès à
l'atelier Sketcher. Une fois les modifications effectuées, la boîte de dialogue
Définition d'une révolution s'affiche à nouveau pour vous permettre d'achever votre
conception.
Si vous exécutez la commande Révolution sans avoir préalablement défini un profil,
cliquez sur l'icône et sélectionnez un plan pour accéder à l'atelier Sketcher,
puis tracez le profil dont vous avez besoin.
Le champ Sélection de la zone Axe est réservé aux axes que vous avez
explicitement sélectionnés.
CATIA affiche l'aperçu de la limite LIM1, qui correspond à la première valeur
d'angle, et de la limite LIM2 correspondant à la seconde valeur d'angle. La première
valeur d'angle est, par défaut, de 360 degrés.
4. L'option Inverser le côté vous permet au choix de créer de la matière entre l'axe et
le profil ou entre le profil et la matière existante. Cette nouvelle option s'applique à
des profils ouverts ou fermés.
Dans ce scénario, comme le profil ouvert ne peut pas être relimité si la direction par
défaut, c'est-à-dire la direction de l'axe, est utilisée, cliquez sur le bouton Inverser le
côté ou sur la flèche comme indiqué ici :

L'application affiche l'aperçu de la nouvelle révolution : l'extrusion sera créée dans
la direction opposée à l'axe et la matière existante sera relimitée.
5. Sélectionnez LIM1 et incrémentez-la jusqu'à 180.
Vous pouvez également entrer directement les valeurs de votre choix dans les
champs Premier angle et Second angle.
6. Cliquez sur Aperçu pour
visualiser le résultat.

7. Cliquez sur OK pour confirmer
l'opération.
La révolution est créée. L'arbre
des spécifications fait état de
cette création.

Gorge
Les gorges sont des composants de révolution qui permettent d'extraire de la
matière de composants existants. Dans cette tâche, vous apprendrez à créer une
gorge, c'est-à-dire à faire tourner un contour autour d'un axe (ou d'une droite de
construction).
Vous pouvez utiliser une géométrie filaire comme profil et des axes créés à l'aide
de la fonction Repère local.
Ouvrez le document Groove1.CATPart.
1.
Cliquez sur l'icône Gorge .
Vous pouvez désormais créer des gorges à partir d'esquisses comprenant
plusieurs profils fermés. Ces profils ne doivent pas se couper et doivent être
situés du même côté par rapport à l'axe.
Vous pouvez en outre indiquer si vous souhaitez travailler sur toute
l'esquisse, ou seulement sur des sous-éléments. Pour en savoir plus,
reportez-vous à la section Utilisation des sous-éléments d'une esquisse.
2. Sélectionnez le profil.
La boîte de dialogue Définition d'une gorge s'affiche

CATIA affiche le nom de l'esquisse sélectionnée dans le champ Sélection de
la zone Profil.
Le champ Sélection de la zone Axe est réservé aux axes que vous avez
explicitement sélectionnés. Pour notre scénario, le profil et l'axe doivent
appartenir à la même esquisse. Par conséquent, vous ne devez pas
sélectionner l'axe.
CATIA affiche l'aperçu d'une gorge en révolution autour d'un axe.
Si nécessaire, vous pouvez modifier l'esquisse en cliquant dans le champ
Sélection et en sélectionnant une autre esquisse dans la géométrie ou dans
l'arbre des spécifications.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez
alors modifier le profil. Une fois les modifications effectuées, la boîte de
dialogue Définition d'une gorge s'affiche à nouveau et vous permet d'achever
votre conception.
Si vous exécutez la commande Révolution sans avoir préalablement défini un
profil, cliquez sur l'icône et sélectionnez un plan pour accéder à l'atelier
Sketcher, puis tracez le profil dont vous avez besoin.
3. 3.CATIA affiche un aperçu des limites LIM1 et LIM2 de la gorge à créer.
Vous pouvez sélectionner ces limites et les faire glisser vers la valeur de votre
choix ou entrer les valeurs d'angles dans les champs appropriés. Dans ce
scénario, sélectionnez LIM1 et faites-la glisser vers 100, puis entrez 60 dans
le champ Second angle.

4. Examinez l'aperçu.
Une partie seulement
de la matière va
maintenant être
retirée.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
5. Cliquez sur OK pour
confirmer l'opération.
CATIA retire de la
matière autour du
cylindre. L'arbre des
spécifications fait état
de la création de la
gorge.
Voici la gorge
obtenue :
6. L'option Inverser le côté vous permet au choix de créer de la matière entre
l'axe et le profil, ce qui représente la direction par défaut, ou entre le profil et
la matière existante. Cette nouvelle option s'applique à des profils ouverts ou
fermés.
Double-cliquez sur la gorge pour la modifier. Vous allez maintenant supprimer
la matière située autour du profil.
7. Cliquez sur le bouton Inverser le côté ou cliquez sur la flèche dans la
géométrie.
8. Entrez 360 comme valeur du premier angle et 0 comme valeur du second
angle. L'application affiche l'aperçu de la nouvelle gorge.
9. Cliquez sur OK pour confirmer l'opération.
La matière entourant le profil a été retirée.

Trou
La création d'un trou consiste à évider un composant. Vous pouvez créer différentes formes de
trous standard. Ces trous sont les suivants :
Lamé et
Simple Conique Lamé Chanfreiné
chanfreiné
Si vous décidez de créer un ...
Trou lamé : le diamètre de lamage doit être supérieur au diamètre du trou et la profondeur
du trou doit être supérieure à la profondeur de lamage.
Trou chamfreiné : le diamètre de chanfreinage doit être supérieur au diamètre du trou et
l'angle de chanfreinage doit être supérieur à 0 degré et inférieur à 180 degrés.
Trou lamé et chanfreiné : le diamètre de lamage et de chanfrein doit être supérieur au
diamètre du trou, la profondeur du trou doit être supérieure à la profondeur de lamage et
de chanfrein et l'angle de lamage et de chanfrein doit être supérieur à 0 degré et inférieur à
80 degrés.
Quel que soit le type de trou que vous choisissez, vous devez indiquer la limite désirée. Il existe
une variété de limites :
Jusqu'au Jusqu'au Jusqu'à la
Borgne Jusqu'au plan
suivant dernier surface

Le mode de création "Jusqu'au suivant" se comporte différemment selon la version du produit que
vous utilisez. Dans CATIA Version 5.2, la limite "Jusqu'au suivant" est la première face détectée
par l'application lors de l'extrusion du profil.
Aperçu Résultat
Depuis CATIA Version 5.3, la limite "Jusqu'au suivant" est la première face détectée par
l'application lors de l'extrusion du profil, mais cette face doit arrêter l'extrusion dans sa globalité et
pas seulement une partie de celle-ci, et le trou traverse la matière.

Aperçu Résultat
Si vous souhaitez utiliser l'option Jusqu'au Plan ou Jusqu'à la surface , vous pouvez définir un
décalage entre le plan limite (ou la surface) et le fond du trou. Pour en savoir plus, reportez-vous
à la section Extrusions jusqu'à la surface.
Vous pouvez également sélectionner la forme de l'extrémité du trou (trou à extrémité plate ou
pointue) et indiquer un taraudage.
CATIA limite toujours le haut du trou grâce à l'option Jusqu'au suivant. En d'autres termes,
la face suivante que le trou rencontre limite ce dernier.
Dans l'exemple suivant, le trou rencontre un congé placé au-dessus de la face
initialement sélectionnée. L'application redéfinit le haut du trou par rapport au congé.

Création d'un trou
Dans cette tâche, vous apprendrez comment créer un trou lamé tout en appliquant une
contrainte de positionnement.
Ouvrez le document Hole1.CATPart.
1.
Cliquez sur l'icône Trou .
2. Sélectionnez l'arête circulaire et la face supérieure comme indiqué ci-contre.
CATIA peut maintenant définir une contrainte de distance pour positionner le trou à créer.
Le trou sera concentrique à l'arête circulaire.
Pour en savoir plus sur le positionnement des trous, reportez-vous à la section
Positionnement d'un trou.
La boîte de dialogue Définition d'un trou s'affiche et CATIA donne un aperçu du trou à
créer. La grille vous permettant de créer le trou s'affiche. Par défaut, CATIA donne un
aperçu d'un trou simple de diamètre égal à 10 mm et de profondeur égale à 10 mm.
Les commandes de création contextuelles sont disponibles en BAS de l'écran.

3. Maintenant, définissez le trou que vous voulez créer. Entrez 24 mm pour le diamètre et
25 mm pour la profondeur.
Le champ Limite est disponible si vous définissez l'option "Jusqu'au plan" ou Jusqu'à la
surface".
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez alors
appliquer une contrainte sur le point définissant la position du trou.
Une fois que vous avez quitté l'atelier Sketcher, la boîte de dialogue Définition du trou
s'affiche à nouveau pour vous permettre de définir le composant trou.
4. Configurez l'option Fond sur Fond en V pour créer un trou pointu puis entrez 110 dans le
champ Angle.

Par défaut, CATIA crée le trou perpendiculairement à la face dessinée. Vous pouvez
également définir une direction de création non perpendiculaire à la face en désactivant
l'option Perpendiculaire à la surface et en sélectionnant une arête ou une droite.
Vous pouvez également définir un trou fileté en cochant l'option Taraudé et en cliquant
sur le bouton Spécifications pour accéder aux paramètres que vous devez définir.
Maintenant, cliquez sur l'onglet Type pour avoir accès au type de trou que vous voulez
5.
créer. Vous allez créer un trou lamé.
Vous remarquerez que le glyphe vous guide lors de la définition du trou désiré.

6. Entrez 30 mm dans le champ Diamètre puis la valeur 8 mm pour la profondeur.
L'aperçu vous permet de visualiser le nouveau diamètre.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
7. Cliquez sur OK.
Le trou est créé. L'arbre des spécifications reflète cette création.
Vous remarquerez que l'esquisse utilisée pour créer le trou apparaît également
au-dessus du nom du trou. Cette esquisse est représentée par le point situé au centre du
trou.

Positionnement de trous
Dans cette tâche, vous apprendrez à appliquer une contrainte de positionnement au trou à créer
sans utiliser les outils de l'atelier Sketcher.
Ouvrez le document Hole1.CATPart.
1. Sélectionnez deux arêtes et la face sur lesquelles vous voulez positionner le trou.
2.
Cliquez sur l'icône Trou .
L'aperçu affiche deux contraintes définissant les distances entre le centre du trou et les arêtes.
3. Définissez les paramètres dans la boîte de dialogue pour créer le trou souhaité (voir la section
Création d'un trou).
CATIA affiche un aperçu des contraintes en cours de création.
4. Pour accéder aux valeurs des contraintes, double-cliquez sur la contrainte de votre choix. La
boîte de dialogue Edition de contrainte s'affiche et vous permet de modifier la valeur de la
contrainte en question.
5. Cliquez sur OK pour créer le trou.
CATIA positionne le trou à l'aide des contraintes.
Pour avoir accès aux contraintes, vous pouvez également double-cliquer sur l'esquisse dans
l'arbre des spécifications pour accéder à l'atelier d'esquisse. Si vous souhaitez repositionner le
trou, vous pouvez modifier les contraintes.

Rappel :
La zone dans laquelle vous cliquez détermine l'emplacement du trou, mais vous pouvez faire
glisser le trou jusqu'à l'emplacement désiré lors de la création à l'aide du bouton gauche de la
souris. Vous pouvez utiliser les propriétés de l'option grille si celle-ci est activée.
Pour avoir un trou concentrique à une face circulaire, il suffit de sélectionner cette face.
Cependant, CATIA ne crée aucune contrainte de concentricité.
Pour obtenir un trou concentrique à une arête circulaire, il vous suffit de sélectionner l'arête
circulaire en question et une face. Dans ce cas, CATIA crée une contrainte de concentricité.

Ne perdez pas de vue que l'atelier d'esquisse fournit des commandes permettant de contraindre
le point utilisé pour le positionnement du trou. Reportez-vous à la section Définition de
contraintes.
La sélection d'une droite et d'une face permet de positionner le trou le long de la droite.
Toute modification de la droite modifie le trou en conséquence.

La sélection d'une arête et d'une face permet la création d'un contrainte de distance par
l'application. Lorsque vous créez un trou, vous pouvez double-cliquer sur cette contrainte pour
en modifier la valeur.

Trous taraudés
Le taraudage consiste à retirer de la matière autour d'un trou. Pour définir un
taraudage, vous pouvez entrer les valeurs de votre choix mais vous pouvez également
utiliser les valeurs standard ou personnelles disponibles dans les fichiers.
Dans cette tâche, vous apprendrez à créer un trou taraudé en utilisant les valeurs
précédemment définies dans un fichier.
Ouvrez le document Hole1.CATPart.
1.
Cliquez sur l'icône Trou .
2. Sélectionnez la face sur laquelle vous souhaitez créer le trou.
3. Dans la boîte de dialogue Définition du trou, définissez la forme du trou et entrez
les paramètres de votre choix. Pour en savoir plus, reportez-vous à la
section Trou.
4. Cliquez sur l'onglet Taraudage.
5. Sélectionnez Taraudé pour accéder aux options de définition du taraudage.

Vous pouvez définir trois différents types de taraudage:
Pas De Standard : utilise les valeurs entrées par l'utilisateur
Métrique Pas Fin : utilise les valeurs de norme AFNOR

Métrique Pas Gros : utilise les valeurs de norme AFNOR
Métrique Pas Fin : norme AFNOR

Voir (NF E03-053-1970). Cette référence normative est liée à  NF E03-051-1982)
L'application utilise les valeurs de norme minimales.
| DiamNominal        |      | Pas  | DiamAvTrou |     | M   |
| ------------------ | ---- | ---- | ---------- | --- | --- |
|                    | 8,0  | 1,0  | 6,917      |     |     |
|                    | 9,1  | 1,0  | 7,917      |     |     |
|                    | 10,0 | 1,25 | 8,647      |     |     |
|                    | 12.  | 1,25 | 10,647     |     |     |
|                    | 14,0 | 1,5  | 12,376     |     |     |
|                    | 16,0 | 1,5  | 14,376     |     |     |
|                    | 18,0 | 1,5  | 16,376     |     |     |

|     | 20,0 | 1,5 | 18,376 |     |     |
| --- | ---- | --- | ------ | --- | --- |

|     |     | 22,0 | 1,5 | 20,376 |     |     |
| --- | --- | ---- | --- | ------ | --- | --- |
|     |     | 24,0 | 2,0 | 21,835 |     |     |
|     |     | 27,0 | 2,0 | 24,835 |     |     |
|     |     | 30,0 | 2,0 | 27,835 |     |     |
|     |     | 33,0 | 2,0 | 30,835 |     |     |
|     |     | 36,0 | 3,0 | 32,752 |     |     |
|     |     | 39,0 | 3,0 | 35,752 |     |     |

Métrique Pas Gros: norme AFNOR
  Voir (NF E03-053-1970). Cette référence normative est liée à  NF E03-051-1982)
L'application utilise les valeurs de norme minimales.
|     | DiamNominal        |     | Pas | DiamAvTrou |     | M   |
| --- | ------------------ | --- | --- | ---------- | --- | --- |

|     |     | 1   | 0,25 | 0,729 |     |     |
| --- | --- | --- | ---- | ----- | --- | --- |
|     |     | 1,1 | 0,25 | 0,829 |     |     |
|     |     | 1,2 | 0,25 | 0,829 |     |     |
|     |     | 1,4 | 0,3  | 1,075 |     |     |
|     |     | 1,6 | 0,35 | 1,221 |     |     |

|     |     | 1,8 | 0,35 | 1,221 |     |     |
| --- | --- | --- | ---- | ----- | --- | --- |
|     |     | 2,0 | 0,4  | 1,567 |     |     |
|     |     | 2,2 | 0,45 | 1,713 |     |     |
|     |     | 2,5 | 0,45 | 2,013 |     |     |
|     |     | 3,0 | 0,5  | 2,459 |     |     |

|     |     | 3,5 | 0,6  | 2,850 |     |     |
| --- | --- | --- | ---- | ----- | --- | --- |
|     |     | 4,0 | 0,7  | 3,242 |     |     |
|     |     | 4,5 | 0,75 | 3,688 |     |     |
|     |     | 5,0 | 0,8  | 4,134 |     |     |
|     |     | 6,0 | 1,0  | 4,917 |     |     |

|     |     | 7,0  | 1,0  | 5,917  |     |     |
| --- | --- | ---- | ---- | ------ | --- | --- |
|     |     | 8,0  | 1,25 | 6,647  |     |     |
|     |     | 9,0  | 1,25 | 7,647  |     |     |
|     |     | 10,0 | 1,5  | 8,376  |     |     |
|     |     | 12,0 | 1,75 | 10,106 |     |     |

|     |     | 14,0 | 2,0 | 11,835 |     |     |
| --- | --- | ---- | --- | ------ | --- | --- |
|     |     | 16,0 | 2,0 | 13,835 |     |     |
|     |     | 18,0 | 2,5 | 15,294 |     |     |
|     |     | 20,0 | 2,5 | 17,294 |     |     |
|     |     | 22,0 | 2,5 | 19,294 |     |     |

|     |     | 24,0 | 3,0 | 20,752 |     |     |
| --- | --- | ---- | --- | ------ | --- | --- |
|     |     | 27,0 | 3,0 | 23,752 |     |     |

| 30,0 |     | 3,5 | 26,211 |     |     |
| ---- | --- | --- | ------ | --- | --- |
| 33,0 |     | 3,5 | 29,211 |     |     |

| 36,0 |     | 4,0 | 31,670 |     |     |
| ---- | --- | --- | ------ | --- | --- |
| 39,0 |     | 4,0 | 34,670 |     |     |
| 42,0 |     | 4,5 | 37,129 |     |     |
| 45,0 |     | 4,5 | 40,129 |     |     |
| 48,0 |     | 5,0 | 42,587 |     |     |

| 52,0 |     | 5,0 | 46,587 |     |     |
| ---- | --- | --- | ------ | --- | --- |
| 56,0 |     | 5,5 | 50,046 |     |     |
| 60,0 |     | 5,5 | 54,046 |     |     |
| 64,0 |     | 6,0 | 57,505 |     |     |
| 68,0 |     | 6,0 | 61,505 |     |     |

| 72,0 |     | 6,0 | 65,505 |     |     |
| ---- | --- | --- | ------ | --- | --- |
| 76,0 |     | 6,0 | 69,505 |     |     |
| 80,0 |     | 6,0 | 73,505 |     |     |
| 85,0 |     | 6,0 | 78,505 |     |     |
| 90,0 |     | 6,0 | 83,505 |     |     |

6. Gardez l'option Pas De Standard.

7. Si vous souhaitez utiliser des valeurs déjà définies dans un fichier, cliquez sur
Ajout pour accéder à ce fichier. Sinon, vous pouvez entrer directement les valeurs
dans les champs.
Une boîte de dialogue vous permettant d'accéder au fichier contenant vos valeurs
s'affiche. Ce fichier peut être de l'un des types suivants :

fichiers Excel
fichiers Lotus
fichiers tabulatés (sous Unix)
8.
Accédez au fichier STANDARD1.txt  et cliquez sur Ouvrir pour afficher les valeurs
qu'ils contient.
La boîte de dialogue Définition du trou s'affiche à nouveau.
Votre fichier a été créé de la manière suivante :
Diamètre avant le
| Diamètre nominal | Pas |     |     | Clé |     |
| ---------------- | --- | --- | --- | --- | --- |
trou
la première ligne ne contient pas de valeur numérique
les autres lignes ci-dessous sont réservées aux valeurs numériques

les éléments obligatoires sont les clés qui définissent les noms associés
aux valeurs.
De plus, le nom de la norme est le même que celui du fichier sans l'extension.

Souvenez-vous de ces recommandations au moment de créer vos propres
fichiers
9. Définissez l'option Type sur STANDARD1.
10. Définissez le diamètre nominal : affectez une valeur à D.nominal. Par exemple,
entrez USR1.9.
Notez que le diamètre du trou comme les valeurs de pas apparaissent alors dans
les champs correspondants. Le champ Pas définit la distance entre chaque
crête.
11. Le cas échéant, éditez la valeur du diamètre du trou si vous devez modifier la
valeur que vous avez entrée préalablement dans l'onglet Extension. Cette valeur
doit rester inférieure à la valeur du diamètre nominal.
12. Répétez l'opération pour modifier, si nécessaire, la profondeur du taraudage.
13. Cochez l'option Pas gauche.
14. Cliquez sur OK pour confirmer l'opération et fermer la boîte de dialogue Définition
du trou.
L'application affiche le trou dans la géométrie mais pas le taraudage. Notez qu'une
icône représentant cet élément apparaît dans l'arbre des spécifications.

A propos de la suppression des fichiers
Le bouton Supprimer permet de supprimer les fichiers contenant des valeurs
définies par l'utilisateur. Vous ne pouvez pas supprimer les fichiers contenant les
valeurs standard. Si vous cliquez sur le bouton Supprimer, la liste des fichiers
définis par l'utilisateur s'affiche. Il vous suffit alors de sélectionner ou de
multi-sélectionner (avec la touche CTRL) ces fichiers et de cliquer sur OK pour
confirmer l'opération.
Notez également que vous ne pouvez pas supprimer un fichier standard s'il est
utilisé dans le document CATPart.

Nervure
Pour définir une nervure, il vous faut une courbe centre, un contour plan et si possible un élément de
référence ou une direction d'extraction.
Les nervures peuvent également être créées à partir d'esquisses comprenant plusieurs profils. Ces
profils doivent être fermés et ne doivent pas avoir d'intersection.
Par exemple, vous pouvez créer facilement un tuyau à partir d'une esquisse composée de deux
cercles concentriques :
Profils Résultat
Vous pouvez créer des nervures en combinant les éléments de la manière suivante :
Profil ouvert Profil fermé Direction d'extraction
Courbe centre
ouverte
Courbe plane
fermée
Courbe centre 3D
fermée
Les règles suivantes doivent être gardées à l'esprit :
Les courbes centre 3D doivent être continues en tangence.
Si la courbe centre est plane, elle peut être discontinue en tangence.
Cette tâche indique comment créer une nervure, qui est un contour balayé le long d'une courbe centre
pour créer de la matière.
Ouvrez le document Rib1.CATPart.
1.
Cliquez sur l'icône Nervure .
La boîte de dialogue Définition d'une nervure s'affiche.

2. Sélectionnez le contour que vous voulez balayer, soit Sketch.2 . Votre contour a été conçu dans un
plan perpendiculaire au plan utilisé pour définir la courbe des centres. Il s'agit d'un contour fermé.
Dans certains cas, vous pouvez à présent indiquer si vous souhaitez travailler sur toute l'esquisse
ou seulement sur des sous-éléments. Pour en savoir plus, reportez-vous à la section Utilisation des
sous-éléments d'une esquisse.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez alors modifier le
profil. Après avoir effectué vos modifications, quittez l'atelier d'esquisse. La boîte de dialogue
Définition de la nervure s'affiche à nouveau pour vous permettre de terminer votre conception.
Si vous exécutez la commande Nervure sans avoir préalablement défini un profil, cliquez sur
l'icône pour accéder à l'atelier Sketcher puis tracez le profil dont vous avez besoin.
Vous pouvez utiliser un profil ouvert si la matière existante peut limiter la nervure.
3.
Sélectionnez la courbe centre, soit Sketch.1.
La courbe centre est ouverte. Pour créer une nervure, vous pouvez également utiliser des contours
ouverts et des courbes centres fermées. Les courbes centre 3D ne doivent pas être discontinues
en tangence.
Vous pouvez également utiliser une géométrie filaire plane comme profil ou comme courbe centre.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse Sketcher pour modifier la courbe
centre. Après avoir effectué vos modifications, quittez l'atelier d'esquisse. La boîte de dialogue
Définition de la nervure s'affiche à nouveau pour vous permettre de terminer votre conception.

L'application donne, à présent, un aperçu de la nervure à créer.
Vous pouvez contrôler sa position en sélectionnant une des options suivantes :
Conservation de l'angle : garde la valeur de l'angle entre le plan d'esquisse utilisé pour le
contour et la tangente de la courbe centre.
Direction d'extraction: balaie le contour en suivant la direction indiquée. Pour définir cette
direction, vous pouvez sélectionnez un plan ou une arête.
Par exemple, vous devez utiliser cette option si la courbe centre est une hélice. Dans
ce cas, vous sélectionnerez l'axe de l'hélice comme direction d'extraction.
Surface de référence: la valeur de l'angle formé par l'axe h et la surface de référence est
constante.
4. Pour poursuivre ce scénario, il faut garder l'option Conservation de l'angle. Rappel : la valeur de
l'angle est de 90 degrés.
5. Cliquez sur OK.
La nervure est créée. L'arbre des spécifications fait état de cette création.

L'option Extrémités relimitées peut être utilisée dans certains cas. Elle crée de la matière entre les
extrémités de la nervure et la matière existante à condition que la matière existante relimite les
deux extrémités.
6.
Supprimez cette nervure pour en créer une autre en utilisant l'option Direction d'extraction. Après
avoir configuré cette option, sélectionnez le plan xy pour définir l'axe z comme direction
d'extraction. Le plan utilisé pour définir le contour restera perpendiculaire au plan xy.
Voici l'aperçu :
et la nervure :
7.
Supprimez cette nervure pour en créer une autre en utilisant l'option Surface de référence.
Affichez d'abord le lissage dans l'espace d'affichage, puis configurez l'option Surface de référence
et sélectionnez le lissage comme surface de référence. La valeur de l'angle formé par l'axe h et la
surface est égale à 0 et reste constante.
L'aperçu se présente comme suit :

et la nervure ainsi :
Pour en savoir plus sur l'option Conservation de l'angle
La position du contour par rapport à la courbe centre détermine la forme de la nervure en résultant. Lors du
balayage du contour, l'application garde la position initiale du contour par rapport au point le plus proche de
la courbe centre. L'application calcule la nervure à partir de la position du contour.
Dans l'exemple ci-dessous, l'application calcule le point d'intersection entre le plan du contour et la courbe
centre, puis balaie le contour à partir de cette position.

Rainure
Pour définir une rainure, il vous faut une courbe centre, un profil plan, un élément de référence et si
possible une direction d'extraction.
Désormais, les rainures peuvent également être créées à partir d'esquisses comprenant
plusieurs profils. Ces profils doivent être fermés et ne doivent pas avoir d'intersection.
Vous pouvez créer des rainures en combinant les éléments de la manière suivante :
Direction
Profil ouvert Profil fermé
d'extraction
Courbe centre
ouverte
Courbe plane
fermée
Courbe centre 3D
fermée
Les règles suivantes doivent être gardées à l'esprit :
Les courbes centre 3D doivent être continues en tangence.
Si la courbe centre est plane, elle peut être discontinue en tangence.
Cette tâche indique comment créer une rainure, qui est un contour balayé le long d'une courbe
centre pour créer de la matière.
Ouvrez le document Slot1.CATPart.
1.
Cliquez sur l'icône Rainure .
La boîte de dialogue Définition d'une rainure s'affiche.
2. Sélectionnez le contour Sketch.2 .
Dans certains cas, vous pouvez à présent indiquer si vous souhaitez travailler sur toute
l'esquisse ou seulement sur des sous-éléments. Pour en savoir plus, reportez-vous à la section
Utilisation des sous-éléments d'une esquisse.

Si vous exécutez la commande Rainure sans avoir préalablement défini un profil, cliquez sur
l'icône pour accéder à l'atelier d'esquisse puis tracez le profil requis.
Le contour a été conçu dans un plan perpendiculaire au plan utilisé pour définir la courbe des
centres. Il est fermé. Vous pouvez utiliser une géométrie filaire comme profil.
3.
Cliquez sur l'icône pour ouvrir l'atelier d'esquisse. Ceci ferme provisoirement la boîte de
dialogue.
4. Modifiez le profil. Par exemple, élargissez-le.
5. Quittez l'atelier d'esquisse. La boîte de dialogue Définition de la rainure s'affiche à nouveau.

Vous pouvez contrôler la position du profil en sélectionnant une des options suivantes :
Conserver l'angle: garde la valeur de l'angle entre le plan d'esquisse utilisé pour ce
profil et la tangente de la courbe centre.
Direction d'extraction: balaie le contour en suivant la direction indiquée.
Par exemple, vous devez utiliser cette option si la courbe centre est une hélice.
Dans ce cas, vous sélectionnerez l'axe de l'hélice comme direction d'extraction.
Surface de référence: la valeur de l'angle formé par l'axe h et la surface de référence
est constante.
6. Pour poursuivre ce scénario, il faut garder l'option Conserver l'angle.
A présent, sélectionnez la courbe centre avec laquelle CATIA balaie le contour.
La courbe centre est ouverte. Pour créer une nervure, vous pouvez également utiliser des
contours ouverts et des courbes centres fermées. Les courbes centre peuvent être
discontinues en tangence.
CATIA affiche un aperçu de la rainure.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse pour modifier la courbe centre.
L'option Extrémités relimitées peut être utilisée dans certains cas. Elle permet la création de
matière entre les extrémités de la rainure et la matière existante.
7. Cliquez sur OK.
La rainure est créée. L'arbre des spécifications reflète cette création.

Raidisseur
Dans cette tâche, vous apprendrez à créer un raidisseur en indiquant des directions de création.
Ouvrez le document Stiffener1.CATPart.
1. Sélectionnez le profil à extruder.
Ce contour ouvert a été créé dans un plan perpendiculaire à la face sur laquelle le raidisseur repose.
Vous pouvez utiliser une géométrie filaire comme profil.
Dans certains cas, vous pouvez indiquer si vous souhaitez travailler sur tout le profil ou seulement sur
des sous-éléments. Pour en savoir plus, reportez-vous à la section Utilisation des sous-éléments d'une
esquisse.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez alors modifier le profil.
Une fois les modifications effectuées, la boîte de dialogue Définition du raidisseur s'affiche à nouveau
pour vous permettre d'achever votre conception.
Si vous devez utiliser un contour ouvert, assurez-vous que la matière existante peut limiter
entièrement l'extrusion de ce contour
2.
Cliquez sur l'icône Raidisseur .
La boîte de dialogue Définition du raidisseur s'affiche et indique une valeur d'épaisseur par défaut.

CATIA affiche l'aperçu d'un raidisseur dont l'épaisseur est égale à 10 mm.
L'extrusion est créée dans trois directions, dont deux sont opposées. Les flèches sont orientées dans
ces directions.
3. Désélectionnez l'option Extension symétrique.
L'extrusion est créée dans deux directions seulement.
Pour obtenir les directions voulues, vous pouvez également cliquer sur les flèches. Notez que vous
pouvez accéder aux commandes contextuelles à l'aide de ces flèches. Ces commandes sont les
mêmes que celles de la boîte de dialogue.
4. Cochez à nouveau l'option Extension symétrique.
5. Entrez 12 comme valeur d'épaisseur.
Cliquez sur Aperçu si vous souhaitez visualiser le résultat.
6. Cliquez sur OK.
Le raidisseur est créé. L'arbre des spécifications reflète cette création.

Si vous cliquez sur le champ Sélection et sélectionnez une autre esquisse, CATIA crée
immédiatement le raidisseur.
Cliquer sur l'icône vous permet d'ouvrir l'atelier d'esquisse. Vous pouvez alors éditer le profil pour
modifier le raidisseur. Après avoir effectué vos modifications, quittez l'atelier d'esquisse. La boîte de
dialogue est mise à jour et l'icône est activée.

Surface guidée
Dans cette tâche, vous apprendrez à créer une forme guidée.
Vous pouvez générer une forme guidée en balayant une ou plusieurs courbes
planes le long d'une armature calculée ou définie par l'utilisateur. Cette forme peut
être réalisée de façon à respecter une ou plusieurs courbes guides. La forme ainsi
créée est un volume fermé.
Ouvrez le document Loft1.CATPart.
1.
Cliquez sur l'icône Surface guidée .
La boîte de dialogue Définition du lissage s'affiche.
2. Sélectionnez les courbes triplan comme indiqué :
Elles sont mises en évidence dans la zone géométrique.

La fonctionnalité Surface guidée suppose que les courbes à utiliser ne se coupent
pas.
3. Cliquez sur Appliquer pour afficher l'aperçu de la surface guidée à créer.
Notez que, par défaut, les points de discontinuité en tangence sont couplés :
L'onglet Couplage propose plusieurs types de couplages :
Ratio: les courbes sont couplées selon leur pourcentage d'abscisse
curviligne.
Tangence: les courbes sont couplées en fonction de leurs points de
discontinuité en tangence. Si elles n'ont pas le même nombre de points, elles
ne peuvent pas être couplées à l'aide de cette option.
Tangence puis courbure: les courbes sont couplées en fonction de leurs
points de discontinuité en courbure. Si elles n'ont pas le même nombre de
points, elles ne peuvent pas être couplées à l'aide de cette option.
Sommets: les courbes sont couplées en fonction de leurs sommets. Si elles
n'ont pas le même nombre de sommets, elles ne peuvent pas être couplées
via cette option.

4. Dans ce scénario, vous utiliserez des courbes guide. Cliquez sur le champ Guide et
sélectionnez les quatre jointures. Les courbes à utiliser doivent être jointes.
Elles sont mises en évidence dans la zone géométrique.
Il est possible de modifier les éléments de référence de la surface guidée en
sélectionnant une courbe dans la liste de la boîte de dialogue puis en cliquant sur le
bouton pour :
Supprimer la courbe sélectionnée
Remplacer la courbe sélectionnée par une autre courbe.
Ajouter une courbe
Par défaut, l'application calcule une armature mais si vous voulez imposer une
courbe comme étant l'armature à utiliser, il vous suffit de cliquer sur l'onglet
Armature puis dans le champ Armature et de sélectionner l'armature de votre choix
dans la géométrie.
L'onglet Relimitation vous permet de spécifier le type de relimitation de la surface
guidée. Vous pouvez limiter la surface guidée uniquement par la première section,
uniquement par la dernière, par les deux ou par aucune.
si une ou deux options sont cochées : la surface guidée est limitée par la
section correspondante
si une ou deux options sont désactivées : la surface est balayée le long de
l'armature :
si l'armature est définie par l'utilisateur, la surface guidée est limitée
par les extrémités de l'armature
si l'armature est calculée automatiquement et si aucune courbe guide
n'est sélectionnée : la surface guidée est limitée par les première et
dernière sections
si l'armature est calculée automatiquement et si des courbes guides
sont sélectionnées : la surface est limitée par les extrémités des
guides

5. Cliquez sur OK pour créer le
volume.
La forme (identifiée en tant que
Guide.xxx) vient s'ajouter à l'arbre
des spécifications.

Retrait de matière guidée
Dans cette tâche, vous apprendrez à retirer de la matière guidée.
L'option Retrait de surface guidée génère une surface de matière guidée en balayant
une ou plusieurs ligne(s) courbe(s) plane(s) le long d'une armature calculée ou
définie par l'utilisateur. La matière peut être réalisée de façon à respecter une ou
plusieurs courbes guides.
Ouvrez le document RemoveLoft1.CATPart.
1.
Cliquez sur l'icône Retrait de surface guidée .
La boîte de dialogue Définition d'un retrait de surface guidée s'affiche.
2. Sélectionnez les deux courbes comme indiqué dans Sketch.3 et Sketch.4) :
Elles sont mises en évidence dans la zone géométrique.

3. Sélectionnez le point de fermeture 2 comme indiqué dans la section 2 pour définir
le point de fermeture.
4. Cliquez sur la flèche du point de fermeture 2 pour inverser la direction.

Il est possible de modifier les éléments de référence de la surface guidée en
sélectionnant une courbe dans la liste de la boîte de dialogue puis en cliquant sur
le bouton pour :
Supprimer la courbe sélectionnée
Remplacer la courbe sélectionnée par une autre courbe.
Ajouter une courbe
Par défaut, l'application calcule une armature mais si vous voulez imposer une
armature comme étant celle à utiliser, il vous suffit de cliquer sur l'onglet Armature
puis dans le champ Armature et de sélectionner l'armature de votre choix dans la
géométrie.
L'onglet Relimitation vous permet de spécifier le type de relimitation de la surface
guidée. Vous pouvez limiter la surface guidée uniquement par la première section,
uniquement par la dernière, par les deux ou par aucune.
si une ou deux options sont cochées : la surface guidée est limitée par la
section correspondante
si une ou deux options sont désactivées : la surface est balayée le long de
l'armature :
si l'armature est définie par l'utilisateur, la surface guidée est limitée
par les extrémités de l'armature
si l'armature est calculée automatiquement et si aucune courbe
guide n'est sélectionnée : la surface guidée est limitée par les
première et dernière sections
si l'armature est calculée automatiquement et si des courbes guides
sont sélectionnées : la surface est limitée par les extrémités des
guides
5. Cliquez sur OK pour créer la surface guidée.
La forme (identifiée en tant que Loft.xxx) vient s'ajouter à l'arbre des
spécifications.

Composants d'habillage
L'habillage des composants est effectué en appliquant des commandes sur un ou plusieurs
supports. CATIA fournit un grand nombre de possibilités pour réaliser les composants dont
vous avez besoin. L'application vous permet de créer les composants d'habillage suivants :
Création d'un congé sur arête : Cliquez sur l'icône Congé arête, sélectionnez l'arête
sur laquelle vous souhaitez appliquer un congé, entrez la valeur du rayon et
définissez le mode de propagation dans la boîte de dialogue.
Création d'un congé variable: Cliquez sur l'icône Congé variable, sélectionnez l'arête
à utiliser, entrez de nouvelles valeurs de rayon pour les deux sommets détectés,
cliquez sur le nombre de points de votre choix sur l'arête et entrez les valeurs de
rayon appropriées pour chacun d'eux. Si nécessaire, définissez un nouveau mode
de variation.
Création d'un congé variable à l'aide d'une spine: Cliquez sur cette icône,
sélectionnez les arêtes à utiliser, entrez une valeur d'angle pour les sommets,
cochez la case Congé circulaire et sélectionnez la spine.
Création d'un congé face-face: Cliquez sur l'icône Congé face-face, sélectionnez les
faces à utiliser et entrez la valeur du rayon dans la boîte de dialogue.
Création d'un congé tritangent : Cliquez sur l'icône Congé tritangent, sélectionnez
les faces à utiliser et la face à supprimer.
Création d'un chanfrein: Cliquez sur l'icône Chanfrein, sélectionnez l'arête à
chanfreiner, définissez le mode de création puis configurez les paramètres.
Création d'une dépouille de base : Cliquez sur l'icône Dépouille, choississez le mode
Sélection par la face neutre ou sélectionnez la face à dépouiller puis entrez les
paramètres requis.
Création d'une dépouille avec élément de joint: Cliquez sur l'icône Dépouille,
choisissez le mode Sélection par la face neutre ou sélectionnez la face à dépouiller
et entrez les paramètres requis dans la boîte de dialogue.
Création d'une dépouille à partir de lignes de reflet: Cliquez sur l'icône Dépouille à
partir de lignes de reflet, sélectionnez la face à utiliser puis entrez les paramètres
requis.
Création d'une coque : Cliquez sur l'icône Coque, sélectionnez les faces à utiliser et
entrez les valeurs d'épaisseur.
Création d'une épaisseur : Cliquez sur l'icône Epaisseur, sélectionnez les faces à
utiliser et entrez la valeur d'épaisseur.

Création d'un taraudage/filetage: Cliquez sur cette icône, sélectionnez la surface
cylindrique que vous souhaitez utiliser, la face limite plane et entrez les valeurs
requises.

Congé sur arête
Un congé est une face courbe, de rayon constant ou variable tangente à deux surfaces
et les joignant. Ces trois surfaces forment soit un coin interne, soit un coin externe.
Dans la terminologie des dépouilles, la surface courbe d'un angle extérieur est
généralement appelée arrondi et celle d'un angle intérieur, congé de raccordement.
Des congés sur arêtes sont des surfaces transitionnelles douces entre deux faces
adjacentes.
L'objet de cette tâche est la création de plusieurs congés. Vous commencerez par
créer des congés sur neuf arêtes puis vous créerez un congé sur une face et le
relimiterez par un plan. Les cas illustrés ici sont simples. Ils utilisent un rayon constant :
la même valeur de rayon est appliquée à toutes les arêtes. Pour des informations sur
des congés plus complexes, reportez-vous à la section Congé variable ou Congé
variable avec spine.
Ouvrez le document Edge_Fillet1.CATPart.
1. Cliquez sur l'icône Congé arête
.
La boîte de dialogue Définition du
congé apparaît.
2. Sélectionnez l'arête comme indiqué.

3. L'arête sélectionnée apparaît dans le champ Objet(s). CATIA affiche la valeur du
rayon.
Cliquer sur Aperçu affiche l'aperçu du congé à créer. Cette fonction est fournie
uniquement sur Part Design P2.
4. Deux modes de propagation sont disponibles :
Minimal: CATIA ne tient pas compte des tangences. L'aperçu montre que le
congé sera calculé seulement sur une partie de l'arête :
Tangence: les tangences sont prises en compte de manière à créer un
congé sur toute l'arête et sur les éventuelles arêtes tangentes.
5. Dans ce scénario, configurez à nouveau l'option Tangence. L'aperçu montre
clairement que le congé s'appliquera à toute l'arête.
Si vous sélectionnez le mode Tangence, la nouvelle option "Découpe des rubans"
devient disponible : vous pouvez alors relimiter les congés à créer. Pour en savoir
plus, voir Découpe de rubans.

6. Entrez 15 mm comme nouvelle valeur de rayon. La valeur du rayon est mise à jour
dans la zone géométrique.
7. Sélectionnez les huit arêtes verticales.
8. Cliquez sur OK.
Un congé a été créé sur les arêtes. La création du congé est indiquée dans l'arbre
des spécifications.
9.
Cliquez à nouveau sur l'icône Congé arête et sélectionnez la face supérieure
comme nouvel élément à utiliser pour la création d'un congé.
10.Entrez 5 mm comme valeur de rayon.
11.Cliquez sur le bouton Plus pour accéder à deux options supplémentaires.
Pour savoir comment utiliser l'option Arêtes à ne pas modifier, reportez-vous à la
rubrique Arêtes à conserver.

12.Cliquez dans le champ Elément limitant et sélectionnez Plan.1 comme plan coupant
le congé.
Une flèche apparaît et indique la partie du corps qui sera conservée. Cliquer sur
cette flèche permet d'inverser la direction et ainsi d'indiquer que la partie du corps à
conserver sera la partie opposée.
Cette fonction est fournie uniquement sur Part Design P2.
13.Cliquez sur OK.
Le second congé est créé par rapport à Plan.1. Les deux congés apparaissent dans
l'arbre des spécifications. La pièce terminée a l'aspect suivant :

Arêtes à conserver
Lors de la création d'un congé sur arête, il est possible que le congé s'applique à
d'autres arêtes de la pièce, selon la valeur de rayon que vous avez spécifiée. Dans
ce cas, l'application détecte ces arêtes et interrompt la création de congé sur ces
dernières, comme le montre l'exemple suivant :
Arête à utiliser L'arête supérieure n'est pas arrondie
Cette fonction est fournie uniquement sur Part Design P2.
Dans le cas de congés arrondis, vous devez indiquer explicitement les arêtes à ne
pas utiliser. Pour ce faire, cliquez dans le champ Arête(s) à ne pas modifier et
sélectionnez l'arête dans la géométrie. CATIA affiche alors l'arête sélectionnée en
rose : cette arête ne sera pas arrondie.
Découpe de rubans

Si vous optez pour le mode de propagation Tangence, vous pouvez également
relimiter les congés se chevauchant. Pour ce faire, il suffit de cocher l'option
"Découpe de rubans".
Arêtes sélectionnées
Les congés se chevauchant ne
sont pas relimités
Les deux congés sont relimités
Comparez les résultats ci-dessus aux congés créés avec le mode de propagation
Minimal : les congés sont uniquement relimités.

Congé variable
Les congés de rayon variable sont des surfaces incurvées définies en fonction d'un
rayon variable. Un angle de rayon variable signifie qu'au moins deux rayons
constants différents sont appliqués aux deux arêtes entièrement.
Dans cette tâche, vous apprendrez à créer un congé de rayon variable. Une fois cette
tâche effectuée, voir aussi Congés variables avec spine.
Ouvrez le document VariableRadiusFillet1.CATPart.
1.
Cliquez sur l'icône Congé variable .
La boîte de dialogue Définition d'un congé variable s'affiche.
2. Sélectionnez l'arête à arrondir. Vous pouvez maintenant définir des congés à
rayon variable sur des arêtes fermées. Voir la section Congés à rayon variable
sur arêtes fermées.
CATIA détecte les deux sommets et affiche deux valeurs de rayon identiques.
3. Cliquez sur Aperçu pour visualiser le congé à créer. Cette fonction est fournie
uniquement sur Part Design P2.
4. Entrez une nouvelle valeur de rayon pour changer simultanément le rayon des
deux sommets. Par exemple, entrez 12 mm.
La nouvelle valeur du rayon s'affiche sur les deux sommets. L'aperçu est modifié
en conséquence.

Deux modes de propagation sont disponibles :
Minimal: l'application ne tient pas compte des tangences. Si des congés
arrondis se chevauchent, l'application les relimite et crée une arête vive.
Tangence: les tangences sont prises en compte de manière à créer un
congé sur toutes les arêtes.
Si vous sélectionnez le mode Tangence, la nouvelle option "Découpe des rubans"
devient disponible : vous pouvez alors relimiter les congés à créer. Pour en savoir
plus, reportez-vous à la rubrique Découpe de rubans.
5. Pour ajouter un point sur l'arête afin de rendre le congé variable plus complexe,
cliquez sur le champ Points.
Vous pouvez également ajouter des points en sélectionnant des plans. Pour en
savoir plus, reportez-vous à la fin de la tâche.
Vous pouvez ajouter autant de points que vous le souhaitez.
6. Cliquez sur un point de l'arête sur laquelle vous voulez créer un congé.
CATIA affiche la valeur du rayon sur ce point.
Notez que pour retirer un point de la sélection, il vous suffit de cliquer dessus.
7. Entrez une nouvelle valeur de rayon, par exemple 4. La nouvelle valeur de rayon
s'affiche.
Voici l'aperçu :

8. Le mode de propagation est configuré sur Cubique: conservez ce mode. Pour
voir le mode de propagation Linéaire, reportez-vous à la section "Pour en savoir
plus..." à la fin de cette tâche.
9. Cliquez sur OK pour confirmer l'opération.
L'arête est arrondie. L'arbre des
spécifications reflète cette création.
10. Pour modifier le congé, double-cliquez sur EdgeFillet.1 dans l'arbre des
spécifications.
11. Cliquez sur Plus pour agrandir la boîte de dialogue.
Trois options supplémentaires sont disponibles.
POur savoir comment uiliser l'option Arête(s) à ne pas modifier, reportez-vous à
la rubrique Arêtes à conserver.

12. Cliquez dans le champ Elément limitant et sélectionnez Plan.1 comme plan de
relimitation du congé.
Une flèche apparaît et indique la partie du corps qui sera conservée.
Cette fonction est fournie uniquement sur Part Design P2.
13. Cliquer sur cette flèche permet d'inverser la direction et ainsi d'indiquer que la
partie du corps à conserver sera la partie opposée.
14. Cliquez sur OK.
Le congé variable est relimité par Plan.1. La pièce terminée a l'aspect suivant :
Pour en savoir plus...
Il s'agit du congé obtenu en mode de propagation
Linéaire. Observez la différence !

Pour ajouter des points sur l'arête à arrondir, vous pouvez sélectionner des plans.
CATIA calcule les intersections entre ces plans ainsi que l'arête pour déterminer les
points utiles.
Dans cet exemple, trois plans ont été sélectionnés.
Si vous déplacez ces plans, CATIA calculera à nouveau les intersections et
modifiera le congé en conséquence.
Des points peuvent également être ajoutés en sélectionnant des points en 3D.
Vous pouvez utiliser la valeur de rayon R=0 pour créer un congé de rayon variable.
Congés à rayon variable sur arêtes fermées
L'application définit un sommet par défaut sur les arêtes fermées lorsque la
commande Congé sur arête est utilisée. Pour définir un congé, vous devez d'abord
supprimer ce sommet puis utiliser des points 3D ou des plans uniquement.
Le mode de propagation Linéaire n'est pas valide pour les arêtes fermées et les
arêtes continues en tangence.

Congé variable avec spine
Il se peut que vous ayez à créer des congés sur des arêtes consécutives sans
continuité en tangence mais que vous souhaitez traiter logiquement comme une arête
unique. Vous pouvez pour ce faire utiliser une spine. Dans cette tâche, vous
apprendrez à créer un congé sur deux arêtes consécutives en utilisant une spine
définie dans l'atelier Generative Shape Design.
Ouvrez le document VariableRadiusFillet2.CATPart.CATPart.
1.
Cliquez sur l'icône Congé variable et agrandissez la boîte de dialogue
Définition d'un congé variable qui apparaît.
2.
Sélectionnez les deux arêtes comme indiqué.
La valeur du rayon est de 4 mm pour chaque sommet.
3. Entrez 7 mm comme nouvelle valeur d'angle pour les deux sommets du coin.

Deux modes de propagation sont disponibles :
Minimal: l'application ne tient pas compte des tangences. Si des congés
arrondis se chevauchent, l'application les relimite et crée une arête vive.
Tangence: les tangences sont prises en compte de manière à créer un
congé sur toutes les arêtes.
Si vous sélectionnez le mode Tangence, la nouvelle option "Découpe des rubans"
devient disponible : vous pouvez alors relimiter les congés à créer. Pour en savoir
plus, reportez-vous à la rubrique Découpe de rubans. Cette fonction est fournie
uniquement sur Part Design P2.
4. Cochez l'option Congé circulaire et sélectionnez la spine.
La spine peut être un élément filaire ou un élément d'esquisse.
Cliquer sur Aperçu affiche l'aperçu du congé à créer. Cette fonction est fournie
uniquement sur Part Design P2.
Pour savoir comment utiliser la nouvelle option "Elément limitant", reportez-vous à
la section Congé variable. Voir aussi la rubrique Arêtes à conserver pour plus
d'informations sur l'option Arête(s) à ne pas modifier.
5. Cliquez sur OK pour confirmer l'opération.
Un congé a été créé sur les arêtes. L'arbre des spécifications reflète cette création.

Congé face-face
Généralement vous utilisez la commande de congé face-face lorsqu'il n'y a aucune
intersection entre les faces ou lorsqu'il y a plus de deux arêtes vives entre les faces.
Dans cette tâche, vous apprendrez à créer un congé face-face.
Ouvrez le document FaceFillet1.CATPart.
1. Cliquez sur l'icône Congé face-face
.
La boîte de dialogue Congé face-face
s'affiche.
2. Sélectionnez les faces à arrondir.
3. Cliquez sur Aperçu pour visualiser le congé à créer. Cette fonction est fournie
uniquement sur Part Design P2.

4. Entrez une valeur dans le champ Rayon si vous n'êtes pas satisfait de la valeur
par défaut. Par exemple, entrez 31 mm.
5. Cliquez sur le bouton Plus pour accéder à l'option Elément limitant. Cette fonction
est fournie uniquement sur Part Design P2.
6. Cliquez dans le champ Elément limitant et sélectionnez le plan zx comme plan de
relimitation.
Une flèche apparaît et indique la partie du corps qui sera conservée.
7. Comme vous souhaitez conserver la partie opposée, cliquez sur cette flèche pour
inverser la direction.
8. Cliquez sur OK.
Les faces sont arrondies. Le congé est limité par le plan zx. Cette création est
indiquée dans l'arbre des spécifications.

Congé tritangent
La création de congés tritangents implique la suppression d'une des trois faces
sélectionnées.
Dans cette tâche, vous apprendrez à créer un congé tritangent.
Vous avez besoin de trois faces. Deux d'entre elles doivent être des faces d'appui.
Ouvrez le document TritangentFillet1.CATPart.
1.
Cliquez sur l'icône Congé tritangent .
La boîte de dialogue Définition d'un congé s'affiche.
2. Sélectionnez les faces à arrondir.
3. Sélectionnez la face à supprimer,
c'est-à-dire la face supérieure. Le congé
sera tangent à cette face.
La face apparaît en rouge foncé.
Cliquez sur Aperçu si vous souhaitez visualiser le congé à créer. Cette fonction est
fournie uniquement sur Part Design P2.

Vous pouvez relimiter les congés tritangents par un plan, une face ou une surface.
Pour ce faire, agrandissez la boîte de dialogue et cliquez sur le champ Elément
limitant. Cette fonction est fournie uniquement sur Part Design P2.
4. Sélectionnez Plan.2 comme élément de relimitation.
Une flèche apparaît et indique la partie du corps qui sera conservée. Cliquer sur
cette flèche permet d'inverser la direction et ainsi d'indiquer que la partie du corps
à conserver sera la partie opposée.
5. Cliquez sur OK.
Les faces sont arrondies. Le congé est
relimité par Plan.2.
La création du congé est indiquée dans
l'arbre des spécifications.
La sélection de trois faces puis de l'icône Congé tritangent entraîne la
suppression de la troisième face par l'application.

Chanfrein
Créer un chanfrein consiste à retirer ou ajouter une section plate à une arête
sélectionnée pour créer une surface oblique entre les deux faces d'origine communes
à cette arête. Pour obtenir un chanfrein, propagez un ou plusieurs bords.
Cette tâche indique comment créer deux chanfreins en sélectionnant deux bords. L'un
des cas illustre comment la matière est ajoutée, l'autre cas montre comment la matière
est extraite.
Ouvrez le document Chamfer1.CATPart.
1.
Cliquez sur l'icône Chanfrein .
La boîte de dialogue Définition d'un chanfrein s'affiche. Les paramètres par défaut
à définir sont Longueur1 et Angle. Vous pouvez modifier ce mode de création et
configurer Longueur1 et Longueur2.
2. Sélectionnez les arêtes à chanfreiner.
Vous pouvez également créer des chanfreins en sélectionnant une face dont les
arêtes doivent être chanfreinées.
3. Cliquez sur Aperçu pour visualiser les chanfreins à créer. Cette fonction est
fournie uniquement sur Part Design P2.
3. Conservation du mode par défaut : entrez une valeur de longueur et une valeur
d'angle.

CATIA affiche un aperçu des chanfreins avec les valeurs choisies.
4. Cliquez sur OK.
L'arbre des spécifications reflète cette
création.
Voici les chanfreins créés :

Dépouille de base
Les dépouilles sont élaborées dans des pièces moulées pour faciliter leur retrait des
moules.
Les éléments caractéristiques sont les suivants :
direction d'extraction : cette direction correspond à la référence selon laquelle
les faces de dépouille sont définies.
angle de dépouille : il s'agit de l'angle créé entre les faces de dépouille et la
direction d'extraction. Cet angle peut être défini pour chaque face.
élément : ce plan, cette face ou cette surface coupe la pièce en deux et chaque
partie est dépouillée en fonction de la direction préalablement définie. Si vous
voulez un exemple, reportez-vous à la section Dépouille avec élément de joint.
élément neutre : cet élément définit une courbe neutre sur laquelle la face
dépouillée viendra s'appuyer. Cet élément restera le même au cours de la
dépouille. L'élément nautre et l'élément de joint peuvent être le même élément,
comme indiqué dans la section Dépouille avec élément de joint.
Il existe deux méthodes permettant de déterminer les objets à dépouiller. Vous
pouvez soit sélectionner directement l'objet, soit sélectionner l'élément neutre, ce
qui permet à CATIA de déterminer les faces à utiliser.
Dans cette tâche, vous apprendrez à créer une dépouille de base en
sélectionnant l'élément neutre.
Ouvrez le document Draft2.CATPart.
1.
Cliquez sur l'icône Angle de dépouille .
La boîte de dialogue Définition de la dépouille s'affiche et une flèche apparaît
sur un plan, indiquant la direction d'extraction par défaut.

Cette boîte de dialogue affiche l'option de dépouille à angle constant
sélectionnée. Si vous cliquez sur l'icône située à droite, vous accédez à la
commande permettant de créer des dépouilles à angle variable.
2. Activez l'option Sélection par la face neutre pour déterminer le mode de
sélection.
3. Sélectionnez la face supérieure comme étant l'élément neutre. Cette sélection
permet à CATIA d'identifier la face à dépouiller.
L'élément neutre apparaît maintenant en bleu, la courbe neutre en rose. Les
faces à dépouiller sont en rouge foncé.
L'option Propagation peut être définie sur :
Aucune : pas de propagation
Par tangence : l'application intègre les faces propagées en tangence sur
la face neutre pour définir l'élément neutre.
Pour en savoir plus sur l'élément neutre, reportez-vous à A propos des
dépouilles.
La direction d'extraction s'affiche désormais en haut de la pièce. Elle est
perpendicualire à la face neutre.
L'option Pilotée par la référence est activée, ce qui signifie que lorsque vous
modifierez l'élément définissant la direction d'extraction, vous modifierez la
dépouille en conséquence.

Notez que l'autre mode de sélection (sélection explicite) affiche les objets en
rose foncé.
4. La valeur par défaut de l'angle est 5. Entrez 7 degrés comme nouvelle valeur
d'angle.
CATIA affiche la nouvelle valeur d'angle dans la géométrie.
5. Cliquez sur Aperçu pour visualiser la dépouille à créer. La dépouille apparaît
en bleu. Cette fonction est fournie uniquement sur Part Design P2.
6. Cliquez sur OK pour confirmer l'opération.
Les faces sont dépouillées. Notez que de la matière a été ajoutée.

Cette tâche ne décrit pas comment utiliser les options disponibles lorsque la
boîte de dialogue est agrandie. Pour en savoir plus sur l'utilisation de ces
options, reportez-vous à la section Dépouille avec élément de joint.
Pour en savoir plus sur les dépouilles
Modification de dépouilles
Si vous modifiez l'esquisse utilisée pour
définir l'extrusion initiale, CATIA intègre
cette modification et recalcule la dépouille.
Dans l'exemple suivant, un chanfrein a été
ajouté au contour.
Vous pouvez maintenant transformer une dépouille à angle constant en
dépouille à angle variable. Pour ce faire, double-cliquez sur la dépouille, puis
cliquez sur l'option de dépouille à angle variable dans la boîte de dialogue pour
accéder aux options appropriées. Pour en savoir plus, reportez-vous à la
section Dépouille à angle variable.
Eléments neutres
Il est possible de sélectionner plusieurs faces pour définir l'élément neutre. Par
défaut, la direction d'extraction est donnée par la première face que vous
sélectionnez. Voici un exemple de ce que vous pouvez obtenir :

Définition de la dépouille Résultat
Vous pouvez utiliser des éléments neutres qui n'ont pas d'intersection avec les
faces à dépouiller. Voici un exemple de ce que vous pouvez obtenir :
Définition de la dépouille Résultat
Méthodologie
Si vous devez dépouiller plusieurs faces en utilisant une direction
perpendiculaire à l'élément neutre, gardez en mémoire le mode d'exploitation
suivant qui facilitera la conception :
Cliquez sur puis sélectionnez tout d'abord l'élément neutre de votre choix.
La direction d'extraction qui apparaît est perpendiculaire à l'élément neutre.
Sélectionnez la face à dépouiller puis cliquez sur OK pour créer votre première
dépouille.
Maintenant, pour créer les autres dépouilles dans le même document CATPart,
remarquez que par défaut l'application utilise la même direction d'extraction que
celle spécifiée pour la création de la première dépouille. Etant donné que les
concepteurs utilisent généralement une direction d'extraction unique, vous
n'avez pas besoin de redéfinir votre direction d'extraction.

Dépouille avec élément de joint
Dans cette tâche, vous apprendrez à créer une dépouille à l'aide d'un élément de joint.
Avant de commencer, consultez la section Dépouille de base, puis ouvrez le document
Draft1.CATPart.
1. Sélectionnez la face sur laquelle vous souhaitez créer une dépouille.
2.
Cliquez sur l'icône Angle de dépouille .
La boîte de dialogue Définition de la dépouille s'affiche et une flèche apparaît sur la
pièce, indiquant la direction d'extraction par défaut. La face sélectionnée apparaît en
rouge et en surbrillance. L'application repère que d'autres faces doivent être dépouillées
et les affiche en rouge clair.
3. Cliquez dans le champ Sélection et sélectionnez le plan xy pour définir l'élément neutre.
L'application affiche la courbe neutre en rose.
4. Entrez 13 degrés comme nouvelle valeur d'angle. Pour en savoir plus, voir Valeurs
d'angles.
5. Cliquez sur le bouton Agrandir pour afficher la totalité de la boîte de dialogue et accéder
à l'option Elément de joint.

6. Pour définir l'élément de joint, vous pouvez cocher l'option
Elément de joint = élément neutre pour réutiliser le plan que vous avez
sélectionné comme élément neutre,
ou bien cocher l'option Définition de l'élément de joint et sélectionner un plan ou
une face plane comme élément de joint.
Conservez l'option Elément de joint = élément neutre. Vous pouvez également cocher
l'option Dépouille avec deux directions comme illustré à la fin du scénario.
Pour en savoir plus sur l'option Forme de la dépouille, reportez-vous à la rubrique
Valeurs d'angles.
7. Cliquez sur Aperçu : la dépouille apparaît en bleu. Cette fonction est fournie uniquement
sur Part Design P2.
8. Cliquez sur OK.
De la matière a été retirée, la face est dépouillée.

9.Double-cliquez sur la dépouille pour la modifier.
10. Sélectionnez l'option Dépouille avec deux directions pour dépouiller l'extrusion dans les
deux directions opposées à l'élément de joint.
11. Cliquez sur OK pour confirmer l'opération.
L'extrusion se présente comme suit :
Valeurs d'angles
Vous pouvez créer des dépouilles à l'aide de valeurs négatives.
Si la valeur d'angle choisie dépasse la valeur d'angle des faces adjacentes à la face
à dépouiller, un message d'erreur s'affiche. Pour réaliser la dépouille, vous devez
activer l'option Equerre disponible dans la liste déroulante Forme de la
dépouille. Cette fonction est fournie uniquement avec Part Design P2.
Voici un exemple de face dépouillée à
l'aide de l'option Equerre :

L'utilisation de l'option Equerre ne garantit pas que les pièces seront facilement
démoulées.

Dépouille à partir de lignes de reflet
Dans cette tâche, vous apprendrez à dépouiller une face en utilisant des lignes de
reflet comme lignes neutres à partir desquelles seront générées les faces obtenues.
Dans ce scénario, vous relimiterez aussi la matière à créer en définissant un élément
de joint.
Ouvrez le document Draft3.CATPart.
1.
Cliquez sur l'icône Dépouille à partir de lignes de reflet .
La boîte de dialogue de définition d'une dépouille à partir de lignes de reflet
s'affiche et une flèche apparaît, indiquant la direction d'extraction par défaut.
Cliquer sur la flèche inverse la direction.
2. Sélectionnez le cylindre.
L'application détecte une ligne de reflet et l'affiche en rose. Cette ligne est utilisée
pour soutenir les faces dépouillées.
3. Entrez une valeur d'angle dans le champ Angle. Par exemple, entrez 11. La ligne
de reflet est déplacée en conséquence.
4. Cliquez sur Aperçu pour vous faire une idée de l'aspect que prendra la dépouille.
Cette fonction est fournie uniquement sur Part Design P2.

5. Cliquez sur le bouton Agrandir pour afficher la boîte de dialogue.
6. Activez l'option Dépouille avec Elément de joint et sélectionnez le plan zx comme
élément de joint.
7. Cliquez sur OK pour créer la dépouille.

En suivant la procédure décrite dans cette tâche, vous pouvez maintenant
dépouiller des faces après avoir créé des congés d'arêtes, comme l'illustre
l'exemple ci-dessous :
CATIA détecte la ligne de reflet sur le
La face est dépouillée.
congé sélectionné.

Dépouille à angle variable
Il vous est parfois impossible d'appliquer une dépouille à des faces selon une valeur
d'angle constante, même si vous avez sélectionnez le mode Equerre. Dans cette
tâche, vous apprendrez une nouvelle méthode de création de dépouille qui consiste à
utiliser différentes valeurs d'angle.
Ouvrez le document Draft2.CATPart..
1.
Cliquez sur l'icône de dépouille à angle variable .
Vous pouvez également exécuter la commande Angle de dépouille , puis
cliquer sur l'icône de dépouille à angle variable dans la boîte de dialogue. Pour en
savoir plus, voir Dépouille de base.
La boîte de dialogue Définition de la dépouille s'affiche et l'option de dépouille à
angle variable est activée. Si vous cliquez sur l'icône située à gauche, vous
accédez à la commande permettant de créer des dépouilles de base.
2. Sélectionnez la face sur laquelle vous souhaitez créer une dépouille.
La multisélection de faces non continues en tangence n'est pas possible avec cette
commande.

3. Sélectionnez la face supérieure comme étant l'élément neutre.
Une flèche apparaît sur la pièce, indiquant la direction d'extraction par défaut.
CATIA détecte deux sommets et affiche deux valeurs de rayon identiques.
4. Increase the angle value: seule une valeur est modifiée en conséquence dans la
géométrie.
5. Pour modifier l'autre valeur d'angle, sélectionnez la valeur dans la géométrie et
incrémentez-la dans la boîte de dialogue. Par exemple, entrez 9.
Vous pouvez également
double-cliquer sur cette valeur
pour ouvrir la boîte de dialogue
Edition du paramètre, puis
modifier la valeur.
6. Cliquez sur Aperçu pour visualiser la dépouille à créer. Cette fonction est fournie
uniquement sur Part Design P2.

7. Pour ajouter un point sur l'arête, cliquez sur le champ Points.
8. Cliquez sur un point de l'arête.
Vous pouvez ajouter autant de points que vous le souhaitez. Vous pouvez
également ajouter des points en sélectionnant des plans 3D ou des points 3D.
Dans ce cas, CATIA calcule les intersections entre ces plans et l'arête pour
déterminer les points utiles ou les projections sur l'arête.
Si après avoir cliqué sur les points en question, vous décidez de modifier les faces
à dépouiller ou l'élément neutre, l'application supprime ces points et vous permet
d'en définir d'autres.
Notez que pour retirer un point de la sélection, il vous suffit de cliquer dessus.
CATIA affiche la valeur d'angle sur ce point.
9. Entrez une nouvelle valeur d'angle pour ce point : par exemple, entrez 17. La
nouvelle valeur de rayon s'affiche.
10.Cliquez sur OK pour confirmer l'opération.
La pièce terminée a l'aspect suivant :

Pour en savoir plus...
Arêtes fermées
L'application définit un sommet par défaut sur les arêtes fermées lorsque la
commande Dépouille à angle variable est utilisée. Pour définir une dépouille,
vous devez d'abord supprimer ce sommet puis utiliser des points 3D ou des
plans 3D uniquement.

Dépouille à deux côtés
La commande Dépouille à deux côtés vous permet non seulement d'appliquer une
dépouille à des pièces de base ou à des pièces avec lignes de reflet mais aussi
d'indiquer deux valeurs d'angle différentes pour dépouiller des pièces complexes.
Dans cette tâche, vous apprendrez à dépouiller deux faces avec lignes de reflet, en
spécifiant deux valeurs d'angle différentes et en utilisant les deux modes disponibles.
L'utilisation de cette commande est recommandée aux utilisateurs déjà familiarisés
avec les fonctions de dépouille.
Oouvrez le document Draft4_R07.CATPart...
1. Sélectionnez la commande Affichage -> Barre d'outils -> Dépouille à deux côtés
pour accéder à la barre d'outils Dépouille à deux côtés.
2.
Cliquez sur l'icône Dépouille à deux côtés .
La boîte de dialogue de définition d'une dépouille à deux côtés s'affiche et une
direction d'extraction par défaut apparaît dans la géométrie.

3. Indiquez que vous souhaitez appliquer
une dépouille avec lignes de reflet à
deux faces en cliquant sur les deux
icônes comme indiqué :
Deux modes sont disponibles :
Indépendante : vous devez spécifier deux valeurs d'angle
Menante/menée : la valeur d'angle que vous spécifiez pour une face a une
incidence sur la valeur d'angle de la seconde face.
Dans ce scénario, assurez-vous que l'option Indépendante est activée.
4. Dans la zone Elément neutre, cliquez sur Pas de sélection dans la liste
déroulante et sélectionnez le congé comme indiqué.

L'application affiche la ligne de reflet en rose.
5. Dans la zone Direction d'extraction, cliquez sur 1 Direction et sélectionnez la face
inférieure de la pièce pour spécifier une nouvelle direction d'extraction.
6. Entrez 10 comme valeur d'angle.
7. Cliquez sur l'onglet Elément de joint pour définir l'élément de joint.
8. Cochez l'option Elément de joint et sélectionnez la surface verte comme élément
de joint.
9. Cliquez sur le deuxième onglet pour définir la seconde face à dépouiller.
10. Dans la zone Elément neutre, cliquez sur Pas de sélection dans la liste
déroulante et sélectionnez le second congé.
Les deux faces à dépouiller sont sélectionnées.

11. Entrez 6 comme valeur d'angle.
12. Cliquez sur OK pour confirmer l'opération.
Les deux faces sont dépouillées selon une valeur d'angle distincte, comme
indiqué.
Etant données les valeurs d'angle que vous avez définies, cette opération
conduit à une "étape" où les deux faces dépouillées se rencontrent. Pour éviter
un tel résultat, vous pouvez utiliser l'option Menante/Menée comme expliqué
ci-après.
Utilisation de l'option Menante/Menée
13. Double-cliquez sur Dépouille.1 dans l'arbre des spécifications pour la modifier.
La boîte de dialogue Dépouille à deux côtés s'affiche.

14. Sélectionnez l'option Menante/Menée. Notez que l'option Direction Menante est
activée, ce qui signifie que la valeur d'angle que vous avez spécifiée pour la
première face sélectionnée (10 degrés) est la valeur menante.
Si vous cliquez sur le deuxième onglet, vous observez que le champ de valeur
d'angle n'est plus disponible.
Concrètement, l'application calculera la valeur de la seconde face de manière à
éviter l'"effet étape".
15. Cliquez sur OK pour confirmer l'opération.
L'application a ajusté la seconde face dépouillée.
Si vous préférez que la valeur d'angle spécifiée pour la seconde face
sélectionnée (6 degrés) soit la valeur menante, cliquez sur le deuxième onglet et
sélectionnez Direction Menante.

Coque
Créer une coque signifie creuser un composant tout en conservant une épaisseur
donnée sur les côtés. Une opération de création de coque peut également consister à
ajouter de la matière vers l'extérieur. Dans cette tâche, vous apprendrez à créer une
cavité.
Ouvrez le document Shell1.CATPart.
1. Sélectionnez la face à supprimer.
2.
Cliquez sur l'icône Coque . La boîte de dialogue Définition de la coque
s'affiche.
La face sélectionnée apparaît en
violet.
3. Entrez 15 mm dans le champ
Epaisseur intérieure.

4. Cliquez sur OK.
La coque est créée sur le
composant : la face sélectionnée
reste ouverte. L'arbre des
spécifications reflète cette création.
5. Double-cliquez sur la coque pour la modifier.
6. Cliquez dans le champ Faces à
épaisseurs différentes et
sélectionnez la face comme
indiqué.
7. Double-cliquez sur la valeur d'épaisseur affichée sur la face.
8. Dans la boîte de dialogue qui apparaît, entrez 25 mm et cliquez sur OK.
La longueur entre la face sélectionnée et la coque est de 25 mm.

Epaisseur
Il est parfois nécessaire d'ajouter ou de retirer de la matière avant l'usinage de la pièce. La
commande Epaisseur vous permet d'effectuer cette opération.
Dans cette tâche, vous apprendrez à ajouter de l'épaisseur à une pièce.
Ouvrez le document Thickness1.CATPart.
1.
Cliquez sur l'icône Epaisseur .
La boîte de dialogue Définition de la surépaisseur s'affiche.
2. Sélectionnez les faces à épaissir, c'est-à-dire les deux faces comme indiqué :
Les faces apparaissent en rouge et CATIA affiche la valeur d'épaisseur dans la géométrie.
Entrez une valeur positive. Par exemple,
3.
entrez 15 mm.
4. Cliquez sur OK.
La pièce est épaissie en conséquence.
L'arbre des spécifications reflète cette
création.

5. Double-cliquez sur l'épaisseur pour la modifier.
6. Cliquez dans le champ Faces à épaisseurs
différentes et sélectionnez la face latérale
comme indiqué.
7. Double-cliquez sur la valeur d'épaisseur affichée sur la face.
8. Dans la boîte de dialogue qui apparaît, entrez 25 mm et cliquez sur OK.
La longueur entre la face sélectionnée et la face obtenue est de 25 mm.

Taraudage/filetage
La fonction Taraudage/filetage permet de créer des taraudages ou des filetages, selon
l'entité cylindrique utilisée.
Dans cette tâche, vous apprendrez à tarauder une extrusion cylindrique.
Ouvrez le document Thread.CATPart.
1.
Cliquez sur l'icône Taraudage/filetage .
La boîte de dialogue Définition du taraudage/filetage s'affiche.
2. Sélectionnez la surface cylindrique que vous souhaitez tarauder, c'est-à-dire
Face.1.

3. Sélectionnez la face supérieure comme étant la face limite. Les faces limites
doivent être planes.
L'application affiche l'aperçu du taraudage.
Dans la boîte de dialogue, le cadre Définition géométrique affiche le nom des faces
que vous avez sélectionnées. Le bouton Inverser direction (ainsi que la flèche
dans la zone géométrique) vous permet d'inverser la direction du taraudage si
nécessaire.
Le cadre Définition numérique propose trois types différents de taraudage :
Pas De Standard: utilise les valeurs entrées par l'utilisateur
Métrique Pas Fin: utilise les valeurs standard de norme AFNOR
Métrique Pas Gros: utilise les valeurs de norme AFNOR

Métrique Pas Fin : norme AFNOR
Voir (NF E03-053-1970). Cette référence normative est liée à  NF E03-051-1982)
L'application utilise les valeurs de norme minimales.
| DiamNominal        |      | Pas  | DiamAvTrou |     | M   |
| ------------------ | ---- | ---- | ---------- | --- | --- |
|                    | 8,0  | 1,0  | 6,917      |     |     |
|                    | 9,1  | 1,0  | 7,917      |     |     |
|                    | 10,0 | 1,25 | 8,647      |     |     |
|                    | 12.  | 1,25 | 10,647     |     |     |

|     | 14,0 | 1,5 | 12,376 |     |     |
| --- | ---- | --- | ------ | --- | --- |
|     | 16,0 | 1,5 | 14,376 |     |     |
|     | 18,0 | 1,5 | 16,376 |     |     |
|     | 20,0 | 1,5 | 18,376 |     |     |
|     | 22,0 | 1,5 | 20,376 |     |     |

|     | 24,0 | 2,0 | 21,835 |     |     |
| --- | ---- | --- | ------ | --- | --- |
|     | 27,0 | 2,0 | 24,835 |     |     |
|     | 30,0 | 2,0 | 27,835 |     |     |
|     | 33,0 | 2,0 | 30,835 |     |     |
|     | 36,0 | 3,0 | 32,752 |     |     |

|     | 39,0 | 3,0 | 35,752 |     |     |
| --- | ---- | --- | ------ | --- | --- |
Métrique Pas Gros: norme AFNOR
Voir (NF E03-053-1970). Cette référence normative est liée à  NF E03-051-1982)
L'application utilise les valeurs de norme minimales.

| DiamNominal        |     | Pas  | DiamAvTrou |     | M   |
| ------------------ | --- | ---- | ---------- | --- | --- |
|                    | 1   | 0,25 | 0,729      |     |     |

|     | 1,1 | 0,25 | 0,829 |     |     |
| --- | --- | ---- | ----- | --- | --- |
|     | 1,2 | 0,25 | 0,829 |     |     |
|     | 1,4 | 0,3  | 1,075 |     |     |
|     | 1,6 | 0,35 | 1,221 |     |     |
|     | 1,8 | 0,35 | 1,221 |     |     |

|     | 2,0 | 0,4  | 1,567 |     |     |
| --- | --- | ---- | ----- | --- | --- |
|     | 2,2 | 0,45 | 1,713 |     |     |
|     | 2,5 | 0,45 | 2,013 |     |     |
|     | 3,0 | 0,5  | 2,459 |     |     |
|     | 3,5 | 0,6  | 2,850 |     |     |

|     | 4,0 | 0,7  | 3,242 |     |     |
| --- | --- | ---- | ----- | --- | --- |
|     | 4,5 | 0,75 | 3,688 |     |     |
|     | 5,0 | 0,8  | 4,134 |     |     |
|     | 6,0 | 1,0  | 4,917 |     |     |
|     | 7,0 | 1,0  | 5,917 |     |     |

|     | 8,0  | 1,25 | 6,647  |     |     |
| --- | ---- | ---- | ------ | --- | --- |
|     | 9,0  | 1,25 | 7,647  |     |     |
|     | 10,0 | 1,5  | 8,376  |     |     |
|     | 12,0 | 1,75 | 10,106 |     |     |
|     | 14,0 | 2,0  | 11,835 |     |     |

|     | 16,0 | 2,0 | 13,835 |     |     |
| --- | ---- | --- | ------ | --- | --- |
|     | 18,0 | 2,5 | 15,294 |     |     |
|     | 20,0 | 2,5 | 17,294 |     |     |
|     | 22,0 | 2,5 | 19,294 |     |     |
|     | 24,0 | 3,0 | 20,752 |     |     |

|     | 27,0 | 3,0 | 23,752 |     |     |
| --- | ---- | --- | ------ | --- | --- |
|     | 30,0 | 3,5 | 26,211 |     |     |
|     | 33,0 | 3,5 | 29,211 |     |     |
|     | 36,0 | 4,0 | 31,670 |     |     |
|     | 39,0 | 4,0 | 34,670 |     |     |

|     | 42,0 | 4,5 | 37,129 |     |     |
| --- | ---- | --- | ------ | --- | --- |
|     | 45,0 | 4,5 | 40,129 |     |     |
|     | 48,0 | 5,0 | 42,587 |     |     |
|     | 52,0 | 5,0 | 46,587 |     |     |
|     | 56,0 | 5,5 | 50,046 |     |     |

|     | 60,0 | 5,5 | 54,046 |     |     |
| --- | ---- | --- | ------ | --- | --- |
|     | 64,0 | 6,0 | 57,505 |     |     |
|     | 68,0 | 6,0 | 61,505 |     |     |

72,0 6,0 65,505
76,0 6,0 69,505
80,0 6,0 73,505
85,0 6,0 78,505
90,0 6,0 83,505
4. Dans ce scénario, sélectionnez Pas de Standard. Lorsque vous créez un
taraudage, vous ne pouvez pas modifier la valeur de diamètre. En revanche, si
vous créez un filetage, cette opération est possible.
Lors de la création d'un filetage, si vous souhaitez utiliser des valeurs déjà définies
dans l'un de vos fichiers, cliquez sur le bouton Ajout pour accéder au fichier en
question. Une boîte de dialogue vous permettant d'accéder au fichier contenant
vos valeurs s'affiche. Ce fichier peut être de l'un des types suivants :
fichiers Excel
fichiers Lotus
fichiers tabulatés (sous Unix)
Pour en savoir plus sur l'utilisation de valeurs prédéfinies, reportez-vous à la
section Trous taraudés, étapes 7 et 8. La méthode décrite dans cette tâche est
valable également pour les taraudages et les filetages.
5. Entrez 49 mm pour la profondeur du taraudage.
Notez que les champs Diamètre du support et Hauteur du support sont grisés. Ils
sont purement informatifs.
6. Entrez 1,5 mm comme valeur de pas. Le champ Pas définit la distance entre
chaque crête.
7. Cochez l'option Pas gauche.
8. Cliquez sur Aperçu.
Le taraudage est représenté de manière simplifiée par des lignes rouges.

9. Cliquez sur OK pour confirmer l'opération.
La zone géométrique ne contient aucune représentation géométrique mais le
taraudage (Taraudage.xxx) est ajouté à l'arbre des spécifications. L'icône
correspondante est spécifique à cet élément.
A présent, les valeurs de diamètre, de profondeur et de pas apparaissent sous
l'entité Taraudage dans l'arbre des spécifications.
Si vous créez un filetage, CATIA le nomme également Taraudage.XXX dans
l'arbre des spécifications mais affiche une icône spécifique comme indiqué
ci-dessous :

Vous pouvez extraire des dessins des taraudages et des filetages dans l'atelier
Generative Drafting. Pour en savoir plus, voir le manuel Guide de l'utilisateur
Generative Drafting Version 5.
Cavités sur des surfaces cylindriques
Si la cavité est un trou, utilisez les options disponibles dans la boîte de
dialogue Définition du trou comme décrit dans la section Trous taraudés.
Si la cavité est une gorge ou une poche définie sur une surface cylindrique,
vous devez utiliser un plan tangent à la surface comme face limite.

Composants issus d'une surface
Création d'un découpage: Cliquez sur l'icône correspondante, sélectionnez le corps
à découper puis l'élément de coupe.
Création d'une surface épaisse: Cliquez sur l'icône correspondante, sélectionnez
l'objet à épaissir, définissez les directions de décalage et entrez les valeurs de
décalage.
Création d'une surface fermée : Cliquez sur l'icône correspondante, sélectionnez le
corps puis l'objet à fermer.
Création d'une surface de couture : Cliquez sur l'icône correspondante, sélectionnez
le corps puis la surface à coudre.

Division
Vous pouvez diviser un corps avec un plan, une face ou une surface. L'objet de cette
tâche est de montrer comment diviser un corps avec une surface.
Ouvrez le document Split1.CATPart.
1. Sélectionnez l'extrusion bleue en tant que corps à diviser.
2.
Cliquez sur l'icône Division .
3. Sélectionnez la surface de division.
La boîte de dialogue Définition d'une division apparaît, elle indique l'élément de
division.
Une flèche apparaît indiquant la portion de corps qui est conservée. Si cette flèche
pointe dans le mauvais sens, vous pouvez cliquer dessus pour en inverser le sens.

4. Cliquez sur OK.
Le corps est divisé. De la matière a été retirée.
L'arbre des spécifications indique que vous avez effectué cette opération.

Surface épaisse
Vous pouvez ajouter de la matière à une surface dans les deux directions opposées
en utilisant la fonction Surface épaisse. Dans cette tâche, vous apprendrez à effectuer
cette opération.
Ouvrez le document ThickSurface1.CATPart.
1. Sélectionnez l'objet que vous voulez épaissir, autrement dit l'élément extrudé.
2. Cliquez sur l'icône Surface épaisse .
La boîte de dialogue Définition d'une
surface épaisse s'affiche.
Dans la zone géométrique, la flèche qui
apparaît sur l'élément extrudé indique la
première direction.
3. Entrez la valeur 25 mm pour la première
valeur de décalage et la valeur 12 mm
pour la seconde.

4. Cliquez sur OK.
La surface est épaissie. L'arbre des
spécifications indique que vous avez
effectué cette opération.
Notez que le composant obtenu ne
conserve pas la couleur de la surface
d'origine.

Remplissage
Dans cette tâche, vous apprendrez à remplir les surfaces.
Ouvrez le document CloseSurface1.CATPart.
1. Sélectionnez la surface à remplir, soit
Trim.3.
Cliquez sur l'icône Remplissage .
2.
La boîte de dialogue Définition du
remplissage s'affiche.
3. Cliquez sur OK.
Le remplissage est créé. L'arbre des
spécifications indique que vous avez
effectué cette opération.

Surface de couture
Une couture consiste à joindre une surface à un corps. Cette fonctionnalité calcule
l'intersection entre une surface donnée et un corps tout en retirant la matière inutile.
Vous pouvez coudre tous les types de surfaces sur des corps. Dans cette tâche, vous
apprendrez à effectuer cette opération.
Ouvrez le document SewSurface1.CATPart.
1. Sélectionnez la surface que vous voulez coudre sur le corps, autrement dit la
surface orange.
2.
Cliquez sur l'icône Couture de surface .
La boîte de dialogue Définition de la couture
s'affiche, indiquant l'objet à coudre.
Une flèche apparaît et indique la partie du corps qui sera conservée. Cliquez sur
3. la flèche pour inverser la direction. La flèche doit pointer dans la direction
indiquée :
4. Cliquez sur OK.
La surface est cousue sur le corps. De la matière a été retirée. L'arbre des
spécifications indique que vous avez effectué cette opération.

Composants de transformation
Création d'une translation: Cliquez sur l'icône Translation, sélectionnez le corps à
translater, définissez la direction de translation et entrez une valeur pour la distance.
Création d'une rotation : Cliquez sur l'icône Rotation, sélectionnez le corps à faire
pivoter, définissez l'axe de rotation et entrez la valeur de l'angle.
Création d'une symétrie : Cliquez sur l'icône Symétrie, sélectionnez le corps à
dupliquer et définissez la référence de la symétrie.
Création d'une symétrie miroir : Cliquez sur l'icône Symétrie, sélectionnez le corps à
dupliquer et définissez la référence.
Création d'une répétition rectangulaire: Cliquez sur l'icône Répétition rectangulaire,
sélectionnez le composant à dupliquer, définissez les directions de création,
choisissez les paramètres à définir et configurez-les.
Création d'une répétition circulaire: Cliquez sur l'icône Répétition circulaire,
sélectionnez le composant à dupliquer, définissez la référence axiale, la direction de
création, choisissez les paramètres à définir et configurez-les.
Création d'une répétition: Cliquez sur l'icône Répétition, sélectionnez le composant à
dupliquer, indiquez si vous conservez les spécifications d'origine et définissez les
positions.
Décomposition de répétitions: Cliquez avec le bouton droit de la souris sur la
répétition que vous voulez décomposer et sélectionnez la commande contextuelle
RectPattern.1object -> Décomposer....
Création d'un facteur d'échelle: Cliquez sur l'icône Facteur d'échelle, sélectionnez le
corps à transformer, définissez la référence et entrez une valeur de facteur.

Translation
La commande Translation s'applique aux corps courants.
Dans cette tâche, vous apprendrez à appliquer une translation à un corps.
Ouvrez le document de votre choix.
1.
Cliquez sur l'icône Translation .
La boîte de dialogue Définition de la translation s'affiche.
2. Sélectionnez une ligne afin d'obtenir l'orientation de la direction de translation ou un
plan afin d'obtenir l'axe de la direction de translation. Par exemple, sélectionnez le
plan zx.
Vous pouvez également indiquer la direction à l'aide des vecteurs X, Y, Z en
utilisant le menu contextuel dans la zone Direction.
3. Spécifiez la distance de translation en entrant une valeur ou en utilisant le
manipulateur de déplacement. Par exemple, entrez 100 mm.
4. Cliquez sur OK pour créer l'élément de
translation.
L'élément (nommé Translat.xxx) vient s'ajouter
à l'arbre des spécifications

Rotation
Dans cette tâche, vous apprendrez à faire tourner une géométrie autour d'un axe. La
commande s'applique aux corps courants.
0-
Ouvrez le document Rotate1.CATPart.
1.
Cliquez sur l'icône Rotation icon .
La boîte de dialogue Définition d'une rotation s'affiche.
2. Sélectionnez une arête comme axe de rotation.
3. Entrez une valeur pour l'angle de rotation.
L'élément a subi une rotation. Vous pouvez le faire glisser en utilisant le
manipulateur graphique pour ajuster la rotation.

4. Cliquez sur OK pour créer l'élément de rotation.
L'élément (identifié en tant que Rotate.xxx) vient s'ajouter à l'arbre des
spécifications.

Symétrie
Dans cette tâche, vous apprendrez à transformer une géométrie grâce à une
opération de symétrie. La commande Symétrie s'applique aux corps courants.
Ouvrez le document Symmetry1.CATPart.
1.
Cliquez sur l'icône Symétrie .
La boîte de dialogue Définition d'une symétrie s'affiche.
2. Sélectionnez un point, une ligne ou un plan qui servira d'élément de référence. Pour
les besoins de ce scénario, sélectionnez le plan zx.
3. Cliquez sur OK pour créer l'élément symétrique.
L'élément d'origine n'est plus visible mais apparaît toujours dans l'arbre des
spécifications.
Le nouvel élément (nommé Symétrie.xxx) vient s'ajouter à l'arbre des spécifications.

Miroir
La fonction Miroir permet de dupliquer un corps ou une liste de composants à l'aide
d'une symétrie. Vous pouvez sélectionner une face ou un plan pour définir la
référence de symétrie.
Dans cette tâche, vous apprendrez à appliquer une symétrie à une liste de
composants.
Ouvrez le document EdgeFillet3.CATPart.
1. Sélectionnez les deux extrusions à dupliquer.
2.
Cliquez sur l'icône Symétrie .
La boîte de dialogue Définition de la
symétrie apparaît.
3. Sélectionnez la face latérale pour définir la référence de symétrie.
L'application donne un aperçu de la matière à créer.
4. Cliquez sur OK pour confirmer
l'opération.
Les extrusions sont dupliquées.
L'arbre des spécifications fait état de
cette création.

L'utilisation d'un plan pour appliquer une symétrie à un corps vous permet
d'obtenir deux portions indépendantes de matière dans le même corps. La
symétrie suivante est obtenue par l'utilisation du plan zx comme référence.

Répétition rectangulaire
Vous pouvez avoir besoin de dupliquer toute la géométrie d'un ou plusieurs composants et de la
positionner sur une pièce. Les répétitions permettent cette opération.
CATIA vous permet de définir trois types de répétitions :rectangulaire, circulaire et personnalisée .
Ces fonctions accélèrent le processus de création.
Dans cette tâche, vous apprendrez à dupliquer directement la géométrie d'une poche à
l'emplacement de votre choix à l'aide d'une répétition rectangulaire. Ensuite, vous apprendrez
à modifier l'emplacement du composant initial.
Ouvrez le document RectangularPattern1.CATPart.
1. Sélectionnez le composant à copier, c'est-à-dire la poche, comme indiqué ici :
2.
Cliquez sur l'icône Répétition rectangulaire .
La boîte de dialogue Répétition rectangulaire s'affiche et indique le nom de la géométrie à
dupliquer.
Si vous cliquez sur l'icône Répétition rectangulaire avant de sélectionner une
géométrie, par défaut, l'objet à dupliquer est le solide courant. Pour plus d'informations,
reportez-vous à la rubrique Répétition de solides courants.

Si vous changez d'avis et décidez de dupliquer le solide courant, cliquez dans le champ
Objet et utilisez la commande contextuelle "Donne le solide courant".
Chaque onglet correspond à une direction que vous utiliserez pour définir l'emplacement
du composant dupliqué. Dans cette tâche, vous commencerez par définir les
spécifications pour la première direction.
En cochant l'option Conserver les spécifications, vous pouvez créer des instances avec la
limite Jusqu'au Suivant (Jusqu'au dernier, Jusqu'au plan ou Jusqu'à la surface) définie
pour le composant original. Dans l'exemple ci-dessous, la limite définie pour l'extrusion,
c'est-à-dire la limite "Jusqu'à la surface", s'applique à toutes les instances. Étant donné
que la surface de limitation n'est pas plane, les instances sont de différentes longueurs.

Pourtant pour notre scénario, comme la hauteur de poche est spécifiée, il est inutile
d'activer l'option Conserver les spécifications.
3. Cliquez sur le champ Elément de référence et sélectionnez l'arête comme indiqué plus
haut pour la spécification de la première direction de création.
Une flèche s'affiche sur l'extrusion. Vous pouvez sélectionner le bouton Inverser ou
cliquez sur la flèche pour modifier la direction.
Pour définir une direction, vous pouvez sélectionner une arête ou une face planaire.
4. Utilisez les options Instances & Espacement pour définir les paramètres à spécifier.
Les paramètres que vous pouvez définir sont les suivants :
Instances & longueur
Instances & espacement
Espacement & longueur
Si vous sélectionnez Instances & Espacement, le champ Longueur est inactif car
l'application n'a plus besoin de cette spécification pour espacer les instances.
5. Entrez 3 comme nombre d'instances que vous souhaitez obtenir dans la première
direction.
La suppression des instances de votre choix est possible lors de la création de la
répétition. Dans la vue en mode aperçu de la répétition, il vous suffit de sélectionner les
points matérialisant ces instances. Au contraire, si vous sélectionnez de nouveau ces
points, CATIA créera les instances correspondantes.

6. Définition de l'espacement le long de la grille : entrez 14 mm.
Si vous définissez l'espacement le long de la grille et la longueur de votre choix,
l'application calcule le nombre d'instances possibles et les espaces à des distances
régulières.
7. Cliquez sur l'onglet Seconde direction pour définir d'autres paramètres.
Remarquez que la définition d'une seconde direction n'est pas obligatoire. La création d'un
rectangle définissant uniquement une direction est possible.
8. Cliquez sur le champ Elément de référence et sélectionnez l'arête comme indiqué
ci-dessous pour définir la seconde direction.
9. Activez l'option Inverser pour que la flèche pointe dans la direction opposée.
10. Gardez l'option Instances & espacement : entrez 3 et 10 mm dans les champs appropriés.

11. Cliquez sur Aperçu pour vérifier que la répétition répond à vos besoins.
Les poches supplémentaires seront alignées dans cette seconde direction.
12. Cliquez sur OK pour répéter la géométrie de la poche neuf fois.
Voici la répétition obtenue. Le composant "RépétitionRect.1" apparaît dans l'arbre des
spécifications.

13. Editons maintenant la répétition pour la rendre plus complexe : double-cliquez sur la
répétition pour afficher la boîte de dialogue.
14. Cliquez sur le bouton Agrandir pour afficher la totalité de la boîte de dialogue.
Les options disponibles permettent de positionner la répétition.
15. Pour modifier la position des poches, entrez -5 degrés comme valeur d'angle de rotation.
16. Cliquez sur Aperçu.
Vous remarquerez que toutes les poches ont été légèrement déplacées :

17. Vous allez maintenant modifier l'emplacement de la poche initiale. Pour ce faire, entrez 2
dans le champ Rangée dans la première direction.
L'application affiche le déplacement de la répétition en mode aperçu. Elle sera déplacée
dans la direction indiquée :
18. Enfin, entrez 2 dans le champ Rangée dans la seconde direction.
L'application affiche le déplacement de la répétition en mode aperçu. Il sera déplacé le
long des deux directions définies aux étapes 17 et 18 :

L'option "Représentation simplifiée" vous permet d'alléger la géométrie de la répétition.
Sélectionnez cette option et double-cliquez sur les instances que vous ne voulez pas voir.
Les instances sont représentées en pointillés durant la définition de la répétition puis ne
sont plus visible après validation de la création de répétition. Les spécifications restent
inchangées quel que soit le nombre d'instances que vous visualisez. Cette option est
utilisée en particulier pour les répétitions comportant un grand nombre d'instances.
Gardez présent à l'esprit qu'un simple clic sur une instance supprime cette dernière des
spécifications. Cette action ne produit donc pas le même résultat que que le double-clic.
19. Cliquez sur OK.
L'application a changé l'emplacement de toutes les poches. Seules quatre d'entre elles
restent sur l'extrusion.
CATIA Version 5 permet de créer des répétitions cartésiennes avec des espacements
variables. Pour ce faire, définissez des formules. En d'autres termes, définissez les
paramètres More i et j. Pour plus d'informations, reportez-vous au Guide de l'utilisateur
CATIA- Knowledge Advisor Version 5.
Lors de votre conception, vous pouvez avoir besoin de retravailler certaines instances.
Vous devrez alors utiliser la commande contextuelle Décomposer pour supprimer la
répétition tout en conservant la géométrie. Pour plus d'informations, reportez-vous à la
rubrique Décomposition de répétitions.
Répétitions complexes
Vous pouvez répéter des composants de Part Design en procédantde la manière suivante :
1. Sélectionnez les composants à dupliquer.
Ces composants doivent appartenir au même corps.

2. Cliquez sur l'icône Répétition
rectangulaire .
Les composants sont indiqués
dans le champ Objet.
3. Définissez les paramètres dont vous avez besoin comme indiqué dans la tâche ci-dessus.
Les règles suivantes doivent être gardées à l'esprit avant de procéder à la répétition d'une
liste de composants :
Lors d'une multi-sélection, le premier composant que vous sélectionnez ne doit pas
être un composant d'habillage.
La liste des composants ne doit pas contenir de composants de transformation,
coques, découpages, ou corps associés.
Elle ne peut inclure aucun corps.
Edition d'une liste de composants
L'édition d'une liste de composants consiste en l'ajout ou le retrait d'éléments de cette
liste. Pour ce faire, il vous suffit de cliquer sur le champ Objet et de sélectionner le
composant désiré pour l'ajouter à la liste ou l'en retirer.
Notez toutefois que l'ajout d'un composant à une répétition n'est possible que si cette
dernière est déjà basée sur une lise de composants. En d'autres termes, vous ne pouvez
pas ajouter de composant à une répétition élémentaire créée à l'aide d'un seul
composant.
Répétition de solides courants
Un solide courant est composé d'un ou plusieurs composants appartenant au même
corps. Il est le résultat d'opérations indiquées dans l'arbre des spécifications, la dernière
opération étant l'opération en cours. Pour en savoir plus sur les composants courants,
voir la section Parcours de la pièce et définition des objets séparément.

Pour dupliquer un solide courant, cliquez sur l'icône Répétition rectangulaire . Il n'est
pas nécessaire de sélectionner une géométrie. Par défaut, l'objet à répéter est le solide
courant. Il vous suffit alors d'entrer vos spécifications dans la boîte de dialogue.
Si vous changez d'avis et décidez de dupliquer un composant, cliquez dans le champ
Objet et sélectionnez le composant de votre choix.
Dans l'exemple suivant, le solide courant est le résultat d'une extrusion et d'un trou.
Les instances créées via la commande Répétition sont composées d'extrusions et de
trous uniquement.
Vous ne pouvez pas transformer une liste de composants dupliqués en un solide courant
dupliqué et vice-versa.

Répétition circulaire
Dans cette tâche, vous apprendrez à dupliquer une géométrie d'un ou plusieurs composants
directement à l'emplacement de votre choix à l'aide d'une répétition circulaire.
Assurez-vous que l'élément à dupliquer est correctement placé par rapport à l'axe de rotation
circulaire.
Ouvrez le document CircularPattern1.CATPart.
1. Sélectionnez la géométrie que vous souhaitez copier.
2.
Cliquez sur l'icône Répétition circulaire .
La boîte de dialogue Définition d'une répétition circulaire s'affiche et le nom du composant
apparaît dans le champ Objet.
Si vous changez d'avis et décidez de dupliquer le solide courant, cliquez dans le champ
Objet et utilisez la commande contextuelle "Donne le solide courant". Pour plus
d'informations, reportez-vous à la section Répétition de solides courants.
En cochant l'option Conserver les spécifications, vous pouvez créer des instances avec la
limite ( Jusqu'au suivant, Jusqu'au dernier, Jusqu'au plan, Jusqu'à la surface) définie pour le
composant original. L'exemple ci-dessous montre que la limite définie pour l'extrusion,
c'est-à-dire la limite "Jusqu'à la surface", s'applique à toutes les instances. Étant donné que
la surface de limitation n'est pas plane, les instances sont de différentes longueurs.
Pourtant, dans le cas de notre scénario, comme l'extrusion est répétée sur une surface
plane, il est inutile d'activer l'option Conserver les spécifications.

Le champ Paramètres vous permet de choisir le type de paramètres que vous souhaitez
spécifier pour que CATIA puisse calculer l'emplacement des éléments copiés.
Ces paramètres sont :
Instances & angle total
Instances & espacement angulaire
Espacement angulaire & angle total
Couronne entière
3. Utilisez les options Instances & Espacement angulaire pour définir les paramètres à
spécifier.
4. Entrez 7 comme nombre d'extrusions que vous souhaitez obtenir.
5. Entrez 50 degrés comme espacement angulaire.
6. Cliquez sur le champ Elément de référence et sélectionnez la face supérieure pour
déterminer l'axe de rotation. Cet axe sera perpendiculaire à la face.
En cliquant sur le bouton Inverser, vous pouvez inverser le sens.
Deux flèches apparaissent, à présent, sur l'extrusion.
Pour définir une direction, vous pouvez sélectionner une arête ou une face plane.

Si vous modifiez l'espacement angulaire, CATIA affiche un aperçu du résultat : les flèches 1
et 2 sont déplacées en conséquence.
8. Cliquez sur Aperçu : l'extrusion sera répétée sept fois. Les instances apparaissent en vert,
comme le composant original.
9. Vous allez maintenant ajouter une couronne à la pièce. Pour ce faire, cliquez sur l'onglet
Définition de la couronne.
10. Utilisez les options Cercle & Espacement de cercles pour définir les paramètres à spécifier.
11. Entrez 2 dans le champ Cercle(s).
12. Entrez -18 mm dans le champ Espacement de cercles.
Ce graphique peut vous être utile pour configurer vos paramètres :

13. Cliquez sur OK.
Voici les nouvelles instances :
14. Vous allez maintenant modifier la position de l'extrusion initiale. Cette modification affectera
toutes les instances. Pour ce faire, cliquez sur le bouton Agrandir pour afficher la totalité de
la boîte de dialogue.
15. Entrez 20 dans le champ Angle de rotation.
CATIA donne un aperçu de la rotation.

L'exécution de la commande Supprimer sur une instance entraîne la suppression de la
totalité de la répétition. Cependant, la suppression des instances de votre choix est possible
lors de la création ou de la modification de la répétition. Pour ce faire, il vous suffit de
sélectionner les points matérialisant ces instances dans la vue en mode aperçu de la
répétition. Si vous sélectionnez de nouveau ces points, CATIA conservera les instances
correspondantes.
L'option "Représentation simplifiée" vous permet d'alléger la répétition de la géométrie.
Sélectionnez cette option et double-cliquez sur les instances que vous ne voulez pas voir.
Les instances sont représentées en pointillés durant la définition de la répétition puis ne sont
plus visible après validation de la création de répétition. Les spécifications restent
inchangées quel que soit le nombre d'instances que vous visualisez. Cette option est utilisée
en particulier pour les répétitions comportant un grand nombre d'instances.
Gardez présent à l'esprit que cliquer et double-cliquer sur une instance ne donnent pas le
même résultat.
16. Cliquez sur OK.
Toutes les instances sont déplacées en conséquence.
Le scénario précédent ne montre pas l'utilisation de l'option "Alignement des instances". Outre
l'exécution des étapes précédemment décrites, vous pouvez également utiliser cette option pour
définir l'orientation des instances.

L'option est activée : toutes les instances L'option est désactivée : toutes les instances sont
ont la même orientation que le composant perpendiculaires aux droites tangentes au cercle.
initial.
CATIA permet de créer des répétitions polaires (par exemple, des répétitions en spirale). Pour ce
faire, définissez des formules en utilisant les paramètres i et j. Pour plus d'informations sur les
formules, reportez-vous au Guide de l'utilisateur CATIA- Knowledge Advisor Version 5.
Lors de votre conception, vous pouvez avoir besoin de retravailler certaines instances. Vous devrez
alors utiliser la commande contextuelle Décomposer pour supprimer la répétition tout en conservant
la géométrie. Pour plus d'informations, reportez-vous à la rubrique Décomposition de répétitions.
Répétitions complexes
Vous pouvez répéter une liste de composants Part Design en procédant de la manière suivante :
1. Sélectionnez les composants à dupliquer.
Ces composants doivent appartenir au même corps.
2.
Cliquez sur l'icône Répétition circulaire .
Les composants sont indiqués dans le champ
Objet.
3. Définissez les paramètres dont vous avez besoin comme indiqué dans la tâche ci-dessus.
Les règles suivantes doivent être gardées à l'esprit avant de procéder à la répétition d'une liste
de composants :
Lors d'une multi-sélection, le premier composant que vous sélectionnez ne doit pas être
un composant d'habillage.
La liste des composants ne doit pas contenir de composant de transformation, coque,
découpage, ou corps associés.
Elle ne peut inclure aucun corps.

Edition d'une liste de composants
L'édition d'une liste de composants consiste en l'ajout ou le retrait d'éléments de cette liste.
Pour ce faire, il vous suffit de cliquer sur le champ Objet et de sélectionner le composant désiré
pour l'ajouter à la liste ou l'en retirer.
Notez toutefois que l'ajout d'un composant à une répétition n'est possible que si cette dernière
est déjà basée sur une lise de composants. En d'autres termes, vous ne pouvez pas ajouter de
composant à une répétition élémentaire créée à l'aide d'un seul composant.

Répétition personnalisée
La commande Répétition vous permet de dupliquer un composant, une liste de
composants ou un corps résultant d'une association de corps. autant de fois que
vous le souhaitez aux emplacements de votre choix.
Positionner les occurrences consiste à indiquer des points d'ancrage. Ces points
sont créés dans l'atelier d'esquisse Sketcher.
Cette tâche vous montre comment dupliquer une liste de composants comportant
une poche et un congé aux points définis dans un même plan d'esquisse.
Ouvrez le document UserPattern1.CATPart.
1. Sélectionnez la poche arrondie que vous souhaitez dupliquer.
Lorsque vous utilisez une liste de composants, vous devez multi-sélectionner
les composants dans l'ordre de leur création.
2.
Cliquez sur l'icône Répétition .
La boîte de dialogue Répétition s'affiche. La poche et le congé apparaissent
dans le champ Objet.
Si vous cliquez sur l'icône Répétition avant de sélectionner une
géométrie, l'objet à dupliquer est, par défaut, le solide courant. Pour plus
d'informations, reportez-vous à la section Répétition de solides courants.

Si vous changez d'avis et décidez de dupliquer le solide courant, cliquez
dans le champ Objet et utilisez la commande contextuelle "Donne le solide
courant".
En cochant l'option Conserver les spécifications, vous pouvez créer des
instances avec la limite (Jusqu'au suivant, Jusqu'au dernier, Jusqu'au plan,
Jusqu'à la surface) définie pour le composant original. Dans notre scénario, le
trou a été créé à l'aide de l'option Jusqu'au suivant, mais comme le support des
trous est une extrusion avec une valeur d'épaisseur paire (20 mm), cette option
est inutile.
L'option "Conserver les spécifications" n'est pas disponible pour les listes de
composants.
3. Sélectionnez "Esquisse 4" dans l'arbre des
spécifications et cliquez sur Aperçu.
L'esquisse comprend les neuf points vous
permettant de positionner les trous
dupliqués.

Comme vous n'avez besoin que de huit
4. points, cliquez sur les deux points inutiles
pour les désélectionner.
Par défaut, l'application place chaque instance en fonction du centre de gravité
de l'élément à dupliquer. Pour modifier cette position, cliquez sur le champ
ancrage et sélectionnez un sommet ou un point.
5. Cliquez sur OK.
Les poches et les congés sont créés aux points de l'esquisse. L'arbre des
spécifications reflète cette création.
Edition d'une liste de composants
L'édition d'une liste de composants consiste en l'ajout ou le retrait d'éléments
de cette liste. Pour ce faire, il vous suffit de cliquer sur le champ Objet et de
sélectionner le composant désiré pour l'ajouter à la liste ou l'en retirer.
Notez toutefois que l'ajout d'un composant à une répétition n'est possible que
si cette dernière est déjà basée sur une lise de composants. En d'autres
termes, vous ne pouvez pas ajouter de composant à une répétition élémentaire
créée à l'aide d'un seul composant.

Décomposition de répétitions
Lors de votre conception, vous pouvez avoir besoin de retravailler certaines
instances. Vous devrez alors utiliser la commande contextuelle Décomposer
pour supprimer la répétition tout en conservant la géométrie. Pour plus
d'informations, reportez-vous à la rubrique Décomposition de répétitions.

Décomposition de répétitions
Au cours de votre conception, vous pouvez décider d'effectuer des opérations spécifiques sur un certain
nombre d'instances créées via la commande Répétition. Avant d'effectuer ces opérations, vous devez
décomposer la répétition, ce qui rend chaque instance indépendante.
Dans cette tâche, vous apprendrez à supprimer une répétition tout en conservant la géométrie.
La commande Décomposer peut être appliquée à des répétitions créées avec des composants et des listes
de composants, mais pas avec des corps.
Ouvrez le documentRectangularPattern1.CATPart et effectuez une répétition de base.
1. Cliquez avec le bouton droit de la souris sur la répétition que vous souhaitez décomposer.
2. Utilisez la commande contextuelle RépétitionRect.1objet -> Décomposer... .
Vous obtenez dans l'arbre des spécifications autant de composants qu'il y a d'instances. La
géométrie reste inchangée.

Notez que :
si l'élément original que vous avez répété contient un composant d'habillage, par exemple un
congé, la décomposition de la répétition ne supprime pas le congé défini sur chaque instance.
Toutefois, si un composant d'habillage a été défini sur une instance de répétition, la
décomposition de la répétition supprimera ce composant.
3. Vous pouvez maintenant éditer les poches séparément. Par exemple, vous pouvez les transférer à
l'emplacement de votre choix.

Facteur d'échelle
Mettre un corps à l'échelle revient à le redimensionner en fonction des valeurs
spécifiées.
Dans cette tâche, vous apprendrez à mettre un corps à l'échelle par rapport à un
point.
Ouvrez le document Scaling1.CATPart.
1. Sélectionnez le corps à mettre à l'échelle.
2.
Cliquez sur l'icône Facteur d'échelle .
La boîte de dialogue Définition du facteur
d'échelle s'affiche.
3. Sélectionnez le point de référence situé sur le corps.
Un manipulateur graphique apparaît sur le corps.
4. Entrez une valeur dans le champ Ratio ou sélectionnez le manipulateur et faites-le
glisser. Le facteur d'échelle augmente à mesure que vous déplacez le
manipulateur dans la direction indiquée par la flèche droite.

5. Cliquez sur OK.
Le corps est mis à l'échelle. L'arbre des spécifications indique que vous avez
effectué cette opération.
Vous pouvez également redimensionner un corps en fonction d'une face ou d'un
plan. Dans l'exemple ci-après, le plan zx représente l'élément de référence et le
facteur d'échelle est égal à 1,6. Vous obtenez une affinité.

Eléments de référence
Création d'un point: Cliquez sur cette icône, choisissez un mode de création puis
définissez les paramètres requis.
Création d'une droite : Cliquez sur cette icône, choisissez le mode de création puis
définissez les paramètres requis.
Création d'un plan : Cliquez sur cette icône, choisissez un mode de création puis
définissez les paramètres requis.

Création de points
Cette tâche indique les différentes méthodes de création de points :
par coordonnées ;
sur une courbe ;
sur un plan ;
sur une surface ;
au centre d'un cercle ;
tangent à une courbe ;
entre deux points.
Ouvrez le document Points3D-1.CATPart.
1. Cliquez sur l'icône Point .
La boîte de dialogue
Coordonnées du point
s'affiche.
2. Utilisez la zone de liste pour choisir
le type de point voulu.
Par coordonnées
Entrez les coordonnées X, Y, Z dans le repère courant.
Sélectionnez un point de référence (facultatif).
Le point correspondant s'affiche.
Lorsque vous créez un point dans un repère défini par l'utilisateur, notez que le bouton
de vérification Coordonnées dans le repère absolu est ajouté à la boîte de dialogue. Il
vous permet de définir ou simplement de trouver les coordonnées du point dans le
repère par défaut du document.

Sur une courbe
Sélectionnez une courbe.
Sélectionnez un point de référence
(facultatif).
Si ce point n'est pas situé sur
la courbe, il est projeté sur
celle-ci.
Si aucun point n'est
sélectionné, l'extrémité de la
courbe est prise comme
référence.
Sélectionnez une case d'option pour indiquer où le point doit être créé :
à une distance donnée le long de la courbe à partir du point de
référence,
à une fraction donnée de la distance séparant le point de référence de
l'extrémité de la courbe.
Entrez la distance ou le rapport
désiré.
Si une distance est spécifiée, il
peut s'agir :
d'une distance géodésique :
la distance est mesurée le
long de la courbe.
d'une distance euclidienne :
la distance est mesurée en
fonction du point de
référence (valeur absolue).
Le point correspondant s'affiche.
Vous pouvez également :
cliquer sur le bouton Extrémité la plus proche pour afficher le point à l'extrémité
la plus proche de la courbe ;
cliquer sur le bouton Point milieu pour afficher le point situé au milieu de la
courbe ;
cliquer sur le bouton Inverser la direction pour afficher :
le point situé de l'autre côté du point de référence (si un point a été
sélectionné préalablement)
le point à partir de l'autre extrémité (si aucun point n'a été sélectionné
initialement).
cocher la case Répète l'objet après OK pour créer des points équidistants sur la
courbe en utilisant comme référence le point créé (voir la section Création de
points multiples du manuel Wireframe and Surface - Guide de l'utilisateur

Pour créer des plans
normaux à la courbe en ces
points, cochez la case
Création de plans normaux,
et pour créer toutes les
instances d'un nouveau corps
surfacique, cochez la case
Création dans un nouveau
corps Surfacique.
Si la case n'est pas cochée,
les instances sont créées
dans le corps surfacique
courant.
Si la courbe est infinie et qu'aucun point de référence n'est donné de façon
explicite, par défaut, la référence utilisée est le point de projection de l'origine du
modèle.
S'il s'agit d'une courbe fermée, le système détecte un sommet sur la courbe qui
peut être utilisé comme point de référence ou crée un point extremum et le met
en évidence (vous pouvez alors en sélectionner un autre si vous le souhaitez)
ou bien il vous invite à sélectionner manuellement un point de référence.
Sur un plan
Sélectionnez un plan.
Sélectionnez un point de référence pour le calcul des coordonnées dans le plan
(facultatif).
Si aucun point n'est sélectionné, la projection de l'origine du modèle sur le
plan sert de référence.
Cliquez dans le plan pour afficher un point.
Sur une surface
Sélectionnez la surface sur
laquelle le point doit être créé.
Sélectionnez éventuellement un
point de référence. Par défaut, le
centre de la surface sert de
référence.
Vous pouvez sélectionner un
élément ou un plan, dont
l'orientation ou la normale,
respectivement, servira de
direction de référence.
Vous pouvez également utiliser le
menu contextuel pour définir les
valeurs X, Y, Z de la direction de
référence.

Entrez une distance le long de la
direction de référence pour
afficher un point.
Centre du cercle
Sélectionnez un cercle, un arc de
cercle ou une ellipse.
Un point apparaît au centre
de l'élément sélectionné.
Tangent à une courbe
Sélectionnez une courbe plane et
une droite de direction.
Un point apparaît à chaque
tangente.
La boîte de dialogue de gestion de la connectivité s'affiche car plusieurs
points sont générés.
Cliquez sur OUI : vous pouvez alors sélectionner un élément de référence par
rapport auquel seul le point le plus proche est créé.
Cliquez sur NON : tous les points sont créés.
Entre deux points
Sélectionnez deux points
quelconques.
Indiquez le rapport, qui est le
pourcentage de la distance à partir
du premier point sélectionné
correspondant à l'endroit où doit
se trouver le nouveau point.
Vous pouvez également cliquer
sur le bouton Point milieu pour
créer un point situé
rigoureusement médian (rapport =
0,5).

Utilisez le bouton Inverser la
direction pour mesurer le rapport à
partir du deuxième point
sélectionné.
Si la valeur du rapport est supérieure à 1,
le point est situé sur la droite virtuelle
au-delà des points sélectionnés.
3. Cliquez sur OK pour créer le point.
Le point (identifié par Point.xxx) est ajouté à l'arbre des spécifications.

Création de droites
Cette tâche montre les différentes méthodes de création de droites :
point à point ;
point et direction ;
angle/normale à une courbe ;
tangente à une courbe ;
normale à une surface ;
bissectrice.
Ouvrez le document Lines1.CATPart.
1. Cliquez sur l'icône Droite .
La boîte de dialogue
Définition de la droite
s'affiche.
2. Utilisez la liste déroulante pour
sélectionner le type de droite.
Un type de droite est parfois proposé automatiquement, en fonction de la sélection du
premier élément.
Point - Point
Sélectionnez deux points.
Une droite s'affiche entre ces deux points.
Les points de début et de fin proposés pour la nouvelle droite apparaissent.
Spécifiez les points de début et de fin de la nouvelle droite, soit l'emplacement
du second point de la droite par rapport aux points initialement sélectionnés.
Ces point début et fin doivent être impérativement situés au-delà des points
sélectionnés, autrement dit la droite ne peut pas être plus courte que la distance
entre les points initiaux.
Sélectionnez l'option Extension symétrique pour créer une droite symétrique par
rapport aux points début et fin sélectionnés.

Point - Direction
Sélectionnez un point de référence et une droite de direction.
Un vecteur parallèle à la droite de direction apparaît au point de référence.
Les points de début et de fin proposés pour la nouvelle droite apparaissent.
Spécifiez les points de début et de fin de la nouvelle droite.
La droite correspondante s'affiche.
Angle/Normale à une courbe
Sélectionnez une courbe de
référence et une surface
support contenant cette
courbe.
Sélectionnez un point sur la
courbe.
Entrez une valeur d'angle.
Une droite apparaît à l'angle donné suivant la tangente à la courbe de
référence au point sélectionné. Ces éléments sont affichés dans la
tangente du plan à la surface passant par le point sélectionné.
Cliquez sur le bouton Normale à une courbe pour spécifier un angle de 90
degrés.
Les points de début et de fin proposés pour la droite sont affichés.
Spécifiez les points de début et de fin de la nouvelle droite.
La droite correspondante s'affiche.
Cliquez sur Répéter l'objet
après OK pour créer d'autres
droites ayant la même
définition que celle créée.
Dans ce cas, la boîte de
dialogue Répétition d'objets
est affichée pour vous
permettre de saisir le nombre
d'instances à créer avant de
sélectionner OK.
Le nombre de droites
indiqué dans la boîte de
dialogue est créé.
Chaque droite est
séparée de la droite
initiale par un multiple de
la valeur d'angle.

Vous pouvez cocher la case Géométrie sur support si vous souhaitez créer une droite
géodésique sur une surface support.
Le cas est illustré ci-dessous.
Option Géométrie sur support non
cochée
Option Géométrie sur support cochée

Tangente à une courbe
Sélectionnez une courbe de
référence et un point ou une
autre courbe pour définir la
tangence.
Si un point est
sélectionné (mode
mono-tangent), un
vecteur tangent à la
Droite tangente à une courbe en un point donné
courbe s'affiche
au point sélectionné.
Si une deuxième
courbe est
sélectionnée (ou un
point en mode
bi-tangent), vous
devez sélectionner un
plan support. La droite
sera tangente aux
deux courbes.
Lorsque plusieurs
solutions sont
possibles, vous
pouvez en choisir une
Droite tangente à deux courbes
(affichée en rouge)
directement dans la
géométrie ou à l'aide
du bouton Solution
suivante.
Spécifiez les points de début et de fin de la nouvelle droite.
La droite correspondante s'affiche.
Normale à une surface
Sélectionnez une surface de
référence et un point.
Un vecteur Normale à une
surface apparaît au point de
référence.
Les points de début et de fin
proposés pour la nouvelle
droite apparaissent.
Spécifiez les points de début
et de fin de la nouvelle droite.
La droite correspondante
s'affiche.

Bissectrice
Sélectionnez deux droites.
Leur droite bissectrice est la
droite qui découpe un angle
en deux parties égales entre
ces deux droites.
Sélectionnez un point qui
sera le point de départ de la
droite. Par défaut, c'est le
point d'intersection entre la
droite bissectrice et la
première droite sélectionnée.
Sélectionnez la surface sur
laquelle la droite bissectrice
doit être projetée, si
nécessaire.
Spécifiez la longueur de la
droite par rapport à son point
de départ (les valeurs de
début et de fin pour chaque
côté de la droite par rapport
aux points extrémités par
défaut).
La droite bissectrice
correspondante s'affiche.
Vous avez le choix entre
deux solutions : soit utiliser le
bouton Solution suivante, soit
cliquer directement sur les
flèches numérotées dans la
géométrie.
3. Cliquez sur OK pour créer la droite.
La droite (identifiée comme Droite.xxx) est ajoutée à l'arbre des spécifications.
Quel que soit le type de droite, vous pouvez spécifier les valeurs de début et de
fin en entrant des valeurs de distance ou en utilisant les manipulateurs
graphiques.
Sélectionnez l'option Extension symétrique pour créer une droite symétrique par
rapport au point de début sélectionné.
Dans la plupart des cas, vous pouvez sélectionner un support sur lequel la
droite sera créée. Les points sélectionnés seront projetés sur ce support.
Pour inverser la direction de la droite, cliquez soit sur le vecteur affiché, soit sur
le le bouton Inverser la direction(non disponible avec le type de droite
point-point).

Création de plans
Cette tâche indique les différentes méthodes de création de plans :
tangent à une surface ;
à l'aide de son équation ;
perpendiculaire à une courbe ;
par trois points ;
décalé par rapport à un plan ;
par deux droites ;
parallèle par un point ;
par un point et une droite ;
formant un angle par rapport à un point ;
par une courbe plane ;
plan moyen passant par plusieurs points.
Ouvrez le document Planes1.CATPart.
1. Cliquez sur l'icône Plan .
La boîte de dialogue
Edition du plan s'affiche.
2. Utilisez la zone de liste pour
choisir le type de plan voulu.
Une fois le plan défini, il est représenté par un carré rouge que vous pouvez déplacer
à l'aide du manipulateur graphique.
Equation
Entrez les composants A, B, C, D de l'équation de plan Ax + By + Cz = D.
Par trois points
Sélectionnez trois points.
Le plan passant par ces trois points s'affiche. Pour l'amener à
l'emplacement voulu, il suffit d'effectuer un Glisser-déplacer avec la souris.

Par deux droites
Sélectionnez deux droites.
Le plan passant par ces
deux directions s'affiche.
Si ces deux droites ne
sont pas coplanaires, le
vecteur de la deuxième
droite est déplacé sur le
plan de la première droite
pour définir la direction du
second plan.
Par un point et une droite
Sélectionnez un point et une
droite.
Le plan passant par le
point et la droite s'affiche.
Par une courbe plane
Sélectionnez une courbe plane.
Le plan contenant la
courbe s'affiche.
Tangent à une surface
Sélectionnez une surface de
référence et un point.
Un plan tangent à la
surface au point spécifié
s'affiche.
Normal à une courbe
Sélectionnez une courbe de
référence.

Vous pouvez sélectionner un
point. Par défaut, le point du
milieu de la courbe est
sélectionné.
Le plan normal à la courbe
au point spécifié s'affiche.
Parallèle
Sélectionnez un plan de
référence puis entrez une
valeur de décalage.
Un plan décalé par rapport
au plan de référence
apparaît.
Utilisez le bouton Inverser
la direction pour
changer la direction du
décalage ou cliquez
simplement sur la flèche
dans la géométrie.
Cliquez sur Répéter l'objet
après OK pour créer d'autres
plans décalés.
Dans ce cas, la boîte de
dialogue Répétition d'objets
s'affiche, vous permettant d'y
entrer le nombre d'instances à
créer avant de cliquer sur OK.
Le nombre de plans
indiqué dans la boîte de
dialogue est créé (y
compris celui que vous
étiez en train de créer).
Chaque plan est séparé
du plan initial par un
multiple de la valeur de

décalage.
Parallèle par un point
Sélectionnez un plan de
référence et un point.
Un plan parallèle au plan
de référence et passant
par le point sélectionné
s'affiche.
Angle ou normal au plan
Sélectionnez un plan de
référence et un axe de rotation.
Entrez une valeur d'angle.
Un plan passant par la
droite s'affiche. Il est
orienté selon l'angle
spécifié calculé sur le plan
de référence.
Cliquez sur Répéter l'objet après OK pour créer d'autres plans formant un angle
à partir du plan initial.
Dans ce cas, la boîte de dialogue Répétition d'objets s'affiche, vous permettant
d'y entrer le nombre d'instances à créer avant de cliquer sur OK.
Le nombre de plans
indiqué dans la boîte de
dialogue est créé (y
compris celui que vous
étiez en train de créer).
Chaque plan est séparé
du plan initial par un
multiple de la valeur
d'angle.
Ici, nous avons créé cinq
plans formant un angle de
20 degrés.

Moyen
Sélectionnez au moins trois
points pour afficher le plan
moyen passant par ces points.
Vous pouvez modifier le
plan en sélectionnant
d'abord un point dans la
liste de la boîte de
dialogue, puis en
choisissant une des deux
options suivantes :
Supprimer le point
sélectionné
Remplacer le point
sélectionné par un
autre point.
3. Cliquez sur OK pour créer le plan.
Le plan (identifié comme Plan.xxx) est ajouté à l'arbre des spécifications.

Modification de pièces
Redéfinir les paramètres d'un composant
Sélectionnez l'objet à modifier, double-cliquez
dessus, puis entrez de nouveaux paramètres
dans la boîte de dialogue qui s'affiche.
Réordonner des composants: Sélectionnez le
composant à réordonner, la commande Edition
-> xxx.object -> Réordonner...et le composant
après lequel vous souhaitez placer l'objet.
Afficher les parents et les enfants: Sélectionnez
le composant en cours, la commande Outils ->
Parents / Enfants... et utilisez les diverses
commandes contextuelles pour afficher les
parents et enfants.
Scanner la pièce et définir des objets locaux:
sélectionnez la commande Edition -> Parcours
ou définition de l'objet de travail..., cliquez sur les
boutons pour passer d'un composant local à un
autre, puis sur le bouton Quitter.
Mise à jour de pièces: Cliquez sur cette icône.
Pour résoudre d'éventuelles difficultés, cliquez
sur le bouton Editer, Désactiver ou Supprimer
dans la boîte de dialogue qui s'affiche.
Supprimer des composants: Sélectionnez le
composant à supprimer et la commande Edition
-> Supprimer.... Si vous le souhaitez, supprimez
ses parents exclusifs ou ses enfants en cochant
les options correspondantes.

Modification de pièces, de corps et de
composants
La modification d'une pièce peut, par exemple, revenir à en modifier la densité (voir
Affichage et modification de propriétés ) mais souvent, la modification consiste à modifier les
éléments composant la pièce. Cette opération peut être effectuée à tout moment.
Un composant peut être modifié de plusieurs façons. Si vous modifiez l'esquisse utilisée
dans la définition d'un composant, CATIA prendra cette modification en compte pour
recalculer le composant : en d'autres termes, l'associativité est conservée.
À présent, vous pouvez également modifier d'autres composants en utilisant les boîtes de
dialogue de définition pour redéfinir les paramètres de votre choix.
Redéfinir les paramètres d'un composant
Dans cette tâche, vous apprendrez à modifier une dépouille et une extrusion. La
procédure décrite ici s'applique à tout autre composant que vous aurez à modifier.
Ouvrez le document Edit1.CATPart.
1. Double-cliquez sur ladépouille à modifier (dans l'arbre des spécifications ou dans
la géométrie).
La boîte de dialogue Définition d'une dépouille s'affiche et CATIA indique la valeur
d'angle de dépouille courante. En règle générale, CATIA affiche toujours les
contraintes dimensionnelles associées au composant que vous modifiez. En ce
qui concerne les composants issus d'une esquisse, CATIA affiche également les
esquisses utilisées pour l'extrusion ainsi que les contraintes définies pour ces
esquisses.
Au lieu de double-cliquer sur l'élément à modifier, vous pouvez cliquer sur ce
dernier et sélectionner la commande XXX.object -> Définition... qui affichera la
boîte de dialogue Edition.

2. Entrez une nouvelle valeur d'angle de dépouille.
3. Cliquez sur OK.
Voici le composant obtenu :
4. Double-cliquez maintenant sur
l'extrusion.
La boîte de dialogue Définition d'une
extrusion s'affiche et CATIA donne un
aperçu de l'extrusion uniquement et non
de l'opération suivante.
Vous remarquerez que l'extrusion a été
créée dans un mode d'extension
symétrique et que CATIA affiche des
informations sur le profil initial.
5. Entrez une nouvelle valeur pour la longueur.
6. Désélectionnez l'option Extension symétrique.
7.
Entrez une valeur déterminant la seconde limite dans le champ Longueur.
CATIA donne un aperçu de la nouvelle extrusion à créer.
8. Cliquez sur OK.
Les modifications sont prises en
compte. Votre pièce ressemble
maintenant à ceci :

1. Vous pouvez également accéder aux paramètres que vous souhaitez modifier de
la façon suivante :
Sélectionnez le composant dans l'arbre des spécifications puis utilisez la
commande contextuelle feature.n object -> Modification des paramètres .
Vous pouvez maintenant visualiser les paramètres de la zone géométrique.
2. Double-cliquez sur le paramètre
concerné.
Une petite boîte de dialogue apparaît et
affiche la valeur du paramètre :
3. Entrez une nouvelle valeur puis cliquez sur OK.

Réordonner des composants
La fonction Réordonner vous permet de corriger les erreurs de conception. Dans cette
tâche, vous apprendrez à réordonner, autrement dit à déplacer une extrusion.
Ouvrez le document Reorder1.CATPart.
1. Vos données initiales sont constituées d'une extrusion obtenue par symétrie et
d'une seconde extrusion créée par la suite. L'ordre de création étant incorrect,
vous allez exécuter la commande Réordonner sur la seconde extrusion afin
d'appliquer une symétrie sur la totalité de la pièce. Placez le curseur sur Pad.2. et
sélectionnez Edition -> objet Pad.2 -> Réordonner...
2. La boîte de dialogue Réordonner des composants s'affiche.
Sélectionnez Pad.1 pour indiquer le nouvel emplacement du composant.
Ce nom s'affiche dans le champ Après.

3. Cliquez sur OK.
La pièce se reconstruit. Le miroir s'affiche après la création de la seconde
extrusion, c'est pourquoi cette seconde extrusion est maintenant obtenue par
symétrie.

Parents/Enfants
La commande Parents/Enfants vous permet de visualiser l'arbre généalogique indiquant les relations
entre les différents composants d'une pièce.
Elle met également en évidence les liens vers des références externes et indique les noms des
documents contenant ces références.
Si l'arbre des spécifications vous permet déjà de visualiser les opérations que vous avez effectuées et de
spécifier à nouveau votre conception, le graphe affiché par la fonction Parents/Enfants est cependant un
outil d'analyse plus précis. Avant de supprimer un composant, nous vous recommandons d'utiliser cette
commande.
Ouvrez le document Parent1.CATPart.
1. Sélectionnez le composant concerné, soit Pad1.
2. Sélectionnez la commande Outils -> Parents/Enfants... (ou la commande contextuelle
Parents/Enfants...).
Une nouvelle fenêtre contenant un graphique s'affiche. Celui-ci indique les relations entre les
différents éléments qui constituent l'extrusion préalablement sélectionnée.

Si vous ne pouvez pas visualiser l'élément qui vous intéresse dans l'arbre des spécifications car vous
avez créé un grand nombre d'éléments, cliquez dessus avec le bouton droit de la souris dans le
graphe puis sélectionnez la commande contextuelle Centrer le graphe : l'élément apparaîtra plus
visiblement dans l'arbre des spécifications.
3. Placez le curseur sur Extrusion 1 et sélectionnez la commande contextuelle Montrez tous les enfants .
Vous pouvez
maintenant voir
que Esquisse 2
et Esquisse 3
ont été utilisées
pour créer dux
extrusions
supplémentaires.
Voici la liste exhaustive des diverses commandes contextuelles vous permettant de masquer les
parents et les enfants. Ces commandes peuvent se révéler très utiles lorsque l'affichage est
surchargé.
Montrer les parents et enfants
Montrer les enfants
Montrer tous les enfants
Cacher les enfants
Montrer les parents
Montrer tous les parents
Cacher les parents
4. Sélectionnez EdgeFillet1 dans le graphe.
L'application met le congé en évidence dans l'arbre des spécifications, dans le graphe et dans la zone
géométrique.
5. Placez le curseur sur Congé arête.1 et sélectionnez la commande contextuelle Montrer les parents et
enfants .
L'extrusion parent Pad1 s'affiche de même que celle dont dépendent l'extrusion et donc le congé sur
arête.

6. Pour voir tous les parents, placez le curseur sur Congé arête.1 et sélectionnez la commande
contextuelle Montrer tous les parents .
Le plan d'esquisse s'affiche.
Double-cliquer sur les composants a pour effet de montrer puis cacher tour à tour les parents et les
enfants.
Vous pouvez utiliser la commande contextuelle Redessiner le graphe et la fonction zoom pour
améliorer la qualité d'affichage du graphe, ainsi que la commande contextuelle Imprimer tout le
graphe pour obtenir un document papier. Pour en savoir plus sur l'impression, consultez la section
Impression de documents.
7. La commande contextuelle Editer est accessible depuis n'importe quel élément. Par exemple, cliquez
sur Congé arête.1 avec le bouton droit de la souris et sélectionnez Editer.
La boîte de dialogue Congé d'arête s'affiche.
8. Entrez 2 comme nouveau rayon et confirmez.
L'application referme la boîte de dialogue Congé d'arête et le congé est mis à jour en conséquence.

Parcours de la pièce et définition des
objets séparément
Dans Part Design, vous pouvez accéder à tous les composants ou corps localement,
les visualiser et les modifier. La fonction Parcours et Définition de l'objet de travail vous
permet de concevoir des composants de pièces sans prendre en compte la pièce dans
sa globalité.
Dans cette tâche, vous apprendrez à parcourir la pièce et à définir un objet localement.
Ouvrez le document Active1.CATPart.
1. Sélectionnez la commande Edition -> Parcours ou définition dans l'objet de
travail....
La barre d'outils Objet actif vous permettant de naviguer dans la structure de la
pièce s'affiche.
Vous devez cliquer sur les boutons pour passer d'un composant local à un autre.
Les esquisses ne sont pas prises en compte par la commande.

2. Cliquez sur le bouton Précédent pour vous déplacer vers le composant précédent,
à savoir une poche.
L'application met le composant concerné en évidence dans l'arbre des
spécifications ainsi que dans la zone géométrique.

3. Cliquez à nouveau sur le bouton Précédent pour passer au composant précédent,
c'est-à-dire une symétrie.
4. Maintenant que vous avez accédé au composant de votre choix, à savoir le miroir,
isolez-le de la pièce courante en cliquant sur le bouton Quitter.
Dans la zone géométrique, l'application affiche l'objet local uniquement. Dans
l'arbre des spécifications, cet objet est souligné.
Vous pouvez maintenant travailler sur ce composant.
Définir un composant comme étant local sans parcourir la pièce dans sa globalité
est possible grâce à la commande contextuelle Définition d'un objet de travail dans
le composant désiré.

Mise à jour de pièces
L'intérêt de la mise à jour d'une pièce est de faire en sorte que l'application prenne en compte la toute
dernière opération effectuée. En effet, certaines modifications des esquisses, composants ou
contraintes obligent à reconstruire la pièce. Pour vous avertir qu'une mise à jour est nécessaire, CATIA
affiche le symbole de mise à jour à côté du nom de la pièce et fait apparaître la géométrie en rouge vif.
Pour mettre à jour une pièce, l'application fournit deux modes de mise à jour :
mise à jour automatique, accessible via Outils -> Options -> Mechanical Design . Si vous
cochez cette option, l'application met à jour la pièce lorsque c'est nécessaire.
mise à jour manuelle, accessible via Outils -> Options -> Mechanical Design : vous permet de
contrôler les mises à jour de votre pièce. Il vous suffit de cliquer sur l'icône Mise à jour dès
que vous souhaitez intégrer des modifications. La fonction Mise à jour est également disponible
via Edition -> Mise à jour et la commande contextuelle Mise à jour. Une barre de progression
indique l'évolution de l'opération.
Notez que vous pouvez annuler ou interrompre les mises à jour.
En cas d'échec de la mise à jour
Parfois, l'opération de mise à jour n'est pas effectuée entièrement : par exemple, vous
avez entré des valeurs inappropriées ou vous avez supprimé un élément géométrique
utile. Dans les deux cas, CATIA vous invite à revoir votre conception. Le scénario suivant
indique la procédure à suivre en de telles circonstances.
Ouvrez le document Update3.CATPart.
Voici la pièce initiale.
1. Accédez à l'atelier d'esquisse pour remplacer l'arête circulaire de l'esquisse initiale par
une droite, puis revenez dans Part Design.
CATIA détecte que cette opération se répercute sur le congé défini sur cette extrusion. Un
symbole jaune apparaît sur le composant à l'origine du problème, le congé, dans l'arbre
des spécifications. De plus, une boîte de dialogue affiche le diagnostic des difficultés
rencontrées et le congé n'apparaît plus dans l'aperçu :

Pour résoudre ce problème, la boîte de dialogue fournit les options suivantes. Si vous
souhaitez retravailler le composant Congé arête.1, vous pouvez :
le modifier
le désactiver (pour en savoir plus sur les composants désactivés, consultez la
sectionPropriétés d'un composant)
le supprimer
Si vous préférez retravailler le composant Arête.1, vous pouvez le modifier.
2.
Pour les besoins de ce scénario simple, cliquez sur Arête.1 puis sur Editer.
La boîte de dialogue d'édition s'affiche et un symbole jaune apparaît sur le congé dans
l'arbre des spécifications. De plus, l'arête que vous venez de supprimer apparaît
désormais en jaune sous forme d'une droite en pointillés.
3. Cliquez dans le champ Elément sélectionné et sélectionnez la nouvelle arête.
Cliquez sur OK pour fermer la boîte de dialogue et obtenir une pièce correcte. Le congé
4.
est recréé.

Annuler une mise à jour
Vous pouvez annuler vos mises à jour en cliquant sur le bouton Annuler de la boîte de
dialogue Mise à jour....
Interrompre une mise à jour
Ce scénario vous montre comment mettre à jour une pièce et interrompre l'opération de
mise à jour sur un composant donné à l'aide d'un message que vous aurez défini
préalablement.
Ouvrez le document Update1.CATPart.
1. Cliquez avec le bouton droit de la souris sur Trou.1, c'est-à-dire le composant à partir
duquel la mise à jour sera interrompue et sélectionnez la commande contextuelle
Propriétés.
La boîte de dialogue Propriétés apparaît.
2. Cochez l'option Interrompre la mise à jour. Cette option arrête le processus de mise à jour
et affiche le memo que vous avez saisi dans la zone de texte.
3.
Entrez toute information que vous jugez utile dans cette zone. Par exemple, entrez
"Modification du congé nécessaire".
4. Cliquez sur OK pour confirmer et fermer la boîte de dialogue.
L'entité Interruption mise à jour.1 apparaît dans l'arbre des spécifications sous Trou.1, ce
qui signifie que le trou est le dernier élément qui sera mis à jour avant que la fenêtre de
message ne s'affiche.

5.
Editez Esquisse.1, une opération de mise à jour est alors lancée.
Lorsque vous quittez l'atelier d'esquisse Sketcher, la pièce apparaît en rouge vif.
6.
Exécutez l'opération de mise à jour en cliquant sur l'icône .
Les fenêtres de message Mise à jour... et Interruption de la mise à jour s'affichent. La
fenêtre Interruption de la mise à jour affiche votre memo et vous propose soit
d'interrompre l'opération de mise à jour, soit de la poursuivre.
7. Cliquez sur Oui pour terminer.
La pièce est mise à jour. Vous pouvez à présent éditer le congé si vous le jugez
nécessaire.
8. Si vous décidez de ne plus utiliser cette fonction, vous pouvez au choix :
cliquer avec le bouton droit de la souris sur Trou.1, sélectionner la commande
contextuelle Propriétés et cocher l'option Désactiver l'interruption : vous effectuerez
alors une mise à jour simple. Des crochets rouges précédant Trou.1 dans l'arbre
des spécifications indiquent que la fonction est désactivée pour cet élément.
cliquer avec le bouton droit de la souris sur Interruption mise à jour.1 et
sélectionner la commande contextuelle Supprimer pour supprimer cette fonction.

Suppression de composants
Toutes les fois que vous désirez supprimer la géométrie, vous ne devrez pas obligatoirement supprimer les
éléments utilisés pour sa création. CATIA vous permet de définir ce que vous souhaitez réellement
supprimer.
Dans cette tâche, vous apprendrez à supprimer une esquisse pour laquelle la géométrie a été définie et qui
est impliquée par cette opération.
Ouvrez le document Delete1.CATPart.
1. Sélectionnez le rectangle que vous voulez supprimer.
2. Sélectionnez la commande Edition -> Supprimer....
La boîte de dialogue Supprimer s'affiche : elle indique l'élément à supprimer et propose deux options.
Supprimer les parents exclusifs: supprime la géométrie utilisée pour créer l'élément. Cette
géométrie ne peut être supprimée que si elle est utilisée exclusivement pour l'élément
sélectionné.
Enfants: supprime la géométrie créée à partir de l'élément à supprimer, c'est-à-dire les éléments
dépendants.
Dans cet exemple, la première option ne peut pas être utilisée car le rectangle n'a pas de parents.
3. Cliquez sur Agrandir.
Les autres options ainsi que les éléments concernés par la suppression s'affichent. Si vous pouvez
supprimer l'esquisse, vous pouvez également la remplacer par un autre élément.
4. Cliquez sur ...PartBody\Sketch.2 pour afficher Sketch.2.
Sketch.2 apparaît dans le champ Remplacer.

5. Sélectionnez Sketch4, c'est-à-dire l'hexagone remplaçant Sketch 2 .
Cette opération s'affiche maintenant dans la boîte de dialogue.
6. Cliquez sur OK.
L'esquisse est supprimée ainsi que ses enfants :deux extrusions dont un congé.
A propos de la suppression
Suppression de composants créés à partir de composants d'habillage
Si vous supprimez un composant (d'habillage ou non) préalablement utilisé pour créer un composant
d'habillage, ce dernier est recalculé.
Dans cet exemple, une certaine épaisseur a été ajoutée à l'extrusion. De la matière a ainsi été retirée
de la pièce entière à l'aide de la fonction coque. En d'autres termes, l'existence de la coque dépend
de l'existence de l'épaisseur.

Vous remarquerez que seule l'épaisseur a été supprimée. CATIA conserve la coque.
N'oubliez pas que vous pouvez appliquer la commande Défaire si vous avez malencontreusement
supprimé un composant.
Vous ne pouvez pas supprimer un profil utilisé pour définir un composant, à moins de supprimer le profil
afin d'en construire un autre.
Répétitions
En ce qui concerne les répétitions, lorsque vous utilisez la commande Supprimer sur une instance, la
répétition est supprimée entierièrement.

Définition de contraintes
Définition de contraintes: Cliquez sur l'icône correspondante, sélectionnez
les éléments à contraindre puis cliquez à l'emplacement où vous souhaitez
appliquer la valeur de contrainte.
Définition de contraintes choisies dans une boîte de dialogue: Sélectionnez
les éléments à contraindre, cliquez sur cette icône et choisissez le type de
contrainte dans la boîte de dialogue qui s'affiche.
Modification de contraintes: Double-cliquez sur la contrainte à modifier et
modifiez les données associées dans la boîte de dialogue Edition de
contrainte qui s'affiche.
Renommer des contraintes : Sélectionnez la contrainte à renommer et la
commande contextuelle objet.xxx.n -> Renommer .
( ) Activation de contraintes : Sélectionnez la contrainte à (dés)activer et la
commande contextuelle objet.xxx.n -> Renommer paramètre , puis entrez
le nom souhaité dans la boîte de dialogue qui s'affiche.
Cotes moyennes: Cliquez sur cette icône, puis mettez à jour la pièce.

Définition de contraintes
Les contraintes 3D sont définies au moyen d'une des deux commandes de contrainte
disponibles dans cet atelier. Selon le mode de création utilisé pour créer une
géométrie filaire et des surfaces (voir CATIA Wireframe and Surface Guide de
l'utilisateur), les contraintes appliquées à ces éléments sont de deux types différents.
Vous créez des mesures si les éléments de support ont été créés avec le mode
Création de composants sans historique désactivé. A l'inverse, vous créez des
contraintes si vous contraignez des composants sans historique. Pour en savoir plus,
reportez-vous à la section Création de composants sans historique.
Les contraintes que vous pouvez définir dans le document Description de l'atelier sont
les suivantes :
Distance
Longueur
Angle
Fixe/Non fixe
Tangence
Coïncidence
Parallèlisme
Perpendicularité
Dans cette tâche, vous apprendrez à définir une contrainte de distance entre une face
et un plan puis une mesure entre cette face et un autre plan.

Ouvrez le document Constraint1.CATPart.
1. Sélectionnez la face que vous souhaitez contraindre et le plan Plan.1. Il s'agit d'un
plan sans historique (il n'existe pas de liens vers les autres entités utilisées pour
créer ce plan).
2.
Cliquez sur l'icône Contrainte .
CATIA détermine la distance entre la face et le plan. Si vous déplacez le curseur, le
symbole graphique de la distance se déplace aussi.
3. Cliquez à l'endroit où vous voulez positionner la valeur de contrainte.
La contrainte est créée.
4. Définissez maintenant une autre contrainte entre la même face et Plan.2. Ce plan
n'est pas un composant sans historique. Suivez les instructions décrites ci-dessus
en utilisant la face et Plan.2.
CATIA crée une mesure. Lorsque vous créez une mesure, chaque modification
apportée à la géométrie par CATIA est également indiquée par cette mesure.
La mesure s'affiche entre parenthèses comme indiqué ci-dessous :

Vous ne pouvez pas définir de contrainte de distance entre deux faces appartenant
à des composants de Part Design liés entre eux par leurs spécifications. Dans
l'exemple ci-dessous, CATIA crée une contrainte de mesure entre les faces, et non
une contrainte menante.
Pour savoir comment modifier une contrainte, reportez-vous à la section
Modification de contraintes.

Définition de contraintes dans la boîte de
dialogue
Cette tâche vous montre comment utiliser la commande qui détecte les contraintes éventuelles entre
les éléments sélectionnés et vous permet de choisir la contrainte que vous souhaitez créer. Vous allez
appliquer une contrainte sur un trou.
Ouvrez le document Hole1.CATPart et créez un trou sur la face supérieure de l'extrusion.
1. Sélectionnez la face circulaire et utilisez la commande contextuelle Autre sélection pour sélectionner
l'axe du trou.
2. Sélectionnez la face comme indiqué à l'aide de la touche CTRL :
3.
Cliquez sur l'icône Contrainte définie dans une boîte de dialogue .
La boîte de dialogue Edition de contrainte s'affiche.

Les contraintes que vous pouvez définir dans le document Description de l'atelier sont les suivantes :
Distance
Longueur
Angle
Fixe/Non fixe
Tangence
Coïncidence
Parallèlisme
Perpendicularité
CATIA détecte six contraintes possibles entre l'axe et la face :
Distance
Angle
Fixe/Non fixe
Coïncidence
Parallèlisme
Perpendicularité
Les autres contraintes sont grisées et indiquent qu'il n'est pas possible de définir les éléments
sélectionnés.
3. Cochez l'option Distance. Vous pouvez choisir une contrainte uniquement.
4. Cliquez sur OK pour confirmer l'opération. La contrainte de distance est créée.

Modification de contraintes
Modification de contraintes
Vous pouvez modifier des contraintes en :
double-cliquant sur les contraintes désirées et en modifiant les données connexes dans la boîte de
dialogue Edition de contrainte qui s'affiche.
sélectionnant les contraintes désirées et en utilisant la commande contextuelle Objet N.XXX ->
Définition...
...pour afficher la boîte de dialogue Edition de contrainte et modifier les données connexes.
A propos des contraintes de diamètre et de rayon
Vous pouvez obtenir une contrainte de rayon en modifiant une contrainte de diamètre. Il vous suffit
de double-cliquer sur la contrainte de diamètre et de choisir l'option rayon dans la boîte de dialogue
qui s'affiche.
Si vous voulez créer une formule, so uvenez-vous que :
- le paramètre correspondant à la contrainte de rayon ou de diamètre est désigné par
"ObjetRayonX"
- ce paramètre contient toujours la valeur de rayon.
Pour en savoir plus sur les formules, reportez-vous à CATIA-Knowledge Advisor User's Guide Version 5

Renommer les contraintes
Vous pouvez renommer une contrainte en la sélectionnant et en utilisant la commande contextuelle
Objet.N.XXX -> Renommer.... Dans la boîte de dialogue qui s'affiche, il vous suffit d'entrer le nom de votre
choix.
Désactivation ou activation d'une contrainte
Vous pouvez désactiver une contrainte en la sélectionnant et en utilisant la commande contextuelle
Objet.N.XXX -> Désactiver . Les contraintes désactivées sont précédées de parenthèses rouges. ( ).
Inversement, pour activer une contrainte, utilisez la commande contextuelle Activer .

Cotes moyennes
Dans cette tâche, vous apprendrez à calculer les cotes moyennes d'une pièce.
Vous devez définir les tolérances de votre choix avant de calculer les cotes
moyennes.. Pour en savoir plus sur les tolérances, reportez-vous au Guide de
l'utilisateur CATIA- Infrastructure Version 5.
Ouvrez le document Mean_Dimensions.CATPart.
1. Avant de calculer les cotes moyennes, appliquez la commande contextuelle Edition
des paramètres à Extrusion.1 pour afficher les paramètres puis observez la pièce
que vous venez d'ouvrir. Celle-ci inclut trois paramètres tolérancés comme indiqué
ci-dessous.
Souvenez-vous que pour accéder aux valeurs de tolérance, vous devez
double-cliquer sur le paramètre concerné puis utiliser la commande de menu
contextuel Tolérance -> Editer....
2.
Cliquez sur l'icône Cotes moyennes .
Une boîte de dialogue vous informant que l'opération est effectuée s'affiche. Il vous
suffit alors de mettre à jour la pièce pour observer le résultat.
3.
Cliquez sur l'icône Mise à jour pour intégrer les modifications dans la pièce.
Notez que les options de mise à jour définies pour votre session (pour en savoir
plus, voir Paramètres généraux) n'ont aucune incidence sur le comportement de la
commande Cotes moyennes : vous devez toujours mettre à jour votre pièce de
manière explicite.
Les cotes moyennes sont affichées autour de la pièce.

Gardez présent à l'esprit que si les paramètres sont pilotés par des formules,
CATIA désactive ces formules pour calculer les cotes moyennes.
4. Si vous souhaitez revenir à l'état précédent, cliquez à nouveau sur l'icône Cotes
moyennes .
Une boîte de dialogue vous informant que la pièce sera remise aux cotes nominales
s'affiche.
5. Cliquez sur Ok pour confirmer.
Un autre message vous informe que l'opération est effectuée et vous invite à mettre
à jour la pièce.
6. Cliquez sur Ok pour fermer la fenêtre de message.
7.
Cliquez sur l'icône Mise à jour pour redimensionner la pièce aux cotes
nominales.

Remplacement ou déplacement
d'éléments
Remplacement d'une surface: Sélectionnez la surface à remplacer et la commande
contextuelle Remplacer.... Sélectionnez la surface de remplacement et éventuellement,
cochez l'option Supprimer pour supprimer l'élément remplacé ainsi que ses parents
exclusifs.
Remplacement d'un corps : Sélectionnez le corps relié et la commande contextuelle
Remplacer.... Sélectionnez le corps de remplacement.
Modification du support de l'esquisse: Sélectionnez la commande Objet.Esquisse ->
Modifier le support de l'esquisse puis le plan ou la face de remplacement.
Déplacement d'esquisses à partir d'un corps : Sélectionnez l'élément à déplacer puis la
commande contextuelle Objet.xxx -> Modifier le corps .

Remplacement d'une surface
La commande Remplacer vous permet de remplacer les esquisses, les faces, les plans et les surfaces
par d'autres éléments appropriés.
Dans cette tâche, vous apprendrez à remplacer une utilisée pour créer une géométrie par une autre
surface.
La méthode décrite ici est valable pour le remplacement des éléments géométriques utilisés dans la
définition des composants de Part Design.
Ouvrez le document Replace1.CATPart.
1. Sélectionnez Extrude.1, c'est-à-dire la surface rouge utilisée pour relimiter à la fois la poche et le
trou.
2.
Cliquez avec le bouton droit de la souris pour afficher le menu contextuel et sélectionnez la
commande Remplacer....
La boîte de dialogue Remplacer apparaît, indiquant le nom de la surface à remplacer.
3. Sélectionnez Extrusion 2 comme surface de remplacement. Extrusion 2 apparaît maintenant dans
le champ Avec de la boîte de dialogue.
4. Cochez l'option Supprimer pour supprimer Extrusion1.
5. Cliquez sur OK pour confirmer l'opération.

La poche et le trou sont relimités par Extrusion 2.
Extrusion 1 a été supprimée.

Remplacement d'un corps
Vous pouvez remplacer uniquement les corps ayant subi des opérations booléennes (pour en savoir
plus, voir Association de corps).
Dans cette tâche, vous apprendrez à remplacer un corps relimité par un corps de base. Ce dernier
n'étant pas relimité, vous aurez à redéfinir l'opération Relimitation partielle.
Ouvrez le document ReplaceBody.CATPart.
1. Sélectionnez Corps3 comme étant le corps à remplacer.
2.
Avec le bouton droit de la souris, sélectionnez la commande contextuelle Remplacer... .
Une fenêtre de message vous informant que vous devrez remplacer les éléments manquants
s'affiche.
3.
Cliquez sur OK pour fermer la boîte de dialogue.
La boîte de dialogue Remplacer apparaît.

4. Sélectionnez Corps 4 comme étant le corps de remplacement.
Notez que :
Les corps de remplacement ne peuvent pas être utilisés pour des opérations booléennes
précédentes.
Ils peuvent appartenir à la pièce étudiée ou à une pièce externe.
5. Cliquez sur ..\Extrusion.2\Face\ et sélectionnez Face.3 comme face de remplacement.
6. Cliquez sur Ok pour confirmer et fermer la boîte de dialogue.
Corps 3 a été remplacé par Corps 4.

Nouveau support d'esquisse
Vous pouvez remplacer des plans d'esquisse par de nouveaux plans ou des surfaces
planes. Remplacer un plan d'esquisse par un autre permet de déplacer une esquisse
mais ce peut être aussi une manière de modifier les spécifications de conception.
Dans cette tâche, vous apprendrez à effectuer cette opération.
Ouvrez le document ChangeSketch1.CATPart.
1. Les données initiales se composent d'un corps surfacique vert et d'une extrusion
grise. Vous allez remplacer le plan utilisé pour l'esquisse de cette extrusion par
un autre plan. Sélectionnez Sketch1 dans l'arbre des spécifications.
2. Sélectionnez la commande objet.Sketch1 -> Nouveau support d'esquisse .
3. Sélectionnez le plan de remplacement.
L'opération est instantanée. Vous remarquerez que le côté inférieur de l'extrusion
s'ajuste automatiquement au corps surfacique. En fait, le contour initial de
l'extrusion a été créé en partie à l'aide de la commande Intersection , ce qui
explique pourquoi l'extrusion intègre le corps surfacique.

Déplacement d'esquisses à partir
d'un corps
Une fois la réorganisation des composants issus d'une esquisse effectuée, il est très
souvent nécessaire de déplacer les esquisses correspondantes. Dans cette tâche,
vous apprendrez à effectuer cette opération.
Ouvrez le document ChangeBody.CATPart.
1. Dans l'arbre des spécifications,
réorganisez Extrusion.4 et déplacez-la
vers Corps.1.
2. Vous pouvez remarquer que Esquisse.4 figure toujours dans Corps principal.
Sélectionnez Esquisse.4 puis la commande contextuelle Objet.xxx -> Déplacer.
Cette commande vous permet de déplacer une esquisse depuis un corps vers le
corps de votre choix.

La fonction de multisélection des esquisses est prise en charge. Toutefois, dans
ce cas, le menu contextuel n'est pas disponible : vous accédez donc à cette
fonction via l'option de menu Edition -> Déplacer.
La boîte de dialogue de modification de corps s'affiche.
3. Cliquez sur Destination et sélectionnez Corps 1 ou utilisez la liste déroulante de la
boîte de dialogue.

4. Cliquez sur OK pour confirmer l'opération.
Esquisse.4 a été déplacée et se trouve maintenant sous Extrusion.4, mais la
géométrie demeure inchangée.
La commande Déplacer vous permet également de déplacer une esquisse d'un
corps surfacique vers un autre corps et vice-versa. Pour savoir comment utiliser
cette commande avec les corps surfaciques, consultez CATIA Generative Shape
Design Guide de l'utilisateur.

Si vous déplacez des esquisses
ayant des parents, par exemple
des esquisses créées sur des
plans obtenus via la commande
Plan , vous pouvez déplacer
les parents de l'esquisse
sélectionnée vers le nouvel
emplacement de cette dernière
en activant l'option Déplacer les
parents non partagés. Notez
toutefois que cette opération n'est
possible que si les parents ne
sont pas partagés par un autre
élément du corps initial.
Dans ce cas, tous les parents
non partagés sont mis en
surbrillance avant le
déplacement.

Affichage et modification des propriétés
Affichage et modification des propriétés d'une pièce: sélectionnez la pièce puis la
commande contextuelle Edition -> Propriétés. Cliquez sur l'onglet Masse, modifiez la
densité, cliquez sur l'oglet Produit et entrez les informations décrivant la pièce.
Affichage et modification des propriétés d'un corps : Sélectionnez le corps puis la
commande contextuelle Edition -> Propriétés. Cliquez sur l'onglet Propriétés de
l'élément, modifiez le nom et cliquez sur l'onglet Graphique pour changer la couleur
du corps.
Affichage et modification des propriétés d'un composant: Sélectionnez le composant
puis la commande contextuelle Edition -> Propriétés. Cochez Désactiver pour
désactiver le composant et définissez les éléments impactés qui resteront activés.
Cliquez sur l'onglet Propriétés de l'élément et modifiez le nom du comosant. Cliquez
sur l'onglet Graphique pour changer la couleur du composant.

Affichage et modification des propriétés
d'une pièce
Rassemblées dans une même boîte de dialogue, les propriétés d'une pièce consistent
en différentes indications auxquelles vous devrez parfois vous référer. Dans cette
tâche, vous apprendrez à accéder à ces informations et, si nécessaire, à les modifier.
Pour les besoins de ce scénario, ouvrez par exemple le document Stiffener.CATPart.
1. Sélectionnez la pièce "Raidisseur" dans l'arbre
des spécifications.
2. Sélectionnez la commande Edition->Propriétés ou la commande Propriétés du
menu contextuel.
La boîte de dialogue Propriétés s'affiche. Elle contient les onglets suivants se
rapportant à la pièce :
Masse
Produit
3. Cliquez sur l'onglet Masse pour afficher les informations techniques. Vous pouvez
modifier la densité et le volume du corps de pièce si vous avez appliqué de la
matière à la pièce. Notez que l'application calcule le volume du corps de pièce et
non le volume des corps. Vous devez utiliser les corps comme des entités que
vous pouvez associer au corps de pièce en utilisant des fonctionnalités telles que
Intersection ou Assemblage par exemple, pour terminer la conception de votre
pièce.
Pour savoir comment appliquer des matériaux, reportez-vous à CATIA- Real Time
Rendering Guide de l'utilisateur Version 5.

4. Cliquez sur l'onglet Produit.
5. Entrez un nouveau nom pour désigner la pièce dans le champ Référence du
produit.
Le nouveau nom apparaît dans l'arbre des spécifications.

6. Les autres champs vous permettent de décrire la pièce comme vous le souhaitez.
Entrez les informations décrivant la pièce dans le contexte de votre société.
7. Sélectionnez l'option Source. Vous avez le choix entre Inconnu, Fabriqué et
Acheté. Utilisez le cadre de description pour entrer des informations
supplémentaires.
8. Une fois satisfait, cliquez sur OK pour confirmer l'opération puis fermez la boîte de
dialogue.

Affichage et modification des propriétés
d'un corps
Dans cette tâche, vous apprendrez à afficher et à modifier les propriétés d'un corps.
Pour savoir comment modifier les propriétés graphiques d'un corps, reportez-vous à
la documentation sur les infrastructures, les propriétés graphiques d'affichage et de
modification.
Ouvrez par exemple le document Assemble1.CATPart.
1. Sélectionnez Body.1 dans l'arbre des spécifications.
2. Sélectionnez la commande Edition->Propriétés ou la commande Propriétés du
menu contextuel.
La boîte de dialogue Propriétés s'affiche. Elle contient les deux onglets
suivants :
Propriétés des composants
Graphique
3. L'onglet Propriétés de l'élément indique le nom du corps. Ce nom peut être
modifié si la pièce n'est pas en lecture seule. Entrez "Corps de pièce.1" dans le
champ Nom. Le nouveau nom apparaît dans l'arbre des spécifications.
Cette application affiche également la date de création et celle de la dernière
modification.

4. Cliquez sur l'onglet Graphique pour changer la couleur du corps.
Les différentes propriétés graphiques disponibles pour l'édition sont :
Remplissage (colore l'objet en cours) et transparence
Couleur de l'arête, type de trait et épaisseur
Couleur, type de trait et épaisseur des droites et courbes
Couleur et symbole du point
Visibilité et détectabilité
Attributs par défaut
Pour savoir comment modifier les propriétés graphiques, consultez CATIA-
Infrastructure Guide de l'utilisateur Version 5.
Avant d'appliquer une couleur à un corps, gardez à l'esprit que :
Les composants que vous créez dans un corps prennent la couleur de
ce corps, quel qu'il soit.
Lorsque vous appliquez une couleur à un composant, toutes les faces
de ce composant sont de la même couleur.
La couleur que vous appliquez à une face prévaut sur les autres
couleurs définies pour les composants et les corps.
Les faces générées par transformation prennent la couleur du corps,
comme l'illustre l'exemple suivant.
Avant Après
Le corps se compose d'une Les deux faces générées par la
extrusion figurant en rose et d'une transformation, c'est-à-dire la face avant et
poche colorée en jaune la face cylindrique, prennent la couleur du
corps qui était la couleur par défaut de
CATIA.
Les trois premières règles citées précédemment s'appliquent à
l'association de corps.

5. Cliquez sur OK.
CATIA prend cette modification en compte et affiche le nouveau nom du corps.

Affichage et Modification des propriétés
d'un composant
Dans cette tâche, vous apprendrez à afficher et à modifier les propriétés d'une
extrusion.
Ouvrez par exemple le document Properties.CATPart.
1. Sélectionnez le composant dans l'arbre des spécifications, soit Pad2.
2. Sélectionnez la commande Edition->Propriétés ou la commande Propriétés du
menu contextuel.
La boîte de dialogue Propriétés s'affiche. Elle contient les onglets suivants :
Mécanique
Propriétés de l'élément
Graphique
L'onglet Mécanique affiche le statut de mise à jour de l'extrusion.
Les attributs suivants caractérisent les composants :
Désctivé: la sélection de cette option
empêche CATIA de prendre en compte
les composants désactivés au cours de
l'opération de mise à jour.
-Non à jour : indique que le composant
sélectionné est à mettre à jour.

Non résolu: indique que le composant
sélectionné n'a pas été calculé par
l'application.
Vous ne pouvez pas contrôler les deux
dernières options. Le symbole qui
s'affiche en face de chaque attribut
peut, dans certains cas, apparaître
dans l'arbre des spécifications.
Pour en savoir plus sur les mises à jour,
reportez-vous à la section Mise à jour
de pièces.
3. Sélectionnez l'option Désactivé pour désactiver l'extrusion.
Vous remarquerez qu'un nouveau cadre s'affiche pour donner des informations
supplémentaires. CATIA vous avertit que l'opération aura une incidence sur le seul
enfant de l'extrusion, c'est-à-dire le trou.
Dans certains cas, les composants peuvent avoir plusieurs enfants. Il vous suffit de
sélectionner les enfants dans la liste puis de cocher la première option si vous
voulez les désactiver ou alors ne cochez que la seconde option pour désactiver
tous les enfants concernés.
4. Cliquez sur l'onglet Propriétés de l'élément.
5. Entrez "NewPad" comme nouveau nom de l'extrusion dans le champ Nom.
6. Cliquez sur Appliquer pour afficher le nouveau nom dans l'arbre des spécifications.

7. Cliquez sur l'onglet Graphique pour changer la couleur du composant.
Les différentes propriétés graphiques disponibles pour l'édition sont :
Remplissage (colore l'objet en cours) et transparence
Couleur, type de trait et épaisseur des arêtes
Couleur, type de trait et épaisseur des droites et courbes
Couleur et symbole du point
Visibilité et détectabilité
Attributs par défaut
Pour savoir comment modifier les propriétés graphiques, consultez CATIA-
Infrastructure Guide de l'utilisateur Version 5.
8. Cliquez sur OK pour confirmer l'opération puis fermez la boîte de dialogue.
La géométrie n'affiche plus les composants désactivés et l'arbre des spécifications
les encadre de parenthèses rouges pour symboliser leur statut.

Annotations
Création d'annotations texte : cliquez sur cette icône, sélectionnez une face et entrez
votre texte dans la boîte de dialogue.
Création de Flag Notes: cliquez sur cette icône, sélectionnez l'objet que vous souhaitez
associer à l'hyperlien, entrez un nom pour l'hyperlien ainsi que le chemin d'accès au
fichier de destination.

Création d'annotations texte
Dans cette tâche, vous apprendrez à associer un texte à une pièce. Le cadre affecté
au texte est d'une largeur illimitée. Vous pouvez définir les propriétés graphiques
(point d'ancrage, taille de texte et justification) après avoir créé le texte.
Ouvrez le document DraftAnalysis.CATPart.
1.
Cliquez sur l'icône Texte .
2. Sélectionnez une face ou un ensemble de faces afin de définir un emplacement
pour la flèche à l'extrémité de la ligne repère.
Si la vue active n'est pas valide, un message vous informant que vous ne pouvez
pas utiliser cette vue s'affiche. L'application affiche alors l'annotation dans un plan
d'annotation perpendiculaire à la face sélectionnée. Cliquez ensuite sur OK pour
fermer la fenêtre de message.
La boîte de dialogue Editeur de texte s'affiche.
3. Entrez le texte de votre choix, par exemple "traitement de surface" dans la boîte de
dialogue.
4. Cliquez sur OK pour terminer la création du texte. Vous pouvez également cliquer
n'importe où dans la zone géométrique.
L'annotation texte apparaît dans la géométrie.

L'annotation texte (Texte.xxx) figure sous "Tolérancement.1" dans l'arbre des
spécifications.
5. Cliquez avec le bouton droit de la souris et sélectionnez la commande contextuelle
Propriétés....
La boîte de dialogue Propriétés apparaît.
6. Cliquez sur l'onglet Police et définissez un nouveau style et une taille supérieure
pour le texte.
7. Cliquez sur l'onglet Texte. Cet onglet affiche les options permettant de définir les
éléments suivants :
Cadre : nouvelles formes de cadre,
Couleur : nouvelles couleurs pour la ligne de repère,
Epaisseur et Trait : nouvelles épaisseurs pour le cadre et la ligne de
repère,
Position : nouvelles positions pour le texte et le cadre
Justification, Passage à la ligne et Miroir : nouvel affichage du texte
8. Définissez un nouveau cadre et une nouvelle couleur.
9. Cliquez sur OK pour confirmer l'opération.
L'annotation est modifiée en conséquence.

Création de Flag Notes
Vous pouvez ajouter des hyperliens à votre document puis les utiliser pour accéder
à des emplacements divers, par exemple une présentation marketing, un tableau
Microsoft Excel ou une page HTML sur l'intranet.
Vous pouvez ajouter des hyperliens à des modèles, des produits ou des pièces
ainsi qu'à des éléments constituants.
Dans cette tâche, vous apprendrez à ajouter des hyperliens.
Ouvrez le document WeldPlanner.CATProduct (ou le document GreenPartCATPart ) et
préparez un document que vous souhaitez visualiser via un hyperlien.
1.
Cliquez sur l'icône Flag Note attaché .
2. Sélectionnez l'objet qui représentera l'hyperlien. Dans cet exemple, sélectionnez
la face comme indiqué :
La boîte de dialogue Insérer un hyperlien s'affiche.

3. Entrez un nom pour désigner l'hyperlien. Par exemple, "présentation marketing".
4. Entrez le chemin d'accès au fichier de destination dans le champ URL puis
appuyez sur ENTREE.
Ou,
Cliquez sur Parcourir... et sélectionnez le fichier de destination dans la boîte de dialogue
Lier au fichier.
Remarque : Vous pouvez ajouter plusieurs liens. Il suffit d'entrer un autre
chemin d'accès ou de cliquer sur Parcourir... et sélectionner un autre fichier.
Tous les liens créés sont répertoriés dans la boîte de dialogue Lien fichier ou
URL.
l S électionnez un lien puis cliquez sur Ouvrir pour suivre ce lien jusqu'au
fichier de destination.
l S électionnez un lien puis cliquez sur Supprimer pour supprimer les liens
existants.
5. Cliquez sur OK dans la boîte de dialogue Insérer un hyperlien lorsque le résultat
vous convient.
L'hyperlien est créé et identifié par Flag Note.xxx (nom du document) dans
l'arbre des spécifications.

6. Pour modifier l'affichage de la note, utilisez la commande contextuelle Propriétés.

Tâches avancées
Cette section explique et illustre comment effectuer des opérations sur des corps et donne
des recommendations permettant d'utiliser au mieux cette application. Le tableau ci-dessous
énumère les informations que vous pouvez trouver.
Association de corps
Outils
Multi-Documents
Copie optimisée
Réutilisation de votre conception

Association de corps
Insertion d'un nouveau corps: Sélectionnez la commande Insertion -> Corps.
Assemblage de corps: Sélectionnez le corps à utiliser, la commande Insertion ->
Opérations booléennes -> Assemblage ainsi que le corps cible.
Intersection de corps: Sélectionnez le premier corps, la commande Insertion ->
Opérations booléennes -> Intersection et le second corps.
Ajout de corps: Sélectionnez le corps à ajouter, la commande Insertion ->
Opérations booléennes -> Ajout ainsi que le corps cible.
Retrait de corps: Sélectionnez le corps à utiliser, la commande Insertion ->
Opérations booléennes -> Retrait ainsi que le corps cible.
Relimitation de corps: Sélectionnez le corps à relimiter et la commande Insertion ->
objet.Body.1 -> Relimitation partielle.... Cliquez dans le champ Faces à retirer et
sélectionnez les faces de votre choix. Cliquez dans le champ Faces à garder et
sélectionnez les faces de votre choix.
Autorelimitation: Sélectionnez le corps de pièce et la commande contextuelle Part
Body object -> Autorelimitation.... Cliquez dans le champ Faces à retirer et
sélectionnez les faces de votre choix.

Insertion d'un nouveau corps
Cette tâche vous montre comment insérer un nouveau corps dans la pièce.
Par exemple, ouvrez le document Add1.CATPart.
La pièce initiale, composée du corps de pièce et de deux corps, s'affiche :
1.
Cliquez sur l'icône Insertion d'un corps .
Si cette icône n'est pas visible dans l'application, vous pouvez l'afficher via la
commande Affichage -> Barre d'outils -> Insertion.
Le résultat est immédiat. CATIA affiche le nouveau corps, nommé "Body.3",
dans l'arbre des spécifications. Il est souligné, ce qui indique qu'il s'agit du corps
actif.

Vous pouvez maintenant construire ce nouveau corps en utilisant les
commandes disponibles dans cet atelier ou dans d'autres ateliers.
Vous remarquerez que le corps de pièce et Body.3 sont autonomes. Les
opérations effectuées sur l'un de ces corps n'affecteront pas l'intégrité de l'autre.
Si vous voulez les combiner, reportez-vous aux tâches décrivant les différentes
façons d'attacher des corps : Ajout de corps, Assemblage de corps, Intersection
de corps, Retrait de corps, Relimitation de corps.

Assemblage de corps
Assemblage lors d'une opération intégrant vos spécifications de pièce. Cette tâche
montre deux opérations d'assemblage. Vous verrez comment les pièces en résultant
peuvent différer selon vos spécifications.
Lorsque vous travaillez sur un document CATProduct, il n'est pas nécessaire de
copier et coller les corps appartenant à des pièces distinctes avant de les associer.
Vous pouvez associer ces corps directement en suivant les étapes décrites dans cette
tâche.
Ouvrez le document Assemble1.CATPart et assurez-vous que Part Body est le corps
actif.
Pour commencer, vous assemblez une poche à un corps de pièce. Vous remarquerez
que, comme cette poche est le premier composant du corps, de la matière a été
ajoutée (voir Poche).
1. Pour les assembler, sélectionnez Corps de pièce 2 et cliquez sur l'icône
Assemblage... .
L'assemblage d'un ensemble de corps (sélectionnés simultanément à l'aide de la
touche Ctrl) est désormais possible. Cette fonction vous permettra d'accroître votre
productivité.

La boîte de dialogue Assemblage apparaît pour vous laisser déterminer
l'assemblage que vous souhaitez exécuter. Par défaut, CATIA propose d'assembler
le corps sélectionné au corps de pièce.
2. Comme vous souhaitez exécuter cette opération, cliquez sur OK.
Lors de l'opération, CATIA extrait la matière définie par la poche à partir de Corps
de pièce.
Voici le nouveau Corps de pièce:

3. Maintenant, supprimez l'opération d'assemblage pour revenir à l'état précédent.
Vous allez exécuter la seconde opération d'assemblage.
4.
Sélectionnez Corps de pièce 2 et la commande Edition -> objet.Body2 ->
Assemblage.
La boîte de dialogue Assemblage apparaît de nouveau.
5. Sélectionnez Corps de pièce.1 dans l'arbre des spécifications pour modifier le
champ Après. Extrusion.2 apparaît dans le champ, indiquant que vous êtes sur le
point d'assembler Corps de pièce.2 à Corps de pièce.1.
6. Cliquez sur OK.
La matière définie par la poche à partir de Corps de pièce 1 a été extraite lors de
l'opération.

Vous ne pouvez pas réutiliser les commandes Assemblage, Ajout, Relimitation,
Intersection, Retrait et Autorelimitation sur des corps déjà associés à d'autres
corps. Toutefois, si vous copiez et collez le résultat de ces opérations à un autre
emplacement dans l'arbre, vous pouvez alors utiliser les commandes.
Structurer une conception
En règle générale, les opérations booléennes sont un moyen utile de structurer
votre pièce. Avant de procéder à la conception, vous pouvez en effet définir la
structure de la pièce en associant un corps contenant une géométrie à des corps
vides. Une fois ces spécifications effectuées, vous pouvez alors vous concentrer
sur la géométrie.

Intersection de corps
La matière qui résulte d'une opération d'intersection entre deux corps est la matière
partagée par ces corps. Ces tâches illustrent comment calculer deux intersections.
Lorsque vous travaillez sur un document CATProduct, il n'est désormais plus
nécessaire de copier et coller les corps appartenant à des pièces distinctes avant de
les associer. Vous pouvez associer ces corps directement en suivant les étapes
décrites dans cette tâche.
Ouvrez le document Intersect1.CATPart.
1. La pièce initiale se compose de trois corps. Chaque corps contient une extrusion.
Pour calculer l'intersection entre le corps de pièce Part Body et Body 2,
sélectionnez Body.2.
L'intersection d'un ensemble de corps (sélectionnés simultanément à l'aide de la
touche Ctrl) est désormais possible. Cette fonction vous permettra d'accroître votre
productivité.

2.
Cliquez sur l'icône Intersection... .
La boîte de dialogue Intersection apparaît pour vous permettre de déterminer le
second corps que vous souhaitez utiliser. Par défaut, l'application propose de
croiser le corps sélectionné au niveau du Corps de pièce.
3. Comme vous souhaitez exécuter cette opération, cliquez sur OK.
CATIA calcule l'intersection entre les deux corps.
Le corps de pièce ressemble, maintenant, à ce qui suit :

4. Maintenant, supprimez l'intersection pour revenir à l'état précédent. Vous allez
créer une nouvelle intersection.
5. Sélectionnez Corps de pièce 2 et cliquez-droit pour sélectionner la commande
contextuelle Edition -> objet.Body2 -> Intersection. La boîte de dialogue
Intersection s'affiche.
6. Sélectionnez Corps de pièce.1 dans l'arbre des spécifications pour modifier le
champ Après.
7. Cliquez sur OK. Corps de pièce.1 ressemble à ceci :

Vous ne pouvez pas réutiliser les commandes Assemblage, Ajout, Relimitation,
Intersection, Retrait et Autorelimitation sur des corps déjà associés à d'autres
corps. Toutefois, si vous copiez et collez le résultat de ces opérations à un autre
emplacement dans l'arbre, vous pouvez alors utiliser les commandes.
Structurer une conception
En règle générale, les opérations booléennes sont un moyen utile de structurer
votre pièce. Avant de procéder à la conception, vous pouvez en effet définir la
structure de la pièce en associant un corps contenant une géométrie à des corps
vides. Une fois ces spécifications effectuées, vous pouvez alors vous concentrer
sur la géométrie.

Ajout de corps
Cette tâche illustre la technique d'ajout d'un corps à un autre corps. L'ajout d'un corps
à un autre corps consiste à les réunir afin qu'ils forment une seule et même entité.
Lorsque vous travaillez sur un document CATProduct, il n'est désormais plus
nécessaire de copier et coller les corps appartenant à des pièces distinctes avant de
les associer. Vous pouvez associer ces corps directement en suivant les étapes
décrites dans cette tâche.
Ouvrez le document Add1.CATPart et assurez-vous que Part Body est le corps actif.
Il s'agit des données initiales : la pièce se compose de trois corps. Chaque corps
contient une extrusion. Ces extrusions sont donc indépendantes.
1. Pour ajouter Body.1 au corps de pièce Part Body, sélectionnez Body.1.
L'ajout d'un ensemble de corps (sélectionnés simultanément à l'aide de la touche
Ctrl) est désormais possible. Cette fonction vous permettra d'accroître votre
productivité.

2.
Cliquez sur l'icône Ajout .
La boîte de dialogue qui apparaît affiche le nom du corps sélectionné et du corps
de pièce. Par défaut, l'application propose d'ajouter le corps sélectionné au corps
de pièce.
Dans ce scénario, nous garderons cet emplacement. Notez toutefois que vous
pouvez ajouter Corps de pièce.1 à Corps de pièce.2 en sélectionnant simplement
Corps de pièce.2.
3. Cliquez sur OK.
L'arbre des spécifications et le corps de pièce ressemblent maintenant à ceci :

Vous noterez que :
La matière commune à Corps de pièce et Corps de pièce.1 a été retirée
Les deux extrusions conservent leurs couleurs originales.
Vous ne pouvez pas réutiliser les commandes Assemblage, Ajout, Relimitation,
Intersection, Retrait et Autorelimitation sur des corps déjà associés à d'autres
corps. Toutefois, si vous copiez et collez le résultat de ces opérations à un autre
emplacement dans l'arbre, vous pouvez alors utiliser les commandes.
Structurer une conception
En règle générale, les opérations booléennes sont un moyen utile de structurer
votre pièce. Avant de procéder à la conception, vous pouvez en effet définir la
structure de la pièce en associant un corps contenant une géométrie à des corps
vides. Une fois ces spécifications effectuées, vous pouvez alors vous concentrer
sur la géométrie.

Retrait de corps
Cette tâche illustre comment retirer un corps d'un autre corps.
Lorsque vous travaillez sur un document CATProduct, il n'est désormais plus
nécessaire de copier et coller les corps appartenant à des pièces distinctes avant de
les associer. Vous pouvez associer ces corps directement en suivant les étapes
décrites dans cette tâche.
Ouvrez le document Remove1.CATPart.
1. La pièce se compose de deux corps. Pour retirer Corps de pièce.1 de Corps
principal, sélectionnez Corps de pièce.1.
Le retrait d'un ensemble de corps (sélectionnés simultanément à l'aide de la
touche Ctrl) est désormais possible. Cette fonction vous permettra d'accroître votre
productivité.
2.
Cliquez sur l'icône Retrait... .

Le résultat est immédiat. Cependant, si l'arbre des spécifications est composé de
plusieurs corps, une boîte de dialogue s'affiche pour vous permettre de déterminer
le deuxième corps à utiliser. Par défaut, l'application propose de supprimer le corps
sélectionné de Corps principal.
Le cylindre est extrait de Corps principal:
Vous ne pouvez pas réutiliser les commandes Assemblage, Ajout, Relimitation,
Intersection, Retrait et Autorelimitation sur des corps déjà associés à d'autres
corps. Toutefois, si vous copiez et collez le résultat de ces opérations à un autre
emplacement dans l'arbre, vous pouvez alors utiliser les commandes.
Structurer une conception
En règle générale, les opérations booléennes sont un moyen utile de structurer
votre pièce. Avant de procéder à la conception, vous pouvez en effet définir la
structure de la pièce en associant un corps contenant une géométrie à des corps
vides. Une fois ces spécifications effectuées, vous pouvez alors vous concentrer
sur la géométrie.

Relimitation de corps
L'application de la commande Relimitation partielle à un corps suppose de définir les éléments
à garder ou à supprimer lors de l'opération de relimitation.
Les règles suivantes doivent être gardées à l'esprit :
Règle 1
RETRAIT: Sont retirés UNIQUEMENT les corps sélectionnés
Règle 2
GARDER: le corps sélectionné est conservé. TOUS les autres corps sont retirés
Règle 3
RETRAIT n'est pas nécessaire s'il existe une spécification GARDER

Concrètement, vous devez sélectionner les deux corps concernés et spécifier les faces à
conserver ou à supprimer.
Cette tâche montre comment utiliser la fonctionnalité Relimitation partielle.
Lorsque vous travaillez sur un document CATProduct, il n'est désormais plus nécessaire
de copier et coller les corps appartenant à des pièces distinctes avant de les associer.
Vous pouvez associer ces corps directement en suivant les étapes décrites dans cette
tâche.
Ouvrez le document UnionTrim1.CATPart.
1. Sélectionnez le corps de pièce à relimiter, soit Corps.2.
2.
Cliquez sur l'icône Relimitation partielle .
La boîte de dialogue de définition d'une relimitation partielle s'affiche. Les faces que
vous ne pouvez pas sélectionner sont en rouge foncé.
3. Cliquez dans le champ Faces à retirer et sélectionnez la face interne de Corps.2.

La face sélectionnée apparaît maintenant en rose, ce qui signifie qu'elle sera retirée
au cours de l'opération.
4. Cliquez dans le champ Faces à garder et sélectionnez la face interne du corps de
pièce.
Cette face apparaît maintenant en bleu, ce qui signifie que l'application va la garder.
5. Cliquez sur OK.
L'application calcule la matière à retirer. Cette opération (identifiée par Relim.xxx) est
ajoutée à l'arbre des spécifications.

Vous ne pouvez pas réutiliser les commandes Assemblage, Ajout, Relimitation,
Intersection, Retrait et Autorelimitation à des corps déjà associés à d'autres corps.
Toutefois, si vous copiez et collez le résultat de ces opérations à un autre
emplacement dans l'arbre, vous pouvez alors utiliser les commandes.

Conservation et retrait de faces
La commande retrait de volumes permet de transformer un corps en retirant de la
matière. Pour retirer de la matière, vous devez indiquer les faces que vous souhaitez
retirer ou, au contraire, les faces que vous souhaitez conserver. Dans certains cas,
vous devez spécifier à la fois les faces à retirer et les faces à conserver.
L'utilisation de cette commande est un moyen pratique d'éliminer les cavités que vous
avez créées par inadvertance.
Cette tâche illustre comment refaçonner un corps en retirant les faces dont vous
n'avez pas besoin. Selon les faces que vous sélectionnez pour le retrait, vous obtenez
deux corps distincts.
Ouvrez le document RemoveLump1.CATPart.
1. Sélectionnez le corps à refaçonner, c'est-à-dire le corps de pièce.
2.
Cliquez sur l'icône Autorelimitation .
La boîte de dialogue Retrait de volumes apparaît. L'application vous invite à
spécifier les faces que vous souhaitez retirer ainsi que celles que vous voulez
garder.
3. Cliquez dans le champ Faces à retirer et
sélectionnez la face colorée.
La face sélectionnée apparaît maintenant en
rose, ce qui signifie qu'elle sera retirée au cours
de l'opération.

4. Cliquez sur OK.
Le corps obtenu se présente comme suit :
Supprimez maintenant Relim.1 dans l'arbre des
spécifications et répétez les étapes 1 et 2.
5.
Dans la boîte de dialogue qui s'affiche, cliquez
sur le champ Faces à retirer et sélectionnez la
6. face inférieure.
Cette face apparaît en rose.
Les faces sélectionnées comme faces à conserver apparaissent en bleu.
7. Cliquez sur OK.
Le corps obtenu se présente comme suit :
Vous ne pouvez pas réutiliser les commandes Assemblage, Ajout, Relimitation,
Intersection, Retrait et Autorelimitation à des corps déjà associés à d'autres corps.
Toutefois, si vous copiez et collez le résultat de ces opérations à un autre
emplacement dans l'arbre, vous pouvez alors utiliser les commandes.
Cavités
La commande Retrait de volumes vous permet de supprimer des cavités et par
conséquent de contrôler la qualité de la pièce. Comme l'illustre l'exemple ci-après,
la pièce initiale comporte une cavité résultant de la création d'une coque.

Appliquer la commande Retrait de volumes et sélectionner la face à conserver...
permet de reformer la pièce. CATIA a retiré les faces non adjacentes à la face
sélectionnée.

Outils
Analyse de dépouille : Définissez une direction à l'aide de la boussole, cliquez sur
l'icône, sélectionnez la pièce et entrez la valeur d'angle de dépouille minimum dans
le champ sous le cadre vert.
Analyse de la courbure : Sélectionnez un corps, cliquez sur cette icône et entrez de
nouvelles valeurs dans l'échelle de couleurs.
Analyse du taraudage/filetage : Cliquez sur cette icône et activez ou désactivez les
options d'affichage.
Mesure des distances et angles minimum : Cliquez sur cette icône, définissez le type
et le mode de mesure de votre choix et sélectionnez une surface, une arête ou un
sommet.
Mesure des propriétés : Sélectionnez l'élément de votre choix et cliquez sur cette
icône.
Mesure d'inertie: Cliquez sur cette icône et sélectionnez l'élément de votre choix.
Définition d'un repère : Cliquez sur cette icône, entrez des coordonnées ou
sélectionnez une géométrie pour définir les trois axes.
Création de composants sans historique : Cliquez sur cette icône pour désactiver le
mode Historique.
Application d'un matériau : Sélectionnez l'élément sur lequel le matériau doit être
appliqué, cliquez sur cette icône, sélectionnez un matériau et cliquez sur Appliquer
des matériaux.
Publication d'un élément : Sélectionnez la commande Outils -> Publication,
sélectionnez l'élément à publier et renommez-le.

Effectuer une analyse de dépouille
La commande Analyse de dépouille vous permet d'analyser l'angle de dépouille sur une surface.
Dans cette tâche, vous apprendrez à détecter si la pièce que vous avez dépouillée pourra être
facilement retirée du moule associé. Pour en savoir plus sur les dépouilles, veuillez vous reporter
à la section Dépouille de base.
Ce type d'analyse repose sur des palettes de couleurs qui permettent d'identifier sur l'élément
analysé les zones dans lesquelles l'écart par rapport à la direction de la dépouille, représentée ed
by the par la perpendiculaire à la surface en un point donné, correspond aux valeurs spécifiées :
Ces valeurs sont exprimées dans l'unité spécifiée dans l'onglet Unité accessible via la commande
Outils -> Options -> Paramètres ->généraux -> .
Vous pouvez les modifier en cliquant sur la flèche qui leur correspond ou en entrant directement
une autre valeur dans le champ.
La précision des valeurs saisies est de 0.1.
Les valeurs possibles pour les couleurs s'échelonnent de -20 à 20 mais l'analyse est effectuée
entre -90 et 90 degrés.
Assurez-vous que le mode de vue est en mode matériau (Affichage -> Style de rendu ->
Personnalisation de mode de vue -> Matériaux).
Ouvrez le document DraftAnalysis1CATPart.
1. Avant d'analyser la dépouille, vous devez
définir une direction à l'aide de la boussole.
Cette direction est supposée être la direction
d'extraction utilisée pour démouler la pièce.
Faites glisser la boussole vers le plan zx.
L'axe Y indique toujours la direction d'analyse.
Une fois la boussole ancrée dans le plan, vous
pouvez commencer à utiliser la commande
Analyse de dépouille.

2.
Cliquez sur l'icône Analyse de dépouille .
3.
Sélectionnez la pièce. Sélectionner une face est suffisant pour prendre en compte la pièce
dans sa globalité. Pour améliorer l'affichage, éloignez le compas du plan en faisant un
"Glisser-Déplacer".
La boîte de dialogue Analyse de dépouille s'affiche. L'analyse est ainsi visible sur la pièce. La
pièce a trois couleurs : rouge, bleu clair et vert. Chaque couleur est définie dans la boîte de
dialogue. Chaque couleur est associée à une fourchette de valeurs d'angle de dépouille,
comme indiqué dans les champs ci-dessous. Les valeurs vont de -20 à 20 degrés.
Cependant, ces couleurs qui sont définies pour des fourchettes minimales et maximales
s'appliquent également à des valeurs inférieures à -20 ou supérieures à 20 degrés.
4.
Vous pouvez personnaliser ces couleurs. Par exemple, double-cliquez sur la flèche bleu clair
pour afficher une palette de couleurs que vous utiliserez pour créer votre propre jaune.

5.
Dans la palette qui apparaît, faites glisser la croix à l'intérieur du spectre pour changer
instantanément la couleur de la petite boîte qui se trouve sous le spectre. Faites glisser la
croix afin d'obtenir une couleur jaune.
6.
Si besoin est, déplacez la flèche vers le haut ou vers le bas pour faire varier la brillance de la
couleur personnalisée puis cliquez sur OK pour créer votre propre couleur.
La palette de couleurs se ferme puis l'analyse de dépouille s'affiche en jaune plutôt qu'en bleu
clair.
Pour obtenir le meilleur des couleurs, utilisez la fonction Vue + Luminosité selon la procédure
décrite dans CATIA- Infrastructure Guide de l'utilisateur Version 5.
7.
Gardez l'option Par paliers: gauche. Les différents types d'affichage de la gamme de couleurs
sont les suivants :
linéaire,
par paliers: gauche,
par paliers: centre (réservé aux surfaces, voir CATIA FreeStyle Shaper & Optimizer
Guide de l'utilisateur),
par paliers: droite (réservé aux surfaces, voir CATIA FreeStyle Shaper & Optimizer
Guide de l'utilisateur),
L'option linéaire est disponible également pour analyser les faces dépouillées. En fonction de
la complexité de la pièce, il arrive qu'elle soit parfois plus efficace.
8. Entrez 2.0 dans le champ associé à la flèche verte. Vous pouvez manipuler les valeurs
d'angle de dépouille en cliquant sur les flèches également. Cette valeur est la valeur d'angle
de dépouille minimale qui permet l'extraction de la pièce.
La boîte de dialogue a maintenant cette allure...

.. et la pièce ressemble à ce qui suit :
A l'aide des valeurs et des couleurs définies et de la direction déterminée au début de cette
tâche, vous pouvez analyser les résultats comme suit :
- les zones rouges ne peuvent pas être démoulées. Elles ont une valeur d'angle de dépouille
comprise entre -90 et 0 degrés.
- les zones jaunes ne peuvent pas être démoulées non plus. Elles ont une valeur d'angle de
dépouille comprise entre 0 et 2 degrés.
- les zones vertes peuvent être démoulées. Elles ont une valeur d'angle de dépouille
comprise entre 2 et 90 degrés.
9. Cliquez sur Inversion direction analyse pour inverser automatiquement l'analyse :

10. Cochez l'option Analyse locale puis déplacez le pointeur dans la zone jaune.
Les flèches sont affichées sous le pointeur et identifient ainsi la perpendiculaire à la face à
l'emplacement du pointeur (flèche verte). Le déplacement du pointeur dans la surface
entraîne la mise à jour dynamique de l'affichage de la perpendiculaire.
La valeur affichée indique l'angle créé entre la direction de la dépouille et la perpendiculaire à
la surface au point courant.
De plus, des cercles indiquent le plan tangent à la surface en ce point.
11. Si vous cliquez sur la flèche verte (Perpendiculaire) la perpendiculaire inversée apparaît en
pointillés.
Si vous cliquez sur la flèche rouge, l'emplacement de la flèche permettant les manipulations
12.
générales en fonction du compas est gelé.

Par défaut, l'analyse est verrouillée : elle est effectuée selon une direction spécifiée, l'axe w
de la boussole.
13. Désactivez l'option Direction verrouillée et sélectionnez une direction (une droite ou un plan
dont la perpendiculaire est utilisée), ou utilisez les manipulateurs de la boussole, s'ils sont
disponibles.
14. Une fois que vous avez terminé l'analyse de dépouille, cliquez sur Fermer. Sinon, cliquez sur
Rétablir pour revenir aux valeurs par défaut de la gamme des couleurs.
Si entre-temps vous avez utilisé une autre fonction, vous devez réouvrir la boîte de
dialogue Analyse de dépouille en cliquant sur l'icône Analyse de dépouille puis
sur Rétablir pour supprimer l'analyse de l'élément.
Notez que les paramètres sont enregistrés lorsque vous quittez la commande, et
réaffichés lorsque vous cliquez à nouveau sur l'icône Analyse de dépouille.
Lorsque l'option Direction verrouillée est désactivée, l'analyse locale
Dans certains cas, même si le style de rendu est correctement défini, il se peut que les
résultats de l'analyse ne soient pas visibles. Vérifiez que la géométrie est bien à jour ou
effectuez une mise à jour des éléments géométriques concernés.

Analyse de courbure
Dans cette tâche, vous apprendrez à analyser la courbe de Gauss d'un corps.
Le mode de visualisation doit être défini sur Rendu réaliste avec texture et contours et l'option
de discrétisation doit être défini sur la valeur maximale (l'option Précision en 3D -> Fixé doit être
définie sur 0).
1. Sélectionnez le corps.
2.
Cliquez sur l'icône Analyse de courbure .
La boîte de dialogue Analyse de courbure apparaît. L'analyse est visible sur l'élément
sélectionné.
3. Choisissez l'option Limitée, la liste déroulante Rayon limité est activée.
Ceci vous permet d'afficher les zones de la surface dont le rayon de courbure est inférieur ou
supérieur à une valeur donnée.
Les champs Rayon min et Rayon max vous aident à déterminer les valeurs extrêmes afin de
définir la valeur du Rayon limité.
Cette valeur est exprimée dans l'unité définie dans l'onglet Unités accessible via la
commande Outils -> Options -> Paramètres ->généraux -> , paramètre Longueur.
Dans ce mode, la gamme de couleurs est inactive.

4. De même, choisissez le type d'analyse Zone inflectionpour identifier l'orientation de la
courbure :
en vert : les zones dans lesquelles les courbures minimum et maximum ont la même
orientation
en bleu : les zones dans lesquelles les courbures minimum et maximum ont une
orientation opposée
5. Sélectionnez à nouveau le type Gaussien et choisissez l'option Linéaire dans la boîte de
dialogue.
Les options disponibles pour afficher la gamme de couleurs sont Linéaire ou Par paliers:
gauche.
Les valeurs vont de 0 à 1, ce qui correspond aux courbures gaussiennes minimum et
maximum respectivement.
6. Modifiez les valeurs de la gamme de couleurs pour mettre en évidence des zones
spécifiques de la surface sélectionnée.
Pour ce faire, faites glisser (en cliquant) les flèches qui délimitent les couleurs ou entrez
directement les valeurs appropriées.
7. Passez au type d'analyse Minimum ou Maximum pour afficher la valeur de courbure
minimum ou maximum respectivement.
8. Cochez la case Analyse globale pour effectuer l'analyse sur tous les éléments à la fois.
Dans ce cas, sachez que si la courbure peut être très différente d'un élément à l'autre,
l'analyse globale uniformisera les couleurs. Il vous suffit de redéfinir les valeurs en utilisant
les pointeurs de la boîte de dialogue Analyse de courbure.
Par exemple, pour des valeurs identiques et une surface plane sélectionnée, la courbure, en
tenant compte de la surface plane, est moins prononcée.
9. Cliquez sur Fermer pour quitter la fonction d'analyse ou sur Rétablir pour revenir aux valeurs
par défaut de la gamme des couleurs.
Double-cliquez sur les flèches de la gamme de couleurs pour afficher le sélecteur de
couleur vous permettant de redéfinir la gamme.
Les valeurs de courbure et de rayon sont affichées en mode dynamique en fonction de
la position du pointeur et exprimées dans les unités définies via la commande Outils ->
Options -> Paramètres ->généraux ->, onglet Unités.
Dans certains cas, même si le style de rendu est correctement défini, il se peut que les
résultats de l'analyse ne soient pas visibles. Vérifiez que la géométrie est bien à jour ou
effectuez une mise à jour des éléments géométriques concernés.

Analyse de filetage/taraudage
Dans cette tâche, vous apprendrez à afficher et filtrer des informations relatives aux
taraudages et aux filetages contenus dans un document CATPart.
Ouvrez le document ThreadAnalysis.CATPart.
1. Cliquez sur l'icône Analyse des taraudages/filetages .
La boîte de dialogue Analyse des taraudages/filetages s'affiche, des options
d'affichage sont déjà définies par défaut :
Visualisation de la géométrie : affiche la représentation des taraudages et des
filetages dans la zone géométrique. La couleur de ces représentations peut
être personnalisée via la commande Outils -> Options -> Général (Affichage)
(seuls l'onglet Visualisation et l'option Eléments sélectionnés).
Visualisation des valeurs numériques : affiche trois valeurs définies pour les
taraudages et les filetages de la manière suivante : diamètre x profondeur x
pas
La boîte de dialogue contient également le nombre total de taraudages et filetages
contenus dans votre document. L'application a détecté deux taraudages et un filetage,
comme indiqué dans la zone Analyse numérique.
2.Cliquez sur Appliquer pour afficher les représentations et les valeurs de ces
taraudages et filetages.
Ces représentations et ces valeurs (diamètre x profondeur x pas) apparaissent en
orange et en jaune respectivement :

Désactiver l'option "Visualisation de la géométrie" vous permet d'afficher les valeurs
numériques uniquement. De la même manière, si vous désactivez l'option
"Visualisation des valeurs numériques", seules les représentations sont affichées.
3. Cliquez sur le bouton Plus pour accéder aux filtres d'affichage.
4. Par défaut, les options "Visualisation des taraudages" et "Visualisation des
filetages" sont sélectionnées. Désactivez"Visualisation des taraudages" pour afficher
uniquement les filetages.

5. Cliquez sur Appliquer pour lancer l'analyse.
Un seul filetage a été détecté :
6. Activez à nouveau l'option "Visualisation des taraudages" pour poursuivre ce
scénario.
7. Cochez l'option "Diamètre" et entrez 70 comme valeur de diamètre dans le champ
Valeur.
8. Cliquez sur Appliquer.
L'application affiche un seul taraudage avec 70 comme valeur de diamètre.

9. Cliquez sur Fermer lorsque vous avez terminé.

Mesure des distances minimales et des angles
entre des entités géométriques ou des points
La commande Mesure vous permet de mesurer les distances et les angles entre des entités géométriques ou
des points par rapport au repère absolu du document (valeur par défaut) ou par rapport à un autre repère V5.
Dans cette tâche, vous apprendrez à mesurer des distances et des angles entre des entités géométriques
(surfaces, arêtes, sommets et produits entiers) ou entre des points.
Insérez tous les fichiers modèles contenus dans le dossier samples. Ce dernier est situé dans le dossier de la
documentation en ligne sous catcf\samples.
Restrictions :
Ni le mode visualisation, ni les fichiers cgr n'autorisent la sélection de sommets individuels.
1. Cliquez sur l'icône Mesures .
Dans DMU, vous pouvez aussi sélectionner Analyse-> Mesures dans la barre de menus.
La boîte de dialogue Mesure entre et la barre d'outils Outils de mesure s'affichent.
Vous pouvez mesurer les distances et les angles entre des entités géométriques ou des points par
rapport au repère absolu du document (valeur par défaut) ou par rapport à un repère V5 local.
L'option Garder la mesure vous permet de conserver les mesures courantes et suivantes en tant
que composants. Cette option est particulièrement utile si vous désirez conserver les mesures
comme annotations par exemple.
Les mesures gardées en tant que composants sont associatives et peuvent être utilisées en tant
que paramètres.
Remarque : Cette option n'est pas disponible dans l'atelier Drafting.
Cliquer deux fois sur une mesure existante dans l'arbre des spécifications permet de la supprimer,
d'en modifier la présentation ou de visualiser des informations dans la boîte de dialogue.
La barre d'outils Outils de mesure comporte deux icônes :
Dialogues de mesure : permet d'afficher ou de masquer la boîte de dialogue associée.
Sortir de la mesure : permet de quitter la mesure. Cette icône est particulièrement utile
lorsque la boîte de dialogue est masquée.
2. Dans la zone de liste Type mesure, sélectionnez le type de mesure désiré.

Définition des types de mesure
Relatif (type par défaut) : mesure la distance et l'angle entre la référence définie et les éléments
cibles
En chaîne : définit la cible comme référence de la mesure suivante.
En éventail : fixe la référence sélectionnée afin qu'elle soit toujours à l'origine des mesures.
3. Dans les zones de liste Mode cible et Mode référence, sélectionnez le mode de mesure désiré.
Définition des modes de mesure référence et cible
Toute géométrie (mode par défaut) : permet de mesurer les distances et les angles entre des
entités géométriques définies (points, arêtes, surfaces, etc).
Toute géométrie, infinie : mesure les distances et les angles entre des faces planes plaquées sur
des plans infinis et des segments de droite plaqués sur des droites infinies. Pour toute autre
sélection, le mode de mesure est Toute géométrie.
Point sur géométrie : mesure les distances entre des points sélectionnés sur des entités
géométriques définies.
Point seul : mesure les distances entre les points. La mise en évidence dynamique est limitée aux
points.
Ligne seule, Surface seule : permet de mesurer les distances et les angles entre des arêtes et des
surfaces respectivement. La mise en évidence dynamique est limitée aux arêtes ou aux surfaces.
Elle est donc simplifiée par rapport au mode Toute géométrie.
Axe de sélection : permet de mesurer les distances et les angles entre une entité et une droite
infinie perpendiculaire à l'écran.
Il vous suffit de cliquer pour créer une droite infinie
perpendiculaire à l'écran.
Intersection : permet de mesurer les distances entre des points d'intersection situés entre deux
arêtes ou une arête et une surface. Dans ce cas, deux sélections sont nécessaires pour définir la
référence et la cible.
Extrémités : permet de mesurer les distances entre les extrémités ou les milieux d'arêtes. Sur les
surfaces courbes, seules les extrémités sont proposées.
Centre d'un arc : permet de mesurer les distances entre les centres d'arcs.
Coordonnées : permet de mesurer les distances entre les coordonnées indiquées pour des cibles
et/ou des références.
Remarque : Les angles sont mesurés entre les arêtes (qui sont des droites), entre une droite et une face
plane ou entre deux faces planes uniquement.
4. Cliquez sur une surface, une arête, un sommet ou un produit entier (référence) pour le/la sélectionner.
Remarques :
L'apparence du curseur a changé en fonction de la commande de mesure choisie. Un numéro (1
pour la référence et 2 pour la cible) permet également de vous repérer dans la mesure.
Lorsque vous placez le curseur sur des surfaces, des faces et des sommets, la mise en évidence
dynamique permet de localiser la référence et la cible.

5. Cliquez sur une autre surface, une autre arête, un autre sommet ou un autre produit entier (cible) pour
le/la sélectionner.
Une droite représentant le vecteur de distance minimale est tracée entre les éléments sélectionnés dans
la zone géométrique. Les valeurs de distance appropriées s'affichent dans la boîte de dialogue.
La distance minimale totale, ainsi que les composants du vecteur de distance entre les éléments
sélectionnés et les coordonnées x, y et z des points entre lesquels la distance minimale a été mesurée
sont indiqués dans la boîte de dialogue Mesures.
Le nombre de décimales, l'affichage des zéros après la virgule et les limites de la notation exponentielle
sont contrôlés via l'onglet Unités de la boîte de dialogue Options (Outils -> Options, Général ->
Paramètres). Pour en savoir plus, reportez-vous à Infrastructure - Guide de l'utilisateur.
6. Sélectionnez une autre référence et, si vous le désirez, un mode de mesure.
7. Sélectionnez le type de mesure En éventail pour fixer la référence sélectionnée de sorte qu'elle soit
toujours à l'origine des mesures.
8. Sélectionnez la cible.
9. Sélectionnez une autre cible.

10.Si nécessaire, ajustez la présentation de la mesure.
Vous pouvez déplacer les lignes et le texte de la mesure.
Le mode Toute géométrie reconnaît l'axe des cylindres et
vous permet par exemple de mesurer la distance entre les
axes de deux cylindres.
A l'aide de la commande Autre sélection... dans le menu contextuel, vous pouvez accéder au
centre des sphères.

Personnalisation d'une mesure
Vous pouvez, à tout moment, personnaliser l'affichage des
résultats à la fois dans la zone géométrique et dans la boîte de
dialogue. Pour ce faire, cliquez sur Personnaliser... dans la boîte
de dialogue Mesures et définissez l'affichage dans la boîte de
dialogue Personnalisation Mesure Entre. Par défaut, tous les
résultats sont affichés.
Mesure dans un repère local
Pour cette partie de la tâche, vous aurez besoin d'un repère V5.
11.Cochez la case Autre repère de la boîte de dialogue.
12.Sélectionnez un repère V5 dans l'arbre des spécifications ou dans la zone géométrique.
13.Effectuez votre mesure.
Même mesure par rapport au repère absolu :
Toutes les mesures suivantes sont effectuées par rapport au repère sélectionné. Pour changer de
repère, cliquez sur le champ Autre repère et sélectionnez un autre repère. Pour retourner au
repère absolu, cochez la case Repère global.
Ce type de mesure est associatif : si vous déplacez le repère, la mesure s'en trouve modifiée et
peut être mise à jour.
14.Lorsque vous avez terminé, cliquez sur Fermer.
Mesures associatives pouvant être utilisées comme
paramètres
Si vous avez sélectionné l'option Garder la mesure dans dans la
boîte de dialogue Mesures, vos mesures sont conservées en tant
que composants et l'arbre des spécifications se présente ainsi.
Les mesures sont :
persistantes

associatives :
Si vous modifiez ou déplacez une pièce dans un contexte
de structure de produit et que la mesure s'en trouve
modifiée, elle sera identifiée comme étant non mise à jour
dans l'arbre des spécifications. Vous pouvez la mettre à
jour localement.
Valide en mode conception.
Peuvent être utilisés comme paramètres :
Un jeu de paramètres (longueur, angle, etc.) est associé à
chaque élément mesure dans l'arbre des spécifications.
Les paramètres peuvent ensuite être utilisés dans des
formules ou pour créer une géométrie.
Dans l'atelier Drafting, les mesures sont effectuées à la volée. Elles ne sont pas persistantes. Autrement
dit, elles ne sont pas associatives et ne peuvent être utilisées en tant que paramètres.

Mesure de propriétés
La commande Mesure vous permet de mesurer les propriétés par rapport au repère
absolu du document (valeur par défaut) ou par rapport à un autre repère V5.
Dans cette tâche vous apprendrez à mesurer les propriétés associées à un élément
sélectionné (points, arêtes, surfaces ou produits entiers).
Insérez tous les fichiers modèles contenus dans le dossier samples. Ce dernier est situé
dans le dossier de la documentation en ligne sous catcf\samples.
Restrictions :
Ni le mode visualisation, ni les fichiers cgr n'autorisent la sélection de sommets
individuels.
1. Passez en mode conception (Edition ->Représentations ->Mode conception).
2. Sélectionnez Rendu réaliste avec arêtes comme valeur pour Affichage -> Style de
rendu.
Remarque : Si seul le mode Rendu réaliste est sélectionné, vous ne pouvez pas
utiliser cette commande.
3. Cliquez sur l'icône Mesure d'entités .
Dans DMU, vous pouvez aussi sélectionner Analyse -> Mesure d'entités à partir de
la barre de menus.
La boîte de dialogue Mesure d'entités et la barre d'outils Outils de mesure
apparaissent.
Vous pouvez mesurer les propriétés par rapport au repère absolu du
document (valeur par défaut) ou par rapport à un repère V5 local.
L'option Garder la mesure vous permet de conserver les mesures courantes
et suivantes en tant que composants. Cette option est particulièrement utile si
vous désirez conserver les mesures comme annotations par exemple.
Les mesures gardées en tant que composants sont associatives et peuvent
être utilisées en tant que paramètres.
Remarque : Cette option n'est pas disponible dans l'atelier Drafting.
Cliquer deux fois sur une mesure existante permet de la supprimer, d'en
modifier la présentation ou de visualiser des informations dans la boîte de
dialogue.

La barre d'outils Outils de mesure
comporte deux icônes :
Dialogues de mesure :
permet d'afficher ou de
masquer la boîte de
dialogue associée.
Sortir de la mesure :
permet de quitter la mesure.
Cette icône est
particulièrement utile
lorsque la boîte de dialogue
est masquée.
4. Cliquez sur l'élément désiré pour le sélectionner.
Remarque : L'apparence du curseur a changé en fonction de la commande choisie.
La boîte de dialogue est mise à jour.
La boîte de dialogue contient des informations sur l'élément sélectionné (dans le cas
présent, une surface). Le centre de gravité de la surface est représenté par un point.
Dans le cas de surfaces non planes, le centre de gravité est relié à la surface sur la
distance minimale.
5. Cliquez sur Personnaliser... dans la boîte de dialogue Mesure entre arêtes afin
d'afficher les propriétés détectées par le système pour les différents types d'élément
pouvant être sélectionnés.

Personnalisation d'une mesure
Vous pouvez à tout moment personnaliser l'affichage des résultats, que ce soit dans
la zone géométrique ou dans la boîte de dialogue. Pour ce faire, cliquez sur
Personnaliser... dans la boîte de dialogue Mesure entre arêtes et définissez
l'affichage dans la boîte de dialogue Personnalisation de mesure d'objets.
6. Essayez de sélectionner d'autres éléments pour en mesurer les propriétés.
7. Ajustez la présentation de la mesure si
nécessaire :
Vous pouvez déplacer les lignes et le
texte de la mesure.
8. Cliquez sur une arête :

Le système détecte si l'arête est une droite, une courbe ou un arc en tenant compte
de la précision du modèle.
Si une droite ou une courbe est détectée, la boîte de dialogue indique la
longueur ainsi que les coordonnées X, Y, Z des points de départ et d'arrivée.
Si un arc est détecté, la boîte de dialogue indique également l'angle, le rayon
ou le diamètre de l'arc et les coordonnées X, Y, Z du point central.
Le vecteur de direction des droites est alors disponible.
9. Tout en maintenant la touche Ctrl enfoncée, cliquez sur d'autres arêtes pour les
ajouter à la sélection initiale.
Lorsque vous sélectionnez des arêtes, la longueur de chaque arête s'ajoute à la
longueur totale pour donner la longueur combinée de toutes les arêtes de la surface.
Vous pouvez également multi-sélectionner des éléments du même type, par
exemple un jeu de faces afin de déterminer l'aire entière.
10. Cliquez sur une face plane pour obtenir l'équation du plan.
Un plan est reconnu et identifié dans la boîte de dialogue. L'équation d'un plan est :
Ax + By + Cz + D=0.

La commande Mesure d'entités vous permet d'accéder au rayon d'une sphère
ou d'un cylindre exact.
A l'aide de la commande Autre sélection... dans le menu contextuel, vous
pouvez accéder à l'axe d'un cylindre et au centre d'une sphère pour mesurer
la distance entre les axes de deux cylindres par exemple.
La commande Mesure d'entités reconnaît dorénavant les sections coniques
de type ellipse.
Le nombre de décimales (affichage des zéros après la virgule pour notation
exponentielle) peut être défini à partir de l'onglet Unités dans la boîte de dialogue
Options (Outils -> Options,Général -> Paramètres). Pour en savoir plus,
reportez-vous à Infrastructure - Guide de l'utilisateur.
Mesure des propriétés dans un repère local
Pour cette partie de la tâche, vous aurez besoin d'un repère V5.
11. Cochez la case Autre repère de la boîte de dialogue.
12. Sélectionnez un repère V5 dans l'arbre des spécifications ou dans la zone
géométrique.
13. Effectuez votre mesure.
Mesure effectuée par rapport au repère Même mesure effectuée par rapport au
local : repère absolu :

Toutes les mesures suivantes sont effectuées par rapport au repère
sélectionné. Pour changer de repère, cliquez sur le champ Autre repère et
sélectionnez un autre repère. Pour retourner au repère principal, cochez la
case Repère global.
Ce type de mesure est associatif : si vous déplacez le repère, la mesure s'en
trouve modifiée et peut être mise à jour.
14. Lorsque vous avez terminé, cliquez sur Fermer.
Mesures associatives pouvant être
utilisées comme paramètres
Si vous avez sélectionné l'option Garder
la mesure dans la boîte de dialogue
Mesure d'entités, vos mesures sont
conservées en tant que composants et
l'arbre des spécifications se présente
ainsi.
Les mesures sont :
persistantes
associatives :
Si vous modifiez ou déplacez une
pièce dans un contexte de
structure de produit et que la
mesure s'en trouve modifiée, elle
sera identifiée comme étant non
mise à jour dans l'arbre des
spécifications. Vous pouvez la
mettre à jour localement.
Valide en mode conception.
Peuvent être utilisés comme
paramètres :
Un jeu de paramètres (aire, centre
de gravité, longueur, angle, etc.)
est associé à chaque élément
mesure dans l'arbre des
spécifications. Les paramètres
peuvent ensuite être utilisés dans
des formules ou pour créer une
géométrie.
Dans l'atelier Drafting, les mesures sont effectuées à la volée. Elles ne sont pas
persistantes. Autrement dit, elles ne sont pas associatives et ne peuvent être
utilisées en tant que paramètres.

Mesures d'inertie
Dans cette tâche, vous apprendrez à mesurer les propriétés d'inertie d'un objet.
Vous pouvez mesurer les propriétés d'inertie des surfaces et des volumes, et extraire la densité
ou la densité de surface si l'évaluation est faite à partir de documents de type modèle V4. Vous
pouvez également extraire des inertia équivalents définis dans des formules CATIA
Knowledgeware.
L'aire, la densité, la masse et le volume (des volumes uniquement) de l'objet sont également
calculés.
Les mesures sont persistantes : l'option Garder la mesure dans la boîte de dialogue Mesures
d'inertie vous permet de conserver en tant que composant la mesure active dans l'arbre des
spécifications.
Remarque : Cette option n'est pas disponible dans l'atelier Drafting.
Pour des exemples montrant des propriétés d'inertie mesurées sur des surfaces.
Insérez tous les fichiers Valve.cgr dans le dossier des échantillons. Il se trouve dans le dossier de
la documentation en ligne sous catcf\samples.
1. Cliquez sur l'icône Mesures d'inertie .
Dans DMU, vous pouvez aussi sélectionner Analyse-> Mesures d'inertie dans la barre de
menus.
La boîte de dialogue Mesures
d'inertie s'affiche.
Remarque : Lorsque vous déplacez le curseur sur la géométrie ou sur l'arbre des
spécifications, son apparence change en fonction de la commande de mesure choisie.
2. Cliquez sur l'élément désiré pour le sélectionner dans l'arbre des spécifications, par exemple
Valve.
Dans la zone géométrique, vous pouvez à présent sélectionner des faces et des arêtes
individuellement dans des fichiers cgr et en mode visualisation.
La boîte de dialogue
s'agrandit pour afficher les
résultats de l'élément
sélectionné.
La mesure s'effectue sur la
sélection, sur la géométrie ou
sur l'assemblage. Pour
mesurer l'inertie des
sous-produits individuels
formant un assemblage et
visualiser les résultats dans la
fenêtre, vous devez
sélectionner le sous-produit
désiré.
Dans le cas présent, l'élément

sélectionné n'a aucun
sous-produit.
Outre le centre de gravité G,
les principaux moments
d'inertie M et la matrice d'inertie
calculée par rapport au centre
de gravité, la boîte de dialogue
spécifie l'aire, le volume (des
volumes uniquement), la
densité et la masse de
l'élément sélectionné.
Vous pouvez également
calculer et afficher les axes
principaux A. Pour ce faire,
activez d'abord l'option
correspondante dans la boîte
de dialogue Personnalisation
de mesure d'objets.
La densité est celle de la matière appliquée à la pièce, le cas échéant.
Si aucune densité n'est calculée, la valeur par défaut s'affiche. Si vous le désirez,
vous pouvez modifier cette valeur. Dans ce cas, toutes les autres valeurs d'inertie
sont recalculées. La valeur par défaut est 1000 kg/m3 pour les volumes et 10 kg/m2
pour les surfaces.
Si les sous-produits ont des densités différentes, l'expression Non uniforme s'affiche.
Remarques :
Pour accéder à la densité des pièces auxquelles des matières ont été
appliquées, vous devez être en mode conception.
La densité est la mesure de la masse d'un élément par unité de volume
exprimée en kg/m3. La densité de surface est la mesure de la masse d'un
élément par unité de surface exprimée en kg/m2.
Les axes d'inertie sont mis en
évidence dans la zone
géométrique. Une boîte
d'encombrement parallèle aux
axes et englobant l'élément
sélectionné s'affiche
également.
Utilisation de couleurs pour les
axes :
Rouge : axe
correspondant au
premier moment (M1)
Vert : axe correspondant
au deuxième moment
(M2)
Bleu : axe
correspondant au
troisième moment (M3)

3. Cliquez sur Personnaliser... pour personnaliser l'affichage de la boîte de dialogue Mesures
d'inertie et définissez les éléments à exporter dans le fichier texte.
Personnalisation d'une
mesure
Vous pouvez à tout moment
définir ce qui sera calculé et
affiché dans la zone
géométrique et dans la boîte de
dialogue. Pour ce faire, cliquez
sur Personnaliser... dans la
boîte de dialogue Mesures
d'inertie.
Remarque : Les propriétés
d'inertie sélectionnées ici sont
également exportées dans un
fichier texte.
Cliquez sur les options
appropriées pour calculer et
afficher :
les Inertia équivalents
les axes principaux
la matrice d'inertie en
fonction de l'origine O
la matrice d'inertie en
fonction d'un point P
la matrice d'inertie en
fonction d'un repère
le moment d'inertie par
rapport à un repère
4. Cliquez sur OK dans la boîte de dialogue Personnalisation de mesure d'objets, une fois
l'opération terminée.
5. Cliquez sur Fermer dans la boîte de dialogue Mesures d'inertie.
Le nombre de décimales, l'affichage des zéros après la virgule et les limites de la notation
exponentielle sont contrôlés via l'onglet Unités de la boîte de dialogue Options (Outils ->
Options, Général -> Paramètres).
6. Insérez les fichiers Body1.cgr et Body2.cgr à partir du dossier des échantillons.
7. Sélectionnez le produit racine et cliquez sur l'icône Mesures d'inertie.
8. Cliquez sur Exporter pour enregistrer les résultats dans un fichier texte (*.txt).
Seuls les résultats affichés dans la boîte de dialogue Mesures d'inertie sont exportés. Les
résultats exportés sont donnés en unités courantes.
9. Indiquez l'emplacement et le nom du fichier dans la boîte de dialogue Exporter résultats qui
s'affiche.
Remarque : Si l'élément sélectionné comprend des sous-produits, les résultats individuels
de tous les sous-produits sont également exportés et enregistrés dans un fichier texte. Vous
trouverez ci-dessous un exemple.

Remarque : Lors de l'importation du fichier texte dans une feuille de calcul Excel, n'oubliez
pas d'identifier le délimiteur (|) utilisé dans la boîte de dialogue de l'Assistant d'importation
de texte.
10. Lorsque vous avez terminé, cliquez sur Fermer.
Vous pouvez écrire un script de macro pour automatiser votre tâche. Reportez-vous à
Space Analysis dans la page d'accueil de la documentation Automation.
Mesures associatives pouvant être utilisées comme paramètres
Si vous avez sélectionné
l'option Garder la mesure dans
dans la boîte de dialogue
Mesures, vos mesures sont
conservées en tant que
composants et l'arbre des
spécifications se présente ainsi.
Les mesures sont :
persistantes
associatives :
Si vous modifiez ou
déplacez une pièce dans
un contexte de structure
de produit et que la
mesure s'en trouve
modifiée, elle sera
identifiée comme étant
non mise à jour dans
l'arbre des spécifications.
Vous pouvez la mettre à
jour localement.
Valides en mode
conception et pour les
mesures sur les produits
sélectionnés dans l'arbre

des spécifications en
mode visualisation.
Peuvent être utilisés
comme paramètres :
Un jeu de paramètres
(aire, volume, masse,
centre de gravité, etc.)
est associé à chaque
élément mesure dans
l'arbre des spécifications.
Les paramètres peuvent
ensuite être utilisés dans
des formules ou pour
créer une géométrie.
Dans l'atelier Drafting, les mesures sont effectuées à la volée. Elles ne sont pas
persistantes. Autrement dit, elles ne sont pas associatives et ne peuvent être utilisées en
tant que paramètres.

Repère
Dans cette tâche, vous apprendrez à définir localement un repère à trois axes. Il existe deux manières de le définir :
soit en sélectionnant une géométrie, soit en entrant des coordonnées.
Ouvrez le document AxisSystem.CATPart.
1.
Sélectionnez la commande Insertion -> Repère ou cliquez sur l'icône Repère .
La boîte de dialogue Définition du repère s'affiche.
2. Un repère est composé d'un point d'origine et de trois axes orthogonaux. Par exemple, vous pouvez
sélectionner d'abord le sommet pour positionner l'origine du repère que vous voulez créer. L'application
calcule ensuite les coordonnées restantes. Les deux axes calculés sont alors parallèles à ceux du repère courant.
Le repère se présente de la manière suivante :
3. Si par exemple l'axe x ne vous convient pas, cliquez sur le champ correspondant et sélectionnez l'arête comme
indiqué pour définir une nouvelle direction pour l'axe x.
L'axe x devient colinéaire à l'arête.

4. Cochez l'option Inverser pour inverser la direction de l'axe x. Cliquer sur l'axe a également pour effet
d'inverser sa direction.
Notez qu'il existe deux types de repères : direct et indirect. La boîte de dialogue indique le type à côté de
l'option Courant.
5. L'application vous permet également de définir des axes à l'aide de coordonnées. Cliquez avec le bouton droit
de la souris sur le champ Axe Y et sélectionnez la commande contextuelle Coordonnées. La boîte de dialogue
Axe Y s'affiche.
6. Gardez X=0, Y=0 et entrez Z= -1 pour les coordonnées de l'axe Y.
Le repère est modifié en conséquence. L'application a calculé les coordonnées de l'axe X.
Vous pouvez modifier les coordonnées en définissant des formules. Pour en savoir plus, reportez-vous au
manuel CATIA Knowledge Advisor - Guide de l'utilisateur.
Le cas échéant, vous pouvez également définir de nouveaux points, droites ou plans via les commandes
contextuelles disponibles dans chaque champ de la boîte de dialogue Définition du repère.
l C réer le point : pour en savoir plus, reportez-vous à la section Points
l C réer la droite : pour en savoir plus, reportez-vous à la section Droites
l C réer le plan : pour en savoir plus, reportez-vous à la section Plans

7. Cliquez sur OK pour confirmer l'opération et fermer la boîte de dialogue.
8. Cliquez sur Plus pour ouvrir la boîte de dialogue Définition du repère.
Les premières lignes contiennent les coordonnées du point d'origine. Les coordonnées de l'axe X apparaissent à
la deuxième ligne. Les coordonnées de l'axe Y apparaissent à la troisième ligne. Les coordonnées de l'axe Z
apparaissent à la quatrième ligne.
Pendant que vous définissez le repère, l'application détecte si les axes sont orthogonaux ou non. Les
incohérences éventuelles sont relevées dans la boîte de dialogue Diagnostic de la mise à jour.
9. Désactivez l'option Courant si vous ne voulez pas définir l'axe comme axe de référence. Le repère absolu situé
en bas à droite du document devient alors le repère courant.
10.
Cliquez sur OK.
Le repère est créé. L'arbre des spécifications reflète cette création. Lorsqu'il est défini comme étant le repère
courant, il est mis en surbrillance comme indiqué ci-dessous.
Le mode d'affichage des axes diffère selon que le repère est direct ou indirect et courant ou non.
| REPERE TROIS AXES | COURANT | MODE D'AFFICHAGE DU REPERE |           |
| ----------------- | ------- | -------------------------- | --------- |
| direct            | oui     |                            | plein     |
| direct            | non     |                            | tireté    |
| indirect          | oui     |                            | pointillé |
| indirect          | non     |                            | mixte     |
11. Cliquez avec le bouton droit de la souris sur Axis System.1 et sélectionnez la commande contextuelle Rendre
courant. Le repère Axis System.1 est désormais le repère courant. Vous pouvez sélectionner par exemple le
plan xy pour définir un plan d'esquisse.

Edition d'un repère
Vous pouvez éditer votre repère en double-cliquant dessus et en saisissant de nouvelles valeurs dans la boîte de
dialogue qui s'affiche. Vous pouvez également utiliser la boussole pour éditer le repère. Pour en savoir plus sur
la boussole, reportez-vous au manuel CATIA Infrastructure - Guide de l'utilisateur version 5.
Notez également que l'édition des éléments géométriques sélectionnés pour définir les axes ou le point
d'origine modifie la définition du repère en conséquence.
Un clic droit sur Axis System.Xobject dans l'arbre des spécifications vous permet d'accéder aux commandes
contextuelles suivantes :
l D éfinition...: redéfinit le repère
l Is oler : définit le repère indépendamment de la géométrie
l R endre courant/Rendre non courant : détermine si le repère est le repère de référence ou non.
Création d'un repère lors de la création d'un document CATPart
Une nouvelle option vous permet de créer un repère lorsque vous créez un document CATPart. Pour savoir
comment y accéder, reportez-vous à la section Personnalisation d'un document CATPart.

Création d'éléments sans historique
Dans cette tâche, vous apprendrez à créer des géométries lorsque le mode Historique est
désactivé.
Dans ce cas, lorsque vous créez un élément, aucun lien ne subsiste avec les autres entités
utilisées pour le créer.
1. Cliquez sur l'icône Création d'éléments sans historique pour désactiver le mode
historique.
Pour réactiver ce mode, cliquez de nouveau sur l'icône.
Si vous cliquez deux fois sur cette icône, le mode Eléments sans historique devient
permanent. Il suffit de cliquer à nouveau sur l'icône pour le désactiver.
Un clic sur l'icône active le mode Eléments sans historique pour la commande
courante ou la suivante.
Le mode Historique (actif ou inactif) demeure sélectionné d'une session à l'autre. Il s'agit en fait
d'un paramètre.

Application d'un matériau
Dans cette tâche, vous apprendrez à appliquer un matériau prédéfini et à repositionner
de manière interactive le matériau plaqué.
Un matériau peut être appliqué à
un corps principal, une surface, un corps ou un corps surfacique (dans un
document .CATPart).
Remarque : Vous pouvez appliquer différents matériaux à différentes
instances d'un même document CATPart.
un produit (dans un document .CATProduct) ;
des instances de document .model, .cgr, .CATPart (dans un document
.CATProduct).
Dans un document CATProduct, vous ne devez pas
appliquer différents matériaux à différentes
instances d'une même pièce, car un matériau
appartient aux caractéristiques physiques
spécifiques d'une pièce. Vous pouvez alors obtenir
des incohérences.
Ouvrez le document ApplyMaterial.CATProduct.
Sélectionnez la commande Affichage -> Style de rendu->Afficher la vue personnalisée
pour vérifier que les options "Rendu réaliste" et "Rendu réaliste avec texture" sont
activées. La boîte de dialogue Modes de vue personnalisés ne s'affiche pas si elle a
déjà été activée durant la session.

1. Sélectionnez l'élément sur lequel le matériau doit être appliqué.
Remarque : Vous pouvez également appliquer un matériau à plusieurs
éléments simultanément. Pour ce faire, il vous suffit de sélectionner les
éléments désirés (à l'aide du pointeur ou des trappes) avant d'appliquer le
matériau.
2. Cliquez sur l'icône Appliquer des matériaux .
La boîte de dialogue Bibliothèque s'ouvre. Elle comprend plusieurs pages
d'échantillons de matériaux. L'onglet de chaque page indique le nom de la
famille à laquelle appartient le matériau :

3. Sélectionnez un matériau dans une famille en cliquant dessus.
Vous pouvez également double-cliquer sur un matériau pour afficher ses
propriétés et les analyser.
4. Cochez la case Lier au fichier si vous voulez plaquer le matériau sélectionné en
tant qu'objet lié et l'actualiser automatiquement lorsque des modifications sont
apportées au matériau d'origine dans la bibliothèque.
Deux icônes différentes (l'une avec une flèche blanche, l'autre sans
) identifient respectivement les matériaux liés et non liés dans l'arbre
des spécifications.
Remarque : Vous pouvez modifier des matériaux liés. Ceci a pour effet de
modifier également le matériau d'origine dans la bibliothèque. Si vous
voulez sauvegarder les modifications apportées au matériau d'origine,
utilisez la commande Fichier ->Enregistrer tout.
Sélectionnez la commande Edition->Liaisons...
pour identifier la bibliothèque contenant le
matériau d'origine. Vous pouvez ensuite ouvrir
cette bibliothèque dans l'Atelier de catalogues de
matériaux si vous le souhaitez.
Vous pouvez également utilisez la commande Collage spécial... pour
coller un matériau en tant qu'objet lié. Vous pouvez copier des matériaux
liés ou non liés. Il est possible, par exemple, de coller un matériau lié sur
un élément différent du même document ou sur un élément d'un autre
document. Pour plus de détails, reportez-vous à la section Copie et
collage à l'aide de la commande Collage spécial... de ce manuel.
5. Cliquez sur Appliquer des matériaux pour
plaquer le matériau sur l'élément.
Le matériau sélectionné est appliqué à
l'élément et l'arbre des spécifications est
actualisé. Dans notre exemple, le
matériau n'est pas plaqué en tant
qu'objet lié.
Un symbole jaune peut être affiché pour
indiquer le mode d'héritage du matériau.
Pour en savoir plus, reportez-vous à la
section Définition d'une priorité entre
une pièce et un produit dans ce manuel.

Les spécifications de matériaux sont gérées au niveau de l'arbre des
spécifications : tous les matériaux plaqués sont identifiés. Pour modifier
des matériaux (pour plus d'informations, voir Modification de matériaux), il
suffit de cliquer avec le bouton droit de la souris sur le matériau et de
sélectionner Propriétés dans le menu contextuel ou de double-cliquer sur
le matériau. Vous pouvez également lancer des recherches pour localiser
un matériau donné dans un assemblage important (pour en savoir plus,
voir la section Recherche de matériaux de ce manuel) ou bien utiliser les
fonctions copier & coller ou glisser & déposer.
A moins que vous ne sélectionniez, dans l'arbre
des spécifications, l'emplacement désiré pour
plaquer le matériau, le fait de faire glisser et
déposer un matériau l'applique sur le niveau
hiérarchique le plus bas (par exemple, si vous
effectuez un glisser-déposer sur une pièce, le
matériau sera appliqué sur le corps et non sur la
pièce elle-même).
Toutefois, notez qu'un matériau appliqué sur un
corps n'a pas d'impact sur le calcul des
propriétés physiques de la pièce (masse,
densité, etc.), puisque ce sont les propriétés
physiques de la pièce uniquement, et non celles
du corps, qui seront prises en compte.
6. Cliquez sur OK dans la boîte de dialogue Bibliothèque.
L'objet a l'aspect suivant :
Remarque : L'application de matériaux à des éléments a une incidence
sur les propriétés physique et mécanique de ces éléments, par exemple
sur leur densité.

7. Cliquez avec le bouton droit de la souris sur le matériau que vous venez de
plaquer dans l'arbre des spécifications et choisissez l'option Propriétés.
La boîte de dialogue Propriétés s'affiche :
8. Choisissez l'onglet Rendu pour modifier les propriétés de rendu appliquées à
l'élément.
9. Au besoin, modifiez la taille du matériau pour adapter son échelle à celle de
l'élément.
10. Cliquez sur OK dans la boîte de dialogue Propriétés lorsque vous êtes satisfait
du placage du matériau sur l'élément.

Remarque : Des licences sont requises pour l'utilisation des onglets
Analyse et Dessin.
11. Utilisez le manipulateur pour positionner le matériau de manière interactive :
Glissez-déposez le manipulateur sur la pièce : le manipulateur
s'aligne sur la pièce.
Sélectionnez le matériau dans l'arbre des spécifications :
Le support de placage apparaît (dans ce cas, un cylindre).
Le cas échéant, effectuez un zoom avant et arrière pour
visualiser le support de placage qui reflète la taille du matériau.
Effectuez un panoramique et faites pivoter le matériau jusqu'à ce
que vous soyez satisfait du résultat. Vous pouvez effectuer :
un panoramique le long d'un axe quelconque (x, y ou z) du
manipulateur (faites glisser l'un de ses axes) ;
une rotation dans un plan (tracez un arc sur le
manipulateur) ;
un panoramique dans un plan (tracez un plan sur le
manipulateur) ;
une rotation libre autour d'un point du manipulateur (faites
glisser la poignée de rotation libre au sommet de la
boussole).
Le positionnement du matériau à l'aide du
manipulateur n'est disponible que pour les
solutions P2 dans un document .CATPart.
Pour plus d'informations sur la manipulation
d'objets à l'aide du manipulateur 3D,
reportez-vous au manuel Infrastructure - Guide
de l'utilisateur.

Publication d'éléments
Dans cette tâche, vous apprendrez à publier des éléments. Vous publierez un plan, puis une esquisse.
Ouvrez le document Publish_R07.CATPart ou, si vous travaillez dans Assembly Design, ouvrez par exemple
le document AssemblyTools01.CATProduct et vérifiez que le composant contenant l'élément que vous
souhaitez publier est actif.
1. Sélectionnez Outils -> Publication.
La commande Publication vous permet de :
publier un élément géométrique ;
éditer le nom par défaut donné à l'élément publié ;
remplacer l'élément géométrique associé au nom ;
supprimer un élément publié.
La boîte de dialogue Publication s'affiche.
2. Sélectionnez l'élément à publier. Par exemple, sélectionnez Plan.1.
Vous pouvez publier les éléments suivants :
points, droites, plans, esquisses ;
corps (si vous sélectionnez un composant, le corps auquel il appartient est également sélectionné).
Lorsqu'elle est activée, l'option "Publier une face, arête, axe, sommet ou extrémité" vous permet de sélectionner
directement des faces, des arêtes, des sommets, des axes ou des extrémités.
La boîte de dialogue affiche à présent le nom et le statut de l'élément sélectionné, de même que "Plan.1",
qui est le nom donné à l'élément publié.

3. Cliquez sur "Plan.1" dans la boîte de
dialogue. Le plan est mis en évidence
dans la géométrie.
4. Renommez-le "Nouveau plan".
Le plan est publié sous le nom de "Nouveau plan". Notez toutefois que l'élément géométrique
Open_body.1/Plane1 n'a pas été renommé.
5. Avant de publier un autre élément, cliquez
sur Options pour accéder aux options de
changement de nom.
Lorsque vous utilisez la commande
Publication, vous pouvez en effet décider
de renommer ou non les éléments que
vous êtes en train de publier. Avant de les
renommer, vous pouvez définir l'un des
trois modes de travail suivants :
Jamais : l'application ne vous
autorisera pas à renommer
l'élément publié. Il s'agit de l'option
par défaut.
Toujours : l'application vous
permettra toujours de renommer
l'élément publié.
Demander : l'application vous
demandera ce que vous décidez de
faire, à savoir renommer ou non
l'élément publié.
Vous pouvez renommer tous les éléments,
sauf les axes, les arêtes et les faces.
6.Cochez la case "Demander" et cliquez sur OK pour sortir.
7.Avant de sélectionner l'élément à publier, désélectionnez "Nouveau plan" si ce n'est pas déjà fait.
8.Sélectionnez "Esquisse.1" comme nouvel élément à publier.
9.Renommez-le "Nouvelle esquisse". Un message s'affiche, vous demandant si vous souhaitez renommer
le nouvel élément publié "Esquisse.1" par "Nouvelle esquisse".

10.Cliquez sur OUI pour confirmer. Le nom de l'élément publié est "Nouvelle esquisse" et l'élément
géométrique est également renommé.
11.Cliquez sur "Open_body.1/Plane.1" pour le remplacer par un autre élément géométrique.
12.Sélectionnez "Plan.2" comme élément de
remplacement.
Un message s'affiche, vous demandant de
confirmer la modification.
13.Cliquez sur OUI pour confirmer.
Plan.2 a été publié alors que Plan.1 ne
l'est plus.
La boîte de dialogue affiche à présent les
informations suivantes :
14. Cliquez sur OK lorsque le résultat vous convient.
L'entité "Publication" a été ajoutée à l'arbre des spécifications. Les deux éléments publiés s'affichent en
dessous de "Publication" :

Manipulation de pièces dans un
environnement multi-documents
Dans cette tâche, vous apprendrez à copier un corps principal d'un document
CATPart à un autre, puis à modifier le corps principal d'origine. Le présent scénario
montre comment l'application harmonise ensuite ce type de modifications. Grâce aux
liens définis entre documents, vous pouvez travailler en ingénierie concurrente.
Ouvrez le document MultiDocument1.CATPart.
Le scénario suppose qu'il existe deux documents CATPart. Part2.CATPart est le
document cible, Part1.CATPart contient le corps principal qui sera copié puis
modifié dans Part2.
Le corps principal à copier se présente ainsi :
1. Sélectionnez Corps principal.
2. Sélectionnez la commande Edition -> Copier pour copier le corps principal.
Ouvrez un nouveau document CATPart nommé "Part2.CATPart" et placez le
3.
curseur n'importe où dans l'arbre des spécifications.
4. Sélectionnez la commande Edition -> Collage spécial... .
La boîte de dialogue Collage spécial s'affiche. Deux options de collage sont
disponibles :
As specified in Part document: l'objet est collé avec les spécifications de
conception
As Result With Link: l'objet est copié sans les spécifications de conception
qui lui sont associées

5.
Dans ce scénario, sélectionnez l'option As Result With Link et cliquez sur OK .
Le corps principal est copié dans le document Part2.CATPart. Notez que l'arbre
des spécifications l'affiche sous le nom de "Solid.1".
Ce solide est représenté par un cube.
6.
Si vous le souhaitez, vous pouvez créer un congé sur quatre arêtes. Vous pouvez
effectuer toutes les modifications nécessaires.

7. Replacez-vous dans le document Part1.CATPart.
8. Utilisez l'option Supprimer pour retirer de la matière du corps principal.
9.
Dans le document Part2.CATPart, le symbole graphique en forme de cube utilisé
pour Solid.1 dans l'arborescence contient désormais un point rouge. Cela signifie
que des transformations ont été apportées au corps principal d'origine.
Observez également que le symbole de mise à jour s'affiche en regard du
document Part2.

10.
Vous devez maintenant mettre à jour l'objet copié. Cliquez sur Solid.1 dans l'arbre
des spécifications.
Sélectionnez l'option Mise à jour pour mettre à jour l'ensemble du corps.
11.
La commande objet Solid.1 -> Mise à jour du lien vous permet de mettre à jour le
lien entre le corps principal d'origine et le nouveau corps.
Le solide est mis à jour pour refléter la modification effectuée : de la matière a été
supprimée.
L'arbre des spécifications indique que le corps principal a intégré les modifications
apportées au corps principal d'origine.

Copie optimisée
Créer des copies optimisées: Sélectionnez la commande Insertion ->Outils de
réplication-> Création d'une copie optimisée, sélectionnez les éléments formant la
copie optimisée dans l'arbre des spécifications, nommez cette copie ainsi que ses
éléments de référence puis choisissez une icône pour l'identifier.
Instancier des copies optimisées: Sélectionnez la commande Insertion -> Outils de
réplication -> Instanciation d'une copie optimisée..., sélectionnez le document ou le
catalogue contenant la copie optimisée, complétez les Entrées de la boîte de
dialogue en sélectionnant les éléments appropriés dans la zone géométrique.
Sauvegarder des copies optimisées dans un catalogue: Sélectionnez la copie
optimisée dans l'arbre des spécifications, sélectionnez la commande Insertion ->
Outils de réplication -> Sauvegarde en catalgue d'une copie optimisée... , saisissez
le nom du catalogue et cliquez sur Ouvrir.

Création de copies optimisées
Dans cette tâche, vous apprendrez à créer des copies optimisées, destinées à être
réutilisées ultérieurement.
Une copie optimisée est un ensemble de composants (éléments géométriques,
formules, contraintes etc) qui sont regroupés afin d'être utilisés dans un contexte
différent, et qui peuvent être complètement redéfinis lorsqu'ils sont collés.
Une copie optimisée contient l'objectif de conception et le savoir-faire du concepteur,
ce qui permet de les réutiliser au mieux pour une efficacité accrue.
Ouvrez le document PowerCopyStart.CATPart.
1. Sélectionnez l'option de menu Insertion ->Outils de réplication -> Création de copies
optimisées .
La boîte de dialogue Définition de copie optimisée s'affiche.
2. Sélectionnez les éléments qui forment la copie optimisée dans l'arbre des
spécifications. Dans ce scénario, sélectionnez "Part Body".

La boîte de dialogue contient automatiquement les informations sur les éléments
sélectionnés.
3. Définissez la copie optimisée comme vous le souhaitez :
L'onglet Définition vous permet d'affecter un nom à la copie optimisée et d'afficher
ses composants en 3D. Par exemple, entrez "Test" dans le champ Nom:.

4. L'onglet Entrées vous permet de définir les éléments de référence constituant la
copie optimisée. Vous pouvez renommer ces éléments pour rendre leur définition
plus explicite en les sélectionnant dans la fenêtre et en entrant un nouveau nom
dans le champ Nom. Le nom attribué par défaut à l'élément en fonction de son type
apparaît toujours entre parenthèses. Par exemple, sélectionnez le plan xy et
renommez-le "Plan1".
L'onglet Paramètres vous permet de définir les valeurs de paramètre utilisées dans
la copie optimisée que vous pourrez modifier au moment de l'instanciation. Il peut
s'agir d'une valeur ou d'une formule par exemple.
5. Sélectionnez les paramètres et cliquez sur Publié. Dans le cas d'une formule, vous
pouvez choisir Faux ou Vrai. Par exemple, sélectionnez PartBody\Trou.1\Diamètre
Utilisez le champ Nom pour renommer l'élément de manière plus explicite. Par
exemple, entrez "Trou.1".

6. L'onglet Icône vous permet de modifier l'icône identifiant la copie optimisée dans
l'arbre des spécifications. Un sous-ensemble d'icônes est accessible via le bouton
Choix d'icônes. Si vous cliquez dessus, le butineur d'icônes s'ouvre et affiche toutes
les icônes chargées dans votre session CATIA. Cliquez sur l'icône en forme
d'enveloppe .
7.
La zone Prévisualisation vous permet de capturer une image de la copie optimisée
à stocker avec sa définition. Cliquez sur le bouton Capture d'écran. Vous pouvez
effectuer un zoom avant ou arrière pour redimensionner l'image.

8.
Cliquez sur le bouton Supprimer la prévisualisation si l'image ne vous est pas utile.
9.
Cliquez sur OK pour créer la copie optimisée.
Cette copie apparaît en haut de l'arbre des spécifications.

Double-cliquez sur "Test" dans l'arbre des spécifications pour afficher la boîte de
dialogue Définition de copie optimisée et modifier son contenu.
Quelques conseils
Dans la mesure du possible, choisissez un nombre restreint d'éléments formant la
copie optimisée.
Lorsque vous définissez des copies optimisées comportant des esquisses, utilisez
des profils contraints par rapport à des arêtes ou à des faces plutôt qu'à des plans.
De plus, désactivez l'option de création de contraintes géométriques avant de
commencer l'esquisse. En général, il est préférable d'utiliser des profils à la fois
rigides et mobiles.
Evitez de contraindre les éléments 2D par rapport au repère absolu. Le résultat
obtenu après instanciation de la copie optimisée pourrait être instable. En effet, vous
n'avez pas la possibilité de modifier la position de l'origine du repère absolu ou son
orientation.

Il est préférable de contraindre les éléments par rapport à des références externes
telles que des faces, des arêtes, des plans de référence ou explicites :
Evitez d'utiliser des projections ou des intersections dans votre esquisse si vous
souhaitez l'utiliser dans une copie optimisée.

Evitez également de définir des contraintes par rapport à des plans de référence.
Avant de créer des copies optimisées, assurez-vous que votre esquisse n'est pas
surcontrainte.
En général, il est préférable d'utiliser des profils à la fois rigides et mobiles.
Assurez-vous que votre esquisse est iso contrainte (vert). Vous pouvez utiliser des
esquisses non iso contraintes, mais il sera plus difficile de comprendre et de vérifier
le résultat après l'instanciation.

Instanciation de copies optimisées
Dans cette tâche, vous apprendrez à instancier des copies optimisées ayant été
créées selon la procédure décrite dans la section Création de copies optimisées.
Deux méthodes s'offrent à vous :
utilisation de la commande Instanciation d'une copie optimisée
utilisation d'un catalogue
Ouvrez le document PowerCopyDestination.CATPart.
Utilisation de la commande Instanciation d'une copie optimisée
1. Sélectionnez la commande Insertion -> Outils de duplication avancés ->
Instanciation d'une copie optimisée....
La boîte de dialogue Sélection de copie optimisée s'affiche et vous permet
d'accéder au document ou au catalogue où la copie optimisée est stockée.
Accédez au répertoire C:\Program Files\Dassault Systemes\B06doc\online\prtug\samples.
2. Sélectionnez le document contenant la copie optimisée, c'est-à-dire
PowerCopyResults.CATPart.
La boîte de dialogue Insertion d'objet s'affiche.
Utilisez la liste Référence pour sélectionner la copie optimisée qui convient lorsque
plusieurs copies ont été définies dans le document.

3.
Complétez les Entrées de la boîte de dialogue en sélectionnant l'élément approprié
dans la zone géométrique : sélectionnez la face supérieure d'Extrusion1 comme
élément plan remplaçant Plan1.
4. Cliquez sur le bouton Utiliser les mêmes noms pour sélectionner automatiquement
tous les éléments ayant le même nom. Ici, les plans zx et yz sont sélectionnés.
Cette commande est particulièrement utile lorsqu'il s'agit de la même entrée
répétée plusieurs fois.

5.
Cliquez sur le bouton Paramètres pour afficher la boîte de dialogue Paramètres.
6. Entrez 18 mm comme nouvelle valeur de diamètre.
Vous pouvez utiliser le bouton Création de formules pour créer automatiquement
une formule pour tous les paramètres ayant le même nom.
7. Cliquez sur OK pour confirmer l'opération et fermer la boîte de dialogue.
8. Cliquez sur OK pour créer l'instance de copie optimisée.

La copie optimisée est instanciée en contexte, ce qui signifie que ses limites sont
automatiquement redéfinies en prenant en compte les éléments sur lesquels elle
est instanciée.
Sélectionnez l'option Répétition pour pouvoir relancer l'instanciation. Dans ce cas,
une fois que vous avez cliqué sur OK dans la boîte de dialogue Insertion d'objet,
cette dernière reste ouverte, les Entrées de la copie optimisée sont répertoriées et
prêtes à être remplacées par de nouvelles entrées comme décrit précédemment.
Si vous double-cliquez sur l'option Répétition, vous pouvez effectuer plusieurs
instanciations l'une après l'autre.
Une fois instanciées, les copies optimisées ne sont plus liées aux copies d'origine
utilisées pour les définir.
Utilisation d'un catalogue
Il vous faut un catalogue disponible, créé soit :
via la fonctionnalité Catalogue, voir CATIA- Infrastructure Guide de
l'utilisateur Version 5
via l'option de menu Insertion -> Outils de duplication avancés ->
Sauvegarde en catalogue d'une copie optimisée... Instanciation.
1.
Cliquez sur l'icône .
Si vous utilisez le catalogue pour la première fois, vous devez accédez à son
emplacement. Cet emplacement est stocké dans les paramètres pour permettre un
accès ultérieur plus rapide.

2. Sélectionnez le catalogue contenant la copie optimisée que vous souhaitez
instancier.
3.
Sélectionnez la copie optimisée à instancier, vous pouvez ensuite :
faire glisser-déplacer la copie sur l'élément de référence
double-cliquer sur la copie optimisée
ou cliquer avec le bouton droit de la souris sur la copie optimisée dans la
boîte de dialogue et utiliser le menu contextuel Instancier.
Instanciez ensuite la copie optimisée comme décrit précédemment en commençant
par l'étape 3.

Sauvegarde de copies optimisées dans
un catalogue
Dans cette tâche, vous apprendrez à stocker des éléments de copies optimisées dans
un catalogue, pour les utiliser ultérieurement comme décrit dans la section
Instanciation d'une copie optimisée.
Ouvrez le document PowerCopyResults.CATPart.
1. Sélectionnez la copie optimisée dans l'arbre des spécifications par exemple.
2. Choisissez Insertion -> Outils de réplication -> Sauvegarde de copie optimisée... .
La boîte de dialogue Sauvegarde en catalogue s'affiche :
Lorsque vous créez un catalogue pour la première fois, cliquez sur le bouton ...
pour afficher la boîte de dialogue Ouvrir et accédez à l'emplacement où vous
souhaitez créer un catalogue.
Saisissez ensuite le nom du catalogue et cliquez sur Ouvrir.
Si vous souhaitez ajouter une copie optimisée à un catalogue existant, activez
l'option Mise à jour du catalogue existant dans la boîte de dialogue Sauvegarde en
catalogue.
Par défaut, la boîte de dialogue Sauvegarde en catalogue rappelle le dernier
catalogue utilisé.
3. Cliquez sur OK.
La copie optimisée est stockée dans le catalogue.

Réutilisation d'une conception
La réutilisation d'une conception a pour but d'améliorer les performances mais suppose
également de bien maîtriser les différentes fonctionnalités offertes par l'application. Vous
pouvez réutiliser votre conception de plusieurs manières.
Voici une brève description de ces fonctionnalités :
Fonctionnalités Objectifs
Offre un moyen rapide de réutiliser des composants ou des
Copier et Coller corps simples. Cette commande doit être utilisée lorsque
vous avez besoin de reprendre une seule spécification ou
lorsque vous n'avez besoin d'aucune spécification.
Offre un moyen rapide de réutiliser des composants ou des
Couper et Coller corps simples en d'autres emplacements. Cette commande
doit être utilisée lorsque vous avez besoin de reprendre une
seule spécification ou lorsque vous n'avez besoin d'aucune
spécification.
Glisser-déposer Offre un moyen rapide de copier des composants ou des
corps simples en d'autres emplacements.
Collage spécial Réutilise des corps avec ou sans leurs spécifications.
Paste as Result with Link Si cette option est utilisée, seule la géométrie est copiée, pas
les spécifications. Les corps collés avec cette option font
apparaître les modifications apportées aux corps initiaux.
Cette commande est surtout utilisée dans un environnment
multi-modèles.
Comme spécifié dans le Si cette option est utilisée, les corps sont collés avec
document Part les spécifications de conception. La fonctionnalité est la
même que pour la commande Copier et coller.

Crée plusieurs composants identiques à partir d'un ou
Répétition rectangulaire plusieurs composants ou même de corps et les place
simultanément sur la pièce.
Répétition circulaire
Vous placez les instances selon une grille rectangulaire ou
circulaire, ou encore en utilisant des points d'esquisse.
Répétition personnalisée
Crée un ensemble de composants (éléments géométriques,
Copie optimisée formules, contraintes etc) qui sont regroupés afin d'être
utilisés dans un contexte différent. Vous pouvez redéfinir
complètement ces entités lorsque vous les collez. Une copie
optimisée contient l'objectif de conception et le savoir-faire
du concepteur, ce qui permet de les réutiliser au mieux pour
une efficacité accrue.
Nous vous conseillons d'utiliser cette commande pour les
corps, les composants, les esquisses et les tables de
paramétrage qui requièrent de nouvelles spécifications.
Pour optimiser vos résultats à long terme, utilisez cette
fonctionnalité pour enrichir vos catalogues.

Couper, copier et coller
Les étapes suivantes décrivent comment couper et coller ou comment copier et coller
des éléments de Part Design.
Il est conseillé d'utiliser ces commandes lorsqu'il ne vous est pas nécessaire de
spécifier à nouveau les éléments à coller ou lorsque les spécifications requises pour
ces éléments ne sont pas trop nombreuses. En principe, vous devez utiliser ces
commandes pour des éléments simples.
1. Sélectionnez l'objet que vous souhaitez coller ou copier.
2. Pour couper, vous pouvez au choix :
cliquer sur l'icône Couper
sélectionner la commande Edition->Couper
sélectionner la commande Couper dans le menu contextuel,ou
dans la zone géométrique ou l'arbre des spécifications, faire glisser la
sélection (bien qu'il ne s'agisse pas d'une coupe graphique, c'est équivalent
à une opération de coupe).
Ceci place le(s) élément(s) que vous avez coupé(s) dans le presse-papiers.
Pour copier, vous pouvez au choix :
cliquer sur l'icône Copier
sélectionner la commande Edition->Copier
sélectionner la commande Copier dans le menu contextuel ou
dans la zone géométrique ou dans l'arbre des spécifications, maintenir
enfoncée la touche CTRL et faire glisser la sélection.
Ceci place le(s) élément(s) que vous avez coupé(s) dans le presse-papiers.
3. Pour coller, vous pouvez au choix :
cliquer sur l'icône Coller
sélectionner la commande Edition->Coller
sélectionner la commande Coller dans le menu contextuel, ou
dans la zone géométrique ou dans l'arbre des spécifications, déposer ce que
vous faites glisser (voir ci-dessus).

Glisser-déposer des objets (composants ou corps) sur d'autres objets (composants
ou corps) est également un moyen rapide de copier des objets. Notez toutefois que
la nouvelle option Autoriser le Glisser-Déposer doit être activée pour qu'il soit
possible d'utiliser cette fonctionnalité.
Dans l'exemple ci-dessous, le second corps est une copie de Part Body.
L'utilisateur a modifié le profil.

Atelier Part Design
La fenêtre Part Design 5 ressemble à ceci :
Cliquez sur les zones de contact pour afficher la documentation connexe.

Barre de menus Part Design
Composants issus d'une esquisse
Composants d'habillage
Composants issus d'une surface
Composants de transformation
Eléments de référence
Opérations booléennes
Barre d'outils Esquisse
Mesure
Contraintes
Analyse
Annotations

Barre de menus Part Design
Cette section décrit les principaux outils de la barre de menus et les commandes de Part Design.
Démarrer Fichier Edition Affichage Insertion Outils Analyse Fenêtre Aide
Edition
Pour... Voir...
Mise à jour Mise à jour de pièces
Manipulation de pièces dans un
Collage spécial... environnement
multi-documents
Supprimer Suppression de composants
Propriétés Affichage et modification des
propriétés
Parcours ou Parcours de la pièce et
définition dans définition des objets
l'objet de travail...
séparément
objet XXX... Redéfinir les paramètres d'un
composant
Affichage et modification des
propriétés
Réordonner des composants
Insertion
Pour... Voir...
Corps Insertion d'un nouveau corps

Contraintes Définition de contraintes
Esquisse... Sketcher Guide de
l'utilisateur
Repère... Repère
Composants issus d'une Création de composants
esquisse issus d'une esquisse
Composants d'habillage Création de composants
d'habillage
Composants issus d'une Création de composants
surface issus d'une surface
Composants de Création de composants par
transformation transformations
Opérations booléennes Association de corps
Outils de réplication Copie optimisée
Outils
Pour... Voir...
Parents/Enfants Parents/Enfants
Options... Personnalisation

Barres d'Outils des composants issus
d'une esquisse
Cette barre d'outils est disponible en mode affichage étendu ou simplifié. Pour choisir le
mode d'affichage, utilisez la commande Affichage -> Barres d'outils -> Composants issus
d'une esquisse (Etendu/Simplifié).
Voir la section Extrusion Voir la section Trou
Voir la section Extrusion dépouille et Voir la section Nervure
congés
Voir la section Poche Voir la section Rainure
Voir la section Poche dépouille et congés Voir la section Raidisseur
Voir la section Révolution Voir la section Surface guidée
Voir la section Gorge Voir la section Retrait de matière guidée

Barre d'outils Composants d'habillage
Voir la section Congé sur arête Voir la section Dépouille à partir de
lignes de reflet
Voir la section Congé variable Voir la section Dépouille à angle
variable
Voir la section Congé face-face Voir la section Dépouille à deux côtés
Voir la section Congé tritangent Voir la section Coque
Voir la section Chanfrein Voir la section Epaisseur
Voir la section Dépouille de base Voir Taraudage

Barre d'outils Composants issus d'une
surface
Cette barre d'outils est disponible en mode affichage étendu ou simplifié. Pour choisir le
mode d'affichage, utilisez la commande Affichage -> Outils -> Composant issu d'une surface
(Etendu/Simplifié).
Voir la section Coupe Voir la section Remplissage
Voir la section Surface épaisse Voir la section Couture

Barre d'outils Composants de transformation
Voir la section Voir la section Répétition rectangulaire
Translation
Voir la section Rotation Voir la section Répétition circulaire
Voir la section Symétrie Voir la section Répétition
Voir la section Miroir Voir la section Facteur d'échelle

Barre d'outils Eléments de référence
Vous pouvez afficher cette barre d'outils via la commande Affichage -> Barres d'outils -> Eléments de référence
(étendue/simplifiée).
Voir la section Points
Voir la section Droites
Voir la section Plans

Barre d'outils Opérations booléennes
Cette barre d'outils est facultative. Vous pouvez y accéder via la commande Affichage ->
Barre d'outils -> Opérations booléennes.
Voir la section Assemblage de Voir la section Intersection de corps
corps
Voir la section Ajout de corps Voir la section Relimitation de corps
Voir la section Retrait de corps Voir la section Conservation et retrait de
faces

Barre d'outils Esquisse
Voir le guide de l'utilisateur CATIA-Dynamic Sketcher User's Guide Version 5.

Barre d'outils Mesure
Voir la section Mesure des distances et angles minimum
Voir la section Mesure d'éléments
Voir la section Mesure d'inertie:

Barre d'outils Contraintes
Voir la section Définition de contraintes
Voir la section Définition de contraintes choisies dans une boîte de dialogue

Barre d'outils Analyse
Voir la section Analyse de dépouille
Voir la section Analyse de courbure
Voir la section Analyse de filetage/taraudage

Barre d'outils Annotations
Voir la section Création d'annotations texte
Voir la section Creating Flag Notes

Personnalisation
Cette section décrit les différents types de personnalisation de paramétrage que vous
pouvez exécuter. Toutes les tâches traitent ici de personnalisation permanente. Ces tâches
sont :
Contraintes
Arborescence et vues géométriques
Paramètres
Document CATPart

Glossaire
A
Angle de dépouille Composant fourni avec une face avec un angle et une
direction d'extraction.
C
Chanfrein Découpe dans l'épaisseur du composant d'un angle,
donnant un angle tombant.
Composant Composant d'une pièce. Par exemple, les révolutions, les
congés de raccordement et les dépouilles sont des
composants.
Congé de raccordement Surface courbe d'un rayon variable ou constant tangent
à deux surfaces et les joignant. Ces trois surfaces forment un coin
interne ou un
coin externe.
Contour Contour fermé ou ouvert incluant des arcs et des lignes
créé par la commande de profil dans l'atelier Sketcher.
Contrainte Relation dimensionnelle ou géométrique entre deux
éléments.
Coque Composant évidé
Corps Voir corps principal.
Corps principal Composant d'une pièce constituée d'un ou plusieurs
composants.
Coupe Composant créé par le découpage d'une pièce ou d'un
composant dans une autre pièce ou un autre composant à
l'aide d'un plan ou d'une face.
E
Enfant Etat qui définit la relation généalogique entre un
composant ou un élément et un autre composant ou
élément. Par exemple, une extrusion est un composant
enfant d'une esquisse. Voir aussi parent.
Esquisse Ensemble d'éléments géométriques créés dans l'atelier
d'esquisse Sketcher. Par exemple, une esquisse peut
inclure un profil, des lignes de construction et des points.
Extrusion Composant créé par l'extrusion d'un profil.

F
Facteur d'échelle (commande)Opération de redimensionnement des composants à un
pourcentage donné de leur taille initiale.
G
Gorge Composant correspondant à une découpe dans la forme
d'un composant de révolution.
M
Miroir Composant créé par la duplication d'un composant initial.
La duplication est définie par symétrie.
N
Nervure Composant obtenu par le balayage d'un profil le long d'une
courbe des centres.
P
Parent Etat qui définit la relation généalogique entre un
composant ou un élément et un autre composant ou
élément. Par exemple, une extrusion est le parent d'une
dépouille.
Pièce Entité en 3D obtenue par la combinaison de plusieurs
composants.
Poche Composant correspondant à une ouverture au travers d'un
composant. La forme de l'ouverture correspond à
l'extrusion d'un profil.
R
Raidisseur Composant utilisé pour renforcer un composant ou une
pièce.
Rainure Composant qui consiste au passage à travers une pièce
obtenu par le balayage d'un profil le long d'une courbe des
centres.
Réordonner (commande) Opération qui consiste à réorganiser l'ordre de création
des composants.
Répétition Ensemble de composants similaires qui se répètent dans
le même composant ou la même pièce.
Révolution Composant de révolution

T
Trou Composant correspondant à une ouverture au travers d'un
composant. Les trous peuvent être simples, coniques,
lamés, chanfreinés ou lamés et chanfreinés.

Index
A
Activate
contextual command
activating
constraint
Add
command
Advanced Draft command
AFNOR
AFNOR
Thread/Tap
angle
annotations
Apply Material
command
Assemble
command
automatic
update
B
blue
body
body
editing
name

Boolean operation
brackets
C
canceling
Update
catalog
CATPart documents
cavity
Chamfer
command
Change Sketch Support
contextual command
children
Circular Pattern
command
Close Surface
command
coincidence
command
Add
Apply Material
Assemble
Chamfer
Circular Pattern
Close Surface
Constraint
Constraint Defined in Dialog Box
Copy
Create Datum

Curvature Analysis
Cut
Draft Analysis
Draft Angle
Draft from Reflect Lines
Drafted Filleted Pad
Drafted Filleted Pocket
Edge Fillet
Face-Face Fillet
Groove
Hole
Insert Body
Intersect
Local Axis
Loft
Mean Dimensions
Measure Inertia
Mirror
Pad
Parent/Children
Paste
Pocket
PowerCopy Creation
PowerCopy Instantiation
PowerCopy Save in Catalog
Rectangular Pattern
Remove
Remove Loft
Remove Lump

Rib
Rotate
Scaling
Scan or Define in Work Object
Sew Surface
Shaft
Shell
Slot
Split
Stiffener
Symmetry
Tap/Thread Analysis
Thick Surface
Thickness
Thread/Tap
Translation
Tritangent Fillet
Union Trim
Update
User Pattern
Variable Radius Fillet
compass
complex profile
concentricity constraint
constraining
holes
constraint
Constraint Defined in Dialog Box
command
constraint

activating
Constraint
command
constraint
deactivating
editing
reference
renaming
type
contextual command
Activate
Change Sketch Support
Deactivate
Definition
Definition...
Delete...
Edit Parameters
Explode Pattern
Go to Profile
Hide Children
Hide Parents
Paste Special
Properties
Reorder
Replace
Show All Children
Show All Parents
Show Children
Show Parents
Show Parents and Children

Update Link
controlled by reference
Copy
command
counterbored
Hole
counterdrilled
Hole
countersunk
Hole
Create Datum
command
cube
Curvature Analysis
command
customizing
Part Design workbench
Cut
command
D
datum
Deactivate
contextual command
deactivated
feature
deactivating
constraint
Definition...
contextual command
Definition

contextual command
Delete...
contextual command
deleting
feature
pattern
density
part
distance
Draft Analysis
command
Draft Angle command
Draft Angle
command
neutral element
parting element
pulling direction
Draft from Reflect Lines
command
parting element
Drafted Filleted Pad
command
drafting
filleting
neutral element
Drafted Filleted Pocket
command
drafting
filleting
drafting
Drafted Filleted Pad
Drafted Filleted Pocket

dress-up features
E
Edge Fillet
command
inside corner
Edit Parameters
contextual command
editing
body
constraint
feature
part
pattern
entering
Part Design workbench
Explode Pattern
contextual command
exploding
User Pattern
external reference
extrusion
F
Face-Face Fillet
command
feature list
feature
deactivated

deleting
editing
list
parameter
positioning
features
file
filleting
Drafted Filleted Pad
Drafted Filleted Pocket
Fix/Unfix
flat end
Hole
formula
G
Gaussian curvature
Go to Profile
contextual command
Groove
command
H
Hide Children
contextual command
Hide Parents
contextual command
Hole
command

counterbored
counterdrilled
countersunk
flat end
locating
pointed end
simple
tapered
threading
up to next
up to plane
up to surface
V-bottom
holes
constraining
I
Insert Body command
Insert Body
command
inside corner
Edge Fillet
instance
interrupting
Update
Intersect
command

L
length
list
feature
Local Axis
command
locating
Hole
Loft
command
M
manual
update
material mode
Mean Dimensions
command
Measure Inertia
command
Mirror command
Mirror
command
multi-document environment
N
name
body
part
neutral element

neutral element
Draft Angle
Drafted Filleted Pad
nominal dimension
not normal
Pad
O
offset
open profiles
open profiles
Pocket
P
Pad command
Pad
command
not normal
up to last
up to next
up to plane
up to surface
parallelism
parameter
feature
Parent/Children
command
parents
Part Design workbench

customizing
entering
part
density
editing
name
parting element
Draft Angle
Draft from Reflect Lines
Paste Special
contextual command
Paste
command
pattern
pattern
deleting
editing
perpendicularity
pink
Pocket command
Pocket
command
open profiles
up to next
pointed end
Hole
positioning
feature
PowerCopy Creation
command
PowerCopy Instantiation
command

PowerCopy Save in Catalog
command
profile
properties
Properties
contextual command
pulling direction
pulling direction
Draft Angle
R
Rectangular Pattern
command
red
reference element
reference elements
reference
constraint
Remove Loft
command
Remove Lump
command
Remove
command
renaming
constraint
rendering style
Reorder
contextual command
Replace
contextual command

Rib
command
Rotate
command
S
Scaling
command
Scan or Define in Work Object
command
Sew Surface
command
Shaft
command
Shell command
Shell
command
Show All Children
contextual command
Show All Parents
contextual command
Show Children
contextual command
Show Parents and Children
contextual command
Show Parents
contextual command
simple
Hole
sketch
sketch-based features

Sketcher
Sketcher command
Slot
command
solid
specification tree
spine
Variable Radius Fillet
Split
command
standards
Stiffener
command
surface-based features
symbols
Symmetry
command
T
tangency
Tap/Thread Analysis
command
tapered
Hole
text2
Thick Surface
command
Thickness
command
Thread/Tap
AFNOR

command
threading
Hole
tolerance
transformation features
Translation
command
Tritangent Fillet
command
type
constraint
U
Union Trim
command
up to last
Pad
up to next
Hole
Pad
Pocket
up to plane
Hole
Pad
up to surface
Hole
Pad
Update Link
contextual command
update
automatic

Update
canceling
command
interrupting
update
manual
User Pattern
command
exploding
V
Variable Radius Fillet
command
spine
V-bottom
Hole
W
wireframe geometry
Y
yellow

Conventions utilisées
Certaines conventions utilisées dans la documentation CATIA, ENOVIA et DELMIA vous
aideront à reconnaître un certain nombre de concepts et de spécifications importants. Les
conventions typographiques suivantes sont utilisées :
Les titres des documents CATIA apparaissent en italique dans le texte.
Le texte qui apparaît en courrier comme Fichier -> Nouveau identifie les commandes à
utiliser.
L'utilisation de la souris diffère selon le type d'opération que vous devez effectuer.
Bouton de la souris Opération
Sélectionner (un menu, une commande, une géométrie dans une zone
graphique, etc.)
Cliquer (sur une icône, un bouton dans une boîte de dialogue, un onglet, un
emplacement sélectionné dans la fenêtre du document etc.)
et Double-cliquer
Cliquer en maintenant la touche Maj enfoncée
Cliquer en maintenant la touche Ctrl enfoncée
Cocher (une case)
Faire glisser la souris
Faire glisser (une icône sur un objet, un objet sur un autre)
Faire glisser la souris
Déplacer
Cliquer à l'aide du bouton droit de la souris (pour sélectionner un menu
contextuel)
Les conventions graphiques sont les suivantes :
indique le temps nécessaire pour exécuter une tâche.
indique la cible d'une tâche.
indique les conditions prérequises.
indique le scénario d'une tâche.
indique des conseils.
indique un avertissement.

indique des informations.
indique la fin d'une tâche.
indique les fonctionnalités nouvelles ou améliorées dans la présente édition.
Les améliorations sont également signalées par un arrière-plan bleu dans la marge de
gauche.

Remarques
CATIA est une marque de DASSAULT SYSTEMES S.A. en France et dans certains pays.
Les termes qui suivent peuvent être utilisés dans la présente publication. Il s'agit des marques :
Java Sun Microsystems Computer Company
OLE, VBScript for Windows NT, Visual Basic Microsoft Corporation
IMSpost Intelligent Manufacturing Software, Inc.
D'autres sociétés sont propriétaires des autres marques, noms de produits ou logos qui pourraient
apparaître dans ce document.
Certaines parties de ce produit contiennent des éléments protégés par des droits d'auteur appartenant
aux entités suivantes :
Copyright © Dassault Systèmes
Copyright © Dassault Systèmes of America
Copyright © D-Cubed Ltd., 1997-2000
Copyright © ITI 1997-2000
Copyright © Summit Software, 1992-1996
Copyright © Cenit 1997-2000
Copyright © Mental Images Gmbh & Co KG, Berlin/Germany 1986-2000
Copyright © Distrim2 Lda, 2000
Copyright © Institut National de Recherche en Informatique et en Automatique (INRIA
Copyright © Augrin Software
Copyright © Rainbow Technologies Inc.
Copyright © Compaq Computer Corporation
Copyright © Boeing Company
Copyright © IONA Technologies PLC
Copyright © Intelligent Manufacturing Software, Inc., 2000
Copyright © Smart Solutions Limited
Copyright © Xerox Engineering Systems
Copyright © Bitstream Inc.
Copyright © IBM Corp.
Copyright © Silicon Graphics Inc.
Copyright © Installshield Software Corp., 1990-2000
Copyright © Microsoft Corporation
Copyright © Spatial Technology Inc.
Copyright © LightWork Design Limited 1995-2000
Copyright © Mainsoft Corp.
Copyright © NCCS 1997-2000
Copyright © Weber-Moewius, D-Siegen
Copyright © LMS International 2000, 2001
Raster Imaging Technology copyrighted by Snowbound Software Corporation 1993-2001
La fonction d'analyse Display 2D/2.5D ainsi que les interfaces MSC.Nastran et ANSYS sont basées
sur des technologies LMS International et ont été développées par LMS International.
Copyright © 2000, Dassault Systèmes. Tous droits réservés.