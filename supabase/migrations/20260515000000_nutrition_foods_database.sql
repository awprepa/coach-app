-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : ajout colonne category + BDD aliments communs français
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS category text;

-- Index sur la catégorie pour les requêtes de filtrage
CREATE INDEX IF NOT EXISTS nutrition_foods_category_idx ON nutrition_foods(category);

-- ─── Insertion des aliments courants ─────────────────────────────────────────
-- source = 'builtin', created_by = NULL
-- Valeurs pour 100g sauf mention contraire

INSERT INTO nutrition_foods
  (name, brand, kcal_100, prot_100, carbs_100, sugar_100, fat_100, satfat_100, fibre_100, salt_100, unit, serving_g, category, source)
VALUES

-- ═══════════════════════════════════════
-- VIANDES & POISSONS
-- ═══════════════════════════════════════
('Poulet grillé (blanc)', NULL, 165, 31.0, 0.0, 0.0, 3.6, 1.0, 0.0, 0.07, 'g', 150, 'viandes_poissons', 'builtin'),
('Poulet rôti (cuisse)', NULL, 215, 25.0, 0.0, 0.0, 12.0, 3.4, 0.0, 0.20, 'g', 150, 'viandes_poissons', 'builtin'),
('Steak haché 5% MG', NULL, 135, 20.5, 0.0, 0.0, 5.5, 2.3, 0.0, 0.15, 'g', 150, 'viandes_poissons', 'builtin'),
('Steak haché 15% MG', NULL, 198, 17.5, 0.0, 0.0, 14.0, 5.5, 0.0, 0.16, 'g', 150, 'viandes_poissons', 'builtin'),
('Bœuf (entrecôte grillée)', NULL, 272, 26.0, 0.0, 0.0, 18.0, 7.5, 0.0, 0.10, 'g', 150, 'viandes_poissons', 'builtin'),
('Porc (filet grillé)', NULL, 185, 27.0, 0.0, 0.0, 8.5, 2.8, 0.0, 0.12, 'g', 150, 'viandes_poissons', 'builtin'),
('Jambon blanc (tranches)', NULL, 107, 16.5, 1.0, 0.5, 4.0, 1.5, 0.0, 1.60, 'g', 50, 'viandes_poissons', 'builtin'),
('Saumon (pavé grillé)', NULL, 206, 20.0, 0.0, 0.0, 13.5, 2.5, 0.0, 0.08, 'g', 150, 'viandes_poissons', 'builtin'),
('Thon en boîte (au naturel)', NULL, 116, 26.0, 0.0, 0.0, 1.0, 0.3, 0.0, 0.40, 'g', 100, 'viandes_poissons', 'builtin'),
('Cabillaud (filet cuit)', NULL, 82, 18.5, 0.0, 0.0, 0.7, 0.1, 0.0, 0.25, 'g', 150, 'viandes_poissons', 'builtin'),
('Crevettes cuites', NULL, 99, 21.0, 0.0, 0.0, 1.1, 0.2, 0.0, 0.50, 'g', 100, 'viandes_poissons', 'builtin'),
('Dinde (escalope grillée)', NULL, 147, 29.0, 0.0, 0.0, 3.0, 0.9, 0.0, 0.10, 'g', 150, 'viandes_poissons', 'builtin'),

