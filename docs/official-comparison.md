# OSM vs official Saint-Lary data — differences

Compared on 2026-10-22.

- **Official list**: [saintlary.com infos neige](https://www.saintlary.com/hiver/infos-pratiques/infos-neige/) — piste names, colours, sectors, lift names (season list; all shown "fermée" off-season).
- **Official map**: panorama from the resort's interactive map ([saint-lary.digisnow.app/map/1](https://saint-lary.digisnow.app/map/1/fr)), image file dated 2024-11-25, plus its label list (`/v1/widget-map/1`). Used for reading only, not copied into the game.
- **OSM**: `data/raw/v2/saint-lary.osm`, osm_base 2026-10-21.

Connections were checked by eye against the panorama, which is a perspective painting, so "matches" means "same pistes meet in the same order", not survey accuracy.

## A. Pistes on the official list missing from OSM

| Official | Colour | Sector | OSM |
|---|---|---|---|
| Lupins | red | Espiaube | not mapped. Panorama shows it at the bottom near Tortes / Arbizon 3 |
| Ludette | green | Pla d'Adet | only as unnamed green "Sans nom" near the Ludette lift |
| Ecole | green | Pla d'Adet | only as unnamed green near the École carpet |
| Kidpark | green | Pla d'Adet | only as unnamed green near the Kid Park carpet |

## B. Same piste, different name in OSM

| Official | OSM | Note |
|---|---|---|
| Terrenère | **Terranère** | spelling |
| Soum | **soum de matte** | the panorama also labels it "soum de matte"; the official list says "Soum" |
| Balcon cabane | **Balcon de Cabanne** | the panorama says "balcon de cabane"; OSM has a double n |
| Couloir | **Le Couloir** | |
| Sarrat | **Sarrats** | |
| Baby merlans | **Baby** | |
| Corniche 1 / 2 | Corniche I / II | numbering style only |
| Mirabelle 1 / 2 | Mirabelle I / II | numbering style only |
| Bouleaux | **Bouleaux + bouleaux** | the lower 205 m (way in run-… ending near Bouleaux lift) is lower-case, so it is a separate piste in our data |
| Isard | **Isard + isard** | the upper 410 m is lower-case "isard"; a 12 m piece has no difficulty |
| Tétras, Violette, Carrots | tétras, violette, carrots | lower-case only |
| Arbizon | Arbizon / **Arbizon 1** / **Arbizon 3** | the panorama labels arbizon 1, 2, 3; the official list has one "Arbizon". The OSM "Arbizon" is only 103 m (probably arbizon 2's start) |
| Rhodos | Rhodos | the panorama labels rhodos 1 and 2; OSM has one way, fine |

## C. Colour differences

| Piste | Official | OSM |
|---|---|---|
| Combes d'Aulon | blue | blue, but **one 448 m piece (way 1148860520) is tagged red**. The panorama shows an unlabelled red line beside the Aulon lift, so this may be a real red variant whose name is wrong — needs checking on the ground |
| isard (upper piece, way 1029057252) | red | no difficulty (12 m) |

All other matched names have the same colour.

## D. Fragments named after a piste but not on the official list

These are short pieces where OSM gives part of a piste its own name. They are not errors as such, but they break the piste into separate entries:

- "Balcon Mouscades" (161 m, the end of Balcon Mouscades 1 at Col du Portet)
- "Mirabelle" (207 m, the start of Mirabelle I)
- "Combe d'Aulon bleu" (285 m)
- 25 runs with no name ("Sans nom", 4.7 km in total) and 46 connections ("Liaison", 2.1 km)

## E. Connections

**Match the panorama**:

- Pla d'Adet: Bouleaux → Forêt / tétras / Balcon de Cabanne; Le Couloir from Escalette to Balcon de Cabanne; carrots from François Vignole to Escalette/Cabane; violette, soum de matte and Bassia from the Bouleaux top.
- Espiaube: Balcon du Lita → Arbizon 1 / Rhodos / Corniche II / Sorbiers → Forêt; Terranère and Adret from the Col de Terrenère.
- Vallon: Corneblanque → Bastan → Balcon de l'Oule → L'Oule; Glacier → Pichaleye / Marmottes; Isards top → Lagopède / Oussadet / isard.
- Soumaye: Soumaye top → Col / Peyramède / Les Tours / Combes d'Aulon / Montarrouyes.

**Gaps in OSM** (piste end does not share a node with the next piste; shown in-game as "数据未直接相连"):

| From | To | Gap |
|---|---|---|
| Corniche I (upper, from Soum de Matte lift) | Escalette / Corniche I | 5–7 m |
| Lagopède | Isard | 16 m |
| Tortes (88 m piece) | Arbizon 3 | 17 m |
| unnamed red after Rhodos | Arbizon 3 | 17 m |
| unnamed blue | Peyramède | 6 m |
| 9 "Liaison" connections | Echarpe, Isard, Tortes, Combe Saboures, Les Tours… | 4–30 m |

These are tiny OSM drawing gaps (two lines that should touch). On the panorama they all connect.

**Duplicated geometry in OSM**:

- Two L'Oule ways run on top of each other for about 560 m (a 562 m piece shares its nodes with the 1692 m piece).
- One Balcon Mouscades 1 piece (way 1030063860) and one connection (way 1029656223) lie completely inside Balcon Mouscades 1 (way 405007750).

**Not checkable**:

- The panorama shows "cabane 3 km" as a long route along the bottom of Pla d'Adet. OSM's Cabane is 758 m and ends at Echarpe; no OSM piste goes below 1607 m. Either the rest is not mapped or it is a different route — needs checking.

## F. Lifts

Official: 24 lifts (10 chairs, 9 drags, 2 gondolas, 1 cable car, 2 covered carpets). OSM: 27.

| Official | OSM | Note |
|---|---|---|
| Soum | **Soum de Matte** | the panorama label is "TS-Soum" |
| Forêt | Foret | accent |
| Sabourès | Saboures | accent |
| Isard | **Isards ×2** | way 1138090599 (281 m rise) is the real one; way 1138090600 rises only 11 m — likely a stray or old way |
| Baby merlan | Baby Merlans | |
| Télécabine village | **Vignec - Saint-Lary 1700** | same gondola, different name |
| Télécabine Espiaube | Espiaube | |
| Téléphérique Pic Lumière | Pic Lumière | no piste within 80 m of the top in OSM (it arrives in the village at Pla d'Adet) |
| — | **ESF 2**, **Jardin d'Enfants** | magic carpets not on the official list (ski-school / kids' area, possibly private or removed) |

Lift ↔ piste links do not exist in OSM at all; the game guesses them from a top/bottom distance of 80 m.

## G. On the panorama but not on the official list

"stade" (Vallon, between Gentianes and Arrouyes), "stade slalom" (under Mirabelle I), "source" (next to Desman), "piste du col 3 km" (dotted, Vallon — looks like a non-alpine route). Not in OSM either, apart from what may be unnamed pieces.

---

# Corrections applied (2026-10-22)

Rules from the project owner:
- Where OSM and the official data disagree, the official data wins.
- Names follow the official panorama map. Accents are taken from the official list where the painted label is in capitals or drops them.
- Pistes with no name stay unnamed; the game shows only their colour.

All corrections are in [`data/corrections.json`](../data/corrections.json) and applied by `scripts/build_resort.py`. Every corrected run carries a `corrections` field. OSM itself is not edited.

| Area | What was done |
|---|---|
| Piste names | OSM spellings mapped to the panorama labels: Terranère→Terrenère, Balcon de Cabanne→Balcon de Cabane, Combe Saboures→Combe Sabourès, Corniche I/II→1/2, lower-case bouleaux/isard/tétras/violette/carrots/soum de matte, Baby→Baby Merlans, fragments "Balcon Mouscades", "Mirabelle", "Combe d'Aulon bleu", "Arbizon". OSM names that already match the panorama stay: Soum de Matte, Marmottes, Balcon du Lita, Sarrats, Le Couloir, Mirabelle I/II |
| Splits | Rhodos → Rhodos 1 / Rhodos 2, and OSM "Arbizon 1" → Arbizon 1 / Arbizon 2, both split where they cross Corniche 2 (the panorama labels them so) |
| Colours | Every named run takes its official colour. The 12 m Isard piece with no colour is now red |
| Unnamed | "Sans nom" / "Liaison" removed: unnamed pistes have an empty name and show as e.g. "蓝道" or "连接道" in game, with no sign |
| Kids' area | Green ways along the Kid Park and École carpets named Kidpark / École (confirmed) |
| Duplicates | 4 overlapping OSM ways dropped (two L'Oule, one Balcon Mouscades 1, one connection) |
| Gaps | Piste ends that miss the next piste by ≤ 30 m count as connected (`how: "gap"`) |
| Hand-drawn | Lupins, Ludette, Source, Stade, Stade slalom (see below) |
| Lifts | Panorama names: L'Adet, Soum de Matte, Isards, Baby, Espiaube, Forêt, Sabourès, École, Kid Park, Télécabine village, Téléphérique Pic Lumière. Dropped ESF 2, Jardin d'Enfants and the 11 m second Isards → 24 lifts, as officially counted |
| Lift ↔ piste | Still by distance: `LIFT_LINK_RADIUS = 80` m at the top of `scripts/build_resort.py`. Change it there and rebuild; the value is recorded in `meta.liftLinkRadius` |

## Hand-drawn pistes

These pistes are on the official panorama but not in OSM. Their lines are **estimates** built from nearby OSM features (`drawn` in corrections.json). They are marked `estimated: true` and the game says "位置为估计（按官方地图手画）". Their ends join other pistes within `DRAWN_LINK_RADIUS = 60` m.

| Piste | Colour | How it is drawn |
|---|---|---|
| Lupins | red | Midway between the lower Tortes and Arbizon 3, from the end of Rhodos 2 down to Espiaube (432 m). The 12 m unnamed red OSM stub at the end of Rhodos 2 (way 1029263455) is dropped in favour of the drawn line |
| Ludette | green | 30 m off the Ludette drag lift, on the Kid Park side, top to bottom (274 m) |
| Source | blue | 40 m off Desman, on the Cabane side (568 m) |
| Stade | blue | 90 m off the Arrouyes lift, on the Gentianes side, lower half of the slope (922 m) |
| Stade slalom | red | 45 m off the upper half of Mirabelle I, on the Soumaye lift side (510 m) |

Not drawn: "cabane 3 km" and "piste du col 3 km". Both are dotted on the panorama, i.e. not alpine pistes.

## Decisions on the earlier questions

| # | Decision |
|---|---|
| Q1 | Red line beside Aulon: kept red, unnamed |
| Q2 | Lupins: hand-drawn |
| Q3 | Ludette: hand-drawn |
| Q4 | Names from the official panorama |
| Q5 | "cabane 3 km" is dotted → ignored. The OSM **Cabane** (758 m, Escalette → Echarpe) is the panorama's "cabane"; **Balcon de Cabane** (851 m, westward from Bouleaux) is a different piste |
| Q6 | Stade, Stade slalom, Source: hand-drawn. "piste du col 3 km": not drawn (dotted, same reasoning as Q5) |
| Q7 | Unnamed pistes stay unnamed and are not labelled |
| Q8 | Distance rule kept; radius is the `LIFT_LINK_RADIUS` variable |
| Q9 | Kidpark / École confirmed |

# Open questions

- **"Arbizons 3".** The panorama paints "arbizons 3" with an s, while the official list has one "Arbizon". The game uses "Arbizon 3", treating the s as a typo. Is that right?
- **Hand-drawn positions** were only checked by eye against a perspective painting. Lupins and Ludette sit between well-mapped neighbours and should be close. Stade and Stade slalom are the least certain. A GPS track or a ground check would settle them.
- **Lift names in capitals** ("SABOURES", "FORÊT"): accents were taken from the official list. Fine unless the panorama is meant to show no accent.
- **"piste du col 3 km"**: left out because it is dotted. If it is in fact a ski route, it can be hand-drawn like the others.

---

# Isola 2000 — OSM vs official map vs OpenSkiMap

Compared on 2026-10-29.

- **Official map**: *Guide pratique Hiver 2025/2026* ([PDF](https://isola2000.com/wp-content/uploads/2025/12/guide-pratique-hiver-web.pdf)), p. 4–5 "Plan des pistes". The labels are real text in the PDF and the pistes are vector lines in the legend colours, so each label's colour was measured as the nearest piste line, then checked by eye on a 4× render. p. 6 gives the official counts: **45 pistes (7 green, 22 blue, 13 red, 3 black), 20 lifts (2 gondolas, 7 chairs, 8 drags, 2 carpets, 1 funicular)**.
- **Official live list**: the Lumiplan snow report on isola2000.com lists nothing off-season, so it could not be used.
- **OpenSkiMap**: export of 2026-10-28 (`tiles.openskimap.org/geojson`), ski area *Isola 2000* (OSM relation 3545221, skimap.org #698). The Isola runs and lifts are kept in `data/isola/raw/openskimap-*.geojson`.
- **OSM**: `data/isola/raw/isola.osm`, downloaded 2026-10-28.

OpenSkiMap is built from OSM, and for Isola it has exactly the same names and colours as our OSM data. Its only extras are a snow-park area ("Espace Tony's Snowland") and the funicular (see Lifts). So every difference below is between OSM and the official map.

## A. Names

| Official map | OSM / OpenSkiMap | Done |
|---|---|---|
| boulevard | Boulevarde | renamed |
| grizzli | Grizli | renamed |
| accès génisserie | Access Geniserie + Access Mene | both renamed: on the map the green accès génisserie line runs on from the Valette bottom to the Méné bottom, which is OSM's "Access Mene" |
| bartavelle | Bartavelle Haut + Bartavelle Bas | merged into one Bartavelle |
| piste de compétition | **Coq** (red, 1.6 km from the Mercantour top, beside the gondola) | renamed: same place as the pink "piste de compétition" strip on the map |
| b.cabane | Cabane (Mercantour top → Valette) | renamed |
| tétras, écureuil | Tetras, Ecureuil | accents |
| chamois / chapland | Chamois Chapland | kept: the map always prints the two names together on one line |
| st sauveur | Saint-Sauveur | kept: "st" is only the label's abbreviation (the lift is "Saint-Sauveur" too) |

## B. Colours

| Piste | Official | OSM | Done |
|---|---|---|---|
| Le Lac | blue | green | → blue |
| Grizzli | green | blue | → green |
| Levant | green (a short line from the Grande Combe bottom towards Belvédère) | **black**, 1.3 km from the Grande Combe top down to its bottom | not changed (decision I1) |

Every other name has the same colour in all three sources.

## C. Lifts

OSM has 19, the official count is 20: the **funicular** (free, front de neige) is missing because our OSM query only reads aerialways; OpenSkiMap has it. Lift names match the map (accents aside). OSM's three small front-de-neige lifts ("Front de Neige 1" drag, "Front de neige 1/2" carpets) match the official 8 drags + 2 carpets.

## D. Geometry

No duplicated OSM ways. 12 piste ends miss the next piste by ≤ 30 m and are joined (`gap`), as for Saint-Lary. Chevrette's dead end is joined to Sierra (estimated), which agrees with the map, where chevrette runs down to sierra / jo martin.

## Open questions — Isola

- **I1. Levant.** OSM's "Levant" (black, Grande Combe top → bottom) is not where the map's green "levant" is. The map shows two blue lines down the Grande Combe drag ("combe" and one unlabelled). Options: (a) rename OSM's Levant to unnamed blue, (b) leave it as is, (c) also draw the short green levant from the map.
- **I2. Funicular.** Add it as a lift (geometry from OpenSkiMap / OSM `railway=funicular`)? It links the resort centre to the front de neige; the game does not need it to reach any piste.
- **I3. Counts.** After the fixes there are 8 green and 20 blue names against the official 7 and 22; the brochure count may group pistes differently (e.g. chamois and chapland as two). Not chased further.

---

# Serre Chevalier — OSM vs official panorama vs OpenSkiMap

Compared on 2026-10-29.

- **Official panorama**: the resort's interactive map ([serre-chevalier.digisnow.app/map/1/fr](https://serre-chevalier.digisnow.app/map/1/fr), image "Plan-2025-modifs.jpg", 3840 × 1749) and its public label list (`/v1/widget-map/1`: 110 labels, each an official id such as `pre-de-jeanne` or `rouge-cibouit` placed on the painting). The same painting is the official [2025–2026 print PDF](https://www.serre-chevalier.com/sites/default/files/2025-10/plan-pistes-serre-chevalier-2025-2026.pdf). Colours were read by eye from a crop around every label; uncertain ones were re-read on wider crops. Used for reading only, not copied into the game.
- **Official live list**: the digisnow snow report is empty off-season.
- **OpenSkiMap**: export of 2026-10-28, ski area *Serre-Chevalier* (OSM relation 3160540, skimap.org #692); kept in `data/serre-chevalier/raw/openskimap-*.geojson`.
- **OSM**: `data/serre-chevalier/raw/serre-chevalier.osm`, downloaded 2026-10-29.

**63 pistes agree in all three sources** (name and colour). Below are the rest.

## A. Names

| Official | OSM | OpenSkiMap | Done |
|---|---|---|---|
| clot gaillard | Clos Gaillard | Clos Gaillard **and** Clot Gaillard (OpenSkiMap shows a second OSM object spelled correctly) | renamed to Clot Gaillard |
| route d'aravet | Aravet (green, 6.2 km in 5 pieces) | Aravet / "Deval' Bob, Aravet" | renamed to Route d'Aravet |
| combe râteau, éduits, traflèche | Combe rateau, Eduits, Trafleche variants | same | merged (already in the first build) |
| rouge cibouït / noire cibouït, rouge yret | Cibouït (red + black pieces), Yret | same | kept: the painted labels say just "cibouit" / "yret"; colours already match each piece |
| 3 croix | 3 Croix | 3 croix | kept (painted label "3 croix"; the id is `trois-croix`) |

OpenSkiMap also carries OSM spellings our build does not use (they sit on other OSM objects): "Auguillette", "Martau", "Rempars", "Stde", "Grandes Gargouilles", "Condamine". None is the official spelling except Clot Gaillard. These are worth fixing in OSM itself.

## B. Colours

| Piste | Official | OSM | Done |
|---|---|---|---|
| Traflèche | red | 253 m black + 152 m red | → all red |

At first sight Chaméant, Clot Gauthier, Condamines, Prairies and Luc Alphand looked different on the panorama. On wider crops each label sits on a line of the same colour as OSM, so nothing changed. 75 official names now carry their official colour in `corrections.json`.

## C. On OSM, not on the official label list

Aiche, Chazelay, Mickey, Ourson, Pitchoune, Ratier, Exercice Ratier 1/2, École Chanteloube, École Fréjus, Renard, Grande Boucle, Escartons, Pré Chabert, Retour Pré Chabert, Prarian, Verte (village beginner areas, mostly ≤ 600 m); Glaize, Lac, Club, Dame des Neiges, Ensa, Parc abri, Traversée Bayrou, Moulière, Cordeliers, Bois, Cabane, Chêne (painted on the panorama but without an id in the label list, or unclear); Stade (the three race stadiums, which the label list has as Chantemerle "Michel Canac", Monêtier and Villeneuve "Aravet"). Kept as mapped.

## D. Lifts

The official label list has 50 lifts; OSM and OpenSkiMap both have 70. OSM names carry type codes ("TSD6 Blétonet", "TCD10 Pontillas", "TKD1 Méa"…); they are renamed to the panorama names (Blétonet, Pontillas, Méa, Côte Chevalier, Orée du Bois, Croix de la Nore, Étoile, Pré Ratier 1/2, …). The extra 20 are village beginner lifts: magic carpets (Patou, Ourson, Blanchot, Bas, Haut 1/2, Neiges, Siflotte, Aravet 1/2, Oursons de Pralong, an unnamed one), rope tows (Pralong, Télécorde de Fréjus) and small drags (Aïche, Chanteloube 1/2, Mickey…). See S1.

## E. Geometry

No duplicated OSM ways. 54 piste ends miss the next piste by ≤ 30 m and are joined (`gap`). Nothing on the panorama is missing from OSM, so no piste is hand-drawn.

## Open questions — Serre Chevalier

- **S1. Beginner lifts.** For Saint-Lary, carpets not on the official list were dropped. Do the same here (−20 lifts, the village carpets and tows), or keep them since they are real ski-school lifts?
- **S2. Cabane, Chêne, Bois.** Their labels are hidden by icons or sit between two colours; OSM colours kept (Cabane blue, Chêne green, Bois black).
- **S3. Cibouït / Yret.** Use the official ids' full names ("Rouge Cibouït", "Noire Cibouït", "Rouge Yret") instead of the painted "cibouit" / "yret"?

# Alpe d'Huez — OSM vs official map vs OpenSkiMap

Compared on 2026-10-29.

- **Official map**: *Plan des pistes Hiver 2025-2026* ([PDF](https://www.alpedhuez.com/wp-content/uploads/2025/11/PLAN-DES-PISTES-HIVER-2025-2026.pdf), linked from alpedhuez.com/fr/plan-des-pistes), page 2. The piste labels are real PDF text (set letter by letter along the lines); the pistes are painted into the image. Each label's colour was sampled from the line around it on a 300 dpi render, and every label where that sample and OSM disagreed was re-read by eye on a crop. Used for reading only.
- **OpenSkiMap**: export of 2026-10-28, ski area *Alpe d'Huez Grand Domaine* (OSM way 45438982, skimap.org #729); kept in `data/alpe-d-huez/raw/openskimap-*.geojson`. It is built from OSM and carries the same names and colours as our snapshot; its lift list adds Ascenseur Villard, Combe Bénite and Fontbelle, which sit outside our snapshot's lift tags (not added).
- **OSM**: `data/alpe-d-huez/raw/alpe-d-huez.osm`, downloaded 2026-10-29.

**Over 80 of the 92 labelled pistes agree in all three sources.** The rest:

## A. Colours

| Piste | Official | OSM | Done |
|---|---|---|---|
| Clocher de Mâcle | red (label follows the red line beside the Marmottes 3 cable) | black | → red |
| Petit Prince | red (label on the red line right of the Petit Prince drag) | blue | → red |
| Écureuil (Montfrais) | green, inside the beginner area | Ecureuils, blue | → Écureuil, green |
| Altiport, Agneaux, Bergers, Villard | one colour each (green / blue / blue / blue) | mixed pieces | → the official colour throughout |

First-pass samples also flagged Brebis, Chardons, Dahut, Hermine, Lièvre Blanc, Lutins, Gentianes, La Fuma, Pré-rond, Le Rosai and Sarenne; on crops each label sits on a line of the OSM colour, so nothing changed.

## B. Names

Official spellings: Chavanus (OSM Chavannus), Chevreau (Chevreaux), Bergerie (Bergeries), Bergers (Les Bergers), Gentianes (Les Gentianes), Érables (Erables), Canetons (Cannetons). The map also labels *premier tronçon*, *retour skieur* and *épicéa*, which have no named OSM way; not drawn.

## C. On OSM, not labelled on the official map

Freeride itineraries (Château Noir, Combe du Loup), fun slopes and parks (Chez Roger, Marcel's Farm, Halfpipe/Snowpark/Tunnel de Marcel, Snowpark des Sagnes, Boarder Cross), race stadiums (Stade, Stade Désiré Lacroix, Stade du Taburle) and small links (Retour 1800, Retour Club Med, Retour TC Alpette, Variante Poutran, Corniche Variante, Signal Bis, Promontoire, Anémones…). Kept as mapped.

## D. Lifts

OSM names match the map's lift labels; Vallonet → Vallonnets and Rif Nel 1/2 → Rifnel 1/2 follow the map. Dropped: "TKF des Auberts (✝)" (marked as removed in OSM) and five 20–30 m station stubs that OSM draws as separate ways (Rif Nel, Pic Blanc, Poutran, Huez Express, Alpe Express). Village carpets and tows are kept, as for Serre Chevalier.

## Open questions — Alpe d'Huez

- **A1. Clocher de Mâcle and Petit Prince.** Both are red on this map but black / blue in OSM (and in older maps). Official wins, so they are red now; worth a second look on next season's map.
- **A2. Unconnected pieces.** A few unnamed OSM ways under Herpie and Lac Blanc end far from any lift; left as mapped.

---

# Chamrousse — OSM vs official map vs OpenSkiMap

Compared on 2026-10-29.

- **Official map**: *Chamrousse Alpine Park* 2026/27 ([PDF](https://www.chamrousse.com/medias/images/info_pages/plan-alpin-2627-web-3644.pdf), linked from chamrousse.com/plan-pistes-alpin.html). Pistes are vector lines in the legend colours, and each label is set in the colour of its piste; labels are outlines, not text, so all of them were read by eye on a 300 dpi render, tile by tile.
- **OpenSkiMap**: export of 2026-10-28, ski area *Chamrousse* (OSM relation 8763133 / way 1254312210, skimap.org #717); kept in `data/chamrousse/raw/openskimap-*.geojson`. Same names and colours as OSM.
- **OSM**: `data/chamrousse/raw/chamrousse.osm`, downloaded 2026-10-29.

**34 labelled pistes agree in all three sources.** The rest:

| Piste | Official | OSM | Done |
|---|---|---|---|
| Bascule | black | red | → black |
| Éterlou | green | blue + green pieces | → green throughout |
| Liaison Roche | blue | "Liaison Roche - Recoin" / "Liason Roche - Recoin" | renamed |
| Liaison Recoin | blue | "Liason Recoin - Roche" | renamed |
| Traversée du Rat | blue | La Traversée du Rat | renamed |
| Variante des Gaboureaux | red | Variante Gaboureaux | renamed |
| Stade Aiguille | red | Stade de L'Aiguille | renamed |

On OSM but not labelled on the map: Anthracite, Balmette, Jardins, Loups, Variante Loups et Jardins, Passage Krieg, Perchette, Totem 1, Stade F. Masnada (drawn on the map as a stadium, not a line). Kept as mapped. The map labels "Mur du Téléski" (black) and "Lac" (blue), which have no named OSM way; not drawn.

Lifts: OSM's 18 named lifts match the map. Dropped the summer wakeboard cable on the lake (tagged as a drag lift) and an unnamed 20 m drag.

## Open questions — Chamrousse

- **C1. Lauze.** Labelled with the green beginner lines next to the Lauze carpet; kept green as in OSM.

# Corrections applied (2026-10-29)

All in each resort's `corrections.json`; every corrected run lists its changes in `corrections`.

| Resort | What was done |
|---|---|
| Isola | 42 official names with colours; renames Boulevard, Grizzli, Accès Génisserie (×2), Bartavelle (merge), Piste de Compétition (was Coq), B.Cabane (was Cabane), Tétras, Écureuil; colours Le Lac → blue, Grizzli → green |
| Serre Chevalier | 75 official names with colours; renames Clot Gaillard, Route d'Aravet; Traflèche all red; 24 lift names without type codes |
| Alpe d'Huez | 92 official names with colours; Clocher de Mâcle → red, Petit Prince → red, Écureuil → green; 7 spelling fixes; 6 lifts dropped (1 removed, 5 station stubs) |
| Chamrousse | 41 official names with colours; Bascule → black; Liaison Roche / Recoin, Traversée du Rat, Variante des Gaboureaux, Stade Aiguille renamed; wakeboard cable dropped |

## Decisions on the open questions (2026-10-29)

| # | Decision |
|---|---|
| I1 | Levant left as mapped in OSM (black, Grande Combe) |
| I2 | Funicular not added |
| I3 | Counts not chased further |
| S1 | Beginner lifts kept (real ski-school lifts), unlike Saint-Lary's two carpets |
| S2 | Cabane, Chêne, Bois keep their OSM colours |
| S3 | Cibouït / Yret keep the painted names |