-- ═══════════════════════════════════════
-- FÉCULENTS & CÉRÉALES
-- ═══════════════════════════════════════
('Riz blanc cuit', NULL, 130, 2.7, 28.0, 0.1, 0.3, 0.1, 0.4, 0.00, 'g', 200, 'feculents', 'builtin'),
('Riz basmati cuit', NULL, 134, 2.8, 29.2, 0.1, 0.3, 0.1, 0.4, 0.00, 'g', 200, 'feculents', 'builtin'),
('Riz complet cuit', NULL, 123, 2.6, 25.5, 0.4, 1.0, 0.2, 1.8, 0.00, 'g', 200, 'feculents', 'builtin'),
('Pâtes cuites (al dente)', NULL, 158, 5.8, 30.5, 0.6, 0.9, 0.2, 1.8, 0.01, 'g', 200, 'feculents', 'builtin'),
('Pâtes complètes cuites', NULL, 148, 5.5, 28.0, 0.7, 1.1, 0.2, 3.5, 0.01, 'g', 200, 'feculents', 'builtin'),
('Pomme de terre bouillie', NULL, 77, 2.0, 17.0, 0.8, 0.1, 0.0, 1.8, 0.01, 'g', 200, 'feculents', 'builtin'),
('Patate douce cuite', NULL, 90, 2.0, 20.5, 4.2, 0.1, 0.0, 3.0, 0.05, 'g', 200, 'feculents', 'builtin'),
('Quinoa cuit', NULL, 120, 4.4, 21.3, 0.9, 1.9, 0.2, 2.8, 0.01, 'g', 200, 'feculents', 'builtin'),
('Flocons d''avoine (secs)', NULL, 372, 13.5, 58.0, 1.0, 7.0, 1.3, 9.7, 0.02, 'g', 80, 'feculents', 'builtin'),
('Pain complet (tranche)', NULL, 247, 8.5, 42.0, 4.5, 3.5, 0.7, 7.0, 0.90, 'g', 40, 'feculents', 'builtin'),
('Pain blanc (tranche)', NULL, 265, 9.0, 49.0, 3.5, 3.2, 0.7, 2.7, 1.20, 'g', 35, 'feculents', 'builtin'),
('Baguette tradition', NULL, 260, 8.0, 52.0, 2.0, 1.4, 0.3, 2.5, 1.30, 'g', 60, 'feculents', 'builtin'),
('Lentilles cuites', NULL, 116, 9.0, 20.0, 1.8, 0.4, 0.1, 7.9, 0.01, 'g', 200, 'feculents', 'builtin'),
('Pois chiches cuits', NULL, 164, 8.9, 27.4, 4.8, 2.6, 0.3, 7.6, 0.02, 'g', 200, 'feculents', 'builtin'),
('Haricots rouges cuits', NULL, 127, 8.7, 22.8, 0.3, 0.5, 0.1, 8.7, 0.01, 'g', 200, 'feculents', 'builtin'),

-- ═══════════════════════════════════════
-- LÉGUMES
-- ═══════════════════════════════════════
('Brocoli cuit', NULL, 28, 2.8, 3.5, 1.5, 0.4, 0.1, 3.3, 0.03, 'g', 200, 'legumes', 'builtin'),
('Épinards cuits', NULL, 23, 2.9, 2.0, 0.4, 0.4, 0.1, 2.2, 0.07, 'g', 200, 'legumes', 'builtin'),
('Haricots verts cuits', NULL, 31, 1.8, 5.0, 2.0, 0.3, 0.0, 3.4, 0.01, 'g', 200, 'legumes', 'builtin'),
('Courgette cuite', NULL, 21, 1.5, 3.0, 2.5, 0.4, 0.1, 1.2, 0.01, 'g', 200, 'legumes', 'builtin'),
('Carotte cuite', NULL, 35, 0.8, 7.5, 5.0, 0.2, 0.0, 3.0, 0.08, 'g', 150, 'legumes', 'builtin'),
('Tomate (crue)', NULL, 18, 0.9, 3.5, 2.6, 0.2, 0.0, 1.2, 0.02, 'g', 150, 'legumes', 'builtin'),
('Concombre (cru)', NULL, 12, 0.7, 2.2, 1.5, 0.1, 0.0, 0.5, 0.02, 'g', 150, 'legumes', 'builtin'),
('Salade verte (laitue)', NULL, 13, 1.4, 1.2, 0.8, 0.3, 0.0, 1.3, 0.03, 'g', 100, 'legumes', 'builtin'),
('Champignons de Paris cuits', NULL, 22, 3.3, 1.0, 0.5, 0.5, 0.1, 2.0, 0.01, 'g', 150, 'legumes', 'builtin'),
('Poivron rouge (cru)', NULL, 31, 1.0, 6.0, 4.2, 0.3, 0.1, 2.1, 0.02, 'g', 150, 'legumes', 'builtin'),
('Maïs (grains cuits)', NULL, 96, 3.4, 19.0, 3.2, 1.5, 0.2, 2.7, 0.02, 'g', 150, 'legumes', 'builtin'),
('Avocat', NULL, 160, 2.0, 2.0, 0.7, 15.0, 2.1, 7.0, 0.01, 'g', 100, 'legumes', 'builtin'),

-- ═══════════════════════════════════════
-- FRUITS
-- ═══════════════════════════════════════
('Banane', NULL, 89, 1.1, 22.8, 12.2, 0.3, 0.1, 2.6, 0.00, 'g', 120, 'fruits', 'builtin'),
('Pomme', NULL, 52, 0.3, 13.8, 10.4, 0.2, 0.0, 2.4, 0.00, 'g', 150, 'fruits', 'builtin'),
('Orange', NULL, 47, 0.9, 11.8, 9.4, 0.1, 0.0, 2.2, 0.00, 'g', 150, 'fruits', 'builtin'),
('Fraises', NULL, 32, 0.7, 7.7, 4.9, 0.3, 0.0, 2.0, 0.00, 'g', 150, 'fruits', 'builtin'),
('Myrtilles', NULL, 57, 0.7, 14.5, 9.7, 0.3, 0.0, 2.4, 0.00, 'g', 100, 'fruits', 'builtin'),
('Mangue', NULL, 60, 0.8, 15.0, 13.7, 0.4, 0.1, 1.6, 0.00, 'g', 150, 'fruits', 'builtin'),
('Pastèque', NULL, 30, 0.6, 7.6, 6.2, 0.2, 0.0, 0.4, 0.00, 'g', 250, 'fruits', 'builtin'),
('Raisin', NULL, 69, 0.7, 18.1, 15.5, 0.2, 0.0, 0.9, 0.00, 'g', 100, 'fruits', 'builtin'),

-- ═══════════════════════════════════════
-- PRODUITS LAITIERS
-- ═══════════════════════════════════════
('Yaourt nature (0%)', NULL, 48, 5.0, 6.5, 6.5, 0.2, 0.1, 0.0, 0.08, 'g', 125, 'laitiers', 'builtin'),
('Yaourt nature (entier)', NULL, 65, 4.2, 5.5, 5.0, 3.2, 2.0, 0.0, 0.08, 'g', 125, 'laitiers', 'builtin'),
('Yaourt grec nature', NULL, 97, 9.0, 4.0, 4.0, 5.0, 3.3, 0.0, 0.08, 'g', 150, 'laitiers', 'builtin'),
('Fromage blanc 0%', NULL, 47, 8.0, 5.5, 5.0, 0.1, 0.0, 0.0, 0.06, 'g', 100, 'laitiers', 'builtin'),
('Fromage blanc 3%', NULL, 67, 7.5, 5.0, 5.0, 3.0, 1.9, 0.0, 0.06, 'g', 100, 'laitiers', 'builtin'),
('Skyr nature', NULL, 60, 11.0, 4.0, 4.0, 0.3, 0.2, 0.0, 0.06, 'g', 150, 'laitiers', 'builtin'),
('Lait demi-écrémé', NULL, 46, 3.2, 4.8, 4.8, 1.5, 1.0, 0.0, 0.10, 'ml', 250, 'laitiers', 'builtin'),
('Fromage emmental (râpé)', NULL, 402, 28.0, 0.5, 0.5, 32.0, 19.0, 0.0, 0.80, 'g', 30, 'laitiers', 'builtin'),
('Mozzarella', NULL, 280, 18.0, 2.5, 0.5, 22.0, 13.0, 0.0, 0.40, 'g', 125, 'laitiers', 'builtin'),

-- ═══════════════════════════════════════
-- ŒUFS & PROTÉINES VÉGÉTALES
-- ═══════════════════════════════════════
('Œuf entier (cuit)', NULL, 147, 12.6, 0.7, 0.4, 10.6, 3.1, 0.0, 0.36, 'pièce', 60, 'oeufs_legumineuses', 'builtin'),
('Blanc d''œuf (cuit)', NULL, 52, 11.0, 0.7, 0.4, 0.2, 0.1, 0.0, 0.35, 'g', 120, 'oeufs_legumineuses', 'builtin'),
('Tofu ferme', NULL, 76, 8.1, 1.9, 0.4, 4.2, 0.6, 0.3, 0.02, 'g', 150, 'oeufs_legumineuses', 'builtin'),
('Edamame (cuit)', NULL, 122, 11.9, 8.9, 2.2, 5.2, 0.6, 5.2, 0.01, 'g', 150, 'oeufs_legumineuses', 'builtin'),
('Protéine whey (poudre)', NULL, 380, 75.0, 10.0, 5.0, 5.0, 2.5, 0.0, 0.30, 'g', 30, 'oeufs_legumineuses', 'builtin'),

-- ═══════════════════════════════════════
-- MATIÈRES GRASSES
-- ═══════════════════════════════════════
('Huile d''olive', NULL, 884, 0.0, 0.0, 0.0, 100.0, 14.0, 0.0, 0.00, 'ml', 10, 'matieres_grasses', 'builtin'),
('Beurre', NULL, 745, 0.7, 0.6, 0.6, 82.0, 51.0, 0.0, 0.02, 'g', 10, 'matieres_grasses', 'builtin'),
('Amandes (entières)', NULL, 579, 21.2, 21.7, 4.4, 49.9, 3.8, 12.5, 0.01, 'g', 30, 'matieres_grasses', 'builtin'),
('Noix', NULL, 654, 15.2, 13.7, 2.6, 65.2, 6.1, 6.7, 0.00, 'g', 30, 'matieres_grasses', 'builtin'),
('Cacahuètes (sans sel)', NULL, 567, 25.8, 16.1, 4.0, 49.2, 6.8, 8.5, 0.01, 'g', 30, 'matieres_grasses', 'builtin'),
('Beurre de cacahuète', NULL, 598, 25.0, 20.0, 9.0, 51.0, 10.0, 6.0, 0.40, 'g', 30, 'matieres_grasses', 'builtin'),

-- ═══════════════════════════════════════
-- SNACKS & DIVERS
-- ═══════════════════════════════════════
('Chocolat noir 70%', NULL, 598, 7.8, 45.9, 24.2, 42.6, 24.5, 10.9, 0.01, 'g', 30, 'snacks', 'builtin'),
('Barre de céréales (type Müesli)', NULL, 415, 8.5, 62.0, 25.0, 15.0, 3.5, 5.5, 0.35, 'g', 40, 'snacks', 'builtin'),
('Chips (nature)', NULL, 536, 6.5, 52.0, 0.5, 34.0, 3.5, 4.8, 0.70, 'g', 30, 'snacks', 'builtin'),

-- ═══════════════════════════════════════
-- BOISSONS
-- ═══════════════════════════════════════
('Eau (plate ou gazeuse)', NULL, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 'ml', 250, 'boissons', 'builtin'),
('Jus d''orange (100% pur jus)', NULL, 44, 0.7, 10.4, 8.4, 0.2, 0.0, 0.3, 0.01, 'ml', 200, 'boissons', 'builtin'),
('Lait écrémé', NULL, 35, 3.4, 5.0, 5.0, 0.1, 0.1, 0.0, 0.11, 'ml', 250, 'boissons', 'builtin'),
('Boisson de soja nature', NULL, 33, 3.3, 1.8, 0.8, 1.8, 0.3, 0.3, 0.12, 'ml', 250, 'boissons', 'builtin'),
('Café (sans sucre)', NULL, 2, 0.1, 0.3, 0.0, 0.0, 0.0, 0.0, 0.00, 'ml', 200, 'boissons', 'builtin'),
('Thé / tisane (sans sucre)', NULL, 1, 0.0, 0.2, 0.0, 0.0, 0.0, 0.0, 0.00, 'ml', 250, 'boissons', 'builtin')

ON CONFLICT DO NOTHING;
